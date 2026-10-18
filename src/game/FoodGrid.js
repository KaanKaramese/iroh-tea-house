import * as THREE from 'three';
import { cloneTemplate } from '../core/Assets.js';
import { damp } from '../core/utils.js';

const DISH_SCALE = 1.55;

let spillTex = null;
/** Small "💧1" sprite riding on spill dishes (grid and belt). */
function spillBadge() {
  if (!spillTex) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(30, 90, 160, 0.92)';
    g.beginPath(); g.roundRect(4, 6, 88, 52, 24); g.fill();
    g.fillStyle = '#fff';
    g.font = 'bold 34px Georgia, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('💧1', 48, 34);
    spillTex = new THREE.CanvasTexture(c);
    spillTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spillTex, depthTest: false, transparent: true }));
  s.scale.set(0.3, 0.2, 1);
  s.position.set(0.12, 0.34, 0);
  s.renderOrder = 5;
  return s;
}

/**
 * cols × rows grid of dishes in front of the table. Only row 0 (closest to the
 * table) can be picked; taking a dish shifts its column up and spawns a new dish at the bottom.
 */
export class FoodGrid {
  constructor(scene, dishTemplates, layout) {
    this.templates = dishTemplates;
    this.L = layout;
    this.cols = layout.gridCols;
    this.rows = layout.gridRows;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.hover = -1;
    this.cells = [];

    const { gridSpacingX: sx, gridSpacingZ: sz, gridTopZ: z0 } = layout;
    const w = this.cols * sx + 0.35;
    const d = this.rows * sz + 0.3;
    const zc = z0 + ((this.rows - 1) * sz) / 2;
    const wood = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 0.6 });
    const lacquer = new THREE.MeshStandardMaterial({ color: '#8e2a1e', roughness: 0.4 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a53a', roughness: 0.35, metalness: 0.6 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), lacquer);
    counter.position.set(0, 0.13, zc);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.05, d + 0.06), wood);
    top.position.set(0, 0.285, zc);
    for (const m of [counter, top]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }

    // gold frame marking the selectable front row
    const fw = this.cols * sx + 0.12, fd = sz - 0.02;
    const frameY = 0.325;
    for (const [x, z, ww, dd] of [[0, z0 - fd / 2, fw, 0.05], [0, z0 + fd / 2, fw, 0.05], [-fw / 2, z0, 0.05, fd], [fw / 2, z0, 0.05, fd]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.04, dd), gold);
      bar.position.set(x, frameY, z);
      this.group.add(bar);
    }

    this.tileGeo = new THREE.BoxGeometry(sx * 0.86, 0.04, sz * 0.84);
    this.lowerMat = new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.7 });
    this.hitboxes = [];
    for (let c = 0; c < this.cols; c++) {
      const col = [];
      for (let r = 0; r < this.rows; r++) {
        const p = this.cellPos(c, r);
        const tileMat = r === 0
          ? new THREE.MeshStandardMaterial({ color: '#d9b27a', roughness: 0.5, emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0.15 })
          : this.lowerMat;
        const tile = new THREE.Mesh(this.tileGeo, tileMat);
        tile.position.set(p.x, 0.31, p.z);
        tile.receiveShadow = true;
        this.group.add(tile);
        const hb = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.95, 0.7, sz * 0.95), new THREE.MeshBasicMaterial({ visible: false }));
        hb.position.set(p.x, 0.5, p.z);
        hb.userData = { c, r };
        this.group.add(hb);
        this.hitboxes.push(hb);
        col.push({ id: null, obj: null, tile, scale: 0, lift: 0, shake: 0 });
      }
      this.cells.push(col);
    }

    // column number labels (keyboard hints)
    for (let c = 0; c < this.cols; c++) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      g.fillStyle = 'rgba(43,29,20,0.85)';
      g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2d27a';
      g.font = 'bold 34px Georgia, serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(c + 1), 32, 34);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      const p = this.cellPos(c, this.rows - 1);
      label.rotation.x = -Math.PI / 2;
      label.position.set(p.x, 0.27, p.z + sz * 0.62);
      this.group.add(label);
    }
  }

  cellPos(c, r, out = new THREE.Vector3()) {
    const { gridSpacingX: sx, gridSpacingZ: sz, gridTopZ: z0, gridY } = this.L;
    return out.set((c - (this.cols - 1) / 2) * sx, gridY, z0 + r * sz);
  }

  colX(c) { return this.cellPos(c, 0).x; }

  _makeDish(id) {
    const obj = cloneTemplate(this.templates[id], 0.001);
    obj.rotation.y = (Math.random() - 0.5) * 0.6;
    obj.userData.dish = true; // lets a reset find dishes that left the grid
    if (this.spill && this.spill.has(id)) obj.add(spillBadge()); // 💧1: wasted after only 1 lap
    this.group.add(obj);
    return obj;
  }

  /** Fill every cell; `roll()` returns a dish id. */
  fill(roll) {
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const cell = this.cells[c][r];
        if (cell.obj) this.group.remove(cell.obj);
        cell.id = roll();
        cell.obj = this._makeDish(cell.id);
        this.cellPos(c, r, cell.obj.position);
        cell.scale = 0;
        cell.delay = (c + r) * 0.04;
      }
    }
  }

  topId(c) { return this.cells[c][0].id; }

  /** Remove the front dish of column c, shift the column up and spawn a new dish at the back. */
  take(c, roll) {
    const col = this.cells[c];
    const front = col[0];
    const taken = { id: front.id, obj: front.obj, scale: front.obj.scale.x };
    this.group.remove(front.obj);
    for (let r = 0; r < this.rows - 1; r++) {
      col[r].id = col[r + 1].id;
      col[r].obj = col[r + 1].obj;
      col[r].scale = col[r + 1].scale;
      col[r].lift = 0.18; // little hop while sliding up
    }
    const last = col[this.rows - 1];
    last.id = roll();
    last.obj = this._makeDish(last.id);
    this.cellPos(c, this.rows, last.obj.position);
    last.scale = 0;
    last.delay = 0.08;
    return taken;
  }

  nope(c, r) { this.cells[c][r].shake = 0.35; }

  pick(raycaster) {
    const hit = raycaster.intersectObjects(this.hitboxes, false)[0];
    return hit ? hit.object.userData : null;
  }

  update(dt, t, wanted) {
    const tmp = new THREE.Vector3();
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const cell = this.cells[c][r];
        if (!cell.obj) continue;
        if (cell.delay > 0) { cell.delay -= dt; continue; }
        const isTop = r === 0;
        const hovered = isTop && this.hover === c;
        const isWanted = isTop && wanted.has(cell.id);
        this.cellPos(c, r, tmp);
        const o = cell.obj;
        o.position.x = damp(o.position.x, tmp.x, 14, dt);
        o.position.z = damp(o.position.z, tmp.z, 14, dt);
        cell.lift = damp(cell.lift, 0, 8, dt);
        const bob = isWanted ? 0.04 + Math.sin(t * 6 + c) * 0.035 : 0;
        o.position.y = tmp.y + (hovered ? 0.12 : 0) + bob + cell.lift;
        if (cell.shake > 0) {
          cell.shake = Math.max(0, cell.shake - dt);
          o.position.x += Math.sin(cell.shake * 60) * cell.shake * 0.15;
        }
        const target = DISH_SCALE * (hovered ? 1.14 : 1) * (isTop ? 1 : 0.86);
        cell.scale = damp(cell.scale, target, cell.scale < 0.5 ? 9 : 16, dt);
        o.scale.setScalar(Math.max(0.001, cell.scale));
        if (hovered) o.rotation.y += dt * 2.2;
        if (isTop) {
          const m = cell.tile.material;
          const want = hovered ? 0.9 : isWanted ? 0.35 + 0.25 * Math.sin(t * 6) : 0.12;
          m.emissiveIntensity = damp(m.emissiveIntensity, want, 12, dt);
          m.emissive.set(hovered ? '#ffd36a' : isWanted ? '#9dff7a' : '#ffb347');
        }
      }
    }
  }
}
