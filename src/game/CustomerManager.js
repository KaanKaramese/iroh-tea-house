import * as THREE from 'three';
import { TUNING, LAYOUT } from '../config.js';
import { rand, pick, Ease } from '../core/utils.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);

/**
 * Four corner seats around the belt. Customers walk in from the door, think of an
 * order, wait (patience drains), eat when served, cheer and leave — or storm off.
 */
export class CustomerManager {
  constructor(game, characters) {
    this.game = game;
    this.free = characters.slice();   // Character instances not currently in the room
    this.customers = [];
    const path = game.conveyor.path;
    const [doorX, doorZ] = LAYOUT.door;
    const door = V(doorX, doorZ);
    const backLane = -(LAYOUT.beltHalfD + 1.55);
    const sideLane = LAYOUT.beltHalfW + 1.7;
    // walking routes from the door to each corner (front-left, back-left, back-right, front-right)
    const routes = [
      [V(doorX + 0.6, backLane + 0.1), V(-sideLane, backLane + 0.2), V(-sideLane, 1.4)],
      [V(doorX + 0.6, backLane + 0.1), V(-sideLane + 0.2, backLane + 0.15)],
      [V(doorX + 0.6, backLane + 0.1), V(sideLane - 0.4, backLane)],
      [V(doorX + 0.6, backLane + 0.1), V(sideLane, backLane + 0.2), V(sideLane, 1.4)],
    ];
    this.door = door;
    this.seats = path.corners.map((corner, i) => {
      const pos = corner.point.clone().addScaledVector(corner.dir, LAYOUT.seatOut);
      const hand = pos.clone().addScaledVector(corner.dir, -0.34 * LAYOUT.charScale);
      hand.y = 0.4 * LAYOUT.charScale;
      // front corners face sideways so the camera still sees their faces
      const look = corner.dir.z > 0 ? pos.clone().add(V(-Math.sign(corner.dir.x), 0)) : corner.point.clone();
      return { index: i, corner, pos, hand, look, route: routes[i], customer: null, timer: rand(0.4, 1.4), active: false };
    });
  }

  setActiveSeats(n) {
    // unlock order: back-left, front-right, back-right, front-left
    const order = [1, 3, 2, 0];
    this.seats.forEach((s) => { s.active = false; });
    order.slice(0, n).forEach((i) => { this.seats[i].active = true; });
  }

  pendingDishes() {
    const out = [];
    for (const c of this.customers) {
      if (c.state !== 'waiting' && c.state !== 'eating' && c.state !== 'arriving') continue;
      for (const o of c.order) if (!o.done) out.push(o.id);
    }
    return out;
  }

  spawn(seat) {
    if (!this.free.length) return;
    const g = this.game;
    const idx = Math.floor(Math.random() * this.free.length);
    const char = this.free.splice(idx, 1)[0];
    const unlocked = g.unlockedDishes();
    let menu = char.def.likes.filter((d) => unlocked.includes(d));
    if (!menu.length) menu = unlocked;
    const two = Math.random() < g.twoDishChance() && menu.length > 1;
    const order = [pick(menu)];
    if (two) {
      const rest = menu.filter((d) => d !== order[0]);
      order.push(pick(rest));
    }
    const patience = g.patienceFor(order.length);
    const c = {
      char, seat, def: char.def, state: 'arriving',
      order: order.map((id) => ({ id, done: false })),
      patience, maxPatience: patience, timer: 0, dish: null, ui: null, urgentWarned: false,
    };
    seat.customer = c;
    this.customers.push(c);
    char.root.position.copy(this.door);
    char.root.scale.setScalar(1);
    g.scene.add(char.root);
    g.particles.emit(this.door.clone().setY(0.5), { kind: 'soft', count: 6, color: '#fff3d6', speed: 0.6, up: 0.6, life: 0.7, size: 0.35, gravity: 0 });
    char.walk([...seat.route, seat.pos], () => this.arrive(c), TUNING.walkSpeed);
  }

  arrive(c) {
    const g = this.game;
    c.char.faceTo(c.seat.look.x, c.seat.look.z);
    if (g.state !== 'playing') { c.state = 'angry'; c.timer = 99; c.char.play('Sad'); return; }
    c.state = 'waiting';
    c.char.bounce(1);
    c.ui = g.hud.createBubble(c, g.icons);
    g.hud.emote(c.char.root, '❗', 1.3, 'auto', c.ui);
    if (Math.random() < 0.65) g.hud.speech(c.char.root, pick(c.def.hello), 2.4, 'auto', c.ui);
    g.sfx.play('bell');
  }

  wants(c, id) {
    if (!c || (c.state !== 'waiting' && c.state !== 'eating')) return false;
    return c.order.some((o) => !o.done && o.id === id);
  }

