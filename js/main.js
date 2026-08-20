// main.js — renderer, camera, scene lifecycle, picking, ops simulation,
// tab routing (4 archetypes + database + custom), education, cinematic tours.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { loadCatalog, comp } from './catalog.js?b47';
import { animateBlink } from './materials.js?b47';
import { FlowSystem } from './flows.js?b47';
import { buildFacility } from './facility.js?b47';
import { SCENES } from './scenes.js?b47';
import { Choreographer, cinematicKeys, commercialKeys, TourRecorder } from './tour.js?b47';
import { buildFlowStops, buildEquipmentGuide } from './learn.js?b47';
import { initDatabase, setDatabaseVisible } from './database.js?b47';
import { customConfig, initBuilder, custom, setPlacement, clearPlacement } from './custom.js?b47';
import { initAgent } from './agent.js?b47';
import { openSiteMap, refreshSiteMap, closeSiteMap } from './sitemap.js?b47';
import * as UI from './ui.js?b47';

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
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.6;          // get nose-close to a tray
controls.maxDistance = 420;
controls.zoomSpeed = 1.5;
controls.zoomToCursor = true;        // scroll dives at what you're pointing at

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

/* PLANT overrides — the non-chip levers, user-controllable on every scene.
   'auto' = the optimized default (bopFor for chip builds, archetype design
   otherwise). Overrides mutate a copy of the config + adjust basePUE with
   documented deltas, and the analyst calls out what you changed. */
const plantOv = { heat: 'auto', power: 'auto', air: 'auto', red: 'n1' };

function applyPlantOverrides(cfgIn) {
  const cfg = { ...cfgIn, yard: { ...cfgIn.yard }, gray: cfgIn.gray.map(g => ({ ...g })) };
  const liquid = cfg.cooling === 'liquid';
  const kwRack = cfg.rows.kwPerRack || 8;
  const itMW = (cfg.rows.maxRacks ?? cfg.rows.count * cfg.rows.racksPerRow) * kwRack / 1000;
  const notes = [];
  let dPUE = 0;

  // heat rejection tech
  if (plantOv.heat === 'dry' && cfg.yard.chillers.id !== 'MEC-005') {
    if (liquid) { cfg.yard.chillers.id = 'MEC-005'; dPUE -= 0.02; notes.push('forced adiabatic dry coolers (−0.02 PUE)'); }
    else notes.push('dry coolers alone can’t serve a chilled-water air plant — override ignored');
  } else if (plantOv.heat === 'chillers' && cfg.yard.chillers.id === 'MEC-005') {
    cfg.yard.chillers.id = 'MEC-001'; dPUE += 0.02; notes.push('forced air-cooled chillers (+0.02 PUE, WUE→0)');
  }

  // power topology
  const hasBess = (cfg.yard.bess ?? 0) > 0;
  if (plantOv.power === 'ups' && hasBess) {
    cfg.yard.bess = 0; dPUE += 0.01;
    cfg.gray = cfg.gray.map(g => g.id === 'ELC-001' ? { ...g, count: g.count + 1 } : g.id === 'ELC-005' ? { ...g, count: Math.max(4, g.count * 2) } : g);
    notes.push('forced central UPS (+0.01 PUE, BESS removed, UPS room grows)');
  } else if (plantOv.power === 'bess' && !hasBess) {
    cfg.yard.bess = Math.min(4, Math.ceil(itMW * (5 / 60) / 2) + 1); dPUE -= 0.01;
    cfg.gray = cfg.gray.map(g => g.id === 'ELC-001' || g.id === 'ELC-003' || g.id === 'ELC-002' || g.id === 'ELC-004' ? { ...g, count: Math.max(1, g.count - 1) } : g.id === 'ELC-005' ? { ...g, count: Math.max(2, Math.floor(g.count / 2)) } : g);
    notes.push(`forced BESS ride-through (−0.01 PUE, ${cfg.yard.bess}× 2 MWh blocks on the pad)`);
  }

  // air supply temp (air-cooled scenes only)
  if (!liquid) {
    const optimizedAlready = !!cfg.chip;   // chip builds already run 27 °C in auto
    if (plantOv.air === 'std' && optimizedAlready) { dPUE += 0.03; notes.push('conservative 24 °C supply (+0.03 PUE)'); }
    if (plantOv.air === 'allow' && !optimizedAlready) { dPUE -= 0.03; notes.push('27 °C ASHRAE-allowable supply (−0.03 PUE)'); }
  }

  // redundancy
  if (plantOv.red === 'n') {
    cfg.yard.gensets = { ...cfg.yard.gensets, count: Math.max(1, cfg.yard.gensets.count - 1) };
    cfg.yard.chillers = { ...cfg.yard.chillers, count: Math.max(1, cfg.yard.chillers.count - 1) };
    notes.push('N-only redundancy — one failure = load shed (analyst will flag)');
  } else if (plantOv.red === '2n') {
    cfg.yard.gensets = { ...cfg.yard.gensets, count: Math.min(16, Math.ceil(cfg.yard.gensets.count * 1.8) ) };
    cfg.yard.chillers = { ...cfg.yard.chillers, count: Math.min(28, Math.ceil(cfg.yard.chillers.count * 1.8)) };
    dPUE += 0.01;
    notes.push('2N plant (+0.01 PUE fixed losses, yard nearly doubles)');
  }

  cfg.basePUE = Math.max(1.06, Math.round((cfg.basePUE + dPUE) * 100) / 100);
  cfg._plantOv = { active: notes.length > 0, notes, dPUE };
  return cfg;
}

