# Iroh's Tea House: Sokka's Kitchen Rush

This is a Three.js + Vite game prototype set in Iroh's tea house in Ba Sing Se. Sokka is the chef. You send dishes from a food grid onto a rotating belt to feed Avatar characters waiting at the four corners of the table.

All characters, dishes and props are chibi-style GLBs. They're built procedurally in Blender from the hand-made Aang asset. Every texture, sound and UI element is generated in code, so there are no external or paid assets.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

To make a production build in `dist/`, run `npm run build`. To serve that build, run `npm run preview`.

## Campaign: Days at the Tea House
- **Campaign:** "Open the Tea House" leads to the day list: 12 days in three Rings of Ba Sing Se (Lower 1–4, Middle 5–8, Upper 9–12). See `docs/LEVEL_DESIGN.md` for the design and balance notes.
- **Each day:**
  - It starts with an intro card: the new thing, the goal and the star rules.
  - The HUD shows the goal and the shift clock, e.g. "🍜 4/13 · 1:23".
  - You win the moment the plate goal is reached. You lose if the clock runs out first or mood hits 0.
- **Stars:** ★ goal met · ★★ no angry guests · ★★★ the day's challenge.
- **Retry** is instant. After 2 fails in a row on a day, the results card offers **🍃 Gentle mode**: patience ×1.25, the grid always restocks wanted dishes, +1 waste lap, no spill dishes and half mood penalties. Stars earned that way get a leaf on the day tile until the day is cleared normally.
- **Twists** (each is introduced on its own day, then they stack):
  - **Iroh's Tea Time** (Day 7): serve 5 guests in a row to brew a charge, then tap the teapot (or press `T`). For 6 s patience freezes and the belt runs at half speed.
  - **VIP guests** (Day 8): every 4th guest wears a crown. They have less patience but pay triple, and an angry VIP costs 1.5× mood.
  - **Spill dishes** (Day 9): cactus juice carries a 💧1 badge and is wasted after a single lap.
  - **Character quirks** (Day 10): Zuko 😤 has 25% less patience but pays double for speed. Mai 😑 is 40% more patient, but her bar shows only "?" until it drops below 30%.
  - **Rush hour** (Day 11): a gong warns 3 s ahead, then for 15 s the belt is 35% faster and guests arrive sooner. A Dai Li agent takes the seat across from Iroh.
  - **The Jasmine Dragon** (Day 12): everything at once.
- **Endless Rush** (the original endless game) unlocks after Day 4, or immediately if you already have an Endless best score.
- **Saving:** progress, stars, best scores and mute are saved in `localStorage` (`irohTeaHouse.save`).
- **Adding or tuning a day:** edit `src/levels.js`. The values flow through `src/game/Rules.js`.

### Developer tools
- `?level=3` opens Day 3's intro directly.
- `?unlockAll` unlocks every day and Endless.
- `?dev` loads the balance bots. In the console, run `__dev.balance()` to simulate every day with the perfect, fair and random bots and print a table.

## How to play

- **Customers** stand at the four table corners. A thought bubble shows each customer's order and a patience bar.
- **Food grid:** click a dish in the front row (the one with the gold frame), or press `1`–`4`. Sokka throws the dish onto the belt where it's level with that column. The column then slides up one cell, and a new dish appears at the back.
- **Belt:** it runs clockwise (front → left → back → right). The first customer who wants a passing dish takes it, eats it, cheers and leaves. A new customer then walks in.
- **Full belt:** dishes never overlap. If there is no free spot on the belt, nothing can be sent: the dish stays in the grid, the landing marker turns red and a "belt is full" message appears. The belt holds about 23 dishes.
- **Waste:** a dish that goes around the belt twice with no taker is thrown away. You lose 20 points and your combo, and the mood drops a little. A dish on its last lap pulses to warn you.
- **Score:** each order gives base points plus a speed bonus, multiplied by your combo. The combo multiplier goes up to x3.
- **Mood:** happy customers raise the tea house mood. Customers who run out of patience lower it a lot, and wasted dishes lower it a little. When mood reaches 0, the game ends and you can restart.
- **Levels:** every 6 customers served opens another corner (up to 4) and adds a dish to the menu (up to 6). Each level also speeds up the belt, shortens patience and makes two-dish orders more common.
- **Keys:** `P` / `Esc` pause, `M` mute, `T` Tea Time, `Enter` start / restart.

The dishes are Ba Sing Se dumplings, Water Tribe noodles, Fire Nation skewers, jasmine tea cake, roast duck and cactus juice. Aang only orders vegetarian dishes.

