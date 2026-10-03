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
      headers: Object.assign({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': q.mime, 'X-Upload-Content-Length': String(q.size) },
        // Naming the app's origin lets the phone send the file straight to Google (CORS) instead of through here.
        /^https:\/\/efem-code\.github\.io$/.test(q.origin || '') ? { Origin: q.origin } : {}),
      payload: JSON.stringify({ name: q.name, parents: [parentFor_(q).getId()] }),
    });
    if (r.getResponseCode() !== 200) throw new Error('Drive would not start the upload: ' + r.getContentText().slice(0, 200));
    const h = r.getAllHeaders();
    return { session: h.Location || h.location, cors: /^https:\/\/efem-code\.github\.io$/.test(q.origin || '') };
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

  /* The text of the latest scheduled notification, for the phones' service workers. */
  msg: () => ({ msg: JSON.parse(PropertiesService.getScriptProperties().getProperty('msg') || 'null') }),
  summaryNow: q => ({ result: eveningSummary(!!q.dry) }),

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


/* ---- scheduled notifications ----
   The phones pre-sign one push token per day (the script can't do P-256), so
   every notification is an empty push; the phone's service worker then asks
   for the text with the `msg` action. */
const TZ_ = () => Session.getScriptTimeZone();
const day_ = (d) => Utilities.formatDate(d || new Date(), TZ_(), 'yyyy-MM-dd');
const all_ = recs => Object.keys(recs).map(k => recs[k]).filter(r => !r.deleted);

function sendAll_(msg, dry) {
  const recs = loadRecs_(), v = recs.vapid, tok = recs.pushjwt, today = day_();
  if (!v || !tok || tok.pub !== v.pub) return 'no push tokens yet';
  if (dry) return 'would send: ' + msg.title + ' — ' + msg.body;
  msg.at = Date.now();
  PropertiesService.getScriptProperties().setProperty('msg', JSON.stringify(msg));
  const out = [];
  all_(recs).filter(r => r.kind === 'pushsub' && r.vapidPub === v.pub).forEach(s => {
    const aud = s.endpoint.match(/^https:\/\/[^/]+/)[0], jwt = tok.tokens && tok.tokens[aud] && tok.tokens[aud][today];
    if (!jwt) { out.push(s.name + ': no token for ' + today); return; }
    const r = UrlFetchApp.fetch(s.endpoint, { method: 'post', payload: '', muteHttpExceptions: true,
      headers: { Authorization: 'vapid t=' + jwt + ', k=' + v.pub, TTL: '3600', Urgency: 'high' } });
    out.push(s.name + ': ' + r.getResponseCode());
  });
  return out.join('; ') || 'no phones subscribed';
}

const clock_ = t => { if (!t) return ''; const p = t.split(':').map(Number); return ((p[0] + 11) % 12 + 1) + ':' + ('0' + p[1]).slice(-2) + (p[0] < 12 ? ' am' : ' pm'); };

/* 8 am: appointments, classes and health items due today/tomorrow (or overdue). */
function morningMessage_(recs) {
  const today = day_(), tomorrow = day_(new Date(Date.now() + 864e5)), rs = all_(recs);
  const pet = (recs.profile || {}).name || 'Your puppy';
  const when = d => d < today ? 'overdue' : d === today ? 'today' : 'tomorrow';
  const appts = rs.filter(r => r.kind === 'appt' && !r.visitId && !r.cancelled && (r.day === today || r.day === tomorrow)).sort((a, b) => (a.day + (a.time || '')) < (b.day + (b.time || '')) ? -1 : 1);
  const lessons = rs.filter(r => r.kind === 'lesson' && !r.done && (r.due === today || r.due === tomorrow)).sort((a, b) => a.due < b.due ? -1 : 1);
  const due = rs.filter(r => r.kind === 'health' && !r.done && r.due && r.due <= tomorrow).sort((a, b) => a.due < b.due ? -1 : 1);
  const also = due.length ? '\nAlso: ' + due.length + ' health item' + (due.length > 1 ? 's' : '') + ' due' : '';
  if (appts.length) { const a = appts[0];
    return { title: '📅 ' + pet + ': ' + (a.reason || a.type || 'Appointment') + ' ' + when(a.day) + (a.time ? ' at ' + clock_(a.time) : ''),
      body: [a.clinic, a.vet && 'with ' + a.vet, a.bring && 'Bring/ask: ' + a.bring].filter(Boolean).join(' · ') + also, tag: 'appt', url: './#health' }; }
  if (lessons.length) { const l = lessons[0], c = recs[l.classId] || {};
    return { title: '🎓 ' + (c.name || 'Training class') + ' ' + when(l.due) + ((l.time || c.time) ? ' at ' + clock_(l.time || c.time) : ''),
      body: [c.place, c.trainer && 'with ' + c.trainer, c.bring && 'Bring: ' + c.bring].filter(Boolean).join(' · ') + also, tag: 'class', url: './#grow' }; }
  if (due.length) return { title: '💉 ' + pet + ': ' + (due.length === 1 ? due[0].name + ' due ' + when(due[0].due) : due.length + ' health items due'),
    body: due.slice(0, 4).map(r => r.name + ' — ' + when(r.due)).join('\n'), tag: 'health', url: './#health' };
  return null;
}

function dailyReminders(dry) {
  const m = morningMessage_(loadRecs_());
  return m ? sendAll_(m, dry) : 'nothing due';
}

