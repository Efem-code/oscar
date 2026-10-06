/* Training guides and brain games for the Train tab.

   Reward-based methods throughout: Jindos are sensitive and independent, and
   harsh corrections tend to cost trust rather than teach. Each guide links to
   a skill in the progress tracker (`skill`) so a practice session can be
   logged straight from it. */

const TRAINING_BASICS = [
  'Pick one marker word — “Yes!” — and say it the instant he does the right thing, then treat. The marker is what tells him which moment earned it.',
  'Keep sessions short: 3–5 minutes, two or three times a day. Stop while he’s still keen.',
  'Use treats he’ll work for — small, soft and smelly (chicken, cheese, salmon bits). Part of a meal works for easy stuff; save the best for recall and hard places.',
  'Jindos bore quickly with drilling. Do 3–5 reps, then switch to something else or play.',
  'Make it easy first, then add one difficulty at a time: distance, duration or distractions — never all three at once.',
  'End on a win. If he’s struggling, step back to an easier version and finish there.',
  'No yelling, leash pops or forcing. With a Jindo it tends to make him avoid you rather than listen.',
];

const GUIDES = [
  {
    id: 'recall', icon: '📣', title: 'Recall (come)', skill: 'Come (recall)', when: 'The most important one — start today',
    why: 'Jindos have strong prey drive and an independent streak, so a recall has to be practised until it’s a habit, and always made worth coming back for.',
    steps: [
      'Choose a fresh cue word if “come” has been used to call him for things he dislikes (bath, nails). “Here!” or a whistle works.',
      'Indoors, 1–2 metres away: say his name + cue once, back away a step, “Yes!” when he reaches you, and give a jackpot (3–5 treats one after another).',
      'When he arrives, gently touch his collar before treating — so being caught is part of the reward, not the end of fun.',
      'Ping-pong recall: two of you in different rooms take turns calling him. Great game, lots of reps.',
      'Move outside on a 10–15 m long line in a quiet spot. Call when he’s mildly distracted, not mid-chase.',
      'Run away from him as you call — Jindos love a chase. Never chase him; it teaches the opposite game.',
      'Pick an “emergency” word used only for big moments, always paid with the best food he gets all week.',
    ],
    jindo: 'Many Jindos never become reliable off-leash around wildlife. Use the long line in unfenced areas, and let him off only in secure fenced spaces until you’ve proven it many times over.',
    mistakes: ['Calling him to end the fun (leaving the park) every time — call, reward, let him go back to playing.', 'Repeating the cue — say it once; if he doesn’t come, make it easier next time.', 'Telling him off when he finally arrives.'],
  },
  {
    id: 'leash', icon: '🦮', title: 'Loose-leash walking', skill: 'Loose leash', when: 'Every walk, a few minutes at a time',
    why: 'Pulling gets rewarded every time it works. The rule to teach: a slack leash makes the walk move.',
    steps: [
      'Start indoors or in the yard. Reward him often for being next to your leg — every few steps at first.',
      'If the leash goes tight, stop and stand still. The moment it slackens, “Yes!” and move on.',
      'If he keeps pulling, turn and walk the other way; reward when he catches up beside you.',
      'Use “Go sniff!” as a reward: a loose leash earns a sniff break. Sniffing is a Jindo’s favourite currency.',
      'Practise in boring places first, then busier ones.',
    ],
    jindo: 'A snug harness with a front clip helps a strong puller. Make sure it’s escape-proof — Jindos are known for backing out of collars.',
    mistakes: ['Letting him pull sometimes — it makes pulling a lottery he’ll keep playing.', 'Walks that are only training — mix in “sniffari” walks where he leads at a slow pace.'],
  },
  {
    id: 'leave', icon: '🚫', title: 'Leave it', skill: 'Leave it (small animals)', when: 'Builds self-control for squirrels and dropped food',
    why: 'Teaches him that ignoring something gets him something better from you.',
    steps: [
      'Hold a treat in a closed fist. Let him sniff and lick. The second he backs off, “Yes!” and treat from your OTHER hand.',
      'Repeat until he backs off right away, then add “Leave it” just before you present the fist.',
      'Progress: open palm (close it if he goes for it), then treat on the floor under your foot, then uncovered.',
      'Walk past a treat on the floor on leash; reward for looking at you.',
      'Later: practise at a distance from things he really wants — a toy on a string, then real squirrels far away.',
    ],
    jindo: 'With a high prey drive, use real distance at first. If he’s staring and frozen, he’s too close to learn — move away and try again.',
    mistakes: ['Giving him the item he left — the reward always comes from you.'],
  },
  {
    id: 'settle', icon: '🧘', title: 'Settle on a mat', skill: 'Settle', when: 'Great before meals or with visitors over',
    why: 'Teaches an “off switch” — a place where calm is rewarded. Useful at cafés, the vet and when people visit.',
    steps: [
      'Put a mat or towel down. Reward any paw on it, then all four, then lying down.',
      'Once he lies on it, drop treats calmly between his paws every few seconds while he stays relaxed.',
      'Slowly stretch the time between treats. Release with “Free!” before he gets up on his own.',
      'Add a Kong or lick mat on the mat for longer settles.',
      'Take the mat on outings so it becomes a portable calm spot.',
    ],
    jindo: 'Jindos often settle well once they understand it — this is a good one for him to feel secure in new places.',
    mistakes: ['Only using the mat when you’re busy — practise when you can reward calm.'],
  },
  {
    id: 'strangers', icon: '🙋', title: 'Calm around strangers', skill: 'Calm around strangers', when: 'Ongoing — tiny doses',
    why: 'Jindos are often reserved with people they don’t know. The goal isn’t that he loves everyone — it’s that strangers mean nothing scary.',
    steps: [
      '“Look at that”: when he notices a person at a comfortable distance, “Yes!” and treat. People appearing = treats.',
      'Ask visitors to ignore him at first — no eye contact, no reaching. Let them toss treats past him.',
      'Let him choose to approach and sniff; a calm greeting is the reward, not petting.',
      'If someone wants to pet him: one short chin scratch, then they stop and see if he asks for more.',
      'Watch for “I’m uncomfortable” signs — lip licking, turning away, yawning, stiff body — and add distance.',
    ],
    jindo: 'Never force him to be handled by strangers. Forced greetings tend to make reserved dogs more wary, not less.',
    mistakes: ['Holding him still for people to pet.', 'Going too close too fast because he seemed fine last time.'],
  },
  {
    id: 'door', icon: '🚪', title: 'Wait at the door (no bolting)', skill: 'Door wait (no bolting)', when: 'At every door, every day',
    why: 'An escape-artist breed plus an open door is a risk. Waiting until released should become automatic.',
    steps: [
      'With him on leash, reach for the handle. If he stays put, “Yes!” and treat.',
      'Open the door an inch. If he moves toward it, close it gently. If he waits, treat.',
      'Gradually open wider and longer, then add your cue: “Wait”, and a release: “OK, let’s go”.',
      'Practise at the front door, car door and crate door.',
      'Add family members and visitors once he’s solid.',
    ],
    jindo: 'Keep a leash on near open front doors until this is rock solid — it only takes one escape.',
    mistakes: ['Only practising when you’re in a rush.'],
  },
  {
    id: 'handling', icon: '✂️', title: 'Handling & nail trims', skill: 'Handling & nail trims', when: 'A minute a day',
    why: 'Many Jindos dislike being handled. Make vet checks, brushing and nails something he agrees to.',
    steps: [
      'Touch a paw for one second → treat. Ears → treat. Mouth → treat. Stop before he pulls away.',
      'Teach a “chin rest” on your hand: while his chin is down, you can touch; if he lifts it, you stop. He gets a say.',
      'Show the clippers → treat. Touch them to a nail → treat. Clip ONE nail → jackpot. That can be the whole session.',
      'Brush in short strokes with treats in between; his double coat sheds heavily in spring and fall.',
    ],
    jindo: 'Going slower than you think you need to is usually faster in the end. A scratch board (nail file board) is an easy alternative to clippers.',
    mistakes: ['Holding him down to “just get it done” — it makes the next time harder.'],
  },
  {
    id: 'drop', icon: '🧸', title: 'Drop it (trade)', skill: 'Drop it', when: 'During play',
    why: 'Swapping instead of chasing means he won’t learn to run off with things.',
    steps: [
      'While playing tug, go still and hold a treat at his nose. When he lets go, “Drop” → “Yes!” → treat → restart the game.',
      'Restarting the game is the big reward — dropping doesn’t end the fun.',
      'Practise with low-value items before anything he really treasures.',
    ],
    jindo: 'If he grabs something he shouldn’t have, trade calmly rather than chasing — Jindos can learn to guard things that get taken away.',
    mistakes: ['Chasing him to get things back.'],
  },
  {
    id: 'focus', icon: '👀', title: 'Name & focus (“watch me”)', skill: 'Name', when: 'Foundation for everything else',
    why: 'If he looks at you when you say his name, every other skill gets easier.',
    steps: [
      'Say his name once in a happy voice; the instant he looks at you, “Yes!” and treat.',
      'Hold a treat at your eyes, then move it away to the side — reward when he looks at your face, not the food.',
      'Practise in new places with low distraction before busy ones.',
    ],
    jindo: 'Pay generously for eye contact in exciting places — it’s the habit that helps most with prey drive later.',
    mistakes: ['Repeating his name over and over until it means nothing.'],
  },
];

