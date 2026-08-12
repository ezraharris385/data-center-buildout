// main.js — renderer, camera, scene lifecycle, picking, ops simulation.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { loadCatalog } from './catalog.js';
import { animateBlink } from './materials.js';
import { FlowSystem } from './flows.js';
import { buildFacility } from './facility.js';
import { SCENES } from './scenes.js';
import * as UI from './ui.js';

/* ---------------- renderer & scene ---------------- */
const canvas = document.getElementById('scene3d');
// viewport size, latched to the last non-zero readout (headless panes report 0×0 intermittently)
let vw = innerWidth || 1280, vh = innerHeight || 720;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(vw, vh);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090d);
scene.fog = new THREE.FogExp2(0x07090d, 0.002);

const camera = new THREE.PerspectiveCamera(50, vw / vh, 0.1, 2000);
camera.position.set(60, 45, 90);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 2;
controls.maxDistance = 420;

// dusk lighting: cool sky, warm low sun
const hemi = new THREE.HemisphereLight(0x4a6a90, 0x141820, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a8, 1.7);
sun.position.set(-70, 60, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x6fa8ff, 0.25);
fill.position.set(60, 40, -80);
scene.add(fill);

// bloom
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(vw, vh), 0.38, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return; // headless panes can fire zero-size resizes
  vw = innerWidth; vh = innerHeight;
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
  renderer.setSize(vw, vh);
  composer.setSize(vw, vh);
});

/* ---------------- app state ---------------- */
const state = {
  sceneKey: 'hyperscale',
  load: 0.8,
  tempF: 75,
  utilityOn: true,
  failTimers: [],
  source: 'UTILITY',
};

let facility = null;
let flows = null;
let disposables = [];

function disposeScene() {
  for (const t of state.failTimers) clearTimeout(t);
  state.failTimers = [];
  if (flows) flows.dispose();
  if (facility) {
    facility.root.traverse(o => {
      if (o.isMesh || o.isLineSegments || o.isPoints) {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      }
      if (o.isSprite && o.material.map) { o.material.map.dispose(); o.material.dispose(); }
    });
    scene.remove(facility.root);
  }
  facility = null; flows = null;
}

function buildScene(key) {
  disposeScene();
  state.sceneKey = key;
  state.utilityOn = true;
  state.source = 'UTILITY';
  UI.setUtilityUI(true, '');
  UI.clearInspector();

  const cfg = SCENES[key];
  flows = new FlowSystem(scene);
  facility = buildFacility(scene, cfg, flows);
  flows.setUtility(true);
  flows.setLoad(state.load);
  applyToggles();
  UI.setBlurb(cfg.blurb);

  // size the sun's shadow camera to the site
  const bb = new THREE.Box3().setFromObject(facility.root);
  const size = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 10;
  Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, 0, (bb.min.z + bb.max.z) / 2);
  scene.add(sun.target);

  flyTo('overview', 0);
  updateTelemetry();
}

/* ---------------- toggles ---------------- */
const toggles = { roof: false, containment: true, labels: true, power: true, coolant: true, air: true, heat: true };
function applyToggles() {
  if (!facility) return;
  for (const m of facility.layers.roof) m.visible = toggles.roof;
  for (const m of facility.layers.containment) m.visible = toggles.containment;
  for (const m of facility.layers.labels) m.visible = toggles.labels;
  flows.setPowerVisible(toggles.power);
  flows.setCoolantVisible(toggles.coolant);
  flows.setAirVisible(toggles.air);
  flows.setHeatVisible(toggles.heat);
}

/* ---------------- camera fly ---------------- */
let flight = null;
function flyTo(presetKey, duration = 1.3) {
  const preset = facility?.cams[presetKey];
  if (!preset) return;
  if (duration === 0) {
    camera.position.copy(preset.pos);
    controls.target.copy(preset.target);
    controls.update();
    camera.updateMatrixWorld();
    return;
  }
  flight = {
    t: 0, duration,
    p0: camera.position.clone(), p1: preset.pos.clone(),
    t0: controls.target.clone(), t1: preset.target.clone(),
  };
}
window.__cam = { get pos() { return camera.position.toArray(); }, get flight() { return flight; }, fly: (k, d) => flyTo(k, d), cam: camera };
function updateFlight(dt) {
  if (!flight) return;
  flight.t += dt;
  const u = Math.min(1, flight.t / flight.duration);
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // easeInOutQuad
  camera.position.lerpVectors(flight.p0, flight.p1, e);
  controls.target.lerpVectors(flight.t0, flight.t1, e);
  if (u >= 1) flight = null;
}

/* ---------------- picking ---------------- */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let hovered = null;
let hoverHelper = null;
let selectHelper = null;
const tooltip = document.createElement('div');
tooltip.id = 'tooltip';
document.body.appendChild(tooltip);

function pickAt(x, y) {
  if (!facility) return null;
  pointer.set((x / vw) * 2 - 1, -(y / vh) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(facility.pick, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData?.pickable) o = o.parent;
    if (o) return o;
  }
  return null;
}

