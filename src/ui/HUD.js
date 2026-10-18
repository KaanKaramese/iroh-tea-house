import * as THREE from 'three';
import { DISH_BY_ID } from '../config.js';

const $ = (id) => document.getElementById(id);

/** DOM HUD + world-anchored overlays (thought bubbles, popups, emotes). */
export class HUD {
  constructor() {
    this.layer = $('world-layer');
    this.anchors = [];
    this.v = new THREE.Vector3();
    this.shownScore = 0;
    this.score = 0;
    this.el = {
      hud: $('hud'), score: $('score'), combo: $('combo'), comboBox: $('combo-box'), mood: $('mood-fill'),
      level: $('level'), levelLabel: $('level-label'), served: $('served'), servedBox: $('served-box'),
      toast: $('toast'), hint: $('hint'),
      tea: $('btn-tea'), rush: $('rush'), teaOverlay: $('tea-overlay'),
      goal: $('goal'), goalText: $('goal-text'), goalTime: $('goal-time'), goalTimeText: $('goal-time-text'), goalRing: $('goal-ring'),
    };
    this.toasts = [];
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }
  showHint(v) { this.el.hint.classList.toggle('hidden', !v); }

  setScore(v, instant = false) {
    this.score = v;
    if (instant) { this.shownScore = v; this.el.score.textContent = v; }
  }
  setCombo(n, mult) {
    this.el.combo.textContent = n > 0 ? `${n} · x${mult.toFixed(2).replace(/\.?0+$/, '')}` : '—';
    this.el.comboBox.classList.toggle('hot', n >= 3);
  }
  setMood(frac) {
    this.el.mood.style.width = `${Math.max(0, frac) * 100}%`;
    this.el.mood.classList.toggle('mid', frac < 0.5 && frac >= 0.25);
    this.el.mood.classList.toggle('low', frac < 0.25);
  }
  setLevel(n, label = 'Level') { this.el.level.textContent = n; this.el.levelLabel.textContent = label; }
  setServed(n) { this.el.served.textContent = n; }
  showServed(v) { this.el.servedBox.classList.toggle('hidden', !v); }

  /** Campaign goal pill: plates served / goal, plus the shift clock (time left) when there is one. */
  showGoal(v) { this.el.goal.classList.toggle('hidden', !v); }
  setGoal(done, goal, timeLeft, timeTotal, timeText) {
    this.el.goalText.textContent = `🍜 ${done}/${goal}`;
    const hasClock = timeTotal > 0;
    this.el.goalTime.classList.toggle('hidden', !hasClock);
    if (hasClock) {
      this.el.goalTimeText.textContent = timeText;
      this.el.goalTime.classList.toggle('low', timeLeft <= 15);
      this.el.goalRing.style.setProperty('--p', String(Math.max(0, timeLeft / timeTotal)));
    }
    this.el.goal.classList.toggle('near', goal - done <= 1);
  }
  bumpGoal() {
    const g = this.el.goal;
    g.classList.remove('bump');
    void g.offsetWidth;
    g.classList.add('bump');
  }

  /** Iroh's Tea Time button: hidden on days without it, dim until a charge is earned. */
  setTea({ visible = false, charges = 0, active = false } = {}) {
    const b = this.el.tea;
    b.classList.toggle('hidden', !visible);
    b.classList.toggle('ready', charges > 0 && !active);
    b.classList.toggle('active', active);
    b.disabled = !(charges > 0) || active;
  }
  setTeaOverlay(on) { this.el.teaOverlay.classList.toggle('on', on); }
  setRush(on) { this.el.rush.classList.toggle('hidden', !on); }

