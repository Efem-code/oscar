/* Push notifications between the two phones, with no push service account.

   Standard Web Push: each phone subscribes with its browser's push service
   (Google's for the Fold, Apple's for the iPhone) and saves the subscription
   as a synced record. When a phone posts photos, it encrypts a short message
   for every other subscription (RFC 8291) and signs a VAPID token (RFC 8292)
   right here with WebCrypto. The bridge only relays the bytes, because push
   services don't accept requests straight from a web page.

   The VAPID key pair is itself a synced record, so both phones sign with the
   same key their subscriptions were made with. */
const Push = (() => {
  const te = new TextEncoder();
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const cat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol === 'https:';

  /* ---- keys ---- */
  async function vapid() {
    let rec = Store.get('vapid');
    if (!rec) {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      rec = await Store.put({ id: 'vapid', kind: 'config', pub: b64u(pub), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) });
    }
    return rec;
  }

  async function jwt(aud, v, exp) {
    const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const body = b64u(te.encode(JSON.stringify({ aud, exp: exp || Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://efem-code.github.io/oscar/' })));
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(head + '.' + body));
    return `${head}.${body}.${b64u(sig)}`;
  }

  /* RFC 8291 aes128gcm, single record. */
  async function encrypt(sub, text) {
    const uaPub = unb64u(sub.p256dh), authSecret = unb64u(sub.auth);
    const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
    const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
    const hkdf = async (salt, ikm, info, bytes) => new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));
    const ikm = await hkdf(authSecret, ecdh, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(te.encode(text), new Uint8Array([2]))));
    const rs = new Uint8Array([0, 0, 16, 0]);                       // record size 4096
    return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
  }

  /* ---- this phone ---- */
  const myId = () => 'sub-' + Store.dev;
  const enabled = () => !!Store.get(myId());

  /* Must run from a tap (iOS asks for permission only then). */
  async function enable() {
    if (!supported()) throw new Error(/iPhone|iPad/.test(navigator.userAgent)
      ? 'On iPhone, notifications only work in the app added to the Home Screen (iOS 16.4 or later).'
      : 'This browser can’t do push notifications.');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Notifications are blocked — allow them in the phone’s settings for this app.');
    const v = await vapid();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && Store.get(myId())?.vapidPub !== v.pub) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(v.pub) });
    const j = sub.toJSON();
    await Store.put({ id: myId(), kind: 'pushsub', endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, vapidPub: v.pub, name: Store.who() });
    Drive.soon(500);
  }

  async function disable() {
    try { const s = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); s && await s.unsubscribe(); } catch {}
    if (Store.get(myId())) await Store.remove(myId());
  }

  /* If the synced key changed under us (both phones made one at once), re-subscribe quietly. */
  async function check() {
    const mine = Store.get(myId()), v = Store.get('vapid');
    if (!mine || !v || mine.vapidPub === v.pub || !supported() || Notification.permission !== 'granted') return;
    try { await enable(); } catch {}
  }

  /* Tokens for the 8 am reminder, signed ahead of time (the script can't sign).
     One per push service per day; each expires that evening. */
  async function presign() {
    const v = Store.get('vapid'); if (!v) return;
    const auds = [...new Set(Store.list('pushsub', s => s.vapidPub === v.pub).map(s => new URL(s.endpoint).origin))];
    if (!auds.length) return;
    const days = []; for (let i = 0; i < 14; i++) { const d = new Date(); d.setDate(d.getDate() + i); days.push(dayKey(d)); }
    const cur = Store.get('pushjwt');
    if (cur && cur.pub === v.pub && auds.every(a => cur.tokens?.[a]?.[days[7]])) return;   // a week of runway left
    const tokens = {};
    for (const a of auds) {
      tokens[a] = {};
      for (const d of days) tokens[a][d] = await jwt(a, v, Math.floor((parseDay(d).getTime() + 20 * 36e5) / 1000));
    }
    await Store.put({ id: 'pushjwt', kind: 'config', pub: v.pub, tokens });
  }

  /* ---- sending ---- */
  async function send(title, body, { includeSelf = false, tag = 'oscar', url = './#memories' } = {}) {
    const v = Store.get('vapid');
    if (!v || !Drive.configured()) return 0;
    const subs = Store.list('pushsub', s => includeSelf || s.id !== myId()).filter(s => s.vapidPub === v.pub);
    let sent = 0;
    last.length = 0;
    for (const s of subs) {
      try {
        const aud = new URL(s.endpoint).origin;
        const payload = await encrypt(s, JSON.stringify({ title, body, tag, url }));
        const r = await Drive.relay(s.endpoint, {
          Authorization: `vapid t=${await jwt(aud, v)}, k=${v.pub}`,
          TTL: '86400', Urgency: 'normal', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        }, b64(payload));
        last.push({ to: s.name, status: r.status, text: r.text });
        if (r.status === 404 || r.status === 410) await Store.remove(s.id);   // that phone unsubscribed or reinstalled
        else if (r.status < 300) sent++;
      } catch { /* one phone failing shouldn't stop the others */ }
    }
    return sent;
  }

  /* After a sync: tell the others about photos/videos/milestones this phone added. */
  async function announce() {
    if (!Store.list('pushsub', s => s.id !== myId()).length) return;
    const fresh = Store.list('media', r => !r.doc && (r.src || r.dev) === Store.dev && r.thumbId && !r.announced);
    const ms = Store.list('milestone', r => (r.src || r.dev) === Store.dev && !r.announced && r.created > (Store.pref('oscar.pushSince') || ''));
    const media = fresh.filter(r => r.created > (Store.pref('oscar.pushSince') || ''));
    // Anything older than turning notifications on is marked without announcing.
    for (const r of fresh.filter(r => !media.includes(r))) await Store.put({ id: r.id, announced: true });
    if (!media.length && !ms.length) return;
    const pet = App.pet(), who = Store.who();
    const photos = media.filter(r => !r.video).length, videos = media.filter(r => r.video).length;
    const bits = [photos && `${photos} photo${photos > 1 ? 's' : ''}`, videos && `${videos} video${videos > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    const title = ms.length ? `⭐ ${ms[0].title}` : `📸 New ${pet} ${photos && videos ? 'photos & videos' : videos ? 'video' + (videos > 1 ? 's' : '') : 'photo' + (photos > 1 ? 's' : '')}`;
    const body = ms.length ? `${who} added a milestone${bits ? ' and ' + bits : ''}` : `${who} added ${bits}${media.find(r => r.caption)?.caption ? ' — “' + media.find(r => r.caption).caption + '”' : ''}`;
    await send(title, body);
    for (const r of [...media, ...ms]) await Store.put({ id: r.id, announced: true });
  }

  const last = [];     // results of the latest send, for troubleshooting
  return { last, presign, _encrypt: encrypt, _jwt: jwt, supported, enabled, enable, disable, check, send, announce };
})();
