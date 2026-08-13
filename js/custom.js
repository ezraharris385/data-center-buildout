// custom.js — the Custom Projects tab: a parametric facility builder.
// Every control maps onto the same config shape the four archetypes use,
// so the composer, flows, education and analyst all work on custom builds.
import * as B from './builders.js';
import { comp, kw } from './catalog.js';

/* ---------------- compute platforms (chip dropdown) ----------------
   Per-chip rack architecture: GPUs per rack, rack power, cooling, and the
   closest catalog rack for true-dimension rendering. Power figures are
   vendor-published rack/system numbers (recall-grade). */
export const CHIP_OPTIONS = [
  { key: 'gb200',  label: 'GB200 class (NVL72)',        gpusPerRack: 72, kwRack: 120, cooling: 'liquid', rackId: 'RCK-004', builder: () => B.buildNVL72('RCK-004'), year: 2025 },
  { key: 'vr200',  label: 'Vera Rubin (VR200 NVL144)',  gpusPerRack: 72, kwRack: 132, cooling: 'liquid', rackId: 'RCK-005', builder: () => B.buildNVL72('RCK-005'), year: 2027, note: '72 Rubin packages / 144 dies, Oberon-class rack' },
  { key: 'gb300',  label: 'Blackwell Ultra (GB300 NVL72)', gpusPerRack: 72, kwRack: 135, cooling: 'liquid', rackId: 'RCK-005', builder: () => B.buildNVL72('RCK-005'), year: 2026 },
  { key: 'b200',   label: 'Blackwell (GB200/B200 HGX)',  gpusPerRack: 32, kwRack: 58,  cooling: 'liquid', rackId: 'RCK-003', builder: () => B.buildRackEnclosure('RCK-003', { fillRU: 0.85 }), year: 2025, note: '4× HGX B200 8-GPU nodes per rack, DLC' },
  { key: 'h200',   label: 'Hopper H200 (HGX)',           gpusPerRack: 32, kwRack: 44,  cooling: 'air',    rackId: 'RCK-003', builder: () => B.buildRackEnclosure('RCK-003', { fillRU: 0.85 }), year: 2024, note: '4× HGX H200 nodes, air/RDHx' },
  { key: 'h100',   label: 'Hopper H100 SXM (HGX)',       gpusPerRack: 32, kwRack: 41,  cooling: 'air',    rackId: 'RCK-003', builder: () => B.buildRackEnclosure('RCK-003', { fillRU: 0.85 }), year: 2023, note: '4× HGX H100 nodes' },
  { key: 'mi450x', label: 'Instinct MI450X (Helios)',    gpusPerRack: 72, kwRack: 140, cooling: 'liquid', rackId: 'RCK-004', builder: () => B.buildNVL72('RCK-004'), year: 2026, note: 'AMD rack-scale, 72 GPU, DLC' },
  { key: 'mi355x', label: 'Instinct MI355X (2025)',      gpusPerRack: 32, kwRack: 62,  cooling: 'liquid', rackId: 'RCK-003', builder: () => B.buildRackEnclosure('RCK-003', { fillRU: 0.85 }), year: 2025, note: '4× UBB 8-GPU, 1.4 kW/GPU, DLC' },
  { key: 'mi325x', label: 'Instinct MI325X (2024)',      gpusPerRack: 32, kwRack: 46,  cooling: 'air',    rackId: 'RCK-003', builder: () => B.buildRackEnclosure('RCK-003', { fillRU: 0.85 }), year: 2024, note: '4× UBB, 1 kW/GPU' },
  { key: 'mi300x', label: 'Instinct MI300X (2024)',      gpusPerRack: 32, kwRack: 38,  cooling: 'air',    rackId: 'RCK-002', builder: () => B.buildRackEnclosure('RCK-002', { fillRU: 0.85 }), year: 2024, note: '4× UBB, 750 W/GPU' },
];

/* ---------------- 77 N Ave & Niles — 30 MW industrial retrofit ----------------
   From "30MW Data Center Retrofit-Industrial.xlsm" Assumptions:
   135,650 SF shell (modeled 500 ft × 271 ft), 32 ft clear, site 8.2 ac,
   utility 10→30 MW, design PUE 1.25, critical IT 24 MW, office 5,160 SF,
   generators N+1 36 MW, UPS 30 MW. Layout directives: demising wall every 1/3,
   office in each corner, 50×50 ft column bays. */
export const SITE_77N = {
  name: '77 N Ave & Niles',
  buildingW_ft: 271, buildingD_ft: 500, clearH_ft: 32,
  grossSF: 135650, officeSF: 5160,
  utilityMW: 30, criticalITMW: 24, designPUE: 1.25,
  genMW: 36, upsMW: 30, halls: 3, columnFt: 50,
};

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

