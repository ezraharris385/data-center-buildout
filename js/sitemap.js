// sitemap.js — Phase 2: the buildout on a REAL map.
// Satellite imagery (Esri World Imagery) + the measured parcel/building
// polygons from the user's KMZs, with the current 3D layout's equipment
// projected onto the ground so you can see where every genset, chiller and
// rack row actually lands on the property.
//
// Scene→world transform for Lehigh: the parcel's open land lies WEST of the
// building, and the 3D yard extends -z from the building — so the scene is
// rotated: East = (z - zc), North = (x - xc), both in meters.
import { comp } from './catalog.js?b41';

let map = null;
let equipLayer = null;
let siteGeo = null;

const M_LAT = 111132, M_LNG0 = 111320;

function toLatLng(x, z, centerZ, geo) {
  const E = (z - centerZ);
  const N = (x - 0);
  const lat = geo.centroid.lat + N / M_LAT;
  const lng = geo.centroid.lng + E / (M_LNG0 * Math.cos(geo.centroid.lat * Math.PI / 180));
  return [lat, lng];
}

function rectLatLngs(x, z, w, d, rotated, centerZ, geo) {
  // rectangle footprint (scene meters) → 4 corners on the map
  const hw = (rotated ? d : w) / 2, hd = (rotated ? w : d) / 2;
  return [
    toLatLng(x - hw, z - hd, centerZ, geo),
    toLatLng(x + hw, z - hd, centerZ, geo),
    toLatLng(x + hw, z + hd, centerZ, geo),
    toLatLng(x - hw, z + hd, centerZ, geo),
  ];
}

const STYLE = {
  'BKP': { color: '#ffc233', label: 'Generators' },
  'MEC': { color: '#39c2ff', label: 'Heat rejection' },
  'ELC-008': { color: '#b06cff', label: 'Transformers' },
  'FUE': { color: '#9aa4b2', label: 'Fuel' },
  'RCK': { color: '#3ddc84', label: 'Rack rows' },
  'LCL': { color: '#2fd1c0', label: 'CDUs' },
};

function styleFor(id) {
  if (id.startsWith('ELC-008')) return STYLE['ELC-008'];
  for (const k of ['BKP', 'MEC', 'FUE', 'RCK', 'LCL']) if (id.startsWith(k)) return STYLE[k];
  return null;
}

export async function openSiteMap(facility, cfg) {
  const overlay = document.getElementById('mapOverlay');
  const note = document.getElementById('mapNote');
  overlay.classList.remove('hidden');

  if (!cfg?.siteOverrides?.measured) {
    note.innerHTML = `<b>No geocoordinates for this project yet.</b><br>
      The map works from measured KMZ polygons — Lehigh has them. For 77 N Ave & Niles,
      drop a building + parcel KMZ (Google Earth: right-click → Save Place As) and it plugs in the same way.`;
    document.getElementById('siteMap').classList.add('hidden');
    return;
  }
  document.getElementById('siteMap').classList.remove('hidden');
  note.innerHTML = '';

  if (!siteGeo) siteGeo = await (await fetch('data/lehigh_site.json')).json();
  const L = window.L;
  if (!L) { note.textContent = 'Leaflet failed to load (offline?).'; return; }

  if (!map) {
    map = L.map('siteMap', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 21, maxNativeZoom: 19,
      attribution: 'Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics',
    }).addTo(map);
    L.polygon(siteGeo.parcel, { color: '#ffc233', weight: 2.5, fill: false, dashArray: '6 4' })
      .addTo(map).bindTooltip('Parcel — 0.59 ac (measured)', { permanent: false });
    L.polygon(siteGeo.building, { color: '#7fd4ff', weight: 2, fillColor: '#7fd4ff', fillOpacity: 0.08 })
      .addTo(map).bindTooltip('Building — 12,109 SF (measured)');
  }

  // (re)project the CURRENT layout's equipment
  if (equipLayer) equipLayer.remove();
  equipLayer = window.L.layerGroup().addTo(map);
  const a = facility.anchors;
  const centerZ = (a.hallD - a.grayD) / 2;

  for (const [id, positions] of facility.instances) {
    const st = styleFor(id);
    if (!st) continue;
    let c;
    try { c = comp(id); } catch { continue; }
    const w = (c.Width_mm ?? 600) / 1000, d = (c.Depth_mm ?? 1000) / 1000;
    const rotated = id.startsWith('BKP');           // gensets run long-axis north-south in scene
    for (const p of positions) {
      window.L.polygon(rectLatLngs(p.x, p.z, w, d, rotated, centerZ, siteGeo), {
        color: st.color, weight: 1, fillColor: st.color, fillOpacity: 0.5,
      }).addTo(equipLayer).bindTooltip(`${c.Manufacturer ?? ''} ${c.Model ?? id}`);
    }
  }

  const legend = Object.values(STYLE).map(s =>
    `<span class="ml-key"><i style="background:${s.color}"></i>${s.label}</span>`).join('');
  document.getElementById('mapLegend').innerHTML =
    legend + `<span class="ml-warn">equipment outside the amber dashed line = off-parcel (analyst flags this)</span>`;

  const b = window.L.latLngBounds(siteGeo.parcel);
  for (const [id, positions] of facility.instances) {
    if (!styleFor(id)) continue;
    for (const p of positions) b.extend(toLatLng(p.x, p.z, centerZ, siteGeo));
  }
  // defer: the overlay was display:none a moment ago — let layout flush first
  setTimeout(() => {
    map.invalidateSize();
    map.setView(b.getCenter(), 18, { animate: false });   // parcel-scale zoom, deterministic
  }, 120);
}

export function closeSiteMap() {
  document.getElementById('mapOverlay').classList.add('hidden');
}
