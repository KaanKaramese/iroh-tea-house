// Balance bots (loaded only with ?dev). Each returns a step(dt) function for Game.simulate().
//   perfect : sees every order the moment it exists (even guests still walking in), reacts instantly
//   fair    : sees only orders on screen, reacts after 0.6 s, a human-ish pace
//   random  : taps a random column every 0.8 s
import { DAYS } from '../levels.js';

export function makeBot(kind, game) {
  let wait = 0;
  const seenAt = new Map();
  return (dt) => {
    if (game.state !== 'playing') return;
    wait -= dt;
    if (wait > 0) return;
    const cols = game.grid.cols;
    if (kind === 'random') {
      game.select(Math.floor(Math.random() * cols));
      wait = 0.8;
      return;
    }
    // Tea Time: spend the charge when a visible guest is running low
    if (game.teaCharges > 0 && game.teaLeft <= 0) {
      const low = game.customers.customers.some((c) => c.state === 'waiting'
        && (!c.hiddenBar || c.patience / c.maxPatience < c.hiddenBar) && c.patience / c.maxPatience < 0.35);
      if (low) game.useTeaTime();
    }
    // dishes still needed = ordered dishes minus those already on the belt or in the air
    const orders = [];
    for (const c of game.customers.customers) {
      const visible = c.state === 'waiting' || c.state === 'eating';
      if (kind === 'perfect' ? (visible || c.state === 'arriving') : visible) {
        if (!seenAt.has(c)) seenAt.set(c, game.time);
        if (kind === 'fair' && game.time - seenAt.get(c) < 0.6) continue;
        for (const o of c.order) if (!o.done) orders.push(o.id);
      }
    }
    for (const id of [...game.conveyor.items.map((i) => i.id), ...game.pending.map((p) => p.id)]) {
      const k = orders.indexOf(id);
      if (k >= 0) orders.splice(k, 1);
    }
    if (!orders.length) { wait = 0.1; return; }
    const need = new Set(orders);
    for (let c = 0; c < cols; c++) {
      if (need.has(game.grid.topId(c))) { game.select(c); wait = kind === 'fair' ? 0.45 : 0.27; return; }
    }
    // dig: clear the front of the column whose needed dish is shallowest
    let best = null;
    for (let c = 0; c < cols; c++) {
      for (let r = 1; r < game.grid.rows; r++) {
        if (need.has(game.grid.cells[c][r].id) && (!best || r < best.r)) best = { c, r };
      }
    }
    if (best) { game.select(best.c); wait = kind === 'fair' ? 0.6 : 0.3; return; }
    wait = 0.15;
  };
}

/** Run every day `seeds` times per bot and print a table (window.__dev.balance()). */
export function balance(game, { seeds = 8, bots = ['perfect', 'fair', 'random'], days = null } = {}) {
  const rows = [];
  DAYS.forEach((d, day) => {
    if (days && !days.includes(day + 1)) return;
    for (const kind of bots) {
      let wins = 0, stars = 0, plates = 0, time = 0, angry = 0, wasted = 0;
      for (let s = 1; s <= seeds; s++) {
        const r = game.simulate({ day, seed: s * 7919 + day, bot: makeBot(kind, game) });
        if (r.won) wins++;
        stars += r.stars ? r.stars.filter(Boolean).length : 0;
        plates += r.plates || 0;
        time += r.time || 0;
        angry += r.angry || 0;
        wasted += r.wasted || 0;
      }
      rows.push({
        day: `${day + 1} ${d.name}`, bot: kind, winRate: `${Math.round((wins / seeds) * 100)}%`,
        avgStars: +(stars / seeds).toFixed(2), avgPlates: +(plates / seeds).toFixed(1), goal: d.goal.plates,
        avgTime: +(time / seeds).toFixed(0), limit: d.goal.time || '—',
        avgAngry: +(angry / seeds).toFixed(1), avgWasted: +(wasted / seeds).toFixed(1),
      });
    }
  });
  console.table(rows);
  return rows;
}
