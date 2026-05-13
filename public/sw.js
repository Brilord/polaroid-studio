const VERSION = '2026-05-13-v2';
const APP_CACHE = `polaroid-studio-app-${VERSION}`;
const RUNTIME_CACHE = `polaroid-studio-runtime-${VERSION}`;
const APP_SHELL = ['./', './index.html', './logo.png', './manifest.webmanifest'];
const MAX_RUNTIME_ENTRIES = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![APP_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimRuntimeCache() {
  const cache = await caches.open(RUNTIME_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_RUNTIME_ENTRIES) {
    return;
  }

  await Promise.all(
    keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((request) => cache.delete(request))
  );
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).then(trimRuntimeCache);
      }
      return response;
    })
    .catch(() => cached);

  return cached ?? network;
}

async function navigationFallback(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(APP_CACHE);
    cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await caches.match('./index.html')) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