  /** A belt item reached this customer's corner and matches the order. */
  deliver(c, item) {
    const g = this.game;
    const entry = c.order.find((o) => !o.done && o.id === item.id);
    entry.done = true;
    g.hud.refreshBubble(c);
    g.sfx.play('deliver');
    if (c.dish) { g.scene.remove(c.dish); c.dish = null; }
    const obj = item.obj;
    const from = obj.position.clone();
    const to = c.seat.hand.clone();
    const s0 = obj.scale.x;
    c.dish = obj;
    g.tweens.add({
      duration: 0.35, ease: Ease.linear,
      update: (k) => {
        const e = Ease.outQuad(k);
        obj.position.lerpVectors(from, to, e);
        obj.position.y += Math.sin(Math.PI * k) * 0.5;
        obj.scale.setScalar(s0 + (0.75 - s0) * e);
      },
    });
    g.particles.emit(to.clone().setY(0.8), { kind: 'star', count: 8, color: '#ffe27a', speed: 1.4, up: 2, life: 0.6, size: 0.14 });
    c.state = 'eating';
    c.timer = TUNING.eatTime;
    c.char.play('Eat', { timeScale: 1.2 });
    g.sfx.play('eat');
    g.onDishDelivered(c);
  }

  leave(c, delay = 0) {
    const g = this.game;
    c.state = 'leaving';
    if (c.ui) { g.hud.removeBubble(c.ui); c.ui = null; }
    if (c.dish) {
      const d = c.dish;
      c.dish = null;
      g.tweens.add({ duration: 0.3, update: (k) => d.scale.setScalar(0.75 * (1 - k)), onComplete: () => g.scene.remove(d) });
    }
    c.seat.customer = null;
    const [lo, hi] = TUNING.spawnDelay;
    c.seat.timer = rand(lo, hi) * g.spawnDelayScale();
    g.tweens.wait(delay, () => {
      const route = [...c.seat.route].reverse();
      c.char.walk([...route, this.door, this.door.clone().setZ(this.door.z - 0.5)], () => this.despawn(c), TUNING.walkSpeed * 1.15);
    });
  }

  despawn(c) {
    const g = this.game;
    g.scene.remove(c.char.root);
    g.particles.emit(this.door.clone().setY(0.5), { kind: 'soft', count: 5, color: '#fff3d6', speed: 0.5, up: 0.5, life: 0.6, size: 0.3, gravity: 0 });
    this.customers.splice(this.customers.indexOf(c), 1);
    this.free.push(c.char);
  }

  update(dt, spawning = true) {
    const g = this.game;
    if (spawning) {
      for (const seat of this.seats) {
        if (!seat.active || seat.customer) continue;
        seat.timer -= dt;
        if (seat.timer <= 0) this.spawn(seat);
      }
    }
    for (const c of this.customers.slice()) {
      c.char.update(dt);
      switch (c.state) {
        case 'waiting': {
          if (spawning) c.patience -= dt;
          const frac = Math.max(0, c.patience / c.maxPatience);
          g.hud.updateBubble(c, frac);
          if (frac < 0.3 && !c.urgentWarned) {
            c.urgentWarned = true;
            g.hud.emote(c.char.root, '💦', 1.3, 'auto', c.ui);
          }
          if (c.patience <= 0) {
            c.state = 'angry';
            c.timer = TUNING.angryTime;
            c.char.play('Sad');
            g.hud.emote(c.char.root, '💢', 1.3, 'auto', c.ui);
            g.hud.speech(c.char.root, pick(c.def.angry), 2.2, 'auto', c.ui);
            if (c.ui) c.ui.classList.add('leaving');
            g.onCustomerAngry(c);
          }
          break;
        }
        case 'eating':
          c.timer -= dt;
          if (c.dish) c.dish.rotation.y += dt * 1.5;
          if (c.timer <= 0) {
            if (c.dish) {
              const d = c.dish;
              c.dish = null;
              g.tweens.add({ duration: 0.25, update: (k) => d.scale.setScalar(0.75 * (1 - k)), onComplete: () => g.scene.remove(d) });
            }
            if (c.order.every((o) => o.done)) {
              c.state = 'happy';
              c.timer = TUNING.cheerTime;
              c.char.play('Cheer');
              c.char.bounce(1);
              g.hud.emote(c.char.root, '💖', 1.3, 'auto', c.ui);
              if (Math.random() < 0.8) g.hud.speech(c.char.root, pick(c.def.happy), 2.2, 'auto', c.ui);
              g.particles.emit(c.char.root.position.clone().setY(1.5), { kind: 'heart', count: 7, color: '#ff7a9a', speed: 0.9, up: 1.8, life: 1.1, size: 0.16, gravity: -1.5 });
              if (c.ui) c.ui.classList.add('leaving');
              g.onOrderComplete(c);
            } else {
              c.state = 'waiting';
              c.char.play('Idle');
            }
          }
          break;
        case 'happy':
        case 'angry':
          c.timer -= dt;
          if (c.timer <= 0) this.leave(c);
          break;
        default:
          break;
      }
    }
  }

  /** Remove everyone instantly (restart). */
  clear() {
    for (const c of this.customers) {
      this.game.scene.remove(c.char.root);
      if (c.dish) this.game.scene.remove(c.dish);
      if (c.ui) this.game.hud.removeBubble(c.ui);
      c.char.path = [];
      c.char.onArrive = null;
      c.char.play('Idle');
      this.free.push(c.char);
    }
    this.customers.length = 0;
    for (const s of this.seats) { s.customer = null; s.timer = rand(0.3, 1.2); }
  }
}
