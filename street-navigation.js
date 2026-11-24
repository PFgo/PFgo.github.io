(() => {
  const rail = document.getElementById('street-rail');
  if (!rail) return;
  const stops = Array.from(rail.querySelectorAll('.street-stop[id]'));
  if (!stops.length) return;

  const routeLinks = Array.from(document.querySelectorAll('a[data-route]'));
  const stepButtons = Array.from(document.querySelectorAll('button[data-step]'));
  const locationLabel = document.getElementById('street-location');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sky = document.querySelector('.tour-sky');
  const greeting = stops[0].querySelector('.tour-heading');
  const greetingReader = greeting.closest('.stop-scroll');
  const stopForAnchor = new Map();
  stops.forEach((stop, index) => {
    stopForAnchor.set('#' + stop.id, index);
    stop.querySelectorAll('h1[id], h2[id]').forEach(heading => stopForAnchor.set('#' + heading.id, index));
  });
  let offsets = [];
  let current = -1;
  let openingHoldsGreeting = false;
  let destination = null;
  let routeFrame = 0;
  let frame = 0;
  let settleTimer = 0;
  let wheelFrame = 0;
  let wheelTarget = null;
  let wheelDirection = 0;
  let wheelRemainder = 0;
  let wheelTime = 0;
  let wheelIdleUntil = 0;
  let easeWheel = false;
  let width = 0;
  let height = 0;
  let maximum = 0;
  // A fraction is a position between consecutive stops. It stays meaningful
  // even if several viewport changes arrive before the next painted frame.
  let routePosition = 0;
  let resizePosition = null;
  let resizeTimer = 0;
  let skyProgress = '';
  // The URL identifies the neighborhood, including on reload and Back.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function routeIndex(hash) {
    return stopForAnchor.get(hash === '#home' || !hash ? '#about' : hash) ?? -1;
  }

  function measure() {
    const leftEdge = rail.getBoundingClientRect().left + rail.clientLeft;
    width = rail.clientWidth;
    height = rail.clientHeight;
    maximum = Math.max(0, rail.scrollWidth - width);
    offsets = stops.map(stop => Math.max(0, Math.min(maximum,
      stop.getBoundingClientRect().left - leftEdge + rail.scrollLeft)));
  }

  function positionAt(x, stopsAt) {
    const right = stopsAt.findIndex(left => left > x);
    if (right < 0) return stopsAt.length - 1;
    if (right === 0) return 0;
    return right - 1 + (x - stopsAt[right - 1]) / (stopsAt[right] - stopsAt[right - 1]);
  }

  function offsetAt(position) {
    const index = Math.floor(position);
    const next = offsets[index + 1] ?? offsets[index];
    return offsets[index] + (next - offsets[index]) * (position - index);
  }

  // Follow the hero when its biography wraps, its fonts load, or the phone rotates.
  // Only the other stops consume these values; scrolling never needs to measure text.
  function alignHeadings() {
    const inset = greeting.getBoundingClientRect().top - greetingReader.getBoundingClientRect().top + greetingReader.scrollTop;
    const size = getComputedStyle(greeting.firstElementChild).fontSize;
    rail.style.setProperty('--greeting-inset', inset + 'px');
    rail.style.setProperty('--greeting-size', size);
  }

  const inkTimeouts = new WeakMap();
  const inkStallTime = 5200;

  function watchPen(stop) {
    clearTimeout(inkTimeouts.get(stop));
    if (document.hidden) return;
    const started = performance.now();
    function checkProgress() {
      const idle = performance.now() - Math.max(started, stop.lastInkFrameAt ?? 0);
      if (idle >= inkStallTime) finishArrival(stop);
      else inkTimeouts.set(stop, setTimeout(checkProgress, inkStallTime - idle));
    }
    inkTimeouts.set(stop, setTimeout(checkProgress, inkStallTime));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && routeFrame) navigate(destination, {instant:true});
    for (const stop of stops) {
      if (stop.dataset.inkArrived === 'playing') watchPen(stop);
    }
  });

  function finishArrival(stop) {
    if (stop.dataset.inkArrived === 'complete') return;
    clearTimeout(inkTimeouts.get(stop));
    inkTimeouts.delete(stop);
    delete stop.lastInkFrameAt;
    stop.dataset.inkArrived = 'complete';
    const heading = stop.querySelector('.ink-prepared[data-write-title]');
    if (heading) {
      // Keep normal, selectable text once the final pen stroke has landed.
      heading.replaceChildren(heading.textContent);
      heading.classList.remove('ink-prepared');
    }
  }

  rail.addEventListener('street-title-written', event => {
    finishArrival(event.target.closest('.street-stop'));
  });

  function paint() {
    frame = 0;
    // A scroll event from the browser clamping scrollLeft after rotation can
    // arrive before ResizeObserver. Restore the old position before recording it.
    if (rail.clientWidth !== width || rail.clientHeight !== height) resize();
    if (resizePosition !== null) restorePosition();
    const x = Math.min(maximum, Math.max(0, rail.scrollLeft));
    const position = positionAt(x, offsets);
    const nearest = Math.round(position);
    if (resizePosition === null) routePosition = Math.abs(x - offsets[nearest]) <= 1.5 ? nearest : position;
    const progress = maximum ? (x / maximum).toFixed(5) : '0';
    if (sky && progress !== skyProgress) {
      sky.style.setProperty('--tour-progress', progress);
      skyProgress = progress;
    }

    // At a stop the neighboring buildings stay in view, while the neighboring
    // text arrives only after the visitor starts walking toward it.
    stops.forEach((stop, index) => {
      const next = x > offsets[index] ? index + 1 : index - 1;
      const gap = Math.abs(offsets[next] - offsets[index]) || width || 1;
      const distance = Math.abs(x - offsets[index]) / gap;
      const opacity = Math.min(1, Math.max(0, (.86 - distance) * 2.8)).toFixed(3);
      if (stop.style.getPropertyValue('--reading-opacity') !== opacity) {
        stop.style.setProperty('--reading-opacity', opacity);
        stop.toggleAttribute('data-reading-hidden', opacity === '0.000');
      }
      // A fresh document starts with no visits. Finish the first reveal when
      // leaving so even a quick round trip returns to fully readable text.
      const ink = stop.dataset.inkArrived;
      // A direct navigation link may glide past several signs. Save their
      // handwriting for the first time the visitor actually approaches them.
      if (ink === undefined && distance <= .62 && (destination === null || destination === index) &&
          !(index === 0 && openingHoldsGreeting)) {
        if (reducedMotion.matches) {
          finishArrival(stop);
        } else {
          stop.dataset.inkArrived = 'playing';
          // Recover static text if the renderer never starts or stops drawing.
          watchPen(stop);
        }
      } else if (ink === 'playing' && (distance >= .86 || reducedMotion.matches)) {
        finishArrival(stop);
      }
    });

    if (nearest !== current) {
      if (current >= 0) stops[current].removeAttribute('data-current-stop');
      current = nearest;
      stops[current].setAttribute('data-current-stop', '');
      if (locationLabel && stops[current].dataset.location) {
        locationLabel.textContent = stops[current].dataset.location;
      }
      routeLinks.forEach(link => {
        const selected = routeIndex(link.hash) === current;
        link.classList.toggle('is-current', selected);
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    stepButtons.forEach(button => {
      const disabled = button.dataset.step === 'prev' ? x < 2 : x > maximum - 2;
      if (button.disabled !== disabled) button.disabled = disabled;
    });
  }

  function settle() {
    clearTimeout(settleTimer);
    // Instant writes during a translated wheel glide can each emit scrollend.
    if (resizePosition !== null || wheelTarget !== null || routeFrame ||
        destination !== null && Math.abs(rail.scrollLeft - offsets[destination]) > 1.5) return;
    const quietIn = wheelIdleUntil - performance.now();
    if (quietIn > 0) {
      settleTimer = setTimeout(settle, Math.ceil(quietIn));
      return;
    }
    if (frame) cancelAnimationFrame(frame);
    paint();
    destination = null;
    if (routeIndex(location.hash) === current) return;
    if (location.hash && routeIndex(location.hash) < 0) return;
    const hash = '#' + stops[current].id;
    if (location.hash !== hash) history.replaceState(history.state, '', hash);
  }

  function cancelWheel() {
    if (wheelFrame) cancelAnimationFrame(wheelFrame);
    wheelFrame = 0;
    wheelTarget = null;
    wheelRemainder = 0;
    wheelTime = 0;
    easeWheel = false;
  }

  function advanceWheel(time) {
    wheelFrame = 0;
    const x = rail.scrollLeft;
    const remaining = wheelTarget - x;
    const elapsed = wheelTime ? Math.min(48, time - wheelTime) : 16;
    const blend = 1 - Math.exp(-elapsed / 38);
    const finish = !easeWheel || reducedMotion.matches || Math.abs(remaining) <= 2.5;
    // Some browsers expose scrollLeft in whole pixels. Continue to advance
    // near the target even on a high-refresh display.
    const increment = Math.sign(remaining) * Math.max(1, Math.abs(remaining) * blend);
    const left = finish ? wheelTarget : x + increment;
    wheelTime = time;
    rail.scrollTo({left, behavior:'instant'});
    if (finish) {
      const remainder = wheelTarget - rail.scrollLeft;
      cancelWheel();
      wheelRemainder = remainder;
      settle();
    } else {
      wheelFrame = requestAnimationFrame(advanceWheel);
    }
  }

  function cancelRoute() {
    cancelAnimationFrame(routeFrame);
    routeFrame = 0;
    destination = null;
    rail.removeAttribute('data-route-gliding');
  }

  function navigate(index, {instant = false, push = false, focus = false, hash} = {}) {
    if (index < 0 || index >= stops.length) return;
    endResize();
    cancelWheel();
    cancelRoute();
    wheelIdleUntil = 0;
    clearTimeout(settleTimer);
    hash ??= '#' + stops[index].id;
    if (push && (location.hash || index > 0 || hash !== '#about') && location.hash !== hash) {
      history.pushState(history.state, '', hash);
    }
    destination = index;
    if (rail.clientWidth !== width || rail.clientHeight !== height) measure();
    const start = rail.scrollLeft;
    const distance = offsets[index] - start;
    if (focus) {
      const heading = stops[index].querySelector('h1,h2') ?? stops[index];
      heading.setAttribute('tabindex', '-1');
      heading.focus({preventScroll:true});
    }
    if (instant || document.hidden || reducedMotion.matches || Math.abs(distance) <= 1) {
      rail.scrollTo({left:offsets[index], behavior:'instant'});
      settle();
      return;
    }
    // Use the same camera timing in Safari and Chrome. Longer trips get
    // more time without making a visitor wait separately for each stop.
    const initialOffsets = offsets;
    const screens = Math.abs(distance) / width;
    const duration = Math.max(360 + 300 * Math.sqrt(screens), 500 * screens);
    const started = performance.now();
    let previous;
    let frameInterval;
    let elapsed = 0;
    rail.setAttribute('data-route-gliding', '');
    function glide(now) {
      const wallTime = Math.max(0, now - started);
      if (previous === undefined) {
        elapsed = Math.min(64, wallTime);
      } else {
        // Average late frames with their neighbors at the display's own cadence.
        // Repay at most 2ms per frame to keep the camera near its arrival time.
        const interval = Math.min(64, now - previous);
        frameInterval = frameInterval === undefined ? interval : frameInterval + .27 * (interval - frameInterval);
        const behind = Math.max(0, previous - started - elapsed);
        elapsed = Math.min(wallTime, elapsed + frameInterval + Math.min(2, .15 * behind));
      }
      previous = now;
      const t = Math.min(1, elapsed / duration);
      const eased = t * t * (3 - 2 * t);
      // Preserve the same point between landmarks even across layout breakpoints.
      const left = start + distance * eased;
      rail.scrollTo({left:offsets === initialOffsets ? left : offsetAt(positionAt(left, initialOffsets)), behavior:'instant'});
      if (t < 1) routeFrame = requestAnimationFrame(glide);
      else {
        routeFrame = 0;
        settle();
        rail.removeAttribute('data-route-gliding');
      }
    }
    routeFrame = requestAnimationFrame(glide);
  }

  function step(direction, focus = false) {
    const x = rail.scrollLeft;
    const index = destination ?? (direction > 0
      ? offsets.findLastIndex(offset => offset <= x + 2)
      : offsets.findIndex(offset => offset >= x - 2));
    navigate(Math.max(0, Math.min(stops.length - 1, index + direction)), {push:true, focus});
  }

  function onHistory() {
    const index = routeIndex(location.hash);
    if (index < 0) return;
    const dialog = document.getElementById('project-dialog');
    const leaveProject = dialog?.open && stops[index].id !== 'work';
    const focusedStop = document.activeElement?.closest('.street-stop');
    if (leaveProject) dialog.close('navigation');
    navigate(index, {instant:true, focus:leaveProject || Boolean(focusedStop && focusedStop !== stops[index])});
  }

  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const index = routeIndex(link.hash);
    if (index < 0) return;
    event.preventDefault();
    const focus = event.detail === 0 || Boolean(link.closest('.street-stop')) ||
      link.hash !== '#' + stops[index].id && link.hash !== '#home';
    navigate(index, {push:true, focus, hash:link.hash});
  });
  stepButtons.forEach(button => button.addEventListener('click', event =>
    step(button.dataset.step === 'prev' ? -1 : 1, event.detail === 0)));

  let tabbing = false;
  document.addEventListener('keydown', event => {
    tabbing = event.key === 'Tab';
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey ||
        document.querySelector('dialog[open]') || !(event.target instanceof Element) ||
        event.target.closest('input,textarea,select,[contenteditable=true],[role=slider]')) return;
    const focus = Boolean(event.target.closest('.street-stop'));
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 1 : -1, focus);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      navigate(event.key === 'Home' ? 0 : stops.length - 1, {push:true, focus});
    }
  });
  document.addEventListener('keyup', event => { if (event.key === 'Tab') tabbing = false; });
  document.addEventListener('pointerdown', event => {
    tabbing = false;
    endResize();
    cancelWheel();
    if (rail.contains(event.target) && routeFrame) {
      cancelRoute();
      settle();
    }
  }, {passive:true});
  rail.addEventListener('focusin', event => {
    if (!tabbing || !event.target.closest) return;
    const index = stops.indexOf(event.target.closest('.street-stop'));
    if (index >= 0 && Math.abs(rail.scrollLeft - offsets[index]) > 2) {
      navigate(index, {instant:true});
    }
  });

  document.addEventListener('wheel', event => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey ||
        event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    const horizontal = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
    const inside = rail.contains(event.target);
    // Let the browser carry horizontal trackpad momentum and touch scrolling
    // on the rail. The header and footer have no horizontal scroller of their own.
    endResize();
    if (routeFrame) {
      cancelRoute();
      settle();
    }
    if (!event.cancelable) return;
    if (inside && horizontal) { cancelWheel(); return; }
    const reader = event.target instanceof Element && event.target.closest('.stop-scroll');
    if (reader && !horizontal && (event.deltaY < 0 ? reader.scrollTop > 1 :
        reader.scrollTop + reader.clientHeight < reader.scrollHeight - 1)) { cancelWheel(); return; }
    const distance = horizontal ? event.deltaX : event.deltaY;
    if (!distance) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? width : 1;
    event.preventDefault();
    const direction = Math.sign(distance);
    if (wheelTarget === null || direction !== wheelDirection) {
      const remainder = direction === wheelDirection && performance.now() < wheelIdleUntil ? wheelRemainder : 0;
      cancelWheel();
      wheelTarget = rail.scrollLeft + remainder;
    }
    wheelDirection = direction;
    wheelIdleUntil = performance.now() + 110;
    // Fine pixel deltas track the finger directly. A notched mouse wheel
    // typically arrives as one much larger delta or a line/page unit.
    easeWheel ||= event.deltaMode !== 0 || Math.abs(distance) >= 40;
    wheelTarget = Math.min(maximum, Math.max(0, wheelTarget + distance * unit));
    if (!wheelFrame) wheelFrame = requestAnimationFrame(advanceWheel);
  }, {passive:false});

  const nativeScrollEnd = 'onscrollend' in rail;
  rail.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(paint);
    if (!nativeScrollEnd) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(settle, 180);
    }
  }, {passive:true});
  if (nativeScrollEnd) rail.addEventListener('scrollend', settle);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && routeFrame) navigate(destination, {instant:true});
    if (!frame) frame = requestAnimationFrame(paint);
  });
  window.addEventListener('popstate', onHistory);
  window.addEventListener('hashchange', onHistory);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    measure();
    onHistory();
  });

  function endResize() {
    clearTimeout(resizeTimer);
    resizePosition = null;
  }

  function restorePosition() {
    const left = offsetAt(resizePosition);
    if (Math.abs(rail.scrollLeft - left) > 1) rail.scrollTo({left, behavior:'instant'});
  }

  function resize(force = false) {
    if (!force && rail.clientWidth === width && rail.clientHeight === height &&
        rail.scrollWidth - rail.clientWidth === maximum) return;
    // A mobile browser may change viewport height mid-gesture. Keep the same
    // point between landmarks throughout the resize, including scroll events
    // the browser generates while it clamps the old viewport's offset.
    if (routeFrame) {
      measure();
      return;
    }
    resizePosition ??= destination ?? routePosition;
    cancelRoute();
    cancelWheel();
    measure();
    restorePosition();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      restorePosition();
      routePosition = resizePosition;
      endResize();
      settle();
    }, 100);
    if (!frame) frame = requestAnimationFrame(paint);
  }

  const stage = rail.querySelector('.city-stage');
  const panorama = stage.querySelector('.city-painted-world');

  async function decodeLayer(image) {
    try {
      if (image.dataset.lightSrc) image.src = image.dataset.lightSrc;
      if (image.decode) await image.decode();
      else if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, {once:true});
          image.addEventListener('error', reject, {once:true});
        });
      }
      if (image.dataset.lightSrc) image.hidden = !image.naturalWidth;
    } catch {
      image.hidden = true;
    }
  }
  const wheelReady = decodeLayer(stage.querySelector('.harbor-wheel img'));

  let lightsReady;
  function prepareNightLights() {
    if (!document.body.hasAttribute('data-street-lit')) return;
    if (lightsReady) return lightsReady;
    lightClock.disconnect();
    const maps = Array.from(stage.querySelectorAll('[data-light-src]'), decodeLayer);
    lightsReady = Promise.all(maps).then(() => {
      stage.setAttribute('data-lights-ready', '');
    });
    return lightsReady;
  }
  const lightClock = new MutationObserver(prepareNightLights);
  lightClock.observe(document.body, {attributes:true, attributeFilter:['data-street-lit']});
  prepareNightLights();

  // Start optional downloads after the first street view can be shown. A
  // visitor can always leave the opening before these requests finish.
  const warmListeners = new AbortController();
  let warmQueued = false;
  function scheduleStreetWarmup() {
    const root = document.documentElement;
    const connection = navigator.connection;
    function canWarm() {
      return !document.hidden && !reducedMotion.matches && !connection?.saveData &&
        !/^(slow-)?2g$/.test(connection?.effectiveType) && stage.hasAttribute('data-panorama-ready') &&
        root.dataset.streetOpening !== 'loading' && !rail.hasAttribute('data-route-gliding') &&
        !stage.hasAttribute('data-street-paused');
    }
    if (warmQueued || warmListeners.signal.aborted || !canWarm()) return;
    warmQueued = true;
    function warm() {
      warmQueued = false;
      if (!canWarm()) return;
      warmListeners.abort();
      warmState.disconnect();
      root.setAttribute('data-street-warm', '');
      document.dispatchEvent(new Event('street-art-warm'));
      for (const loaf of rail.querySelectorAll('.market-tray img[loading="lazy"]')) {
        loaf.fetchPriority = 'low';
        loaf.loading = 'eager';
      }
    }
    if (window.requestIdleCallback) requestIdleCallback(warm, {timeout:250});
    else setTimeout(warm, 32);
  }
  const warmState = new MutationObserver(scheduleStreetWarmup);
  warmState.observe(rail, {attributes:true, attributeFilter:['data-route-gliding']});
  warmState.observe(stage, {attributes:true, attributeFilter:['data-street-paused', 'data-panorama-ready']});
  const warmOptions = {signal:warmListeners.signal};
  document.addEventListener('visibilitychange', scheduleStreetWarmup, warmOptions);
  reducedMotion.addEventListener('change', scheduleStreetWarmup, warmOptions);
  navigator.connection?.addEventListener('change', scheduleStreetWarmup, warmOptions);
  document.addEventListener('street-opening-end', scheduleStreetWarmup, warmOptions);
  window.addEventListener('load', scheduleStreetWarmup, warmOptions);

  function loadPanorama() {
    return new Promise(resolve => {
      let fallbacks;
      let decoding;
      function trySmallerImage() {
        stage.removeAttribute('data-panorama-ready');
        if (!fallbacks) {
          // The markup lists candidates from smallest to largest. Only retry
          // below the failed resolution and retain normal srcset on success.
          const candidates = panorama.srcset.split(',').filter(Boolean).map(candidate =>
            new URL(candidate.trim().split(/\s+/)[0], document.baseURI).href);
          const selected = candidates.indexOf(panorama.currentSrc || panorama.src);
          fallbacks = (selected < 0 ? candidates : candidates.slice(0, selected)).reverse();
        }
        const next = fallbacks.shift();
        if (next) {
          panorama.src = next;
          panorama.removeAttribute('srcset');
          return;
        }
        // A street without its ground should not leave loose actors on the sky.
        stage.hidden = true;
        panorama.removeEventListener('error', failed);
        panorama.removeEventListener('load', loaded);
        resolve(false);
      }
      function failed() {
        if (panorama.complete && !panorama.naturalWidth) trySmallerImage();
      }
      async function loaded() {
        const candidate = panorama.currentSrc || panorama.src;
        if (decoding === candidate) return;
        decoding = candidate;
        try {
          if (panorama.decode) await panorama.decode();
          if (!stage.hasAttribute('data-panorama-ready')) {
            await wheelReady;
            await prepareNightLights();
          }
          if (panorama.complete && panorama.naturalWidth && candidate === (panorama.currentSrc || panorama.src)) {
            stage.setAttribute('data-panorama-ready', '');
            resolve(true);
          }
        } catch {
          // A replacement selected after resize handles its own load event.
          if (panorama.complete && candidate === (panorama.currentSrc || panorama.src)) trySmallerImage();
        } finally {
          if (decoding === candidate) decoding = null;
        }
      }
      panorama.addEventListener('error', failed);
      panorama.addEventListener('load', loaded);
      if (panorama.complete) {
        if (panorama.naturalWidth) loaded();
        else failed();
      }
    });
  }

  function playOpening(panoramaReady) {
    const root = document.documentElement;
    const banner = stage.querySelector('.needle-banner');
    const view = rail.getBoundingClientRect();
    const street = stage.getBoundingClientRect();
    const flag = banner.getBoundingClientRect();
    if (!flag.width || !view.height) {
      openingHoldsGreeting = false;
      paint();
      return;
    }

    // Fit the flag and the painted curb in the rail before starting the pullback.
    // Centering the flag vertically can put storefronts below the fold on desktop.
    const narrow = matchMedia('(max-width: 700px)').matches;
    const scale = Math.min(narrow ? 1.85 : 2.15, .76 * view.width / flag.width,
      .84 * view.height / (street.bottom - flag.top));
    if (scale <= 1) {
      openingHoldsGreeting = false;
      paint();
      return;
    }
    const focusX = flag.left + flag.width / 2 - street.left;
    const targetX = view.left + view.width * .5 - street.left - scale * focusX;
    const x = Math.max(view.right - street.left - scale * street.width, Math.min(view.left - street.left, targetX));
    const y = view.bottom - street.top - scale * street.height;
    stage.style.setProperty('--flag-framing', `translate3d(${x}px, ${y}px, 0) scale(${scale})`);
    const controls = new AbortController();
    const {signal} = controls;
    // The opening is a close-up of About. A gesture takes over from that same stop.
    function releaseGreeting() {
      openingHoldsGreeting = false;
      if (!frame) frame = requestAnimationFrame(paint);
    }
    function finish(interrupted = true) {
      if (signal.aborted) return;
      controls.abort();
      clearTimeout(deadline);
      if (interrupted) finishArrival(stops[0]);
      releaseGreeting();
      delete root.dataset.streetOpening;
      stage.style.removeProperty('--flag-framing');
      document.dispatchEvent(new Event('street-opening-end'));
    }
    root.dataset.streetOpening = 'loading';
    // A failed or stalled backdrop should never keep the navigation hidden.
    let deadline = setTimeout(finish, 1500);
    stops[0].addEventListener('animationstart', event => {
      if (event.animationName === 'opening-greeting') releaseGreeting();
    }, {signal});
    stage.addEventListener('animationend', event => {
      if (event.target === stage && event.animationName === 'needle-pullback') finish(false);
    }, {signal});
    for (const type of ['wheel','touchmove','keydown','click','focusin']) {
      document.addEventListener(type, finish, {capture:true, passive:true, signal});
    }
    for (const type of ['hashchange','popstate','pagehide']) {
      window.addEventListener(type, finish, {signal});
    }
    const startWidth = window.innerWidth, startHeight = window.innerHeight;
    window.addEventListener('resize', () => {
      // A small height change from the mobile address bar can finish naturally.
      if (window.innerWidth !== startWidth || Math.abs(window.innerHeight - startHeight) > 64) finish();
    }, {signal});
    document.addEventListener('visibilitychange', finish, {signal});
    reducedMotion.addEventListener('change', finish, {signal});

    // The same responsive painting stays behind the flag for the entire move.
    panoramaReady.then(ready => {
      if (signal.aborted) return;
      if (!ready) return finish();
      root.dataset.streetOpening = 'flag';
      scheduleStreetWarmup();
      clearTimeout(deadline);
      // animationend normally releases the street; recover if CSS is interrupted.
      deadline = setTimeout(() => finish(false), 4000);
    });
  }

  document.documentElement.setAttribute('data-street-navigation-ready', '');
  measure();
  alignHeadings();
  const initial = routeIndex(location.hash);
  openingHoldsGreeting = initial === 0 && document.documentElement.hasAttribute('data-opening-pending') &&
      !reducedMotion.matches && !document.hidden;
  const firstPaint = loadPanorama();
  navigate(initial < 0 ? 0 : initial, {instant:true});
  if (openingHoldsGreeting) playOpening(firstPaint);
  document.documentElement.removeAttribute('data-opening-pending');
  if (document.readyState === 'complete') scheduleStreetWarmup();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => resize());
    observer.observe(rail);
    observer.observe(stops[0].parentElement);
    const headingObserver = new ResizeObserver(alignHeadings);
    headingObserver.observe(greetingReader);
    headingObserver.observe(greeting.parentElement);
    headingObserver.observe(greeting);
  } else {
    window.addEventListener('resize', alignHeadings);
    document.fonts?.ready.then(alignHeadings);
  }
  window.addEventListener('resize', () => resize(true));
})();
