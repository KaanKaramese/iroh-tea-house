import * as THREE from 'three';

/**
 * Rounded-rectangle loop on the XZ plane. s = 0 is the front-centre (closest to the
 * chef) and s increases clockwise when viewed from above: front → left → back → right.
 */
export class BeltPath {
  constructor(W, D, r) {
    this.W = W; this.D = D; this.r = r;
    const a = W - r, b = D - r;
    const segs = [];
    const line = (x0, z0, x1, z1) => segs.push({ type: 'line', x0, z0, x1, z1, len: Math.hypot(x1 - x0, z1 - z0) });
    const arc = (cx, cz, a0, a1) => segs.push({ type: 'arc', cx, cz, a0, a1, len: Math.abs(a1 - a0) * r });
    const H = Math.PI / 2;
    line(0, D, -a, D);                // front, heading -x
    arc(-a, b, H, 2 * H);             // front-left corner
    line(-W, b, -W, -b);              // left, heading -z
    arc(-a, -b, 2 * H, 3 * H);        // back-left corner
    line(-a, -D, a, -D);              // back, heading +x
    arc(a, -b, 3 * H, 4 * H);         // back-right corner
    line(W, -b, W, b);                // right, heading +z
    arc(a, b, 0, H);                  // front-right corner
    line(a, D, 0, D);                 // front, heading -x back to start
    let s = 0;
    for (const sg of segs) { sg.s0 = s; s += sg.len; }
    this.segs = segs;
    this.length = s;
    // arc midpoints → customer corners, in order: front-left, back-left, back-right, front-right
    this.corners = [1, 3, 5, 7].map((i) => {
      const sg = segs[i];
      const am = (sg.a0 + sg.a1) / 2;
      const dir = new THREE.Vector3(Math.cos(am), 0, Math.sin(am));
      return { s: sg.s0 + sg.len / 2, dir, center: new THREE.Vector3(sg.cx, 0, sg.cz), point: new THREE.Vector3(sg.cx + dir.x * r, 0, sg.cz + dir.z * r) };
    });
  }

  wrap(s) { return ((s % this.length) + this.length) % this.length; }

  point(s, out = new THREE.Vector3()) {
    s = this.wrap(s);
    for (const sg of this.segs) {
      if (s <= sg.s0 + sg.len) {
        const t = (s - sg.s0) / sg.len;
        if (sg.type === 'line') return out.set(sg.x0 + (sg.x1 - sg.x0) * t, 0, sg.z0 + (sg.z1 - sg.z0) * t);
        const a = sg.a0 + (sg.a1 - sg.a0) * t;
        return out.set(sg.cx + Math.cos(a) * this.r, 0, sg.cz + Math.sin(a) * this.r);
      }
    }
    return out.set(0, 0, this.D);
  }

  /** Heading angle (rotation.y) of travel at s. */
  yaw(s) {
    const p0 = this.point(s - 0.01), p1 = this.point(s + 0.01);
    return Math.atan2(p1.x - p0.x, p1.z - p0.z);
  }

  /** Path parameter on the front straight for a given x. */
  sFromFrontX(x) {
    const a = this.W - this.r;
    x = THREE.MathUtils.clamp(x, -a, a);
    return x <= 0 ? -x : this.length - x;
  }
}

function roundedRectShape(hw, hd, r, shape = new THREE.Shape()) {
  r = Math.min(r, hw, hd);
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hd - r);
  shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hd);
  shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hd + r);
  shape.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  return shape;
}

