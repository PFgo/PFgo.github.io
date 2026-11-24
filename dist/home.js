const $=s=>document.querySelector(s);

const projects = {
  "habitail": {
    name: "HabiTail",
    category: "COMMERCE · EXPERIENCE · OPERATIONS",
    role: "Project Manager & UX Lead · 2026–Present",
    intro: "HabiTail is a pet-supplies store I help run. I work on the shopping experience, test changes before they go live, and look after the site day to day.",
    image: {
      src: "assets/habitail-preview.jpg",
      width: 1280,
      height: 720,
      alt: "The live HabiTail pet-supplies storefront"
    },
    points: [
      ["Building & testing", "We went through 30+ rounds of changes and code reviews. I arranged security audits and used 25+ automated tests to check releases. The code was built with AI assistance."],
      ["The shopping experience", "I studied how people used the store and tested it on different browsers and devices. I also worked on accessibility and tracked down problems with the navigation and cart."],
      ["Day to day", "I keep the Shopify catalog, inventory, and checkout up to date, and manage deployments, the domain, and email."]
    ],
    tech: "Next.js 15 · TypeScript · Shopify Storefront API · Playwright · Vercel",
    links: [{text: "Visit HabiTail", url: "https://habitail.pet/"}]
  },
  "cookies": {
    name: "CookiesShallNotPass",
    category: "PRIVACY · SECURITY · TEAMWORK",
    role: "Backend Security & Privacy · September–December 2025",
    intro: "Six of us built this Chrome extension. It blocks non-essential cookies and lets people choose which sites to allow. I worked on cookie controls and backend security.",
    image: {
      src: "assets/cookies-popup.webp",
      width: 734,
      height: 1224,
      alt: "CookiesShallNotPass popup shown in the project user manual, with numbered feature annotations",
      className: "extension-image"
    },
    points: [
      ["Privacy controls", "I added automatic cookie clearing at the end of a session and saved site preferences with Firebase Auth and Firestore."],
      ["Security ownership", "I led the backend security work, keeping permissions limited to what each feature needed."],
      ["Working together", "We used GitHub Projects, reviewed each other’s code, and worked in weekly sprints."]
    ],
    tech: "TypeScript · React · Chrome Extension API · Firebase · Azure Storage",
    links: [{text: "View GitHub repository", url: "https://github.com/AryanV08/CookiesShallNotPass"}]
  },
  "happy-massage": {
    name: "Happy Massage",
    role: "Web Design & Development",
    intro: "I helped design and build a multilingual website for Happy Massage in Silverdale, Washington. We built the treatment menu in HTML so clients can check prices even with JavaScript turned off.",
    image: {
      src: "assets/happy-massage-preview.jpg",
      width: 1280,
      height: 720,
      alt: "Happy Massage homepage with a watercolor reception desk and a handwritten hello"
    },
    tech: "HTML · CSS · JavaScript · SVG",
    links: [{text: "Visit Happy Massage", url: "https://www.happymassage.net/"}]
  }
};
const projectDialog = $('#project-dialog');
let lastTrigger = null;
let lastPreview = null;

function prepareProjectPreview(spec) {
  if (!spec) return null;
  if (lastPreview?.getAttribute('src') === spec.src && (!lastPreview.complete || lastPreview.naturalWidth)) {
    return lastPreview;
  }
  const image = new Image(spec.width, spec.height);
  image.alt = spec.alt;
  image.className = 'dialog-image';
  if (spec.className) image.classList.add(spec.className);
  image.decoding = 'async';
  image.src = spec.src;
  // Warm the selected project on intent. The dialog can open while its image loads.
  image.decode?.().catch(() => {});
  lastPreview = image;
  return image;
}

