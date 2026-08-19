// sitemap.js — Phase 2: the buildout on a REAL map, now interactive.
// Satellite imagery (Esri World Imagery) + measured parcel/building polygons,
// with the current layout's equipment projected onto the ground. Yard equipment
// (gensets, chillers, transformers, fuel) is DRAGGABLE — drop it where you want
// it on the property and the 3D scene rebuilds with your placement (power
// paths and exhaust re-derive). The camera is locked to bird's-eye: you can't
// zoom out past the block.
import { comp } from './catalog.js?b42';

let map = null;
let equipLayer = null;
let siteGeo = null;
let onPlaceCb = null;

const M_LAT = 111132, M_LNG0 = 111320;

function cosLat(geo) { return Math.cos(geo.centroid.lat * Math.PI / 180); }

function toLatLng(x, z, centerZ, geo) {
  const E = (z - centerZ);
  const N = x;
  return [geo.centroid.lat + N / M_LAT, geo.centroid.lng + E / (M_LNG0 * cosLat(geo))];
}

function toScene(lat, lng, centerZ, geo) {
  const N = (lat - geo.centroid.lat) * M_LAT;
  const E = (lng - geo.centroid.lng) * M_LNG0 * cosLat(geo);
  return { x: N, z: E + centerZ };
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

const STYLE = {
  'BKP': { color: '#ffc233', label: 'Generators', drag: true },
  'MEC': { color: '#39c2ff', label: 'Heat rejection', drag: true },
  'ELC-008': { color: '#b06cff', label: 'Transformers', drag: true },
  'FUE': { color: '#9aa4b2', label: 'Fuel', drag: true },
  'RCK': { color: '#3ddc84', label: 'Rack rows', drag: false },
  'LCL': { color: '#2fd1c0', label: 'CDUs', drag: false },
};

function styleFor(id) {
  if (id.startsWith('ELC-008')) return STYLE['ELC-008'];
  for (const k of ['BKP', 'MEC', 'FUE', 'RCK', 'LCL']) if (id.startsWith(k)) return STYLE[k];
  return null;
}

function drawEquipment(facility) {
  const L = window.L;
  if (equipLayer) equipLayer.remove();
  equipLayer = L.layerGroup().addTo(map);
  const a = facility.anchors;
  const centerZ = (a.hallD - a.grayD) / 2;

  for (const [id, positions] of facility.instances) {
    const st = styleFor(id);
    if (!st) continue;
    let c;
    try { c = comp(id); } catch { continue; }
    const w = (c.Width_mm ?? 600) / 1000, d = (c.Depth_mm ?? 1000) / 1000;
    const rotated = id.startsWith('BKP');
    positions.forEach((p, i) => {
      const poly = L.polygon(rectLatLngs(p.x, p.z, w, d, rotated, centerZ, siteGeo), {
        color: st.color, weight: 1, fillColor: st.color, fillOpacity: st.drag ? 0.55 : 0.4,
      }).addTo(equipLayer).bindTooltip(`${c.Manufacturer ?? ''} ${c.Model ?? id}${st.drag ? ' — drag to place' : ''}`);

      if (st.drag && onPlaceCb) {
        const mk = L.marker(toLatLng(p.x, p.z, centerZ, siteGeo), {
          draggable: true,
          icon: L.divIcon({ className: 'drag-dot', iconSize: [14, 14] }),
        }).addTo(equipLayer);
        mk.on('drag', e => {
          const ll = e.target.getLatLng();
          const sc = toScene(ll.lat, ll.lng, centerZ, siteGeo);
          poly.setLatLngs(rectLatLngs(sc.x, sc.z, w, d, rotated, centerZ, siteGeo));
        });
        mk.on('dragend', e => {
          const ll = e.target.getLatLng();
          const sc = toScene(ll.lat, ll.lng, centerZ, siteGeo);
          onPlaceCb(`${id}#${i}`, sc.x, sc.z);
        });
      }
    });
  }
}

export async function openSiteMap(facility, cfg, { onPlace = null, onReset = null } = {}) {
  const overlay = document.getElementById('mapOverlay');
  const note = document.getElementById('mapNote');
  onPlaceCb = onPlace;
  overlay.classList.remove('hidden');

  if (!cfg?.siteOverrides?.measured) {
    note.innerHTML = `<b>No geocoordinates for this project yet.</b><br>
      The map works from measured KMZ polygons — Lehigh has them. For 77 N Ave & Niles,
      drop a building + parcel KMZ (Google Earth: right-click → Save Place As) and it plugs in the same way.`;
    document.getElementById('siteMap').classList.add('hidden');
    return;
  }
  document.getElementById('siteMap').classList.remove('hidden');
  note.innerHTML = `Drag the <b>dotted equipment handles</b> to place plant on the property — the 3D build
    and power/exhaust paths re-derive from your layout. <button id="mapReset" class="map-reset">↺ Reset layout</button>`;
  document.getElementById('mapReset').addEventListener('click', () => onReset?.());

  if (!siteGeo) siteGeo = await (await fetch('data/lehigh_site.json')).json();
  const L = window.L;
  if (!L) { note.textContent = 'Leaflet failed to load (offline?).'; return; }

  if (!map) {
    map = L.map('siteMap', {
      zoomControl: true, attributionControl: true,
      minZoom: 17, maxZoom: 21,                       // bird's-eye only — never above the block
      maxBounds: L.latLngBounds(siteGeo.parcel).pad(8),
      maxBoundsViscosity: 0.8,
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 21, maxNativeZoom: 19,
      attribution: 'Imagery © Esri — Source: Esri, Maxar, Earthstar Geographics',
    }).addTo(map);
    L.polygon(siteGeo.parcel, { color: '#ffc233', weight: 2.5, fill: false, dashArray: '6 4' })
      .addTo(map).bindTooltip('Parcel — 0.59 ac (measured)');
    L.polygon(siteGeo.building, { color: '#7fd4ff', weight: 2, fillColor: '#7fd4ff', fillOpacity: 0.08 })
      .addTo(map).bindTooltip('Building — 12,109 SF (measured)');
  }

  drawEquipment(facility);

  const legend = Object.values(STYLE).map(s =>
    `<span class="ml-key"><i style="background:${s.color}"></i>${s.label}${s.drag ? ' ⇕' : ''}</span>`).join('');
  document.getElementById('mapLegend').innerHTML =
    legend + `<span class="ml-warn">outside the amber dashed line = off-parcel</span>`;

  const b = window.L.latLngBounds(siteGeo.parcel);
  setTimeout(() => {
    map.invalidateSize();
    map.setView(b.getCenter(), 18, { animate: false });
  }, 120);
}

// re-project equipment after a rebuild while the overlay is open
export function refreshSiteMap(facility) {
  if (!map || document.getElementById('mapOverlay').classList.contains('hidden')) return;
  drawEquipment(facility);
}

export function closeSiteMap() {
  document.getElementById('mapOverlay').classList.add('hidden');
}
