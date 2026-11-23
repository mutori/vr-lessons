// Lesson kit: the parts every A-Level physics VR game shares.
// Renderer, lighting environment, player rig, hands-first input (../shared/xr-input.js), sound, haptics,
// text boards, 3D push buttons, sliders, twist dials, levers, flip switches, grabbable objects,
// particle effects, a "do this next" beacon, multiple-choice questions, desktop controls and the main loop.
// One lesson per page, so everything here is a module-level singleton.
//
// Design rules applied here (see README): bold text on solid panels; every interactive state is shown
// (hover glow, press sink, grab halo) with a sound and a haptic pulse; glow is faked with additive sprites
// and particles (no full-screen post effects); one colour language across lessons.
import * as THREE from 'three';
import { VRButton } from './vendor/VRButton.js';
import { createXRInput } from '../shared/xr-input.js';
import { createDebugHud } from '../shared/debug-hud.js';

export { THREE };
const V3 = THREE.Vector3;

// ---------------------------------------------------------------- renderer / scene / rig
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;      // per-material, no extra pass
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(0.5);
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] }));
document.getElementById('loading')?.remove();

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 300);
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
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o });
export const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...o });
export const glowMat = (color, o = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...o });
export function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
export function noHit(o) { o.traverse((c) => { c.userData.noHit = true; c.raycast = () => {}; }); return o; }
export const clamp = THREE.MathUtils.clamp;
export const lerp = THREE.MathUtils.lerp;
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
export const hex = (c) => '#' + new THREE.Color(c).getHexString();

export let time = 0;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const easeBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
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

// ---------------------------------------------------------------- lighting environment
// Reflections come from a small generated "room" (gradient sky plus bright panels), baked once by PMREM.
// Cheap at run time, and it is what makes metal, glass and plastic look real.
const pmrem = new THREE.PMREMGenerator(renderer);
export function setEnvironment({ top = 0x8fb4e8, horizon = 0x3a4656, bottom = 0x15181d, panels = [], intensity = 1 } = {}) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(horizon) }, bot: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bot, pow(-h, 0.5)); gl_FragColor = vec4(c, 1.0); }',
  }));
  env.add(sky);
  for (const p of panels) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w || 2, p.h || 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color ?? 0xffffff).multiplyScalar(p.intensity ?? 4), side: THREE.DoubleSide }));
    m.position.set(...p.pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const rt = pmrem.fromScene(env, 0.02);
  scene.environment = rt.texture;
  scene.environmentIntensity = intensity;
  return rt.texture;
}

// ---------------------------------------------------------------- textures made in code
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}
// A soft additive glow (fakes bloom around bright things).
export function glowSprite(color, size = 0.1, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(size);
  s.userData.noHit = true; s.raycast = () => {};
  return s;
}
let _blobTex = null;
// A soft contact shadow under an object (cheaper than real shadows, and it grounds things).
export function blobShadow(w, d, opacity = 0.45) {
  if (!_blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    _blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2;
  return noHit(m);
}

// ---------------------------------------------------------------- sound (Web Audio, no files)
let audio = null, master = null;
export function ac() {
  if (!audio) {
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      master = audio.createGain(); master.gain.value = 0.9;
      const comp = audio.createDynamicsCompressor();
      master.connect(comp).connect(audio.destination);
    } catch { audio = null; }
  }
  if (audio && audio.state === 'suspended') audio.resume();
  if (audio && pendingAmbience) { const k = pendingAmbience; pendingAmbience = null; startAmbience(k); }
  return audio;
}
export function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator(), gn = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gn.gain.setValueAtTime(0.0001, t0);
  gn.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
