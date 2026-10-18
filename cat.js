/* Cats. The public copy asks "Dog or cat?" at setup. For a cat, Species.apply
   swaps these lists in place of the dog ones (litter box instead of potty
   breaks, kitten vaccines, cat training and behaviour help…). The dog versions
   are kept so switching back restores them. Oscar's copy never uses this. */
const CAT = {
  LOG_TYPES: [
    { k: 'litter',   icon: '🪣', label: 'Litter box' },
    { k: 'accident', icon: '⚠️', label: 'Outside box' },
    { k: 'meal',     icon: '🐟', label: 'Meal' },
    { k: 'water',    icon: '🥣', label: 'Water' },
    { k: 'sleep',    icon: '😴', label: 'Sleep' },
    { k: 'wake',     icon: '☀️', label: 'Awake' },
    { k: 'play',     icon: '🧶', label: 'Play' },
    { k: 'clean',    icon: '🧹', label: 'Scooped' },
    { k: 'vomit',    icon: '🤢', label: 'Sick / hairball' },
    { k: 'note',     icon: '📝', label: 'Note' },
  ],

  ACCIDENT_SPOTS: ['Living room', 'Kitchen', 'Bedroom', 'Bed', 'Sofa', 'Rug', 'Bathroom', 'Laundry pile'],

  /* A typical kitten schedule, in weeks of age — a starting point to edit; the vet decides the real one. */
  TYPICAL_SCHEDULE: [
    { cat: 'vaccine', name: 'FVRCP #1',                   wk: 8 },
    { cat: 'deworm',  name: 'Deworming',                  wk: 8 },
    { cat: 'flea',    name: 'Flea prevention',            wk: 8, every: 1, unit: 'months' },
    { cat: 'vaccine', name: 'FeLV #1 (if going outdoors)', wk: 9 },
    { cat: 'vaccine', name: 'FVRCP #2',                   wk: 12 },
    { cat: 'vaccine', name: 'FeLV #2 (if going outdoors)', wk: 12 },
    { cat: 'deworm',  name: 'Deworming',                  wk: 12 },
    { cat: 'vaccine', name: 'FVRCP #3',                   wk: 16 },
    { cat: 'vaccine', name: 'Rabies',                     wk: 16 },
    { cat: 'deworm',  name: 'Deworming',                  wk: 16 },
    { cat: 'checkup', name: 'Spay / neuter',              wk: 22 },
    { cat: 'vaccine', name: 'FVRCP + Rabies boosters',    wk: 68 },
  ],

  /* Kittens' easiest window for new experiences is about 2–7 weeks, usually before they come home — gentle, positive exposures still help a lot. */
  SOCIAL: {
    'People': ['Men', 'Women', 'Children', 'Visitors', 'Being picked up', 'Lap time', 'Hats & glasses'],
    'Animals': ['Calm cat-friendly dog', 'Other cats', 'Birds outside the window'],
    'Handling': ['Paws touched', 'Nail trim', 'Ears checked', 'Teeth / mouth', 'Brushing', 'Being wrapped in a towel', 'Pill or syringe (empty)'],
    'Sounds': ['Vacuum', 'Doorbell', 'Hair dryer', 'Dropped pans', 'Thunder (recording)', 'Kids playing'],
    'Places & things': ['Carrier with the door open', 'Carrier ride in the house', 'Car ride', 'Vet (happy visit)', 'Harness on indoors', 'Balcony or garden on a harness'],
    'Life skills': ['Alone for an afternoon', 'Sleeping in their own bed', 'Scratching the post, not the sofa', 'Calm for nail trims'],
  },

  SKILLS: ['Name', 'Come when called', 'Sit', 'Touch (target)', 'High five', 'Into the carrier', 'Harness on', 'Off the counter', 'Scratching post', 'Nail trims', 'Brushing', 'Tooth brushing'],

  MILESTONES: ['Gotcha day', 'First night home', 'First vet visit', 'Used the litter box', 'First purr on a lap', 'Learned their name', 'All kitten shots done', 'Spayed / neutered', 'First harness adventure', 'First birthday'],

  PREP_LIST: {
    'Home & safety': ['Start in one quiet room with everything they need', 'Remove lilies and other toxic plants (lilies can be deadly to cats)', 'Secure window screens and balcony', 'Hide cords, string, hair ties and elastic bands', 'Close the washer, dryer and toilet lids'],
    'Gear': ['Litter box (one per cat, plus one)', 'Unscented clumping litter', 'Litter scoop and bags', 'Food and water bowls (wide and shallow)', 'Same food they eat now (switch slowly)', 'Tall, sturdy scratching post + cardboard scratchers', 'Cat carrier', 'Bed or cosy hideaway', 'Wand toy and small balls', 'Collar with ID tag (breakaway)', 'Brush and nail clippers'],
    'Paperwork': ['Vaccine & deworming records from the shelter/breeder', 'Microchip registered to your name', 'Pet insurance started', 'First vet visit booked (first week)'],
    'Plan': ['Litter box away from food and water', 'Decide who scoops and when', 'Agree on house rules (counters? beds?)', 'Keep the first days quiet — let them come to you'],
  },

  SHOP_SUGGEST: ['Food', 'Treats', 'Litter', 'Litter bags', 'Cardboard scratchers', 'Toys', 'Flea meds', 'Enzyme cleaner', 'Catnip'],

  EXPENSE_CATS: ['Food', 'Treats', 'Litter', 'Vet', 'Meds', 'Insurance', 'Toys & gear', 'Grooming', 'Sitting & boarding', 'Licence & admin', 'Other'],

  TRAINING_BASICS: [
    'Cats learn with rewards just like dogs do — they just like shorter sessions. 1–3 minutes, once or twice a day.',
    'Pick a marker — a click or a soft “Yes!” — the instant they do the right thing, then treat.',
    'Use tiny, irresistible treats: lickable cat treats, bits of chicken or tuna flakes. Train before meals, when they’re a little hungry.',
    'Let them choose to join in. If they walk away, end the session — try again later.',
    'Never punish, spray water or shout. It teaches them to fear you, not to change the behaviour.',
    'Give them a “yes” instead of a “no”: a scratching post next to the sofa, a cat tree by the counter.',
  ],

  GUIDES: [
    {
      id: 'cat-litter', icon: '🪣', title: 'Litter box habits', skill: '', when: 'From day one',
      why: 'Most cats use a litter box by instinct. Problems almost always come from the box, the litter, the place, or a health issue — rarely from “being naughty”.',
      steps: [
        'One box per cat, plus one, in quiet spots they can reach easily — not next to food, water or a noisy washer.',
        'Big and uncovered is best for most cats. Kittens need a low side to climb in.',
        'Unscented, fine, clumping litter about 5 cm deep. Many cats dislike scented litter and liners.',
        'Scoop at least once a day (log it — the Scooped button) and fully change it every 1–2 weeks.',
        'After meals and naps, gently set a new kitten in the box. Don’t scold accidents — clean with an enzyme cleaner so the smell doesn’t invite a repeat.',
        'Changing litter or moving the box? Do it slowly, with the old setup still there for a week.',
      ],
      mistakes: ['Hiding the box somewhere loud or hard to reach.', 'Scented litter or air fresheners right next to the box.', 'Rubbing their nose in it — it only teaches fear.'],
      vet: 'A cat straining in the box, going often with little coming out, or peeing outside the box suddenly needs a vet — a male cat who can’t pee is an emergency.',
    },
    {
      id: 'cat-scratch', icon: '🪵', title: 'Scratching the right things', skill: 'Scratching post', when: 'Start the first week',
      why: 'Scratching is normal and healthy — it keeps claws in shape, stretches the body and marks territory. The goal is a better place to do it, not stopping it.',
      steps: [
        'Get a post tall enough for a full stretch and heavy enough not to wobble. Many cats like sisal; offer a flat cardboard scratcher too.',
        'Put scratchers where they already scratch, and near where they sleep — they scratch on waking.',
        'Rub catnip or silvervine on it, and play with a wand toy across it so their claws catch.',
        'Praise and treat every time they use it.',
        'Make the sofa less fun for a while: double-sided tape or a throw over the favourite corner.',
        'Trim the tips of the claws every 2–3 weeks.',
      ],
      mistakes: ['A short, wobbly post — they’ll ignore it.', 'Putting the post in a spare room nobody uses.', 'Declawing — it’s an amputation, and banned in many places.'],
    },
    {
      id: 'cat-carrier', icon: '🧳', title: 'Carrier without the fight', skill: 'Into the carrier', when: 'Before the first vet visit',
      why: 'If the carrier only appears before the vet, it means bad news. Make it furniture instead.',
      steps: [
        'Leave the carrier out all the time, door off or tied open, with a soft blanket inside.',
        'Drop treats in it at random times, and sometimes feed meals inside.',
        'When they walk in on their own, close the door for a second, open it, treat. Build up slowly.',
        'Lift it a few centimetres and put it down. Then carry it around a room. Then a short car ride with a treat at the end.',
        'On vet day, spray a cat calming pheromone on the blanket 15 minutes before, and cover the carrier with a towel.',
      ],
      mistakes: ['Chasing them into it — a carrier that’s easy to get into fast still needs to feel safe.', 'Tipping them out at the vet — take the top off instead if you can.'],
    },
    {
      id: 'cat-handling', icon: '✋', title: 'Handling and nail trims', skill: 'Nail trims', when: 'A little every day',
      why: 'Vet checks, brushing, nails and pills are far easier with a cat who’s used to being touched calmly.',
      steps: [
        'When they’re relaxed, touch a paw for one second, then treat. Same for ears, mouth and tail.',
        'Gently press a paw so a claw shows, then treat. Do one claw a day if that’s all they like.',
        'Trim only the clear tip — stay well away from the pink quick.',
        'Brush for a few strokes at a time, paired with treats. Longhaired cats need it daily.',
        'Stop before they get annoyed. Two good seconds beats twenty tense ones.',
      ],
      mistakes: ['Holding them down to “get it over with” — it makes the next time harder.', 'Doing all the nails at once on day one.'],
    },
    {
      id: 'cat-name', icon: '📣', title: 'Name and come when called', skill: 'Come when called', when: 'Easy and very useful',
      why: 'A cat who comes when called is easier to find, to get in at night, and to move away from trouble. Cats learn it well with food.',
      steps: [
        'Say their name in a happy voice, and treat the moment they look at you.',
        'Shake the treat bag or use a sound (a click, a whistle) just before every meal — they’ll start running when they hear it.',
        'Call from a few steps away, then from another room. Always pay well.',
        'Never call them for something they dislike (pills, the carrier). Go and get them instead.',
      ],
      mistakes: ['Using their name to scold.', 'Calling over and over when they don’t come — make it easier next time.'],
    },
    {
      id: 'cat-harness', icon: '🦺', title: 'Harness and safe outdoor time', skill: 'Harness on', when: 'Optional — for curious cats',
      why: 'A harness lets an indoor cat enjoy a balcony or garden safely. Some cats love it; some never will, and that’s fine.',
      steps: [
        'Leave the harness near their food so it smells normal.',
        'Drape it over them for a second, then treat. Then buckle it for a few seconds during a meal.',
        'Expect the “flop” at first — distract with a wand toy and they’ll walk.',
        'Practise indoors for days before going out. Attach the leash and just follow them.',
        'First outings: somewhere quiet and enclosed, a few minutes, then home.',
      ],
      mistakes: ['A collar instead of a harness — cats slip out of collars.', 'Going outside before they’re relaxed in it indoors.'],
    },
    {
      id: 'cat-intro', icon: '🤝', title: 'Meeting other pets', skill: '', when: 'Slowly — over days or weeks',
      why: 'Cats are territorial. A slow introduction is the difference between friends and a lifetime of hissing.',
      steps: [
        'Keep the new cat in their own room at first, with their own litter box, food and bed.',
        'Swap blankets so each animal gets used to the other’s smell.',
        'Feed them on either side of the closed door, moving the bowls closer over days.',
        'Then let them see each other through a baby gate or cracked door, with treats.',
        'Short, supervised meetings next. End them while everyone is calm.',
        'With a dog: keep the dog on a leash and make sure the cat always has a high escape route.',
      ],
      mistakes: ['Putting them together and “letting them sort it out”.', 'Sharing one litter box or food bowl at the start.'],
    },
  ],

  BEHAVIOUR: [
    {
      id: 'cat-outside', icon: '⚠️', title: 'Peeing or pooping outside the box', when: 'See the vet first, then check the box',
      why: 'This is the most common cat problem — and often a sign of a urinary problem, pain or stress, not bad behaviour.',
      steps: [
        'Book a vet check first, especially if it started suddenly.',
        'Log each accident with where it was — the app shows the pattern.',
        'Check the box: is it clean enough, big enough, in a quiet place? Any new litter, a moved box, or another cat blocking it?',
        'Clean accident spots with an enzyme cleaner (not ammonia, which smells like pee).',
        'Put a second box where the accidents happen, then move it slowly back.',
        'Look for stress: new people, a move, a cat outside the window. Add hiding places and play.',
      ],
      mistakes: ['Punishing — it makes them hide to go.', 'Ammonia or bleach cleaners.'],
      vet: 'Straining, crying in the box, blood in the urine, or going often with little coming out — see a vet the same day. A male cat who can’t pee is an emergency.',
    },
    {
      id: 'cat-bite', icon: '🦷', title: 'Biting and pouncing on hands and feet', when: 'Common in kittens and young cats',
      why: 'Usually play: they’re practising hunting, and hands and feet are the moving thing nearby. Needs a better target, not a telling-off.',
      steps: [
        'Never play with your hands or feet — always use a wand toy or a kicker toy.',
        'Two or three 10–15 minute play sessions a day: let them chase, pounce and “catch” the toy, then give a treat or meal.',
        'If they bite, go still and quiet, then calmly move away. Fun stops when teeth touch skin.',
        'Ambushes at the same time each day? Start a play session just before.',
        'Petting bites (they bite after a few strokes): stop sooner, and watch for a twitching tail or flattened ears.',
      ],
      mistakes: ['Rough play with hands when they’re small — it’s cute until they’re grown.', 'Yelling or tapping their nose — it can make them more defensive.'],
      vet: 'Sudden biting or hissing when touched can mean pain — worth a check-up.',
    },
    {
      id: 'cat-night', icon: '🌙', title: 'Night zoomies and meowing at night', when: 'Cats are most active at dawn and dusk',
      why: 'Cats naturally hunt at dawn and dusk. If they sleep all day while you’re out, they’ll be ready to party at 4 am.',
      steps: [
        'Play hard in the evening: a long wand-toy session just before bed.',
        'Feed the last meal right after that play — hunt, eat, groom, sleep is their natural rhythm.',
        'An automatic feeder can serve breakfast at dawn so they stop waking you for it.',
        'Don’t get up for meowing or scratching at the door — even a “shh” is a reward. Reward quiet mornings instead.',
        'Give daytime puzzles and a window perch so they’re not saving all their energy.',
      ],
      mistakes: ['Feeding them when they wake you — they learn it works.'],
      vet: 'An older cat who suddenly starts crying at night may have a health problem (thyroid, blood pressure, sight). Mention it to the vet.',
    },
    {
      id: 'cat-scared', icon: '🫣', title: 'Hiding and scared', when: 'New cats often hide for days',
      why: 'Hiding is how cats cope. Let them, and make coming out worth it.',
      steps: [
        'Give them a safe room with hiding places, and don’t pull them out.',
        'Sit in the room quietly, read or scroll, and toss treats near them — let them come to you.',
        'Slow blink at them: it means “I’m friendly” in cat.',
        'Add high places (a cat tree, cleared shelves). Cats feel safer up high.',
        'A calming pheromone diffuser can help in the first weeks.',
      ],
      mistakes: ['Lots of visitors in the first week.', 'Reaching into the hiding spot to grab them.'],
      vet: 'Not eating for more than a day is serious in cats — call the vet. So is hiding along with lethargy or not using the litter box.',
    },
    {
      id: 'cat-eat', icon: '🍽️', title: 'Picky eating or eating too fast', when: 'Check food habits',
      why: 'Cats prefer several small meals, fresh water and the right bowl. Too fast or too little are both worth fixing.',
      steps: [
        'Several small meals a day suit cats better than one big one. Puzzle feeders slow down fast eaters.',
        'Wide, shallow bowls — many cats dislike their whiskers touching the sides.',
        'Water away from food. A fountain helps cats who don’t drink much.',
        'Change food slowly over 7–10 days, mixing in more of the new food each day.',
        'Log meals and how much they ate — the app shows if it changes.',
      ],
      mistakes: ['Switching foods quickly when they turn their nose up — it can make it worse.'],
      vet: 'A cat that stops eating for 24 hours needs a vet — cats can get liver problems from not eating. Frequent vomiting is worth a check too.',
    },
  ],

  GAMES: [
    { id: 'cat-wand', icon: '🪶', title: 'Wand-toy hunt', time: '10–15 min', level: 1, need: 'A wand toy',
      how: 'Move the toy like prey: hide it behind furniture, let it twitch, then dart away. Let them catch it often, end with a final “catch”, then give a treat or meal. Hunt, catch, eat — very satisfying.' },
    { id: 'cat-puzzle', icon: '🧩', title: 'Treat puzzle', time: '5–10 min', level: 1, need: 'Puzzle feeder or egg carton',
      how: 'Put kibble or treats in a puzzle feeder, a muffin tin with balls on top, or an egg carton. They fish it out with their paws.' },
    { id: 'cat-box', icon: '📦', title: 'Box fort', time: 'All day', level: 1, need: 'Cardboard boxes',
      how: 'Cut holes in a couple of boxes and tape them together. Hide a treat or toy inside. Cats love it.' },
    { id: 'cat-bag', icon: '🛍️', title: 'Paper bag rustle', time: '5 min', level: 1, need: 'A paper bag (handles cut off)',
      how: 'Lay a paper bag on its side and toss a toy or treat inside. Scratch the outside to make it rustle. Never plastic bags or handles.' },
    { id: 'cat-tub', icon: '🛁', title: 'Ping-pong bathtub', time: '5 min', level: 1, need: 'A ping-pong ball, empty bathtub',
      how: 'Drop a ping-pong ball in the empty tub — it bounces around the curved sides and they can chase it without losing it under furniture.' },
    { id: 'cat-forage', icon: '🌿', title: 'Treat hunt', time: '5 min', level: 2, need: 'A few treats',
      how: 'While they watch, hide treats around a room — on a step, under a cup, on a cat tree. Then let them find them. Hide harder ones as they get good at it.' },
    { id: 'cat-target', icon: '🎯', title: 'Touch the target', time: '2 min', level: 2, need: 'A chopstick or pen, treats',
      how: 'Hold a chopstick near their nose. When they sniff it, click or say “Yes!” and treat. Soon they’ll follow it — great for teaching tricks or moving them without lifting them.' },
    { id: 'cat-tv', icon: '🪟', title: 'Cat TV', time: 'Anytime', level: 1, need: 'A window perch, bird feeder',
      how: 'A comfy perch by a window, ideally with a bird feeder outside, is hours of entertainment. Rotate toys weekly so old ones feel new.' },
  ],

  DAILY_SHAPE: [
    'Morning: breakfast, a short play session, scoop the litter box.',
    'Two or three play sessions spread through the day, each ending with a treat or meal.',
    'A puzzle or treat hunt while you’re out.',
    'Evening: the big play session, then dinner, then they groom and sleep.',
    'Lots of naps — kittens sleep up to 18–20 hours a day. That’s normal.',
  ],
};

