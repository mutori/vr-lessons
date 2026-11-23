// Lesson kit: the parts every A-Level physics VR game shares.
// Renderer, player rig, hands-first input (../shared/xr-input.js), sound, text boards,
// poke buttons, sliders, multiple-choice questions, arrows, desktop controls and the main loop.
// One lesson per page, so everything here is a module-level singleton.
import * as THREE from 'three';
import { VRButton } from './vendor/VRButton.js';
import { createXRInput } from '../shared/xr-input.js';
import { createDebugHud } from '../shared/debug-hud.js';

export { THREE };

// ---------------------------------------------------------------- renderer / scene / rig
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));
document.getElementById('loading')?.remove();

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 200);
camera.position.set(0, 1.6, 0);
export const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- small helpers
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
export const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
export function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
export function noHit(o) { o.traverse((c) => { c.userData.noHit = true; c.raycast = () => {}; }); return o; }
export const clamp = THREE.MathUtils.clamp;
export const rnd = (a, b) => a + Math.random() * (b - a);
export function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function sig(x, n = 3) {           // x to n significant figures, as text
  if (x === 0 || !isFinite(x)) return String(x);
  const p = Math.floor(Math.log10(Math.abs(x)));
  const v = Number(x.toPrecision(n));
  if (p >= -3 && p < 5) return String(v);
  const m = v / Math.pow(10, p);
  return `${Number(m.toFixed(n - 1))} × 10${sup(p)}`;
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sup(n) { return String(n).split('').map((c) => SUP[c] ?? c).join(''); }

export let time = 0;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const tweens = [];
export function tween(dur, fn, easing = ease) {
  return new Promise((resolve) => tweens.push({ t: 0, dur: Math.max(dur, 0.0001), fn, resolve, easing }));
}
export const wait = (s) => tween(s, () => {});
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.easing(k));
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
}

// ---------------------------------------------------------------- sound (Web Audio, no files)
let audio = null;
export function ac() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; } }
  if (audio && audio.state === 'suspended') audio.resume();
  return audio;
}
export function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), gn = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gn.gain.setValueAtTime(vol, t0);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, vol = 0.4) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = a.createBufferSource(); src.buffer = buf;
  const gn = a.createGain(); gn.gain.value = vol;
  src.connect(gn).connect(a.destination); src.start();
}
export const sfx = {
  click: () => tone(1200, 0.05, 'square', 0.04),
  tick: () => tone(2000, 0.02, 'square', 0.02),
  good: () => { tone(660, 0.12, 'sine', 0.15); tone(990, 0.22, 'sine', 0.15, null, 0.1); },
  great: () => { tone(523, 0.12, 'sine', 0.14); tone(659, 0.12, 'sine', 0.14, null, 0.1); tone(784, 0.12, 'sine', 0.14, null, 0.2); tone(1047, 0.3, 'sine', 0.14, null, 0.3); },
  bad: () => tone(160, 0.28, 'square', 0.08),
  launch: () => { noise(0.8, 0.25); tone(120, 0.8, 'sawtooth', 0.05, 400); },
  boom: () => { noise(0.6, 0.6); tone(90, 0.5, 'sine', 0.2, 40); },
  zap: () => tone(1800, 0.12, 'sawtooth', 0.04, 600),
  whoosh: () => tone(300, 0.25, 'sawtooth', 0.03, 120),
  blip: () => tone(880, 0.07, 'sine', 0.08),
};

// ---------------------------------------------------------------- canvases and text
export function canvasPlane(w, h, res = 1000) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * res); c.height = Math.round(h * res);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return { mesh: m, c, ctx, tex, res, update() { tex.needsUpdate = true; } };
}
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function wrapText(ctx, text, x, y, maxW, lh, draw = true) {
  for (const para of String(text).split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { if (draw) ctx.fillText(line, x, y); y += lh; line = word; } else line = t;
    }
    if (draw) ctx.fillText(line, x, y);
    y += lh;
  }
  return y;
}

