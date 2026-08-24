// tour.js — camera choreography engine + cinematic tour + in-canvas recorder.
// Powers both the self-recorded demo video (?scene=X&tour=cine&record=1) and the
// Education "flow walkthrough" camera moves.
import * as THREE from 'three';

/* ================= Choreographer ================= */
// keys: [{ pos:[x,y,z]|V3, target:[...], dur: seconds to REACH this key from the
//          previous one (first key: initial jump), caption:{kicker,title,sub}? }]
export class Choreographer {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.active = false;
    this._keys = null;
  }

  start(keys, { onCaption = null, onDone = null } = {}) {
    this._keys = keys.map(k => ({
      pos: k.pos.isVector3 ? k.pos.clone() : new THREE.Vector3(...k.pos),
      target: k.target.isVector3 ? k.target.clone() : new THREE.Vector3(...k.target),
      dur: k.dur ?? 4,
      caption: k.caption ?? null,
      capDur: k.capDur ?? null,
      action: k.action ?? null,
    }));
    this.onCaption = onCaption;
    this.onDone = onDone;
    this.seg = 0;
    this.t = 0;
    this.active = true;
    // jump to key 0
    this.camera.position.copy(this._keys[0].pos);
    this.controls.target.copy(this._keys[0].target);
    this.controls.update();
    this.camera.updateMatrixWorld();
    // key 0's caption displays while traveling toward key 1
    if (this._keys[0].caption) this.onCaption?.(this._keys[0].caption, this._keys[0].capDur ?? this._keys[1]?.dur ?? 4);
    if (this._keys[0].action) { try { this._keys[0].action(); } catch (e) { console.warn('tour action failed', e); } }
    this.segStartPos = this._keys[0].pos.clone();
    this.segStartTgt = this._keys[0].target.clone();
    this.seg = 1;
    if (this._keys.length < 2) this._finish();
  }

  stop() {
    this.active = false;
    this._keys = null;
  }

  _finish() {
    this.active = false;
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  update(dt) {
    if (!this.active || !this._keys) return;
    const key = this._keys[this.seg];
    this.t += dt;
    const u = Math.min(1, this.t / key.dur);
    // smootherstep for velvet motion
    const e = u * u * u * (u * (u * 6 - 15) + 10);
    this.camera.position.lerpVectors(this.segStartPos, key.pos, e);
    this.controls.target.lerpVectors(this.segStartTgt, key.target, e);
    this.controls.update();
    this.camera.updateMatrixWorld();
    if (u >= 1) {
      this.segStartPos = key.pos.clone();
      this.segStartTgt = key.target.clone();
      this.seg++;
      this.t = 0;
      if (this.seg >= this._keys.length) { this._finish(); return; }
      const next = this._keys[this.seg];
      if (next.caption) this.onCaption?.(next.caption, next.capDur ?? next.dur);
      if (next.action) { try { next.action(); } catch (e) { console.warn('tour action failed', e); } }
    }
  }
}

