import * as THREE from 'three';
import { CUSTOMERS, CHEF, HOST, OPPONENTS, DISHES, DISH_BY_ID, LAYOUT, TUNING } from '../config.js';
import { DAYS, RINGS, ENDLESS_UNLOCK_DAY, challengeText, formatTime } from '../levels.js';
import { loadAssets, renderDishIcons } from '../core/Assets.js';
import { Sfx } from '../core/Audio.js';
import { Particles } from '../core/Particles.js';
import { loadSave, writeSave, recordDay } from '../core/Save.js';
import { Tweens, Ease, clamp, pick, damp, rng, seedRandom } from '../core/utils.js';
import { Stage } from '../world/Stage.js';
import { TeaHouse } from '../world/TeaHouse.js';
import { Conveyor } from '../world/Conveyor.js';
import { paiShoTexture } from '../world/textures.js';
import { Character } from './Character.js';
import { FoodGrid } from './FoodGrid.js';
import { CustomerManager } from './CustomerManager.js';
import { PaiSho } from './PaiSho.js';
import { rulesFromDay, endlessRules, applyGentle } from './Rules.js';
import { HUD } from '../ui/HUD.js';

const $ = (id) => document.getElementById(id);
const BELT_DISH_SCALE = 1.25;
const THROW_TIME = 0.42; // seconds a dish spends in the air
const INTRO_AUTOSTART = 4.5;

// Which overlay screen belongs to each game state ('playing' and 'ending' show none).
const SCREENS = {
  loading: 'screen-loading', title: 'screen-title', days: 'screen-days', intro: 'screen-intro',
  paused: 'screen-pause', results: 'screen-results', gameover: 'screen-over',
};

export class Game {
  constructor(container) {
    this.container = container;
    this.state = 'loading';
    this.clock = new THREE.Clock();
    this.time = 0;
    this.mode = 'endless';
    this.dayIndex = 0;
    this.runs = 0;
    this.simulating = false;
    this.gentle = false;     // Gentle mode for the current day (offered after 2 fails)
    this.failStreak = {};    // day id -> fails in a row this session
  }

  async init() {
    const params = new URLSearchParams(location.search);
    this.unlockAll = params.has('unlockAll');
    this.save = loadSave();

    this.stage = new Stage(this.container);
    this.scene = this.stage.scene;
    this.camera = this.stage.camera;
    this.hud = new HUD();
    this.sfx = new Sfx();
    this.sfx.setMuted(this.save.muted);
    $('btn-mute').textContent = this.save.muted ? '🔇' : '🔊';
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
    this.scene.add(this.host.root);
    // Earth Kingdom locals who take turns sitting across from Iroh; one is on the board at a time
    const opponents = OPPONENTS.map((d) => new Character(assets.chars[d.id], d, LAYOUT.charScale));
    this.paiSho = new PaiSho(this, opponents); // seats Iroh and a random opponent at the Pai Sho table

    const customerChars = CUSTOMERS.map((d) => new Character(assets.chars[d.id], d, LAYOUT.charScale));
    this.customers = new CustomerManager(this, customerChars);

    this.bindInput();
    this.resetRun();
    this.renderer = this.stage.renderer;
    this.renderer.setAnimationLoop(() => this.frame());

    const lvl = Number(params.get('level'));
    if (lvl >= 1 && lvl <= DAYS.length) this.showIntro(lvl - 1);
    else this.showTitle();
  }

  // ---------------------------------------------------------------- state machine
  setState(s) {
    this.state = s;
    if (this.simulating) return;
    for (const [state, id] of Object.entries(SCREENS)) {
      // the endless game-over card appears after a short beat (see endRun)
      if (state === 'gameover') { if (s !== 'gameover') $(id).classList.add('hidden'); continue; }
      $(id).classList.toggle('hidden', state !== s);
    }
    this.hud.show(s === 'playing' || s === 'paused' || s === 'ending');
  }

  showTitle() {
    const unlocked = this.endlessUnlocked();
    const b = $('btn-endless');
    b.disabled = !unlocked;
    b.textContent = unlocked ? `Endless Rush${this.save.endlessBest ? ` · best ${this.save.endlessBest}` : ''}` : '🔒 Endless Rush · clear Day 4';
    this.setState('title');
  }

  dayCleared(i) {
    const rec = this.save.days[DAYS[i].id];
    return !!(rec && rec.stars[0]);
  }
  dayUnlocked(i) { return this.unlockAll || i === 0 || this.dayCleared(i - 1); }
  endlessUnlocked() {
    return this.unlockAll || this.save.endlessBest > 0 || this.dayCleared(DAYS.findIndex((d) => d.id === ENDLESS_UNLOCK_DAY));
  }

