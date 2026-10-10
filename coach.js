/* My Plan + training sessions for the Train tab.

   The plan is a set of tracks (recall, focus, sit…), each a ladder of small
   steps. A step is passed after two sessions rated 4 or 5, or when you say he
   already knows it. Tracks open a few at a time so there's never too much on
   the go, and each day the plan picks the three tracks that have waited
   longest. Practice is stored as ordinary `train` records with a `step`
   field, so the Skills tracker and both phones see it like any other session.

   Session mode is a clicker, a short countdown and a rep counter. It suggests
   a rating from the hits and misses, and saves the session when you finish.
   Loaded after app.js, so ACT, VIEWS, Store and the helpers already exist. */

/* `open` = how many steps must be passed (across all tracks) before the track
   starts appearing in the plan. `guide` links to the full guide in guides.js. */
const TRACKS = [
  { id: 'focus', icon: '👀', title: 'Name & focus', skill: 'Name', guide: 'focus', open: 0, steps: [
    { t: 'Name game', mins: 3, do: 'Indoors, no distractions. Say his name once in a happy voice. The instant he turns his head, click (or “Yes!”) and treat. Wait for him to look away, then repeat.', goal: 'He whips round to his name almost every time.' },
    { t: 'Watch me, 1 second', mins: 3, do: 'Hold a treat up by your eyes. The moment his eyes meet yours, click and treat. Then start lowering your hand so he looks at your face, not the treat.', goal: 'He offers eye contact for a second without the treat at your face.' },
    { t: 'Watch me, 3 seconds', mins: 3, do: 'Count silently to one, then two, then three before you click. Mix in some easy one-second reps so it never gets too hard.', goal: 'He holds eye contact for 3 seconds.' },
    { t: 'Name with a toy nearby', mins: 3, do: 'Put a toy on the floor a few metres away. Say his name; click and treat when he turns away from the toy to you. Move closer to the toy only when it’s easy.', goal: 'He turns to you even with something interesting nearby.' },
    { t: 'Name outside', mins: 5, do: 'In the yard or a quiet street, on leash. Name, click, treat. Outside is much harder, so use your best treats and expect fewer hits at first.', goal: 'He checks in to his name outdoors most of the time.' },
  ] },
  { id: 'recall', icon: '📣', title: 'Recall', skill: 'Come (recall)', guide: 'recall', open: 0, steps: [
    { t: 'Short indoor recall', mins: 3, do: '1–2 metres away, indoors. Name + cue once, take a step back, click when he reaches you and give a jackpot (3–5 treats one after another). Touch his collar before the treats.', goal: 'He comes straight to you every time from a short distance.' },
    { t: 'Room to room', mins: 3, do: 'Call him from the next room when he isn’t busy. Big party when he arrives. Never call him for something he dislikes.', goal: 'He comes running from another room.' },
    { t: 'Ping-pong recall', mins: 5, do: 'Two people in different rooms take turns calling him. Each recall earns a jackpot. Stop while he still wants more.', goal: 'He flies between you both.' },
    { t: 'Yard on a long line', mins: 5, do: 'Outside on a 10–15 m long line, somewhere quiet. Call when he’s mildly distracted, not mid-chase. Run backwards as you call.', goal: 'He comes on the first cue in a quiet outdoor spot.' },
    { t: 'Recall from sniffing', mins: 5, do: 'Still on the long line. Call him away from a sniff, pay well, then send him back with “Go sniff!” so coming to you doesn’t end the fun.', goal: 'He leaves a good smell to come to you.' },
    { t: 'Park edge', mins: 5, do: 'Long line at a quiet park edge, far from dogs and squirrels. Short, easy recalls with your best treats. Leave if he can’t eat or listen.', goal: 'Reliable recall with mild real-world distractions.' },
  ] },
  { id: 'sit', icon: '🪑', title: 'Sit', skill: 'Sit', open: 0, steps: [
    { t: 'Lure into sit', mins: 3, do: 'Treat at his nose, slowly move it up and back over his head. When his bum touches the floor, click and treat. No word yet.', goal: 'He sits as soon as your hand moves.' },
    { t: 'Empty hand', mins: 3, do: 'Same hand movement with no treat in that hand. Click when he sits and pay from your other hand. This turns the lure into a hand signal.', goal: 'He sits for the hand signal alone.' },
    { t: 'Add the word', mins: 3, do: 'Say “Sit” once, pause one second, then give the hand signal. Soon he’ll start sitting on the word before your hand moves.', goal: 'He sits on the word alone.' },
    { t: 'Sit anywhere', mins: 3, do: 'Ask for sits in new rooms, the yard, before meals and at the door. Easier versions in each new place.', goal: 'He sits on cue in different places.' },
  ] },
  { id: 'handling', icon: '✂️', title: 'Handling', skill: 'Handling & nail trims', guide: 'handling', open: 0, steps: [
    { t: 'Paw touch', mins: 2, do: 'Touch a paw for a second, click, treat. Let go if he pulls away and make the next touch shorter. Do all four paws.', goal: 'He stays relaxed while you touch each paw.' },
    { t: 'Hold a paw', mins: 2, do: 'Hold a paw gently for 1–2 seconds, click, treat. Also touch his ears and lift a lip briefly.', goal: 'He lets you hold a paw for a few seconds.' },
    { t: 'Meet the clippers', mins: 2, do: 'Show the clippers, click, treat, put them away. Then touch them to a paw without clipping.', goal: 'The clippers predict treats, not stress.' },
    { t: 'Tap a nail', mins: 2, do: 'Hold a paw, tap a nail with the closed clippers, click, treat. Squeeze them near his ear so he hears the sound.', goal: 'He’s calm with clippers on his nails.' },
    { t: 'One nail', mins: 2, do: 'Trim just the very tip of one nail, then jackpot and stop. One or two nails a day is plenty.', goal: 'Nail trims with no fuss.' },
  ] },
  { id: 'leave', icon: '🚫', title: 'Leave it', skill: 'Leave it (small animals)', guide: 'leave', open: 3, steps: [
    { t: 'Closed fist', mins: 3, do: 'Treat in a closed fist. Let him sniff and lick. The second he backs off, click and treat from your other hand.', goal: 'He backs off your fist right away.' },
    { t: 'Add “Leave it”', mins: 3, do: 'Say “Leave it” just before you present the fist. Click and pay from the other hand when he backs off.', goal: 'He backs off as soon as he hears the cue.' },
    { t: 'Open palm', mins: 3, do: 'Treat on your open palm. Close it if he goes for it. Click when he looks away or at you.', goal: 'He ignores a treat on your open hand.' },
    { t: 'Treat on the floor', mins: 3, do: 'Treat on the floor, your foot ready to cover it. “Leave it.” Click and pay from your hand when he looks away.', goal: 'He leaves a treat on the floor.' },
    { t: 'Walk past it', mins: 5, do: 'On leash, walk past a treat on the floor at a distance he can manage. Click for looking at you. Get closer bit by bit.', goal: 'He walks past food on the floor.' },
    { t: 'Moving target', mins: 5, do: 'Someone drags a toy on a string well away from him. Click for looking away from it. If he freezes and stares, add distance.', goal: 'He can look away from something moving.' },
  ] },
  { id: 'down', icon: '⬇️', title: 'Down', skill: 'Down', open: 3, steps: [
    { t: 'Lure into down', mins: 3, do: 'From a sit, move a treat from his nose straight down to the floor between his paws, then slowly out. Click the moment his elbows touch.', goal: 'He folds into a down following your hand.' },
    { t: 'Empty hand', mins: 3, do: 'Same movement with no treat in that hand. Pay from the other hand.', goal: 'He lies down for the hand signal.' },
    { t: 'Add the word', mins: 3, do: 'Say “Down” once, pause, then the hand signal. Don’t use “down” for jumping up; use “Off” for that.', goal: 'He lies down on the word.' },
  ] },
  { id: 'drop', icon: '🧸', title: 'Drop it', skill: 'Drop it', guide: 'drop', open: 3, steps: [
    { t: 'Trade game', mins: 3, do: 'While he has a toy, put a great treat right at his nose. When he lets go, click, treat, and give the toy back.', goal: 'He opens his mouth as soon as the treat appears.' },
    { t: 'Add “Drop”', mins: 3, do: 'Say “Drop” once, then show the treat. Give the toy back most of the time so dropping never means losing it.', goal: 'He drops on the cue.' },
    { t: 'Drop mid-tug', mins: 3, do: 'During a gentle tug game, go still, say “Drop”, click and restart the game as his reward.', goal: 'He lets go during play.' },
  ] },
  { id: 'settle', icon: '🧘', title: 'Settle on a mat', skill: 'Settle', guide: 'settle', open: 6, steps: [
    { t: 'Mat is magic', mins: 3, do: 'Put a mat down. Click and treat for looking at it, then a paw on it, then all four paws. Toss a treat off it to reset.', goal: 'He runs to the mat when it appears.' },
    { t: 'Lie down on the mat', mins: 3, do: 'Wait for him to lie down on the mat (or cue it). Click, then place the treat between his paws.', goal: 'He lies down on the mat on his own.' },
    { t: '30 seconds of calm', mins: 5, do: 'While he’s lying there, drop a treat between his paws every few seconds, then slower. Calm, quiet praise.', goal: 'He stays relaxed on the mat for 30 seconds.' },
    { t: 'Settle while you sit', mins: 10, do: 'Sit on the couch with a book. Treat him calmly on his mat every 20–30 seconds. A chew helps.', goal: 'Two minutes or more of settling.' },
    { t: 'Settle at mealtimes', mins: 10, do: 'Mat near the table while you eat. Give him a chew or Kong there and treat calm moments.', goal: 'He settles through your meal.' },
  ] },
  { id: 'door', icon: '🚪', title: 'Wait at the door', skill: 'Door wait (no bolting)', guide: 'door', open: 6, steps: [
    { t: 'Wait at the bowl', mins: 2, do: 'Hold his bowl. Lower it; lift it back up if he lunges. When he holds back, put it down and release with “OK!”', goal: 'He waits for his bowl until released.' },
    { t: 'Hand on the door', mins: 2, do: 'Leash on. Put your hand on the handle. Click and treat for him staying back. Release with “OK!”', goal: 'He stays back when you touch the door.' },
    { t: 'Crack the door', mins: 3, do: 'Open it a few centimetres. If he moves forward, close it calmly. Click for holding position.', goal: 'He waits with the door a little open.' },
    { t: 'Door wide open', mins: 3, do: 'Open fully for 2–3 seconds before releasing. Keep the leash on outside doors, every time.', goal: 'He waits at an open door until “OK!”' },
  ] },
  { id: 'stay', icon: '✋', title: 'Stay', skill: 'Stay', open: 6, steps: [
    { t: 'One second, one step', mins: 3, do: 'Ask for a sit. Say “Stay”, lean back or take one step, step back in, click and treat while he’s still sitting. Then release.', goal: 'He holds a sit while you take a step.' },
    { t: 'Five seconds', mins: 3, do: 'Build time before distance: stand still next to him and count to five before you click.', goal: 'A 5-second stay next to you.' },
    { t: 'Two steps back', mins: 3, do: 'Short time, a little distance. Always return to him to reward; don’t call him out of a stay.', goal: 'He holds while you step two paces away.' },
    { t: 'Turn around', mins: 3, do: 'Turn your back for a second, turn round, return and reward. Ten-second stays with small movements.', goal: 'Ten-second stays with you moving.' },
  ] },
];