// A board: a canvas panel with a frame. draw(items) renders a list of text items:
//   'plain text' | { t: text, size, color, bold, gap, center } | { rule: true } | { fn(ctx, x, y, w) => newY }
export function board(w, h, { res = 1000, bg = 'rgba(12,22,38,0.94)', frame = 0x3a5a80 } = {}) {
  const g = new THREE.Group();
  const p = canvasPlane(w, h, res);
  const back = mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.02), mat(frame), 0, 0, -0.012);
  g.add(back, p.mesh);
  noHit(g);
  const pad = 40;
  let lastKey = null;
  g.userData.draw = (items, { title = null, accent = '#ffd34d' } = {}) => {
    // skip the redraw (and the texture upload) when nothing on the board has changed
    const key = JSON.stringify([title, accent, items]);
    if (key === lastKey && !items.some((it) => it && it.fn)) return;
    lastKey = key;
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = bg; roundRect(ctx, 0, 0, c.width, c.height, 24); ctx.fill();
    let y = pad + 10;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    if (title) {
      ctx.fillStyle = accent; ctx.font = 'bold 50px system-ui, sans-serif';
      y = wrapText(ctx, title, pad, y, c.width - pad * 2, 58) + 8;
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(pad, y, c.width - pad * 2, 3); y += 20;
    }
    for (let it of items) {
      if (it == null || it === false) continue;
      if (typeof it === 'string') it = { t: it };
      if (it.rule) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(pad, y + 4, c.width - pad * 2, 3); y += 22; continue; }
      if (it.fn) { y = it.fn(ctx, pad, y, c.width - pad * 2) ?? y; continue; }
      const size = it.size || 36;
      ctx.font = `${it.bold ? 'bold ' : ''}${size}px system-ui, sans-serif`;
      ctx.fillStyle = it.color || '#eef3f8';
      ctx.textAlign = it.center ? 'center' : 'left';
      y = wrapText(ctx, it.t, it.center ? c.width / 2 : pad, y, c.width - pad * 2, size * 1.25) + (it.gap ?? 8);
      ctx.textAlign = 'left';
    }
    p.update();
    return y;
  };
  g.userData.canvas = p;
  return g;
}

// A label that always faces the viewer.
export function textSprite(text, { size = 0.05, color = '#ffffff', bg = 'rgba(10,20,35,0.8)', font = 'bold 44px system-ui, sans-serif' } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 990; s.userData.noHit = true; s.raycast = () => {};
  let last = null;
  s.userData.set = (t, col = color) => {
    if (last === t + '|' + col) return;
    last = t + '|' + col;
    ctx.font = font;
    const lines = String(t).split('\n');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 36;
    const lh = parseInt(font.match(/(\d+)px/)[1], 10) * 1.2;
    const cw = Math.ceil(w), ch = Math.ceil(lh * lines.length + 18);
    if (cw !== c.width || ch !== c.height) { c.width = cw; c.height = ch; tex.dispose(); }   // new size needs new GPU storage
    else ctx.clearRect(0, 0, cw, ch);
    ctx.font = font;
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, 0, 0, c.width, c.height, 14); ctx.fill(); }
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, 9 + lh * (i + 0.5)));
    tex.needsUpdate = true;
    s.scale.set(size * c.width / lh, size * c.height / lh, 1);
  };
  s.userData.set(text);
  return s;
}

// ---------------------------------------------------------------- arrows (forces, velocities, fields)
const Yv = new THREE.Vector3(0, 1, 0);
export function arrow(color, { radius = 0.008, head = 0.035 } = {}) {
  const g = new THREE.Group();
  const m = basic(color);
  const shaft = mesh(new THREE.CylinderGeometry(radius, radius, 1, 10).translate(0, 0.5, 0), m);
  const cone = mesh(new THREE.ConeGeometry(radius * 2.6, head, 14).translate(0, -head / 2, 0), m);
  g.add(shaft, cone);
  noHit(g);
  g.userData.set = (from, vec) => {       // world-space start and vector, in the arrow's parent's space
    const len = vec.length();
    g.visible = len > 1e-4;
    if (!g.visible) return;
    g.position.copy(from);
    g.quaternion.setFromUnitVectors(Yv, _av.copy(vec).divideScalar(len));
    const sh = Math.max(0.0001, len - head);
    shaft.scale.set(1, sh, 1);
    cone.position.y = len;
    cone.scale.setScalar(len < head ? len / head : 1);
  };
  g.userData.material = m;
  return g;
}
const _av = new THREE.Vector3();

