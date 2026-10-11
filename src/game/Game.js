import * as THREE from 'three';
import { CUSTOMERS, CHEF, HOST, DISHES, LAYOUT, TUNING } from '../config.js';
import { loadAssets, renderDishIcons } from '../core/Assets.js';
import { Sfx } from '../core/Audio.js';
import { Particles } from '../core/Particles.js';
import { Tweens, Ease, clamp, pick, damp } from '../core/utils.js';
import { Stage } from '../world/Stage.js';
import { TeaHouse } from '../world/TeaHouse.js';
import { Conveyor } from '../world/Conveyor.js';
import { paiShoTexture } from '../world/textures.js';
import { Character } from './Character.js';
import { FoodGrid } from './FoodGrid.js';
import { CustomerManager } from './CustomerManager.js';
import { HUD } from '../ui/HUD.js';

const $ = (id) => document.getElementById(id);
const BELT_DISH_SCALE = 1.25;

export class Game {
  constructor(container) {
    this.container = container;
    this.state = 'loading';
    this.clock = new THREE.Clock();
    this.time = 0;
  }

  async init() {
    this.stage = new Stage(this.container);
    this.scene = this.stage.scene;
    this.camera = this.stage.camera;
    this.hud = new HUD();
    this.sfx = new Sfx();
    this.tweens = new Tweens();
    this.particles = new Particles(this.scene);

    const assets = await loadAssets((f, file) => {
      $('load-fill').style.width = `${Math.round(f * 100)}%`;
      $('load-text').textContent = `Loading ${file}…`;
    });
    this.assets = assets;
    this.icons = renderDishIcons(assets.dishes);

    this.house = new TeaHouse(this.scene, assets.props);
    this.conveyor = new Conveyor(this.scene, LAYOUT, paiShoTexture());
    this.conveyor.maxLaps = TUNING.wasteLaps;
    this.grid = new FoodGrid(this.scene, assets.dishes, LAYOUT);

    // Sokka the chef
    this.chef = new Character(assets.chars[CHEF.id], CHEF, LAYOUT.charScale);
    this.chef.root.position.set(0, 0, LAYOUT.chefZ);
    this.chef.yaw = this.chef.targetYaw = 0;
    this.scene.add(this.chef.root);
    this.chefTargetX = 0;
    this.chefThrowT = 0;

    // Iroh the host
    this.host = new Character(assets.chars[HOST.id], HOST, LAYOUT.charScale);
    this.host.root.position.set(2.75, 0, -3.95);
    this.host.yaw = this.host.targetYaw = Math.atan2(-2.75, 3.85);
    this.scene.add(this.host.root);

    const customerChars = CUSTOMERS.map((d) => new Character(assets.chars[d.id], d, LAYOUT.charScale));
    this.customers = new CustomerManager(this, customerChars);

    this.bindInput();
    this.resetRun();
    this.state = 'title';
    $('screen-loading').classList.add('hidden');
    $('screen-title').classList.remove('hidden');
    this.renderer = this.stage.renderer;
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- state
  resetRun() {
    this.tweens.clear();
    this.particles.clear();
    this.hud.clearWorld();
    this.customers.clear();
    for (const it of this.conveyor.items) this.scene.remove(it.obj);
    this.conveyor.items.length = 0;
    for (const o of this.flying || []) this.scene.remove(o);
    this.flying = new Set();

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.served = 0;
    this.level = 1;
    this.mood = TUNING.mood.start;
    this.picks = 0;
    this.applyLevel(false);
    this.grid.fill(() => this.rollDish());
    this.chef.root.position.set(0, 0, LAYOUT.chefZ);
    this.chefTargetX = 0;
    this.chef.play('Idle');
    this.host.play('Idle');
    this.hud.setScore(0, true);
    this.hud.setCombo(0, 1);
    this.hud.setMood(1);
    this.hud.setLevel(1);
    this.hud.setServed(0);
  }

  start() {
    this.sfx.unlock();
    this.sfx.play('start');
    this.sfx.startMusic();
    this.resetRun();
    this.state = 'playing';
    ['screen-title', 'screen-over', 'screen-pause'].forEach((id) => $(id).classList.add('hidden'));
    this.hud.show(true);
    this.hud.showHint(true);
    this.hintT = 12;
    this.hud.toast('The Tea House is open!');
    this.chef.bounce(1);
  }

  pause(p) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = p ? 'paused' : 'playing';
    $('screen-pause').classList.toggle('hidden', !p);
    if (p) this.sfx.stopMusic(); else this.sfx.startMusic();
  }

