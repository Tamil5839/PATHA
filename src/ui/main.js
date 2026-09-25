// App entry: storage, routing, header state, service worker.

import * as store from './store.js';
import { parseRoute } from './router.js';
import { h, mount } from './dom.js';
import { renderHome } from './views/home.js';
import { renderAdd } from './views/add.js';
import { renderText } from './views/text.js';
import { renderPractice } from './views/practice.js';
import { renderDrill } from './views/drill.js';
import { renderFinal } from './views/final.js';
import { renderReview, dueCount } from './views/review.js';
import { renderAbout } from './views/about.js';
import { renderSettings } from './views/settings.js';

/** @typedef {(root: HTMLElement, route: import('./router.js').Route) => (void|(() => void))} View */

/** @type {Record<string, View>} */
const VIEWS = {
  home: renderHome,
  add: renderAdd,
  edit: renderAdd,
  text: renderText,
  practice: renderPractice,
  drill: renderDrill,
  final: renderFinal,
  review: renderReview,
  about: renderAbout,
  settings: renderSettings,
};

/** Which header link is active for each route. */
const NAV_FOR = { home: 'home', add: 'home', edit: 'home', text: 'home', practice: 'home', drill: 'home', final: 'home', review: 'review', about: 'about', settings: 'settings' };

/** @type {(() => void)|null} */
let cleanup = null;
let firstRoute = true;

function applyAppearance() {
  const { theme, motion } = store.getSettings();
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  if (motion === 'reduce' || motion === 'full') root.dataset.motion = motion;
  else delete root.dataset.motion;
}

function renderStatus() {
  const banner = /** @type {HTMLElement} */ (document.getElementById('status-banner'));
  if (store.status.saving) {
    banner.hidden = true;
    banner.replaceChildren();
    return;
  }
  banner.hidden = false;
  mount(
    banner,
    h(
      'p',
      null,
      h('strong', null, 'Not saving. '),
      store.status.reason || 'Storage is unavailable.',
      ' Patha still works; ',
      h('a', { href: '#/settings' }, 'export a backup'),
      ' to keep your progress.',
    ),
  );
}

function updateBadge() {
  const badge = document.getElementById('review-badge');
  if (!badge) return;
  const n = dueCount();
  badge.hidden = n === 0;
  badge.textContent = n ? String(n) : '';
  badge.setAttribute('aria-label', `${n} due`);
}

/** @param {string} name */
function updateNav(name) {
  const active = /** @type {Record<string, string>} */ (NAV_FOR)[name] ?? '';
  for (const a of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-nav]'))) {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function route() {
  const main = /** @type {HTMLElement} */ (document.getElementById('main'));
  const r = parseRoute(location.hash);
  if (cleanup) {
    try {
      cleanup();
    } catch (err) {
      console.error(err);
    }
    cleanup = null;
  }
  main.replaceChildren();
  const view = VIEWS[r.name];
  try {
    if (!view) throw new Error('not-found');
    cleanup = view(main, r) || null;
  } catch (err) {
    main.replaceChildren();
    const notFound = err instanceof Error && err.message === 'not-found';
    if (!notFound) console.error(err);
    mount(
      main,
      h(
        'section',
        { class: 'empty-state' },
        h('h1', null, notFound ? 'Page not found' : 'Something went wrong'),
        h('p', null, notFound ? 'This link does not lead anywhere in Patha.' : 'This page could not be shown. Your data has not been changed.'),
        h('p', null, h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to your texts')),
      ),
    );
  }
  updateNav(r.name);
  updateBadge();
  if (!firstRoute) {
    window.scrollTo(0, 0);
    const heading = main.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }
  firstRoute = false;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (new URLSearchParams(location.search).has('nosw')) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Offline support is a bonus; the app works without it.
  });
}

async function start() {
  applyAppearance();
  await store.init();
  applyAppearance();
  renderStatus();
  store.subscribe(() => {
    applyAppearance();
    renderStatus();
    updateBadge();
  });
  window.addEventListener('hashchange', route);
  route();
  registerServiceWorker();
  document.documentElement.dataset.ready = 'true';
}

// A small hook so tests can wait for pending writes before reloading.
/** @type {any} */ (window).__patha = { flush: store.flush };

start();
