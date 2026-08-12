// custom.js — the Custom Projects tab: a parametric facility builder.
// Every control maps onto the same config shape the four archetypes use,
// so the composer, flows, education and analyst all work on custom builds.
import * as B from './builders.js';
import { comp, kw } from './catalog.js';

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
  rack: 'RCK-004', rows: 4, racksPerRow: 8, kwPerRack: null, // null = rack default
  floors: 1, wallH: 6, hallMarginX: 7, shell: 'solid',
  cooling: 'auto',                    // auto = follow rack type
  heatRej: 'MEC-005', heatRejCount: 4, crahCount: 6,
  ups: 'ELC-001', upsCount: 2, batteries: 4,
  gen: 'BKP-003', genCount: 3, transformers: 2,
  sts: true, ats: true, mvSwitchgear: true, lvSwitchgear: true,
  containment: true, busB: true, trays: true, pdus: true, tes: false, fuel: 1, tower: false,
};

export function customConfig() {
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
