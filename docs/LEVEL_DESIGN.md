# Level design: "Days at the Tea House"

This plan came out of a four-person design panel (level structure, mechanics and difficulty, player experience, technical architecture). Each panelist wrote a proposal and then critiqued the others. The owner's decisions are marked **[decided]**.

## Format
- **Campaign:** 12 short **Days** in 3 **Rings of Ba Sing Se**: Lower (Days 1–4), Middle (5–8), Upper (9–12).
- **Endless:** today's game, kept as a separate mode with its own best score. **[decided]** It unlocks after clearing Day 4, or immediately for anyone who already has a saved best score.
- **Day rules:**
  - The day is **won the moment the plate goal is reached**.
  - It is **lost when the shift clock runs out first** (75–180 s), or when mood hits 0. **[decided]**
  - The goal counts **plates**, and a 2-dish order counts as 2. The HUD shows it as "🍜 6/13" with a timer ring.
  - Mood resets to 100 every day. Retry is instant, with no intro card on retry.
- **Stars [decided]:**
  - ★ goal met.
  - ★★ no angry customers.
  - ★★★ that day's challenge (e.g. 0 waste, or combo x3; never "0 waste" on spill days).
- **Waste [decided]:** a dish is still wasted after **2 laps** everywhere. The only exception is spill dishes (cactus juice from Day 9), marked 💧1, which waste after 1 lap.
- **Save:** versioned localStorage `{ v, days: { id: { stars, best, gentle } }, endlessBest, muted }`. The old `irohTeaHouseBest` value migrates into `endlessBest`.

## The 12 days
**Status:** all 12 days are built and tuned with the balance bots (see below). Every twist is in: Tea Time, VIP guests, spill dishes, Zuko/Mai quirks, the rush gong and Gentle mode. Once a twist is introduced it stays on for every later day.

**Guest order changed during the build.** A day needs at least one more guest than open corners, otherwise a corner stays empty while the last guest walks out. So guests arrive earlier: Aang and Katara on Day 1, Toph on Day 2, Zuko on Day 3, Suki on Day 4 and Mai on Day 6.

Each day introduces one new thing. It is taught by an icon plus one line on the intro card, with hints in the scene: a ghost hand, belt chevrons, a ⟳2 wobble on a dish's last lap, a red glow when the belt is full, and a flash on the corner that will take the dish. There is no dialogue text over characters.

| Day | Ring | New thing | Corners / dishes | Patience (s) | Belt (u/s) | 2-dish chance | Goal (plates / clock) |
|---|---|---|---|---|---|---|---|
| 1 | Lower | Throw (ghost hand); Aang and Katara only; can't fail | 1 / 3 | 40 | 2.2 | 0 | 5 / no clock |
| 2 | Lower | Belt direction + waste after 2 laps (first waste free); Toph's first visit | 2 / 4 | 36 | 2.3 | 0 | 6 / 80 s |
| 3 | Lower | 3rd corner; the guest who will grab the dish flashes; Zuko's first visit | 3 / 4 | 34 | 2.3 | .10 | 13 / 95 s |
| 4 | Lower | 2-dish orders; Suki's first visit. **Unlocks Endless** | 3 / 4 | 34 | 2.3 | .20 | 14 / 105 s |
| 5 | Middle | Roast duck; red glow when the belt is full | 3 / 5 | 31 | 2.45 | .20 | 16 / 115 s |
| 6 | Middle | 4th corner; Mai's first visit | 4 / 5 | 29 | 2.6 | .25 | 28 / 120 s |
| 7 | Middle | Iroh's Tea Time: 5 in a row brews a charge; tap the teapot (or `T`) to freeze patience and halve the belt for 6 s | 4 / 5 | 30 | 2.5 | .25 | 26 / 110 s |
| 8 | Middle | VIP guest: every 4th guest (crown + gold border, patience ×0.65, score ×3, angry ×1.5 mood) | 4 / 5 | 27 | 2.7 | .30 | 29 / 120 s |
| 9 | Upper | Cactus juice: spill dish, 💧1, wasted after 1 lap | 4 / 6 | 26 | 2.75 | .30 | 31 / 125 s |
| 10 | Upper | Breather: quirks. Zuko 😤 patience ×0.75, speed bonus ×2; Mai 😑 patience ×1.4, bar shows "?" until below 30% | 4 / 6 | 27 | 2.7 | .30 | 29 / 125 s |
| 11 | Upper | Rush-hour gong (first at 25 s, then every 45 s; 3 s warning, then belt ×1.35 and spawns ×0.6 for 15 s); Dai Li agent at the Pai Sho table | 4 / 6 | 22 | 2.8 → 3.8 | .40 | 40 / 140 s |
| 12 | Upper | Jasmine Dragon finale: everything combined | 4 / 6 | 20 | 3.0 → 4.05 | .45 | 43 / 145 s |

★★★ challenges for Days 7–12: combo 8, no angry VIP, combo 8, finish with 20 s left, combo 10, combo 12.

**Changed from the plan:**
- **Junk tiles were dropped.** Day 7's breather slot went to Tea Time instead. Junk tiles would have added a fourth kind of tap with no Avatar flavour, and the grid already makes you dig.
- **Suki and Mai already arrive on Days 4 and 6**, so Day 8 teaches VIPs alone and Day 10 teaches the quirks of guests players already know.
- **The clocks are much shorter** than planned (110–145 s, not 150–180 s). With the longer clocks the fair bot finished with half the time left.

