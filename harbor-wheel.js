// Coordinates are calibrated against the 2172 × 724 Elliott Bay watercolor.
(() => {
  const wheel = document.querySelector('.harbor-wheel');
  if (!wheel) return;
  const canvas = wheel.querySelector('canvas');
  const poster = wheel.querySelector('img');
  const lamps = document.createElement('canvas');
  lamps.className = 'wheel-lights';
  lamps.hidden = true;
  wheel.append(lamps);
  let context, lampContext;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stage = wheel.closest('.city-stage');
  const rail = wheel.closest('#street-rail');
  const period = 122000;
  const count = 28;
  const tau = Math.PI * 2;
  const projection = .111;
  const pivot = {x: 705, y: 286};
  const base = new URL('assets/', document.baseURI);
  let phase = 0, request = 0, timer = 0, previous = 0;
  const loading = new Set();
  const materials = {};
  const rotorParts = ['cabin', 'spoke', 'foreground'];
  const rings = new Map();
  function haveMaterials(names, warm = false) {
    for (const name of names) {
      if (materials[name] || loading.has(name)) continue;
      loading.add(name);
      const image = new Image();
      if (warm) image.fetchPriority = 'low';
      image.decoding = 'async';
      image.onload = () => {
        materials[name] = image;
        loading.delete(name);
        if (warm && wheel.hasAttribute('data-out-of-view')) {
          const prepare = () => {
            if (!document.hidden && !reduced.matches && !rail?.hasAttribute('data-route-gliding')) {
              image.decode?.().catch(() => {});
            }
          };
          if (document.documentElement.hasAttribute('data-street-opening')) {
            document.addEventListener('street-opening-end', prepare, {once:true});
          } else prepare();
        }
        sync();
      };
      image.onerror = () => loading.delete(name);
      image.src = new URL('wheel-' + name + '.webp', base);
    }
    return names.every(name => materials[name]);
  }

  // A slightly oblique projection matches the original off-center spindle.
  // Keeping cabins upright in screen space separates gravity from wheel angle.
  function project(angle, radius = 1) {
    const u = radius * Math.cos(angle), v = radius * Math.sin(angle);
    const depth = 1 + projection * u;
    return {x: pivot.x + 193 * u / depth, y: pivot.y + 213 * v / depth, depth};
  }
  function ring(radius, color, width, target = context) {
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
    target.strokeStyle = color;
    target.lineWidth = width;
    target.stroke(rings.get(radius));
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
  function paintLights() {
    const sx = lamps.width / 450, sy = lamps.height / 475;
    lampContext.setTransform(sx,0,0,sy,-454*sx,-52*sy);
    lampContext.clearRect(454,52,450,475);
    ring(.998, 'rgba(138,208,255,.29)', 10, lampContext);
    ring(.998, 'rgba(205,234,255,.83)', 2.2, lampContext);
    const rim = new Path2D(), spokes = new Path2D(), strips = new Path2D();
    function bulb(path, angle, radius, size) {
      const p = project(angle, radius);
      const r = size / p.depth;
      path.moveTo(p.x + r, p.y);
      path.arc(p.x, p.y, r, 0, tau);
    }
    for (let i = 0; i < count; i++) {
      const angle = i * tau / count + phase;
      bulb(rim, angle, .998, 3.15);
      bulb(rim, angle + tau / (count * 2), .998, 1.9);
      if (i % 4 === 0) {
        const inner = project(angle, .16), outer = project(angle, .91);
        strips.moveTo(inner.x, inner.y);
        strips.lineTo(outer.x, outer.y);
      }
      if (i % 2 === 0) {
        for (const radius of [.24,.42,.60,.78,.91]) bulb(spokes, angle, radius, 2.3);
      }
    }
    lampContext.strokeStyle = 'rgba(178,220,255,.73)';
    lampContext.lineWidth = 1.75;
    lampContext.stroke(strips);
    lampContext.strokeStyle = 'rgba(129,200,255,.34)';
    lampContext.lineWidth = 4;
    lampContext.stroke(rim);
    lampContext.stroke(spokes);
    lampContext.fillStyle = '#fff3d7';
    lampContext.fill(rim);
    lampContext.fillStyle = '#d2edff';
    lampContext.fill(spokes);
    // Keep the footings, pier roof and lamppost in front of the lit rotor.
    lampContext.globalCompositeOperation = 'destination-out';
    lampContext.drawImage(materials.foreground,454,52,450,475);
    lampContext.globalCompositeOperation = 'source-over';
  }
  function active() {
    return !document.hidden && !reduced.matches &&
      !stage?.hasAttribute('data-street-paused') && !wheel.hasAttribute('data-out-of-view') &&
      !rail?.hasAttribute('data-route-gliding');
  }
  function tick(time) {
    request = 0;
    if (!active()) { previous=0; return; }
    if (previous) phase = (phase + Math.min(250, time-previous) * tau / period) % tau;
    previous = time;
    paint();
    if (!lamps.hidden) paintLights();
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
    if (document.hidden || wheel.hasAttribute('data-out-of-view') || rail?.hasAttribute('data-route-gliding')) return;
    const moving = active();
    const lit = document.body.hasAttribute('data-street-lit');
    if (!lit) lamps.hidden = true;
    const showRotor = (moving || !canvas.hidden) && haveMaterials(rotorParts);
    const showLights = lit && haveMaterials(['foreground']);
    if (!showRotor && !showLights) return;
    const bounds = wheel.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // Match the displayed patch and available texture detail on each screen.
    const ratio = window.devicePixelRatio || 1;
    const width = Math.min(675, Math.max(1, Math.round(bounds.width*ratio)));
    const height = Math.min(713, Math.max(1, Math.round(bounds.height*ratio)));
    if (showRotor && (context ||= canvas.getContext('2d'))) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      paint();
      canvas.hidden = false;
      if (poster) poster.hidden = true;
      if (moving) {
        previous=performance.now();
        timer=setTimeout(() => { request=requestAnimationFrame(tick); }, 40);
      }
    }
    // A cold or slow connection can deliver the lamp mask before the wheel underneath.
    const wheelVisible = !canvas.hidden || (poster?.complete && poster.naturalWidth > 0);
    if (showLights && wheelVisible && (lampContext ||= lamps.getContext('2d'))) {
      if (lamps.width !== width) lamps.width = width;
      if (lamps.height !== height) lamps.height = height;
      paintLights();
      lamps.hidden = false;
    }
  }
  poster?.addEventListener('load', sync, {once:true});
  const observer=new MutationObserver(sync);
  if (stage) observer.observe(stage,{attributes:true,attributeFilter:['data-street-paused']});
  if (rail) observer.observe(rail,{attributes:true,attributeFilter:['data-route-gliding']});
  observer.observe(wheel,{attributes:true,attributeFilter:['data-out-of-view']});
  observer.observe(document.body,{attributes:true,attributeFilter:['data-street-lit']});
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(wheel);
  else window.addEventListener('resize', sync);
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',sync);
  const warmWheel = () => {
    if (!reduced.matches) haveMaterials(rotorParts, true);
  };
  if (document.documentElement.hasAttribute('data-street-warm')) warmWheel();
  else document.addEventListener('street-art-warm', warmWheel, {once:true});
  sync();
})();