  gameOver() {
    if (this.state !== 'playing') return;
    this.state = 'gameover';
    this.sfx.stopMusic();
    this.sfx.play('gameover');
    this.chef.play('Sad');
    this.host.play('Sad');
    for (const c of this.customers.customers) {
      if (c.state === 'waiting' || c.state === 'eating') { c.state = 'angry'; c.timer = 99; c.char.play('Sad'); }
    }
    this.hud.showHint(false);
    let best = 0;
    try {
      best = Number(localStorage.getItem('irohTeaHouseBest') || 0);
      if (this.score > best) { best = this.score; localStorage.setItem('irohTeaHouseBest', String(best)); }
    } catch { best = Math.max(best, this.score); }
    $('final-score').textContent = this.score;
    $('best-score').textContent = best;
    $('final-served').textContent = this.served;
    $('final-combo').textContent = this.maxCombo;
    $('over-quote').textContent = this.score >= best && this.score > 0
      ? 'A new record! Even Uncle Iroh is impressed.'
      : pick(['The customers left unhappy… but tomorrow is a new pot of tea.', 'Failure is only the opportunity to begin again.', 'Rest now, chef. The dumplings will wait.']);
    setTimeout(() => $('screen-over').classList.remove('hidden'), 1300);
  }

  // ---------------------------------------------------------------- difficulty
  applyLevel(announce = true) {
    const lv = this.level - 1;
    this.unlockedCount = Math.min(DISHES.length, TUNING.startDishes + lv);
    this.customers.setActiveSeats(Math.min(4, TUNING.startSeats + lv));
    this.conveyor.speed = Math.min(TUNING.beltSpeedMax, TUNING.beltSpeed + TUNING.beltSpeedPerLevel * lv);
    if (announce) {
      const newDish = TUNING.startDishes + lv <= DISHES.length ? DISHES[TUNING.startDishes + lv - 1] : null;
      this.hud.toast(newDish ? `Level ${this.level}! ${newDish.name} on the menu` : `Level ${this.level}! The rush grows`, 2200);
      this.sfx.play('levelup');
      this.host.play('Cheer', { loop: false });
    }
  }

  unlockedDishes() { return DISHES.slice(0, this.unlockedCount).map((d) => d.id); }
  twoDishChance() { return this.level < 2 ? 0 : Math.min(0.5, 0.14 * (this.level - 1)); }
  spawnDelayScale() { return Math.max(0.45, 1 - 0.1 * (this.level - 1)); }
  patienceFor(n) {
    const p = Math.max(TUNING.patienceMin, TUNING.patienceBase - TUNING.patiencePerLevel * (this.level - 1));
    return n > 1 ? p * TUNING.multiDishPatience : p;
  }

  /** New grid dish: biased toward what customers want, especially dishes not available anywhere. */
  rollDish() {
    const unlocked = this.unlockedDishes();
    const pending = this.customers ? this.customers.pendingDishes().filter((d) => unlocked.includes(d)) : [];
    if (pending.length) {
      const available = new Set();
      for (const col of this.grid.cells) for (const cell of col) if (cell.id) available.add(cell.id);
      for (const it of this.conveyor.items) available.add(it.id);
      const missing = pending.filter((d) => !available.has(d));
      if (missing.length && Math.random() < 0.7) return pick(missing);
      if (Math.random() < TUNING.needBias) return pick(pending);
    }
    return pick(unlocked);
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const canvas = this.renderer?.domElement || this.stage.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const updatePointer = (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      return this.grid.pick(this.raycaster);
    };
    canvas.addEventListener('pointermove', (e) => {
      if (this.state !== 'playing') return;
      const hit = updatePointer(e);
      const col = hit && hit.r === 0 ? hit.c : -1;
      if (col !== this.grid.hover && col >= 0) this.sfx.play('hover');
      this.setHover(col);
      canvas.classList.toggle('pointer', !!hit);
    });
    canvas.addEventListener('pointerleave', () => this.setHover(-1));
    canvas.addEventListener('pointerdown', (e) => {
      this.sfx.unlock();
      if (this.state !== 'playing') return;
      const hit = updatePointer(e);
      if (!hit) return;
      if (hit.r === 0) this.select(hit.c);
      else {
        this.grid.nope(hit.c, hit.r);
        this.sfx.play('nope');
        this.hud.toast('Only the front row!', 900);
      }
      if (e.pointerType !== 'mouse') this.setHover(-1);
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (this.state === 'title' && (k === 'enter' || k === ' ')) { this.start(); return; }
      if (this.state === 'gameover' && k === 'enter' && !$('screen-over').classList.contains('hidden')) { this.start(); return; }
      if (k === 'p' || k === 'escape') this.pause(this.state === 'playing');
      if (k === 'm') this.toggleMute();
      if (this.state === 'playing' && k >= '1' && k <= String(LAYOUT.gridCols)) this.select(Number(k) - 1);
    });
    $('btn-start').onclick = () => this.start();
    $('btn-restart').onclick = () => this.start();
    $('btn-resume').onclick = () => this.pause(false);
    $('btn-quit').onclick = () => this.start();
    $('btn-pause').onclick = () => this.pause(true);
    $('btn-mute').onclick = () => this.toggleMute();
  }

