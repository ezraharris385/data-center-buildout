// sitemap.js — the site plan sheet: satellite imagery + measured geometry +
// the current build projected onto the ground, presented like a drawing set:
// title block, north arrow, scale bar, zoned building, keyed equipment
// schedule with counts/capacities, off-parcel violations in red, and
// drag-to-place for yard plant. Bird's-eye only.
import { comp, kw } from './catalog.js?b49';

let map = null;
let equipLayer = null, zoneLayer = null, clearLayer = null;
let baseLayer = null;
let siteGeo = null;
let currentGeoFile = null;
const geoCache = {};
let onPlaceCb = null;
const viewOpts = { racks: true, labels: true, clearances: false };
const catLayers = {};          // category -> [leaflet layers] for schedule hover

const M_LAT = 111132, M_LNG0 = 111320;
const FT = 0.3048;

function cosLat(geo) { return Math.cos(geo.centroid.lat * Math.PI / 180); }

function toLatLng(x, z, centerZ, geo) {
  const dz = z - centerZ;
  const m = geo.mapRot ?? [[0, 1], [1, 0]];
  const E = m[0][0] * x + m[0][1] * dz;
  const N = m[1][0] * x + m[1][1] * dz;
  return [geo.centroid.lat + N / M_LAT, geo.centroid.lng + E / (M_LNG0 * cosLat(geo))];
}

function toScene(lat, lng, centerZ, geo) {
  const N = (lat - geo.centroid.lat) * M_LAT;
  const E = (lng - geo.centroid.lng) * M_LNG0 * cosLat(geo);
  const m = geo.mapRot ?? [[0, 1], [1, 0]];
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  const x = (m[1][1] * E - m[0][1] * N) / det;
  const dz = (-m[1][0] * E + m[0][0] * N) / det;
  return { x, z: dz + centerZ };
}

function rectLatLngs(x, z, w, d, rotated, centerZ, geo) {
  const hw = (rotated ? d : w) / 2, hd = (rotated ? w : d) / 2;
  return [
    toLatLng(x - hw, z - hd, centerZ, geo),
    toLatLng(x + hw, z - hd, centerZ, geo),
    toLatLng(x + hw, z + hd, centerZ, geo),
    toLatLng(x - hw, z + hd, centerZ, geo),
  ];
}

// ray-cast point-in-polygon on [lat,lng] rings
function inPoly(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

const CATS = [
  { key: 'BKP',     color: '#ffc233', label: 'Generators',      drag: true,  clear_ft: 15 },
  { key: 'MEC',     color: '#39c2ff', label: 'Heat rejection',  drag: true,  clear_ft: 8 },
  { key: 'ELC-008', color: '#b06cff', label: 'Transformers',    drag: true,  clear_ft: 10 },
  { key: 'BESS',    color: '#e0a12e', label: 'BESS',            drag: true,  clear_ft: 10 },
  { key: 'FUE',     color: '#9aa4b2', label: 'Fuel tanks',      drag: true,  clear_ft: 25 },
  { key: 'RCK',     color: '#3ddc84', label: 'Rack rows',       drag: false },
  { key: 'LCL',     color: '#2fd1c0', label: 'CDUs',            drag: false },
];
function catFor(id) {
  if (id.startsWith('ELC-008')) return CATS.find(c => c.key === 'ELC-008');
  return CATS.find(c => c.key !== 'ELC-008' && id.startsWith(c.key)) ?? null;
}

/* ---------------- zones inside the building (halls, gray space, offices) ---------------- */
function drawZones(facility, cfg) {
  const L = window.L;
  if (zoneLayer) zoneLayer.remove();
  zoneLayer = L.layerGroup();
  const a = facility.anchors;
  const centerZ = (a.hallD - a.grayD) / 2;
  const R = (x0, z0, x1, z1, style) => L.polygon([
    toLatLng(x0, z0, centerZ, siteGeo), toLatLng(x1, z0, centerZ, siteGeo),
    toLatLng(x1, z1, centerZ, siteGeo), toLatLng(x0, z1, centerZ, siteGeo),
  ], style).addTo(zoneLayer);

  // gray space strip
  R(-a.hallW / 2, -a.grayD, a.hallW / 2, 0,
    { color: '#ffc233', weight: 1, dashArray: '3 3', fillColor: '#ffc233', fillOpacity: 0.10 })
    .bindTooltip('GRAY SPACE — switchgear · UPS · batteries', { direction: 'center' });

  // halls + labels
  const halls = cfg.halls ?? 1;
  const hallDepth = a.hallD / halls;
  for (let h = 0; h < halls; h++) {
    const z0 = h * hallDepth, z1 = (h + 1) * hallDepth;
    R(-a.hallW / 2, z0, a.hallW / 2, z1,
      { color: '#7fd4ff', weight: 1, fill: false, dashArray: h > 0 ? '6 4' : null });
    const c = toLatLng(-a.hallW / 2 + 6, (z0 + z1) / 2, centerZ, siteGeo);
    L.tooltip({ permanent: true, direction: 'right', className: 'zone-tip' })
      .setLatLng(c).setContent(`HALL ${h + 1}`).addTo(zoneLayer);
  }

  // corner offices
  if (cfg.officeCornerSF) {
    const side = Math.sqrt(cfg.officeCornerSF * 0.0929);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x0 = sx * (a.hallW / 2) - (sx > 0 ? side : 0), z0 = sz > 0 ? a.hallD - side : 0;
      R(x0, z0, x0 + side, z0 + side,
        { color: '#d0a0ff', weight: 1, fillColor: '#d0a0ff', fillOpacity: 0.15 })
        .bindTooltip('Office');
    }
  }
  if (viewOpts.labels) zoneLayer.addTo(map);
}

