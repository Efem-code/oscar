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
