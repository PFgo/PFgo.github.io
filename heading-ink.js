// Pen paths follow the printed shapes of each font at 100px.
// Each | lifts the pen for a crossbar, a dot, or a second stroke.
(() => {
  const patrickStrokes = {
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
  const caveatStrokes = {
    G: 'M54 -60 Q49 -78 34 -61 C22 -49 4 -1 22 1 C36 3 48 -18 50 -31 Q43 -34 33 -33',
    l: 'M30 -66 Q21 -43 14 -23 Q10 -10 11 -2',
    a: 'M38 -30 C32 -51 11 -25 12 -8 Q14 3 37 -27|M38 -33 Q32 -14 45 -7',
    d: 'M34 -30 Q22 -39 13 -16 Q7 -3 18 -7 Q34 -15 40 -37|M50 -65 C44 -44 29 -23 35 0',
    y: 'M16 -38 Q12 -5 22 -8 Q30 -10 38 -37|M38 -36 Q24 -1 16 11 Q5 23 -5 14',
    o: 'M29 -33 Q15 -30 12 -12 Q10 -1 21 -6 Q36 -15 36 -29 Q36 -42 27 -36',
    u: 'M22 -38 Q8 -8 15 -7 Q23 -4 39 -32|M39 -32 Q27 -9 36 -3',
    '’': 'M23 -66 Q31 -60 20 -47',
    r: 'M22 -41 L13 -5|M16 -20 Q26 -33 38 -33',
    e: 'M13 -22 Q30 -20 35 -32 Q35 -41 25 -36 C10 -30 6 -4 22 -7 Q28 -8 32 -12',
    h: 'M30 -66 Q24 -45 12 -7|M14 -14 Q32 -39 41 -31 C48 -28 34 -17 44 -8',
    '.': 'M14 -12 l-1 4'
  };
  const forcedColors = matchMedia('(forced-colors: active)');
  const glyphs = new Map();
  function glyphFor(drawing) {
    if (!glyphs.has(drawing)) {
      const passes = drawing.split('|').map(d => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        const length = path.getTotalLength();
        return { shape: new Path2D(d), length, duration: Math.max(30, length * .66) };
      });
      glyphs.set(drawing, passes);
    }
    return glyphs.get(drawing);
  }

  // Each canvas sits on its own word, so the browser still wraps and centers the
  // original heading. All pen and font measurements use the same 100px em.
  function makeWord(label, measure, layout, start) {
    const text = label.textContent;
    const width = measure.measureText(text).width + layout.tracking * text.length;
    const pad = 20; // Slanted letters can extend well past their advance.
    let time = start;
    const letters = [...text].map((letter, i) => {
      const x = measure.measureText(text.slice(0, i)).width + i * layout.tracking;
      const passes = glyphFor(layout.strokes[letter]).map(pass => {
        const at = time;
        time += pass.duration;
        return { ...pass, at };
      });
      const end = time;
      time += 12; // Lift the pen between letters.
      const native = document.createElement('span');
      native.textContent = letter;
      return {letter, x, passes, end, native};
    });
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.ceil((width + 2 * pad) * layout.scale);
    canvas.height = Math.ceil(layout.height * layout.scale);
    canvas.style.left = -pad / 100 + 'em';
    canvas.style.top = -layout.baseline / 100 + 'em';
    canvas.style.width = (width + 2 * pad) / 100 + 'em';
    canvas.style.height = layout.height / 100 + 'em';
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    let written = 0;
    function draw(at, color) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(canvas.width / (width + 2 * pad), 0, 0, canvas.height / layout.height, 0, 0);
      ctx.font = measure.font;
      ctx.fillStyle = color;
      const i = letters.findIndex(unit => at < unit.end + 12);
      const active = letters[i];
      if (!active) return;
      while (written < i) {
        const previous = letters[written++].native;
        previous.className = 'ink-mark';
        previous.style.removeProperty('opacity');
      }
      // Let the native letter take over while the pen lifts. Previously the
      // entire completed word switched from canvas to HTML on one frame.
      const finish = Math.max(0, Math.min(1, (at - active.end + 12) / 24));
      active.native.className = 'ink-mark';
      active.native.style.opacity = finish;
      canvas.style.opacity = 1 - finish;
      ctx.save();
      ctx.translate(pad + active.x, layout.baseline);
      ctx.lineWidth = layout.nib;
      ctx.lineCap = ctx.lineJoin = 'round';
      for (const pass of active.passes) {
        if (at <= pass.at) break;
        const progress = Math.min(1, (at - pass.at) / pass.duration);
        ctx.setLineDash(progress === 1 ? [] : [progress * pass.length, pass.length + 1]);
        ctx.stroke(pass.shape);
      }
      // Only the active letter is masked. A slanted stroke or apostrophe can
      // cross the next letter's advance without getting cut at a word boundary.
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillText(active.letter, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
    // Anchor at the same inline baseline as the native word, including when
    // line heights or the pixel ratio produce fractional pixel coordinates.
    const anchor = document.createElement('span');
    anchor.className = 'ink-baseline';
    anchor.append(canvas);
    label.replaceChildren(anchor, ...letters.map(unit => unit.native));
    return {label, start, end: time, draw};
  }

  function prepare(heading, measure, strokes, nib) {
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
        strokes, nib, height, baseline:(height + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2,
        tracking:(parseFloat(style.letterSpacing) || 0) * 100 / size,
        scale:size / 100 * Math.min(devicePixelRatio || 1, 3)
      };
      let time = 0;
      let pictures;
      try {
        pictures = labels.map(label => {
          const part = makeWord(label, measure, layout, time);
          time = part.end + 65; // Give the pen a little room to move to the next word.
          return part;
        });
      } catch {
        heading.replaceChildren(text);
        heading.classList.remove('ink-prepared');
        return;
      }
      let word = 0;
      const penTime = pictures[pictures.length - 1].end;
      // Keep the same rhythm for short greetings and cap the wait for long titles.
      const duration = Math.min(3200, penTime * 1.85);
      const began = performance.now();
      function paint(now) {
        if (stop.dataset.inkArrived !== 'playing') return;
        const at = (now - began) * penTime / duration;
        while (word < pictures.length && at >= pictures[word].end) {
          pictures[word++].label.classList.add('ink-written');
        }
        if (word === pictures.length) {
          heading.dispatchEvent(new Event('street-title-written', {bubbles:true}));
          return;
        }
        const active = pictures[word];
        if (at >= active.start) {
          const ink = forcedColors.matches ? style.color : document.body.style.getPropertyValue('--route-blue');
          active.draw(at, ink || style.color);
        }
        requestAnimationFrame(paint);
      }
      requestAnimationFrame(paint);
    }
    watch.observe(stop, {attributes:true, attributeFilter:['data-ink-arrived']});
    start();
  }

  if (!document.fonts || typeof Path2D === 'undefined' ||
      !document.documentElement.hasAttribute('data-street-navigation-ready')) return;
  // Both headings use the same word-by-word pen, with paths drawn for their
  // own typeface. Fonts load independently so the flag opening never waits.
  function loadPen(selector, family, strokes, nib) {
    const requested = performance.now();
    const font = '100px "' + family + '"';
    document.fonts.load(font).then(fonts => {
      if (!fonts.length) return;
      const measure = document.createElement('canvas').getContext('2d');
      if (!measure) return;
      measure.font = font;
      const metrics = measure.measureText('Hg');
      if (![metrics.fontBoundingBoxAscent, metrics.fontBoundingBoxDescent].every(Number.isFinite)) return;
      for (const heading of document.querySelectorAll(selector)) {
        const stop = heading.closest('.street-stop');
        // Never erase a heading that was already visible before its font arrived.
        if (performance.now() - requested > 220 && stop.hasAttribute('data-ink-arrived')) continue;
        prepare(heading, measure, strokes, nib);
      }
    }).catch(() => {});
  }
  loadPen('[data-write-title=""]', 'Patrick Hand', patrickStrokes, 18);
  loadPen('[data-write-title="greeting"]', 'Seattle Greeting Ink', caveatStrokes, 15);
})();