/* Meal times from the current food plan, e.g. "7am, 12pm, 5:30 pm" or "07:00, 17:00". */
function mealTimes_(recs) {
  const food = all_(recs).filter(r => r.kind === 'food').sort((a, b) => a.at < b.at ? 1 : -1)[0];
  if (!food || !food.times) return [];
  const out = [], re = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/gi; let m;
  while ((m = re.exec(food.times))) {
    let h = Number(m[1]); const min = Number(m[2] || 0), ap = (m[3] || '').toLowerCase();
    if (ap.charAt(0) === 'p' && h < 12) h += 12;
    if (ap.charAt(0) === 'a' && h === 12) h = 0;
    if (h < 24 && min < 60) out.push(('0' + h).slice(-2) + ':' + ('0' + min).slice(-2));
  }
  return out;
}

/* Local wall-clock time today in the script's time zone, as a Date. */
function at_(hhmm) {
  const off = Utilities.formatDate(new Date(), TZ_(), 'XXX');
  return new Date(day_() + 'T' + hhmm + ':00' + off);
}

/* 5 am: schedule today's one-off checks (meals, 9 pm summary). One-off triggers
   linger after firing, so yesterday's are cleared first. */
function planDay() {
  ScriptApp.getProjectTriggers().forEach(t => { if (['mealCheck', 'eveningSummary'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  const times = mealTimes_(loadRecs_()), now = Date.now(), planned = [];
  times.forEach(t => { const when = at_(t).getTime() + 30 * 6e4; if (when > now) { ScriptApp.newTrigger('mealCheck').timeBased().at(new Date(when)).create(); planned.push(t); } });
  if (at_('21:00').getTime() > now) ScriptApp.newTrigger('eveningSummary').timeBased().at(at_('21:00')).create();
  PropertiesService.getScriptProperties().setProperty('meals', JSON.stringify(times));
  return 'meals ' + (planned.join(', ') || 'none left today') + ' · summary 9 pm';
}

/* Half an hour after each meal time: nudge both phones if nobody logged it. */
function mealCheck() {
  const recs = loadRecs_(), now = Date.now();
  const times = mealTimes_(recs).map(t => ({ t: t, ms: at_(t).getTime() })).filter(x => x.ms <= now).sort((a, b) => b.ms - a.ms);
  if (!times.length) return 'no meal due';
  const slot = times[0];
  const fed = all_(recs).some(r => r.kind === 'log' && r.type === 'meal' && new Date(r.at).getTime() >= slot.ms - 90 * 6e4);
  if (fed) return 'fed';
  const pet = (recs.profile || {}).name || 'Your puppy';
  return sendAll_({ title: '🍖 ' + pet + '’s ' + clock_(slot.t) + ' meal', body: 'Nobody has logged it yet — tap Meal once he’s fed.', tag: 'meal', url: './#today' });
}

/* 9 pm: the day in one line, sent to both phones. */
function eveningSummary(dry) {
  const recs = loadRecs_(), today = day_(), rs = all_(recs);
  const logs = rs.filter(r => r.kind === 'log' && day_(new Date(r.at)) === today);
  if (!logs.length) return 'nothing logged today';
  const n = t => logs.filter(r => r.type === t).length;
  const walks = logs.filter(r => r.type === 'walk'), walkMin = walks.reduce((a, r) => a + (Number(r.minutes) || 0), 0);
  const ev = rs.filter(r => r.kind === 'log' && (r.type === 'sleep' || r.type === 'wake')).sort((a, b) => a.at < b.at ? -1 : 1);
  const start = at_('00:00').getTime(), end = Date.now(); let sleep = 0, from = null;
  ev.forEach(e => { const t = new Date(e.at).getTime();
    if (e.type === 'sleep' && from === null) from = t;
    else if (e.type === 'wake' && from !== null) { sleep += Math.max(0, Math.min(t, end) - Math.max(from, start)); from = null; } });
  if (from !== null) sleep += Math.max(0, end - Math.max(from, start));
  const food = rs.filter(r => r.kind === 'food').sort((a, b) => a.at < b.at ? 1 : -1)[0];
  const pet = (recs.profile || {}).name || 'Your puppy';
  const bits = ['💧 ' + n('pee'), '💩 ' + n('poop'), (n('accident') ? '⚠️ ' + n('accident') + ' accident' + (n('accident') > 1 ? 's' : '') : '✅ no accidents'),
    '🍖 ' + n('meal') + (food && food.mealsPerDay ? '/' + food.mealsPerDay : '') + ' meals',
    walks.length ? '🦮 ' + walks.length + ' walk' + (walks.length > 1 ? 's' : '') + (walkMin ? ' (' + walkMin + ' min)' : '') : '',
    sleep ? '😴 ' + (sleep / 36e5).toFixed(1) + ' h sleep' : ''].filter(Boolean);
  return sendAll_({ title: '🌙 ' + pet + '’s day', body: bits.join(' · '), tag: 'summary', url: './#today' }, dry);
}

function setupReminders() {
  ScriptApp.getProjectTriggers().forEach(t => { if (['dailyReminders', 'planDay'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyReminders').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('planDay').timeBased().everyDays(1).atHour(5).create();
  return 'reminders 8 am, planner 5 am (' + TZ_() + ') · today: ' + planDay();
}

/* Run this once from the editor (select "authorize" → Run) if Deploy doesn't
   ask for permissions. It just touches Drive and UrlFetch so both get granted. */
function authorize() {
  Logger.log(root_().getName());
  UrlFetchApp.fetch('https://www.googleapis.com/discovery/v1/apis', { muteHttpExceptions: true });
}
