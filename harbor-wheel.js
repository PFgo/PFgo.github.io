// Coordinates are calibrated against the 2172 × 724 Elliott Bay watercolor.
(() => {
  const wheel = document.querySelector('.harbor-wheel');
  if (!wheel) return;
  const canvas = wheel.querySelector('canvas');
  let context;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = wheel.closest('.city-stage');
  const period = 122000;
  const count = 28;
  const tau = Math.PI * 2;
  const projection = .111;
  const pivot = {x: 705, y: 286};
  const base = new URL('assets/', document.baseURI);
  let phase = 0, request = 0, timer = 0, previous = 0;
  let ready = false, loading = false;
  const materials = {};
  const rings = new Map();
  const load = name => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { materials[name] = image; resolve(); };
    image.onerror = reject;
    image.src = new URL('wheel-' + name + '.webp', base);
  });

  // A slightly oblique projection matches the original off-center spindle.
  // Keeping cabins upright in screen space separates gravity from wheel angle.
  function project(angle, radius = 1) {
    const u = radius * Math.cos(angle), v = radius * Math.sin(angle);
    const depth = 1 + projection * u;
    return {x: pivot.x + 193 * u / depth, y: pivot.y + 213 * v / depth, depth};
  }
  function ring(radius, color, width) {
    if (!rings.has(radius)) {
      const outline = new Path2D();
      for (let i = 0; i <= 112; i++) {
        const point = project(i * tau / 112, radius);
        if (i === 0) outline.moveTo(point.x, point.y);
        else outline.lineTo(point.x, point.y);
      }
      outline.closePath();
      rings.set(radius, outline);
    }
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke(rings.get(radius));
  }
  function beam(to, width) {
    const dx = to.x - pivot.x, dy = to.y - pivot.y;
    context.save();
    context.translate(pivot.x, pivot.y);
    context.rotate(Math.atan2(dy,dx));
    context.drawImage(materials.spoke, 0, -width/2, Math.hypot(dx,dy), width);
    context.restore();
  }
  function paint() {
    const sx = canvas.width / 450, sy = canvas.height / 475;
    context.setTransform(sx,0,0,sy,-454*sx,-52*sy);
    context.clearRect(454,52,450,475);
    ring(.63,'rgba(89,83,76,.63)',1.45);
    ring(.624,'rgba(238,228,207,.84)',1.15);
    ring(.41,'rgba(115,101,87,.56)',1.3);
    for (let i=0; i<count; i++) {
      const angle = i*tau/count + phase;
      beam(project(angle,.989), 4.7);
      const anchor = project(angle,.969);
      const w = 34.5 / anchor.depth, h = w * (36/37);
      context.drawImage(materials.cabin,anchor.x-.61*w,anchor.y-.06*h,w,h);
    }
    // The mass of the outer rim, pale face, and dark pencil edges.
    ring(1,'#514a48',7.4);
    ring(1,'#c3b49a',5.55);
    ring(.998,'#f0e5d0',3.55);
    ring(.984,'rgba(96,82,72,.86)',1);
    context.beginPath();
    for (let i=0; i<count; i++) {
      const p = project(i*tau/count+phase);
      context.moveTo(p.x+.9,p.y);
      context.arc(p.x,p.y,.9,0,tau);
    }
    context.fillStyle='rgba(96,86,74,.76)';
    context.fill();
    context.drawImage(materials.foreground,454,52,450,475);
  }
  function active() {
    return !document.hidden && !reduced.matches &&
      !stage?.hasAttribute('data-street-paused') && !wheel.hasAttribute('data-out-of-view');
  }
  function tick(time) {
    request = 0;
    if (!active()) { previous=0; return; }
    if (previous) phase = (phase + Math.min(250, time-previous) * tau / period) % tau;
    previous = time;
    paint();
    // The wheel takes two minutes per turn. Wake just before its next frame.
    timer = setTimeout(() => { request=requestAnimationFrame(tick); }, 40);
  }
  function stop() {
    if (request) cancelAnimationFrame(request);
    clearTimeout(timer);
    request=0; timer=0; previous=0;
  }
  function sync() {
    stop();
    if (!active()) return;
    if (!ready) {
      if (loading) return;
      context ||= canvas.getContext('2d');
      if (!context) return;
      loading = true;
      Promise.all(['cabin','spoke','foreground'].filter(name=>!materials[name]).map(load))
        .then(() => { ready=true; sync(); })
        .catch(() => { loading=false; });
      return;
    }
    const bounds = wheel.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Match the displayed patch and available texture detail on each screen.
    const ratio = window.devicePixelRatio || 1;
    const width = Math.min(675, Math.max(1, Math.round(bounds.width*ratio)));
    const height = Math.min(713, Math.max(1, Math.round(bounds.height*ratio)));
    if (canvas.width !== width) canvas.width=width;
    if (canvas.height !== height) canvas.height=height;
    paint();
    canvas.hidden=false;
    const poster = wheel.querySelector('img');
    if (poster) poster.hidden=true;
    previous=performance.now();
    timer=setTimeout(() => { request=requestAnimationFrame(tick); }, 40);
  }
  const observer=new MutationObserver(sync);
  if (stage) observer.observe(stage,{attributes:true,attributeFilter:['data-street-paused']});
  observer.observe(wheel,{attributes:true,attributeFilter:['data-out-of-view']});
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(wheel);
  else window.addEventListener('resize', sync);
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',sync);
  sync();
})();
