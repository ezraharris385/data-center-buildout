// agent.js — the in-app analyst for custom projects.
// Two layers:
//   1. A deterministic engineering analysis computed from the build config
//      (capacity, redundancy, runtime, PUE) — always available, no network.
//   2. An optional Claude-powered narrative analyst (bring your own API key,
//      stored in localStorage only, called directly from the browser).
import { comp, kw } from './catalog.js?b36';
import { custom, RACK_OPTIONS, UPS_OPTIONS, GEN_OPTIONS, HEATREJ_OPTIONS, CHIP_OPTIONS, SITE_77N } from './custom.js?b36';

const fmt = v => v >= 1000 ? `${(v / 1000).toFixed(2)} MW` : `${Math.round(v)} kW`;

/* ---------------- deterministic analysis ---------------- */
export function analyze(cfg, stats) {
  const f = [];
  const ok = (t) => f.push({ level: 'ok', t });
  const warn = (t) => f.push({ level: 'warn', t });
  const bad = (t) => f.push({ level: 'bad', t });

  const itKW = stats.itKW;
  const pue = stats.basePUE;
  const totalKW = itKW * pue;
  const site = cfg.siteOverrides ?? null;

  /* ----- site mode: verify against the underwriting workbook ----- */
  if (site) {
    const util = site.utilityKW;
    ok(`${site.siteName}: ${site.grossSF.toLocaleString()} SF shell, ${site.halls > 1 ? site.halls + ' halls, ' : 'single hall, '}` +
       `${stats.whiteSpacePct}% white space${site.officeSF ? ` (offices ${site.officeSF.toLocaleString()} SF in 4 corners)` : ''}.`);
    if (stats.gpus) ok(`${stats.racks.toLocaleString()} racks placed → ${stats.gpus.toLocaleString()} GPUs at ${stats.kwPerRack} kW/rack.`);

    // space-vs-power binding: did the shell absorb the full power-limited build?
    if (cfg.rows.maxRacks && stats.racks < cfg.rows.maxRacks * 0.98) {
      const lostKW = (cfg.rows.maxRacks - stats.racks) * stats.kwPerRack;
      bad(`SPACE-LIMITED: the shell fits ${stats.racks.toLocaleString()} of ${cfg.rows.maxRacks.toLocaleString()} power-supported racks — ` +
          `${fmt(lostKW)} of feed capacity is stranded. This building binds on floor area, not the interconnect.`);
    }
    const wsf = Math.round(itKW * 1000 / site.grossSF);
    if (wsf > 1500) warn(`Power density ${wsf} W/sf gross — beyond today's typical retrofit ceiling (~600–1,500 W/sf). Physically placeable with rack-scale DLC, but structure, risers, and yard become the fight.`);
    else ok(`Power density ${wsf} W/sf gross — within retrofit norms.`);
    if (site.parcelAc && site.parcelAc < 1.5) {
      warn(`Parcel is ${site.parcelAc} ac — the N+1 yard plant drawn here overruns the property line (see the amber boundary). ` +
           `Real fit-out needs rooftop plant, stacked gensets, or offsite capacity.`);
    }

    // PUE verification: design 1.25 vs cooling-implied
    for (const [label, p] of [['Liquid (DLC)', 1.15], ['Design (workbook)', site.designPUE], ['Air-cooled', 1.32]]) {
      const need = itKW * p;
      const pass = need <= util;
      // hypothetical sweep — only the ACTIVE build's PUE can block the design
      (pass ? ok : warn)(`PUE ${p} (${label}) → ${fmt(need)} vs ${fmt(util)} feed — ${pass ? `fits (${fmt(util - need)} headroom)` : `would exceed by ${fmt(need - util)} — not viable at this rack count`}.`);
    }
    if (itKW * pue > util) bad(`This build at PUE ${pue} needs ${fmt(itKW * pue)} — over the ${fmt(util)} interconnect. Shed racks or improve PUE.`);
    else ok(`This build: ${fmt(itKW)} IT × PUE ${pue} = ${fmt(itKW * pue)} — inside the ${fmt(util)} feed.`);

    // optimization report — how the confines were used
    const baseIT = 24000;   // workbook critical-IT baseline
    if (itKW > baseIT * 1.005) ok(`Optimized sizing: at PUE ${pue} the same feed carries ${fmt(itKW)} IT vs the workbook's ${fmt(baseIT)} (sized at PUE ${site.designPUE}) — the efficiency gap converts to ~${(stats.gpus - Math.floor(baseIT / stats.kwPerRack) * (cfg.chip?.gpusPerRack ?? 0)).toLocaleString()} extra GPUs.`);
    else if (itKW < baseIT * 0.995) warn(`Air-platform tax: PUE ${pue} caps deployable IT at ${fmt(itKW)} vs the ${fmt(baseIT)} baseline — the interconnect, not the floor, binds this version.`);
    if (cfg.rows.maxRacks) ok(`Layout optimization: ${stats.racks.toLocaleString()} of ${cfg.rows.maxRacks.toLocaleString()} power-limited racks placed (${Math.round(stats.racks / cfg.rows.maxRacks * 100)}%) — rows auto-fit to the bay width, nudged off column lines (zero racks lost to columns), egress break every ${cfg.rows.egressEvery} slots${site.halls > 1 ? `, balanced across ${site.halls} halls` : ''}.`);

    // power chain from the workbook budget
    if (site.upsKW < itKW) bad(`UPS budget ${fmt(site.upsKW)} < IT load ${fmt(itKW)}.`);
    else ok(`UPS ${fmt(site.upsKW)} vs ${fmt(itKW)} IT — per workbook budget.`);
    if (site.genKW < itKW * pue) warn(`Generators ${fmt(site.genKW)} vs ${fmt(itKW * pue)} total — check N+1 at this PUE.`);
    else ok(`Generators ${fmt(site.genKW)} (${Math.round(site.genKW / 3000)}× 3 MW, N+1 sized to this platform) cover ${fmt(itKW * pue)} total.`);

    // cooling plant — sized from this chip's heat load
    const needCool = itKW * 1.05;
    if (stats.coolKW >= needCool) ok(`Heat rejection ${fmt(stats.coolKW)} (${stats.chillerCount}× 1 MW, N+1 from this platform's load) vs ${fmt(needCool)} heat.`);
    else warn(`Heat rejection drawn ${fmt(stats.coolKW)} vs ${fmt(needCool)} needed — full design is ${site.heatUnits}× 1 MW; yard renders the first ${stats.chillerCount}.`);
    if (site.crahNeed > 0) warn(`Air-cooled platform: needs ~${site.crahNeed} CW146-class air handlers for ${fmt(itKW)} IT — at this density rear-door HX or fan walls are the realistic fit-out; perimeter wall space caps the drawing at ${cfg.crahCount}.`);
    if (site.battCabinets) ok(`Batteries: ${site.battCabinets} cabinets ≈ 5 min ride-through at full ${fmt(itKW)} IT (scales live in the failover sim).`);

    // platform-specific physical & usage engineering
    const chip = cfg.chip;
    if (chip) {
      const rc = comp(chip.rackId);
      const fpM2 = (rc.Width_mm / 1000) * (rc.Depth_mm / 1000);
      const psf = Math.round(chip.rackKg / fpM2 * 0.2048);
      if (psf > 250) warn(`Floor loading: ${chip.rackKg} kg on a ${(fpM2 * 10.764).toFixed(1)} SF footprint ≈ ${psf} psf point load — above typical industrial slab (~250 psf). The budget's 30,000 SF slab reinforcement goes under these rows.`);
      else ok(`Floor loading ≈ ${psf} psf — inside typical industrial slab capacity; reinforcement allowance stays contingency.`);
      ok(`Scale-up domain: ${chip.domain === 72 ? 'one 72-GPU domain per rack — cross-rack traffic is scale-out only, so the fabric is leaf/spine between rows' : '8-GPU nodes — ALL cross-node training traffic rides the scale-out fabric; expect denser ToR/leaf switching per row'}.`);
      ok(`Power delivery: ${chip.volts} — ${chip.volts.includes('48') ? 'rack-scale power shelves on a DC busbar; fewer breakers, busway plug-ins sized per rack' : 'conventional PDU whips from the busway; more branch circuits, standard colo practice'}.`);
      ok(`Usage profile: ${chip.use}.`);
      if (!cfg.cooling.includes('liquid') && cfg.rows.inRowEvery) ok(`Air fit-out: in-row coolers every ${cfg.rows.inRowEvery}th slot + cold-aisle containment (visible in the rows) carry the load the perimeter CRAHs can't.`);
    }
    if (site.footprintAssumed) warn(`Footprint ${custom.siteW_ft}×${custom.siteD_ft} ft is assumed from ${site.grossSF.toLocaleString()} SF gross — confirm against survey/ALTA before layout decisions.`);
      else if (site.measured) ok(`Footprint measured from your Google Earth polygons — ${site.grossSF.toLocaleString()} SF building on a ${site.parcelAc} ac parcel. No footprint assumptions remain.`);

    // AMD max-fit: the 50 MW question
    const amd = CHIP_OPTIONS.filter(c => c.key.startsWith('mi'));
    for (const c of amd) {
      const racksAtSite = Math.floor(itKW / c.kwRack);
      const racks50 = Math.floor(50000 / c.kwRack);
      const util50 = 50000 * (c.cooling === 'liquid' ? 1.15 : 1.32);
      const spaceOK = racks50 <= stats.spaceCapRacks;
      warn(`${c.label}: ${racksAtSite.toLocaleString()} racks (${(racksAtSite * c.gpusPerRack).toLocaleString()} GPUs) at today's ${fmt(itKW)} IT. ` +
           `At 50 MW IT: ${racks50.toLocaleString()} racks (${(racks50 * c.gpusPerRack).toLocaleString()} GPUs) — ` +
           `space ${spaceOK ? 'fits' : `EXCEEDS shell (~${stats.spaceCapRacks.toLocaleString()} rack cap)`}; ` +
           `needs ~${fmt(util50)} utility (${(util50 / 1000 - site.utilityKW / 1000).toFixed(1)} MW above today's feed).`);
    }
    const score2 = f.some(x => x.level === 'bad') ? 'BLOCKED' : 'SOUND';
    return { findings: f, score: score2, itKW, totalKW, pue };
  }

  // density
  const kwRack = stats.kwPerRack;
  const densityClass = kwRack >= 80 ? 'AI/HPC (extreme density)' : kwRack >= 25 ? 'high density' : kwRack >= 10 ? 'standard cloud' : 'enterprise';
  ok(`IT load ${fmt(itKW)} across ${stats.racks} racks at ${kwRack} kW/rack — ${densityClass}.`);

  // cooling type sanity
  if (kwRack > 40 && cfg.cooling !== 'liquid') bad(`${kwRack} kW/rack on air cooling is not physically viable — anything above ~40 kW/rack needs direct liquid cooling.`);
  if (kwRack < 15 && cfg.cooling === 'liquid') warn(`Liquid cooling at ${kwRack} kW/rack works, but the CDU/piping capex rarely pays back below ~20 kW/rack.`);

  // heat rejection capacity
  const rejKW = stats.coolKW;
  const heatToReject = itKW * 1.05; // IT + distribution losses
  if (rejKW <= 0) bad('No heat rejection plant configured — the facility cannot run.');
  else if (rejKW < heatToReject) bad(`Cooling shortfall: plant rejects ${fmt(rejKW)} but the build generates ~${fmt(heatToReject)}. Add ${Math.ceil((heatToReject - rejKW) / (kw(cfg.yard.chillers.id) || 1000))} more unit(s).`);
  else if (rejKW < heatToReject * 1.2) warn(`Cooling is N-only: ${fmt(rejKW)} vs ${fmt(heatToReject)} load. One unit down on a design day = thermal excursion. Target N+1 (~${fmt(heatToReject + (kw(cfg.yard.chillers.id) || 1000))}).`);
  else ok(`Heat rejection ${fmt(rejKW)} vs ~${fmt(heatToReject)} load — ${(rejKW / heatToReject).toFixed(2)}× margin (≈N+${Math.floor((rejKW - heatToReject) / (kw(cfg.yard.chillers.id) || 1000))}).`);

  // UPS capacity
  const upsOpt = UPS_OPTIONS.find(u => u.id === custom.ups);
  const upsKW = (upsOpt?.kw ?? 0) * custom.upsCount * 0.9; // kVA→kW-ish derate
  if (upsKW <= 0) bad('No UPS configured — any grid disturbance drops the entire IT load.');
  else if (upsKW < itKW) bad(`UPS undersized: ${fmt(upsKW)} usable vs ${fmt(itKW)} IT load (${Math.round(upsKW / itKW * 100)}%). Add blocks or shed load.`);
  else if (upsKW < itKW * 1.15) warn(`UPS at ${Math.round(itKW / upsKW * 100)}% of capacity — no N+1. A single module failure during an outage is a full drop.`);
  else ok(`UPS ${fmt(upsKW)} usable vs ${fmt(itKW)} IT — ${(upsKW / itKW).toFixed(2)}× coverage.`);

  if (custom.batteries === 0 && upsKW > 0) bad('UPS has no battery cabinets — it cannot ride through the generator start gap.');
  else if (custom.batteries > 0) {
    const minutes = (custom.batteries * 250) / Math.max(1, itKW) * 60; // ~250kWh/cabinet rough
    if (minutes < 4) warn(`Battery ride-through ≈ ${minutes.toFixed(1)} min at full load — tight against a slow genset start. Industry floor is ~5 min.`);
    else ok(`Battery ride-through ≈ ${Math.min(60, minutes).toFixed(0)} min at full IT load.`);
  }

  // generation
  const genOpt = GEN_OPTIONS.find(g => g.id === custom.gen);
  const genKW = (genOpt?.kw ?? 0) * custom.genCount;
  if (genKW === 0) warn('No standby generation — the site rides only on batteries. Fine for a lab, fatal for production SLAs.');
  else if (genKW < totalKW) bad(`Generators cover ${fmt(genKW)} but total facility load is ${fmt(totalKW)} — on grid loss you must shed ${fmt(totalKW - genKW)}.`);
  else if (genKW < totalKW * 1.25) warn(`Generation is N-only (${fmt(genKW)} vs ${fmt(totalKW)}). One failed start = load shed. Target N+1 (${custom.genCount + 1} units).`);
  else ok(`Generation ${fmt(genKW)} vs ${fmt(totalKW)} facility load — N+${Math.floor((genKW - totalKW) / (genOpt?.kw ?? 1))} redundancy.`);

  // fuel runtime
  if (genKW > 0) {
    if (custom.fuel === 0) bad('Gensets have no bulk fuel tanks — only base-tank hours. 48–72 h on-site fuel is the standard for Tier III+.');
    else {
      const gallons = custom.fuel * 20000;
      const burnGalPerHr = (totalKW / 1000) * 70; // ~70 gal/hr per MW at load
      const hours = gallons / Math.max(1, burnGalPerHr);
      if (hours < 24) warn(`Fuel runtime ≈ ${hours.toFixed(0)} h at full load — below the 48 h Tier benchmark. Add tanks or a refuel contract.`);
      else ok(`Fuel runtime ≈ ${hours.toFixed(0)} h at full facility load (${custom.fuel} × 20,000 gal).`);
    }
  }

  // transformers
  const tfKW = custom.transformers * 2500; // 2.5 MVA units
  if (tfKW < totalKW) bad(`Transformer capacity ${fmt(tfKW)} < facility load ${fmt(totalKW)} — the utility feed is the bottleneck. Add units.`);
  else if (tfKW < totalKW * 1.3) warn(`Transformers at ${Math.round(totalKW / tfKW * 100)}% — no spare unit for maintenance.`);
  else ok(`Transformer capacity ${fmt(tfKW)} vs ${fmt(totalKW)} — healthy margin.`);

  // topology details
  if (!custom.ats && genKW > 0) bad('Generators exist but there is no ATS — nothing transfers the load to them automatically.');
  if (!custom.busB) warn('Single-corded distribution (no B-feed busway): any busway maintenance is a full row outage. Concurrent maintainability requires A+B.');
  if (!custom.containment && cfg.cooling === 'air') warn('No aisle containment: hot and cold air mix freely, costing roughly 10–20% extra cooling energy.');
  if (cfg.cooling === 'air' && custom.crahCount < Math.ceil(itKW / 146) ) warn(`CRAH count is light: ${custom.crahCount} × ~146 kW handles ~${fmt(custom.crahCount * 146)} of air-side load.`);
  if (custom.floors > 1) ok(`${custom.floors}-floor white space: land-efficient, but structural loading (${custom.rack === 'RCK-004' || custom.rack === 'RCK-005' ? '~1,360 kg per NVL72 rack' : 'rack point loads'}) and riser design become the constraints.`);

  const score = f.filter(x => x.level === 'bad').length === 0 ? (f.filter(x => x.level === 'warn').length <= 2 ? 'SOUND' : 'WORKABLE') : 'BLOCKED';
  return { findings: f, score, itKW, totalKW, pue };
}

