// custom.js — the Custom Projects tab: a parametric facility builder.
// Every control maps onto the same config shape the four archetypes use,
// so the composer, flows, education and analyst all work on custom builds.
import * as B from './builders.js?b50';
import { comp, kw } from './catalog.js?b50';

/* ---------------- compute platforms (chip dropdown) ----------------
   Per-chip rack architecture: GPUs per rack, rack power, cooling, and the
   closest catalog rack for true-dimension rendering. Power figures are
   vendor-published rack/system numbers (recall-grade). */
export const CHIP_OPTIONS = [
  // kW/rack, weights, voltages, liquid-heat share, availability and costs are
  // from DesignStudioEquipmentSpecs.xlsx (CBRE Design Studio engine, catalog v1).
  // sysCost = system $ incl. silicon (tenant-side); bomCost = facility hardware.
  { key: 'gb200',  label: 'GB200 NVL72 (132 kW)',      gpusPerRack: 72, kwRack: 132, cooling: 'liquid', rackId: 'RCK-004',
    builder: () => B.buildNVL72('RCK-004', { accent: '#3ddc84' }), year: 2025, rackKg: 1360, domain: 72, volts: '415/480 AC → 54 VDC busbar',
    liquidShare: 0.87, avail: 'shipping', sysCost: 3200000, bomCost: 95000, conf: 'high',
    use: 'Frontier training — 72-GPU NVLink scale-up domain, one machine per rack' },
  { key: 'gb200n36', label: 'GB200 NVL36 (66 kW)',     gpusPerRack: 36, kwRack: 66,  cooling: 'liquid', rackId: 'RCK-004',
    builder: () => B.buildNVL72('RCK-004', { accent: '#2f9e6b' }), year: 2025, rackKg: 700, domain: 36, volts: '415/480 AC → 54 VDC busbar',
    liquidShare: 0.87, avail: 'shipping', sysCost: 1700000, bomCost: 60000, conf: 'med',
    use: 'Half-domain Blackwell — power-constrained sites, paired racks form NVL72' },
  { key: 'gb300',  label: 'GB300 NVL72 (142 kW)',      gpusPerRack: 72, kwRack: 142, cooling: 'liquid', rackId: 'RCK-005',
    builder: () => B.buildNVL72('RCK-005', { accent: '#2fd1c0' }), year: 2026, rackKg: 1497, domain: 72, volts: '415/480 AC → 54 VDC busbar',
    liquidShare: 0.88, avail: 'shipping', sysCost: 3850000, bomCost: 110000, conf: 'high',
    use: 'Blackwell Ultra — frontier training + high-throughput reasoning inference' },
  { key: 'vr200',  label: 'Vera Rubin VR200 NVL72 (230 kW)', gpusPerRack: 72, kwRack: 230, cooling: 'liquid', rackId: 'RCK-005',
    builder: () => B.buildNVL72('RCK-005', { accent: '#8a6cff' }), year: 2027, rackKg: 1814, domain: 72, volts: '800 VDC',
    liquidShare: 0.92, avail: 'roadmap', sysCost: 8000000, bomCost: 150000, conf: 'med',
    use: 'Next-gen frontier training — Oberon rack, 800 VDC, volume H2 2026' },
  { key: 'kyber',  label: 'Rubin Ultra Kyber NVL576 (600 kW)', gpusPerRack: 144, kwRack: 600, cooling: 'liquid', rackId: 'RCK-005',
    builder: () => B.buildNVL72('RCK-005', { accent: '#b44cff' }), year: 2027, rackKg: 2000, domain: 144, volts: '800 VDC',
    liquidShare: 0.92, avail: 'roadmap', sysCost: null, bomCost: 200000, conf: 'low',
    use: 'Rubin Ultra rack-scale (H2 2027) — 576 dies/rack; the 600 kW era' },
  { key: 'b200',   label: 'B200 HGX (58 kW)',          gpusPerRack: 32, kwRack: 58,  cooling: 'liquid', rackId: 'RCK-003',
    builder: () => B.buildHGXRack('RCK-003', { liquid: true, accent: '#76b900' }), year: 2025, rackKg: 950, domain: 8, volts: '415 V AC whips',
    liquidShare: 0.75, avail: 'shipping', sysCost: null, bomCost: null, conf: 'med',
    use: 'Training + inference on 8-GPU HGX nodes — cloud-standard building block, DLC' },
  { key: 'h200',   label: 'Hopper H200 HGX (44 kW)',   gpusPerRack: 32, kwRack: 44,  cooling: 'air',    rackId: 'RCK-003',
    builder: () => B.buildHGXRack('RCK-003', { liquid: false, accent: '#76b900' }), year: 2024, rackKg: 880, domain: 8, volts: '415 V AC whips',
    liquidShare: 0, avail: 'shipping', sysCost: null, bomCost: null, conf: 'med',
    use: 'Inference + fine-tuning — memory-upgraded Hopper, air/RDHx cooled' },
  { key: 'h100',   label: 'Hopper H100 SXM HGX (41 kW)', gpusPerRack: 32, kwRack: 41, cooling: 'air',   rackId: 'RCK-003',
    builder: () => B.buildHGXRack('RCK-003', { liquid: false, accent: '#76b900' }), year: 2023, rackKg: 860, domain: 8, volts: '415 V AC whips',
    liquidShare: 0, avail: 'shipping', sysCost: null, bomCost: null, conf: 'med',
    use: 'The installed-base workhorse — training/fine-tune/inference on 8-GPU nodes' },
  { key: 'mi450x', label: 'AMD Helios MI450X (230 kW)', gpusPerRack: 72, kwRack: 230, cooling: 'liquid', rackId: 'RCK-004',
    builder: () => B.buildNVL72('RCK-004', { accent: '#e0442e' }), year: 2026, rackKg: 1600, domain: 72, volts: '800 VDC',
    liquidShare: 0.90, avail: 'roadmap', sysCost: 3000000, bomCost: 150000, conf: 'low',
    use: 'AMD rack-scale frontier training — 72-GPU UALink domain, H2 2026' },
  { key: 'mi355x', label: 'AMD MI355X UBB (60 kW)',    gpusPerRack: 32, kwRack: 60,  cooling: 'liquid', rackId: 'RCK-003',
    builder: () => B.buildHGXRack('RCK-003', { liquid: true, accent: '#e0442e' }), year: 2025, rackKg: 980, domain: 8, volts: '415 V AC whips',
    liquidShare: 0.78, avail: 'shipping', sysCost: null, bomCost: null, conf: 'med',
    use: 'AMD training + inference — 4× 15 kW UBB nodes, DLC required' },
  { key: 'mi325x', label: 'AMD MI325X (46 kW)',        gpusPerRack: 32, kwRack: 46,  cooling: 'air',    rackId: 'RCK-003',
    builder: () => B.buildHGXRack('RCK-003', { liquid: false, accent: '#e0442e' }), year: 2024, rackKg: 900, domain: 8, volts: '415 V AC whips',
    liquidShare: 0, avail: 'shipping', sysCost: null, bomCost: null, conf: 'med',
    use: 'Memory-capacity inference — 256 GB HBM3E per GPU, air-cooled' },
  { key: 'mi300x', label: 'AMD MI300X (38 kW)',        gpusPerRack: 32, kwRack: 38,  cooling: 'air',    rackId: 'RCK-002',
    builder: () => B.buildHGXRack('RCK-002', { liquid: false, accent: '#e0442e' }), year: 2024, rackKg: 850, domain: 8, volts: '415 V AC whips',
    liquidShare: 0, avail: 'shipping', sysCost: null, bomCost: null, conf: 'med',
    use: 'LLM serving at max memory per dollar — the inference-fleet chip' },
];

