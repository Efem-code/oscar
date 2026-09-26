/* Puppy Log — screens and interactions. Data rules live in store.js, Drive in
   drive.js, photos in media.js. Everything here re-renders from the Store. */

/* ---------- small helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const T = iso => new Date(iso).getTime();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dayKey(new Date());
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const localDay = iso => dayKey(new Date(iso));
const fmtTime = iso => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = s => s ? parseDay(s).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : '';
const fmtDate = s => s ? parseDay(s).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtWhen = iso => `${fmtDay(localDay(iso))}, ${fmtTime(iso)}`;
const toInput = iso => { const d = new Date(iso); return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromInput = v => new Date(v).toISOString();
const fmtMin = m => { m = Math.round(Math.abs(m)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`; };
const addUnit = (s, n, unit) => {
  const d = parseDay(s);
  if (unit === 'days') d.setDate(d.getDate() + n);
  else if (unit === 'weeks') d.setDate(d.getDate() + 7 * n);
  else if (unit === 'months') d.setMonth(d.getMonth() + n);
  return dayKey(d);
};
const daysUntil = s => Math.round((parseDay(s) - parseDay(todayKey())) / 864e5);
const money = n => n === '' || n == null ? '' : '$' + Number(n).toFixed(2);

/* ---------- Oscar ---------- */
const P = () => Store.get('profile') || {};
const App = {
  pet: () => P().name || 'Oscar',
  ageDays(at = Date.now()) {
    const b = P().birthday; if (!b) return null;
    return Math.floor((new Date(at) - parseDay(b)) / 864e5);
  },
  weekOf(at) { const d = App.ageDays(at); return d == null ? null : Math.floor(d / 7); },
  ageText() {
    const d = App.ageDays(); if (d == null) return '';
    if (d < 0) return `arrives in ${-d} days`;
    const w = Math.floor(d / 7), r = d % 7;
    if (w < 20) return `${w} weeks${r ? ' ' + r + (r === 1 ? ' day' : ' days') : ''} old`;
    const b = parseDay(P().birthday), n = new Date();
    let m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth();
    if (n.getDate() < b.getDate()) m--;
    return m < 24 ? `${m} months old` : `${Math.floor(m / 12)} years old`;
  },
  homeDay() { const h = P().homeDay; if (!h) return null; return Math.floor((parseDay(todayKey()) - parseDay(h)) / 864e5) + 1; },
};

/* ---------- potty countdown ---------- */
/* Start from the rule of thumb (about an hour per month of age while awake),
   then lean on what this puppy actually does: the median gap between potty
   trips over the last five days, tightened if accidents have been happening.
   Meals, water, waking up and play pull the next trip forward. */
function pottyStatus(now = Date.now()) {
  const logs = Store.list('log', r => T(r.at) <= now);
  const isPotty = r => LOG[r.type]?.potty;
  const last = logs.find(isPotty);
  const sleepEv = logs.find(r => r.type === 'sleep' || r.type === 'wake');
  const asleep = sleepEv?.type === 'sleep';

  const ageM = App.ageDays() != null ? App.ageDays() / 30.4 : 3;
  const base = clamp(Math.round(ageM * 60), 45, 480);

  const recent = logs.filter(r => isPotty(r) && T(r.at) > now - 5 * 864e5).reverse();
  const sleeps = logs.filter(r => r.type === 'sleep');
  const good = [], bad = [];
  for (let i = 1; i < recent.length; i++) {
    const a = recent[i - 1], b = recent[i];
    const g = (T(b.at) - T(a.at)) / 6e4;
    if (g < 10 || g > 360) continue;                  // same trip, or overnight
    if (g > 150 && sleeps.some(s => s.at > a.at && s.at < b.at)) continue;
    (b.type === 'accident' ? bad : good).push(g);
  }
  const learned = good.length >= 4 ? median(good) : null;
  let interval = learned ? Math.round(0.5 * base + 0.5 * learned) : base;
  if (bad.length) interval = Math.min(interval, Math.round(median(bad) * 0.8));
  interval = clamp(interval, 30, 480);

  let due = last ? T(last.at) + interval * 6e4 : now;
  let reason = last ? `every ~${fmtMin(interval)}${learned ? ' (learned)' : ''}` : 'no potty logged yet';
  for (const r of logs) {
    if (last && r.at <= last.at) break;
    const d = LOG[r.type]?.trigger;
    if (d != null && T(r.at) + d * 6e4 < due) { due = T(r.at) + d * 6e4; reason = `${d} min after ${LOG[r.type].label.toLowerCase()}`; }
  }
  return { due, reason, interval, learned, base, asleep, last, sleepEv };
}

/* ---------- state ---------- */
const ui = { tab: 'today', day: todayKey(), memFilter: 'all', openCats: {} };
const view = () => $('#view');

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, actions = []) {
  const el = $('#toast');
  el.innerHTML = `<span>${msg}</span>` + actions.map((a, i) => `<button data-i="${i}">${esc(a.label)}</button>`).join('');
  el.hidden = false;
  el.querySelectorAll('button').forEach(b => b.onclick = () => { el.hidden = true; actions[b.dataset.i].run(); });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, actions.length ? 6000 : 2500);
}

/* ---------- bottom sheet & forms ---------- */
function sheet(html, mount) {
  const s = $('#sheet');
  $('#sheet-body').innerHTML = html;
  s.hidden = false;
  requestAnimationFrame(() => s.classList.add('open'));
  $('#sheet-body').scrollTop = 0;
  mount && mount($('#sheet-body'));
}
function closeSheet() { const s = $('#sheet'); s.classList.remove('open'); s.hidden = true; $('#sheet-body').innerHTML = ''; }