## Project layout

```
index.html            HUD + screens (title, pause, game over)
src/main.js           entry point
src/config.js         dishes, characters, layout and ALL balance numbers
src/core/
  Assets.js           GLB loading + rendering the dish icons used in bubbles
  Audio.js            WebAudio synthesised SFX + generative pentatonic music (placeholders)
  Particles.js        pooled sprite particles (sparkles, hearts, puffs, steam)
  utils.js            math helpers + a tiny tween runner
src/world/
  Stage.js            renderer, lights, auto-fitting isometric-style camera
  TeaHouse.js         room set dressing (walls, moon windows, banner, Iroh's counter, lanterns…)
  Conveyor.js         rounded-rectangle belt path, moving slats, items on the belt, corner hand-off
  textures.js         canvas-painted textures (planks, rug, Pai Sho board, banner, sign)
src/levels.js         campaign days (goals, star challenges, per-day rules)
src/game/
  Game.js             state machine (title/days/intro/playing/results), input, scoring, win/fail, chef + host
  Rules.js            per-run difficulty values from a campaign day or the Endless level formulas
  Character.js        rigged GLB wrapper: animation cross-fades, one-shots, waypoint walking
  CustomerManager.js  seats, spawning, orders, patience, eat → cheer → leave / angry flow
  FoodGrid.js         4×3 grid, front-row picking, column shifting, highlights
  PaiSho.js           Iroh's Pai Sho nook: low table, two players, tiles that follow their hands in sync with the seated clips
src/core/Save.js      versioned localStorage save (days, stars, best scores, mute)
src/dev/bot.js        balance bots + simulation report (loaded only with ?dev)
src/ui/HUD.js         DOM HUD + world-anchored bubbles, popups and emotes
blender/build_assets.py   procedural asset builder (see below)
public/models/*.glb       generated assets used by the game
```

## Assets (Blender)

`public/models/` already has the generated GLBs, so you don't need Blender to play. If you want to rebuild the assets, run:

```bash
blender -b Aang_GameReady/Aang_GameReady.blend --python blender/build_assets.py -- public/models
```

(`npm run assets` runs the same command if `blender` is on your PATH. On Windows the usual path is `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"`.) Add a second folder path after `public/models` to also render preview PNGs of every asset. To rebuild only some files, add `only=iroh` (or `only=dishes,props`, etc.) as a last argument, and the other files are left untouched.

What the script does:

- **Characters:** reuses the body parts of the hand-made Aang model (head, eyes, hands, clothes, boots) so every character has the same chibi proportions. It recolours those parts and adds per-character hair and accessories:
  - Sokka gets his wolf-tail, a chef apron and a boomerang.
  - Katara gets her braid and hair loopies.
  - Zuko gets shaggy hair and his scar.
  - Toph gets her headband, pom-poms and bare feet.
  - Iroh gets his beard, topknot and belly.
  - Four Earth Kingdom locals who play Pai Sho against Iroh: an old master with spectacles and a white moustache, a Ba Sing Se lady with a bun and gold hairpin, a Dai Li agent in his flared hat, and a merchant with a big moustache.
  - Suki gets Kyoshi face paint and a gold headdress.
  - Mai gets her buns and bangs.
- **Rig and animations:** each character is rigidly skinned to a copy of Aang's 13-bone rig. The script generates `Idle`, `Walk`, `Eat`, `Cheer`, `Throw` and `Sad` clips. Aang keeps his hand-authored Idle and Walk. Iroh also gets a seated `PaiSho` loop (9 s: three moves, one with a beard stroke), and the Earth Kingdom opponents get a `PaiShoOpp` variant of it with the head counter-rotated so their faces stay visible while they lean over the board.
- **Dishes and props:** builds the 6 dishes (`dishes.glb`) and 6 props (`props.glb`): lantern, plant, teapot, cup, barrel and cushion.
- **Safety:** the source `.blend` is opened read-only and is never saved.

## Tuning

Balance values are all in `src/config.js` under `TUNING`: belt speed, patience, eat time, spawn delays, mood deltas, score values and combo step. Layout values are under `LAYOUT`.

## Notes / next steps

- The sounds are synthesised placeholders. To use real samples, replace the cases in `Sfx.play(name)`.
- Characters use rigid skinning, one bone per part, which suits the toy-like chibi style. Smooth weights would allow softer bends.
- Still planned: a different room look per Ring of Ba Sing Se.

*Fan-made prototype inspired by Avatar: The Last Airbender. Not affiliated with Nickelodeon.*