/* ---------------- 77 N Ave & Niles — 30 MW industrial retrofit ----------------
   From "30MW Data Center Retrofit-Industrial.xlsm" Assumptions:
   135,650 SF shell (modeled 500 ft × 271 ft), 32 ft clear, site 8.2 ac,
   utility 10→30 MW, design PUE 1.25, critical IT 24 MW, office 5,160 SF,
   generators N+1 36 MW, UPS 30 MW. Layout directives: demising wall every 1/3,
   office in each corner, 50×50 ft column bays. */
export const SITE_77N = {
  key: '77n', name: 'North Ave, Northlake (measured KMZ)',
  // The user's KMZ polygons live at 55 E North Ave, Northlake: 12,109 SF
  // building (126×123 ft) on a 0.59 ac parcel. Small shell — space binds.
  // Power program ASSUMED = same 30 MW study until told otherwise.
  buildingW_ft: 126, buildingD_ft: 123, clearH_ft: 28,
  grossSF: 12109, officeSF: 0,
  utilityMW: 30, criticalITMW: 24, designPUE: 1.25,
  genMW: 36, upsMW: 30, halls: 1, columnFt: 0,
  dockDoors: 2, driveIns: 0, grayD: 6,
  parcel: { w_ft: 224, d_ft: 121, dx_ft: -20, dz_ft: 15, acres: 0.59 },
  measured: true, geoFile: 'data/northlake_site.json',
}

/* Lehigh Ave building — MEASURED from the user's Google Earth KMZs (building +
   parcel polygons). Footprint ≈ 126×123 ft irregular, 12,109 SF, on a 0.59-acre
   parcel (224×121 ft). NOTE: this is ~11× smaller than the 30 MW workbook shell —
   space, not power, binds this site. Power program assumed = same 30 MW study. */
export const SITE_LEHIGH = {
  key: 'lehigh', name: 'Lehigh Ave, Niles — 30 MW retrofit',
  // Footprint from the user's pin (42°01'19.1"N 87°46'47.8"W) + OSM building
  // way 914110323: 256×549 ft, 138,892 SF traced (workbook: 135,650 SF).
  // This IS the 30 MW workbook shell — tri-hall, 50×50 bays, corner offices.
  buildingW_ft: 256, buildingD_ft: 549, clearH_ft: 32,
  grossSF: 135650, officeSF: 5160,
  utilityMW: 30, criticalITMW: 24, designPUE: 1.25,
  genMW: 36, upsMW: 30, halls: 3, columnFt: 50,
  dockDoors: 13, driveIns: 2, grayD: 10,
  parcel: null,                       // parcel KMZ pending — building footprint is measured
  measured: true, geoFile: 'data/niles_site.json',
}

/* Google Gen-4 AI reference building — from the Design Studio Building Presets
   sheet (published-derived): 500×300 ft, 2 stories, 34 ft clear, 400 psf slab,
   liquid-ready hybrid, 2N UPS / N+1 gen, target PUE 1.10. A benchmark shell to
   compare the retrofit sites against hyperscale practice. */
export const SITE_G4 = {
  key: 'g4', name: 'Google Gen-4 AI (reference)',
  buildingW_ft: 300, buildingD_ft: 500, clearH_ft: 34,
  grossSF: 300000, officeSF: 8000, stories: 2,
  utilityMW: 66, criticalITMW: 60, designPUE: 1.10,
  genMW: 72, upsMW: 60, halls: 2, columnFt: 40,
  dockDoors: 6, driveIns: 2, grayD: 14,
  reference: true,
};

