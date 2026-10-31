/*
 * GhostTown art — everything is drawn with canvas shapes (no image files),
 * styled after the GhostTown design sheets: lavender stone ruins with moss and
 * vines, a moonlit castle skyline, the curly-haired boy and his glowing ghost.
 */
(() => {
  'use strict';
  const G = window.Game;
  const { TILE, PW, PH } = G;

  const C = {
    skyTop: '#140e36', skyMid: '#2b2068', skyLow: '#43308a',
    moon: '#f4efff', far: '#2a2062', near: '#20184f', window: 'rgba(255,200,100,.75)',
    mortar: '#3c2e6c', mortarIn: '#2f2458',
    moss: '#7fae38', mossLight: '#b4da55', leaf: '#c3d34a',
    boy: '#ff9a2e', ghost: '#5cc0ff',
  };

  // deterministic noise so the level looks the same on both laptops
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ---------- static layer: sky, skyline, stone, vines, banners ----------
  function buildStatic(w, W, H) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    drawSky(g, W, H);
    const solid = (c, r) => r < 0 || r >= w.rows || c < 0 || c >= w.cols || w.grid[r][c] === '#';
    const empty = (c, r) => !solid(c, r) && !G.POOLS[(w.grid[r] || [])[c]];

    // soft shadows cast under overhangs (drawn before the stone)
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
      if (solid(c, r) && empty(c, r + 1)) {
        const y = (r + 1) * TILE;
        const sh = g.createLinearGradient(0, y, 0, y + 14);
        sh.addColorStop(0, 'rgba(10,4,30,.45)'); sh.addColorStop(1, 'rgba(10,4,30,0)');
        g.fillStyle = sh; g.fillRect(c * TILE, y, TILE, 14);
      }
    }
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
      const ch = w.grid[r][c];
      if (ch === '#') drawStone(g, w, c, r, solid, empty, 0);
      else if (G.POOLS[ch]) drawStone(g, w, c, r, solid, empty, 12);
    }
    // moss + vines on exposed tops
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
      if (solid(c, r) && empty(c, r - 1) && r > 0) drawMoss(g, c, r, solid);
    }
    // cobwebs in upper corners
    for (let r = 1; r < w.rows; r++) for (let c = 1; c < w.cols - 1; c++) {
      if (!empty(c, r) || !solid(c, r - 1)) continue;
      if (solid(c - 1, r) && hash(c, r * 7) < 0.6) cobweb(g, c * TILE, r * TILE, 1);
      else if (solid(c + 1, r) && hash(c * 3, r) < 0.6) cobweb(g, (c + 1) * TILE, r * TILE, -1);
    }
    const d = w.decor || {};
    (d.banners || []).forEach(([c, r]) => banner(g, c * TILE + 12, r * TILE));
    (d.graves || []).forEach(([c, r]) => grave(g, c * TILE + 12, (r + 1) * TILE));
    foliage(g, 0, 2, 1);
    foliage(g, W, 2, -1);
    return cv;
  }

  function drawSky(g, W, H) {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, C.skyTop); sky.addColorStop(0.5, C.skyMid); sky.addColorStop(1, C.skyLow);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // a few calm stars
    for (let i = 0; i < 45; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + hash(i, 1) * 0.5})`;
      g.fillRect(hash(i, 2) * W, hash(i, 3) * H * 0.55, 1.5, 1.5);
    }
    // moon
    const mx = W - 120, my = 88;
    const glow = g.createRadialGradient(mx, my, 30, mx, my, 150);
    glow.addColorStop(0, 'rgba(225,210,255,.35)'); glow.addColorStop(1, 'rgba(225,210,255,0)');
    g.fillStyle = glow; g.fillRect(mx - 150, my - 150, 300, 300);
    g.fillStyle = C.moon; g.beginPath(); g.arc(mx, my, 44, 0, 7); g.fill();
    g.fillStyle = 'rgba(190,175,230,.35)';
    [[-14, -8, 9], [12, 10, 7], [6, -18, 5], [-6, 16, 5]].forEach(([x, y, r]) => { g.beginPath(); g.arc(mx + x, my + y, r, 0, 7); g.fill(); });
    // soft clouds
    g.fillStyle = 'rgba(150,120,230,.13)';
    [[160, 120, 120, 18], [520, 70, 150, 16], [mx - 40, my + 40, 130, 14]].forEach(([x, y, rx, ry]) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); });
    // castle skyline (two calm layers)
    skyline(g, W, H, C.far, 0.62, 11, true);
    bridge(g, W, H);
    skyline(g, W, H, C.near, 0.84, 23, false);
  }

  // arched stone bridge in the distance (from the parallax sheet)
  function bridge(g, W, H) {
    const b = document.createElement('canvas'); b.width = W; b.height = H;
    const k = b.getContext('2d');
    const top = H * 0.7;
    k.fillStyle = '#271d5c'; k.fillRect(0, top, W, H - top);
    k.fillStyle = '#2f246a'; k.fillRect(0, top - 6, W, 6);
    for (let x = -20; x < W; x += 14) k.fillRect(x, top - 12, 7, 6);
    k.globalCompositeOperation = 'destination-out';
    const span = 120;
    for (let x = 30; x < W; x += span) {
      k.beginPath(); k.moveTo(x, H); k.lineTo(x, top + 64); k.arc(x + span / 2 - 12, top + 64, span / 2 - 12, Math.PI, 0); k.lineTo(x + span - 24, H); k.fill();
    }
    g.drawImage(b, 0, 0);
  }

  // autumn leaves framing the top corners
  function foliage(g, x0, y0, dir) {
    const cols = ['#e8742a', '#c9461f', '#f2a03d', '#d8582a'];
    g.strokeStyle = '#4a2c22'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + dir * 50, y0 + 10, x0 + dir * 110, y0 + 4); g.stroke();
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x0 + dir * 40, y0 + 8); g.quadraticCurveTo(x0 + dir * 55, y0 + 25, x0 + dir * 70, y0 + 34); g.stroke();
    for (let i = 0; i < 26; i++) {
      const n = hash(i, dir + 5), m = hash(i * 3, dir + 9);
      const lx = x0 + dir * (6 + n * 112), ly = y0 + 2 + m * 30 * (1 - n * 0.5);
      g.save(); g.translate(lx, ly); g.rotate(n * 6);
      g.fillStyle = cols[i % 4];
      g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(5, -2, 0, 6); g.quadraticCurveTo(-5, -2, 0, -5); g.fill();
      g.strokeStyle = 'rgba(80,30,10,.35)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 5); g.stroke();
      g.restore();
    }
  }

  function skyline(g, W, H, color, base, seed, castle) {
    g.fillStyle = color;
    let x = -10;
    while (x < W + 10) {
      const bw = 34 + hash(x, seed) * 50;
      const bh = H * (1 - base) * (0.5 + hash(x, seed + 1) * 0.9);
      const top = H - bh;
      g.fillRect(x, top, bw, bh);
      // pointed roof or tower
      g.beginPath();
      if (castle && hash(x, seed + 2) < 0.35) {
        g.fillRect(x + bw * 0.3, top - 40, bw * 0.4, 40);
        g.moveTo(x + bw * 0.25, top - 40); g.lineTo(x + bw * 0.5, top - 72); g.lineTo(x + bw * 0.75, top - 40);
      } else {
        g.moveTo(x - 3, top); g.lineTo(x + bw / 2, top - 16 - hash(x, seed + 3) * 18); g.lineTo(x + bw + 3, top);
      }
      g.fill();
      // a few lit windows
      g.fillStyle = C.window;
      for (let i = 0; i < 3; i++) {
        if (hash(x + i, seed + 4) < 0.45) g.fillRect(x + 6 + hash(x, i + seed) * (bw - 14), top + 10 + hash(i, x) * (bh * 0.4), 4, 6);
      }
      g.fillStyle = color;
      x += bw + 4;
    }
  }

  function drawStone(g, w, c, r, solid, empty, top) {
    const x = c * TILE, y = r * TILE;
    let exposed = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (empty(c + dx, r + dy)) exposed = true;
    g.save();
    g.beginPath(); g.rect(x, y + top, TILE, TILE - top); g.clip();
    g.fillStyle = exposed ? C.mortar : C.mortarIn;
    g.fillRect(x, y, TILE, TILE);
    for (let band = 0; band < 2; band++) {
      const by = y + band * 12;
      const k = r * 2 + band;
      const off = (k % 2) * 12;
      const start = x - ((((x - off) % 24) + 24) % 24);
      for (let bx = start; bx < x + TILE; bx += 24) {
        const n = hash(bx, by);
        const L = exposed ? 54 + n * 8 : 40 + n * 6;
        g.fillStyle = `hsl(258, 32%, ${L}%)`;
        rr(g, bx + 1, by + 1, 22, 10, 3); g.fill();
        g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(bx + 3, by + 1.5, 18, 1.5);
        g.fillStyle = 'rgba(20,8,50,.18)'; g.fillRect(bx + 3, by + 9, 18, 1.5);
        if (n > 0.86) { g.fillStyle = 'rgba(20,8,50,.25)'; g.fillRect(bx + 6 + n * 8, by + 4, 3, 1); }
      }
    }
    if (top === 0) {
      if (empty(c, r + 1)) { g.fillStyle = 'rgba(15,6,40,.45)'; g.fillRect(x, y + TILE - 3, TILE, 3); }
      if (empty(c - 1, r)) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x, y, 2, TILE); }
      if (empty(c + 1, r)) { g.fillStyle = 'rgba(15,6,40,.3)'; g.fillRect(x + TILE - 2, y, 2, TILE); }
    }
    g.restore();
  }

  function drawMoss(g, c, r, solid) {
    const x = c * TILE, y = r * TILE;
    g.fillStyle = C.moss; g.fillRect(x, y - 1, TILE, 4);
    g.fillStyle = C.mossLight;
    for (let i = 0; i < 4; i++) {
      const n = hash(c * 5 + i, r);
      g.beginPath(); g.arc(x + 3 + i * 6, y - 1, 1.8 + n * 1.6, Math.PI, 0); g.fill();
    }
    g.fillStyle = C.moss;
    for (let i = 0; i < 2; i++) {
      const n = hash(c + i * 11, r * 3);
      if (n < 0.5) g.fillRect(x + 4 + n * 30, y + 3, 2.5, 2 + n * 6);
    }
    // a hanging vine now and then
    if (hash(c, r * 13) < 0.16 && solid(c, r + 1)) {
      const len = 14 + hash(c, r) * 22;
      const vx = x + 6 + hash(r, c) * 12;
      g.strokeStyle = '#6d9a2e'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(vx, y + 2);
      g.quadraticCurveTo(vx + 5, y + len * 0.5, vx + 1, y + len); g.stroke();
      g.fillStyle = C.leaf;
      for (let i = 1; i <= 3; i++) {
        const ly = y + (len * i) / 3.4, lx = vx + 3 * Math.sin(i * 2);
        g.beginPath(); g.ellipse(lx + (i % 2 ? 3 : -3), ly, 3, 1.8, i % 2 ? 0.6 : -0.6, 0, 7); g.fill();
      }
    }
  }

  function cobweb(g, x, y, dir) {
    g.strokeStyle = 'rgba(230,225,255,.22)'; g.lineWidth = 0.8;
    const R = 16;
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + dir * Math.cos(a) * R, y + Math.sin(a) * R); g.stroke();
    }
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      for (let i = 0; i <= 4; i++) {
        const a = (i / 4) * (Math.PI / 2), rad = (R * k) / 3.2;
        const px = x + dir * Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
    }
  }

  function ghostIcon(g, cx, cy, s, color) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy - s * 0.2, s * 0.6, Math.PI, 0);
    g.lineTo(cx + s * 0.6, cy + s * 0.6);
    for (let i = 0; i < 3; i++) {
      const x0 = cx + s * 0.6 - (i + 1) * (s * 0.4);
      g.quadraticCurveTo(x0 + s * 0.2, cy + s * 0.35, x0, cy + s * 0.6);
    }
    g.closePath(); g.fill();
  }

  function banner(g, cx, y) {
    g.fillStyle = '#5b4a2e'; g.fillRect(cx - 11, y + 2, 22, 3);
    g.fillStyle = '#7a4fd0';
    g.beginPath(); g.moveTo(cx - 9, y + 5); g.lineTo(cx + 9, y + 5); g.lineTo(cx + 9, y + 34); g.lineTo(cx, y + 28); g.lineTo(cx - 9, y + 34); g.closePath(); g.fill();
    g.fillStyle = '#9b74ee'; g.fillRect(cx - 9, y + 5, 18, 3);
    g.strokeStyle = '#d6a64a'; g.lineWidth = 1; g.strokeRect(cx - 7, y + 9, 14, 15);
    ghostIcon(g, cx, y + 16, 9, '#efe6ff');
  }

  function grave(g, cx, by) {
    g.fillStyle = '#6d5f96';
    g.beginPath(); g.moveTo(cx - 9, by); g.lineTo(cx - 9, by - 14); g.arc(cx, by - 14, 9, Math.PI, 0); g.lineTo(cx + 9, by); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(cx - 8, by - 14, 2, 13);
    ghostIcon(g, cx, by - 13, 8, '#a99ad6');
    g.fillStyle = C.moss; g.fillRect(cx - 10, by - 2, 20, 2);
  }

  // ---------- dynamic pieces ----------
  function lantern(c, cx, y, t, i) {
    const fl = 0.85 + Math.sin(t * 9 + i * 3) * 0.08 + Math.sin(t * 23 + i) * 0.05;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gl = c.createRadialGradient(cx, y + 16, 2, cx, y + 16, 56 * fl);
    gl.addColorStop(0, 'rgba(255,190,90,.30)'); gl.addColorStop(1, 'rgba(255,190,90,0)');
    c.fillStyle = gl; c.fillRect(cx - 60, y - 40, 120, 120);
    c.restore();
    c.strokeStyle = '#2b2140'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, y); c.lineTo(cx, y + 6); c.stroke();
    c.fillStyle = '#2b2140'; rr(c, cx - 6, y + 6, 12, 3, 1); c.fill();
    c.fillStyle = `rgba(255,${200 + fl * 30},120,1)`; rr(c, cx - 5, y + 9, 10, 12, 2); c.fill();
    c.fillStyle = '#fff6c8'; c.beginPath(); c.ellipse(cx, y + 15, 2, 3 * fl, 0, 0, 7); c.fill();
    c.strokeStyle = '#2b2140'; c.lineWidth = 1.5; c.strokeRect(cx - 5, y + 9, 10, 12);
    c.beginPath(); c.moveTo(cx, y + 9); c.lineTo(cx, y + 21); c.stroke();
    c.fillStyle = '#2b2140'; c.beginPath(); c.moveTo(cx - 7, y + 21); c.lineTo(cx + 7, y + 21); c.lineTo(cx, y + 25); c.fill();
  }

  function candles(c, cx, by, t, i) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const gl = c.createRadialGradient(cx, by - 14, 1, cx, by - 14, 30);
    gl.addColorStop(0, 'rgba(255,200,110,.25)'); gl.addColorStop(1, 'rgba(255,200,110,0)');
    c.fillStyle = gl; c.fillRect(cx - 30, by - 44, 60, 60);
    c.restore();
    [[-6, 9], [0, 13], [6, 7]].forEach(([dx, h], k) => {
      c.fillStyle = '#f3e6c4'; c.fillRect(cx + dx - 2, by - h, 4, h);
      c.fillStyle = '#d9c79f'; c.fillRect(cx + dx + 1, by - h, 1, h);
      const f = Math.sin(t * 11 + k * 2 + i) * 0.6;
      c.fillStyle = '#ffb53a'; c.beginPath(); c.ellipse(cx + dx + f * 0.4, by - h - 3, 1.8, 3.2, f * 0.1, 0, 7); c.fill();
      c.fillStyle = '#fff4c0'; c.beginPath(); c.ellipse(cx + dx + f * 0.3, by - h - 2.5, 0.8, 1.6, 0, 0, 7); c.fill();
    });
  }

  function spidersFor(w) {
    if (w._spiders) return w._spiders;
    const list = [];
    const solid = (c, r) => r < 0 || c < 0 || c >= w.cols || r >= w.rows || w.grid[r][c] === '#';
    for (let r = 1; r < w.rows - 1; r++) for (let c = 1; c < w.cols - 1; c++) {
      if (w.grid[r][c] !== '.' || !solid(c, r - 1) || hash(c * 7, r * 3) > 0.09) continue;
      let room = 0;
      while (room < 3 && !solid(c, r + room)) room++;
      if (room < 2) continue;
      list.push({ x: c * TILE + 4 + hash(c, r) * 16, y: r * TILE, len: 14 + hash(r, c) * (room * TILE - 40), ph: hash(c, r + 9) * 6 });
    }
    return (w._spiders = list);
  }

  function spider(c, s, t) {
    const len = s.len + Math.sin(t * 0.9 + s.ph) * 7;
    const x = s.x, y = s.y + len;
    c.strokeStyle = 'rgba(230,225,255,.35)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x, s.y); c.lineTo(x, y - 4); c.stroke();
    c.strokeStyle = '#2a1d4a'; c.lineWidth = 1.3;
    for (let i = 0; i < 4; i++) {
      const k = Math.sin(t * 6 + i + s.ph) * 1;
      for (const d of [-1, 1]) {
        c.beginPath(); c.moveTo(x, y);
        c.quadraticCurveTo(x + d * 6, y - 4 + i * 2, x + d * (8 + k), y + 1 + i * 2.5);
        c.stroke();
      }
    }
    c.fillStyle = '#3a2766'; c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill();
    c.fillStyle = '#4b3484'; c.beginPath(); c.arc(x - 1.5, y - 1.5, 2, 0, 7); c.fill();
    c.fillStyle = '#ffd23a';
    c.beginPath(); c.arc(x - 2, y + 1, 1.3, 0, 7); c.arc(x + 2, y + 1, 1.3, 0, 7); c.fill();
  }

  function bat(c, x, y, t, s) {
    const flap = Math.sin(t * 12 + s) * 5;
    c.fillStyle = '#4a2f8a';
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x - 6, y - 6 - flap, x - 14, y - 2 - flap);
    c.quadraticCurveTo(x - 9, y + 1, x - 7, y + 4);
    c.quadraticCurveTo(x - 3, y + 1, x, y + 4);
    c.quadraticCurveTo(x + 3, y + 1, x + 7, y + 4);
    c.quadraticCurveTo(x + 9, y + 1, x + 14, y - 2 - flap);
    c.quadraticCurveTo(x + 6, y - 6 - flap, x, y);
    c.fill();
    c.beginPath(); c.arc(x, y + 1, 3.5, 0, 7); c.fill();
    c.fillStyle = '#ffd23a'; c.fillRect(x - 2, y, 1.4, 1.4); c.fillRect(x + 0.6, y, 1.4, 1.4);
  }

  const POOL = {
    lava: ['#ffd65a', '#ff7a12', '#d8430a'],
    void: ['#6a52ff', '#1a0f3a', '#06030f'],
    goo: ['#b6ff5c', '#56c21e', '#2b7a10'],
  };

  function drawPools(c, w, t) {
    for (let r = 0; r < w.rows; r++) for (let col = 0; col < w.cols; col++) {
      const kind = G.POOLS[w.grid[r][col]];
      if (!kind) continue;
      const x = col * TILE, y = r * TILE;
      const [a, b, d] = POOL[kind];
      // glow above the surface
      c.save(); c.globalCompositeOperation = 'lighter';
      const glow = c.createLinearGradient(0, y - 14, 0, y + 6);
      const gc = kind === 'lava' ? '255,120,30' : kind === 'void' ? '120,90,255' : '140,255,80';
      glow.addColorStop(0, `rgba(${gc},0)`); glow.addColorStop(1, `rgba(${gc},${kind === 'void' ? 0.22 : 0.3})`);
      c.fillStyle = glow; c.fillRect(x, y - 14, TILE, 20);
      c.restore();
      if (kind === 'void') continue; // drawn as whole portals below
      const grad = c.createLinearGradient(0, y + 3, 0, y + 13);
      grad.addColorStop(0, a); grad.addColorStop(0.35, b); grad.addColorStop(1, d);
      c.fillStyle = grad;
      c.beginPath(); c.moveTo(x, y + 13);
      for (let i = 0; i <= TILE; i += 3) c.lineTo(x + i, y + 5 + Math.sin(t * 2.6 + (x + i) * 0.22) * 1.3);
      c.lineTo(x + TILE, y + 13); c.closePath(); c.fill();
      const ph = (t * 0.8 + hash(col, r)) % 1;
      if (hash(col, Math.floor(t * 0.8 + hash(col, r))) < 0.6) {
        c.fillStyle = a;
        c.beginPath(); c.arc(x + 6 + hash(col, r + 2) * 12, y + 10 - ph * 8, 1.2 + ph * 1.8, 0, 7); c.fill();
      }
    }
    // black holes: each run of void tiles is one swirling purple portal
    for (let r = 0; r < w.rows; r++) {
      let col = 0;
      while (col < w.cols) {
        if (G.POOLS[w.grid[r][col]] !== 'void') { col++; continue; }
        const start = col;
        while (col < w.cols && G.POOLS[w.grid[r][col]] === 'void') col++;
        portal(c, start * TILE, r * TILE, (col - start) * TILE, t, start);
      }
    }
  }

  function portal(c, x, y, wd, t, seed) {
    const cx = x + wd / 2, cy = y + 9;
    c.save();
    c.beginPath(); c.moveTo(x, y + 13);
    for (let i = 0; i <= wd; i += 3) c.lineTo(x + i, y + 4 + Math.sin(t * 2 + (x + i) * 0.2) * 0.8);
    c.lineTo(x + wd, y + 13); c.closePath();
    c.fillStyle = '#0d0420'; c.fill();
    c.clip();
    const core = c.createRadialGradient(cx, cy, 1, cx, cy, wd * 0.55);
    core.addColorStop(0, 'rgba(225,150,255,.95)'); core.addColorStop(0.35, 'rgba(140,70,240,.7)'); core.addColorStop(1, 'rgba(30,10,70,0)');
    c.fillStyle = core; c.fillRect(x, y, wd, 14);
    // spiral arms
    c.translate(cx, cy); c.scale(1, 0.32);
    c.lineWidth = 2; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = k % 2 ? 'rgba(200,150,255,.75)' : 'rgba(120,80,255,.8)';
      c.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = -t * 2.4 + k * 2.09 + i * 0.26, rad = 2 + i * (wd * 0.5 / 24);
        const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
    }
    c.restore();
    // glowing rim + rising motes
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = 'rgba(170,120,255,.9)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x + 1, y + 4.5); c.lineTo(x + wd - 1, y + 4.5); c.stroke();
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.6 + i / 3 + seed * 0.13) % 1;
      c.fillStyle = `rgba(200,160,255,${0.8 * (1 - ph)})`;
      c.beginPath(); c.arc(x + wd * (0.2 + 0.3 * i) + Math.sin(t * 3 + i) * 3, y + 3 - ph * 16, 1.3, 0, 7); c.fill();
    }
    c.restore();
  }

  function door(c, d, role, t) {
    const cx = d.x + d.w / 2, top = d.y, bot = d.y + d.h, R = d.w / 2;
    // stone arch frame
    c.fillStyle = '#8b76c4';
    c.beginPath(); c.moveTo(d.x - 5, bot); c.lineTo(d.x - 5, top + R); c.arc(cx, top + R, R + 5, Math.PI, 0); c.lineTo(d.x + d.w + 5, bot); c.closePath(); c.fill();
    c.strokeStyle = '#5a4890'; c.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * R, top + R + Math.sin(a) * R); c.lineTo(cx + Math.cos(a) * (R + 5), top + R + Math.sin(a) * (R + 5)); c.stroke();
    }
    for (let y = top + R + 8; y < bot; y += 9) { c.beginPath(); c.moveTo(d.x - 5, y); c.lineTo(d.x, y); c.moveTo(d.x + d.w, y); c.lineTo(d.x + d.w + 5, y); c.stroke(); }
    // opening
    const open = d.open;
    const boy = role === 'boy';
    c.save();
    c.beginPath(); c.moveTo(d.x, bot); c.lineTo(d.x, top + R); c.arc(cx, top + R, R, Math.PI, 0); c.lineTo(d.x + d.w, bot); c.closePath(); c.clip();
    const light = c.createLinearGradient(0, top, 0, bot);
    light.addColorStop(0, boy ? '#fff0b0' : '#d8f2ff'); light.addColorStop(1, boy ? '#ffb24a' : '#5cc0ff');
    c.fillStyle = light; c.fillRect(d.x, top, d.w, d.h);
    const lift = open ? d.h * 0.8 : 0;
    c.translate(0, -lift);
    if (boy) {
      c.fillStyle = '#b5652c'; c.fillRect(d.x, top, d.w, d.h);
      c.fillStyle = '#8a4618';
      for (let x = d.x + 7; x < d.x + d.w; x += 7.5) c.fillRect(x, top, 1.5, d.h);
      c.fillStyle = '#5b3a20'; c.fillRect(d.x, top + 18, d.w, 3); c.fillRect(d.x, bot - 12, d.w, 3);
      c.fillStyle = '#ffd25a';
      c.shadowColor = '#ffb030'; c.shadowBlur = 8;
      c.beginPath(); c.arc(cx, top + 27, 4.5, 0, 7); c.fill();
      c.beginPath(); c.moveTo(cx - 3, top + 29); c.lineTo(cx + 3, top + 29); c.lineTo(cx + 2, top + 37); c.lineTo(cx - 2, top + 37); c.fill();
      c.fillStyle = '#5b3a20'; c.beginPath(); c.arc(cx, top + 27, 1.8, 0, 7); c.fill();
    } else {
      const bg = c.createLinearGradient(0, top, 0, bot);
      bg.addColorStop(0, '#2f7ae0'); bg.addColorStop(1, '#173f9a');
      c.fillStyle = bg; c.fillRect(d.x, top, d.w, d.h);
      c.fillStyle = 'rgba(255,255,255,.12)';
      for (let x = d.x + 7; x < d.x + d.w; x += 7.5) c.fillRect(x, top, 1, d.h);
      c.shadowColor = '#8fdcff'; c.shadowBlur = 10;
      ghostIcon(c, cx, top + 28, 14, '#e6f6ff');
      c.shadowBlur = 0;
      c.fillStyle = '#173f9a'; c.fillRect(cx - 3, top + 25, 2, 3); c.fillRect(cx + 1, top + 25, 2, 3);
    }
    c.restore();
    c.shadowBlur = 0;
    if (open) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const gl = c.createRadialGradient(cx, top + 24, 4, cx, top + 24, 50);
      gl.addColorStop(0, boy ? 'rgba(255,170,60,.35)' : 'rgba(90,190,255,.35)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gl; c.fillRect(cx - 50, top - 26, 100, 100);
      c.restore();
    }
  }

  function candy(c, cx, cy, t) {
    c.save(); c.translate(cx, cy); c.rotate(Math.sin(t * 2.5) * 0.25);
    c.fillStyle = '#c55cff';
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(-11, -5); c.lineTo(-10, 0); c.lineTo(-11, 5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(6, 0); c.lineTo(11, -5); c.lineTo(10, 0); c.lineTo(11, 5); c.closePath(); c.fill();
    c.fillStyle = '#9b3fe0'; c.beginPath(); c.ellipse(0, 0, 7, 5.5, 0, 0, 7); c.fill();
    c.save(); c.clip();
    c.fillStyle = '#ff7ad2';
    for (let i = -8; i < 8; i += 5) { c.beginPath(); c.moveTo(i, -6); c.lineTo(i + 2.5, -6); c.lineTo(i + 5.5, 6); c.lineTo(i + 3, 6); c.fill(); }
    c.fillStyle = '#ffb347'; c.fillRect(-1, -6, 1.6, 12);
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-2.5, -2.5, 2, 1, -0.4, 0, 7); c.fill();
    c.restore();
  }

  function lollipop(c, cx, cy, t) {
    c.save(); c.translate(cx, cy + 1); c.rotate(Math.sin(t * 2.2) * 0.18);
    c.fillStyle = '#f3ead8'; c.fillRect(-0.9, 1, 1.8, 9);
    c.fillStyle = '#b25cff'; c.beginPath(); c.arc(0, -2, 6.5, 0, 7); c.fill();
    c.strokeStyle = '#ffb347'; c.lineWidth = 1.6;
    c.beginPath();
    for (let a = 0; a < 12; a += 0.3) { const r = a * 0.5; const px = Math.cos(a) * r, py = -2 + Math.sin(a) * r; a ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-2.5, -4.5, 1.8, 1, -0.5, 0, 7); c.fill();
    c.restore();
  }

  function candyCorn(c, cx, cy, t) {
    c.save(); c.translate(cx, cy); c.rotate(Math.sin(t * 2.4) * 0.15);
    const tri = () => { c.beginPath(); c.moveTo(0, -8); c.quadraticCurveTo(7, 4, 6, 6); c.quadraticCurveTo(0, 8, -6, 6); c.quadraticCurveTo(-7, 4, 0, -8); c.closePath(); };
    tri(); c.save(); c.clip();
    c.fillStyle = '#fff6e6'; c.fillRect(-8, -9, 16, 6);
    c.fillStyle = '#ffb02e'; c.fillRect(-8, -3, 16, 5);
    c.fillStyle = '#ff7a12'; c.fillRect(-8, 2, 16, 7);
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.ellipse(-2, -2, 1, 2.4, 0.3, 0, 7); c.fill();
    c.restore();
  }

  function pumpkin(c, cx, cy, t) {
    c.save(); c.translate(cx, cy);
    c.fillStyle = '#4c8a26'; c.save(); c.rotate(0.3); c.fillRect(-1.2, -10, 2.4, 5); c.restore();
    c.fillStyle = '#e8700e'; c.beginPath(); c.ellipse(-3.5, 0, 4.5, 6.2, 0, 0, 7); c.ellipse(3.5, 0, 4.5, 6.2, 0, 0, 7); c.fill();
    c.fillStyle = '#ff9124'; c.beginPath(); c.ellipse(0, 0, 4.5, 6.6, 0, 0, 7); c.fill();
    const fl = 0.75 + Math.sin(t * 8) * 0.2;
    c.fillStyle = `rgba(255,${210 + fl * 30},90,1)`;
    c.beginPath(); c.moveTo(-4.5, -2); c.lineTo(-1.5, -2); c.lineTo(-3, -4.5); c.fill();
    c.beginPath(); c.moveTo(4.5, -2); c.lineTo(1.5, -2); c.lineTo(3, -4.5); c.fill();
    c.beginPath(); c.moveTo(-5, 1.5); c.lineTo(-2.5, 3.2); c.lineTo(0, 2); c.lineTo(2.5, 3.2); c.lineTo(5, 1.5); c.quadraticCurveTo(0, 6, -5, 1.5); c.fill();
    c.restore();
  }

  function gem(c, g, t, i, variant) {
    if (g.taken) return;
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2 + Math.sin(t * 3 + i) * 1.6;
    const boy = g.kind === 'boy';
    c.save(); c.globalCompositeOperation = 'lighter';
    const gl = c.createRadialGradient(cx, cy, 1, cx, cy, 15);
    gl.addColorStop(0, boy ? 'rgba(255,150,60,.5)' : 'rgba(90,190,255,.5)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gl; c.fillRect(cx - 16, cy - 16, 32, 32);
    c.restore();
    if (boy) [candy, lollipop, candyCorn][variant % 3](c, cx, cy, t + i);
    else pumpkin(c, cx, cy, t + i);
    if (Math.sin(t * 2 + i * 1.7) > 0.92) {
      c.fillStyle = '#fff';
      const s = 2.5; c.beginPath(); c.moveTo(cx + 6, cy - 9 - s); c.lineTo(cx + 6.6, cy - 9); c.lineTo(cx + 6, cy - 9 + s); c.lineTo(cx + 5.4, cy - 9); c.fill();
    }
  }

  function button(c, b, i) {
    const col = i % 2 ? ['#ffb23f', 'rgba(255,170,60,'] : ['#5cc8ff', 'rgba(90,190,255,'];
    c.fillStyle = '#6b5a9e'; rr(c, b.x - 2, b.y + 2, b.w + 4, 4, 1.5); c.fill();
    const h = b.pressed ? 1.5 : 4;
    if (b.pressed) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const gl = c.createRadialGradient(b.x + b.w / 2, b.y + 2, 1, b.x + b.w / 2, b.y + 2, 22);
      gl.addColorStop(0, col[1] + '.5)'); gl.addColorStop(1, col[1] + '0)');
      c.fillStyle = gl; c.fillRect(b.x - 14, b.y - 20, b.w + 28, 30);
      c.restore();
    }
    c.fillStyle = col[0]; rr(c, b.x + 1, b.y + 2 - h, b.w - 2, h + 1, 1.5); c.fill();
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(b.x + 3, b.y + 2 - h, b.w - 6, 1);
  }

  function lever(c, l) {
    const bx = l.x + l.w / 2, by = l.y + l.h;
    const ang = (l.on ? 1 : -1) * 0.6;
    const kx = bx + Math.sin(ang) * 17, ky = by - 5 - Math.cos(ang) * 17;
    c.strokeStyle = '#cfc8e0'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx, by - 5); c.lineTo(kx, ky); c.stroke();
    c.fillStyle = '#ff9a2e'; c.beginPath(); c.arc(kx, ky, 3.8, 0, 7); c.fill();
    c.fillStyle = '#ffd08a'; c.beginPath(); c.arc(kx - 1, ky - 1, 1.3, 0, 7); c.fill();
    c.fillStyle = '#7a6ca6';
    c.beginPath(); c.moveTo(bx - 9, by); c.lineTo(bx - 6, by - 6); c.lineTo(bx + 6, by - 6); c.lineTo(bx + 9, by); c.fill();
    c.fillStyle = '#4c3f78'; c.beginPath(); c.arc(bx, by - 5, 2.5, 0, 7); c.fill();
  }

  function platform(c, pl, v) {
    if (pl.kind === 'retract') {
      if (v < 0.5) return;
      // iron portcullis bars
      c.fillStyle = '#2c2148'; c.fillRect(pl.x, pl.y, pl.w, v);
      c.fillStyle = '#5a4890';
      c.fillRect(pl.x + 1, pl.y, 3, v); c.fillRect(pl.x + pl.w - 4, pl.y, 3, v);
      for (let y = pl.y + 8; y < pl.y + v - 3; y += 14) c.fillRect(pl.x, y, pl.w, 2.5);
      c.fillStyle = '#8b76c4';
      c.beginPath(); c.moveTo(pl.x, pl.y + v); c.lineTo(pl.x + 2.5, pl.y + v + 5); c.lineTo(pl.x + 5, pl.y + v);
      c.moveTo(pl.x + pl.w - 5, pl.y + v); c.lineTo(pl.x + pl.w - 2.5, pl.y + v + 5); c.lineTo(pl.x + pl.w, pl.y + v); c.fill();
    } else {
      // wooden swing on chains
      c.strokeStyle = '#a89ab8'; c.lineWidth = 1.5;
      for (const cx of [pl.x + 10, pl.x + pl.w - 10]) {
        for (let y = TILE; y < v; y += 6) { c.beginPath(); c.ellipse(cx, y + 3, 1.8, 3, 0, 0, 7); c.stroke(); }
      }
      c.fillStyle = '#9a5f2e'; rr(c, pl.x, v, pl.w, pl.h, 3); c.fill();
      c.fillStyle = '#c98244'; c.fillRect(pl.x + 2, v, pl.w - 4, 3);
      c.fillStyle = '#6e3f1a';
      for (let x = pl.x + 24; x < pl.x + pl.w; x += 24) c.fillRect(x, v + 1, 1.5, pl.h - 2);
      c.fillStyle = '#4a3a5e';
      for (const cx of [pl.x + 10, pl.x + pl.w - 10]) { c.beginPath(); c.arc(cx, v + 6, 2.2, 0, 7); c.fill(); }
    }
  }

  // ---------- characters ----------
  // The boy, after the GhostTown sheets: fluffy wavy hair, big shiny eyes,
  // cream hoodie with a purple hood/scarf, brown backpack, navy shorts, sneakers.
  function drawBoy(c, p, t, isMe) {
    const f = p.facing || 1;
    const cx = p.x + PW / 2, by = p.y + PH;
    if (!p.alive) return poof(c, cx, by - 16, t, '170,160,200');
    const moving = Math.abs(p.vx) > 25 && p.grounded;
    const air = !p.grounded;
    const run = moving ? Math.sin(t * 15) : 0;
    const bob = moving ? -Math.abs(Math.cos(t * 15)) * 1.3 : Math.sin(t * 3) * 0.35;
    c.save(); c.translate(cx, by);
    if (p.grounded) { c.fillStyle = 'rgba(10,5,30,.3)'; c.beginPath(); c.ellipse(0, 0, 9, 2.2, 0, 0, 7); c.fill(); }
    c.scale(f * 0.86, 0.86); c.translate(0, bob);

    const HAIR = '#33211f', HAIR2 = '#4a2f2a', HAIR_HI = '#7d5245', SKIN = '#f9d7bf', SKIN2 = '#f0bfa0';

    // backpack
    c.fillStyle = '#8a5532'; rr(c, -13, -25, 8.5, 13, 3.2); c.fill();
    c.fillStyle = '#a96b3d'; rr(c, -13, -25, 8.5, 5.5, 3); c.fill();
    c.fillStyle = '#d9a35b'; c.fillRect(-9.6, -20.5, 2, 2);

    // back arm
    const armA = air ? -2.3 : -run * 0.7;
    limbArm(c, -2, -21, -armA, '#e2d4bf', SKIN2);

    // legs
    const legA = air ? [-0.75, 0.55] : [run * 0.55, -run * 0.55];
    legA.forEach((ang, k) => limbLeg(c, k ? 1.5 : -1.5, -11, ang, k ? 1 : 0.85, air && k === 0));
    c.fillStyle = '#2c2a4f'; rr(c, -6.5, -14, 13, 5.5, 2.2); c.fill();

    // hoodie
    const hood = c.createLinearGradient(-7, 0, 8, 0);
    hood.addColorStop(0, '#f6eee2'); hood.addColorStop(1, '#ddcdb4');
    c.fillStyle = hood; rr(c, -7.5, -24, 15, 12.5, 5); c.fill();
    c.fillStyle = '#e2d4bf'; rr(c, -7.5, -14, 15, 2.6, 1.2); c.fill();
    c.strokeStyle = '#cdbca2'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(3.5, -22); c.lineTo(3.5, -14); c.stroke();
    c.beginPath(); c.moveTo(-1, -17); c.quadraticCurveTo(3, -15.6, 7, -17); c.stroke();
    // backpack strap
    c.fillStyle = '#7a4a2b'; rr(c, -5, -23.5, 2.6, 10, 1); c.fill();

    // cream hood behind the neck + purple neckerchief
    c.fillStyle = '#e4d6c0'; c.beginPath(); c.ellipse(-4, -24.6, 5.4, 4, -0.2, 0, 7); c.fill();
    c.fillStyle = '#f4ece0'; c.beginPath(); c.ellipse(-3.2, -25.4, 3.6, 2.4, -0.2, 0, 7); c.fill();
    c.fillStyle = '#7c4fd6'; c.beginPath(); c.ellipse(1, -23.4, 6.8, 2.5, 0, 0, 7); c.fill();
    c.fillStyle = '#6a40c4'; c.beginPath(); c.moveTo(2.5, -22.5); c.lineTo(6, -18.5); c.lineTo(3.2, -19.3); c.closePath(); c.fill();
    c.fillStyle = '#a07cf2'; c.beginPath(); c.ellipse(2.4, -24.1, 3.8, 0.9, 0, 0, 7); c.fill();

    // front arm
    limbArm(c, 3.5, -21.5, armA, '#efe4d2', SKIN);

    // head
    const hx = 2, hy = -34;
    c.fillStyle = HAIR; c.beginPath(); c.ellipse(hx - 7, hy + 1, 8, 10, 0, 0, 7); c.fill();
    c.fillStyle = SKIN; c.beginPath(); c.arc(hx, hy, 12.4, 0, 7); c.fill();
    c.fillStyle = 'rgba(240,170,140,.28)'; c.beginPath(); c.arc(hx - 3, hy + 4, 7, 0, 7); c.fill();

    // wavy hair with pointed locks (one silhouette, like the sheets)
    c.fillStyle = HAIR;
    c.beginPath();
    c.moveTo(hx - 13, hy + 7);
    c.quadraticCurveTo(hx - 16, hy - 5, hx - 10, hy - 12);
    c.quadraticCurveTo(hx - 13, hy - 17, hx - 7.5, hy - 16.5);
    c.quadraticCurveTo(hx - 6, hy - 21.5, hx - 1, hy - 18.5);
    c.quadraticCurveTo(hx + 1, hy - 25, hx + 5.5, hy - 23);
    c.quadraticCurveTo(hx + 4, hy - 19.5, hx + 6, hy - 17.5);
    c.quadraticCurveTo(hx + 11.5, hy - 19.5, hx + 14.5, hy - 15);
    c.quadraticCurveTo(hx + 12, hy - 13.5, hx + 13, hy - 11);
    c.quadraticCurveTo(hx + 15.8, hy - 7, hx + 13.6, hy - 1.5);
    c.quadraticCurveTo(hx + 12, hy - 6, hx + 10, hy - 7);
    c.quadraticCurveTo(hx + 9, hy - 4, hx + 7, hy - 3);
    c.quadraticCurveTo(hx + 6.5, hy - 6.2, hx + 4.5, hy - 7.6);
    c.quadraticCurveTo(hx + 3, hy - 4.6, hx + 0.5, hy - 3.6);
    c.quadraticCurveTo(hx + 0, hy - 7.2, hx - 2.5, hy - 8);
    c.quadraticCurveTo(hx - 3.5, hy - 3, hx - 6.2, hy - 1);
    c.quadraticCurveTo(hx - 8, hy + 3, hx - 9.5, hy + 9);
    c.quadraticCurveTo(hx - 11.5, hy + 10, hx - 13, hy + 7);
    c.closePath(); c.fill();
    // extra messy locks for volume
    [[-12.5, -9, 5], [-14, -3, 4.6], [-13, 3, 4.2], [-11, 7.5, 3.4]].forEach(([x, y, r]) => { c.beginPath(); c.arc(hx + x, hy + y, r, 0, 7); c.fill(); });
    lock(c, hx - 8, hy - 16, hx - 12, hy - 21, hx - 4, hy - 18);
    lock(c, hx + 9, hy - 18, hx + 12, hy - 23.5, hx + 13, hy - 16);
    // a darker underside so the fringe has depth
    c.fillStyle = HAIR2;
    c.beginPath(); c.moveTo(hx - 2, hy - 9); c.quadraticCurveTo(hx + 5, hy - 12, hx + 11, hy - 8.5);
    c.quadraticCurveTo(hx + 6, hy - 9.5, hx - 2, hy - 9); c.fill();
    // soft highlights
    c.strokeStyle = HAIR_HI; c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx - 8, hy - 11.5); c.quadraticCurveTo(hx - 3, hy - 15.5, hx + 3, hy - 14.5); c.stroke();
    c.beginPath(); c.moveTo(hx + 5, hy - 13); c.quadraticCurveTo(hx + 8.5, hy - 14, hx + 11.5, hy - 11); c.stroke();
    c.beginPath(); c.moveTo(hx - 12, hy - 3); c.quadraticCurveTo(hx - 11, hy - 8, hx - 7.5, hy - 10.5); c.stroke();
    // face
    const blink = Math.sin(t * 1.4 + 1) > 0.986;
    for (const ex of [1.8, 8.2]) {
      const ey = hy + 2.8;
      if (blink) { c.strokeStyle = '#2b1a14'; c.lineWidth = 1.3; c.beginPath(); c.arc(ex + hx, ey, 2.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); continue; }
      c.fillStyle = '#2b1a14'; c.beginPath(); c.ellipse(hx + ex, ey, 2.7, 3.6, 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(hx + ex + 0.9, ey - 1.3, 1.2, 0, 7); c.fill();
      c.beginPath(); c.arc(hx + ex - 0.8, ey + 1.4, 0.55, 0, 7); c.fill();
    }
    c.fillStyle = SKIN2; c.beginPath(); c.arc(hx + 6.4, hy + 5, 0.9, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,120,140,.45)';
    c.beginPath(); c.ellipse(hx + 0.4, hy + 6.4, 2.3, 1.4, 0, 0, 7); c.ellipse(hx + 10.6, hy + 6.2, 1.8, 1.3, 0, 0, 7); c.fill();
    if (air || moving) {
      c.fillStyle = '#8a3326';
      c.beginPath(); c.moveTo(hx + 2.8, hy + 7.4); c.quadraticCurveTo(hx + 5.2, hy + 11.6, hx + 7.6, hy + 7.4); c.closePath(); c.fill();
      c.fillStyle = '#ff8f9a'; c.beginPath(); c.ellipse(hx + 5.2, hy + 9.4, 1.5, 0.9, 0, 0, 7); c.fill();
    } else {
      c.strokeStyle = '#8a3326'; c.lineWidth = 1.1;
      c.beginPath(); c.arc(hx + 5.2, hy + 6.8, 2.1, 0.2, Math.PI - 0.2); c.stroke();
    }
    c.restore();
    if (isMe) marker(c, cx, p.y - 24, t, C.boy);
  }

  function lock(c, x0, y0, x1, y1, x2, y2) {
    c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + 2, (y0 + y1) / 2, x1, y1);
    c.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 1, x2, y2); c.closePath(); c.fill();
  }

  function limbArm(c, sx, sy, ang, sleeve, skin) {
    c.save(); c.translate(sx, sy); c.rotate(ang);
    c.fillStyle = sleeve; rr(c, -2.3, -0.5, 4.6, 8, 2.3); c.fill();
    c.fillStyle = '#d8c7ae'; c.fillRect(-2.3, 6, 4.6, 1.4);
    c.fillStyle = skin; c.beginPath(); c.arc(0, 9, 2.4, 0, 7); c.fill();
    c.restore();
  }

  function limbLeg(c, hx, hy, ang, shade, tuck) {
    c.save(); c.translate(hx, hy); c.rotate(ang);
    const k = tuck ? 0.75 : 1;
    c.globalAlpha = 1;
    c.fillStyle = '#2c2a4f'; c.fillRect(-2.6, -1, 5.2, 4);
    c.fillStyle = shade < 1 ? '#efbfa1' : '#f6cdb2'; c.fillRect(-1.6, 3, 3.2, 4.2 * k);
    c.fillStyle = '#f4efe6'; c.fillRect(-1.8, 3 + 3.6 * k, 3.6, 1.5);
    c.translate(0, 3 + 5 * k);
    c.fillStyle = shade < 1 ? '#6e4227' : '#8a5532'; rr(c, -2.6, 0, 7.2, 3.4, 1.6); c.fill();
    c.fillStyle = '#f4efe6'; c.fillRect(-2.6, 2.6, 7.2, 1);
    c.restore();
  }

  function drawGhost(c, p, t, isMe) {
    const f = p.facing || 1;
    const cx = p.x + PW / 2;
    const cy = p.y + 15 + Math.sin(t * 3) * 1.8;
    if (!p.alive) return poof(c, cx, cy, t, '200,220,255');
    const moving = Math.abs(p.vx) > 25;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gl = c.createRadialGradient(cx, cy, 4, cx, cy, 25);
    gl.addColorStop(0, 'rgba(150,180,255,.38)'); gl.addColorStop(1, 'rgba(150,180,255,0)');
    c.fillStyle = gl; c.fillRect(cx - 25, cy - 25, 50, 50);
    c.restore();
    // sparkle trail
    if (moving) for (let i = 0; i < 3; i++) {
      const a = Math.sin(t * 6 + i * 2);
      if (a < 0) continue;
      c.fillStyle = `rgba(200,220,255,${a * 0.9})`;
      const sx = cx - f * (16 + i * 6), sy = cy + 6 + Math.sin(t * 5 + i) * 5;
      c.beginPath(); c.moveTo(sx, sy - 2.5); c.lineTo(sx + 0.7, sy); c.lineTo(sx, sy + 2.5); c.lineTo(sx - 0.7, sy); c.fill();
    }
    c.save(); c.translate(cx, cy); c.scale(f, 1);
    const w1 = Math.sin(t * 7) * 1.5, w2 = Math.sin(t * 7 + 2) * 1.5, w3 = Math.sin(t * 7 + 4) * 2;
    const body = c.createLinearGradient(0, -16, 0, 18);
    body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#d6ccff');
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(-12, -2);
    c.arc(0, -3, 12, Math.PI, 0);
    c.quadraticCurveTo(13, 8, 9, 14);
    c.quadraticCurveTo(5, 18 + w1, 1, 14);
    c.quadraticCurveTo(-3, 18 + w2, -7, 14);
    c.quadraticCurveTo(-12, 19 + w3, -18, 11 + w3);
    c.quadraticCurveTo(-13, 7, -12, -2);
    c.fill();
    c.strokeStyle = 'rgba(150,130,240,.5)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#f4f0ff'; c.beginPath(); c.ellipse(10, 4, 3, 2.2, -0.4, 0, 7); c.fill();
    // face
    const happy = p.inDoor || Math.sin(t * 0.7) > 0.93;
    for (const ex of [1.5, 8.2]) {
      if (happy) { c.strokeStyle = '#1e1430'; c.lineWidth = 1.7; c.beginPath(); c.arc(ex, -2, 2.3, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); continue; }
      c.fillStyle = '#1e1430'; c.beginPath(); c.ellipse(ex, -3, 2.6, 3.5, 0, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + 0.8, -4.6, 1.1, 0, 7); c.fill();
    }
    // purple gaming headphones
    c.lineCap = 'round';
    c.strokeStyle = '#2a2140'; c.lineWidth = 3.2;
    c.beginPath(); c.arc(0, -3, 13.5, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
    c.strokeStyle = '#8a63e8'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(0, -3, 14.6, Math.PI * 1.15, Math.PI * 1.6); c.stroke();
    c.fillStyle = '#2a2140'; c.beginPath(); c.ellipse(-11.5, -3, 4.2, 5.6, 0, 0, 7); c.fill();
    c.fillStyle = '#7b57d6'; c.beginPath(); c.ellipse(-12, -3, 3.4, 4.6, 0, 0, 7); c.fill();
    c.fillStyle = '#2a2140'; c.beginPath(); c.ellipse(-12, -3, 2.3, 3.3, 0, 0, 7); c.fill();
    c.fillStyle = '#c8b4ff'; c.beginPath(); c.arc(-12, -3.6, 1.1, Math.PI, 0); c.lineTo(-10.9, -1.8); c.lineTo(-13.1, -1.8); c.fill();
    c.fillStyle = 'rgba(255,130,170,.5)';
    c.beginPath(); c.ellipse(-1.5, 2, 2.2, 1.3, 0, 0, 7); c.ellipse(11, 2, 1.8, 1.3, 0, 0, 7); c.fill();
    c.fillStyle = '#3a1c3a';
    c.beginPath(); c.moveTo(2.5, 2); c.quadraticCurveTo(4.8, 6.5, 7, 2); c.closePath(); c.fill();
    c.fillStyle = '#ff8fb0'; c.beginPath(); c.ellipse(4.8, 4.2, 1.3, 0.8, 0, 0, 7); c.fill();
    c.restore();
    if (isMe) marker(c, cx, p.y - 22, t, C.ghost);
  }

  function poof(c, x, y, t, rgb) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + t;
      c.fillStyle = `rgba(${rgb},${0.35 + 0.2 * Math.sin(t * 3 + i)})`;
      c.beginPath(); c.arc(x + Math.cos(a) * 8, y + Math.sin(a) * 6 - (t * 10) % 6, 4 + (i % 3), 0, 7); c.fill();
    }
  }

  function marker(c, x, y, t, color) {
    const yy = y + Math.sin(t * 4) * 1.5;
    c.fillStyle = color;
    c.beginPath(); c.moveTo(x - 4.5, yy); c.lineTo(x + 4.5, yy); c.lineTo(x, yy + 5.5); c.closePath(); c.fill();
  }

  function drawPlayer(c, p, t, isMe) { p.role === 'boy' ? drawBoy(c, p, t, isMe) : drawGhost(c, p, t, isMe); }

  // ---------- frame ----------
  function drawFrame(ctx, w, staticLayer, t, opts) {
    ctx.drawImage(staticLayer, 0, 0);
    // bats drift across the moonlit top
    for (let i = 0; i < 2; i++) {
      const span = ctx.canvas.width + 120;
      const x = ((t * (22 + i * 8) + i * 400) % span) - 60;
      bat(ctx, x, 46 + i * 34 + Math.sin(t * 1.5 + i) * 10, t, i);
    }
    const d = w.decor || {};
    for (let i = 0; i < 5; i++) {
      const H = ctx.canvas.height, W = ctx.canvas.width;
      const sp = 16 + hash(i, 4) * 10;
      const y = ((t * sp + hash(i, 1) * H) % (H + 40)) - 20;
      const x = hash(i, 2) * W + Math.sin(t * 0.8 + i * 2) * 26;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.3 + i) * 1.2);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = ['#e8742a', '#c9461f', '#f2a03d'][i % 3];
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(4, -1, 0, 5); ctx.quadraticCurveTo(-4, -1, 0, -4); ctx.fill();
      ctx.restore();
    }
    (d.lanterns || []).forEach(([c, r], i) => lantern(ctx, c * TILE + 12, r * TILE, t, i));
    (d.candles || []).forEach(([c, r], i) => candles(ctx, c * TILE + 12, (r + 1) * TILE, t, i));
    spidersFor(w).forEach((s) => spider(ctx, s, t));
    w.platforms.forEach((pl, i) => platform(ctx, pl, opts.platforms ? opts.platforms[i] : (pl.kind === 'retract' ? pl.h : pl.y)));
    drawPools(ctx, w, t);
    for (const role of G.ROLES) door(ctx, w.doors[role], role, t);
    w.buttons.forEach((b, i) => button(ctx, b, i));
    w.levers.forEach((l) => lever(ctx, l));
    let nCandy = 0;
    w.gems.forEach((g, i) => gem(ctx, g, t, i, g.kind === 'boy' ? nCandy++ : 0));
    for (const role of G.ROLES) {
      if (opts.hide && opts.hide[role]) continue;
      let p = w.players[role];
      if (opts.override && opts.override[role]) p = Object.assign({}, p, opts.override[role]);
      drawPlayer(ctx, p, t, opts.me === role);
    }
  }

  window.Art = { buildStatic, drawFrame, drawPlayer, candy, lollipop, candyCorn, pumpkin };
})();