  toggleMute() {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    $('btn-mute').textContent = this.sfx.muted ? '🔇' : '🔊';
  }

  setHover(col) {
    this.grid.hover = col;
    this.conveyor.showMarker(col >= 0 ? this.grid.colX(col) : null);
  }

  // ---------------------------------------------------------------- core loop actions
  select(c) {
    const taken = this.grid.take(c, () => this.rollDish());
    const x = this.grid.colX(c);
    this.sfx.play('throw');
    this.picks++;
    if (this.picks >= 3) this.hud.showHint(false);

    // Sokka hops over and flings the dish
    this.chefTargetX = clamp(x, -(LAYOUT.beltHalfW - 0.4), LAYOUT.beltHalfW - 0.4);
    this.chefThrowT = 0.5;
    this.chef.targetYaw = Math.PI;
    this.chef.play('Throw', { loop: false, timeScale: 1.6, fade: 0.08 });

    const obj = taken.obj;
    this.scene.add(obj);
    this.flying.add(obj);
    const from = obj.position.clone();
    const sLand = this.conveyor.path.sFromFrontX(x);
    const to = this.conveyor.path.point(sLand).setY(this.conveyor.beltTop + 0.015);
    const s0 = taken.scale;
    this.tweens.add({
      duration: 0.42, ease: Ease.linear,
      update: (k) => {
        const e = Ease.inOutQuad(k);
        obj.position.lerpVectors(from, to, e);
        obj.position.y += Math.sin(Math.PI * k) * 1.1;
        obj.scale.setScalar(s0 + (BELT_DISH_SCALE - s0) * e);
        obj.rotation.y += 0.25;
      },
      onComplete: () => {
        this.flying.delete(obj);
        if (this.state !== 'playing') { this.scene.remove(obj); return; }
        const s = this.conveyor.freeSlot(this.conveyor.path.sFromFrontX(x));
        this.conveyor.addItem({ id: taken.id, obj, s });
        this.sfx.play('land');
        this.particles.emit(to.clone().setY(this.conveyor.beltTop + 0.1), { kind: 'soft', count: 5, color: '#fff1d0', speed: 0.8, up: 0.4, life: 0.45, size: 0.22, gravity: 0 });
      },
    });
  }

  onBeltPass(item, cornerIndex) {
    if (this.state !== 'playing') return false;
    const c = this.customers.seats[cornerIndex].customer;
    if (!this.customers.wants(c, item.id)) return false;
    this.conveyor.removeItem(item);
    this.customers.deliver(c, item);
    return true;
  }

  /** A dish finished its last lap without a taker: it is thrown away. */
  onBeltLap(item) {
    this.conveyor.removeItem(item);
    const obj = item.obj;
    const p = obj.position.clone();
    const s0 = obj.scale.x;
    this.tweens.add({
      duration: 0.45,
      update: (k) => { obj.position.y = p.y + k * 0.6; obj.scale.setScalar(s0 * (1 - k)); obj.rotation.y += 0.3; },
      onComplete: () => this.scene.remove(obj),
    });
    this.particles.emit(p.clone().setY(p.y + 0.3), { kind: 'soft', count: 8, color: '#9a8a7a', speed: 0.8, up: 0.8, life: 0.7, size: 0.3, gravity: 0 });
    if (this.state !== 'playing') return;
    this.score = Math.max(0, this.score + TUNING.score.waste);
    this.hud.setScore(this.score);
    this.hud.popup(p.clone().setY(p.y + 0.6), `Wasted ${TUNING.score.waste}`, 'bad small');
    this.breakCombo();
    this.addMood(TUNING.mood.waste);
    this.sfx.play('waste');
  }

  onDishDelivered(c) {
    const p = c.char.root.position.clone().setY(1.0);
    if (c.order.some((o) => !o.done)) this.hud.popup(p, 'Yum! One more…', 'small');
  }

