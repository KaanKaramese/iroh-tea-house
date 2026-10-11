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

## How to play

- **Customers** stand at the four table corners. A thought bubble shows each customer's order and a patience bar.
- **Food grid:** click a dish in the front row (the one with the gold frame), or press `1`–`4`. Sokka throws the dish onto the belt where it's level with that column. The column then slides up one cell, and a new dish appears at the back.
- **Belt:** it runs clockwise (front → left → back → right). The first customer who wants a passing dish takes it, eats it, cheers and leaves. A new customer then walks in.
- **Waste:** a dish that goes around the belt twice with no taker is thrown away. You lose 20 points and your combo, and the mood drops a little. A dish on its last lap pulses to warn you.
- **Score:** each order gives base points plus a speed bonus, multiplied by your combo. The combo multiplier goes up to x3.
- **Mood:** happy customers raise the tea house mood. Customers who run out of patience lower it a lot, and wasted dishes lower it a little. When mood reaches 0, the game ends and you can restart.
- **Levels:** every 6 customers served opens another corner (up to 4) and adds a dish to the menu (up to 6). Each level also speeds up the belt, shortens patience and makes two-dish orders more common.
- **Keys:** `P` / `Esc` pause, `M` mute, `Enter` start / restart.

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
src/game/
  Game.js             state machine, input, scoring/combo/mood, difficulty, chef + host logic
  Character.js        rigged GLB wrapper: animation cross-fades, one-shots, waypoint walking
  CustomerManager.js  seats, spawning, orders, patience, eat → cheer → leave / angry flow
  FoodGrid.js         4×3 grid, front-row picking, column shifting, highlights
src/ui/HUD.js         DOM HUD + world-anchored bubbles, popups and emotes
blender/build_assets.py   procedural asset builder (see below)
public/models/*.glb       generated assets used by the game
```

## Assets (Blender)

`public/models/` already has the generated GLBs, so you don't need Blender to play. If you want to rebuild the assets, run:

```bash
blender -b Aang_GameReady/Aang_GameReady.blend --python blender/build_assets.py -- public/models
```

(`npm run assets` runs the same command if `blender` is on your PATH. On Windows the usual path is `"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"`.) Add a second folder path after `public/models` to also render preview PNGs of every asset.

What the script does:

- **Characters:** reuses the body parts of the hand-made Aang model (head, eyes, hands, clothes, boots) so every character has the same chibi proportions. It recolours those parts and adds per-character hair and accessories:
  - Sokka gets his wolf-tail, a chef apron and a boomerang.
  - Katara gets her braid and hair loopies.
  - Zuko gets shaggy hair and his scar.
  - Toph gets her headband, pom-poms and bare feet.
  - Iroh gets his beard, topknot and belly.
  - Suki gets Kyoshi face paint and a gold headdress.
  - Mai gets her buns and bangs.
- **Rig and animations:** each character is rigidly skinned to a copy of Aang's 13-bone rig. The script generates `Idle`, `Walk`, `Eat`, `Cheer`, `Throw` and `Sad` clips. Aang keeps his hand-authored Idle and Walk.
- **Dishes and props:** builds the 6 dishes (`dishes.glb`) and 6 props (`props.glb`): lantern, plant, teapot, cup, barrel and cushion.
- **Safety:** the source `.blend` is opened read-only and is never saved.

## Tuning

Balance values are all in `src/config.js` under `TUNING`: belt speed, patience, eat time, spawn delays, mood deltas, score values and combo step. Layout values are under `LAYOUT`.

## Notes / next steps

- The sounds are synthesised placeholders. To use real samples, replace the cases in `Sfx.play(name)`.
- Characters use rigid skinning, one bone per part, which suits the toy-like chibi style. Smooth weights would allow softer bends.
- Possible extensions: a day timer with a star rating, special VIP orders, and a "tea time" power-up for Iroh.

*Fan-made prototype inspired by Avatar: The Last Airbender. Not affiliated with Nickelodeon.*