// one buildout version per chip — the ENTIRE plant is derived from the chip's
// actual load, so operational performance tracks the compute choice 1:1.
export function siteVersionConfig(chipKey) {
  const chip = CHIP_OPTIONS.find(c => c.key === chipKey) ?? CHIP_OPTIONS[0];
  const s = SITE_77N;
  const itBudgetKW = s.criticalITMW * 1000;
  const racksPerRow = 22;
  const rows = Math.max(2, Math.floor(Math.floor(itBudgetKW / chip.kwRack) / racksPerRow));
  const racksNominal = rows * racksPerRow;
  const itKW = racksNominal * chip.kwRack;               // deployed IT at this version
  const liquid = chip.cooling === 'liquid';
  const pue = liquid ? 1.15 : 1.32;
  const gpus = racksNominal * chip.gpusPerRack;

  // plant sized N+1 from THIS version's load (not fixed counts)
  const heatUnitKW = 1000;                                // 1 MW dry coolers / chillers
  const heatUnits = Math.ceil(itKW * 1.05 / heatUnitKW) + 1;
  const genCount = Math.ceil(itKW * pue / 3000) + 1;      // 3 MW enclosed sets, N+1
  const upsLineups = Math.max(2, Math.round(itKW / 6000));// EXL lineups (visual; MW in analyst)
  const battCabinets = Math.max(4, Math.ceil(itKW * (5 / 60) / 250)); // ~5 min ride-through @ 250 kWh/cab
  const crahNeed = Math.ceil(itKW / 146);                 // CW146 air handlers, if air-cooled
  const chillRows = Math.ceil(heatUnits / 6);
  const yardD = 18 + Math.max(genCount * 0 + 14, 14) + chillRows * 5.2;

  return {
    title: `${s.name} — ${chip.label}`,
    blurb: `<b>${s.name} · ${chip.label}.</b> ${s.grossSF.toLocaleString()} SF industrial retrofit —
      3 halls, 50×50 ft bays, corner offices, 13 retained dock doors. ${s.utilityMW} MW utility /
      ${s.criticalITMW} MW critical IT → <b>${racksNominal.toLocaleString()} racks · ${gpus.toLocaleString()} GPUs</b>
      at ${chip.kwRack} kW/rack. Plant sized to this platform: ${heatUnits}× 1 MW heat rejection (N+1),
      ${genCount}× 3 MW gensets (N+1)${liquid ? '' : `, ${crahNeed} CRAH equivalents`}, PUE ${pue}.
      <i>Footprint ${custom.siteW_ft}×${custom.siteD_ft} ft is assumed from gross SF — edit below to
      match the survey.</i>`,
    podName: 'ROW',
    cooling: chip.cooling,
    basePUE: pue,
    rows: {
      count: rows, racksPerRow, rackId: chip.rackId,
      kwPerRack: chip.kwRack, gpusPerRack: chip.gpusPerRack, builder: chip.builder,
    },
    floors: 1,
    wallH: s.clearH_ft * FT * 0.55,
    shell: 'solid',
    building: { w: custom.siteW_ft * FT, d: custom.siteD_ft * FT },
    halls: s.halls,
    columnGrid: s.columnFt * FT,
    officeCornerSF: s.officeSF / 4,
    dockDoors: 13,                                        // per CapEx budget: 13 dock doors installed
    driveIns: 2,                                          // 2 existing drive-ins converted
    grayD: 10,
    yardD,
    crahCount: liquid ? 0 : Math.min(crahNeed, 14),       // wall space caps the drawable count
    include: { busB: true, trays: true, pdus: true, crah: !liquid, containment: true },
    gray: [
      { id: 'ELC-007', count: 1, opts: { sections: 3 } },
      { id: 'ELC-001', count: Math.min(upsLineups, 4) },
      { id: 'ELC-005', count: Math.min(battCabinets, 8) },
      { id: 'ELC-009', count: 1 },
      { id: 'ELC-010', count: 1 },
      { id: 'ELC-006', count: 1, opts: { sections: 3 } },
    ],
    yard: {
      transformers: 2,
      gensets: { id: 'BKP-003', count: Math.min(genCount, 14) },
      chillers: { id: liquid ? 'MEC-005' : 'MEC-001', count: Math.min(heatUnits, 26) },
      tower: false, tes: false, fuel: 2,
    },
    siteOverrides: {
      upsKW: s.upsMW * 1000, genKW: Math.min(genCount, 14) * 3000,
      utilityKW: s.utilityMW * 1000, designPUE: s.designPUE,
      tfKW: s.utilityMW * 1000,
      battCabinets, crahNeed: liquid ? 0 : crahNeed,
      heatUnits, footprintAssumed: true,
    },
    tourRackLine: `${chip.label} racks`,
    chip,
  };
}

export function customConfig() {
  if (custom.site === '77n') return siteVersionConfig(custom.chip);
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
        <option value="77n" ${custom.site === '77n' ? 'selected' : ''}>77 N Ave &amp; Niles — 30 MW retrofit</option>
      </select>
      <div class="bld-label">Compute platform</div>
      <select id="bldChip">${CHIP_OPTIONS.map(c =>
        `<option value="${c.key}" ${c.key === custom.chip ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
      <div class="learn-hint">Pick the site, then flip through chip platforms — each is a full
      buildout version sized to the 24 MW critical IT budget. Freeform unlocks the manual controls below.</div>
      <div class="ops-row" style="margin-top:10px"><div class="ops-label">Footprint W (ft) <span class="ops-val" id="bldSiteWVal">${custom.siteW_ft}</span></div>
      <input type="range" id="bldSiteW" min="180" max="420" value="${custom.siteW_ft}" step="1"></div>
      <div class="ops-row"><div class="ops-label">Footprint L (ft) <span class="ops-val" id="bldSiteDVal">${custom.siteD_ft}</span></div>
      <input type="range" id="bldSiteD" min="300" max="800" value="${custom.siteD_ft}" step="1"></div>
      <div class="learn-hint">135,650 SF gross is from the workbook; the W×L split is assumed —
      set the real dimensions when you have the survey.</div>
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
  bind('bldSite', 'site'); bind('bldChip', 'chip');
  bind('bldSiteW', 'siteW_ft', { num: true }); bind('bldSiteD', 'siteD_ft', { num: true });
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