let lastMove = 0;
addEventListener('pointermove', e => {
  const now = performance.now();
  if (now - lastMove < 50) return; // throttle raycasts
  lastMove = now;
  const hit = pickAt(e.clientX, e.clientY);
  if (hit !== hovered) {
    hovered = hit;
    if (hoverHelper) { scene.remove(hoverHelper); hoverHelper.dispose?.(); hoverHelper = null; }
    if (hit) {
      const bb = new THREE.Box3().setFromObject(hit);
      hoverHelper = new THREE.Box3Helper(bb, 0x39c2ff);
      hoverHelper.material.transparent = true;
      hoverHelper.material.opacity = 0.7;
      scene.add(hoverHelper);
      document.body.style.cursor = 'pointer';
      try {
        const { comp } = window.__catalog;
        const c = comp(hit.userData.componentId);
        tooltip.textContent = `${c.Manufacturer ?? ''} ${c.Model ?? hit.userData.componentId}`;
        tooltip.style.display = 'block';
      } catch { tooltip.style.display = 'none'; }
    } else {
      document.body.style.cursor = '';
      tooltip.style.display = 'none';
    }
  }
  tooltip.style.left = `${e.clientX + 14}px`;
  tooltip.style.top = `${e.clientY + 10}px`;
});

let downPos = null;
addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; });
addEventListener('pointerup', e => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
  downPos = null;
  if (moved > 6) return; // was a drag
  if (e.target !== renderer.domElement) return;
  selectAt(e.clientX, e.clientY);
});
window.__pick = (x, y) => { const h = selectAt(x, y); return h ? h.userData.componentId : null; };
function selectAt(x, y) {
  const hit = pickAt(x, y);
  if (selectHelper) { scene.remove(selectHelper); selectHelper = null; }
  if (hit) {
    const bb = new THREE.Box3().setFromObject(hit);
    selectHelper = new THREE.Box3Helper(bb, 0xffc233);
    scene.add(selectHelper);
    UI.showInspector(hit.userData.componentId, { scaled: hit.userData.scaled });
  } else {
    UI.clearInspector();
  }
  return hit;
}

/* ---------------- operations model ---------------- */
function computePUE() {
  const base = SCENES[state.sceneKey].basePUE ?? 1.4;
  // hotter outside air = harder heat rejection; below ~55°F economizer benefit
  const temp = state.tempF;
  let pue = base + Math.max(0, temp - 65) * 0.005 - Math.max(0, 55 - temp) * 0.002;
  // partial load penalty: fixed losses dominate at low utilization
  pue += (1 - state.load) * 0.18;
  // running on gensets: on-site generation overhead
  if (state.source === 'GENERATOR') pue += 0.05;
  return Math.max(1.03, pue);
}

function updateTelemetry() {
  if (!facility) return;
  const s = facility.stats;
  const itKW = s.itKW * state.load;
  const pue = computePUE();
  UI.updateTelemetry({
    itKW,
    totalKW: itKW * pue,
    pue,
    racks: s.racks,
    kwPerRack: s.kwPerRack * state.load,
    source: state.source,
  });
}

function failUtility() {
  state.utilityOn = false;
  state.source = 'BATTERY';
  // trunk dies instantly; UPS bridges on batteries
  for (const f of flows.power) f.setEnabled(false);
  flows._utilityOn = false;
  UI.setUtilityUI(false, '⚡ Grid lost. UPS carrying full load on batteries…', 'alert');
  updateTelemetry();
  state.failTimers.push(setTimeout(() => {
    UI.setUtilityUI(false, '🔧 Engine start signal → gensets cranking…', 'gen');
    for (const p of flows.exhaust) p.setEnabled(true);
    flows.fanSpeed = 2.2;
  }, 2200));
  state.failTimers.push(setTimeout(() => {
    state.source = 'GENERATOR';
    if (toggles.power) for (const f of flows.backup) f.setEnabled(true);
    UI.setUtilityUI(false, '✔ ATS transferred. Facility riding on diesel — fuel clock is running.', 'gen');
    updateTelemetry();
  }, 5200));
}

function restoreUtility() {
  for (const t of state.failTimers) clearTimeout(t);
  state.failTimers = [];
  state.utilityOn = true;
  state.source = 'UTILITY';
  flows.setUtility(true);
  flows.setPowerVisible(toggles.power);
  flows.setLoad(state.load);
  UI.setUtilityUI(true, '✔ Utility restored. ATS retransferred; UPS recharging batteries.');
  updateTelemetry();
}

/* ---------------- UI wiring ---------------- */
UI.initUI({
  onScene: key => buildScene(key),
  onCamera: preset => flyTo(preset),
  onToggle: (name, on) => { toggles[name] = on; applyToggles(); },
  onLoad: v => { state.load = v; flows?.setLoad(v); updateTelemetry(); },
  onTemp: v => { state.tempF = v; updateTelemetry(); },
  onUtilityToggle: () => state.utilityOn ? failUtility() : restoreUtility(),
});

/* ---------------- boot ---------------- */
const clock = new THREE.Clock();
let rafAlive = false;
function step() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  animateBlink(t);
  flows?.update(dt, t);
  updateFlight(dt);
  controls.update();
  composer.render();
}
function animate() {
  rafAlive = true;
  requestAnimationFrame(animate);
  step();
}
// some embedded webviews suspend rAF — fall back to a timer loop
setTimeout(() => {
  if (!rafAlive) {
    console.warn('rAF suspended — falling back to timer loop');
    setInterval(step, 33);
  }
}, 600);

(async function boot() {
  UI.setLoadProgress(15, 'Loading component catalog…');
  const catalog = await loadCatalog();
  window.__catalog = await import('./catalog.js');
  UI.setLoadProgress(45, `${catalog.components.length} SKUs loaded — building facility…`);
  await new Promise(r => setTimeout(r, 30));
  buildScene('hyperscale');
  UI.setLoadProgress(100, 'Ready');
  setTimeout(UI.hideLoading, 350);
  animate();
})();
