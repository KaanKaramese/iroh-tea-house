import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CUSTOMERS, CHEF, HOST, OPPONENTS, DISHES } from '../config.js';

const BASE = `${import.meta.env.BASE_URL}models/`;

/** Loads every GLB produced by blender/build_assets.py. */
export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  const charDefs = [CHEF, HOST, ...CUSTOMERS, ...OPPONENTS];
  const jobs = [
    ...charDefs.map((d) => ({ key: `char:${d.id}`, file: d.file })),
    { key: 'dishes', file: 'dishes.glb' },
    { key: 'props', file: 'props.glb' },
  ];
  let done = 0;
  const results = {};
  await Promise.all(jobs.map(async (job) => {
    results[job.key] = await loader.loadAsync(BASE + job.file);
    done++;
    onProgress(done / jobs.length, job.file);
  }));

  const chars = {};
  for (const d of charDefs) chars[d.id] = results[`char:${d.id}`];

  const dishes = {};
  for (const d of DISHES) {
    const node = results.dishes.scene.getObjectByName(d.node);
    if (!node) throw new Error(`Missing dish node ${d.node}`);
    dishes[d.id] = prepareTemplate(node);
  }

  const props = {};
  results.props.scene.children.slice().forEach((n) => { props[n.name.replace('prop_', '')] = prepareTemplate(n); });
  return { chars, dishes, props };
}

function prepareTemplate(node) {
  const t = node.clone(true);
  t.position.set(0, 0, 0);
  t.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      if (m && m.transparent) { o.castShadow = false; m.depthWrite = false; }
    }
  });
  return t;
}

export function cloneTemplate(template, scale = 1) {
  const o = template.clone(true);
  o.scale.setScalar(scale);
  return o;
}

/** Renders each dish to a transparent PNG (data URL) for the thought bubbles. */
export function renderDishIcons(dishTemplates, size = 128) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a4a30, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 2, 1.5);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 10);

  const icons = {};
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  for (const [id, tpl] of Object.entries(dishTemplates)) {
    const o = tpl.clone(true);
    scene.add(o);
    box.setFromObject(o).getBoundingSphere(sphere);
    const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(14)) * 1.02;
    const dir = new THREE.Vector3(0, 0.75, 0.66).normalize();
    cam.position.copy(sphere.center).addScaledVector(dir, dist);
    cam.lookAt(sphere.center);
    renderer.render(scene, cam);
    icons[id] = renderer.domElement.toDataURL('image/png');
    scene.remove(o);
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return icons;
}