/* Brain games: short, cheap, and most can use part of a meal. */
const GAMES = [
  { id: 'scatter', icon: '🌿', title: 'Scatter feeding', time: '5–10 min', level: 1, need: 'Part of his meal, grass or a towel',
    how: 'Throw a handful of kibble into grass or onto a towel and let him sniff it out. Sniffing tires dogs out more than you’d think.' },
  { id: 'towel', icon: '🌀', title: 'Towel roll', time: '2–5 min', level: 1, need: 'An old towel, treats',
    how: 'Lay a towel flat, sprinkle treats, roll it up loosely. He unrolls it with his nose and paws. Fold it over too for a harder version.' },
  { id: 'muffin', icon: '🧁', title: 'Muffin tin puzzle', time: '5 min', level: 1, need: 'Muffin tin, tennis balls, treats',
    how: 'Put treats in a few cups of a muffin tin and cover every cup with a ball. He has to move the balls to find the treats.' },
  { id: 'boxes', icon: '📦', title: 'Box shred', time: '5–10 min', level: 1, need: 'Cardboard boxes, toilet-roll tubes',
    how: 'Hide treats inside tubes with folded ends, put them in a box, close it loosely. Supervise and pick up any pieces he tries to swallow.' },
  { id: 'shell', icon: '🥤', title: 'Shell game', time: '5 min', level: 2, need: '3 plastic cups, smelly treat',
    how: 'Let him watch you put a treat under one cup. Shuffle slowly. Reward when he nudges the right one. Start with one cup.' },
  { id: 'findit', icon: '👃', title: '“Find it” scent work', time: '5–10 min', level: 2, need: 'Treats',
    how: 'Say “Find it!” and drop a treat at your feet. Then toss it a little away, then hide it behind a chair while he watches, then while he waits in another room. Great rainy-day game.' },
  { id: 'hide', icon: '🙈', title: 'Hide and seek', time: '5–10 min', level: 2, need: 'Two people',
    how: 'One person holds him, the other hides and calls once. Big party when he finds you. Doubles as recall practice.' },
  { id: 'kong', icon: '🧊', title: 'Frozen Kong', time: '20–40 min', level: 1, need: 'Kong or similar, his kibble',
    how: 'Soak kibble in water, pack it into a Kong, freeze overnight. Plain pumpkin or plain yogurt can seal it — only xylitol-free peanut butter, if any.' },
  { id: 'lick', icon: '👅', title: 'Lick mat', time: '10–15 min', level: 1, need: 'Lick mat',
    how: 'Spread plain yogurt, pumpkin or wet food thinly and freeze for longer. Licking is calming — good before a nail trim or when you leave the house.' },
  { id: 'flirt', icon: '🎣', title: 'Flirt pole', time: '5 min', level: 2, need: 'Flirt pole (rope toy on a stick)',
    how: 'Drag the toy in circles on the ground for him to chase, let him catch it often, then “Drop” and restart. An outlet for prey drive with rules. Keep it short — easy on growing joints.' },
  { id: 'trick', icon: '🎩', title: 'Learn a trick', time: '3–5 min', level: 2, need: 'Treats',
    how: 'Spin (lure him in a circle), touch (nose to your palm), paw, bow. New tricks are great brain work and fun to show off.' },
  { id: 'sniffari', icon: '🗺️', title: 'Sniff walk', time: '20–30 min', level: 1, need: 'Long line or long leash',
    how: 'A slow walk where he chooses the route and sniffs as long as he likes. Calming, and very Jindo.' },
  { id: 'obstacles', icon: '🪵', title: 'Mini obstacle course', time: '10 min', level: 2, need: 'Logs, a low step, a cushion',
    how: 'Lure him over low logs, onto a step, through a play tunnel or under a chair. Builds body awareness and confidence on new surfaces.' },
  { id: 'puzzle', icon: '🧩', title: 'Puzzle toy', time: '10 min', level: 2, need: 'Store-bought puzzle (e.g. Nina Ottosson level 1–2, Kong Wobbler)',
    how: 'Start on the easiest level and help him the first few times so he doesn’t give up. Swap toys every few days to keep them new.' },
];

