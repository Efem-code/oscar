/* Puppy Log service worker — logging a pee must work with no signal. */
/* BUILD is rewritten by deploy.sh on every deploy. It has to change or the
   browser sees an identical service worker, keeps the old one, and the update
   never reaches the phone. */
const BUILD = '20260925-192019';
const CACHE = 'oscar-' + BUILD;
const SHELL = [
  './', './index.html', './styles.css', './data.js', './store.js', './drive.js', './media.js', './push.js', './app.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', e => {
  /* cache: 'reload' skips the browser's HTTP cache. GitHub Pages sends
     max-age=600, so a plain addAll could store the *previous* app.js under the
     new build's name and the update would silently never show. */
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'reload' }).then(r => c.put(u, r)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;

  /* Stale-while-revalidate: answer instantly from the cache so a tip never
     waits on the network, but always refetch in the background so a redeploy
     lands on the next launch. Pure cache-first would pin the app to whatever
     version was installed first until the cache name changed, which is a
     genuinely confusing failure — the phone keeps running old code after an
     update that looked like it worked. */
  e.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || fresh;
    })
  );
});

/* A phone posted photos: show it even when the app is closed. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Puppy Log', {
    body: d.body || 'Something new was added', tag: d.tag || 'oscar', renotify: true,
    icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ goto: new URL(url).hash.slice(1) }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
