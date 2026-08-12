// builders.js — parametric, dimension-true equipment builders.
// Every builder returns a THREE.Group whose base sits at y=0, centered on its
// footprint, front facing +Z. Groups carry userData.componentId for the inspector.
import * as THREE from 'three';
import { comp, dims, STD, MM } from './catalog.js';
import { mats, blinkMats } from './materials.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
BOX.userData.shared = true; // never disposed on scene teardown

function box(w, h, d, mat) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function tag(group, componentId, extra = {}) {
  // NOTE: keep userData JSON-safe — Object3D.clone() deep-copies it via JSON.
  group.userData = { componentId, pickable: true, ...extra };
  return group;
}

function led(mat, size = 0.012) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(size, size, 0.004);
  return m;
}

// scatter tiny status LEDs on a faceplate
function ledStrip(parent, w, y, z, count, matPool) {
  for (let i = 0; i < count; i++) {
    const l = led(matPool[i % matPool.length]);
    l.position.set(-w / 2 + 0.03 + i * 0.026, y, z);
    parent.add(l);
  }
}

/* ============================================================ RACKS */

// Generic 19" enclosure (RCK-001/002/003) with front door + rear mesh + rails.
export function buildRackEnclosure(id, { fillRU = 0.75, doorOpen = false } = {}) {
  const { w, d, h } = dims(id);
  const c = comp(id);
  const g = new THREE.Group();
  const t = 0.03; // frame member thickness

  // frame: 4 corner posts + top/bottom
  const frameMat = mats.rackFrame();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(t, h, t, frameMat);
    post.position.set(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2));
    g.add(post);
  }
  const top = box(w, t, d, frameMat); top.position.y = h - t / 2; g.add(top);
  const bot = box(w, 0.1, d, frameMat); bot.position.y = 0.05; g.add(bot);

  // side panels
  for (const sx of [-1, 1]) {
    const side = box(0.012, h - 0.14, d - 0.04, mats.rackDoor());
    side.position.set(sx * (w / 2 - 0.006), h / 2, 0);
    g.add(side);
  }
  // perforated doors front/back
  const front = box(w - 0.02, h - 0.14, 0.014, mats.rackMesh());
  front.position.set(0, h / 2, d / 2 - 0.007);
  g.add(front);
  const rear = front.clone(); rear.position.z = -d / 2 + 0.007; g.add(rear);

  // interior filled with pseudo-equipment (visible through mesh doors as glow strips)
  const ru = parseInt(c.Height_RU) || 42;
  const filled = Math.floor(ru * fillRU);
  const faceW = 0.4826; // 19" panel
  let u = 0;
  while (u < filled) {
    const uh = Math.random() < 0.25 ? 2 : 1;
    const unit = box(Math.min(faceW, w - 0.1), uh * STD.RU - 0.006, d - 0.24, mats.serverFace());
    unit.position.set(0, 0.1 + (u + uh / 2) * STD.RU, -0.02);
    g.add(unit);
    ledStrip(unit, 0.2, 0, (d - 0.24) / 2 + 0.004, 2 + (u % 3), blinkMats);
    u += uh;
  }
  return tag(g, id);
}

