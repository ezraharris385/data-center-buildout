// main.js — renderer, camera, scene lifecycle, picking, ops simulation,
// tab routing (4 archetypes + database + custom), education, cinematic tours.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { loadCatalog, comp } from './catalog.js';
import { animateBlink } from './materials.js';
import { FlowSystem } from './flows.js';
import { buildFacility } from './facility.js';
import { SCENES } from './scenes.js';
import { Choreographer, cinematicKeys, TourRecorder } from './tour.js';
import { buildFlowStops, buildEquipmentGuide } from './learn.js';
import { initDatabase, setDatabaseVisible } from './database.js';
import { customConfig, initBuilder } from './custom.js';
import { initAgent } from './agent.js';
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

// dusk lighting
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

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(vw, vh), 0.38, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  if (!innerWidth || !innerHeight || recorder) return; // ignore zero-size + locked while recording
  vw = innerWidth; vh = innerHeight;
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
  renderer.setSize(vw, vh);
  composer.setSize(vw, vh);
});

/* ---------------- app state ---------------- */
const state = {
  sceneKey: 'hyperscale',
  cfg: null,
  load: 0.8,
  tempF: 75,
  utilityOn: true,
  failTimers: [],
  source: 'UTILITY',
  flowStops: null,
  flowIdx: 0,
};

let facility = null;
let flows = null;
const choreo = new Choreographer(camera, controls);
let recorder = null;