function openProject(project, trigger, preview) {
  const category = $('#dialog-category');
  category.textContent = project.category || '';
  category.hidden = !project.category;
  $('#dialog-title').textContent = project.name;
  $('#dialog-role').textContent = project.role;
  const content = $('#dialog-content');
  const intro = document.createElement('p');
  intro.className = 'dialog-intro';
  intro.textContent = project.intro;
  content.replaceChildren(intro);
  if (preview) content.append(preview);
  if (project.points?.length) {
    const list = document.createElement('ul');
    list.className = 'dialog-list';
    for (const [title, description] of project.points) {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = title + '. ';
      item.append(label, document.createTextNode(description));
      list.append(item);
    }
    content.append(list);
  }
  const tech = document.createElement('p');
  tech.className = 'dialog-tech';
  tech.textContent = project.tech;
  content.append(tech);
  const links = $('#dialog-links');
  links.replaceChildren();
  const resume = {text:'View résumé', url:'assets/dave-guo-resume.pdf?v=dcabc63e05'};
  for (const link of [...project.links, resume]) {
    const anchor = document.createElement('a');
    anchor.className = link === resume ? 'button subtle' : 'button blue';
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = link.text;
    links.append(anchor);
  }
  lastTrigger = trigger;
  projectDialog.returnValue = '';
  projectDialog.showModal();
  document.body.classList.add('modal-open');
  projectDialog.scrollTop = 0;
}

if (typeof projectDialog.showModal === 'function') {
  // Cached versions of the bakery used numeric values for these same links.
  const previousIds = ['habitail', 'cookies', 'file-search'];
  for (const trigger of document.querySelectorAll('[data-project]')) {
    const key = trigger.dataset.project;
    const id = Object.hasOwn(previousIds, key) ? previousIds[key] : key;
    if (!Object.hasOwn(projects, id)) continue;
    const project = projects[id];
    const preparePreview = () => prepareProjectPreview(project.image);
    trigger.setAttribute('aria-label', 'Open ' + project.name + ' project details');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', projectDialog.id);
    trigger.addEventListener('pointerenter', () => {
      // Moving the street under a stationary pointer can synthesize an enter.
      if (!streetRail.hasAttribute('data-route-gliding')) preparePreview();
    });
    trigger.addEventListener('focus', preparePreview);
    trigger.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openProject(project, trigger, preparePreview());
    });
  }
}
$('#dialog-close').addEventListener('click', () => projectDialog.close());
projectDialog.addEventListener('close', () => {
  if (projectDialog.open) return;
  document.body.classList.remove('modal-open');
  if (projectDialog.returnValue !== 'navigation') lastTrigger?.focus({preventScroll:true});
  lastTrigger = null;
});
projectDialog.addEventListener('click', event => {
  if (event.target !== projectDialog) return;
  const {left, right, top, bottom} = projectDialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) projectDialog.close();
});

// The street has one pause control. Local landmarks also sleep outside the viewport.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const streetRail = $('#street-rail');
const streetStage = $('.seattle-stage');
const streetToggle = $('#street-motion');
const trees = Array.from(streetStage.querySelectorAll('.street-tree'));
const fountain = streetStage.querySelector('.drumheller-water');
const aboutStop = $('#about');
const projectsStop = $('#work');
const needleBanner = streetStage.querySelector('.needle-banner');
let pausedByVisitor = false;
let streetOnscreen = true;
let breezeStarted = false;
let fountainRequested = false;
let useFountainImage = typeof Worker !== 'function';
let fountainBlob;
let fountainAtlas;
let fountainContext;
let fountainFrame = 0;
let fountainTimer;

async function fetchFountain(priority) {
  fountainRequested = true;
  try {
    // Measure the untransformed canvas once. The opening camera magnifies its parent.
    const ratio = window.devicePixelRatio || 1;
    const compact = matchMedia('(max-width: 700px)').matches &&
      fountain.clientWidth * ratio <= 224 && fountain.clientHeight * ratio <= 148;
    const atlas = compact ? 'fountain-water-atlas-small.webp' : 'fountain-water-atlas.webp';
    const response = await fetch('assets/' + atlas, {priority});
    if (!response.ok) return;
    fountainBlob = await response.blob();
    // Conditions can change while the bytes are in flight.
    syncFountain();
  } catch {
    // The street painting already includes a still fountain.
  }
}

