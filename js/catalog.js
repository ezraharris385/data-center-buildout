// catalog.js — loads the component catalog and exposes dimension-true lookups.
// All source dimensions are millimeters; the scene works in meters (1 unit = 1 m).

let CATALOG = null;
let RENDER_PARTS = {};
const byId = new Map();

export const MM = 0.001;

// Layout standards (from Standards_Reference sheet, in meters)
export const STD = {
  RU: 0.04445,            // EIA-310 rack unit
  OU: 0.048,              // OCP OpenU
  TILE: 0.6096,           // 24" raised floor tile
  COLD_AISLE: 1.2192,     // 2 tiles
  HOT_AISLE: 0.9144,      // 1.5 tiles
  ROW_PITCH: 4.2672,      // 7-tile hot/cold repeating pitch
};

export async function loadCatalog() {
  const res = await fetch('data/catalog.json');
  CATALOG = await res.json();
  for (const c of CATALOG.components) byId.set(c.Component_ID, c);
  try {
    RENDER_PARTS = await (await fetch('data/render_parts.json')).json();
  } catch { RENDER_PARTS = {}; }
  try {
    DESIGN = await (await fetch('data/design_engine.json')).json();
  } catch { DESIGN = null; }
  return CATALOG;
}

// CBRE Design Studio engine data (equipment costs, cost model, efficiency
// model, grid factors, lead times) — data/design_engine.json
let DESIGN = null;
export function design() { return DESIGN; }

// render-detail parts (data/render_parts.xlsx → json): sub-part geometry per SKU
export function partsFor(id) { return RENDER_PARTS[id] ?? null; }

export function comp(id) {
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown component ${id}`);
  return c;
}

// Footprint/size in meters: {w, d, h}
export function dims(id) {
  const c = comp(id);
  return {
    w: (c.Width_mm || 600) * MM,
    d: (c.Depth_mm || 600) * MM,
    h: (c.Height_mm || 2000) * MM,
  };
}

export function kw(id) {
  const c = comp(id);
  return typeof c.Rating_kW === 'number' ? c.Rating_kW : 0;
}

export function label(id) {
  const c = comp(id);
  return `${c.Manufacturer ?? ''} ${c.Model ?? ''}`.trim();
}

export function allComponents() { return CATALOG?.components ?? []; }
export function standards() { return CATALOG?.standards ?? []; }
export function assemblies() { return CATALOG?.assemblies ?? []; }
