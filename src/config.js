// Central tuning + content definitions. Tweak numbers here to rebalance the game.

export const DISHES = [
  { id: 'dumplings', name: 'Ba Sing Se Dumplings', node: 'dish_dumplings' },
  { id: 'noodles', name: 'Water Tribe Noodles', node: 'dish_noodles' },
  { id: 'skewers', name: 'Fire Nation Skewers', node: 'dish_skewers' },
  { id: 'teacake', name: 'Jasmine Tea Cake', node: 'dish_teacake' },
  { id: 'duck', name: 'Roast Duck', node: 'dish_duck' },
  { id: 'cactusjuice', name: 'Cactus Juice', node: 'dish_cactusjuice' },
];
export const DISH_BY_ID = Object.fromEntries(DISHES.map((d) => [d.id, d]));

// Customers: `likes` restricts what they order (Aang is vegetarian!).
export const CUSTOMERS = [
  {
    id: 'aang', name: 'Aang', file: 'aang.glb',
    likes: ['dumplings', 'noodles', 'teacake', 'cactusjuice'],
    hello: ['Anything without meat?', 'Hi everyone!', 'Yip yip… I mean, hungry!'],
    happy: ['That was amazing!', 'Monk-approved!'],
    angry: ['I guess I\'ll go airbending instead…'],
  },
  {
    id: 'katara', name: 'Katara', file: 'katara.glb',
    likes: ['noodles', 'dumplings', 'teacake', 'skewers'],
    hello: ['Smells like home!', 'Sokka, behave.'],
    happy: ['Just like Gran-Gran makes!', 'Delicious!'],
    angry: ['Guess I\'ll cook it myself.'],
  },
  {
    id: 'zuko', name: 'Zuko', file: 'zuko.glb',
    likes: ['skewers', 'duck', 'noodles', 'dumplings'],
    hello: ['I must have… lunch.', 'Uncle said the food is good.'],
    happy: ['…That was honourable food.', 'Not bad. Not bad at all.'],
    angry: ['This is SO unfair!'],
  },
  {
    id: 'toph', name: 'Toph', file: 'toph.glb',
    likes: ['duck', 'skewers', 'dumplings', 'cactusjuice'],
    hello: ['Feed me, Snoozles!', 'I can feel the kitchen shaking.'],
    happy: ['Now THAT\'s a meal.', 'Rock solid!'],
    angry: ['Slow as a badgermole nap.'],
  },
  {
    id: 'suki', name: 'Suki', file: 'suki.glb',
    likes: ['dumplings', 'teacake', 'noodles', 'duck'],
    hello: ['A warrior needs fuel!', 'Kyoshi Island says hi.'],
    happy: ['Perfect form!', 'Fit for a warrior!'],
    angry: ['Too slow, chef.'],
  },
  {
    id: 'mai', name: 'Mai', file: 'mai.glb',
    likes: ['teacake', 'cactusjuice', 'dumplings', 'noodles'],
    hello: ['Whatever. Food.', 'I\'m bored. Feed me.'],
    happy: ['…Fine. It was good.', 'Acceptable.'],
    angry: ['Ugh. Boring.'],
  },
];

export const CHEF = { id: 'sokka', name: 'Sokka', file: 'sokka.glb' };
export const HOST = {
  id: 'iroh', name: 'Iroh', file: 'iroh.glb',
  lines: [
    'A good meal is best shared.',
    'Patience, nephew… I mean, Sokka.',
    'More tea, anyone?',
    'Every dish has its moment.',
    'Even a burnt dumpling is a lesson.',
  ],
};

// Layout of the central belt (world units ≈ metres, characters are ~1 m tall)
export const LAYOUT = {
  beltHalfW: 2.6,      // belt centreline half width (x)
  beltHalfD: 1.5,      // belt centreline half depth (z)
  beltRadius: 0.5,     // rounded corner radius
  beltWidth: 0.6,
  tableTop: 0.36,
  beltTop: 0.45,
  seatOut: 1.15,       // how far customers stand outside the corner arc
  charScale: 1.3,      // chibi characters are scaled up for readability
  gridCols: 4,
  gridRows: 3,
  gridSpacingX: 1.2,
  gridSpacingZ: 0.82,
  gridTopZ: 3.05,
  gridY: 0.34,
  chefZ: 2.45,
  door: [-5.3, -4.1],
};

export const TUNING = {
  beltSpeed: 2.3,          // units / second at level 1
  beltSpeedPerLevel: 0.15,
  beltSpeedMax: 3.4,
  patienceBase: 34,        // seconds for a 1-dish order at level 1
  patiencePerLevel: 2.5,
  patienceMin: 15,
  multiDishPatience: 1.45, // multiplier for 2-dish orders
  eatTime: 1.7,
  cheerTime: 1.5,
  angryTime: 1.6,
  spawnDelay: [1.2, 3.0],
  walkSpeed: 2.0,
  customersPerLevel: 6,
  startSeats: 2,           // active corners at level 1 (grows to 4)
  startDishes: 4,          // dish types unlocked at level 1 (grows to 6)
  needBias: 0.45,          // chance a refilled grid cell is a currently-requested dish
  mood: { start: 100, happy: 7, angry: -24, waste: -5 },
  score: { perDish: 100, speedBonus: 100, waste: -20, comboStep: 0.25, comboMax: 3 },
};
