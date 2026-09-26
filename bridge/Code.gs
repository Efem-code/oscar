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
      if (seen[row.id] !== v && !(skip && name.indexOf(skip) === 0)) row.text = f.getBlob().getDataAsString('UTF-8');
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

  /* Big files come back in pieces, read straight from Drive with a byte range. */
  dlPart: q => {
    const len = Math.min(q.len || 3145728, 4194304);
    const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(q.id) + '?alt=media&supportsAllDrives=true', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), Range: 'bytes=' + q.offset + '-' + (q.offset + len - 1) },
      muteHttpExceptions: true,
    });
    const c = r.getResponseCode();
    if (c === 416) return { b64: '', size: q.offset };
    if (c !== 206 && c !== 200) throw new Error('Drive download failed (' + c + ')');
    const h = r.getAllHeaders(), cr = h['Content-Range'] || h['content-range'] || '';
    const bytes = r.getContent();
    return { b64: Utilities.base64Encode(bytes), size: cr ? Number(cr.split('/')[1]) : q.offset + bytes.length };
  },

  download: q => {
    const f = DriveApp.getFileById(q.id);
    if (f.getSize() > 30 * 1024 * 1024) throw new Error('Too big to load here — open it in Drive');
    const b = f.getBlob();
    return { b64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() };
  },

  /* Relay a Web Push message (encrypted and signed on the phone). Push
     services refuse requests straight from a web page, so they go via here. */
  push: q => {
    const host = String(q.endpoint).match(/^https:\/\/([^/]+)\//);
    if (!host || !/(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(host[1])) throw new Error('Not a push service');
    const headers = Object.assign({}, q.headers), type = headers['Content-Type'];
    delete headers['Content-Type'];
    const r = UrlFetchApp.fetch(q.endpoint, { method: 'post', contentType: type, headers: headers, payload: Utilities.base64Decode(q.b64), muteHttpExceptions: true });
    return { status: r.getResponseCode(), text: r.getContentText().slice(0, 200) };
  },

  /* Daily reminders: what would be sent (dry) or send now; and install the 8 am trigger. */
  reminders: q => ({ result: dailyReminders(!!q.dry) }),
  setupReminders: () => ({ result: setupReminders() }),

  trash: q => { DriveApp.getFileById(q.id).setTrashed(true); return {}; },
};

/* ---- daily health reminders ----
   Runs at 8 am from a time trigger. Reads the synced records, and if a vaccine,
   dose or check-up is due today/tomorrow (or overdue), sends an empty Web Push
   to each phone. The phone's service worker reads its own copy of the data to
   say exactly what's due. Push tokens are pre-signed by the phones (the script
   can't do the P-256 signing itself), one per day, two weeks ahead. */
function loadRecs_() {
  const map = {}, it = sub_('sync').getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf('log-') !== 0) continue;
    let d; try { d = JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { continue; }
    (d.recs || []).forEach(r => {
      const c = map[r.id];
      if (!c || r.updated > c.updated || (r.updated === c.updated && r.dev > c.dev)) map[r.id] = r;
    });
  }
  return map;
}

function dailyReminders(dry) {
  const recs = loadRecs_(), tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 864e5), tz, 'yyyy-MM-dd');
  const due = Object.keys(recs).map(k => recs[k]).filter(r => !r.deleted && !r.done && r.due && ((r.kind === 'health' && r.due <= tomorrow) || (r.kind === 'lesson' && (r.due === today || r.due === tomorrow)))
    || (r.kind === 'appt' && !r.deleted && !r.visitId && !r.cancelled && (r.day === today || r.day === tomorrow)));
  if (!due.length) return 'nothing due';
  const v = recs.vapid, tok = recs.pushjwt;
  if (!v || !tok || tok.pub !== v.pub) return 'no push tokens yet';
  const subs = Object.keys(recs).map(k => recs[k]).filter(r => r.kind === 'pushsub' && !r.deleted && r.vapidPub === v.pub);
  const out = [];
  subs.forEach(s => {
    const aud = s.endpoint.match(/^https:\/\/[^/]+/)[0], jwt = tok.tokens && tok.tokens[aud] && tok.tokens[aud][today];
    if (!jwt) { out.push(s.name + ': no token for ' + today); return; }
    if (dry) { out.push(s.name + ': would send (' + due.length + ' due)'); return; }
    const r = UrlFetchApp.fetch(s.endpoint, { method: 'post', payload: '', muteHttpExceptions: true,
      headers: { Authorization: 'vapid t=' + jwt + ', k=' + v.pub, TTL: '43200', Urgency: 'normal' } });
    out.push(s.name + ': ' + r.getResponseCode());
  });
  return out.join('; ') || 'no phones subscribed';
}

function setupReminders() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'dailyReminders') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(8).create();
  return 'daily at 8 (' + Session.getScriptTimeZone() + ')';
}

/* Run this once from the editor (select "authorize" → Run) if Deploy doesn't
   ask for permissions. It just touches Drive and UrlFetch so both get granted. */
function authorize() {
  Logger.log(root_().getName());
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis', { muteHttpExceptions: true });
}