const PLAN_SIZE = 3;
const stepId = (tr, i) => `${tr.id}-${i + 1}`;
const trackOf = id => TRACKS.find(tr => id && id.startsWith(tr.id + '-'));
const stepOf = id => { const tr = trackOf(id); return tr ? tr.steps[Number(id.slice(tr.id.length + 1)) - 1] : null; };

function stepSessions(id) { return Store.list('train', r => r.step === id); }
function stepPassed(id) {
  const s = stepSessions(id);
  return s.some(r => r.known) || s.filter(r => Number(r.rating) >= 4).length >= 2;
}
/* Where a track is now: the first step not yet passed (-1 = all done). */
function trackState(tr) {
  const cur = tr.steps.findIndex((_, i) => !stepPassed(stepId(tr, i)));
  const sessions = Store.list('train', r => r.step && !r.known && r.step.startsWith(tr.id + '-'));
  return { tr, cur, done: cur === -1, passed: cur === -1 ? tr.steps.length : cur, sessions };
}
const totalPassed = () => TRACKS.reduce((n, tr) => n + trackState(tr).passed, 0);
const openTracks = () => { const n = totalPassed(); return TRACKS.filter(tr => tr.open <= n); };

/* Today's three: open, unfinished tracks, longest-waiting first. Only
   sessions from before today count for the order, so the list doesn't
   reshuffle as you tick things off. */
