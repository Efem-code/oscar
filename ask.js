/* "What does Oscar want?" — tap what he's doing, get his most likely needs.

   There's no bark translator; this is how a trainer would reason it out:
   what the behaviour usually means, weighted by what the logs say about
   right now (potty due, awake for two hours, dinner late), and by what it
   turned out to be the last few times you asked. Each "That was it" is saved
   as an `ask` log entry, so the guesses get more Oscar-specific over time.
   Loaded after app.js, so ACT, LOG and the helpers already exist. */

const NEEDS = {
  potty:     { icon: '💧', label: 'Needs to go out', tip: 'Take him out on leash to his usual spot. Stand still and boring for 3–5 minutes; praise and treat the moment he goes. Nothing? Back in, watch him closely, try again in 10–15 min.' },
  hungry:    { icon: '🍖', label: 'Hungry or thirsty', tip: 'Check the water bowl first. If a meal is due, feed him; if not, a few kibbles in a snuffle mat or a frozen Kong buys time without overfeeding.' },
  tired:     { icon: '😴', label: 'Overtired — needs a nap', tip: 'Puppies his age still sleep 14–18 h a day, and an overtired one gets bitey and wild, not sleepy. Potty first, then crate or pen with a chew, lights low. He’ll often be out in minutes.' },
  bored:     { icon: '🎾', label: 'Bored — needs to use his brain', tip: 'A sniffy walk (let him lead the pace), a brain game or 5 minutes of training. Sniffing tires a Jindo faster than running.' },
  attention: { icon: '🤗', label: 'Wants you', tip: 'Give him 5 minutes: play, cuddle or a mini training session. If he’s barking or pawing to demand it, wait for 2–3 seconds of quiet first, then give the attention — so calm is what works.' },
  teething:  { icon: '🦷', label: 'Needs to chew', tip: 'Swap whatever he’s got for something he’s allowed — a frozen wet washcloth, a bully stick or a stuffed Kong. Chewing is a need, not naughtiness.' },
  anxious:   { icon: '😟', label: 'Worried or scared', tip: 'Don’t force him toward what scares him. Give him space and distance, stay calm and boring, and scatter a few treats for him to sniff out — sniffing lowers stress. Jindos need time to warm up.' },
  alert:     { icon: '👂', label: 'Heard or saw something', tip: 'Jindos are watchful by nature. Calmly check, say “thank you”, and call him away for a treat. Block the window view if it becomes a habit.' },
  unwell:    { icon: '🤒', label: 'Uncomfortable or unwell', tip: 'Check him over: ears, paws, skin, belly, his last poop. Call the vet the same day for vomiting more than once, diarrhoea with blood, a swollen hard belly, not eating for a day, limping, or real lethargy.' },
};

/* What he's doing → how strongly each behaviour points to each need. */
const SIGNS = [
  { k: 'whine',   icon: '😢', label: 'Whining',            w: { potty: 2, attention: 2, anxious: 1.5, unwell: 1, tired: 1, hungry: .5 } },
  { k: 'bark',    icon: '🗯️', label: 'Barking',            w: { alert: 2.5, attention: 1.5, bored: 1, anxious: 1 } },
  { k: 'door',    icon: '🚪', label: 'At the door',        w: { potty: 4, bored: 1 } },
  { k: 'sniff',   icon: '👃', label: 'Sniffing / circling', w: { potty: 4 } },
  { k: 'pace',    icon: '🔄', label: 'Pacing / restless',  w: { potty: 2, anxious: 1.5, unwell: 1, bored: 1 } },
  { k: 'stare',   icon: '👀', label: 'Staring at me',      w: { attention: 2, hungry: 1.5, potty: 1, bored: 1 } },
  { k: 'paw',     icon: '🐾', label: 'Pawing / nudging',   w: { attention: 2.5, hungry: 1, potty: 1 } },
  { k: 'bowl',    icon: '🥣', label: 'At his bowl',        w: { hungry: 4 } },
  { k: 'bite',    icon: '😬', label: 'Biting / mouthing',  w: { tired: 2.5, teething: 2, bored: 1.5, attention: 1 } },
  { k: 'zoom',    icon: '💨', label: 'Zoomies',            w: { tired: 2, bored: 1.5 } },
  { k: 'chew',    icon: '🩴', label: 'Chewing things',     w: { teething: 3, bored: 2 } },
  { k: 'toy',     icon: '🧸', label: 'Bringing a toy',     w: { attention: 2, bored: 2.5 } },
  { k: 'crate',   icon: '📦', label: 'Crying in crate',    w: { potty: 2.5, anxious: 2, attention: 1.5 } },
  { k: 'calm',    icon: '😮‍💨', label: 'Yawning / lip licking', w: { anxious: 3, tired: 1 } },
  { k: 'hide',    icon: '🙈', label: 'Hiding / tail tucked', w: { anxious: 4, unwell: 1.5 } },
  { k: 'window',  icon: '🪟', label: 'Watching the window', w: { alert: 3.5, bored: 1 } },
  { k: 'scratch', icon: '🐜', label: 'Scratching / licking', w: { unwell: 2.5, anxious: .5 } },
  { k: 'low',     icon: '🫠', label: 'Quiet / low energy', w: { unwell: 3, tired: 2 } },
];
const SIGN = Object.fromEntries(SIGNS.map(s => [s.k, s]));

