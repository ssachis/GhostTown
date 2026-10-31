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
  function buildStatic(w, W, H, res) {
    res = res || 1;
    const cv = document.createElement('canvas');
    cv.width = W * res; cv.height = H * res;
    const g = cv.getContext('2d');
    g.scale(res, res);
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
    foliage(g, 0, 2, 1);
    foliage(g, W, 2, -1);
    foliage(g, 0, H - 2, 1, true);
    foliage(g, W, H - 2, -1, true);
    return cv;
  }

  function blob(g, x, y, rx, ry, rgba) {
    g.save(); g.translate(x, y); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, rgba); gr.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 7); g.fill();
    g.restore();
  }

  function drawSky(g, W, H) {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#191241'); sky.addColorStop(0.45, '#2f2474'); sky.addColorStop(0.8, '#4a379a'); sky.addColorStop(1, '#5a45aa');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      const a = 0.25 + hash(i, 1) * 0.55, sx = hash(i, 2) * W, sy = hash(i, 3) * H * 0.5;
      g.fillStyle = `rgba(255,250,235,${a})`;
      g.beginPath(); g.arc(sx, sy, 0.6 + hash(i, 4) * 0.8, 0, 7); g.fill();
    }
    // moon with a soft halo, like the sheets
    const mx = W - 150, my = 100;
    blob(g, mx, my, 170, 170, 'rgba(200,180,255,.32)');
    blob(g, mx, my, 80, 80, 'rgba(235,225,255,.35)');
    const mg = g.createRadialGradient(mx - 14, my - 14, 6, mx, my, 48);
    mg.addColorStop(0, '#fffaf2'); mg.addColorStop(0.7, '#ece4fb'); mg.addColorStop(1, '#d4c8f2');
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, 46, 0, 7); g.fill();
    [[-16, -6, 10, .16], [14, 12, 8, .14], [8, -20, 5, .12], [-6, 20, 6, .12], [22, -4, 4, .1]].forEach(([x, y, r, a]) => {
      g.fillStyle = `rgba(150,130,200,${a})`; g.beginPath(); g.arc(mx + x, my + y, r, 0, 7); g.fill();
    });
    // wispy clouds
    [[150, 130, 150, 20], [260, 118, 90, 14], [560, 74, 170, 18], [mx - 70, my + 46, 150, 16], [mx + 40, my + 58, 110, 12]]
      .forEach(([x, y, rx, ry]) => blob(g, x, y, rx, ry, 'rgba(170,150,240,.22)'));
    castleLayer(g, W, H);
    bridge(g, W, H);
    blob(g, W * 0.3, H * 0.8, W * 0.55, 70, 'rgba(150,120,235,.18)');
    blob(g, W * 0.8, H * 0.82, W * 0.45, 60, 'rgba(150,120,235,.16)');
    houses(g, W, H);
  }

  function windowGlow(g, x, y, w, h) {
    blob(g, x + w / 2, y + h / 2, 9, 9, 'rgba(255,190,90,.35)');
    g.fillStyle = '#ffcf73'; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(120,60,20,.5)'; g.fillRect(x + w / 2 - 0.4, y, 0.8, h); g.fillRect(x, y + h / 2 - 0.4, w, 0.8);
  }

  // far castle on the hill (hazy, lighter = further away)
  function castleLayer(g, W, H) {
    const base = H * 0.66, col = '#41338c';
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, base + Math.sin(x * 0.006) * 18 + Math.sin(x * 0.017) * 6);
    g.lineTo(W, H); g.fill();
    const towers = [[90, 70, 26], [140, 110, 34], [200, 60, 22], [420, 95, 28], [470, 140, 36], [530, 80, 24], [700, 70, 26]];
    for (const [x, h, w] of towers) {
      const y = base - h + Math.sin(x * 0.006) * 18;
      g.fillStyle = col;
      g.fillRect(x - w / 2, y, w, h + 30);
      g.beginPath(); g.moveTo(x - w / 2 - 4, y); g.lineTo(x, y - w * 1.3); g.lineTo(x + w / 2 + 4, y); g.fill();
      g.fillRect(x - 0.8, y - w * 1.3 - 9, 1.6, 9);
      if (hash(x, 3) < 0.7) windowGlow(g, x - 2.5, y + 12, 5, 7);
    }
    g.fillStyle = col; g.fillRect(120, base - 60, 380, 70);
    for (let x = 120; x < 500; x += 12) g.fillRect(x, base - 66, 7, 6);
  }

  // arched stone bridge (from the parallax sheet)
  function bridge(g, W, H) {
    const b = document.createElement('canvas'); b.width = W; b.height = H;
    const k = b.getContext('2d');
    const top = H * 0.72;
    k.fillStyle = '#33287a'; k.fillRect(0, top, W, H - top);
    k.fillStyle = '#3c2f88'; k.fillRect(0, top - 5, W, 5);
    for (let x = -20; x < W; x += 16) k.fillRect(x, top - 11, 9, 6);
    k.globalCompositeOperation = 'destination-out';
    const span = 132;
    for (let x = 24; x < W; x += span) {
      const r = span / 2 - 14;
      k.beginPath(); k.moveTo(x, H); k.lineTo(x, top + 34 + r); k.arc(x + r, top + 34 + r, r, Math.PI, 0); k.lineTo(x + 2 * r, H); k.fill();
    }
    g.drawImage(b, 0, 0, W, H);
  }

  // near rooftops with a few warm windows
  function houses(g, W, H) {
    const col = '#261d5c';
    let x = -10, i = 0;
    while (x < W + 10) {
      const bw = 46 + hash(i, 21) * 46, bh = 50 + hash(i, 22) * 60, top = H - bh;
      g.fillStyle = col;
      g.fillRect(x, top, bw, bh);
      g.beginPath(); g.moveTo(x - 5, top); g.lineTo(x + bw * (0.35 + hash(i, 23) * 0.3), top - 22 - hash(i, 24) * 20); g.lineTo(x + bw + 5, top); g.fill();
      if (hash(i, 25) < 0.55) windowGlow(g, x + 10 + hash(i, 26) * (bw - 26), top + 14, 6, 8);
      x += bw + 2; i++;
    }
  }

  // autumn maple foliage framing the corners (like the level mockup)
  function maple(g, x, y, r, rot, col) {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.62, a2 = a + 0.31;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
    }
    g.lineTo(0, r * 0.35); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(90,30,10,.35)'; g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(0, r * 0.35); g.lineTo(0, -r * 0.8); g.stroke();
    g.restore();
  }
  function foliage(g, x0, y0, dir, down) {
    const cols = ['#ff8a1f', '#e8611c', '#ffb43c', '#c9461f', '#ffc93c'];
    const vy = down ? -1 : 1;
    g.strokeStyle = '#4a2c22'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + dir * 60, y0 + vy * (down ? 6 : 16), x0 + dir * 130, y0 + vy * (down ? 4 : 8)); g.stroke();
    g.lineWidth = 1.8;
    if (!down) { g.beginPath(); g.moveTo(x0 + dir * 50, y0 + vy * 12); g.quadraticCurveTo(x0 + dir * 70, y0 + vy * 34, x0 + dir * 84, y0 + vy * 46); g.stroke(); }
    for (let i = 0; i < 34; i++) {
      const n = hash(i, dir + 5 + (down ? 40 : 0)), m = hash(i * 3, dir + 9 + (down ? 40 : 0));
      const lx = x0 + dir * (4 + n * 132), ly = y0 + vy * (2 + m * (down ? 16 : 44) * (1 - n * 0.55));
      maple(g, lx, ly, 5 + hash(i, 7) * 4, n * 6, cols[i % 5]);
    }
  }


  // chunky lavender blocks like the sheets: rounded, lit from the top-left,
  // dark mortar; inner walls are dimmer so the walkable surfaces stand out
  function drawStone(g, w, c, r, solid, empty, top) {
    const x = c * TILE, y = r * TILE;
    let dist = 9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (empty(c + dx, r + dy)) dist = Math.min(dist, Math.max(Math.abs(dx), Math.abs(dy)));
    const lit = dist <= 1 ? 1 : dist === 2 ? 0.55 : 0.25;
    g.save();
    g.beginPath(); g.rect(x, y + top, TILE, TILE - top); g.clip();
    g.fillStyle = `hsl(256, 34%, ${18 + lit * 8}%)`;
    g.fillRect(x, y, TILE, TILE);
    for (let band = 0; band < 2; band++) {
      const by = y + band * 12, k = r * 2 + band, off = (k % 2) * 12;
      const start = x - ((((x - off) % 24) + 24) % 24);
      for (let bx = start; bx < x + TILE; bx += 24) {
        const n = hash(bx, by), L = 34 + lit * 26 + (n - 0.5) * 7, S = 32 + lit * 10;
        const gr = g.createLinearGradient(0, by + 1, 0, by + 11);
        gr.addColorStop(0, `hsl(258, ${S}%, ${L + 7}%)`); gr.addColorStop(1, `hsl(258, ${S}%, ${L - 5}%)`);
        g.fillStyle = gr; rr(g, bx + 1, by + 1, 22, 10.5, 3.2); g.fill();
        g.fillStyle = `rgba(255,245,255,${0.1 + lit * 0.22})`; rr(g, bx + 2.5, by + 1.6, 16, 1.6, 0.8); g.fill();
        g.fillStyle = 'rgba(25,10,60,.22)'; rr(g, bx + 3, by + 9.4, 19, 1.6, 0.8); g.fill();
        if (lit > 0.5) {
          g.fillStyle = 'rgba(40,20,90,.18)';
          for (let q = 0; q < 3; q++) g.fillRect(bx + 4 + hash(bx + q, by) * 15, by + 3.5 + hash(by + q, bx) * 5, 1, 1);
          if (n > 0.88) { g.strokeStyle = 'rgba(40,20,90,.3)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(bx + 6 + n * 6, by + 2); g.lineTo(bx + 9 + n * 6, by + 6); g.lineTo(bx + 8 + n * 6, by + 9); g.stroke(); }
        }
      }
    }
    if (top === 0) {
      if (empty(c, r - 1)) {   // lit top lip of a platform
        const lip = g.createLinearGradient(0, y, 0, y + 5);
        lip.addColorStop(0, 'rgba(235,225,255,.55)'); lip.addColorStop(1, 'rgba(235,225,255,0)');
        g.fillStyle = lip; g.fillRect(x, y, TILE, 5);
      }
      if (empty(c, r + 1)) { g.fillStyle = 'rgba(15,6,40,.45)'; g.fillRect(x, y + TILE - 3, TILE, 3); }
      if (empty(c - 1, r)) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x, y, 2, TILE); }
      if (empty(c + 1, r)) { g.fillStyle = 'rgba(15,6,40,.3)'; g.fillRect(x + TILE - 2, y, 2, TILE); }
    }
    g.restore();
  }

  // olive moss clumps with drips, and the odd vine, like the sheets
  function drawMoss(g, c, r, solid) {
    const x = c * TILE, y = r * TILE;
    g.fillStyle = '#5d7d22'; g.fillRect(x, y - 0.5, TILE, 4.5);
    for (let i = 0; i < 5; i++) {
      const n = hash(c * 5 + i, r), cx = x + 2 + i * 5 + n * 2;
      g.fillStyle = '#7d9e2c'; g.beginPath(); g.arc(cx, y, 2.2 + n * 1.8, Math.PI, 0); g.fill();
      g.fillStyle = '#a9c94a'; g.beginPath(); g.arc(cx - 0.6, y - 0.8, 1 + n * 0.8, Math.PI, 0); g.fill();
    }
    for (let i = 0; i < 2; i++) {
      const n = hash(c + i * 11, r * 3);
      if (n < 0.55) {
        const dx = x + 3 + n * 34, len = 3 + n * 7;
        g.fillStyle = '#5d7d22'; rr(g, dx, y + 2, 2.6, len, 1.3); g.fill();
        g.fillStyle = '#7d9e2c'; g.beginPath(); g.arc(dx + 1.3, y + 2 + len, 1.5, 0, 7); g.fill();
      }
    }
    if (hash(c * 7, r * 5) < 0.12) {       // yellow-green leaf tuft
      const tx = x + 4 + hash(c, r * 2) * 16;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.45;
        g.save(); g.translate(tx, y + 1); g.rotate(a + Math.PI / 2);
        g.fillStyle = k % 2 ? '#c6d43e' : '#9fbf2e';
        g.beginPath(); g.ellipse(0, -6, 2.2, 6, 0, 0, 7); g.fill();
        g.restore();
      }
    }
    if (hash(c, r * 13) < 0.13 && solid(c, r + 1)) {
      const len = 16 + hash(c, r) * 24, vx = x + 6 + hash(r, c) * 12;
      g.strokeStyle = '#4f6d1c'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(vx, y + 2); g.quadraticCurveTo(vx + 5, y + len * 0.5, vx + 1, y + len); g.stroke();
      for (let i = 1; i <= 4; i++) {
        const ly = y + (len * i) / 4.4, lx = vx + 2.5 * Math.sin(i * 2) + (i % 2 ? 3.2 : -3.2);
        g.fillStyle = i % 2 ? '#c6c440' : '#9fb43a';
        g.beginPath(); g.ellipse(lx, ly, 3.2, 2, i % 2 ? 0.6 : -0.6, 0, 7); g.fill();
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

  function bannerVec(g, cx, y) {
    g.fillStyle = '#5b4a2e'; g.fillRect(cx - 11, y + 2, 22, 3);
    g.fillStyle = '#7a4fd0';
    g.beginPath(); g.moveTo(cx - 9, y + 5); g.lineTo(cx + 9, y + 5); g.lineTo(cx + 9, y + 34); g.lineTo(cx, y + 28); g.lineTo(cx - 9, y + 34); g.closePath(); g.fill();
    g.fillStyle = '#9b74ee'; g.fillRect(cx - 9, y + 5, 18, 3);
    g.strokeStyle = '#d6a64a'; g.lineWidth = 1; g.strokeRect(cx - 7, y + 9, 14, 15);
    ghostIcon(g, cx, y + 16, 9, '#efe6ff');
  }

  function graveVec(g, cx, by) {
    g.fillStyle = '#6d5f96';
    g.beginPath(); g.moveTo(cx - 9, by); g.lineTo(cx - 9, by - 14); g.arc(cx, by - 14, 9, Math.PI, 0); g.lineTo(cx + 9, by); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(cx - 8, by - 14, 2, 13);
    ghostIcon(g, cx, by - 13, 8, '#a99ad6');
    g.fillStyle = C.moss; g.fillRect(cx - 10, by - 2, 20, 2);
  }

  // ---------- dynamic pieces ----------
  function lanternVec(c, cx, y, t, i) {
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

  function candlesVec(c, cx, by, t, i) {
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
      if (w.grid[r][c] !== '.' || !solid(c, r - 1) || hash(c * 7, r * 3) > 0.045) continue;
      let room = 0;
      while (room < 3 && !solid(c, r + room)) room++;
      if (room < 2) continue;
      list.push({ x: c * TILE + 4 + hash(c, r) * 16, y: r * TILE, len: 14 + hash(r, c) * (room * TILE - 40), ph: hash(c, r + 9) * 6 });
    }
    return (w._spiders = list);
  }

  function spiderVec(c, s, t) {
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

  function batVec(c, x, y, t, s) {
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
      // soft glow above the surface (one rounded pool of light per tile, overlapping)
      const gc = kind === 'lava' ? '255,130,40' : kind === 'void' ? '140,100,255' : '150,255,90';
      c.save(); c.globalCompositeOperation = 'lighter';
      c.translate(x + TILE / 2, y + 6); c.scale(1, 0.6);
      const gl = c.createRadialGradient(0, 0, 2, 0, 0, 26);
      gl.addColorStop(0, `rgba(${gc},${kind === 'void' ? 0.16 : 0.22})`); gl.addColorStop(1, `rgba(${gc},0)`);
      c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 26, 0, 7); c.fill();
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

  function doorVec(c, d, role, t) {
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
    if (boy) { if (!sprite(c, ['wrapped', 'lollipop', 'corn'][variant % 3], cx, cy, 0, 21, { rot: Math.sin((t + i) * 2.4) * 0.15 })) [candy, lollipop, candyCorn][variant % 3](c, cx, cy, t + i); }
    else if (!sprite(c, 'pumpkin', cx, cy, 0, 22, { rot: Math.sin((t + i) * 2) * 0.08 })) pumpkin(c, cx, cy, t + i);
    if (Math.sin(t * 2 + i * 1.7) > 0.92) {
      c.fillStyle = '#fff';
      const s = 2.5; c.beginPath(); c.moveTo(cx + 6, cy - 9 - s); c.lineTo(cx + 6.6, cy - 9); c.lineTo(cx + 6, cy - 9 + s); c.lineTo(cx + 5.4, cy - 9); c.fill();
    }
  }

  function buttonVec(c, b, i) {
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

  function leverVec(c, l) {
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
      // iron portcullis that slides up into the ceiling
      const gx = pl.x - 3, gw = pl.w + 6;
      c.fillStyle = 'rgba(15,6,40,.35)'; c.fillRect(gx + 2, pl.y, gw, v);
      for (const bx of [gx + 2, gx + gw / 2, gx + gw - 2]) {
        const bar = c.createLinearGradient(bx - 2, 0, bx + 2, 0);
        bar.addColorStop(0, '#5c4f86'); bar.addColorStop(0.5, '#3a2f5e'); bar.addColorStop(1, '#231b3d');
        c.fillStyle = bar; c.fillRect(bx - 2, pl.y, 4, v);
        if (v > 6) { c.fillStyle = '#7a6aae'; c.beginPath(); c.moveTo(bx - 2.5, pl.y + v); c.lineTo(bx, pl.y + v + 5); c.lineTo(bx + 2.5, pl.y + v); c.fill(); }
      }
      for (let y = pl.y + 10; y < pl.y + v - 4; y += 22) {
        c.fillStyle = '#4a3e74'; rr(c, gx - 1, y, gw + 2, 4, 1.5); c.fill();
        c.fillStyle = '#8f80c4';
        for (const bx of [gx + 2, gx + gw / 2, gx + gw - 2]) { c.beginPath(); c.arc(bx, y + 2, 1.2, 0, 7); c.fill(); }
      }
    } else if (ready('swing') && ready('chain')) {
      for (const cx of [pl.x + 13, pl.x + pl.w - 13]) {
        const im = SPR.chain, cw = 7, chh = cw * im.naturalHeight / im.naturalWidth;
        c.save(); c.beginPath(); c.rect(cx - 6, TILE, 12, v - TILE); c.clip();
        for (let y = v - 4; y > TILE - chh; y -= chh - 1) c.drawImage(im, cx - cw / 2, y - chh, cw, chh);
        c.restore();
      }
      c.drawImage(SPR.swing, pl.x - 3, v - 8, pl.w + 6, 24);
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
  // The boy uses sprites cut from the GhostTown design sheets (assets/boy-*.png).
  // Until they load, the hand-drawn version below stands in.
  const BOY_IMG = {};
  const BOY_H = { idle: 49.4, run: 44.4, jump: 47.8 };      // height in game pixels
  const BOY_DX = { idle: 1, run: -2, jump: 0 };           // nudge so the body sits over the hitbox
  if (typeof Image !== 'undefined') {
    for (const k of Object.keys(BOY_H)) { const im = new Image(); im.src = 'assets/boy-' + k + '.png'; BOY_IMG[k] = im; }
  }

  function drawBoy(c, p, t, isMe) {
    const f = p.facing || 1;
    const cx = p.x + PW / 2, by = p.y + PH;
    if (!p.alive) return poof(c, cx, by - 16, t, '170,160,200');
    const moving = Math.abs(p.vx) > 25 && p.grounded;
    const frame = !p.grounded ? 'jump' : moving ? 'run' : 'idle';
    const img = BOY_IMG[frame];
    if (!img || !img.complete || !img.naturalWidth) return drawBoyVector(c, p, t, isMe);
    if (p.grounded) { c.fillStyle = 'rgba(10,5,30,.32)'; c.beginPath(); c.ellipse(cx, by, 9.5, 2.3, 0, 0, 7); c.fill(); }
    let h = BOY_H[frame], w = (h * img.naturalWidth) / img.naturalHeight;
    let bob = 0, sy = 1, tilt = 0;
    if (frame === 'run') { const ph = t * 15; bob = -Math.abs(Math.sin(ph)) * 2.2; sy = 1 + Math.sin(ph * 2) * 0.03; tilt = 0.04; }
    else if (frame === 'idle') sy = 1 + Math.sin(t * 2.6) * 0.012;
    else tilt = p.vy < 0 ? -0.05 : 0.04;
    c.save();
    c.translate(cx, by + bob); c.scale(f, 1); c.rotate(tilt);
    const x0 = -w / 2 + BOY_DX[frame], hh = h * sy;
    if (frame === 'run') {
      // legs swing below the hip while the upper body stays put -> a real stride
      const hip = hh * 0.6, sk = Math.sin(t * 15) * 0.42;
      const srcHip = img.naturalHeight * 0.6;
      c.save();
      c.translate(0, -hh + hip); c.transform(1, 0, sk, 1, 0, 0);
      c.drawImage(img, 0, srcHip - 1, img.naturalWidth, img.naturalHeight - srcHip + 1, x0, -1, w, hh - hip + 1);
      c.restore();
      c.drawImage(img, 0, 0, img.naturalWidth, srcHip + 1, x0, -hh, w, hip + 1);
    } else {
      c.drawImage(img, x0, -hh, w, hh);
    }
    c.restore();
    // a little dust when running, like the sheet
    if (frame === 'run' && Math.sin(t * 15) > 0.6) {
      c.fillStyle = 'rgba(200,180,255,.25)';
      c.beginPath(); c.arc(cx - f * 10, by - 2, 2.6, 0, 7); c.arc(cx - f * 13.5, by - 3.5, 1.8, 0, 7); c.fill();
    }
    if (isMe) marker(c, cx, p.y - 22, t, C.boy);
  }

  function drawBoyVector(c, p, t, isMe) {
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

  function drawGhostVec(c, p, t, isMe) {
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


  // ---------- sprites cut from the GhostTown design sheets (assets/) ----------
  const SPR = {};
  const SPR_NAMES = ['ghost-idle', 'ghost-float', 'ghost-excited', 'door-boy', 'door-ghost', 'lantern', 'banner', 'candles', 'grave',
    'btn-blue', 'btn-orange', 'lever', 'swing', 'chain', 'lollipop', 'wrapped', 'corn', 'pumpkin', 'spider', 'bat'];
  if (typeof Image !== 'undefined') for (const n of SPR_NAMES) { const im = new Image(); im.src = 'assets/' + n + '.png'; SPR[n] = im; }
  const ready = (n) => SPR[n] && SPR[n].complete && SPR[n].naturalWidth > 0;
  // draw sprite n centred at (cx, cy) with width w or height h (the other from aspect); returns false if not loaded
  function sprite(c, n, cx, cy, w, h, o) {
    if (!ready(n)) return false;
    const im = SPR[n];
    if (!w) w = h * im.naturalWidth / im.naturalHeight;
    if (!h) h = w * im.naturalHeight / im.naturalWidth;
    o = o || {};
    c.save(); c.translate(cx, cy);
    if (o.rot) c.rotate(o.rot);
    if (o.flip) c.scale(-1, 1);
    if (o.sy) c.scale(1, o.sy);
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    c.drawImage(im, -w / 2, o.anchor === 'bottom' ? -h : o.anchor === 'top' ? 0 : -h / 2, w, h);
    c.restore();
    return true;
  }

  function lightPool(c, x, y, r, rgb, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    c.restore();
  }

  function lantern(c, cx, y, t, i) {
    if (!ready('lantern')) return lanternVec(c, cx, y, t, i);
    const fl = 0.9 + Math.sin(t * 9 + i * 3) * 0.06 + Math.sin(t * 23 + i) * 0.04;
    lightPool(c, cx + 2, y + 20, 62 * fl, '255,180,90', 0.26);
    sprite(c, 'lantern', cx, y - 2, 0, 31, { anchor: 'top' });
  }
  function candles(c, cx, by, t, i) {
    if (!ready('candles')) return candlesVec(c, cx, by, t, i);
    const fl = 0.9 + Math.sin(t * 11 + i) * 0.08;
    lightPool(c, cx, by - 16, 34 * fl, '255,200,110', 0.22);
    sprite(c, 'candles', cx, by + 1, 0, 23, { anchor: 'bottom' });
  }
  function banner(c, cx, y) { if (!sprite(c, 'banner', cx, y, 0, 36, { anchor: 'top' })) bannerVec(c, cx, y); }
  function grave(c, cx, by) { if (!sprite(c, 'grave', cx, by + 1, 0, 27, { anchor: 'bottom' })) graveVec(c, cx, by); }

  function spider(c, s, t) {
    if (!ready('spider')) return spiderVec(c, s, t);
    const len = s.len + Math.sin(t * 0.9 + s.ph) * 7;
    c.strokeStyle = 'rgba(230,225,255,.35)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x, s.y + len - 4); c.stroke();
    sprite(c, 'spider', s.x, s.y + len + 2, 21, 0, { rot: Math.sin(t * 1.3 + s.ph) * 0.12 });
  }
  function bat(c, x, y, t, s) {
    if (!ready('bat')) return batVec(c, x, y, t, s);
    sprite(c, 'bat', x, y, 30, 0, { sy: 0.65 + 0.35 * Math.abs(Math.sin(t * 9 + s)) });
  }

  function door(c, d, role, t) {
    const n = role === 'boy' ? 'door-boy' : 'door-ghost';
    if (!ready(n)) return doorVec(c, d, role, t);
    const cx = d.x + d.w / 2, bot = d.y + d.h + 1;
    const rgb = role === 'boy' ? '255,170,60' : '90,180,255';
    lightPool(c, cx, bot - 26, d.open ? 70 : 42, rgb, d.open ? 0.4 : 0.16 + 0.04 * Math.sin(t * 2));
    sprite(c, n, cx, bot, 0, 58, { anchor: 'bottom' });
    if (d.open) {
      c.save(); c.globalCompositeOperation = 'lighter';
      sprite(c, n, cx, bot, 0, 58, { anchor: 'bottom', alpha: 0.35 + 0.1 * Math.sin(t * 6) });
      c.restore();
    }
  }

  // glowing pressure plate, mostly sunk into the floor like the original game's buttons
  function button(c, b, i) {
    const n = i % 2 ? 'btn-orange' : 'btn-blue';
    if (!ready(n)) return buttonVec(c, b, i);
    const floor = b.y + 6, w = 28, h = w * SPR[n].naturalHeight / SPR[n].naturalWidth;
    if (b.pressed) lightPool(c, b.x + b.w / 2, floor - 2, 30, i % 2 ? '255,170,60' : '90,190,255', 0.45);
    c.save(); c.beginPath(); c.rect(b.x - 10, floor - 30, b.w + 20, 31); c.clip();
    c.drawImage(SPR[n], b.x + b.w / 2 - w / 2, floor - (b.pressed ? 5 : 9), w, h);
    c.restore();
  }

  function lever(c, l) {
    if (!ready('lever')) return leverVec(c, l);
    sprite(c, 'lever', l.x + l.w / 2, l.y + l.h + 1, 0, 27, { anchor: 'bottom', flip: !l.on });
  }

  // The ghost, from the sheets: idle when still, float when moving, excited at the door
  function drawGhost(c, p, t, isMe) {
    const moving = Math.abs(p.vx) > 25;
    const n = p.inDoor ? 'ghost-excited' : moving || !p.grounded ? 'ghost-float' : 'ghost-idle';
    if (!ready(n)) return drawGhostVec(c, p, t, isMe);
    const cx = p.x + PW / 2;
    if (!p.alive) return poof(c, cx, p.y + 15, t, '200,220,255');
    const f = p.facing || 1;
    const bob = Math.sin(t * 3) * 1.8;
    if (p.grounded) { c.fillStyle = 'rgba(10,5,30,.22)'; c.beginPath(); c.ellipse(cx, p.y + PH, 9, 2, 0, 0, 7); c.fill(); }
    lightPool(c, cx, p.y + 16 + bob, 30, '170,160,255', 0.2);
    // sized so his body is ~73% of Andy's height and floats a little off the floor (matches the key art)
    const GH = { 'ghost-idle': [43.2, 3.8], 'ghost-float': [41.1, 4.0], 'ghost-excited': [36.5, 5.0] }[n];
    sprite(c, n, cx - f * 2, p.y + PH - 1 - GH[1] + bob, 0, GH[0], { anchor: 'bottom', flip: f < 0, rot: moving ? f * 0.06 : 0 });
    if (moving) for (let i = 0; i < 3; i++) {
      const a = Math.sin(t * 6 + i * 2);
      if (a < 0) continue;
      c.fillStyle = `rgba(210,225,255,${a * 0.9})`;
      const sx = cx - f * (22 + i * 6), sy = p.y + 18 + Math.sin(t * 5 + i) * 5 + bob;
      c.beginPath(); c.moveTo(sx, sy - 2.5); c.lineTo(sx + 0.7, sy); c.lineTo(sx, sy + 2.5); c.lineTo(sx - 0.7, sy); c.fill();
    }
    if (isMe) marker(c, cx, p.y - 21, t, C.ghost);
  }

  // ---------- frame ----------
  function drawFrame(ctx, w, staticLayer, t, opts) {
    const W = w.cols * TILE, H = w.rows * TILE;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(staticLayer, 0, 0, W, H);
    // bats drift across the moonlit top
    for (let i = 0; i < 2; i++) {
      const span = W + 120;
      const x = ((t * (22 + i * 8) + i * 400) % span) - 60;
      bat(ctx, x, 46 + i * 34 + Math.sin(t * 1.5 + i) * 10, t, i);
    }
    const d = w.decor || {};
    for (let i = 0; i < 5; i++) {
      const sp = 16 + hash(i, 4) * 10;
      const y = ((t * sp + hash(i, 1) * H) % (H + 40)) - 20;
      const x = hash(i, 2) * W + Math.sin(t * 0.8 + i * 2) * 26;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.3 + i) * 1.2);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = ['#e8742a', '#c9461f', '#f2a03d'][i % 3];
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(4, -1, 0, 5); ctx.quadraticCurveTo(-4, -1, 0, -4); ctx.fill();
      ctx.restore();
    }
    (d.banners || []).forEach(([c, r]) => banner(ctx, c * TILE + 12, r * TILE));
    (d.graves || []).forEach(([c, r]) => grave(ctx, c * TILE + 12, (r + 1) * TILE));
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

    // full-screen title backdrop: the same painted night sky, a few lanterns-worth of glow and drifting bats
  function drawBackdrop(cv, t) {
    const c = cv.getContext('2d'), W = 816, H = 600, res = cv.width / W;
    if (!cv._sky) {
      const k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height;
      const g = k.getContext('2d'); g.scale(res, res); drawSky(g, W, H); cv._sky = k;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(cv._sky, 0, 0);
    c.setTransform(res, 0, 0, res, 0, 0);
    for (let i = 0; i < 3; i++) bat(c, ((t * (16 + i * 7) + i * 300) % (W + 120)) - 60, 70 + i * 40 + Math.sin(t * 1.2 + i) * 12, t, i);
    for (let i = 0; i < 7; i++) {
      const y = ((t * (14 + hash(i, 4) * 10) + hash(i, 1) * H) % (H + 40)) - 20;
      const x = hash(i, 2) * W + Math.sin(t * 0.8 + i * 2) * 26;
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * 1.3 + i) * 1.2); c.globalAlpha = 0.7;
      c.fillStyle = ['#e8742a', '#c9461f', '#f2a03d'][i % 3];
      c.beginPath(); c.moveTo(0, -4); c.quadraticCurveTo(4, -1, 0, 5); c.quadraticCurveTo(-4, -1, 0, -4); c.fill();
      c.restore();
    }
  }

  window.Art = { buildStatic, drawFrame, drawPlayer, drawBackdrop, candy, lollipop, candyCorn, pumpkin, sprites: SPR };
})();