function field(f, v) {
  const id = 'f-' + f.k;
  const val = v ?? f.def ?? '';
  const lab = `<label for="${id}">${esc(f.label)}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
  switch (f.type) {
    case 'textarea': return `<div class="fld">${lab}<textarea id="${id}" name="${f.k}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea></div>`;
    case 'select': return `<div class="fld">${lab}<select id="${id}" name="${f.k}">${f.options.map(o => {
      const [ov, ol] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`;
    }).join('')}</select></div>`;
    case 'chips': return `<div class="fld">${lab}<div class="chips" data-chips="${f.k}">${f.options.map(o => {
      const [ov, ol] = Array.isArray(o) ? o : [o, o];
      return `<button type="button" class="chip ${String(ov) === String(val) ? 'on' : ''}" data-v="${esc(ov)}">${esc(ol)}</button>`;
    }).join('')}</div><input type="hidden" name="${f.k}" value="${esc(val)}"></div>`;
    case 'suggest': return `<div class="fld">${lab}<input id="${id}" name="${f.k}" value="${esc(val)}" placeholder="${esc(f.ph || '')}"><div class="chips small">${f.options.map(o => `<button type="button" class="chip" data-fill="${f.k}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
    case 'datetime': return `<div class="fld">${lab}<input id="${id}" type="datetime-local" name="${f.k}" value="${val ? toInput(val) : ''}"></div>`;
    case 'file': return `<div class="fld">${lab}<input id="${id}" type="file" name="${f.k}" accept="${f.accept || 'image/*,video/*'}"></div>`;
    default: return `<div class="fld">${lab}<input id="${id}" type="${f.type || 'text'}" name="${f.k}" value="${esc(val)}" placeholder="${esc(f.ph || '')}" ${f.type === 'number' ? 'step="any" inputmode="decimal"' : ''}></div>`;
  }
}

function form({ title, intro = '', fields, value = {}, onSave, onDelete, saveLabel = 'Save' }) {
  sheet(`<h2>${esc(title)}</h2>${intro}
    <form id="frm">${fields.map(f => f.type === 'row' ? `<div class="row2">${f.fields.map(g => field(g, value[g.k])).join('')}</div>` : field(f, value[f.k])).join('')}
      <div class="btns">${onDelete ? '<button type="button" class="danger" id="frm-del">Delete</button>' : ''}<span class="grow"></span>
      <button type="button" class="ghost" id="frm-cancel">Cancel</button><button class="primary" type="submit">${esc(saveLabel)}</button></div>
    </form>`, root => {
    const flat = fields.flatMap(f => f.type === 'row' ? f.fields : [f]);
    root.querySelectorAll('[data-chips]').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      const hid = g.parentElement.querySelector('input[type=hidden]');
      const on = !b.classList.contains('on');
      g.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
      if (on) b.classList.add('on');
      hid.value = on ? b.dataset.v : '';
    }));
    root.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => { root.querySelector(`[name="${b.dataset.fill}"]`).value = b.dataset.v; });
    $('#frm-cancel').onclick = closeSheet;
    if (onDelete) $('#frm-del').onclick = async () => { if (confirm('Delete this?')) { await onDelete(); closeSheet(); } };
    $('#frm').onsubmit = async e => {
      e.preventDefault();
      const out = {};
      for (const f of flat) {
        const el = root.querySelector(`[name="${f.k}"]`); if (!el) continue;
        if (f.type === 'file') out[f.k] = el.files[0] || null;
        else if (f.type === 'number') out[f.k] = el.value === '' ? '' : Number(el.value);
        else if (f.type === 'datetime') out[f.k] = el.value ? fromInput(el.value) : new Date().toISOString();
        else out[f.k] = el.value.trim();
        if (f.required && !out[f.k]) { el.focus(); toast(`${f.label} is needed`); return; }
      }
      const btn = root.querySelector('button[type=submit]'); btn.disabled = true;
      try { if ((await onSave(out)) !== false) closeSheet(); }
      catch (err) { toast(esc(err.message)); btn.disabled = false; }
    };
  });
}

/* ---------- logging ---------- */
async function quickLog(type, extra = {}) {
  if (type === 'accident') return accidentSheet();
  if (type === 'note') return form({ title: 'Note', fields: [{ k: 'note', label: 'What happened?', type: 'textarea', required: true }, { k: 'at', label: 'When', type: 'datetime' }],
    onSave: v => Store.put({ kind: 'log', type: 'note', note: v.note, at: v.at }) });
  const rec = await Store.put({ kind: 'log', type, ...extra });
  navigator.vibrate && navigator.vibrate(15);
  toast(`${LOG[type].icon} ${LOG[type].label} logged ${fmtTime(rec.at)}`, [
    { label: 'Edit', run: () => editLog(rec.id) },
    { label: 'Undo', run: () => Store.remove(rec.id) },
  ]);
}

function accidentSheet() {
  form({ title: '⚠️ Accident', intro: '<p class="muted">No scolding — just note it. Patterns show up on the Grow tab.</p>',
    fields: [
      { k: 'what', label: 'What', type: 'chips', options: ['Pee', 'Poop'], def: 'Pee' },
      { k: 'where', label: 'Where', type: 'suggest', options: ACCIDENT_SPOTS },
      { k: 'at', label: 'When', type: 'datetime' },
      { k: 'note', label: 'Note', type: 'text', ph: 'e.g. right after zoomies' },
    ],
    onSave: v => Store.put({ kind: 'log', type: 'accident', what: v.what, where: v.where, note: v.note, at: v.at }) });
}

function editLog(id) {
  const r = Store.get(id); if (!r) return;
  const fields = [{ k: 'at', label: 'Time', type: 'datetime' }];
  if (r.type === 'accident') fields.push({ k: 'what', label: 'What', type: 'chips', options: ['Pee', 'Poop'] }, { k: 'where', label: 'Where', type: 'suggest', options: ACCIDENT_SPOTS });
  if (r.type === 'meal') fields.push({ k: 'amount', label: 'Amount', ph: 'e.g. ⅓ cup', type: 'text' }, { k: 'ate', label: 'Ate', type: 'chips', options: ['All', 'Most', 'Some', 'None'] });
  if (r.type === 'walk') fields.push({ k: 'minutes', label: 'Minutes', type: 'number' });
  fields.push({ k: 'note', label: 'Note', type: r.type === 'note' ? 'textarea' : 'text' });
  form({ title: `${LOG[r.type]?.icon || ''} ${LOG[r.type]?.label || 'Entry'}`, fields, value: r,
    onSave: v => Store.put({ id, ...v }), onDelete: () => Store.remove(id) });
}

/* ---------- day summary ---------- */
function daySummary(day) {
  const logs = Store.list('log', r => localDay(r.at) === day);
  const c = t => logs.filter(r => r.type === t).length;
  // Sleep: pair each nap with the next wake, clipped to this day.
  const start = T(parseDay(day)), end = start + 864e5;
  const ev = Store.list('log', r => (r.type === 'sleep' || r.type === 'wake') && T(r.at) < end && T(r.at) > start - 864e5).reverse();
  let sleep = 0, from = null;
  for (const e of ev) {
    if (e.type === 'sleep' && from == null) from = T(e.at);
    else if (e.type === 'wake' && from != null) { sleep += Math.max(0, Math.min(T(e.at), end) - Math.max(from, start)); from = null; }
  }
  if (from != null) sleep += Math.max(0, Math.min(Date.now(), end) - Math.max(from, start));
  return { logs, pee: c('pee'), poop: c('poop'), accident: c('accident'), meal: c('meal'), sleepH: sleep / 36e5 };
}

/* ---------- health helpers ---------- */
const dueItems = () => Store.list('health', r => !r.done && r.due).sort((a, b) => a.due < b.due ? -1 : 1);
const currentFood = () => Store.list('food')[0];

function healthRow(r) {
  const n = daysUntil(r.due);
  const cls = n < 0 ? 'over' : n <= 7 ? 'soon' : '';
  const when = n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  return `<div class="item ${cls}">
    <button class="item-main" data-act="editHealth" data-id="${r.id}">
      <span class="ico">${HEALTH_CATS[r.cat]?.icon || '📌'}</span>
      <span><b>${esc(r.name)}</b><small>${fmtDay(r.due)} · ${when}${r.every ? ` · every ${r.every} ${r.unit}` : ''}</small></span>
    </button>
    <button class="pill" data-act="doneHealth" data-id="${r.id}">Done</button>
  </div>`;
}

/* ---------- views ---------- */
function avatar(cls = '') {
  const p = P();
  return `<div class="avatar ${cls}" ${p.photoId ? `data-thumb="${p.photoId}"` : ''}>${p.photoId ? '' : '🐶'}</div>`;
}

function syncChip() {
  const s = Drive.state;
  const map = {
    off: ['off', 'Not syncing'], nofolder: ['off', 'Set up sharing'], auth: ['warn', 'Tap to sync'],
    offline: ['off', 'Offline'], error: ['warn', 'Sync problem'], syncing: ['busy', 'Syncing…'],
    idle: ['ok', s.last ? 'Synced' : 'Connected'],
  };
  let [cls, txt] = map[s.status] || map.off;
  if (s.upload) txt = `Uploading ${s.upload.n}/${s.upload.of} · ${Math.round(s.upload.frac * 100)}%`;
  return `<button class="sync ${cls}" data-act="syncTap" title="${esc(s.msg)}"><i></i>${txt}</button>`;
}

function header(sub) {
  return `<header class="hero">
    ${avatar()}
    <div class="hero-t"><h1>${esc(App.pet())}</h1><p>${esc(sub)}</p></div>
    ${syncChip()}
  </header>`;
}

function countdownCard() {
  const s = pottyStatus();
  if (s.asleep) {
    return `<section class="card cd sleep"><div class="cd-big">😴 Sleeping</div>
      <p>since ${fmtTime(s.sleepEv.at)} — take ${esc(App.pet())} out right when he wakes.</p>
      <button class="primary" data-act="log" data-k="wake">☀️ He’s awake</button></section>`;
  }
  return `<section class="card cd" id="cd"><div class="cd-row">
      <svg class="ring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="ring-bg"/><circle cx="22" cy="22" r="19" class="ring-fg" id="cd-ring" pathLength="100"/></svg>
      <div><div class="cd-label">Next potty break</div><div class="cd-big" id="cd-big">—</div>
      <p class="cd-why" id="cd-why"></p></div></div></section>`;
}

function tickCountdown() {
  const big = $('#cd-big'); if (!big) return;
  const s = pottyStatus(), now = Date.now();
  const left = (s.due - now) / 6e4;
  big.textContent = left <= 0 ? (left > -1 ? 'Now!' : `${fmtMin(left)} overdue`) : `in ${fmtMin(Math.ceil(left))}`;
  $('#cd').classList.toggle('due', left <= 0);
  const start = s.last ? T(s.last.at) : now;
  const frac = s.due > start ? clamp((now - start) / (s.due - start), 0, 1) : 1;
  $('#cd-ring').style.strokeDasharray = `${frac * 100} 100`;
  $('#cd-why').textContent = (s.last ? `Last: ${LOG[s.last.type].label.toLowerCase()} at ${fmtTime(s.last.at)} · ` : '') + s.reason;
  // Alert once per due time while the app is open.
  if (left <= 0 && ui.alerted !== s.due && Store.pref('oscar.alerts') === '1') {
    ui.alerted = s.due;
    navigator.vibrate && navigator.vibrate([200, 100, 200]);
    if (window.Notification?.permission === 'granted') navigator.serviceWorker?.ready.then(r => r.showNotification(`${App.pet()} needs a potty break`, { body: s.reason, tag: 'potty', icon: 'icon-192.png', renotify: true }));
  }
}

function timelineRow(r) {
  const t = LOG[r.type] || { icon: '•', label: r.type };
  let detail = r.note || '';
  if (r.type === 'accident') detail = [r.what, r.where && 'in ' + r.where.toLowerCase(), r.note].filter(Boolean).join(' · ');
  if (r.type === 'meal') detail = [r.amount, r.ate && 'ate ' + r.ate.toLowerCase(), r.note].filter(Boolean).join(' · ');
  if (r.type === 'walk' && r.minutes) detail = `${r.minutes} min${r.note ? ' · ' + r.note : ''}`;
  return `<button class="tl ${r.type}" data-act="editLog" data-id="${r.id}">
    <time>${fmtTime(r.at)}</time><span class="ico">${t.icon}</span>
    <span class="tl-t"><b>${esc(t.label)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</span>
    <span class="by">${esc(r.by || '')}</span></button>`;
}

const VIEWS = {};

VIEWS.today = () => {
  const home = App.homeDay();
  const sub = [App.ageText(), home > 0 ? `day ${home} home` : ''].filter(Boolean).join(' · ') || 'Welcome!';
  const sum = daySummary(ui.day);
  const food = currentFood();
  const isToday = ui.day === todayKey();
  const due = dueItems().filter(r => daysUntil(r.due) <= 7).slice(0, 4);
  const wk = App.weekOf(Date.now());
  const needPortrait = wk != null && wk >= 0 && !Store.list('media', r => r.portrait && App.weekOf(r.at) === wk).length;
  return `${header(sub)}
    <div class="cols"><div>
    ${countdownCard()}
    <section class="quick">${LOG_TYPES.map(t => `<button data-act="log" data-k="${t.k}" class="q-${t.k}"><span>${t.icon}</span>${t.label}</button>`).join('')}</section>
    <section class="capture">
      <button data-act="capture" data-k="photo">📷 Photo</button>
      <button data-act="capture" data-k="video">🎥 Video</button>
      ${needPortrait ? `<button data-act="portrait" class="hl">🐶 Week ${wk} portrait</button>` : `<button data-act="capture" data-k="pick">🖼️ Gallery</button>`}
    </section>
    </div><div>
    <section class="card">
      <div class="daynav"><button data-act="day" data-d="-1" aria-label="Previous day">‹</button>
        <b>${isToday ? 'Today' : fmtDay(ui.day)}</b>
        <button data-act="day" data-d="1" ${isToday ? 'disabled' : ''} aria-label="Next day">›</button></div>
      <div class="stats">
        <span>💧 ${sum.pee}</span><span>💩 ${sum.poop}</span><span class="${sum.accident ? 'bad' : ''}">⚠️ ${sum.accident}</span>
        <span>🍖 ${sum.meal}${food?.mealsPerDay ? '/' + food.mealsPerDay : ''}</span><span>😴 ${sum.sleepH.toFixed(1)} h</span>
      </div>
      <div class="timeline">${sum.logs.length ? sum.logs.map(timelineRow).join('') : '<p class="muted pad">Nothing logged yet.</p>'}</div>
    </section>
    ${due.length ? `<section class="card"><h3>Coming up</h3>${due.map(healthRow).join('')}</section>` : ''}
    </div></div>`;
};

VIEWS.health = () => {
  const due = dueItems();
  const done = Store.list('health', r => r.done).sort((a, b) => a.done < b.done ? 1 : -1);
  const vets = Store.list('vet');
  const unit = P().unit || 'kg';
  const hasBday = !!P().birthday;
  return `${header('Health & vet')}
    <div class="cols"><div>
    <section class="card"><div class="h-row"><h3>Due</h3><button class="pill" data-act="addHealth">+ Reminder</button></div>
      ${due.length ? due.map(healthRow).join('') : '<p class="muted">Nothing scheduled.</p>'}
      ${!Store.list('health').length ? `<div class="empty">
        <p>Start from a typical first-year schedule (DHPP, lepto, bordetella, rabies, deworming, flea & tick) and edit it to match what your vet says.</p>
        <button class="primary" data-act="typical" ${hasBday ? '' : 'disabled'}>Add typical puppy schedule</button>
        ${hasBday ? '' : '<small>Add his birthday in More → Profile first.</small>'}</div>` : ''}
    </section>
    <section class="card"><div class="h-row"><h3>Weight</h3><button class="pill" data-act="addWeight">+ Weight</button></div>
      ${weightChart(unit)}</section>
    </div><div>
    <section class="card"><div class="h-row"><h3>Vet visits</h3><button class="pill" data-act="addVet">+ Visit</button></div>
      ${vets.length ? vets.map(v => `<button class="item-main block" data-act="showVet" data-id="${v.id}">
        <span class="ico">🩺</span><span><b>${esc(v.reason || 'Visit')}</b><small>${fmtDate(localDay(v.at))}${v.clinic ? ' · ' + esc(v.clinic) : ''}${v.cost ? ' · ' + money(v.cost) : ''}</small>
        ${v.comments ? `<small class="clip">“${esc(v.comments)}”</small>` : ''}</span></button>`).join('') : '<p class="muted">Log each visit with what the vet said — handy at the next one.</p>'}
    </section>
    ${done.length ? `<section class="card"><h3>History</h3>${done.slice(0, 40).map(r => `<button class="item-main block" data-act="editHealth" data-id="${r.id}">
      <span class="ico">${HEALTH_CATS[r.cat]?.icon || '📌'}</span><span><b>${esc(r.name)}</b><small>done ${fmtDate(r.done)}${r.lot ? ' · lot ' + esc(r.lot) : ''}</small></span></button>`).join('')}</section>` : ''}
    </div></div>`;
};

function weightPoints() {
  const unit = P().unit || 'kg';
  const pts = [
    ...Store.list('weight').map(r => ({ at: r.at, v: r.value, unit: r.unit, id: r.id })),
    ...Store.list('vet', r => r.weight).map(r => ({ at: r.at, v: r.weight, unit: r.unit || unit, vet: true })),
  ].map(p => ({ ...p, v: p.unit === unit ? p.v : unit === 'kg' ? p.v / 2.20462 : p.v * 2.20462 }));
  return pts.sort((a, b) => a.at < b.at ? -1 : 1);
}

function lineChart(pts, fmt) {
  if (pts.length < 2) return '';
  const W = 320, H = 120, px = 30, py = 14;
  const xs = pts.map(p => T(p.at)), ys = pts.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = x => px + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (W - px - 8);
  const Y = y => H - py - (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0)) * (H - 2 * py);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(T(p.at)).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time">
    <text x="2" y="${Y(y1) + 4}" class="ax">${fmt(y1)}</text><text x="2" y="${Y(y0) + 4}" class="ax">${fmt(y0)}</text>
    <path d="${d}" class="line"/>${pts.map(p => `<circle cx="${X(T(p.at))}" cy="${Y(p.v)}" r="3" class="dot"/>`).join('')}</svg>`;
}

function weightChart(unit) {
  const pts = weightPoints();
  if (!pts.length) return '<p class="muted">Weigh him weekly while he’s growing — the vet will ask.</p>';
  const last = pts[pts.length - 1];
  const prev = pts.length > 1 ? pts[pts.length - 2] : null;
  const delta = prev ? last.v - prev.v : 0;
  return `<div class="big-num">${last.v.toFixed(2)} ${unit}${prev ? `<small>${delta >= 0 ? '+' : ''}${delta.toFixed(2)} since ${fmtDay(localDay(prev.at))}</small>` : ''}</div>
    ${lineChart(pts, v => v.toFixed(1))}
    <div class="wlist">${pts.slice(-6).reverse().map(p => `<button ${p.id ? `data-act="editWeight" data-id="${p.id}"` : 'disabled'}>${fmtDay(localDay(p.at))} · ${p.v.toFixed(2)} ${unit}${p.vet ? ' (vet)' : ''}</button>`).join('')}</div>`;
}

VIEWS.grow = () => {
  const d = App.ageDays();
  const wksLeft = d == null ? null : Math.ceil((16 * 7 - d) / 7);
  return `${header('Training & growing up')}
    <div class="cols"><div>
    <section class="card"><div class="h-row"><h3>Training</h3><button class="pill" data-act="addSkill">+ Skill</button></div>
      <div class="skills">${skillList().map(skillCard).join('')}</div></section>
    ${pottyStats()}
    </div><div>
    <section class="card"><h3>Socialization</h3>
      <p class="muted">${wksLeft == null ? 'Add his birthday to see his window.' : wksLeft > 0
        ? `The easy window for new experiences closes around 16 weeks — about <b>${wksLeft} week${wksLeft === 1 ? '' : 's'}</b> left. Aim for a few calm, happy meetings with each.`
        : 'His prime window has passed, but keep going — calm, positive exposures still build confidence.'}</p>
      ${Object.entries(SOCIAL).map(([cat, items]) => socialCat(cat, items)).join('')}
    </section>
    </div></div>`;
};

function skillList() {
  const extra = new Set(Store.list('train').map(r => r.skill));
  (P().skills || []).forEach(s => extra.add(s));
  return [...new Set([...SKILLS, ...extra])];
}
function skillCard(name) {
  const s = Store.list('train', r => r.skill === name);
  const last3 = s.slice(0, 3).map(r => Number(r.rating) || 0);
  const avg = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
  const status = !s.length ? '' : avg >= 4.5 ? 'solid' : 'learning';
  return `<button class="skill ${status}" data-act="train" data-skill="${esc(name)}">
    <b>${esc(name)}</b><small>${!s.length ? 'not started' : status === 'solid' ? '✓ solid' : `${s.length} session${s.length > 1 ? 's' : ''}`}</small>
    <i style="width:${avg * 20}%"></i></button>`;
}

function socialCat(cat, items) {
  const logs = Store.list('social');
  const done = items.filter(i => logs.some(r => r.item === i)).length;
  const open = ui.openCats[cat];
  return `<div class="soc">
    <button class="soc-h" data-act="socCat" data-cat="${esc(cat)}"><b>${esc(cat)}</b><span>${done}/${items.length}</span><em>${open ? '▾' : '▸'}</em></button>
    ${open ? `<div class="chips">${items.map(i => {
      const rs = logs.filter(r => r.item === i);
      const face = !rs.length ? '' : rs[0].reaction === 'good' ? '😀' : rs[0].reaction === 'ok' ? '😐' : '😟';
      return `<button class="chip ${rs.length ? 'on' : ''}" data-act="social" data-item="${esc(i)}">${face} ${esc(i)}${rs.length > 1 ? ` ×${rs.length}` : ''}</button>`;
    }).join('')}</div>` : ''}
  </div>`;
}

function pottyStats() {
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dayKey(d)); }
  const rows = days.map(k => { const s = daySummary(k); return { k, good: s.pee + s.poop, bad: s.accident, sleep: s.sleepH }; });
  const max = Math.max(4, ...rows.map(r => r.good + r.bad));
  const wk = a => { const g = a.reduce((x, r) => x + r.good, 0), b = a.reduce((x, r) => x + r.bad, 0); return g + b ? Math.round(100 * g / (g + b)) : null; };
  const thisW = wk(rows.slice(7)), lastW = wk(rows.slice(0, 7));
  const accidents = Store.list('log', r => r.type === 'accident' && T(r.at) > Date.now() - 14 * 864e5);
  const hours = Array(24).fill(0); accidents.forEach(r => hours[new Date(r.at).getHours()]++);
  const spots = {}; accidents.forEach(r => r.where && (spots[r.where] = (spots[r.where] || 0) + 1));
  const topHour = hours.indexOf(Math.max(...hours));
  return `<section class="card"><h3>House training</h3>
    <div class="big-num">${thisW == null ? '—' : thisW + '%'}<small>outside this week${lastW != null && thisW != null ? ` · ${thisW >= lastW ? '▲' : '▼'} from ${lastW}%` : ''}</small></div>
    <div class="bars">${rows.map(r => `<div class="bar" title="${fmtDay(r.k)}: ${r.good} outside, ${r.bad} accidents">
      <i class="b-bad" style="height:${100 * r.bad / max}%"></i><i class="b-good" style="height:${100 * r.good / max}%"></i>
      <span>${parseDay(r.k).getDate()}</span></div>`).join('')}</div>
    <p class="legend"><i class="b-good"></i> outside <i class="b-bad"></i> accident</p>
    ${accidents.length ? `<p class="muted">Most accidents around <b>${topHour % 12 || 12}${topHour < 12 ? 'am' : 'pm'}</b>${Object.keys(spots).length ? `, usually in the <b>${esc(Object.entries(spots).sort((a, b) => b[1] - a[1])[0][0].toLowerCase())}</b>` : ''}. Try a trip outside just before then.</p>` : ''}
  </section>`;
}