// NVIDIA GB200/GB300 NVL72 rack-scale system (RCK-004/005): built per ASM-001 —
// 18 compute trays (9+9), 9 NVSwitch trays center, 8 power shelves top/bottom.
export function buildNVL72(id = 'RCK-004') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const frameMat = mats.rackFrame();
  const t = 0.03;

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(t, h, t, frameMat);
    post.position.set(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2));
    g.add(post);
  }
  const top = box(w, 0.06, d, frameMat); top.position.y = h - 0.03; g.add(top);
  const bot = box(w, 0.12, d, frameMat); bot.position.y = 0.06; g.add(bot);
  for (const sx of [-1, 1]) {
    const side = box(0.012, h - 0.2, d - 0.05, mats.rackDoor());
    side.position.set(sx * (w / 2 - 0.006), h / 2, 0);
    g.add(side);
  }

  const bayW = 0.538;            // ORv3 21" bay
  const ouH = STD.OU;
  const trayD = d - 0.18;
  let y = 0.14;
  const stack = [];
  // bottom: 4 power shelves, 9 compute, 9 NVSwitch, 9 compute, 4 power shelves
  for (let i = 0; i < 4; i++) stack.push('pwr');
  for (let i = 0; i < 9; i++) stack.push('cmp');
  for (let i = 0; i < 9; i++) stack.push('nvs');
  for (let i = 0; i < 9; i++) stack.push('cmp');
  for (let i = 0; i < 4; i++) stack.push('pwr');

  for (const kind of stack) {
    const mat = kind === 'cmp' ? mats.nvidiaTray() : kind === 'nvs' ? mats.nvSwitch() : mats.powerShelf();
    const tray = box(bayW, ouH - 0.006, trayD, mat);
    tray.position.set(0, y + ouH / 2, 0.01);
    g.add(tray);
    const ledMat = kind === 'cmp' ? blinkMats[0] : kind === 'nvs' ? blinkMats[1] : blinkMats[2];
    ledStrip(tray, bayW * 0.8, 0, trayD / 2 + 0.004, kind === 'cmp' ? 4 : 2, [ledMat]);
    y += ouH;
  }

  // rear blind-mate liquid manifolds (blue supply / orange return verticals)
  const manifoldS = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, h - 0.3, 10), mats.pipeSupply());
  manifoldS.position.set(-w / 2 + 0.08, h / 2, -d / 2 + 0.05);
  g.add(manifoldS);
  const manifoldR = manifoldS.clone();
  manifoldR.material = mats.pipeReturn();
  manifoldR.position.x = w / 2 - 0.08;
  g.add(manifoldR);

  return tag(g, id);
}

// OCP Open Rack v3 (RCK-006) — open frame, 48V busbar, OU shelves
export function buildORv3(id = 'RCK-006', { fill = 0.8 } = {}) {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const frameMat = mats.rackFrame();
  const t = 0.035;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(t, h, t, frameMat);
    post.position.set(sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2));
    g.add(post);
  }
  const top = box(w, 0.05, d, frameMat); top.position.y = h - 0.025; g.add(top);
  const bot = box(w, 0.1, d, frameMat); bot.position.y = 0.05; g.add(bot);
  // 48V busbar pair down the back
  const bus = box(0.02, h - 0.2, 0.04, mats.busway());
  bus.position.set(-0.05, h / 2, -d / 2 + 0.06); g.add(bus);
  const bus2 = bus.clone(); bus2.position.x = 0.05; g.add(bus2);

  const n = Math.floor(((h - 0.3) / STD.OU) * fill);
  let y = 0.12;
  for (let i = 0; i < n; i++) {
    const isPwr = i % 12 === 0;
    const tray = box(0.538, STD.OU - 0.008, d - 0.2, isPwr ? mats.powerShelf() : mats.serverFace());
    tray.position.set(0, y + STD.OU / 2, 0.02);
    g.add(tray);
    if (i % 2 === 0) ledStrip(tray, 0.4, 0, (d - 0.2) / 2 + 0.004, 3, [blinkMats[i % 3]]);
    y += STD.OU;
  }
  return tag(g, id);
}

/* ============================================================ COOLING (white space) */

// Row CDU — Vertiv XDU 1350 class (LCL-002)
export function buildRowCDU(id = 'LCL-002') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.cdu());
  body.position.y = h / 2;
  g.add(body);
  const face = box(w - 0.08, h - 0.5, 0.02, mats.crahDark());
  face.position.set(0, h / 2, d / 2 + 0.005); g.add(face);
  const screen = box(0.24, 0.16, 0.01, mats.screenDark());
  screen.position.set(0, h * 0.78, d / 2 + 0.02); g.add(screen);
  // supply/return stubs
  const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), mats.pipeSupply());
  sup.rotation.x = Math.PI / 2; sup.position.set(-w / 4, 0.4, -d / 2 - 0.2); g.add(sup);
  const ret = sup.clone(); ret.material = mats.pipeReturn(); ret.position.x = w / 4; g.add(ret);
  ledStrip(g, 0.3, h * 0.9, d / 2 + 0.012, 3, blinkMats);
  return tag(g, id);
}

