/* Oscar's local database (IndexedDB), and the rules that let two phones share it.

   Everything — a pee, a vet visit, a photo — is a record {id, kind, at, ...}.
   A change never edits in place across phones: each record carries `updated`
   and `dev` (the phone that last wrote it), and merging keeps the newest
   version. Deletes are tombstones ({deleted: true}) so they sync too.

   Records are grouped into monthly shards by the month they were created.
   Each phone uploads only its own writes, one Drive file per shard
   (log-<dev>-<YYYY-MM>.json), so two phones never write the same file and a
   sync only moves the months that changed. */
const Store = (() => {
  const get_ = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set_ = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  let dev = get_('oscar.device');
  if (!dev) { dev = Math.random().toString(36).slice(2, 10); set_('oscar.device', dev); }

  let db;
  const recs = new Map();
  const dirty = new Map();          // shard -> generation, so a write during upload isn't lost
  const listeners = new Set();
  let gen = 0;

  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const os = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
  const done = t => new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); });

  async function open() {
    const r = indexedDB.open('oscar', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('recs', { keyPath: 'id' });
      d.createObjectStore('blobs');                       // thumbs, portraits, not-yet-uploaded files
      d.createObjectStore('pending', { keyPath: 'id' });  // upload queue
      d.createObjectStore('kv');
    };
    db = await req(r);
    for (const rec of await req(os('recs').getAll())) recs.set(rec.id, rec);
    for (const k of (await kvGet('dirty')) || []) dirty.set(k, ++gen);
  }

  const kvGet = k => req(os('kv').get(k));
  const kvSet = (k, v) => req(os('kv', 'readwrite').put(v, k));

  /* The same app can be open twice at once — the installed app and a Chrome
     tab share this database but not memory. Each copy tells the others what
     it wrote, and sync re-reads the database first, so neither acts on a
     stale picture. (A stale copy once threw away a queued photo upload
     because it had never seen the photo.) */
  const bc = 'BroadcastChannel' in self ? new BroadcastChannel('oscar-store') : null;
  if (bc) bc.onmessage = async e => {
    for (const id of e.data.ids || []) { const r = await req(os('recs').get(id)); if (r) recs.set(id, r); }
    emit();
  };
  const tell = ids => { try { bc && bc.postMessage({ ids }); } catch {} };

  /* Reload everything from the database — call before acting on the whole set. */
  async function refresh() {
    for (const rec of await req(os('recs').getAll())) recs.set(rec.id, rec);
    for (const k of (await kvGet('dirty')) || []) if (!dirty.has(k)) dirty.set(k, ++gen);
  }
  const raw = id => req(os('recs').get(id));

  function emit() { for (const f of listeners) f(); }
  const onChange = f => listeners.add(f);

  const newId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  const who = () => get_('oscar.name') || 'Someone';

  async function markDirty(shard) {
    dirty.set(shard, ++gen);
    await kvSet('dirty', [...dirty.keys()]);
  }

  /* Create or update. Pass `id` to update; only the given fields change. */
  async function put(fields) {
    const now = new Date().toISOString();
    const old = fields.id ? recs.get(fields.id) : null;
    const rec = { ...(old || {}), ...fields };
    if (!old) {
      rec.id = rec.id || newId();
      rec.created = now;
      rec.shard = now.slice(0, 7);
      rec.at = rec.at || now;
      rec.author = who();
    }
    rec.updated = now;
    rec.dev = dev;
    rec.by = who();
    recs.set(rec.id, rec);
    await req(os('recs', 'readwrite').put(rec));
    await markDirty(rec.shard);
    tell([rec.id]);
    emit();
    return rec;
  }

  const remove = id => recs.has(id) ? put({ id, deleted: true }) : null;

  const newer = (a, b) => a.updated > b.updated || (a.updated === b.updated && a.dev > b.dev);

  /* Fold in records from another phone (or a backup). Returns how many changed. */
  async function merge(list) {
    const t = db.transaction('recs', 'readwrite');
    const s = t.objectStore('recs');
    const changed = [];
    for (const r of list) {
      if (!r || !r.id || !r.updated) continue;
      const cur = recs.get(r.id);
      if (!cur || newer(r, cur)) { recs.set(r.id, r); s.put(r); changed.push(r.id); }
    }
    await done(t);
    if (changed.length) { tell(changed); emit(); }
    return changed.length;
  }

  const get = id => { const r = recs.get(id); return r && !r.deleted ? r : null; };

  /* Live records of a kind, newest `at` first. */
  function list(kind, pred) {
    const out = [];
    for (const r of recs.values()) if (r.kind === kind && !r.deleted && (!pred || pred(r))) out.push(r);
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }

  const everything = () => [...recs.values()];

  /* ---- sync bookkeeping ---- */
  const dirtyShards = () => [...dirty.entries()];
  async function cleanShard(shard, g) {
    if (dirty.get(shard) === g) { dirty.delete(shard); await kvSet('dirty', [...dirty.keys()]); }
  }
  const ownShard = shard => [...recs.values()].filter(r => r.shard === shard && r.dev === dev);
  /* After joining a folder, re-upload everything this phone wrote. */
  async function markAllDirty() {
    for (const r of recs.values()) if (r.dev === dev) dirty.set(r.shard, ++gen);
    await kvSet('dirty', [...dirty.keys()]);
  }

  /* ---- blobs & upload queue ---- */
  const blobGet = k => req(os('blobs').get(k));
  const blobPut = (k, b) => req(os('blobs', 'readwrite').put(b, k));
  const blobDel = k => req(os('blobs', 'readwrite').delete(k));
  /* Drop every blob whose key starts with `prefix` (e.g. old full-size caches). */
  async function blobClear(prefix) {
    for (const k of await req(os('blobs').getAllKeys())) if (String(k).startsWith(prefix)) await req(os('blobs', 'readwrite').delete(k));
  }
  const pendAll = () => req(os('pending').getAll());
  const pendAdd = p => req(os('pending', 'readwrite').put(p));
  const pendDel = id => req(os('pending', 'readwrite').delete(id));

  return {
    open, onChange, put, remove, merge, get, list, everything, newId, who, refresh, raw,
    kvGet, kvSet, dirtyShards, cleanShard, ownShard, markAllDirty,
    blobGet, blobPut, blobDel, blobClear, pendAll, pendAdd, pendDel,
    get dev() { return dev; },
    pref: get_, setPref: set_,
  };
})();