function disposeScene() {
  for (const t of state.failTimers) clearTimeout(t);
  state.failTimers = [];
  exitFlow(true);
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

function build3D(cfg) {
  disposeScene();
  state.utilityOn = true;
  state.source = 'UTILITY';
  UI.setUtilityUI(true, '');
  UI.clearInspector();

  state.cfg = cfg;
  flows = new FlowSystem(scene);
  facility = buildFacility(scene, cfg, flows);
  flows.setUtility(true);
  flows.setLoad(state.load);
  if (cfg.shell === 'open') { toggles.roof = false; document.getElementById('tglRoof').checked = false; }
  else if (cfg.building) { toggles.roof = true; document.getElementById('tglRoof').checked = true; } // real buildings arrive with their shell on
  applyToggles();
  UI.setBlurb(cfg.blurb);

  const bb = new THREE.Box3().setFromObject(facility.root);
  const size = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + 10;
  Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.set(0, 0, (bb.min.z + bb.max.z) / 2);
  scene.add(sun.target);

  flyTo('overview', 0);
  updateTelemetry();
}

/* ---------------- tab routing ---------------- */
function switchTab(key) {
  state.sceneKey = key;
  const isDb = key === 'database';
  const isCustom = key === 'custom';
  setDatabaseVisible(isDb);
  document.getElementById('builderPanel').classList.toggle('hidden', !isCustom);
  document.getElementById('agentSection').classList.toggle('hidden', !isCustom);
  if (isDb) return;                      // 3D stays as-is behind the overlay
  if (isCustom) build3D(customConfig());
  else build3D(SCENES[key]);
}

function rebuildCustom() {
  if (state.sceneKey !== 'custom') return;
  const camPos = camera.position.clone(), camTgt = controls.target.clone();
  build3D(customConfig());
  camera.position.copy(camPos);         // keep the user's viewpoint across rebuilds
  controls.target.copy(camTgt);
  controls.update();
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
  flyToPose(preset.pos, preset.target, duration);
}
function flyToPose(pos, target, duration = 1.3) {
  if (duration === 0) {
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
    camera.updateMatrixWorld();
    return;
  }
  flight = {
    t: 0, duration,
    p0: camera.position.clone(), p1: pos.clone(),
    t0: controls.target.clone(), t1: target.clone(),
  };
}
window.__cam = {
  get pos() { return camera.position.toArray(); },
  fly: (k, d) => flyTo(k, d),
  pose: (px, py, pz, tx, ty, tz) => flyToPose(new THREE.Vector3(px, py, pz), new THREE.Vector3(tx, ty, tz), 0),
};
function updateFlight(dt) {
  if (!flight) return;
  flight.t += dt;
  const u = Math.min(1, flight.t / flight.duration);
  const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
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
  if (choreo.active || recorder) return;
  const now = performance.now();
  if (now - lastMove < 50) return;
  lastMove = now;
  const hit = pickAt(e.clientX, e.clientY);
  if (hit !== hovered) {
    hovered = hit;
    if (hoverHelper) { scene.remove(hoverHelper); hoverHelper = null; }
    if (hit) {
      const bb = new THREE.Box3().setFromObject(hit);
      hoverHelper = new THREE.Box3Helper(bb, 0x39c2ff);
      hoverHelper.material.transparent = true;
      hoverHelper.material.opacity = 0.7;
      scene.add(hoverHelper);
      document.body.style.cursor = 'pointer';
      try {
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
  if (moved > 6) return;
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
  // cooling-technology-specific response: DLC plants barely feel weather (dry-cooler
  // approach temp); air plants swing hard and benefit more from economizer hours.
  const base = state.cfg?.basePUE ?? 1.4;
  const liquid = state.cfg?.cooling === 'liquid';
  const temp = state.tempF;
  const hotSlope = liquid ? 0.0028 : 0.0062;
  const econSlope = liquid ? 0.0010 : 0.0035;
  const partLoad = liquid ? 0.10 : 0.22;   // fixed losses dominate more in air plants
  let pue = base + Math.max(0, temp - 65) * hotSlope - Math.max(0, 55 - temp) * econSlope;
  pue += (1 - state.load) * partLoad;
  if (state.source === 'GENERATOR') pue += 0.05;
  return Math.max(1.03, pue);
}

function updateTelemetry() {
  if (!facility) return;
  const s = facility.stats;
  const itKW = s.itKW * state.load;
  const pue = computePUE();
  UI.updateTelemetry({
    itKW, totalKW: itKW * pue, pue,
    racks: s.racks,
    kwPerRack: s.kwPerRack * state.load,
    source: state.source,
    gpus: s.gpus,
    wsPct: s.whiteSpacePct,
  });
}

function failUtility() {
  state.utilityOn = false;
  state.source = 'BATTERY';
  for (const f of flows.power) f.setEnabled(false);
  flows._utilityOn = false;
  // ride-through is a function of THIS build: cabinets × 250 kWh vs live IT draw
  const battCabs = state.cfg?.siteOverrides?.battCabinets
    ?? state.cfg?.gray?.find(g => g.id === 'ELC-005')?.count ?? 0;
  const itNow = Math.max(1, (facility?.stats.itKW ?? 1000) * state.load);
  const rideMin = battCabs * 250 * 60 / itNow;
  UI.setUtilityUI(false, `⚡ Grid lost. UPS on batteries — ~${rideMin.toFixed(1)} min ride-through at current ${(itNow / 1000).toFixed(1)} MW load…`, 'alert');
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

/* ---------------- education: flow walkthrough ---------------- */
const flowCard = document.getElementById('flowCard');

function startFlow() {
  if (!facility || state.sceneKey === 'database') return;
  state.flowStops = buildFlowStops(facility, state.cfg);
  state.flowIdx = 0;
  flowCard.classList.remove('hidden');
  showFlowStop(0);
}

function showFlowStop(i) {
  const stops = state.flowStops;
  if (!stops) return;
  state.flowIdx = Math.max(0, Math.min(stops.length - 1, i));
  const stop = stops[state.flowIdx];
  document.getElementById('flowTitle').textContent = stop.title;
  document.getElementById('flowBody').innerHTML = stop.body;
  document.getElementById('flowPos').textContent = `${state.flowIdx + 1} / ${stops.length}`;
  document.getElementById('flowPrev').disabled = state.flowIdx === 0;
  document.getElementById('flowNext').textContent = state.flowIdx === stops.length - 1 ? 'Finish ✓' : 'Next →';
  flyToPose(stop.cam.pos, stop.cam.target, 1.6);
  // emphasize the systems this stop teaches
  flows.setPowerVisible(stop.systems.power);
  flows.setCoolantVisible(stop.systems.coolant);
  flows.setAirVisible(stop.systems.air);
  flows.setHeatVisible(stop.systems.heat);
}

function exitFlow(silent = false) {
  if (!state.flowStops) return;
  state.flowStops = null;
  flowCard.classList.add('hidden');
  if (!silent && flows) applyToggles(); // restore user's system toggles
}

document.getElementById('flowPrev').addEventListener('click', () => showFlowStop(state.flowIdx - 1));
document.getElementById('flowNext').addEventListener('click', () => {
  if (state.flowIdx >= state.flowStops.length - 1) { exitFlow(); flyTo('overview'); }
  else showFlowStop(state.flowIdx + 1);
});
document.getElementById('flowExit').addEventListener('click', () => exitFlow());
document.getElementById('btnFlow').addEventListener('click', startFlow);

/* ---------------- education: equipment guide ---------------- */
const guideOverlay = document.getElementById('guideOverlay');
document.getElementById('btnGuide').addEventListener('click', () => {
  if (!facility || state.sceneKey === 'database') return;
  document.getElementById('guideContent').innerHTML = buildEquipmentGuide(facility, state.cfg);
  guideOverlay.classList.remove('hidden');
});
document.getElementById('guideClose').addEventListener('click', () => guideOverlay.classList.add('hidden'));
guideOverlay.addEventListener('click', e => {
  if (e.target === guideOverlay) { guideOverlay.classList.add('hidden'); return; }
  const item = e.target.closest('.guide-item');
  if (!item) return;
  const id = item.dataset.flyto;
  const positions = facility.instances.get(id);
  if (positions?.length) {
    guideOverlay.classList.add('hidden');
    const p = positions[0];
    const off = Math.max(3, new THREE.Box3().setFromObject(facility.root).getSize(new THREE.Vector3()).length() * 0.02);
    flyToPose(new THREE.Vector3(p.x + off * 1.4, p.y + off, p.z + off * 1.6), new THREE.Vector3(p.x, p.y + 1, p.z), 1.5);
    UI.showInspector(id, {});
  }
});

/* ---------------- cinematic tour + recording ---------------- */
function startCinematic({ record = false, w = 1920, h = 1080, fps = 60 } = {}) {
  if (!facility) return;
  document.body.classList.add('tour-mode');
  exitFlow(true);
  // full systems on for the beauty pass
  flows.setPowerVisible(true); flows.setCoolantVisible(true);
  flows.setAirVisible(true); flows.setHeatVisible(true);

  if (record) {
    recorder = new TourRecorder(canvas, { width: w, height: h, fps });
    vw = w; vh = h;
    renderer.setSize(w, h, false);          // drawing buffer at video res; CSS keeps it fullscreen
    renderer.setPixelRatio(1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
    recorder.start();
  }

  const keys = cinematicKeys(facility, state.cfg);
  choreo.start(keys, {
    onCaption: (cap, dur) => recorder?.setCaption(cap, dur),
    onDone: async () => {
      if (recorder) {
        // hold the final frame briefly, then finish
        setTimeout(async () => {
          await recorder.stop('dc-buildout-tour.webm');
          recorder = null;
          document.body.classList.remove('tour-mode');
          document.title = 'TOUR-DONE — Data Center Buildout';
        }, 900);
      } else {
        document.body.classList.remove('tour-mode');
      }
    },
  });
}
window.__tour = opts => startCinematic(opts ?? {});

/* ---------------- UI wiring ---------------- */
UI.initUI({
  onScene: key => switchTab(key),
  onCamera: preset => flyTo(preset),
  onToggle: (name, on) => { toggles[name] = on; applyToggles(); },
  onLoad: v => { state.load = v; flows?.setLoad(v); updateTelemetry(); },
  onTemp: v => { state.tempF = v; updateTelemetry(); },
  onUtilityToggle: () => state.utilityOn ? failUtility() : restoreUtility(),
});

/* ---------------- render loop ---------------- */
const clock = new THREE.Clock();
let rafAlive = false;
function step() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  animateBlink(t);
  flows?.update(dt, t);
  if (choreo.active) choreo.update(dt);
  else { updateFlight(dt); controls.update(); }
  composer.render();
  if (recorder) recorder.compose(dt);
}
function animate() {
  rafAlive = true;
  requestAnimationFrame(animate);
  step();
}
setTimeout(() => {
  if (!rafAlive) {
    console.warn('rAF suspended — falling back to timer loop');
    setInterval(step, 33);
  }
}, 600);

/* ---------------- boot ---------------- */
(async function boot() {
  UI.setLoadProgress(15, 'Loading component catalog…');
  const catalog = await loadCatalog();
  UI.setLoadProgress(40, `${catalog.components.length} SKUs loaded — building facility…`);
  await new Promise(r => setTimeout(r, 30));

  initDatabase();
  initBuilder(rebuildCustom);
  initAgent(() => ({ cfg: state.cfg, stats: facility?.stats ?? {} }));

  const params = new URLSearchParams(location.search);
  const startScene = params.get('scene') && (SCENES[params.get('scene')] || params.get('scene') === 'custom')
    ? params.get('scene') : 'hyperscale';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.scene === startScene));
  switchTab(startScene);

  UI.setLoadProgress(100, 'Ready');
  setTimeout(UI.hideLoading, 350);
  animate();

  if (params.get('tour') === 'cine') {
    const record = params.get('record') === '1';
    const fps = +(params.get('fps') ?? 60);
    // small delay so fonts/first frames settle
    setTimeout(() => startCinematic({ record, fps }), 1200);
  }
})();