  openDays() {
    this.sfx.unlock();
    const list = $('days-list');
    list.innerHTML = '';
    let ring = null;
    DAYS.forEach((d, i) => {
      if (d.ring !== ring) {
        ring = d.ring;
        const h = document.createElement('div');
        h.className = 'ring-title';
        h.textContent = RINGS[ring];
        list.appendChild(h);
      }
      const rec = this.save.days[d.id];
      const open = this.dayUnlocked(i);
      const btn = document.createElement('button');
      btn.className = `day-tile${open ? '' : ' locked'}${rec && rec.stars[0] ? ' cleared' : ''}`;
      btn.disabled = !open;
      const stars = [0, 1, 2].map((k) => `<span class="${rec && rec.stars[k] ? 'on' : ''}">★</span>`).join('');
      const leaf = rec && rec.gentle ? '<span class="day-leaf" title="Cleared in Gentle mode">🍃</span>' : '';
      btn.innerHTML = `${leaf}<span class="day-num">${open ? i + 1 : '🔒'}</span><span class="day-name">${d.name}</span><span class="day-stars">${stars}</span>`;
      btn.onclick = () => this.showIntro(i);
      list.appendChild(btn);
    });
    const endless = document.createElement('button');
    const eOpen = this.endlessUnlocked();
    endless.className = `day-tile endless${eOpen ? '' : ' locked'}`;
    endless.disabled = !eOpen;
    endless.innerHTML = `<span class="day-num">${eOpen ? '∞' : '🔒'}</span><span class="day-name">Endless Rush</span><span class="day-stars small">${eOpen ? (this.save.endlessBest ? `best ${this.save.endlessBest}` : 'play forever') : 'clear Day 4'}</span>`;
    endless.onclick = () => this.startEndless();
    list.appendChild(endless);
    this.setState('days');
  }

  showIntro(i) {
    this.sfx.unlock();
    this.mode = 'campaign';
    if (i !== this.dayIndex) this.gentle = false;
    this.dayIndex = i;
    const d = DAYS[i];
    this.resetRun();
    $('intro-ring').textContent = `${RINGS[d.ring]} · Day ${i + 1}`;
    $('intro-title').textContent = d.name;
    $('intro-icon').textContent = d.icon;
    $('intro-teach').textContent = d.teach;
    $('intro-goal').textContent = d.goal.time
      ? `Serve ${d.goal.plates} plates in ${formatTime(d.goal.time)}`
      : `Serve ${d.goal.plates} plates`;
    $('intro-star3').textContent = challengeText(d.challenge);
    const guest = d.newGuest && CUSTOMERS.find((c) => c.id === d.newGuest);
    $('intro-guest').textContent = guest ? `New guest today: ${guest.name}` : '';
    this.introT = INTRO_AUTOSTART;
    this.setState('intro');
  }

  beginDay() {
    if (this.state !== 'intro') return;
    this.beginRun();
    const d = DAYS[this.dayIndex];
    this.hud.toast(`Day ${this.dayIndex + 1} · ${d.name}`);
  }

  startEndless() {
    this.sfx.unlock();
    this.mode = 'endless';
    this.resetRun();
    this.beginRun();
    this.hud.toast('The Tea House is open!');
  }

  /** Retry: campaign days restart instantly without the intro card. */
  retry() {
    if (this.mode === 'endless') { this.startEndless(); return; }
    this.resetRun();
    this.beginRun();
  }

  beginRun() {
    this.sfx.unlock();
    this.sfx.play('start');
    this.sfx.startMusic();
    if (this.rules.opponent) this.paiSho.rollOpponent(this.runs++ > 0, this.rules.opponent);
    else if (this.runs++ > 0) this.paiSho.rollOpponent(); // a new opponent for every run after the first
    this.setState('playing');
    this.hud.showHint(true);
    this.hintT = 12;
    this.chef.bounce(1);
  }

  pause(p) {
    if (p && this.state !== 'playing') return;
    if (!p && this.state !== 'paused') return;
    this.setState(p ? 'paused' : 'playing');
    if (p) this.sfx.stopMusic(); else this.sfx.startMusic();
  }