/* ---------------- equipment + schedule ---------------- */
function drawEquipment(facility, cfg) {
  const L = window.L;
  if (equipLayer) equipLayer.remove();
  if (clearLayer) clearLayer.remove();
  equipLayer = L.layerGroup().addTo(map);
  clearLayer = L.layerGroup();
  Object.keys(catLayers).forEach(k => delete catLayers[k]);
  const a = facility.anchors;
  const centerZ = (a.hallD - a.grayD) / 2;
  const schedule = {};   // label -> {color, count, unitKW, offParcel, unitTxt}

  for (const [id, positions] of facility.instances) {
    const cat = catFor(id);
    if (!cat) continue;
    if (!viewOpts.racks && !cat.drag) continue;
    let c;
    try { c = comp(id); } catch { continue; }
    const w = (c.Width_mm ?? 600) / 1000, d = (c.Depth_mm ?? 1000) / 1000;
    const rotated = id.startsWith('BKP');
    // capacity per unit: rack rows use the CHIP's kW (not the catalog rack's),
    // fuel is gallons, everything else takes its catalog rating. No fallbacks.
    const isRack = cat.key === 'RCK';
    const unitKW = isRack ? (cfg.rows?.kwPerRack ?? kw(id)) : kw(id);
    const unitTxt = cat.key === 'FUE' ? '20,000 gal' : null;

    const sk = `${cat.label}`;
    schedule[sk] ??= { color: cat.color, count: 0, unitKW, offParcel: 0, models: new Set(), kind: cat.key, unitTxt };
    catLayers[sk] ??= [];

    positions.forEach((p, i) => {
      const ll = toLatLng(p.x, p.z, centerZ, siteGeo);
      const off = siteGeo.parcel ? !inPoly(ll[0], ll[1], siteGeo.parcel) && cat.drag : false;
      schedule[sk].count++;
      schedule[sk].models.add(`${c.Manufacturer ?? ''} ${c.Model ?? id}`.trim());
      if (off) schedule[sk].offParcel++;

      const poly = L.polygon(rectLatLngs(p.x, p.z, w, d, rotated, centerZ, siteGeo), {
        color: off ? '#ff5c39' : cat.color, weight: off ? 2.5 : 1,
        dashArray: off ? '4 3' : null,
        fillColor: cat.color, fillOpacity: cat.drag ? 0.55 : 0.4,
      }).addTo(equipLayer).bindTooltip(
        `${c.Manufacturer ?? ''} ${c.Model ?? id}${unitTxt ? ` · ${unitTxt}` : unitKW ? ` · ${unitKW >= 1000 ? (unitKW / 1000) + ' MW' : Math.round(unitKW) + ' kW'}` : ''}` +
        `${off ? ' — ⚠ OFF-PARCEL' : ''}${cat.drag ? ' · drag to place' : ''}`);
      catLayers[sk].push(poly);

      if (cat.clear_ft) {
        L.circle(ll, { radius: cat.clear_ft * FT, color: cat.color, weight: 1, dashArray: '2 4', fill: false })
          .addTo(clearLayer);
      }

      if (cat.drag && onPlaceCb) {
        const mk = L.marker(ll, { draggable: true, icon: L.divIcon({ className: 'drag-dot', iconSize: [14, 14] }) })
          .addTo(equipLayer);
        mk.on('drag', e => {
          const p2 = e.target.getLatLng();
          const sc = toScene(p2.lat, p2.lng, centerZ, siteGeo);
          poly.setLatLngs(rectLatLngs(sc.x, sc.z, w, d, rotated, centerZ, siteGeo));
        });
        mk.on('dragend', e => {
          const p2 = e.target.getLatLng();
          const sc = toScene(p2.lat, p2.lng, centerZ, siteGeo);
          onPlaceCb(`${id}#${i}`, sc.x, sc.z);
        });
      }
    });
  }
  if (viewOpts.clearances) clearLayer.addTo(map);
  renderSchedule(schedule, facility, cfg);
  return schedule;
}