let noiseBuf = null;
function noiseBuffer(a) {
  if (noiseBuf) return noiseBuf;
  const len = a.sampleRate * 2;
  noiseBuf = a.createBuffer(1, len, a.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function noise(dur, vol = 0.4, cutoff = 4000, slideTo = null) {
  const a = ac(); if (!a) return;
  const src = a.createBufferSource(); src.buffer = noiseBuffer(a);
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
  const gn = a.createGain();
  gn.gain.setValueAtTime(vol, a.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(f).connect(gn).connect(master); src.start(); src.stop(a.currentTime + dur + 0.05);
}
// A sound that keeps going while something happens (an engine, a hum). set() changes it smoothly.
function loop({ type = 'sawtooth', freq = 100, vol = 0, cutoff = 800, noiseMix = 0 } = {}) {
  const a = ac(); if (!a) return { set() {}, stop() {} };
  const o = a.createOscillator(); o.type = type; o.frequency.value = freq;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
  const g = a.createGain(); g.gain.value = vol;
  o.connect(f);
  let n = null;
  if (noiseMix > 0) { n = a.createBufferSource(); n.buffer = noiseBuffer(a); n.loop = true; const ng = a.createGain(); ng.gain.value = noiseMix; n.connect(ng).connect(f); n.start(); }
  f.connect(g).connect(master); o.start();
  return {
    set({ freq: fr, vol: v, cutoff: c } = {}) {
      const t = a.currentTime;
      if (fr != null) o.frequency.setTargetAtTime(fr, t, 0.05);
      if (v != null) g.gain.setTargetAtTime(v, t, 0.06);
      if (c != null) f.frequency.setTargetAtTime(c, t, 0.05);
    },
    stop() { const t = a.currentTime; g.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => { try { o.stop(); n?.stop(); } catch { /* stopped */ } }, 400); },
  };
}
let pendingAmbience = null, ambienceOn = false;
// A very quiet background bed: space hum or lab air. Starts with the first touch (browsers need a gesture).
export function ambience(kind) { if (audio) startAmbience(kind); else pendingAmbience = kind; }
function startAmbience(kind) {
  if (ambienceOn) return; ambienceOn = true;
  if (kind === 'space') { loop({ type: 'sine', freq: 55, vol: 0.035, cutoff: 300 }); loop({ type: 'sine', freq: 82.6, vol: 0.018, cutoff: 300 }); loop({ type: 'sine', freq: 40, vol: 0.0, cutoff: 200, noiseMix: 0.25 }).set({ vol: 0.02, cutoff: 260 }); }
  else { loop({ type: 'sine', freq: 50, vol: 0.012, cutoff: 200 }); loop({ type: 'sine', freq: 40, vol: 0.0, cutoff: 500, noiseMix: 0.3 }).set({ vol: 0.012, cutoff: 700 }); }
}
export const sfx = {
  click: () => { tone(1500, 0.035, 'square', 0.035); tone(700, 0.05, 'triangle', 0.05); },
  tick: () => tone(2200 + Math.random() * 200, 0.018, 'square', 0.018),
  good: () => { tone(660, 0.14, 'sine', 0.15); tone(990, 0.26, 'sine', 0.13, null, 0.09); tone(1320, 0.3, 'triangle', 0.04, null, 0.09); },
  great: () => { [523, 659, 784, 1047].forEach((f, i) => { tone(f, 0.5, 'sine', 0.12, null, i * 0.09); tone(f * 2, 0.4, 'triangle', 0.03, null, i * 0.09); }); noise(0.6, 0.06, 9000, 2000); },
  bad: () => { tone(190, 0.22, 'square', 0.06, 140); tone(150, 0.3, 'sawtooth', 0.04, 110, 0.05); },
  launch: () => { noise(1.4, 0.3, 900, 200); tone(90, 1.2, 'sawtooth', 0.06, 300); },
  boom: () => { noise(1.1, 0.7, 1200, 80); tone(80, 0.8, 'sine', 0.3, 30); },
  zap: () => { tone(2200, 0.15, 'sawtooth', 0.04, 500); noise(0.12, 0.08, 6000); },
  whoosh: () => noise(0.45, 0.12, 2500, 300),
  blip: () => tone(880, 0.08, 'sine', 0.08, 1100),
  grab: () => tone(420, 0.07, 'triangle', 0.09, 700),
  release: () => tone(640, 0.07, 'triangle', 0.06, 380),
  snap: () => { tone(1800, 0.03, 'square', 0.03); tone(900, 0.06, 'sine', 0.06); },
  pop: () => tone(300, 0.1, 'sine', 0.12, 900),
  beep: (n = 1) => tone(n ? 880 : 1320, 0.12, 'sine', 0.1),
  loop,
};

// ---------------------------------------------------------------- canvases and text
const FONT = 'system-ui, "Segoe UI", Roboto, Inter, sans-serif';
export function canvasPlane(w, h, res = 1000) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * res); c.height = Math.round(h * res);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
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

// A board: a glowing-edged glass panel with a header. draw(items) renders a list of text items:
//   'plain text' | { t: text, size, color, bold, gap, center } | { rule: true } | { fn(ctx, x, y, w) => newY }
export function board(w, h, { res = 1000, bg = null, accent = 0x3fa7ff, light = false, edge = true } = {}) {
  const g = new THREE.Group();
  const p = canvasPlane(w, h, res);
  p.mesh.position.z = 0.004;
  const back = mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.025), mat(light ? 0x8a6d3b : 0x0d1622, { metalness: 0.6, roughness: 0.35 }), 0, 0, -0.012);
  g.add(back, p.mesh);
  if (edge && !light) {
    const e = new THREE.Group();
    const em = basic(accent);
    const t = 0.006;
    e.add(mesh(new THREE.BoxGeometry(w + 0.03, t, t), em, 0, h / 2 + 0.015, 0.001), mesh(new THREE.BoxGeometry(w + 0.03, t, t), em, 0, -h / 2 - 0.015, 0.001));
    e.add(mesh(new THREE.BoxGeometry(t, h + 0.03, t), em, -w / 2 - 0.015, 0, 0.001), mesh(new THREE.BoxGeometry(t, h + 0.03, t), em, w / 2 + 0.015, 0, 0.001));
    g.add(e);
    g.userData.edge = em;
  }
  noHit(g);
  const pad = 44;
  const acc = hex(accent);
  let lastKey = null;
  g.userData.draw = (items, { title = null, accent: titleColor = '#ffd34d' } = {}) => {
    // skip the redraw (and the texture upload) when nothing on the board has changed
    const key = JSON.stringify([title, titleColor, items]);
    if (key === lastKey && !items.some((it) => it && it.fn)) return;
    lastKey = key;
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    if (light) { ctx.fillStyle = bg || 'rgba(246,241,226,1)'; roundRect(ctx, 0, 0, c.width, c.height, 18); ctx.fill(); }
    else {
      const gr = ctx.createLinearGradient(0, 0, 0, c.height);
      gr.addColorStop(0, 'rgba(22,40,64,0.97)'); gr.addColorStop(1, 'rgba(8,16,28,0.97)');
      ctx.fillStyle = bg || gr; roundRect(ctx, 0, 0, c.width, c.height, 22); ctx.fill();
      // faint technical grid
      ctx.strokeStyle = 'rgba(120,170,230,0.05)'; ctx.lineWidth = 2;
      for (let x = 0; x < c.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke(); }
      for (let y = 0; y < c.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke(); }
      ctx.strokeStyle = acc; ctx.globalAlpha = 0.55; ctx.lineWidth = 4; roundRect(ctx, 3, 3, c.width - 6, c.height - 6, 20); ctx.stroke(); ctx.globalAlpha = 1;
    }
    let y = pad;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    if (title) {
      ctx.fillStyle = light ? '#7a2e12' : titleColor; ctx.font = `800 52px ${FONT}`;
      y = wrapText(ctx, title, pad, y, c.width - pad * 2, 60) + 6;
      const lg = ctx.createLinearGradient(pad, 0, c.width - pad, 0);
      lg.addColorStop(0, acc); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg; ctx.fillRect(pad, y, c.width - pad * 2, 4); y += 22;
    }
    for (let it of items) {
      if (it == null || it === false) continue;
      if (typeof it === 'string') it = { t: it };
      if (it.rule) { ctx.fillStyle = light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.16)'; ctx.fillRect(pad, y + 4, c.width - pad * 2, 3); y += 22; continue; }
      if (it.fn) { y = it.fn(ctx, pad, y, c.width - pad * 2) ?? y; continue; }
      const size = it.size || 36;
      ctx.font = `${it.bold ? '800 ' : '600 '}${size}px ${FONT}`;
      ctx.fillStyle = it.color || (light ? '#2b2b2b' : '#eef3f8');
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
export function textSprite(text, { size = 0.05, color = '#ffffff', bg = 'rgba(10,20,35,0.82)', border = 'rgba(120,190,255,0.5)', font = `800 44px ${FONT}` } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, toneMapped: false }));
  s.renderOrder = 990; s.userData.noHit = true; s.raycast = () => {};
  let last = null;
  s.userData.set = (t, col = color) => {
    if (last === t + '|' + col) return;
    last = t + '|' + col;
    ctx.font = font;
    const lines = String(t).split('\n');
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 40;
    const lh = parseInt(font.match(/(\d+)px/)[1], 10) * 1.2;
    const cw = Math.ceil(w), ch = Math.ceil(lh * lines.length + 20);
    if (cw !== c.width || ch !== c.height) { c.width = cw; c.height = ch; tex.dispose(); }   // new size needs new GPU storage
    else ctx.clearRect(0, 0, cw, ch);
    ctx.font = font;
    if (bg) {
      ctx.fillStyle = bg; roundRect(ctx, 2, 2, c.width - 4, c.height - 4, 16); ctx.fill();
      if (border) { ctx.strokeStyle = border; ctx.lineWidth = 3; ctx.stroke(); }
    }
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!bg) { ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8; }
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, 10 + lh * (i + 0.5)));
    ctx.shadowBlur = 0;
    tex.needsUpdate = true;
    s.scale.set(size * c.width / lh, size * c.height / lh, 1);
  };
  s.userData.set(text);
  return s;
}