  // ---------------------------------------------------------------- run setup
  resetRun() {
    this.tweens.clear();
    this.particles.clear();
    this.hud.clearWorld();
    this.hud.clearToasts();
    this.customers.clear();
    for (const it of this.conveyor.items) this.scene.remove(it.obj);
    this.conveyor.items.length = 0;
    for (const o of this.flying || []) this.scene.remove(o);
    this.flying = new Set();
    // dishes caught mid-animation (wasted, in a guest's hands) lose their tweens above: sweep them up
    for (const o of this.scene.children.slice()) if (o.userData.dish) this.scene.remove(o);
    this.pending = []; // landing slots reserved by dishes still in the air
    this.conveyor.setFull(false);

    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.served = 0;
    this.plates = 0;
    this.angry = 0;
    this.wasted = 0;
    this.dayTime = 0;
    this.level = 1;
    this.mood = TUNING.mood.start;
    this.picks = 0;
    this.nextThrowAt = 0;
    this.queuedCol = null;

    const campaign = this.mode === 'campaign';
    this.day = campaign ? DAYS[this.dayIndex] : null;
    this.rules = campaign ? rulesFromDay(this.day) : endlessRules(1);
    if (campaign && this.gentle) this.rules = applyGentle(this.rules);
    this.freeWastesLeft = this.rules.freeWastes;
    this.teaCharges = 0;
    this.teaLeft = 0;
    this.rushLeft = 0;
    this.rushT = this.rules.rush ? this.rules.rush.first : Infinity;
    this.rushWarned = false;
    this.vipCounter = 0;
    this.vipServed = 0;
    this.vipAngry = 0;
    this.hud.setTea({ visible: this.rules.teaTime, charges: 0, active: false });
    this.hud.setRush(false);
    this.hud.setTeaOverlay(false);
    this.grid.spill = new Set(this.rules.spill);
    this.applyRules();
    this.grid.fill(() => this.rollDish());
    this.chef.root.position.set(0, 0, LAYOUT.chefZ);
    this.chefTargetX = 0;
    this.chef.play('Idle');
    this.host.play(this.host.idleName);
    this.hud.setScore(0, true);
    this.hud.setCombo(0, 1);
    this.hud.setMood(1);
    this.hud.setLevel(campaign ? this.dayIndex + 1 : 1, campaign ? (this.rules.gentle ? 'Day 🍃' : 'Day') : 'Level');
    this.hud.setServed(0);
    this.hud.showServed(!campaign);
    this.hud.showGoal(campaign);
    this.hud.guide(null);
    this._lastGoalText = '';
    if (campaign) this.updateGoalHud(true);
  }

  applyRules() {
    const r = this.rules;
    this.customers.setActiveSeats(r.seats);
    this.customers.setPool(r.pool);
    this.conveyor.maxLaps = r.wasteLaps;
    this.applyBelt();
  }

  /** Belt speed = the day's speed, slowed by Tea Time and sped up by rush hour. */
  applyBelt() {
    let v = this.rules.belt;
    if (this.teaLeft > 0) v *= TUNING.teaTime.beltMul;
    if (this.rushLeft > 0) v *= this.rules.rush.beltMul;
    this.conveyor.speed = v;
  }

  unlockedDishes() { return this.rules.dishes; }
  twoDishChance() { return this.rules.twoDish; }
  spawnDelayScale() { return this.rules.spawnScale * (this.rushLeft > 0 ? this.rules.rush.spawnMul : 1); }
  patienceFor(n) { return this.rules.patience * (n > 1 ? TUNING.multiDishPatience : 1); }
  /** How fast patience drains: frozen during Tea Time. */
  patienceRate() { return this.teaLeft > 0 ? 0 : 1; }

  /** A guest just walked in: apply character quirks and VIP status for today's twists. */
  onCustomerSpawn(c) {
    const r = this.rules;
    const q = r.quirks && c.def.quirk;
    if (q) {
      c.quirk = q;
      c.patience *= q.patienceMul || 1;
      c.speedMul = q.speedBonusMul || 1;
      c.hiddenBar = q.hiddenBar || 0;
    }
    if (r.vip && ++this.vipCounter % r.vip.every === 0) {
      c.vip = true;
      c.patience *= r.vip.patienceMul;
    }
    c.maxPatience = c.patience;
  }

