// facility.js — composes a complete facility (yard → gray space → white space → racks)
// from a scene config, wiring every animated system along the way.
//
// Coordinate scheme (meters):
//   White space hall centered on X, occupying z ∈ [0, hallD]  (front doors at +Z)
//   Gray space wing:                z ∈ [-grayD, 0]
//   Equipment yard:                 z ∈ [-grayD - yardD, -grayD]
import * as THREE from 'three';
import { STD, dims, comp, kw } from './catalog.js';
import { mats, blinkMats } from './materials.js';
import * as B from './builders.js';

/* ---------- canvas label sprite ---------- */
function makeLabel(text, { size = 44, color = '#9fc9e8', sub = null } = {}) {
  const pad = 20;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `700 ${size}px ui-monospace, Menlo, monospace`;
  const w = ctx.measureText(text).width;
  c.width = w + pad * 2;
  c.height = size * (sub ? 2.4 : 1.5) + pad;
  ctx.font = `700 ${size}px ui-monospace, Menlo, monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.globalAlpha = 0.92;
  ctx.fillText(text, pad, pad * 0.5);
  if (sub) {
    ctx.font = `400 ${size * 0.5}px ui-monospace, Menlo, monospace`;
    ctx.globalAlpha = 0.6;
    ctx.fillText(sub, pad, pad * 0.5 + size * 1.25);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  const s = 0.02;
  spr.scale.set(c.width * s, c.height * s, 1);
  return spr;
}

/* ---------- floor tile grid ---------- */
function tileGrid(w, d, z0) {
  const pts = [];
  const t = STD.TILE;
  for (let x = -w / 2; x <= w / 2 + 0.001; x += t) pts.push(x, 0.012, z0, x, 0.012, z0 + d);
  for (let z = z0; z <= z0 + d + 0.001; z += t) pts.push(-w / 2, 0.012, z, w / 2, 0.012, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, mats.floorTileLine());
}

/* ============================================================ */

export function buildFacility(scene, cfg, flows) {
  const root = new THREE.Group();
  const pick = [];
  const layers = { roof: [], containment: [], labels: [] };
  const result = { root, pick, layers, gensets: [], stats: null, cams: {}, heatVolumes: [] };

  const rowCount = cfg.rows.count;
  const racksPerRow = cfg.rows.racksPerRow;
  const rackId = cfg.rows.rackId;
  const rd = dims(rackId);
  const rackW = rd.w, rackD = rd.d, rackH = rd.h;
  const rowLen = racksPerRow * rackW;

  const liquid = cfg.cooling === 'liquid';
  const aisleShared = liquid ? 1.3 : STD.COLD_AISLE;   // contained aisle between the pair
  const aisleOuter = liquid ? STD.COLD_AISLE : STD.HOT_AISLE;
  const pairDepth = 2 * rackD + aisleShared;
  const pairs = Math.ceil(rowCount / 2);

  const hallW = rowLen + (cfg.hallMarginX ?? 7) * 2;
  const hallD = pairs * pairDepth + (pairs + 1) * aisleOuter + 4;
  const grayD = cfg.grayD ?? 9;
  const yardD = cfg.yardD ?? 16;
  const wallH = cfg.wallH ?? Math.max(rackH + 3, 6);

  /* ---------------- ground + site ---------------- */
  const siteW = hallW + 30, siteD = hallD + grayD + yardD + 26;
  const siteZ = (hallD - grayD - yardD) / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(siteW * 3, siteD * 3), mats.ground());
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, siteZ);
  ground.receiveShadow = true;
  root.add(ground);

  const yardPad = new THREE.Mesh(new THREE.PlaneGeometry(hallW + 14, yardD + 4), mats.yardPad());
  yardPad.rotation.x = -Math.PI / 2;
  yardPad.position.set(0, 0.001, -grayD - yardD / 2);
  yardPad.receiveShadow = true;
  root.add(yardPad);

  // perimeter security fence
  const fenceH = 2.4;
  const fx = siteW / 2 - 2, fzMin = siteZ - siteD / 2 + 2, fzMax = siteZ + siteD / 2 - 2;
  const fenceMat = mats.fence();
  for (const [w, d, x, z] of [
    [fx * 2, 0.05, 0, fzMin], [fx * 2, 0.05, 0, fzMax],
    [0.05, fzMax - fzMin, -fx, (fzMin + fzMax) / 2], [0.05, fzMax - fzMin, fx, (fzMin + fzMax) / 2],
  ]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, fenceH, d), fenceMat);
    f.position.set(x, fenceH / 2, z);
    root.add(f);
  }

  /* ---------------- building shell ---------------- */
  const bldgD = hallD + grayD;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(hallW, 0.25, bldgD), mats.slab());
  slab.position.set(0, -0.125, (hallD - grayD) / 2);
  slab.receiveShadow = true;
  root.add(slab);

  const whiteFloor = new THREE.Mesh(new THREE.PlaneGeometry(hallW, hallD), mats.floorWhite());
  whiteFloor.rotation.x = -Math.PI / 2;
  whiteFloor.position.set(0, 0.005, hallD / 2);
  whiteFloor.receiveShadow = true;
  root.add(whiteFloor);
  root.add(tileGrid(hallW, hallD, 0));

  const grayFloor = new THREE.Mesh(new THREE.PlaneGeometry(hallW, grayD), mats.floorGray());
  grayFloor.rotation.x = -Math.PI / 2;
  grayFloor.position.set(0, 0.005, -grayD / 2);
  grayFloor.receiveShadow = true;
  root.add(grayFloor);

  // walls (in roof layer so they can be hidden)
  const wallT = 0.25;
  const wallDefs = [
    [hallW, wallH, wallT, 0, hallD],                 // front (+Z)
    [hallW, wallH, wallT, 0, -grayD],                // back  (-Z)
    [wallT, wallH, bldgD, -hallW / 2, (hallD - grayD) / 2],
    [wallT, wallH, bldgD, hallW / 2, (hallD - grayD) / 2],
  ];
  for (const [w, h, d, x, z] of wallDefs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall());
    wall.position.set(x, h / 2, z);
    wall.castShadow = wall.receiveShadow = true;
    root.add(wall);
    layers.roof.push(wall);
  }
  // glass clerestory band + roof
  const band = new THREE.Mesh(new THREE.BoxGeometry(hallW, 0.9, wallT), mats.wallGlass());
  band.position.set(0, wallH - 0.7, hallD + 0.01);
  root.add(band); layers.roof.push(band);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hallW + 0.6, 0.2, bldgD + 0.6), mats.roof());
  roof.position.set(0, wallH + 0.1, (hallD - grayD) / 2);
  roof.castShadow = true;
  root.add(roof); layers.roof.push(roof);

  // divider wall gray|white
  const divider = new THREE.Mesh(new THREE.BoxGeometry(hallW, wallH - 0.5, 0.15), mats.wall());
  divider.position.set(0, (wallH - 0.5) / 2, 0);
  root.add(divider); layers.roof.push(divider);

  /* ---------------- interior lighting ---------------- */
  const lightY = wallH - 0.4;
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.PointLight(0xcfe3ff, 55, hallW * 1.4, 1.8);
    pl.position.set((i % 2 === 0 ? -1 : 1) * hallW / 4, lightY, hallD * (0.25 + 0.5 * Math.floor(i / 2)));
    root.add(pl);
  }
  const gl = new THREE.PointLight(0xffe8c4, 70, hallW * 1.2, 1.8);
  gl.position.set(0, lightY, -grayD / 2);
  root.add(gl);

  /* ---------------- zone labels ---------------- */
  function zoneLabel(text, sub, x, y, z, color) {
    const l = makeLabel(text, { sub, color });
    l.position.set(x, y, z);
    root.add(l);
    layers.labels.push(l);
    return l;
  }
  zoneLabel('WHITE SPACE', `${rowCount} rows · ${rowCount * racksPerRow} racks`, 0, wallH + 2.2, hallD / 2, '#7fd4ff');
  zoneLabel('GRAY SPACE', 'power & controls', 0, wallH + 2.2, -grayD / 2, '#ffc233');
  zoneLabel('YARD', 'generation · heat rejection · fuel', 0, 6.5, -grayD - yardD / 2, '#9fb2c8');

  /* ---------------- white space rows ---------------- */
  const protoRack = cfg.rows.builder ? cfg.rows.builder() : B.buildById(rackId, cfg.rows.opts ?? {});
  const rowZs = [];       // rack-row center z + orientation
  let z = aisleOuter + rackD / 2 + 1.2;
  const busH = rackH + 0.55;

  for (let p = 0; p < pairs; p++) {
    const zA = z;
    const zB = z + rackD + aisleShared;
    const aisleZ = (zA + zB) / 2;

    for (const [rowIdx, zRow, facing] of [[p * 2, zA, liquid ? -1 : 1], [p * 2 + 1, zB, liquid ? 1 : -1]]) {
      if (rowIdx >= rowCount) continue;
      rowZs.push({ z: zRow, facing });
      for (let i = 0; i < racksPerRow; i++) {
        const rack = protoRack.clone();
        rack.userData = { ...protoRack.userData };
        rack.position.set(-rowLen / 2 + rackW * (i + 0.5), 0, zRow);
        if (facing < 0) rack.rotation.y = Math.PI;
        root.add(rack);
        pick.push(rack);
      }
      // busways A+B above the row
      const busA = B.buildBusway('PDW-001', rowLen + 1.4, 'A');
      busA.position.set(0, busH, zRow - 0.12);
      root.add(busA); pick.push(busA);
      const busB = B.buildBusway('PDW-001', rowLen + 1.4, 'B');
      busB.position.set(0, busH + 0.32, zRow + 0.12);
      root.add(busB); pick.push(busB);
      // cable tray + fiber
      const tray = B.buildCableTray('CPW-005', rowLen + 1.4);
      tray.position.set(0, busH + 0.75, zRow);
      root.add(tray); pick.push(tray);
      const fiber = B.buildFiberDuct('CPW-003', rowLen + 1.4);
      fiber.position.set(0, busH + 1.0, zRow);
      root.add(fiber); pick.push(fiber);

      // liquid: CDUs at both row ends
      if (liquid) {
        for (const s of [-1, 1]) {
          const cdu = B.buildRowCDU('LCL-002');
          cdu.position.set(s * (rowLen / 2 + dims('LCL-002').w / 2 + 0.35), 0, zRow);
          cdu.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
          root.add(cdu); pick.push(cdu);
        }
      }
    }

    // containment over the shared aisle
    if (rowCount > p * 2 + 1) {
      const cont = B.buildContainment(aisleShared, rowLen, rackH);
      cont.position.set(0, 0, aisleZ);
      root.add(cont); pick.push(cont);
      layers.containment.push(cont);
    }

    // airflow + heat for this pair
    const half = rowLen / 2;
    if (liquid) {
      // hot aisle between the pair
      flows.addAir(new THREE.Box3(new THREE.Vector3(-half, 0.3, aisleZ - aisleShared / 2), new THREE.Vector3(half, rackH, aisleZ + aisleShared / 2)),
        new THREE.Vector3(0, 0.9, 0), { color: 0xff6a4a, count: 130, opacity: 0.35 });
      flows.addHeat(new THREE.Vector3(0, rackH, aisleZ), { count: 50, spread: half * 0.8, rise: 2.2, size: 1.1, opacity: 0.1 });
      // cold air drifting toward rack fronts on the outer sides
      flows.addAir(new THREE.Box3(new THREE.Vector3(-half, 0.2, zA - rackD / 2 - 1.1), new THREE.Vector3(half, rackH * 0.8, zA - rackD / 2 - 0.05)),
        new THREE.Vector3(0, 0.05, 0.5), { color: 0x7fd4ff, count: 80, opacity: 0.3 });
      if (rowCount > p * 2 + 1)
        flows.addAir(new THREE.Box3(new THREE.Vector3(-half, 0.2, zB + rackD / 2 + 0.05), new THREE.Vector3(half, rackH * 0.8, zB + rackD / 2 + 1.1)),
          new THREE.Vector3(0, 0.05, -0.5), { color: 0x7fd4ff, count: 80, opacity: 0.3 });
    } else {
      // cold aisle contained between fronts
      flows.addAir(new THREE.Box3(new THREE.Vector3(-half, 0.1, aisleZ - aisleShared / 2), new THREE.Vector3(half, rackH * 0.9, aisleZ + aisleShared / 2)),
        new THREE.Vector3(0, 0.55, 0), { color: 0x7fd4ff, count: 130, opacity: 0.4 });
      // hot exhaust on outer sides
      flows.addAir(new THREE.Box3(new THREE.Vector3(-half, 0.4, zA - rackD / 2 - 0.9), new THREE.Vector3(half, rackH + 1, zA - rackD / 2 - 0.05)),
        new THREE.Vector3(0, 0.8, -0.25), { color: 0xff6a4a, count: 90, opacity: 0.3 });
      if (rowCount > p * 2 + 1)
        flows.addAir(new THREE.Box3(new THREE.Vector3(-half, 0.4, zB + rackD / 2 + 0.05), new THREE.Vector3(half, rackH + 1, zB + rackD / 2 + 0.9)),
          new THREE.Vector3(0, 0.8, 0.25), { color: 0xff6a4a, count: 90, opacity: 0.3 });
      flows.addHeat(new THREE.Vector3(0, rackH + 0.6, zA - rackD / 2 - 0.5), { count: 36, spread: half * 0.7, rise: 1.6, size: 0.9, opacity: 0.08 });
    }

    z += pairDepth + aisleOuter;
  }

  // pod labels
  for (let p = 0; p < pairs; p++) {
    const zc = aisleOuter + rackD / 2 + 1.2 + p * (pairDepth + aisleOuter) + (pairDepth - rackD) / 2;
    const l = makeLabel(cfg.podName ? `${cfg.podName} ${p + 1}` : `POD ${p + 1}`, { size: 30, color: '#5c7a94' });
    l.position.set(-rowLen / 2 - 2.6, rackH + 1.1, zc);
    root.add(l); layers.labels.push(l);
  }

  /* ---------------- perimeter cooling units (air halls) ---------------- */
  if (!liquid || cfg.crahCount) {
    const n = cfg.crahCount ?? Math.max(2, pairs + 1);
    const cd = dims('ACL-002');
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const idx = Math.floor(i / 2);
      const crah = B.buildCRAH('ACL-002');
      crah.position.set(side * (hallW / 2 - cd.d / 2 - 0.4), 0, 3 + idx * (cd.w + 2.2) + cd.w / 2);
      crah.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      root.add(crah); pick.push(crah);
    }
  }

  // floor PDUs along the gray-space divider wall
  const pduCount = cfg.pduCount ?? Math.min(rowCount, 6);
  for (let i = 0; i < pduCount; i++) {
    const pdu = B.buildFloorPDU('PDW-002');
    pdu.position.set(-hallW / 2 + 3 + i * (hallW - 6) / Math.max(1, pduCount - 1), 0, 1.4);
    root.add(pdu); pick.push(pdu);
  }

  /* ---------------- gray space lineup ---------------- */
  const grayItems = [];
  let gx = -hallW / 2 + 2.5;
  for (const item of cfg.gray) {
    for (let i = 0; i < (item.count ?? 1); i++) {
      const obj = B.buildById(item.id, item.opts ?? {});
      const bb = new THREE.Box3().setFromObject(obj);
      const w = bb.max.x - bb.min.x;
      obj.position.set(gx + w / 2, 0, -grayD + 1.6 + (item.rowOffset ?? 0));
      root.add(obj); pick.push(obj);
      grayItems.push({ id: item.id, x: gx + w / 2, w });
      gx += w + 0.9;
    }
  }

  /* ---------------- yard ---------------- */
  const yard = cfg.yard;
  const yardZ0 = -grayD - 2;

  // transformers against the building
  const tfPositions = [];
  const nTf = yard.transformers ?? 2;
  for (let i = 0; i < nTf; i++) {
    const tf = B.buildTransformer('ELC-008');
    const x = -hallW / 2 + 6 + i * ((hallW - 12) / Math.max(1, nTf - 1));
    tf.position.set(x, 0, yardZ0 - 1.5);
    root.add(tf); pick.push(tf);
    tfPositions.push(new THREE.Vector3(x, 1.9, yardZ0 - 1.5));
  }

  // gensets in a row (long axis along Z, radiators facing away from the building)
  const nGen = yard.gensets?.count ?? 0;
  const genId = yard.gensets?.id ?? 'BKP-003';
  const genLen = dims(genId).w, genW = dims(genId).d;
  const genRowZ = yardZ0 - 2 - genLen / 2;
  const genPositions = [];
  for (let i = 0; i < nGen; i++) {
    const { group, fans, exhaustAnchor } = genId === 'BKP-003' ? B.buildGenset(genId) : B.buildOpenGenset(genId);
    const x = -hallW / 2 + 2 + i * (genW + 2.4);
    group.rotation.y = Math.PI / 2;
    group.position.set(x, 0, genRowZ);
    root.add(group); pick.push(group);
    result.gensets.push({ group, fans });
    flows.addFans(fans.map(f => ({ userData: { hub: f, axis: 'z' } })));
    const wp = exhaustAnchor.clone().applyEuler(new THREE.Euler(0, Math.PI / 2, 0)).add(group.position);
    flows.addExhaust(wp);
    genPositions.push(new THREE.Vector3(x, 1.6, genRowZ));
  }

  // chillers / dry coolers: rows beyond the gensets, wrapping when they don't fit
  const nCh = yard.chillers?.count ?? 0;
  const chId = yard.chillers?.id ?? 'MEC-002';
  const chLen = dims(chId).w, chW = dims(chId).d;
  const chillRowZ = genRowZ - genLen / 2 - chW / 2 - 2.5;
  const chSpacing = chLen + 2;
  const chPerRow = Math.max(1, Math.floor((hallW + 14) / chSpacing));
  const chillPositions = [];
  for (let i = 0; i < nCh; i++) {
    const { group, fans } = B.buildChiller(chId);
    const col = i % chPerRow, rowI = Math.floor(i / chPerRow);
    const inRow = Math.min(chPerRow, nCh - rowI * chPerRow);
    const x = -(inRow - 1) * chSpacing / 2 + col * chSpacing;
    const zc = chillRowZ - rowI * (chW + 2.6);
    group.position.set(x, 0, zc);
    root.add(group); pick.push(group);
    flows.addFans(fans.map(f => f.userData.hub ? f : { userData: { hub: f } }));
    chillPositions.push(new THREE.Vector3(x, 1.2, zc));
    flows.addHeat(new THREE.Vector3(x, dims(chId).h + 0.3, zc), { count: 30, spread: chLen * 0.3, rise: 2.5, size: 1.2, opacity: 0.07 });
  }

  // cooling tower
  if (yard.tower) {
    const { group, fans, mistAnchor } = B.buildCoolingTower('MEC-004');
    group.position.set(hallW / 2 + 6, 0, chillRowZ + 2);
    root.add(group); pick.push(group);
    flows.addFans(fans);
    const mist = mistAnchor.clone().add(group.position);
    flows.addHeat(mist, { count: 40, spread: 1.4, rise: 4, size: 1.6, opacity: 0.12 });
    result.towerPos = group.position.clone();
  }
  // thermal storage
  if (yard.tes) {
    const tes = B.buildTank('MEC-007', true);
    tes.scale.setScalar(0.55);                          // catalog tank is 15×21 m — visual scale-down, noted in inspector
    tes.userData.scaled = '55% visual scale';
    tes.position.set(-hallW / 2 - 9, 0, chillRowZ + 3);
    root.add(tes); pick.push(tes);
  }
  // fuel tanks near gensets
  const nFuel = yard.fuel ?? 0;
  for (let i = 0; i < nFuel; i++) {
    const tank = B.buildTank('FUE-001', false);
    tank.position.set(hallW / 2 + 7, 0, genRowZ - 2 + i * 4.2);
    tank.rotation.y = Math.PI / 2;
    root.add(tank); pick.push(tank);
  }

  // utility interconnect: simple lattice pylon + service drop at yard edge
  const utilPos = new THREE.Vector3(0, 0, yardZ0 - yardD + 3.5);
  {
    const py = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 11, 8), mats.cableTray());
    mast.position.y = 5.5; py.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 0.14), mats.cableTray());
    arm.position.y = 9.6; py.add(arm);
    for (const s of [-1.8, 0, 1.8]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), mats.tank());
      ins.position.set(s, 9.25, 0); py.add(ins);
    }
    py.position.copy(utilPos);
    root.add(py);
    const l = makeLabel('UTILITY FEED', { size: 26, color: '#ffc233' });
    l.position.set(utilPos.x, 11.4, utilPos.z);
    root.add(l); layers.labels.push(l);
  }

  /* ---------------- power flow paths ---------------- */
  // utility trunk: pylon → transformer → gray-space switchgear/UPS
  const swX = grayItems.length ? grayItems[Math.floor(grayItems.length / 2)].x : 0;
  const upsPoint = new THREE.Vector3(swX, 1.2, -grayD + 1.6);
  for (const tf of tfPositions) {
    flows.addPower([
      new THREE.Vector3(utilPos.x, 9.4, utilPos.z),
      new THREE.Vector3(tf.x, 7.5, (utilPos.z + tf.z) / 2),
      tf,
      new THREE.Vector3(tf.x, 1.0, tf.z + 1.2),
      new THREE.Vector3(tf.x, 1.0, -grayD + 0.6),
      upsPoint,
    ], { count: 34, speed: 0.055, size: 0.3 });
  }
  // backup trunk: each genset → ATS point → UPS
  for (const gp of genPositions) {
    flows.addBackup([
      gp,
      new THREE.Vector3(gp.x, 2.6, gp.z + 3),
      new THREE.Vector3(gp.x, 2.6, -grayD - 0.8),
      new THREE.Vector3(swX, 2.2, -grayD + 0.8),
      upsPoint,
    ], { count: 26, speed: 0.06, size: 0.3 });
  }
  // distribution: UPS → riser → each row busway (representative A-feed)
  for (const { z: zRow } of rowZs) {
    flows.addDist([
      upsPoint,
      new THREE.Vector3(swX, busH + 0.9, -grayD + 2.5),
      new THREE.Vector3(swX * 0.5, busH + 0.9, 0),
      new THREE.Vector3(-rowLen / 2 - 0.5, busH, zRow - 0.12),
      new THREE.Vector3(rowLen / 2, busH, zRow - 0.12),
    ], { count: 30, speed: 0.05, size: 0.22 });
  }

  /* ---------------- coolant loops ---------------- */
  if (liquid && nCh > 0) {
    const wallX = hallW / 2 - 1.2;
    // plant supply header enters at east wall, elevated, drops to each row's CDU
    for (let i = 0; i < rowZs.length; i++) {
      const { z: zRow } = rowZs[i];
      const src = chillPositions[i % nCh];
      const cduX = rowLen / 2 + dims('LCL-002').w / 2 + 0.35;
      flows.addCoolant([
        new THREE.Vector3(src.x, 1.4, src.z),
        new THREE.Vector3(hallW / 2 + 2.5, 2.8, -grayD - 4),
        new THREE.Vector3(wallX, 3.4, -grayD + 1),
        new THREE.Vector3(wallX, 3.4, zRow),
        new THREE.Vector3(cduX, 1.0, zRow),
        new THREE.Vector3(rowLen / 2 - 0.3, 0.6, zRow),
        new THREE.Vector3(-rowLen / 2 + 0.3, 0.6, zRow),
      ], { count: 44, speed: 0.045, size: 0.2 });
      flows.addCoolantReturn([
        new THREE.Vector3(-rowLen / 2 + 0.3, 1.9, zRow),
        new THREE.Vector3(rowLen / 2 - 0.3, 1.9, zRow),
        new THREE.Vector3(cduX, 2.2, zRow),
        new THREE.Vector3(wallX, 3.7, zRow),
        new THREE.Vector3(wallX, 3.7, -grayD + 1),
        new THREE.Vector3(hallW / 2 + 2.5, 3.1, -grayD - 4),
        new THREE.Vector3(src.x, 1.6, src.z),
      ], { count: 44, speed: 0.045, size: 0.2 });
    }
  } else if (nCh > 0) {
    // air halls: chilled water to CRAH headers, one loop per side
    for (const side of [-1, 1]) {
      const wx = side * (hallW / 2 - 1.4);
      const src = chillPositions[side > 0 ? 0 : Math.min(1, nCh - 1)];
      flows.addCoolant([
        new THREE.Vector3(src.x, 1.4, src.z),
        new THREE.Vector3(side * (hallW / 2 + 2.5), 3, -grayD - 3),
        new THREE.Vector3(wx, 3.2, -grayD + 1),
        new THREE.Vector3(wx, 3.2, hallD - 3),
        new THREE.Vector3(wx, 1.0, hallD - 3),
      ], { count: 36, speed: 0.04, size: 0.2 });
      flows.addCoolantReturn([
        new THREE.Vector3(wx, 1.2, hallD - 3),
        new THREE.Vector3(wx, 3.6, hallD - 3.4),
        new THREE.Vector3(wx, 3.6, -grayD + 1),
        new THREE.Vector3(side * (hallW / 2 + 2.5), 3.3, -grayD - 3),
        new THREE.Vector3(src.x, 1.6, src.z),
      ], { count: 36, speed: 0.04, size: 0.2 });
    }
  }

  /* ---------------- camera presets ---------------- */
  const c = (px, py, pz, tx, ty, tz) => ({ pos: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz) });
  result.cams = {
    overview: c(hallW * 1.25, wallH * 2.6, hallD + hallW * 0.85, 0, 0, (hallD - grayD - yardD * 0.6) / 2),
    aerial: c(0.01, Math.max(hallW, bldgD + yardD) * 1.35, siteZ + 0.01, 0, 0, siteZ),
    yard: c(hallW * 0.55, 9, -grayD - yardD - 9, 0, 1, -grayD - yardD / 2),
    gray: c(swX + 8, 5.5, -grayD + 12, swX, 1.4, -grayD + 2),
    white: c(0, rackH * 3.2, hallD - 2, 0, 1, hallD / 2 - 3),
    rack: (() => {
      // stand at the end of the first contained aisle, looking down it
      const aisle0 = rowZs.length > 1 ? (rowZs[0].z + rowZs[1].z) / 2 : rowZs[0].z + rowZs[0].facing * (rackD / 2 + 1.2);
      return c(-rowLen / 2 - 3.2, 1.7, aisle0, rowLen / 2, 1.15, aisle0);
    })(),
  };

  /* ---------------- stats ---------------- */
  const rackKw = kw(rackId) || cfg.rows.kwPerRack || 8;
  const nRacks = rowCount * racksPerRow;
  result.stats = {
    racks: nRacks,
    itKW: nRacks * rackKw,
    kwPerRack: rackKw,
    coolKW: nCh * (kw(chId) || 0),
    genKW: nGen * (kw(genId) || 0),
    basePUE: cfg.basePUE ?? (liquid ? 1.15 : 1.45),
  };

  scene.add(root);
  return result;
}
