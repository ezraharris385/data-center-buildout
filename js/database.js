// database.js — the Database tab: every SKU in the catalog, searchable and
// filterable, with a live 3D preview of the selected component.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { allComponents, comp, dims } from './catalog.js?b45';
import * as B from './builders.js?b45';

let previewRenderer = null, previewScene = null, previewCamera = null, previewControls = null;
let previewGroup = null, previewTimer = null;
let selectedId = null;

function ensurePreview(canvas) {
  if (previewRenderer) return;
  previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  previewRenderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  previewRenderer.setSize(canvas.clientWidth || 320, canvas.clientHeight || 260, false);
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure = 1.4;
  previewScene = new THREE.Scene();
  previewScene.background = null;
  previewCamera = new THREE.PerspectiveCamera(45, (canvas.clientWidth || 320) / (canvas.clientHeight || 260), 0.05, 200);
  previewControls = new OrbitControls(previewCamera, canvas);
  previewControls.enableDamping = true;
  previewControls.autoRotate = true;
  previewControls.autoRotateSpeed = 2.2;
  const hemi = new THREE.HemisphereLight(0x9db8d8, 0x1a1f28, 1.6);
  previewScene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe2b8, 2.2);
  key.position.set(4, 6, 5);
  previewScene.add(key);
  const rim = new THREE.DirectionalLight(0x6fb8ff, 1.0);
  rim.position.set(-5, 3, -4);
  previewScene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x141922, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.005;
  previewScene.add(floor);

  const tick = () => { previewControls.update(); previewRenderer.render(previewScene, previewCamera); };
  previewTimer = setInterval(tick, 33); // timer-based: survives rAF-suspended panes
}

function showPreview(id) {
  if (previewGroup) {
    previewScene.remove(previewGroup);
    previewGroup.traverse(o => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose?.(); });
    previewGroup = null;
  }
  let obj;
  try {
    const built = B.buildById(id);
    obj = built.group ?? built; // some builders return {group, fans}
  } catch { return; }
  previewGroup = obj.isObject3D ? obj : obj.group;
  previewScene.add(previewGroup);
  const bb = new THREE.Box3().setFromObject(previewGroup);
  const size = bb.getSize(new THREE.Vector3());
  const center = bb.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z);
  previewCamera.position.set(center.x + r * 1.1, center.y + r * 0.75, center.z + r * 1.3);
  previewControls.target.copy(center);
  previewControls.update();
}

function specCard(c) {
  const rows = [
    ['Component ID', c.Component_ID],
    ['Zone', c.Zone],
    ['Category', `${c.Category}${c.Subcategory ? ' · ' + c.Subcategory : ''}`],
    ['W × D × H', `${c.Width_mm ?? '—'} × ${c.Depth_mm ?? '—'} × ${c.Height_mm ?? '—'} mm`],
    c.Height_RU ? ['Rack units', c.Height_RU] : null,
    c.Weight_kg ? ['Weight', `${c.Weight_kg} kg`] : null,
    c.Rating_kW ? ['Rating', `${c.Rating_kW} kW${c.Rating_Type ? ` (${c.Rating_Type})` : ''}`] : null,
    c.Mounting ? ['Mounting', c.Mounting] : null,
    c.Qty_Context ? ['Typical use', c.Qty_Context] : null,
    c.Dim_Confidence ? ['Confidence', c.Dim_Confidence] : null,
  ].filter(Boolean);
  return `
    <div class="db-spec-title">${c.Model ?? c.Component_ID}</div>
    <div class="db-spec-mfr">${c.Manufacturer ?? ''}</div>
    <div class="db-spec-desc">${c.Description ?? ''}</div>
    <dl class="insp-specs">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${c.Notes ? `<div class="insp-note">${c.Notes}</div>` : ''}
    ${c.Dim_Source ? `<div class="insp-src">Source: ${c.Dim_Source}</div>` : ''}`;
}

