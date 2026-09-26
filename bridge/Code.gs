/* Puppy Log bridge — a Google Apps Script web app that lets the phones save
   into your Drive folder without any Google Cloud setup or sign-in.

   It runs as you (the person who deploys it), so everything lands in your
   Drive. The phones only ever send it a connection key; anyone without the
   key gets "Wrong key".

   Setup: script.google.com → New project → paste this file → fill in the two
   lines below → Deploy → New deployment → Web app, Execute as: Me,
   Who has access: Anyone → Deploy → Authorize. */

const FOLDER_ID = 'PASTE_FOLDER_ID';   // the part after /folders/ in the folder's link
const SECRET = 'PASTE_A_LONG_RANDOM_KEY';

const SUB = { media: 'Photos & Videos', docs: 'Vet & Documents', sync: "_app data (don't edit)" };

function doGet() {
  return ContentService.createTextOutput('Puppy Log bridge is running. Folder: ' + DriveApp.getFolderById(FOLDER_ID).getName());
}

function doPost(e) {
  let out;
  try {
    const q = JSON.parse(e.postData.contents);
    if (q.key !== SECRET) throw new Error('Wrong key — check the connection code');
    const fn = ACTIONS[q.action];
    if (!fn) throw new Error('Unknown action ' + q.action);
    out = fn(q) || {};
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function root_() { return DriveApp.getFolderById(FOLDER_ID); }
function child_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sub_(k) { return child_(root_(), SUB[k]); }
function parentFor_(q) {
  if (q.role === 'thumb') return sub_('sync');
  if (q.doc) return sub_('docs');
  return child_(sub_('media'), q.ym || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'));
}
function version_(f) { return f.getLastUpdated().getTime() + ':' + f.getSize(); }

const ACTIONS = {
  ping: () => {
    const r = root_();
    sub_('media'); sub_('docs'); sub_('sync');
    return { folder: r.getName(), folderId: r.getId() };
  },

  /* Every log file, plus the text of the ones the phone hasn't seen yet. */
  pull: q => {
    const seen = q.seen || {}, skip = q.skip || '', files = [];
    const it = sub_('sync').getFiles();
    while (it.hasNext()) {
      const f = it.next(), name = f.getName();
      if (name.indexOf('log-') !== 0) continue;
      const v = version_(f), row = { id: f.getId(), name: name, version: v };
      if (seen[row.id] !== v && name.indexOf(skip) !== 0) row.text = f.getBlob().getDataAsString('UTF-8');
      files.push(row);
    }
    return { files: files };
  },

  write: q => {
    const lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      let f = null;
      if (q.id) { try { f = DriveApp.getFileById(q.id); } catch (e) { f = null; } }
      if (!f) { const it = sub_('sync').getFilesByName(q.name); f = it.hasNext() ? it.next() : null; }
      if (f) f.setContent(q.text);
      else f = sub_('sync').createFile(q.name, q.text, 'application/json');
      return { id: f.getId() };
    } finally { lock.releaseLock(); }
  },

  /* Small files in one go. */
  put: q => {
    const blob = Utilities.newBlob(Utilities.base64Decode(q.b64), q.mime, q.name);
    return { id: parentFor_(q).createFile(blob).getId() };
  },

  /* Big files (videos): a Drive resumable upload, fed in chunks. */
  upStart: q => {
    const r = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': q.mime, 'X-Upload-Content-Length': String(q.size) },
      payload: JSON.stringify({ name: q.name, parents: [parentFor_(q).getId()] }),
    });
    if (r.getResponseCode() !== 200) throw new Error('Drive would not start the upload: ' + r.getContentText().slice(0, 200));
    const h = r.getAllHeaders();
    return { session: h.Location || h.location };
  },
  upChunk: q => {
    const bytes = Utilities.base64Decode(q.b64);
    const r = UrlFetchApp.fetch(q.session, {
      method: 'put', contentType: 'application/octet-stream', payload: bytes, muteHttpExceptions: true, followRedirects: false,
      headers: { 'Content-Range': 'bytes ' + q.offset + '-' + (q.offset + bytes.length - 1) + '/' + q.size },
    });
    const c = r.getResponseCode();
    if (c === 200 || c === 201) return { done: true, id: JSON.parse(r.getContentText()).id };
    if (c === 308) return { done: false };
    throw new Error('Upload chunk failed (' + c + '): ' + r.getContentText().slice(0, 200));
  },

  download: q => {
    const f = DriveApp.getFileById(q.id);
    if (f.getSize() > 30 * 1024 * 1024) throw new Error('Too big to load here — open it in Drive');
    const b = f.getBlob();
    return { b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() };
  },

  trash: q => { DriveApp.getFileById(q.id).setTrashed(true); return {}; },
};

/* Run this once from the editor (select "authorize" → Run) if Deploy doesn't
   ask for permissions. It just touches Drive and UrlFetch so both get granted. */
function authorize() {
  Logger.log(root_().getName());
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis', { muteHttpExceptions: true });
}
