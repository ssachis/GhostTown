/* GhostTown title vignette: real in-game characters, not a pasted poster. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const title = $('title'), canvas = $('title-fx');
  if (!title || !canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = 0;
  function draw(ms) {
    requestAnimationFrame(draw);
    if (title.hidden || !window.Art) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * Math.min(2, devicePixelRatio || 1)));
    const h = Math.max(1, Math.round(r.height * Math.min(2, devicePixelRatio || 1)));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const W = r.width, H = r.height;
    ctx.setTransform(w/W, 0, 0, h/H, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t = reduce ? 0 : ms/1000;
    // Subtle fireflies: deliberately sparse.
    for (let i=0;i<7;i++) {
      const x = W*(.13 + ((i*0.137)%0.77));
      const y = H*(.15 + ((i*0.23)%0.58)) + (reduce?0:Math.sin(t*.8+i)*4);
      ctx.fillStyle = 'rgba(255,221,141,'+(.32+.24*Math.sin(t+i))+')';
      ctx.beginPath(); ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();
    }
    // Draw both actual game characters, gently animated, at card scale.
    const scale = Math.min(W/240, H/150)*1.55;
    const groundY = H*.91;
    const roles = [
      {role:'boy', x:W*.39, size:1.05, phase:0},
      {role:'ghost',x:W*.64,size:.98,phase:1.4}
    ];
    roles.forEach(({role,x,size,phase})=>{
      const p={role,x:0,y:0,vx:0,facing:1,alive:true,grounded:true};
      ctx.save();
      ctx.translate(x,groundY+(reduce?0:Math.sin(t*1.7+phase)*2));
      ctx.scale(scale*size,scale*size);
      ctx.translate(-16,-32);
      Art.drawPlayer(ctx,p,t,false);
      ctx.restore();
    });
    last=ms;
  }
  requestAnimationFrame(draw);
  $('how-to').onclick = () => { $('howto').hidden = false; };
  $('howto-close').onclick = () => { $('howto').hidden = true; };
  $('howto').addEventListener('click', e => { if (e.target.id === 'howto') $('howto').hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape') $('howto').hidden = true; });
})();