VIEWS.memories = () => {
  const all = Store.list('media', r => !r.doc);
  const portraits = all.filter(r => r.portrait && !r.video).reverse();
  const f = ui.memFilter;
  const media = f === 'portraits' ? all.filter(r => r.portrait) : f === 'starred' ? all.filter(r => r.star) : f === 'videos' ? all.filter(r => r.video) : all;
  const extras = f === 'all' ? [...Store.list('milestone'), ...Store.list('journal')] : f === 'starred' ? Store.list('milestone') : [];
  const items = [...media, ...extras].sort((a, b) => a.at < b.at ? 1 : -1);
  const groups = [];
  for (const r of items) {
    const w = App.weekOf(r.at);
    const key = w != null && w >= 0 ? 'w' + w : 'm' + localDay(r.at).slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const title = key[0] === 'w' ? `${w} weeks old` : parseDay(localDay(r.at)).toLocaleDateString([], { month: 'long', year: 'numeric' });
      groups.push(g = { key, title, items: [] });
    }
    g.items.push(r);
  }
  return `${header(all.length === 1 ? "1 memory" : `${all.length} photos & videos`)}
    <section class="capture wide">
      <button data-act="capture" data-k="photo">📷 Photo</button>
      <button data-act="capture" data-k="video">🎥 Video</button>
      <button data-act="capture" data-k="pick">🖼️ Gallery</button>
      <button data-act="portrait">🐶 Portrait</button>
      <button data-act="milestone">⭐ Milestone</button>
      <button data-act="journal">✍️ Journal</button>
    </section>
    ${portraits.length ? `<section class="card"><div class="h-row"><h3>Growing up</h3>${portraits.length > 1 ? '<button class="pill" data-act="flipbook">▶ Play</button>' : ''}</div>
      <div class="strip">${portraits.map(r => `<button data-act="view" data-id="${r.id}"><div class="th" data-thumb="${r.id}"></div><small>wk ${App.weekOf(r.at) ?? '?'}</small></button>`).join('')}</div></section>`
      : `<section class="card empty"><p><b>Weekly portrait:</b> same spot, same angle, once a week. The camera shows last week’s shot as a ghost so you can line him up — by the end you have a growing-up flipbook.</p><button class="primary" data-act="portrait">Take the first one</button></section>`}
    <div class="filters">${[['all', 'All'], ['starred', '⭐ Starred'], ['portraits', 'Portraits'], ['videos', 'Videos']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="memFilter" data-k="${k}">${l}</button>`).join('')}</div>
    ${groups.map(g => `<section class="mgroup"><h3>${esc(g.title)}</h3>
      ${g.items.filter(r => r.kind !== 'media').map(memCard).join('')}
      <div class="grid">${g.items.filter(r => r.kind === 'media').map(r => `<button class="gi" data-act="view" data-id="${r.id}">
        <div class="th" data-thumb="${r.id}"></div>${r.video ? '<span class="vid">▶</span>' : ''}${r.star ? '<span class="star">⭐</span>' : ''}${!r.driveId ? '<span class="up" title="Waiting to upload">⏳</span>' : ''}</button>`).join('')}</div>
    </section>`).join('') || '<p class="muted pad">Photos, videos, milestones and journal notes all land here, grouped by his age.</p>'}`;
};

function memCard(r) {
  if (r.kind === 'milestone') return `<button class="mcard ms" data-act="editMilestone" data-id="${r.id}">
    ${r.mediaId ? `<div class="th" data-thumb="${r.mediaId}"></div>` : '<span class="ico">⭐</span>'}
    <span><b>${esc(r.title)}</b><small>${fmtDate(localDay(r.at))}${r.note ? ' — ' + esc(r.note) : ''}</small></span></button>`;
  return `<button class="mcard" data-act="editJournal" data-id="${r.id}"><span class="ico">✍️</span>
    <span><small>${fmtWhen(r.at)} · ${esc(r.by || '')}</small><p>${esc(r.text)}</p></span></button>`;
}

VIEWS.more = () => {
  const p = P();
  const food = currentFood();
  const ins = Store.get('insurance') || {};
  const contacts = Store.list('contact').sort((a, b) => CONTACT_ROLES.indexOf(a.role) - CONTACT_ROLES.indexOf(b.role));
  const claims = Store.list('claim');
  const open = claims.filter(c => c.status !== 'Paid' && c.status !== 'Denied');
  return `${header('Records & settings')}
    <div class="cols"><div>
    <section class="card"><div class="h-row"><h3>Profile</h3><button class="pill" data-act="profile">Edit</button></div>
      <dl class="kv">
        ${kv('Breed', p.breed)}${kv('Sex', p.sex)}${kv('Birthday', fmtDate(p.birthday))}${kv('Home since', fmtDate(p.homeDay))}
        ${kv('Colour', p.colour)}${kv('Microchip', p.microchip)}${kv('Chip registry', p.chipRegistry)}${kv('Licence', p.licence)}
      </dl></section>
    <section class="card"><div class="h-row"><h3>Food</h3><button class="pill" data-act="food">${food ? 'Change food' : '+ Food'}</button></div>
      ${food ? `<dl class="kv">${kv('Food', [food.brand, food.product].filter(Boolean).join(' — '))}${kv('Per meal', food.perMeal)}${kv('Meals / day', food.mealsPerDay)}
        ${kv('Times', food.times)}${kv('Treats', food.treats)}${kv('Since', fmtDate(localDay(food.at)))}${kv('Notes', food.notes)}</dl>
        ${Store.list('food').length > 1 ? `<details><summary>Food history</summary>${Store.list('food').slice(1).map(f => `<button class="item-main block" data-act="editFood" data-id="${f.id}"><span><b>${esc([f.brand, f.product].filter(Boolean).join(' — '))}</b><small>from ${fmtDate(localDay(f.at))}${f.notes ? ' · ' + esc(f.notes) : ''}</small></span></button>`).join('')}</details>` : ''}
        <button class="link" data-act="editFood" data-id="${food.id}">Edit current plan</button>`
        : '<p class="muted">What he eats, how much, and when — also shows as “meals x/3” on Today.</p>'}</section>
    <section class="card"><div class="h-row"><h3>Insurance</h3><button class="pill" data-act="insurance">Edit</button></div>
      ${ins.provider ? `<dl class="kv">${kv('Provider', ins.provider)}${kv('Policy #', ins.policy)}${kv('Plan', ins.plan)}${kv('Deductible', ins.deductible)}
        ${kv('Reimburses', ins.reimburse)}${kv('Annual limit', ins.limit)}${kv('Premium', ins.premium)}${kv('Renews', fmtDate(ins.renews))}
        ${ins.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(ins.phone)}">${esc(ins.phone)}</a></dd>` : ''}
        ${ins.url ? `<dt>Claims</dt><dd><a href="${esc(ins.url)}" target="_blank" rel="noopener">Open portal</a></dd>` : ''}</dl>`
        : '<p class="muted">Policy details and claims in one place.</p>'}
      <div class="h-row sub"><h4>Claims${open.length ? ` · ${open.length} open` : ''}</h4><button class="pill" data-act="claim">+ Claim</button></div>
      ${claims.map(c => `<button class="item-main block" data-act="claim" data-id="${c.id}"><span class="ico">${c.status === 'Paid' ? '✅' : c.status === 'Denied' ? '❌' : '⏳'}</span>
        <span><b>${esc(c.desc || 'Claim')} · ${money(c.amount)}</b><small>${fmtDate(localDay(c.at))} · ${esc(c.status || 'Submitted')}${c.reimbursed ? ' · got ' + money(c.reimbursed) : ''}</small></span></button>`).join('')}
    </section>
    </div><div>
    <section class="card"><div class="h-row"><h3>Contacts</h3><button class="pill" data-act="contact">+ Contact</button></div>
      ${contacts.map(c => `<div class="item"><button class="item-main" data-act="contact" data-id="${c.id}"><span class="ico">${c.role === 'Poison helpline' ? '☎️' : c.role?.includes('vet') || c.role?.includes('Vet') ? '🩺' : '👤'}</span>
        <span><b>${esc(c.name)}</b><small>${esc(c.role)}${c.notes ? ' · ' + esc(c.notes) : ''}</small></span></button>${c.phone ? `<a class="pill" href="tel:${esc(c.phone)}">Call</a>` : ''}</div>`).join('')}
      ${!contacts.some(c => c.role === 'Poison helpline') ? '<button class="link" data-act="poison">+ Add pet poison helplines</button>' : ''}
    </section>
    <section class="card"><h3>Share & export</h3>
      <button class="item-main block" data-act="careSheet"><span class="ico">📋</span><span><b>Care sheet</b><small>One page for a sitter, groomer or new vet — print or share</small></span></button>
      <button class="item-main block" data-act="syncSettings"><span class="ico">☁️</span><span><b>Sync & sharing</b><small>${esc(syncLine())}</small></span></button>
      <button class="item-main block" data-act="backup"><span class="ico">💾</span><span><b>Backup</b><small>Save or restore everything as a file</small></span></button>
      <button class="item-main block" data-act="me"><span class="ico">🙋</span><span><b>You: ${esc(Store.who())}</b><small>Name shown on what you log · alerts</small></span></button>
    </section>
    </div></div>`;
};
const kv = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : '';
function syncLine() {
  const s = Drive.state;
  if (!Drive.clientId()) return 'Not set up yet';
  return ({ idle: 'Connected' + (s.last ? ' · synced ' + fmtTime(new Date(s.last).toISOString()) : ''), auth: 'Signed out — tap to sign in', nofolder: 'Signed in — pick a shared folder', error: 'Problem: ' + s.msg, offline: 'Offline', syncing: 'Syncing…' })[s.status] || 'Not connected';
}

