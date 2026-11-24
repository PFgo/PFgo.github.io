// Each tile records when the pen reaches each part of a glyph.
(() => {
  const tileWidth = 136, tileHeight = 232, columns = 6;
  const samplesPerUnit = 2, tileTop = -82;

  // In atlas order: character, writing time, pen-down x/y, pen-up x/y.
  // Times and positions are produced by scripts/build_heading_pen.py.
  function penPlan(entries) {
    return new Map(entries.map(([letter, duration, fromX, fromY, toX, toY], index) =>
      [letter, {duration, fromX, fromY, toX, toY, index}]));
  }

  const patrickPlan = penPlan([
    ['G', 102.243, 44, -58, 41, -4],
    ['l', 49.139, 8, -66, 22, -10],
    ['a', 85.593, 31, -41, 33, -3],
    ['d', 122.53, 31, -42, 33, -4],
    ['y', 83.237, 6, -43, 15, 27],
    ['o', 68.66, 27, -40, 27, -40],
    ['u', 90.518, 8, -43, 34, -2],
    ['’', 23, 11, -72, 8, -61],
    ['r', 57.684, 8, -44, 33, -42],
    ['e', 73.576, 6, -25, 34, -13],
    ['h', 90.523, 8, -69, 34, -4],
    ['.', 23, 10.6, -6.6, 10.8, -6.3],
    ['P', 95.765, 9, -59, 10, -34],
    ['j', 87.892, 12, -43, 10.7, -57.2],
    ['c', 51.969, 33, -42, 35, -11],
    ['t', 73.871, 18, -68, 31, -44],
    ['b', 95.871, 8, -68, 9, -6],
    ['k', 102.875, 8, -68, 36, -4],
    ['E', 132.984, 10, -61, 36, -5],
    ['i', 60.197, 9, -44, 10, -57.7],
    ['n', 73.6, 11, -44, 36, -3],
    ['S', 84.896, 38, -58, 8, -10]
  ]);

  const greetingPlan = penPlan([
    ['G', 106.813, 54, -60, 33, -33],
    ['l', 44.38, 30, -66, 11, -2],
    ['a', 84.043, 38, -30, 45, -7],
    ['d', 108.248, 34, -30, 35, 0],
    ['y', 99.549, 16, -38, -5, 14],
    ['o', 59.06, 29, -33, 27, -36],
    ['u', 73.318, 22, -38, 36, -3],
    ['’', 23, 23, -66, 20, -47],
    ['r', 53.174, 22, -41, 38, -33],
    ['e', 61.617, 13, -22, 32, -12],
    ['h', 85.581, 30, -66, 44, -8],
    ['.', 23, 14, -12, 13, -8]
  ]);

  async function loadPenOrder(url, plan, tileLeft) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Pen map unavailable');
    const packed = new Uint8Array(await response.arrayBuffer());
    const width = columns * tileWidth;
    const pixels = new Uint8Array(width * tileHeight * Math.ceil(plan.size / columns));
    // Each packet carries up to 128 literal or repeated samples.
    let input = 0, output = 0;
    while (input < packed.length) {
      const header = packed[input++];
      const count = (header & 127) + 1;
      const repeat = header >= 128;
      const end = input + (repeat ? 1 : count);
      if (end > packed.length || output + count > pixels.length) throw new Error('Invalid pen map');
      if (repeat) pixels.fill(packed[input], output, output + count);
      else pixels.set(packed.subarray(input, end), output);
      input = end;
      output += count;
    }
    if (output !== pixels.length) throw new Error('Incomplete pen map');
    return {pixels, width, plan, tileLeft};
  }

  // Build a small mask in the letter's own pixel coordinates. The native
  // glyph supplies its contour and antialiasing without a canvas readback.
  function prepareLetter(glyph, nib, unit, baseline, scaleX, scaleY, atlas) {
    const top = Math.max(0, Math.floor(baseline - unit.metrics.actualBoundingBoxAscent * scaleY) - 2);
    const bottom = Math.min(glyph.canvas.height, Math.ceil(baseline + unit.metrics.actualBoundingBoxDescent * scaleY) + 2);
    const frame = nib.createImageData(unit.width, bottom - top);
    const order = new Uint8Array(frame.width * frame.height);
    const tileX = unit.pen.index % columns * tileWidth;
    const tileY = Math.floor(unit.pen.index / columns) * tileHeight;
    for (let y = 0; y < frame.height; y++) {
      const row = Math.floor(((top + y + .5 - baseline) / scaleY - tileTop) * samplesPerUnit);
      const rowStart = (tileY + row) * atlas.width + tileX;
      for (let x = 0; x < frame.width; x++) {
        const col = Math.floor(((x + .5 - unit.origin) / scaleX - atlas.tileLeft) * samplesPerUnit);
        order[y * frame.width + x] = Math.min(254, atlas.pixels[rowStart + col]);
      }
    }
    return progress => {
      // A short ramp antialiases the moving tip between time steps.
      const tip = 258 * progress;
      for (let i = 0; i < order.length; i++) {
        frame.data[i * 4 + 3] = 255 * Math.max(0, Math.min(1, (tip - order[i]) / 4));
      }
      nib.putImageData(frame, 0, top);
      nib.globalCompositeOperation = 'source-in';
      nib.drawImage(glyph.canvas, 0, top, frame.width, frame.height, 0, top, frame.width, frame.height);
      nib.globalCompositeOperation = 'source-over';
    };
  }

  // Pen coordinates use the font's 100px em. Completed ink stays on this
  // word's fixed canvas; only the current letter's pixel rectangle is updated.
  function makeWord(label, measure, layout, start, atlas) {
    const text = label.textContent;
    const pad = 20;
    let time = start;
    let cursor = 0;
    let tip;
    const letters = [...text].map(letter => {
      const metrics = measure.measureText(letter);
      const x = cursor;
      cursor += metrics.width + layout.tracking;
      const pen = atlas.plan.get(letter);
      if (tip) {
        const distance = Math.hypot(x + pen.fromX - tip.x, pen.fromY - tip.y);
        time += Math.min(15, 4 + distance * .20);
      }
      const start = time;
      tip = {x: x + pen.toX, y: pen.toY};
      time += pen.duration;
      return {letter, x, metrics, pen, start, end: time};
    });

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    const wordWidth = cursor + 2 * pad;
    canvas.width = Math.ceil(wordWidth * layout.scale);
    canvas.height = Math.ceil(layout.height * layout.scale);
    canvas.style.left = -pad / 100 + 'em';
    canvas.style.top = -layout.baseline / 100 + 'em';
    canvas.style.width = wordWidth / 100 + 'em';
    canvas.style.height = layout.height / 100 + 'em';

    const scaleX = canvas.width / wordWidth;
    const scaleY = canvas.height / layout.height;
    const baseline = layout.baseline * scaleY;
    let tileWidth = 1;
    for (const unit of letters) {
      const origin = (pad + unit.x) * scaleX;
      // Include antialiased edges and the overhang on glyphs such as j.
      unit.left = Math.max(0, Math.floor(origin - unit.metrics.actualBoundingBoxLeft * scaleX) - 2);
      const right = Math.min(canvas.width, Math.ceil(origin + unit.metrics.actualBoundingBoxRight * scaleX) + 2);
      unit.width = right - unit.left;
      unit.origin = origin - unit.left;
      tileWidth = Math.max(tileWidth, unit.width);
    }
    function tile() {
      const bitmap = document.createElement('canvas');
      bitmap.width = tileWidth;
      bitmap.height = canvas.height;
      const context = bitmap.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      return context;
    }
    const paper = canvas.getContext('2d');
    if (!paper) throw new Error('Canvas unavailable');
    const glyph = tile();
    const nib = tile();
    const underlay = tile();
    glyph.font = measure.font;
    glyph.fillStyle = layout.color;

    let next = 0;
    let current = null;
    let paintLetter;
    let writtenRight = 0;
    const wordDuration = time - start;
    function draw(now) {
      // Ease once across the word. Between lifts, the nib keeps moving at the
      // same pace through a letter change as it does through a curve.
      const wordProgress = Math.max(0, Math.min(1, (now - start) / wordDuration));
      const eased = wordProgress + .28 * wordProgress * (1 - wordProgress) * (2 * wordProgress - 1);
      const at = wordProgress === 1 ? time : start + wordDuration * eased;
      while (next < letters.length) {
        const unit = letters[next];
        if (at < unit.start) return;
        const w = unit.width, h = canvas.height;
        const overlaps = unit.left < writtenRight;
        if (current !== unit) {
          current = unit;
          if (overlaps) {
            // Preserve previously written strokes that share this rectangle.
            underlay.clearRect(0, 0, w, h);
            underlay.drawImage(canvas, unit.left, 0, w, h, 0, 0, w, h);
          }
          glyph.resetTransform();
          glyph.clearRect(0, 0, w, h);
          glyph.setTransform(scaleX, 0, 0, scaleY, unit.origin, baseline);
          glyph.fillText(unit.letter, 0, 0);
          nib.clearRect(0, 0, w, h);
          paintLetter = null;
        }
        const finished = at >= unit.end;
        if (!finished) {
          paintLetter ??= prepareLetter(glyph, nib, unit, baseline, scaleX, scaleY, atlas);
          if (at === unit.start) return;
          paintLetter((at - unit.start) / unit.pen.duration);
        }
        paper.clearRect(unit.left, 0, w, h);
        if (overlaps) paper.drawImage(underlay.canvas, 0, 0, w, h, unit.left, 0, w, h);
        paper.drawImage(finished ? glyph.canvas : nib.canvas, 0, 0, w, h, unit.left, 0, w, h);
        if (!finished) return;
        paintLetter = null;
        writtenRight = Math.max(writtenRight, unit.left + w);
        next++;
      }
    }
    const anchor = document.createElement('span');
    anchor.className = 'ink-baseline';
    anchor.append(canvas);
    label.replaceChildren(anchor, text);
    return {start, end: time, draw};
  }

  function prepare(heading, measure, atlas) {
    const stop = heading.closest('.street-stop');
    if (!stop || stop.dataset.inkArrived === 'complete') return;
    const text = heading.textContent;
    const words = text.trim().split(/\s+/);
    if (words.some(word => [...word].some(letter => !atlas.plan.has(letter)))) return;
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
    let pictures;
    let pictureStyle;
    function restoreText() {
      watch.disconnect();
      pictures = null;
      heading.replaceChildren(text);
      heading.classList.remove('ink-prepared');
      if (stop.dataset.inkArrived === 'playing') {
        heading.dispatchEvent(new Event('street-title-written', {bubbles:true}));
      }
    }
    function preparePictures() {
      const style = getComputedStyle(heading);
      const pixelRatio = Math.min(devicePixelRatio || 1, 3);
      const signature = [style.fontSize, style.lineHeight, style.letterSpacing, style.color, pixelRatio].join('|');
      if (pictures && signature === pictureStyle) return;
      const size = parseFloat(style.fontSize);
      const metrics = measure.measureText('Hg');
      const height = parseFloat(style.lineHeight) * 100 / size + 70;
      const layout = {
        color: style.color, height, baseline:(height + metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2,
        tracking:(parseFloat(style.letterSpacing) || 0) * 100 / size,
        scale:size / 100 * pixelRatio
      };
      let time = 0;
      try {
        pictures = labels.map(label => {
          const part = makeWord(label, measure, layout, time, atlas);
          time = part.end + 65; // Give the pen a little room to move to the next word.
          return part;
        });
        pictureStyle = signature;
      } catch {
        restoreText();
      }
    }
    function start() {
      if (!stop.dataset.inkArrived) return;
      watch.disconnect();
      if (stop.dataset.inkArrived !== 'playing') return;
      preparePictures();
      if (!pictures) return;
      let word = 0;
      const penTime = pictures[pictures.length - 1].end;
      // Keep the same rhythm for short greetings and cap the wait for long titles.
      const duration = heading.dataset.writeTitle === 'greeting' ? 3070 : Math.min(4000, penTime * 2.29);
      let previousFrame;
      let elapsed = 0;
      function paint(now) {
        if (stop.dataset.inkArrived !== 'playing') return;
        // Start on the first drawable frame. If a cold street image delays
        // presentation, resume the stroke instead of skipping ahead a letter.
        if (previousFrame !== undefined) elapsed += Math.min(now - previousFrame, 1000 / 30);
        previousFrame = now;
        const at = elapsed * penTime / duration;
        try {
          while (word < pictures.length && at >= pictures[word].end) {
            pictures[word].draw(pictures[word].end);
            word++;
          }
          const active = pictures[word];
          if (active && at >= active.start) active.draw(at);
        } catch {
          restoreText();
          return;
        }
        if (word === pictures.length) {
          requestAnimationFrame(() => {
            if (stop.dataset.inkArrived === 'playing') heading.dispatchEvent(new Event('street-title-written', {bubbles:true}));
          });
          return;
        }
        // Keep progress in JS so the fallback can detect a stall without a DOM mutation.
        stop.lastInkFrameAt = now;
        requestAnimationFrame(paint);
      }
      requestAnimationFrame(paint);
    }
    watch.observe(stop, {attributes:true, attributeFilter:['data-ink-arrived']});
    start();
    function primePictures() {
      if (stop.dataset.inkArrived) return;
      preparePictures();
      try {
        pictures?.forEach(picture => picture.draw(picture.start));
      } catch {
        restoreText();
      }
    }
    if (heading.dataset.writeTitle !== 'greeting') return primePictures;
    if (document.documentElement.hasAttribute('data-street-opening') && window.requestIdleCallback) {
      requestIdleCallback(function warmGreeting(idle) {
        if (stop.dataset.inkArrived || document.hidden) return;
        const stage = document.querySelector('.city-stage');
        const camera = stage?.getAnimations?.().find(animation => animation.animationName === 'needle-pullback');
        if (!camera || camera.effect.getTiming().delay - camera.currentTime < 10) return;
        if (idle.timeRemaining() < 6) {
          requestIdleCallback(warmGreeting);
          return;
        }
        // Use spare time in the stationary close-up to prepare the pen and its
        // first glyph masks. At the word start the reveal mask is still empty.
        primePictures();
      });
    }
  }

  if (!document.fonts || !document.documentElement.hasAttribute('data-street-navigation-ready')) return;
  function warmSectionTitles(queue) {
    if (!queue.length || !window.requestIdleCallback) return;
    const about = document.getElementById('about');
    const rail = document.getElementById('street-rail');
    if (!about || !rail) return;
    // Each prepared word retains its canvas and three scratch surfaces.
    // Limit narrow, often high-DPR screens to the next stop.
    if (matchMedia('(max-width: 700px)').matches) queue.length = 1;
    function warmOne(idle) {
      // An early departure just uses normal on-arrival preparation. Never
      // interrupt the camera, a manual pan, or a newly selected route.
      if (document.hidden || !motion.matches || !document.documentElement.hasAttribute('data-street-warm') ||
          !about.hasAttribute('data-current-stop') || Math.abs(rail.scrollLeft) > 1 ||
          rail.hasAttribute('data-route-gliding') || idle.timeRemaining() < 6) return;
      queue.shift()();
      if (queue.length) requestIdleCallback(warmOne);
    }
    const watch = new MutationObserver(afterGreeting);
    function afterGreeting() {
      if (about.dataset.inkArrived !== 'complete') return;
      watch.disconnect();
      requestIdleCallback(warmOne);
    }
    watch.observe(about, {attributes:true, attributeFilter:['data-ink-arrived']});
    afterGreeting();
  }
  async function loadPen(selector, font, url, plan, tileLeft) {
    const titles = document.querySelectorAll(selector);
    if (!titles.length) return;
    const fontReady = document.fonts.load(font, Array.from(titles, title => title.textContent).join(' '));
    const [fonts, atlas] = await Promise.all([fontReady, loadPenOrder(url, plan, tileLeft)]);
    if (!fonts.length) return;
    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return;
    measure.font = font;
    const metrics = measure.measureText('Hg');
    if (![metrics.fontBoundingBoxAscent, metrics.fontBoundingBoxDescent].every(Number.isFinite)) return;
    const warm = [];
    for (const heading of titles) {
      const stop = heading.closest('.street-stop');
      // A late asset must never erase a title the visitor has already seen.
      if (!stop || (stop.dataset.inkArrived && !document.documentElement.hasAttribute('data-pen-pending'))) continue;
      const prime = prepare(heading, measure, atlas);
      if (prime) warm.push(prime);
    }
    warmSectionTitles(warm);
  }
  function loadRenderer() {
    const root = document.documentElement;
    const rail = document.getElementById('street-rail');
    const onAbout = document.getElementById('about').hasAttribute('data-current-stop');
    const greeting = loadPen('[data-write-title="greeting"]', '400 100px "Seattle Greeting Ink"', 'assets/greeting-pen-order.bin?v=335f4d37fb', greetingPlan, -7);
    const sections = new Promise(resolve => {
      const listeners = new AbortController();
      function start() {
        listeners.abort();
        resolve(loadPen('[data-write-title=""]', '375 100px "Seattle Section Ink"', 'assets/heading-pen-order.bin?v=9aa5029801', patrickPlan, -12));
      }
      if (!onAbout || root.hasAttribute('data-street-warm')) return start();
      // On the homepage the panorama gets the network first. A visitor who
      // leaves early can request the next pen as soon as the street moves.
      document.addEventListener('street-art-warm', start, {signal:listeners.signal});
      rail.addEventListener('scroll', () => {
        if (rail.scrollLeft > 1 && motion.matches) start();
      }, {passive:true, signal:listeners.signal});
    });
    const showTitle = () => root.removeAttribute('data-pen-pending');
    (onAbout ? greeting : sections).then(showTitle, showTitle);
    return Promise.allSettled([greeting, sections]);
  }
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  if (motion.matches) loadRenderer();
  else motion.addEventListener('change', loadRenderer, {once:true});
})();
