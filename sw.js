// Service worker: lets Patha open and work offline after the first visit.
// Network first (so a new version is picked up at once when online), falling
// back to the cached copy when offline. Fonts are cached on first use.
// It only ever caches Patha's own files; it contacts no one else.

const VERSION = 'patha-v1';
const CORE = `${VERSION}-core`;
const FONTS = `${VERSION}-fonts`;

// Every file the app needs to start. tests/unit/sw.test.js checks this list.
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-maskable.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'styles/app.css',
  'fonts/fonts.css',
  'src/core/answer.js',
  'src/core/backup.js',
  'src/core/chunk.js',
  'src/core/drills.js',
  'src/core/lang.js',
  'src/core/memory.js',
  'src/core/patterns.js',
  'src/core/progress.js',
  'src/core/samples.js',
  'src/core/scheduler.js',
  'src/core/segment.js',
  'src/core/textModel.js',
  'src/storage/db.js',
  'src/ui/braid.js',
  'src/ui/check.js',
  'src/ui/components.js',
  'src/ui/dom.js',
  'src/ui/main.js',
  'src/ui/plan.js',
  'src/ui/recall.js',
  'src/ui/router.js',
  'src/ui/session.js',
  'src/ui/speech.js',
  'src/ui/store.js',
  'src/ui/watch.js',
  'src/ui/views/about.js',
  'src/ui/views/add.js',
  'src/ui/views/drill.js',
  'src/ui/views/final.js',
  'src/ui/views/home.js',
  'src/ui/views/practice.js',
  'src/ui/views/review.js',
  'src/ui/views/settings.js',
  'src/ui/views/text.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CORE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('.woff2')) {
    // Fonts never change: cache first.
    event.respondWith(
      caches.open(FONTS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CORE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(request, { ignoreSearch: true });
        if (hit) return hit;
        if (request.mode === 'navigate') {
          const shell = await caches.match('index.html');
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }),
  );
});
