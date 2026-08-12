// learn.js — the Education layer: a guided walkthrough that follows the
// operational flow, and an equipment guide that explains every system in the
// current facility plus the cycles (power, cooling, air) that connect them.
import * as THREE from 'three';
import { comp, kw } from './catalog.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const fmtMW = v => v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${Math.round(v)} kW`;

/* ============================================================
 * FLOW WALKTHROUGH — ordered stops in the direction power flows
 * Each stop: title, body, cam {pos,target}, systems emphasis
 * ============================================================ */
export function buildFlowStops(facility, cfg) {
  const a = facility.anchors;
  const s = facility.stats;
  const tf = a.transformers[Math.floor(a.transformers.length / 2)] ?? V(0, 1.5, -a.grayD - 3.5);
  const gen = a.gensets[0];
  const chill = a.chillers[0];
  const aisleZ = a.aisle0;
  const liquid = a.liquid;
  const stops = [];

  stops.push({
    title: '1 · Utility interconnect',
    body: `Everything starts at the property line. The utility delivers medium-voltage power
      (typically 12–34.5 kV) to a dedicated interconnect. This single feed — and the substation
      capacity behind it — usually decides whether a site can be a data center at all. Watch the
      amber particles: that is energy entering the property.`,
    cam: { pos: V(a.utility.x + 10, 4, a.utility.z - 12), target: V(a.utility.x, 6, a.utility.z + 3) },
    systems: { power: true, coolant: false, air: false, heat: false },
  });

  stops.push({
    title: '2 · Transformers',
    body: `Transformers step the utility voltage down to distribution level (typically 480 V).
      This facility runs ${a.transformers.length} unit${a.transformers.length > 1 ? 's' : ''} —
      each one an oil- or resin-cooled block sized in MVA. The radiator fins on the sides reject
      the transformation losses (~1%) as heat before the power even reaches the building.`,
    cam: { pos: V(tf.x + 7, 4, tf.z - 8), target: V(tf.x, 1.5, tf.z) },
    systems: { power: true, coolant: false, air: false, heat: false },
  });

  stops.push({
    title: '3 · Gray space — switchgear, UPS, batteries',
    body: `Inside the building but outside the IT floor: the gray space. Switchgear sections
      the power and provides protection; the UPS bridges any gap between grid loss and generator
      start using its battery cabinets; the ATS (automatic transfer switch) decides which source
      feeds the building. Total UPS blocks here: ${a.grayItems.filter(g => (comp(g.id).Subcategory ?? '').includes('UPS')).length || '—'}.
      This room is why the racks never see a flicker.`,
    cam: { pos: V(a.ups.x - 8, 5, -a.grayD + 10), target: V(a.ups.x, 1.3, -a.grayD + 2) },
    systems: { power: true, coolant: false, air: false, heat: false },
  });

  stops.push({
    title: '4 · Distribution — busway & PDUs',
    body: `From the UPS, power rises to overhead busways running above every rack row — the
      amber rails. Each rack taps the busway through a plug-in drop. Two independent feeds
      (A + B) mean any single path can fail without dropping a server. Floor PDUs transform and
      meter power for equipment that can't take a busway drop directly.`,
    cam: { pos: V(-a.rowLen / 2 - 4, a.busH + 2.2, a.rows[0].z - 4), target: V(0, a.busH, a.rows[0].z) },
    systems: { power: true, coolant: false, air: false, heat: false },
  });

  stops.push({
    title: '5 · The racks — where power becomes compute',
    body: `${s.racks} racks at ~${s.kwPerRack} kW each: ${fmtMW(s.itKW)} of IT load.
      ${liquid
        ? `These are rack-scale liquid-cooled systems — cold plates sit directly on the silicon, and
           the blue/orange manifolds at the rear carry coolant to every tray. At ~120 kW per rack,
           air alone physically cannot remove the heat.`
        : `Servers pull cold air through the front face, exhaust hot air out the back. The perforated
           doors, the contained aisle, and the raised-floor grid all exist to keep those two air
           streams from mixing.`}`,
    cam: { pos: V(-a.rowLen / 2 - 3.2, 1.7, aisleZ), target: V(a.rowLen / 2, 1.15, aisleZ) },
    systems: { power: true, coolant: liquid, air: true, heat: true },
  });

  stops.push({
    title: `6 · Heat capture — ${liquid ? 'CDUs & manifolds' : 'CRAHs & containment'}`,
    body: liquid
      ? `Row CDUs (coolant distribution units) at the end of each row are the heart of the liquid
         loop: they exchange heat between the clean rack loop and the facility loop, control flow
         to every cold plate, and isolate the IT from the plant. Blue particles = supply (~30 °C),
         orange = return (~40 °C+). Liquid carries ~3,500× more heat per volume than air.`
      : `Perimeter CRAH units (computer-room air handlers) pull the hot return air, pass it across
         chilled-water coils, and push cold air back to the cold aisles. The contained aisle keeps
         supply and return separated — mixing is wasted cooling. Watch the blue and red air
         particles follow that loop.`,
    cam: liquid
      ? { pos: V(a.rowLen / 2 + 4.5, 2.2, a.rows[0].z + 3), target: V(a.rowLen / 2 + 1.2, 1, a.rows[0].z) }
      : { pos: V(0, a.rackH * 2.6, a.hallD - 1.5), target: V(-a.hallW / 2 + 2, 1, a.hallD / 2) },
    systems: { power: false, coolant: true, air: true, heat: true },
  });

  if (chill) stops.push({
    title: '7 · Heat rejection — the yard plant',
    body: `The facility loop carries every captured watt out to the yard. ${s.chillerCount} unit${s.chillerCount > 1 ? 's' : ''}
      of ${comp(cfg.yard.chillers.id).Model} (${fmtMW(s.coolKW)} total capacity) reject that heat to the
      atmosphere${a.tower ? ', helped by an evaporative cooling tower' : ''}. Fan speed follows load and
      outside temperature — this is where the weather meets your PUE.`,
    cam: { pos: V(chill.x + 9, 6, chill.z - 9), target: V(chill.x, 1.5, chill.z) },
    systems: { power: false, coolant: true, air: false, heat: true },
  });

  if (gen) stops.push({
    title: '8 · Backup — generators & fuel',
    body: `When the grid fails, the UPS batteries carry the load for the ~10 seconds the diesel
      gensets need to start and stabilize. ${s.genCount} × ${comp(cfg.yard.gensets.id).Model}
      (${fmtMW(s.genKW)} standby) then carry the whole facility${s.fuelTanks ? `, drawing from ${s.fuelTanks} × 20,000-gal
      fuel tank${s.fuelTanks > 1 ? 's' : ''}` : ''}. Try the "fail grid" button on the operations console to
      watch the transfer sequence live.`,
    cam: { pos: V(gen.x + 10, 5, gen.z - 8), target: V(gen.x, 1.6, gen.z) },
    systems: { power: true, coolant: false, air: false, heat: false },
  });

  stops.push({
    title: `${stops.length + 1} · The whole machine`,
    body: `Follow the loop end-to-end: power in from the grid (amber) → conditioned in gray space →
      distributed overhead → converted to compute in the racks → captured as heat →
      rejected in the yard. A data center is one large thermodynamic machine, and PUE —
      currently ${'~' + (s.basePUE ?? 1.4).toFixed(2)} here — is the score for how little energy
      it wastes on everything that isn't compute.`,
    cam: facility.cams.overview,
    systems: { power: true, coolant: true, air: true, heat: true },
  });

  return stops;
}