// ---------------------------------------------------------------- arrows (forces, velocities, fields)
const Yv = new V3(0, 1, 0);
// A solid arrow with a soft glow around its head. set(from, vec) in the parent's space.
export function arrow(color, { radius = 0.008, head = 0.035, glow = true } = {}) {
  const g = new THREE.Group();
  const m = basic(color);
  const shaft = mesh(new THREE.CylinderGeometry(radius, radius, 1, 10).translate(0, 0.5, 0), m);
  const cone = mesh(new THREE.ConeGeometry(radius * 2.6, head, 16).translate(0, -head / 2, 0), m);
  g.add(shaft, cone);
  let halo = null;
  if (glow) { halo = glowSprite(color, head * 2.6, 0.5); cone.add(halo); halo.position.y = -head * 0.5; }
  noHit(g);
  g.userData.set = (from, vec) => {
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
  g.userData.onTop = () => { g.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 900; } }); return g; };
  return g;
}
const _av = new V3();

// ---------------------------------------------------------------- particles (instanced glowing billboards)
// One pool for every effect: sparks, exhaust, confetti, comet tails. Additive, so no sorting is needed.
const FX_N = 2400;
const fx = (() => {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(FX_N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iCol = new THREE.InstancedBufferAttribute(new Float32Array(FX_N * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iSize = new THREE.InstancedBufferAttribute(new Float32Array(FX_N), 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iCol', iCol); geo.setAttribute('iSize', iSize);
  geo.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 iPos; attribute vec4 iCol; attribute float iSize; varying vec4 vC; varying vec2 vUv;
      void main(){ vC = iCol; vUv = uv; vec4 mv = modelViewMatrix * vec4(iPos, 1.0); mv.xy += position.xy * iSize; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a = a * a; gl_FragColor = vec4(vC.rgb * a * vC.a, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Mesh(geo, material);
  pts.frustumCulled = false; pts.renderOrder = 960;
  noHit(pts);
  scene.add(pts);
  const P = [];
  const col = new THREE.Color();
  return {
    // pos: world Vector3. opts: count, color (or colors[]), speed, spread (0..1 cone around dir, or 1 = sphere), dir,
    // life, size, size1 (end size), gravity, drag, vel (base velocity to add)
    emit(pos, o = {}) {
      const n = o.count ?? 20;
      for (let i = 0; i < n; i++) {
        if (P.length >= FX_N) P.shift();
        const d = new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
        if (d.lengthSq() > 1 || d.lengthSq() < 1e-4) { i--; continue; }
        d.normalize();
        if (o.dir) { d.multiplyScalar(o.spread ?? 0.3).add(o.dir).normalize(); }
        const sp = (o.speed ?? 0.5) * rnd(0.4, 1);
        const c = o.colors ? o.colors[Math.floor(Math.random() * o.colors.length)] : (o.color ?? 0xffffff);
        col.set(c);
        P.push({
          p: pos.clone(), v: d.multiplyScalar(sp).add(o.vel || _zero), life: 0, max: (o.life ?? 0.8) * rnd(0.6, 1),
          s0: (o.size ?? 0.02) * rnd(0.7, 1.2), s1: o.size1 ?? 0, g: o.gravity ?? 0, drag: o.drag ?? 1.5,
          r: col.r, gg: col.g, b: col.b, a: o.alpha ?? 1, flicker: o.flicker ?? 0,
        });
      }
    },
    update(dt) {
      let n = 0;
      for (let i = P.length - 1; i >= 0; i--) {
        const q = P[i];
        q.life += dt;
        if (q.life >= q.max) { P.splice(i, 1); continue; }
        q.v.y -= q.g * dt;
        q.v.multiplyScalar(Math.exp(-q.drag * dt));
        q.p.addScaledVector(q.v, dt);
      }
      for (const q of P) {
        const k = q.life / q.max;
        iPos.setXYZ(n, q.p.x, q.p.y, q.p.z);
        const a = q.a * (1 - k) * (q.flicker ? (1 - q.flicker * Math.random()) : 1);
        iCol.setXYZW(n, q.r, q.gg, q.b, a);
        iSize.setX(n, q.s0 + (q.s1 - q.s0) * k);
        n++;
      }
      geo.instanceCount = n;
      iPos.needsUpdate = iCol.needsUpdate = iSize.needsUpdate = true;
    },
    clear() { P.length = 0; },
    get count() { return P.length; },
  };
})();
const _zero = new V3();
export { fx };

// Expanding rings (shock waves, ripples).
const rings = [];
for (let i = 0; i < 8; i++) {
  const r = mesh(new THREE.RingGeometry(0.86, 1, 48), glowMat(0xffffff, { side: THREE.DoubleSide, opacity: 0 }));
  r.visible = false; noHit(r); scene.add(r); rings.push(r);
}
let ringI = 0;
export function shockwave(pos, { color = 0xffffff, size = 0.3, dur = 0.6, normal = null } = {}) {
  const r = rings[ringI++ % rings.length];
  r.visible = true; r.position.copy(pos); r.material.color.set(color);
  if (normal) r.quaternion.setFromUnitVectors(new V3(0, 0, 1), normal); else r.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
  return tween(dur, (k) => { r.scale.setScalar(0.01 + size * k); r.material.opacity = 0.9 * (1 - k); }, easeOut).then(() => { r.visible = false; });
}
// A celebration: confetti, a shock ring, rising stars and a chord.
export function celebrate(pos, { stars = 3 } = {}) {
  sfx.great();
  fx.emit(pos, { count: 90, colors: [0xffd34d, 0x3ddc84, 0x5fd1ff, 0xff6b8b, 0xffffff], speed: 1.4, life: 1.6, size: 0.022, gravity: 1.2, drag: 1.2, flicker: 0.5 });
  shockwave(pos, { color: 0xffd34d, size: 0.5, dur: 0.8 });
  for (let i = 0; i < stars; i++) {
    const s = textSprite('★', { size: 0.09, color: '#ffd34d', bg: null, font: `900 80px ${FONT}` });
    scene.add(s);
    const from = pos.clone().add(new V3((i - (stars - 1) / 2) * 0.12, 0, 0));
    tween(1.5, (k) => { s.position.copy(from).add(new V3(0, 0.25 * easeOut(Math.min(1, k * 1.5)), 0)); s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; s.scale.setScalar(0.09 * (0.6 + 0.6 * easeBack(Math.min(1, k * 2)))); }, (k) => k)
      .then(() => { scene.remove(s); s.material.map.dispose(); s.material.dispose(); });
  }
}

// ---------------------------------------------------------------- interaction registry
export const interactables = [];
const _rayCaster = new THREE.Raycaster();
function shown(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
function findInteractive(o) { while (o) { if (o.userData.interactive) return o; o = o.parent; } return null; }
function enabledOf(root) { const i = root.userData.interactive; return !i.enabled || i.enabled(); }

// action(pointer|null) is called on poke / pinch / ray-select / click.
// Objects with userData.drag ({ begin(p), point(worldPoint, p), ray(ray, p), end(p) }) are dragged instead.
// userData.onHover(bool) is called when a hand, ray or mouse is over the object.
export function makeInteractive(obj, { name, action = null, near = true, enabled = null, priority = 0 }) {
  obj.userData.interactive = { name, action, enabled };
  interactables.push(obj);
  const en = () => shown(obj) && (!enabled || enabled());
  if (obj.userData.isButton) input.addPokable(obj, { onPress: (p) => activate(obj, p), enabled: en });
  else if (obj.userData.drag) {
    input.addNearTarget(obj, {
      enabled: en, priority,
      onPinch: (p) => { ac(); dragging.add(obj); obj.userData.drag.begin?.(p); },
      onDrag: (p) => obj.userData.drag.point(p.pinchPoint, p),
      onRelease: (p) => { dragging.delete(obj); obj.userData.drag.end?.(p); },
    });
  } else if (near) input.addNearTarget(obj, { onPinch: (p) => activate(obj, p), enabled: en, priority });
  return obj;
}
export function activate(root, p) {
  const info = root.userData.interactive;
  ac();
  if (!enabledOf(root)) return;
  if (root.userData.isButton) pressAnim(root);
  if (info.action) { if (!root.userData.isButton) sfx.click(); info.action(p); }
}
function pressAnim(b) {
  const f = b.userData.face;
  if (!f || renderer.xr.isPresenting) return;
  tween(0.16, (k) => { f.position.z = -0.008 * Math.sin(k * Math.PI); }, (k) => k);
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
export function haptic(p, intensity = 0.3, ms = 15) { if (p) input.haptic(p, intensity, ms); }

// ---------------------------------------------------------------- input
const rayDrags = new Map();     // pointer -> dragged root
const dragging = new Set();     // roots being dragged by any means (for the hover glow)
const kindListeners = [];
export function onKindChange(fn) { kindListeners.push(fn); }
export const input = createXRInput({
  renderer, scene, camera, parent: rig,
  pickRay: (ray) => hitTest(ray),
  onRaySelect: (p, hit) => {
    const d = hit.root.userData.drag;
    if (d) { ac(); rayDrags.set(p, hit.root); dragging.add(hit.root); d.begin?.(p, hit.point); d.ray(p.worldRay, p); } else { if (hit.root.userData.isButton) sfx.click(); activate(hit.root, p); }
  },
  onRayRelease: (p) => { const r = rayDrags.get(p); if (r) { rayDrags.delete(p); dragging.delete(r); r.userData.drag.end?.(p); } },
  sound: (n) => { ac(); if (n === 'click') sfx.click(); },
  onKindChange: (k) => kindListeners.forEach((f) => f(k)),
  rayLength: () => 4,
});
const hud = createDebugHud({ renderer, camera, input });
// Plain words for the input in use: "pinch", "pull the trigger", "click".
export function words() { return input.words(); }

// ---------------------------------------------------------------- 3D push buttons
const capCache = new Map();
function capGeometry(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d}`;
  if (capCache.has(key)) return capCache.get(key);
  const bv = 0.0035;
  const W = w - bv * 2, H = h - bv * 2, r = Math.min(W, H) * 0.25;
  const s = new THREE.Shape();
  s.moveTo(-W / 2 + r, -H / 2); s.lineTo(W / 2 - r, -H / 2); s.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + r);
  s.lineTo(W / 2, H / 2 - r); s.quadraticCurveTo(W / 2, H / 2, W / 2 - r, H / 2); s.lineTo(-W / 2 + r, H / 2);
  s.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - r); s.lineTo(-W / 2, -H / 2 + r); s.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + r, -H / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 5 });
  g.translate(0, 0, -d - bv);
  capCache.set(key, g);
  return g;
}
export function button(text, w, h, { bg = '#1f6fb2', fg = '#ffffff', size = 30, depth = 0.012 } = {}) {
  const g = new THREE.Group();
  const face = new THREE.Group();
  const base = mesh(capGeometry(w + 0.012, h + 0.012, 0.004), mat(0x0b1118, { metalness: 0.7, roughness: 0.4 }), 0, 0, -depth - 0.006);
  const capM = mat(bg, { roughness: 0.32, metalness: 0.05, emissive: new THREE.Color(bg), emissiveIntensity: 0.18 });
  const cap = mesh(capGeometry(w, h, depth), capM);
  const p = canvasPlane(w, h, 1400);
  p.mesh.position.z = 0.0016;
  face.add(cap, p.mesh);
  g.add(base, face);
  g.userData.face = face; g.userData.size = { w, h }; g.userData.isButton = true;
  let cur = { text, color: bg }, hover = false, lit = 0.18;
  const applyGlow = () => { capM.emissiveIntensity = hover ? lit + 0.35 : lit; };
  g.userData.onHover = (on) => { hover = on; applyGlow(); if (on) haptic(null); };
  g.userData.draw = (t = cur.text, color = cur.color, textColor = fg) => {
    cur = { text: t, color };
    capM.color.set(color); capM.emissive.set(color);
    lit = color === '#4a5663' ? 0.02 : 0.18; applyGlow();
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    let fs = size * 2.8;
    ctx.font = `800 ${fs}px ${FONT}`;
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
    const tooWide = () => lines.some((l) => ctx.measureText(l).width > c.width - 34);
    while ((lines.length * fs * 1.12 > c.height - 18 || tooWide()) && fs > 20) { fs *= 0.9; ctx.font = `800 ${fs}px ${FONT}`; fit(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lh = fs * 1.12;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = textColor;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 2));
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
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

// ---------------------------------------------------------------- shared bits for the controls
const _s1 = new V3(), _s2 = new V3(), _s3 = new V3(), _s4 = new V3();
export function closestOnLineToRay(o, d, ray, out) {    // line o + t d (d unit); returns t
  const w0 = _s4.subVectors(o, ray.origin);
  const b = d.dot(ray.direction), dd = d.dot(w0), e = ray.direction.dot(w0);
  const den = 1 - b * b;
  const t = den < 1e-6 ? -dd : (b * e - dd) / den;
  if (out) out.copy(o).addScaledVector(d, t);
  return t;
}
const _plane = new THREE.Plane();
// Where a ray meets the plane through `point` with world normal `normal`. Returns null if parallel.
export function rayOnPlane(ray, point, normal, out = new V3()) {
  _plane.setFromNormalAndCoplanarPoint(normal, point);
  return ray.intersectPlane(_plane, out);
}
function valueLabel(w, name, fmt, on) {
  const lab = canvasPlane(w, 0.05, 1400);
  noHit(lab.mesh);
  lab.draw = (v) => {
    const { ctx, c } = lab;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = on() ? 'rgba(10,22,38,0.94)' : 'rgba(40,46,54,0.9)';
    roundRect(ctx, 2, 2, c.width - 4, c.height - 4, 20); ctx.fill();
    ctx.strokeStyle = on() ? 'rgba(95,209,255,0.55)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = on() ? '#cfe3ff' : '#9aa5b0'; ctx.textBaseline = 'middle';
    ctx.font = `700 36px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(name, 20, c.height / 2 + 2);
    ctx.textAlign = 'right'; ctx.fillStyle = on() ? '#ffd34d' : '#9aa5b0';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(fmt(v), c.width - 20, c.height / 2 + 2);
    lab.update();
  };
  return lab;
}
function fineButtons(g, name, xL, xR, y, step, s) {
  const bw = 0.055;
  const minus = actionButton('−', bw, 0.05, () => s.set(s.value - step), { name: `${name}: down`, size: 40, bg: '#2d4a66' });
  const plus = actionButton('+', bw, 0.05, () => s.set(s.value + step), { name: `${name}: up`, size: 40, bg: '#2d4a66' });
  minus.position.set(xL, y, 0); plus.position.set(xR, y, 0);
  g.add(minus, plus);
  return [minus, plus];
}
// Common value logic for sliders, dials and levers. snap rounds to the drag step; fine is for ± buttons.
function valueModel({ min, max, step, fine = step, value, onChange, enabled, place }) {
  const s = { value, min, max, dragging: false, pointer: null };
  const on = () => !enabled || enabled();
  s.set = (v, silent = false) => {
    v = clamp(Math.round((v - min) / fine) * fine + min, min, max);
    v = Number(v.toFixed(10));
    const changed = v !== s.value;
    s.value = v; place();
    if (changed && !silent) { sfx.tick(); haptic(s.pointer, 0.12, 8); onChange(v); }
  };
  s.snap = (v) => Math.round((v - min) / step) * step + min;
  s.on = on;
  return s;
}

// ---------------------------------------------------------------- slider
// A knob on a track: pinch and drag it (near), point and drag it (far), click-drag on a computer,
// or press − / + for fine steps. Value changes call onChange(value).
export function slider({ length = 0.34, min = 0, max = 1, step = 0.01, fine = step, value = min, name = 'Slider',
  format = (v) => v.toFixed(2), onChange = () => {}, color = 0xffc93c, enabled = null, labelW = 0.3 }) {
  const g = new THREE.Group();
  const track = mesh(new THREE.CapsuleGeometry(0.008, length, 4, 10).rotateZ(Math.PI / 2), mat(0x1a2633, { metalness: 0.7, roughness: 0.3 }));
  const fill = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 8).rotateZ(Math.PI / 2).translate(0.5, 0, 0.004), basic(color));
  fill.position.x = -length / 2;
  const knob = new THREE.Group();
  const knobM = mat(color, { emissive: color, emissiveIntensity: 0.3, roughness: 0.25, metalness: 0.2 });
  knob.add(mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.028, 24).rotateX(Math.PI / 2).translate(0, 0, 0.012), knobM));
  knob.add(mesh(new THREE.BoxGeometry(0.004, 0.03, 0.002), basic(0xffffff), 0, 0, 0.027));
  const halo = glowSprite(color, 0.09, 0); knob.add(halo);
  g.add(track, fill, knob);
  noHit(track); noHit(fill);
  let s;
  const lab = valueLabel(labelW, name, format, () => s.on());
  lab.mesh.position.set(0, 0.048, 0);
  g.add(lab.mesh);
  function place() {
    const k = (s.value - min) / (max - min);
    knob.position.x = -length / 2 + k * length;
    fill.scale.x = Math.max(0.0001, k * length);
    lab.draw(s.value);
  }
  s = valueModel({ min, max, step, fine, value, onChange, enabled, place });
  s.group = g;
  s.refresh = place;
  let hov = false;
  knob.userData.onHover = (on) => { hov = on; };
  knob.userData.drag = {
    begin: (p) => { s.dragging = true; s.pointer = p; sfx.grab(); },
    point: (wp, p) => { if (!s.on()) return; s.pointer = p; const l = g.worldToLocal(_s1.copy(wp)); s.set(s.snap(min + (l.x / length + 0.5) * (max - min))); },
    ray: (ray, p) => {
      if (!s.on()) return;
      s.pointer = p;
      g.updateWorldMatrix(true, false);
      const o = g.localToWorld(_s2.set(-length / 2, 0, 0));
      const d = _s3.set(1, 0, 0).transformDirection(g.matrixWorld);
      const t = closestOnLineToRay(o, d, ray);
      const ws = g.matrixWorld.getMaxScaleOnAxis();
      s.set(s.snap(min + clamp(t / (length * ws), 0, 1) * (max - min)));
    },
    end: () => { s.dragging = false; s.pointer = null; sfx.release(); },
  };
  makeInteractive(knob, { name, enabled: s.on, priority: 2 });
  // the track can also be pointed at directly
  const hitTrack = mesh(new THREE.BoxGeometry(length + 0.04, 0.05, 0.03), new THREE.MeshBasicMaterial({ visible: false }));
  hitTrack.userData.drag = knob.userData.drag;
  hitTrack.userData.onHover = knob.userData.onHover;
  g.add(hitTrack);
  makeInteractive(hitTrack, { name, enabled: s.on, near: false });
  const [minus, plus] = fineButtons(g, name, -length / 2 - 0.058, length / 2 + 0.058, 0, fine, s);
  s.minus = minus; s.plus = plus;
  s.setEnabled = () => { minus.userData.setOn(s.on()); plus.userData.setOn(s.on()); place(); };
  s.tick = () => { halo.material.opacity += ((hov || s.dragging ? 0.8 : 0) - halo.material.opacity) * 0.25; knob.scale.setScalar(s.dragging ? 1.12 : hov ? 1.06 : 1); };
  animated.push(s);
  place();
  return s;
}

// ---------------------------------------------------------------- twist dial
// A knob you turn like a real one: pinch its rim and circle round it, point at it and drag round,
// or drag round it with the mouse. Ticks (sound and haptic) at every step.
export function dial({ name = 'Dial', min = 0, max = 1, step = 0.01, fine = step, value = min, format = (v) => v.toFixed(2),
  onChange = () => {}, enabled = null, color = 0x5fd1ff, radius = 0.055, sweep = Math.PI * 1.5, labelW = 0.34, turns = 1 }) {
  const g = new THREE.Group();
  // scale ring: ticks lit up to the value
  const ring = canvasPlane(radius * 2.9, radius * 2.9, 2600);
  noHit(ring.mesh); ring.mesh.position.z = 0.001;
  g.add(ring.mesh);
  // the knob: a ridged cylinder with a glowing pointer
  const knob = new THREE.Group();
  const kr = radius * 0.72;
  const shape = new THREE.Shape();
  const ridges = 24;
  for (let i = 0; i <= ridges * 2; i++) {
    const a = (i / (ridges * 2)) * Math.PI * 2, rr = i % 2 ? kr : kr * 0.93;
    i ? shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const body = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2 }), mat(0x2a3440, { metalness: 0.75, roughness: 0.3 }));
  const capTop = mesh(new THREE.CylinderGeometry(kr * 0.8, kr * 0.8, 0.004, 32).rotateX(Math.PI / 2), mat(0x3b4856, { metalness: 0.8, roughness: 0.22 }), 0, 0, 0.034);
  const pointerM = basic(color);
  const pointer = mesh(new THREE.BoxGeometry(0.006, kr * 0.75, 0.004), pointerM, 0, kr * 0.45, 0.037);
  const dot = mesh(new THREE.CircleGeometry(0.006, 16), pointerM, 0, kr * 0.84, 0.0345);
  const halo = glowSprite(color, radius * 2.4, 0);
  halo.position.z = 0.02;
  knob.add(body, capTop, pointer, dot, halo);
  g.add(knob);
  let s;
  const lab = valueLabel(labelW, name, format, () => s.on());
  lab.mesh.position.set(0, radius * 1.45 + 0.03, 0.002);
  g.add(lab.mesh);
  const per = sweep / turns;      // angle range shown on the scale
  const angOf = (v) => sweep / 2 - ((v - min) / (max - min)) * sweep;        // radians, CCW from +y
  function drawRing() {
    const { ctx, c } = ring;
    const cx = c.width / 2, R = c.width * 0.47;
    ctx.clearRect(0, 0, c.width, c.height);
    const k = (s.value - min) / (max - min);
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI / 2 + sweep / 2 - (i / n) * sweep;
      const lit = i / n <= k + 1e-9;
      ctx.strokeStyle = lit && s.on() ? hex(color) : 'rgba(160,180,200,0.35)';
      ctx.lineWidth = i % 5 === 0 ? 14 : 8;
      const r0 = R * (i % 5 === 0 ? 0.78 : 0.84);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cx - Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * R, cx - Math.sin(a) * R); ctx.stroke();
    }
    ring.update();
  }
  function place() { knob.rotation.z = angOf(s.value) * turns / turns; drawRing(); lab.draw(s.value); }
  s = valueModel({ min, max, step, fine, value, onChange, enabled, place });
  s.group = g;
  s.refresh = place;
  void per;
  let lastA = null, acc = 0, hov = false;
  const angleAt = (wp) => { const l = g.worldToLocal(_s1.copy(wp)); return Math.hypot(l.x, l.y) < radius * 0.18 ? null : Math.atan2(l.y, l.x); };
  const turnTo = (a) => {
    if (a == null) return;
    if (lastA == null) { lastA = a; return; }
    let d = a - lastA; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    lastA = a;
    acc += -d / sweep * (max - min);            // clockwise turns the value up, like a real knob
    const target = s.snap(acc);
    if (target !== s.value) s.set(target);
    acc = clamp(acc, min, max);
  };
  knob.userData.onHover = (on) => { hov = on; };
  knob.userData.drag = {
    begin: (p) => { s.dragging = true; s.pointer = p; lastA = null; acc = s.value; sfx.grab(); },
    point: (wp, p) => { if (!s.on()) return; s.pointer = p; turnTo(angleAt(wp)); },
    ray: (ray, p) => {
      if (!s.on()) return;
      s.pointer = p;
      g.updateWorldMatrix(true, false);
      const c = g.getWorldPosition(_s2), nrm = _s3.set(0, 0, 1).transformDirection(g.matrixWorld);
      const hit = rayOnPlane(ray, c, nrm, _s4);
      if (hit) turnTo(angleAt(hit));
    },
    end: () => { s.dragging = false; s.pointer = null; sfx.release(); },
  };
  makeInteractive(knob, { name, enabled: () => s.on(), priority: 2 });
  const [minus, plus] = fineButtons(g, name, -radius * 1.55 - 0.03, radius * 1.55 + 0.03, -radius * 0.2, fine, s);
  s.minus = minus; s.plus = plus;
  s.setEnabled = () => { minus.userData.setOn(s.on()); plus.userData.setOn(s.on()); place(); };
  s.tick = () => { halo.material.opacity += ((hov || s.dragging ? 0.7 : 0) - halo.material.opacity) * 0.25; };
  animated.push(s);
  place();
  return s;
}