// Liquid-to-air sidecar (LCL-004) / in-row cooler (ACL-001) share a form factor
export function buildInRowCooler(id) {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.crah());
  body.position.y = h / 2; g.add(body);
  // dark coil intake face
  const coil = box(w - 0.06, h - 0.3, 0.02, mats.chillerCoil());
  coil.position.set(0, h / 2, d / 2 + 0.005); g.add(coil);
  const vents = box(w - 0.06, h - 0.3, 0.02, mats.crahDark());
  vents.position.set(0, h / 2, -d / 2 - 0.005); g.add(vents);
  ledStrip(g, 0.2, h - 0.15, d / 2 + 0.015, 2, blinkMats);
  return tag(g, id);
}

// Perimeter CRAH — Liebert CW146 (ACL-002), wide unit
export function buildCRAH(id = 'ACL-002') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.crah());
  body.position.y = h / 2; g.add(body);
  const grille = box(w - 0.15, h * 0.45, 0.02, mats.crahDark());
  grille.position.set(0, h * 0.32, d / 2 + 0.005); g.add(grille);
  const panel = box(w - 0.15, h * 0.28, 0.02, mats.crahDark());
  panel.position.set(0, h * 0.8, d / 2 + 0.005); g.add(panel);
  const screen = box(0.3, 0.2, 0.012, mats.screenDark());
  screen.position.set(w / 4, h * 0.8, d / 2 + 0.02); g.add(screen);
  return tag(g, id);
}

// Rear-door heat exchanger (LCL-003) — thin panel that mounts on rack rear
export function buildRearDoorHX(id = 'LCL-003') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const door = box(w, h, d, mats.cdu());
  door.position.y = h / 2; g.add(door);
  const coil = box(w - 0.05, h - 0.1, 0.02, mats.chillerCoil());
  coil.position.set(0, h / 2, d / 2 + 0.002); g.add(coil);
  return tag(g, id);
}

/* ============================================================ POWER (white space) */

export function buildFloorPDU(id = 'PDW-002') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.pdu());
  body.position.y = h / 2; g.add(body);
  const face = box(w - 0.1, h - 0.3, 0.02, mats.upsAccent());
  face.position.set(0, h / 2, d / 2 + 0.005); g.add(face);
  const screen = box(0.3, 0.22, 0.012, mats.screenDark());
  screen.position.set(0, h * 0.75, d / 2 + 0.02); g.add(screen);
  ledStrip(g, 0.3, h * 0.55, d / 2 + 0.015, 4, blinkMats);
  return tag(g, id);
}

export function buildRPP(id = 'PDW-003') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.pdu());
  body.position.y = h / 2; g.add(body);
  ledStrip(g, 0.2, h * 0.8, d / 2 + 0.008, 2, blinkMats);
  return tag(g, id);
}

// Overhead busway segment (PDW-001). length in m; returns group along X axis.
export function buildBusway(id = 'PDW-001', length = 10, variant = 'A') {
  const c = dims(id); // 146 wide x 171 tall profile
  const g = new THREE.Group();
  const mat = variant === 'A' ? mats.busway() : mats.buswayB();
  const rail = box(length, c.h, c.w, mat);
  rail.position.y = 0; g.add(rail);
  // plug-in drop boxes every 1.2 m
  const n = Math.floor(length / 1.2);
  for (let i = 0; i < n; i++) {
    const dropBox = box(0.2, 0.12, 0.18, mats.pdu());
    dropBox.position.set(-length / 2 + 0.6 + i * 1.2, -c.h / 2 - 0.06, 0);
    g.add(dropBox);
  }
  return tag(g, id, { noBase: true });
}

// Cable tray run (CPW-001/004/005) along X
export function buildCableTray(id, length = 10) {
  const c = dims(id);
  const g = new THREE.Group();
  const tray = box(length, c.h, c.w, mats.cableTray());
  g.add(tray);
  return tag(g, id, { noBase: true });
}