/* ============================================================
 * EQUIPMENT GUIDE — everything in the scene, explained, + cycles
 * ============================================================ */

// hand-authored "what it does" per category/subcategory keyword
const ROLES = [
  ['AI Rack System', 'A complete rack-scale computer: compute trays, switch trays and power shelves engineered as one liquid-cooled unit. The modern unit of AI capacity.'],
  ['Rack', 'The physical chassis of the IT floor — standardized 19″/21″ mounting, front-to-back airflow, the unit everything else is sized around.'],
  ['In-rack CDU', 'A coolant distribution unit inside the rack: pumps and a heat exchanger that isolate the rack loop from the facility loop.'],
  ['Row CDU', 'Row-level coolant plant: exchanges heat between the IT liquid loop and facility water, controls flow to each rack manifold. N+1 per pod.'],
  ['Rear-door', 'A radiator that replaces the rack rear door — captures exhaust heat into water before it enters the room at all.'],
  ['sidecar', 'Liquid-to-air heat exchanger beside the rack: lets liquid-cooled racks live in an air-cooled room.'],
  ['In-row cooler', 'Cooling placed inside the row itself, close to the load — short air paths, fast response to load swings.'],
  ['Perimeter CRAH', 'Computer-room air handler: chilled-water coils + fans on the room perimeter, driving the cold-aisle/hot-aisle circulation.'],
  ['Overhead busway', 'The power spine above each row — a continuous energized rail with plug-in tap-off boxes per rack. Replaces a forest of cables.'],
  ['Floor PDU', 'Power distribution unit: steps 480 V to rack voltage, meters and breakers per circuit.'],
  ['Remote power panel', 'Satellite breaker panel fed by a PDU — puts circuit protection close to the racks.'],
  ['UPS', 'Uninterruptible power supply: double-conversion electronics that carry the entire IT load from batteries the instant the grid fails, until generators take over.'],
  ['Battery cabinet', 'Stored energy for the UPS — lithium-ion strings sized for minutes of full-load ride-through.'],
  ['switchgear', 'The building\'s electrical backbone: bus, breakers, and protection relays that section, isolate, and route power.'],
  ['Transformer', 'Steps utility medium voltage down to 480 V distribution. Sized in MVA; its losses are the first heat the site rejects.'],
  ['Static transfer switch', 'Sub-cycle electronic switch between two power sources — the load never notices the transfer.'],
  ['ATS', 'Automatic transfer switch: senses grid loss, signals generators to start, and transfers the load when they are ready.'],
  ['Diesel genset', 'Standby engine-generator. Starts in seconds, carries the whole facility for as long as there is fuel.'],
  ['Enclosed genset', 'A genset in a weatherproof, sound-attenuated enclosure with base fuel tank — the containerized standby plant.'],
  ['Air-cooled chiller', 'Produces chilled water and rejects heat straight to ambient air with fan banks — no water consumption.'],
  ['Water-cooled chiller', 'Higher-efficiency chiller that rejects heat to a condenser water loop and cooling tower.'],
  ['Cooling tower', 'Evaporative heat rejection: warm condenser water rains through fill while fans draw air through — trades water for efficiency.'],
  ['Dry cooler', 'A giant radiator: closed-loop fluid to air, zero water use. The standard partner for direct liquid cooling.'],
  ['Pump skid', 'Circulates the chilled/condenser water loops — the circulatory system of the thermal plant.'],
  ['Thermal storage', 'A tank of cold water made off-peak — rides through chiller restarts and shaves peak demand.'],
  ['Storage tank', 'On-site diesel storage. Runtime = gallons ÷ burn rate; refuel contracts are part of the uptime story.'],
  ['Wire basket', 'Open cable tray for copper runs above the racks.'],
  ['Fiber raceway', 'Protected duct for fiber — the amber channel with gentle bend radii everywhere.'],
  ['Ladder rack', 'Heavy cable pathway for trunk runs.'],
  ['Aisle end door', 'Seals the contained aisle so supply and return air (or hot exhaust) never mix.'],
  ['Raised floor', 'Modular floor tiles over a plenum — underfloor air, piping, and cable distribution.'],
];