// ---------------------------------------------------------------- interaction registry
export const interactables = [];
const _rayCaster = new THREE.Raycaster();
function shown(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function findInteractive(o) { while (o) { if (o.userData.interactive) return o; o = o.parent; } return null; }
function enabledOf(root) { const i = root.userData.interactive; return !i.enabled || i.enabled(); }

// action(pointer|null) is called on poke / pinch / ray-select / click.
// Objects with userData.drag ({ begin, point(worldPoint), ray(ray), end }) are dragged instead.
export function makeInteractive(obj, { name, action = null, near = true, enabled = null, priority = 0 }) {
  obj.userData.interactive = { name, action, enabled };
  interactables.push(obj);
  const en = () => shown(obj) && (!enabled || enabled());
  if (obj.userData.isButton) input.addPokable(obj, { onPress: (p) => activate(obj, p), enabled: en });
  else if (obj.userData.drag) {
    input.addNearTarget(obj, {
      enabled: en, priority,
      onPinch: () => { ac(); obj.userData.drag.begin?.(); },
      onDrag: (p) => obj.userData.drag.point(p.pinchPoint),
      onRelease: () => obj.userData.drag.end?.(),
    });
  } else if (near) input.addNearTarget(obj, { onPinch: (p) => activate(obj, p), enabled: en, priority });
  return obj;
}
export function activate(root, p) {
  const info = root.userData.interactive;
  ac();
  if (!enabledOf(root)) return;
  if (info.action) { if (!root.userData.isButton) sfx.click(); info.action(p); }
}
export function hitTest(ray) {
  _rayCaster.set(ray.origin, ray.direction);
  _rayCaster.far = 20;
  const list = interactables.filter((o) => shown(o) && enabledOf(o));
  const hits = _rayCaster.intersectObjects(list, true);
  for (const h of hits) {
    if (h.object.userData.noHit) continue;
    const root = findInteractive(h.object);
    if (root) return { root, point: h.point, distance: h.distance };
  }
  return null;
}

// ---------------------------------------------------------------- input
const rayDrags = new Map();     // pointer -> dragged root
const kindListeners = [];
export function onKindChange(fn) { kindListeners.push(fn); }
export const input = createXRInput({
  renderer, scene, camera, parent: rig,
  pickRay: (ray) => hitTest(ray),
  onRaySelect: (p, hit) => {
    const d = hit.root.userData.drag;
    if (d) { ac(); rayDrags.set(p, hit.root); d.begin?.(); d.ray(p.worldRay); } else { if (hit.root.userData.isButton) sfx.click(); activate(hit.root, p); }
  },
  onRayRelease: (p) => { const r = rayDrags.get(p); if (r) { rayDrags.delete(p); r.userData.drag.end?.(); } },
  sound: (n) => { ac(); if (n === 'click') sfx.click(); },
  onKindChange: (k) => kindListeners.forEach((f) => f(k)),
  rayLength: () => 4,
});
const hud = createDebugHud({ renderer, camera, input });
// Plain words for the input in use: "pinch", "pull the trigger", "click".
export function words() { return input.words(); }

// ---------------------------------------------------------------- poke buttons
export function button(text, w, h, { bg = '#1f6fb2', fg = '#ffffff', size = 30 } = {}) {
  const g = new THREE.Group();
  const face = new THREE.Group();
  const back = mesh(new THREE.BoxGeometry(w, h, 0.02), mat(0x1b2b3c), 0, 0, -0.011);
  const p = canvasPlane(w, h, 1400);
  face.add(back, p.mesh);
  g.add(face);
  g.userData.face = face; g.userData.size = { w, h }; g.userData.isButton = true;
  let cur = { text, color: bg };
  g.userData.draw = (t = cur.text, color = cur.color, textColor = fg) => {
    cur = { text: t, color };
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    roundRect(ctx, 4, 4, c.width - 8, c.height - 8, 28);
    ctx.fill();
    ctx.fillStyle = textColor;
    let fs = size * 2.8;
    ctx.font = `bold ${fs}px system-ui, sans-serif`;
    const lines = [];
    const fit = () => {
      lines.length = 0;
      for (const para of String(t).split('\n')) {
        let line = '';
        for (const word of para.split(' ')) {
          const tt = line ? line + ' ' + word : word;
          if (ctx.measureText(tt).width > c.width - 40 && line) { lines.push(line); line = word; } else line = tt;
        }
        lines.push(line);
      }
    };
    fit();
    const tooWide = () => lines.some((l) => ctx.measureText(l).width > c.width - 30);
    while ((lines.length * fs * 1.12 > c.height - 16 || tooWide()) && fs > 20) { fs *= 0.9; ctx.font = `bold ${fs}px system-ui, sans-serif`; fit(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lh = fs * 1.12;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 2));
    p.update();
  };
  g.userData.draw(text);
  return g;
}
// A button that does something. Returns the button; b.userData.setOn(bool) greys it out.
export function actionButton(text, w, h, action, opts = {}) {
  const b = button(text, w, h, opts);
  let on = true;
  b.userData.setOn = (v) => { on = v; b.userData.draw(undefined, v ? (opts.bg || '#1f6fb2') : '#4a5663', v ? '#ffffff' : '#a9b4bf'); };
  b.userData.isOn = () => on;
  makeInteractive(b, { name: opts.name || text.replace(/\n/g, ' '), action: (p) => { if (on) action(p); }, enabled: () => on });
  return b;
}

// ---------------------------------------------------------------- sliders
// A knob on a track: pinch and drag it (near), point and drag it (far), click-drag on a computer,
// or press − / + for fine steps. Value changes call onChange(value).
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _s4 = new THREE.Vector3();
export function closestOnLineToRay(o, d, ray, out) {    // line o + t d (d unit); returns t
  const w0 = _s4.subVectors(o, ray.origin);
  const b = d.dot(ray.direction), dd = d.dot(w0), e = ray.direction.dot(w0);
  const den = 1 - b * b;
  const t = den < 1e-6 ? -dd : (b * e - dd) / den;
  if (out) out.copy(o).addScaledVector(d, t);
  return t;
}
export function slider({ length = 0.34, min = 0, max = 1, step = 0.01, fine = step, value = min, name = 'Slider',
  format = (v) => v.toFixed(2), onChange = () => {}, color = 0xffc93c, enabled = null, labelW = 0.3 }) {
  const g = new THREE.Group();
  const track = mesh(new THREE.BoxGeometry(length, 0.012, 0.012), mat(0x8ea3b8));
  const fill = mesh(new THREE.BoxGeometry(1, 0.014, 0.014).translate(0.5, 0, 0), basic(color));
  fill.position.x = -length / 2;
  const knob = new THREE.Group();
  const knobM = mesh(new THREE.SphereGeometry(0.022, 20, 14), mat(color, { emissive: color, emissiveIntensity: 0.25 }));
  knob.add(knobM, mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), mat(0xffffff), 0, 0, 0));
  g.add(track, fill, knob);
  noHit(track); noHit(fill);
  const lab = canvasPlane(labelW, 0.055, 1400);
  lab.mesh.position.set(0, 0.05, 0);
  noHit(lab.mesh);
  g.add(lab.mesh);
  const s = { group: g, value, min, max, dragging: false };
  const on = () => !enabled || enabled();
  function drawLabel() {
    const { ctx, c } = lab;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = on() ? 'rgba(10,22,38,0.92)' : 'rgba(40,46,54,0.9)';
    roundRect(ctx, 0, 0, c.width, c.height, 22); ctx.fill();
    ctx.fillStyle = on() ? '#ffffff' : '#9aa5b0'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(name, 22, c.height / 2 + 2);
    ctx.textAlign = 'right'; ctx.fillStyle = on() ? '#ffd34d' : '#9aa5b0';
    ctx.font = 'bold 46px system-ui, sans-serif';
    ctx.fillText(format(s.value), c.width - 22, c.height / 2 + 2);
    lab.update();
  }
  function place() {
    const k = (s.value - min) / (max - min);
    knob.position.x = -length / 2 + k * length;
    fill.scale.x = Math.max(0.0001, k * length);
    drawLabel();
  }
  s.set = (v, silent = false) => {
    v = clamp(Math.round((v - min) / fine) * fine + min, min, max);
    v = Number(v.toFixed(10));
    const changed = v !== s.value;
    s.value = v; place();
    if (changed && !silent) { sfx.tick(); onChange(v); }
  };
  s.refresh = place;
  const snapToStep = (v) => Math.round((v - min) / step) * step + min;
  knob.userData.drag = {
    begin: () => { s.dragging = true; },
    point: (wp) => { if (!on()) return; const l = g.worldToLocal(_s1.copy(wp)); s.set(snapToStep(min + (l.x / length + 0.5) * (max - min))); },
    ray: (ray) => {
      if (!on()) return;
      g.updateWorldMatrix(true, false);
      const o = g.localToWorld(_s2.set(-length / 2, 0, 0));
      const d = _s3.set(1, 0, 0).transformDirection(g.matrixWorld);
      const t = closestOnLineToRay(o, d, ray);
      const ws = g.matrixWorld.getMaxScaleOnAxis();
      s.set(snapToStep(min + clamp(t / (length * ws), 0, 1) * (max - min)));
    },
    end: () => { s.dragging = false; },
  };
  makeInteractive(knob, { name, enabled: on, priority: 2 });
  // the track can also be pointed at directly
  const hitTrack = mesh(new THREE.BoxGeometry(length + 0.04, 0.05, 0.03), new THREE.MeshBasicMaterial({ visible: false }));
  hitTrack.userData.drag = knob.userData.drag;
  g.add(hitTrack);
  makeInteractive(hitTrack, { name, enabled: on, near: false });
  const bw = 0.06;
  const minus = actionButton('−', bw, 0.05, () => s.set(s.value - fine), { name: `${name}: down`, size: 40 });
  const plus = actionButton('+', bw, 0.05, () => s.set(s.value + fine), { name: `${name}: up`, size: 40 });
  minus.position.set(-length / 2 - 0.06, 0, 0.0);
  plus.position.set(length / 2 + 0.06, 0, 0.0);
  g.add(minus, plus);
  s.setEnabled = () => { minus.userData.setOn(on()); plus.userData.setOn(on()); place(); };
  place();
  return s;
}