// ---------------------------------------------------------------- lever (throttle)
// A handle on an arm that tilts away from you (more) or towards you (less). Grab the handle and push.
export function lever({ name = 'Lever', min = 0, max = 1, step = 0.01, fine = step, value = min, format = (v) => v.toFixed(2),
  onChange = () => {}, enabled = null, color = 0xff6b4a, length = 0.14, arc = Math.PI * 0.55, labelW = 0.36, ticks = [] }) {
  const g = new THREE.Group();
  // housing with a slot
  const housing = mesh(new THREE.BoxGeometry(0.06, length * 1.25, 0.03), mat(0x18212b, { metalness: 0.7, roughness: 0.35 }), 0, 0, 0.015);
  const slot = mesh(new THREE.BoxGeometry(0.014, length * 1.05, 0.002), basic(0x05080c), 0, 0, 0.031);
  g.add(noHit(housing), noHit(slot));
  // scale beside the slot
  const scale = canvasPlane(0.09, length * 1.25, 2400);
  scale.mesh.position.set(0.075, 0, 0.0305); noHit(scale.mesh);
  g.add(scale.mesh);
  const pivot = new THREE.Group(); pivot.position.z = 0.03;
  g.add(pivot);
  const arm = mesh(new THREE.CylinderGeometry(0.006, 0.008, length, 12).translate(0, length / 2, 0), mat(0xb8c4d0, { metalness: 0.9, roughness: 0.2 }));
  const handleM = mat(color, { emissive: color, emissiveIntensity: 0.25, roughness: 0.3 });
  const handle = mesh(new THREE.CapsuleGeometry(0.018, 0.05, 6, 16).rotateZ(Math.PI / 2), handleM, 0, length, 0);
  const halo = glowSprite(color, 0.12, 0); halo.position.y = length;
  pivot.add(arm, handle, halo);
  let s;
  const lab = valueLabel(labelW, name, format, () => s.on());
  lab.mesh.position.set(0, -(length * 0.625 + 0.032), 0.031);
  g.add(lab.mesh);
  const aOf = (v) => -arc / 2 + ((v - min) / (max - min)) * arc;    // tilt about local x (towards −y = towards you)
  function drawScale() {
    const { ctx, c } = scale;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(8,14,22,0.85)'; roundRect(ctx, 0, 0, c.width, c.height, 18); ctx.fill();
    const k = (s.value - min) / (max - min);
    const yOf = (kk) => c.height * (0.92 - kk * 0.84);
    const gr = ctx.createLinearGradient(0, yOf(0), 0, yOf(1));
    gr.addColorStop(0, '#2f7dd1'); gr.addColorStop(1, hex(color));
    ctx.fillStyle = gr; ctx.fillRect(18, yOf(k), 20, yOf(0) - yOf(k));
    ctx.strokeStyle = 'rgba(200,220,240,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(18, yOf(1), 20, yOf(0) - yOf(1));
    ctx.fillStyle = '#cfe3ff'; ctx.font = `700 34px ${FONT}`; ctx.textBaseline = 'middle';
    for (const t of ticks) { const kk = (t - min) / (max - min); ctx.fillRect(40, yOf(kk) - 2, 14, 4); ctx.fillText(String(t), 60, yOf(kk)); }
    scale.update();
  }
  function place() { pivot.rotation.x = -aOf(s.value); drawScale(); lab.draw(s.value); }
  s = valueModel({ min, max, step, fine, value, onChange, enabled, place });
  s.group = g;
  s.refresh = place;
  let hov = false;
  const valueAt = (wp) => {
    const l = pivot.parent.worldToLocal(_s1.copy(wp)).sub(pivot.position);
    const a = Math.atan2(-l.y, l.z);           // 0 = straight up out of the panel; + = towards the learner (less)
    return min + ((-a + arc / 2) / arc) * (max - min);
  };
  handle.userData.onHover = (on) => { hov = on; };
  handle.userData.drag = {
    begin: (p) => { s.dragging = true; s.pointer = p; sfx.grab(); },
    point: (wp, p) => { if (!s.on()) return; s.pointer = p; s.set(s.snap(valueAt(wp))); },
    ray: (ray, p) => {
      if (!s.on()) return;
      s.pointer = p;
      g.updateWorldMatrix(true, true);
      const c = pivot.getWorldPosition(_s2), nrm = _s3.set(1, 0, 0).transformDirection(g.matrixWorld);
      const hit = rayOnPlane(ray, c, nrm, _s4);
      if (hit) s.set(s.snap(valueAt(hit)));
    },
    end: () => { s.dragging = false; s.pointer = null; sfx.release(); },
  };
  makeInteractive(handle, { name, enabled: () => s.on(), priority: 2 });
  const [minus, plus] = fineButtons(g, name, -0.075, -0.075, 0, fine, s);
  s.minus = minus; s.plus = plus;
  minus.position.set(-0.075, -0.035, 0); plus.position.set(-0.075, 0.035, 0);
  s.setEnabled = () => { minus.userData.setOn(s.on()); plus.userData.setOn(s.on()); place(); };
  s.tick = () => { halo.material.opacity += ((hov || s.dragging ? 0.75 : 0) - halo.material.opacity) * 0.25; handleM.emissiveIntensity = hov || s.dragging ? 0.6 : 0.25; };
  animated.push(s);
  place();
  return s;
}

