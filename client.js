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
  const NAMES = { boy: 'Andy', ghost: 'his Ghost' };

  const $ = (id) => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  // draw at the screen's real pixel density so the painted sprites stay sharp
  const LW = 816, LH = 600;
  const RES = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));
  cv.width = LW * RES; cv.height = LH * RES;

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
    if (e.code === 'KeyH') setHelp(!helpOpen);
    else if (e.code === 'Escape' && helpOpen) setHelp(false);
    else if (e.code === 'Escape' || e.code === 'KeyP') setPause(!S.world.held);
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
      c.clearRect(0, 0, 240, 208);
      c.save(); c.scale(2, 2); c.translate(60 - 9 * (role === 'boy' ? 1.85 : 1.7), role === 'boy' ? 22 : 26); c.scale(role === 'boy' ? 1.85 : 1.7, role === 'boy' ? 1.85 : 1.7);
      Art.drawPlayer(c, { role, x: 0, y: 0, vx: 0, facing: 1, alive: true, grounded: true }, t, false);
      c.restore();
      requestAnimationFrame(anim);
    })(0);
  });

  // animated painted backdrop behind the title screen
  const bg = $('bg');
  bg.width = 816 * 2; bg.height = 600 * 2;
  (function bgFrame(now) {
    if (S.mode) return;
    Art.drawBackdrop(bg, now / 1000);
    requestAnimationFrame(bgFrame);
  })(0);

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
    } else if (m.t === 'pause') {
      if (S.world.status === 'playing' || !m.on) S.world.held = !!m.on;
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
    if (levelChanged) staticLayer = Art.buildStatic(w, LW, LH, RES);
    const me = w.players[S.role];
    S.pending = S.pending.filter((i) => i.s > s.p[S.role].ack);
    if (w.status === 'playing' && !w.held && me.alive) for (const i of S.pending) G.stepPlayer(me, i, w, DT);
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
    if (w.status === 'playing' && !w.held && me.alive) {
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

  // pause menu (Esc / P / the ❚❚ button); online it pauses for both players
  function setPause(on) {
    if (!S.mode) return;
    if (on && S.world.status !== 'playing') return;
    if (S.mode === 'guest') { if (S.conn && S.conn.open) S.conn.send({ t: 'pause', on }); }
    else S.world.held = on;
  }
  $('pause').onclick = () => setPause(!S.world.held);
  let helpOpen = false;
  function setHelp(on) {
    helpOpen = on;
    $('help').hidden = !on;
    if (on) setPause(true); else setPause(false);
  }
  $('help-btn').onclick = () => setHelp(!helpOpen);
  $('help-close').onclick = () => setHelp(false);
  $('resume').onclick = () => setPause(false);
  $('restart').onclick = () => { requestRestart(); };
  $('quit').onclick = () => { location.href = location.pathname; };
  let menuShown = false;
  function pauseFrame() {
    const show = !!S.world.held;
    if (show === menuShown) return;
    menuShown = show;
    $('pause-menu').hidden = !show || helpOpen;
    $('pause-note').textContent = S.mode === 'local' ? '' : 'Paused for both players';
    down.clear();
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
    $('hud-ping').hidden = !online;
    $('hud-code').textContent = S.code || '';
    $('hud-role').hidden = !online;
    $('hud-role').textContent = online ? 'You are ' + NAMES[S.role] : '';
    $('hud-role').className = 'tag ' + (S.role || 'ghost');
    $('keys').innerHTML = online
      ? '<span class="k-title">Move</span><kbd>←</kbd><kbd>→</kbd> or <kbd>A</kbd><kbd>D</kbd><br><span class="k-title">Jump</span><kbd>↑</kbd> <kbd>W</kbd> <kbd>Space</kbd><br><span class="k-title">Keys</span>Restart <kbd>R</kbd> · Pause <kbd>Esc</kbd>'
      : '<span class="k-title">Andy</span><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><br><span class="k-title">His Ghost</span><kbd>A</kbd><kbd>W</kbd><kbd>D</kbd><br><span class="k-title">Keys</span>Restart <kbd>R</kbd> · Pause <kbd>Esc</kbd>';
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
    $('hud-level').textContent = 'Level ' + (w.levelIndex + 1);
    $('hud-time').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    $('hud-candy').textContent = nc + '/' + cand.length;
    $('hud-pumpkin').textContent = np + '/' + pump.length;
    $('hud-ping').textContent = S.ping == null ? '' : S.ping + ' ms';
  }

  // sound effects from changes in the world (works the same for host, guest, local)
  let prev = null;
  function sfxFrame() {
    const w = S.world;
    const cur = { st: w.status, gm: w.gems.map((g) => g.taken), lv: w.levers.map((l) => l.on), bt: w.buttons.map((b) => b.pressed), doors: { boy: w.doors.boy.open, ghost: w.doors.ghost.open } };
    if (prev && prev.gm.length === cur.gm.length) {
      cur.gm.forEach((tk, i) => {
        if (!tk || prev.gm[i]) return;
        const g = w.gems[i];
        Sound.play(g.kind === 'boy' ? 'candy' : 'pumpkin');
        burst(g.x + g.w / 2, g.y + g.h / 2, g.kind === 'boy' ? ['#ffb347', '#ff7ad2', '#fff2c0'] : ['#ff9a2e', '#8fd8ff', '#ffffff'], 16);
      });
      ROLES.forEach((role) => {
        const d = w.doors[role];
        if (d.open && prev.doors && !prev.doors[role]) burst(d.x + d.w / 2, d.y + 18, role === 'boy' ? ['#ffd27a', '#ffb347'] : ['#a9e1ff', '#ffffff'], 12);
      });
      if (cur.lv.some((v, i) => v !== prev.lv[i])) Sound.play('click');
      if (cur.bt.some((v, i) => v && !prev.bt[i])) Sound.play('click');
      if (cur.st !== prev.st && cur.st === 'dead') Sound.play('die');
      if (cur.st !== prev.st && cur.st === 'won') Sound.play('win');
    }
    prev = cur;
  }

  // little sparkle bursts (pickups, doors) — purely visual, per screen
  const parts = [];
  function burst(x, y, colors, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, sp = 40 + Math.random() * 70;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.6 + Math.random() * 0.3, max: 0.9, c: colors[i % colors.length], s: 1.5 + Math.random() * 1.8 });
    }
  }
  let lastFrame = 0;
  function drawParts(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0); lastFrame = now;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = Math.min(1, p.life / 0.4);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - p.s * 1.6); ctx.lineTo(p.x + p.s * 0.5, p.y); ctx.lineTo(p.x, p.y + p.s * 1.6); ctx.lineTo(p.x - p.s * 0.5, p.y); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function titleCard(w) {
    if (w.status !== 'playing' || w.ticks > 170) return;
    const k = w.ticks, a = k < 25 ? k / 25 : k > 120 ? Math.max(0, (170 - k) / 50) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center';
    const cx = LW / 2, cy = 150;
    ctx.fillStyle = 'rgba(30,20,62,.82)'; ctx.strokeStyle = '#6e5ab6'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(cx - 170, cy - 48, 340, 86, 20); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5c56b'; ctx.font = '700 16px Tinos, "Times New Roman", serif';
    ctx.fillText('✦  Level ' + (w.levelIndex + 1) + '  ✦', cx, cy - 20);
    ctx.font = '400 34px "Bubblegum Sans", Fredoka, cursive'; ctx.fillStyle = '#fff7ea';
    ctx.shadowColor = '#a77bff'; ctx.shadowBlur = 16;
    ctx.fillText(w.name, cx, cy + 20);
    ctx.restore();
  }

  let staticLayer = null;
  function startLoop() {
    staticLayer = Art.buildStatic(S.world, LW, LH, RES);
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
    (function frame(now) { render(now / 1000); hudFrame(); sfxFrame(); pauseFrame(); requestAnimationFrame(frame); })(performance.now());
  }

  // ---------- overlays ----------
  function overlay(title, sub, color) {
    ctx.fillStyle = 'rgba(12,6,32,.68)'; ctx.fillRect(0, 0, LW, LH);
    ctx.textAlign = 'center';
    ctx.font = '400 50px "Bubblegum Sans", Fredoka, cursive';
    ctx.fillStyle = color || '#f3e9ff';
    ctx.shadowColor = color || '#a77bff'; ctx.shadowBlur = 18;
    ctx.fillText(title, LW / 2, LH / 2 - 6);
    ctx.shadowBlur = 0;
    if (sub) {
      ctx.fillStyle = '#d6cbef'; ctx.font = '400 21px Tinos, "Times New Roman", serif';
      sub.split('\n').forEach((line, i) => ctx.fillText(line, LW / 2, LH / 2 + 34 + i * 26));
    }
  }

  const DEATH = {
    lava: ['His Ghost melted in the lava!', '#ffae5c'],
    void: ['Andy fell into the black hole!', '#b9a6ff'],
    goo: ["Splash! Into the witch's brew!", '#b6ff5c'],
  };

  function render(t) {
    const w = S.world;
    if (!staticLayer) return;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    const opts = { me: S.mode === 'local' ? null : S.role };
    if (S.mode === 'guest') {
      const ip = interpolated();
      if (ip) { opts.platforms = ip.pl; opts.override = { [other(S.role)]: { x: ip.x, y: ip.y } }; }
    }
    if (S.mode !== 'local' && !S.connected) opts.hide = { [other(S.role)]: true };
    Art.drawFrame(ctx, w, staticLayer, t, opts);
    drawParts(t * 1000);
    if (S.mode === 'local' || S.connected) titleCard(w);

    if (S.mode !== 'local' && !S.connected) {
      overlay('Waiting for your partner…', S.mode === 'host' ? 'Room code  ' + S.code + '\nShare the link below' : 'The connection dropped. Reload to rejoin.');
    } else if (w.status === 'dead') {
      const [msg, col] = DEATH[w.deadCause] || ['Oops!', '#fff'];
      overlay(msg, 'Trying again…', col);
    } else if (w.status === 'won') {
      const got = w.gems.filter((g) => g.taken).length;
      overlay('Level cleared!', `Treats ${got}/${w.gems.length}\nPress R to play again`, '#ffd27a');
    }
  }
})();