function build3D(cfg) {
  cfg = applyPlantOverrides(cfg);
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
  // shell defaults apply only until the user touches the roof toggle themselves —
  // after that, their choice survives every rebuild/chip switch
  if (roofAuto) {
    toggles.roof = cfg.shell === 'open' ? false : !!cfg.building;
    document.getElementById('tglRoof').checked = toggles.roof;
  } else if (cfg.shell === 'open') {
    toggles.roof = false;
    document.getElementById('tglRoof').checked = false;
  }
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
let roofAuto = true;   // false once the user flips the roof toggle themselves
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

// double-click: focus the camera on whatever you hit (equipment or floor)
addEventListener('dblclick', e => {
  if (e.target !== renderer.domElement || choreo.active) return;
  pointer.set((e.clientX / vw) * 2 - 1, -(e.clientY / vh) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const hit = hits.find(h => h.object.visible && !h.object.isSprite);
  if (!hit) return;
  const p = hit.point.clone();
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(3, camera.position.distanceTo(p) * 0.45);
  flyToPose(p.clone().add(dir.multiplyScalar(dist)), p, 0.9);
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
function startCinematic({ record = false, w = 1920, h = 1080, fps = 60, mode = 'cine' } = {}) {
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

  const keys = mode === 'promo' ? commercialKeys(facility, state.cfg) : cinematicKeys(facility, state.cfg);
  if (mode === 'promo') {
    // scripted grid-failure beat: hits as the camera rises toward the gensets
    setTimeout(() => { if (state.utilityOn) failUtility(); }, 11800);
  }
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
  onToggle: (name, on) => { if (name === 'roof') roofAuto = false; toggles[name] = on; applyToggles(); },
  onLoad: v => { state.load = v; flows?.setLoad(v); updateTelemetry(); },
  onTemp: v => { state.tempF = v; updateTelemetry(); },
  onUtilityToggle: () => state.utilityOn ? failUtility() : restoreUtility(),
});


/* ---------------- self-driving demo (?demo=1) ----------------
   Clicks through the real UI on a timer: archetype presets, then the Custom
   page on the Lehigh site, flipping chip platforms and shell modes so the
   physical + operational differences play out on screen. */
function runDemo() {
  const click = sel => document.querySelector(sel)?.click();
  const setSelect = (id, val) => { const el = document.getElementById(id); if (!el) return; el.value = val; el.dispatchEvent(new Event('input')); };
  const showAnalysis = () => { click('#agentRun'); setTimeout(() => document.getElementById('rightPanel').scrollTo({ top: 99999, behavior: 'smooth' }), 400); };
  const topRight = () => document.getElementById('rightPanel').scrollTo({ top: 0, behavior: 'smooth' });
  const steps = [
    [2800,  () => click('.tab[data-scene="cloud"]')],
    [6200,  () => click('.tab[data-scene="colocation"]')],
    [9600,  () => click('.tab[data-scene="enterprise"]')],
    [13000, () => click('.tab[data-scene="custom"]')],
    [14200, () => setSelect('bldSite', 'lehigh')],          // Lehigh, GB200 default
    [18200, showAnalysis],
    [22500, () => { topRight(); setSelect('bldChip', 'h100'); }],   // air platform: in-row coolers, space-limited
    [26500, showAnalysis],
    [30800, () => { topRight(); setSelect('bldChip', 'mi450x'); }], // AMD Helios rack-scale
    [34800, showAnalysis],
    [38600, () => { topRight(); click('.shell-btn[data-shell="glass"]'); }],
    [42400, () => click('.shell-btn[data-shell="open"]')],
    [45400, () => window.__cam.fly('rack', 1.6)],
  ];
  for (const [t, fn] of steps) setTimeout(fn, t);
}

/* ---------------- render loop ---------------- */
const clock = new THREE.Clock();
let rafAlive = false;
function step() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  animateBlink(t);
  flows?.update(dt, t);
  if (choreo.active) choreo.update(dt);
  else {
    updateFlight(dt);
    controls.update();
    if (camera.position.y < 0.35) camera.position.y = 0.35;   // never dig under the slab
    if (controls.target.y < 0) controls.target.y = 0;
  }
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
  const mapHandlers = {
    onPlace: (key, x, z) => {
      setPlacement(custom.site, key, x, z);
      rebuildCustom();
      refreshSiteMap(facility, state.cfg);
      updateTelemetry();
    },
    onReset: () => {
      clearPlacement(custom.site);
      rebuildCustom();
      refreshSiteMap(facility, state.cfg);
    },
  };
  window.__place = mapHandlers.onPlace;   // test hook
  document.getElementById('btnSiteMap').addEventListener('click', () => openSiteMap(facility, state.cfg, mapHandlers));
  for (const id of ['ovHeat', 'ovPower', 'ovAir', 'ovRed']) {
    document.getElementById(id).addEventListener('input', e => {
      plantOv[{ ovHeat: 'heat', ovPower: 'power', ovAir: 'air', ovRed: 'red' }[id]] = e.target.value;
      if (state.sceneKey === 'custom') rebuildCustom();
      else if (state.sceneKey !== 'database') build3D(SCENES[state.sceneKey]);
    });
  }
  document.getElementById('mapClose').addEventListener('click', closeSiteMap);
  document.getElementById('mapOverlay').addEventListener('click', e => { if (e.target.id === 'mapOverlay') closeSiteMap(); });
  initAgent(() => ({ cfg: state.cfg, stats: facility?.stats ?? {} }));

  const params = new URLSearchParams(location.search);
  const startScene = params.get('scene') && (SCENES[params.get('scene')] || params.get('scene') === 'custom')
    ? params.get('scene') : 'hyperscale';
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.scene === startScene));
  switchTab(startScene);

  UI.setLoadProgress(100, 'Ready');
  setTimeout(UI.hideLoading, 350);
  animate();

  if (params.get('demo') === '1') setTimeout(runDemo, 400);
  const tourMode = params.get('tour');
  if (tourMode === 'cine' || tourMode === 'promo') {
    const record = params.get('record') === '1';
    const fps = +(params.get('fps') ?? 60);
    // small delay so fonts/first frames settle
    setTimeout(() => startCinematic({ record, fps, mode: tourMode }), 1200);
  }
})();