export const SITES = { '77n': SITE_77N, 'lehigh': SITE_LEHIGH, 'g4': SITE_G4 };

export const RACK_OPTIONS = [
  { id: 'RCK-004', label: 'NVIDIA GB200 NVL72 · 120 kW · liquid', cooling: 'liquid', kw: 120, builder: () => B.buildNVL72('RCK-004') },
  { id: 'RCK-005', label: 'NVIDIA GB300 NVL72 · 135 kW · liquid', cooling: 'liquid', kw: 135, builder: () => B.buildNVL72('RCK-005') },
  { id: 'RCK-006', label: 'OCP Open Rack v3 · ~17 kW · air', cooling: 'air', kw: 17, builder: () => B.buildORv3('RCK-006', { fill: 0.85 }) },
  { id: 'RCK-001', label: 'APC NetShelter 42U · ~6 kW · air', cooling: 'air', kw: 6, builder: () => B.buildRackEnclosure('RCK-001', { fillRU: 0.65 }) },
  { id: 'RCK-002', label: 'APC NetShelter 48U deep · ~8 kW · air', cooling: 'air', kw: 8, builder: () => B.buildRackEnclosure('RCK-002', { fillRU: 0.7 }) },
  { id: 'RCK-003', label: 'Vertiv VR 48U wide · ~10 kW · air', cooling: 'air', kw: 10, builder: () => B.buildRackEnclosure('RCK-003', { fillRU: 0.7 }) },
];

export const UPS_OPTIONS = [
  { id: 'ELC-001', label: 'Vertiv EXL S1 · 1200 kVA', kw: 1200 },
  { id: 'ELC-002', label: 'Schneider Galaxy VX · 1500 kVA', kw: 1500 },
  { id: 'ELC-003', label: 'Vertiv APM2 modular · 600 kW', kw: 600 },
  { id: 'ELC-004', label: 'Eaton 93PM · 200 kW', kw: 200 },
];

export const GEN_OPTIONS = [
  { id: 'BKP-003', label: 'Enclosed 3 MW (40 ft class)', kw: 3000 },
  { id: 'BKP-002', label: 'Cummins QSK95 · 3.5 MW open', kw: 3500 },
  { id: 'BKP-001', label: 'Cat 3516B · 2 MW open', kw: 2000 },
];

export const HEATREJ_OPTIONS = [
  { id: 'MEC-005', label: 'Güntner dry coolers · 1 MW ea (DLC)', kw: 1000, tower: false },
  { id: 'MEC-001', label: 'Carrier 30XA air-cooled chillers · 1 MW ea', kw: 1000, tower: false },
  { id: 'MEC-002', label: 'Vertiv AFC air-cooled chillers · 1 MW ea', kw: 1000, tower: false },
];

// current custom state (defaults: a mid-size AI build)
export const custom = {
  site: 'free',                       // 'free' or '77n' (locked to the retrofit shell)
  chip: 'gb200',                      // active platform when site != free
  siteW_ft: 271, siteD_ft: 500,       // 77N footprint — ASSUMED from 135,650 SF gross; edit to match survey
  rack: 'RCK-004', rows: 4, racksPerRow: 8, kwPerRack: null, // null = rack default
  floors: 1, wallH: 6, hallMarginX: 7, shell: 'solid',
  cooling: 'auto',                    // auto = follow rack type
  heatRej: 'MEC-005', heatRejCount: 4, crahCount: 6,
  ups: 'ELC-001', upsCount: 2, batteries: 4,
  gen: 'BKP-003', genCount: 3, transformers: 2,
  sts: true, ats: true, mvSwitchgear: true, lvSwitchgear: true,
  containment: true, busB: true, trays: true, pdus: true, tes: false, fuel: 1, tower: false,
};

const FT = 0.3048;

export function activeSite() { return SITES[custom.site] ?? SITE_77N; }

/* user-dragged equipment placements from the site map, per site:
   placement[siteKey] = { 'BKP-003#2': {x, z}, ... }  (scene meters) */
export const placement = {};
export function setPlacement(siteKey, instKey, x, z) {
  (placement[siteKey] ??= {})[instKey] = { x, z };
}
export function clearPlacement(siteKey) { delete placement[siteKey]; }


/* ---------------- interior space program (site builds) ----------------
   What a real fit-out consumes, in SF per kW of critical IT. At rack-scale DLC
   densities the white space is SMALL and the support rooms dominate — 26.9 MW of
   GB200 needs a ~79x51 ft pod but ~12,000 SF of electrical and ~9,400 SF of
   mechanical to serve it. Anything left over is shell, and we say so.
   Ratios: electrical 0.45 SF/kW (UPS, switchgear, batteries, PDU/RPP),
   mechanical 0.35 SF/kW (CDUs, pumps, heat exchangers), corridors 12%. */