// Fiber raceway (CPW-002/003) along X — amber duct
export function buildFiberDuct(id, length = 10) {
  const c = dims(id);
  const g = new THREE.Group();
  const duct = box(length, c.h, c.w, mats.fiberDuct());
  g.add(duct);
  return tag(g, id, { noBase: true });
}

/* ============================================================ GRAY SPACE */

export function buildUPS(id) {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.upsBody());
  body.position.y = h / 2; g.add(body);
  // segmented cabinet doors
  const nDoors = Math.max(2, Math.round(w / 0.8));
  const dw = (w - 0.06) / nDoors;
  for (let i = 0; i < nDoors; i++) {
    const door = box(dw - 0.02, h - 0.16, 0.02, mats.upsAccent());
    door.position.set(-w / 2 + 0.03 + dw * (i + 0.5), h / 2, d / 2 + 0.005);
    g.add(door);
  }
  const screen = box(0.3, 0.2, 0.014, mats.screenDark());
  screen.position.set(-w / 2 + 0.45, h * 0.75, d / 2 + 0.02); g.add(screen);
  ledStrip(g, 0.4, h * 0.6, d / 2 + 0.016, 5, blinkMats);
  return tag(g, id);
}

export function buildBatteryCabinet(id = 'ELC-005') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.battery());
  body.position.y = h / 2; g.add(body);
  // module slots
  for (let i = 0; i < 6; i++) {
    const slot = box(w - 0.1, 0.08, 0.015, mats.upsAccent());
    slot.position.set(0, 0.25 + i * (h - 0.5) / 5, d / 2 + 0.005);
    g.add(slot);
    const l = led(blinkMats[i % 3]); l.position.set(w / 2 - 0.09, 0.25 + i * (h - 0.5) / 5, d / 2 + 0.012); g.add(l);
  }
  return tag(g, id);
}

export function buildSwitchgear(id, sections = 4) {
  const { w, d, h } = dims(id); // per-section dims
  const g = new THREE.Group();
  const totalW = w * sections;
  for (let i = 0; i < sections; i++) {
    const sec = box(w - 0.02, h, d, mats.switchgear());
    sec.position.set(-totalW / 2 + w * (i + 0.5), h / 2, 0);
    g.add(sec);
    const door = box(w - 0.1, h - 0.2, 0.02, mats.upsAccent());
    door.position.set(-totalW / 2 + w * (i + 0.5), h / 2, d / 2 + 0.005);
    g.add(door);
    const l = led(blinkMats[i % 3], 0.018);
    l.position.set(-totalW / 2 + w * (i + 0.5), h * 0.82, d / 2 + 0.02);
    g.add(l);
  }
  return tag(g, id, { sections });
}

export function buildTransformer(id = 'ELC-008') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const core = box(w * 0.55, h * 0.8, d * 0.85, mats.transformer());
  core.position.y = h * 0.42; g.add(core);
  // radiator fins both sides
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const fin = box(w * 0.16, h * 0.6, 0.03, mats.transformerFin());
      fin.position.set(s * w * 0.38, h * 0.42, -d * 0.35 + i * d * 0.14);
      g.add(fin);
    }
  }
  // HV bushings
  for (let i = -1; i <= 1; i++) {
    const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.35, 8), mats.tank());
    bushing.position.set(i * w * 0.16, h * 0.82 + 0.17, 0);
    g.add(bushing);
  }
  return tag(g, id);
}

export function buildATS(id = 'ELC-010') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.switchgear());
  body.position.y = h / 2; g.add(body);
  const face = box(w - 0.1, h - 0.2, 0.02, mats.upsAccent());
  face.position.set(0, h / 2, d / 2 + 0.005); g.add(face);
  // source A / source B indicator leds
  const a = led(blinkMats[0], 0.03); a.position.set(-w / 5, h * 0.75, d / 2 + 0.02); g.add(a);
  const b = led(blinkMats[2], 0.03); b.position.set(w / 5, h * 0.75, d / 2 + 0.02); g.add(b);
  return tag(g, id);
}

export function buildSTS(id = 'ELC-009') {
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const body = box(w, h, d, mats.switchgear());
  body.position.y = h / 2; g.add(body);
  const screen = box(0.26, 0.18, 0.012, mats.screenDark());
  screen.position.set(0, h * 0.7, d / 2 + 0.02); g.add(screen);
  return tag(g, id);
}

