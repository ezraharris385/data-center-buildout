// materials.js — shared palette + materials for the whole studio.
import * as THREE from 'three';

export const PALETTE = {
  bg: 0x07090d,
  ground: 0x0b0e13,
  concrete: 0x2a2e36,
  yardPad: 0x1c2027,
  steelDark: 0x1a1e26,
  steelMid: 0x3a4150,
  steelLight: 0x5c677a,
};

const M = {};

function std(name, params) {
  if (!M[name]) M[name] = new THREE.MeshStandardMaterial(params);
  return M[name];
}

export const mats = {
  // structure
  ground: () => std('ground', { color: 0x0c0f14, roughness: 0.95, metalness: 0 }),
  slab: () => std('slab', { color: 0x23272e, roughness: 0.9 }),
  yardPad: () => std('yardPad', { color: 0x1a1d23, roughness: 0.95 }),
  wall: () => std('wall', { color: 0x2e3540, roughness: 0.75, metalness: 0.25, transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
  wallGlass: () => std('wallGlass', { color: 0x9fd8ff, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
  roof: () => std('roof', { color: 0x333a46, roughness: 0.8, metalness: 0.3 }),
  floorWhite: () => std('floorWhite', { color: 0x394050, roughness: 0.55, metalness: 0.15 }),
  floorTileLine: () => new THREE.LineBasicMaterial({ color: 0x4c5668, transparent: true, opacity: 0.35 }),
  floorGray: () => std('floorGray', { color: 0x2b2f37, roughness: 0.85 }),
  fence: () => std('fence', { color: 0x39404d, roughness: 0.6, metalness: 0.7, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),

  // equipment bodies
  rackFrame: () => std('rackFrame', { color: 0x232833, roughness: 0.55, metalness: 0.55 }),
  rackDoor: () => std('rackDoor', { color: 0x2a303c, roughness: 0.35, metalness: 0.7 }),
  rackMesh: () => std('rackMesh', { color: 0x1a202a, roughness: 0.8, metalness: 0.4 }),
  serverFace: () => std('serverFace', { color: 0x323a48, roughness: 0.5, metalness: 0.6 }),
  serverSilver: () => std('serverSilver', { color: 0x8a94a4, roughness: 0.4, metalness: 0.75 }),
  nvidiaTray: () => std('nvidiaTray', { color: 0x3d4656, roughness: 0.45, metalness: 0.65 }),
  nvSwitch: () => std('nvSwitch', { color: 0x2c5642, roughness: 0.45, metalness: 0.6 }),
  powerShelf: () => std('powerShelf', { color: 0x55482e, roughness: 0.5, metalness: 0.6 }),

  upsBody: () => std('upsBody', { color: 0x3b4252, roughness: 0.5, metalness: 0.45 }),
  upsAccent: () => std('upsAccent', { color: 0x1e242e, roughness: 0.4, metalness: 0.5 }),
  battery: () => std('battery', { color: 0x2c3a4a, roughness: 0.55, metalness: 0.4 }),
  switchgear: () => std('switchgear', { color: 0x4a5262, roughness: 0.55, metalness: 0.5 }),
  transformer: () => std('transformer', { color: 0x4e5866, roughness: 0.6, metalness: 0.55 }),
  transformerFin: () => std('transformerFin', { color: 0x3c4450, roughness: 0.7, metalness: 0.6 }),

  genset: () => std('genset', { color: 0x8f7a1e, roughness: 0.55, metalness: 0.35 }),      // CAT-ish yellow, muted
  gensetDark: () => std('gensetDark', { color: 0x23262c, roughness: 0.6, metalness: 0.5 }),
  gensetEnclosure: () => std('gensetEnclosure', { color: 0x5d6470, roughness: 0.6, metalness: 0.45 }),
  chiller: () => std('chiller', { color: 0x5a6a78, roughness: 0.55, metalness: 0.5 }),
  chillerCoil: () => std('chillerCoil', { color: 0x36404a, roughness: 0.85, metalness: 0.3 }),
  coilSilver: () => std('coilSilver', { color: 0xb4bdc6, roughness: 0.55, metalness: 0.85 }),   // microchannel aluminum
  casing: () => std('casing', { color: 0xc9ced4, roughness: 0.5, metalness: 0.35 }),            // galvanized/powder-coat housing
  coolingTower: () => std('coolingTower', { color: 0x6a7280, roughness: 0.7, metalness: 0.3 }),
  tank: () => std('tank', { color: 0x7d8694, roughness: 0.45, metalness: 0.6 }),
  fuelTank: () => std('fuelTank', { color: 0x6b7280, roughness: 0.5, metalness: 0.55 }),
  fanBlade: () => std('fanBlade', { color: 0x9aa4b2, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }),
  fanRing: () => std('fanRing', { color: 0x2a2f38, roughness: 0.6, metalness: 0.6 }),

  crah: () => std('crah', { color: 0x8f98a5, roughness: 0.55, metalness: 0.3 }),
  crahDark: () => std('crahDark', { color: 0x353b46, roughness: 0.5, metalness: 0.4 }),
  cdu: () => std('cdu', { color: 0x2b4a5e, roughness: 0.45, metalness: 0.55 }),
  pdu: () => std('pdu', { color: 0x3a4048, roughness: 0.5, metalness: 0.5 }),

  busway: () => std('busway', { color: 0x8a6d1f, roughness: 0.4, metalness: 0.7 }),
  buswayB: () => std('buswayB', { color: 0x6d4a1f, roughness: 0.4, metalness: 0.7 }),
  cableTray: () => std('cableTray', { color: 0x555f6e, roughness: 0.55, metalness: 0.7 }),
  fiberDuct: () => std('fiberDuct', { color: 0xb8860b, roughness: 0.5, metalness: 0.2 }),
  pipeSupply: () => std('pipeSupply', { color: 0x1f6a8a, roughness: 0.35, metalness: 0.6 }),
  pipeReturn: () => std('pipeReturn', { color: 0x8a4a2a, roughness: 0.35, metalness: 0.6 }),
  containGlass: () => std('containGlass', { color: 0x7fd4ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  containFrame: () => std('containFrame', { color: 0x2c323c, roughness: 0.5, metalness: 0.6 }),

  // emissives
  ledGreen: () => std('ledGreen', { color: 0x0a2012, emissive: 0x3ddc84, emissiveIntensity: 2.2 }),
  ledBlue: () => std('ledBlue', { color: 0x0a1420, emissive: 0x39c2ff, emissiveIntensity: 2.2 }),
  ledAmber: () => std('ledAmber', { color: 0x201808, emissive: 0xffc233, emissiveIntensity: 2.2 }),
  ledRed: () => std('ledRed', { color: 0x200a08, emissive: 0xff5c39, emissiveIntensity: 2.2 }),
  screenDark: () => std('screenDark', { color: 0x05070a, emissive: 0x0a3346, emissiveIntensity: 0.6, roughness: 0.2 }),
  hotGlow: () => std('hotGlow', { color: 0xff6a4a, emissive: 0xff5c39, emissiveIntensity: 0.8, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide }),
  coldGlow: () => std('coldGlow', { color: 0x7fd4ff, emissive: 0x39c2ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
};

// Blink groups: LEDs are assigned one of 3 shared materials whose intensity is animated on a phase offset.
export const blinkMats = [
  new THREE.MeshStandardMaterial({ color: 0x0a2012, emissive: 0x3ddc84, emissiveIntensity: 2 }),
  new THREE.MeshStandardMaterial({ color: 0x0a1420, emissive: 0x39c2ff, emissiveIntensity: 2 }),
  new THREE.MeshStandardMaterial({ color: 0x0a2012, emissive: 0x3ddc84, emissiveIntensity: 2 }),
];

export function animateBlink(t) {
  blinkMats[0].emissiveIntensity = 1.4 + Math.sin(t * 7.3) * 1.2;
  blinkMats[1].emissiveIntensity = 1.4 + Math.sin(t * 11.1 + 2) * 1.2;
  blinkMats[2].emissiveIntensity = 1.4 + Math.sin(t * 4.7 + 4) * 1.2;
}