export function roundedSlab(hw, hd, r, depth, bevel = 0.03) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(hw, hd, r), {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** The lacquered table, the moving slat belt and everything riding on it. */
export class Conveyor {
  constructor(scene, layout, paiShoTex) {
    const { beltHalfW: W, beltHalfD: D, beltRadius: r, beltWidth: bw, tableTop, beltTop } = layout;
    this.path = new BeltPath(W, D, r);
    this.beltTop = beltTop;
    this.speed = 2.3;
    this.offset = 0;
    this.group = new THREE.Group();
    scene.add(this.group);

    const wood = new THREE.MeshStandardMaterial({ color: '#6b3f22', roughness: 0.55 });
    const lacquer = new THREE.MeshStandardMaterial({ color: '#8e2a1e', roughness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d4a53a', roughness: 0.35, metalness: 0.6 });

    // table body
    const outerW = W + bw / 2 + 0.2, outerD = D + bw / 2 + 0.2, outerR = r + bw / 2 + 0.2;
    const body = new THREE.Mesh(roundedSlab(outerW - 0.1, outerD - 0.1, outerR - 0.1, tableTop - 0.1, 0.04), lacquer);
    body.position.y = 0.02;
    const top = new THREE.Mesh(roundedSlab(outerW, outerD, outerR, 0.06, 0.03), wood);
    top.position.y = tableTop - 0.06;
    const trim = new THREE.Mesh(roundedSlab(outerW + 0.02, outerD + 0.02, outerR + 0.02, 0.02, 0.0), gold);
    trim.position.y = tableTop - 0.1;
    for (const m of [body, top, trim]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }

    // belt bed (ring)
    const ring = roundedRectShape(W + bw / 2, D + bw / 2, r + bw / 2);
    ring.holes.push(new THREE.Path(roundedRectShape(W - bw / 2, D - bw / 2, Math.max(0.05, r - bw / 2)).getPoints(48).reverse()));
    const bedGeo = new THREE.ExtrudeGeometry(ring, { depth: beltTop - tableTop - 0.03, bevelEnabled: false, curveSegments: 24 });
    bedGeo.rotateX(-Math.PI / 2);
    const bed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: '#2e1d14', roughness: 0.8 }));
    bed.position.y = tableTop;
    bed.receiveShadow = true;
    this.group.add(bed);

    // inner garden: Pai Sho board in the middle of the table
    const innerW = W - bw / 2 - 0.05, innerD = D - bw / 2 - 0.05;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(innerW * 2, innerD * 2), new THREE.MeshStandardMaterial({ map: paiShoTex, roughness: 0.6 }));
    board.rotation.x = -Math.PI / 2;
    board.position.y = tableTop + 0.005;
    board.receiveShadow = true;
    this.group.add(board);

    // rails
    for (const [hw, hd, rr] of [[W + bw / 2 + 0.03, D + bw / 2 + 0.03, r + bw / 2 + 0.03], [W - bw / 2 - 0.03, D - bw / 2 - 0.03, Math.max(0.05, r - bw / 2 - 0.03)]]) {
      const pts = roundedRectShape(hw, hd, rr).getPoints(24).map((p) => new THREE.Vector3(p.x, 0, -p.y));
      const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
      const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, 0.035, 8, true), gold);
      rail.position.y = beltTop + 0.01;
      rail.castShadow = true;
      this.group.add(rail);
    }

    // moving slats
    this.slatSpacing = 0.24;
    this.slatCount = Math.floor(this.path.length / this.slatSpacing);
    this.slatSpacing = this.path.length / this.slatCount;
    const slatGeo = new THREE.BoxGeometry(bw * 0.94, 0.03, this.slatSpacing * 0.82);
    const slatMat = new THREE.MeshStandardMaterial({ color: '#b98a52', roughness: 0.55 });
    this.slats = new THREE.InstancedMesh(slatGeo, slatMat, this.slatCount);
    this.slats.receiveShadow = true;
    const c1 = new THREE.Color('#c99a5e'), c2 = new THREE.Color('#9a6a3a');
    for (let i = 0; i < this.slatCount; i++) this.slats.setColorAt(i, i % 6 === 0 ? c2 : c1);
    this.group.add(this.slats);

    // landing marker (shows where the hovered column's dish will land)
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.27, 32),
      new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.0, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = beltTop + 0.03;
    this.group.add(this.marker);
    this.markerTarget = 0;

    this.items = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
    this.updateSlats();
  }

  updateSlats() {
    for (let i = 0; i < this.slatCount; i++) {
      const s = i * this.slatSpacing + this.offset;
      this.path.point(s, this._p);
      this._p.y = this.beltTop - 0.015;
      this._q.setFromAxisAngle(this._up, this.path.yaw(s));
      this._m.compose(this._p, this._q, this._s);
      this.slats.setMatrixAt(i, this._m);
    }
    this.slats.instanceMatrix.needsUpdate = true;
  }

  showMarker(x) {
    if (x === null) { this.markerTarget = 0; return; }
    const s = this.path.sFromFrontX(x);
    this.path.point(s, this.marker.position);
    this.marker.position.y = this.beltTop + 0.03;
    this.markerTarget = 0.85;
  }

  /** Find a free spot near `s` so plates never overlap. */
  freeSlot(s) {
    const gap = 0.62;
    for (let tries = 0; tries < 40; tries++) {
      const clash = this.items.some((it) => {
        const d = Math.abs(this.path.wrap(it.s - s));
        return Math.min(d, this.path.length - d) < gap;
      });
      if (!clash) return s;
      s = this.path.wrap(s - 0.2);
    }
    return s;
  }

  addItem(item) {
    item.traveled = 0;
    this.items.push(item);
  }

  removeItem(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
  }

  /** Advances belt and items. `onPass(item, cornerIndex)` returns true when the corner takes the item. */
  update(dt, t, onPass, onLap) {
    const ds = this.speed * dt;
    this.offset = this.path.wrap(this.offset + ds);
    this.updateSlats();
    this.marker.material.opacity += (this.markerTarget * (0.65 + 0.35 * Math.sin(t * 8)) - this.marker.material.opacity) * Math.min(1, dt * 12);

    for (const it of this.items.slice()) {
      const prev = it.s;
      it.s = this.path.wrap(it.s + ds);
      it.traveled += ds;
      this.path.point(it.s, it.obj.position);
      it.obj.position.y = this.beltTop + 0.015;
      it.obj.rotation.y += dt * 0.6;
      // corner checks (handle wrap-around)
      let taken = false;
      for (let ci = 0; ci < this.path.corners.length && !taken; ci++) {
        const cs = this.path.corners[ci].s;
        const crossed = prev <= it.s ? (prev < cs && cs <= it.s) : (cs > prev || cs <= it.s);
        if (crossed && onPass(it, ci)) taken = true;
      }
      if (!taken && it.traveled >= this.path.length - 0.05) onLap(it);
    }
  }

  clear(scene) {
    for (const it of this.items) it.obj.parent?.remove(it.obj);
    this.items.length = 0;
  }
}
