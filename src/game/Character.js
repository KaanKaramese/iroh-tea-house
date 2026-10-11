import * as THREE from 'three';
import { dampAngle } from '../core/utils.js';

/**
 * Wraps one rigged GLB (all share clips Idle / Walk / Eat / Cheer / Throw / Sad)
 * and adds waypoint walking and one-shot animation handling.
 */
export class Character {
  constructor(gltf, def, scale = 1) {
    this.def = def;
    this.root = new THREE.Group();
    this.root.name = def.id;
    this.root.userData.scale = scale;
    this.model = gltf.scene;
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.yaw = 0;
    this.targetYaw = 0;
    this.path = [];
    this.speed = 2;
    this.onArrive = null;
    this.onceLeft = 0;
    this.afterOnce = null;
    this.headY = 1.05 * scale;
    this.squash = 0;
    this._base = scale;
    this.idleName = 'Idle'; // what it returns to after one-shots and walks
    this.play('Idle');
  }

  play(name, { fade = 0.2, loop = true, timeScale = 1, then = null } = {}) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current === a && loop && a.isRunning()) { a.timeScale = timeScale; return; }
    const prev = this.current;
    a.reset();
    a.enabled = true;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.timeScale = timeScale;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a) a.crossFadeFrom(prev, fade, false);
    this.current = a;
    if (loop) { this.onceLeft = 0; this.afterOnce = null; }
    else {
      this.onceLeft = a.getClip().duration / timeScale - fade * 0.5;
      this.afterOnce = then ?? this.idleName;
    }
  }

  /** Walk through world-space waypoints, then call onArrive. */
  walk(points, onArrive, speed = 2) {
    this.path = points.map((p) => p.clone());
    this.onArrive = onArrive;
    this.speed = speed;
    this.play('Walk', { timeScale: speed / 0.85 });
  }

  faceTo(x, z) {
    this.targetYaw = Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  bounce(amount = 1) { this.squash = amount; }

  update(dt) {
    if (this.path.length) {
      const target = this.path[0];
      const pos = this.root.position;
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) {
        pos.x = target.x;
        pos.z = target.z;
        this.path.shift();
        if (!this.path.length) {
          const cb = this.onArrive;
          this.onArrive = null;
          this.play(this.idleName);
          cb?.();
        }
      } else {
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        this.targetYaw = Math.atan2(dx, dz);
      }
    }
    this.yaw = dampAngle(this.yaw, this.targetYaw, 10, dt);
    this.root.rotation.y = this.yaw;

    if (this.onceLeft > 0) {
      this.onceLeft -= dt;
      if (this.onceLeft <= 0) {
        const next = this.afterOnce;
        this.afterOnce = null;
        if (typeof next === 'function') next();
        else if (next) this.play(next);
      }
    }

    // squash & stretch "boing" for feedback
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 3);
      const k = Math.sin(this.squash * Math.PI * 3) * this.squash * 0.12;
      this.model.scale.set(this.baseScale() * (1 + k), this.baseScale() * (1 - k), this.baseScale() * (1 + k));
    }
    this.mixer.update(dt);
  }

  baseScale() { return this._base; }
}
