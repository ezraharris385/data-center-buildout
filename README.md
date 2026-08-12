# Data Center Buildout — 3D Operations Studio

An interactive, millimeter-accurate 3D visualization and teaching tool for how data centers
actually work: what's inside the building, how the internal supply chain fits together
(utility → transformer → switchgear → UPS → busway → rack), how cooling loops move heat
from a GPU tray to the yard, and how changes — load, weather, a grid failure — ripple
through operations.

**No build step.** Pure ES modules + Three.js from CDN. Open `index.html` from any static
server (GitHub Pages works as-is).

## The four archetypes

| Tab | What it teaches |
|---|---|
| **Hyperscale** | Single-tenant AI factory: NVIDIA GB200 NVL72 racks (~120 kW each), direct liquid cooling, row CDUs, dry-cooler plant, 3 MW gensets, thermal storage |
| **Cloud** | Availability-zone hall: OCP Open Rack v3 with 48 V busbars, modular UPS strings, perimeter CRAHs |
| **Colocation** | Multi-tenant retail colo: mixed 42U cabinets, contained cold aisles, shared redundancy as the business model |
| **Enterprise** | The on-prem server room: two rows of racks, one UPS, one genset — the baseline everything else replaced |

## What you can do

- **Inspect anything** — click a rack, chiller, UPS, busway: every object carries its real
  spec sheet (manufacturer, model, W×D×H in mm, weight, rating, dimension source).
- **Fail the grid** — watch the UPS bridge on batteries, gensets crank, the ATS transfer,
  and the power-flow animation reroute from the utility feed to diesel.
- **Push the load** — IT-load and outside-air sliders drive heat plumes, fan speeds,
  coolant flow rates, and a live PUE estimate.
- **Peel the building** — hide roof/walls and containment, fly between yard, gray space,
  white space, and rack-level camera presets.
- **Read the flows** — amber = utility power, red = backup power, blue/orange = coolant
  supply/return, cyan/red particles = cold/hot air.

## Data

`data/catalog.json` is generated from `datacenter_3d_component_catalog.xlsx` — 61 real
equipment SKUs across four zones (Yard, Gray Space, White Space, Rack IT Gear), two
assembly definitions (GB200 NVL72 internals per ASM-001; the 8-rack DLC pod per ASM-002),
and 20 dimensional standards (EIA-310, OCP ORv3, raised-floor and aisle conventions).
All geometry is parametric from those dimensions: 1 scene unit = 1 meter.

The GB200 NVL72 rack is modeled tray-by-tray: 18 compute trays + 9 NVSwitch trays +
8 ORv3 power shelves on 48 mm OU pitch, with rear blind-mate coolant manifolds.

## Structure

```
index.html          app shell + UI chrome
css/style.css       studio styling
data/catalog.json   the component catalog (source of truth for all dimensions)
js/catalog.js       catalog loader, mm→m, layout standards
js/materials.js     shared palette/materials, LED blink groups
js/builders.js      parametric equipment builders (racks → cooling towers)
js/facility.js      facility composer: shell, rows, aisles, yard, flow paths
js/scenes.js        the four archetype configs
js/flows.js         particle systems: power, coolant, air, heat, exhaust
js/ui.js            panels, inspector, telemetry
js/main.js          renderer, bloom, picking, ops simulation
```

## Notes

- PUE model is illustrative (base per archetype + weather + partial-load penalty), not an
  engineering calculation.
- The chilled-water TES tank renders at 55% scale (the real one is a 15 m × 21 m silo);
  the inspector notes this on the object.
- Facility scale per tab is representative, not a full campus — rows and counts are chosen
  to make the systems legible.
