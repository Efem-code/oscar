/* Google Drive, through the Puppy Log bridge (bridge/Code.gs).

   The bridge is a small Google Apps Script web app deployed from your own
   Google account. It saves into your Oscar folder as you, so the phones need
   no Google sign-in and no Cloud project — just the bridge URL and its key,
   bundled into one "connection code".

   Folder layout inside the shared folder:
     Photos & Videos/2026-10/…     ← browsable in Drive like a normal album
     Vet & Documents/…             ← invoice / record photos from vet visits
     _app data (don't edit)/       ← log-<phone>-<month>.json + thumbnails */
const Drive = (() => {
  const state = { status: 'off', msg: '', upload: null, last: null };
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f(state));
  const set = (status, msg = '') => { state.status = status; state.msg = msg; emit(); };

  let busy = false, again = false, timer = null;
  const url = () => Store.pref('oscar.bridge') || '';
  const key = () => Store.pref('oscar.key') || '';
  const configured = () => !!(url() && key());

  /* Apps Script answers a plain-text POST with a redirect to a page that
     allows any origin, so no CORS preflight is involved. */
  async function call(action, params = {}) {
    let r;
    try {
      r = await fetch(url(), {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key: key(), action, ...params }),
      });
    } catch { throw new Error(navigator.onLine ? 'Couldn’t reach the bridge' : 'Offline'); }
    let j;
    try { j = await r.json(); } catch { throw new Error('The bridge didn’t answer properly — is it deployed with access “Anyone”?'); }
    if (!j.ok) throw new Error(j.error || 'Bridge error');
    return j;
  }

  /* A connection code is base64 of {u: url, k: key}. Also accepts a full
     link with #connect=<code>. */
  function parseCode(text) {
    const s = String(text || '').trim();
    const code = (s.match(/connect=([\w\-+/=]+)/) || [, s])[1];
    try {
      const j = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
      if (j.u && j.k && /^https:\/\/script\.google\.com\//.test(j.u)) return j;
    } catch {}
    throw new Error('That isn’t a Puppy Log connection code');
  }

  async function connect(text) {
    const { u, k } = parseCode(text);
    const oldU = url(), oldK = key();
    Store.setPref('oscar.bridge', u); Store.setPref('oscar.key', k);
    try {
      const r = await call('ping');
      Store.setPref('oscar.folder', r.folderId);
      Store.setPref('oscar.folderName', r.folder);
      await Store.kvSet('seen', {});
      await Store.markAllDirty();
      return r.folder;
    } catch (e) {
      Store.setPref('oscar.bridge', oldU); Store.setPref('oscar.key', oldK);
      throw e;
    }
  }

  function disconnect() {
    Store.setPref('oscar.bridge', ''); Store.setPref('oscar.key', '');
    set('off');
  }

  /* ---- files ---- */
  const b64 = blob => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });

  const SMALL = 5 * 1024 * 1024;
  const CHUNK = 4 * 1024 * 1024;          // a multiple of 256 KB, as Drive requires

  async function upload(p, onProgress) {
    const meta = { name: p.name, mime: p.mime || 'application/octet-stream', role: p.role, doc: !!p.doc, ym: p.ym };
    if (p.blob.size <= SMALL) {
      const r = await call('put', { ...meta, b64: await b64(p.blob) });
      onProgress(1);
      return r.id;
    }
    const { session } = await call('upStart', { ...meta, size: p.blob.size });
    for (let off = 0; off < p.blob.size; off += CHUNK) {
      const r = await call('upChunk', { session, offset: off, size: p.blob.size, b64: await b64(p.blob.slice(off, off + CHUNK)) });
      onProgress(Math.min(1, (off + CHUNK) / p.blob.size));
      if (r.done) return r.id;
    }
    throw new Error('Upload ended early');
  }

  async function download(id) {
    const r = await call('download', { id });
    return (await fetch(`data:${r.mime};base64,${r.b64}`)).blob();
  }

  async function trash(id) {
    try { await call('trash', { id }); } catch { /* offline or already gone — the record is deleted either way */ }
  }

  /* ---- sync ---- */
  async function pull() {
    const seen = (await Store.kvGet('seen')) || {};
    const { files } = await call('pull', { seen, skip: `log-${Store.dev}-` });
    for (const f of files) {
      if (f.text == null) continue;
      try { await Store.merge(JSON.parse(f.text).recs || []); } catch { continue; }
      seen[f.id] = f.version;
    }
    await Store.kvSet('seen', seen);
    return files;
  }

  async function push(files) {
    const ids = (await Store.kvGet('myfiles')) || {};
    for (const [shard, g] of Store.dirtyShards()) {
      const name = `log-${Store.dev}-${shard}.json`;
      const text = JSON.stringify({ v: 1, dev: Store.dev, by: Store.who(), shard, recs: Store.ownShard(shard) });
      ids[shard] = (await call('write', { name, text, id: ids[shard] || files.find(x => x.name === name)?.id })).id;
      await Store.kvSet('myfiles', ids);
      await Store.cleanShard(shard, g);
    }
  }

  async function flushUploads() {
    // Thumbnails first: the other phone sees a new photo long before a big video finishes.
    const queue = (await Store.pendAll()).sort((a, b) => (a.role === 'thumb' ? 0 : 1) - (b.role === 'thumb' ? 0 : 1));
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      const rec = Store.get(p.recId);
      if (!rec) { await Store.pendDel(p.id); continue; }
      state.upload = { name: p.name, n: i + 1, of: queue.length, frac: 0 }; emit();
      const id = await upload(p, frac => { state.upload.frac = frac; emit(); });
      await Store.put({ id: rec.id, [p.role === 'thumb' ? 'thumbId' : 'driveId']: id });
      await Store.pendDel(p.id);
    }
    state.upload = null;
  }

  async function sync() {
    if (busy) { again = true; return; }
    if (!configured()) { set('off'); return; }
    if (!navigator.onLine) { set('offline', 'Offline — saved on this phone'); return; }
    busy = true; set('syncing');
    try {
      const files = await pull();
      await push(files);          // logs before media, so a slow video never holds up a pee log
      await flushUploads();
      await push(files);          // the new Drive ids from the uploads
      state.last = Date.now();
      set('idle');
    } catch (e) {
      state.upload = null;
      set('error', e.message);
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(sync, 500); }
    }
  }

  /* Debounced: logging five things in a row makes one upload, not five. */
  function soon(ms = 4000) { clearTimeout(timer); timer = setTimeout(sync, ms); }

  /* Handle a #connect=… link opened on this device. */
  async function fromHash() {
    if (!/connect=/.test(location.hash)) return null;
    const h = location.hash;
    history.replaceState(null, '', location.pathname + location.search);
    return connect(h);
  }

  return {
    state, onChange: f => listeners.add(f), configured, connect, disconnect, fromHash,
    sync, soon, download, trash,
    folderName: () => Store.pref('oscar.folderName') || '',
    webLink: id => `https://drive.google.com/file/d/${id}/view`,
    folderLink: () => Store.pref('oscar.folder') ? `https://drive.google.com/drive/folders/${Store.pref('oscar.folder')}` : '',
  };
})();