const M2_SF = 10.7639;
export function spaceProgram(chip, itKW, racks, hallW_m, hallD_m, grayArea_SF, officeSF) {
  const liquid = chip.cooling === 'liquid';
  const rackW = 0.6, rackD = 1.068;
  const hot = liquid ? 1.3 : 1.2192, cold = 1.2192;
  const pairPitch = 2 * rackD + hot + cold;          // depth consumed per PAIR of rows

  // pod proportioned toward square-ish, capped by the hall width
  const podW = Math.min(24, hallW_m - 8);
  const perRow = Math.max(8, Math.floor(podW / rackW));
  const egressEvery = 17;
  const inRowEvery = liquid ? 0 : 5;
  const racksEff = perRow - Math.floor(perRow / egressEvery)
    - (inRowEvery ? Math.floor(perRow / inRowEvery) : 0);
  const rowsNeeded = Math.max(2, Math.ceil(racks / racksEff));
  const pairs = Math.ceil(rowsNeeded / 2);
  const podD = pairs * pairPitch + 2.0;

  const elecTotal = 0.45 * itKW;                     // SF
  const elecInterior = Math.max(0, elecTotal - grayArea_SF);
  const mech = 0.35 * itKW;
  const storage = 4000;
  const podSF = podW * podD * M2_SF;
  const sub = podSF + elecInterior + mech + storage + (officeSF || 0);
  const corridors = 0.12 * sub;
  const programSF = sub + corridors;
  const hallSF = hallW_m * hallD_m * M2_SF;

  return {
    pod: { w: podW, d: podD, perRow, rows: rowsNeeded, pairs, racksEff, egressEvery, inRowEvery },
    areas: {
      whiteSpace: Math.round(podSF),
      electricalGray: Math.round(grayArea_SF),
      electricalInterior: Math.round(elecInterior),
      mechanical: Math.round(mech),
      noc: Math.round(officeSF || 0),
      storage,
      corridors: Math.round(corridors),
      programTotal: Math.round(programSF),
      shell: Math.round(Math.max(0, hallSF - programSF)),
      hall: Math.round(hallSF),
    },
    sfPerRack: Math.round(programSF / Math.max(1, racks)),
    shellPct: Math.round(Math.max(0, hallSF - programSF) / hallSF * 100),
    // what the leftover shell could host at this program density, if power existed
    shellRacks: Math.floor(Math.max(0, hallSF - programSF) / (programSF / Math.max(1, racks))),
  };
}

/* Balance-of-plant optimizer: everything that ISN'T the chip, tuned to the chip.
   Levers (Design Studio efficiency model + engineering practice):
   - Heat rejection tech: DLC platforms -> adiabatic dry coolers (compressor-free
     year-round in a temperate climate, -0.02 PUE, WUE ~0.15); air platforms ->
     air-cooled chillers with waterside economizer
   - Air-side sizing: liquid halls only need fan-walls for the (1-liquidShare)
     air fraction, not a full CRAH fleet
   - Power topology: 800 VDC rack-scale platforms -> DC distribution + BESS
     ride-through (fewer conversion stages, -0.01 PUE); 54 VDC / AC platforms
     keep central UPS + Li-ion cabinets
   - Air optimization: containment + 27 C supply (ASHRAE A1 allowable) on air
     platforms (-0.03 PUE vs generic hybrid) */
export function bopFor(chip) {
  const liquid = chip.cooling === 'liquid';
  const dc800 = (chip.volts ?? '').includes('800 VDC');
  const base = liquid ? 1.2 : 1.32;
  let pue = base - (base - 1.06) * 0.55 * (chip.liquidShare ?? 0);
  const adiabatic = liquid;
  if (adiabatic) pue -= 0.02;
  const airOpt = !liquid;
  if (airOpt) pue -= 0.03;
  if (dc800) pue -= 0.01;
  pue = Math.max(1.07, Math.round(pue * 100) / 100);
  return {
    pue, adiabatic, dc800, airOpt,
    wue: adiabatic ? 0.15 : 0,
    heatRejId: liquid ? 'MEC-005' : 'MEC-001',
    notes: [
      liquid ? 'Adiabatic dry coolers — compressor-free year-round in Chicago (design WB 78 °F)' :
               'Air-cooled chillers + waterside economizer (free cooling below ~45 °F)',
      liquid ? `Fan-walls sized to the ${(100 - (chip.liquidShare ?? 0) * 100).toFixed(0)}% air-share only — not a full CRAH fleet` :
               'Full containment + 27 °C supply air (ASHRAE A1 allowable)',
      dc800 ? '800 VDC distribution + BESS ride-through — fewer conversion stages than central UPS' :
              'Central UPS blocks + Li-ion cabinets (54 VDC shelves take it from the busway)',
    ],
  };
}

// shared sizing math: what this chip deploys inside the active site's confines
export function versionStats(chip, s = activeSite()) {
  const liquid = chip.cooling === 'liquid';
  // PUE comes from the per-chip balance-of-plant optimizer (bopFor)
  const pue = bopFor(chip).pue;
  const itBudgetKW = Math.floor(Math.min(s.utilityMW * 1000 / pue, s.upsMW * 1000));
  const maxRacks = Math.floor(itBudgetKW / chip.kwRack);
  return {
    liquid, pue, maxRacks,
    itKW: maxRacks * chip.kwRack,
    gpus: maxRacks * chip.gpusPerRack,
    utilMW: (maxRacks * chip.kwRack * pue) / 1000,
  };
}