export function initDatabase() {
  const view = document.getElementById('dbView');
  const comps = allComponents().filter(c => c.Component_ID && c.Component_ID !== 'REF-001');
  const zones = [...new Set(comps.map(c => c.Zone))].sort();
  const cats = [...new Set(comps.map(c => c.Category))].sort();
  const mfrs = [...new Set(comps.map(c => c.Manufacturer).filter(Boolean))].sort();

  view.innerHTML = `
    <div class="db-head">
      <div class="db-title">COMPONENT DATABASE <span class="db-count">${comps.length} SKUs</span></div>
      <div class="db-filters">
        <input type="search" id="dbSearch" placeholder="Search brand, model, type…">
        <select id="dbZone"><option value="">All zones</option>${zones.map(z => `<option>${z}</option>`).join('')}</select>
        <select id="dbCat"><option value="">All categories</option>${cats.map(z => `<option>${z}</option>`).join('')}</select>
        <select id="dbMfr"><option value="">All brands</option>${mfrs.map(z => `<option>${z}</option>`).join('')}</select>
      </div>
    </div>
    <div class="db-body">
      <div class="db-table-wrap">
        <table class="db-table">
          <thead><tr><th>ID</th><th>Brand</th><th>Model</th><th>Type</th><th>Zone</th>
            <th class="num">W (mm)</th><th class="num">D (mm)</th><th class="num">H (mm)</th>
            <th class="num">kW</th><th class="num">kg</th></tr></thead>
          <tbody id="dbRows"></tbody>
        </table>
      </div>
      <div class="db-side">
        <canvas id="dbPreview"></canvas>
        <div class="db-hint">drag to orbit · auto-rotates</div>
        <div id="dbSpec" class="db-spec"><div class="inspector-empty">Select a component to preview it in 3D at true dimensions.</div></div>
      </div>
    </div>`;

  const rowsEl = document.getElementById('dbRows');

  function render() {
    const q = document.getElementById('dbSearch').value.toLowerCase();
    const fz = document.getElementById('dbZone').value;
    const fc = document.getElementById('dbCat').value;
    const fm = document.getElementById('dbMfr').value;
    const filtered = comps.filter(c => {
      if (fz && c.Zone !== fz) return false;
      if (fc && c.Category !== fc) return false;
      if (fm && c.Manufacturer !== fm) return false;
      if (q) {
        const hay = `${c.Component_ID} ${c.Manufacturer} ${c.Model} ${c.Category} ${c.Subcategory} ${c.Description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rowsEl.innerHTML = filtered.map(c => `
      <tr data-id="${c.Component_ID}" class="${c.Component_ID === selectedId ? 'sel' : ''}">
        <td class="mono">${c.Component_ID}</td>
        <td>${c.Manufacturer ?? ''}</td>
        <td class="strong">${c.Model ?? ''}</td>
        <td>${c.Subcategory ?? c.Category ?? ''}</td>
        <td>${c.Zone ?? ''}</td>
        <td class="num mono">${c.Width_mm ?? ''}</td>
        <td class="num mono">${c.Depth_mm ?? ''}</td>
        <td class="num mono">${c.Height_mm ?? ''}</td>
        <td class="num mono">${c.Rating_kW ?? ''}</td>
        <td class="num mono">${c.Weight_kg ?? ''}</td>
      </tr>`).join('');
    document.querySelector('.db-count').textContent = `${filtered.length} of ${comps.length} SKUs`;
  }

  for (const id of ['dbSearch', 'dbZone', 'dbCat', 'dbMfr'])
    document.getElementById(id).addEventListener('input', render);

  rowsEl.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    selectedId = tr.dataset.id;
    rowsEl.querySelectorAll('tr').forEach(r => r.classList.toggle('sel', r.dataset.id === selectedId));
    ensurePreview(document.getElementById('dbPreview'));
    showPreview(selectedId);
    document.getElementById('dbSpec').innerHTML = specCard(comp(selectedId));
  });

  render();
}

export function setDatabaseVisible(on) {
  document.getElementById('dbView').classList.toggle('hidden', !on);
  if (!on && previewTimer) { clearInterval(previewTimer); previewTimer = null; }
  if (on && previewRenderer && !previewTimer) {
    previewTimer = setInterval(() => { previewControls.update(); previewRenderer.render(previewScene, previewCamera); }, 33);
  }
}
