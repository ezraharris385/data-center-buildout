// flows.js — animated live systems: power pulses, coolant loops, airflow, heat, exhaust.
import * as THREE from 'three';

// soft round sprite for all particles
function makeSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const SPRITE = makeSprite();

function pointsMaterial(color, size, opacity = 0.9) {
  return new THREE.PointsMaterial({
    color, size, map: SPRITE, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
}

/* ---------------- FlowPath: particles streaming along a curve ---------------- */
export class FlowPath {
  constructor(points, { color = 0xffc233, count = 40, speed = 0.08, size = 0.22, opacity = 0.95, tube = null } = {}) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.02);
    this.count = count;
    this.speed = speed;
    this.offsets = new Float32Array(count);
    for (let i = 0; i < count; i++) this.offsets[i] = i / count;
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.mat = pointsMaterial(color, size, opacity);
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.points);
    // optional faint conduit line
    if (tube) {
      const tubeGeo = new THREE.TubeGeometry(this.curve, 64, tube, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false });
      this.group.add(new THREE.Mesh(tubeGeo, tubeMat));
    }
    this.enabled = true;
    this.rate = 1;
    this._t = 0;
  }
  update(dt) {
    if (!this.enabled) { this.points.visible = false; return; }
    this.points.visible = true;
    this._t += dt * this.speed * this.rate;
    const pos = this.points.geometry.attributes.position.array;
    const v = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) {
      const u = (this.offsets[i] + this._t) % 1;
      this.curve.getPointAt(u, v);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  setEnabled(on) { this.enabled = on; if (!on) this.points.visible = false; this.group.visible = on || this.group.children.length > 1; }
}

