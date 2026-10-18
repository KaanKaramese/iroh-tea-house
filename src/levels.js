// The campaign: short "Days" at the tea house (see docs/LEVEL_DESIGN.md).
// A Day is won the moment `goal.plates` dishes have been served, and lost if the shift clock
// (`goal.time` seconds; 0 = no clock) runs out first or the tea house mood hits 0.
// Stars: ★ goal met · ★★ no angry customers · ★★★ the day's challenge.

export const RINGS = {
  lower: 'Lower Ring',
  middle: 'Middle Ring',
  upper: 'Upper Ring',
};

export const DAYS = [
  {
    id: 'first-cup', ring: 'lower', name: 'First Cup',
    icon: '👆', teach: 'Tap a dish in the front row to send it down the belt.',
    seats: 1, dishes: ['dumplings', 'noodles', 'teacake'], pool: ['aang', 'katara'],
    patience: 40, belt: 2.2, twoDish: 0, missingBias: 0.95, needBias: 0.7,
    wasteLaps: Infinity, noFail: true, guide: true,
    goal: { plates: 5, time: 0 }, challenge: { type: 'combo', n: 4 },
  },
  {
    id: 'word-spreads', ring: 'lower', name: 'Word Spreads',
    icon: '🔄', teach: 'The belt runs clockwise. A dish nobody takes in 2 laps is wasted.',
    newGuest: 'toph',
    seats: 2, dishes: ['dumplings', 'noodles', 'teacake', 'skewers'], pool: ['aang', 'katara', 'toph'],
    patience: 36, belt: 2.3, twoDish: 0, missingBias: 0.9, needBias: 0.6, freeWastes: 1,
    goal: { plates: 6, time: 80 }, challenge: { type: 'noWaste' },
  },
  {
    id: 'third-seat', ring: 'lower', name: 'A Third Seat',
    icon: '👀', teach: 'A third corner opens. The guest who will grab your dish flashes.',
    newGuest: 'zuko',
    seats: 3, dishes: ['dumplings', 'noodles', 'teacake', 'skewers'], pool: ['aang', 'katara', 'toph', 'zuko'],
    patience: 34, belt: 2.3, twoDish: 0.1, missingBias: 0.85, needBias: 0.55, wasteMood: -8,
    goal: { plates: 13, time: 95 }, challenge: { type: 'combo', n: 5 },
  },
  {
    id: 'two-bowls', ring: 'lower', name: 'Two Bowls, Please',
    icon: '🍜', teach: 'Some guests order two dishes. Every plate counts toward the goal.',
    newGuest: 'suki', unlocksEndless: true,
    seats: 3, dishes: ['dumplings', 'noodles', 'teacake', 'skewers'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki'],
    patience: 34, belt: 2.3, twoDish: 0.2, missingBias: 0.8, needBias: 0.5, wasteMood: -8,
    goal: { plates: 14, time: 105 }, challenge: { type: 'noWaste' },
  },
  {
    id: 'roast-duck', ring: 'middle', name: 'Roast Duck',
    icon: '🦆', teach: 'Roast duck joins the menu. The rails glow red when the belt is full.',
    seats: 3, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki'],
    patience: 31, belt: 2.45, twoDish: 0.2, missingBias: 0.75, needBias: 0.45, wasteMood: -8,
    goal: { plates: 16, time: 115 }, challenge: { type: 'combo', n: 6 },
  },
  {
    id: 'full-house', ring: 'middle', name: 'Full House',
    icon: '🏮', teach: 'All four corners are open. Keep every guest happy!',
    newGuest: 'mai',
    seats: 4, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki', 'mai'],
    patience: 29, belt: 2.6, twoDish: 0.25, missingBias: 0.7, needBias: 0.4, wasteMood: -8,
    goal: { plates: 28, time: 120 }, challenge: { type: 'time', left: 25 },
  },
  {
    id: 'tea-time', ring: 'middle', name: "Iroh's Tea Time",
    icon: '🫖', teach: 'Serve 5 guests in a row to brew Tea Time. Tap the teapot: patience freezes and the belt slows.',
    seats: 4, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki', 'mai'],
    patience: 30, belt: 2.5, twoDish: 0.25, missingBias: 0.7, needBias: 0.45, wasteMood: -8,
    teaTime: true,
    goal: { plates: 26, time: 110 }, challenge: { type: 'combo', n: 8 },
  },
  {
    id: 'honoured-guest', ring: 'middle', name: 'Honoured Guest',
    icon: '👑', teach: 'Every 4th guest is a VIP: less patient, but worth triple points.',
    seats: 4, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki', 'mai'],
    patience: 27, belt: 2.7, twoDish: 0.3, missingBias: 0.65, needBias: 0.35, wasteMood: -8,
    teaTime: true, vip: true,
    goal: { plates: 29, time: 120 }, challenge: { type: 'vipAll' },
  },
  {
    id: 'quenchiest', ring: 'upper', name: "It's the Quenchiest!",
    icon: '🌵', teach: 'Cactus juice spills after just 1 lap (💧1). Send it only when someone wants it.',
    seats: 4, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck', 'cactusjuice'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki', 'mai'],
    patience: 26, belt: 2.75, twoDish: 0.3, missingBias: 0.6, needBias: 0.3, wasteMood: -8,
    teaTime: true, vip: true, spill: ['cactusjuice'],
    goal: { plates: 31, time: 125 }, challenge: { type: 'combo', n: 8 },
  },
  {
    id: 'temperaments', ring: 'upper', name: 'Royal Temperaments',
    icon: '😤', teach: 'Zuko is impatient but pays double for speed. Mai hides her patience until it runs low.',
    seats: 4, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck', 'cactusjuice'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki', 'mai'],
    patience: 27, belt: 2.7, twoDish: 0.3, missingBias: 0.6, needBias: 0.35, wasteMood: -8,
    teaTime: true, vip: true, spill: ['cactusjuice'], quirks: true,
    goal: { plates: 29, time: 125 }, challenge: { type: 'time', left: 20 },
  },
  {
    id: 'dai-li', ring: 'upper', name: 'Dai Li Inspection',
    icon: '🔔', teach: 'When the gong sounds, rush hour begins: a faster belt and more guests for 15 s.',
    seats: 4, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck', 'cactusjuice'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki', 'mai'], opponent: 'ek_agent',
    patience: 22, belt: 2.8, twoDish: 0.4, missingBias: 0.5, needBias: 0.3, wasteMood: -8,
    teaTime: true, vip: true, spill: ['cactusjuice'], quirks: true, rush: true,
    goal: { plates: 40, time: 140 }, challenge: { type: 'combo', n: 10 },
  },
  {
    id: 'jasmine-dragon', ring: 'upper', name: 'The Jasmine Dragon',
    icon: '🐉', teach: 'Opening night of the Jasmine Dragon. Everything you have learned, all at once!',
    seats: 4, dishes: ['dumplings', 'noodles', 'teacake', 'skewers', 'duck', 'cactusjuice'], pool: ['aang', 'katara', 'toph', 'zuko', 'suki', 'mai'],
    patience: 20, belt: 3.0, twoDish: 0.45, missingBias: 0.45, needBias: 0.3, wasteMood: -8,
    teaTime: true, vip: true, spill: ['cactusjuice'], quirks: true, rush: true,
    goal: { plates: 43, time: 145 }, challenge: { type: 'combo', n: 12 },
  },
];

export const ENDLESS_UNLOCK_DAY = 'two-bowls';

export function challengeText(ch) {
  if (!ch) return '';
  if (ch.type === 'noWaste') return 'Waste no dishes';
  if (ch.type === 'combo') return `Reach a ${ch.n}-guest combo`;
  if (ch.type === 'time') return `Finish with ${ch.left}s to spare`;
  if (ch.type === 'vipAll') return 'Keep every VIP happy';
  return '';
}

export const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