/* ---------------- Claude narrative layer ---------------- */
// Static site, no build step → direct browser call with the CORS opt-in header.
// The key never leaves this machine except to api.anthropic.com.
const KEY_STORE = 'dcb_claude_key';

export function getKey() { return localStorage.getItem(KEY_STORE) ?? ''; }
export function setKey(k) { k ? localStorage.setItem(KEY_STORE, k.trim()) : localStorage.removeItem(KEY_STORE); }

export async function askClaude(question, cfg, stats, findings) {
  const key = getKey();
  if (!key) throw new Error('no-key');
  const system = `You are the resident data center engineering analyst inside "Data Center Buildout",
a 3D operations studio. The user has configured a custom facility. Analyze it like a sharp
consulting engineer talking to a commercial real estate professional: concrete, quantitative,
no fluff, cite the numbers from the config. Keep answers under 250 words unless asked for depth.

CURRENT BUILD CONFIG (JSON):
${JSON.stringify({ ...custom, cooling: cfg.cooling }, null, 1)}

COMPUTED STATS: IT ${stats.itKW} kW, PUE est ${stats.basePUE}, racks ${stats.racks}, ${stats.kwPerRack} kW/rack.

DETERMINISTIC FINDINGS ALREADY SHOWN TO THE USER:
${findings.map(f => `[${f.level}] ${f.t}`).join('\n')}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: question }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `API error ${res.status}`);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') return '(The model declined this request.)';
  return data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || '(empty response)';
}

/* ---------------- panel UI ---------------- */
export function initAgent(getContext) {
  const el = document.getElementById('agentPanel');
  el.innerHTML = `
    <div class="panel-head">ANALYST</div>
    <button id="agentRun" class="agent-run">▶ Run engineering analysis</button>
    <div id="agentOut" class="agent-out"></div>
    <div class="agent-ask">
      <textarea id="agentQ" rows="2" placeholder="Ask the analyst anything about this build… (needs Claude API key)"></textarea>
      <button id="agentAsk">Ask</button>
    </div>
    <div class="agent-key">
      <input type="password" id="agentKey" placeholder="Claude API key (optional — stored locally)" value="${getKey()}">
    </div>
    <div class="agent-note">Deterministic analysis runs fully in-browser. Questions use your own
    Anthropic API key, sent only to api.anthropic.com.</div>`;

  const out = document.getElementById('agentOut');

  document.getElementById('agentKey').addEventListener('change', e => setKey(e.target.value));

  document.getElementById('agentRun').addEventListener('click', () => {
    const { cfg, stats } = getContext();
    const { findings, score, itKW, totalKW } = analyze(cfg, stats);
    el.dataset.findings = JSON.stringify(findings);
    const icon = { ok: '✔', warn: '▲', bad: '✖' };
    out.innerHTML = `
      <div class="agent-score agent-score-${score.toLowerCase()}">DESIGN: ${score} · ${fmt(itKW)} IT · ${fmt(totalKW)} total</div>
      ${findings.map(f => `<div class="agent-f agent-${f.level}"><span>${icon[f.level]}</span>${f.t}</div>`).join('')}`;
  });

  document.getElementById('agentAsk').addEventListener('click', async () => {
    const q = document.getElementById('agentQ').value.trim();
    if (!q) return;
    const { cfg, stats } = getContext();
    const findings = el.dataset.findings ? JSON.parse(el.dataset.findings) : analyze(cfg, stats).findings;
    const qEl = document.createElement('div');
    qEl.className = 'agent-chat-q';
    qEl.textContent = q;
    out.appendChild(qEl);
    const aEl = document.createElement('div');
    aEl.className = 'agent-chat-a';
    aEl.textContent = '…thinking';
    out.appendChild(aEl);
    document.getElementById('agentQ').value = '';
    try {
      aEl.textContent = await askClaude(q, cfg, stats, findings);
    } catch (e) {
      aEl.textContent = e.message === 'no-key'
        ? 'Add a Claude API key below to ask free-form questions. The built-in analysis (▶ button) works without one.'
        : `Error: ${e.message}`;
    }
    out.scrollTop = out.scrollHeight;
  });
}