// ---------------------------------------------------------------- flip switch
// Two labelled positions; touch, pinch or click to flip. onChange(index).
export function toggle({ labels = ['On', 'Off'], value = 0, onChange = () => {}, enabled = null, w = 0.22, h = 0.075, name = 'Switch', colors = ['#2fa36b', '#c0392b'] }) {
  const g = new THREE.Group();
  const plate = canvasPlane(w, h, 1400);
  plate.mesh.position.z = 0.001;
  g.add(mesh(capGeometry(w + 0.01, h + 0.01, 0.004), mat(0x0b1118, { metalness: 0.7, roughness: 0.4 }), 0, 0, -0.006), plate.mesh);
  const face = new THREE.Group();                  // the bat: tilts towards the chosen label
  const bat = mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.035, 12).translate(0, 0.0175, 0).rotateX(Math.PI / 2), mat(0xd8dee6, { metalness: 0.9, roughness: 0.2 }));
  const tip = mesh(new THREE.SphereGeometry(0.009, 16, 12), mat(0xffffff, { metalness: 0.3, roughness: 0.3 }), 0, 0, 0.036);
  const batG = new THREE.Group(); batG.add(bat, tip);
  const boss = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.008, 20).rotateX(Math.PI / 2), mat(0x7b8794, { metalness: 0.9, roughness: 0.3 }), 0, 0, 0.004);
  face.add(boss, batG);
  g.add(face);
  g.userData.face = face; g.userData.size = { w, h }; g.userData.isButton = true;
  const t = { value, group: g };
  const on = () => !enabled || enabled();
  function draw() {
    const { ctx, c } = plate;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(10,18,28,0.95)'; roundRect(ctx, 0, 0, c.width, c.height, 22); ctx.fill();
    const half = c.width / 2;
    for (let i = 0; i < 2; i++) {
      const lit = t.value === i;
      const x0 = i === 0 ? 0 : half + 34;
      if (lit) { ctx.fillStyle = on() ? colors[i] : '#4a5663'; roundRect(ctx, x0 + 8, 8, half - 50, c.height - 16, 16); ctx.fill(); }
      ctx.fillStyle = lit ? '#ffffff' : 'rgba(200,215,230,0.55)';
      let fs = Math.round(c.height * 0.34); ctx.font = `800 ${fs}px ${FONT}`;
      while (fs > 12 && ctx.measureText(labels[i]).width > half - 70) { fs -= 2; ctx.font = `800 ${fs}px ${FONT}`; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], x0 + (half - 34) / 2, c.height / 2 + 2);
    }
    plate.update();
  }
  function place(animate = true) {
    const target = t.value === 0 ? 0.5 : -0.5;
    if (animate) { const from = batG.rotation.y; tween(0.15, (k) => (batG.rotation.y = from + (target - from) * k), easeBack); } else batG.rotation.y = target;
    draw();
  }
  t.set = (v, silent = false) => { if (v === t.value) return; t.value = v; place(); if (!silent) onChange(v); };
  t.refresh = () => place(false);
  makeInteractive(g, { name, action: (p) => { if (!on()) return; sfx.snap(); haptic(p, 0.6, 25); t.set(1 - t.value); }, enabled: on });
  g.userData.onHover = () => {};
  place(false);
  return t;
}

