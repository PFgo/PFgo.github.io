// Static art also works without scripts. Animated actors live in inert templates.
(() => {
  const rail = document.getElementById('street-rail');
  const stops = document.querySelectorAll('[data-street-art]');
  const staticImage = document.createElement('template');
  // Keep the original image boxes in the layout while the visitor is elsewhere.
  for (const node of document.querySelectorAll('[data-street-art] :is(noscript, template)')) {
    if (!node.content) staticImage.innerHTML = node.textContent;
    const image = (node.content || staticImage.content).querySelector('img');
    image.dataset.streetSrc = image.getAttribute('src');
    image.removeAttribute('src');
    node.replaceWith(image);
  }
  const paint = stop => {
    for (const image of stop.querySelectorAll('[data-street-src]')) {
      image.src = image.dataset.streetSrc;
    }
    for (const image of stop.querySelectorAll('[data-street-href]')) {
      image.setAttribute('href', image.dataset.streetHref);
    }
  };

  if (rail && typeof IntersectionObserver === 'function') {
    const onApproach = (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        paint(entry.target);
        observer.unobserve(entry.target);
      }
    };
    const scenery = new IntersectionObserver(onApproach, { root: rail, rootMargin: '0px 120px' });
    // The navigation script switches from the static page to its horizontal rail.
    // Measuring sooner can make a slow first visit download the entire static view.
    const watch = () => {
      // The opening moves the painting past the reader without visiting another stop.
      if (document.documentElement.hasAttribute('data-street-opening')) {
        document.addEventListener('street-opening-end', watch, {once:true});
        return;
      }
      stops.forEach(stop => scenery.observe(stop));
    };
    if (document.readyState === 'complete') watch();
    else document.addEventListener('DOMContentLoaded', watch, { once: true });
  } else {
    stops.forEach(paint);
  }
  document.documentElement.setAttribute('data-street-art-ready', '');
})();
