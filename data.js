/* Fixed reference lists. Everything Oscar-specific lives in the Store. */

/* One-tap log buttons on the Today screen. `potty` feeds the countdown;
   `trigger` is how many minutes after this event a puppy usually needs out. */
const LOG_TYPES = [
  { k: 'pee',      icon: '💧', label: 'Pee',      potty: true },
  { k: 'poop',     icon: '💩', label: 'Poop',     potty: true },
  { k: 'accident', icon: '⚠️', label: 'Accident', potty: true },
  { k: 'meal',     icon: '🍖', label: 'Meal',     trigger: 20 },
  { k: 'water',    icon: '🥣', label: 'Water',    trigger: 20 },
  { k: 'sleep',    icon: '😴', label: 'Nap' },
  { k: 'wake',     icon: '☀️', label: 'Awake',    trigger: 5 },
  { k: 'play',     icon: '🎾', label: 'Play',     trigger: 15 },
  { k: 'walk',     icon: '🦮', label: 'Walk' },
  { k: 'note',     icon: '📝', label: 'Note' },
];
const LOG = Object.fromEntries(LOG_TYPES.map(t => [t.k, t]));
LOG.med = { k: 'med', icon: '💊', label: 'Meds' };

const ACCIDENT_SPOTS = ['Living room', 'Kitchen', 'Bedroom', 'Rug', 'Crate', 'Hallway', 'Car'];

/* Health categories for the schedule. */
const HEALTH_CATS = {
  vaccine: { icon: '💉', label: 'Vaccine' },
  deworm:  { icon: '🪱', label: 'Deworming' },
  flea:    { icon: '🦟', label: 'Flea & tick' },
  heart:   { icon: '❤️', label: 'Heartworm' },
  med:     { icon: '💊', label: 'Medication' },
  checkup: { icon: '🩺', label: 'Vet check' },
  groom:   { icon: '✂️', label: 'Grooming / nails' },
  other:   { icon: '📌', label: 'Other' },
};

/* A typical first-year schedule, in weeks of age. It is a starting point to
   edit, not advice — the vet decides the real one (the UI says so). */
const TYPICAL_SCHEDULE = [
  { cat: 'vaccine', name: 'DHPP #1',                  wk: 8 },
  { cat: 'deworm',  name: 'Deworming',                wk: 8 },
  { cat: 'flea',    name: 'Flea & tick prevention',   wk: 8, every: 1, unit: 'months' },
  { cat: 'deworm',  name: 'Deworming',                wk: 10 },
  { cat: 'vaccine', name: 'DHPP #2',                  wk: 12 },
  { cat: 'vaccine', name: 'Leptospirosis #1',         wk: 12 },
  { cat: 'vaccine', name: 'Bordetella (kennel cough)', wk: 12 },
  { cat: 'deworm',  name: 'Deworming',                wk: 12 },
  { cat: 'vaccine', name: 'DHPP #3',                  wk: 16 },
  { cat: 'vaccine', name: 'Leptospirosis #2',         wk: 16 },
  { cat: 'vaccine', name: 'Rabies',                   wk: 16 },
  { cat: 'deworm',  name: 'Deworming',                wk: 16 },
  { cat: 'deworm',  name: 'Deworming',                wk: 20 },
  { cat: 'deworm',  name: 'Deworming',                wk: 24 },
  { cat: 'checkup', name: 'Spay / neuter consult',    wk: 26 },
  { cat: 'vaccine', name: 'DHPP + Rabies boosters',   wk: 68 },
];

/* Socialization: the window for easy, positive first exposures closes around
   14–16 weeks, so this list is time-boxed on screen. */
const SOCIAL = {
  'People': ['Men', 'Women', 'Children', 'Toddlers', 'Beards', 'Hats & hoods', 'Sunglasses', 'Uniforms', 'Wheelchair / cane', 'Stroller', 'Visitors at the door', 'Crowds'],
  'Animals': ['Calm adult dog', 'Other puppy', 'Cat', 'Birds', 'Horses / livestock'],
  'Handling': ['Paws touched', 'Nail trim', 'Ears checked', 'Teeth / mouth', 'Brushing', 'Bath', 'Collar grab', 'Harness on', 'Picked up'],
  'Surfaces': ['Grass', 'Gravel', 'Wet ground', 'Tile / slippery floor', 'Stairs', 'Metal grate', 'Sand', 'Snow'],
  'Sounds': ['Vacuum', 'Doorbell', 'Traffic', 'Thunder (recording)', 'Fireworks (recording)', 'Hair dryer', 'Dropped pans', 'Kids shouting'],
  'Places & things': ['Car ride', 'Vet (happy visit)', 'Pet store', 'Park', 'Café patio', 'Elevator', 'Bikes', 'Skateboards', 'Umbrella', 'Garbage truck'],
  'Life skills': ['Crate nap', 'Alone 5 min', 'Alone 30 min', 'Settling on a mat', 'Car crate'],
};