/* ---------------- AirField: drifting particles inside a box region ---------------- */
// dir: unit-ish velocity vector; particles wrap within the box.
export class AirField {
  constructor(box3, dir, { color = 0x7fd4ff, count = 220, size = 0.16, speed = 0.7, opacity = 0.45 } = {}) {
    this.box = box3;
    this.dir = dir.clone();
    this.speed = speed;
    this.count = count;
    this.rate = 1;
    const pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    const span = new THREE.Vector3().subVectors(box3.max, box3.min);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = box3.min.x + Math.random() * span.x;
      pos[i * 3 + 1] = box3.min.y + Math.random() * span.y;
      pos[i * 3 + 2] = box3.min.z + Math.random() * span.z;
      this.vel[i * 3] = dir.x + (Math.random() - 0.5) * 0.3;
      this.vel[i * 3 + 1] = dir.y + (Math.random() - 0.5) * 0.3;
      this.vel[i * 3 + 2] = dir.z + (Math.random() - 0.5) * 0.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, pointsMaterial(color, size, opacity));
    this.points.frustumCulled = false;
    this.enabled = true;
  }
  update(dt) {
    if (!this.enabled) { this.points.visible = false; return; }
    this.points.visible = true;
    const pos = this.points.geometry.attributes.position.array;
    const { min, max } = this.box;
    const s = dt * this.speed * this.rate;
    for (let i = 0; i < this.count; i++) {
      let x = pos[i * 3] + this.vel[i * 3] * s;
      let y = pos[i * 3 + 1] + this.vel[i * 3 + 1] * s;
      let z = pos[i * 3 + 2] + this.vel[i * 3 + 2] * s;
      if (x < min.x) x = max.x; if (x > max.x) x = min.x;
      if (y < min.y) y = max.y; if (y > max.y) y = min.y;
      if (z < min.z) z = max.z; if (z > max.z) z = min.z;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  setEnabled(on) { this.enabled = on; if (!on) this.points.visible = false; }
}

/* ---------------- Plume: rising, dissipating particles from a point ---------------- */
export class Plume {
  constructor(anchor, { color = 0x888888, count = 60, size = 0.5, rise = 1.6, spread = 0.5, opacity = 0.25 } = {}) {
    this.anchor = anchor.clone();
    this.count = count;
    this.rise = rise;
    this.spread = spread;
    this.life = new Float32Array(count);
    for (let i = 0; i < count; i++) this.life[i] = Math.random();
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(geo, pointsMaterial(color, size, opacity));
    this.points.frustumCulled = false;
    this.enabled = false;
    this.rate = 1;
  }
  update(dt) {
    if (!this.enabled) { this.points.visible = false; return; }
    this.points.visible = true;
    const pos = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this.count; i++) {
      this.life[i] += dt * 0.5 * this.rate;
      if (this.life[i] > 1) this.life[i] = 0;
      const t = this.life[i];
      pos[i * 3] = this.anchor.x + Math.sin(i * 12.9898 + t * 6) * this.spread * t;
      pos[i * 3 + 1] = this.anchor.y + t * this.rise;
      pos[i * 3 + 2] = this.anchor.z + Math.cos(i * 78.233 + t * 5) * this.spread * t;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
  setEnabled(on) { this.enabled = on; if (!on) this.points.visible = false; }
}

/* ---------------- FlowSystem: owns all flows for a scene ---------------- */
export class FlowSystem {
  constructor(scene) {
    this.scene = scene;
    this.power = [];    // FlowPath, utility trunk (dies on grid failure)
    this.backup = [];   // FlowPath, genset trunk (lives on grid failure)
    this.dist = [];     // FlowPath, downstream distribution (always energized)
    this.coolant = [];  // FlowPath
    this.air = [];      // AirField
    this.plumes = [];   // Plume (heat)
    this.exhaust = [];  // Plume (genset smoke)
    this.fans = [];     // objects with userData.hub or plain groups, spun each frame
    this.fanSpeed = 1;
  }
  addPower(points, opts = {}) { const f = new FlowPath(points, { color: 0xffc233, tube: 0.03, ...opts }); this.power.push(f); this.scene.add(f.group); return f; }
  addBackup(points, opts = {}) { const f = new FlowPath(points, { color: 0xff5c39, tube: 0.03, ...opts }); f.setEnabled(false); this.backup.push(f); this.scene.add(f.group); return f; }
  addDist(points, opts = {}) { const f = new FlowPath(points, { color: 0xffc233, tube: 0.02, ...opts }); this.dist.push(f); this.scene.add(f.group); return f; }
  addCoolant(points, opts = {}) { const f = new FlowPath(points, { color: 0x39c2ff, tube: 0.025, ...opts }); this.coolant.push(f); this.scene.add(f.group); return f; }
  addCoolantReturn(points, opts = {}) { const f = new FlowPath(points, { color: 0xff8a5c, tube: 0.025, ...opts }); this.coolant.push(f); this.scene.add(f.group); return f; }
  addAir(box3, dir, opts = {}) { const a = new AirField(box3, dir, opts); this.air.push(a); this.scene.add(a.points); return a; }
  addHeat(anchor, opts = {}) { const p = new Plume(anchor, { color: 0xff6a4a, ...opts }); p.setEnabled(true); this.plumes.push(p); this.scene.add(p.points); return p; }
  addExhaust(anchor, opts = {}) { const p = new Plume(anchor, { color: 0x555b66, opacity: 0.3, rise: 3.2, size: 0.8, ...opts }); this.exhaust.push(p); this.scene.add(p.points); return p; }
  addFans(list) { for (const f of list) this.fans.push(f); }

  update(dt, t) {
    for (const f of this.power) f.update(dt);
    for (const f of this.backup) f.update(dt);
    for (const f of this.dist) f.update(dt);
    for (const f of this.coolant) f.update(dt);
    for (const a of this.air) a.update(dt);
    for (const p of this.plumes) p.update(dt);
    for (const p of this.exhaust) p.update(dt);
    for (const f of this.fans) {
      const hub = f.userData?.hub ?? f;
      const axis = f.userData?.axis ?? 'y';
      hub.rotation[axis] += dt * 6 * this.fanSpeed;
    }
  }

  setPowerVisible(on) {
    for (const f of this.power) f.setEnabled(on && this._utilityOn !== false);
    for (const f of this.backup) f.setEnabled(on && this._utilityOn === false);
    for (const f of this.dist) f.setEnabled(on);
    this._powerVis = on;
  }
  setUtility(on) {
    this._utilityOn = on;
    const vis = this._powerVis !== false;
    for (const f of this.power) f.setEnabled(vis && on);
    for (const f of this.backup) f.setEnabled(vis && !on);
    for (const p of this.exhaust) p.setEnabled(!on);
  }
  setCoolantVisible(on) { for (const f of this.coolant) f.setEnabled(on); }
  setAirVisible(on) { for (const a of this.air) a.setEnabled(on); }
  setHeatVisible(on) { for (const p of this.plumes) p.setEnabled(on); }
  setLoad(frac) {
    for (const f of [...this.power, ...this.backup, ...this.dist, ...this.coolant]) f.rate = 0.4 + frac * 1.2;
    for (const a of this.air) a.rate = 0.4 + frac * 1.2;
    for (const p of this.plumes) p.rate = 0.5 + frac;
    this.fanSpeed = 0.4 + frac * 1.3;
  }
  dispose() {
    const all = [...this.power, ...this.backup, ...this.dist, ...this.coolant].map(f => f.group)
      .concat(this.air.map(a => a.points), this.plumes.map(p => p.points), this.exhaust.map(p => p.points));
    for (const o of all) this.scene.remove(o);
  }
}