  onOrderComplete(c) {
    if (this.state !== 'playing') return;
    const frac = Math.max(0, c.patience / c.maxPatience);
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = this.comboMult();
    const base = TUNING.score.perDish * c.order.length + Math.round(TUNING.score.speedBonus * frac);
    const pts = Math.round(base * mult);
    this.score += pts;
    this.served++;
    this.hud.setScore(this.score);
    this.hud.setServed(this.served);
    this.hud.setCombo(this.combo, mult);
    const head = c.char.root.position.clone().setY(1.45 * LAYOUT.charScale);
    this.hud.popup(head, `+${pts}`, frac > 0.66 ? 'big' : '');
    if (this.combo >= 2) {
      this.hud.popup(head.clone().setY(2.1), `Combo x${mult.toFixed(2).replace(/\.?0+$/, '')}`, 'small');
      this.sfx.play('combo', this.combo);
    }
    this.sfx.play('happy');
    this.addMood(TUNING.mood.happy);
    this.chef.bounce(0.8);
    if (this.combo > 0 && this.combo % 5 === 0) {
      this.hud.toast(`${this.combo} in a row! Sokka is on fire!`);
      this.chef.play('Cheer', { loop: false, timeScale: 1.2 });
      this.host.play('Cheer', { loop: false });
      this.particles.emit(this.chef.root.position.clone().setY(1.3), { kind: 'star', count: 14, color: '#ffd76a', speed: 1.6, up: 2.5, life: 0.9 });
    }
    if (this.served % TUNING.customersPerLevel === 0) {
      this.level++;
      this.hud.setLevel(this.level);
      this.applyLevel(true);
    }
  }

  onCustomerAngry(c) {
    if (this.state !== 'playing') return;
    this.breakCombo();
    this.addMood(TUNING.mood.angry);
    this.sfx.play('angry');
    this.stage.shake = 1;
    this.hud.popup(c.char.root.position.clone().setY(1.5 * LAYOUT.charScale), 'Unhappy customer!', 'bad');
    this.chef.play('Sad', { loop: false });
  }

  comboMult() {
    const { comboStep, comboMax } = TUNING.score;
    return Math.min(comboMax, 1 + Math.max(0, this.combo - 1) * comboStep);
  }

  breakCombo() {
    if (this.combo >= 3) this.hud.toast('Combo broken!', 900);
    this.combo = 0;
    this.hud.setCombo(0, 1);
  }

  addMood(d) {
    this.mood = clamp(this.mood + d, 0, 100);
    this.hud.setMood(this.mood / 100);
    if (this.mood <= 0) this.gameOver();
  }

  // ---------------------------------------------------------------- frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state !== 'paused') this.update(dt);
    this.hud.update(dt, this.camera);
    this.stage.render(dt);
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    const playing = this.state === 'playing';
    this.tweens.update(dt);
    this.particles.update(dt);
    this.house.update(t);
    this.conveyor.update(dt, t, (it, ci) => this.onBeltPass(it, ci), (it) => this.onBeltLap(it));

    const wanted = new Set(playing ? this.customers.pendingDishes() : []);
    this.grid.update(dt, t, wanted);
    this.customers.update(dt, playing);
    this.updateChef(dt);
    this.host.update(dt);

    // hint timer + steam
    if (playing) {
      if (this.hintT > 0) {
        this.hintT -= dt;
        if (this.hintT <= 0) this.hud.showHint(false);
      }
    }
    this.steamT = (this.steamT || 0) - dt;
    if (this.steamT <= 0) {
      this.steamT = 0.35;
      for (const p of this.house.steamPoints) this.particles.steam(p);
    }
  }

  updateChef(dt) {
    const ch = this.chef;
    const pos = ch.root.position;
    const dx = this.chefTargetX - pos.x;
    if (this.chefThrowT > 0) this.chefThrowT -= dt;
    const moving = Math.abs(dx) > 0.03;
    pos.x = damp(pos.x, this.chefTargetX, 9, dt);
    if (this.chefThrowT <= 0 && this.state === 'playing') {
      // face the food grid between throws (toward the camera)
      ch.targetYaw = moving ? Math.sign(dx) * Math.PI / 2 : 0;
      const busy = ch.onceLeft > 0;
      if (!busy) {
        if (moving && ch.current !== ch.actions.Walk) ch.play('Walk', { timeScale: 2.2 });
        if (!moving && ch.current === ch.actions.Walk) ch.play('Idle');
      }
    }
    ch.update(dt);
  }
}
