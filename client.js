/*
 * Fire & Water — online co-op over WebRTC (PeerJS), no server needed.
 *
 * The player who creates the room is the HOST: their browser runs the real game
 * (shared/game.js) and sends snapshots ~30x/sec. The GUEST sends inputs every
 * frame, predicts their own movement locally, and corrects when snapshots arrive.
 */
(() => {
  'use strict';
  const G = window.Game;
  const { TILE, DT, PW, PH, ROLES } = G;
  const PEER_PREFIX = 'fw-temple-v1-';
  const SNAPSHOT_EVERY = 2;
  const MAX_QUEUE = 8;
  const INTERP_MS = 100;

  const $ = (id) => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');

  // ---------- state ----------
  const S = {
    isHost: false, role: null, code: null,
    peer: null, conn: null, connected: false,
    world: G.createWorld(0),
    // host
    guestQueue: [], guestLast: { l: 0, r: 0, j: 0 }, guestAck: 0, tick: 0,
    // guest
    seq: 0, pending: [], buf: [],
    ping: null,
  };
  const other = () => (S.role === 'fire' ? 'water' : 'fire');

  // ---------- input ----------
  const keys = new Set();
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'j', KeyW: 'j', Space: 'j' };
  addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.code === 'KeyR' && S.role) requestRestart();
  });
  addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());
  const sample = () => ({ l: keys.has('l'), r: keys.has('r'), j: keys.has('j') });

  // ---------- lobby ----------
  let chosen = 'fire';
  document.querySelectorAll('.char').forEach((b) => {
    b.onclick = () => {
      chosen = b.dataset.role;
      document.querySelectorAll('.char').forEach((x) => x.classList.toggle('selected', x === b));
    };
    const c = b.querySelector('canvas').getContext('2d');
    (function anim(t) {
      c.clearRect(0, 0, 60, 70);
      c.save(); c.translate(30 - PW * 0.9, 8); c.scale(1.8, 1.8);
      drawPlayer(c, { role: b.dataset.role, x: 0, y: 0, vx: 0, facing: 1, alive: true, grounded: true }, t / 1000, false);
      c.restore();
      requestAnimationFrame(anim);
    })(0);
  });

  const lobbyErr = (msg) => { $('lobby-err').textContent = msg || ''; };
  const busy = (on) => { $('create').disabled = $('join').disabled = on; };

  $('create').onclick = () => host(chosen);
  $('join').onclick = () => join($('code').value);
  $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('code').value); });
  $('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  const params = new URLSearchParams(location.search);
  if (params.get('room')) { $('code').value = params.get('room').toUpperCase(); join(params.get('room')); }

  function makeCode() {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  }

  function needPeerJS() {
    if (window.Peer) return true;
    lobbyErr('Could not load the networking library (PeerJS). Check your connection and reload.');
    return false;
  }

  // ---------- host ----------
  function host(role, tries = 0) {
    if (!needPeerJS()) return;
    busy(true); lobbyErr('');
    const code = makeCode();
    const peer = new Peer(PEER_PREFIX + code);
    peer.on('open', () => {
      S.peer = peer; S.isHost = true; S.role = role; S.code = code;
      S.world = G.createWorld(0);
      S.world.status = 'paused';
      enterGame();
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && tries < 5) { peer.destroy(); return host(role, tries + 1); }
      if (!S.role) { busy(false); lobbyErr('Could not create a room (' + err.type + '). Try again.'); }
      else console.warn('peer error', err);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
    peer.on('connection', (conn) => {
      if (S.conn && S.conn.open) {
        conn.on('open', () => { conn.send({ t: 'error', msg: 'That room is full.' }); setTimeout(() => conn.close(), 300); });
        return;
      }
      conn.on('open', () => {
        S.conn = conn; S.connected = true;
        S.guestQueue = []; S.guestAck = 0; S.guestLast = { l: 0, r: 0, j: 0 };
        conn.send({ t: 'joined', role: other(), code: S.code, level: S.world.levelIndex });
        G.resetLevel(S.world);
        updateHud();
      });
      conn.on('data', onHostData);
      conn.on('close', () => { if (S.conn === conn) { S.conn = null; S.connected = false; S.world.status = 'paused'; updateHud(); } });
      conn.on('error', (e) => console.warn('conn error', e));
    });
  }

  function onHostData(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'input') {
      S.guestQueue.push({ s: m.s | 0, l: !!m.l, r: !!m.r, j: !!m.j });
      if (S.guestQueue.length > MAX_QUEUE) S.guestQueue.splice(0, S.guestQueue.length - MAX_QUEUE);
    } else if (m.t === 'restart') {
      if (S.connected) G.resetLevel(S.world);
    } else if (m.t === 'ping') {
      S.conn.send({ t: 'pong', c: m.c });
    } else if (m.t === 'pong') {
      S.ping = Math.round(performance.now() - m.c);
    }
  }

  function hostTick() {
    const w = S.world;
    const playing = () => w.status === 'playing';
    // host's own player: sampled straight from the keyboard
    if (playing()) G.stepPlayerFull(w, S.role, sample());
    // guest: one queued input per tick, catch up a little if they're ahead
    const q = S.guestQueue;
    let n = q.length > 3 ? 2 : 1, stepped = false;
    while (n-- > 0 && q.length) {
      const inp = q.shift();
      S.guestLast = inp; S.guestAck = inp.s; stepped = true;
      if (playing()) G.stepPlayerFull(w, other(), inp);
    }
    if (!stepped && playing() && S.connected) G.stepPlayerFull(w, other(), S.guestLast);
    G.stepWorld(w);
    if (++S.tick % SNAPSHOT_EVERY === 0 && S.conn && S.conn.open) {
      const acks = {}; acks[other()] = S.guestAck;
      S.conn.send(G.snapshot(w, acks));
    }
  }

  // ---------- guest ----------
  function join(raw) {
    const code = String(raw || '').toUpperCase().trim();
    if (code.length !== 4) return lobbyErr('Room codes are 4 characters.');
    if (!needPeerJS()) return;
    busy(true); lobbyErr('Connecting…');
    const peer = new Peer();
    let done = false;
    const fail = (msg) => { if (done) return; done = true; busy(false); lobbyErr(msg); peer.destroy(); };
    const timer = setTimeout(() => fail('Could not reach that room. Is the host still on the page?'), 12000);
    peer.on('error', (err) => {
      if (S.role) return console.warn('peer error', err);
      clearTimeout(timer);
      fail(err.type === 'peer-unavailable' ? 'No room with that code.' : 'Connection failed (' + err.type + ').');
    });
    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      conn.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'joined') {
          clearTimeout(timer); done = true;
          S.peer = peer; S.conn = conn; S.connected = true;
          S.isHost = false; S.role = m.role; S.code = m.code;
          S.world = G.createWorld(m.level || 0);
          enterGame();
        } else if (m.t === 'error') {
          clearTimeout(timer); fail(m.msg);
        } else if (m.t === 'state') {
          onState(m);
        } else if (m.t === 'ping') {
          conn.send({ t: 'pong', c: m.c });
        } else if (m.t === 'pong') {
          S.ping = Math.round(performance.now() - m.c);
        }
      });
      conn.on('close', () => { if (S.role) { S.connected = false; S.world.status = 'paused'; updateHud(); } });
    });
  }

  function onState(s) {
    const w = S.world;
    G.applySnapshot(w, s);
    const me = w.players[S.role];
    const ack = s.p[S.role].ack;
    S.pending = S.pending.filter((i) => i.s > ack);
    if (w.status === 'playing' && me.alive) for (const i of S.pending) G.stepPlayer(me, i, w, DT);
    const o = s.p[other()];
    S.buf.push({ t: performance.now(), x: o.x, y: o.y, pl: s.pl.slice() });
    if (S.buf.length > 30) S.buf.shift();
  }

  function guestTick() {
    const w = S.world;
    const inp = { s: ++S.seq, ...sample() };
    if (S.conn && S.conn.open) S.conn.send({ t: 'input', ...inp });
    S.pending.push(inp);
    if (S.pending.length > 120) S.pending.shift();
    const me = w.players[S.role];
    if (w.status === 'playing' && me.alive) G.stepPlayer(me, inp, w, DT);
  }

  // Remote player + moving parts drawn ~100ms in the past, smoothly interpolated.
  function interpolated() {
    const b = S.buf;
    if (b.length < 2) return null;
    const t = performance.now() - INTERP_MS;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const a = b[Math.max(0, i - 1)], c = b[i];
    const k = c.t === a.t ? 1 : Math.max(0, Math.min(1, (t - a.t) / (c.t - a.t)));
    return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k, pl: a.pl.map((v, j) => v + (c.pl[j] - v) * k) };
  }

  function requestRestart() {
    if (S.isHost) { if (S.connected) G.resetLevel(S.world); }
    else if (S.conn && S.conn.open) S.conn.send({ t: 'restart' });
  }

  // ---------- game screen ----------
  function enterGame() {
    $('lobby').hidden = true;
    $('game').hidden = false;
    $('hud-code').textContent = S.code;
    $('hud-role').textContent = S.role === 'fire' ? 'You are Fire' : 'You are Water';
    $('hud-role').className = 'tag ' + S.role;
    const link = location.origin + location.pathname + '?room=' + S.code;
    if (S.isHost) {
      $('share').hidden = false;
      $('share').innerHTML = 'Send this to your partner: <code>' + link + '</code> <button id="copy">Copy</button>';
      $('copy').onclick = () => { navigator.clipboard.writeText(link); $('copy').textContent = 'Copied'; };
    }
    history.replaceState(null, '', location.pathname);
    updateHud();
    setInterval(() => { if (S.conn && S.conn.open) S.conn.send({ t: 'ping', c: performance.now() }); }, 2000);
    startLoop();
  }

  function updateHud() {
    $('hud-partner').textContent = S.connected ? '● Partner connected' : '○ Waiting for partner';
    $('hud-partner').className = 'partner ' + (S.connected ? 'on' : 'off');
    if (S.isHost) $('share').hidden = S.connected;
  }

  let lastHud = '';
  function hudFrame() {
    const w = S.world;
    const secs = Math.floor(w.ticks / 60);
    const red = w.gems.filter((g) => g.kind === 'fire');
    const blue = w.gems.filter((g) => g.kind === 'water');
    const str = [secs, red.filter((g) => g.taken).length, blue.filter((g) => g.taken).length, S.ping].join('|');
    if (str === lastHud) return;
    lastHud = str;
    $('hud-time').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    $('hud-red').textContent = red.filter((g) => g.taken).length + '/' + red.length;
    $('hud-blue').textContent = blue.filter((g) => g.taken).length + '/' + blue.length;
    $('hud-ping').textContent = S.ping == null ? '' : S.ping + ' ms';
  }

  // fixed 60Hz simulation, independent of display refresh rate
  function startLoop() {
    let last = performance.now(), acc = 0;
    setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + (now - last) / 1000, 0.25);
      last = now;
      while (acc >= DT) { S.isHost ? hostTick() : guestTick(); acc -= DT; }
    }, 1000 / 120);
    buildStatic();
    (function frame(t) { render(t / 1000); hudFrame(); requestAnimationFrame(frame); })(performance.now());
  }

  // ---------- rendering ----------
  let staticLayer = null;
  function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function buildStatic() {
    const w = S.world;
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    const R = rng(7);
    // back wall bricks
    g.fillStyle = '#1d1a12'; g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < c.height; y += 12) {
      const off = (y / 12) % 2 ? 12 : 0;
      for (let x = -off; x < c.width; x += 24) {
        const v = 26 + Math.floor(R() * 8);
        g.fillStyle = `rgb(${v + 6},${v + 3},${v - 6})`;
        g.fillRect(x + 1, y + 1, 22, 10);
      }
    }
    const solid = (cc, r) => r < 0 || r >= w.rows || cc < 0 || cc >= w.cols || w.grid[r][cc] === '#';
    for (let r = 0; r < w.rows; r++) {
      for (let cc = 0; cc < w.cols; cc++) {
        const ch = w.grid[r][cc];
        const x = cc * TILE, y = r * TILE;
        if (ch === '#') {
          g.fillStyle = '#5a5340'; g.fillRect(x, y, TILE, TILE);
          for (let i = 0; i < 5; i++) { g.fillStyle = R() < 0.5 ? '#635b46' : '#4e4837'; g.fillRect(x + R() * 22, y + R() * 22, 2 + R() * 3, 2); }
          if (!solid(cc, r - 1)) {
            g.fillStyle = '#8a8060'; g.fillRect(x, y, TILE, 3);
            if (R() < 0.35) { g.fillStyle = '#4f7a2b'; g.fillRect(x + R() * 16, y - 1, 4 + R() * 6, 3); }
          }
          if (!solid(cc, r + 1)) { g.fillStyle = '#353022'; g.fillRect(x, y + TILE - 3, TILE, 3); }
          if (!solid(cc - 1, r)) { g.fillStyle = '#6e6650'; g.fillRect(x, y, 2, TILE); }
          if (!solid(cc + 1, r)) { g.fillStyle = '#3f3a2c'; g.fillRect(x + TILE - 2, y, 2, TILE); }
        } else if (G.POOLS[ch]) {
          g.fillStyle = '#5a5340'; g.fillRect(x, y + 12, TILE, 12);
          g.fillStyle = '#353022'; g.fillRect(x, y + 12, TILE, 2);
        }
      }
    }
    staticLayer = c;
  }

  const POOL_COLORS = { lava: ['#ffcf3a', '#ff4d12'], water: ['#9fe3ff', '#1f7bff'], goo: ['#c3ff5a', '#3f9d1a'] };

  function drawPools(t) {
    const w = S.world;
    for (let r = 0; r < w.rows; r++) {
      for (let c = 0; c < w.cols; c++) {
        const kind = G.POOLS[w.grid[r][c]];
        if (!kind) continue;
        const x = c * TILE, y = r * TILE;
        const [top, bot] = POOL_COLORS[kind];
        const grad = ctx.createLinearGradient(0, y + 2, 0, y + 13);
        grad.addColorStop(0, top); grad.addColorStop(1, bot);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, y + 13);
        for (let i = 0; i <= TILE; i += 4) ctx.lineTo(x + i, y + 5 + Math.sin(t * 3 + (x + i) * 0.25) * 1.5);
        ctx.lineTo(x + TILE, y + 13);
        ctx.closePath(); ctx.fill();
        if (kind === 'lava' && Math.sin(t * 2 + c) > 0.97) {
          ctx.fillStyle = 'rgba(255,220,120,.8)';
          ctx.beginPath(); ctx.arc(x + 12, y + 2, 2, 0, 7); ctx.fill();
        }
      }
    }
  }

  function drawDoor(d, role, t) {
    const fire = role === 'fire';
    ctx.fillStyle = '#2e2a1f'; ctx.fillRect(d.x - 3, d.y - 3, d.w + 6, d.h + 3);
    ctx.fillStyle = '#7d7356'; ctx.fillRect(d.x - 3, d.y - 3, d.w + 6, 3);
    // inside glow (visible when the panel slides up)
    ctx.fillStyle = fire ? '#3a0d06' : '#061a3a'; ctx.fillRect(d.x, d.y, d.w, d.h);
    const lift = d.open ? d.h - 8 : 0;
    ctx.fillStyle = fire ? '#a8321b' : '#1d5fb8';
    ctx.fillRect(d.x + 2, d.y, d.w - 4, d.h - lift);
    if (!d.open) {
      // symbol
      const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
      ctx.fillStyle = fire ? '#ffb347' : '#8fd8ff';
      ctx.beginPath();
      if (fire) {
        ctx.moveTo(cx, cy - 11); ctx.quadraticCurveTo(cx + 9, cy - 2, cx + 6, cy + 6);
        ctx.quadraticCurveTo(cx, cy + 11, cx - 6, cy + 6); ctx.quadraticCurveTo(cx - 9, cy - 2, cx, cy - 11);
      } else {
        ctx.moveTo(cx, cy - 11); ctx.quadraticCurveTo(cx + 8, cy, cx + 6, cy + 5);
        ctx.arc(cx, cy + 4, 6, 0.2, Math.PI - 0.2); ctx.quadraticCurveTo(cx - 8, cy, cx, cy - 11);
      }
      ctx.fill();
    } else {
      ctx.fillStyle = fire ? 'rgba(255,140,60,.35)' : 'rgba(90,180,255,.35)';
      ctx.fillRect(d.x, d.y + 8, d.w, d.h - 8);
    }
  }

  function drawGem(g, t, i) {
    if (g.taken) return;
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2 + Math.sin(t * 3 + i) * 2;
    const fire = g.kind === 'fire';
    ctx.fillStyle = fire ? 'rgba(255,60,60,.18)' : 'rgba(60,170,255,.18)';
    ctx.beginPath(); ctx.arc(cx, cy, 11, 0, 7); ctx.fill();
    ctx.fillStyle = fire ? '#ff3b3b' : '#33a8ff';
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 7, cy - 1); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx - 7, cy - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fire ? '#ff9a9a' : '#a9e1ff';
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 7, cy - 1); ctx.lineTo(cx, cy - 1); ctx.closePath(); ctx.fill();
  }

  function drawButton(b) {
    ctx.fillStyle = '#3d3829'; ctx.fillRect(b.x - 2, b.y + 4, b.w + 4, 2);
    ctx.fillStyle = '#b07bff';
    const h = b.pressed ? 2 : 6;
    ctx.fillRect(b.x + 2, b.y + 6 - h, b.w - 4, h - 1);
  }

  function drawLever(l) {
    const bx = l.x + l.w / 2, by = l.y + l.h;
    const ang = (l.on ? 1 : -1) * 0.6;
    ctx.strokeStyle = '#c9b98a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx + Math.sin(ang) * 18, by - 4 - Math.cos(ang) * 18); ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(bx + Math.sin(ang) * 18, by - 4 - Math.cos(ang) * 18, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a6f50';
    ctx.beginPath(); ctx.arc(bx, by, 8, Math.PI, 0); ctx.fill();
  }

  function drawPlatform(pl, override) {
    const v = override != null ? override : pl.kind === 'retract' ? pl.h : pl.y;
    if (pl.kind === 'retract') {
      if (v < 0.5) return;
      ctx.fillStyle = '#c99a22'; ctx.fillRect(pl.x, pl.y, pl.w, v);
      ctx.fillStyle = '#8a6612';
      for (let y = pl.y + 4; y < pl.y + v - 2; y += 10) ctx.fillRect(pl.x, y, pl.w, 3);
      ctx.fillStyle = '#f0c75a'; ctx.fillRect(pl.x, pl.y, 2, v);
    } else {
      ctx.fillStyle = '#8a6ad6'; ctx.fillRect(pl.x, v, pl.w, pl.h);
      ctx.fillStyle = '#b9a2ff'; ctx.fillRect(pl.x, v, pl.w, 3);
      ctx.fillStyle = '#5b3fae';
      for (let x = pl.x + 6; x < pl.x + pl.w - 6; x += 14) {
        ctx.beginPath(); ctx.moveTo(x, v + 10); ctx.lineTo(x + 4, v + 5); ctx.lineTo(x + 8, v + 10); ctx.fill();
      }
    }
  }

  // Original character art: a flame-headed and a droplet-headed explorer.
  function drawPlayer(c, p, t, isMe) {
    const fire = p.role === 'fire';
    const x = p.x, y = p.y, cx = x + PW / 2;
    if (!p.alive) {
      c.fillStyle = 'rgba(150,150,150,.55)';
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(cx + Math.sin(t * 2 + i * 2) * 6, y + PH - 6 - i * 7 - (t * 20) % 7, 5 + i, 0, 7); c.fill(); }
      return;
    }
    const moving = Math.abs(p.vx) > 1 && p.grounded;
    const step = moving ? Math.sin(t * 18) * 2.5 : 0;
    const f = p.facing || 1;
    // legs
    c.fillStyle = fire ? '#5a1408' : '#0e2f66';
    c.fillRect(cx - 5 + step, y + 29, 4, 5);
    c.fillRect(cx + 1 - step, y + 29, 4, 5);
    // body
    c.fillStyle = fire ? '#c2381a' : '#2468c9';
    roundRect(c, cx - 7, y + 19, 14, 12, 4); c.fill();
    c.fillStyle = fire ? '#e8642b' : '#4a92ec';
    c.fillRect(cx - 5, y + 21, 10, 2);
    // head
    const hx = cx, hy = y + 11;
    if (fire) {
      const flick = Math.sin(t * 14) * 1.5;
      c.fillStyle = '#ff7a1a';
      c.beginPath();
      c.moveTo(hx - 9, hy + 2);
      c.quadraticCurveTo(hx - 12, hy - 8, hx - 6 - f * 2, hy - 15 + flick);
      c.quadraticCurveTo(hx - 3, hy - 9, hx - f * 1, hy - 18 - flick);
      c.quadraticCurveTo(hx + 3, hy - 9, hx + 6 - f * 2, hy - 14 + flick);
      c.quadraticCurveTo(hx + 12, hy - 7, hx + 9, hy + 2);
      c.closePath(); c.fill();
      const g = c.createRadialGradient(hx, hy + 2, 2, hx, hy, 11);
      g.addColorStop(0, '#fff3a0'); g.addColorStop(1, '#ffb020');
      c.fillStyle = g;
      c.beginPath(); c.arc(hx, hy, 9.5, 0, 7); c.fill();
    } else {
      c.fillStyle = '#3aa0ff';
      c.beginPath();
      c.moveTo(hx - f * 4, hy - 19);
      c.quadraticCurveTo(hx - f * 1, hy - 10, hx + f * 9, hy - 4);
      c.lineTo(hx - f * 9, hy - 4);
      c.quadraticCurveTo(hx - f * 7, hy - 12, hx - f * 4, hy - 19);
      c.fill();
      const g = c.createRadialGradient(hx - 3, hy - 3, 2, hx, hy, 11);
      g.addColorStop(0, '#c8f0ff'); g.addColorStop(1, '#3aa0ff');
      c.fillStyle = g;
      c.beginPath(); c.arc(hx, hy, 9.5, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.7)';
      c.beginPath(); c.arc(hx - 4, hy - 5, 2, 0, 7); c.fill();
    }
    // eyes
    const blink = Math.sin(t * 1.3 + (fire ? 0 : 2)) > 0.985;
    for (const ex of [-3.5, 3.5]) {
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(hx + ex + f * 1.5, hy + 1, 2.6, blink ? 0.6 : 3.4, 0, 0, 7); c.fill();
      if (!blink) { c.fillStyle = '#111'; c.beginPath(); c.arc(hx + ex + f * 2.5, hy + 1.5, 1.5, 0, 7); c.fill(); }
    }
    if (isMe) {
      c.fillStyle = fire ? '#ffb347' : '#8fd8ff';
      const by = y - 22 + Math.sin(t * 4) * 1.5;
      c.beginPath(); c.moveTo(cx - 4, by); c.lineTo(cx + 4, by); c.lineTo(cx, by + 5); c.fill();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function overlay(title, sub, color) {
    ctx.fillStyle = 'rgba(10,8,4,.66)'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = color || '#f3e3b0';
    ctx.font = '800 42px Cinzel, serif';
    ctx.fillText(title, cv.width / 2, cv.height / 2 - 10);
    if (sub) {
      ctx.fillStyle = '#d8ccaa'; ctx.font = '600 17px Inter, sans-serif';
      sub.split('\n').forEach((line, i) => ctx.fillText(line, cv.width / 2, cv.height / 2 + 26 + i * 24));
    }
  }

  function render(t) {
    const w = S.world;
    if (!staticLayer) return;
    const interp = !S.isHost ? interpolated() : null;

    ctx.drawImage(staticLayer, 0, 0);
    // platforms first so the gate tucks behind the ceiling
    w.platforms.forEach((pl, i) => drawPlatform(pl, interp ? interp.pl[i] : null));
    redrawCeilingOverGates(w);
    drawPools(t);
    for (const role of ROLES) drawDoor(w.doors[role], role, t);
    w.buttons.forEach(drawButton);
    w.levers.forEach(drawLever);
    w.gems.forEach((g, i) => drawGem(g, t, i));

    for (const role of ROLES) {
      let p = w.players[role];
      if (role !== S.role && interp) p = Object.assign({}, p, { x: interp.x, y: interp.y });
      if (role !== S.role && !S.connected) continue;
      drawPlayer(ctx, p, t, role === S.role);
    }

    if (!S.connected) overlay('Waiting for partner', 'Room code  ' + S.code + '\nShare the link below so they can join');
    else if (w.status === 'dead') {
      const who = w.deadRole === 'fire' ? 'Fire was put out!' : 'Water boiled away!';
      overlay(who, 'Restarting the level…', w.deadRole === 'fire' ? '#ff9a6a' : '#8fd8ff');
    } else if (w.status === 'won') {
      const secs = Math.floor(w.ticks / 60);
      const got = w.gems.filter((g) => g.taken).length;
      overlay('Temple cleared!', `Time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}   ·   Gems ${got}/${w.gems.length}\nPress R to play again`);
    }
  }

  // Gates retract upward into the stone; repaint the wall tile right above each gate.
  function redrawCeilingOverGates(w) {
    for (const pl of w.platforms) {
      if (pl.kind !== 'retract') continue;
      const c = Math.floor(pl.x / TILE), r = Math.floor(pl.y / TILE) - 1;
      ctx.drawImage(staticLayer, c * TILE, r * TILE, TILE, TILE, c * TILE, r * TILE, TILE, TILE);
    }
  }
})();