  /** Queued toasts: a new message waits for the current one instead of overwriting it. */
  toast(msg, ms = 1600) {
    if (this.toasts.length >= 3) this.toasts.shift();
    this.toasts.push({ msg, ms });
    if (!this._toastBusy) this._nextToast();
  }
  _nextToast() {
    const next = this.toasts.shift();
    const t = this.el.toast;
    if (!next) { this._toastBusy = false; return; }
    this._toastBusy = true;
    t.textContent = next.msg;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => this._nextToast(), 180); }, next.ms);
  }
  clearToasts() {
    this.toasts.length = 0;
    clearTimeout(this._toastT);
    this._toastBusy = false;
    this.el.toast.classList.remove('show');
  }

  /** Ghost hand pointing at a world position (Day 1 teaching); pass null to hide. */
  guide(pos) {
    if (!pos) { if (this._guide) { this._remove(this._guide); this._guide = null; } return; }
    if (!this._guide) {
      const h = document.createElement('div');
      h.className = 'guide-hand';
      h.textContent = '👆';
      this._guide = this._anchor(null, 0, h, Infinity, pos.clone());
    } else this._guide.pos.copy(pos);
  }

  /** Briefly highlight the bubble of the guest who is going to take a dish. */
  flashBubble(c) {
    if (!c || !c.ui) return;
    c.ui.classList.remove('target');
    void c.ui.offsetWidth;
    c.ui.classList.add('target');
    clearTimeout(c.ui._flashT);
    c.ui._flashT = setTimeout(() => c.ui && c.ui.classList.remove('target'), 700);
  }

  // ---- anchored elements -------------------------------------------------
  _anchor(obj, offsetY, child, ttl = Infinity, staticPos = null) {
    const a = document.createElement('div');
    a.className = 'anchor';
    a.appendChild(child);
    this.layer.appendChild(a);
    const rec = { a, obj, offsetY, ttl, pos: staticPos };
    this.anchors.push(rec);
    this._place(rec);
    return rec;
  }

  _remove(rec) {
    rec.a.remove();
    const i = this.anchors.indexOf(rec);
    if (i >= 0) this.anchors.splice(i, 1);
  }

  createBubble(c, icons) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = c.def.name;
    const dishes = document.createElement('div');
    dishes.className = 'dishes';
    c.order.forEach((o) => {
      const d = document.createElement('div');
      d.className = 'dish';
      d.title = DISH_BY_ID[o.id].name;
      const img = document.createElement('img');
      img.src = icons[o.id];
      img.alt = DISH_BY_ID[o.id].name;
      d.appendChild(img);
      dishes.appendChild(d);
    });
    const bar = document.createElement('div');
    bar.className = 'patience';
    const fill = document.createElement('div');
    fill.className = 'fill';
    bar.appendChild(fill);
    if (c.vip) {
      b.classList.add('vip');
      const crown = document.createElement('div');
      crown.className = 'crown';
      crown.textContent = '👑';
      b.appendChild(crown);
    }
    if (c.hiddenBar) {
      bar.classList.add('hidden-bar');
      bar.dataset.q = '?';
    }
    b.append(who, dishes, bar);
    b._fill = fill;
    b._dishes = dishes;
    b._rec = this._anchor(c.char.root, 1.62, b);
    return b;
  }

  refreshBubble(c) {
    if (!c.ui) return;
    [...c.ui._dishes.children].forEach((d, i) => d.classList.toggle('done', c.order[i].done));
  }

  updateBubble(c, frac) {
    const b = c.ui;
    if (!b) return;
    // Mai's bar stays a grey "?" until her patience drops below the reveal point
    const hidden = c.hiddenBar && frac >= c.hiddenBar;
    b._fill.parentElement.classList.toggle('hidden-bar', !!hidden);
    b._fill.style.width = hidden ? '100%' : `${frac * 100}%`;
    b._fill.style.background = hidden ? '#b9ad96' : `hsl(${Math.round(frac * 110)}, 65%, 48%)`;
    b.classList.toggle('urgent', !hidden && frac < 0.25);
  }

  removeBubble(b) {
    b.classList.add('leaving');
    setTimeout(() => this._remove(b._rec), 260);
  }

  /** Outward side of a character (away from the table) so overlays never cover its order bubble. */
  sideOf(obj) { return obj.position.x < 0 ? 'left' : 'right'; }

  /** Phones are too narrow to place emotes beside a character without covering a face. */
  narrow() { return window.innerWidth < 700; }

  emote(obj, emoji, height = 1.7, side = null, bubble = null) {
    if (side === 'auto') side = this.sideOf(obj);
    const beside = !!(side && bubble && this.narrow());
    const e = document.createElement('div');
    e.className = beside ? 'emote' : side ? `emote ${side}` : 'emote';
    e.textContent = emoji;
    const rec = this._anchor(obj, beside ? 1.62 : side ? Math.min(height, 1.3) : height, e, 1.4);
    if (beside) { rec.link = bubble; rec.side = side; }
  }

  popup(worldPos, text, cls = '') {
    const p = document.createElement('div');
    p.className = `popup ${cls}`;
    p.textContent = text;
    this._anchor(null, 0, p, 1.3, worldPos.clone());
  }

  clearWorld() {
    for (const r of this.anchors.slice()) this._remove(r);
    this._guide = null;
  }

  _place(rec) {
    if (rec.obj) this.v.copy(rec.obj.position).setY(rec.obj.position.y + rec.offsetY * (rec.obj.userData.scale || 1));
    else this.v.copy(rec.pos);
    if (!this.camera) return;
    this.v.project(this.camera);
    const x = (this.v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    let px = x;
    const W = window.innerWidth;
    if (rec.link) {
      // remember the bubble size; the bubble element may be removed while the emote is still showing
      if (rec.link.isConnected) { rec.linkH = rec.link.offsetHeight; rec.linkW = rec.link.offsetWidth; }
      const el = rec.a.firstChild;
      // beside the bubble on the outward side, or inward when there is no room
      const off = (rec.linkW || 70) / 2 + 22;
      let dir = rec.side === 'left' ? -1 : 1;
      if (x + dir * off < 22 || x + dir * off > W - 22) dir = -dir;
      el.style.marginLeft = `${dir * off}px`;
      el.style.marginTop = `${-(rec.linkH || 90) / 2}px`;
    }
    rec.a.style.transform = `translate(${px.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  update(dt, camera) {
    this.camera = camera;
    for (const rec of this.anchors.slice()) {
      if (rec.ttl !== Infinity) {
        rec.ttl -= dt;
        if (rec.ttl <= 0) { this._remove(rec); continue; }
      }
      this._place(rec);
    }
    // rolling score counter
    if (this.shownScore !== this.score) {
      const d = this.score - this.shownScore;
      this.shownScore += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 10)));
      if (Math.abs(this.score - this.shownScore) < 1) this.shownScore = this.score;
      this.el.score.textContent = this.shownScore;
    }
  }
}