// ---------------------------------------------------------------- grabbable objects
// Pinch it (near), point and pinch (far), or drag it with the mouse. The object keeps the point where it was
// grabbed under the hand (no jump). constrain(localPos) => localPos limits where it can go (in `space`).
// For far and mouse drags the object moves in a plane facing the viewer through its position
// (or the plane with `planeNormal`, given in `space` coordinates).
export function grabbable(obj, { name = 'Grab', space = null, constrain = (v) => v, onGrab = () => {}, onMove = () => {}, onRelease = () => {},
  enabled = null, planeNormal = null, haloSize = 0.14, color = 0xffe08a, priority = 1, hitRadius = 0 } = {}) {
  if (hitRadius) obj.add(mesh(new THREE.SphereGeometry(hitRadius, 12, 8), new THREE.MeshBasicMaterial({ visible: false })));   // easier to grab
  const sp = () => space || obj.parent;
  const halo = glowSprite(color, haloSize, 0);
  obj.add(halo);
  const st = { held: false, hover: false, offset: new V3(), first: true, pointer: null };
  const moveTo = (worldP, p) => {
    const l = sp().worldToLocal(_s1.copy(worldP));
    if (st.first) { st.offset.copy(obj.position).sub(l); st.first = false; }
    const target = constrain(l.add(st.offset), p);
    if (target) { obj.position.copy(target); onMove(obj.position, p); }
  };
  obj.userData.onHover = (on) => { st.hover = on; };
  obj.userData.drag = {
    begin: (p) => { st.held = true; st.first = true; st.pointer = p; sfx.grab(); haptic(p, 0.5, 25); onGrab(p); },
    point: (wp, p) => { if (enabled && !enabled()) return; moveTo(wp, p); },
    ray: (ray, p) => {
      if (enabled && !enabled()) return;
      obj.updateWorldMatrix(true, false);
      const c = obj.getWorldPosition(_s2);
      let n;
      if (planeNormal) n = _s3.copy(planeNormal).transformDirection(sp().matrixWorld);
      else n = camera.getWorldDirection(_s3);
      const hit = rayOnPlane(ray, c, n, _s4);
      if (hit) moveTo(hit, p);
    },
    end: (p) => { st.held = false; sfx.release(); onRelease(p); },
  };
  makeInteractive(obj, { name, enabled: () => !enabled || enabled(), priority });
  st.tick = () => {
    const target = st.held ? 0.9 : st.hover ? 0.6 : 0;
    halo.material.opacity += (target - halo.material.opacity) * 0.25;
    const pulse = 1 + 0.08 * Math.sin(time * 6);
    halo.scale.setScalar(haloSize * (st.held ? 1.1 : pulse));
  };
  animated.push(st);
  return st;
}