/* ---------- actions ---------- */
const ACT = {};

ACT.tab = d => { ui.tab = d.tab; if (d.tab === 'today') ui.day = todayKey(); render(); window.scrollTo(0, 0); };
ACT.log = d => quickLog(d.k);
ACT.editLog = d => editLog(d.id);
ACT.day = d => { const x = parseDay(ui.day); x.setDate(x.getDate() + Number(d.d)); ui.day = dayKey(x) > todayKey() ? todayKey() : dayKey(x); render(); };

/* Health */
const healthFields = [
  { k: 'cat', label: 'Type', type: 'select', options: Object.entries(HEALTH_CATS).map(([k, v]) => [k, `${v.icon} ${v.label}`]) },
  { k: 'name', label: 'Name', required: true, ph: 'e.g. DHPP #2, Revolution, nail trim' },
  { k: 'due', label: 'Due', type: 'date', required: true },
  { type: 'row', fields: [{ k: 'every', label: 'Repeat every', type: 'number', ph: 'blank = once' }, { k: 'unit', label: 'Unit', type: 'select', options: ['days', 'weeks', 'months'], def: 'months' }] },
  { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
];
ACT.addHealth = () => form({ title: 'Health reminder', fields: healthFields, value: { cat: 'vaccine', due: todayKey() },
  onSave: v => Store.put({ kind: 'health', ...v, every: v.every || '' }) });
ACT.editHealth = d => {
  const r = Store.get(d.id);
  const fields = r.done ? [...healthFields, { k: 'done', label: 'Done on', type: 'date' }, { k: 'lot', label: 'Lot / product #' }] : healthFields;
  form({ title: 'Health reminder', fields, value: r, onSave: v => Store.put({ id: r.id, ...v }), onDelete: () => Store.remove(r.id) });
};
ACT.doneHealth = d => {
  const r = Store.get(d.id);
  form({ title: `✓ ${r.name}`, saveLabel: 'Mark done',
    intro: r.every ? `<p class="muted">The next one will be scheduled ${r.every} ${r.unit} after this date.</p>` : '',
    fields: [{ k: 'done', label: 'Done on', type: 'date', def: todayKey() }, { k: 'lot', label: 'Lot / product #', hint: 'optional — on the vaccine sticker' }, { k: 'notes', label: 'Notes', type: 'text' }],
    value: { notes: r.notes },
    onSave: async v => {
      await Store.put({ id: r.id, done: v.done || todayKey(), lot: v.lot, notes: v.notes });
      if (r.every) await Store.put({ kind: 'health', cat: r.cat, name: r.name, every: r.every, unit: r.unit, due: addUnit(v.done || todayKey(), Number(r.every), r.unit) });
    } });
};
ACT.typical = async () => {
  const b = P().birthday;
  for (const t of TYPICAL_SCHEDULE) {
    await Store.put({ kind: 'health', cat: t.cat, name: t.name, due: addUnit(b, t.wk, 'weeks'), every: t.every || '', unit: t.unit || 'months', notes: 'Typical timing — confirm with your vet' });
  }
  toast('Schedule added — edit or mark done what the breeder already gave');
};

ACT.addWeight = () => form({ title: '⚖️ Weight', fields: [
  { type: 'row', fields: [{ k: 'value', label: 'Weight', type: 'number', required: true }, { k: 'unit', label: 'Unit', type: 'select', options: ['kg', 'lb'], def: P().unit || 'kg' }] },
  { k: 'at', label: 'When', type: 'datetime' }],
  onSave: v => Store.put({ kind: 'weight', ...v }) });
ACT.editWeight = d => form({ title: '⚖️ Weight', value: Store.get(d.id), fields: [
  { type: 'row', fields: [{ k: 'value', label: 'Weight', type: 'number', required: true }, { k: 'unit', label: 'Unit', type: 'select', options: ['kg', 'lb'] }] },
  { k: 'at', label: 'When', type: 'datetime' }],
  onSave: v => Store.put({ id: d.id, ...v }), onDelete: () => Store.remove(d.id) });

const vetFields = [
  { type: 'row', fields: [{ k: 'day', label: 'Date', type: 'date', required: true }, { k: 'cost', label: 'Cost ($)', type: 'number' }] },
  { k: 'reason', label: 'Reason', type: 'suggest', options: ['Checkup', 'Vaccines', 'Sick', 'Injury', 'Spay / neuter', 'Dental'], required: true },
  { type: 'row', fields: [{ k: 'clinic', label: 'Clinic' }, { k: 'vet', label: 'Vet' }] },
  { type: 'row', fields: [{ k: 'weight', label: 'Weight', type: 'number' }, { k: 'unit', label: 'Unit', type: 'select', options: ['kg', 'lb'] }] },
  { k: 'comments', label: 'What the vet said', type: 'textarea', rows: 4, ph: 'Findings, advice, things to watch for' },
  { k: 'treatments', label: 'Vaccines / treatments given', type: 'textarea', rows: 2 },
  { k: 'meds', label: 'Medication prescribed', type: 'textarea', rows: 2, ph: 'Name, dose, how often, until when' },
  { k: 'followUp', label: 'Follow-up date', type: 'date', hint: 'adds a reminder' },
];
function saveVet(id) {
  return async v => {
    const { day, ...rest } = v;
    const at = new Date(parseDay(day).getTime() + 12 * 36e5).toISOString();
    const r = await Store.put({ ...(id ? { id } : { kind: 'vet' }), ...rest, at });
    if (v.followUp && !Store.list('health', h => h.vetId === r.id).length) {
      await Store.put({ kind: 'health', cat: 'checkup', name: `Follow-up: ${v.reason}`, due: v.followUp, vetId: r.id });
    }
    if (!id) setTimeout(() => ACT.showVet({ id: r.id }), 50);
  };
}
ACT.addVet = () => {
  const clinic = Store.list('contact', c => c.role === 'Vet clinic')[0];
  form({ title: '🩺 Vet visit', fields: vetFields, value: { day: todayKey(), unit: P().unit || 'kg', clinic: clinic?.name || '' }, onSave: saveVet() });
};
ACT.editVet = d => { const r = Store.get(d.id); form({ title: '🩺 Vet visit', fields: vetFields, value: { ...r, day: localDay(r.at) }, onSave: saveVet(r.id), onDelete: () => Store.remove(r.id) }); };
ACT.showVet = d => {
  const v = Store.get(d.id); if (!v) return;
  const docs = (v.docs || []).map(id => Store.get(id)).filter(Boolean);
  const sec = (k, t) => v[k] ? `<h4>${t}</h4><p class="pre">${esc(v[k])}</p>` : '';
  sheet(`<h2>🩺 ${esc(v.reason || 'Vet visit')}</h2>
    <p class="muted">${fmtDate(localDay(v.at))}${v.clinic ? ' · ' + esc(v.clinic) : ''}${v.vet ? ' · Dr. ' + esc(v.vet.replace(/^dr\.?\s*/i, '')) : ''}${v.cost ? ' · ' + money(v.cost) : ''}${v.weight ? ` · ${v.weight} ${v.unit || ''}` : ''}</p>
    ${sec('comments', 'What the vet said')}${sec('treatments', 'Treatments')}${sec('meds', 'Medication')}
    ${v.followUp ? `<p>Follow-up: <b>${fmtDay(v.followUp)}</b></p>` : ''}
    <h4>Invoices & records</h4>
    <div class="grid">${docs.map(m => `<button class="gi" data-act="view" data-id="${m.id}"><div class="th" data-thumb="${m.id}"></div></button>`).join('')}
      <button class="gi add" data-act="capture" data-k="doc" data-vet="${v.id}">＋<small>Photo</small></button></div>
    <div class="btns"><button class="ghost" data-act="claimFromVet" data-id="${v.id}">+ Insurance claim</button><span class="grow"></span><button class="primary" data-act="editVet" data-id="${v.id}">Edit</button></div>`,
    root => Media.hydrate(root));
};

/* Insurance */
ACT.insurance = () => form({ title: '🛡️ Insurance', value: Store.get('insurance') || {}, fields: [
  { k: 'provider', label: 'Provider', required: true }, { type: 'row', fields: [{ k: 'policy', label: 'Policy #' }, { k: 'plan', label: 'Plan' }] },
  { type: 'row', fields: [{ k: 'deductible', label: 'Deductible' }, { k: 'reimburse', label: 'Reimburses', ph: 'e.g. 80%' }] },
  { type: 'row', fields: [{ k: 'limit', label: 'Annual limit' }, { k: 'premium', label: 'Premium', ph: '$/month' }] },
  { type: 'row', fields: [{ k: 'renews', label: 'Renews', type: 'date' }, { k: 'phone', label: 'Phone', type: 'tel' }] },
  { k: 'url', label: 'Claims website', type: 'url' }, { k: 'notes', label: 'Notes (waiting periods, exclusions…)', type: 'textarea' }],
  onSave: v => Store.put({ id: 'insurance', kind: 'insurance', ...v }) });
const claimFields = [
  { type: 'row', fields: [{ k: 'day', label: 'Date submitted', type: 'date' }, { k: 'amount', label: 'Amount claimed', type: 'number' }] },
  { k: 'desc', label: 'For', required: true, ph: 'e.g. ear infection visit' },
  { type: 'row', fields: [{ k: 'claimNo', label: 'Claim #' }, { k: 'status', label: 'Status', type: 'select', options: ['Submitted', 'In review', 'Needs info', 'Paid', 'Denied'] }] },
  { k: 'reimbursed', label: 'Amount reimbursed', type: 'number' }, { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 }];
function saveClaim(id, vetId) {
  return v => { const { day, ...rest } = v; return Store.put({ ...(id ? { id } : { kind: 'claim', vetId }), ...rest, at: new Date(parseDay(day || todayKey()).getTime() + 12 * 36e5).toISOString() }); };
}
ACT.claim = d => {
  const r = d.id ? Store.get(d.id) : null;
  form({ title: '🧾 Claim', fields: claimFields, value: r ? { ...r, day: localDay(r.at) } : { day: todayKey(), status: 'Submitted' },
    onSave: saveClaim(r?.id), onDelete: r ? () => Store.remove(r.id) : null });
};
ACT.claimFromVet = d => {
  const v = Store.get(d.id);
  form({ title: '🧾 Claim', fields: claimFields, value: { day: todayKey(), status: 'Submitted', amount: v.cost, desc: `${v.reason} — ${fmtDate(localDay(v.at))}` }, onSave: saveClaim(null, v.id) });
};

/* Food */
const foodFields = [
  { type: 'row', fields: [{ k: 'brand', label: 'Brand', required: true }, { k: 'product', label: 'Product' }] },
  { type: 'row', fields: [{ k: 'perMeal', label: 'Per meal', ph: 'e.g. ½ cup' }, { k: 'mealsPerDay', label: 'Meals / day', type: 'number' }] },
  { k: 'times', label: 'Meal times', ph: 'e.g. 7am, 12pm, 5pm' },
  { k: 'treats', label: 'Treats & chews', ph: 'what’s allowed' },
  { k: 'day', label: 'Started', type: 'date' },
  { k: 'notes', label: 'Notes', type: 'textarea', rows: 2, ph: 'transition plan, reactions, allergies' }];
ACT.food = () => {
  const cur = currentFood();
  form({ title: '🍖 Food plan', intro: cur ? '<p class="muted">Saving starts a new plan; the old one stays in history.</p>' : '',
    fields: foodFields, value: { ...(cur || {}), day: todayKey(), notes: '' },
    onSave: v => { const { day, ...r } = v; return Store.put({ kind: 'food', ...r, at: new Date(parseDay(day).getTime() + 6 * 36e5).toISOString() }); } });
};
ACT.editFood = d => { const r = Store.get(d.id); form({ title: '🍖 Food plan', fields: foodFields, value: { ...r, day: localDay(r.at) },
  onSave: v => { const { day, ...x } = v; return Store.put({ id: r.id, ...x, at: new Date(parseDay(day).getTime() + 6 * 36e5).toISOString() }); }, onDelete: () => Store.remove(r.id) }); };

/* Contacts */
ACT.contact = d => {
  const r = d.id ? Store.get(d.id) : null;
  form({ title: '👤 Contact', value: r || { role: 'Vet clinic' }, fields: [
    { k: 'role', label: 'Who', type: 'select', options: CONTACT_ROLES }, { k: 'name', label: 'Name', required: true },
    { type: 'row', fields: [{ k: 'phone', label: 'Phone', type: 'tel' }, { k: 'email', label: 'Email', type: 'email' }] },
    { k: 'address', label: 'Address' }, { k: 'notes', label: 'Notes', type: 'textarea', rows: 2, ph: 'hours, account #, who to ask for' }],
    onSave: v => Store.put(r ? { id: r.id, ...v } : { kind: 'contact', ...v }), onDelete: r ? () => Store.remove(r.id) : null });
};
ACT.poison = async () => { for (const c of POISON_LINES) await Store.put({ kind: 'contact', ...c }); };

/* Profile / you */
ACT.profile = () => form({ title: '🐶 Profile', value: P(), fields: [
  { type: 'row', fields: [{ k: 'name', label: 'Name', required: true, def: 'Oscar' }, { k: 'breed', label: 'Breed' }] },
  { type: 'row', fields: [{ k: 'birthday', label: 'Birthday', type: 'date' }, { k: 'homeDay', label: 'Came home', type: 'date' }] },
  { type: 'row', fields: [{ k: 'sex', label: 'Sex', type: 'select', options: ['', 'Male', 'Male (neutered)', 'Female', 'Female (spayed)'] }, { k: 'colour', label: 'Colour / markings' }] },
  { type: 'row', fields: [{ k: 'microchip', label: 'Microchip #' }, { k: 'chipRegistry', label: 'Chip registry' }] },
  { type: 'row', fields: [{ k: 'licence', label: 'Licence / tag #' }, { k: 'unit', label: 'Weight unit', type: 'select', options: ['kg', 'lb'] }] },
  { k: 'breeder', label: 'Breeder / rescue' }, { k: 'notes', label: 'Notes', type: 'textarea', rows: 2, ph: 'allergies, quirks, favourite things' }],
  onSave: v => Store.put({ id: 'profile', kind: 'profile', ...v }) });
ACT.me = () => form({ title: '🙋 You', value: { name: Store.pref('oscar.name') || '', alerts: Store.pref('oscar.alerts') === '1' ? 'on' : 'off' }, fields: [
  { k: 'name', label: 'Your name', hint: 'shown next to what you log', required: true },
  { k: 'alerts', label: 'Potty alerts', type: 'chips', options: [['on', 'On'], ['off', 'Off']], hint: 'buzz + notification when a break is due, while the app is open' }],
  onSave: async v => {
    Store.setPref('oscar.name', v.name);
    if (v.alerts === 'on' && window.Notification && Notification.permission === 'default') await Notification.requestPermission();
    Store.setPref('oscar.alerts', v.alerts === 'on' ? '1' : '0');
    render();
  } });

/* Training & socialization */
ACT.train = d => {
  const hist = Store.list('train', r => r.skill === d.skill).slice(0, 5);
  form({ title: `🎓 ${d.skill}`, saveLabel: 'Log session',
    intro: hist.length ? `<div class="hist">${hist.map(h => `<span>${fmtDay(localDay(h.at))} ${'★'.repeat(h.rating || 0)}${'☆'.repeat(5 - (h.rating || 0))}</span>`).join('')}</div>` : '<p class="muted">Short sessions, lots of treats. Rate how it went.</p>',
    fields: [{ k: 'rating', label: 'How did it go?', type: 'chips', options: [['1', '1 · not yet'], ['2', '2'], ['3', '3 · sometimes'], ['4', '4'], ['5', '5 · nailed it']], required: true },
      { k: 'note', label: 'Note', ph: 'what helped, distractions' }],
    onSave: v => Store.put({ kind: 'train', skill: d.skill, rating: Number(v.rating), note: v.note }) });
};
ACT.addSkill = () => form({ title: 'New skill', fields: [{ k: 'skill', label: 'Skill', required: true, ph: 'e.g. Spin, Ring the bell' }],
  onSave: v => Store.put({ id: 'profile', kind: 'profile', skills: [...new Set([...(P().skills || []), v.skill])] }) });
ACT.socCat = d => { ui.openCats[d.cat] = !ui.openCats[d.cat]; render(); };
ACT.social = d => {
  const hist = Store.list('social', r => r.item === d.item);
  const face = { good: '😀', ok: '😐', scared: '😟' };
  sheet(`<h2>${esc(d.item)}</h2><p class="muted">How did ${esc(App.pet())} react?</p>
    <div class="react"><button data-r="good">😀<small>Happy</small></button><button data-r="ok">😐<small>Unsure</small></button><button data-r="scared">😟<small>Scared</small></button></div>
    <div class="fld"><label>Note</label><input id="soc-note" placeholder="where, what helped"></div>
    ${hist.length ? `<h4>Before</h4>${hist.map(h => `<div class="item"><span class="item-main"><span class="ico">${face[h.reaction]}</span><span><small>${fmtWhen(h.at)} · ${esc(h.by || '')}${h.note ? ' — ' + esc(h.note) : ''}</small></span></span><button class="pill" data-del="${h.id}">✕</button></div>`).join('')}` : ''}
    <p class="muted small">If he’s scared, add distance and treats and try again another day.</p>`, root => {
    root.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { await Store.put({ kind: 'social', item: d.item, reaction: b.dataset.r, note: $('#soc-note').value.trim() }); closeSheet(); });
    root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await Store.remove(b.dataset.del); ACT.social(d); });
  });
};

