import { DISHES, TUNING } from '../config.js';

// Everything that makes a run easier or harder, in one object. A campaign Day gives fixed
// values (levels.js); Endless derives them from its level number with the original formulas.
// CustomerManager / FoodGrid / Conveyor never read the level directly, only these rules.

export function rulesFromDay(day) {
  return {
    seats: day.seats,
    dishes: day.dishes,
    pool: day.pool || null,                 // customer ids allowed to visit, or null for everyone
    patience: day.patience,
    belt: day.belt,
    twoDish: day.twoDish ?? 0,
    spawnScale: day.spawnScale ?? 1,
    missingBias: day.missingBias ?? 0.7,    // chance a refill brings a wanted dish nobody can reach
    needBias: day.needBias ?? TUNING.needBias,
    wasteLaps: day.wasteLaps ?? TUNING.wasteLaps,
    freeWastes: day.freeWastes ?? 0,        // first N wasted dishes cost nothing (teaching)
    wasteMood: day.wasteMood ?? TUNING.mood.waste, // mood lost per wasted dish (stops belt spamming)
    angryMood: TUNING.mood.angry,
    noFail: !!day.noFail,
    guide: !!day.guide,                     // ghost hand points at a wanted dish until the first throw
    // twists
    teaTime: !!day.teaTime,                 // 5-combo earns Iroh's Tea Time (freeze patience, slow belt)
    vip: day.vip ? { ...TUNING.vip, ...(day.vip === true ? {} : day.vip) } : null,
    quirks: !!day.quirks,                   // Zuko impatient + double speed bonus, Mai's hidden patience bar
    spill: day.spill || [],                 // dishes that waste after 1 lap instead of 2
    rush: day.rush ? { ...TUNING.rush, ...(day.rush === true ? {} : day.rush) } : null,
    opponent: day.opponent || null,         // who sits at Iroh's Pai Sho table today
    gentle: false,
  };
}

/** Gentle mode (offered after 2 fails on a day): more forgiving in the places that actually bind. */
export function applyGentle(r) {
  const g = TUNING.gentle;
  return {
    ...r,
    patience: r.patience * g.patienceMul,
    missingBias: 1,
    needBias: Math.min(1, r.needBias + g.needBonus),
    wasteLaps: r.wasteLaps + g.extraLaps,
    spill: [],
    angryMood: r.angryMood * g.angryMoodMul,
    wasteMood: r.wasteMood * g.wasteMoodMul,
    gentle: true,
  };
}

export function endlessRules(level) {
  const lv = level - 1;
  return {
    seats: Math.min(4, TUNING.startSeats + lv),
    dishes: DISHES.slice(0, Math.min(DISHES.length, TUNING.startDishes + lv)).map((d) => d.id),
    pool: null,
    patience: Math.max(TUNING.patienceMin, TUNING.patienceBase - TUNING.patiencePerLevel * lv),
    belt: Math.min(TUNING.beltSpeedMax, TUNING.beltSpeed + TUNING.beltSpeedPerLevel * lv),
    twoDish: level < 2 ? 0 : Math.min(0.5, 0.14 * lv),
    spawnScale: Math.max(0.45, 1 - 0.1 * lv),
    missingBias: 0.7,
    needBias: TUNING.needBias,
    wasteLaps: TUNING.wasteLaps,
    freeWastes: 0,
    wasteMood: TUNING.mood.waste,
    angryMood: TUNING.mood.angry,
    noFail: false,
    guide: false,
    teaTime: false, vip: null, quirks: false, spill: [], rush: null, opponent: null, gentle: false,
  };
}