const DAILY_SHAPE = [
  'Morning: potty, sniff walk, then breakfast from a puzzle or scatter.',
  'Two or three 5-minute training sessions spread through the day.',
  'One brain game in the afternoon.',
  'Evening walk with some loose-leash practice, then dinner.',
  'Lots of naps — young dogs need around 14 hours of sleep. A tired-but-cranky puppy usually needs sleep, not more exercise.',
];

/* Behaviour help: the everyday problems, reward-based fixes, and when to get
   a professional. Written for an adolescent (6–18 months) dog who's new to
   the home — that stage and that change both make these more common. */
const BEHAVIOUR = [
  {
    id: 'bark', icon: '🔊', title: 'Barking', when: 'Work out which kind first — the fix depends on why',
    why: 'Most barking is one of four things: alerting (a noise or someone outside), demanding (attention, food, play), boredom, or worry (being left, new things). Jindos tend to be fairly quiet dogs but strong watchdogs, so alert barking is the most common.',
    steps: [
      'Keep a note of when it happens for a few days (a Note in the app works) — the pattern tells you which kind it is.',
      'Alert barking: after the first bark or two, say “Thank you”, walk over calmly, look where he’s looking, then call him away and reward. You’re telling him “I’ve got it”.',
      'Demand barking: don’t answer it — no looking, talking or shushing (that’s attention too). The moment he’s quiet for 2–3 seconds, give him what he wanted. Expect it to get worse briefly before it stops.',
      'Teach “Quiet”: when he stops barking on his own, say “Quiet”, then treat. Build the gap slowly before the treat.',
      'Boredom: more sniffing and brain games (see Brain games) — a tired brain barks less. Before you leave, give a frozen Kong.',
      'Window barking (the most common kind): block the view at his height — frosted film on the lower glass, blinds half-closed in the day, move the couch he uses as a lookout. Give him a bed and a chew away from the windows instead.',
      '“Look at that”: with the blinds open and you there, the moment he NOTICES someone outside (before barking), “Yes!” and treat. People outside start to mean treats, not trouble.',
      'Being left: practise short absences (Alone 5 min → 30 min in Socialization) and come back calmly. Barking only when alone that’s getting worse is worth a trainer’s help.',
    ],
    jindo: 'Jindos are often wary of strangers and very alert to their territory. Reward calm looking at things outside rather than scolding the bark — shouting tends to sound like joining in.',
    mistakes: ['Yelling “quiet!” — to a dog it often sounds like barking back.', 'Giving in after a long round of demand barking — it teaches him to bark longer.', 'Bark collars (spray/shock/sound) — they suppress the bark without fixing the reason and can add fear.'],
    vet: 'Sudden new barking (especially at night), or barking with pacing, whining and not settling, can be stress or discomfort — mention it to the vet.',
  },
  {
    id: 'bite', icon: '🦷', title: 'Biting & mouthing', when: 'Very normal at his age — teach soft mouth and better outlets',
    why: 'At 6–12 months many dogs go through an adolescent “mouthy” phase — play-biting, grabbing sleeves, chewing things. It usually means overexcited, overtired, or under-stimulated, not aggressive.',
    steps: [
      'Hands are never toys. Keep a tug toy or plush within reach and offer it the moment his mouth comes toward you — reward when he takes it.',
      'If teeth touch skin during play: say “Oops”, go still, then calmly stand up and step away (or behind a gate) for 20–30 seconds. Play stops when teeth land on people.',
      'Watch for overtired: a puppy who gets bitey in the evening often needs a nap, not more play. Crate or pen with a chew and let him sleep — young dogs need around 14+ hours.',
      'Give legal chewing every day: bully sticks, frozen carrots, rubber chews, lick mats. Rotate them so they stay interesting.',
      'Swap, don’t chase: if he grabs a shoe, offer a treat or toy and praise the drop (see Drop it).',
      'Calm practice: reward him for gentle licks or resting his chin on your hand — teach what you DO want.',
      'Kids and visitors: keep play low-key and supervised; ask visitors to ignore him until he’s calm.',
    ],
    jindo: 'Jindos can be sensitive to rough handling. Pinning, holding the mouth shut or “alpha” corrections usually make biting worse and damage trust.',
    mistakes: ['Pulling your hand away fast — it makes it a chase game.', 'Rough-housing with hands, then getting cross when he bites.', 'Physical punishment of any kind.'],
    vet: 'Get a trainer or vet behaviourist (look for certified, reward-based) if he growls or snaps when you touch his food, toys or bed, when being handled, or if bites are hard, without warning, or getting worse — that’s different from play mouthing.',
  },
  {
    id: 'eat', icon: '🍖', title: 'Not finishing his food', when: 'Common in a new home — usually fixable with routine',
    why: 'New-home stress often dulls appetite for the first week or two. Adolescent dogs also slow down as growth slows, and many get the message that food will always be there. Some just get more on the bag’s chart than they need.',
    steps: [
      'Check the amount: compare his food plan with the bag’s chart for his CURRENT weight and age (and ask the vet). If he’s at a healthy weight and leaving some, he may simply be getting more than he needs.',
      'Set meal times: put the bowl down for 15–20 minutes, then pick it up — even if he hasn’t finished — and offer nothing until the next meal. Most dogs learn to eat within a few days. (Water stays down all day.)',
      'Keep it boring and consistent: same food, same place, quiet spot away from foot traffic. Constant switching or adding toppers teaches him to hold out for something better.',
      'Go easy on treats: training treats count — use pieces of his kibble for easy reps, or reduce the meal a little on heavy training days.',
      'Exercise before meals: a walk or sniff game 20–30 minutes before eating often helps appetite.',
      'Make it a game: some dogs eat better from a puzzle, snuffle mat or scatter in the grass (see Brain games).',
      'Log it: when you tap Meal, tap how much he ate. The Grow tab and 9 pm summary show the pattern over a week.',
    ],
    jindo: 'Jindos are often described as “self-regulating” eaters who won’t overeat — leaving some isn’t unusual for the breed as long as he’s keeping a healthy weight and energy.',
    mistakes: ['Free-feeding (bowl down all day) — you can’t tell how much he’s eating.', 'Hand-feeding or adding tasty extras every time he refuses.', 'Switching foods suddenly — it can upset his stomach; change over 7–10 days.'],
    vet: 'Call the vet if he skips food for more than a day, or if poor appetite comes with vomiting, diarrhoea, low energy, weight loss, or straining to eat.',
  },
  {
    id: 'night', icon: '🌙', title: 'Scared or jumpy at night', when: 'Common in the first weeks — and during an adolescent fear period',
    why: 'A new home has unfamiliar night sounds, shadows and dark windows that act like mirrors. Many dogs also go through a second “fear period” somewhere between 6 and 14 months, when ordinary things feel scary for a few weeks.',
    steps: [
      'Close blinds at dusk — dark windows show reflections and movement he can’t make sense of.',
      'Use soft lamps instead of full darkness in the evening, and a white-noise machine or fan to mask outside sounds.',
      'Give him a den: part-cover his crate or bed with a blanket, and keep it near you at night for now.',
      'Same wind-down every night: last walk and potty, a calm chew or lick mat, then lights down.',
      'Comfort is fine — calm reassurance doesn’t reward fear. Stay relaxed yourself.',
      'Make evenings good: a short “find it” treat game after dinner.',
      'Never force him toward something that scares him; let him watch from a distance and approach on his own.',
      'Note what sets him off (a sound, a room, a time) with a 📝 Note — patterns make it fixable.',
    ],
    jindo: 'Jindos are watchful and sensitive to change. Predictable routines and a safe spot of his own tend to settle them faster than lots of new experiences at once.',
    mistakes: ['Forcing him to “face” the scary thing.', 'Leaving him alone in a dark room far from you while he’s still settling in.', 'Getting frustrated — he picks up on tension.'],
    vet: 'See the vet if it hasn’t eased after 2–3 weeks, is getting worse, or comes with trembling, panting, hiding, not settling for long, or bumping into things in dim light — night-time jumpiness can sometimes be a vision or discomfort problem.',
  }
];