// ---------------------------------------------------------------- "do this next" beacon
// A bobbing chevron and pulsing glow above the thing to use next (teach through play).
export function beacon(color = 0x5fd1ff) {
  const g = new THREE.Group();
  const m = glowMat(color, { opacity: 0.9 });
  const chevron = mesh(new THREE.ConeGeometry(0.016, 0.03, 4).rotateX(Math.PI), m);
  const glow = glowSprite(color, 0.07, 0.6);
  g.add(chevron, glow);
  g.visible = false; noHit(g);
  scene.add(g);
  let target = null;
  const off = new V3();
  const b = {
    show(obj, offset = [0, 0.07, 0]) { target = obj; off.set(...offset); g.visible = true; },
    hide() { target = null; g.visible = false; },
    get target() { return target; },
    tick(t) {
      if (!target) return;
      if (!shown(target)) { g.visible = false; return; }
      g.visible = true;
      target.updateWorldMatrix(true, false);
      target.getWorldPosition(g.position);
      const q = target.getWorldQuaternion(new THREE.Quaternion());
      g.position.add(_s1.copy(off).applyQuaternion(q)).addScaledVector(_s2.set(0, 1, 0), 0.012 * Math.sin(t * 4));
      chevron.rotation.y = t * 2;
      glow.material.opacity = 0.35 + 0.3 * Math.sin(t * 5);
    },
  };
  animated.push({ tick: () => b.tick(time) });
  return b;
}