function fmtCap(s) {
  if (s.kind === 'FUE') return `${(s.count * 20000).toLocaleString()} gal`;
  if (s.kind === 'BESS') return `${s.count * 2} MWh`;
  if (!s.unitKW) return '—';
  const total = s.unitKW * s.count;
  return total >= 1000 ? `${(total / 1000).toFixed(1)} MW` : `${Math.round(total)} kW`;
}

function renderSchedule(schedule, facility, cfg) {
  const rows = Object.entries(schedule).map(([label, s]) => `
    <tr data-cat="${label}" class="${s.offParcel ? 'off' : ''}">
      <td><i style="background:${s.color}"></i>${label}</td>
      <td class="num">${s.count.toLocaleString()}</td>
      <td class="num">${fmtCap(s)}</td>
      <td class="num">${s.offParcel ? `⚠ ${s.offParcel}` : '✓'}</td>
    </tr>
    <tr class="models"><td colspan="4">${[...s.models].join(' · ')}</td></tr>`).join('');
  document.getElementById('mapSchedule').innerHTML = `
    <table class="sched">
      <thead><tr><th>Equipment</th><th>Qty</th><th>Capacity</th><th>On-site</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sched-note">Hover a row to highlight on the plan. Dotted handles drag; red dashed = outside the parcel.</div>`;
  document.querySelectorAll('#mapSchedule tr[data-cat]').forEach(tr => {
    tr.addEventListener('mouseenter', () => (catLayers[tr.dataset.cat] ?? []).forEach(p => p.setStyle({ weight: 4 })));
    tr.addEventListener('mouseleave', () => (catLayers[tr.dataset.cat] ?? []).forEach(p => p.setStyle({ weight: 1 })));
  });
}

function renderTitleBlock(facility, cfg, offTotal) {
  const s = facility.stats;
  document.getElementById('mapTitle').innerHTML = `
    <div class="tb-name">${cfg.siteOverrides?.siteName ?? cfg.title ?? 'Site'} <span class="tb-chip">${cfg.chip?.label ?? ''}</span></div>
    <div class="tb-addr">${siteGeo.address ?? ''}</div>
    <div class="tb-stats">
      <span><b>${(s.itKW / 1000).toFixed(1)}</b> MW IT</span>
      <span><b>${(s.itKW * s.basePUE / 1000).toFixed(1)}</b> MW total</span>
      <span>PUE <b>${s.basePUE}</b></span>
      <span><b>${s.racks.toLocaleString()}</b> racks</span>
      <span><b>${(s.gpus ?? 0).toLocaleString()}</b> GPUs</span>
      ${offTotal ? `<span class="tb-warn">⚠ ${offTotal} unit${offTotal > 1 ? 's' : ''} off-parcel</span>`
                 : siteGeo.parcel ? '<span class="tb-ok">✓ plant fits the parcel</span>'
                 : '<span class="tb-dim">parcel boundary pending</span>'}
    </div>`;
}