/* ================= Cinematic tour keyframes ================= */
// Follows the operational flow from the property entry point inward: utility
// interconnect → transformers → gray space → white space aisle → rack detail →
// heat rejection in the yard → hero wide.  ~26 s total.
export function cinematicKeys(facility, cfg) {
  const a = facility.anchors;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const util = a.utility, ups = a.ups;
  const tf = a.transformers[Math.floor(a.transformers.length / 2)] ?? V(0, 1.5, -a.grayD - 3.5);
  const gen = a.gensets[0] ?? V(-a.hallW / 2 + 3, 1.5, -a.grayD - 8);
  const chill = a.chillers[0] ?? V(0, 1.5, -a.grayD - a.yardD + 6);
  const aisleZ = a.aisle0;
  const rowY = 1.5;

  return [
    { // 1 — entry point: low outside the fence, utility pylon against the site
      pos: V(util.x + 9, 2.2, util.z - 12),
      target: V(util.x, 7, util.z + 4),
      dur: 0.01,
      caption: { kicker: 'ENTRY POINT', title: 'The utility interconnect', sub: 'Every megawatt enters the property here' },
    },
    { // 2 — sweep along the power trunk toward the transformers
      pos: V(tf.x + 7, 4.5, tf.z - 9),
      target: V(tf.x, 1.6, tf.z),
      dur: 4.5,
      caption: { kicker: 'STEP-DOWN', title: 'Transformers & switchgear', sub: 'Medium voltage down to distribution voltage' },
    },
    { // 3 — glide over the gray space lineup
      pos: V(ups.x - a.hallW * 0.32, 5.2, -a.grayD - 4.5),
      target: V(ups.x, 1.3, -a.grayD + 2),
      dur: 4,
      caption: { kicker: 'GRAY SPACE', title: 'UPS & batteries', sub: 'Ride-through power — the heartbeat of uptime' },
    },
    { // 4 — through the hall: drop into the contained aisle
      pos: V(-a.rowLen / 2 - 5.5, 2.4, aisleZ),
      target: V(a.rowLen / 2, 1.15, aisleZ),
      dur: 4.5,
      caption: { kicker: 'WHITE SPACE', title: cfg.tourRackLine ?? 'The IT floor', sub: `${facility.stats.racks} racks · ${(facility.stats.itKW / 1000).toFixed(1)} MW of compute` },
    },
    { // 5 — dolly down the aisle, rack level
      pos: V(a.rowLen / 2 + 2.5, 1.6, aisleZ),
      target: V(a.rowLen / 2 + 8, 1.3, aisleZ),
      dur: 5,
      caption: null,
    },
    { // 6 — rise out over the coolant lines toward the yard plant
      pos: V(a.hallW * 0.7, a.wallH + 7, -a.grayD - 2),
      target: V(chill.x, 1.5, chill.z),
      dur: 4.5,
      caption: { kicker: 'HEAT REJECTION', title: 'The thermal loop closes', sub: 'Every watt of compute leaves as heat in the yard' },
    },
    { // 7 — hero wide: whole property from high corner
      pos: V(a.hallW * 1.35, a.wallH * 3.2, a.hallD + a.hallW * 0.9),
      target: V(0, 0, (a.hallD - a.grayD - a.yardD * 0.6) / 2),
      dur: 5.5,
      caption: { kicker: 'DATA CENTER BUILDOUT', title: 'One property. One machine.', sub: 'Power in — compute out — heat rejected' },
    },
  ];
}


/* ================= Commercial cut (~23 s) ================= */
// Marketing pacing, not teaching: reveal → systems sweep → aisle dive →
// grid-failure beat → hero pull-back with end card.
export function commercialKeys(facility, cfg) {
  const a = facility.anchors;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const gen = a.gensets[Math.floor(a.gensets.length / 2)] ?? V(0, 2, -a.grayD - 10);
  const chill = a.chillers[0] ?? V(0, 1.5, -a.grayD - a.yardD + 6);
  const aisleZ = a.aisle0;

  return [
    { // cold open — low, outside the wire, the machine glowing at dusk
      pos: V(-a.hallW * 1.05, 2.2, -a.grayD - a.yardD - 8),
      target: V(0, 4, -a.grayD - 6),
      dur: 0.01,
      caption: { kicker: 'DATA CENTER BUILDOUT', title: 'See the whole machine.', sub: '' },
    },
    { // rising sweep across the yard plant — fans, heat, energy
      pos: V(a.hallW * 0.55, 10, -a.grayD - a.yardD * 0.55),
      target: V(chill.x, 1.5, chill.z),
      dur: 4.2,
      caption: { kicker: 'LIVE OPERATIONS', title: 'Every system, animated.', sub: 'Power · coolant · airflow · heat — end to end' },
    },
    { // swoop toward the hall over gray space
      pos: V(a.ups.x + 10, 6, -a.grayD + 8),
      target: V(0, 1.5, a.rows[0]?.z ?? 4),
      dur: 3.6,
      caption: null,
    },
    { // THE aisle dive — enter low and slow
      pos: V(-a.rowLen / 2 - 4.5, 1.7, aisleZ),
      target: V(a.rowLen / 2, 1.1, aisleZ),
      dur: 3.4,
      caption: { kicker: 'MILLIMETER-ACCURATE', title: 'Real hardware, real dimensions.', sub: 'GB200 NVL72 to the fuel farm — 61 manufacturer SKUs' },
    },
    { // dolly THROUGH the aisle — stay inside, always facing down the row
      pos: V(a.rowLen / 2 - 3, 1.55, aisleZ),
      target: V(a.rowLen / 2 + 8, 1.2, aisleZ),
      dur: 3.6,
      caption: null,
    },
    { // grid-failure beat — rise out toward the genset line as backup power ignites
      pos: V(a.hallW * 0.62, 8.5, -a.grayD - 3),
      target: V(gen.x, 2, gen.z),
      dur: 4.2,
      caption: { kicker: 'STRESS-TEST THE SITE', title: 'Fail the grid. Watch it ride through.', sub: 'Batteries bridge · generators start · ATS transfers' },
    },
    { // hero pull-back — whole property, flows blazing
      pos: V(a.hallW * 1.5, a.wallH * 3.6, a.hallD + a.hallW * 1.05),
      target: V(0, 0, (a.hallD - a.grayD - a.yardD * 0.5) / 2),
      dur: 5.2,
      caption: { kicker: 'DATA CENTER BUILDOUT — 3D OPERATIONS STUDIO', title: 'From site to silicon.', sub: 'Site-specific buildouts · chip-level capacity · investor-grade analysis' },
    },
  ];
}