/* ============================================================ YARD */

// Enclosed genset (BKP-003) — 40ft-class enclosure with radiator end + exhaust.
// Returns { group, fans: [], exhaustAnchor } for animation hooks.
export function buildGenset(id = 'BKP-003') {
  const { w: L, d: W, h: H } = dims(id); // 12.19 x 2.44 x 3.96 (length along X)
  const g = new THREE.Group();
  const body = box(L * 0.86, H * 0.72, W, mats.gensetEnclosure());
  body.position.set(-L * 0.07, H * 0.36, 0); g.add(body);
  // louvered radiator end
  const rad = box(L * 0.14, H * 0.72, W, mats.gensetDark());
  rad.position.set(L * 0.43 - L * 0.07 + L * 0.07, H * 0.36, 0);
  rad.position.x = L * 0.43; g.add(rad);
  // radiator fan (visible disc on the end face)
  const fan = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(W * 0.3, 0.04, 8, 24), mats.fanRing());
  fan.add(ring);
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(W * 0.26, 0.1, 0.02), mats.fanBlade());
    blade.position.x = W * 0.14;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 5) * Math.PI * 2;
    holder.add(blade);
    fan.add(holder);
  }
  fan.rotation.y = Math.PI / 2;
  fan.position.set(L * 0.5 + 0.02, H * 0.4, 0);
  g.add(fan);
  // exhaust stack
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, H * 0.5, 10), mats.gensetDark());
  stack.position.set(-L * 0.32, H * 0.72 + H * 0.25, W * 0.2);
  g.add(stack);
  // base fuel tank skid
  const skid = box(L * 0.9, 0.25, W, mats.gensetDark());
  skid.position.set(-L * 0.02, 0.125, 0);
  g.add(skid);
  body.position.y = 0.25 + H * 0.36;
  rad.position.y = 0.25 + H * 0.36; fan.position.y = 0.25 + H * 0.4; stack.position.y = 0.25 + H * 0.72 + H * 0.2;
  // status beacon
  const beacon = led(blinkMats[1], 0.05);
  beacon.position.set(-L * 0.4, H * 0.78, 0); g.add(beacon);
  tag(g, id);
  return { group: g, fans: [fan], exhaustAnchor: new THREE.Vector3(-L * 0.32, H * 0.97, W * 0.2) };
}

// Open genset on skid (BKP-001/002)
export function buildOpenGenset(id) {
  const { w: L, d: W, h: H } = dims(id);
  const g = new THREE.Group();
  const skid = box(L, 0.2, W, mats.gensetDark());
  skid.position.y = 0.1; g.add(skid);
  const engine = box(L * 0.55, H * 0.6, W * 0.85, mats.genset());
  engine.position.set(-L * 0.15, 0.2 + H * 0.3, 0); g.add(engine);
  const alternator = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.3, W * 0.3, L * 0.25, 14), mats.gensetDark());
  alternator.rotation.z = Math.PI / 2;
  alternator.position.set(L * 0.28, 0.2 + H * 0.28, 0); g.add(alternator);
  const rad = box(L * 0.1, H * 0.7, W * 0.9, mats.chillerCoil());
  rad.position.set(-L * 0.45, 0.2 + H * 0.35, 0); g.add(rad);
  tag(g, id);
  return { group: g, fans: [], exhaustAnchor: new THREE.Vector3(-L * 0.2, H * 0.85, 0) };
}