function todaysPlan() {
  const today = todayKey();
  const rows = openTracks().map(trackState).map(st => {
    const before = st.sessions.find(r => localDay(r.at) < today);
    const todays = st.sessions.find(r => localDay(r.at) === today);
    return { ...st, last: before ? before.at : '', todays };
  }).filter(st => !st.done || st.todays);
  rows.sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : TRACKS.indexOf(a.tr) - TRACKS.indexOf(b.tr)));
  return rows.slice(0, PLAN_SIZE).map(st => {
    const id = st.todays ? st.todays.step : stepId(st.tr, st.cur);
    const last = stepSessions(id)[0];
    return { ...st, id, step: stepOf(id), doneToday: !!st.todays, struggling: last && Number(last.rating) <= 2 && !st.todays };
  });
}

function coachCard() {
  const plan = todaysPlan(), n = plan.filter(p => p.doneToday).length;
  const passed = totalPassed(), total = TRACKS.reduce((a, tr) => a + tr.steps.length, 0);
  const walk = typeof planState === 'function' ? planState() : null;
  const walkItem = walk && !walk.finished ? LEASH_PLAN[walk.next - 1] : null;
  return `<section class="card coach"><div class="h-row"><h3>🎯 My plan today</h3><span class="muted small">${n}/${plan.length} done</span></div>
    ${plan.length ? plan.map(p => `<div class="coach-row ${p.doneToday ? 'done' : ''}">
      <button class="item-main" data-act="coachStep" data-id="${p.id}"><span class="ico">${p.doneToday ? '✅' : p.tr.icon}</span>
        <span><b>${esc(p.tr.title)}: ${esc(p.step.t)}</b><small>Step ${Number(p.id.split('-').pop())} of ${p.tr.steps.length} · ${p.step.mins} min${p.struggling ? ' · make it easier today' : ''}</small></span></button>
      ${p.doneToday ? '' : `<button class="pill" data-act="session" data-id="${p.id}">▶ Start</button>`}</div>`).join('')
      : '<p class="muted">Every track is finished. Amazing work! Keep the skills fresh with a quick session now and then.</p>'}
    ${walkItem ? `<div class="coach-row ${walk.doneToday ? 'done' : ''}"><button class="item-main" data-act="planDay" data-n="${walk.next}"><span class="ico">${walk.doneToday ? '✅' : '🦮'}</span>
      <span><b>Walking plan: ${esc(walkItem.title)}</b><small>Day ${walk.next} of ${LEASH_PLAN.length}</small></span></button></div>` : ''}
    <div class="goal-bar" style="margin-top:10px"><i style="width:${Math.round(100 * passed / total)}%"></i></div>
    <div class="h-row sub"><span class="muted small">${passed} of ${total} steps passed · new skills unlock as he progresses</span><button class="link" data-act="coachAll">All tracks</button></div>
  </section>`;
}