**Each Ring changes:**
- Iroh's Pai Sho opponent: built so far, a random Earth Kingdom local on every run, with the Dai Li agent fixed on Day 11. A fixed opponent per Ring is still open.
- The room's look: textures and materials only, no new geometry.

## Balance (measured)
`?dev` + `__dev.balance()` simulates each day with 3 bots over many seeds:
- **perfect:** sees every order, reacts instantly.
- **fair:** sees on-screen orders only, with a 0.6 s reaction and a human-ish pace.
- **random:** taps a random column every 0.8 s.

The current tuning (12 seeds per day):
- **fair bot:**
  - Days 3–6: wins 100% and uses about 57–65% of the clock.
  - Days 7–12: wins 92–100% and uses about 66–73% of the clock. It spends Tea Time when a visible guest drops below 35% patience.
  - Stars: about 1.75 on average on the finale, about 2.9 on the Day 10 breather.
- **random bot (spamming):** fails every day from Day 3 on.

From Day 3 a wasted dish costs **−8 mood** instead of −5. That stops "fill the belt and hope" from beating the day. Endless keeps −5.

## Fairness and difficulty fixes
These address why the game is too easy today:
- Patience is about 5× the slowest delivery.
- The grid stocks dishes for customers who are still walking in.
- The belt works as a ~25-slot warehouse.
- Digging through the grid is free.

The fixes:
- **Throw cooldown 0.25 s.** One extra tap is buffered and never silently dropped. A short wipe on the front row shows the cooldown.
- **Grid help tapers per day.** The chance that a missing requested dish is refilled goes from .95 to .45, and the need bias from .70 to .30. A **reachability guarantee** makes sure every ordered dish is within that day's dig depth.
- **No double penalty.** A dish thrown for a customer who then leaves angry wastes silently.
- **Every twist is telegraphed** with sound and a visual. Nothing is shown by colour alone: VIP = crown, spill = drip + ⟳1, Mai = "?".
- **Gentle mode** is offered after 2 fails in a row on a day. As built:
  - patience ×1.25;
  - wanted dishes are always restocked, and the need bias gets +0.2;
  - +1 waste lap, and no spill dishes;
  - angry and waste mood penalties are halved.

  The day tile shows a 🍃 leaf until the day is cleared without Gentle mode.
- **Tapping anywhere in a column's lane** picks that column's front dish.

## Screens and UX
- **Day list:** a simple grid of days with stars. A map can come later.
- **Intro card:** at most 2.5 s, tap to skip. It shows the title, the new thing, the goal and the 3 star rules.
- **HUD:** a goal pill with a timer ring, plus a "+1" that flies from a served customer to the pill.
- **Results:** stars pop in one at a time, then "New: …" unlocks, a teaser for the next day, and Next / Retry / Days buttons.
- **Failure card:** one reason plus one tip, with Retry as the main button.
- **Fixes:**
  - a toast queue, so messages stop overwriting each other;
  - 44 px icon buttons;
  - minimum font sizes 11/14 px;
  - `prefers-reduced-motion`;
  - iPhone safe areas (`viewport-fit=cover`);
  - mute remembered between sessions.

## Technical approach
- **Rules seam:** `src/game/Rules.js` holds `rulesFromLevelDef(def)` and `endlessRules(level)` (today's formulas). Game's `unlockedDishes / twoDishChance / patienceFor / spawnDelayScale` read `this.rules`, so CustomerManager stays unchanged.
- **New files:**
  - `src/levels.js`: data, one entry per day.
  - `LevelManager`: decides the next day and sets up each run.
  - `GoalTracker`: counts plates, angry customers and waste, and runs the timer.
  - `Save.js`: versioned localStorage, with try/catch.
- **State machine:** `setState()` covers title → days → intro → playing ⇄ paused → results | failed. `'playing'` keeps meaning "the run is live", because about 10 code paths check it.
- **`ModifierBus` hooks:** `onCustomerSpawn`, `rollDish`, `canThrow`, `onDishThrown`, `onDelivered`, `orderPoints`, `onWaste`, `onAngry`, `moodDelta`, `onTick`, `patienceRate`.
- **Testing:**
  - Seeded random numbers, so a run can be repeated exactly.
  - `game.simulate()` with a fixed time step.
  - Three bots: **perfect**, **fair** (only sees orders that are on screen, 0.6 s reaction) and **random**.
  - Pass rules: the perfect bot gets at least 2★ in 90% or more of seeds, and the fair bot clears Days 1–3.
  - Debug URL params: `?level=`, `?seed=`, `?unlockAll`, `?bot=`.

## Phases (each can ship on its own)
1. **Groundwork (M):** Rules seam, `setState`, Save.js, seeded random numbers, `simulate()` + bots, throw cooldown, debug params. No other behaviour change.
2. **MVP (M):** Days 1–6 as Rules data, shift clock + goal pill, stars, customer pool per day, mood reset, intro/results/fail cards, instant retry, day list, Endless unlocked after Day 4.
3. **Twists (S–M):** ModifierBus, Zuko/Mai quirks, VIP, spill dishes, rush gong, no double penalty, corner flash, full-belt glow, last-lap wobble.
4. **Depth (M):** junk tiles, reachability guarantee + grid-bias taper, Tea Time, a look per Ring, Pai Sho opponent per Ring, Days 7–12, balance report.

**Later or cut:** Toph's earthquake, Team Avatar group orders (would break the seat model), the Sokka hat cosmetic (needs Blender work), and the Pai Sho board as a clock (too small to read on a phone, and tied to the animation's beats).