  useTeaTime() {
    if (this.state !== 'playing' || !this.rules.teaTime || this.teaCharges <= 0 || this.teaLeft > 0) return;
    this.teaCharges--;
    this.teaLeft = TUNING.teaTime.duration;
    this.applyBelt();
    this.sfx.play('tea');
    this.hud.toast('🍵 Tea Time! Everyone relaxes…', 1600);
    this.hud.emote(this.host.root, '🍵', 1.2);
    this.hud.setTeaOverlay(true);
    this.hud.setTea({ visible: true, charges: this.teaCharges, active: true });
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
      if (missing.length && rng() < this.rules.missingBias) return pick(missing);
      if (rng() < this.rules.needBias) return pick(pending);
    }
    return pick(unlocked);
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const canvas = this.stage.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    const updatePointer = (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      return this.grid.pick(this.raycaster);
    };
    // anywhere in a column's lane counts: it always sends that column's front-row dish
    canvas.addEventListener('pointermove', (e) => {
      if (this.state !== 'playing') return;
      const hit = updatePointer(e);
      const col = hit ? hit.c : -1;
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
      this.select(hit.c);
      if (e.pointerType !== 'mouse') this.setHover(-1);
    });
    $('screen-intro').addEventListener('pointerdown', () => this.beginDay());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const go = k === 'enter' || k === ' ';
      if (this.state === 'title' && go) { this.openDays(); return; }
      if (this.state === 'intro' && go) { this.beginDay(); return; }
      if (this.state === 'results' && go) { (this.lastResult?.won ? this.next() : this.retry()); return; }
      if (this.state === 'gameover' && k === 'enter' && !$('screen-over').classList.contains('hidden')) { this.startEndless(); return; }
      if (k === 'p' || k === 'escape') {
        if (this.state === 'playing') this.pause(true);
        else if (this.state === 'paused') this.pause(false);
      }
      if (k === 'm') this.toggleMute();
      if (k === 't') this.useTeaTime();
      if (this.state === 'playing' && k >= '1' && k <= String(LAYOUT.gridCols)) this.select(Number(k) - 1);
    });
    $('btn-start').onclick = () => this.openDays();
    $('btn-endless').onclick = () => this.startEndless();
    $('btn-days-back').onclick = () => this.showTitle();
    $('btn-intro-start').onclick = (e) => { e.stopPropagation(); this.beginDay(); };
    $('btn-restart').onclick = () => this.startEndless();
    $('btn-over-menu').onclick = () => this.showTitle();
    $('btn-resume').onclick = () => this.pause(false);
    $('btn-quit').onclick = () => this.retry();
    $('btn-pause-menu').onclick = () => (this.mode === 'campaign' ? this.openDays() : this.showTitle());
    $('btn-pause').onclick = () => this.pause(true);
    $('btn-mute').onclick = () => this.toggleMute();
    $('btn-next').onclick = () => this.next();
    $('btn-retry').onclick = () => this.retry();
    $('btn-days').onclick = () => this.openDays();
    $('btn-tea').onclick = () => this.useTeaTime();
    $('btn-gentle').onclick = () => { this.gentle = true; this.retry(); };
  }

  next() {
    if (this.dayIndex + 1 < DAYS.length && this.dayUnlocked(this.dayIndex + 1)) this.showIntro(this.dayIndex + 1);
    else this.openDays();
  }

  toggleMute() {
    this.sfx.unlock();
    this.sfx.setMuted(!this.sfx.muted);
    this.save.muted = this.sfx.muted;
    writeSave(this.save);
    $('btn-mute').textContent = this.sfx.muted ? '🔇' : '🔊';
  }

  setHover(col) {
    this.grid.hover = col;
    if (col < 0) this.conveyor.showMarker(null);
  }

  // ---------------------------------------------------------------- core loop actions
  /**
   * Where a dish thrown now at column x would land, or null when the belt is full. Looks ahead to
   * the landing time so belt dishes and dishes already in the air are accounted for.
   */
  findLandingSlot(x) {
    const v = this.conveyor.speed;
    const tLand = this.time + THROW_TIME;
    const occupied = this.conveyor.items.map((it) => it.s + v * THROW_TIME);
    for (const p of this.pending) occupied.push(p.s + v * (tLand - p.t));
    return this.conveyor.findSlot(this.conveyor.path.sFromFrontX(x), occupied);
  }

  select(c) {
    if (this.state !== 'playing') return;
    // a short cooldown between throws; a tap during it is remembered, never dropped
    if (this.time < this.nextThrowAt) { this.queuedCol = c; return; }
    const x = this.grid.colX(c);
    const sLand = this.findLandingSlot(x);
    if (sLand === null) {
      // belt is full: nothing can be sent
      this.grid.nope(c, 0);
      this.sfx.play('nope');
      this.hud.toast('The belt is full!', 900);
      return;
    }
    this.nextThrowAt = this.time + TUNING.throwCooldown;
    const taken = this.grid.take(c, () => this.rollDish());
    this.sfx.play('throw');
    this.picks++;
    if (this.picks >= 3) this.hud.showHint(false);
    this.hud.guide(null);

    // Sokka hops over and flings the dish
    this.chefTargetX = clamp(x, -(LAYOUT.beltHalfW - 0.4), LAYOUT.beltHalfW - 0.4);
    this.chefThrowT = 0.5;
    this.chef.targetYaw = Math.PI;
    this.chef.play('Throw', { loop: false, timeScale: 1.6, fade: 0.08 });

    const obj = taken.obj;
    this.scene.add(obj);
    this.flying.add(obj);
    const from = obj.position.clone();
    const to = this.conveyor.path.point(sLand).setY(this.conveyor.beltTop + 0.015);
    const s0 = taken.scale;
    const reservation = { s: sLand, t: this.time + THROW_TIME, id: taken.id };
    this.pending.push(reservation);
    this.tweens.add({
      duration: THROW_TIME, ease: Ease.linear,
      update: (k) => {
        const e = Ease.inOutQuad(k);
        obj.position.lerpVectors(from, to, e);
        obj.position.y += Math.sin(Math.PI * k) * 1.1;
        obj.scale.setScalar(s0 + (BELT_DISH_SCALE - s0) * e);
        obj.rotation.y += 0.25;
      },
      onComplete: () => {
        this.flying.delete(obj);
        this.pending.splice(this.pending.indexOf(reservation), 1);
        if (this.state !== 'playing') { this.scene.remove(obj); return; }
        this.conveyor.addItem({ id: taken.id, obj, s: sLand, maxLaps: this.rules.spill.includes(taken.id) ? 1 : undefined });
        this.sfx.play('land');
        this.particles.emit(to.clone().setY(this.conveyor.beltTop + 0.1), { kind: 'soft', count: 5, color: '#fff1d0', speed: 0.8, up: 0.4, life: 0.45, size: 0.22, gravity: 0 });
        this.hud.flashBubble(this.whoWillTake(taken.id, sLand));
      },
    });
  }

  /** The customer a dish landing at path position s will reach first (belt order), if any. */
  whoWillTake(id, s) {
    const path = this.conveyor.path;
    const order = path.corners
      .map((corner, i) => ({ i, d: path.wrap(corner.s - s) }))
      .sort((a, b) => a.d - b.d);
    for (const { i } of order) {
      const c = this.customers.seats[i].customer;
      if (this.customers.wants(c, id)) return c;
    }
    return null;
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
    if (this.freeWastesLeft > 0) {
      // teaching day: the first waste is shown but costs nothing
      this.freeWastesLeft--;
      this.hud.popup(p.clone().setY(p.y + 0.6), 'Wasted! (free this time)', 'small');
      this.hud.toast('Dishes nobody takes in 2 laps are wasted', 2200);
      this.sfx.play('waste');
      return;
    }
    this.wasted++;
    this.score = Math.max(0, this.score + TUNING.score.waste);
    this.hud.setScore(this.score);
    this.hud.popup(p.clone().setY(p.y + 0.6), `Wasted ${TUNING.score.waste}`, 'bad small');
    this.breakCombo();
    this.addMood(this.rules.wasteMood);
    this.sfx.play('waste');
  }

  /** Every dish handed to a guest counts as a plate; a finished order scores right away. */
  onDishDelivered(c) {
    if (this.state !== 'playing') return;
    this.plates++;
    const p = c.char.root.position.clone().setY(1.0);
    if (c.order.some((o) => !o.done)) this.hud.popup(p, 'Yum! One more…', 'small');
    else this.scoreOrder(c);
    if (this.mode === 'campaign') {
      this.hud.bumpGoal();
      this.updateGoalHud(true);
      if (this.plates >= this.day.goal.plates) this.endRun('won');
    }
  }

  /** Called by CustomerManager when a guest finishes eating; scoring already happened on delivery. */
  onOrderComplete() {}

  scoreOrder(c) {
    const frac = Math.max(0, c.patience / c.maxPatience);
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = this.comboMult();
    const base = TUNING.score.perDish * c.order.length + Math.round(TUNING.score.speedBonus * frac * (c.speedMul || 1));
    const pts = Math.round(base * mult * (c.vip ? this.rules.vip.scoreMul : 1));
    if (c.vip) this.vipServed++;
    this.score += pts;
    this.served++;
    this.hud.setScore(this.score);
    this.hud.setServed(this.served);
    this.hud.setCombo(this.combo, mult);
    const head = c.char.root.position.clone().setY(1.45 * LAYOUT.charScale);
    this.hud.popup(head, c.vip ? `👑 +${pts}` : `+${pts}`, frac > 0.66 || c.vip ? 'big' : '');
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
      this.host.bounce(1);
      this.hud.emote(this.host.root, '🎉', 1.2);
      this.particles.emit(this.chef.root.position.clone().setY(1.3), { kind: 'star', count: 14, color: '#ffd76a', speed: 1.6, up: 2.5, life: 0.9 });
    }
    const tt = TUNING.teaTime;
    if (this.rules.teaTime && this.combo % tt.comboPerCharge === 0 && this.teaCharges < tt.maxCharges) {
      this.teaCharges++;
      this.hud.setTea({ visible: true, charges: this.teaCharges, active: this.teaLeft > 0 });
      this.hud.toast('🫖 Tea Time is ready! Tap the teapot (T)', 2000);
      this.hud.emote(this.host.root, '🫖', 1.2);
    }
    if (this.mode === 'endless' && this.served % TUNING.customersPerLevel === 0) this.levelUp();
  }

  levelUp() {
    this.level++;
    const before = this.rules.dishes.length;
    this.rules = endlessRules(this.level);
    this.applyRules();
    this.hud.setLevel(this.level, 'Level');
    const newDish = this.rules.dishes.length > before ? DISH_BY_ID[this.rules.dishes[this.rules.dishes.length - 1]] : null;
    this.hud.toast(newDish ? `Level ${this.level}! ${newDish.name} on the menu` : `Level ${this.level}! The rush grows`, 2200);
    this.sfx.play('levelup');
    this.host.bounce(1);
    this.hud.emote(this.host.root, '👏', 1.2);
  }

  onCustomerAngry(c) {
    if (this.state !== 'playing') return;
    this.angry++;
    if (c.vip) this.vipAngry++;
    this.breakCombo();
    this.addMood(this.rules.angryMood * (c.vip ? this.rules.vip.angryMoodMul : 1));
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
    this.mood = clamp(this.mood + d, this.rules.noFail ? 10 : 0, 100);
    this.hud.setMood(this.mood / 100);
    if (this.mood <= 0) this.endRun('failed', 'mood');
  }

  // ---------------------------------------------------------------- end of a run
  challengeMet() {
    const ch = this.day.challenge;
    if (!ch) return true;
    if (ch.type === 'noWaste') return this.wasted === 0;
    if (ch.type === 'combo') return this.maxCombo >= ch.n;
    if (ch.type === 'time') return this.day.goal.time - this.dayTime >= ch.left;
    if (ch.type === 'vipAll') return this.vipAngry === 0;
    return false;
  }

  endRun(outcome, reason = null) {
    if (this.state !== 'playing') return;
    const won = outcome === 'won';
    this.hud.guide(null);
    this.hud.showHint(false);
    this.conveyor.setFull(false);
    this.queuedCol = null;
    this.teaLeft = 0;
    this.rushLeft = 0;
    this.hud.setRush(false);
    this.hud.setTeaOverlay(false);
    this.hud.setTea({ visible: false });
    this.sfx.stopMusic();
    // guests react to how the day ended
    for (const c of this.customers.customers) {
      if (c.state !== 'waiting' && c.state !== 'eating') continue;
      c.state = won ? 'happy' : 'angry';
      c.timer = 99;
      c.char.play(won ? 'Cheer' : 'Sad');
    }

    if (this.mode === 'endless') {
      this.setState('gameover');
      this.lastResult = { won: false, score: this.score, served: this.served };
      if (this.simulating) return;
      this.sfx.play('gameover');
      this.chef.play('Sad');
      this.hud.emote(this.host.root, '😢', 1.2);
      const best = Math.max(this.save.endlessBest, this.score);
      const record = this.score > 0 && this.score >= best && this.score > this.save.endlessBest;
      this.save.endlessBest = best;
      writeSave(this.save);
      $('final-score').textContent = this.score;
      $('best-score').textContent = best;
      $('final-served').textContent = this.served;
      $('final-combo').textContent = this.maxCombo;
      $('over-quote').textContent = record
        ? 'A new record! Even Uncle Iroh is impressed.'
        : pick(['The customers left unhappy… but tomorrow is a new pot of tea.', 'Failure is only the opportunity to begin again.', 'Rest now, chef. The dumplings will wait.']);
      setTimeout(() => { if (this.state === 'gameover') $('screen-over').classList.remove('hidden'); }, 1300);
      return;
    }

    const d = this.day;
    const stars = [won, won && this.angry === 0, won && this.challengeMet()];
    this.lastResult = {
      won, reason, stars, plates: this.plates, goal: d.goal.plates, time: this.dayTime,
      angry: this.angry, wasted: this.wasted, maxCombo: this.maxCombo, score: this.score,
    };
    this.setState('ending');
    if (this.simulating) return;

    const endlessBefore = this.endlessUnlocked();
    const nextBefore = this.dayIndex + 1 < DAYS.length && this.dayUnlocked(this.dayIndex + 1);
    const rec = won ? recordDay(this.save, d.id, { stars, score: this.score, gentle: this.rules.gentle }) : this.save.days[d.id];
    this.failStreak[d.id] = won ? 0 : (this.failStreak[d.id] || 0) + 1;
    if (won) this.gentle = false;
    if (won) {
      this.sfx.play('levelup');
      this.chef.play('Cheer', { loop: false });
      this.host.bounce(1);
      this.hud.emote(this.host.root, '🎉', 1.2);
      this.particles.emit(this.chef.root.position.clone().setY(1.3), { kind: 'star', count: 18, color: '#ffd76a', speed: 1.8, up: 2.6, life: 1 });
      this.hud.toast('Day cleared!', 1200);
    } else {
      this.sfx.play('gameover');
      this.chef.play('Sad');
      this.hud.emote(this.host.root, '😢', 1.2);
      this.hud.toast(reason === 'time' ? 'Closing time!' : 'The guests are upset…', 1200);
    }

    // results card
    $('res-title').textContent = won ? 'Day Cleared!' : 'The Tea House Closes Early';
    $('res-sub').textContent = `Day ${this.dayIndex + 1} · ${d.name}${this.rules.gentle ? ' · 🍃 Gentle' : ''}`;
    const starEls = $('res-stars').children;
    const labels = ['Goal reached', 'No angry guests', challengeText(d.challenge)];
    for (let k = 0; k < 3; k++) {
      starEls[k].classList.toggle('on', stars[k]);
      starEls[k].querySelector('.star-label').textContent = labels[k];
      starEls[k].style.animationDelay = `${0.25 + k * 0.35}s`;
    }
    $('res-plates').textContent = `${this.plates}/${d.goal.plates}`;
    $('res-time').textContent = formatTime(this.dayTime);
    $('res-score').textContent = this.score;
    $('res-best').textContent = rec ? rec.best : '—';
    const notes = [];
    if (won) {
      const next = DAYS[this.dayIndex + 1];
      if (next && !nextBefore) notes.push(`🔓 Day ${this.dayIndex + 2} · ${next.name} unlocked`);
      if (!endlessBefore && this.endlessUnlocked()) notes.push('🔓 Endless Rush unlocked!');
      const guest = next && next.newGuest && CUSTOMERS.find((c) => c.id === next.newGuest);
      if (guest) notes.push(`Next time: ${guest.name} visits`);
      if (!next) notes.push('More days are coming soon!');
    }
    $('res-unlock').textContent = notes.join(' · ');
    $('res-tip').textContent = won ? '' : this.failTip(reason);
    $('res-tip').classList.toggle('hidden', won);
    $('btn-next').classList.toggle('hidden', !won);
    // after 2 fails in a row, offer Gentle mode (stars earned that way get a leaf)
    $('btn-gentle').classList.toggle('hidden', won || this.rules.gentle || this.failStreak[d.id] < 2);
    $('btn-retry').classList.toggle('big-btn', !won);
    $('btn-retry').classList.toggle('alt-btn', won);
    setTimeout(() => { if (this.state === 'ending') this.setState('results'); }, 1200);
  }

  failTip(reason) {
    const why = reason === 'time' ? 'Closing time came before the goal.' : 'Too many guests left unhappy.';
    let tip = 'Keep the front row moving: every plate counts.';
    if (this.wasted >= 3) tip = 'Dishes nobody wants ride the belt and go to waste. Send what is ordered.';
    else if (this.angry >= 1) tip = 'Serve the guest with the shortest patience bar first.';
    return `${why} ${tip}`;
  }

  updateGoalHud(force = false) {
    const d = this.day;
    const left = d.goal.time ? Math.max(0, d.goal.time - this.dayTime) : 0;
    const text = d.goal.time ? formatTime(Math.ceil(left)) : '';
    const key = `${this.plates}|${text}`;
    if (!force && key === this._lastGoalText) return;
    this._lastGoalText = key;
    this.hud.setGoal(this.plates, d.goal.plates, left, d.goal.time, text);
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

    const wanted = new Set(playing ? this.customers.orderedDishes() : []);
    this.grid.update(dt, t, wanted);
    if (playing && this.grid.hover >= 0) {
      // landing marker follows the slot the hovered column would really use (red = belt full)
      const x = this.grid.colX(this.grid.hover);
      const slot = this.findLandingSlot(x);
      this.conveyor.showMarker(slot ?? this.conveyor.path.sFromFrontX(x), slot !== null);
    }
    this.customers.update(dt, playing);
    this.updateChef(dt);
    this.host.update(dt);
    this.paiSho.update(dt);

    if (playing) {
      if (this.queuedCol !== null && this.time >= this.nextThrowAt) {
        const q = this.queuedCol;
        this.queuedCol = null;
        this.select(q);
      }
      // warn before a tap is refused: the rails glow red while no dish can be sent
      this.conveyor.setFull(this.findLandingSlot(0) === null);
      if (this.rules.guide && this.picks === 0) this.updateGuide(wanted);
      if (this.teaLeft > 0) {
        this.teaLeft -= dt;
        if (this.teaLeft <= 0) {
          this.teaLeft = 0;
          this.applyBelt();
          this.hud.setTeaOverlay(false);
          this.hud.setTea({ visible: true, charges: this.teaCharges, active: false });
        }
      }
      if (this.rules.rush) this.updateRush(dt);
      if (this.hintT > 0) {
        this.hintT -= dt;
        if (this.hintT <= 0) this.hud.showHint(false);
      }
      if (this.mode === 'campaign') {
        this.dayTime += dt;
        if (!this.simulating) this.updateGoalHud();
        if (this.day.goal.time && this.dayTime >= this.day.goal.time) this.endRun('failed', 'time');
      }
    }
    if (this.state === 'intro' && !this.simulating) {
      this.introT -= dt;
      $('intro-bar').style.width = `${clamp(1 - this.introT / INTRO_AUTOSTART, 0, 1) * 100}%`;
      if (this.introT <= 0) this.beginDay();
    }
    this.steamT = (this.steamT || 0) - dt;
    if (this.steamT <= 0) {
      this.steamT = 0.35;
      for (const p of this.house.steamPoints) this.particles.steam(p);
    }
  }

  /** Rush hour: a gong warns, then belt and guests speed up for a while, then calm again. */
  updateRush(dt) {
    const rush = this.rules.rush;
    if (this.rushLeft > 0) {
      this.rushLeft -= dt;
      if (this.rushLeft <= 0) {
        this.rushLeft = 0;
        this.rushT = rush.every;
        this.applyBelt();
        this.hud.setRush(false);
        this.hud.toast('Rush hour is over. Breathe.', 1400);
      }
      return;
    }
    this.rushT -= dt;
    if (!this.rushWarned && this.rushT <= rush.warn) {
      this.rushWarned = true;
      this.sfx.play('gong');
      this.hud.toast('🔔 Rush hour in 3…', 1800);
      this.stage.shake = 0.4;
    }
    if (this.rushT <= 0) {
      this.rushWarned = false;
      this.rushLeft = rush.duration;
      this.applyBelt();
      this.hud.setRush(true);
      // guests pour in: empty corners fill right away
      for (const seat of this.customers.seats) if (seat.active && !seat.customer) seat.timer = Math.min(seat.timer, 0.3);
    }
  }

  /** Day 1: a ghost hand points at a front-row dish someone wants, until the first throw. */
  updateGuide(wanted) {
    let col = -1;
    for (let c = 0; c < this.grid.cols; c++) if (wanted.has(this.grid.topId(c))) { col = c; break; }
    if (col < 0) { this.hud.guide(null); return; }
    this.hud.guide(this.grid.cellPos(col, 0).setY(0.75));
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

  // ---------------------------------------------------------------- balance testing
  /**
   * Plays a campaign day as fast as possible with a bot (no rendering) and returns the result.
   * `bot(dt)` is called every step; used by src/dev/bot.js to check goals are fair.
   */
  simulate({ day, seed = 1, bot, dt = 1 / 30, maxT = 400 }) {
    const keep = { state: this.state, mode: this.mode, dayIndex: this.dayIndex };
    this.simulating = true;
    seedRandom(seed);
    this.mode = 'campaign';
    this.dayIndex = day;
    this.resetRun();
    this.state = 'playing';
    let t = 0;
    while (this.state === 'playing' && t < maxT) {
      bot(dt);
      this.update(dt);
      this.hud.update(dt, this.camera);
      t += dt;
    }
    const result = { ...this.lastResult };
    if (this.state === 'playing') result.timedOut = true;
    seedRandom(null);
    this.simulating = false;
    this.mode = keep.mode;
    this.dayIndex = keep.dayIndex;
    this.resetRun();
    this.state = keep.state;
    return result;
  }
}