/* A one-line nudge for the Today tab. */
function coachTodayCard() {
  const plan = todaysPlan(); if (!plan.length) return '';
  const left = plan.filter(p => !p.doneToday);
  if (!left.length) return `<button class="card chipcard plan-today" data-act="tab" data-tab="train"><span class="cd-label">🎯 Training · all done today ✓</span><b>Nice work! ${esc(App.pet())} did ${plan.length} sessions.</b></button>`;
  return `<button class="card chipcard plan-today" data-act="session" data-id="${left[0].id}">
    <span class="cd-label">🎯 Training · ${plan.length - left.length} of ${plan.length} done</span>
    <b>Next: ${esc(left[0].tr.title)}, ${esc(left[0].step.t)}</b><small class="muted">${left[0].step.mins} min · tap to start a session</small></button>`;
}

ACT.coachAll = () => {
  const n = totalPassed();
  sheet(`<h2>🎯 All training tracks</h2>
    <p class="muted">Tap a step to read it or practise it. A step is passed after two sessions rated 4 or 5.</p>
    ${TRACKS.map(tr => { const st = trackState(tr), locked = tr.open > n; return `<div class="track ${locked ? 'locked' : ''}">
      <div class="h-row"><b>${tr.icon} ${esc(tr.title)}</b><span class="muted small">${locked ? `🔒 opens after ${tr.open} steps` : st.done ? '✓ done' : `${st.passed}/${tr.steps.length}`}</span></div>
      ${locked ? '' : `<div class="plan-days">${tr.steps.map((s, i) => { const id = stepId(tr, i), ok = stepPassed(id);
        return `<button class="pday ${ok ? 'done' : ''} ${i === st.cur ? 'next' : ''}" data-act="coachStep" data-id="${id}"><b>${ok ? '✓' : i + 1}</b><small>${esc(s.t)}</small></button>`; }).join('')}</div>`}
    </div>`; }).join('')}`);
};

