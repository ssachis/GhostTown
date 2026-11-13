/*
 * GhostTown — shared game rules. Loaded by every browser: the host (or a
 * same-laptop game) runs the real simulation; an online guest uses the same
 * physics to predict its own movement.
 *
 * Map legend
 *   #  stone wall               .  empty
 *   L  orange lava  (Boy is safe, kills the Ghost)
 *   V  black hole   (Ghost is safe, swallows the Boy)
 *   G  witch's brew (kills both)
 *   c  candy   (Boy collects)   p  pumpkin (Ghost collects)
 *   1  Boy spawn                2  Ghost spawn
 *   D  Boy's exit door          E  Ghost's exit door
 *   o  pressure button          l  lever
 * Moving parts (gates, lifts) live in each level's `platforms`; torches in `decor`.
 * A lift's optional `chainTop` (px) is where its chains hang from; default is the top of the screen.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Game = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TILE = 24;
  const DT = 1 / 60;
  const PHYS = {
    MOVE: 190,          // top run speed (px/s)
    ACCEL: 2400,        // ground acceleration
    DECEL: 2800,        // ground braking
    AIR_ACCEL: 1700,
    AIR_DECEL: 1000,
    JUMP: 500,          // take-off speed
    G_UP: 1450,         // gravity while rising with jump held
    G_CUT: 3400,        // gravity while rising after jump released (short hop)
    G_DOWN: 2000,       // gravity while falling
    APEX: 0.55,         // softer gravity near the top of a held jump
    MAX_FALL: 760,
    COYOTE: 0.09,       // can still jump this long after walking off a ledge
    BUFFER: 0.12,       // a jump pressed this early before landing still fires
    STEP_UP: 13,
  };
  const PW = 18;
  const PH = 34;
  const POOLS = { L: 'lava', V: 'void', G: 'goo' };
  const ROLES = ['boy', 'ghost'];
  const KILLS = { lava: ['ghost'], void: ['boy'], goo: ['boy', 'ghost'] };

  const LEVELS = [
    {
      name: 'The Haunted Hall',
      map: [
        '##################################',
        '#................................#',
        '#................................#',
        '#................................#',
        '#.............c..p...............#',
        '#............######..............#',
        '#................................#',
        '#..D..E..........................#',
        '############################.....#',
        '#................................#',
        '#................................#',
        '#........c...........p...........#',
        '#.........................l......#',
        '#....#########GG##################',
        '#................................#',
        '#................................#',
        '###..............................#',
        '###...o.......o....p....c........#',
        '##################VV###LL####....#',
        '#................................#',
        '#................................#',
        '#.............................####',
        '#.1.2.....c.....p.............####',
        '#########LL####VV#################',
        '##################################',
      ],
      platforms: [
        // Iron gate on the second floor: retracts while ANY button is pressed.
        { id: 'gate', kind: 'retract', trigger: 'button', x: 10 * TILE + 6, y: 14 * TILE, w: 12, closedH: 96, openH: 0, speed: 320 },
        // Wooden swing on chains (right side): rises to the top floor while the lever points right.
        { id: 'lift', kind: 'move', trigger: 'lever', x: 28 * TILE, w: 96, h: 12, downY: 13 * TILE - 12, upY: 8 * TILE, speed: 70 },
      ],
      // purely visual; [col, row] of the tile the prop sits in
      decor: {
        lanterns: [[7, 20], [25, 20], [26, 15], [6, 10], [19, 10], [10, 3]],
        banners: [[13, 19], [21, 14], [12, 9], [23, 1]],
        candles: [[22, 22], [8, 17], [30, 12], [9, 7]],
        graves: [[19, 22], [24, 12]],
      },
    },
    {
      // Two ideas on top of level 1:
      //  * floor 2 splits the pair: one holds the button so the other can slip
      //    past the gate, then the one who got through pulls the lever to lift
      //    the one left behind up the chain swing;
      //  * the top floor splits into two corridors: Andy wades the lava below,
      //    his Ghost floats through the black hole on the ledge above.
      name: 'The Haunted Hotel',
      map: [
        '##################################',
        '#................................#',
        '#................................#',
        '#................................#',
        '#..............p......p.......E..#',
        '#...........#######VVVVVVV########',
        '#................................#',
        '#.............c......c........D..#',
        '#....#############LLLLLLL#########',
        '#................................#',
        '#................................#',
        '#####............................#',
        '#####p...............c...........#',
        '#####VV###...###GG###LL##....#####',
        '#................................#',
        '#................................#',
        '#.........###....................#',
        '#..l......###.c.....o.p..........#',
        '##############LL######VV######...#',
        '#................................#',
        '#................................#',
        '#.............................####',
        '#.1.2...c...p...........p.c...####',
        '########LL##VV###GG###############',
        '##################################',
      ],
      platforms: [
        // Iron gate on floor 2: retracts while the button is pressed.
        { id: 'gate', kind: 'retract', trigger: 'button', x: 17 * TILE + 6, y: 14 * TILE, w: 12, closedH: 96, openH: 0, speed: 320 },
        // Chain swing on the right: carries whoever stayed behind up to floor 3 while the lever points right.
        { id: 'lift', kind: 'move', trigger: 'lever', x: 25 * TILE, w: 96, h: 12, downY: 18 * TILE - 12, upY: 13 * TILE, speed: 70, chainTop: 9 * TILE },
      ],
      decor: {
        lanterns: [[6, 20], [20, 20], [27, 20], [5, 15], [15, 15], [13, 10], [23, 10], [7, 3], [9, 2], [27, 2]],
        banners: [[11, 19], [24, 19], [14, 14], [22, 14], [10, 9], [17, 1], [15, 6]],
        candles: [[15, 22], [5, 17], [23, 12], [8, 7]],
        graves: [[21, 22], [13, 12]],
      },
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
  function platRect(pl) { return { x: pl.x, y: pl.y, w: pl.w, h: pl.h }; }

  // Every solid rectangle overlapping r: walls, the stone half of pools, platforms.
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
      levelIndex, name: L.name, cols: grid[0].length, rows: grid.length, decor: L.decor || {},
      grid, gems: [], buttons: [], levers: [], doors: {}, spawns: {},
      platforms: [], players: {}, status: 'lobby', ticks: 0, deadTimer: 0, deadRole: null, deadCause: null, held: false,
    };
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === 'c' || ch === 'p') w.gems.push({ x: x + 4, y: y + 4, w: 16, h: 16, kind: ch === 'c' ? 'boy' : 'ghost', taken: false, c, r });
        else if (ch === '1') w.spawns.boy = { x: x + 3, y: y + TILE - PH };
        else if (ch === '2') w.spawns.ghost = { x: x + 3, y: y + TILE - PH };
        else if (ch === 'D') w.doors.boy = { x: x - 6, y: y + TILE - 46, w: 36, h: 46, open: false };
        else if (ch === 'E') w.doors.ghost = { x: x - 6, y: y + TILE - 46, w: 36, h: 46, open: false };
        else if (ch === 'o') w.buttons.push({ x: x + 2, y: y + TILE - 6, w: 20, h: 6, pressed: false });
        else if (ch === 'l') w.levers.push({ x: x, y: y, w: TILE, h: TILE, on: false });
        else continue;
        grid[r][c] = '.';
      }
    }
    // a treat sitting over a pit floats over the middle of that pit
    for (const g of w.gems) {
      const below = grid[g.r + 1] && grid[g.r + 1][g.c];
      if (POOLS[below]) {
        let c0 = g.c, c1 = g.c;
        while (grid[g.r + 1][c0 - 1] === below) c0--;
        while (grid[g.r + 1][c1 + 1] === below) c1++;
        g.x = ((c0 + c1 + 1) / 2) * TILE - g.w / 2;
      }
      delete g.c; delete g.r;
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
    return {
      role, x: s.x, y: s.y, vx: 0, vy: 0, grounded: false, groundId: null, facing: 1, alive: true, inDoor: false,
      coy: 0, jb: 0, jh: false, jumpedNow: false,
    };
  }

  function resetLevel(world, levelIndex) {
    const fresh = createWorld(levelIndex == null ? world.levelIndex : levelIndex);
    for (const k of ['levelIndex', 'name', 'cols', 'rows', 'grid', 'decor', 'spawns', 'gems', 'buttons', 'levers', 'doors', 'platforms', 'players']) world[k] = fresh[k];
    world.ticks = 0; world.deadTimer = 0; world.deadRole = null; world.deadCause = null; world.held = false;
    delete world._spiders; // the renderer's cached spiders belong to the old map
    world.status = 'playing';
  }

  // ---------- physics (shared: host simulates, guest predicts) ----------
  function approach(v, target, amt) {
    return v < target ? Math.min(v + amt, target) : Math.max(v - amt, target);
  }

  function stepPlayer(p, inp, world, dt) {
    const dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const accel = dir ? (p.grounded ? PHYS.ACCEL : PHYS.AIR_ACCEL) : (p.grounded ? PHYS.DECEL : PHYS.AIR_DECEL);
    p.vx = approach(p.vx, dir * PHYS.MOVE, accel * dt);
    if (dir) p.facing = dir;

    // coyote time + jump buffer make jumps forgiving; releasing early gives a short hop
    p.coy = p.grounded ? PHYS.COYOTE : Math.max(0, p.coy - dt);
    const pressed = !!inp.j && !p.jh;
    p.jh = !!inp.j;
    p.jb = pressed ? PHYS.BUFFER : Math.max(0, p.jb - dt);
    p.jumpedNow = false;
    if (p.jb > 0 && p.coy > 0) {
      p.vy = -PHYS.JUMP; p.jb = 0; p.coy = 0; p.grounded = false; p.jumpedNow = true;
    }
    let g = p.vy < 0 ? (inp.j ? PHYS.G_UP : PHYS.G_CUT) : PHYS.G_DOWN;
    if (inp.j && Math.abs(p.vy) < 70) g *= PHYS.APEX;
    p.vy = Math.min(p.vy + g * dt, PHYS.MAX_FALL);

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

  // ---------- host-side rules ----------
  function feetRect(p) { return { x: p.x + 2, y: p.y + PH - 4, w: PW - 4, h: 8 }; }

  // One input step for one player: movement + the things only that player triggers.
  function stepPlayerFull(world, role, inp) {
    const p = world.players[role];
    if (!p.alive || world.held) return;
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

    const c0 = Math.floor(p.x / TILE), c1 = Math.floor((p.x + PW - 1e-6) / TILE);
    const rr0 = Math.floor(p.y / TILE), rr1 = Math.floor((p.y + PH - 1e-6) / TILE);
    for (let row = rr0; row <= rr1; row++) {
      for (let c = c0; c <= c1; c++) {
        const kind = POOLS[tileAt(world, c, row)];
        if (!kind || KILLS[kind].indexOf(role) < 0) continue;
        const liquid = { x: c * TILE + 3, y: row * TILE + 4, w: TILE - 6, h: 9 };
        if (overlap(r, liquid) && p.alive) {
          p.alive = false;
          world.status = 'dead'; world.deadRole = role; world.deadCause = kind; world.deadTimer = 100;
        }
      }
    }
  }

  // Once per tick, after both players moved: buttons, platforms, doors, win/death timers.
  function stepWorld(world) {
    if (world.held) return; // paused from the pause menu
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
      const next = platRect(pl);
      if (prop === 'h') next.h = cur + step; else next.y = cur + step;
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
    if (world.players.boy.inDoor && world.players.ghost.inDoor) world.status = 'won';
  }

  // ---------- network snapshots ----------
  function round(n) { return Math.round(n * 100) / 100; }
  function snapshot(world, acks) {
    const p = {};
    for (const role of ROLES) {
      const q = world.players[role];
      p[role] = {
        x: round(q.x), y: round(q.y), vx: round(q.vx), vy: round(q.vy), g: q.grounded ? 1 : 0, gid: q.groundId,
        f: q.facing, a: q.alive ? 1 : 0, d: q.inDoor ? 1 : 0, c: round(q.coy), b: round(q.jb), h: q.jh ? 1 : 0,
        ack: acks[role] || 0,
      };
    }
    return {
      t: 'state', lvl: world.levelIndex, st: world.status, hd: world.held ? 1 : 0, tk: world.ticks, dr: world.deadRole, dc: world.deadCause, p,
      pl: world.platforms.map((pl) => round(pl.kind === 'retract' ? pl.h : pl.y)),
      gm: world.gems.map((g) => (g.taken ? 1 : 0)).join(''),
      bt: world.buttons.map((b) => (b.pressed ? 1 : 0)).join(''),
      lv: world.levers.map((l) => (l.on ? 1 : 0)).join(''),
    };
  }

  function applySnapshot(world, s) {
    if (s.lvl !== world.levelIndex) resetLevel(world, s.lvl);
    world.status = s.st; world.held = !!s.hd; world.ticks = s.tk; world.deadRole = s.dr; world.deadCause = s.dc;
    world.platforms.forEach((pl, i) => { if (pl.kind === 'retract') pl.h = s.pl[i]; else pl.y = s.pl[i]; });
    world.gems.forEach((g, i) => { g.taken = s.gm[i] === '1'; });
    world.buttons.forEach((b, i) => { b.pressed = s.bt[i] === '1'; });
    world.levers.forEach((l, i) => { l.on = s.lv[i] === '1'; });
    for (const role of ROLES) {
      const q = s.p[role], p = world.players[role];
      Object.assign(p, {
        x: q.x, y: q.y, vx: q.vx, vy: q.vy, grounded: !!q.g, groundId: q.gid, facing: q.f, alive: !!q.a,
        inDoor: !!q.d, coy: q.c, jb: q.b, jh: !!q.h,
      });
      world.doors[role].open = !!q.d;
    }
  }

  return {
    TILE, DT, PHYS, PW, PH, POOLS, ROLES, KILLS, LEVELS,
    overlap, createWorld, resetLevel, stepPlayer, stepPlayerFull, stepWorld, snapshot, applySnapshot, solidsOverlapping,
  };
});
