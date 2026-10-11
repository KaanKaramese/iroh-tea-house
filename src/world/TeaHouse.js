import * as THREE from 'three';
import { cloneTemplate } from '../core/Assets.js';
import { floorTexture, wallTexture, rugTexture, bannerTexture, signTexture, windowTexture } from './textures.js';

/** Static set dressing for Iroh's tea house in Ba Sing Se. */
export class TeaHouse {
  constructor(scene, props) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.props = props;
    this.steamPoints = [];
    this.lanterns = [];
    const g = this.group;

    const mat = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });
    const lacquer = mat({ color: '#8e2a1e', roughness: 0.4 });
    const darkWood = mat({ color: '#4a2e1a', roughness: 0.65 });
    const wood = mat({ color: '#7a4c2a', roughness: 0.6 });
    const gold = mat({ color: '#d4a53a', roughness: 0.35, metalness: 0.6 });
    const add = (geo, m, x, y, z, { cast = true, receive = true, ry = 0 } = {}) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      g.add(mesh);
      return mesh;
    };

    // floor + rug
    const floor = add(new THREE.PlaneGeometry(18, 15), mat({ map: floorTexture(), roughness: 0.75 }), 0, 0, 0.8, { cast: false });
    floor.rotation.x = -Math.PI / 2;
    const rug = add(new THREE.PlaneGeometry(9.2, 6.2), mat({ map: rugTexture(), roughness: 0.95 }), 0, 0.006, -0.05, { cast: false });
    rug.rotation.x = -Math.PI / 2;

    // walls
    const wallMat = mat({ map: wallTexture(), roughness: 0.9 });
    add(new THREE.BoxGeometry(16, 3.6, 0.3), wallMat, 0, 1.8, -4.9);
    const sideTex = wallTexture();
    sideTex.repeat.set(3, 1);
    const sideMat = mat({ map: sideTex, roughness: 0.9 });
    add(new THREE.BoxGeometry(0.3, 3.2, 9), sideMat, -7.6, 1.6, -0.6);
    add(new THREE.BoxGeometry(0.3, 3.2, 9), sideMat, 7.6, 1.6, -0.6);
    // ceiling beam along the back
    add(new THREE.BoxGeometry(16, 0.28, 0.35), darkWood, 0, 3.45, -4.6);

    // pillars
    for (const [x, z] of [[-7.2, -4.5], [7.2, -4.5], [-7.2, 3.6], [7.2, 3.6], [-3.6, -4.55], [3.6, -4.55]]) {
      add(new THREE.CylinderGeometry(0.17, 0.19, 3.6, 16), lacquer, x, 1.8, z);
      add(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16), gold, x, 0.06, z);
      add(new THREE.CylinderGeometry(0.24, 0.2, 0.14, 16), gold, x, 3.35, z);
    }

    // moon windows with a sunset view of the city
    const winTex = windowTexture();
    for (const x of [-1.95, 1.95]) {
      const glow = add(new THREE.CircleGeometry(0.78, 40), new THREE.MeshBasicMaterial({ map: winTex }), x, 1.95, -4.74, { cast: false });
      glow.renderOrder = 0;
      const frame = add(new THREE.TorusGeometry(0.8, 0.08, 10, 48), lacquer, x, 1.95, -4.72);
      frame.rotation.z = Math.PI / 2;
      for (const k of [-0.4, 0, 0.4]) {
        add(new THREE.BoxGeometry(0.035, 1.5 * Math.sqrt(1 - (k / 0.8) ** 2), 0.03), darkWood, x + k, 1.95, -4.71, { cast: false });
        add(new THREE.BoxGeometry(1.5 * Math.sqrt(1 - (k / 0.8) ** 2), 0.035, 0.03), darkWood, x, 1.95 + k, -4.71, { cast: false });
      }
    }

    // banner with the tea glyph
    add(new THREE.PlaneGeometry(1.15, 1.7), mat({ map: bannerTexture('茶'), roughness: 0.9, side: THREE.DoubleSide }), 0, 2.0, -4.72, { cast: false });
    add(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), gold, 0, 2.88, -4.7).rotation.z = Math.PI / 2;

    // entrance (back-left) with sign
    const [dx, dz] = [-5.3, -4.72];
    add(new THREE.PlaneGeometry(1.5, 2.3), new THREE.MeshBasicMaterial({ color: '#f7c98a' }), dx, 1.15, dz + 0.0, { cast: false });
    add(new THREE.BoxGeometry(0.18, 2.6, 0.24), lacquer, dx - 0.84, 1.3, dz + 0.02);
    add(new THREE.BoxGeometry(0.18, 2.6, 0.24), lacquer, dx + 0.84, 1.3, dz + 0.02);
    add(new THREE.BoxGeometry(2.1, 0.22, 0.3), lacquer, dx, 2.62, dz + 0.04);
    add(new THREE.BoxGeometry(2.3, 0.08, 0.36), gold, dx, 2.76, dz + 0.04);
    add(new THREE.PlaneGeometry(1.7, 0.42), mat({ map: signTexture("Iroh's Tea House"), roughness: 0.6 }), dx, 3.05, dz + 0.02, { cast: false });
    // half curtain in the doorway
    for (let i = 0; i < 3; i++) {
      add(new THREE.PlaneGeometry(0.48, 0.6), mat({ color: i === 1 ? '#3f6a42' : '#2f5a38', side: THREE.DoubleSide }), dx - 0.5 + i * 0.5, 2.18, dz + 0.1, { cast: false });
    }

    // shelf with jars (back wall, left)
    add(new THREE.BoxGeometry(1.6, 0.06, 0.34), darkWood, -3.65, 1.55, -4.6);
    add(new THREE.BoxGeometry(1.6, 0.06, 0.34), darkWood, -3.65, 2.2, -4.6);
    const jarCols = ['#3f6a42', '#c9a04a', '#7a2a1e', '#e8dcc0'];
    for (let i = 0; i < 4; i++) {
      add(new THREE.CylinderGeometry(0.11, 0.13, 0.28, 14), mat({ color: jarCols[i], roughness: 0.35 }), -4.2 + i * 0.36, 1.72, -4.6);
      add(new THREE.SphereGeometry(0.06, 10, 8), gold, -4.2 + i * 0.36, 1.88, -4.6);
    }
    this.placeProp('teapot', -3.9, 2.23, -4.6, 1.3);
    this.placeProp('teapot', -3.35, 2.23, -4.6, 1.1, 2.5);

    // Iroh's tea counter (back-right)
    add(new THREE.BoxGeometry(2.2, 0.82, 0.75), lacquer, 4.6, 0.41, -4.1);
    add(new THREE.BoxGeometry(2.35, 0.08, 0.86), wood, 4.6, 0.86, -4.1);
    this.placeProp('teapot', 4.1, 0.9, -4.05, 1.4, 0.6);
    this.placeProp('teapot', 5.05, 0.9, -4.15, 1.2, 2.2);
    for (let i = 0; i < 4; i++) this.placeProp('cup', 4.35 + i * 0.16, 0.9, -3.85, 1.3);
    this.steamPoints.push(new THREE.Vector3(4.28, 1.25, -4.05));
    // charcoal stove
    add(new THREE.CylinderGeometry(0.28, 0.32, 0.5, 16), mat({ color: '#3a3330', roughness: 0.9 }), 6.2, 0.25, -4.1);
    add(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: '#ff8a3a' }), 6.2, 0.505, -4.1, { cast: false }).rotation.x = -Math.PI / 2;

    // plants, barrels, cushions
    this.placeProp('plant', -6.7, 0, -4.2, 1.7);
    this.placeProp('plant', 6.9, 0, -3.3, 1.6);
    this.placeProp('plant', -6.8, 0, 3.2, 1.8);
    this.placeProp('plant', 6.8, 0, 3.2, 1.8);
    this.placeProp('barrel', -6.85, 0, -2.8, 1.3);
    this.placeProp('barrel', -6.85, 0, -2.05, 1.1);
    this.placeProp('barrel', 6.9, 0, -1.4, 1.2);
    this.placeProp('cushion', 6.5, 0, 0.4, 1.6);
    this.placeProp('cushion', -6.5, 0, 0.9, 1.6);
    // centre-piece on the Pai Sho board
    this.placeProp('teapot', 0, 0.37, 0, 1.6, -0.6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.placeProp('cup', Math.cos(a) * 0.55, 0.37, Math.sin(a) * 0.38, 1.6);
    }
    this.steamPoints.push(new THREE.Vector3(0.25, 0.75, 0));

    // hanging lanterns (kept outside the play area so they never hide customers)
    for (const [x, y, z] of [[-5.6, 2.55, 0.6], [5.6, 2.55, 0.6], [-1.0, 3.0, -4.0], [1.0, 3.0, -4.0], [-6.2, 2.5, -2.6], [6.2, 2.5, -2.6]]) {
      const l = this.placeProp('lantern', x, y, z, 1.8);
      this.lanterns.push(l);
    }
    for (const [x, y, z] of [[-5.6, 2.3, 0.6], [5.6, 2.3, 0.6], [0, 2.6, -3.6]]) {
      const pl = new THREE.PointLight('#ff9a4a', 9, 7.5, 1.6);
      pl.position.set(x, y, z);
      g.add(pl);
    }

    // low front counter for the food grid
    this.counter = new THREE.Group();
    g.add(this.counter);
  }

  placeProp(name, x, y, z, scale = 1, ry = 0) {
    const tpl = this.props[name];
    if (!tpl) return null;
    const o = cloneTemplate(tpl, scale);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    this.group.add(o);
    return o;
  }

  update(t) {
    this.lanterns.forEach((l, i) => {
      l.rotation.z = Math.sin(t * 0.9 + i) * 0.04;
      l.rotation.x = Math.cos(t * 0.7 + i * 2) * 0.03;
    });
  }
}