// one buildout version per chip — the ENTIRE plant is derived from the chip's
// actual load, so operational performance tracks the compute choice 1:1.
export function siteVersionConfig(chipKey) {
  const chip = CHIP_OPTIONS.find(c => c.key === chipKey) ?? CHIP_OPTIONS[0];
  const s = activeSite();
  // OPTIMIZED sizing: deployable IT = what the confines allow —
  //   min( 30 MW utility ÷ platform PUE , 30 MW UPS budget ).
  // The workbook's 24 MW critical IT assumed PUE 1.25; efficient liquid plants
  // recover that gap as extra compute, air plants pay the tax.
  const { liquid, pue, maxRacks } = versionStats(chip);
  const bop = bopFor(chip);
  // INTERIOR FIT-OUT: size a real data-hall pod for the powered racks, then the
  // support rooms that serve them. Rows pack densely inside the pod instead of
  // sprawling across an empty shell.
  const FTm = 0.3048;
  const hallW_m = (s.buildingW_ft) * FTm;
  const hallD_m = (s.buildingD_ft) * FTm - s.grayD;
  const grayArea_SF = hallW_m * s.grayD * 10.7639;
  const prog = spaceProgram(chip, maxRacks * chip.kwRack, maxRacks,
                            hallW_m, hallD_m, grayArea_SF, s.officeSF);
  const racksPerRow = prog.pod.perRow;
  const egressEvery = prog.pod.egressEvery;
  const inRowEvery = prog.pod.inRowEvery;
  const racksEff = prog.pod.racksEff;
  // rows are built on EVERY floor, so size them per floor or the upper decks
  // get fully-equipped rows with zero racks under them.
  const floorsN = Math.max(1, s.stories ?? 1);
  const rows = Math.max(2, Math.ceil(prog.pod.rows / floorsN));
  const racksNominal = maxRacks;                          // placement stops at the power limit
  const itKW = maxRacks * chip.kwRack;
  const gpus = maxRacks * chip.gpusPerRack;

  // plant sized N+1 from THIS version's load (not fixed counts)
  const heatUnitKW = 1000;                                // 1 MW dry coolers / chillers
  const heatUnits = Math.ceil(itKW * 1.05 / heatUnitKW) + 1;
  const genCount = Math.ceil(itKW * pue / 3000) + 1;      // 3 MW enclosed sets, N+1
  const upsLineups = Math.max(2, Math.round(itKW / 6000));// EXL lineups (visual; MW in analyst)
  const battCabinets = Math.max(4, Math.ceil(itKW * (5 / 60) / 250)); // ~5 min ride-through @ 250 kWh/cab
  const crahNeed = Math.ceil(itKW / 146);                 // CW146 air handlers, if air-cooled
  const chillRows = Math.ceil(heatUnits / 6);
  const yardD = 18 + Math.max(genCount * 0 + 14, 14) + chillRows * 5.2;

  // footprint: 77N is slider-driven (assumed split); Lehigh is fixed (measured KMZ)
  const wFt = s.buildingW_ft, dFt = s.buildingD_ft;   // both sites measured now
  const small = s.grossSF < 20000;                        // compact gray room for small shells

  const footNote = s.key === 'lehigh'
    ? `<i>Footprint 256×549 ft from your pin + OSM building trace (138,892 SF vs 135,650 SF workbook — within
       tracing tolerance). Parcel boundary pending — send a parcel KMZ to complete the site map.</i>`
    : s.parcel
      ? `<i>Footprint ${s.buildingW_ft}×${s.buildingD_ft} ft measured from your KMZ (${s.grossSF.toLocaleString()} SF on a
         ${s.parcel.acres} ac parcel) — space and yard area bind before power on this small shell.</i>`
      : `<i>Footprint ${s.buildingW_ft}×${s.buildingD_ft} ft.</i>`;

  return {
    title: `${s.name} — ${chip.label}`,
    blurb: `<b>${s.name} · ${chip.label}.</b> ${s.grossSF.toLocaleString()} SF industrial retrofit —
      ${s.halls > 1 ? `${s.halls} halls, ` : ''}${s.columnFt ? `${s.columnFt}×${s.columnFt} ft bays, ` : ''}${s.officeSF ? 'corner offices, ' : ''}${s.dockDoors} retained dock doors.
      <b>Optimized:</b> ${s.utilityMW} MW feed ÷ PUE ${pue} → <b>${racksNominal.toLocaleString()} racks · ${gpus.toLocaleString()} GPUs</b> at
      ${chip.kwRack} kW/rack (workbook baseline: ${s.criticalITMW} MW @ PUE ${s.designPUE}). <b>Usage:</b> ${chip.use}. <b>Physical:</b> ${chip.rackKg} kg/rack,
      ${chip.domain}-GPU scale-up domain, ${chip.volts}${liquid ? ', hot-aisle contained DLC' : ', cold-aisle contained air + in-row coolers'}.
      <b>Balance of plant (optimized for this chip):</b> ${bop.notes.join('; ')}. Plant sized to this platform: ${heatUnits}× 1 MW heat rejection (N+1), ${genCount}× 3 MW gensets (N+1)${liquid ? '' : `, ${crahNeed} CRAH equivalents`}, PUE ${pue}.
      ${footNote}`,
    podName: 'ROW',
    cooling: chip.cooling,
    basePUE: pue,
    rows: {
      count: rows, racksPerRow, rackId: chip.rackId, inRowEvery, egressEvery,
      maxRacks, kwPerRack: chip.kwRack, gpusPerRack: chip.gpusPerRack, builder: chip.builder,
    },
    balanceHalls: false,          // the pod places rows; hall balancing is off
    fitout: (() => {
      const M2 = 10.7639;
      const pad = 1.5, gap = 3.0;          // gap bands ARE the service corridors
      const podZ0 = 4;
      const podD = prog.pod.d;
      const rooms = [];
      // BAND 1 — the pod, flanked by the rooms that must be adjacent to it:
      // electrical on the left (short feeders to the RPPs), staging on the right
      // against the dock doors on the east wall.
      const sideW = (hallW_m - prog.pod.w) / 2 - pad - 1.5;
      const bandRoom = (sf, side) => {
        const need = sf / M2;
        const w = Math.min(sideW, need / podD);
        return { w: Math.max(4, w), d: Math.max(podD, need / Math.max(4, w)), side };
      };
      if (prog.areas.electricalInterior > 400) {
        const r = bandRoom(prog.areas.electricalInterior, -1);
        // one RPP per two rack rows; battery cabinets sized for 5 min at full IT
        const rpps = Math.max(4, prog.pod.rows);
        const batts = Math.max(4, Math.ceil(maxRacks * chip.kwRack * (5 / 60) / 100));
        rooms.push({ key: 'elec', label: 'ELECTRICAL', sub: `${prog.areas.electricalInterior.toLocaleString()} SF · ${batts} battery cabinets · ${rpps} RPP`,
                     x0: -hallW_m / 2 + pad, z0: podZ0, w: r.w, d: r.d, color: '#ffc233', equip: 'elec',
                     units: { 'ELC-005': batts, 'PDW-003': rpps } });
      }
      {
        const r = bandRoom(prog.areas.storage, 1);
        rooms.push({ key: 'store', label: 'STAGING', sub: `${prog.areas.storage.toLocaleString()} SF · receiving · spares · burn-in`,
                     x0: hallW_m / 2 - pad - r.w, z0: podZ0, w: r.w, d: r.d, color: '#9aa4b2', equip: 'store' });
      }
      // BAND 2 — mechanical gallery across the full hall width behind the pod,
      // so every CDU has a straight pipe run to the pod and out to the yard.
      const band1End = Math.max(podZ0 + podD, ...rooms.map(r => r.z0 + r.d));
      {
        const w = hallW_m - pad * 2;
        const d = prog.areas.mechanical / M2 / w;
        // unit counts from load, not from available floor: XDU-1350 class CDUs at
        // N+1, one pump skid per 4 CDUs
        const cdus = Math.ceil(maxRacks * chip.kwRack / 1350) + 1;
        const pumps = Math.max(2, Math.ceil(cdus / 4));
        rooms.push({ key: 'mech', label: 'MECHANICAL', sub: `${prog.areas.mechanical.toLocaleString()} SF · ${cdus} CDU (N+1) · ${pumps} pump skids`,
                     x0: -hallW_m / 2 + pad, z0: band1End + gap, w, d, color: '#39c2ff', equip: 'mech',
                     units: { 'LCL-002': cdus, 'MEC-006': pumps } });
      }
      return {
        pod: { w: prog.pod.w, d: podD, z0: podZ0 },
        rooms,
        shellZ0: Math.max(...rooms.map(r => r.z0 + r.d)) + gap + 1,
        program: prog,
      };
    })(),
    floors: floorsN,
    wallH: s.clearH_ft * FT * 0.55,
    shell: custom.shell,                                   // solid / glass / open — user-controlled
    building: { w: wFt * FT, d: dFt * FT },
    halls: s.halls,
    columnGrid: s.columnFt ? s.columnFt * FT : 0,
    officeCornerSF: s.officeSF ? s.officeSF / 4 : 0,
    dockDoors: s.dockDoors,
    driveIns: s.driveIns,
    parcel: s.parcel ?? null,
    grayD: s.grayD,
    yardD,
    crahCount: liquid
      ? Math.min(Math.max(1, Math.ceil(itKW * (1 - (chip.liquidShare ?? 0)) / 146)), small ? 4 : 8)
      : Math.min(crahNeed, small ? 6 : 14),
    include: { busB: true, trays: true, pdus: !small, crah: true, containment: true },
    gray: small ? [
      { id: 'ELC-006', count: 1, opts: { sections: 3 } },
      { id: 'ELC-001', count: bop.dc800 ? 1 : Math.min(upsLineups, 2) },
      { id: 'ELC-005', count: bop.dc800 ? 2 : Math.min(battCabinets, 4) },
      { id: 'ELC-010', count: 1 },
    ] : [
      { id: 'ELC-007', count: 1, opts: { sections: 3 } },
      { id: 'ELC-001', count: Math.min(upsLineups, 4) },
      { id: 'ELC-005', count: Math.min(battCabinets, 8) },
      { id: 'ELC-009', count: 1 },
      { id: 'ELC-010', count: 1 },
      { id: 'ELC-006', count: 1, opts: { sections: 3 } },
    ],
    yard: {
      transformers: small ? 1 : 2,
      gensets: { id: 'BKP-003', count: Math.min(genCount, small ? 5 : 14) },
      chillers: { id: bop.heatRejId, count: Math.min(heatUnits, small ? 6 : 26) },
      bess: bop.dc800 ? Math.min(4, Math.ceil(itKW * (5 / 60) / 2000) + 1) : 0,
      tower: false, tes: false, fuel: small ? 1 : 2,
    },
    siteOverrides: {
      siteName: s.name, grossSF: s.grossSF, officeSF: s.officeSF, halls: s.halls,
      criticalITMW: s.criticalITMW,
      upsKW: s.upsMW * 1000, genKW: Math.min(genCount, small ? 5 : 14) * 3000,
      utilityKW: s.utilityMW * 1000, designPUE: s.designPUE,
      tfKW: s.utilityMW * 1000,
      battCabinets, crahNeed: liquid ? 0 : crahNeed,
      heatUnits, footprintAssumed: !!s.footprintAssumed,
      bop: { pue: bop.pue, wue: bop.wue, adiabatic: bop.adiabatic, dc800: bop.dc800, notes: bop.notes },
      program: prog,
      measured: !!s.measured, parcelAc: s.parcel?.acres ?? null, geoFile: s.geoFile ?? null,
    },
    tourRackLine: `${chip.label} racks`,
    chip,
    placement: placement[custom.site] ?? {},
  };
}