// ---------------------------------------------------------------- toast (big feedback banner)
export function toaster(parent, w = 0.9, h = 0.12) {
  const p = canvasPlane(w, h, 1100);
  noHit(p.mesh);
  p.mesh.visible = false;
  p.mesh.renderOrder = 980;
  parent.add(p.mesh);
  let token = 0;
  const colors = { good: '#1e8449', bad: '#b03a2e', info: '#1f4e79', warn: '#b9770e' };
  const show = async (text, kind = 'info', secs = 3.5) => {
    const my = ++token;
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = colors[kind] || kind; roundRect(ctx, 0, 0, c.width, c.height, 26); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 46px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = []; let line = '';
    for (const word of String(text).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > c.width - 50 && line) { lines.push(line); line = word; } else line = t; }
    lines.push(line);
    if (lines.length > 2) ctx.font = 'bold 36px system-ui, sans-serif';
    const lh = lines.length > 2 ? 40 : 52;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 2));
    p.update();
    p.mesh.visible = true;
    p.mesh.scale.setScalar(0.85);
    tween(0.18, (k) => p.mesh.scale.setScalar(0.85 + 0.15 * k));
    if (secs > 0) { await wait(secs); if (my === token) p.mesh.visible = false; }
  };
  show.hide = () => { token++; p.mesh.visible = false; };
  show.mesh = p.mesh;
  return show;
}