ACT.coachStep = d => {
  const tr = trackOf(d.id), s = stepOf(d.id), i = Number(d.id.split('-').pop());
  const hist = stepSessions(d.id).slice(0, 5), ok = stepPassed(d.id);
  const last = hist[0];
  sheet(`<h2>${tr.icon} ${esc(tr.title)}: ${esc(s.t)}</h2>
    <p class="muted">Step ${i} of ${tr.steps.length} · about ${s.mins} minutes</p>
    <h4>What to do</h4><p>${esc(s.do)}</p>
    ${videoButton(tr.id)}
    <h4>You’re aiming for</h4><p>${esc(s.goal)}</p>
    ${last && Number(last.rating) <= 2 ? `<div class="banner">Last time was tough. Make it easier today: closer, quieter, shorter, better treats${i > 1 ? `, or do a few reps of the step before (“${esc(tr.steps[i - 2].t)}”) first` : ''}. End on a win.</div>` : ''}
    ${hist.length ? `<h4>Sessions on this step</h4><div class="hist">${hist.map(h => `<span>${fmtDay(localDay(h.at))} ${h.known ? 'already knew it' : '★'.repeat(h.rating || 0) + '☆'.repeat(5 - (h.rating || 0))}</span>`).join('')}</div>` : ''}
    ${ok ? '<p class="muted small">✓ Passed. Practise any time to keep it fresh.</p>' : ''}
    ${tr.guide ? `<button class="link" data-act="guide" data-id="${tr.guide}">Read the full ${esc(tr.title.toLowerCase())} guide</button>` : ''}
    <div class="btns">${ok ? '' : '<button class="ghost" id="cs-known">He already knows this</button>'}<span class="grow"></span>
      <button class="primary" data-act="session" data-id="${d.id}">▶ Start a session</button></div>`, root => {
    const k = $('#cs-known', root);
    k && (k.onclick = async () => {
      await Store.put({ kind: 'train', skill: tr.skill, step: d.id, rating: 5, known: true, note: `${tr.title}: ${s.t} (already knew it)` });
      closeSheet(); toast(nextToast(tr));
    });
  });
};