export function customConfig() {
  if (custom.site !== 'free') return siteVersionConfig(custom.chip);
  const rack = RACK_OPTIONS.find(r => r.id === custom.rack);
  const cooling = custom.cooling === 'auto' ? rack.cooling : custom.cooling;
  const kwRack = custom.kwPerRack ?? rack.kw;
  const gray = [];
  if (custom.mvSwitchgear) gray.push({ id: 'ELC-007', count: 1, opts: { sections: 3 } });
  if (custom.lvSwitchgear) gray.push({ id: 'ELC-006', count: 1, opts: { sections: 3 } });
  gray.push({ id: custom.ups, count: custom.upsCount });
  if (custom.batteries > 0) gray.push({ id: 'ELC-005', count: custom.batteries });
  if (custom.sts) gray.push({ id: 'ELC-009', count: 1 });
  if (custom.ats) gray.push({ id: 'ELC-010', count: 1 });

  return {
    title: 'Custom project',
    blurb: `<b>Custom build.</b> ${custom.rows * custom.racksPerRow * custom.floors} × ${comp(custom.rack).Model}
      on ${custom.floors} floor${custom.floors > 1 ? 's' : ''}, ${cooling} cooled.
      Configure the build on the left — the analyst below the telemetry will check your engineering.`,
    podName: 'ROW',
    cooling,
    basePUE: cooling === 'liquid' ? 1.12 : 1.45,
    rows: {
      count: custom.rows, racksPerRow: custom.racksPerRow, rackId: custom.rack,
      kwPerRack: kwRack, builder: rack.builder,
    },
    floors: custom.floors,
    wallH: custom.wallH,
    shell: custom.shell,
    hallMarginX: custom.hallMarginX,
    grayD: 9,
    yardD: 26,
    crahCount: cooling === 'air' ? custom.crahCount : 0,
    include: { busB: custom.busB, trays: custom.trays, pdus: custom.pdus, crah: cooling === 'air', containment: custom.containment },
    gray,
    yard: {
      transformers: custom.transformers,
      gensets: { id: custom.gen, count: custom.genCount },
      chillers: { id: custom.heatRej, count: custom.heatRejCount },
      tower: custom.tower, tes: custom.tes, fuel: custom.fuel,
    },
    tourRackLine: `${comp(custom.rack).Model} racks`,
  };
}

