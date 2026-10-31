/*
 * GhostTown title screen: brings the key art to life with a canvas of light
 * and particles layered exactly over the image (fireflies, lantern flicker,
 * a buzzing neon sign, shimmering ghost and plates, a sparkling key, falling
 * leaves, passing bats) plus a gentle mouse parallax.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const title = $('title'), scene = $('title-scene'), img = $('title-art'), cv = $('title-fx');
  const ctx = cv.getContext('2d');
  const IW = 1672, IH = 941;   // key art size; points below are in its pixel space
  const P = {
    lantern: [382, 165], moon: [1100, 82], sign: [836, 225], key: [1513, 241],
    ghost: [598, 548], plateO: [1238, 488], plateB: [1014, 683], gate: [1553, 640],
  };

  let W = 0, H = 0, dpr = 1, s = 1, ox = 0, oy = 0;
  function layout() {
    const r = scene.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    s = Math.max(W / IW, H / IH);                 // same as object-fit: cover
    ox = (W - IW * s) * 0.5; oy = (H - IH * s) * 0.35; // same as object-position: center 35%
  }
  const X = (x) => ox + x * s, Y = (y) => oy + y * s;

  // ---------- particles ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const flies = Array.from({ length: 46 }, () => ({
    x: rnd(0, IW), y: rnd(IH * 0.25, IH), r: rnd(1.2, 2.6), sp: rnd(6, 16), ph: rnd(0, 7), tw: rnd(1.5, 3.5),
    warm: Math.random() < 0.55,
  }));
  const leaves = Array.from({ length: 10 }, () => newLeaf(true));
  function newLeaf(anywhere) {
    return { x: rnd(-50, IW), y: anywhere ? rnd(-IH, IH) : rnd(-80, -20), sp: rnd(28, 55), sw: rnd(20, 50), ph: rnd(0, 7), rot: rnd(0, 6), c: ['#ff8a1f', '#e8611c', '#ffb43c', '#c9461f'][Math.floor(rnd(0, 4))], r: rnd(5, 9) };
  }
  const bats = [];
  let nextBat = 2.5;

  function glow(x, y, r, rgb, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function star(x, y, r, a) {
    ctx.globalAlpha = a; ctx.fillStyle = '#fff8dc';
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.22, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.22, y); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y + r * 0.22); ctx.lineTo(x + r, y); ctx.lineTo(x, y - r * 0.22); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function maple(x, y, r, rot, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.62, a2 = a + 0.31;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
    }
    ctx.lineTo(0, r * 0.35); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  let last = 0, t = 0;
  function frame(now) {
    if (title.hidden) { requestAnimationFrame(frame); last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; t += dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const k = s;

    ctx.globalCompositeOperation = 'lighter';
    // neon sign: slow pulse with the odd flicker, like a real tube
    const flick = (Math.sin(t * 23) > 0.96 || (t % 7 > 6.85)) ? 0.35 : 1;
    const pulse = (0.55 + 0.25 * Math.sin(t * 1.6)) * flick;
    ctx.save(); ctx.translate(X(P.sign[0]), Y(P.sign[1])); ctx.scale(1.6, 1);
    glow(0, 0, 230 * k, '170,120,255', 0.22 * pulse); ctx.restore();
    // lantern flicker
    const lf = 0.75 + Math.sin(t * 9) * 0.1 + Math.sin(t * 23 + 1) * 0.08 + Math.sin(t * 3.1) * 0.07;
    glow(X(P.lantern[0]), Y(P.lantern[1]), 150 * k, '255,180,80', 0.32 * lf);
    glow(X(P.lantern[0]), Y(P.lantern[1]), 45 * k, '255,230,160', 0.35 * lf);
    // moon halo breathing
    glow(X(P.moon[0]), Y(P.moon[1]), 190 * k, '200,190,255', 0.12 + 0.05 * Math.sin(t * 0.8));
    // ghost shimmer
    glow(X(P.ghost[0]), Y(P.ghost[1]), 120 * k, '190,180,255', 0.16 + 0.08 * Math.sin(t * 2.2));
    // pressure plates and gate pulse
    glow(X(P.plateO[0]), Y(P.plateO[1]), 90 * k, '255,180,60', 0.18 + 0.12 * Math.sin(t * 2.5));
    glow(X(P.plateB[0]), Y(P.plateB[1]), 90 * k, '90,190,255', 0.18 + 0.12 * Math.sin(t * 2.5 + 2));
    glow(X(P.gate[0]), Y(P.gate[1]), 110 * k, '255,190,80', 0.08 + 0.06 * Math.sin(t * 1.7 + 1));
    glow(X(P.key[0]), Y(P.key[1]), 70 * k, '255,210,90', 0.2 + 0.1 * Math.sin(t * 3));

    // fireflies
    for (const f of flies) {
      f.y -= f.sp * dt * 0.6; f.x += Math.sin(t * 0.7 + f.ph) * 8 * dt;
      if (f.y < IH * 0.1) { f.y = IH + 10; f.x = rnd(0, IW); }
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * f.tw + f.ph));
      const x = X(f.x + Math.sin(t * 0.9 + f.ph) * 14), y = Y(f.y);
      glow(x, y, f.r * 5 * k + 4, f.warm ? '255,220,120' : '200,170,255', 0.35 * a);
      ctx.fillStyle = f.warm ? `rgba(255,240,180,${a})` : `rgba(230,215,255,${a})`;
      ctx.beginPath(); ctx.arc(x, y, f.r * Math.max(0.7, k), 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // sparkles: key, sign and around the ghost
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i / 3) % 1;
      star(X(P.key[0] + Math.cos(i * 2.1) * 34), Y(P.key[1] + Math.sin(i * 2.1) * 26), (4 + 5 * Math.sin(ph * Math.PI)) * k * 1.4, Math.sin(ph * Math.PI));
    }
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.6 + i / 4) % 1, a = i * 1.57 + t * 0.5;
      star(X(P.ghost[0] + Math.cos(a) * 95), Y(P.ghost[1] + Math.sin(a) * 75), (3 + 4 * Math.sin(ph * Math.PI)) * k * 1.4, 0.8 * Math.sin(ph * Math.PI));
    }
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.45 + i / 2) % 1;
      star(X(P.sign[0] - 220 + i * 470), Y(P.sign[1] - 80 + i * 150), (4 + 6 * Math.sin(ph * Math.PI)) * k * 1.4, Math.sin(ph * Math.PI));
    }

    // falling leaves
    for (const l of leaves) {
      l.y += l.sp * dt; l.ph += dt; l.rot += dt * 1.4;
      if (l.y > IH + 30) Object.assign(l, newLeaf(false));
      ctx.globalAlpha = 0.85;
      maple(X(l.x + Math.sin(l.ph * 1.3) * l.sw), Y(l.y), l.r * k * 1.3, l.rot, l.c);
      ctx.globalAlpha = 1;
    }

    // a bat now and then, using the game's bat sprite
    nextBat -= dt;
    if (nextBat <= 0) { bats.push({ x: -80, y: rnd(60, 300), sp: rnd(150, 230), ph: rnd(0, 6) }); nextBat = rnd(4, 8); }
    const batImg = window.Art && window.Art.sprites && window.Art.sprites.bat;
    for (let i = bats.length - 1; i >= 0; i--) {
      const b = bats[i];
      b.x += b.sp * dt;
      if (b.x > IW + 80) { bats.splice(i, 1); continue; }
      if (batImg && batImg.complete && batImg.naturalWidth) {
        const w = 70 * k, h = w * batImg.naturalHeight / batImg.naturalWidth * (0.6 + 0.4 * Math.abs(Math.sin(t * 10 + b.ph)));
        ctx.drawImage(batImg, X(b.x) - w / 2, Y(b.y + Math.sin(t * 2 + b.ph) * 20) - h / 2, w, h);
      }
    }
    requestAnimationFrame(frame);
  }

  // gentle parallax with the mouse (and a slow idle sway)
  let mx = 0, my = 0;
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });
  setInterval(() => {
    if (title.hidden) return;
    const tt = performance.now() / 1000;
    const x = -mx * 18 + Math.sin(tt * 0.25) * 4, y = -my * 12 + Math.cos(tt * 0.2) * 3;
    scene.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }, 100);

  addEventListener('resize', layout);
  if (img.complete) layout(); else img.addEventListener('load', layout);
  layout();
  requestAnimationFrame(frame);

  // how to play
  $('how-to').onclick = () => { $('howto').hidden = false; };
  $('howto-close').onclick = () => { $('howto').hidden = true; };
  $('howto').addEventListener('click', (e) => { if (e.target.id === 'howto') $('howto').hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') $('howto').hidden = true; });
})();