/* The Oscar brand, for @kpuposcar — the plan the nightly reels follow. */
const BRAND = {
  handle: '@kpuposcar',
  bio: 'Oscar 🐾 Korean Jindo · daily diary of a stubborn, loyal, very fluffy boy · BC 🇨🇦',
  pillars: [
    ['📓 Oscar’s Diary', 'The nightly reel — day-by-day life. The series people follow for.'],
    ['🌱 Growing up', 'The weekly portrait in the same spot. “Week 40 vs week 52” is the most shareable format there is.'],
    ['🎓 Training wins', 'First recall, first sit-stay at a café. Short, celebratory, “we did it”.'],
    ['🐕 Jindo facts', 'Quirks of the breed (escape artist, cat-like grooming, loyal to one person). Viewers learn something → they share.'],
    ['😂 Oscar being Oscar', 'Zoomies, stubborn moments, funny sleeping positions. Pure personality.'],
  ],
  rhythm: [
    'Post 3–4 reels a week rather than every day — the best Diary days, not every day.',
    'Best times to try: 7–9 pm on weekdays, late morning on weekends. Check your Insights after a few weeks and follow your own numbers.',
    'Always add a trending sound in Instagram (keep Oscar’s own sound low underneath).',
    'Reply to every comment in the first hour — it’s the strongest early signal for reach.',
    'Use 3–5 hashtags that fit the post, not 30 — mix one big (#puppiesofinstagram) with niche (#koreanjindo, #jindosofinstagram).',
    'Collaborate: tag the trainer, the vet clinic, the shops you visit — they often reshare.',
  ],
  look: 'Terracotta + cream, Futura bold titles, warm colour, soft crossfades, “DAY n” badge, the paw end card. Same every time — that’s what makes it a brand.',
};