function roleFor(c) {
  const hay = `${c.Subcategory ?? ''} ${c.Category ?? ''}`;
  for (const [key, text] of ROLES) if (hay.toLowerCase().includes(key.toLowerCase())) return text;
  return c.Description ?? '';
}

export function buildEquipmentGuide(facility, cfg) {
  const s = facility.stats;
  const liquid = facility.anchors.liquid;

  // group instances by zone
  const zones = new Map();
  for (const [id, positions] of facility.instances) {
    let c;
    try { c = comp(id); } catch { continue; }
    const zone = c.Zone ?? 'Other';
    if (!zones.has(zone)) zones.set(zone, []);
    zones.get(zone).push({ id, c, count: positions.length });
  }
  const zoneOrder = ['Yard', 'Gray Space', 'White Space', 'Rack IT Gear'];

  const cycles = `
    <div class="guide-cycles">
      <div class="cycle">
        <div class="cycle-head" style="color:#ffc233">⚡ THE POWER CYCLE</div>
        <p>Utility feed (${'MV'}) → <b>transformers</b> step down to 480 V → <b>switchgear</b> sections and
        protects → <b>UPS</b> conditions it and stands ready with <b>batteries</b> → overhead <b>busways</b>
        (A + B feeds) → rack power shelves / PDUs → silicon. On grid failure: batteries bridge ~10 s,
        the <b>ATS</b> starts and transfers to <b>generators</b>, fuel tanks set the runtime. Every joule that
        enters eventually leaves as heat — which is why the cooling cycle exists.</p>
      </div>
      <div class="cycle">
        <div class="cycle-head" style="color:#39c2ff">💧 THE COOLING CYCLE</div>
        <p>${liquid
          ? `Cold plates on the chips absorb heat directly → rack manifolds → <b>row CDUs</b> exchange to the
             facility water loop → insulated pipes out of the hall → <b>dry coolers / chillers</b> in the yard
             reject it to ambient. Supply ~30 °C (blue), return 40 °C+ (orange). Liquid cooling is what makes
             120 kW racks possible at all.`
          : `<b>Chillers</b> in the yard produce chilled water → piped to <b>CRAH</b> coils in the hall → CRAH fans
             push cold air into the contained cold aisle → servers pull it through and exhaust hot →
             CRAHs recapture the return air, and the loop repeats. The chillers move that heat to ambient.`}</p>
      </div>
      <div class="cycle">
        <div class="cycle-head" style="color:#7fd4ff">🌬 THE AIR CYCLE</div>
        <p>${liquid
          ? `Even a liquid-cooled hall moves air: ~10–20% of rack heat (drives, PSUs, optics) still leaves by
             air, contained in the hot aisle between rack rows and handled by the room-level system.`
          : `Cold aisle → server front → hot exhaust → contained hot air return → CRAH intake. Containment is
             the cheapest efficiency upgrade in the industry: it stops hot and cold air from mixing, letting
             supply temperatures rise and chillers idle.`}
        Watch the cyan and red particles trace it live.</p>
      </div>
      <div class="cycle">
        <div class="cycle-head" style="color:#ff8a5c">♨ WHERE IT ALL GOES</div>
        <p>IT load ${fmtMW(s.itKW)} × PUE ${s.basePUE.toFixed(2)} ≈ ${fmtMW(s.itKW * s.basePUE)} total draw.
        The difference is fans, pumps, chillers, UPS losses, and lights. Everything but the compute is
        overhead — the entire discipline of data center engineering is shrinking that gap.</p>
      </div>
    </div>`;

  let items = '';
  for (const zone of zoneOrder) {
    const list = zones.get(zone);
    if (!list?.length) continue;
    items += `<div class="guide-zone">${zone.toUpperCase()}</div>`;
    for (const { id, c, count } of list.sort((x, y) => (x.c.Category ?? '').localeCompare(y.c.Category ?? ''))) {
      items += `
        <div class="guide-item" data-flyto="${id}">
          <div class="gi-top"><span class="gi-count">${count}×</span>
            <span class="gi-name">${c.Manufacturer ?? ''} ${c.Model ?? id}</span>
            <span class="gi-cat">${c.Subcategory ?? c.Category ?? ''}</span></div>
          <div class="gi-role">${roleFor(c)}</div>
          <div class="gi-dims">${c.Width_mm ?? '—'}×${c.Depth_mm ?? '—'}×${c.Height_mm ?? '—'} mm${c.Rating_kW ? ` · ${c.Rating_kW} kW` : ''}${c.Weight_kg ? ` · ${c.Weight_kg} kg` : ''}</div>
        </div>`;
    }
  }

  return `
    <div class="guide-intro">Everything deployed in this facility, what it does, and the cycles that
    connect it. Click any item to fly to it in the scene.</div>
    ${cycles}
    ${items}`;
}
