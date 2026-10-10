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
  /* A schedule you chose on the Train tab (stretching toward a work-day gap) wins over the guess. */
  const target = Number(P().pottyTarget) || 0;
  if (target) interval = target;

  let due = last ? T(last.at) + interval * 6e4 : now;
  let reason = last ? `every ~${fmtMin(interval)}${target ? ' (your schedule)' : learned ? ' (learned)' : ''}` : 'no potty logged yet';
  for (const r of logs) {
    if (last && r.at <= last.at) break;
    const d = hiddenTypes().has(r.type) ? null : LOG[r.type]?.trigger;
    if (d != null && T(r.at) + d * 6e4 < due) { due = T(r.at) + d * 6e4; reason = `${d} min after ${LOG[r.type].label.toLowerCase()}`; }
  }
  return { due, reason, interval, learned, base, asleep, last, sleepEv };
}

/* ---------- state ---------- */
const ui = { tab: 'today', day: todayKey(), memFilter: 'all', openCats: {}, pick: null };   // pick: media ids while choosing shots for a reel
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
/* Which one-tap buttons show is a shared choice (stored on the profile), and a
   hidden type stops nudging the potty countdown — a bowl that's always full
   or play all day isn't an event worth logging. */
const hiddenTypes = () => new Set(P().quickHide || []);
const quickTypes = () => LOG_TYPES.filter(t => !hiddenTypes().has(t.k));

function quickGrid() {
  const ts = quickTypes(), rest = ts.some(t => t.k === 'sleep') || ts.some(t => t.k === 'wake');
  const btns = ts.filter(t => t.k !== 'wake').map(t => t.k === 'sleep' ? restButton()
    : `<button data-act="log" data-k="${t.k}" class="q-${t.k}"><span>${t.icon}</span>${t.k === 'walk' && activeWalk() ? 'End walk' : t.label}</button>`);
  if (rest && !ts.some(t => t.k === 'sleep')) btns.push(restButton());
  const cols = [0, 1, 2, 3, 4, 5, 3, 4, 4, 5, 5][btns.length] || 5;
  return `<section class="quick" style="grid-template-columns: repeat(${cols}, 1fr)">${btns.join('')}</section>`;
}

/* Sleep: one button that says what it'll do next. */
const nightTime = () => { const h = new Date().getHours(); return h >= 19 || h < 5; };
function sleepState() {
  const e = Store.list('log', r => r.type === 'sleep' || r.type === 'wake')[0];
  return { asleep: e?.type === 'sleep', night: !!e?.night, since: e?.at };
}
function restButton() {
  const s = sleepState();
  const [icon, label] = s.asleep ? (s.night ? ['🌅', 'Morning'] : ['☀️', 'Awake']) : (nightTime() ? ['🌙', 'Bedtime'] : ['😴', 'Nap']);
  return `<button data-act="log" data-k="rest" class="q-rest ${s.asleep ? 'on' : ''}"><span>${icon}</span>${label}</button>`;
}

/* An open walk is a walk log with no end yet. */
const activeWalk = () => Store.list('log', r => r.type === 'walk' && r.open)[0];

async function quickLog(type, extra = {}) {
  if (type === 'accident') return accidentSheet();
  if (type === 'walk') {
    const w = activeWalk();
    if (w) return endWalk(w);
    const rec = await Store.put({ kind: 'log', type: 'walk', open: true });
    navigator.vibrate && navigator.vibrate(15);
    return toast(`🦮 Walk started ${fmtTime(rec.at)}`, [{ label: 'Undo', run: () => Store.remove(rec.id) }]);
  }
  if ((type === 'pee' || type === 'poop' || type === 'both') && activeWalk()) extra = { onWalk: activeWalk().id, ...extra };
  if (type === 'both') {
    const at = new Date().toISOString();
    const a = await Store.put({ kind: 'log', type: 'pee', at, ...extra }), b = await Store.put({ kind: 'log', type: 'poop', at, ...extra });
    navigator.vibrate && navigator.vibrate(15);
    return toast(`💧💩 Pee + poop logged ${fmtTime(at)}`, [{ label: 'Undo', run: async () => { await Store.remove(a.id); await Store.remove(b.id); } }]);
  }
  if (type === 'rest') {           // the single sleep button: Bedtime/Nap when awake, Morning/Awake when asleep
    const s = sleepState();
    if (s.asleep) return quickLog('wake', s.night ? { morning: true } : {});
    return quickLog('sleep', nightTime() ? { night: true } : {});
  }
  if (type === 'note') return form({ title: 'Note', fields: [{ k: 'note', label: 'What happened?', type: 'textarea', required: true }, { k: 'at', label: 'When', type: 'datetime' }],
    onSave: v => Store.put({ kind: 'log', type: 'note', note: v.note, at: v.at }) });
  const rec = await Store.put({ kind: 'log', type, ...extra });
  navigator.vibrate && navigator.vibrate(15);
  if (type === 'meal') {          // one more tap: how much did he eat? (feeds the eating trend)
    return toast(`🍖 Meal ${fmtTime(rec.at)} — how much did he eat?`, ['All', 'Most', 'Some', 'None'].map(a => ({ label: a, run: () => Store.put({ id: rec.id, ate: a }) })));
  }
  toast(`${LOG[type].icon} ${LOG[type].label} logged ${fmtTime(rec.at)}`, [
    { label: 'Edit', run: () => editLog(rec.id) },
    { label: 'Undo', run: () => Store.remove(rec.id) },
  ]);
}

async function endWalk(w) {
  const minutes = Math.max(1, Math.round((Date.now() - T(w.at)) / 6e4));
  await Store.put({ id: w.id, open: false, minutes });
  const did = Store.list('log', r => r.onWalk === w.id).map(r => LOG[r.type].icon).join(' ');
  toast(`🦮 Walk done — ${fmtMin(minutes)}${did ? ' · ' + did : ''}`, [{ label: 'Edit', run: () => editLog(w.id) }]);
}

function walkCard() {
  const w = activeWalk(); if (!w) return '';
  const did = Store.list('log', r => r.onWalk === w.id);
  return `<section class="card walk"><div class="h-row"><div><div class="cd-label">On a walk</div><div class="cd-big" id="walk-t">${fmtMin((Date.now() - T(w.at)) / 6e4)}</div>
    <p class="muted small">since ${fmtTime(w.at)}${did.length ? ' · ' + did.map(r => LOG[r.type].icon).join(' ') : ''}</p></div><div class="big-emoji">🦮</div></div>
    <div class="walk-btns"><button data-act="log" data-k="pee">💧 Pee</button><button data-act="log" data-k="poop">💩 Poop</button><button class="primary" data-act="log" data-k="walk">End walk</button></div></section>`;
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
    off: ['off', 'Not syncing'],
    offline: ['off', 'Offline'], error: ['warn', 'Sync problem'], syncing: ['busy', 'Syncing…'],
    idle: ['ok', s.last ? 'Synced' : 'Connected'],
  };
  let [cls, txt] = map[s.status] || map.off;
  if (s.upload) { cls = 'busy'; txt = s.upload.totalMB > 20 ? `Uploading ${Math.round(s.upload.doneMB)} of ${Math.round(s.upload.totalMB)} MB` : `Uploading ${s.upload.n}/${s.upload.of}`; }
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
  const wt = $('#walk-t'), w = wt && activeWalk();
  if (w) wt.textContent = fmtMin((Date.now() - T(w.at)) / 6e4);
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
  if (r.type === 'walk' && r.open) detail = 'out now';
  if (r.type === 'sleep' && r.night) detail = 'bedtime' + (r.note ? ' · ' + r.note : '');
  if (r.type === 'wake' && r.morning) detail = 'morning' + (r.note ? ' · ' + r.note : '');
  if (r.type === 'ask') detail = [(r.signs || []).map(s => SIGN[s]?.label.toLowerCase()).filter(Boolean).join(', '), NEEDS[r.need] && '→ ' + NEEDS[r.need].label.toLowerCase(), r.note].filter(Boolean).join(' ');
  return `<button class="tl ${r.type}" data-act="editLog" data-id="${r.id}">
    <time>${fmtTime(r.at)}</time><span class="ico">${t.icon}</span>
    <span class="tl-t"><b>${esc(t.label)}</b>${detail ? `<small>${esc(detail)}</small>` : ''}</span>
    <span class="by">${esc(r.by || '')}</span></button>`;
}

const VIEWS = {};

/* ---------- getting ready, "who did what", shopping ---------- */
const ago = iso => { const m = (Date.now() - T(iso)) / 6e4; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${fmtMin(m)} ago` : fmtDay(localDay(iso)); };

function prepItems() {
  const recs = Store.list('prep');
  const byItem = new Map(recs.map(r => [r.item, r]));
  const groups = Object.entries(PREP_LIST).map(([g, items]) => [g, items.map(i => ({ item: i, rec: byItem.get(i) }))]);
  const custom = recs.filter(r => r.custom).map(r => ({ item: r.item, rec: r }));
  if (custom.length) groups.push(['Our own', custom]);
  const all = groups.flatMap(([, xs]) => xs);
  return { groups, done: all.filter(x => x.rec?.done).length, total: all.length };
}

function homeCard() {
  const h = P().homeDay; if (!h) return '';
  const d = daysUntil(h), prep = prepItems();
  if (d < -7 || (d < 0 && prep.done === prep.total)) return '';
  const pct = Math.round(100 * prep.done / prep.total);
  return `<section class="card home">
    <div class="h-row"><div><div class="cd-label">${d > 0 ? 'Coming home' : d === 0 ? 'Home day' : 'Settling in'}</div>
      <div class="cd-big">${d > 1 ? `in ${d} days` : d === 1 ? 'tomorrow!' : d === 0 ? 'today! 🎉' : `day ${1 - d}`}</div>
      <p class="muted small">${fmtDay(h)}</p></div><div class="big-emoji">🏠</div></div>
    <button class="prep-bar" data-act="prep"><i style="width:${pct}%"></i><span>Getting ready: ${prep.done}/${prep.total}</span></button>
  </section>`;
}

function whoLine() {
  const last = t => Store.list('log', r => r.type === t)[0];
  const bits = [['meal', 'Fed'], ['walk', 'Walked'], ['pee', 'Pee']].map(([t, l]) => { const r = last(t); return r ? `<span><b>${l}</b> ${ago(r.at)}${r.by ? ' · ' + esc(r.by) : ''}</span>` : ''; }).filter(Boolean);
  return bits.length ? `<div class="who">${bits.join('')}</div>` : '';
}

const shopItems = () => Store.list('shop').sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.at < b.at ? 1 : -1));

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
    ${homeCard()}
    ${P().homeDay && daysUntil(P().homeDay) > 0 && !Store.list('log').length ? '' : countdownCard()}
    ${whoLine()}
    ${walkCard()}
    ${planTodayCard()}
    ${coachTodayCard()}
    ${quickGrid()}
    ${askButton()}
    ${appCfg('cam').on ? `<button class="cam-btn" data-act="openCam">📹 Check on ${esc(App.pet())} <span class="muted small">${esc(camName())}</span></button>` : ''}
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
    ${due.length || nextLessons(7).length || upcomingAppts(7).length ? `<section class="card"><h3>Coming up</h3>${upcomingAppts(7).map(apptRow).join('')}${nextLessons(7).map(lessonRow).join('')}${due.map(healthRow).join('')}</section>` : ''}
    ${shopItems().some(x => !x.done) ? `<button class="card chipcard" data-act="shop">🛒 <b>${shopItems().filter(x => !x.done).length} on the shopping list</b> <span class="muted">${esc(shopItems().filter(x => !x.done).slice(0, 3).map(x => x.text).join(', '))}</span></button>` : ''}
    </div></div>`;
};

