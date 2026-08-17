// facility.js — composes a complete facility (yard → gray space → white space → racks)
// from a scene config, wiring every animated system along the way.
//
// Coordinate scheme (meters):
//   White space hall centered on X, occupying z ∈ [0, hallD]  (front doors at +Z)
//   Gray space wing:                z ∈ [-grayD, 0]
//   Equipment yard:                 z ∈ [-grayD - yardD, -grayD]
// Multi-floor: white space repeats on each level at y = floor * floorH.
import * as THREE from 'three';
import { STD, dims, comp, kw } from './catalog.js?b37';
import { mats, blinkMats } from './materials.js?b37';
import * as B from './builders.js?b37';

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
function tileGrid(w, d, z0, y = 0.012) {
  const pts = [];
  const t = STD.TILE;
  for (let x = -w / 2; x <= w / 2 + 0.001; x += t) pts.push(x, y, z0, x, y, z0 + d);
  for (let z = z0; z <= z0 + d + 0.001; z += t) pts.push(-w / 2, y, z, w / 2, y, z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, mats.floorTileLine());
}

/* ============================================================ */

export function buildFacility(scene, cfg, flows) {
  const root = new THREE.Group();
  const pick = [];
  const layers = { roof: [], containment: [], labels: [] };
  const instances = new Map(); // componentId -> [Vector3 world positions]
  const result = { root, pick, layers, instances, gensets: [], stats: null, cams: {}, anchors: {}, cfg };

  const include = { busB: true, trays: true, pdus: true, crah: true, ...(cfg.include ?? {}) };
  const floors = Math.max(1, Math.min(3, cfg.floors ?? 1));
  const shell = cfg.shell ?? 'solid';

  function addPick(obj, id) {
    root.add(obj);
    pick.push(obj);
    const cid = id ?? obj.userData?.componentId;
    if (cid) {
      if (!instances.has(cid)) instances.set(cid, []);
      instances.get(cid).push(obj.position.clone());
    }
    return obj;
  }

  const rowCount = cfg.rows.count;
  const racksPerRow = cfg.rows.racksPerRow;
  const rackId = cfg.rows.rackId;
  const rd = dims(rackId);
  const rackW = rd.w, rackD = rd.d, rackH = rd.h;
  const rowLen = racksPerRow * rackW;

  const liquid = cfg.cooling === 'liquid';
  const aisleShared = liquid ? 1.3 : STD.COLD_AISLE;
  const aisleOuter = liquid ? STD.COLD_AISLE : STD.HOT_AISLE;
  const pairDepth = 2 * rackD + aisleShared;
  const pairs = Math.ceil(rowCount / 2);

  // fixed real-building mode (retrofits): cfg.building = { w, d } in meters overrides
  // the derived envelope; gray space is carved out of the building depth.
  const grayD = cfg.grayD ?? 9;
  const fixed = cfg.building ?? null;
  const hallW = fixed ? fixed.w : rowLen + (cfg.hallMarginX ?? 7) * 2;
  const hallD = fixed ? fixed.d - grayD : pairs * pairDepth + (pairs + 1) * aisleOuter + 4;
  const yardD = cfg.yardD ?? 22;

  // interior obstructions (columns, offices) that rack placement must respect
  const colBlockers = [];   // {x, z}
  const officeRects = [];   // {x0, x1, z0, z1}
  const floorH = cfg.wallH ?? Math.max(rackH + 3, 6);
  const wallH = floorH * floors;
  const busH = rackH + 0.55;

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

  /* ---------------- parcel boundary (measured sites) ---------------- */
  if (cfg.parcel) {
    const FT = 0.3048;
    const pw = cfg.parcel.w_ft * FT, pd = cfg.parcel.d_ft * FT;
    const pcx = (cfg.parcel.dx_ft ?? 0) * FT;
    const pcz = (hallD - grayD) / 2 + (cfg.parcel.dz_ft ?? 0) * FT;
    const pts = [
      new THREE.Vector3(pcx - pw / 2, 0.06, pcz - pd / 2),
      new THREE.Vector3(pcx + pw / 2, 0.06, pcz - pd / 2),
      new THREE.Vector3(pcx + pw / 2, 0.06, pcz + pd / 2),
      new THREE.Vector3(pcx - pw / 2, 0.06, pcz + pd / 2),
      new THREE.Vector3(pcx - pw / 2, 0.06, pcz - pd / 2),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.9 }));
    root.add(line);
    for (const c2 of pts.slice(0, 4)) {                    // corner pins
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), mats.busway());
      pin.position.set(c2.x, 0.7, c2.z);
      root.add(pin);
    }
    const l = makeLabel(`PARCEL — ${cfg.parcel.acres} AC (MEASURED)`, { size: 24, color: '#ffc233' });
    l.position.set(pcx, 3.4, pcz + pd / 2);
    root.add(l); layers.labels.push(l);
  }

  /* ---------------- building shell ---------------- */
  const bldgD = hallD + grayD;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(hallW, 0.25, bldgD), mats.slab());
  slab.position.set(0, -0.125, (hallD - grayD) / 2);
  slab.receiveShadow = true;
  root.add(slab);

  for (let f = 0; f < floors; f++) {
    const yOff = f * floorH;
    if (f > 0) {
      // upper deck slab
      const deck = new THREE.Mesh(new THREE.BoxGeometry(hallW, 0.3, hallD), mats.slab());
      deck.position.set(0, yOff - 0.15, hallD / 2);
      deck.castShadow = deck.receiveShadow = true;
      root.add(deck);
    }
    const whiteFloor = new THREE.Mesh(new THREE.PlaneGeometry(hallW, hallD), mats.floorWhite());
    whiteFloor.rotation.x = -Math.PI / 2;
    whiteFloor.position.set(0, yOff + 0.005, hallD / 2);
    whiteFloor.receiveShadow = true;
    root.add(whiteFloor);
    root.add(tileGrid(hallW, hallD, 0, yOff + 0.012));
  }

  const grayFloor = new THREE.Mesh(new THREE.PlaneGeometry(hallW, grayD), mats.floorGray());
  grayFloor.rotation.x = -Math.PI / 2;
  grayFloor.position.set(0, 0.005, -grayD / 2);
  grayFloor.receiveShadow = true;
  root.add(grayFloor);

  // walls + roof (hidden by the roof toggle)
  const wallT = 0.25;
  const wallMat = shell === 'glass' ? mats.wallGlass() : mats.wall();
  const wallDefs = [
    [hallW, wallH, wallT, 0, hallD],
    [hallW, wallH, wallT, 0, -grayD],
    [wallT, wallH, bldgD, -hallW / 2, (hallD - grayD) / 2],
    [wallT, wallH, bldgD, hallW / 2, (hallD - grayD) / 2],
  ];
  for (const [w, h, d, x, z] of wallDefs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    wall.position.set(x, h / 2, z);
    wall.castShadow = shell !== 'glass';
    wall.receiveShadow = true;
    root.add(wall);
    layers.roof.push(wall);
  }
  const band = new THREE.Mesh(new THREE.BoxGeometry(hallW, 0.9, wallT), mats.wallGlass());
  band.position.set(0, wallH - 0.7, hallD + 0.01);
  root.add(band); layers.roof.push(band);
  // glass shell = full x-ray: the roof goes transparent with the walls
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hallW + 0.6, 0.2, bldgD + 0.6),
    shell === 'glass' ? mats.wallGlass() : mats.roof());
  roof.position.set(0, wallH + 0.1, (hallD - grayD) / 2);
  roof.castShadow = shell !== 'glass';
  root.add(roof); layers.roof.push(roof);

  const divider = new THREE.Mesh(new THREE.BoxGeometry(hallW, wallH - 0.5, 0.15), mats.wall());
  divider.position.set(0, (wallH - 0.5) / 2, 0);
  root.add(divider); layers.roof.push(divider);

  /* ---------------- retained industrial loading (retrofit sites) ---------------- */
  if (cfg.dockDoors) {
    const doorW = 2.75, doorH = 3.0, wallX = hallW / 2;   // 9 ft docks on the east wall
    const pitch = 4.9;
    const runLen = cfg.dockDoors * pitch;
    const z0 = Math.max(4, hallD * 0.5 - runLen / 2);
    for (let i = 0; i < cfg.dockDoors; i++) {
      const zd = z0 + i * pitch;
      if (zd > hallD - 4) break;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.18, doorH, doorW), mats.gensetDark());
      door.position.set(wallX + 0.08, doorH / 2 + 1.2, zd);   // dock-high: sill at ~48"
      root.add(door); layers.roof.push(door);
      for (const s of [-1, 1]) {                               // bumpers
        const bump = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.35), mats.fanRing());
        bump.position.set(wallX + 0.25, 1.35, zd + s * (doorW / 2 - 0.25));
        root.add(bump); layers.roof.push(bump);
      }
    }
    for (let i = 0; i < (cfg.driveIns ?? 0); i++) {            // converted drive-ins
      const zd = z0 + cfg.dockDoors * pitch + 3 + i * 7;
      if (zd > hallD - 5) break;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.4, 4.3), mats.gensetEnclosure());
      door.position.set(wallX + 0.09, 2.2, zd);
      root.add(door); layers.roof.push(door);
    }
    const l = makeLabel(`LOADING — ${cfg.dockDoors} DOCKS RETAINED`, { size: 20, color: '#8fa6bd' });
    l.position.set(wallX + 2, 5.2, hallD * 0.5);
    root.add(l); layers.labels.push(l);
  }

  /* ---------------- interior demising walls (split into N halls) ---------------- */
  const dividerZs = [];
  if ((cfg.halls ?? 1) > 1) {
    const n = cfg.halls;
    for (let i = 1; i < n; i++) {
      const dz = (hallD / n) * i;
      dividerZs.push(dz);
      // full-height wall with two corridor openings at ±hallW/4
      const opening = 3;
      const segs = [
        [-hallW / 2, -hallW / 4 - opening / 2],
        [-hallW / 4 + opening / 2, hallW / 4 - opening / 2],
        [hallW / 4 + opening / 2, hallW / 2],
      ];
      for (const [x0, x1] of segs) {
        const w = x1 - x0;
        if (w <= 0.1) continue;
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, wallH - 0.4, 0.35), mats.wall());
        seg.position.set((x0 + x1) / 2, (wallH - 0.4) / 2, dz);
        seg.castShadow = seg.receiveShadow = true;
        root.add(seg);
      }
      // header over the openings
      for (const ox of [-hallW / 4, hallW / 4]) {
        const hdr = new THREE.Mesh(new THREE.BoxGeometry(opening, wallH - 0.4 - 3.2, 0.35), mats.wall());
        hdr.position.set(ox, 3.2 + (wallH - 0.4 - 3.2) / 2, dz);
        root.add(hdr);
      }
      const l = makeLabel(`HALL ${i + 1}`, { size: 30, color: '#5c7a94' });
      l.position.set(0, wallH * 0.7, dz + 1.2);
      root.add(l); layers.labels.push(l);
    }
  }

  /* ---------------- structural column grid ---------------- */
  if (cfg.columnGrid) {
    const cg = cfg.columnGrid;
    const colGeo = new THREE.BoxGeometry(0.4, wallH - 0.3, 0.4);
    const colMat = mats.switchgear();
    for (let x = -hallW / 2 + cg; x < hallW / 2 - 0.5; x += cg) {
      for (let z = cg; z < hallD - 0.5; z += cg) {
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(x, (wallH - 0.3) / 2, z);
        col.castShadow = col.receiveShadow = true;
        root.add(col);
        colBlockers.push({ x, z });
      }
    }
  }

  /* ---------------- corner offices ---------------- */
  if (cfg.officeCornerSF) {
    const oside = Math.sqrt(cfg.officeCornerSF * 0.092903); // sf → m², square block
    const oh = 3.2;
    const spots = [
      { x: -hallW / 2 + oside / 2 + 0.3, z: hallD - oside / 2 - 0.3 },
      { x: hallW / 2 - oside / 2 - 0.3, z: hallD - oside / 2 - 0.3 },
      { x: -hallW / 2 + oside / 2 + 0.3, z: -grayD + oside / 2 + 0.3 },
      { x: hallW / 2 - oside / 2 - 0.3, z: -grayD + oside / 2 + 0.3 },
    ];
    for (const s of spots) {
      const off = new THREE.Group();
      const shellBox = new THREE.Mesh(new THREE.BoxGeometry(oside, oh, oside), mats.wall());
      shellBox.position.y = oh / 2;
      off.add(shellBox);
      const glassBand = new THREE.Mesh(new THREE.BoxGeometry(oside + 0.04, 1.3, oside + 0.04), mats.wallGlass());
      glassBand.position.y = 1.8;
      off.add(glassBand);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(oside + 0.1, 0.12, oside + 0.1), mats.roof());
      cap.position.y = oh + 0.06;
      off.add(cap);
      const warm = new THREE.PointLight(0xffdfa0, 12, oside * 2.2, 1.6);
      warm.position.y = oh - 0.6;
      off.add(warm);
      off.position.set(s.x, 0, s.z);
      root.add(off);
      const l = makeLabel('OFFICE', { size: 20, color: '#d8c48a' });
      l.position.set(s.x, oh + 1.0, s.z);
      root.add(l); layers.labels.push(l);
      officeRects.push({ x0: s.x - oside / 2 - 0.6, x1: s.x + oside / 2 + 0.6, z0: s.z - oside / 2 - 0.6, z1: s.z + oside / 2 + 0.6 });
    }
  }

  function rackBlocked(x, zRow) {
    for (const c of colBlockers) {
      if (Math.abs(x - c.x) < 0.55 && Math.abs(zRow - c.z) < rackD / 2 + 0.5) return true;
    }
    for (const o of officeRects) {
      if (x > o.x0 && x < o.x1 && zRow > o.z0 && zRow < o.z1) return true;
    }
    return false;
  }

  /* ---------------- interior lighting ---------------- */
  for (let f = 0; f < floors; f++) {
    const lightY = f * floorH + floorH - 0.4;
    for (let i = 0; i < 4; i++) {
      const pl = new THREE.PointLight(0xcfe3ff, 55, hallW * 1.4, 1.8);
      pl.position.set((i % 2 === 0 ? -1 : 1) * hallW / 4, lightY, hallD * (0.25 + 0.5 * Math.floor(i / 2)));
      root.add(pl);
    }
  }
  const gl = new THREE.PointLight(0xffe8c4, 70, hallW * 1.2, 1.8);
  gl.position.set(0, floorH - 0.4, -grayD / 2);
  root.add(gl);

  /* ---------------- zone labels ---------------- */
  function zoneLabel(text, sub, x, y, z, color) {
    const l = makeLabel(text, { sub, color });
    l.position.set(x, y, z);
    root.add(l);
    layers.labels.push(l);
    return l;
  }
  zoneLabel('WHITE SPACE', `${floors > 1 ? floors + ' floors · ' : ''}${rowCount * floors} rows · ${rowCount * racksPerRow * floors} racks`, 0, wallH + 2.2, hallD / 2, '#7fd4ff');
  zoneLabel('GRAY SPACE', 'power & controls', 0, wallH + 2.2, -grayD / 2, '#ffc233');
  zoneLabel('YARD', 'generation · heat rejection · fuel', 0, 6.5, -grayD - yardD / 2, '#9fb2c8');

  /* ---------------- white space rows (per floor) ---------------- */
  const protoRack = cfg.rows.builder ? cfg.rows.builder() : B.buildById(rackId, cfg.rows.opts ?? {});
  const rowZs = [];   // { z, facing, floor, yOff }
  const zStart = aisleOuter + rackD / 2 + 1.2;

  let placedRacks = 0;
  // column z-lines (for row nudging: rows dodge columns instead of losing racks)
  const colZLines = [];
  if (cfg.columnGrid) for (let cz = cfg.columnGrid; cz < hallD - 0.5; cz += cfg.columnGrid) colZLines.push(cz);
  const rowHitsColumns = (zRow) => colZLines.some(zl => Math.abs(zRow - zl) < rackD / 2 + 0.55);

  const hallCount = Math.max(1, cfg.halls ?? 1);
  const hallDepth = hallD / hallCount;
  const pairsPerHall = cfg.balanceHalls && hallCount > 1 ? Math.ceil(pairs / hallCount) : Infinity;

  for (let f = 0; f < floors; f++) {
    const yOff = f * floorH;
    const zCursors = [];
    for (let h2 = 0; h2 < hallCount; h2++)
      zCursors[h2] = h2 === 0 ? zStart : h2 * hallDepth + 1.1 + rackD / 2 + aisleOuter;

    for (let p = 0; p < pairs; p++) {
      const hallIdx = pairsPerHall === Infinity ? 0 : Math.min(Math.floor(p / pairsPerHall), hallCount - 1);
      let z = zCursors[hallIdx];

      if (pairsPerHall === Infinity) {
        // sequential fill: jump the pair past any demising wall it would straddle
        let guard = 0;
        while (guard++ < 4) {
          const zEnd = z + pairDepth;
          const hit = dividerZs.find(dz => z - rackD / 2 - 0.9 < dz && zEnd + 0.9 > dz);
          if (hit === undefined) break;
          z = hit + 0.9 + rackD / 2 + aisleOuter;
        }
      }
      // nudge the pair so neither row lands on a column line (zero racks lost to columns)
      let nudge = 0;
      while (nudge++ < 14 && (rowHitsColumns(z) || rowHitsColumns(z + rackD + aisleShared))) z += 0.35;

      const zLimit = pairsPerHall === Infinity ? hallD - 1.5 : (hallIdx + 1) * hallDepth - 1.2;
      if (z + pairDepth > zLimit) { zCursors[hallIdx] = z; continue; } // this hall is full

      const zA = z;
      const zB = z + rackD + aisleShared;
      const aisleZ = (zA + zB) / 2;

      for (const [rowIdx, zRow, facing] of [[p * 2, zA, liquid ? -1 : 1], [p * 2 + 1, zB, liquid ? 1 : -1]]) {
        if (rowIdx >= rowCount) continue;
        rowZs.push({ z: zRow, facing, floor: f, yOff });
        for (let i = 0; i < racksPerRow; i++) {
          const rx = -rowLen / 2 + rackW * (i + 0.5);
          if (rackBlocked(rx, zRow)) continue;  // leave a gap at columns / offices
          // egress break every Nth slot (NFPA-style mid-row exit path)
          if (cfg.rows.egressEvery && (i + 1) % cfg.rows.egressEvery === 0) continue;
          // stop adding IT once the power-limited target is met
          if (cfg.rows.maxRacks && placedRacks >= cfg.rows.maxRacks
              && !(cfg.rows.inRowEvery && (i + 1) % cfg.rows.inRowEvery === 0)) continue;
          // air-cooled high-density rows interleave in-row coolers every Nth slot
          if (cfg.rows.inRowEvery && (i + 1) % cfg.rows.inRowEvery === 0) {
            const irc = B.buildInRowCooler('ACL-001');
            irc.position.set(rx, yOff, zRow);
            if (facing < 0) irc.rotation.y = Math.PI;
            addPick(irc);
            continue;
          }
          const rack = protoRack.clone();
          rack.userData = { ...protoRack.userData };
          rack.position.set(rx, yOff, zRow);
          if (facing < 0) rack.rotation.y = Math.PI;
          addPick(rack);
          placedRacks++;
        }
        const busA = B.buildBusway('PDW-001', rowLen + 1.4, 'A');
        busA.position.set(0, yOff + busH, zRow - 0.12);
        addPick(busA);
        if (include.busB) {
          const busB = B.buildBusway('PDW-001', rowLen + 1.4, 'B');
          busB.position.set(0, yOff + busH + 0.32, zRow + 0.12);
          addPick(busB);
        }
        if (include.trays) {
          const tray = B.buildCableTray('CPW-005', rowLen + 1.4);
          tray.position.set(0, yOff + busH + 0.75, zRow);
          addPick(tray);
          const fiber = B.buildFiberDuct('CPW-003', rowLen + 1.4);
          fiber.position.set(0, yOff + busH + 1.0, zRow);
          addPick(fiber);
        }
        if (liquid) {
          for (const s of [-1, 1]) {
            const cdu = B.buildRowCDU('LCL-002');
            cdu.position.set(s * (rowLen / 2 + dims('LCL-002').w / 2 + 0.35), yOff, zRow);
            cdu.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
            addPick(cdu);
          }
        }
      }

      if (rowCount > p * 2 + 1 && include.containment !== false) {
        const cont = B.buildContainment(aisleShared, rowLen, rackH);
        cont.position.set(0, yOff, aisleZ);
        addPick(cont);
        layers.containment.push(cont);
      }

      // airflow + heat for this pair
      const half = rowLen / 2;
      if (liquid) {
        flows.addAir(new THREE.Box3(new THREE.Vector3(-half, yOff + 0.3, aisleZ - aisleShared / 2), new THREE.Vector3(half, yOff + rackH, aisleZ + aisleShared / 2)),
          new THREE.Vector3(0, 0.9, 0), { color: 0xff6a4a, count: 110, opacity: 0.35 });
        flows.addHeat(new THREE.Vector3(0, yOff + rackH, aisleZ), { count: 44, spread: half * 0.8, rise: 2.2, size: 1.1, opacity: 0.1 });
        flows.addAir(new THREE.Box3(new THREE.Vector3(-half, yOff + 0.2, zA - rackD / 2 - 1.1), new THREE.Vector3(half, yOff + rackH * 0.8, zA - rackD / 2 - 0.05)),
          new THREE.Vector3(0, 0.05, 0.5), { color: 0x7fd4ff, count: 70, opacity: 0.3 });
        if (rowCount > p * 2 + 1)
          flows.addAir(new THREE.Box3(new THREE.Vector3(-half, yOff + 0.2, zB + rackD / 2 + 0.05), new THREE.Vector3(half, yOff + rackH * 0.8, zB + rackD / 2 + 1.1)),
            new THREE.Vector3(0, 0.05, -0.5), { color: 0x7fd4ff, count: 70, opacity: 0.3 });
      } else {
        flows.addAir(new THREE.Box3(new THREE.Vector3(-half, yOff + 0.1, aisleZ - aisleShared / 2), new THREE.Vector3(half, yOff + rackH * 0.9, aisleZ + aisleShared / 2)),
          new THREE.Vector3(0, 0.55, 0), { color: 0x7fd4ff, count: 110, opacity: 0.4 });
        flows.addAir(new THREE.Box3(new THREE.Vector3(-half, yOff + 0.4, zA - rackD / 2 - 0.9), new THREE.Vector3(half, yOff + rackH + 1, zA - rackD / 2 - 0.05)),
          new THREE.Vector3(0, 0.8, -0.25), { color: 0xff6a4a, count: 80, opacity: 0.3 });
        if (rowCount > p * 2 + 1)
          flows.addAir(new THREE.Box3(new THREE.Vector3(-half, yOff + 0.4, zB + rackD / 2 + 0.05), new THREE.Vector3(half, yOff + rackH + 1, zB + rackD / 2 + 0.9)),
            new THREE.Vector3(0, 0.8, 0.25), { color: 0xff6a4a, count: 80, opacity: 0.3 });
        flows.addHeat(new THREE.Vector3(0, yOff + rackH + 0.6, zA - rackD / 2 - 0.5), { count: 32, spread: half * 0.7, rise: 1.6, size: 0.9, opacity: 0.08 });
      }

      zCursors[hallIdx] = z + pairDepth + aisleOuter;
    }

    // pod labels (ground floor only, plus level tags above)
    if (f === 0) {
      for (let p = 0; p < pairs; p++) {
        const zc = zStart + p * (pairDepth + aisleOuter) + (pairDepth - rackD) / 2;
        const l = makeLabel(cfg.podName ? `${cfg.podName} ${p + 1}` : `POD ${p + 1}`, { size: 30, color: '#5c7a94' });
        l.position.set(-rowLen / 2 - 2.6, rackH + 1.1, zc);
        root.add(l); layers.labels.push(l);
      }
    } else {
      const l = makeLabel(`LEVEL ${f + 1}`, { size: 30, color: '#5c7a94' });
      l.position.set(-hallW / 2 + 2, yOff + rackH + 1.2, hallD / 2);
      root.add(l); layers.labels.push(l);
    }
  }

  /* ---------------- perimeter cooling units (air halls, per floor) ---------------- */
  if (include.crah && (!liquid || cfg.crahCount)) {
    const n = cfg.crahCount ?? Math.max(2, pairs + 1);
    const cd = dims('ACL-002');
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const idx = Math.floor(i / 2);
        const crah = B.buildCRAH('ACL-002');
        crah.position.set(side * (hallW / 2 - cd.d / 2 - 0.4), f * floorH, 3 + idx * (cd.w + 2.2) + cd.w / 2);
        crah.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        addPick(crah);
      }
    }
  }

  // floor PDUs along the gray-space divider (ground floor)
  if (include.pdus) {
    const pduCount = cfg.pduCount ?? Math.min(rowCount, 6);
    for (let i = 0; i < pduCount; i++) {
      const pdu = B.buildFloorPDU('PDW-002');
      pdu.position.set(-hallW / 2 + 3 + i * (hallW - 6) / Math.max(1, pduCount - 1), 0, 1.4);
      addPick(pdu);
    }
  }

  /* ---------------- gray space lineup ---------------- */
  const grayItems = [];
  let gx = -hallW / 2 + (cfg.officeCornerSF ? Math.sqrt(cfg.officeCornerSF * 0.092903) + 1.5 : 2.5);
  for (const item of cfg.gray) {
    for (let i = 0; i < (item.count ?? 1); i++) {
      const obj = B.buildById(item.id, item.opts ?? {});
      const bb = new THREE.Box3().setFromObject(obj);
      const w = bb.max.x - bb.min.x;
      obj.position.set(gx + w / 2, 0, -grayD + 1.6 + (item.rowOffset ?? 0));
      addPick(obj);
      grayItems.push({ id: item.id, x: gx + w / 2, w });
      gx += w + 0.9;
    }
  }

  /* ---------------- yard ---------------- */
  const yard = cfg.yard;
  const yardZ0 = -grayD - 2;

  const tfPositions = [];
  const nTf = yard.transformers ?? 2;
  for (let i = 0; i < nTf; i++) {
    const tf = B.buildTransformer('ELC-008');
    const x = -hallW / 2 + 6 + i * ((hallW - 12) / Math.max(1, nTf - 1));
    tf.position.set(x, 0, yardZ0 - 1.5);
    addPick(tf);
    tfPositions.push(new THREE.Vector3(x, 1.9, yardZ0 - 1.5));
  }

  // gensets (long axis along Z, radiators away from the building)
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
    addPick(group);
    result.gensets.push({ group, fans });
    // parts-built fans carry their own hub (spin about local y); legacy procedural fans spin about z
    flows.addFans(fans.map(fn => fn.userData?.hub ? fn : ({ userData: { hub: fn, axis: 'z' } })));
    const wp = exhaustAnchor.clone().applyEuler(new THREE.Euler(0, Math.PI / 2, 0)).add(group.position);
    flows.addExhaust(wp);
    genPositions.push(new THREE.Vector3(x, 1.6, genRowZ));
  }

  // chillers / dry coolers: rows beyond the gensets, wrapping when needed
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
    addPick(group);
    flows.addFans(fans.map(fn => fn.userData.hub ? fn : { userData: { hub: fn } }));
    chillPositions.push(new THREE.Vector3(x, 1.2, zc));
    // heat exhausts upward WELL clear of the fan deck — thin fast columns, never a pool
    flows.addHeat(new THREE.Vector3(x, dims(chId).h + 1.4, zc), { count: 22, spread: 1.3, rise: 5.5, size: 0.8, opacity: 0.045 });
  }

  let towerPos = null;
  if (yard.tower) {
    const { group, fans, mistAnchor } = B.buildCoolingTower('MEC-004');
    group.position.set(hallW / 2 + 6, 0, chillRowZ + 2);
    addPick(group);
    flows.addFans(fans);
    const mist = mistAnchor.clone().add(group.position);
    flows.addHeat(mist, { count: 36, spread: 1.4, rise: 4, size: 1.6, opacity: 0.12 });
    towerPos = group.position.clone();
  }
  if (yard.tes) {
    const tes = B.buildTank('MEC-007', true);
    tes.scale.setScalar(0.55);
    tes.userData.scaled = '55% visual scale';
    tes.position.set(-hallW / 2 - 9, 0, chillRowZ + 3);
    addPick(tes);
  }
  const nFuel = yard.fuel ?? 0;
  for (let i = 0; i < nFuel; i++) {
    const tank = B.buildTank('FUE-001', false);
    tank.position.set(hallW / 2 + 7, 0, genRowZ - 2 + i * 4.2);
    tank.rotation.y = Math.PI / 2;
    addPick(tank);
  }

  // yard equipment labels (so heat rejection never reads as "a water tank" again)
  function yardLabel(text, x, y, z, color = '#8fa6bd') {
    const l = makeLabel(text, { size: 22, color });
    l.position.set(x, y, z);
    root.add(l);
    layers.labels.push(l);
  }
  if (nGen) yardLabel(`DIESEL GENSETS · ${nGen}× ${comp(genId).Model ?? ''}`, genPositions[Math.floor(nGen / 2)]?.x ?? 0, dims(genId).h + 1.6, genRowZ, '#ffc233');
  if (nCh) yardLabel(`HEAT REJECTION · ${nCh}× ${comp(chId).Model ?? ''}`, 0, dims(chId).h + 2.0, chillRowZ, '#39c2ff');
  if (yard.tower && towerPos) yardLabel('COOLING TOWER', towerPos.x, dims('MEC-004').h + 1.8, towerPos.z, '#39c2ff');
  if (yard.tes) yardLabel('THERMAL STORAGE (CHILLED WATER)', -hallW / 2 - 9, dims('MEC-007').h * 0.55 + 1.8, chillRowZ + 3, '#7fd4ff');
  if (nFuel) yardLabel(`DIESEL FUEL · ${nFuel}× 20,000 gal`, hallW / 2 + 7, dims('FUE-001').h + 1.6, genRowZ + (nFuel - 1) * 2.1 - 2, '#ff8a5c');

  // utility interconnect
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
  for (const gp of genPositions) {
    flows.addBackup([
      gp,
      new THREE.Vector3(gp.x, 2.6, gp.z + 3),
      new THREE.Vector3(gp.x, 2.6, -grayD - 0.8),
      new THREE.Vector3(swX, 2.2, -grayD + 0.8),
      upsPoint,
    ], { count: 26, speed: 0.06, size: 0.3 });
  }
  for (const { z: zRow, yOff } of rowZs) {
    flows.addDist([
      upsPoint,
      new THREE.Vector3(swX, yOff + busH + 0.9, -grayD + 2.5),
      new THREE.Vector3(swX * 0.5, yOff + busH + 0.9, 0),
      new THREE.Vector3(-rowLen / 2 - 0.5, yOff + busH, zRow - 0.12),
      new THREE.Vector3(rowLen / 2, yOff + busH, zRow - 0.12),
    ], { count: 26, speed: 0.05, size: 0.22 });
  }

  /* ---------------- coolant loops ---------------- */
  if (liquid && nCh > 0) {
    const wallX = hallW / 2 - 1.2;
    for (let i = 0; i < rowZs.length; i++) {
      const { z: zRow, yOff } = rowZs[i];
      const src = chillPositions[i % nCh];
      const cduX = rowLen / 2 + dims('LCL-002').w / 2 + 0.35;
      flows.addCoolant([
        new THREE.Vector3(src.x, 1.4, src.z),
        new THREE.Vector3(hallW / 2 + 2.5, 2.8, -grayD - 4),
        new THREE.Vector3(wallX, yOff + 3.4, -grayD + 1),
        new THREE.Vector3(wallX, yOff + 3.4, zRow),
        new THREE.Vector3(cduX, yOff + 1.0, zRow),
        new THREE.Vector3(rowLen / 2 - 0.3, yOff + 0.6, zRow),
        new THREE.Vector3(-rowLen / 2 + 0.3, yOff + 0.6, zRow),
      ], { count: 40, speed: 0.045, size: 0.2 });
      flows.addCoolantReturn([
        new THREE.Vector3(-rowLen / 2 + 0.3, yOff + 1.9, zRow),
        new THREE.Vector3(rowLen / 2 - 0.3, yOff + 1.9, zRow),
        new THREE.Vector3(cduX, yOff + 2.2, zRow),
        new THREE.Vector3(wallX, yOff + 3.7, zRow),
        new THREE.Vector3(wallX, yOff + 3.7, -grayD + 1),
        new THREE.Vector3(hallW / 2 + 2.5, 3.1, -grayD - 4),
        new THREE.Vector3(src.x, 1.6, src.z),
      ], { count: 40, speed: 0.045, size: 0.2 });
    }
  } else if (nCh > 0) {
    for (let f = 0; f < floors; f++) {
      const yOff = f * floorH;
      for (const side of [-1, 1]) {
        const wx = side * (hallW / 2 - 1.4);
        const src = chillPositions[side > 0 ? 0 : Math.min(1, nCh - 1)];
        flows.addCoolant([
          new THREE.Vector3(src.x, 1.4, src.z),
          new THREE.Vector3(side * (hallW / 2 + 2.5), 3, -grayD - 3),
          new THREE.Vector3(wx, yOff + 3.2, -grayD + 1),
          new THREE.Vector3(wx, yOff + 3.2, hallD - 3),
          new THREE.Vector3(wx, yOff + 1.0, hallD - 3),
        ], { count: 32, speed: 0.04, size: 0.2 });
        flows.addCoolantReturn([
          new THREE.Vector3(wx, yOff + 1.2, hallD - 3),
          new THREE.Vector3(wx, yOff + 3.6, hallD - 3.4),
          new THREE.Vector3(wx, yOff + 3.6, -grayD + 1),
          new THREE.Vector3(side * (hallW / 2 + 2.5), 3.3, -grayD - 3),
          new THREE.Vector3(src.x, 1.6, src.z),
        ], { count: 32, speed: 0.04, size: 0.2 });
      }
    }
  }

  /* ---------------- anchors (for tours + education) ---------------- */
  const aisle0 = rowZs.length > 1 ? (rowZs[0].z + rowZs[1].z) / 2 : rowZs[0].z + rowZs[0].facing * (rackD / 2 + 1.2);
  result.anchors = {
    utility: utilPos.clone(),
    transformers: tfPositions,
    ups: upsPoint.clone(),
    grayCenter: new THREE.Vector3(swX, 1.4, -grayD / 2),
    grayItems,
    riser: new THREE.Vector3(swX, busH + 0.9, 0),
    rows: rowZs,
    aisle0,
    rowLen, rackH, rackD, busH,
    gensets: genPositions,
    chillers: chillPositions,
    tower: towerPos,
    hallW, hallD, grayD, yardD, wallH, floorH, floors,
    hallCenter: new THREE.Vector3(0, 1, hallD / 2),
    liquid,
  };

  /* ---------------- camera presets ---------------- */
  const c = (px, py, pz, tx, ty, tz) => ({ pos: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz) });
  result.cams = {
    overview: c(hallW * 1.25, wallH * 2.6, hallD + hallW * 0.85, 0, 0, (hallD - grayD - yardD * 0.6) / 2),
    aerial: c(0.01, Math.max(hallW, bldgD + yardD) * 1.35, siteZ + 0.01, 0, 0, siteZ),
    yard: c(hallW * 0.55, 9, -grayD - yardD - 9, 0, 1, -grayD - yardD / 2),
    gray: c(swX + 8, 5.5, -grayD + 12, swX, 1.4, -grayD + 2),
    white: c(0, rackH * 3.2, hallD - 2, 0, 1, hallD / 2 - 3),
    rack: c(-rowLen / 2 - 3.2, 1.7, aisle0, rowLen / 2, 1.15, aisle0),
  };

  /* ---------------- stats ---------------- */
  const rackKw = cfg.rows.kwPerRack || kw(rackId) || 8;
  const nRacks = placedRacks;
  // white space: hall floor area net of in-hall offices, vs building gross
  const officeInHall = officeRects.reduce((a, o) => {
    const zi = Math.max(0, Math.min(o.z1, hallD) - Math.max(o.z0, 0));
    return a + Math.max(0, (o.x1 - o.x0) - 1.2) * Math.max(0, zi - (zi ? 1.2 : 0));
  }, 0);
  // 0.72 fit-out factor: corridors, egress, MEP galleries, staging inside the halls
  const wsArea = (hallW * hallD - officeInHall) * 0.72;
  const grossArea = hallW * (hallD + grayD);
  // theoretical rack capacity of the shell (aisle-inclusive pitch, 15% derate for columns/egress)
  const capRacks = Math.floor((hallW - 4) / rackW) * Math.floor((hallD - 4) / ((pairDepth + aisleOuter) / 2)) * floors * 0.85;
  result.stats = {
    racks: nRacks,
    itKW: nRacks * rackKw,
    kwPerRack: rackKw,
    gpus: nRacks * (cfg.rows.gpusPerRack ?? 0),
    whiteSpacePct: Math.round(wsArea / grossArea * 100),
    spaceCapRacks: Math.floor(capRacks),
    grossSF: Math.round(grossArea / 0.092903),
    coolKW: nCh * (kw(chId) || 0),
    genKW: nGen * (kw(genId) || 0),
    genCount: nGen,
    chillerCount: nCh,
    fuelTanks: nFuel,
    basePUE: cfg.basePUE ?? (liquid ? 1.15 : 1.45),
  };

  scene.add(root);
  return result;
}
