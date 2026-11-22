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
  const stopForAnchor = new Map();
  stops.forEach((stop, index) => {
    stopForAnchor.set('#' + stop.id, index);
    stop.querySelectorAll('h1[id], h2[id]').forEach(heading => stopForAnchor.set('#' + heading.id, index));
  });
  let offsets = [];
  let current = -1;
  let destination = null;
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

  function finishArrival(stop) {
    if (stop.dataset.inkArrived === 'complete') return;
    stop.dataset.inkArrived = 'complete';
    const heading = stop.querySelector('.ink-prepared[data-write-title]');
    if (heading) {
      // Keep normal, selectable text once the final pen stroke has landed.
      heading.replaceChildren(heading.textContent);
      heading.classList.remove('ink-prepared');
    }
  }

  rail.addEventListener('street-title-written', event => finishArrival(event.target.closest('.street-stop')));
  rail.addEventListener('animationend', event => {
    if (event.animationName !== 'welcome-show' ||
        !event.target.matches('.finish-friends')) return;
    finishArrival(event.target.closest('.street-stop'));
  });

  function paint() {
    frame = 0;
    // A scroll event from the browser clamping scrollLeft after rotation can
    // arrive before ResizeObserver. Restore the old position before recording it.
    if (rail.clientWidth !== width || rail.clientHeight !== height) resize();
    if (resizePosition !== null) restorePosition();
    const x = Math.min(maximum, Math.max(0, rail.scrollLeft));
    const nearest = offsets.reduce((best, offset, i) =>
      Math.abs(x - offset) < Math.abs(x - offsets[best]) ? i : best, 0);
    const delta = x - offsets[nearest];
    const adjacent = nearest + Math.sign(delta);
    const span = Math.abs(offsets[adjacent] - offsets[nearest]);
    if (resizePosition === null) {
      routePosition = nearest;
      if (Math.abs(delta) > 1.5 && span > 0) routePosition += delta / span;
    }
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
      if (ink === undefined && distance <= .62) {
        if (reducedMotion.matches) {
          finishArrival(stop);
        } else {
          stop.dataset.inkArrived = 'playing';
          // Always leave readable text, even if a font or an animation is interrupted.
          window.setTimeout(() => finishArrival(stop), 2200);
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
    if (resizePosition !== null || wheelTarget !== null ||
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

  function navigate(index, {instant = false, push = false, focus = false, hash} = {}) {
    if (index < 0 || index >= stops.length) return;
    endResize();
    cancelWheel();
    wheelIdleUntil = 0;
    clearTimeout(settleTimer);
    hash ??= '#' + stops[index].id;
    if (push && (location.hash || index > 0 || hash !== '#about') && location.hash !== hash) {
      history.pushState(history.state, '', hash);
    }
    destination = index;
    rail.scrollTo({left:offsets[index], behavior:instant || reducedMotion.matches ? 'instant' : 'smooth'});
    if (focus) {
      const heading = stops[index].querySelector('h1,h2') ?? stops[index];
      heading.setAttribute('tabindex', '-1');
      heading.focus({preventScroll:true});
    }
    if (Math.abs(rail.scrollLeft - offsets[index]) < 1) settle();
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
    const focus = event.detail === 0 || link.hash !== '#' + stops[index].id && link.hash !== '#home';
    navigate(index, {push:true, focus, hash:link.hash});
  });
  stepButtons.forEach(button => button.addEventListener('click', () =>
    step(button.dataset.step === 'prev' ? -1 : 1)));

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
    if (rail.contains(event.target)) destination = null;
  }, {passive:true});
  rail.addEventListener('focusin', event => {
    if (!tabbing || !event.target.closest) return;
    const index = stops.indexOf(event.target.closest('.street-stop'));
    if (index >= 0 && Math.abs(rail.scrollLeft - offsets[index]) > 2) {
      navigate(index, {instant:true});
    }
  });

  document.addEventListener('wheel', event => {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
        event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    const horizontal = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
    const inside = rail.contains(event.target);
    // Let the browser carry horizontal trackpad momentum and touch scrolling
    // on the rail. The header and footer have no horizontal scroller of their own.
    endResize();
    destination = null;
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
    const index = Math.floor(resizePosition);
    const next = offsets[index + 1] ?? offsets[index];
    const left = offsets[index] + (next - offsets[index]) * (resizePosition - index);
    if (Math.abs(rail.scrollLeft - left) > 1) rail.scrollTo({left, behavior:'instant'});
  }

  function resize(force = false) {
    if (!force && rail.clientWidth === width && rail.clientHeight === height &&
        rail.scrollWidth - rail.clientWidth === maximum) return;
    // A mobile browser may change viewport height mid-gesture. Keep the same
    // point between landmarks throughout the resize, including scroll events
    // the browser generates while it clamps the old viewport's offset.
    resizePosition ??= destination ?? routePosition;
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

  function playOpening() {
    const root = document.documentElement;
    const stage = rail.querySelector('.city-stage');
    const panorama = stage.querySelector('.city-painted-world');
    const banner = stage.querySelector('.needle-banner');
    const view = rail.getBoundingClientRect();
    const street = stage.getBoundingClientRect();
    const flag = banner.getBoundingClientRect();
    if (!flag.width || !view.height) return;

    // Frame the cloth using its position in the responsive street scene.
    const narrow = matchMedia('(max-width: 700px)').matches;
    const scale = Math.min(narrow ? 1.85 : 2.15, .76 * view.width / flag.width);
    const focusX = flag.left + flag.width / 2 - street.left;
    const focusY = flag.top + flag.height / 2 - street.top;
    const targetX = view.left + view.width * .5 - street.left - scale * focusX;
    const targetY = view.top + view.height * (narrow ? .44 : .38) - street.top - scale * focusY;
    // Keep the painted pavement under the foreground, including on tall phones.
    const x = Math.max(view.right - street.left - scale * street.width, Math.min(view.left - street.left, targetX));
    const y = Math.max(view.bottom - street.top - scale * street.height, targetY);
    stage.style.setProperty('--flag-framing', `translate3d(${x}px, ${y}px, 0) scale(${scale})`);
    const controls = new AbortController();
    const {signal} = controls;
    // The opening is a close-up of About. A gesture takes over from that same stop.
    function finish() {
      if (signal.aborted) return;
      controls.abort();
      clearTimeout(deadline);
      finishArrival(stops[0]);
      delete root.dataset.streetOpening;
      stage.style.removeProperty('--flag-framing');
      document.dispatchEvent(new Event('street-opening-end'));
    }
    root.dataset.streetOpening = 'flag';
    const deadline = setTimeout(finish, 2700);
    stage.addEventListener('animationend', event => {
      if (event.target === stage && event.animationName === 'needle-pullback') finish();
    }, {signal});
    for (const type of ['wheel','touchmove','keydown','click','focusin']) {
      document.addEventListener(type, finish, {capture:true, passive:true, signal});
    }
    for (const type of ['hashchange','popstate','pagehide','resize']) {
      window.addEventListener(type, finish, {signal});
    }
    document.addEventListener('visibilitychange', finish, {signal});
    reducedMotion.addEventListener('change', finish, {signal});

    if (!panorama.complete || !panorama.naturalWidth) {
      // The inline flag is ready immediately, even on the first uncached visit.
      stage.classList.add('opening-facades');
      const revealPaint = () => stage.classList.remove('opening-facades');
      panorama.addEventListener('load', () => {
        if (panorama.decode) panorama.decode().then(revealPaint, revealPaint);
        else revealPaint();
      }, {once:true});
    }
  }

  document.documentElement.setAttribute('data-street-navigation-ready', '');
  measure();
  const initial = routeIndex(location.hash);
  navigate(initial < 0 ? 0 : initial, {instant:true});
  if (initial === 0 && ['', '#about', '#home'].includes(location.hash) &&
      !reducedMotion.matches && !document.hidden &&
      performance.getEntriesByType('navigation')[0]?.type !== 'back_forward') playOpening();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => resize());
    observer.observe(rail);
    observer.observe(stops[0].parentElement);
  }
  window.addEventListener('resize', () => resize(true));
})();
