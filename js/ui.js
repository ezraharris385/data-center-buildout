// ui.js — panels, inspector, telemetry, toggles.
import { comp } from './catalog.js?b45';

const $ = id => document.getElementById(id);

export function initUI(handlers) {
  // tabs
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      handlers.onScene(btn.dataset.scene);
    });
  });
  // camera presets
  document.querySelectorAll('#cameraBtns button').forEach(btn =>
    btn.addEventListener('click', () => handlers.onCamera(btn.dataset.cam)));
  // toggles
  $('tglRoof').addEventListener('change', e => handlers.onToggle('roof', e.target.checked));
  $('tglContain').addEventListener('change', e => handlers.onToggle('containment', e.target.checked));
  $('tglLabels').addEventListener('change', e => handlers.onToggle('labels', e.target.checked));
  $('tglPower').addEventListener('change', e => handlers.onToggle('power', e.target.checked));
  $('tglCoolant').addEventListener('change', e => handlers.onToggle('coolant', e.target.checked));
  $('tglAir').addEventListener('change', e => handlers.onToggle('air', e.target.checked));
  $('tglHeat').addEventListener('change', e => handlers.onToggle('heat', e.target.checked));
  // sliders
  $('sldLoad').addEventListener('input', e => {
    $('valLoad').textContent = `${e.target.value}%`;
    handlers.onLoad(e.target.value / 100);
  });
  $('sldTemp').addEventListener('input', e => {
    $('valTemp').textContent = `${e.target.value}°F`;
    handlers.onTemp(+e.target.value);
  });
  // utility failure
  $('btnUtility').addEventListener('click', handlers.onUtilityToggle);
  // help
  $('btnHelp').addEventListener('click', () => $('helpModal').classList.remove('hidden'));
  $('btnCloseHelp').addEventListener('click', () => $('helpModal').classList.add('hidden'));
  $('helpModal').addEventListener('click', e => { if (e.target.id === 'helpModal') $('helpModal').classList.add('hidden'); });
}

export function setBlurb(html) { $('sceneBlurb').innerHTML = html; }

export function setUtilityUI(on, note, noteClass = '') {
  const btn = $('btnUtility'), dot = $('utilDot'), label = $('utilLabel'), fn = $('failNote');
  btn.classList.toggle('failed', !on);
  dot.className = `dot ${on ? 'ok' : 'fail'}`;
  label.textContent = on ? 'UTILITY ONLINE — click to fail grid' : 'GRID DOWN — click to restore';
  fn.textContent = note ?? '';
  fn.className = `failover-note ${noteClass}`;
}

export function updateTelemetry({ itKW, totalKW, pue, racks, kwPerRack, source, gpus, wsPct }) {
  const fmt = v => v >= 1000 ? `${(v / 1000).toFixed(1)} MW` : `${Math.round(v)} kW`;
  $('stITLoad').textContent = fmt(itKW);
  $('stTotal').textContent = fmt(totalKW);
  const p = $('stPUE');
  p.textContent = pue.toFixed(2);
  p.className = 'stat-k' + (pue > 1.6 ? ' bad' : pue > 1.3 ? ' warn' : '');
  $('stRacks').textContent = racks.toLocaleString?.() ?? racks;
  $('stDensity').textContent = kwPerRack.toFixed(1);
  const s = $('stSource');
  s.textContent = source;
  s.className = 'stat-k' + (source === 'UTILITY' ? '' : source === 'BATTERY' ? ' bad' : ' warn');
  $('stGpus').textContent = gpus ? gpus.toLocaleString() : '—';
  $('stWS').textContent = wsPct ? `${wsPct}%` : '—';
}

export function showInspector(componentId, extra = {}) {
  const el = $('inspector');
  let c;
  try { c = comp(componentId); } catch { el.innerHTML = '<div class="inspector-empty">No catalog entry.</div>'; return; }
  const dim = `${c.Width_mm ?? '—'} × ${c.Depth_mm ?? '—'} × ${c.Height_mm ?? '—'} mm`;
  const rows = [
    ['W × D × H', dim],
    c.Height_RU ? ['Rack units', `${c.Height_RU}`] : null,
    c.Weight_kg ? ['Weight', `${c.Weight_kg} kg`] : null,
    c.Rating_kW ? ['Rating', `${c.Rating_kW} kW ${c.Rating_Type ? `(${c.Rating_Type})` : ''}`] : null,
    c.Mounting ? ['Mounting', c.Mounting] : null,
    c.Qty_Context ? ['Context', c.Qty_Context] : null,
    extra.scaled ? ['Display', extra.scaled] : null,
  ].filter(Boolean);
  el.className = '';
  el.innerHTML = `
    <div class="insp-cat">${c.Zone} · ${c.Category}${c.Subcategory ? ' · ' + c.Subcategory : ''}</div>
    <div class="insp-title">${c.Model ?? c.Component_ID}</div>
    <div class="insp-mfr">${c.Manufacturer ?? ''} — ${c.Component_ID}</div>
    <div class="insp-desc">${c.Description ?? ''}</div>
    <dl class="insp-specs">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${c.Notes ? `<div class="insp-note">${c.Notes}</div>` : ''}
    ${c.Dim_Source ? `<div class="insp-src">Source: ${c.Dim_Source}${c.Dim_Confidence ? ` · ${c.Dim_Confidence}` : ''}</div>` : ''}
  `;
}

export function clearInspector() {
  const el = $('inspector');
  el.className = 'inspector-empty';
  el.textContent = 'Click any piece of equipment to inspect it. Hover to highlight.';
}

export function setLoadProgress(pct, msg) {
  $('loadFill').style.width = `${pct}%`;
  if (msg) $('loadMsg').textContent = msg;
}
export function hideLoading() { $('loading').classList.add('done'); }
