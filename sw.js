/* Puppy Log service worker — logging a pee must work with no signal. */
/* BUILD is rewritten by deploy.sh on every deploy. It has to change or the
   browser sees an identical service worker, keeps the old one, and the update
   never reaches the phone. */
const BUILD = '20261005-164111';
const CACHE = 'oscar-' + BUILD;
const SHELL = [
  './', './index.html', './styles.css', './data.js', './guides.js', './store.js', './drive.js', './media.js', './push.js', './app.js', './ask.js',
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
  e.waitUntil((async () => {
    let d = null;
    try { d = e.data && e.data.text() ? e.data.json() : null; } catch { d = { body: e.data.text() }; }
    if (!d) d = (await scheduledMessage()) || await healthReminder();   // empty push = a scheduled one
    await self.registration.showNotification(d.title || 'Puppy Log', {
      body: d.body || 'Something new was added', tag: d.tag || 'oscar', renotify: true,
      icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' },
    });
  })());
});

/* Scheduled notifications (8 am reminder, meal check, 9 pm summary) are built
   by the bridge from both phones' data; an empty push means "come and get it". */
async function scheduledMessage() {
  try {
    if (indexedDB.databases && !(await indexedDB.databases()).some(x => x.name === 'oscar')) return null;
    const db = await new Promise((res, rej) => { const r = indexedDB.open('oscar'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    if (!db.objectStoreNames.contains('kv')) { db.close(); return null; }
    const b = await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get('bridge'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
    db.close();
    if (!b || !b.u) return null;
    const r = await fetch(b.u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: b.k, action: 'msg' }) });
    const j = await r.json();
    return j.ok && j.msg && Date.now() - j.msg.at < 30 * 6e4 ? j.msg : null;
  } catch { return null; }
}

/* Read this phone's own copy of the records and list what's due. Never create
   the database here — an empty one would stop the app setting it up. */
async function healthReminder() {
  const fallback = { title: '💉 Health reminder', body: 'Something is due — open the app to see', tag: 'health', url: './#health' };
  try {
    if (indexedDB.databases && !(await indexedDB.databases()).some(x => x.name === 'oscar')) return fallback;
    const db = await new Promise((res, rej) => { const r = indexedDB.open('oscar'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    if (!db.objectStoreNames.contains('recs')) { db.close(); return fallback; }
    const recs = await new Promise(res => { const q = db.transaction('recs').objectStore('recs').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); });
    db.close();
    const p = n => String(n).padStart(2, '0'), key = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const today = key(new Date()), tomorrow = key(new Date(Date.now() + 864e5));
    const due = recs.filter(r => r.kind === 'health' && !r.deleted && !r.done && r.due && r.due <= tomorrow).sort((a, b) => a.due < b.due ? -1 : 1);
    const pet = (recs.find(r => r.id === 'profile' && !r.deleted) || {}).name || 'Your puppy';
    const appts = recs.filter(r => r.kind === 'appt' && !r.deleted && !r.visitId && !r.cancelled && (r.day === today || r.day === tomorrow))
      .sort((a, b) => (a.day + (a.time || '')) < (b.day + (b.time || '')) ? -1 : 1);
    if (appts.length) {
      const a = appts[0], clock = a.time ? new Date(`2000-01-01T${a.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const more = due.length ? `\nAlso: ${due.length} health item${due.length > 1 ? 's' : ''} due` : '';
      return { title: `📅 ${pet}: ${a.reason || a.type || 'Appointment'} ${a.day === today ? 'today' : 'tomorrow'}${clock ? ' at ' + clock : ''}`,
        body: [a.clinic, a.vet && 'with ' + a.vet, a.bring && 'Bring/ask: ' + a.bring].filter(Boolean).join(' · ') + more, tag: 'appt', url: './#health' };
    }
    const lessons = recs.filter(r => r.kind === 'lesson' && !r.deleted && !r.done && (r.due === today || r.due === tomorrow));
    if (lessons.length) {
      const l = lessons.sort((a, b) => a.due < b.due ? -1 : 1)[0], c = recs.find(r => r.id === l.classId) || {};
      const t = l.time || c.time, clock = t ? new Date(`2000-01-01T${t}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const more = due.length ? `\nAlso: ${due.length} health item${due.length > 1 ? 's' : ''} due` : '';
      return { title: `🎓 ${c.name || 'Training class'} ${l.due === today ? 'today' : 'tomorrow'}${clock ? ' at ' + clock : ''}`,
        body: [c.place, c.trainer && 'with ' + c.trainer, c.bring && 'Bring: ' + c.bring].filter(Boolean).join(' · ') + more, tag: 'class', url: './#train' };
    }
    if (!due.length) return fallback;
    const when = r => r.due < today ? 'overdue' : r.due === today ? 'today' : 'tomorrow';
    return { title: `💉 ${pet}: ${due.length === 1 ? due[0].name + ' due ' + when(due[0]) : due.length + ' health items due'}`,
      body: due.slice(0, 4).map(r => `${r.name} — ${when(r)}`).join('\n'), tag: 'health', url: './#health' };
  } catch { return fallback; }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope));
    if (open) { open.postMessage({ goto: new URL(url).hash.slice(1) }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