/* Two-week loose-leash plan. One focus a day, 5–10 minutes of practice plus
   the walks you'd do anyway. Ticking a day logs a 'Loose leash' session. */
const LEASH_PLAN = [
  { title: 'Gear + the rule', place: 'Home', do: 'Fit a front-clip harness (snug: two fingers under the straps). Clip the leash to the chest ring. Indoors: one step, if he’s beside you → “Yes!” + treat. 20 reps.', goal: 'He follows you around the room for treats.' },
  { title: 'Treats at the hip', place: 'Home', do: 'Hold treats at your hip on his side. Walk 2–3 steps, “Yes!” + treat while he’s beside you. Add turns and stops.', goal: '5 steps beside you without pulling.' },
  { title: 'Tight leash = stop', place: 'Hallway or yard', do: 'Walk slowly. The moment the leash goes tight, freeze. When it slackens even a little, “Yes!”, treat, carry on.', goal: 'He starts easing back on his own when you stop.' },
  { title: 'Turn and go', place: 'Yard or driveway', do: 'If he pulls ahead, say “this way” cheerfully and walk the other direction. Treat when he catches up beside you.', goal: 'He keeps an eye on where you’re going.' },
  { title: 'First quiet street', place: 'Quiet street', do: 'Short walk (10 min). Same rule: tight = stop, loose = walk. Treat often — every few steps at first.', goal: 'More loose leash than tight on the way back.' },
  { title: 'Sniff as a reward', place: 'Quiet street', do: 'After 10–20 steps of loose leash, say “Go sniff!” and let him explore for 10 seconds. Then carry on.', goal: 'He waits for “Go sniff” instead of dragging you to smells.' },
  { title: 'Check-in game', place: 'Anywhere', do: 'Every time he looks up at you on his own, “Yes!” + treat. Don’t ask — catch it.', goal: '5+ check-ins on a 10-minute walk.' },
  { title: 'Rest day', place: 'Home', do: 'Easy sniff walk on a long line, no training. Brain game at home instead.', goal: 'A relaxed, happy dog.' },
  { title: 'Fewer treats', place: 'Quiet street', do: 'Treat every 5–10 steps instead of every few. Keep stopping when it’s tight.', goal: 'Same loose leash with half the treats.' },
  { title: 'Mild distractions', place: 'Street with some traffic', do: 'Pass a person or parked bike at a distance he can cope with. Treat for looking at it calmly, then for looking back at you.', goal: 'He passes without lunging.' },
  { title: 'Squirrels & dogs from afar', place: 'Park edge', do: 'Find a spot far from other dogs / wildlife. “Look at that” game: he looks → “Yes!” → treat. Move closer only if he stays calm.', goal: 'He can watch, then turn back to you.' },
  { title: 'Longer walk', place: 'Usual route', do: '20 minutes, same rule throughout. Mix training stretches with “Go sniff” breaks.', goal: 'Mostly loose leash for the whole walk.' },
  { title: 'Rest day', place: 'Home', do: 'Long line sniff walk somewhere quiet. Practise “Wait” at the door before you go out.', goal: 'Calm at the door.' },
  { title: 'Show-off walk', place: 'Busier place', do: 'Café strip, trailhead or park. Treat generously; leave if it’s too much. Film a clip for Oscar’s Diary!', goal: 'A loose-leash walk somewhere new. 🎉' },
];