// ---------------------------------------------------------------- multiple-choice questions
// ask() shows a question on a board and answer buttons on a group. Resolves with true when the first
// answer chosen was right. A wrong answer shows why and lets the learner try again.
export function quiz({ textBoard, answerGroup, layout = 'grid', w = 0.36, h = 0.085, gapX = 0.4, gapY = 0.1, toast = null }) {
  const pool = [];
  for (let i = 0; i < 4; i++) {
    const b = button('', w, h, { size: 26 });
    b.visible = false;
    answerGroup.add(b);
    const entry = { b, cb: null };
    makeInteractive(b, { name: `Answer ${'ABCD'[i]}`, action: () => entry.cb && entry.cb() });
    pool.push(entry);
  }
  function placeButtons(n) {
    pool.forEach((e, i) => {
      if (layout === 'grid') {
        const col = i % 2, row = Math.floor(i / 2);
        e.b.position.set((col - 0.5) * gapX, ((Math.ceil(n / 2) - 1) / 2 - row) * gapY, 0);
      } else e.b.position.set(0, ((n - 1) / 2 - i) * gapY, 0);
    });
  }
  return {
    active: false,
    buttons: pool.map((e) => e.b),
    asked: 0,
    ask({ title = 'Question', q, options, correct, explain = '', why = [], extra = [] }) {
      this.active = true;
      this.asked++;
      return new Promise((resolve) => {
        let tries = 0;
        let done = false;
        const letters = 'ABCD';
        const render = (msg = null, msgColor = '#ffd34d') => textBoard.userData.draw([
          { t: q, size: 38, gap: 18 },
          ...extra,
          ...options.map((o, i) => ({ t: `${letters[i]}.  ${o}`, size: 34, color: '#cfe3ff' })),
          msg && { rule: true },
          msg && { t: msg, size: 34, color: msgColor },
        ], { title });
        render(`Choose an answer below (${words().select} a button).`, '#9fb6cc');
        placeButtons(options.length);
        pool.forEach((e, i) => {
          e.b.visible = i < options.length;
          if (!e.b.visible) { e.cb = null; return; }
          e.b.userData.draw(`${letters[i]}`, '#1f6fb2');
          e.cb = async () => {
            if (done) return;
            tries++;
            if (i === correct) {
              done = true;
              sfx.good();
              e.b.userData.draw(`${letters[i]}  ✓`, '#1e8449');
              render(`Correct. ${explain}`, '#8ef0a8');
              toast?.(tries === 1 ? 'Correct!' : 'Correct on a second try', 'good', 2.5);
              await wait(2.6);
              pool.forEach((p) => { p.b.visible = false; p.cb = null; });
              this.active = false;
              resolve(tries === 1);
            } else {
              sfx.bad();
              e.b.userData.draw(`${letters[i]}  ✗`, '#b03a2e');
              render(`Not quite. ${why[i] || 'Look at the working again and try another answer.'}`, '#ffb3a3');
            }
          };
        });
      });
    },
    cancel() { pool.forEach((p) => { p.b.visible = false; p.cb = null; }); this.active = false; },
  };
}

