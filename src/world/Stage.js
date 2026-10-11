import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Renderer, camera, lights and resize handling. */
export class Stage {
  constructor(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a120c');
    scene.fog = new THREE.Fog('#1a120c', 24, 42);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.3;
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.target = new THREE.Vector3(0, 0, 0.75);
    this.viewDir = new THREE.Vector3(0, 0.76, 0.65).normalize();
    this.dist = 17;

    // Lighting: warm key + soft sky/ground fill. Lantern point lights are added by TeaHouse.
    scene.add(new THREE.HemisphereLight('#ffe6c4', '#3b2618', 1.1));
    const key = new THREE.DirectionalLight('#ffdcaa', 2.3);
    key.position.set(-5, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#9cc4ff', 0.45);
    rim.position.set(6, 6, -8);
    scene.add(rim);

    this.shake = 0;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitPlayArea();
  }

  /**
   * Frame the important area (corner customers + their bubbles, the table and the
   * food grid) as tightly as the aspect ratio allows.
   */
  fitPlayArea() {
    const pts = [
      [-4.3, 0, -2.5], [4.3, 0, -2.5], [-3.6, 2.75, -2.3], [3.6, 2.75, -2.3],
      [-4.3, 0, 2.6], [4.3, 0, 2.6], [-3.2, 0, 5.35], [3.2, 0, 5.35],
    ].map((p) => new THREE.Vector3(...p));
    const v = new THREE.Vector3();
    const hudTop = window.innerWidth < 520 ? 0.72 : 0.84; // keep clear of the HUD bar
    const fits = (d) => {
      this.camera.position.copy(this.target).addScaledVector(this.viewDir, d);
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      let minY = Infinity, maxY = -Infinity, maxX = 0;
      for (const p of pts) {
        v.copy(p).project(this.camera);
        maxX = Math.max(maxX, Math.abs(v.x));
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      return { ok: maxX < 0.97 && maxY < hudTop && minY > -0.95, minY, maxY };
    };
    for (let iter = 0; iter < 3; iter++) {
      let lo = 6, hi = 60;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid).ok) hi = mid; else lo = mid;
      }
      this.dist = hi;
      // re-centre vertically between the HUD and the bottom edge
      const { minY, maxY } = fits(hi);
      const shift = ((maxY - hudTop) + (minY + 0.95)) / 2;
      this.target.z -= shift * 2.2;
      this.target.z = THREE.MathUtils.clamp(this.target.z, -0.5, 2.5);
    }
    // fog follows the camera distance so far-away (portrait) framings don't go dark
    this.scene.fog.near = this.dist + 6;
    this.scene.fog.far = this.dist + 24;
    this.placeCamera();
  }

  placeCamera(dt = 0) {
    this.camera.position.copy(this.target).addScaledVector(this.viewDir, this.dist);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.08;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.target);
  }

  render(dt) {
    this.placeCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
