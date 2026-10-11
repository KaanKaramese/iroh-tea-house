import * as THREE from 'three';
import { rand } from './utils.js';

function spriteTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {};
function textures() {
  if (TEX.soft) return TEX;
  TEX.soft = spriteTexture((g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  TEX.star = spriteTexture((g) => {
    g.translate(32, 32);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 30;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  TEX.heart = spriteTexture((g) => {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(32, 54);
    g.bezierCurveTo(4, 34, 8, 8, 32, 20);
    g.bezierCurveTo(56, 8, 60, 34, 32, 54);
    g.fill();
  });
  return TEX;
}

/** Tiny pooled sprite particle system for sparkles, puffs, hearts and steam. */
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
    this.pool = [];
    textures();
  }

  _get(tex) {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      s.renderOrder = 10;
    }
    s.material.map = tex;
    s.material.needsUpdate = true;
    this.scene.add(s);
    return s;
  }

  emit(pos, { count = 10, kind = 'star', color = '#ffd76a', speed = 2, up = 2, life = 0.8, size = 0.18, gravity = -4, spread = 1 } = {}) {
    const tex = TEX[kind] || TEX.soft;
    for (let i = 0; i < count; i++) {
      const s = this._get(tex);
      s.position.copy(pos);
      s.material.color.set(color);
      s.material.opacity = 1;
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * rand(0.3, 1) * spread, up * rand(0.6, 1.2), Math.sin(a) * speed * rand(0.3, 1) * spread);
      this.live.push({ s, v, life, t: 0, size: size * rand(0.7, 1.3), gravity, grow: kind === 'soft' ? 1.8 : 0 });
    }
  }

  steam(pos) {
    const s = this._get(TEX.soft);
    s.position.copy(pos);
    s.material.color.set('#ffffff');
    this.live.push({ s, v: new THREE.Vector3(rand(-0.05, 0.05), rand(0.25, 0.4), rand(-0.05, 0.05)), life: 2.2, t: 0, size: 0.12, gravity: 0, grow: 1.6, maxOpacity: 0.28 });
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.scene.remove(p.s);
        this.pool.push(p.s);
        this.live.splice(i, 1);
        continue;
      }
      p.v.y += p.gravity * dt;
      p.s.position.addScaledVector(p.v, dt);
      const sz = p.size * (1 + p.grow * k);
      p.s.scale.set(sz, sz, sz);
      const maxO = p.maxOpacity ?? 1;
      p.s.material.opacity = maxO * (p.maxOpacity ? Math.sin(Math.PI * k) : (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3));
    }
  }

  clear() {
    for (const p of this.live) { this.scene.remove(p.s); this.pool.push(p.s); }
    this.live.length = 0;
  }
}
