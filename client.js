/*
 * GhostTown — modes, networking and game loop.
 *
 *   local : both players on one keyboard (Boy = arrow keys, Ghost = W A D)
 *   host  : created an online room; this browser runs the real game
 *   guest : joined a room; sends inputs, predicts its own movement, and
 *           corrects itself from the host's snapshots
 * Online play uses WebRTC via PeerJS, so the site needs no server.
 */
(() => {
  'use strict';
  const G = window.Game, Art = window.Art, Sound = window.Sound;
  const { DT, ROLES } = G;
  const PEER_PREFIX = 'ghosttown-v1-';
  const SNAPSHOT_EVERY = 2;
  const MAX_QUEUE = 8;
  const INTERP_MS = 100;
  const NAMES = { boy: 'Boy', ghost: 'Ghost' };

  const $ = (id) => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');

  const S = {
    mode: null, role: null, code: null,
    peer: null, conn: null, connected: false,
    world: G.createWorld(0),
    guestQueue: [], guestLast: {}, guestAck: 0, tick: 0,
    seq: 0, pending: [], buf: [],
    ping: null,
  };
  const other = (r) => (r === 'boy' ? 'ghost' : 'boy');

  // ---------- input ----------
  const down = new Set();
  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'Space']);
  addEventListener('keydown', (e) => {
    Sound.unlock();
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (GAME_KEYS.has(e.code)) { down.add(e.code); if (S.mode) e.preventDefault(); }
    if (!S.mode || e.repeat) return;
    if (e.code === 'KeyR') requestRestart();
    if (e.code === 'KeyM') toggleMusic();
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('pointerdown', () => Sound.unlock());
  addEventListener('blur', () => down.clear());
  document.addEventListener('visibilitychange', () => down.clear());

  const ARROWS = { l: 'ArrowLeft', r: 'ArrowRight', j: 'ArrowUp' };
  const LETTERS = { l: 'KeyA', r: 'KeyD', j: 'KeyW' };
  function readKeys(map, extraJump) {
    return { l: down.has(map.l), r: down.has(map.r), j: down.has(map.j) || (extraJump && down.has('Space')) };
  }
  function inputFor(role) {
    if (S.mode === 'local') return role === 'boy' ? readKeys(ARROWS, false) : readKeys(LETTERS, true);
    const a = readKeys(ARROWS, true), b = readKeys(LETTERS, false);
    return { l: a.l || b.l, r: a.r || b.r, j: a.j || b.j };
  }

  // ---------- lobby ----------
  let chosen = 'boy';
  document.querySelectorAll('.char').forEach((b) => {
    b.onclick = () => {
      chosen = b.dataset.role;
      document.querySelectorAll('.char').forEach((x) => x.classList.toggle('selected', x === b));
    };
    const c = b.querySelector('canvas').getContext('2d');
    const role = b.dataset.role;
    (function anim(now) {
      if (S.mode) return;
      const t = now / 1000;
      c.clearRect(0, 0, 104, 96);
      c.save(); c.translate(52 - 9 * 1.8, role === 'boy' ? 22 : 26); c.scale(1.8, 1.8);
      Art.drawPlayer(c, { role, x: 0, y: 0, vx: 0, facing: 1, alive: true, grounded: true }, t, false);
      c.restore();
      requestAnimationFrame(anim);
    })(0);
  });

  const lobbyErr = (msg) => { $('lobby-err').textContent = msg || ''; };
  const busy = (on) => { $('create').disabled = $('join').disabled = $('local').disabled = on; };

  $('create').onclick = () => host(chosen);
  $('local').onclick = () => startLocal();
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
    lobbyErr('Could not load the networking library. Check your connection and reload, or play on one laptop.');
    return false;
  }

  // ---------- same laptop ----------
  function startLocal() {
    S.mode = 'local'; S.role = null; S.connected = true;
    S.world = G.createWorld(0);
    G.resetLevel(S.world);
    enterGame();
  }

  function localTick() {
    const w = S.world;
    for (const role of ROLES) {
      if (w.status === 'playing') G.stepPlayerFull(w, role, inputFor(role));
      if (w.players[role].jumpedNow) Sound.play('jump');
    }
    G.stepWorld(w);
  }

  // ---------- online host ----------
  function host(role, tries = 0) {
    if (!needPeerJS()) return;
    busy(true); lobbyErr('');
    const code = makeCode();
    const peer = new Peer(PEER_PREFIX + code);
    peer.on('open', () => {
      S.peer = peer; S.mode = 'host'; S.role = role; S.code = code;
      S.world = G.createWorld(0);
      S.world.status = 'paused';
      enterGame();
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && tries < 5) { peer.destroy(); return host(role, tries + 1); }
      if (!S.mode) { busy(false); lobbyErr('Could not create a room (' + err.type + '). Try again.'); }
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
        S.guestQueue = []; S.guestAck = 0; S.guestLast = {};
        conn.send({ t: 'joined', role: other(S.role), code: S.code, level: S.world.levelIndex });
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
    const w = S.world, me = S.role, them = other(S.role);
    if (w.status === 'playing') {
      G.stepPlayerFull(w, me, inputFor(me));
      if (w.players[me].jumpedNow) Sound.play('jump');
    }
    const q = S.guestQueue;
    let n = q.length > 3 ? 2 : 1, stepped = false;
    while (n-- > 0 && q.length) {
      const inp = q.shift();
      S.guestLast = inp; S.guestAck = inp.s; stepped = true;
      if (w.status === 'playing') G.stepPlayerFull(w, them, inp);
    }
    if (!stepped && w.status === 'playing' && S.connected) G.stepPlayerFull(w, them, S.guestLast);
    G.stepWorld(w);
    if (++S.tick % SNAPSHOT_EVERY === 0 && S.conn && S.conn.open) {
      S.conn.send(G.snapshot(w, { [them]: S.guestAck }));
    }
  }

  // ---------- online guest ----------
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
      if (S.mode) return console.warn('peer error', err);
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
          S.mode = 'guest'; S.role = m.role; S.code = m.code;
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
      conn.on('close', () => { if (S.mode) { S.connected = false; S.world.status = 'paused'; updateHud(); } });
    });
  }

  function onState(s) {
    const w = S.world;
    const levelChanged = s.lvl !== w.levelIndex;
    G.applySnapshot(w, s);
    if (levelChanged) staticLayer = Art.buildStatic(w, cv.width, cv.height);
    const me = w.players[S.role];
    S.pending = S.pending.filter((i) => i.s > s.p[S.role].ack);
    if (w.status === 'playing' && me.alive) for (const i of S.pending) G.stepPlayer(me, i, w, DT);
    const o = s.p[other(S.role)];
    S.buf.push({ t: performance.now(), x: o.x, y: o.y, pl: s.pl.slice() });
    if (S.buf.length > 30) S.buf.shift();
  }

  function guestTick() {
    const w = S.world;
    const inp = Object.assign({ s: ++S.seq }, inputFor(S.role));
    if (S.conn && S.conn.open) S.conn.send(Object.assign({ t: 'input' }, inp));
    S.pending.push(inp);
    if (S.pending.length > 120) S.pending.shift();
    const me = w.players[S.role];
    if (w.status === 'playing' && me.alive) {
      G.stepPlayer(me, inp, w, DT);
      if (me.jumpedNow) Sound.play('jump');
    }
  }

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
    if (S.mode === 'local' || S.mode === 'host') { if (S.connected) G.resetLevel(S.world); }
    else if (S.conn && S.conn.open) S.conn.send({ t: 'restart' });
  }

  function toggleMusic() {
    const on = Sound.toggleMusic();
    $('music').classList.toggle('off', !on);
  }
  $('music').onclick = () => { Sound.unlock(); toggleMusic(); };
  $('music').classList.toggle('off', !Sound.musicOn);

  // ---------- game screen ----------
  function enterGame() {
    Sound.unlock();
    $('lobby').hidden = true;
    $('game').hidden = false;
    const online = S.mode !== 'local';
    $('hud-room').hidden = !online;
    $('hud-partner').hidden = !online;
    $('hud-code').textContent = S.code || '';
    $('hud-role').textContent = online ? 'You are the ' + NAMES[S.role] : 'Same laptop';
    $('hud-role').className = 'tag ' + (S.role || 'ghost');
    $('keys').innerHTML = online
      ? 'Move <kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd> · Jump <kbd>↑</kbd> <kbd>W</kbd> <kbd>Space</kbd> · Restart <kbd>R</kbd> · Music <kbd>M</kbd>'
      : '<b>Boy</b> <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd> &nbsp;·&nbsp; <b>Ghost</b> <kbd>A</kbd><kbd>W</kbd><kbd>D</kbd> &nbsp;·&nbsp; Restart <kbd>R</kbd> · Music <kbd>M</kbd>';
    if (S.mode === 'host') {
      const link = location.origin + location.pathname + '?room=' + S.code;
      $('share').innerHTML = 'Send this to your partner: <code>' + link + '</code> <button id="copy">Copy</button>';
      $('copy').onclick = () => { navigator.clipboard.writeText(link); $('copy').textContent = 'Copied'; };
    }
    history.replaceState(null, '', location.pathname);
    updateHud();
    if (online) setInterval(() => { if (S.conn && S.conn.open) S.conn.send({ t: 'ping', c: performance.now() }); }, 2000);
    startLoop();
  }

  function updateHud() {
    $('hud-partner').textContent = S.connected ? '● Partner connected' : '○ Waiting for partner';
    $('hud-partner').className = 'partner ' + (S.connected ? 'on' : 'off');
    $('share').hidden = S.mode !== 'host' || S.connected;
  }

  let lastHud = '';
  function hudFrame() {
    const w = S.world;
    const secs = Math.floor(w.ticks / 60);
    const cand = w.gems.filter((g) => g.kind === 'boy'), pump = w.gems.filter((g) => g.kind === 'ghost');
    const nc = cand.filter((g) => g.taken).length, np = pump.filter((g) => g.taken).length;
    const str = [secs, nc, np, S.ping].join('|');
    if (str === lastHud) return;
    lastHud = str;
    $('hud-time').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    $('hud-candy').textContent = nc + '/' + cand.length;
    $('hud-pumpkin').textContent = np + '/' + pump.length;
    $('hud-ping').textContent = S.ping == null ? '' : S.ping + ' ms';
  }

  // sound effects from changes in the world (works the same for host, guest, local)
  let prev = null;
  function sfxFrame() {
    const w = S.world;
    const cur = { st: w.status, gm: w.gems.map((g) => g.taken), lv: w.levers.map((l) => l.on), bt: w.buttons.map((b) => b.pressed) };
    if (prev && prev.gm.length === cur.gm.length) {
      cur.gm.forEach((tk, i) => { if (tk && !prev.gm[i]) Sound.play(w.gems[i].kind === 'boy' ? 'candy' : 'pumpkin'); });
      if (cur.lv.some((v, i) => v !== prev.lv[i])) Sound.play('click');
      if (cur.bt.some((v, i) => v && !prev.bt[i])) Sound.play('click');
      if (cur.st !== prev.st && cur.st === 'dead') Sound.play('die');
      if (cur.st !== prev.st && cur.st === 'won') Sound.play('win');
    }
    prev = cur;
  }

  let staticLayer = null;
  function startLoop() {
    staticLayer = Art.buildStatic(S.world, cv.width, cv.height);
    let last = performance.now(), acc = 0;
    setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + (now - last) / 1000, 0.25);
      last = now;
      while (acc >= DT) {
        if (S.mode === 'local') localTick(); else if (S.mode === 'host') hostTick(); else guestTick();
        acc -= DT;
      }
    }, 1000 / 120);
    (function frame(now) { render(now / 1000); hudFrame(); sfxFrame(); requestAnimationFrame(frame); })(performance.now());
  }

  // ---------- overlays ----------
  function overlay(title, sub, color) {
    ctx.fillStyle = 'rgba(12,6,32,.68)'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.textAlign = 'center';
    ctx.font = '400 44px Pacifico, cursive';
    ctx.fillStyle = color || '#f3e9ff';
    ctx.shadowColor = color || '#a77bff'; ctx.shadowBlur = 18;
    ctx.fillText(title, cv.width / 2, cv.height / 2 - 6);
    ctx.shadowBlur = 0;
    if (sub) {
      ctx.fillStyle = '#d6cbef'; ctx.font = '600 18px Fredoka, Inter, sans-serif';
      sub.split('\n').forEach((line, i) => ctx.fillText(line, cv.width / 2, cv.height / 2 + 34 + i * 26));
    }
  }

  const DEATH = {
    lava: ['The ghost melted in the lava!', '#ffae5c'],
    void: ['The boy fell into the black hole!', '#b9a6ff'],
    goo: ["Splash! Into the witch's brew!", '#b6ff5c'],
  };

  function render(t) {
    const w = S.world;
    if (!staticLayer) return;
    const opts = { me: S.mode === 'local' ? null : S.role };
    if (S.mode === 'guest') {
      const ip = interpolated();
      if (ip) { opts.platforms = ip.pl; opts.override = { [other(S.role)]: { x: ip.x, y: ip.y } }; }
    }
    if (S.mode !== 'local' && !S.connected) opts.hide = { [other(S.role)]: true };
    Art.drawFrame(ctx, w, staticLayer, t, opts);

    if (S.mode !== 'local' && !S.connected) {
      overlay('Waiting for your partner…', S.mode === 'host' ? 'Room code  ' + S.code + '\nShare the link below' : 'The connection dropped. Reload to rejoin.');
    } else if (w.status === 'dead') {
      const [msg, col] = DEATH[w.deadCause] || ['Oops!', '#fff'];
      overlay(msg, 'Trying again…', col);
    } else if (w.status === 'won') {
      const secs = Math.floor(w.ticks / 60);
      const got = w.gems.filter((g) => g.taken).length;
      overlay('Level cleared!', `Time ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}   ·   Treats ${got}/${w.gems.length}\nPress R to play again`, '#ffd27a');
    }
  }
})();
