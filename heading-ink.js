// Centerlines follow the site's Patrick Hand letters, in 100px font units.
// Each | lifts the pen for a crossbar, a dot, or a second stroke.
(() => {
  const strokes = {
    P: 'M10 -5 L9 -61 Q42 -68 43 -50 Q45 -29 11 -34',
    r: 'M8 -43 Q13 -31 12 -5 M12 -28 Q16 -46 33 -42',
    o: 'M20 -43 C0 -42 3 -3 21 -4 C40 -3 37 -43 20 -43',
    j: 'M12 -43 Q18 35 -5 19|M12 -59 l.3 .5',
    e: 'M7 -26 Q34 -23 30 -37 C26 -50 5 -45 6 -26 Q7 10 34 -12',
    c: 'M34 -40 C-4 -57 -5 13 34 -10',
    t: 'M16 -68 Q16 -29 19 -4|M5 -43 h27',
    b: 'M8 -68 L10 -5 C46 1 40 -46 10 -41',
    a: 'M33 -40 C1 -63 -5 11 27 -7 L33 -20|M32 -42 L34 -3',
    k: 'M8 -68 L10 -4|M33 -42 Q25 -29 12 -21 M24 -28 Q34 -18 37 -5',
    y: 'M6 -42 L22 -4|M36 -42 L14 27',
    E: 'M10 -61 L11 -4|M10 -61 Q26 -58 38 -62|M10 -34 h23|M10 -4 h27',
    x: 'M7 -42 L37 -4|M36 -42 L7 -4',
    p: 'M8 -42 L8 27|M9 -32 C30 -62 49 -23 32 -8 Q20 1 9 -8',
    i: 'M10 -42 L11 -4|M10 -60 l.2 .5',
    n: 'M8 -42 L9 -4 M10 -32 Q34 -65 36 -22 L36 -4',
    '&': 'M49 -5 C30 -39 9 -56 27 -62 C39 -67 47 -46 26 -36 C-8 -20 12 9 30 -5 Q40 -11 49 -27',
    d: 'M31 -68 L33 -4|M31 -41 C0 -55 -4 5 24 -5 Q30 -9 32 -19',
    u: 'M7 -42 Q3 20 31 -17 M31 -42 Q31 -21 34 -4',
    S: 'M39 -58 C10 -73 -5 -44 16 -36 Q42 -31 39 -19 Q36 4 7 -9',
    h: 'M7 -68 L10 -4 M10 -33 Q36 -57 35 -23 L34 -4',
    '.': 'M9 -6 l.4 .4'
  };
  const glyphs = new Map();
  function glyphFor(letter) {
    if (!glyphs.has(letter)) {
      const passes = strokes[letter].split('|').map(d => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        const length = path.getTotalLength();
        return { shape: new Path2D(d), length, duration: Math.max(30, length * .66) };
      });
      glyphs.set(letter, passes);
    }
    return glyphs.get(letter);
  }

  // Each canvas sits on its own word, so the browser still wraps and centers the
  // original heading. All pen and font measurements use the same 100px em.
  function makeWord(label, measure, layout, start) {
    const text = label.textContent;
    const width = measure.measureText(text).width + layout.tracking * text.length;
    const pad = 8;
    let time = start;
    const letters = [...text].map((letter, i) => {
      const x = measure.measureText(text.slice(0, i)).width + i * layout.tracking;
      const passes = glyphFor(letter).map(pass => {
        const at = time;
        time += pass.duration;
        return { ...pass, at };
      });
      const end = time;
      time += 12; // Lift the pen between letters.
      return {letter, x, passes, end};
    });
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.ceil((width + 2 * pad) * layout.scale);
    canvas.height = Math.ceil(layout.height * layout.scale);
    canvas.style.width = (width + 2 * pad) / 100 + 'em';
    canvas.style.height = layout.height / 100 + 'em';
    const ctx = canvas.getContext('2d');
    const type = document.createElement('canvas');
    type.width = canvas.width;
    type.height = canvas.height;
    const glyphInk = type.getContext('2d');
    if (!ctx || !glyphInk) throw new Error('Canvas unavailable');
    glyphInk.scale(layout.scale, layout.scale);
    glyphInk.font = measure.font;
    let inkColor;

    function draw(at, color) {
      // Use the font itself as the ink. The moving pen reveals it on this
      // visible canvas instead of animating an SVG mask in a separate layer.
      if (color !== inkColor) {
        glyphInk.clearRect(0, 0, width + 2 * pad, layout.height);
        glyphInk.fillStyle = inkColor = color;
        for (const unit of letters) glyphInk.fillText(unit.letter, pad + unit.x, layout.baseline);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(layout.scale, layout.scale);
      const i = letters.findIndex(unit => at < unit.end + 12);
      const unit = letters[i];
      if (!unit) return;
      const left = pad + unit.x;
      if (i) ctx.fillRect(0, 0, left, layout.height);
      ctx.save();
      ctx.translate(left, layout.baseline);
      ctx.lineWidth = 18;
      ctx.lineCap = ctx.lineJoin = 'round';
      for (const pass of unit.passes) {
        if (at <= pass.at) break;
        const progress = Math.min(1, (at - pass.at) / pass.duration);
        ctx.setLineDash(progress === 1 ? [] : [progress * pass.length, pass.length + 1]);
        ctx.stroke(pass.shape);
      }
      ctx.restore();
      // Blend the last slivers of each glyph into place as the pen lifts.
      const fill = Math.max(0, Math.min(1, (at - unit.end + 12) / 24));
      if (fill) {
        ctx.globalAlpha = fill;
        ctx.fillRect(left, 0, (letters[i + 1]?.x ?? width + pad) - unit.x, layout.height);
        ctx.globalAlpha = 1;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.drawImage(type, 0, 0);
    }
    label.append(canvas);
    return {label, start, end: time, draw};
  }

  function prepare(heading, measure) {
    const stop = heading.closest('.street-stop');
    if (!stop || stop.dataset.inkArrived === 'complete') return;
    const text = heading.textContent;
    const words = text.trim().split(/\s+/);
    if (words.some(word => [...word].some(letter => !strokes[letter]))) return;
    const labels = words.map(word => {
      const label = document.createElement('span');
      label.className = 'ink-word';
      label.textContent = word;
      return label;
    });
    const fragment = document.createDocumentFragment();
    labels.forEach((label, i) => { if (i) fragment.append(' '); fragment.append(label); });
    heading.replaceChildren(fragment);
    heading.classList.add('ink-prepared');

    const watch = new MutationObserver(start);
    function start() {
      if (!stop.dataset.inkArrived) return;
      watch.disconnect();
      if (stop.dataset.inkArrived !== 'playing') return;
      const style = getComputedStyle(heading);
      const size = parseFloat(style.fontSize);
      const metrics = measure.measureText('Hg');
      const height = parseFloat(style.lineHeight) * 100 / size + 70;
      const layout = {
        height, baseline:(height + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2,
        tracking:(parseFloat(style.letterSpacing) || 0) * 100 / size,
        scale:size / 100 * Math.min(devicePixelRatio || 1, 3)
      };
      let time = 0;
      let pictures;
      try {
        pictures = labels.map(label => {
          const part = makeWord(label, measure, layout, time);
          time = part.end + 30;
          return part;
        });
      } catch {
        heading.replaceChildren(text);
        heading.classList.remove('ink-prepared');
        return;
      }
      let word = 0;
      const began = performance.now();
      let dark = document.body.classList.contains('dark');
      let color = style.color;
      function paint(now) {
        if (stop.dataset.inkArrived !== 'playing') return;
        const at = now - began;
        while (word < pictures.length && at >= pictures[word].end) {
          pictures[word++].label.classList.add('ink-written');
        }
        if (word === pictures.length) {
          heading.dispatchEvent(new Event('street-title-written', {bubbles:true}));
          return;
        }
        const night = document.body.classList.contains('dark');
        if (night !== dark) { dark = night; color = getComputedStyle(heading).color; }
        const active = pictures[word];
        if (at >= active.start) active.draw(at, color);
        requestAnimationFrame(paint);
      }
      requestAnimationFrame(paint);
    }
    watch.observe(stop, {attributes:true, attributeFilter:['data-ink-arrived']});
    start();
  }

  if (!document.fonts || typeof Path2D === 'undefined' ||
      !document.documentElement.hasAttribute('data-street-navigation-ready')) return;
  const fontRequestedAt = performance.now();
  document.fonts.load('100px "Patrick Hand"').then(fonts => {
    if (!fonts.length) return;
    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return;
    measure.font = '100px "Patrick Hand"';
    const metrics = measure.measureText('Hg');
    if (![metrics.fontBoundingBoxAscent, metrics.fontBoundingBoxDescent].every(Number.isFinite)) return;
    const fontWasLate = performance.now() - fontRequestedAt > 220;
    for (const heading of document.querySelectorAll('[data-write-title]')) {
      // On a slow connection, leave a heading the visitor has read in place.
      // Later streets can still play their full first arrival.
      if (fontWasLate && heading.closest('[data-ink-arrived]')) continue;
      prepare(heading, measure);
    }
  }).catch(() => {});
})();