async function decodeFountainOffscreen(blob) {
  const worker = new Worker('fountain-worker.js?v=d176d7bc24');
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({data}) => data ? resolve(data) : reject();
      worker.onerror = worker.onmessageerror = reject;
      worker.postMessage(blob);
    });
  } finally {
    worker.terminate();
  }
}

async function decodeFountain() {
  const blob = fountainBlob;
  fountainBlob = null;
  fountainContext ??= fountain.getContext('2d');
  if (!fountainContext) return;
  if (!useFountainImage) {
    try {
      fountainAtlas = await decodeFountainOffscreen(blob);
    } catch {
      // Keep the bytes until a quiet moment if workers or bitmap transfers are blocked.
      useFountainImage = true;
      fountainBlob = blob;
    }
  } else {
    let src;
    try {
      const image = new Image();
      src = URL.createObjectURL(blob);
      image.src = src;
      await image.decode();
      fountainAtlas = image;
    } catch {
      // The street painting includes a still fountain.
    } finally {
      if (src) URL.revokeObjectURL(src);
    }
  }
  if (fountainAtlas) {
    fountain.width = fountainAtlas.width / 8;
    fountain.height = fountainAtlas.height / 6;
  }
  syncFountain();
}

function paintFountainFrame() {
  const {width, height} = fountain;
  const x = (fountainFrame % 8) * width;
  const y = Math.floor(fountainFrame / 8) * height;
  fountainContext.clearRect(0, 0, width, height);
  fountainContext.drawImage(fountainAtlas, x, y, width, height, 0, 0, width, height);
  fountainFrame = (fountainFrame + 1) % 48;
}

function hasFlagHoldTime() {
  const camera = streetStage.getAnimations?.().find(animation => animation.animationName === 'needle-pullback');
  return Number.isFinite(camera?.currentTime) && camera.effect.getTiming().delay - camera.currentTime > 300;
}

function syncFountain() {
  const paused = streetStage.hasAttribute('data-street-paused');
  const opening = document.documentElement.hasAttribute('data-street-opening');
  const gliding = streetRail.hasAttribute('data-route-gliding');
  const inView = !fountain.hasAttribute('data-out-of-view');
  const warm = document.documentElement.hasAttribute('data-street-warm');
  const warmAbout = warm && aboutStop.hasAttribute('data-current-stop');
  const nearFountain = inView || (warm && projectsStop.hasAttribute('data-current-stop'));
  if (!paused && !gliding && (warmAbout || (!opening && nearFountain))) {
    if (!fountainRequested) fetchFountain(warmAbout && !inView ? 'low' : 'auto');
    else if (fountainBlob) {
      // Spend spare time in the stationary flag close-up. A slow download can
      // wait through the pullback and greeting without taking a frame from either.
      const quiet = useFountainImage
        ? !opening && streetRail.querySelector('[data-current-stop][data-ink-arrived="complete"]')
        : opening ? warmAbout && document.documentElement.dataset.streetOpening === 'flag' && hasFlagHoldTime()
          : nearFountain || aboutStop.dataset.inkArrived === 'complete';
      if (quiet) decodeFountain();
    }
  }
  if (!paused && !opening && !gliding && inView && fountainAtlas) {
    if (fountainTimer === undefined) {
      paintFountainFrame();
      fountain.setAttribute('data-water-ready', '');
      fountainTimer = setInterval(paintFountainFrame, 50);
    }
  } else {
    clearInterval(fountainTimer);
    fountainTimer = undefined;
  }
}
const fountainRouteObserver = new MutationObserver(syncFountain);
fountainRouteObserver.observe(streetRail, {attributes:true, attributeFilter:['data-route-gliding']});
fountainRouteObserver.observe(document.documentElement, {attributes:true, attributeFilter:['data-street-warm', 'data-street-opening']});
for (const stop of streetRail.querySelectorAll('.street-stop')) {
  fountainRouteObserver.observe(stop, {attributes:true, attributeFilter:['data-current-stop', 'data-ink-arrived']});
}