// ---------------------------------------------------------------- hover label
const hoverSprite = textSprite('', { size: 0.028 });
hoverSprite.visible = false;
scene.add(hoverSprite);
let hoverName = '';
function showHover(root, point) {
  if (!root) { hoverSprite.visible = false; hoverName = ''; return; }
  const name = root.userData.interactive.name;
  if (!name) { hoverSprite.visible = false; return; }
  if (name !== hoverName) { hoverName = name; hoverSprite.userData.set(name); }
  hoverSprite.visible = true;
  hoverSprite.position.copy(point).add(_hv.set(0, 0.05, 0));
}
const _hv = new THREE.Vector3();

// ---------------------------------------------------------------- placing the player
const fadeSphere = mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
fadeSphere.renderOrder = 1002; fadeSphere.visible = false; noHit(fadeSphere);
camera.add(fadeSphere);
export async function fade(fn) {
  if (!renderer.xr.isPresenting) { fn(); return; }
  fadeSphere.visible = true;
  await tween(0.1, (k) => (fadeSphere.material.opacity = k), (k) => k);
  fn();
  await tween(0.1, (k) => (fadeSphere.material.opacity = 1 - k), (k) => k);
  fadeSphere.visible = false;
}
export const view = { desktopPos: new THREE.Vector3(0, 0, 0.35), desktopPitch: -0.28 };
export function home() {
  if (renderer.xr.isPresenting) input.placeRig(rig, 0, 0, 0);
  else { rig.position.copy(view.desktopPos); rig.rotation.set(0, 0, 0); camera.rotation.set(view.desktopPitch, 0, 0); camera.position.set(0, 1.6, 0); }
}
input.onRecenter((head) => { input.setLiftFromHead(head); home(); });