const BODY_LANGUAGE = [
  ['Loose, wiggly body, soft eyes, relaxed open mouth', 'Happy and relaxed'],
  ['Play bow — front down, bum up', '“Play with me!”'],
  ['Yawning (not tired), lip licking, turning his head away, whale eye', 'Uneasy — give him space or distance'],
  ['Tail tucked, ears pinned back, crouching low', 'Scared'],
  ['Freezing, stiff body, hard stare, closed mouth', '“Back off” — stop what you’re doing and move away'],
  ['Sniffing the floor and circling', 'About to pee or poop — out now'],
  ['Looks at you, then at the door / bowl / toy', 'Asking for that thing'],
  ['Shake-off after something', 'Resetting after stress or excitement'],
  ['Jindo tail high and curled, ears forward', 'Confident and interested — normal for the breed'],
];

LOG.ask = { k: 'ask', icon: '🗣️', label: 'He asked' };

/* Meal times like “7am, 12pm, 5:30 pm” → minutes after midnight. */
function mealTimes() {
  const s = currentFood()?.times || '';
  return [...s.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi)].map(([, h, m, ap]) => {
    h = Number(h) % 12 + ((ap || '').toLowerCase() === 'pm' || (!ap && Number(h) < 7) ? 12 : 0);
    if ((ap || '').toLowerCase() === 'am' && h === 12) h = 0;
    return h * 60 + Number(m || 0);
  }).filter(x => x < 1440).sort((a, b) => a - b);
}

/* What the logs say about right now, per need: a score nudge and the reason. */
function askContext(now = Date.now()) {
  const c = Object.fromEntries(Object.keys(NEEDS).map(k => [k, { s: 0, why: [] }]));
  const add = (k, s, why) => { c[k].s += s; why && c[k].why.push(why); };
  const minsAgo = r => r ? (now - T(r.at)) / 6e4 : Infinity;
  const last = t => Store.list('log', r => r.type === t && T(r.at) <= now)[0];

  // Potty
  const ps = pottyStatus(now), left = (ps.due - now) / 6e4;
  const lastPotty = ps.last && ps.last.type !== 'accident' ? ps.last : Store.list('log', r => (r.type === 'pee' || r.type === 'poop') && T(r.at) <= now)[0];
  if (lastPotty && minsAgo(lastPotty) < 15) add('potty', -2.5, `He went ${fmtMin(minsAgo(lastPotty))} ago`);
  else if (left <= 0) add('potty', 3, `Potty break was due ${left > -1 ? 'now' : fmtMin(left) + ' ago'} (${ps.reason})`);
  else if (left < 25) add('potty', 1.5, `Potty break due in ${fmtMin(left)}`);
  else if (lastPotty) add('potty', 0, `Last went ${fmtMin(minsAgo(lastPotty))} ago`);
  const wake = last('wake');
  if (wake && minsAgo(wake) < 15) add('potty', 2, `Just woke up`);

  // Food
  const meal = last('meal'), mt = mealTimes();
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const missed = mt.filter(m => m + 15 <= nowMin && (!meal || localDay(meal.at) !== localDay(new Date(now).toISOString()) || (new Date(meal.at).getHours() * 60 + new Date(meal.at).getMinutes()) < m - 45)).pop();
  if (meal && minsAgo(meal) < 60) add('hungry', -2, `Ate ${fmtMin(minsAgo(meal))} ago`);
  else if (missed != null) add('hungry', 3, `Meal at ${fmtClock(`${pad(Math.floor(missed / 60))}:${pad(missed % 60)}`)} isn’t logged yet`);
  else if (minsAgo(meal) > 300 && minsAgo(meal) !== Infinity) add('hungry', 1.5, `Last meal ${fmtMin(minsAgo(meal))} ago`);
  if (meal && /some|none/i.test(meal.ate || '')) add('unwell', 1, `Ate “${meal.ate.toLowerCase()}” of his last meal`);

  // Sleep
  const ss = sleepState();
  if (!ss.asleep && ss.since) {
    const awake = minsAgo({ at: ss.since });
    if (awake > 100) add('tired', 2.5, `Awake for ${fmtMin(awake)} — puppies usually need a nap after 1–2 h`);
    else if (awake > 60) add('tired', 1, `Awake for ${fmtMin(awake)}`);
    else if (awake < 20) add('tired', -1.5, `Only just woke up`);
  }
  const h = new Date(now).getHours();
  if (h >= 21 || h < 5) { add('tired', 1, 'It’s late'); add('potty', .5); }

  // Exercise and brain work
  const busy = [last('walk'), last('play'), Store.list('enrich', r => T(r.at) <= now)[0]].filter(Boolean).sort((a, b) => T(b.at) - T(a.at))[0];
  if (busy && minsAgo(busy) < 45) add('bored', -1.5, `Had a ${busy.kind === 'enrich' ? 'brain game' : LOG[busy.type].label.toLowerCase()} ${fmtMin(minsAgo(busy))} ago`);
  else if (!busy || minsAgo(busy) > 240) add('bored', 1.5, busy ? `No walk, play or game logged for ${fmtMin(minsAgo(busy))}` : 'No walk or play logged yet');

  // Age and settling in
  const wk = App.weekOf(now);
  if (wk != null && wk >= 12 && wk <= 30) add('teething', 1, `${wk} weeks old — adult teeth are coming in`);
  else if (wk != null && wk > 30) add('teething', -.5);
  const home = App.homeDay();
  if (home > 0 && home <= 14) add('anxious', .5, `Day ${home} home — still settling in`);
  const acc = Store.list('log', r => r.type === 'accident' && T(r.at) > now - 864e5).length;
  if (acc >= 2) add('unwell', .5, `${acc} accidents in the last day — worth watching`);

  return c;
}