function nextToast(tr) {
  const st = trackState(tr);
  return st.done ? `🎉 ${esc(tr.title)} track complete!` : `✓ Next for ${esc(tr.title)}: ${esc(tr.steps[st.cur].t)}`;
}

/* ---------- session mode ---------- */
/* The clicker is a tiny burst of filtered noise, made on the spot, so it
   works offline and needs no sound file. */
let clickCtx;
function clickSound() {
  try {
    clickCtx = clickCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (clickCtx.state === 'suspended') clickCtx.resume();
    const t = clickCtx.currentTime, len = Math.floor(clickCtx.sampleRate * 0.03);
    const buf = clickCtx.createBuffer(1, len, clickCtx.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = clickCtx.createBufferSource(); src.buffer = buf;
    const hp = clickCtx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 3200; hp.Q.value = 1.2;
    const g = clickCtx.createGain(); g.gain.setValueAtTime(1.6, t);
    src.connect(hp).connect(g).connect(clickCtx.destination); src.start(t);
  } catch {}
}
function chime() {
  try {
    clickCtx = clickCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = clickCtx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = clickCtx.createOscillator(), g = clickCtx.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
      o.connect(g).connect(clickCtx.destination); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.55);
    });
  } catch {}
  try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch {}
}
const suggestRating = (hits, miss) => {
  const n = hits + miss; if (!n) return 0;
  const p = hits / n;
  return p >= 0.9 ? 5 : p >= 0.75 ? 4 : p >= 0.5 ? 3 : p >= 0.25 ? 2 : 1;
};

