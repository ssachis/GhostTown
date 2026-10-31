/*
 * Shared game rules — loaded by the Node server (authoritative simulation)
 * and by the browser (client-side prediction + rendering).
 *
 * Map legend
 *   #  stone wall            .  empty
 *   L  lava pool (kills Water)   W  water pool (kills Fire)   G  goo (kills both)
 *   r  red gem (Fire only)   b  blue gem (Water only)
 *   f  Fire spawn            a  Water spawn
 *   D  Fire exit door        E  Water exit door
 *   o  pressure button       l  lever
 * Moving parts (gates, lifts) are listed in each level's `platforms`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Game = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TILE = 24;
  const DT = 1 / 60;
  const PHYS = { GRAVITY: 1500, MOVE: 190, JUMP: 520, MAX_FALL: 720, STEP_UP: 13 };
  const PW = 18;
  const PH = 34;
  const POOLS = { L: 'lava', W: 'water', G: 'goo' };
  const ROLES = ['fire', 'water'];

  const LEVELS = [
    {
      name: 'Temple of Embers',
      map: [
        '##################################',
        '#................................#',
        '#................................#',
        '#................................#',
        '#.............r..b...............#',
        '#............######..............#',
        '#................................#',
        '#..D..E..........................#',
        '############################.....#',
        '#................................#',
        '#................................#',
        '#........r...........b...........#',
        '#.........................l......#',
        '#....#########GGG#################',
        '#................................#',
        '#................................#',
        '###................b....r........#',
        '###...o.......o..................#',
        '##################WWW##LLL###....#',
        '#................................#',
        '#................................#',
        '#.........r.....b.............####',
        '#.f.a.........................####',
        '#########LLL###WWW################',
        '##################################',
      ],
      platforms: [
        // Gate on the second floor: retracts into the ceiling while ANY button is pressed.
        { id: 'gate', kind: 'retract', trigger: 'button', x: 10 * TILE + 6, y: 14 * TILE, w: 12, closedH: 96, openH: 0, speed: 320 },
        // Lift on the right: rises to the top floor while the lever points right.
        { id: 'lift', kind: 'move', trigger: 'lever', x: 28 * TILE, w: 96, h: 12, downY: 13 * TILE - 12, upY: 8 * TILE, speed: 70 },
      ],
    },
  ];

  // ---------- geometry ----------
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function pRect(p) { return { x: p.x, y: p.y, w: PW, h: PH }; }

  function tileAt(world, c, r) {
    if (r < 0 || r >= world.rows || c < 0 || c >= world.cols) return '#';
    return world.grid[r][c];
  }

  function platRect(pl) {
    return pl.kind === 'retract'
      ? { x: pl.x, y: pl.y, w: pl.w, h: pl.h }
      : { x: pl.x, y: pl.y, w: pl.w, h: pl.h };
  }

  // Every solid rectangle overlapping r (walls, the stone half of pools, platforms).
  function solidsOverlapping(world, r) {
    const out = [];
    const c0 = Math.floor(r.x / TILE), c1 = Math.floor((r.x + r.w - 1e-6) / TILE);
    const r0 = Math.floor(r.y / TILE), r1 = Math.floor((r.y + r.h - 1e-6) / TILE);
    for (let row = r0; row <= r1; row++) {
      for (let c = c0; c <= c1; c++) {
        const ch = tileAt(world, c, row);
        let t = null;
        if (ch === '#') t = { x: c * TILE, y: row * TILE, w: TILE, h: TILE };
        else if (POOLS[ch]) t = { x: c * TILE, y: row * TILE + 12, w: TILE, h: 12 };
        if (t && overlap(r, t)) out.push(t);
      }
    }
    for (const pl of world.platforms) {
      const pr = platRect(pl);
      if (pr.h > 0.5 && overlap(r, pr)) { pr.pid = pl.id; out.push(pr); }
    }
    return out;
  }

  // ---------- level setup ----------
  function createWorld(levelIndex) {
    const L = LEVELS[levelIndex];
    const grid = L.map.map((row) => row.split(''));
    const w = {
      levelIndex, name: L.name, cols: grid[0].length, rows: grid.length,
      grid, gems: [], buttons: [], levers: [], doors: {}, spawns: {},
      platforms: [], players: {}, status: 'lobby', ticks: 0, deadTimer: 0, deadRole: null,
    };
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === 'r' || ch === 'b') w.gems.push({ x: x + 4, y: y + 4, w: 16, h: 16, kind: ch === 'r' ? 'fire' : 'water', taken: false });
        else if (ch === 'f') w.spawns.fire = { x: x + 3, y: y + TILE - PH };
        else if (ch === 'a') w.spawns.water = { x: x + 3, y: y + TILE - PH };
        else if (ch === 'D') w.doors.fire = { x: x - 6, y: y + TILE - 46, w: 36, h: 46, open: false };
        else if (ch === 'E') w.doors.water = { x: x - 6, y: y + TILE - 46, w: 36, h: 46, open: false };
        else if (ch === 'o') w.buttons.push({ x: x + 2, y: y + TILE - 6, w: 20, h: 6, pressed: false });
        else if (ch === 'l') w.levers.push({ x: x, y: y, w: TILE, h: TILE, on: false });
        else continue;
        grid[r][c] = '.';
      }
    }
    for (const def of L.platforms) {
      const pl = Object.assign({}, def);
      if (pl.kind === 'retract') pl.h = pl.closedH;
      else pl.y = pl.downY;
      w.platforms.push(pl);
    }
    for (const role of ROLES) w.players[role] = newPlayer(w, role);
    return w;
  }

  function newPlayer(world, role) {
    const s = world.spawns[role];
    return { role, x: s.x, y: s.y, vx: 0, vy: 0, grounded: false, groundId: null, facing: 1, alive: true, inDoor: false };
  }

  function resetLevel(world) {
    const fresh = createWorld(world.levelIndex);
    for (const k of ['gems', 'buttons', 'levers', 'doors', 'platforms', 'players']) world[k] = fresh[k];
    world.ticks = 0; world.deadTimer = 0; world.deadRole = null;
    world.status = 'playing';
  }

  // ---------- physics (shared: server simulates, client predicts) ----------
  function stepPlayer(p, inp, world, dt) {
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    p.vx = dir * PHYS.MOVE;
    if (dir) p.facing = dir;
    if (inp.j && p.grounded) { p.vy = -PHYS.JUMP; p.grounded = false; }
    p.vy = Math.min(p.vy + PHYS.GRAVITY * dt, PHYS.MAX_FALL);

    // horizontal, with a small step-up so pool lips and lift edges don't snag
    const dx = p.vx * dt;
    if (dx) {
      p.x += dx;
      const hits = solidsOverlapping(world, pRect(p));
      if (hits.length) {
        let stepped = false;
        if (p.grounded) {
          const top = Math.min.apply(null, hits.map((h) => h.y));
          const lift = p.y + PH - top;
          if (lift > 0 && lift <= PHYS.STEP_UP) {
            p.y -= lift;
            if (!solidsOverlapping(world, pRect(p)).length) stepped = true;
            else p.y += lift;
          }
        }
        if (!stepped) {
          for (const h of hits) p.x = dx > 0 ? Math.min(p.x, h.x - PW) : Math.max(p.x, h.x + h.w);
          p.vx = 0;
        }
      }
    }

    // vertical
    const dy = p.vy * dt;
    p.y += dy;
    p.grounded = false; p.groundId = null;
    const hits = solidsOverlapping(world, pRect(p));
    if (hits.length) {
      if (dy > 0) {
        let best = hits[0];
        for (const h of hits) if (h.y < best.y) best = h;
        p.y = best.y - PH; p.grounded = true; p.groundId = best.pid || null;
      } else {
        let low = -Infinity;
        for (const h of hits) low = Math.max(low, h.y + h.h);
        p.y = low;
      }
      p.vy = 0;
    }
  }

  // ---------- server-side rules ----------
  function feetRect(p) { return { x: p.x + 2, y: p.y + PH - 4, w: PW - 4, h: 8 }; }

  // One input step for one player: movement + things only that player triggers.
  function stepPlayerFull(world, role, inp) {
    const p = world.players[role];
    if (!p.alive) return;
    const prevCx = p.x + PW / 2;
    stepPlayer(p, inp, world, DT);
    const r = pRect(p);
    const cx = p.x + PW / 2;

    for (const g of world.gems) if (!g.taken && g.kind === role && overlap(r, g)) g.taken = true;

    for (const lv of world.levers) {
      if (!overlap(r, lv)) continue;
      const mid = lv.x + lv.w / 2;
      if (prevCx < mid && cx >= mid) lv.on = true;
      else if (prevCx > mid && cx <= mid) lv.on = false;
    }

    // pools: check the liquid band of any pool tile the player is touching
    const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + PW - 1e-6) / TILE);
    const rr0 = Math.floor(p.y / TILE), rr1 = Math.floor((p.y + PH - 1e-6) / TILE);
    for (let row = rr0; row <= rr1; row++) {
      for (let c = c0; c <= c1; c++) {
        const kind = POOLS[tileAt(world, c, row)];
        if (!kind) continue;
        const liquid = { x: c * TILE + 3, y: row * TILE + 4, w: TILE - 6, h: 9 };
        if (!overlap(r, liquid)) continue;
        if (kind === 'goo' || (kind === 'lava' && role === 'water') || (kind === 'water' && role === 'fire')) {
          p.alive = false;
          world.status = 'dead'; world.deadRole = role; world.deadTimer = 90;
        }
      }
    }
  }

  // Once per tick, after both players moved: buttons, platforms, doors, win/death timers.
  function stepWorld(world) {
    if (world.status === 'dead') {
      if (--world.deadTimer <= 0) resetLevel(world);
      return;
    }
    if (world.status !== 'playing') return;
    world.ticks++;
    const players = ROLES.map((k) => world.players[k]).filter((p) => p.alive);

    for (const b of world.buttons) b.pressed = players.some((p) => overlap(feetRect(p), b));
    const anyButton = world.buttons.some((b) => b.pressed);
    const anyLever = world.levers.some((l) => l.on);

    for (const pl of world.platforms) {
      const active = pl.trigger === 'button' ? anyButton : anyLever;
      const prop = pl.kind === 'retract' ? 'h' : 'y';
      const target = pl.kind === 'retract' ? (active ? pl.openH : pl.closedH) : (active ? pl.upY : pl.downY);
      const cur = pl[prop];
      if (cur === target) continue;
      const step = Math.sign(target - cur) * Math.min(Math.abs(target - cur), pl.speed * DT);
      const riders = players.filter((p) => p.grounded && p.groundId === pl.id);
      const next = Object.assign({}, platRect(pl));
      if (prop === 'h') next.h = cur + step; else next.y = cur + step;
      // don't crush anyone who isn't riding
      const blocked = players.some((p) => riders.indexOf(p) < 0 && overlap(pRect(p), next));
      if (blocked) continue;
      pl[prop] = cur + step;
      if (prop === 'y') for (const p of riders) p.y += step;
    }

    for (const role of ROLES) {
      const p = world.players[role], d = world.doors[role];
      const pr = pRect(p);
      p.inDoor = p.alive && p.grounded && pr.x >= d.x - 4 && pr.x + PW <= d.x + d.w + 4 && overlap(pr, d);
      d.open = p.inDoor;
    }
    if (world.players.fire.inDoor && world.players.water.inDoor) world.status = 'won';
  }

  // ---------- network snapshots ----------
  function round(n) { return Math.round(n * 100) / 100; }
  function snapshot(world, acks) {
    const p = {};
    for (const role of ROLES) {
      const q = world.players[role];
      p[role] = { x: round(q.x), y: round(q.y), vx: q.vx, vy: round(q.vy), g: q.grounded ? 1 : 0, gid: q.groundId, f: q.facing, a: q.alive ? 1 : 0, d: q.inDoor ? 1 : 0, ack: acks[role] || 0 };
    }
    return {
      t: 'state', st: world.status, tk: world.ticks, dr: world.deadRole, p,
      pl: world.platforms.map((pl) => round(pl.kind === 'retract' ? pl.h : pl.y)),
      gm: world.gems.map((g) => (g.taken ? 1 : 0)).join(''),
      bt: world.buttons.map((b) => (b.pressed ? 1 : 0)).join(''),
      lv: world.levers.map((l) => (l.on ? 1 : 0)).join(''),
    };
  }

  function applySnapshot(world, s) {
    world.status = s.st; world.ticks = s.tk; world.deadRole = s.dr;
    world.platforms.forEach((pl, i) => { if (pl.kind === 'retract') pl.h = s.pl[i]; else pl.y = s.pl[i]; });
    world.gems.forEach((g, i) => { g.taken = s.gm[i] === '1'; });
    world.buttons.forEach((b, i) => { b.pressed = s.bt[i] === '1'; });
    world.levers.forEach((l, i) => { l.on = s.lv[i] === '1'; });
    for (const role of ROLES) {
      const q = s.p[role], p = world.players[role];
      Object.assign(p, { x: q.x, y: q.y, vx: q.vx, vy: q.vy, grounded: !!q.g, groundId: q.gid, facing: q.f, alive: !!q.a, inDoor: !!q.d });
      world.doors[role].open = !!q.d;
    }
  }

  return {
    TILE, DT, PHYS, PW, PH, POOLS, ROLES, LEVELS,
    overlap, createWorld, resetLevel, stepPlayer, stepPlayerFull, stepWorld, snapshot, applySnapshot, solidsOverlapping,
  };
});