/* ================= Trailer cut (~29 s) =================
   Audience: a senior real-estate professional who is NOT a data center
   specialist. So the beats are asset-first — a real building, a real
   constraint, a decision — and the captions carry no silicon jargon.
   Runs on the Lehigh site build, where the fit-out program exists. */
export function trailerKeys(facility, cfg, hooks = {}) {
  const a = facility.anchors;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const f = a.fitout;
  const prog = f?.program;
  const sf = n => (n ?? 0).toLocaleString();
  const mw = (facility.stats.itKW / 1000).toFixed(1);
  const ft = m => Math.round(m / 0.3048);

  // Framing helper: put the camera far enough along `dir` that a sphere of
  // radius r around `center` fills the vertical FOV. Guessing distances against
  // a 78 x 157 m hall produced shots that were 60% empty sky, so every beat
  // below states the subject it must fill instead.
  const FOV = (cfg._fov ?? 50) * Math.PI / 180;
  const shot = (center, r, dir, pad = 1.12) => {
    const d = (r * pad) / Math.tan(FOV / 2);
    return center.clone().add(dir.clone().normalize().multiplyScalar(d));
  };

  const bldgC = V(0, 3, (a.hallD - a.grayD) / 2);          // shell centre
  const bldgR = (a.hallD + a.grayD) / 2;                    // half depth dominates
  const yardC = V(0, 2, -a.grayD - a.yardD / 2);
  const pod = f?.pod ?? a.hallCenter;
  const podR = Math.max((f?.podW ?? 24), (f?.podD ?? 16)) / 2;
  const roomsC = V(0, 1.5, ((f?.podZ0 ?? 4) + (f?.shellZ0 ?? 38)) / 2);
  const roomsR = Math.max(a.hallW / 2, ((f?.shellZ0 ?? 38) - (f?.podZ0 ?? 4)) / 2);
  const hallC = V(0, 1, ((f?.podZ0 ?? 4) + a.hallD) / 2);
  const hallR = (a.hallD - (f?.podZ0 ?? 4)) / 2;
  const siteC = V(0, 1, (a.hallD - a.grayD - a.yardD) / 2);
  const siteR = (a.hallD + a.grayD + a.yardD) / 2;

  return [
    { // 1 — cold open: LOW angle along the facade, roof on. Any elevated angle on
      // a 167 m x 5.4 m box turns the roof into a blown-out plane filling the
      // frame, so the establishing shot stays near grade like a building photo.
      pos: shot(bldgC, bldgR * 0.72, V(0.66, 0.115, 0.74)),
      target: V(0, 4, bldgC.z),
      dur: 0.01,
      action: () => { hooks.setLabels?.(false); hooks.setRoof?.(true); },
      caption: { kicker: cfg.siteOverrides?.siteName ? 'NILES, ILLINOIS' : 'THE SITE',
                 title: `A ${cfg.siteOverrides?.grossSF ? Math.round(cfg.siteOverrides.grossSF / 1000) + ',000' : '139,000'} SF industrial shell.`,
                 sub: 'The client question: can it carry 30 megawatts?' },
    },
    { // 2 — descend across the yard: what 30 MW physically requires outdoors
      pos: shot(yardC, a.yardD / 2, V(0.44, 0.52, 0.73)),
      target: yardC.clone(),
      dur: 5.0,
      caption: { kicker: 'MEASURED, NOT SKETCHED', title: 'Modeled from the real parcel.',
                 sub: `${ft(a.hallW)} × ${ft(a.hallD + a.grayD)} ft footprint · surveyed boundary · catalog dimensions throughout` },
    },
    { // 3 — the reveal: roof comes off, tight on the white-space pod
      pos: shot(pod, podR, V(0.38, 0.58, 0.72)),
      target: pod.clone(),
      dur: 4.6,
      action: () => hooks.setRoof?.(false),
      caption: { kicker: 'THE ANSWER', title: `${mw} MW fits in ${ft(f?.podW ?? 24)} × ${ft(f?.podD ?? 16)} feet.`,
                 sub: `${facility.stats.racks} racks — the entire revenue-producing floor` },
    },
    { // 4 — pull out to the support rooms flanking and backing the pod
      pos: shot(roomsC, roomsR, V(-0.46, 0.56, 0.69)),
      target: roomsC.clone(),
      dur: 4.6,
      caption: { kicker: 'WHAT MOST PRO-FORMAS MISS', title: 'The rooms that serve it are 5× larger.',
                 sub: prog ? `${sf(prog.areas.electricalGray + prog.areas.electricalInterior)} SF electrical · ${sf(prog.areas.mechanical)} SF mechanical`
                           : 'Electrical and mechanical dominate the program' },
    },
    { // 5 — steep over the whole hall: fitted program against unfitted shell
      pos: shot(hallC, hallR, V(0.22, 0.86, 0.46)),
      target: hallC.clone(),
      dur: 4.8,
      caption: { kicker: 'THE REAL CONSTRAINT', title: 'This building binds on power, not space.',
                 sub: prog ? `${prog.shellPct}% stays shell — ${sf(prog.areas.shell)} SF of quantified expansion optionality`
                           : 'Unfitted shell carries the expansion case' },
    },
    { // 6a/b/c — one slow arc over the pod while the compute platform is swapped
      pos: shot(pod, podR * 1.25, V(0.62, 0.52, 0.58)),
      target: pod.clone(),
      dur: 2.3,
      capDur: 6.0,
      action: () => hooks.setPlatform?.('h100'),
      caption: { kicker: 'TWELVE COMPUTE PLATFORMS', title: 'Change the chip. The building re-plans itself.',
                 sub: 'Racks, cooling, electrical, yard plant and capacity — all re-derived' },
    },
    {
      pos: shot(pod, podR * 1.25, V(0.05, 0.60, 0.80)),
      target: pod.clone(),
      dur: 2.0,
      action: () => hooks.setPlatform?.('kyber'),
      caption: null,
    },
    {
      pos: shot(pod, podR * 1.25, V(-0.55, 0.54, 0.64)),
      target: pod.clone(),
      dur: 2.0,
      action: () => hooks.setPlatform?.('gb200'),
      caption: null,
    },
    { // 7 — hero: the whole property, building + yard plant, as one machine
      pos: shot(siteC, siteR * 0.74, V(0.54, 0.60, 0.59)),
      target: siteC.clone(),
      dur: 5.4,
      caption: { kicker: 'DATA CENTER BUILDOUT — 3D OPERATIONS STUDIO', title: 'Any site. Any platform. Answered in minutes.',
                 sub: 'Site-specific buildouts · chip-level capacity · investor-grade analysis' },
    },
  ];
}