/* d.id = a plan step, or d.skill for a free session on any skill. */
ACT.session = d => {
  const tr = trackOf(d.id), s = stepOf(d.id);
  const skill = tr ? tr.skill : d.skill, title = s ? `${tr.title}: ${s.t}` : skill;
  const secs = (s ? s.mins : 3) * 60;
  const sound = () => Store.pref('oscar.clicker') !== 'off';
  let left = secs, running = false, timer = null, hits = 0, miss = 0, started = null, wake = null;

  sheet(`<div class="session" id="ses">
    <h2>${tr ? tr.icon : '🎓'} ${esc(title)}</h2>
    ${s ? `<details><summary>What to do</summary><p>${esc(s.do)}</p><p class="muted small">Aim: ${esc(s.goal)}</p>${videoButton(tr.id)}</details>` : ''}
    <div class="ses-time"><b id="ses-t">${sesClock(secs)}</b><button class="pill" id="ses-go">Start timer</button></div>
    <button class="clicker" id="ses-click" aria-label="Click: he got it"><span>${sound() ? 'Click' : 'Yes!'}</span><small>tap the moment he gets it</small></button>
    <div class="ses-count"><span><b id="ses-h">0</b> got it</span><button class="ghost" id="ses-miss">✗ Not yet</button><span><b id="ses-m">0</b> not yet</span></div>
    <div class="h-row"><button class="link" id="ses-undo">Undo last</button><label class="muted small ses-snd"><input type="checkbox" id="ses-snd" ${sound() ? 'checked' : ''}> Clicker sound</label></div>
    <p class="muted small">Click, then treat, every time. 3 to 5 reps, then a little break or play. Stop while he still wants more.</p>
    <div class="btns"><button class="ghost" id="ses-cancel">Cancel</button><span class="grow"></span><button class="primary" id="ses-end">Finish session</button></div>
  </div>`, root => {
    const el = id => $('#' + id, root), log = [];
    const tick = () => {
      if (!root.isConnected) return stop();
      left = Math.max(0, secs - Math.round((Date.now() - started) / 1000));
      el('ses-t').textContent = sesClock(left);
      if (left === 0) { stop(); el('ses-t').textContent = 'Time’s up'; el('ses-go').textContent = 'Keep going'; chime(); toast('⏱️ Time’s up. End on an easy win!'); }
    };
    const stop = () => { clearInterval(timer); timer = null; running = false; try { wake && wake.release(); } catch {} wake = null; };
    const draw = () => { el('ses-h').textContent = hits; el('ses-m').textContent = miss; };
    el('ses-go').onclick = async () => {
      if (running) { stop(); el('ses-go').textContent = 'Resume'; return; }
      if (left === 0) left = 60;
      started = Date.now() - (secs - left) * 1000; running = true;
      el('ses-go').textContent = 'Pause'; timer = setInterval(tick, 250);
      try { wake = await navigator.wakeLock?.request('screen'); } catch {}
    };
    el('ses-click').onclick = () => {
      if (sound()) clickSound();
      hits++; log.push('h'); draw();
      const b = el('ses-click'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      if (!running && hits + miss === 1 && left === secs) el('ses-go').click();
    };
    el('ses-miss').onclick = () => { miss++; log.push('m'); draw(); };
    el('ses-undo').onclick = () => { const x = log.pop(); if (x === 'h') hits--; if (x === 'm') miss--; draw(); };
    el('ses-snd').onchange = e => { Store.setPref('oscar.clicker', e.target.checked ? 'on' : 'off'); el('ses-click').querySelector('span').textContent = e.target.checked ? 'Click' : 'Yes!'; };
    el('ses-cancel').onclick = () => { stop(); closeSheet(); };
    el('ses-end').onclick = () => {
      stop();
      const used = started ? Math.min(secs, Math.round((Date.now() - started) / 1000)) : 0;
      finishSession({ tr, s, id: tr ? d.id : null, skill, title, hits, miss, secs: used });
    };
  });
};
const sesClock = n => `${Math.floor(n / 60)}:${pad(n % 60)}`;

function finishSession(x) {
  const sug = suggestRating(x.hits, x.miss);
  const wasPassed = x.id ? stepPassed(x.id) : false;
  sheet(`<h2>🎉 Session done</h2>
    <p class="muted">${esc(x.title)}${x.hits + x.miss ? ` · ${x.hits} of ${x.hits + x.miss} reps right` : ''}${x.secs ? ` · ${sesClock(x.secs)}` : ''}</p>
    <h4>How did it go?</h4>
    <div class="chips" id="fs-rate">${[1, 2, 3, 4, 5].map(k => `<button class="chip ${k === sug ? 'on' : ''}" data-r="${k}">${k}${k === 1 ? ' · not yet' : k === 3 ? ' · sometimes' : k === 5 ? ' · nailed it' : ''}</button>`).join('')}</div>
    ${sug ? '<p class="muted small">Suggested from his reps. Change it if it felt different.</p>' : ''}
    <div class="fld" style="margin-top:10px"><input id="fs-note" placeholder="Note (optional): what helped, distractions"></div>
    <div class="btns"><button class="ghost" id="fs-skip">Don’t save</button><span class="grow"></span><button class="primary" id="fs-save" ${sug ? '' : 'disabled'}>Save session</button></div>`, root => {
    let rating = sug;
    root.querySelectorAll('#fs-rate .chip').forEach(b => b.onclick = () => {
      rating = Number(b.dataset.r); root.querySelectorAll('#fs-rate .chip').forEach(c => c.classList.toggle('on', c === b)); $('#fs-save', root).disabled = false;
    });
    $('#fs-skip', root).onclick = closeSheet;
    $('#fs-save', root).onclick = async () => {
      const note = $('#fs-note', root).value.trim();
      await Store.put({ kind: 'train', skill: x.skill, rating, note: x.s ? `${x.tr.title}: ${x.s.t}${note ? ' · ' + note : ''}` : note,
        ...(x.id ? { step: x.id } : {}), reps: x.hits + x.miss, hits: x.hits, secs: x.secs });
      closeSheet();
      if (x.id && !wasPassed && stepPassed(x.id)) toast(`⭐ Step passed! ${nextToast(x.tr)}`);
      else if (x.id && rating <= 2) toast('Saved. Next time, make it a bit easier and end on a win.');
      else toast('✓ Session saved');
    };
  });
}