/* Memories */
let captureCtx = {};
ACT.capture = d => {
  captureCtx = { doc: d.k === 'doc', vet: d.vet };
  $({ photo: '#in-photo', video: '#in-video', pick: '#in-pick', doc: '#in-doc' }[d.k]).click();
};
async function onFiles(input) {
  const files = [...input.files]; input.value = '';
  if (!files.length) return;
  const ctx = captureCtx; captureCtx = {};
  const fresh = input.id !== 'in-pick';
  const made = [];
  for (const f of files) made.push(await Media.add(f, { fresh, doc: ctx.doc, caption: ctx.doc ? 'Vet record' : '' }));
  if (ctx.vet) {
    const v = Store.get(ctx.vet);
    await Store.put({ id: v.id, docs: [...(v.docs || []), ...made.map(m => m.id)] });
    return ACT.showVet({ id: v.id });
  }
  toast(`Saved ${made.length > 1 ? made.length + ' items' : ''} — ${Drive.hasToken() ? 'uploading to Drive' : 'will upload when synced'}`,
    made.length === 1 ? [{ label: 'Add caption', run: () => viewer(made[0].id) }] : []);
}
ACT.portrait = () => Media.portraitCamera(rec => toast(`🐶 Week ${App.weekOf(rec.at) ?? ''} portrait saved`, [{ label: 'View', run: () => viewer(rec.id) }]));
ACT.memFilter = d => { ui.memFilter = d.k; render(); };
ACT.view = d => viewer(d.id);