/* ================= Recorder ================= */
// Composites the WebGL canvas + cinematic titles onto a 2D canvas and records
// it with MediaRecorder. Produces a downloadable .webm.
export class TourRecorder {
  constructor(glCanvas, { width = 1920, height = 1080, fps = 60, bitrate = 22_000_000, stream: useStream = true } = {}) {
    this.glCanvas = glCanvas;
    this.w = width; this.h = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.caption = null;        // {kicker,title,sub}
    this.captionAge = 0;
    this.captionDur = 4;
    this.elapsed = 0;
    // deterministic capture pulls frames off this.canvas itself; a MediaRecorder
    // would time them by wall clock and stretch the cut whenever a frame is slow
    if (!useStream) { this.recorder = null; this.chunks = []; this.done = Promise.resolve(null); return; }
    const stream = this.canvas.captureStream(fps);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    this.chunks = [];
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.done = new Promise(res => { this.recorder.onstop = () => res(new Blob(this.chunks, { type: 'video/webm' })); });
  }

  start() { this.recorder?.start(); }

  setCaption(cap, dur) { this.caption = cap; this.captionAge = 0; this.captionDur = dur ?? 4; }

  // call once per rendered frame
  compose(dt) {
    this.elapsed += dt;
    this.captionAge += dt;
    const { ctx, w, h } = { ctx: this.ctx, w: this.w, h: this.h };
    ctx.drawImage(this.glCanvas, 0, 0, w, h);

    // cinematic letterbox
    const bar = Math.round(h * 0.055);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);