// Air-cooled chiller / dry cooler (MEC-001/002/005): long unit with top fan row.
export function buildChiller(id) {
  const { w: L, d: W, h: H } = dims(id);
  const g = new THREE.Group();
  const body = box(L, H * 0.55, W, mats.chiller());
  body.position.y = H * 0.275; g.add(body);
  // V-coil banks
  for (const s of [-1, 1]) {
    const coil = new THREE.Mesh(new THREE.BoxGeometry(L * 0.96, H * 0.45, 0.06), mats.chillerCoil());
    coil.position.set(0, H * 0.7, s * W * 0.28);
    coil.rotation.x = s * -0.5;
    g.add(coil);
  }
  // top fans
  const fans = [];
  const nFans = Math.max(4, Math.floor(L / 1.6));
  for (let i = 0; i < nFans; i++) {
    const fan = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 22), mats.fanRing());
    ring.rotation.x = Math.PI / 2;
    fan.add(ring);
    const hub = new THREE.Group();
    for (let b = 0; b < 6; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.015, 0.14), mats.fanBlade());
      blade.position.x = 0.27;
      const holder = new THREE.Group();
      holder.rotation.y = (b / 6) * Math.PI * 2;
      holder.add(blade);
      hub.add(holder);
    }
    fan.add(hub);
    fan.userData.hub = hub;
    fan.position.set(-L / 2 + (i + 0.5) * (L / nFans), H * 0.93, 0);
    g.add(fan);
    fans.push(fan);
  }
  tag(g, id);
  return { group: g, fans };
}

// Water-cooled centrifugal chiller (MEC-003) — indoor plant
export function buildWaterChiller(id = 'MEC-003') {
  const { w: L, d: W, h: H } = dims(id);
  const g = new THREE.Group();
  // two big shells (evaporator + condenser)
  for (const [i, yOff] of [[0, 0], [1, 0]].entries()) {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.28, W * 0.28, L * 0.9, 18), mats.tank());
    shell.rotation.z = Math.PI / 2;
    shell.position.set(0, W * 0.3 + i * W * 0.5, (i === 0 ? -1 : 1) * W * 0.1);
    shell.position.y = W * 0.3 + i * W * 0.45;
    g.add(shell);
  }
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.18, W * 0.18, L * 0.25, 14), mats.chiller());
  motor.rotation.z = Math.PI / 2;
  motor.position.set(L * 0.2, H * 0.75, 0);
  g.add(motor);
  const panel = box(0.8, 1.6, 0.3, mats.pdu());
  panel.position.set(-L * 0.35, 0.8, W * 0.45); g.add(panel);
  return tag(g, id);
}

// Cooling tower cell (MEC-004)
export function buildCoolingTower(id = 'MEC-004') {
  const { w: L, d: W, h: H } = dims(id);
  const g = new THREE.Group();
  const basin = box(L, H * 0.12, W, mats.gensetDark());
  basin.position.y = H * 0.06; g.add(basin);
  const body = box(L * 0.96, H * 0.62, W * 0.96, mats.coolingTower());
  body.position.y = H * 0.12 + H * 0.31; g.add(body);
  // louvers
  for (const s of [-1, 1]) {
    const louver = box(L * 0.9, H * 0.5, 0.03, mats.chillerCoil());
    louver.position.set(0, H * 0.38, s * W * 0.49);
    g.add(louver);
  }
  // fan cylinder + big fan
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.32, W * 0.4, H * 0.2, 20, 1, true), mats.coolingTower());
  shroud.position.y = H * 0.84; g.add(shroud);
  const fan = new THREE.Group();
  for (let b = 0; b < 7; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(W * 0.28, 0.03, 0.22), mats.fanBlade());
    blade.position.x = W * 0.16;
    const holder = new THREE.Group();
    holder.rotation.y = (b / 7) * Math.PI * 2;
    holder.add(blade);
    fan.add(holder);
  }
  fan.position.y = H * 0.86;
  g.add(fan);
  tag(g, id);
  return { group: g, fans: [{ userData: { hub: fan } }], mistAnchor: new THREE.Vector3(0, H * 0.95, 0) };
}

// TES tank (MEC-007) / fuel tank (FUE-001)
export function buildTank(id, vertical = true) {
  const { w: L, d: W, h: H } = dims(id);
  const g = new THREE.Group();
  if (vertical) {
    const r = Math.min(L, W) / 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H, 28), mats.tank());
    t.position.y = H / 2; t.castShadow = t.receiveShadow = true;
    g.add(t);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.tank());
    cap.position.y = H; cap.scale.y = 0.25; g.add(cap);
  } else {
    const r = H / 2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L * 0.92, 22), mats.fuelTank());
    t.rotation.z = Math.PI / 2; t.position.y = r + 0.15; t.castShadow = true;
    g.add(t);
    for (const s of [-1, 1]) {
      const saddle = box(0.3, r, W, mats.gensetDark());
      saddle.position.set(s * L * 0.3, r / 2 + 0.15, 0);
      g.add(saddle);
    }
  }
  return tag(g, id);
}