/* ---------------- builder panel UI ---------------- */
export function initBuilder(onChange) {
  const el = document.getElementById('builderPanel');
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(o =>
    `<option value="${o.id}" ${o.id === cur ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
  const slider = (id, label, min, max, val, step = 1) => `
    <div class="ops-row"><div class="ops-label">${label} <span class="ops-val" id="${id}Val">${val}</span></div>
    <input type="range" id="${id}" min="${min}" max="${max}" value="${val}" step="${step}"></div>`;
  const tgl = (id, label, on) => `<label class="toggle"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="tswitch"></span>${label}</label>`;

  el.innerHTML = `
    <div class="panel-section">
      <div class="panel-head">SITE VERSIONS</div>
      <div class="bld-label">Project</div>
      <select id="bldSite">
        <option value="free" ${custom.site === 'free' ? 'selected' : ''}>Freeform sandbox</option>
        <option value="lehigh" ${custom.site === 'lehigh' ? 'selected' : ''}>Lehigh Ave, Niles — 30 MW retrofit</option>
        <option value="77n" ${custom.site === '77n' ? 'selected' : ''}>North Ave, Northlake — small shell</option>
        <option value="g4" ${custom.site === 'g4' ? 'selected' : ''}>Google Gen-4 AI — reference shell</option>
      </select>
      <div class="bld-label">Compute platform</div>
      <select id="bldChip">${CHIP_OPTIONS.map(c =>
        `<option value="${c.key}" ${c.key === custom.chip ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
      <div class="learn-hint">Picking a chip loads that platform's full buildout — racks, cooling,
      yard plant, and telemetry all re-derive. Click any row below to switch.</div>
      <button id="btnSiteMap" class="agent-run" style="margin:8px 0 4px">🗺 Site plan on map</button>
      <div class="bld-label">Shell — see inside</div>
      <div class="btn-grid btn-grid-3">
        <button class="shell-btn ${custom.shell === 'solid' ? 'on' : ''}" data-shell="solid">Solid</button>
        <button class="shell-btn ${custom.shell === 'glass' ? 'on' : ''}" data-shell="glass">Glass</button>
        <button class="shell-btn ${custom.shell === 'open' ? 'on' : ''}" data-shell="open">Open</button>
      </div>
      <div id="verTable"></div>
    </div>
    <div class="panel-section">
      <div class="panel-head">IT BUILD</div>
      <div class="bld-label">Rack platform</div>
      ${sel('bldRack', RACK_OPTIONS, custom.rack)}
      ${slider('bldRows', 'Rack rows', 2, 8, custom.rows, 2)}
      ${slider('bldRPR', 'Racks per row', 4, 20, custom.racksPerRow)}
      ${slider('bldFloors', 'Floors', 1, 3, custom.floors)}
    </div>
    <div class="panel-section">
      <div class="panel-head">BUILDING & SHELL</div>
      ${slider('bldWallH', 'Floor height (m)', 4, 8, custom.wallH, 0.5)}
      ${slider('bldMargin', 'Hall margin (m)', 5, 12, custom.hallMarginX, 0.5)}
      <div class="bld-label">Shell</div>
      <select id="bldShell">
        <option value="solid" ${custom.shell === 'solid' ? 'selected' : ''}>Solid panel</option>
        <option value="glass" ${custom.shell === 'glass' ? 'selected' : ''}>Glass curtain</option>
        <option value="open" ${custom.shell === 'open' ? 'selected' : ''}>Open (no shell)</option>
      </select>
    </div>
    <div class="panel-section">
      <div class="panel-head">COOLING</div>
      <div class="bld-label">Heat rejection</div>
      ${sel('bldHeatRej', HEATREJ_OPTIONS, custom.heatRej)}
      ${slider('bldHeatRejN', 'Units', 1, 8, custom.heatRejCount)}
      ${slider('bldCrahN', 'CRAHs (air halls)', 2, 12, custom.crahCount)}
    </div>
    <div class="panel-section">
      <div class="panel-head">POWER CHAIN</div>
      <div class="bld-label">UPS platform</div>
      ${sel('bldUps', UPS_OPTIONS, custom.ups)}
      ${slider('bldUpsN', 'UPS blocks', 1, 5, custom.upsCount)}
      ${slider('bldBattN', 'Battery cabinets', 0, 8, custom.batteries)}
      <div class="bld-label">Generators</div>
      ${sel('bldGen', GEN_OPTIONS, custom.gen)}
      ${slider('bldGenN', 'Gensets', 0, 6, custom.genCount)}
      ${slider('bldTfN', 'Transformers', 1, 4, custom.transformers)}
    </div>
    <div class="panel-section">
      <div class="panel-head">OPERATIONAL EQUIPMENT</div>
      ${tgl('bldContain', 'Aisle containment', custom.containment)}
      ${tgl('bldBusB', 'B-feed busway', custom.busB)}
      ${tgl('bldTrays', 'Cable trays & fiber', custom.trays)}
      ${tgl('bldPdus', 'Floor PDUs', custom.pdus)}
      ${tgl('bldSts', 'Static transfer switch', custom.sts)}
      ${tgl('bldAts', 'Automatic transfer switch', custom.ats)}
      ${tgl('bldMv', 'MV switchgear', custom.mvSwitchgear)}
      ${tgl('bldLv', 'LV switchgear', custom.lvSwitchgear)}
      ${tgl('bldTes', 'Thermal storage tank', custom.tes)}
      ${tgl('bldTower', 'Cooling tower', custom.tower)}
      ${slider('bldFuel', 'Fuel tanks (20k gal)', 0, 4, custom.fuel)}
    </div>`;

  function renderVersionTable() {
    const vt = document.getElementById('verTable');
    vt.innerHTML = `<table class="ver-table">
      <thead><tr><th>Platform</th><th>Racks</th><th>GPUs</th><th>IT MW</th><th>PUE</th></tr></thead>
      <tbody>${CHIP_OPTIONS.map(c => {
        const v = versionStats(c);
        return `<tr data-chip="${c.key}" class="${c.key === custom.chip && custom.site !== 'free' ? 'sel' : ''}">
          <td>${c.label.split(' (')[0]}</td><td>${v.maxRacks.toLocaleString()}</td>
          <td>${v.gpus.toLocaleString()}</td><td>${(v.itKW / 1000).toFixed(1)}</td><td>${v.pue}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
  renderVersionTable();

  // picking a chip (dropdown or table row) always activates the site version —
  // this is what makes "flip through the chips" visibly rebuild everything
  function activateChip(key) {
    custom.chip = key;
    if (custom.site === 'free') custom.site = 'lehigh';
    document.getElementById('bldSite').value = custom.site;
    document.getElementById('bldChip').value = key;
    renderVersionTable();
    onChange();
  }
  document.getElementById('verTable').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-chip]');
    if (tr) activateChip(tr.dataset.chip);
  });

  // shell quick-switch: syncs the freeform SHELL select and rebuilds immediately
  el.querySelectorAll('.shell-btn').forEach(btn => btn.addEventListener('click', () => {
    custom.shell = btn.dataset.shell;
    el.querySelectorAll('.shell-btn').forEach(b => b.classList.toggle('on', b === btn));
    const sel = document.getElementById('bldShell');
    if (sel) sel.value = custom.shell;
    onChange();
  }));

  let deb = null;
  const change = () => { clearTimeout(deb); deb = setTimeout(onChange, 350); };
  const bind = (id, key, { num = false, checkbox = false } = {}) => {
    const input = document.getElementById(id);
    input.addEventListener(checkbox ? 'change' : 'input', () => {
      custom[key] = checkbox ? input.checked : (num ? +input.value : input.value);
      const v = document.getElementById(id + 'Val');
      if (v) v.textContent = input.value;
      change();
    });
  };
  document.getElementById('bldSite').addEventListener('input', e => { custom.site = e.target.value; renderVersionTable(); change(); });
  document.getElementById('bldChip').addEventListener('input', e => activateChip(e.target.value));
  bind('bldRack', 'rack'); bind('bldRows', 'rows', { num: true }); bind('bldRPR', 'racksPerRow', { num: true });
  bind('bldFloors', 'floors', { num: true }); bind('bldWallH', 'wallH', { num: true }); bind('bldMargin', 'hallMarginX', { num: true });
  bind('bldShell', 'shell');
  bind('bldHeatRej', 'heatRej'); bind('bldHeatRejN', 'heatRejCount', { num: true }); bind('bldCrahN', 'crahCount', { num: true });
  bind('bldUps', 'ups'); bind('bldUpsN', 'upsCount', { num: true }); bind('bldBattN', 'batteries', { num: true });
  bind('bldGen', 'gen'); bind('bldGenN', 'genCount', { num: true }); bind('bldTfN', 'transformers', { num: true });
  bind('bldContain', 'containment', { checkbox: true }); bind('bldBusB', 'busB', { checkbox: true });
  bind('bldTrays', 'trays', { checkbox: true }); bind('bldPdus', 'pdus', { checkbox: true });
  bind('bldSts', 'sts', { checkbox: true }); bind('bldAts', 'ats', { checkbox: true });
  bind('bldMv', 'mvSwitchgear', { checkbox: true }); bind('bldLv', 'lvSwitchgear', { checkbox: true });
  bind('bldTes', 'tes', { checkbox: true }); bind('bldTower', 'tower', { checkbox: true });
  bind('bldFuel', 'fuel', { num: true });
}