const Species = (() => {
  const LISTS = ['LOG_TYPES', 'ACCIDENT_SPOTS', 'TYPICAL_SCHEDULE', 'SOCIAL', 'SKILLS', 'MILESTONES', 'PREP_LIST', 'SHOP_SUGGEST', 'EXPENSE_CATS',
    'TRAINING_BASICS', 'GUIDES', 'BEHAVIOUR', 'GAMES', 'DAILY_SHAPE', 'LEASH_PLAN'];
  const ref = { LOG_TYPES, ACCIDENT_SPOTS, TYPICAL_SCHEDULE, SOCIAL, SKILLS, MILESTONES, PREP_LIST, SHOP_SUGGEST, EXPENSE_CATS,
    TRAINING_BASICS, GUIDES, BEHAVIOUR, GAMES, DAILY_SHAPE, LEASH_PLAN };
  const clone = v => Array.isArray(v) ? v.slice() : { ...v };
  const DOG = Object.fromEntries(LISTS.map(k => [k, clone(ref[k])]));
  const DOG_LOG = { ...LOG };
  let now = 'dog';
  /* Replace the contents of each shared list (they're consts, so in place). */
  function fill(target, src) {
    if (Array.isArray(target)) target.splice(0, target.length, ...src);
    else { Object.keys(target).forEach(k => delete target[k]); Object.assign(target, src); }
  }
  function apply(kind) {
    kind = kind === 'cat' ? 'cat' : 'dog';
    if (kind === now) return;
    now = kind;
    for (const k of LISTS) fill(ref[k], kind === 'cat' ? (CAT[k] || (Array.isArray(ref[k]) ? [] : {})) : DOG[k]);
    fill(LOG, kind === 'cat' ? { ...Object.fromEntries(CAT.LOG_TYPES.map(t => [t.k, t])), med: DOG_LOG.med, pee: DOG_LOG.pee, poop: DOG_LOG.poop, walk: DOG_LOG.walk } : DOG_LOG);
  }
  return { apply, now: () => now };
})();