/* Past answers with the same signs: “the last 3 times he whined at night, it was potty”. */
function askHistory(signs) {
  const out = {};
  if (!signs.length) return out;
  const set = new Set(signs);
  for (const r of Store.list('log', r => r.type === 'ask' && r.need && Array.isArray(r.signs))) {
    const inter = r.signs.filter(s => set.has(s)).length;
    if (!inter) continue;
    const sim = inter / new Set([...r.signs, ...signs]).size;
    const o = out[r.need] ||= { s: 0, n: 0, seen: new Set() };
    o.s += sim; o.n++; r.signs.forEach(x => set.has(x) && o.seen.add(x));
  }
  return out;
}

function askRank(signs) {
  const ctx = askContext(), hist = askHistory(signs);
  const rows = Object.keys(NEEDS).map(k => {
    const base = signs.reduce((a, s) => a + (SIGN[s].w[k] || 0), 0);
    const h = hist[k];
    const learned = h ? Math.min(4, 2 * h.s) : 0;
    const why = [...ctx[k].why];
    if (h) why.unshift(`Before, when you saw ${[...h.seen].map(s => SIGN[s].label.toLowerCase()).join(' + ')}, it was this${h.n > 1 ? ` (${h.n}×)` : ''}`);
    // With no signs picked, context alone decides; otherwise context only nudges.
    return { k, score: base + (signs.length ? .7 : 1) * ctx[k].s + learned, why, learned: !!h };
  }).filter(r => r.score > .4).sort((a, b) => b.score - a.score);
  return rows.slice(0, 3);
}

