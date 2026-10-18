// Versioned save data in localStorage. Every access is guarded: storage can be missing,
// full or blocked (private mode), and the game must keep working without it.

const KEY = 'irohTeaHouse.save';
const LEGACY_BEST = 'irohTeaHouseBest';

function fresh() {
  return { v: 1, days: {}, endlessBest: 0, muted: false };
}

export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { s = null; }
  if (!s || typeof s !== 'object') {
    s = fresh();
    // migrate the best score saved by versions before the campaign
    try { s.endlessBest = Number(localStorage.getItem(LEGACY_BEST)) || 0; } catch { /* ignore */ }
  }
  s.days = s.days && typeof s.days === 'object' ? s.days : {};
  s.endlessBest = Number(s.endlessBest) || 0;
  s.muted = !!s.muted;
  return s;
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Keep the best result per day: stars only ever go up, as does the best score. */
export function recordDay(save, id, { stars, score, gentle = false }) {
  const prev = save.days[id] || { stars: [false, false, false], best: 0 };
  save.days[id] = {
    stars: prev.stars.map((had, i) => had || !!stars[i]),
    best: Math.max(prev.best || 0, score || 0),
    // the leaf stays only while every clear of this day was in Gentle mode
    gentle: (prev.stars[0] ? !!prev.gentle : true) && !!gentle,
  };
  writeSave(save);
  return save.days[id];
}

export const starCount = (rec) => (rec ? rec.stars.filter(Boolean).length : 0);
