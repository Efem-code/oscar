/* Google Drive: the shared folder both phones sync through, and where every
   photo and video ends up.

   Folder layout (created by whoever sets it up, then shared):
     Oscar — Puppy Log/
       Photos & Videos/2026-10/…     ← browsable in Drive like a normal album
       Vet & Documents/…             ← invoice / record photos from vet visits
       _app data (don't edit)/       ← log-<phone>-<month>.json + thumbs

   There is no server. The phone talks to the Drive API directly with a
   short-lived token from Google sign-in. */
const Drive = (() => {
  const API = 'https://www.googleapis.com/drive/v3';
  const UP = 'https://www.googleapis.com/upload/drive/v3';
  /* Full Drive scope: the narrower drive.file scope can't see files the
     *other* person's phone created, which is the whole point. It is fine for
     a personal app kept in Google's "Testing" mode with both of you added as
     test users. */
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const FOLDER = 'application/vnd.google-apps.folder';
  const SUB = { media: 'Photos & Videos', docs: 'Vet & Documents', sync: "_app data (don't edit)" };

  const state = { status: 'off', msg: '', upload: null, last: null };
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f(state));
  const set = (status, msg = '') => { state.status = status; state.msg = msg; emit(); };

  let token = null, tokenExp = 0, busy = false, again = false, timer = null;
  try {
    const t = JSON.parse(localStorage.getItem('oscar.token') || 'null');
    if (t && t.exp > Date.now()) { token = t.tok; tokenExp = t.exp; }
  } catch {}

  class AuthNeeded extends Error {}
  const clientId = () => Store.pref('oscar.clientId') || GOOGLE_CLIENT_ID;
  const hasToken = () => !!token && Date.now() < tokenExp;

  function loadGsi() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = res;
      s.onerror = () => rej(new Error('Could not reach Google sign-in. Are you online?'));
      document.head.appendChild(s);
    });
  }

  /* Must be called from a tap — it opens Google's popup. */
  async function signIn() {
    if (!clientId()) throw new Error('Add your Google client ID first (More → Sync & sharing).');
    await loadGsi();
    await new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: clientId(),
        scope: SCOPE,
        login_hint: Store.pref('oscar.email') || undefined,
        callback: r => {
          if (r.error) return rej(new Error(r.error_description || r.error));
          token = r.access_token;
          tokenExp = Date.now() + (Number(r.expires_in) - 120) * 1000;
          Store.setPref('oscar.token', JSON.stringify({ tok: token, exp: tokenExp }));
          res();
        },
        error_callback: e => rej(new Error(e.message || e.type || 'Sign-in was closed')),
      });
      tc.requestAccessToken({ prompt: '' });
    });
    const me = await (await api('/about?fields=user(emailAddress,displayName)')).json();
    Store.setPref('oscar.email', me.user.emailAddress);
    set('idle');
    return me.user;
  }

  function signOut() {
    if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
    token = null; tokenExp = 0;
    Store.setPref('oscar.token', '');
    set('off');
  }

  async function api(url, opts = {}) {
    if (!hasToken()) throw new AuthNeeded('Sign in to sync');
    const r = await fetch(url.startsWith('http') ? url : API + url, {
      ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.headers || {}) },
    });
    if (r.status === 401) { token = null; throw new AuthNeeded('Google sign-in expired'); }
    if (!r.ok) throw new Error(`Drive said ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r;
  }

  const qs = s => encodeURIComponent(s);
  const quote = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  async function find(q, fields = 'id,name,version,modifiedTime') {
    let out = [], page = '';
    do {
      const r = await (await api(`/files?q=${qs(q)}&fields=nextPageToken,files(${fields})&pageSize=1000`
        + `&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + page : ''}`)).json();
      out = out.concat(r.files || []);
      page = r.nextPageToken;
    } while (page);
    return out;
  }

  async function mkdir(name, parent, appProperties) {
    const r = await api('/files?fields=id&supportsAllDrives=true', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: parent ? [parent] : undefined, appProperties }),
    });
    return (await r.json()).id;
  }

  async function child(parent, name) {
    const f = await find(`'${parent}' in parents and name='${quote(name)}' and mimeType='${FOLDER}' and trashed=false`);
    return f.length ? f[0].id : mkdir(name, parent);
  }

  /* ---- the shared folder ---- */
  async function folders() {
    const f = (await Store.kvGet('folders')) || {};
    if (!f.root) throw new Error('No shared folder yet');
    if (!f.media || !f.docs || !f.sync) {
      f.media = f.media || await child(f.root, SUB.media);
      f.docs = f.docs || await child(f.root, SUB.docs);
      f.sync = f.sync || await child(f.root, SUB.sync);
      await Store.kvSet('folders', f);
    }
    return f;
  }
  const folderId = async () => ((await Store.kvGet('folders')) || {}).root || null;

  async function createFolder(petName) {
    const root = await mkdir(`${petName || 'Puppy'} — Puppy Log`, null, { puppyLog: 'root' });
    await Store.kvSet('folders', { root });
    await Store.kvSet('seen', {});
    await folders();
    await Store.markAllDirty();
    return root;
  }

  /* Folders this account can see that the app made — including ones the
     other person shared with you. Name search is the fallback in case the
     folder was renamed or appProperties didn't carry over. */
  async function findFolders() {
    const a = await find(`appProperties has { key='puppyLog' and value='root' } and trashed=false`, 'id,name,owners(displayName,emailAddress)');
    const b = await find(`name contains 'Puppy Log' and mimeType='${FOLDER}' and trashed=false`, 'id,name,owners(displayName,emailAddress)');
    const seen = new Set(), out = [];
    for (const f of [...a, ...b]) if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
    return out;
  }

  async function joinFolder(id) {
    await Store.kvSet('folders', { root: id });
    await Store.kvSet('seen', {});
    await folders();
    await Store.markAllDirty();
  }

  async function share(email) {
    const root = await folderId();
    await api(`/files/${root}/permissions?sendNotificationEmail=true&supportsAllDrives=true`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'user', emailAddress: email }),
    });
  }

  async function monthFolder(mediaRoot, ym) {
    const key = 'mf:' + mediaRoot + ':' + ym;
    let id = await Store.kvGet(key);
    if (!id) { id = await child(mediaRoot, ym); await Store.kvSet(key, id); }
    return id;
  }

  /* ---- files ---- */
  async function putJson(name, body, id, parent) {
    const b = 'pup' + Math.random().toString(36).slice(2);
    const meta = id ? {} : { name, parents: [parent], mimeType: 'application/json' };
    const payload = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`
      + `--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
    const r = await api(`${UP}/files${id ? '/' + id : ''}?uploadType=multipart&fields=id&supportsAllDrives=true`, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${b}` },
      body: payload,
    });
    return (await r.json()).id;
  }

  /* Resumable upload so a big video reports progress and survives Drive's
     multipart size limit. */
  async function upload(blob, name, mime, parent, onProgress) {
    const init = await api(`${UP}/files?uploadType=resumable&fields=id&supportsAllDrives=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime || 'application/octet-stream',
        'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify({ name, parents: [parent] }),
    });
    const loc = init.headers.get('Location');
    if (!loc) throw new Error('Drive did not start the upload');
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('PUT', loc);
      x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        if (x.status >= 200 && x.status < 300) { try { res(JSON.parse(x.responseText).id); } catch { rej(new Error('Bad upload reply')); } }
        else rej(new Error('Upload failed (' + x.status + ')'));
      };
      x.onerror = () => rej(new Error('Upload interrupted'));
      x.send(blob);
    });
  }

  const download = async id => (await api(`/files/${id}?alt=media&supportsAllDrives=true`)).blob();

  async function trash(id) {
    try {
      await api(`/files/${id}?supportsAllDrives=true`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
      });
    } catch { /* not ours to trash, or offline — the record is gone either way */ }
  }

  /* ---- sync ---- */
  async function pull(f) {
    const files = await find(`'${f.sync}' in parents and trashed=false and name contains 'log-'`);
    const seen = (await Store.kvGet('seen')) || {};
    const mine = `log-${Store.dev}-`;
    for (const file of files) {
      if (file.name.startsWith(mine) || seen[file.id] === file.version) continue;
      const data = await (await api(`/files/${file.id}?alt=media&supportsAllDrives=true`)).json();
      await Store.merge(data.recs || []);
      seen[file.id] = file.version;
    }
    await Store.kvSet('seen', seen);
    return files;
  }

  async function push(f, files) {
    const ids = (await Store.kvGet('myfiles')) || {};
    for (const [shard, g] of Store.dirtyShards()) {
      const name = `log-${Store.dev}-${shard}.json`;
      const existing = ids[shard] || files.find(x => x.name === name)?.id;
      const body = JSON.stringify({ v: 1, dev: Store.dev, by: Store.who(), shard, recs: Store.ownShard(shard) });
      ids[shard] = await putJson(name, body, existing, f.sync);
      await Store.kvSet('myfiles', ids);
      await Store.cleanShard(shard, g);
    }
  }

  async function flushUploads(f) {
    // Thumbnails first: the other phone sees a new photo long before a big video finishes.
    const queue = (await Store.pendAll()).sort((a, b) => (a.role === 'thumb' ? 0 : 1) - (b.role === 'thumb' ? 0 : 1));
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      const rec = Store.get(p.recId);
      if (!rec) { await Store.pendDel(p.id); continue; }
      const parent = p.role === 'thumb' ? f.sync : p.doc ? f.docs : await monthFolder(f.media, p.ym);
      state.upload = { name: p.name, n: i + 1, of: queue.length, frac: 0 }; emit();
      const id = await upload(p.blob, p.name, p.mime, parent, frac => { state.upload.frac = frac; emit(); });
      await Store.put({ id: rec.id, [p.role === 'thumb' ? 'thumbId' : 'driveId']: id });
      await Store.pendDel(p.id);
    }
    state.upload = null;
  }

  async function sync() {
    if (busy) { again = true; return; }
    if (!(await folderId())) { set(hasToken() ? 'nofolder' : 'off'); return; }
    if (!hasToken()) { set('auth', 'Tap to sign in and sync'); return; }
    if (!navigator.onLine) { set('offline', 'Offline — saved on this phone'); return; }
    busy = true; set('syncing');
    try {
      const f = await folders();
      const files = await pull(f);
      await flushUploads(f);
      await push(f, files);
      state.last = Date.now();
      set('idle');
    } catch (e) {
      state.upload = null;
      if (e instanceof AuthNeeded) set('auth', 'Tap to sign in and sync');
      else set('error', e.message);
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(sync, 500); }
    }
  }

  /* Debounced: logging five things in a row makes one upload, not five. */
  function soon(ms = 4000) { clearTimeout(timer); timer = setTimeout(sync, ms); }

  return {
    state, onChange: f => listeners.add(f), signIn, signOut, hasToken, clientId,
    createFolder, findFolders, joinFolder, share, folderId,
    sync, soon, download, trash, AuthNeeded,
    webLink: id => `https://drive.google.com/file/d/${id}/view`,
    folderLink: id => `https://drive.google.com/drive/folders/${id}`,
  };
})();