ACT.milestone = () => form({ title: '⭐ Milestone', fields: [
  { k: 'title', label: 'What happened', type: 'suggest', options: MILESTONES.filter(m => !Store.list('milestone', r => r.title === m).length), required: true },
  { k: 'at', label: 'When', type: 'datetime' }, { k: 'note', label: 'The story', type: 'textarea' },
  { k: 'file', label: 'Photo or video (optional)', type: 'file' }],
  onSave: async v => {
    const m = v.file ? await Media.add(v.file, { caption: v.title, star: true, at: v.at }) : null;
    await Store.put({ kind: 'milestone', title: v.title, at: v.at, note: v.note, mediaId: m?.id });
  } });
ACT.editMilestone = d => {
  const r = Store.get(d.id);
  form({ title: '⭐ Milestone', value: r, fields: [{ k: 'title', label: 'What happened', required: true }, { k: 'at', label: 'When', type: 'datetime' }, { k: 'note', label: 'The story', type: 'textarea' }],
    intro: r.mediaId ? `<button class="th wide" data-thumb="${r.mediaId}" data-act="view" data-id="${r.mediaId}"></button>` : '',
    onSave: v => Store.put({ id: r.id, ...v }), onDelete: () => Store.remove(r.id) });
  Media.hydrate($('#sheet'));
};
ACT.journal = () => form({ title: '✍️ Journal', fields: [{ k: 'text', label: 'Today with ' + App.pet(), type: 'textarea', rows: 6, required: true }, { k: 'at', label: 'When', type: 'datetime' }],
  onSave: v => Store.put({ kind: 'journal', ...v }) });
