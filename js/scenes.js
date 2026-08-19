// scenes.js — the four facility archetypes, expressed as configs for the composer.
import * as B from './builders.js?b43';

export const SCENES = {
  /* -------- HYPERSCALE: single-tenant AI factory, liquid-cooled NVL72 pods -------- */
  hyperscale: {
    title: 'Hyperscale',
    blurb: `<b>Single-tenant AI factory.</b> Six rows of NVIDIA GB200 NVL72 rack-scale systems
      (~120 kW per rack, direct liquid cooling), fed by row CDUs and a 1 MW dry-cooler plant.
      Gray space runs Vertiv EXL S1 1200 kVA UPS blocks; the yard carries 3 MW enclosed
      gensets, thermal storage, and a dedicated utility interconnect. This is the shape of
      the ~100 MW campuses being built for AI training.`,
    podName: 'AI POD',
    cooling: 'liquid',
    basePUE: 1.12,
    rows: { count: 6, racksPerRow: 8, rackId: 'RCK-004', builder: () => B.buildNVL72('RCK-004') },
    hallMarginX: 8,
    grayD: 10,
    yardD: 30,
    gray: [
      { id: 'ELC-007', count: 1, opts: { sections: 4 } },   // MV switchgear
      { id: 'ELC-001', count: 2 },                          // EXL S1 1200 kVA UPS
      { id: 'ELC-005', count: 4 },                          // Li-ion battery cabinets
      { id: 'ELC-009', count: 1 },                          // STS
      { id: 'ELC-010', count: 1 },                          // ATS
      { id: 'ELC-006', count: 1, opts: { sections: 3 } },   // LV switchgear
    ],
    yard: {
      transformers: 3,
      gensets: { id: 'BKP-003', count: 4 },
      chillers: { id: 'MEC-005', count: 4 },                // Guntner 1 MW dry coolers (DLC heat rejection)
      tower: false, tes: true, fuel: 2,
    },
  },

  /* -------- CLOUD: availability-zone hall, OCP ORv3 + modular UPS -------- */
  cloud: {
    title: 'Cloud',
    blurb: `<b>Cloud availability-zone hall.</b> OCP Open Rack v3 racks with 48 V busbars and
      OU-pitch sleds — the standardized, vendor-neutral hardware cloud providers deploy by the
      megawatt. Air-cooled with perimeter CRAHs plus modular Vertiv APM2 UPS strings that scale
      in 600 kW blocks as the zone fills. One of several identical halls in a region.`,
    podName: 'HALL A ROW',
    cooling: 'air',
    basePUE: 1.35,
    rows: { count: 6, racksPerRow: 14, rackId: 'RCK-006', kwPerRack: 17, builder: () => B.buildORv3('RCK-006', { fill: 0.85 }) },
    hallMarginX: 7,
    grayD: 9,
    yardD: 30,
    crahCount: 8,
    gray: [
      { id: 'ELC-006', count: 1, opts: { sections: 4 } },   // LV switchgear
      { id: 'ELC-003', count: 3 },                          // APM2 600 kW modular UPS
      { id: 'ELC-005', count: 3 },                          // battery cabinets
      { id: 'ELC-010', count: 1 },                          // ATS
    ],
    yard: {
      transformers: 2,
      gensets: { id: 'BKP-003', count: 3 },
      chillers: { id: 'MEC-001', count: 3 },                // Carrier 30XA air-cooled chillers
      tower: false, tes: false, fuel: 1,
    },
  },

  /* -------- COLOCATION: multi-tenant retail colo -------- */
  colocation: {
    title: 'Colocation',
    blurb: `<b>Multi-tenant retail colo.</b> Mixed customer cabinets (APC NetShelter 42U class)
      on a raised floor with contained cold aisles and perimeter Liebert CW146 CRAHs. Power is
      sold by the cage and the kW: Galaxy VX UPS with N+1 gensets behind it. Every tenant shares
      the same gray space — the business model is the redundancy.`,
    podName: 'CAGE',
    cooling: 'air',
    basePUE: 1.5,
    rows: { count: 8, racksPerRow: 12, rackId: 'RCK-001', kwPerRack: 6, builder: () => B.buildRackEnclosure('RCK-001', { fillRU: 0.65 }) },
    hallMarginX: 6.5,
    grayD: 8,
    yardD: 22,
    crahCount: 10,
    pduCount: 6,
    gray: [
      { id: 'ELC-006', count: 1, opts: { sections: 3 } },   // LV switchgear
      { id: 'ELC-002', count: 1 },                          // Galaxy VX 1500 kVA
      { id: 'ELC-004', count: 2 },                          // Eaton 93PM 200 kW
      { id: 'ELC-005', count: 3 },                          // battery cabinets
      { id: 'ELC-009', count: 1 },                          // STS
      { id: 'ELC-010', count: 1 },                          // ATS
    ],
    yard: {
      transformers: 2,
      gensets: { id: 'BKP-002', count: 2 },                 // Cummins QSK95 open sets
      chillers: { id: 'MEC-001', count: 2 },
      tower: true, tes: false, fuel: 1,
    },
  },

  /* -------- ENTERPRISE: the on-prem server room -------- */
  enterprise: {
    title: 'Enterprise',
    blurb: `<b>The on-prem server room.</b> Two rows of ten 42U racks at ~5 kW each — mail,
      ERP, file servers, a small virtualization cluster. One Eaton 93PM UPS, one battery string,
      one Cat 3516B genset out back. No economies of scale, no dedicated ops team: exactly the
      workloads that have been migrating to the other three tabs for fifteen years.`,
    podName: 'ROW',
    cooling: 'air',
    basePUE: 1.9,
    rows: { count: 2, racksPerRow: 10, rackId: 'RCK-002', kwPerRack: 5, builder: () => B.buildRackEnclosure('RCK-002', { fillRU: 0.55 }) },
    hallMarginX: 5,
    grayD: 6,
    yardD: 18,
    wallH: 4.4,
    crahCount: 4,
    pduCount: 2,
    gray: [
      { id: 'ELC-004', count: 1 },                          // Eaton 93PM 200 kW
      { id: 'ELC-005', count: 1 },                          // battery cabinet
      { id: 'ELC-010', count: 1 },                          // ATS
    ],
    yard: {
      transformers: 1,
      gensets: { id: 'BKP-001', count: 1 },                 // Cat 3516B open set
      chillers: { id: 'MEC-002', count: 1 },
      tower: false, tes: false, fuel: 1,
    },
  },
};
