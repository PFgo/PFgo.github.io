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

function openProject(project, trigger) {
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
  if (project.image) {
    const image = document.createElement('img');
    image.width = project.image.width;
    image.height = project.image.height;
    image.alt = project.image.alt;
    image.src = project.image.src;
    image.className = 'dialog-image';
    if (project.image.className) image.classList.add(project.image.className);
    content.append(image);
  }
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
    trigger.setAttribute('aria-label', 'Open ' + project.name + ' project details');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', projectDialog.id);
    trigger.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openProject(project, trigger);
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
const streetStage = $('.seattle-stage');
const streetToggle = $('#street-motion');
const trees = Array.from(streetStage.querySelectorAll('.street-tree'));
const fountain = streetStage.querySelector('.drumheller-water');
const needleBanner = streetStage.querySelector('.needle-banner');
let pausedByVisitor = false;
let streetOnscreen = true;
let breezeStarted = false;

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
  if (!paused && !fountain.hasAttribute('data-out-of-view')) fountain.setAttribute('data-water-ready', '');
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
      if (target === fountain && isIntersecting && !streetStage.hasAttribute('data-street-paused')) {
        fountain.setAttribute('data-water-ready', '');
      }
    }
  }, {root: $('#street-rail'), rootMargin: '24px'});
  // Pause an offscreen walker's limbs, but let their lane keep travelling
  // so they can naturally re-enter the scene at the right moment.
  const landmarks = streetStage.querySelectorAll('[data-landmark], .campus-conversation, .harbor-air, .street-lane svg');
  landmarks.forEach(landmark => landmark.setAttribute('data-out-of-view', ''));
  // Wait until the navigation script has replaced the static overview with the rail.
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
  if (document.readyState === 'complete') observeStreet();
  else document.addEventListener('DOMContentLoaded', observeStreet, {once:true});
}
new MutationObserver(syncStreet).observe(projectDialog, {attributes:true, attributeFilter:['open']});
document.addEventListener('visibilitychange', syncStreet);
reducedMotion.addEventListener('change', syncStreet);
syncStreet();