// Pump skid (MEC-006)
export function buildPumpSkid(id = 'MEC-006') {
  const { w: L, d: W, h: H } = dims(id);
  const g = new THREE.Group();
  const base = box(L, 0.15, W, mats.gensetDark());
  base.position.y = 0.075; g.add(base);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.25, W * 0.25, L * 0.4, 12), mats.chiller());
  motor.rotation.z = Math.PI / 2;
  motor.position.set(-L * 0.2, 0.15 + W * 0.3, 0); g.add(motor);
  const volute = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.3, W * 0.3, W * 0.3, 14), mats.pipeSupply());
  volute.rotation.x = Math.PI / 2;
  volute.position.set(L * 0.25, 0.15 + W * 0.3, 0); g.add(volute);
  return tag(g, id);
}

/* ============================================================ CONTAINMENT + PIPE */

// Hot/cold-aisle containment: glass roof panels + end doors over an aisle.
export function buildContainment(aisleW, rowLen, rackH) {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(rowLen, 0.02, aisleW), mats.containGlass());
  roof.position.y = rackH + 0.02;
  g.add(roof);
  const frame = box(rowLen, 0.05, 0.05, mats.containFrame());
  frame.position.set(0, rackH, aisleW / 2); g.add(frame);
  const frame2 = frame.clone(); frame2.position.z = -aisleW / 2; g.add(frame2);
  // end doors (CNT-001 dims: 1219 x 100 x 2438)
  for (const s of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.438, aisleW), mats.containGlass());
    door.position.set(s * rowLen / 2, 2.438 / 2, 0);
    g.add(door);
    const df = box(0.08, 0.08, aisleW, mats.containFrame());
    df.position.set(s * rowLen / 2, 2.438, 0);
    g.add(df);
  }
  tag(g, 'CNT-001');
  return g;
}

// Pipe run following waypoints (array of Vector3). radius in m.
export function buildPipe(points, radius, mat) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.02);
  const geo = new THREE.TubeGeometry(curve, Math.max(20, points.length * 8), radius, 10, false);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return { mesh, curve };
}

/* ============================================================ DISPATCH */

export function buildById(id, opts = {}) {
  const c = comp(id);
  const sub = c.Subcategory ?? '';
  if (id === 'RCK-004' || id === 'RCK-005') return buildNVL72(id);
  if (id === 'RCK-006') return buildORv3(id, opts);
  if (c.Category === 'Rack') return buildRackEnclosure(id, opts);
  if (id === 'LCL-002') return buildRowCDU(id);
  if (id === 'LCL-003') return buildRearDoorHX(id);
  if (id === 'LCL-004' || id === 'ACL-001') return buildInRowCooler(id);
  if (id === 'ACL-002') return buildCRAH(id);
  if (id === 'PDW-002') return buildFloorPDU(id);
  if (id === 'PDW-003') return buildRPP(id);
  if (sub.includes('UPS')) return buildUPS(id);
  if (id === 'ELC-005') return buildBatteryCabinet(id);
  if (sub.includes('switchgear') || sub.includes('Switchgear')) return buildSwitchgear(id, opts.sections ?? 4);
  if (id === 'ELC-008') return buildTransformer(id);
  if (id === 'ELC-009') return buildSTS(id);
  if (id === 'ELC-010') return buildATS(id);
  if (id === 'MEC-003') return buildWaterChiller(id);
  if (id === 'MEC-006') return buildPumpSkid(id);
  if (id === 'MEC-007') return buildTank(id, true);
  if (id === 'FUE-001') return buildTank(id, false);
  // default: dimension-true box
  const { w, d, h } = dims(id);
  const g = new THREE.Group();
  const b = box(w, h, d, mats.switchgear());
  b.position.y = h / 2;
  g.add(b);
  return tag(g, id);
}