VIEWS.health = () => {
  const due = dueItems();
  const done = Store.list('health', r => r.done).sort((a, b) => a.done < b.done ? 1 : -1);
  const vets = Store.list('vet');
  const unit = P().unit || 'kg';
  const hasBday = !!P().birthday;
  return `${header('Health & vet')}
    ${vetAppBtn()}
    <div class="cols"><div>
    <section class="card"><div class="h-row"><h3>Due</h3><button class="pill" data-act="addHealth">+ Reminder</button></div>
      ${due.filter(r => daysUntil(r.due) < 0).length > 1 ? `<button class="banner" data-act="reviewPast">📋 ${due.filter(r => daysUntil(r.due) < 0).length} past due — already done before he came home? <b>Review</b></button>` : ''}
      ${due.length ? due.map(healthRow).join('') : '<p class="muted">Nothing scheduled.</p>'}
      ${!Store.list('health').length ? `<div class="empty">
        <p>Start from a typical first-year schedule (DHPP, lepto, bordetella, rabies, deworming, flea & tick) and edit it to match what your vet says.</p>
        <button class="primary" data-act="typical" ${hasBday ? '' : 'disabled'}>Add typical puppy schedule</button>
        ${hasBday ? '' : '<small>Add his birthday in More → Profile first.</small>'}</div>` : ''}
    </section>
    <section class="card"><div class="h-row"><h3>Weight</h3><button class="pill" data-act="addWeight">+ Weight</button></div>
      ${weightChart(unit)}</section>
    </div><div>
    <section class="card"><div class="h-row"><h3>📅 Appointments</h3><button class="pill" data-act="appt">+ Book</button></div>
      ${Store.list('appt', a => !a.visitId && !a.cancelled).sort((a, b) => (a.day + (a.time || '')) < (b.day + (b.time || '')) ? -1 : 1).map(apptRow).join('') || '<p class="muted">Booked a vet visit (or grooming)? Add it here — it shows on Today and in the morning reminder.</p>'}
    </section>
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

/* ---------- Train tab ---------- */
/* Handlers defined above `const ACT` go here and join ACT once it exists —
   assigning to ACT before its declaration crashes the whole app (TDZ). */
const EARLY_ACT = {};
/* House-training progress, from the logs: how long he's holding it, the
   accident-free streak, and when it's reasonable to stretch the schedule. */
function pottyProgress() {
  const now = Date.now();
  const logs = Store.list('log', r => T(r.at) > now - 14 * 864e5 && (r.type === 'pee' || r.type === 'poop' || r.type === 'accident' || r.type === 'sleep')).reverse();
  const gaps = []; let prev = null;
  for (const r of logs) {
    if (r.type === 'sleep') { prev = null; continue; }        // don't count overnight
    if (prev && r.type !== 'accident') { const g = (T(r.at) - T(prev.at)) / 6e4; if (g >= 15 && g <= 600) gaps.push({ g, at: r.at }); }
    prev = r;
  }
  const week = gaps.filter(x => T(x.at) > now - 7 * 864e5).map(x => x.g);
  const accidents = Store.list('log', r => r.type === 'accident');
  const lastAcc = accidents[0];
  const firstLog = Store.list('log').slice(-1)[0];
  const streakDays = Math.floor((now - T(lastAcc ? lastAcc.at : (firstLog ? firstLog.at : new Date().toISOString()))) / 864e5);
  return { typical: week.length >= 3 ? median(week) : null, longest: week.length ? Math.max(...week) : null, streakDays, hadAccidents: !!lastAcc,
    recentAccidents: accidents.filter(r => T(r.at) > now - 3 * 864e5).length, target: Number(P().pottyTarget) || 0, goal: Number(P().pottyGoal) || 240, samples: week.length };
}

function pottyPlanCard() {
  const p = pottyProgress(), cur = p.target || (p.typical ? Math.round(p.typical / 15) * 15 : 0);
  // Each step needs a few accident-free days of its own before the next one.
  const sinceStep = P().pottyTargetAt ? Math.floor((Date.now() - T(P().pottyTargetAt)) / 864e5) : 99;
  const ready = p.streakDays >= 5 && p.samples >= 5 && p.recentAccidents === 0 && sinceStep >= 3 && cur < p.goal;
  const back = p.recentAccidents >= 2;
  const next = Math.min(p.goal, (cur || 120) + 30);
  const pct = cur ? Math.min(100, Math.round(100 * cur / p.goal)) : 0;
  const advice = back ? `Two or more accidents in the last 3 days — step back to ${fmtMin(Math.max(60, (cur || 120) - 30))} for a few days, then try again.`
    : ready ? `${p.streakDays} days without an accident — he’s ready to stretch to <b>${fmtMin(next)}</b>.`
    : cur && cur >= p.goal && p.recentAccidents === 0 ? `He’s at your ${fmtMin(p.goal)} goal 🎉 Keep it steady.`
    : sinceStep < 3 && p.recentAccidents === 0 ? `Holding at ${fmtMin(cur)} — give each step 3 accident-free days (day ${sinceStep + 1}).`
    : p.samples < 5 ? 'Log a few more days of pees and poops to see his pattern.'
    : `Keep the current schedule until he’s had 5 accident-free days${p.hadAccidents ? ` (now ${p.streakDays})` : ''}.`;
  return `<section class="card"><h3>🚽 House-training progress</h3>
    <div class="pp-grid">
      <div><b>${p.typical ? fmtMin(p.typical) : '—'}</b><small>typical gap this week</small></div>
      <div><b>${p.longest ? fmtMin(p.longest) : '—'}</b><small>longest held</small></div>
      <div><b>${p.hadAccidents ? p.streakDays + ' d' : '—'}</b><small>since an accident</small></div>
    </div>
    <div class="goal"><div class="goal-bar"><i style="width:${pct}%"></i></div><small>Schedule ${cur ? fmtMin(cur) : 'not set'} · goal ${fmtMin(p.goal)} <button class="link" data-act="pottyGoal">change goal</button></small></div>
    <p>${advice}</p>
    <div class="btns">${ready && !back ? `<button class="primary" data-act="pottyStretch" data-m="${next}">Stretch to ${fmtMin(next)}</button>` : ''}
      ${back ? `<button class="ghost" data-act="pottyStretch" data-m="${Math.max(60, (cur || 120) - 30)}">Step back</button>` : ''}
      ${p.target ? '<button class="link" data-act="pottyStretch" data-m="0">Let the app guess again</button>' : ''}</div>
    <details><summary>How to stretch the time between breaks</summary><ul>
      <li>Add 15–30 minutes at a time, and only after several accident-free days at the current gap.</li>
      <li>Keep the “extras” for now: out right after waking, eating and play. Stretch the gaps in between.</li>
      <li>Signs he’s getting better: longer gaps with no accidents, holding it through the night, going quickly once outside, and asking at the door (sniffing, circling, whining, looking at you).</li>
      <li>An accident usually means the step was too big — go back 15–30 minutes for a few days. No scolding; clean with enzyme cleaner so he isn’t drawn back to the spot.</li>
      <li>For work days: young dogs shouldn’t be left to hold it for a full work day. Plan a midday break (you, a walker or daycare) even once he can hold longer.</li>
    </ul></details></section>`;
}

EARLY_ACT.pottyStretch = async d => {
  const m = Number(d.m) || 0;
  await Store.put({ id: 'profile', kind: 'profile', pottyTarget: m || '', pottyTargetAt: m ? new Date().toISOString() : '' });
  toast(m ? `Schedule: every ${fmtMin(m)} — the countdown uses this now` : 'Back to the app’s own estimate');
};
EARLY_ACT.pottyGoal = () => form({ title: '🎯 Longest gap you need', value: { goal: (Number(P().pottyGoal) || 240) / 60 },
  intro: '<p class="muted">e.g. 4 hours until a midday break on work days.</p>',
  fields: [{ k: 'goal', label: 'Hours', type: 'number', required: true }],
  onSave: v => Store.put({ id: 'profile', kind: 'profile', pottyGoal: Math.round(Number(v.goal) * 60) }) });

const doneGames = id => Store.list('enrich', r => r.game === id);
EARLY_ACT.gameDone = async d => { await Store.put({ kind: 'enrich', game: d.id }); navigator.vibrate && navigator.vibrate(15); toast('🧠 Nice — logged'); };
EARLY_ACT.guide = d => {
  const g = GUIDES.find(x => x.id === d.id) || BEHAVIOUR.find(x => x.id === d.id);
  const hist = g.skill ? Store.list('train', r => r.skill === g.skill).slice(0, 4) : [];
  sheet(`<h2>${g.icon} ${esc(g.title)}</h2><p class="muted">${esc(g.why)}</p>
    ${videoButton(g.id)}
    <h4>Steps</h4><ol class="steps">${g.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    <div class="banner jindo">🐕 <b>Jindo tip:</b> ${esc(g.jindo)}</div>
    <h4>Common mistakes</h4><ul>${g.mistakes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${g.vet ? `<div class="banner vet">🩺 <b>When to get help:</b> ${esc(g.vet)}</div>` : ''}
    ${hist.length ? `<h4>Recent sessions</h4><div class="hist">${hist.map(h => `<span>${fmtDay(localDay(h.at))} ${'★'.repeat(h.rating || 0)}${'☆'.repeat(5 - (h.rating || 0))}</span>`).join('')}</div>` : ''}
    ${g.skill ? `<div class="btns"><span class="grow"></span><button class="primary" data-act="train" data-skill="${esc(g.skill)}">Log a practice session</button></div>` : '<div class="btns"><span class="grow"></span><button class="ghost" data-act="log" data-k="note">📝 Note when it happens</button></div>'}`);
};
EARLY_ACT.game = d => {
  const g = GAMES.find(x => x.id === d.id), n = doneGames(g.id).length;
  sheet(`<h2>${g.icon} ${esc(g.title)}</h2><p class="muted">${esc(g.time)} · ${g.level === 1 ? 'easy' : 'a bit harder'} · you need: ${esc(g.need)}</p>
    <p>${esc(g.how)}</p>${videoButton(g.id)}${n ? `<p class="muted small">Done ${n} time${n > 1 ? 's' : ''} · last ${fmtDay(localDay(doneGames(g.id)[0].at))}</p>` : ''}
    <div class="btns"><span class="grow"></span><button class="primary" data-act="gameDone" data-id="${g.id}">We did it 🎉</button></div>`);
};

/* A different guide and game suggestion each day. */
function todaysPicks() {
  const n = Math.floor(Date.now() / 864e5);
  const fresh = GAMES.filter(g => !doneGames(g.id).some(r => daysUntil(localDay(r.at)) > -3));
  return { guide: GUIDES[n % GUIDES.length], game: (fresh.length ? fresh : GAMES)[n % (fresh.length || GAMES.length)] };
}

VIEWS.train = () => {
  const pick = todaysPicks();
  const weekGames = Store.list('enrich', r => T(r.at) > Date.now() - 7 * 864e5).length;
  return `${header('Training & brain games')}
    <div class="cols"><div>
    ${coachCard()}
    <section class="card"><h3>✨ Today’s brain game</h3>
      <button class="item-main block" data-act="game" data-id="${pick.game.id}"><span class="ico">${pick.game.icon}</span><span><b>Play: ${esc(pick.game.title)}</b><small>${esc(pick.game.time)} · ${esc(pick.game.need)}</small></span></button>
    </section>
    ${pottyPlanCard()}
    <section class="card"><h3>🆘 Behaviour help</h3>
      ${BEHAVIOUR.map(g => `<button class="item-main block" data-act="guide" data-id="${g.id}"><span class="ico">${g.icon}</span><span><b>${esc(g.title)}</b><small>${esc(g.when)}</small></span></button>`).join('')}
    </section>
    <section class="card"><h3>📚 How to train</h3>
      ${GUIDES.map(g => `<button class="item-main block" data-act="guide" data-id="${g.id}"><span class="ico">${g.icon}</span><span><b>${esc(g.title)}</b><small>${esc(g.when)}</small></span></button>`).join('')}
      <details><summary>Training basics that make everything easier</summary><ul>${TRAINING_BASICS.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    </section>
    </div><div>
    ${planCard()}
    <section class="card"><div class="h-row"><h3>🧩 Brain games</h3><span class="muted small">${weekGames} this week</span></div>
      <p class="muted small">10 minutes of sniffing and problem-solving can tire him like a long walk. Tip: serve one of his two meals this way.</p>
      <div class="games">${GAMES.map(g => { const n = doneGames(g.id).length; return `<button class="game" data-act="game" data-id="${g.id}"><span>${g.icon}</span><b>${esc(g.title)}</b><small>${esc(g.time)}${n ? ' · ✓' + n : ''}</small></button>`; }).join('')}</div>
    </section>
    <section class="card"><div class="h-row"><h3>🎓 Skills</h3><button class="pill" data-act="addSkill">+ Skill</button></div>
      <div class="skills">${skillList().map(skillCard).join('')}</div></section>
    ${classesCard()}
    <section class="card"><details><summary><b>🗓️ A good day’s shape</b></summary><ul>${DAILY_SHAPE.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details></section>
    </div></div>`;
};

VIEWS.grow = () => {
  const d = App.ageDays();
  const wksLeft = d == null ? null : Math.ceil((16 * 7 - d) / 7);
  return `${header('Growing up')}
    <div class="cols"><div>
    ${breedNotes() ? `<section class="card breed"><details><summary><b>🐕 About ${esc(P().breed)}s</b> <span class="muted small">tendencies, not rules</span></summary>
      <ul>${breedNotes().tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details></section>` : ''}
    ${trendsCard()}
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

const breedNotes = () => { const b = (P().breed || '').toLowerCase(); return Object.entries(BREED_NOTES).find(([k]) => b.includes(k))?.[1] || null; };
function skillList() {
  const extra = new Set([...(breedNotes()?.skills || []), ...Store.list('train').map(r => r.skill)]);
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

/* This week vs last: the numbers that show whether things are getting easier. */
function weekStats(endMs) {
  const start = endMs - 7 * 864e5;
  const logs = Store.list('log', r => T(r.at) >= start && T(r.at) < endMs);
  const n = t => logs.filter(r => r.type === t).length;
  const potty = logs.filter(r => r.type === 'pee' || r.type === 'poop' || r.type === 'accident').reverse();
  const gaps = [];
  for (let i = 1; i < potty.length; i++) { const g = (T(potty[i].at) - T(potty[i - 1].at)) / 6e4; if (g >= 15 && g <= 360) gaps.push(g); }
  let sleep = 0;
  for (let d = 0; d < 7; d++) sleep += daySummary(dayKey(new Date(start + (d + 0.5) * 864e5))).sleepH;
  const outside = n('pee') + n('poop');
  return { accidents: n('accident'), outsidePct: outside + n('accident') ? Math.round(100 * outside / (outside + n('accident'))) : null,
    gap: gaps.length ? median(gaps) : null, walkMin: logs.filter(r => r.type === 'walk').reduce((a, r) => a + (Number(r.minutes) || 0), 0),
    sleepH: sleep / 7, meals: n('meal'), logged: logs.length,
    finished: (() => { const m = logs.filter(r => r.type === 'meal' && r.ate); return m.length ? Math.round(100 * m.filter(r => r.ate === 'All' || r.ate === 'Most').length / m.length) : null; })() };
}
function trendsCard() {
  const now = Date.now(), a = weekStats(now), b = weekStats(now - 7 * 864e5);
  if (!a.logged) return '';
  const row = (label, cur, prev, fmt, better) => {
    if (cur != null && prev != null && Math.abs(cur) < 0.05 && Math.abs(prev) < 0.05 && label.startsWith('Sleep')) return '';
    const has = cur != null, raw = has && prev != null ? cur - prev : null, d = raw != null && Math.abs(raw) < 0.05 ? 0 : raw;
    const good = d == null || d === 0 ? '' : (better === 'up' ? d > 0 : d < 0) ? 'up' : 'down';
    return `<div class="trend"><span>${label}</span><b>${has ? fmt(cur) : '—'}</b><small class="${good}">${d == null || !b.logged ? '' : d === 0 ? 'same' : (d > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(d))}</small></div>`;
  };
  return `<section class="card"><h3>📈 This week vs last</h3>
    ${row('Accidents', a.accidents, b.accidents, x => String(x), 'down')}
    ${row('Outside', a.outsidePct, b.outsidePct, x => x + '%', 'up')}
    ${row('Time between breaks', a.gap, b.gap, x => fmtMin(x), 'up')}
    ${row('Walking', a.walkMin, b.walkMin, x => fmtMin(x), 'up')}
    ${row('Sleep a day', a.sleepH, b.sleepH, x => x.toFixed(1) + ' h', 'up')}
    ${row('Meals finished', a.finished, b.finished, x => x + '%', 'up')}
    <p class="muted small">Longer gaps between potty breaks mean his bladder control is growing.</p></section>`;
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
  const f = ui.memFilter, picking = Array.isArray(ui.pick);
  const media = f === 'portraits' ? all.filter(r => r.portrait) : f === 'starred' ? all.filter(r => r.star) : f === 'videos' ? all.filter(r => r.video) : all;
  const extras = picking ? [] : f === 'all' ? [...Store.list('milestone'), ...Store.list('journal')] : f === 'starred' ? Store.list('milestone') : [];
  const oldest = Store.pref('oscar.photoOrder') === 'oldest';
  const items = [...media, ...extras].sort((a, b) => (a.at < b.at ? 1 : -1) * (oldest ? -1 : 1));
  const groups = [];
  for (const r of items) {
    const key = localDay(r.at);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const w = App.weekOf(r.at);
      groups.push(g = { key, title: `${fmtDay(key)}${w != null && w >= 0 ? ` · ${w} weeks old` : ''}`, items: [] });
    }
    g.items.push(r);
  }
  const filters = `<div class="filters"><button class="chip" data-act="photoOrder">${oldest ? '↑ Oldest first' : '↓ Newest first'}</button>${[['all', 'All'], ['starred', '⭐ Starred'], ['portraits', 'Portraits'], ['videos', 'Videos']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="memFilter" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (picking) {               // choosing shots for a reel: tap in play order, numbers show the order
    const n = id => ui.pick.indexOf(id) + 1;
    return `${header('Pick the shots')}
      <section class="card pickhelp"><p><b>Tap photos and videos in the order you want them to play.</b> Mix a few from each day — videos make it funnier. 3 to 20 shots.</p></section>
      ${filters}
      ${groups.map(g => `<section class="mgroup"><h3>${esc(g.title)}</h3>
        <div class="grid">${g.items.map(r => `<button class="gi ${n(r.id) ? 'picked' : ''}" data-act="pickToggle" data-id="${r.id}" ${r.driveId ? '' : 'disabled'}>
          <div class="th" data-thumb="${r.id}"></div>${r.video ? '<span class="vid">▶</span>' : ''}${n(r.id) ? `<span class="pickn">${n(r.id)}</span>` : ''}${!r.driveId ? '<span class="up" title="Still uploading">⏳</span>' : ''}</button>`).join('')}</div>
      </section>`).join('')}
      <div class="pickpad"></div>
      <div class="pickbar" id="pickbar"><button class="ghost" data-act="pickCancel">Cancel</button><span><b>${ui.pick.length}</b> picked</span>
        <button class="primary" data-act="pickSend" ${ui.pick.length < 3 ? 'disabled' : ''}>🎬 Next</button></div>`;
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
    ${reelsStrip()}
    ${filters}
    ${groups.map(g => `<section class="mgroup"><h3>${esc(g.title)}</h3>
      ${g.items.filter(r => r.kind !== 'media').map(memCard).join('')}
      <div class="grid">${g.items.filter(r => r.kind === 'media').map(r => `<button class="gi" data-act="view" data-id="${r.id}">
        <div class="th" data-thumb="${r.id}"></div>${r.video ? '<span class="vid">▶</span>' : ''}${r.star ? '<span class="star">⭐</span>' : ''}${!r.driveId ? '<span class="up" title="Waiting to upload">⏳</span>' : ''}</button>`).join('')}</div>
    </section>`).join('') || '<p class="muted pad">Photos, videos, milestones and journal notes all land here, grouped by his age.</p>'}`;
};

/* ---------- reels ---------- */
/* Made on the Mac each evening (reels/make_reel.py) from the day's photos and
   videos, saved to Drive → Reels, and listed here as `reel` records. Posting
   stays one tap and yours: Share → Instagram, with the caption copied. */
function reelsStrip() {
  const reels = Store.list('reel').sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) || (a.option || '').localeCompare(b.option || ''));
  const reqs = Store.list('reelreq', r => r.status === 'pending' || r.status === 'failed');
  return `<section class="card"><div class="h-row"><h3>🎬 Reels</h3><button class="pill" data-act="pickStart">＋ Make your own</button></div>
    ${reels.length || reqs.length ? `<div class="strip">${reqs.map(r => `<button data-act="reelReq" data-id="${r.id}"><div class="th reel ${r.status}"><i>${r.status === 'failed' ? '⚠️' : '⏳'}</i></div><small>${r.status === 'failed' ? 'Didn’t work' : '<b>Making…</b>'}</small></button>`).join('')}${reels.slice(0, 12).map(r => `<button data-act="reel" data-id="${r.id}"><div class="th reel ${r.posted ? 'posted' : ''}" ${r.thumbId ? `data-thumb="${r.id}"` : ''}>${r.posted ? '<i>✓ posted</i>' : '<i>▶</i>'}</div><small>${r.option ? `<b>Option ${esc(r.option)}</b> · ${esc(r.style || '')}` : r.picked ? `<b>Your pick</b> · ${esc(r.style || '')}` : fmtDay(localDay(r.at))}</small></button>`).join('')}</div>`
      : '<p class="small muted">A funny reel arrives every Wednesday and Sunday evening — or pick the shots yourself and the Mac makes one.</p>'}
    ${reels.some(r => r.group && reels.filter(x => x.group === r.group).length > 1) ? '<p class="small muted">Watch the options, then tap “Use this one” on your favourite — the others are removed.</p>' : ''}</section>`;
}

/* Make your own: pick shots in play order → a `reelreq` record syncs to Drive →
   the Mac (reels/reel_requests.py, checks every 2 min) renders it, files the
   reel(s) under Reels, marks the request done and notifies both phones. */
const REEL_STYLES = { all: 'All 3 styles', meme: 'Meme', countdown: 'Countdown', story: 'Story' };
const pickStrip = ids => `<div class="strip picks">${ids.map((id, i) => `<div><div class="th" data-thumb="${id}"></div><small>${i + 1}</small></div>`).join('')}</div>`;
EARLY_ACT.pickStart = () => { ui.pick = []; render(); scrollTo(0, 0); };
EARLY_ACT.pickCancel = () => { ui.pick = null; render(); };
EARLY_ACT.pickToggle = d => {
  const i = ui.pick.indexOf(d.id);
  if (i >= 0) ui.pick.splice(i, 1);
  else if (ui.pick.length >= 20) return toast('20 shots is plenty for one reel');
  else ui.pick.push(d.id);
  document.querySelectorAll('.gi[data-act="pickToggle"]').forEach(b => {     // repaint in place, so thumbnails don't reload
    const n = ui.pick.indexOf(b.dataset.id) + 1, s = b.querySelector('.pickn');
    b.classList.toggle('picked', n > 0);
    if (!n) s?.remove();
    else if (s) s.textContent = n;
    else b.insertAdjacentHTML('beforeend', `<span class="pickn">${n}</span>`);
  });
  const bar = $('#pickbar');
  if (bar) { bar.querySelector('b').textContent = ui.pick.length; bar.querySelector('[data-act="pickSend"]').disabled = ui.pick.length < 3; }
};
EARLY_ACT.pickSend = () => {
  const ids = ui.pick.slice();
  form({
    title: `🎬 A reel from ${ids.length} shots`,
    intro: `${pickStrip(ids)}<p class="small muted">They play in the order you tapped them.${ids.some(id => Store.get(id)?.video) ? '' : ' Tip: a video or two makes it funnier.'}</p>`,
    fields: [
      { k: 'style', label: 'Style', type: 'chips', def: 'all', options: [['all', 'All 3 — I’ll choose'], ['meme', '😂 Meme'], ['countdown', '🔢 Countdown'], ['story', '📖 Story']] },
      { k: 'title', label: 'Opening text', hint: 'optional — leave blank for a meme hook', ph: 'e.g. OSCAR VS THE VACUUM' },
    ],
    saveLabel: 'Send to the Mac',
    onSave: async v => {
      await Store.put({ kind: 'reelreq', items: ids, style: v.style || 'all', title: v.title, status: 'pending' });
      ui.pick = null; render();
      toast('Sent! It takes about 10 minutes — you’ll get a notification');
      Drive.sync();
    },
  });
  Media.hydrate($('#sheet-body'));
};
EARLY_ACT.reelReq = d => {
  const r = Store.get(d.id); if (!r) return;
  const failed = r.status === 'failed';
  sheet(`<h2>🎬 ${failed ? 'That reel didn’t work' : 'Making your reel…'}</h2>
    <p class="muted">${r.items.length} shots · ${esc(REEL_STYLES[r.style] || r.style)}${r.title ? ` · “${esc(r.title)}”` : ''} · sent ${fmtWhen(r.at)} by ${esc(r.author || r.by || '')}</p>
    <p class="small ${failed ? '' : 'muted'}">${failed ? esc(r.error || 'Something went wrong on the Mac.') : 'The Mac checks every couple of minutes while it’s awake, then takes about 10 minutes. You’ll get a notification when it’s ready.'}</p>
    ${pickStrip(r.items)}
    <div class="btns"><button class="ghost" id="rq-cancel">${failed ? 'Remove' : 'Cancel it'}</button><span class="grow"></span>${failed ? '<button class="primary" id="rq-retry">Try again</button>' : ''}</div>`, root => {
    Media.hydrate(root);
    $('#rq-cancel', root).onclick = async () => { await Store.remove(r.id); closeSheet(); Drive.sync(); };
    $('#rq-retry', root) && ($('#rq-retry', root).onclick = async () => { await Store.put({ id: r.id, status: 'pending', error: '' }); closeSheet(); toast('Sent again'); Drive.sync(); });
  });
};
EARLY_ACT.photoOrder = () => { Store.setPref('oscar.photoOrder', Store.pref('oscar.photoOrder') === 'oldest' ? 'newest' : 'oldest'); render(); };
EARLY_ACT.reel = async d => {
  const r = Store.get(d.id); if (!r) return;
  const caption = [r.caption, r.tags].filter(Boolean).join('\n\n');
  sheet(`<h2>🎬 ${esc(r.title || 'Reel')}</h2>
    <p class="muted">${fmtDay(localDay(r.at))} · ${r.duration ? Math.round(r.duration) + ' s' : ''} · ${r.clips || '?'} clips</p>
    <div class="reel-stage" id="reel-stage"><div class="spin">Loading…</div></div>
    <h4>Caption</h4><p class="pre">${esc(caption)}</p>
    <p class="small muted">Tip: add a trending sound in Instagram before posting — it’s one of the biggest boosts for reach.</p>
    ${r.group && Store.list('reel', x => x.group === r.group).length > 1 ? `<button class="primary block-btn" id="reel-pick">✓ Use this one (remove the other ${Store.list('reel', x => x.group === r.group).length - 1})</button>` : ''}
    <div class="btns">${r.posted ? '<span class="muted small">✓ marked as posted</span>' : '<button class="ghost" id="reel-done">Mark posted</button>'}<span class="grow"></span>
      ${r.driveId ? `<a class="ghost" href="${Drive.webLink(r.driveId)}" target="_blank" rel="noopener">Drive</a>` : ''}
      <button class="primary" id="reel-share" disabled>Post to Instagram</button></div>`, async root => {
    let blob = null;
    $('#reel-done', root) && ($('#reel-done', root).onclick = async () => { await Store.put({ id: r.id, posted: true }); closeSheet(); });
    $('#reel-pick', root) && ($('#reel-pick', root).onclick = async () => {
      if (!confirm('Keep this option and move the others to Drive’s trash?')) return;
      for (const x of Store.list('reel', x => x.group === r.group && x.id !== r.id)) {
        for (const id of [x.driveId, x.thumbId]) if (id) Drive.trash(id);
        await Store.remove(x.id);
      }
      await Store.put({ id: r.id, chosen: true });
      toast(`Option ${r.option} it is — ready to post`);
      ACT.reel({ id: r.id });
    });
    try {
      blob = await Drive.download(r.driveId, f => { const sp = $('#reel-stage .spin', root); if (sp) sp.textContent = `Loading… ${Math.round(f * 100)}%`; }, 'video/mp4');
      $('#reel-stage', root).innerHTML = `<video src="${URL.createObjectURL(blob)}" controls playsinline loop muted autoplay></video>`;
      $('#reel-share', root).disabled = false;
    } catch (e) { $('#reel-stage', root).innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
    $('#reel-share', root).onclick = async () => {
      try { await navigator.clipboard.writeText(caption); } catch {}
      const file = new File([blob], `oscar-${localDay(r.at)}.mp4`, { type: 'video/mp4' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); toast('Caption copied — paste it in Instagram', [{ label: 'Mark posted', run: () => Store.put({ id: r.id, posted: true }) }]); }
        catch {}
      } else toast('This phone can’t share videos from here — open it in Drive and share from there');
    };
  });
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
    <section class="card"><div class="h-row"><h3>🛒 Shopping</h3><button class="pill" data-act="shop">Open</button></div>
      ${shopItems().filter(x => !x.done).length ? `<p>${esc(shopItems().filter(x => !x.done).map(x => x.text).join(', '))}</p>` : '<p class="muted">Nothing on the list. Adding something can ping the other phone.</p>'}</section>
    ${spendCard()}
    <section class="card"><div class="h-row"><h3>💡 Ideas & requests</h3><button class="pill" data-act="wish">+ Add</button></div>
      <p class="small muted">Features you’d like, things that bug you, notes for later. Shared between both phones.</p>
      ${wishes().map(w => `<div class="item wish ${w.done ? 'done' : ''}"><button class="tick" data-act="wishDone" data-id="${w.id}" aria-label="Mark done">${w.done ? '✅' : '⬜'}</button>
        <button class="item-main" data-act="wish" data-id="${w.id}"><span><b>${esc(w.text)}</b><small>${esc(w.by || '')} · ${fmtDay(localDay(w.at))}${w.done ? ' · done' : ''}</small></span></button></div>`).join('') || '<p class="muted">Nothing yet.</p>'}
      ${wishes().length ? '<button class="link" data-act="wishCopy">Copy list</button>' : ''}
    </section>
    <section class="card"><h3>Share & export</h3>
      <button class="item-main block" data-act="brand"><span class="ico">📣</span><span><b>Oscar brand kit</b><small>${esc(BRAND.handle)} — content pillars, posting rhythm, bio</small></span></button>
      <button class="item-main block" data-act="book"><span class="ico">📖</span><span><b>${esc(App.pet())}’s photo book</b><small>Portraits, milestones and favourites as a printable book (PDF)</small></span></button>
      <button class="item-main block" data-act="prep"><span class="ico">🏠</span><span><b>Getting-ready checklist</b><small>${prepItems().done}/${prepItems().total} done</small></span></button>
      <button class="item-main block" data-act="careSheet"><span class="ico">📋</span><span><b>Care sheet</b><small>One page for a sitter, groomer or new vet — print or share</small></span></button>
      <button class="item-main block" data-act="syncSettings"><span class="ico">☁️</span><span><b>Sync & sharing</b><small>${esc(syncLine())}</small></span></button>
      <button class="item-main block" data-act="backup"><span class="ico">💾</span><span><b>Backup</b><small>Save or restore everything as a file</small></span></button>
      <button class="item-main block" data-act="quickSettings"><span class="ico">🔘</span><span><b>Log buttons</b><small>${quickTypes().length} of ${LOG_TYPES.length} shown${hiddenTypes().size ? ' · hidden: ' + [...hiddenTypes()].map(k => LOG[k]?.label).join(', ') : ''}</small></span></button>
      <button class="item-main block" data-act="camSettings"><span class="ico">📹</span><span><b>Pet camera button</b><small>${appCfg('cam').on ? 'Opens ' + esc(camName()) + ' from Today' : 'Hidden'}</small></span></button>
      <button class="item-main block" data-act="vetAppSettings"><span class="ico">🩺</span><span><b>Vet app button</b><small>${appCfg('vet').on ? 'Opens ' + esc(appCfg('vet').name) + ' from Health' : 'Hidden'}</small></span></button>
      <button class="item-main block" data-act="notify"><span class="ico">🔔</span><span><b>Notifications</b><small>${Push.enabled() ? 'On — you’ll hear when new photos arrive' : 'Off — tap to get told about new photos'}</small></span></button>
      <button class="item-main block" data-act="me"><span class="ico">🙋</span><span><b>You: ${esc(Store.who())}</b><small>Name shown on what you log · alerts</small></span></button>
    </section>
    </div></div>`;
};
const wishes = () => Store.list('wish').sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.at < b.at ? 1 : -1));
const kv = (k, v) => v ? `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>` : '';
function syncLine() {
  const s = Drive.state;
  if (!Drive.configured()) return 'Not set up yet';
  return ({ idle: 'Connected' + (s.last ? ' · synced ' + fmtTime(new Date(s.last).toISOString()) : ''), error: 'Problem: ' + s.msg, offline: 'Offline — will sync later', syncing: 'Syncing…' })[s.status] || 'Connected';
}

/* ---------- actions ---------- */
const ACT = {};
Object.assign(ACT, EARLY_ACT);

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
    if (v.followUp && !Store.list('appt', a => a.fromVet === r.id).length) {
      await Store.put({ kind: 'appt', type: 'Vet', day: v.followUp, clinic: v.clinic, vet: v.vet, reason: `Follow-up: ${v.reason}`, fromVet: r.id });
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
 ${vetAppBtn()}
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
  { k: 'times', label: 'Meal times', ph: 'e.g. 7am, 12pm, 5pm', hint: 'a reminder goes to both phones if a meal isn’t logged by then' },
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
    intro: (hist.length ? `<div class="hist">${hist.map(h => `<span>${fmtDay(localDay(h.at))} ${'★'.repeat(h.rating || 0)}${'☆'.repeat(5 - (h.rating || 0))}</span>`).join('')}</div>` : '<p class="muted">Short sessions, lots of treats. Rate how it went.</p>') +
      `<button class="ghost block-btn" data-act="session" data-skill="${esc(d.skill)}">▶ Run a timed session with the clicker</button>`,
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
  const made = [], dups = [];
  for (const f of files) {
    const r = await Media.add(f, { fresh, doc: ctx.doc, caption: ctx.doc ? 'Vet record' : '' });
    (r.duplicate ? dups : made).push(r.duplicate || r);
  }
  if (dups.length && !made.length) {
    const d = dups[0];
    return toast(dups.length === 1 ? `Already in Photos — skipped (taken ${fmtDay(localDay(d.at))})` : `All ${dups.length} are already in Photos — skipped`,
      dups.length === 1 ? [{ label: 'Show it', run: () => viewer(d.id) }] : []);
  }
  if (ctx.vet) {
    const v = Store.get(ctx.vet);
    await Store.put({ id: v.id, docs: [...(v.docs || []), ...made.map(m => m.id)] });
    return ACT.showVet({ id: v.id });
  }
  toast(`Saved ${made.length > 1 ? made.length + ' items' : ''}${dups.length ? ` · ${dups.length} duplicate${dups.length > 1 ? 's' : ''} skipped` : ''} — ${Drive.configured() ? 'uploading to Drive' : 'will upload when synced'}`,
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
    let m = v.file ? await Media.add(v.file, { caption: v.title, star: true, at: v.at }) : null;
    if (m && m.duplicate) m = m.duplicate;          // already in Photos: link the existing one
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
        ${!rec.doc ? `<button data-v="noreel">${rec.noReel ? '🎬 Back in reels' : '🚫 Leave out of reels'}</button>` : ''}
        <button data-v="del" class="danger">Delete</button>
      </div>
    </div>
    ${i > 0 ? '<button class="v-nav prev" data-v="prev">‹</button>' : ''}${i >= 0 && i < list.length - 1 ? '<button class="v-nav next" data-v="next">›</button>' : ''}`;
  const stage = el.querySelector('.v-stage');
  if (rec.video && rec.driveId && !(await Media.hasLocal(rec))) {
    Media.thumbURL(rec).then(t => { if (t) stage.style.background = `center/contain no-repeat url("${t}")`; });
    stage.innerHTML = `<div class="v-play"><a class="primary" href="${Drive.webLink(rec.driveId)}" target="_blank" rel="noopener">▶ Play in Google Drive</a>
      <button class="link" data-v="here">or load it here (slower)</button></div>`;
    stage.querySelector('[data-v=here]').onclick = e => { e.stopPropagation(); loadFull(); };
  } else loadFull();
  function loadFull() {
  stage.innerHTML = '<div class="spin">Loading…</div>';
  Media.thumbURL(rec).then(t => { if (t && stage.querySelector('.spin')) stage.style.background = `center/contain no-repeat url("${t}")`; });
  const prog = f => { const sp = stage.querySelector('.spin'); if (sp) sp.textContent = `Loading${rec.video ? ' video' : ''}… ${Math.round(f * 100)}%`; };
  Media.fullURL(rec, prog).then(u => {
    if (!u) {
      stage.innerHTML = `<p class="muted">Still uploading from ${esc(rec.author || rec.by || 'the other')}’s phone — it’ll appear here by itself.</p>`;
      el.dataset.waiting = rec.id;
      Drive.soon(500);
      return;
    }
    delete el.dataset.waiting;
    stage.style.background = '';
    stage.innerHTML = rec.video ? `<video src="${u}" controls playsinline autoplay></video>` : `<img src="${u}" alt="">`;
  }).catch(e => { stage.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
  }
  const saveCap = async () => { const c = $('#v-cap').value.trim(); if (c !== (rec.caption || '')) await Store.put({ id: rec.id, caption: c }); };
  el.onclick = async e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const a = b.dataset.v;
    if (a === 'close') { await saveCap(); el.hidden = true; el.innerHTML = ''; }
    if (a === 'prev' || a === 'next') { await saveCap(); viewer(list[i + (a === 'next' ? 1 : -1)].id); }
    if (a === 'star') { await Store.put({ id: rec.id, star: !rec.star }); viewer(id); }
    if (a === 'noreel') { await Store.put({ id: rec.id, noReel: !rec.noReel }); toast(rec.noReel ? 'Can be used in reels again' : 'Won’t be used in reels'); viewer(id); }
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
  if (s === 'idle' || s === 'error' || s === 'offline') { Drive.sync(); if (s !== 'error') return; }
  ACT.syncSettings();
};
ACT.syncSettings = () => {
  const on = Drive.configured();
  sheet(`<h2>☁️ Sync & sharing</h2>
    <p class="muted">Everything is saved on this phone first and works offline. Sync copies it into your shared Google Drive folder — photos and videos land there too, sorted by month.</p>
    ${on ? `<div class="step ok"><b>Connected to “${esc(Drive.folderName())}”</b>
        <p>${Drive.folderLink() ? `<a href="${Drive.folderLink()}" target="_blank" rel="noopener">Open in Drive</a> · ` : ''}<button class="link" id="disc">Disconnect</button></p>
        <p class="small muted">${esc(syncLine())}</p></div>
        <p><button class="primary" id="snow">Sync now</button></p>`
    : `<div class="step"><b>Connection code</b>
        <p class="small muted">Paste the code from the Puppy Log bridge (see SETUP.md). Use the same code on both phones — no Google sign-in needed.</p>
        <div class="inline"><input id="ccode" placeholder="paste code"><button class="pill" id="cgo">Connect</button></div></div>`}`, r => {
    $('#cgo', r) && ($('#cgo', r).onclick = async () => {
      const b = $('#cgo', r); b.disabled = true; b.textContent = 'Checking…';
      try { const name = await Drive.connect($('#ccode', r).value); toast(`Connected to “${esc(name)}” — syncing`); Drive.sync(); ACT.syncSettings(); }
      catch (e) { toast(esc(e.message)); b.disabled = false; b.textContent = 'Connect'; }
    });
    $('#disc', r) && ($('#disc', r).onclick = () => { if (confirm('Stop syncing on this phone? Nothing is deleted.')) { Drive.disconnect(); ACT.syncSettings(); } });
    $('#snow', r) && ($('#snow', r).onclick = () => { Drive.sync(); closeSheet(); });
  });
};

/* ---------- appointments ---------- */
/* Booked ahead (vet, groomer…). Once it has happened, "Log the visit" turns a
   vet appointment into a vet-visit record with the details already filled in. */
const APPT_TYPES = ['Vet', 'Emergency vet', 'Groomer', 'Spay / neuter', 'Dental', 'Other'];
const upcomingAppts = days => Store.list('appt', a => !a.visitId && !a.cancelled && a.day && daysUntil(a.day) <= days && daysUntil(a.day) >= -3)
  .sort((a, b) => (a.day + (a.time || '')) < (b.day + (b.time || '')) ? -1 : 1);

function apptRow(a) {
  const n = daysUntil(a.day);
  const when = n < 0 ? 'How did it go?' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDay(a.day);
  return `<div class="item ${n <= 1 ? 'soon' : ''}"><button class="item-main" data-act="showAppt" data-id="${a.id}">
    <span class="ico">${a.type === 'Groomer' ? '✂️' : '📅'}</span><span><b>${esc(a.reason || a.type || 'Appointment')}</b>
    <small>${when}${a.time ? ' · ' + fmtClock(a.time) : ''}${a.clinic ? ' · ' + esc(a.clinic) : ''}${a.vet ? ' · ' + esc(a.vet) : ''}</small></span></button>
    ${n < 0 && a.type !== 'Groomer' ? `<button class="pill" data-act="apptToVisit" data-id="${a.id}">Log visit</button>` : ''}</div>`;
}

const apptFields = [
  { k: 'type', label: 'Type', type: 'chips', options: APPT_TYPES, def: 'Vet' },
  { k: 'reason', label: 'What for', type: 'suggest', options: ['Checkup', 'Vaccines', 'Follow-up', 'Spay / neuter', 'Nail trim', 'Bath & groom'], required: true },
  { type: 'row', fields: [{ k: 'day', label: 'Date', type: 'date', required: true }, { k: 'time', label: 'Time', type: 'time' }] },
  { type: 'row', fields: [{ k: 'clinic', label: 'Clinic / place' }, { k: 'vet', label: 'Vet / groomer' }] },
  { k: 'phone', label: 'Phone', type: 'tel' },
  { k: 'bring', label: 'Bring / ask about', type: 'textarea', rows: 3, ph: 'vaccine records, stool sample, ask about spay timing…' },
];

ACT.appt = d => {
  const r = d.id ? Store.get(d.id) : null;
  const clinic = Store.list('contact', c => c.role === 'Vet clinic')[0];
  form({ title: '📅 Appointment', fields: apptFields, value: r || { type: 'Vet', clinic: clinic?.name || '', phone: clinic?.phone || '' },
    onSave: async v => { const a = await Store.put(r ? { id: r.id, ...v } : { kind: 'appt', ...v }); if (!r) toast(`Booked for ${fmtDay(a.day)}${a.time ? ' at ' + fmtClock(a.time) : ''}`); },
    onDelete: r ? () => Store.remove(r.id) : null });
};

ACT.showAppt = d => {
  const a = Store.get(d.id); if (!a) return;
  const c = Store.list('contact', x => x.name && x.name === a.clinic)[0];
  const phone = a.phone || c?.phone, addr = c?.address;
  const n = daysUntil(a.day);
  sheet(`<h2>📅 ${esc(a.reason || a.type)}</h2>
    <p class="muted">${fmtDay(a.day)}${a.time ? ' at ' + fmtClock(a.time) : ''} · ${n > 1 ? `in ${n} days` : n === 1 ? 'tomorrow' : n === 0 ? 'today' : `${-n} day${n === -1 ? '' : 's'} ago`}</p>
    <dl class="kv">${kv('Type', a.type)}${kv('Where', a.clinic)}${kv('With', a.vet)}${phone ? `<dt>Phone</dt><dd><a href="tel:${esc(phone)}">${esc(phone)}</a></dd>` : ''}
      ${addr ? `<dt>Directions</dt><dd><a href="https://maps.google.com/?q=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${esc(addr)}</a></dd>` : ''}${kv('Bring / ask', a.bring)}</dl>
    ${vetAppBtn()}
    <div class="btns"><button class="danger" id="ap-cancel">Cancelled</button><span class="grow"></span>
      <button class="ghost" data-act="appt" data-id="${a.id}">Edit</button>
      ${a.type !== 'Groomer' ? `<button class="primary" data-act="apptToVisit" data-id="${a.id}">Log the visit</button>` : `<button class="primary" id="ap-done">Done</button>`}</div>`, r => {
    $('#ap-cancel', r).onclick = async () => { if (confirm('Mark this appointment as cancelled?')) { await Store.put({ id: a.id, cancelled: true }); closeSheet(); } };
    $('#ap-done', r) && ($('#ap-done', r).onclick = async () => { await Store.put({ id: a.id, visitId: 'done' }); closeSheet(); });
  });
};

/* The appointment becomes a vet visit — same date, clinic, vet and reason. */
ACT.apptToVisit = d => {
  const a = Store.get(d.id);
  form({ title: '🩺 Vet visit', fields: vetFields,
    value: { day: a.day, clinic: a.clinic, vet: a.vet, reason: a.reason, unit: P().unit || 'kg' },
    onSave: async v => {
      await saveVet()(v);
      const visit = Store.list('vet').find(x => x.reason === v.reason && localDay(x.at) === v.day);
      await Store.put({ id: a.id, visitId: visit?.id || 'done' });
    } });
};

/* ---------- training classes ---------- */
/* A course (trainer, place, day and time, how many weeks) plus one `lesson`
   record per session, so each can be ticked off with homework notes and the
   8 am reminder can mention class days. */
const CLASS_TYPES = ['Puppy kindergarten', 'Basic obedience', 'Leash manners', 'Recall', 'Reactive / confidence', 'Private lesson', 'Day training', 'Agility'];
const fmtClock = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); const d = new Date(); d.setHours(h, m); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
const nextLessons = days => Store.list('lesson', l => !l.done && l.due && daysUntil(l.due) >= 0 && daysUntil(l.due) <= days).sort((a, b) => (a.due + (a.time || '')) < (b.due + (b.time || '')) ? -1 : 1);
const mapLink = c => `https://maps.google.com/?q=${encodeURIComponent(c.address || c.place || '')}`;

function lessonRow(l) {
  const c = Store.get(l.classId) || {};
  const n = daysUntil(l.due);
  return `<div class="item ${n <= 1 ? 'soon' : ''}"><button class="item-main" data-act="showClass" data-id="${l.classId}">
    <span class="ico">🎓</span><span><b>${esc(c.name || 'Class')}${l.num ? ` · week ${l.num}` : ''}</b>
    <small>${n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : fmtDay(l.due)}${l.time || c.time ? ' · ' + fmtClock(l.time || c.time) : ''}${c.place ? ' · ' + esc(c.place) : ''}${c.trainer ? ' · ' + esc(c.trainer) : ''}</small></span></button></div>`;
}

function classesCard() {
  const cls = Store.list('class');
  const active = cls.filter(c => Store.list('lesson', l => l.classId === c.id && !l.done && daysUntil(l.due) >= 0).length);
  const past = cls.filter(c => !active.includes(c));
  const line = c => {
    const ls = Store.list('lesson', l => l.classId === c.id);
    const next = ls.filter(l => !l.done && daysUntil(l.due) >= 0).sort((a, b) => a.due < b.due ? -1 : 1)[0];
    const done = ls.filter(l => l.done).length;
    return `<button class="item-main block" data-act="showClass" data-id="${c.id}"><span class="ico">🏫</span><span><b>${esc(c.name)}</b>
      <small>${next ? `Next: ${fmtDay(next.due)}${c.time ? ' ' + fmtClock(c.time) : ''}` : 'Finished'}${c.place ? ' · ' + esc(c.place) : ''}${c.trainer ? ' · ' + esc(c.trainer) : ''}${ls.length > 1 ? ` · ${done}/${ls.length} done` : ''}</small></span></button>`;
  };
  return `<section class="card"><div class="h-row"><h3>🏫 Classes</h3><button class="pill" data-act="classForm">+ Class</button></div>
    ${active.map(line).join('') || '<p class="muted">Signed up for puppy class or a trainer? Add it — the day, time, place and trainer show up on Today and in the morning reminder.</p>'}
    ${past.length ? `<details><summary>Past classes (${past.length})</summary>${past.map(line).join('')}</details>` : ''}</section>`;
}

const classFields = [
  { k: 'name', label: 'Class', type: 'suggest', options: CLASS_TYPES, required: true },
  { type: 'row', fields: [{ k: 'trainer', label: 'Trainer' }, { k: 'phone', label: 'Trainer’s phone', type: 'tel' }] },
  { k: 'place', label: 'Where', ph: 'e.g. Happy Paws Training Centre' },
  { k: 'address', label: 'Address', ph: 'for directions' },
  { type: 'row', fields: [{ k: 'start', label: 'First class', type: 'date', required: true }, { k: 'time', label: 'Time', type: 'time' }] },
  { type: 'row', fields: [{ k: 'weeks', label: 'How many sessions', type: 'number', def: 6 }, { k: 'cost', label: 'Cost ($)', type: 'number' }] },
  { k: 'bring', label: 'What to bring', ph: 'treats, mat, flat collar, vaccine record…' },
  { k: 'notes', label: 'Notes', type: 'textarea', rows: 2 },
];

/* (Re)build the sessions: keeps attended ones and their notes, replaces the rest. */
async function scheduleLessons(c) {
  const old = Store.list('lesson', l => l.classId === c.id);
  const keep = new Map(old.filter(l => l.done || l.note).map(l => [l.num, l]));
  for (const l of old) if (!keep.has(l.num)) await Store.remove(l.id);
  const n = Math.max(1, Math.min(52, Number(c.weeks) || 1));
  for (let i = 1; i <= n; i++) {
    const due = addUnit(c.start, 7 * (i - 1), 'days');
    const k = keep.get(i);
    if (k) { if (k.due !== due) await Store.put({ id: k.id, due }); }
    else await Store.put({ kind: 'lesson', classId: c.id, num: n > 1 ? i : 0, due, time: c.time || '' });
  }
  for (const [num, l] of keep) if (num > n) await Store.remove(l.id);
}

ACT.classForm = d => {
  const r = d.id ? Store.get(d.id) : null;
  form({ title: '🏫 Training class', fields: classFields, value: r || { weeks: 6 },
    onSave: async v => {
      const c = await Store.put(r ? { id: r.id, ...v } : { kind: 'class', ...v });
      await scheduleLessons(c);
      // Keep the trainer in Contacts too.
      if (v.trainer && v.phone && !Store.list('contact', x => x.phone === v.phone).length) await Store.put({ kind: 'contact', role: 'Trainer', name: v.trainer, phone: v.phone, address: v.address, notes: v.place });
      setTimeout(() => ACT.showClass({ id: c.id }), 50);
    },
    onDelete: r ? async () => { for (const l of Store.list('lesson', l => l.classId === r.id)) await Store.remove(l.id); await Store.remove(r.id); } : null });
};

ACT.showClass = d => {
  const c = Store.get(d.id); if (!c) return;
  const ls = Store.list('lesson', l => l.classId === c.id).sort((a, b) => a.due < b.due ? -1 : 1);
  sheet(`<h2>🏫 ${esc(c.name)}</h2>
    <dl class="kv">${kv('Trainer', c.trainer)}${c.phone ? `<dt>Phone</dt><dd><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></dd>` : ''}
      ${kv('Where', c.place)}${c.address || c.place ? `<dt>Directions</dt><dd><a href="${mapLink(c)}" target="_blank" rel="noopener">${esc(c.address || 'Open in Maps')}</a></dd>` : ''}
      ${kv('When', `${parseDay(c.start).toLocaleDateString([], { weekday: 'long' })}s${c.time ? ' at ' + fmtClock(c.time) : ''}`)}${kv('Cost', c.cost ? money(c.cost) : '')}${kv('Bring', c.bring)}${kv('Notes', c.notes)}</dl>
    <h4>Sessions</h4>
    ${ls.map(l => `<div class="item lesson ${l.done ? 'done' : ''}"><button class="tick" data-l="${l.id}">${l.done ? '✅' : '⬜'}</button>
      <span class="item-main"><span><b>${l.num ? 'Week ' + l.num + ' · ' : ''}${fmtDay(l.due)}</b><small>${l.note ? esc(l.note) : daysUntil(l.due) < 0 && !l.done ? 'missed?' : ''}</small></span></span>
      <button class="pill" data-n="${l.id}">📝</button></div>`).join('')}
    <div class="btns"><span class="grow"></span><button class="primary" data-act="classForm" data-id="${c.id}">Edit</button></div>`, r => {
    r.querySelectorAll('[data-l]').forEach(b => b.onclick = async () => { const l = Store.get(b.dataset.l); await Store.put({ id: l.id, done: !l.done }); ACT.showClass(d); });
    r.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
      const l = Store.get(b.dataset.n);
      form({ title: `📝 ${c.name}${l.num ? ' · week ' + l.num : ''}`, value: l, fields: [{ k: 'note', label: 'What we learned / homework', type: 'textarea', rows: 5 }],
        onSave: async v => { await Store.put({ id: l.id, note: v.note }); setTimeout(() => ACT.showClass(d), 50); } });
    });
  });
};

/* ---------- getting ready ---------- */
ACT.prep = () => {
  const { groups, done, total } = prepItems();
  sheet(`<h2>🏠 Getting ready</h2><p class="muted">${done} of ${total} done — shared with both phones.</p>
    ${groups.map(([g, xs]) => `<h4>${esc(g)}</h4>${xs.map(x => `<button class="check ${x.rec?.done ? 'on' : ''}" data-item="${esc(x.item)}">
      <span>${x.rec?.done ? '✅' : '⬜'}</span><span>${esc(x.item)}${x.rec?.done && x.rec.by ? `<small>${esc(x.rec.by)}</small>` : ''}</span></button>`).join('')}`).join('')}
    <div class="inline" style="margin-top:12px"><input id="prep-new" placeholder="Add your own…"><button class="pill" id="prep-add">Add</button></div>`, r => {
    r.querySelectorAll('.check').forEach(b => b.onclick = async () => {
      const item = b.dataset.item, rec = Store.list('prep', x => x.item === item)[0];
      await Store.put(rec ? { id: rec.id, done: !rec.done } : { kind: 'prep', item, done: true });
      ACT.prep(); $('#sheet-body').scrollTop = 0;
    });
    $('#prep-add', r).onclick = async () => { const v = $('#prep-new', r).value.trim(); if (v) { await Store.put({ kind: 'prep', item: v, custom: true, done: false }); ACT.prep(); } };
  });
};

/* ---------- shopping ---------- */
ACT.shop = () => {
  const items = shopItems();
  sheet(`<h2>🛒 Shopping list</h2>
    <div class="inline"><input id="shop-new" placeholder="What do we need?"><button class="pill" id="shop-add">Add</button></div>
    <label class="tog"><input type="checkbox" id="shop-ping" ${Store.pref('oscar.shopPing') !== '0' ? 'checked' : ''}> Let the other phone know</label>
    <div class="chips small">${SHOP_SUGGEST.map(x => `<button class="chip" data-s="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div style="margin-top:10px">${items.map(x => `<div class="item wish ${x.done ? 'done' : ''}"><button class="tick" data-t="${x.id}">${x.done ? '✅' : '⬜'}</button>
      <span class="item-main"><span><b>${esc(x.text)}</b><small>${esc(x.by || '')} · ${ago(x.at)}</small></span></span><button class="pill" data-del="${x.id}">✕</button></div>`).join('') || '<p class="muted">Nothing needed right now.</p>'}</div>
    ${items.some(x => x.done) ? '<button class="link" id="shop-clear">Clear bought items</button>' : ''}`, r => {
    const add = async text => {
      if (!text) return;
      await Store.put({ kind: 'shop', text });
      Store.setPref('oscar.shopPing', $('#shop-ping', r).checked ? '1' : '0');
      if ($('#shop-ping', r).checked) Drive.sync().then(() => Push.send(`🛒 ${App.pet()} needs ${text.toLowerCase()}`, `${Store.who()} added it to the shopping list`, { tag: 'shop', url: './#today' })).catch(() => {});
      ACT.shop();
    };
    $('#shop-add', r).onclick = () => add($('#shop-new', r).value.trim());
    $('#shop-new', r).onkeydown = e => { if (e.key === 'Enter') add(e.target.value.trim()); };
    r.querySelectorAll('[data-s]').forEach(b => b.onclick = () => add(b.dataset.s));
    r.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { const x = Store.get(b.dataset.t); await Store.put({ id: x.id, done: !x.done }); ACT.shop(); });
    r.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await Store.remove(b.dataset.del); ACT.shop(); });
    $('#shop-clear', r) && ($('#shop-clear', r).onclick = async () => { for (const x of items.filter(x => x.done)) await Store.remove(x.id); ACT.shop(); });
  });
};

/* ---------- spending ---------- */
/* Everything with a price: logged expenses plus vet visit costs, minus
   insurance reimbursements. */
function spendRows() {
  const rows = Store.list('expense').map(e => ({ at: e.at, amount: Number(e.amount) || 0, cat: e.cat || 'Other', note: e.note, id: e.id }));
  Store.list('vet', v => v.cost).forEach(v => rows.push({ at: v.at, amount: Number(v.cost), cat: 'Vet', note: v.reason, vet: v.id }));
  Store.list('class', c => c.cost).forEach(c => rows.push({ at: new Date(parseDay(c.start || localDay(c.at)).getTime() + 12 * 36e5).toISOString(), amount: Number(c.cost), cat: 'Training', note: c.name, cls: c.id }));
  Store.list('claim', c => c.reimbursed).forEach(c => rows.push({ at: c.at, amount: -Number(c.reimbursed), cat: 'Insurance back', note: c.desc, claim: c.id }));
  return rows.sort((a, b) => a.at < b.at ? 1 : -1);
}
function spendCard() {
  const rows = spendRows(), ym = todayKey().slice(0, 7);
  const month = rows.filter(r => localDay(r.at).startsWith(ym)).reduce((a, r) => a + r.amount, 0);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return `<section class="card"><div class="h-row"><h3>💰 Spending</h3><button class="pill" data-act="expense">+ Expense</button></div>
    ${rows.length ? `<div class="big-num">${money(month)}<small>this month · ${money(total)} since the start</small></div>
      <button class="link" data-act="spend">See by month & category</button>` : '<p class="muted">Food, vet bills, gear, insurance — vet visit costs and insurance payouts count automatically.</p>'}</section>`;
}
ACT.expense = d => {
  const r = d.id ? Store.get(d.id) : null;
  form({ title: '💰 Expense', value: r ? { ...r, day: localDay(r.at) } : { day: todayKey(), cat: 'Food' }, fields: [
    { type: 'row', fields: [{ k: 'amount', label: 'Amount ($)', type: 'number', required: true }, { k: 'day', label: 'Date', type: 'date' }] },
    { k: 'cat', label: 'Category', type: 'select', options: EXPENSE_CATS }, { k: 'note', label: 'What for', ph: 'e.g. 12 kg bag of food' }],
    onSave: v => { const { day, ...x } = v; const at = new Date(parseDay(day || todayKey()).getTime() + 12 * 36e5).toISOString(); return Store.put(r ? { id: r.id, ...x, at } : { kind: 'expense', ...x, at }); },
    onDelete: r ? () => Store.remove(r.id) : null });
};
ACT.spend = () => {
  const rows = spendRows(), months = {};
  for (const r of rows) { const m = localDay(r.at).slice(0, 7); (months[m] = months[m] || { total: 0, cats: {}, rows: [] }); months[m].total += r.amount; months[m].cats[r.cat] = (months[m].cats[r.cat] || 0) + r.amount; months[m].rows.push(r); }
  sheet(`<h2>💰 Spending</h2>${Object.entries(months).map(([m, x]) => `<details ${m === todayKey().slice(0, 7) ? 'open' : ''}><summary><b>${parseDay(m + '-01').toLocaleDateString([], { month: 'long', year: 'numeric' })}</b> · ${money(x.total)}</summary>
    <div class="chips small">${Object.entries(x.cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<span class="chip">${esc(c)} ${money(v)}</span>`).join('')}</div>
    ${x.rows.map(r => `<button class="item-main block" ${r.id ? `data-act="expense" data-id="${r.id}"` : r.cls ? `data-act="showClass" data-id="${r.cls}"` : r.vet ? `data-act="showVet" data-id="${r.vet}"` : `data-act="claim" data-id="${r.claim}"`}><span><b>${money(r.amount)} · ${esc(r.cat)}</b><small>${fmtDay(localDay(r.at))}${r.note ? ' · ' + esc(r.note) : ''}</small></span></button>`).join('')}</details>`).join('') || '<p class="muted">Nothing yet.</p>'}`);
};

/* ---------- past-due health items ---------- */
/* The typical schedule assumes a young puppy; an older one arrives with most
   of it done. Tick what his records show and set them done in one go. */
ACT.reviewPast = () => {
  const past = dueItems().filter(r => daysUntil(r.due) < 0);
  sheet(`<h2>📋 Already done?</h2>
    <p class="muted">These are before today. Tick the ones his rescue/breeder records show as done.</p>
    <div class="fld"><label>Done on <small>leave blank if you don’t know the exact date</small></label><input type="date" id="rp-date"></div>
    ${past.map(r => `<label class="check"><input type="checkbox" value="${r.id}" checked><span>${HEALTH_CATS[r.cat]?.icon || ''} ${esc(r.name)}<small>was due ${fmtDay(r.due)}</small></span></label>`).join('')}
    <div class="btns"><button class="danger" id="rp-del">Remove ticked</button><span class="grow"></span><button class="primary" id="rp-done">Mark ticked done</button></div>`, r => {
    const picked = () => [...r.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
    $('#rp-done', r).onclick = async () => {
      const d = $('#rp-date', r).value;
      for (const id of picked()) {
        const x = Store.get(id);
        await Store.put({ id, done: d || x.due, notes: [x.notes, d ? '' : 'From records — exact date not known'].filter(Boolean).join(' · ') });
        if (x.every) await Store.put({ kind: 'health', cat: x.cat, name: x.name, every: x.every, unit: x.unit, due: addUnit(d || todayKey(), Number(x.every), x.unit) });
      }
      closeSheet(); toast('Updated');
    };
    $('#rp-del', r).onclick = async () => { if (confirm('Remove the ticked reminders?')) { for (const id of picked()) await Store.remove(id); closeSheet(); } };
  });
};

/* ---------- photo book ---------- */
/* Square pages (8.5 in) laid out in the browser, then printed or saved as a
   PDF. Portraits in a 2×2 growth grid, a page per milestone, favourites
   full-bleed. Images come from the screen-size copies, so it stays quick. */
ACT.book = () => form({ title: '📖 Photo book', saveLabel: 'Make the book',
  intro: '<p class="muted">Builds the pages here; then Print → Save as PDF. Great for a photo lab, or keep it as a keepsake file.</p>',
  value: { title: `${App.pet()}’s first year`, what: 'best', from: P().homeDay || '', to: todayKey() },
  fields: [{ k: 'title', label: 'Title', required: true },
    { k: 'what', label: 'Include', type: 'select', options: [['best', 'Portraits, milestones & starred photos'], ['all', 'Everything — every photo']] },
    { type: 'row', fields: [{ k: 'from', label: 'From', type: 'date' }, { k: 'to', label: 'To', type: 'date' }] }],
  onSave: v => { setTimeout(() => buildBook(v), 50); } });

async function buildBook(v) {
  const inRange = r => (!v.from || localDay(r.at) >= v.from) && (!v.to || localDay(r.at) <= v.to);
  const photos = Store.list('media', r => !r.doc && !r.video && inRange(r)).reverse();
  const portraits = photos.filter(r => r.portrait);
  const milestones = Store.list('milestone', inRange).reverse();
  const msMedia = new Set(milestones.map(m => m.mediaId));
  const rest = photos.filter(r => !r.portrait && !msMedia.has(r.id) && (v.what === 'all' || r.star));
  const cover = portraits[portraits.length - 1] || photos.find(r => r.star) || photos[0];
  const el = $('#book');
  el.hidden = false;
  el.innerHTML = `<div class="book-bar"><button id="bk-close">✕</button><span id="bk-status">Gathering photos…</span><button class="primary" id="bk-print" disabled>Print / Save PDF</button></div><div class="pages"></div>`;
  $('#bk-close').onclick = () => { el.hidden = true; el.innerHTML = ''; };
  const need = [cover, ...portraits, ...milestones.map(m => Store.get(m.mediaId)).filter(x => x && !x.video), ...rest].filter(Boolean);
  const url = {};
  let n = 0;
  for (const r of need) {
    if (url[r.id]) continue;
    $('#bk-status').textContent = `Gathering photos… ${++n}/${need.length}`;
    try { url[r.id] = await Media.fullURL(r); } catch { url[r.id] = await Media.thumbURL(r); }
  }
  const img = r => r && url[r.id] ? `<img src="${url[r.id]}" alt="">` : '<div class="noimg">🐾</div>';
  const pages = [];
  pages.push(`<section class="page cover">${img(cover)}<div class="cover-t"><h1>${esc(v.title)}</h1><p>${esc([P().breed, P().birthday && 'born ' + fmtDate(P().birthday)].filter(Boolean).join(' · '))}</p></div></section>`);
  for (let i = 0; i < portraits.length; i += 4) {
    pages.push(`<section class="page grid4">${i === 0 ? '<h2>Growing up</h2>' : ''}<div class="g4">${portraits.slice(i, i + 4).map(r => `<figure>${img(r)}<figcaption>${App.weekOf(r.at) != null ? App.weekOf(r.at) + ' weeks' : fmtDate(localDay(r.at))}</figcaption></figure>`).join('')}</div></section>`);
  }
  for (const m of milestones) {
    const r = Store.get(m.mediaId);
    pages.push(`<section class="page ms">${r && !r.video ? img(r) : '<div class="noimg big">⭐</div>'}<div class="ms-t"><h2>${esc(m.title)}</h2><p class="d">${fmtDate(localDay(m.at))}${App.weekOf(m.at) != null ? ' · ' + App.weekOf(m.at) + ' weeks old' : ''}</p>${m.note ? `<p>${esc(m.note)}</p>` : ''}</div></section>`);
  }
  for (const r of rest) pages.push(`<section class="page solo">${img(r)}<p>${esc(r.caption || '')}<span>${fmtDate(localDay(r.at))}</span></p></section>`);
  el.querySelector('.pages').innerHTML = pages.join('');
  $('#bk-status').textContent = `${pages.length} pages`;
  $('#bk-print').disabled = false;
  $('#bk-print').onclick = () => {
    // Square pages only while printing the book — the care sheet stays on normal paper.
    const st = document.createElement('style'); st.textContent = '@page { size: 8.5in 8.5in; margin: 0; }';
    document.head.appendChild(st); document.body.classList.add('print-book');
    window.print();
    setTimeout(() => { document.body.classList.remove('print-book'); st.remove(); }, 800);
  };
}

/* ---------- ideas & requests ---------- */
ACT.wish = d => {
  const r = d.id ? Store.get(d.id) : null;
  form({ title: '💡 Idea or request', value: r || {}, fields: [
    { k: 'text', label: 'What would help?', type: 'textarea', rows: 4, required: true, ph: 'e.g. remind us when flea meds are due, a place for grooming notes…' }],
    onSave: v => Store.put(r ? { id: r.id, ...v } : { kind: 'wish', ...v }), onDelete: r ? () => Store.remove(r.id) : null });
};
ACT.wishDone = d => { const r = Store.get(d.id); return Store.put({ id: r.id, done: !r.done }); };
ACT.wishCopy = async () => {
  const text = wishes().filter(w => !w.done).map(w => `- ${w.text} (${w.by || ''})`).join('\n');
  try { await navigator.clipboard.writeText(`Puppy Log ideas:\n${text}`); toast('Copied — paste it anywhere'); } catch { toast('Copy failed'); }
};

/* ---------- shortcuts into other apps (Furbo, Digitail…) ---------- */
/* A web app can't show another app inside it, so this is the next best thing:
   one tap into that app. Android: a plain <scheme>:// link the app registers
   (Chrome's intent:// form with a Play Store fallback went straight to the
   store even with the app installed — tested on the Fold). iPhone can't open
   apps by ID, so it tries the same link, then falls back to a one-step Apple
   Shortcut ("Open App → …") the user makes once. Find an Android app's
   links with: adb shell dumpsys package <id> (Activity Resolver Table). */
const isIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const APP_LINKS = {
  cam: { pref: 'cam', icon: '📹', title: 'Pet camera button', name: 'Furbo', pkg: 'com.tomofun.furbo', scheme: 'furbo', where: 'Today' },
  vet: { pref: 'vetapp', icon: '🩺', title: 'Vet app button', name: 'Digitail', pkg: 'com.digitail.digitail', scheme: 'digitail', where: 'Health' },
};
const appCfg = k => {
  const d = APP_LINKS[k], p = n => Store.pref(`oscar.${d.pref}${n}`);
  return { ...d, key: k, on: p('') !== 'off', name: p('Name') || d.name, pkg: p('Pkg') || d.pkg, scheme: p('Scheme') || d.scheme,
    shortcut: p('Shortcut') || `Open ${p('Name') || d.name}`, shortcutReady: !!p('ShortcutReady') };
};
const camName = () => appCfg('cam').name;

function openApp(k) {
  const c = appCfg(k);
  if (isIPhone()) {
    if (c.shortcutReady) { location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(c.shortcut)}`; return; }
    location.href = c.scheme + '://';
    setTimeout(() => { if (document.visibilityState === 'visible') appSettings(k); }, 1800);
  } else {
    location.href = c.scheme + '://open';
    setTimeout(() => {
      if (document.visibilityState === 'visible') toast(`${esc(c.name)} didn’t open — is it installed?`, [{ label: 'Get it', run: () => { location.href = `https://play.google.com/store/apps/details?id=${c.pkg}`; } }]);
    }, 2500);
  }
}
ACT.openCam = () => openApp('cam');
ACT.openVetApp = () => openApp('vet');
const vetAppBtn = () => appCfg('vet').on ? `<button class="cam-btn" data-act="openVetApp">🩺 Open ${esc(appCfg('vet').name)} <span class="muted small">vet records & bookings</span></button>` : '';

function appSettings(k) {
  const c = appCfg(k), ios = isIPhone(), key = n => `oscar.${c.pref}${n}`;
  sheet(`<h2>${c.icon} ${esc(c.title)}</h2>
    <p class="muted">A one-tap button on ${c.where} that jumps straight into ${esc(c.name)}. Its own notifications keep coming as normal.</p>
    <div class="fld"><label>App name</label><input id="ap-name" value="${esc(c.name)}"></div>
    ${ios ? `<div class="step ${c.shortcutReady ? 'ok' : ''}"><b>One-time iPhone setup</b>
        <p class="small">iPhone doesn’t let web apps open other apps directly, so the button runs a tiny Shortcut:</p>
        <ol class="small"><li>Open the <b>Shortcuts</b> app → <b>+</b></li><li>Add action → search <b>Open App</b> → choose <b>${esc(c.name)}</b></li>
        <li>Tap the name at the top → rename it exactly: <b>${esc(c.shortcut)}</b> → Done</li></ol>
        <div class="fld"><label>Shortcut name</label><input id="ap-sc" value="${esc(c.shortcut)}"></div>
        <p><button class="ghost" id="ap-test">Test it</button></p></div>`
      : `<div class="fld"><label>Android app ID <small>${esc(APP_LINKS[k].name)} is ${APP_LINKS[k].pkg}</small></label><input id="ap-pkg" value="${esc(c.pkg)}"></div>
         <div class="fld"><label>App link <small>${esc(APP_LINKS[k].name)}’s is ${APP_LINKS[k].scheme}</small></label><input id="ap-scheme" value="${esc(c.scheme)}"></div>
         <p><button class="ghost" id="ap-test">Test it</button></p>`}
    <label class="tog"><input type="checkbox" id="ap-show" ${c.on ? 'checked' : ''}> Show the button on ${c.where}</label>
    <div class="btns"><span class="grow"></span><button class="primary" id="ap-save">Save</button></div>`, r => {
    const save = () => {
      Store.setPref(key('Name'), $('#ap-name', r).value.trim() || APP_LINKS[k].name);
      if ($('#ap-pkg', r)) Store.setPref(key('Pkg'), $('#ap-pkg', r).value.trim() || APP_LINKS[k].pkg);
      if ($('#ap-scheme', r)) Store.setPref(key('Scheme'), $('#ap-scheme', r).value.trim().replace(/:.*$/, '') || APP_LINKS[k].scheme);
      if ($('#ap-sc', r)) { Store.setPref(key('Shortcut'), $('#ap-sc', r).value.trim()); Store.setPref(key('ShortcutReady'), '1'); }
      Store.setPref(key(''), $('#ap-show', r).checked ? 'on' : 'off');
    };
    $('#ap-test', r).onclick = () => { save(); openApp(k); };
    $('#ap-save', r).onclick = () => { save(); closeSheet(); render(); };
  });
}
ACT.camSettings = () => appSettings('cam');
ACT.vetAppSettings = () => appSettings('vet');

/* ---------- log buttons ---------- */
ACT.quickSettings = () => {
  const hid = hiddenTypes();
  sheet(`<h2>🔘 Log buttons</h2><p class="muted">Pick what you actually log. Hidden ones also stop changing the potty countdown. Shared with both phones.</p>
    ${LOG_TYPES.map(t => `<label class="check"><input type="checkbox" value="${t.k}" ${hid.has(t.k) ? '' : 'checked'}><span>${t.icon} ${esc(t.label)}${t.trigger ? `<small>moves the next potty break to ${t.trigger} min after</small>` : ''}</span></label>`).join('')}
    <div class="btns"><span class="grow"></span><button class="primary" id="qs-save">Save</button></div>`, r => {
    $('#qs-save', r).onclick = async () => {
      const hide = [...r.querySelectorAll('input[type=checkbox]')].filter(x => !x.checked).map(x => x.value);
      await Store.put({ id: 'profile', kind: 'profile', quickHide: hide });
      closeSheet();
    };
  });
};

/* ---------- 2-week walking plan ---------- */
/* Start date lives on one record; each finished day is its own record, so
   both phones can tick days without overwriting each other. */
const planDays = () => Store.list('planday', r => r.plan === 'leash');
function planState() {
  const p = Store.get('plan-leash');
  if (!p || p.stopped) return null;
  const done = new Set(planDays().map(r => r.day));
  const next = LEASH_PLAN.findIndex((_, i) => !done.has(i + 1)) + 1;          // 0 = all done
  const doneToday = planDays().some(r => localDay(r.at) === todayKey());
  return { start: p.start, done, next, doneToday, finished: next === 0 };
}

function planTodayCard() {
  const st = planState();
  if (!st || st.finished) return '';
  const d = LEASH_PLAN[st.next - 1];
  return `<button class="card chipcard plan-today" data-act="planDay" data-n="${st.next}">
    <span class="cd-label">🦮 Walking plan · day ${st.next} of ${LEASH_PLAN.length}${st.doneToday ? ' · today’s done ✓' : ''}</span>
    <b>${esc(d.title)}</b><small class="muted">${esc(d.place)} · ${esc(d.goal)}</small></button>`;
}

function planCard() {
  const st = planState();
  if (!st) return `<section class="card"><h3>🦮 2-week walking plan</h3>
    <p class="muted">One focus a day — 5–10 minutes plus your normal walks — to go from pulling on the collar to a loose leash. Starts with the right harness.</p>
    <button class="primary" data-act="planStart">Start the plan</button></section>`;
  const n = st.done.size, pct = Math.round(100 * n / LEASH_PLAN.length);
  return `<section class="card"><div class="h-row"><h3>🦮 2-week walking plan</h3><span class="muted small">${n}/${LEASH_PLAN.length}</span></div>
    <div class="goal-bar"><i style="width:${pct}%"></i></div>
    ${st.finished ? '<p>🎉 Plan finished! Keep the rule going on every walk — and film a show-off walk for Oscar’s Diary.</p>' : ''}
    <div class="plan-days">${LEASH_PLAN.map((d, i) => `<button class="pday ${st.done.has(i + 1) ? 'done' : ''} ${st.next === i + 1 ? 'next' : ''}" data-act="planDay" data-n="${i + 1}">
      <b>${st.done.has(i + 1) ? '✓' : i + 1}</b><small>${esc(d.title)}</small></button>`).join('')}</div>
    <button class="link" data-act="planStop">${st.finished ? 'Start again' : 'Restart or stop the plan'}</button></section>`;
}

ACT.planStart = async () => {
  await Store.put({ id: 'plan-leash', kind: 'plan', start: todayKey(), stopped: false });
  for (const r of planDays()) await Store.remove(r.id);
  ACT.planDay({ n: 1 });
};
ACT.planStop = () => {
  if (!confirm('Clear the ticks and start the walking plan over? (Practice sessions already logged stay.)')) return;
  ACT.planStart();
};
ACT.planDay = d => {
  const n = Number(d.n), day = LEASH_PLAN[n - 1], rec = planDays().find(r => r.day === n);
  sheet(`<h2>🦮 Day ${n}: ${esc(day.title)}</h2>
    <p class="muted">${esc(day.place)}</p>
    <h4>Today</h4><p>${esc(day.do)}</p>
    <h4>You’re aiming for</h4><p>${esc(day.goal)}</p>
    ${n === 1 ? '<div class="banner jindo">🐕 A collar puts all the pull on his throat. Use a snug, escape-proof front-clip harness for walks — Jindos are known for backing out of loose gear.</div>' : ''}
    ${rec ? `<p class="muted small">✓ Done ${fmtDay(localDay(rec.at))}${rec.by ? ' by ' + esc(rec.by) : ''}${rec.rating ? ' · ' + '★'.repeat(rec.rating) : ''}</p>` : `
    <h4>How did it go?</h4>
    <div class="chips" id="pd-rate">${[1, 2, 3, 4, 5].map(k => `<button class="chip" data-r="${k}">${k}${k === 1 ? ' · rough' : k === 5 ? ' · great' : ''}</button>`).join('')}</div>
    <div class="fld" style="margin-top:10px"><input id="pd-note" placeholder="Note (optional): distractions, what helped"></div>
    <div class="btns"><span class="grow"></span><button class="primary" id="pd-done" disabled>Done — tick day ${n}</button></div>`}
    <details><summary>Full guide: loose-leash walking</summary><ol class="steps">${GUIDES.find(g => g.id === 'leash').steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details>`, r => {
    let rating = 0;
    r.querySelectorAll('#pd-rate .chip').forEach(b => b.onclick = () => { rating = Number(b.dataset.r); r.querySelectorAll('#pd-rate .chip').forEach(c => c.classList.toggle('on', c === b)); $('#pd-done', r).disabled = false; });
    $('#pd-done', r) && ($('#pd-done', r).onclick = async () => {
      const note = $('#pd-note', r).value.trim();
      await Store.put({ id: `plan-leash-d${n}`, kind: 'planday', plan: 'leash', day: n, rating, note });
      await Store.put({ kind: 'train', skill: 'Loose leash', rating, note: `Walking plan day ${n}${note ? ' — ' + note : ''}` });
      closeSheet();
      toast(n === LEASH_PLAN.length ? '🎉 Walking plan complete!' : `✓ Day ${n} done — day ${n + 1} tomorrow`);
    });
  });
};

/* ---------- brand kit ---------- */
ACT.brand = () => sheet(`<h2>📣 Oscar brand kit</h2>
  <p class="muted">The plan the nightly reels follow for ${esc(BRAND.handle)}.</p>
  <h4>Bio</h4><p class="pre">${esc(BRAND.bio)}</p><button class="link" id="br-bio">Copy bio</button>
  <h4>Content pillars</h4>${BRAND.pillars.map(([t, d]) => `<p><b>${esc(t)}</b><br><span class="muted small">${esc(d)}</span></p>`).join('')}
  <h4>Posting rhythm</h4><ul>${BRAND.rhythm.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <h4>The look</h4><p class="muted">${esc(BRAND.look)}</p>`, r => {
  $('#br-bio', r).onclick = async () => { try { await navigator.clipboard.writeText(BRAND.bio); toast('Bio copied'); } catch { toast('Copy failed'); } };
});

/* ---------- notifications ---------- */
ACT.notify = () => {
  const on = Push.enabled();
  const others = Store.list('pushsub', x => x.id !== 'sub-' + Store.dev).map(x => x.name).filter(Boolean);
  sheet(`<h2>🔔 Notifications</h2>
    <p class="muted">Get a notification when the other phone adds photos, videos or a milestone — even when the app is closed.</p>
    ${/iPhone|iPad/.test(navigator.userAgent) ? '<p class="small muted">iPhone: this works only in the app opened from the Home Screen icon (iOS 16.4+).</p>' : ''}
    <div class="step ${on ? 'ok' : ''}"><b>This phone: ${on ? 'on' : 'off'}</b>
      <p>${on ? '<button class="ghost" id="n-test">Send a test to all phones</button> <button class="link" id="n-off">Turn off</button>' : '<button class="primary" id="n-on">Turn on notifications</button>'}</p></div>
    <p class="small muted">${others.length ? 'Also on: ' + others.map(esc).join(', ') : 'No other phone has turned them on yet.'}</p>
    <div id="n-err" class="banner" hidden></div>
    <p class="small muted">Check: ${esc(Push.diag())}</p>`, r => {
    $('#n-on', r) && ($('#n-on', r).onclick = async () => {
      try { await Push.enable(); toast('Notifications on'); await Drive.sync(); ACT.notify(); }
      catch (e) { const b = $('#n-err', r); b.hidden = false; b.textContent = e.message; }
    });
    $('#n-off', r) && ($('#n-off', r).onclick = async () => { await Push.disable(); ACT.notify(); });
    $('#n-test', r) && ($('#n-test', r).onclick = async () => {
      await Drive.sync();
      const n = await Push.send(`🐶 Test from ${Store.who()}`, `Notifications for ${App.pet()} are working`, { includeSelf: true, tag: 'test' });
      toast(n ? `Sent to ${n} phone${n > 1 ? 's' : ''}` : 'Nothing sent — is sync connected?');
    });
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
  if (!Store.pref('oscar.pushSince')) Store.setPref('oscar.pushSince', new Date().toISOString());
  const goto = h => { if (VIEWS[h]) { ui.tab = h; render(); } };
  /* Long-press app-icon shortcuts open ./#log=pee etc.: log it, then clear the hash so a reload doesn't log twice. */
  const fromShortcut = () => {
    const m = location.hash.match(/^#log=(\w+)$/);
    if (!m || !LOG[m[1]]) return false;
    history.replaceState(null, '', location.pathname);
    ui.tab = 'today'; render(); quickLog(m[1]);
    return true;
  };
  if (!fromShortcut()) goto(location.hash.slice(1));
  addEventListener('hashchange', fromShortcut);
  navigator.serviceWorker?.addEventListener('message', e => e.data?.goto && goto(e.data.goto));
  Store.blobClear('c:').catch(() => {});   // full-size copies an earlier version kept on the phone
  Store.onChange(() => {
    renderSoon(); Drive.soon();
    // A photo opened before its full file finished uploading on the other phone: load it once it lands.
    const v = $('#viewer'), w = v.dataset.waiting;
    if (w && !v.hidden && Store.get(w)?.driveId) { delete v.dataset.waiting; viewer(w); }
  });
  Drive.onChange(() => {
    const chip = $('.sync'); if (chip) chip.outerHTML = syncChip();
  });
  render();
  Drive.fromHash().then(n => n && toast(`Connected to “${esc(n)}” — syncing`)).catch(e => toast(esc(e.message)));
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