// ---------------------------------------------------------------- desktop controls
const mouse = new THREE.Vector2();
let drag = null, mouseDrag = null;
const el = renderer.domElement;
const _mray = new THREE.Ray();
function mouseRay() {
  _rayCaster.setFromCamera(mouse, camera);
  _mray.copy(_rayCaster.ray);
  return _mray;
}
el.addEventListener('pointerdown', (e) => {
  ac();
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  el.setPointerCapture(e.pointerId);
  const h = hitTest(mouseRay());
  if (h && h.root.userData.drag) { mouseDrag = h.root; h.root.userData.drag.begin?.(); h.root.userData.drag.ray(mouseRay()); return; }
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
el.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (mouseDrag) { mouseDrag.userData.drag.ray(mouseRay()); return; }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved > 6) {
      rig.rotation.y -= dx * 0.004;
      camera.rotation.x = clamp(camera.rotation.x - dy * 0.004, -1.3, 1.2);
    }
  }
});
el.addEventListener('pointerup', () => {
  if (mouseDrag) { mouseDrag.userData.drag.end?.(); mouseDrag = null; return; }
  if (drag && drag.moved <= 6) { const h = hitTest(mouseRay()); if (h) { if (h.root.userData.isButton) sfx.click(); activate(h.root, null); } }
  drag = null;
});
el.addEventListener('wheel', (e) => {
  camera.fov = clamp(camera.fov + Math.sign(e.deltaY) * 4, 35, 85);
  camera.updateProjectionMatrix();
}, { passive: true });
function updateDesktop() {
  const h = mouseDrag ? null : hitTest(mouseRay());
  showHover(h?.root, h?.point);
  el.style.cursor = mouseDrag ? 'grabbing' : h ? (h.root.userData.drag ? 'grab' : 'pointer') : drag ? 'grabbing' : 'default';
}
function updateXRHover() {
  let root = null, point = null;
  for (const p of input.pointers) {
    if (p.hover) { root = p.hover.root; point = p.hover.point; break; }
    if (p.focus && p.focus.userData.interactive) { root = p.focus; point = p.focus.getWorldPosition(_hv2); break; }
  }
  showHover(root, point);
}
const _hv2 = new THREE.Vector3();

// right thumbstick: snap turn (the lessons are stand-still, so there is no walking)
let snapReady = true;
function updateThumbsticks() {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    const gp = src.gamepad; if (!gp || gp.axes.length < 4 || src.handedness !== 'right') continue;
    const x = gp.axes[2];
    if (Math.abs(x) > 0.7 && snapReady) {
      const a = x > 0 ? -Math.PI / 6 : Math.PI / 6;
      const head = new THREE.Vector3(); camera.getWorldPosition(head);
      rig.position.sub(head).applyAxisAngle(Yv, a).add(head); rig.position.y = input.lift;
      rig.rotation.y += a; snapReady = false;
    }
    if (Math.abs(x) < 0.3) snapReady = true;
  }
}

document.getElementById('helpToggle')?.addEventListener('click', (e) => {
  const h = document.getElementById('help');
  h.classList.toggle('min');
  e.target.textContent = h.classList.contains('min') ? 'Show help' : 'Hide help';
});
renderer.xr.addEventListener('sessionstart', () => { document.getElementById('help')?.classList.add('min'); camera.rotation.set(0, 0, 0); });
renderer.xr.addEventListener('sessionend', () => { rig.position.y = 0; home(); });

// ---------------------------------------------------------------- main loop
const frameFns = [];
export function onFrame(fn) { frameFns.push(fn); }
const clock = new THREE.Clock();
export function start() {
  home();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05) * (window.lesson?.speed || 1);
    time += dt;
    updateTweens(dt);
    input.update();
    for (const [p, root] of rayDrags) { if (p.rayOk) root.userData.drag.ray(p.worldRay); }
    if (renderer.xr.isPresenting) { updateThumbsticks(); updateXRHover(); } else updateDesktop();
    for (const fn of frameFns) fn(dt, time);
    renderer.render(scene, camera);
    hud.update();
  });
}