    // subtle vignette
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.42, w / 2, h / 2, h * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // watermark
    ctx.font = `600 ${Math.round(h * 0.016)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = 'rgba(159,201,232,0.55)';
    ctx.textAlign = 'right';
    ctx.fillText('DATA CENTER BUILDOUT — 3D OPERATIONS STUDIO', w - bar, h - bar - Math.round(h * 0.018));

    // caption lower-third with fade in/out
    if (this.caption) {
      const fadeIn = Math.min(1, this.captionAge / 0.6);
      const fadeOut = Math.min(1, Math.max(0, (this.captionDur - this.captionAge + 0.8) / 0.6));
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      if (alpha > 0) {
        const x = Math.round(w * 0.055), baseY = h - bar - Math.round(h * 0.10);
        ctx.textAlign = 'left';
        ctx.globalAlpha = alpha;
        // kicker
        ctx.font = `700 ${Math.round(h * 0.020)}px ui-monospace, Menlo, monospace`;
        ctx.fillStyle = '#39c2ff';
        ctx.fillText(this.caption.kicker ?? '', x, baseY - Math.round(h * 0.055));
        // accent rule
        ctx.fillRect(x, baseY - Math.round(h * 0.046), Math.round(w * 0.032), 3);
        // title
        ctx.font = `800 ${Math.round(h * 0.046)}px -apple-system, "Segoe UI", Inter, sans-serif`;
        ctx.fillStyle = '#f2f7fc';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 14;
        ctx.fillText(this.caption.title ?? '', x, baseY);
        ctx.shadowBlur = 0;
        // sub
        if (this.caption.sub) {
          ctx.font = `400 ${Math.round(h * 0.022)}px -apple-system, "Segoe UI", Inter, sans-serif`;
          ctx.fillStyle = 'rgba(220,230,242,0.85)';
          ctx.fillText(this.caption.sub, x, baseY + Math.round(h * 0.038));
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  async stop(filename = 'dc-buildout-tour.webm') {
    this.recorder.stop();
    const blob = await this.done;
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement('a');
    aEl.href = url;
    aEl.download = filename;
    document.body.appendChild(aEl);
    aEl.click();
    aEl.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return blob;
  }
}
