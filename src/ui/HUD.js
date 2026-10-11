import * as THREE from 'three';
import { DISH_BY_ID } from '../config.js';

const $ = (id) => document.getElementById(id);

/** DOM HUD + world-anchored overlays (thought bubbles, speech, popups, emotes). */
export class HUD {
  constructor() {
    this.layer = $('world-layer');
    this.anchors = [];
    this.v = new THREE.Vector3();
    this.shownScore = 0;
    this.score = 0;
    this.el = {
      hud: $('hud'), score: $('score'), combo: $('combo'), comboBox: $('combo-box'), mood: $('mood-fill'),
      level: $('level'), served: $('served'), toast: $('toast'), hint: $('hint'),
    };
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
  setLevel(n) { this.el.level.textContent = n; }
  setServed(n) { this.el.served.textContent = n; }

  toast(msg, ms = 1600) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
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
    b._fill.style.width = `${frac * 100}%`;
    b._fill.style.background = `hsl(${Math.round(frac * 110)}, 65%, 48%)`;
    b.classList.toggle('urgent', frac < 0.25);
  }

  removeBubble(b) {
    b.classList.add('leaving');
    setTimeout(() => this._remove(b._rec), 260);
  }

  /** Outward side of a character (away from the table) so overlays never cover its order bubble. */
  sideOf(obj) { return obj.position.x < 0 ? 'left' : 'right'; }

  /**
   * side 'auto' | 'left' | 'right': the line sits beside the head, level with the face.
   * Without a side it floats above the head (used for Iroh, who has no order bubble).
   */
  /** Phones are too narrow to place text beside a character without covering a face. */
  narrow() { return window.innerWidth < 700; }

  /**
   * side 'auto' | 'left' | 'right' places the line beside the head, level with the face.
   * On narrow screens, if the customer's order bubble (`bubble`) is given, the line sits
   * above that bubble instead. Without a side it floats above the head (used for Iroh).
   */
  speech(obj, text, seconds = 2, side = null, bubble = null) {
    if (side === 'auto') side = this.sideOf(obj);
    const above = !!(side && bubble && this.narrow());
    const s = document.createElement('div');
    s.className = above ? 'speech above' : side ? `speech ${side}` : 'speech';
    s.textContent = text;
    const rec = this._anchor(obj, above ? 1.62 : side ? 0.78 : 2.05, s, seconds);
    rec.fade = s;
    rec.clamp = side;
    if (above) { rec.link = bubble; rec.mode = 'above'; }
    return rec;
  }

  emote(obj, emoji, height = 1.7, side = null, bubble = null) {
    if (side === 'auto') side = this.sideOf(obj);
    const beside = !!(side && bubble && this.narrow());
    const e = document.createElement('div');
    e.className = beside ? 'emote' : side ? `emote ${side}` : 'emote';
    e.textContent = emoji;
    const rec = this._anchor(obj, beside ? 1.62 : side ? Math.min(height, 1.3) : height, e, 1.4);
    if (beside) { rec.link = bubble; rec.mode = 'beside'; rec.side = side; }
  }

  popup(worldPos, text, cls = '') {
    const p = document.createElement('div');
    p.className = `popup ${cls}`;
    p.textContent = text;
    this._anchor(null, 0, p, 1.3, worldPos.clone());
  }

  clearWorld() {
    for (const r of this.anchors.slice()) this._remove(r);
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
      // remember the bubble size; the bubble element may be removed while the line is still showing
      if (rec.link.isConnected) { rec.linkH = rec.link.offsetHeight; rec.linkW = rec.link.offsetWidth; }
      const el = rec.a.firstChild;
      if (rec.mode === 'above') {
        const w = el.offsetWidth || 0;
        el.style.marginTop = `${-((rec.linkH || 90) + 8)}px`;
        px = Math.min(Math.max(x, w / 2 + 6), W - w / 2 - 6);
      } else {
        // beside the bubble on the outward side, or inward when there is no room
        const off = (rec.linkW || 70) / 2 + 22;
        let dir = rec.side === 'left' ? -1 : 1;
        if (x + dir * off < 22 || x + dir * off > W - 22) dir = -dir;
        el.style.marginLeft = `${dir * off}px`;
        el.style.marginTop = `${-(rec.linkH || 90) / 2}px`;
      }
    } else if (rec.clamp) {
      // keep side-placed speech fully on screen
      const w = (rec.a.firstChild.offsetWidth || 0) + 40;
      px = rec.clamp === 'left' ? Math.max(x, w + 6) : Math.min(x, window.innerWidth - w - 6);
    }
    rec.a.style.transform = `translate(${px.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  update(dt, camera) {
    this.camera = camera;
    for (const rec of this.anchors.slice()) {
      if (rec.ttl !== Infinity) {
        rec.ttl -= dt;
        if (rec.fade && rec.ttl < 0.4) rec.fade.style.opacity = Math.max(0, rec.ttl / 0.4);
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