/* ---------------- open / refresh / close ---------------- */
export async function openSiteMap(facility, cfg, { onPlace = null, onReset = null } = {}) {
  const overlay = document.getElementById('mapOverlay');
  const note = document.getElementById('mapNote');
  onPlaceCb = onPlace;
  overlay.classList.remove('hidden');

  if (!cfg?.siteOverrides?.measured) {
    note.innerHTML = `<b>No geocoordinates for this project yet.</b><br>
      Drop a pin or a building/parcel KMZ and this becomes a full site plan.`;
    document.getElementById('siteMap').classList.add('hidden');
    document.getElementById('mapSide').classList.add('hidden');
    return;
  }
  document.getElementById('siteMap').classList.remove('hidden');
  document.getElementById('mapSide').classList.remove('hidden');
  note.innerHTML = '';

  const geoFile = cfg.siteOverrides.geoFile;
  if (!geoCache[geoFile]) geoCache[geoFile] = await (await fetch(geoFile)).json();
  siteGeo = geoCache[geoFile];
  const L = window.L;
  if (!L) { note.textContent = 'Leaflet failed to load (offline?).'; return; }

  const anchorPoly = siteGeo.parcel ?? siteGeo.building;
  if (!map) {
    map = L.map('siteMap', {
      zoomControl: true, attributionControl: true,
      minZoom: 16, maxZoom: 21, maxBoundsViscosity: 0.8,
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 21, maxNativeZoom: 19, className: 'imagery-tiles',
      attribution: 'Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics',
    }).addTo(map);
    L.control.scale({ imperial: true, metric: true, position: 'bottomleft' }).addTo(map);
    // view toggles
    const ctl = L.control({ position: 'topright' });
    ctl.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-toggles');
      div.innerHTML = `
        <label><input type="checkbox" id="mtRacks" checked> Rack rows</label>
        <label><input type="checkbox" id="mtLabels" checked> Zones</label>
        <label><input type="checkbox" id="mtClear"> Clearances</label>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    ctl.addTo(map);
    setTimeout(() => {
      document.getElementById('mtRacks')?.addEventListener('input', e => { viewOpts.racks = e.target.checked; refreshSiteMap(window.__lastFacility ?? facility, cfg); });
      document.getElementById('mtLabels')?.addEventListener('input', e => {
        viewOpts.labels = e.target.checked;
        if (zoneLayer) { viewOpts.labels ? zoneLayer.addTo(map) : zoneLayer.remove(); }
      });
      document.getElementById('mtClear')?.addEventListener('input', e => {
        viewOpts.clearances = e.target.checked;
        if (clearLayer) { viewOpts.clearances ? clearLayer.addTo(map) : clearLayer.remove(); }
      });
    }, 50);
  }
  if (currentGeoFile !== geoFile) {
    currentGeoFile = geoFile;
    if (baseLayer) baseLayer.remove();
    baseLayer = L.layerGroup().addTo(map);
    map.setMaxBounds(L.latLngBounds(anchorPoly).pad(8));
    if (siteGeo.parcel) L.polygon(siteGeo.parcel, { color: '#ffc233', weight: 2.5, fill: false, dashArray: '6 4' })
      .addTo(baseLayer).bindTooltip('Parcel boundary (measured)');
    L.polygon(siteGeo.building, { color: '#7fd4ff', weight: 2.5, fillColor: '#0a1e2e', fillOpacity: 0.35 })
      .addTo(baseLayer).bindTooltip('Building (measured)');
  }

  window.__lastFacility = facility;
  drawZones(facility, cfg);
  const schedule = drawEquipment(facility, cfg);
  const offTotal = Object.values(schedule).reduce((n, s) => n + s.offParcel, 0);
  renderTitleBlock(facility, cfg, offTotal);

  document.getElementById('mapLegend').innerHTML = `
    <div class="lg-row"><i class="ln" style="border-color:#7fd4ff"></i>Building — measured footprint</div>
    ${siteGeo.parcel ? '<div class="lg-row"><i class="ln dash" style="border-color:#ffc233"></i>Parcel boundary</div>' : ''}
    <div class="lg-row"><i class="ln dash" style="border-color:#ff5c39"></i>Red dashed = off-parcel / non-compliant</div>
    <div class="lg-row"><i class="dot"></i>White dotted handle = draggable plant</div>
    <div class="lg-row"><i class="ln dash" style="border-color:#39c2ff"></i>Thin circles = code clearance (toggle)</div>
    <div class="lg-note">Scale bar bottom-left · north arrow top-left · zoom limited to site scale.
    Everything drawn is at true dimensions from the component catalog.</div>`;

  const resetBtn = document.getElementById('mapResetTop');
  resetBtn.onclick = () => onReset?.();

  const b = window.L.latLngBounds(anchorPoly);
  setTimeout(() => {
    map.invalidateSize();
    map.setView(b.getCenter(), siteGeo.parcel ? 18 : 17, { animate: false });
  }, 120);
}

export function refreshSiteMap(facility, cfg = null) {
  if (!map || document.getElementById('mapOverlay').classList.contains('hidden')) return;
  window.__lastFacility = facility;
  const useCfg = cfg ?? facility.cfg;
  drawZones(facility, useCfg);
  const schedule = drawEquipment(facility, useCfg);
  const offTotal = Object.values(schedule).reduce((n, s) => n + s.offParcel, 0);
  renderTitleBlock(facility, useCfg, offTotal);
}

export function closeSiteMap() {
  document.getElementById('mapOverlay').classList.add('hidden');
}