ACT.editJournal = d => form({ title: '✍️ Journal', value: Store.get(d.id), fields: [{ k: 'text', label: 'Entry', type: 'textarea', rows: 6, required: true }, { k: 'at', label: 'When', type: 'datetime' }],
  onSave: v => Store.put({ id: d.id, ...v }), onDelete: () => Store.remove(d.id) });

/* Full-screen viewer with prev/next inside the current Memories list. */
async function viewer(id) {
  const rec = Store.get(id); if (!rec) return;
  const list = rec.doc ? [rec] : Store.list('media', r => !r.doc);
  const i = list.findIndex(r => r.id === id);
  const el = $('#viewer');
  el.hidden = false;
  el.innerHTML = `<div class="v-top"><button data-v="close" aria-label="Close">✕</button><span>${fmtWhen(rec.at)}${App.weekOf(rec.at) != null ? ' · ' + App.weekOf(rec.at) + ' wks' : ''} · ${esc(rec.author || rec.by || '')}</span></div>
    <div class="v-stage"><div class="spin">Loading…</div></div>
    <div class="v-bar">
      <input id="v-cap" value="${esc(rec.caption)}" placeholder="Add a caption…">
      <div class="v-btns">
        <button data-v="star">${rec.star ? '⭐' : '☆'}</button>
        ${navigator.share ? '<button data-v="share">Share</button>' : ''}
        ${rec.driveId ? `<a href="${Drive.webLink(rec.driveId)}" target="_blank" rel="noopener">Drive</a>` : '<span class="muted small">⏳ not uploaded yet</span>'}
        ${!rec.video && !rec.doc ? '<button data-v="avatar">Profile pic</button>' : ''}
        <button data-v="del" class="danger">Delete</button>
      </div>
    </div>
    ${i > 0 ? '<button class="v-nav prev" data-v="prev">‹</button>' : ''}${i >= 0 && i < list.length - 1 ? '<button class="v-nav next" data-v="next">›</button>' : ''}`;
  const stage = el.querySelector('.v-stage');
  Media.fullURL(rec).then(u => {
    if (!u) { stage.innerHTML = '<p class="muted">Sign in to sync to load this one.</p>'; return; }
    stage.innerHTML = rec.video ? `<video src="${u}" controls playsinline autoplay></video>` : `<img src="${u}" alt="">`;
  }).catch(e => { stage.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
  const saveCap = async () => { const c = $('#v-cap').value.trim(); if (c !== (rec.caption || '')) await Store.put({ id: rec.id, caption: c }); };
  el.onclick = async e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const a = b.dataset.v;
    if (a === 'close') { await saveCap(); el.hidden = true; el.innerHTML = ''; }
    if (a === 'prev' || a === 'next') { await saveCap(); viewer(list[i + (a === 'next' ? 1 : -1)].id); }
    if (a === 'star') { await Store.put({ id: rec.id, star: !rec.star }); viewer(id); }
    if (a === 'avatar') { await Store.put({ id: 'profile', kind: 'profile', photoId: rec.id }); toast('Profile picture set'); }
    if (a === 'share') {
      try { const blob = await Media.blobFor(rec); const file = new File([blob], rec.name || 'oscar.jpg', { type: rec.mime });
        await navigator.share({ files: [file], title: App.pet(), text: rec.caption || '' }); } catch {}
    }
    if (a === 'del' && confirm(`Delete this ${rec.video ? 'video' : 'photo'}${rec.driveId ? ' (it also goes to Drive’s trash)' : ''}?`)) {
      await Media.remove(rec); el.hidden = true; el.innerHTML = '';
    }
  };
}

ACT.flipbook = async () => {
  const ps = Store.list('media', r => r.portrait && !r.video).reverse();
  const el = $('#viewer'); el.hidden = false;
  el.innerHTML = `<div class="v-top"><button data-v="close">✕</button><span id="fb-l"></span></div><div class="v-stage"><img id="fb-img" alt=""></div>`;
  const urls = [];
  for (const p of ps) { try { urls.push([p, await Media.fullURL(p)]); } catch {} }
  let k = 0;
  const step = () => { const [p, u] = urls[k % urls.length]; if (u) $('#fb-img').src = u; $('#fb-l').textContent = `${App.weekOf(p.at) ?? '?'} weeks · ${fmtDate(localDay(p.at))}`; k++; };
  step(); const t = setInterval(step, 700);
  el.onclick = e => { if (e.target.closest('[data-v=close]')) { clearInterval(t); el.hidden = true; el.innerHTML = ''; } };
};

/* ---------- sync UI ---------- */
ACT.syncTap = () => {
  const s = Drive.state.status;
  if (s === 'auth') return Drive.signIn().then(() => Drive.sync()).catch(e => toast(esc(e.message)));
  if (s === 'idle' || s === 'error' || s === 'offline') { Drive.sync(); if (s !== 'error') return; }
  ACT.syncSettings();
};
ACT.syncSettings = async () => {
  const root = await Drive.folderId();
  const signed = Drive.hasToken();
  sheet(`<h2>☁️ Sync & sharing</h2>
    <p class="muted">Everything is saved on this phone first and works offline. Sync copies it through a Google Drive folder you both share — photos and videos land there too, sorted by month.</p>
    <div class="step ${Drive.clientId() ? 'ok' : ''}"><b>1. Google client ID</b>
      <p class="small muted">One-time setup in Google Cloud — steps in SETUP.md. Paste the same ID on both phones.</p>
      <div class="inline"><input id="cid" value="${esc(Drive.clientId())}" placeholder="…apps.googleusercontent.com"><button class="pill" id="cid-save">Save</button></div></div>
    <div class="step ${signed ? 'ok' : ''}"><b>2. Sign in</b>
      ${signed ? `<p>Signed in as <b>${esc(Store.pref('oscar.email') || '')}</b> <button class="link" id="sout">Sign out</button></p>` : `<p><button class="primary" id="sin" ${Drive.clientId() ? '' : 'disabled'}>Sign in with Google</button></p>`}</div>
    <div class="step ${root ? 'ok' : ''}"><b>3. Shared folder</b>
      ${root ? `<p>Connected. <a href="${Drive.folderLink(root)}" target="_blank" rel="noopener">Open in Drive</a> · <button class="link" id="fchange">Change</button></p>
        <div class="inline"><input id="semail" type="email" placeholder="partner@gmail.com"><button class="pill" id="sshare">Share</button></div>
        <p class="small muted">Gives them edit access. They then pick “Join” on their phone.</p>`
      : signed ? `<p><button class="primary" id="fnew">Create ${esc(App.pet())}’s folder</button> <button class="ghost" id="ffind">Join a shared one</button></p><div id="flist"></div>`
      : '<p class="muted small">Sign in first.</p>'}</div>
    ${root && signed ? `<p><button class="primary" id="snow">Sync now</button> <span class="muted small">${esc(syncLine())}</span></p>` : ''}`, r => {
    const again = () => ACT.syncSettings();
    const run = (fn, ok) => async () => { try { await fn(); ok && toast(ok); again(); } catch (e) { toast(esc(e.message)); } };
    $('#cid-save', r).onclick = () => { Store.setPref('oscar.clientId', $('#cid', r).value.trim()); again(); };
    $('#sin', r) && ($('#sin', r).onclick = run(async () => { await Drive.signIn(); Drive.sync(); }, 'Signed in'));
    $('#sout', r) && ($('#sout', r).onclick = run(async () => Drive.signOut()));
    $('#fnew', r) && ($('#fnew', r).onclick = run(async () => { await Drive.createFolder(App.pet()); await Drive.sync(); }, 'Folder created'));
    $('#ffind', r) && ($('#ffind', r).onclick = async () => {
      $('#flist', r).innerHTML = '<p class="muted">Looking…</p>';
      try {
        const fs = await Drive.findFolders();
        $('#flist', r).innerHTML = fs.length ? fs.map(f => `<div class="item"><span class="item-main"><span class="ico">📁</span><span><b>${esc(f.name)}</b><small>${esc(f.owners?.[0]?.displayName || '')} ${esc(f.owners?.[0]?.emailAddress || '')}</small></span></span><button class="pill" data-join="${f.id}">Join</button></div>`).join('')
          : '<p class="muted">No shared puppy folder found yet. Ask them to share it from their phone first.</p>';
        $('#flist', r).querySelectorAll('[data-join]').forEach(b => b.onclick = run(async () => { await Drive.joinFolder(b.dataset.join); await Drive.sync(); }, 'Joined — syncing'));
      } catch (e) { $('#flist', r).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
    });
    $('#fchange', r) && ($('#fchange', r).onclick = run(async () => { if (confirm('Disconnect from this folder? Nothing is deleted.')) await Store.kvSet('folders', {}); }));
    $('#sshare', r) && ($('#sshare', r).onclick = run(async () => { const e = $('#semail', r).value.trim(); if (!e) throw new Error('Enter their Google email'); await Drive.share(e); }, 'Shared — they’ll get an email'));
    $('#snow', r) && ($('#snow', r).onclick = () => { Drive.sync(); closeSheet(); });
  });
};

/* ---------- backup ---------- */
ACT.backup = () => sheet(`<h2>💾 Backup</h2>
  <p class="muted">Saves every log, record and caption as one file (photos stay in Drive). Restoring merges — nothing newer is overwritten.</p>
  <p><button class="primary" id="bk-save">Save backup file</button></p>
  <p><label class="ghost filebtn">Restore from file<input type="file" id="bk-load" accept="application/json,.json" hidden></label></p>`, r => {
  $('#bk-save', r).onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 1, app: 'puppy-log', saved: new Date().toISOString(), recs: Store.everything() })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${App.pet().toLowerCase()}-backup-${todayKey()}.json`; a.click();
  };
  $('#bk-load', r).onchange = async e => {
    try { const data = JSON.parse(await e.target.files[0].text()); const n = await Store.merge(data.recs || []); toast(`Restored ${n} records`); closeSheet(); }
    catch (err) { toast('That file didn’t read: ' + esc(err.message)); }
  };
});

/* ---------- care sheet ---------- */
function careText() {
  const p = P(), food = currentFood(), ins = Store.get('insurance');
  const L = [];
  L.push(`${App.pet()}${p.breed ? ' — ' + p.breed : ''}${App.ageText() ? ', ' + App.ageText() : ''}`);
  if (p.microchip) L.push(`Microchip: ${p.microchip}${p.chipRegistry ? ' (' + p.chipRegistry + ')' : ''}`);
  if (p.notes) L.push(`Notes: ${p.notes}`);
  if (food) { L.push('', 'FOOD', `${[food.brand, food.product].filter(Boolean).join(' — ')}`, `${food.perMeal || '?'} × ${food.mealsPerDay || '?'} meals${food.times ? ' at ' + food.times : ''}`); if (food.treats) L.push(`Treats: ${food.treats}`); if (food.notes) L.push(food.notes); }
  const s = pottyStatus();
  L.push('', 'POTTY', `Out about every ${fmtMin(s.interval)} while awake, plus right after waking, eating, drinking and play.`);
  const solid = skillList().filter(k => { const r = Store.list('train', x => x.skill === k).slice(0, 3); return r.length && r.reduce((a, b) => a + (b.rating || 0), 0) / r.length >= 4.5; });
  if (solid.length) L.push('', 'KNOWS', solid.join(', '));
  const meds = dueItems().filter(r => daysUntil(r.due) <= 14);
  if (meds.length) L.push('', 'DUE SOON', ...meds.map(r => `${r.name} — ${fmtDay(r.due)}`));
  const vacc = Store.list('health', r => r.done && r.cat === 'vaccine');
  if (vacc.length) L.push('', 'VACCINES', ...vacc.map(r => `${r.name} — ${fmtDate(r.done)}`));
  const cs = Store.list('contact');
  if (cs.length) L.push('', 'CONTACTS', ...cs.map(c => `${c.role}: ${c.name}${c.phone ? ' — ' + c.phone : ''}`));
  if (ins?.provider) L.push('', 'INSURANCE', `${ins.provider}${ins.policy ? ' — policy ' + ins.policy : ''}${ins.phone ? ' — ' + ins.phone : ''}`);
  return L.join('\n');
}
ACT.careSheet = () => sheet(`<h2>📋 Care sheet</h2><pre class="care" id="care">${esc(careText())}</pre>
  <div class="btns"><button class="ghost" id="c-print">Print</button>${navigator.share ? '<button class="ghost" id="c-share">Share</button>' : ''}<button class="primary" id="c-copy">Copy</button></div>`, r => {
  $('#c-copy', r).onclick = async () => { try { await navigator.clipboard.writeText(careText()); toast('Copied'); } catch { toast('Copy failed'); } };
  $('#c-print', r).onclick = () => window.print();
  $('#c-share', r) && ($('#c-share', r).onclick = () => navigator.share({ title: `${App.pet()} care sheet`, text: careText() }).catch(() => {}));
});

/* ---------- onboarding ---------- */
function onboard() {
  form({ title: 'Welcome 🐾', saveLabel: 'Let’s go',
    intro: '<p class="muted">A few basics. Everything can be changed later in More.</p>',
    fields: [
      { k: 'name', label: 'Puppy’s name', required: true, def: 'Oscar' }, { k: 'breed', label: 'Breed' },
      { type: 'row', fields: [{ k: 'birthday', label: 'Birthday', type: 'date', hint: 'best guess is fine' }, { k: 'homeDay', label: 'Home day', type: 'date' }] },
      { k: 'me', label: 'Your name', required: true, hint: 'so you can tell who logged what' },
      { k: 'unit', label: 'Weight in', type: 'chips', options: ['kg', 'lb'], def: 'kg' }],
    onSave: async v => {
      Store.setPref('oscar.name', v.me);
      const { me, ...p } = v;
      await Store.put({ id: 'profile', kind: 'profile', ...p });
    } });
}

/* ---------- render ---------- */
let rq = false;
function render() {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  view().innerHTML = VIEWS[ui.tab]();
  Media.hydrate(view());
  tickCountdown();
}
const renderSoon = () => { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const f = ACT[b.dataset.act];
  if (f) { e.preventDefault(); f(b.dataset, b); }
});
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
$('#sheet-close').onclick = closeSheet;
['in-photo', 'in-video', 'in-pick', 'in-doc'].forEach(id => $('#' + id).onchange = e => onFiles(e.target).catch(err => toast(esc(err.message))));
window.addEventListener('popstate', () => { if (!$('#sheet').hidden) closeSheet(); });

(async () => {
  await Store.open();
  Store.onChange(() => { renderSoon(); Drive.soon(); });
  Drive.onChange(() => {
    const chip = $('.sync'); if (chip) chip.outerHTML = syncChip();
  });
  render();
  if (!Store.get('profile')) onboard();
  setInterval(tickCountdown, 1000);
  setInterval(() => { if (ui.tab === 'today') renderSoon(); }, 60000);
  Drive.sync();
  setInterval(() => document.visibilityState === 'visible' && Drive.sync(), 120000);
  addEventListener('online', () => Drive.sync());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && (Drive.sync(), renderSoon()));
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'activated' && navigator.serviceWorker.controller) location.reload(); });
      });
    });
  }
})();