function syncBanner() {
  if (typeof needleBanner?.pauseAnimations !== 'function') return;
  if (streetStage.hasAttribute('data-street-paused') || needleBanner.hasAttribute('data-out-of-view')) {
    needleBanner.pauseAnimations();
    return;
  }
  needleBanner.unpauseAnimations();
  if (!breezeStarted) {
    breezeStarted = true;
    needleBanner.querySelectorAll('[data-breeze]').forEach(animation => animation.beginElement());
  }
}

function syncTree(tree) {
  if (typeof tree.pauseAnimations !== 'function') return;
  const halted = streetStage.hasAttribute('data-street-paused') || tree.hasAttribute('data-out-of-view');
  if (halted) tree.pauseAnimations();
  else {
    tree.setAttribute('data-wind-ready', '');
    tree.unpauseAnimations();
  }
  if (reducedMotion.matches) tree.removeAttribute('data-wind-ready');
}

function syncStreet() {
  const paused = pausedByVisitor || !streetOnscreen || document.hidden || projectDialog.open || reducedMotion.matches;
  streetStage.toggleAttribute('data-street-paused', paused);
  syncFountain();
  trees.forEach(syncTree);
  syncBanner();
  streetToggle.hidden = reducedMotion.matches;
  streetToggle.classList.toggle('is-paused', pausedByVisitor);
  const label = pausedByVisitor ? 'Play street animation' : 'Pause street animation';
  streetToggle.setAttribute('aria-label', label);
  streetToggle.title = label;
}
streetToggle.addEventListener('click', () => {
  pausedByVisitor = !pausedByVisitor;
  syncStreet();
});
if ('IntersectionObserver' in window) {
  const streetObserver = new IntersectionObserver(([entry]) => {
    streetOnscreen = entry.isIntersecting;
    syncStreet();
  });
  const landmarkObserver = new IntersectionObserver(entries => {
    for (const {target, isIntersecting} of entries) {
      target.toggleAttribute('data-out-of-view', !isIntersecting);
      if (target.matches('.street-tree')) syncTree(target);
      if (target === needleBanner) syncBanner();
      if (target === fountain) syncFountain();
    }
  }, {root: streetRail, rootMargin: '24px'});
  // Pause an offscreen walker's limbs, but let their lane keep travelling
  // so they can naturally re-enter the scene at the right moment.
  const landmarks = streetStage.querySelectorAll('[data-landmark], .campus-conversation, .harbor-air, .street-lane svg');
  landmarks.forEach(landmark => landmark.setAttribute('data-out-of-view', ''));
  // The flag can start as soon as the rail exists, even if other scripts are still loading.
  function observeStreet() {
    if (!document.documentElement.hasAttribute('data-street-navigation-ready')) return;
    if (document.documentElement.hasAttribute('data-street-opening')) {
      // The opening holds this flag in the frame before the street observers run.
      needleBanner.removeAttribute('data-out-of-view');
      syncBanner();
      document.addEventListener('street-opening-end', observeStreet, {once:true});
      return;
    }
    streetObserver.observe(streetStage);
    landmarks.forEach(landmark => landmarkObserver.observe(landmark));
  }
  if (document.documentElement.hasAttribute('data-street-navigation-ready')) observeStreet();
  else document.addEventListener('DOMContentLoaded', observeStreet, {once:true});
}
new MutationObserver(syncStreet).observe(projectDialog, {attributes:true, attributeFilter:['open']});
document.addEventListener('visibilitychange', syncStreet);
reducedMotion.addEventListener('change', syncStreet);
syncStreet();