function askResults(signs) {
  const rows = askRank(signs);
  if (!rows.length) return `<p class="muted pad">Nothing stands out right now — he may just be checking in. Pick what you’re seeing above.</p>`;
  const top = rows[0].score;
  const sure = rows.length === 1 || rows[0].score > rows[1].score * 1.5;
  return `<p class="muted small">${signs.length ? (sure ? 'Most likely:' : 'Could be one of these — start with the first:') : 'From the logs alone, right now:'}</p>
    ${rows.map((r, i) => { const n = NEEDS[r.k]; return `<div class="ask-r ${i === 0 ? 'top' : ''}">
      <div class="ask-h"><span class="ico">${n.icon}</span><b>${esc(n.label)}</b>${r.learned ? '<span class="ask-tag">learned</span>' : ''}</div>
      <div class="ask-bar"><i style="width:${Math.round(100 * r.score / top)}%"></i></div>
      ${r.why.length ? `<ul class="ask-why">${r.why.slice(0, 3).map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <p class="ask-tip">${esc(n.tip)}</p>
      ${r.k === 'unwell' && signs.includes('low') ? '<p class="banner">If he’s floppy, has pale gums, is struggling to breathe or has a swollen belly, call the vet or emergency clinic now.</p>' : ''}
      <div class="btns">${r.k === 'potty' ? '<button class="ghost" data-ans="potty" data-also="pee">💧 He peed</button>' : ''}${r.k === 'hungry' ? '<button class="ghost" data-ans="hungry" data-also="meal">🍖 Fed him</button>' : ''}${r.k === 'tired' ? '<button class="ghost" data-ans="tired" data-also="rest">😴 He’s napping</button>' : ''}
        <span class="grow"></span><button class="${i === 0 ? 'primary' : 'ghost'}" data-ans="${r.k}">✓ That was it</button></div>
    </div>`; }).join('')}
    <details class="ask-other"><summary>It was something else</summary><div class="chips">${Object.entries(NEEDS).filter(([k]) => !rows.some(r => r.k === k))
      .map(([k, n]) => `<button class="chip" data-ans="${k}">${n.icon} ${esc(n.label)}</button>`).join('')}</div></details>`;
}

/* The patterns so far, by sign: “Whining → potty 4 of 5”. */
function askPatterns() {
  const asks = Store.list('log', r => r.type === 'ask' && r.need && Array.isArray(r.signs));
  if (asks.length < 3) return asks.length ? `<p class="muted small">${asks.length} answer${asks.length > 1 ? 's' : ''} saved — patterns show up after a few more.</p>` : '';
  const by = {};
  for (const r of asks) for (const s of r.signs) { const o = by[s] ||= {}; o[r.need] = (o[r.need] || 0) + 1; }
  const lines = Object.entries(by).map(([s, o]) => { const tot = Object.values(o).reduce((a, b) => a + b, 0); const [need, n] = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; return { s, need, n, tot }; })
    .filter(x => x.tot >= 2 && SIGN[x.s]).sort((a, b) => b.tot - a.tot).slice(0, 6);
  return lines.length ? `<h4>What ${esc(App.pet())} usually means</h4><div class="ask-pat">${lines.map(x => `<span>${SIGN[x.s].icon} ${esc(SIGN[x.s].label)} → ${NEEDS[x.need].icon} <b>${esc(NEEDS[x.need].label.toLowerCase())}</b> <small>${x.n} of ${x.tot}</small></span>`).join('')}</div>` : '';
}

function askButton() {
  return `<button class="cam-btn ask-btn" data-act="ask">🐶 What does ${esc(App.pet())} want?</button>`;
}

ACT.ask = () => {
  const picked = new Set();
  sheet(`<h2>🐶 What does ${esc(App.pet())} want?</h2>
    <div id="ask"><p class="muted small">Tap everything you’re seeing. The app uses his logs too — when he last went, ate, slept and played.</p>
    <div class="chips ask-signs">${SIGNS.map(s => `<button type="button" class="chip" data-sign="${s.k}">${s.icon} ${esc(s.label)}</button>`).join('')}</div>
    <div id="ask-out"></div>
    ${askPatterns()}
    <details class="ask-other"><summary>📖 Reading his body language</summary>
      <dl class="ask-bl">${BODY_LANGUAGE.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>
      <p class="muted small">Read the whole dog, not just the tail — and the situation. A wagging tail on a stiff body isn’t friendly.</p></details></div>`, body => {
    const root = $('#ask', body), out = $('#ask-out', root);
    const draw = () => { out.innerHTML = askResults([...picked]); };
    draw();
    root.addEventListener('click', async e => {
      const s = e.target.closest('[data-sign]');
      if (s) { const k = s.dataset.sign; picked.has(k) ? picked.delete(k) : picked.add(k); s.classList.toggle('on', picked.has(k)); return draw(); }
      const a = e.target.closest('[data-ans]'); if (!a) return;
      const need = a.dataset.ans, signs = [...picked];
      const rec = await Store.put({ kind: 'log', type: 'ask', signs, need, note: '' });
      closeSheet();
      if (a.dataset.also) return quickLog(a.dataset.also);
      toast(`${NEEDS[need].icon} Saved — ${esc(App.pet())}’s guesses get better each time`, [{ label: 'Undo', run: () => Store.remove(rec.id) }]);
    });
  });
};