const SKILLS = ['Name', 'Sit', 'Down', 'Stay', 'Come (recall)', 'Leave it', 'Drop it', 'Touch', 'Wait at door', 'Loose leash', 'Crate', 'Settle', 'Off', 'Go potty on cue'];

const CONTACT_ROLES = ['Vet clinic', 'Emergency vet', 'Breeder', 'Groomer', 'Trainer', 'Walker / sitter', 'Daycare', 'Poison helpline', 'Other'];

/* Real North American lines that take calls from Canada. Both charge a fee. */
const POISON_LINES = [
  { role: 'Poison helpline', name: 'ASPCA Animal Poison Control', phone: '(888) 426-4435', notes: '24/7. Consultation fee applies.' },
  { role: 'Poison helpline', name: 'Pet Poison Helpline',         phone: '(855) 764-7661', notes: '24/7. Consultation fee applies.' },
];

const MILESTONES = ['Gotcha day', 'First night home', 'First vet visit', 'First walk', 'First bath', 'First night with no accidents', 'Learned sit', 'Lost first tooth', 'All puppy shots done', 'First snow', 'First swim', 'First birthday'];

/* Getting ready for day one. Written for an older puppy coming home (Oscar is
   ~6 months) — Jindo-leaning items are the fence, the bolting and the harness. */
const PREP_LIST = {
  'Home & safety': ['Check the fence for gaps, low spots and dig spots', 'Plan the doors so he can’t bolt out', 'Puppy-proof cords, shoes, bins and toxic plants', 'Crate set up in a quiet spot', 'Bed and blankets'],
  'Gear': ['Collar with ID tag (your phone number)', 'Snug, escape-proof harness', '6 ft leash + long line for recall practice', 'Food and water bowls', 'Same food he eats now (switch slowly)', 'Training treats', 'Chew toys and a Kong / lick mat', 'Poop bags', 'Enzyme cleaner for accidents', 'Undercoat brush and nail clippers'],
  'Paperwork': ['Vaccine & deworming records from the rescue/breeder', 'Microchip registered to your name', 'City dog licence', 'Pet insurance started', 'First vet visit booked (first week)'],
  'Plan': ['Pick his potty spot outside', 'Agree on house rules and command words', 'Decide who feeds and walks when', 'Keep the first few days quiet'],
};

const SHOP_SUGGEST = ['Food', 'Treats', 'Poop bags', 'Chews', 'Enzyme cleaner', 'Flea & tick meds', 'Shampoo', 'Toys', 'Pee pads'];

const EXPENSE_CATS = ['Food', 'Treats & chews', 'Vet', 'Meds', 'Insurance', 'Toys & gear', 'Grooming', 'Training', 'Walking & boarding', 'Licence & admin', 'Other'];

/* Extra training goals and notes shown when the breed mentions Jindo. General
   breed tendencies, not rules — every dog is its own dog. */
const BREED_NOTES = {
  jindo: {
    skills: ['Recall on a long line', 'Calm around strangers', 'Door wait (no bolting)', 'Leave it (small animals)', 'Handling & nail trims'],
    tips: [
      'Jindos tend to be loyal, independent and reserved with strangers. Let him approach new people on his own terms and reward calm.',
      'Many are very clean and house-train quickly — but a new home resets things, so stick to the schedule for the first weeks.',
      'Strong prey drive and a reputation as escape artists: secure fences, leash in unfenced areas, and build recall on a long line before any off-leash time.',
      'Short, varied training sessions work best — they get bored with repetition.',
      'Double coat: expect heavy seasonal shedding; regular brushing and early nail-trim practice pay off.',
    ],
  },
};