// ---------------------------------------------------------------- toast (big feedback banner)
export function toaster(parent, w = 0.9, h = 0.12) {
  const p = canvasPlane(w, h, 1100);
  noHit(p.mesh);
  p.mesh.visible = false;
  p.mesh.renderOrder = 980;
  parent.add(p.mesh);
  let token = 0;
  const colors = { good: ['#1e8449', '#2ecc71'], bad: ['#922b21', '#e74c3c'], info: ['#1f4e79', '#3fa7ff'], warn: ['#9a6a0b', '#f5b041'] };
  const show = async (text, kind = 'info', secs = 3.5) => {
    const my = ++token;
    const { ctx, c } = p;
    const [c0, c1] = colors[kind] || [kind, kind];
    ctx.clearRect(0, 0, c.width, c.height);
    const gr = ctx.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, c0); gr.addColorStop(1, 'rgba(8,14,22,0.95)');
    ctx.fillStyle = gr; roundRect(ctx, 3, 3, c.width - 6, c.height - 6, 26); ctx.fill();
    ctx.strokeStyle = c1; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `800 46px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = []; let line = '';
    for (const word of String(text).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > c.width - 60 && line) { lines.push(line); line = word; } else line = t; }
    lines.push(line);
    if (lines.length > 2) ctx.font = `800 36px ${FONT}`;
    const lh = lines.length > 2 ? 40 : 52;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 2));
    p.update();
    p.mesh.visible = true;
    p.mesh.scale.setScalar(0.85);
    tween(0.25, (k) => p.mesh.scale.setScalar(0.85 + 0.15 * k), easeBack);
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
      this.asked++; this.correct = correct;   // read by the automated tests
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
        render(`Choose an answer on the console (${words().select} a button).`, '#9fb6cc');
        placeButtons(options.length);
        pool.forEach((e, i) => {
          e.b.visible = i < options.length;
          if (!e.b.visible) { e.cb = null; return; }
          e.b.userData.draw(`${letters[i]}`, '#1f6fb2');
          e.b.scale.setScalar(0.01);
          tween(0.3, (k) => e.b.scale.setScalar(0.01 + 0.99 * k), easeBack);
          e.cb = async () => {
            if (done) return;
            tries++;
            const wp = e.b.getWorldPosition(new V3());
            if (i === correct) {
              done = true;
              sfx.good();
              fx.emit(wp, { count: 30, colors: [0x3ddc84, 0xffffff], speed: 0.5, life: 0.7, size: 0.012 });
              e.b.userData.draw(`${letters[i]}  ✓`, '#1e8449');
              render(`Correct. ${explain}`, '#8ef0a8');
              toast?.(tries === 1 ? 'Correct!' : 'Correct on a second try', 'good', 2.5);
              await wait(2.6);
              pool.forEach((p) => { p.b.visible = false; p.cb = null; });
              this.active = false;
              resolve(tries === 1);
            } else {
              sfx.bad();
              const f = e.b.userData.face, x0 = 0;
              tween(0.3, (k) => { if (f) f.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.006 * (1 - k); }, (k) => k);
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

// ---------------------------------------------------------------- hover label and hover state
const hoverSprite = textSprite('', { size: 0.026 });
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
const _hv = new V3();
let hovered = new Set();
function setHovered(next) {
  for (const r of hovered) if (!next.has(r)) r.userData.onHover?.(false);
  for (const r of next) if (!hovered.has(r)) r.userData.onHover?.(true);
  hovered = next;
}
const animated = [];      // controls with a tick() for glow animation

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
export const view = { desktopPos: new V3(0, 0, 0.35), desktopPitch: -0.28 };
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
  if (h && h.root.userData.drag) { mouseDrag = h.root; dragging.add(h.root); h.root.userData.drag.begin?.(null, h.point); h.root.userData.drag.ray(mouseRay(), null); return; }
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
el.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (mouseDrag) { mouseDrag.userData.drag.ray(mouseRay(), null); return; }
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
  if (mouseDrag) { dragging.delete(mouseDrag); mouseDrag.userData.drag.end?.(null); mouseDrag = null; return; }
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
  const next = new Set(dragging);
  if (h) next.add(h.root);
  setHovered(next);
  el.style.cursor = mouseDrag ? 'grabbing' : h ? (h.root.userData.drag ? 'grab' : 'pointer') : drag ? 'grabbing' : 'default';
}
function updateXRHover() {
  let root = null, point = null;
  const next = new Set(dragging);
  for (const p of input.pointers) {
    if (p.hover) { next.add(p.hover.root); if (!root) { root = p.hover.root; point = p.hover.point; } }
    if (p.focus && p.focus.userData.interactive) { next.add(p.focus); if (!root) { root = p.focus; point = p.focus.getWorldPosition(_hv2); } }
  }
  showHover(root, point);
  setHovered(next);
}
const _hv2 = new V3();

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
      const head = new V3(); camera.getWorldPosition(head);
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
    for (const [p, root] of rayDrags) { if (p.rayOk) root.userData.drag.ray(p.worldRay, p); }
    if (renderer.xr.isPresenting) { updateThumbsticks(); updateXRHover(); } else updateDesktop();
    for (const a of animated) a.tick?.(dt);
    for (const fn of frameFns) fn(dt, time);
    fx.update(dt);
    renderer.render(scene, camera);
    hud.update();
  });
}
