// O-Level Science Lab VR
// An original WebXR lab with five core O-Level practicals. Runs in the Meta Quest
// Browser (WebXR) and in any desktop browser (mouse + keyboard).
import * as THREE from 'three';
import { VRButton } from './vendor/VRButton.js';
import { createXRInput, inputWords } from '../shared/xr-input.js';
import { createDebugHud } from '../shared/debug-hud.js';

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
document.body.appendChild(vrButton);
document.getElementById('loading')?.remove();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ee);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 60);
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group(); // the player: moved by teleport / thumbsticks
rig.add(camera);
scene.add(rig);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(3, 6, 2);
scene.add(sun);

// ---------------------------------------------------------------- hands-first input (shared/xr-input.js)
// Hands and controllers work the same way: poke buttons, pinch (or trigger) on apparatus to pick it
// up or use it, and point + pinch for things out of reach. Held tools stay in the hand (sticky hold).
const settings = { smoothWalk: false };
const input = createXRInput({
  renderer, scene, camera, parent: rig,
  pickRay: (ray) => hitTest(ray.origin, ray.direction),
  onRaySelect: (p, hit) => { const h = hit.root.userData.hold; if (h) { ac(); h.start(p); } else activate(hit.root, p); },
  onRayRelease: (p, hit) => hit.root.userData.hold?.end(p),
  onHeldPress: (p, source, hit) => heldPress(p, hit),
  heldFocus: (p) => (held.obj && held.hand === p ? toolTarget()?.obj ?? null : null),
  sound: (n) => { ac(); if (n === 'click') sfx.tick(); },
  onKindChange: () => { if (stations.length === 5) { updateWelcome(); stations.forEach((s) => s.render()); } },
});
const hud = createDebugHud({ renderer, camera, input });
// How to say "use it" for the input in hand.
function useOn(t) {
  const k = input.kind;
  if (k === 'hand') return `bring its tip to ${t} and pinch, or point at ${t} and pinch`;
  if (k === 'controller') return `bring its tip to ${t} and pull the trigger, or point at ${t}`;
  return `click ${t}`;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- small helpers
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...o });
const lam = (color) => new THREE.MeshLambertMaterial({ color });   // cheaper shading for the room and benches
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xd8ecff, transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0, depthWrite: false, side: THREE.DoubleSide,
});
function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
let time = 0;   // seconds since the page started (advanced by the main loop)
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// Tweens: tween(seconds, k => {...}) returns a promise that resolves when done.
const tweens = [];
function tween(dur, fn, easing = ease) {
  return new Promise((resolve) => tweens.push({ t: 0, dur: Math.max(dur, 0.0001), fn, resolve, easing }));
}
const wait = (s) => tween(s, () => {});
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.easing(k));
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
}
function colorTo(material, hex, dur = 1) {
  const from = material.color.clone();
  const to = new THREE.Color(hex);
  return tween(dur, (k) => material.color.lerpColors(from, to, k));
}

// ---------------------------------------------------------------- text on canvases
function canvasPlane(w, h, res = 700) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * res);
  c.height = Math.round(h * res);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return { mesh: m, c, ctx, tex, update() { tex.needsUpdate = true; } };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxW, lh, draw = true) {
  const words = String(text).split(' ');
  let line = '';
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (ctx.measureText(t).width > maxW && line) {
      if (draw) ctx.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) { if (draw) ctx.fillText(line, x, y); y += lh; }
  return y;
}
function label(text, { w = 0.12, h = 0.04, bg = '#ffffff', fg = '#13293d', font = 'bold 34px system-ui, sans-serif', res = 900 } = {}) {
  const p = canvasPlane(w, h, res);
  const { ctx, c } = p;
  ctx.fillStyle = bg;
  roundRect(ctx, 2, 2, c.width - 4, c.height - 4, Math.min(16, c.height / 4));
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  p.update();
  return p.mesh;
}
function button(text, w, h, { bg = '#1f6fb2', fg = '#ffffff', font = 'bold 40px system-ui, sans-serif' } = {}) {
  font = font.replace(/(\d+)px/, (_, n) => `${n * 2}px`); // canvas is drawn at 2x resolution
  const g = new THREE.Group();
  const face = new THREE.Group(); // the part that sinks when poked
  const back = mesh(new THREE.BoxGeometry(w, h, 0.02), mat(0x23384d), 0, 0, -0.011);
  const p = canvasPlane(w, h, 1400);
  face.add(back, p.mesh);
  g.add(face);
  g.userData.face = face; g.userData.size = { w, h }; g.userData.isButton = true;
  g.userData.draw = (t, color = bg) => {
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    roundRect(ctx, 4, 4, c.width - 8, c.height - 8, 30);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = [];
    const words = String(t).split(' ');
    let line = '';
    for (const word of words) {
      const tt = line ? line + ' ' + word : word;
      if (ctx.measureText(tt).width > c.width - 40 && line) { lines.push(line); line = word; } else line = tt;
    }
    if (line) lines.push(line);
    const lh = parseInt(font.match(/(\d+)px/)[1], 10) * 1.15;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 2));
    p.update();
  };
  g.userData.draw(text);
  return g;
}

// ---------------------------------------------------------------- sound (Web Audio, no files)
let audio = null;
function ac() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; } }
  if (audio && audio.state === 'suspended') audio.resume();
  return audio;
}
function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const gn = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gn.gain.setValueAtTime(vol, t0);
  gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(gn).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  click: () => tone(1200, 0.05, 'square', 0.04),
  good: () => { tone(660, 0.12, 'sine', 0.15); tone(990, 0.2, 'sine', 0.15, null, 0.1); },
  bad: () => tone(160, 0.25, 'square', 0.08),
  pop: () => {
    const a = ac(); if (!a) return;
    const len = a.sampleRate * 0.12;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = a.createBufferSource(); src.buffer = buf;
    const gn = a.createGain(); gn.gain.value = 0.6;
    src.connect(gn).connect(a.destination); src.start();
    tone(1400, 0.15, 'sine', 0.12, 2400);
  },
  bubble: () => tone(500 + Math.random() * 400, 0.06, 'sine', 0.05, 900),
  tick: () => tone(2000, 0.02, 'square', 0.02),
  whoosh: () => tone(300, 0.25, 'sawtooth', 0.03, 120),
};

// ---------------------------------------------------------------- the room
function buildRoom() {
  const fc = document.createElement('canvas'); fc.width = fc.height = 256;
  const fx = fc.getContext('2d');
  fx.fillStyle = '#c9cfd4'; fx.fillRect(0, 0, 256, 256);
  fx.fillStyle = '#bcc3c9'; fx.fillRect(0, 0, 128, 128); fx.fillRect(128, 128, 128, 128);
  const ft = new THREE.CanvasTexture(fc);
  ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(8, 8); ft.colorSpace = THREE.SRGBColorSpace;
  const floor = mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshLambertMaterial({ map: ft }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const wallM = lam(0xeef1ea);
  const walls = [[0, -7, 0], [0, 7, Math.PI], [-7, 0, Math.PI / 2], [7, 0, -Math.PI / 2]];
  for (const [x, z, r] of walls) {
    const w = mesh(new THREE.PlaneGeometry(14, 3.6), wallM, x, 1.8, z);
    w.rotation.y = r;
    scene.add(w);
    const skirting = mesh(new THREE.PlaneGeometry(14, 0.9), lam(0x5d7f6e), x, 0.45, z);
    skirting.rotation.y = r; skirting.position.multiplyScalar(0.999); skirting.position.y = 0.45;
    scene.add(skirting);
  }
  const ceil = mesh(new THREE.PlaneGeometry(14, 14), lam(0xf7f7f4), 0, 3.6, 0);
  ceil.rotation.x = Math.PI / 2;
  scene.add(ceil);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    scene.add(mesh(new THREE.BoxGeometry(1.2, 0.04, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }), i * 4, 3.58, j * 4));
  }
  // windows (light panels) on two walls
  for (let i = -1; i <= 1; i++) {
    const win = mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xbfe3ff }), i * 3.5, 2.1, -6.98);
    scene.add(win);
    const win2 = mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ color: 0xbfe3ff }), -6.98, 2.1, i * 3.5);
    win2.rotation.y = Math.PI / 2;
    scene.add(win2);
  }
  // sign
  const sign = label('O-LEVEL SCIENCE LAB', { w: 3.2, h: 0.4, bg: '#1d4e6e', fg: '#ffffff', font: 'bold 150px system-ui, sans-serif', res: 300 });
  sign.position.set(0, 3.05, 6.97); sign.rotation.y = Math.PI;
  scene.add(sign);
}
buildRoom();

// ---------------------------------------------------------------- interaction registry
const interactables = []; // root objects that can be selected
function makeInteractive(obj, { id, name, station = null, action = null, tool = false, near = true }) {
  obj.userData.interactive = { id, name, station, action, tool };
  interactables.push(obj);
  // close up: buttons are poked, everything else is pinched (trigger or grip on controllers)
  if (obj.userData.isButton) input.addPokable(obj, { onPress: (p) => activate(obj, p) });
  else if (near) input.addNearTarget(obj, { onPinch: (p) => activate(obj, p) });
}
function findInteractive(o) {
  while (o) { if (o.userData.interactive) return o; o = o.parent; }
  return null;
}
const raycaster = new THREE.Raycaster();
function hitTest(origin, dir) {
  raycaster.set(origin, dir);
  raycaster.far = 12;
  const visible = interactables.filter((o) => isVisible(o));
  const hits = raycaster.intersectObjects(visible, true);
  for (const h of hits) {
    if (h.object.userData.noHit) continue;
    const root = findInteractive(h.object);
    if (root) return { root, point: h.point, distance: h.distance };
  }
  return null;
}
function isVisible(o) {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}

function activate(root, hand) {
  const info = root.userData.interactive;
  ac();
  if (info.action) { sfx.click(); info.action(hand); return; }
  if (info.station) info.station.click(info.id, hand);
}

// Hover label (shows the apparatus name)
const hoverCanvas = canvasPlane(0.5, 0.07, 800);
const hoverSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hoverCanvas.tex, depthTest: false, transparent: true }));
hoverSprite.scale.set(0.5, 0.07, 1);
hoverSprite.renderOrder = 999;
hoverSprite.visible = false;
scene.add(hoverSprite);
let hoverName = '';
function showHover(root, point) {
  if (!root) { hoverSprite.visible = false; hoverName = ''; return; }
  const name = root.userData.interactive.name;
  if (name !== hoverName) {
    hoverName = name;
    const { ctx, c } = hoverCanvas;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = 'bold 30px system-ui, sans-serif';
    const tw = Math.min(c.width - 10, ctx.measureText(name).width + 40);
    ctx.fillStyle = 'rgba(15,30,45,0.9)';
    roundRect(ctx, (c.width - tw) / 2, 4, tw, c.height - 8, 14);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, c.width / 2, c.height / 2 + 1);
    hoverCanvas.update();
  }
  hoverSprite.visible = true;
  hoverSprite.position.copy(point).add(new THREE.Vector3(0, 0.08, 0));
}

// ---------------------------------------------------------------- apparatus builders
function testTube({ r = 0.021, h = 0.16, color = 0xffffff, level = 0.45, opacity = 0.85 } = {}) {
  const g = new THREE.Group();
  const glass = mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), glassMat, 0, h / 2, 0);
  const bottom = mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMat);
  const rim = mesh(new THREE.TorusGeometry(r, 0.0018, 6, 20), glassMat, 0, h, 0);
  rim.rotation.x = Math.PI / 2;
  const liqMat = mat(color, { transparent: true, opacity, roughness: 0.3 });
  const liquid = mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 1, 16), liqMat);
  const liqBottom = mesh(new THREE.SphereGeometry(r * 0.86, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), liqMat);
  const pptMat = mat(0xffffff, { roughness: 0.9 });
  const ppt = mesh(new THREE.CylinderGeometry(r * 0.84, r * 0.84, 1, 14), pptMat);
  ppt.visible = false;
  g.add(glass, bottom, rim, liquid, liqBottom, ppt);
  g.userData.tube = { h, r, liquid, liqMat, ppt, pptMat, liqBottom };
  setLevel(g, level);
  return g;
}
function setLevel(tube, level) {
  const t = tube.userData.tube;
  const hl = Math.max(0.0001, t.h * level);
  t.liquid.scale.y = hl;
  t.liquid.position.y = hl / 2;
  t.liquid.visible = level > 0.001;
  t.liqBottom.visible = level > 0.001;
  t.level = level;
}
function setPpt(tube, amount, color) {
  const t = tube.userData.tube;
  if (color !== undefined) t.pptMat.color.set(color);
  const hp = Math.max(0.0001, t.h * amount);
  t.ppt.scale.y = hp;
  t.ppt.position.y = hp / 2 + 0.002;
  t.ppt.visible = amount > 0.001;
}
function rack(n = 3, spacing = 0.085) {
  const g = new THREE.Group();
  const wood = mat(0x9b6b3d);
  const w = spacing * n + 0.04;
  g.add(mesh(new THREE.BoxGeometry(w, 0.012, 0.07), wood, 0, 0.006, 0));
  g.add(mesh(new THREE.BoxGeometry(w, 0.01, 0.07), wood, 0, 0.09, 0));
  g.add(mesh(new THREE.BoxGeometry(0.01, 0.09, 0.07), wood, -w / 2 + 0.005, 0.045, 0));
  g.add(mesh(new THREE.BoxGeometry(0.01, 0.09, 0.07), wood, w / 2 - 0.005, 0.045, 0));
  return g;
}
// A dropper pipette (tip at local origin) and its reagent bottle.
function dropper(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.0015, 0.03, 10), glassMat, 0, 0.015, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 10), glassMat, 0, 0.065, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.05, 8), mat(color, { transparent: true, opacity: 0.9 }), 0, 0.045, 0));
  g.add(mesh(new THREE.SphereGeometry(0.011, 14, 10), mat(0xc0392b), 0, 0.11, 0));
  // invisible fat collider so a laser can hit the thin dropper easily
  const col = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.07, 0);
  g.add(col);
  g.userData.tipColor = color;
  g.userData.gripY = 0.1;   // held by the bulb, tip down
  return g;
}
function bottle(color, text) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 18), mat(color, { transparent: true, opacity: 0.75, roughness: 0.2 }), 0, 0.045, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.014, 0.022, 0.02, 14), mat(color, { transparent: true, opacity: 0.75 }), 0, 0.1, 0));
  const l = label(text, { w: 0.09, h: 0.035, font: 'bold 22px system-ui, sans-serif', res: 1200 });
  l.position.set(0, 0.05, 0.0335);
  g.add(l);
  return g;
}
function beaker(r = 0.05, h = 0.1, color = 0xcfe8ff, level = 0.6) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true), glassMat, 0, h / 2, 0));
  g.add(mesh(new THREE.CircleGeometry(r, 24), glassMat, 0, 0.001, 0).rotateX(-Math.PI / 2));
  const lm = mat(color, { transparent: true, opacity: 0.55 });
  const liq = mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, h * level, 24), lm, 0, (h * level) / 2, 0);
  g.add(liq);
  g.userData.liq = liq; g.userData.liqMat = lm;
  return g;
}
function flame(scale = 1, color = 0x4aa3ff) {
  const g = new THREE.Group();
  const outer = mesh(new THREE.ConeGeometry(0.012 * scale, 0.07 * scale, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.035 * scale, 0);
  const inner = mesh(new THREE.ConeGeometry(0.006 * scale, 0.035 * scale, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.018 * scale, 0);
  outer.userData.noHit = inner.userData.noHit = true;
  g.add(outer, inner);
  g.userData.outer = outer;
  return g;
}
function burner() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.015, 18), mat(0x333a40, { metalness: 0.5 }), 0, 0.0075, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.1, 12), mat(0x9aa4ad, { metalness: 0.7, roughness: 0.3 }), 0, 0.065, 0));
  const f = flame(1.3);
  f.position.y = 0.115;
  f.visible = false;
  g.add(f);
  g.userData.flame = f;
  return g;
}
function tripod(h = 0.14) {
  const g = new THREE.Group();
  const m = mat(0x2c3136, { metalness: 0.6 });
  g.add(mesh(new THREE.TorusGeometry(0.05, 0.004, 6, 20), m, 0, h, 0).rotateX(Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.003, 0.003, h, 6), m, Math.cos(a) * 0.05, h / 2, Math.sin(a) * 0.05);
    g.add(leg);
  }
  g.add(mesh(new THREE.BoxGeometry(0.13, 0.002, 0.13), mat(0xb0b6bb, { metalness: 0.4 }), 0, h + 0.003, 0)); // gauze
  return g;
}
function splint() {
  const g = new THREE.Group(); // tip at local origin, splint along +y
  g.add(mesh(new THREE.BoxGeometry(0.005, 0.17, 0.005), mat(0xc8a165), 0, 0.085, 0));
  const tip = mesh(new THREE.SphereGeometry(0.004, 8, 6), mat(0x222222));
  g.add(tip);
  const fl = flame(0.6, 0xffa531);
  fl.rotation.x = Math.PI; // flame licks back along the splint when tip-down
  fl.visible = false;
  g.add(fl);
  const ember = mesh(new THREE.SphereGeometry(0.005, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a00 }));
  ember.visible = false;
  g.add(ember);
  g.add(mesh(new THREE.BoxGeometry(0.04, 0.19, 0.04), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.085, 0)); // collider
  g.userData.flame = fl; g.userData.ember = ember; g.userData.tip = tip;
  g.userData.gripY = 0.13;
  return g;
}
function stand(height = 0.75) {
  const g = new THREE.Group();
  const m = mat(0x39424a, { metalness: 0.5, roughness: 0.4 });
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.015, 0.22), m, 0, 0.0075, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, height, 10), mat(0xb6bec5, { metalness: 0.8, roughness: 0.3 }), 0, height / 2, -0.07));
  return g;
}
function conicalFlask(color = 0xffffff) {
  const g = new THREE.Group();
  const h = 0.11;
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.058, h, 24, 1, true), glassMat, 0, h / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.045, 18, 1, true), glassMat, 0, h + 0.0225, 0));
  g.add(mesh(new THREE.CircleGeometry(0.058, 24), glassMat, 0, 0.001, 0).rotateX(-Math.PI / 2));
  const lm = mat(color, { transparent: true, opacity: 0.8, roughness: 0.3 });
  const lh = 0.045;
  const liq = mesh(new THREE.CylinderGeometry(0.058 - (0.04 * lh) / h, 0.055, lh, 24), lm, 0, lh / 2, 0);
  g.add(liq);
  g.userData.liq = liq; g.userData.liqMat = lm; g.userData.lh = lh;
  return g;
}
function setFlaskFill(flask, k) {
  const { liq, lh } = flask.userData;
  liq.scale.y = Math.max(0.001, k);
  liq.position.y = (lh * Math.max(0.001, k)) / 2;
  liq.visible = k > 0.002;
}

// Drops falling from a held dropper into a target.
const dropGeo = new THREE.SphereGeometry(0.004, 8, 6);
const dropMats = new Map();   // one material per drop colour, shared by every drop
async function drops(fromWorld, toWorld, color, n = 3) {
  if (!dropMats.has(color)) dropMats.set(color, mat(color));
  for (let i = 0; i < n; i++) {
    const d = mesh(dropGeo, dropMats.get(color));
    scene.add(d);
    d.position.copy(fromWorld);
    await tween(0.28, (k) => d.position.lerpVectors(fromWorld, toWorld, k), (k) => k * k);
    scene.remove(d);
    sfx.tick();
  }
}
// Bubbles rising in a container (world coords). All bubbles share one geometry and material.
const bubbleGeo = new THREE.SphereGeometry(1, 6, 4);
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
// Free the geometry and materials of a temporary object (for example a one-off flame).
function disposeTree(o) { o.traverse((c) => { c.geometry?.dispose(); if (c.material) [].concat(c.material).forEach((m) => m.dispose()); }); }
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function permutations(a) { return a.length <= 1 ? [a] : a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])); }
// Three answer options: the true arrangement and two others, in random order.
function mcqFromPerm(truth, fmt) {
  const others = shuffle(permutations(truth).filter((p) => p.join() !== truth.join())).slice(0, 2);
  const opts = shuffle([truth, ...others]);
  return { options: opts.map(fmt), correct: opts.indexOf(truth) };
}
function bubbles(baseWorld, height, seconds, r = 0.012) {
  const group = new THREE.Group();
  scene.add(group);
  let elapsed = 0;
  let next = 0;
  return tween(seconds, (k) => {
    const now = k * seconds;
    const dt = now - elapsed; elapsed = now;
    next -= dt;
    if (next <= 0 && k < 0.95) {
      next = 0.07;
      const b = mesh(bubbleGeo, bubbleMat);
      b.scale.setScalar(0.0025 + Math.random() * 0.002);
      b.position.copy(baseWorld).add(new THREE.Vector3((Math.random() - 0.5) * r, 0.005, (Math.random() - 0.5) * r));
      b.userData.v = 0.08 + Math.random() * 0.05;
      group.add(b);
      if (Math.random() < 0.3) sfx.bubble();
    }
    for (const b of [...group.children]) {
      b.position.y += b.userData.v * dt;
      if (b.position.y > baseWorld.y + height) group.remove(b);
    }
  }, (k) => k).then(() => scene.remove(group));
}

// ---------------------------------------------------------------- holding tools
const held = { obj: null, station: null, id: null, hand: null };
const desktopHold = new THREE.Object3D();
desktopHold.position.set(0.16, -0.2, -0.42);
camera.add(desktopHold);

function storeHome(obj) {
  obj.userData.home = { parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone() };
}
// In VR a held tool hangs from the hand's hold anchor (shared/xr-input.js). The anchor stays put if
// tracking drops, so a tool is never hidden or lost when a hand leaves view.
async function pickUp(station, id, hand) {
  const obj = station.objects[id];
  if (held.obj) await putBack();
  held.obj = obj; held.station = station; held.id = id; held.hand = hand;
  const anchor = hand && hand.anchor;
  if (anchor) hand.held = obj;
  const holder = anchor || desktopHold;
  holder.attach(obj);
  const p0 = obj.position.clone(); const q0 = obj.quaternion.clone();
  const p1 = new THREE.Vector3(0, anchor ? -(obj.userData.gripY || 0) : 0, 0);
  const q1 = new THREE.Quaternion();
  sfx.whoosh();
  await tween(0.3, (k) => { obj.position.lerpVectors(p0, p1, k); obj.quaternion.slerpQuaternions(q0, q1, k); });
}
async function putBack() {
  const obj = held.obj; if (!obj) return;
  if (held.hand && held.hand.anchor) held.hand.held = null;
  held.obj = null; held.station = null; held.id = null; held.hand = null;
  const home = obj.userData.home;
  home.parent.attach(obj);
  const p0 = obj.position.clone(); const q0 = obj.quaternion.clone();
  await tween(0.4, (k) => { obj.position.lerpVectors(p0, home.pos, k); obj.quaternion.slerpQuaternions(q0, home.quat, k); });
}
// Move a held tool (world space) so its tip sits at worldPos, upright.
async function bringTo(obj, worldPos, dur = 0.5) {
  scene.attach(obj);
  const p0 = obj.position.clone(); const q0 = obj.quaternion.clone();
  const q1 = new THREE.Quaternion();
  await tween(dur, (k) => { obj.position.lerpVectors(p0, worldPos, k); obj.quaternion.slerpQuaternions(q0, q1, k); });
}
// While a tool is held: its tip (the tool's local origin) near a target means "use it here".
const TOOL_REACH = 0.05;
const _tip = new THREE.Vector3();
function toolTarget() {
  if (!held.obj) return null;
  held.obj.getWorldPosition(_tip);
  return input.nearestTarget(_tip, TOOL_REACH, held.obj);
}
// A pinch (or trigger) by the hand that holds a tool.
function heldPress(p, rayHit) {
  if (p.held === goggles) { dropGoggles(); return; }   // pinch again before reaching the face: put them down
  if (!held.obj || held.hand !== p) { p.held = null; return; }
  const t = toolTarget() || input.nearestTarget(p.pinchPoint, input.TUNING.grabRadius, held.obj);
  if (t) {
    if (t.obj.userData.interactive?.id === held.id && t.obj !== held.obj) { putBack(); return; }  // back on its bottle
    return activate(t.obj, p);
  }
  if (rayHit) return activate(rayHit.root, p);
  putBack();   // pinch in empty air: put the tool back
}

const _box = new THREE.Box3(), _bc = new THREE.Vector3();
function topOf(obj, above = 0.03, out = new THREE.Vector3()) {
  _box.setFromObject(obj); _box.getCenter(_bc);
  return out.set(_bc.x, _box.max.y + above, _bc.z);
}
function baseOf(obj, out = new THREE.Vector3()) {
  _box.setFromObject(obj); _box.getCenter(_bc);
  return out.set(_bc.x, _box.min.y, _bc.z);
}

// ---------------------------------------------------------------- stations
const STATION_RADIUS = 3.1;
const stations = [];
const progress = { goggles: false };

class Station {
  constructor(index, def) {
    this.index = index;
    this.def = def;
    this.objects = {};
    this.score = 0; // 1 if the quiz was right first time
    this.completed = false;
    this.group = new THREE.Group();
    const angle = ((index + 1) / 6) * Math.PI * 2; // slot 0 is the welcome board
    this.angle = angle + Math.PI;
    this.group.position.set(Math.sin(angle) * STATION_RADIUS, 0, Math.cos(angle) * STATION_RADIUS);
    this.group.rotation.y = this.angle;
    scene.add(this.group);
    this.buildBench();
    const n0 = this.group.children.length;
    def.build(this);
    this.apparatus = this.group.children.slice(n0);   // hidden when the learner is far away
    this.near = true;
    for (const o of Object.values(this.objects)) storeHome(o);
    this.reset(true);
  }
  buildBench() {
    const g = this.group;
    g.add(mesh(new THREE.BoxGeometry(2.1, 0.86, 0.8), lam(0x7b8f9c), 0, 0.43, 0));
    g.add(mesh(new THREE.BoxGeometry(2.16, 0.04, 0.86), lam(0x2b3237), 0, 0.88, 0));
    // instruction board behind the bench, tilted slightly back
    const board = new THREE.Group();
    board.position.set(0, 1.62, -0.5);
    board.rotation.x = -0.12;
    g.add(board);
    board.add(mesh(new THREE.BoxGeometry(1.36, 1.0, 0.03), lam(0x23384d), 0, 0, -0.02));
    this.panel = canvasPlane(1.3, 0.94, 820);
    board.add(this.panel.mesh);
    for (const lx of [-0.55, 0.55]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8), lam(0x23384d), lx, 0.65, -0.62));
    // number sign above
    const sign = label(`${this.index + 1}. ${this.def.short}`, { w: 1.1, h: 0.16, bg: this.def.colour, fg: '#fff', font: 'bold 90px system-ui, sans-serif', res: 500 });
    sign.position.set(0, 2.25, -0.52);
    g.add(sign);
    // quiz answer buttons: on the front of the bench, within reach (shown only for the question)
    this.quizButtons = [0, 1, 2].map((i) => {
      const b = button('', 0.36, 0.11, { font: 'bold 22px system-ui, sans-serif' });
      b.position.set(-0.5 + i * 0.4, 1.0, 0.36);
      b.rotation.x = -Math.PI / 2 + 0.8;
      g.add(b);
      makeInteractive(b, { id: 'opt' + i, name: 'Answer ' + 'ABC'[i], station: this });
      b.visible = false;
      return b;
    });
    // control strip along the front edge: restart on the left, bench navigation on the right
    const r = button('↺ Restart bench', 0.26, 0.08, { bg: '#7a8793', font: 'bold 26px system-ui, sans-serif' });
    r.position.set(-0.86, 0.93, 0.34);
    r.rotation.x = -Math.PI / 2 + 0.5;
    g.add(r);
    makeInteractive(r, { id: 'reset', name: 'Restart this practical', station: this });
    const nav = [
      ['◀ Prev', `Go to bench ${((this.index + 4) % 5) + 1}`, () => goToStation((this.index + 4) % 5)],
      ['⌂ Start', 'Go back to the start', () => goHome()],
      ['Next ▶', `Go to bench ${((this.index + 1) % 5) + 1}`, () => goToStation((this.index + 1) % 5)],
    ];
    nav.forEach(([text, name, fn], i) => {
      const b = button(text, 0.12, 0.08, { bg: '#2e5d7a', font: 'bold 24px system-ui, sans-serif' });
      b.position.set(0.585 + i * 0.15, 0.93, 0.34);
      b.rotation.x = -Math.PI / 2 + 0.5;
      g.add(b);
      makeInteractive(b, { id: 'nav' + i, name, action: fn });
    });
    // teleport pad in front of the bench
    const pad = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 32), new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.55 }), 0, 0.01, 1.05);
    g.add(pad);
    const padLabel = label(`Bench ${this.index + 1}`, { w: 0.4, h: 0.1, bg: 'rgba(0,0,0,0)', fg: '#0f5132', font: 'bold 60px system-ui, sans-serif', res: 500 });
    padLabel.rotation.x = -Math.PI / 2; padLabel.position.set(0, 0.025, 1.05);
    g.add(padLabel);
    makeInteractive(pad, { id: 'pad', name: `Go to bench ${this.index + 1}: ${this.def.short}`, action: () => goToStation(this.index), near: false });
    this.pad = pad;
    // "next" arrow
    this.arrow = mesh(new THREE.ConeGeometry(0.025, 0.06, 12), new THREE.MeshBasicMaterial({ color: 0xffc107 }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.userData.noHit = true;
    scene.add(this.arrow);
  }
  add(id, obj, name, x, y, z, { interactive = true, tool = false, alias = null } = {}) {
    obj.position.set(x, y, z);
    this.group.add(obj);
    if (id) this.objects[id] = obj;
    if (interactive) makeInteractive(obj, { id: alias || id, name, station: this, tool });
    return obj;
  }
  addStatic(obj, x, y, z) { obj.position.set(x, y, z); this.group.add(obj); return obj; }
  get step() { return this.def.steps[this.stepIndex]; }
  async reset(initial = false) {
    if (!initial && this.busy) return;
    if (held.station === this) await putBack();
    this.stepIndex = 0;
    this.results = [];
    this.feedback = initial ? '' : 'Practical restarted.';
    this.feedbackKind = 'info';
    this.quiz = null;
    this.predicting = null;
    this.busy = false;
    this.quizButtons.forEach((b) => (b.visible = false));
    if (this.prediction) this.results.push(`Your prediction: ${this.prediction.text}`);
    for (const o of Object.values(this.objects)) {
      const h = o.userData.home;
      if (h && o.parent !== h.parent) h.parent.attach(o);
      if (h) { o.position.copy(h.pos); o.quaternion.copy(h.quat); }
    }
    this.def.reset(this);
    if (this.def.predict && !this.prediction) this.startPrediction();
    this.render();
  }
  // Before the first step, the learner predicts the outcome (once per visit). Any answer is accepted.
  startPrediction() {
    const pr = this.def.predict;
    const order = shuffle([0, 1, 2]);
    this.predicting = { q: pr.q, options: order.map((i) => pr.options[i]), correct: order.indexOf(pr.correct) };
    this.quizButtons.forEach((b, i) => { b.visible = true; b.userData.draw(`${'ABC'[i]}. ${this.predicting.options[i]}`); });
    this.feedback = 'Before you start: make a prediction with the answer buttons at the front of the bench.';
    this.feedbackKind = 'info';
  }
  predictAnswer(i) {
    const pr = this.predicting;
    this.prediction = { text: pr.options[i], right: i === pr.correct };
    this.predicting = null;
    this.quizButtons.forEach((b) => (b.visible = false));
    this.results.push(`Your prediction: ${this.prediction.text}`);
    sfx.good();
    this.say('Prediction noted. Now do the experiment to test it. Next: ' + this.step.text, 'good');
  }
  say(text, kind = 'info') { this.feedback = text; this.feedbackKind = kind; this.render(); }
  arrowTarget() {
    if (this.quiz || this.predicting) return null;
    const s = this.step;
    if (!s) return null;
    if (s.arrow) return this.objects[s.arrow(this)];
    if (s.pick && held.id !== s.pick) return this.objects[s.pick];
    return this.objects[s.target];
  }
  async click(id, hand) {
    if (this.busy) return;
    if (id === 'reset') { sfx.click(); return this.reset(); }
    if (this.predicting) {
      if (id.startsWith('opt')) return this.predictAnswer(parseInt(id.slice(3), 10));
      this.say('First make a prediction: choose an answer with the buttons at the front of the bench.', 'warn');
      return;
    }
    if (this.quiz) {
      if (id.startsWith('opt')) return this.answer(parseInt(id.slice(3), 10));
      this.say('Answer the question on the board with the answer buttons at the front of the bench.');
      return;
    }
    const s = this.step;
    if (!s) return;
    if (s.onClick) {
      this.busy = true;
      try { const r = await s.onClick(this, id, hand); if (r === 'done') this.advance(); } finally { this.busy = false; this.render(); }
      return;
    }
    const isTool = this.objects[id]?.userData && findInteractive(this.objects[id])?.userData.interactive.tool;
    if (s.pick) {
      if (held.id === s.pick && held.station === this) {
        if (id === s.target) return this.run(s);
        if (id === s.pick) { this.say(`You are holding the ${s.pickName}. Now ${useOn(s.targetName)}.`); return; }
      }
      if (id === s.pick || isTool) {
        this.busy = true;
        await pickUp(this, id, hand);
        this.busy = false;
        if (id === s.pick) this.say(`Holding the ${s.pickName}. Now ${useOn(s.targetName)}.`);
        else { sfx.bad(); this.say(`That is not the right tool for this step. You need the ${s.pickName}.`, 'warn'); }
        return;
      }
      if (id === s.target) { sfx.bad(); this.say(`First pick up the ${s.pickName}.`, 'warn'); return; }
    } else if (id === s.target) return this.run(s);
    sfx.bad();
    this.say(`Not yet. Next step: ${s.text}`, 'warn');
  }
  async run(s) {
    this.busy = true;
    sfx.click();
    try {
      if (s.pick) {
        const target = this.objects[s.target];
        const pos = s.place === 'beside' ? baseOf(target).add(new THREE.Vector3(0.0, 0, 0)).add(s.offset(this)) : topOf(target, s.above ?? 0.03);
        await bringTo(this.objects[s.pick], pos);
      }
      await s.run(this);
      if (s.result) this.results.push(typeof s.result === 'function' ? s.result(this) : s.result);
      const next = this.def.steps[this.stepIndex + 1];
      if (s.pick && !(next && next.pick === s.pick)) await putBack();
      else if (s.pick) { // keep holding for the next step
        const hand = held.hand;
        held.obj = null;
        await pickUp(this, s.pick, hand);
      }
      this.advance();
    } finally { this.busy = false; this.render(); }
  }
  advance() {
    this.stepIndex++;
    sfx.good();
    if (this.stepIndex >= this.def.steps.length) this.startQuiz();
    else { if (this.step.enter) this.step.enter(this); this.say('Well done. ' + (this.step.hint || ''), 'good'); }
  }
  startQuiz() {
    const q = this.def.quiz(this);
    this.quiz = { ...q, answered: false, tries: 0 };
    this.quizButtons.forEach((b, i) => { b.visible = true; b.userData.draw(`${'ABC'[i]}. ${q.options[i]}`); });
    this.say('All steps done. Answer the question to finish this practical.', 'good');
  }
  answer(i) {
    const q = this.quiz;
    if (q.answered) return;
    q.tries++;
    if (i === q.correct) {
      q.answered = true;
      if (q.tries === 1) this.score = 1;
      this.completed = true;
      sfx.good();
      this.quizButtons[i].userData.draw(`${'ABC'[i]}. ${q.options[i]}`, '#1e8449');
      const pr = this.prediction && this.def.predict;
      const note = !pr ? '' : this.prediction.right ? ' Your prediction was right.' : ` Your prediction was different: ${this.def.predict.why}`;
      this.say(`Correct! ${q.explain}${note}`, 'good');
      updateWelcome();
    } else {
      sfx.bad();
      this.quizButtons[i].userData.draw(`${'ABC'[i]}. ${q.options[i]}`, '#a93226');
      this.say('Not quite. Look at your results and try another answer.', 'warn');
    }
  }
  render() {
    const { ctx, c } = this.panel;
    const W = c.width, H = c.height;
    const d = this.def;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fbfcfd'; roundRect(ctx, 0, 0, W, H, 18); ctx.fill();
    ctx.fillStyle = d.colour; roundRect(ctx, 0, 0, W, 92, 18); ctx.fill(); ctx.fillRect(0, 60, W, 32);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = 'bold 50px system-ui, sans-serif';
    ctx.fillText(`${this.index + 1}. ${d.title}`, 26, 62);
    ctx.font = 'bold 26px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(d.subject, W - 26, 58);
    ctx.textAlign = 'left';
    let y = 132;
    ctx.fillStyle = '#13293d'; ctx.font = 'italic 27px system-ui, sans-serif';
    y = wrapText(ctx, 'Aim: ' + d.aim, 26, y, W - 52, 33);
    y += 6;
    ctx.font = 'bold 29px system-ui, sans-serif'; ctx.fillStyle = '#13293d';
    ctx.fillText('Method', 26, y); y += 36;
    d.steps.forEach((s, i) => {
      const done = i < this.stepIndex, cur = i === this.stepIndex && !this.quiz;
      ctx.font = (cur ? 'bold ' : '') + '27px system-ui, sans-serif';
      const text = `${done ? '✓' : cur ? '▶' : '•'} ${i + 1}. ${s.text}`;
      const lines = wrapText(ctx, text, 30, y, W - 70, 32, false) - y;
      if (cur) { ctx.fillStyle = '#ffe9a6'; roundRect(ctx, 16, y - 27, W - 32, lines + 4, 8); ctx.fill(); }
      ctx.fillStyle = done ? '#1e8449' : cur ? '#13293d' : '#6c7a86';
      y = wrapText(ctx, text, 30, y, W - 70, 32);
    });
    y += 6;
    ctx.fillStyle = '#13293d'; ctx.font = 'bold 29px system-ui, sans-serif';
    ctx.fillText('Results', 26, y); y += 34;
    ctx.font = '26px system-ui, sans-serif'; ctx.fillStyle = '#1b4f72';
    const results = this.def.liveResults ? this.def.liveResults(this) : this.results;
    if (!results.length) { ctx.fillStyle = '#8795a1'; ctx.fillText('(your observations will appear here)', 30, y); y += 32; }
    for (const r of results) y = wrapText(ctx, '• ' + r, 30, y, W - 60, 30);
    // quiz or feedback at the bottom
    const qq = this.quiz || this.predicting;
    const boxH = qq ? 150 : 84;
    const by = H - boxH - 14;
    if (qq) {
      ctx.fillStyle = '#e8f1fa'; roundRect(ctx, 14, by - 4, W - 28, boxH + 4 - 0, 12); ctx.fill();
      ctx.fillStyle = '#13293d'; ctx.font = 'bold 27px system-ui, sans-serif';
      let qy = wrapText(ctx, (this.quiz ? 'Question: ' : '') + qq.q, 28, by + 30, W - 56, 31);
      ctx.font = '25px system-ui, sans-serif';
      ctx.fillStyle = this.feedbackKind === 'good' ? '#1e8449' : this.feedbackKind === 'warn' ? '#a93226' : '#13293d';
      wrapText(ctx, this.feedback, 28, qy + 4, W - 56, 28);
    } else {
      const col = { info: '#e8f1fa', good: '#e3f4ea', warn: '#fdecea' }[this.feedbackKind] || '#e8f1fa';
      ctx.fillStyle = col; roundRect(ctx, 14, by, W - 28, boxH, 12); ctx.fill();
      ctx.fillStyle = '#13293d'; ctx.font = '26px system-ui, sans-serif';
      const msg = this.feedback || (this.step ? 'Follow the yellow arrow. Next: ' + this.step.text : '');
      wrapText(ctx, msg, 28, by + 34, W - 56, 30);
    }
    this.panel.update();
  }
}

// ---------------------------------------------------------------- the five practicals
const rnd = (a, b) => a + Math.random() * (b - a);

// 1. FOOD TESTS
const foodTests = {
  short: 'Food tests', title: 'Food tests', subject: 'Biology / Combined Sci.', colour: '#2e7d32',
  aim: 'Test three foods for starch, reducing sugar and protein.',
  predict: { q: 'Predict: egg white is mostly protein. What colour will it turn with biuret reagent?', options: ['Purple (violet)', 'Blue-black', 'Brick-red'], correct: 0,
    why: 'Biuret reagent turns purple with protein. Blue-black is the iodine test for starch, and brick-red is the Benedict\'s test for sugar.' },
  build(st) {
    st.addStatic(rack(3), -0.05, 0.9, 0.05);
    const A = st.add('tubeA', testTube({ color: 0xf2f0e6, level: 0.4 }), 'Tube A: maize-meal (sadza) suspension', -0.135, 0.92, 0.05);
    const B = st.add('tubeB', testTube({ color: 0xfaf3d2, level: 0.4, opacity: 0.5 }), 'Tube B: glucose solution', -0.05, 0.92, 0.05);
    const C = st.add('tubeC', testTube({ color: 0xf6f1d8, level: 0.4, opacity: 0.75 }), 'Tube C: egg-white solution', 0.035, 0.92, 0.05);
    ['A', 'B', 'C'].forEach((t, i) => { const l = label(t, { w: 0.04, h: 0.04, font: 'bold 30px system-ui' }); st.addStatic(l, -0.135 + i * 0.085, 0.955, 0.1); });
    const reagents = [['iodine', 'Iodine solution', 0x7a3b12, -0.55], ['benedicts', "Benedict's solution", 0x2f6fd6, -0.4], ['biuret', 'Biuret reagent', 0x4a7fd0, -0.25]];
    for (const [id, name, colr, x] of reagents) {
      st.add(id + 'Bottle', bottle(colr, name.split(' ')[0]), name, x, 0.9, 0.12, { alias: id, tool: true });
      st.add(id, dropper(colr), name + ' (dropper)', x, 0.97, 0.12, { tool: true });
    }
    // water bath: beaker on tripod over a burner
    st.addStatic(tripod(0.15), 0.42, 0.9, 0.0);
    st.add('burner', burner(), 'Bunsen burner', 0.42, 0.9, 0.0, { interactive: false });
    st.add('bath', beaker(0.055, 0.1, 0xcfe8ff, 0.6), 'Water bath (hot water)', 0.42, 1.055, 0.0);
  },
  reset(st) {
    const o = st.objects;
    o.tubeA.userData.tube.liqMat.color.set(0xf2f0e6); o.tubeB.userData.tube.liqMat.color.set(0xfaf3d2); o.tubeC.userData.tube.liqMat.color.set(0xf6f1d8);
    for (const t of [o.tubeA, o.tubeB, o.tubeC]) { setPpt(t, 0); setLevel(t, 0.4); }
    o.burner.userData.flame.visible = false;
  },
  steps: [
    { text: 'Add iodine solution to tube A (maize meal).', pick: 'iodine', pickName: 'iodine dropper', target: 'tubeA', targetName: 'tube A',
      async run(st) { const t = st.objects.tubeA; await drops(st.objects.iodine.getWorldPosition(new THREE.Vector3()), topOf(t, -0.05), 0x7a3b12); await colorTo(t.userData.tube.liqMat, 0x14143a, 1.2); },
      result: 'A + iodine: brown → BLUE-BLACK. Starch is present.' },
    { text: "Add Benedict's solution to tube B (glucose).", pick: 'benedicts', pickName: "Benedict's dropper", target: 'tubeB', targetName: 'tube B',
      async run(st) { const t = st.objects.tubeB; await drops(st.objects.benedicts.getWorldPosition(new THREE.Vector3()), topOf(t, -0.05), 0x2f6fd6, 4); setLevel(t, 0.5); await colorTo(t.userData.tube.liqMat, 0x2f6fd6, 0.8); t.userData.tube.liqMat.opacity = 0.85; },
      result: "B + Benedict's: blue solution (no heat yet)." },
    { text: 'Heat tube B in the hot water bath.', target: 'tubeB', hint: 'Watch the colour change carefully.',
      async run(st) {
        const t = st.objects.tubeB; const bath = st.objects.bath;
        st.objects.burner.userData.flame.visible = true;
        const p0 = t.position.clone();
        const above = bath.position.clone().add(new THREE.Vector3(0, 0.12, 0));
        const inBath = bath.position.clone().add(new THREE.Vector3(0, 0.01, 0));
        await tween(0.5, (k) => t.position.lerpVectors(p0, above, k));
        await tween(0.4, (k) => t.position.lerpVectors(above, inBath, k));
        const m = t.userData.tube.liqMat;
        bubbles(bath.localToWorld(new THREE.Vector3(0.02, 0.005, 0)), 0.055, 4.2, 0.06);
        for (const c of [0x3f9a5a, 0xc9c22b, 0xe08a1e, 0xb5401f]) await colorTo(m, c, 1.0);
        setPpt(t, 0.12, 0xa8381a);
        await tween(0.4, (k) => t.position.lerpVectors(inBath, above, k));
        await tween(0.5, (k) => t.position.lerpVectors(above, p0, k));
        st.objects.burner.userData.flame.visible = false;
      },
      result: 'B heated: blue → green → yellow → orange → BRICK-RED precipitate. Reducing sugar is present.' },
    { text: 'Add biuret reagent to tube C (egg white).', pick: 'biuret', pickName: 'biuret dropper', target: 'tubeC', targetName: 'tube C',
      async run(st) { const t = st.objects.tubeC; await drops(st.objects.biuret.getWorldPosition(new THREE.Vector3()), topOf(t, -0.05), 0x4a7fd0, 4); await colorTo(t.userData.tube.liqMat, 0x7b3fa6, 1.4); },
      result: 'C + biuret: blue → PURPLE (violet). Protein is present.' },
  ],
  quiz: () => ({ q: 'Which food test must be heated in a water bath before you can see the result?', options: ['Iodine test for starch', "Benedict's test for reducing sugar", 'Biuret test for protein'], correct: 1, explain: "Benedict's solution only gives the brick-red precipitate after heating." }),
};

// 2. ACID–BASE TITRATION
// The burette tap is pinched and held to run acid in (or held with the trigger, the ray, or the
// mouse button); a quick pinch adds one drop. There is no digital reading: the learner reads the
// scale in the close-up beside the burette, at the bottom of the meniscus.
const ML_PER_M = 100;            // 0.01 m of burette per cm³
const FLOW_RATE = 1.5;           // cm³ per second with the tap held open
const QUICK_TAP = 0.3;           // a pinch shorter than this adds one drop (0.05 cm³)
const titration = {
  short: 'Titration', title: 'Acid–base titration', subject: 'Chemistry', colour: '#1565c0',
  aim: 'Find the volume of 0.100 mol/dm³ HCl that neutralises 25.0 cm³ of NaOH, then work out the NaOH concentration.',
  predict: { q: 'Predict: what will the methyl orange in the flask do as you add the acid?',
    options: ['Stay yellow, then turn orange at the end point', 'Turn pink, then colourless', 'Stay the same colour all the way'], correct: 0,
    why: 'Methyl orange is yellow in alkali and turns orange at neutral, then red in excess acid.' },
  build(st) {
    const X = -0.28;   // the burette stands just left of centre, so the tap is within easy reach
    st.addStatic(stand(0.95), X, 0.9, 0.0);
    const bur = new THREE.Group();
    bur.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.62, 14, 1, true), glassMat, 0, 0.31, 0));
    const lm = mat(0xe6f0ff, { transparent: true, opacity: 0.6 });
    const liq = mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 1, 12), lm);
    bur.add(liq);
    bur.add(mesh(new THREE.CylinderGeometry(0.0025, 0.001, 0.05, 8), glassMat, 0, -0.035, 0));
    // graduations: one strip with a tick every 1 cm³ and numbers every 5 cm³ (0 at the top)
    const sc = document.createElement('canvas'); sc.width = 48; sc.height = 1200;
    const sx = sc.getContext('2d');
    sx.fillStyle = '#111'; sx.font = 'bold 20px system-ui, sans-serif'; sx.textBaseline = 'middle';
    for (let v = 0; v <= 50; v++) {
      const y = 10 + v * (1180 / 50);
      sx.fillRect(0, y - 1, v % 5 ? 12 : 22, 2);
      if (v % 5 === 0) sx.fillText(String(v), 24, y);
    }
    const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
    const strip = mesh(new THREE.PlaneGeometry(0.012, 0.5 * 1200 / 1180), new THREE.MeshBasicMaterial({ map: stex, transparent: true }), 0.004, 0.59 - 0.25 - 0.5 * 10 / 1180, 0.0095);
    strip.userData.noHit = true;
    bur.add(strip);
    bur.userData.liq = liq;
    st.add('burette', bur, 'Burette (0.100 mol/dm³ HCl)', X, 1.2, 0.07, { interactive: false });
    st.addStatic(mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), mat(0x39424a)), X, 1.7, 0.03);
    // tap: pinch and hold to open it
    const tap = new THREE.Group();
    tap.add(mesh(new THREE.BoxGeometry(0.05, 0.014, 0.014), mat(0xd35400)));
    tap.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ visible: false })));
    st.add('tapKnob', tap, null, X, 1.16, 0.075, { interactive: false });
    makeInteractive(tap, { id: 'tapKnob', name: 'Burette tap: hold to run acid in, quick pinch for one drop', station: st, near: false });
    tap.userData.hold = { start: (p) => titration.tapStart(st, p), end: () => titration.tapEnd(st) };
    input.addNearTarget(tap, { onPinch: (p) => titration.tapStart(st, p), onDrag: () => {}, onRelease: () => titration.tapEnd(st) });
    // the acid stream while the tap is open
    const stream = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6), new THREE.MeshBasicMaterial({ color: 0xcfe3ff, transparent: true, opacity: 0.7 }));
    stream.userData.noHit = true; stream.visible = false;
    const streamHolder = new THREE.Group(); streamHolder.add(stream);   // the holder is what distance-hiding toggles
    st.addStatic(streamHolder, X, 0, 0.07);
    st.stream = stream;
    st.addStatic(mesh(new THREE.BoxGeometry(0.16, 0.006, 0.16), mat(0xffffff)), X, 0.903, 0.07); // white tile
    st.add('flask', conicalFlask(0xffffff), 'Conical flask', X, 0.906, 0.07);
    const pip = new THREE.Group();
    pip.add(mesh(new THREE.CylinderGeometry(0.003, 0.001, 0.12, 8), glassMat, 0, 0.06, 0));
    pip.add(mesh(new THREE.SphereGeometry(0.012, 12, 8), glassMat, 0, 0.15, 0));
    pip.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 8), glassMat, 0, 0.22, 0));
    pip.add(mesh(new THREE.SphereGeometry(0.013, 12, 8), mat(0x2e86c1), 0, 0.29, 0)); // pipette filler
    pip.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.15, 0));
    pip.rotation.z = Math.PI / 2;
    pip.userData.gripY = 0.2;
    st.add('pipette', pip, '25.0 cm³ pipette', -0.5, 0.915, 0.27, { tool: true });
    st.add('naohBeaker', beaker(0.04, 0.08, 0xeef6ff, 0.6), 'Beaker of NaOH(aq)', -0.66, 0.9, 0.08, { alias: 'pipette', tool: true });
    st.add('moBottle', bottle(0xe67e22, 'Methyl orange'), 'Methyl orange indicator', 0.02, 0.9, 0.1, { alias: 'mo', tool: true });
    st.add('mo', dropper(0xe67e22), 'Methyl orange (dropper)', 0.02, 0.97, 0.1, { tool: true });
    const b3 = button('Stop & record end point', 0.3, 0.1, { bg: '#2e7d32', font: 'bold 26px system-ui, sans-serif' });
    b3.rotation.x = -Math.PI / 2 + 0.6;
    st.add('record', b3, 'Record the end point', 0.3, 0.95, 0.25);
    // close-up of the scale beside the burette, at about eye level
    const zoom = canvasPlane(0.15, 0.22, 1400);
    zoom.mesh.position.set(X + 0.17, 1.28, 0.07);
    zoom.mesh.rotation.y = -0.25;
    zoom.mesh.userData.noHit = true;
    st.group.add(zoom.mesh);
    st.zoom = zoom;
  },
  reset(st) {
    st.v = 0;
    if (st.rough == null) st.endpoint = Math.round(rnd(20.5, 25.5) * 20) / 20; // multiple of 0.05
    st.final = null;
    st.tap = null; st.flash = 0; st.stream.visible = false;
    if (st.rough != null) st.results.push(`Rough titre: about ${st.rough.toFixed(1)} cm³ (went past the end point). Run in to about ${(st.rough - 1).toFixed(1)} cm³, then add single drops.`);
    setFlaskFill(st.objects.flask, 0);
    st.objects.flask.userData.liqMat.color.set(0xffffff);
    this.updateBurette(st);
    st.objects.tapKnob.rotation.z = 0;
  },
  updateBurette(st) {
    const liq = st.objects.burette.userData.liq;
    const h = Math.max(0.0001, 0.59 - st.v / ML_PER_M);
    liq.scale.y = h; liq.position.y = h / 2;
    this.drawZoom(st);
  },
  // Magnified scale around the liquid surface: 0.1 cm³ ticks, numbers increase downwards.
  drawZoom(st) {
    const v = st.final ?? st.v;
    if (st.zoomDrawn === v) return;
    st.zoomDrawn = v;
    const { ctx, c } = st.zoom;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#23384d'; roundRect(ctx, 0, 0, W, H, 16); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Close-up of the scale', W / 2, 22);
    const top = 34, bot = H - 26, tubeL = 22, tubeR = W - 22;
    const span = 2.4, pxPer = (bot - top) / span, v0 = v - span / 2;
    const yOf = (x) => top + (x - v0) * pxPer;
    ctx.save(); ctx.beginPath(); ctx.rect(tubeL, top, tubeR - tubeL, bot - top); ctx.clip();
    ctx.fillStyle = '#eef5fb'; ctx.fillRect(tubeL, top, tubeR - tubeL, bot - top);
    // liquid below the meniscus, with the curved surface (its bottom sits at the reading)
    const ym = yOf(v), cup = 0.12 * pxPer;
    ctx.fillStyle = '#9cc7ec';
    ctx.beginPath(); ctx.moveTo(tubeL, ym - cup); ctx.quadraticCurveTo((tubeL + tubeR) / 2, ym + cup, tubeR, ym - cup);
    ctx.lineTo(tubeR, bot); ctx.lineTo(tubeL, bot); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#1b4f72'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tubeL, ym - cup); ctx.quadraticCurveTo((tubeL + tubeR) / 2, ym + cup, tubeR, ym - cup); ctx.stroke();
    // graduations
    ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.font = 'bold 16px system-ui, sans-serif';
    for (let k = Math.floor(v0 * 10) - 1; k <= Math.ceil((v0 + span) * 10) + 1; k++) {
      const x = k / 10; if (x < -1e-6 || x > 50.0001) continue;
      const y = yOf(x);
      const major = k % 10 === 0, half = k % 5 === 0;
      ctx.fillRect(tubeL, y - 1, major ? 46 : half ? 32 : 20, 2);
      if (major) ctx.fillText(String(Math.round(x)), tubeL + 52, y + 6);
    }
    ctx.restore();
    ctx.strokeStyle = '#9aa7b2'; ctx.lineWidth = 2; ctx.strokeRect(tubeL, top, tubeR - tubeL, bot - top);
    ctx.fillStyle = '#c9d6e1'; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Read at the bottom of the curve', W / 2, H - 8);
    st.zoom.update();
  },
  flaskColour(st) {
    const d = st.v - st.endpoint;
    if (d < -1e-6) return 0xf4c20d; // yellow: still alkaline
    if (d < 0.051) return 0xf0850f; // orange: end point
    return 0xd81b3c; // red: too much acid
  },
  canPour(st) { return !!(st.step && st.step.pour && !st.busy && !st.quiz && !st.predicting && st.final == null); },
  tapStart(st, p) {
    ac();
    if (st.tap) return;
    if (!this.canPour(st)) {
      if (st.final != null || st.quiz) st.say('The titration is finished. Press "Restart bench" to do it again.');
      else if (st.predicting) st.say('First make a prediction with the answer buttons at the front of the bench.', 'warn');
      else if (st.step) { sfx.bad(); st.say(`Not yet. Next step: ${st.step.text}`, 'warn'); }
      return;
    }
    st.tap = { t0: time, flowing: false, p };
    st.objects.tapKnob.rotation.z = Math.PI / 2;
    sfx.click();
  },
  tapEnd(st) {
    const tap = st.tap; if (!tap) return;
    st.tap = null;
    st.objects.tapKnob.rotation.z = 0;
    st.stream.visible = false;
    if (!tap.flowing) {   // a quick pinch: one drop
      st.v = Math.round((st.v + 0.05) * 100) / 100;
      this.updateBurette(st);
      const from = st.objects.burette.localToWorld(new THREE.Vector3(0, -0.06, 0));
      drops(from, topOf(st.objects.flask, -0.12), 0xe6f0ff, 1).then(() => { this.landed(st); this.feedback(st); });
    } else this.feedback(st);
  },
  // Acid landing in the flask near the end point flashes orange, then swirls back to yellow.
  landed(st) { if (st.v > st.endpoint - 1.0 && st.v < st.endpoint - 1e-6) st.flash = 1; },
  feedback(st) {
    if (st.final != null) return;
    const d = st.v - st.endpoint;
    if (d > 0.051) {
      sfx.bad();
      st.rough = st.v;
      st.say(`Too far: the flask is red (excess acid). Your rough titre is about ${st.v.toFixed(1)} cm³. Press "Restart bench", run in to about ${(st.v - 1).toFixed(1)} cm³, then add single drops.`, 'warn');
    } else if (d > -1e-6) st.say('ORANGE! That is the end point. Press the green "Stop & record end point" button.', 'good');
    else if (st.v > st.endpoint - 1.0) st.say('Orange flashes where the acid lands, then yellow again: you are close! Add single drops now (quick pinches).', 'info');
    else st.say('Still yellow. Keep adding acid: hold the tap open, and watch for orange flashes.', 'info');
  },
  tick(st, dt) {
    if (st.tap && !st.tap.flowing && time - st.tap.t0 > QUICK_TAP) st.tap.flowing = true;
    if (st.tap && st.tap.flowing) {
      st.v = Math.min(50, st.v + FLOW_RATE * dt);
      this.updateBurette(st);
      this.landed(st);
      const tipY = 1.2 - 0.06, surf = 0.906 + 0.05;
      st.stream.visible = true; st.stream.scale.y = tipY - surf; st.stream.position.y = (tipY + surf) / 2;
      if (st.v - st.endpoint > 0.051 && !st.tap.warned) { st.tap.warned = true; this.feedback(st); }
    }
    if (st.stepIndex >= 2 && st.final == null && !st.quiz) {
      st.flash = Math.max(0, st.flash - dt * 1.6);
      const m = st.objects.flask.userData.liqMat;
      m.color.setHex(this.flaskColour(st)).lerp(_orange, st.flash);
    }
  },
  liveResults(st) {
    const r = [...st.results];
    if (st.stepIndex >= 2 && st.final == null) r.push('Initial burette reading: 0.00 cm³. Read the close-up beside the burette as you go.');
    if (st.final != null && st.stepIndex >= 4) r.push(`Titre = ${st.final.toFixed(2)} cm³.  Moles HCl = 0.100 × ${st.final.toFixed(2)}/1000 = ${(0.1 * st.final / 1000).toFixed(5)} mol.`);
    return r;
  },
  steps: [
    { text: 'Use the pipette to put 25.0 cm³ of NaOH into the conical flask.', pick: 'pipette', pickName: 'pipette', target: 'flask', targetName: 'the conical flask', above: 0.02,
      async run(st) { await tween(1.4, (k) => setFlaskFill(st.objects.flask, k)); },
      result: '25.0 cm³ of NaOH(aq) pipetted into the flask.' },
    { text: 'Add 2–3 drops of methyl orange indicator to the flask.', pick: 'mo', pickName: 'methyl orange dropper', target: 'flask', targetName: 'the conical flask',
      async run(st) { await drops(st.objects.mo.getWorldPosition(new THREE.Vector3()), topOf(st.objects.flask, -0.12), 0xe67e22, 3); await colorTo(st.objects.flask.userData.liqMat, 0xf4c20d, 0.8); },
      result: 'Methyl orange is YELLOW in the alkali.' },
    { text: 'Hold the orange burette tap open to run acid in. When you see orange flashes, use quick pinches for single drops. Stop at the first permanent ORANGE and press the green button.',
      pour: true, arrow: (st) => (st.v >= st.endpoint - 1e-6 && st.v - st.endpoint < 0.051 ? 'record' : 'tapKnob'),
      async onClick(st, id) {
        if (id === 'record') {
          const d = st.v - st.endpoint;
          if (d < -1e-6) { sfx.bad(); st.say('Not yet: the solution is still yellow, so it is still alkaline. Add more acid.', 'warn'); return; }
          if (d > 0.051) { sfx.bad(); st.say('The flask is red: you went past the end point. Press "Restart bench" for a fresh flask.', 'warn'); return; }
          st.final = Math.round(st.v * 20) / 20;   // burettes are read to the nearest 0.05 cm³
          st.rough = null;
          titration.drawZoom(st);
          st.objects.flask.userData.liqMat.color.setHex(0xf0850f);
          return 'done';
        }
        if (id === 'tapKnob') return;   // the tap works by holding it (see tapStart / tapEnd)
        sfx.bad(); st.say('Hold the orange tap on the burette to add acid, then press the green button to stop.', 'warn');
      } },
    { text: 'Read the burette: look at the close-up and choose the reading at the bottom of the meniscus.', arrow: () => null,
      enter(st) {
        const r = st.final;
        st.readOpts = shuffle([r, Math.max(0, r - 0.1), r + 0.1]);
        st.quizButtons.forEach((b, i) => { b.visible = true; b.userData.draw(`${'ABC'[i]}. ${st.readOpts[i].toFixed(2)} cm³`); });
      },
      async onClick(st, id) {
        if (!id.startsWith('opt')) { st.say('Choose the burette reading with the answer buttons at the front of the bench.', 'warn'); return; }
        const i = parseInt(id.slice(3), 10), x = st.readOpts[i], r = st.final;
        if (Math.abs(x - r) < 1e-6) {
          st.quizButtons.forEach((b) => (b.visible = false));
          st.results.push(`Final reading ${r.toFixed(2)} cm³ (bottom of the meniscus). Titre = ${r.toFixed(2)} − 0.00 = ${r.toFixed(2)} cm³.`);
          return 'done';
        }
        sfx.bad();
        st.quizButtons[i].userData.draw(`${'ABC'[i]}. ${x.toFixed(2)} cm³`, '#a93226');
        st.say(x < r
          ? 'Too small. Burette numbers increase DOWNWARDS, so the reading at the bottom of the curve is a bigger number. Look at the close-up again.'
          : 'Too big. Read at the bottom of the curved surface (the meniscus), with your eye level with it, not below it.', 'warn');
      } },
  ],
  quiz: (st) => {
    const t = st.final;
    const right = (0.1 * t / 25);
    const wrong1 = (0.1 * 25 / t);
    const wrong2 = (0.1 * t / 1000);
    const f = (x) => x.toPrecision(3) + ' mol/dm³';
    return { q: `NaOH + HCl → NaCl + H₂O. Your titre was ${t.toFixed(2)} cm³ of 0.100 mol/dm³ HCl for 25.0 cm³ NaOH. What is the NaOH concentration?`,
      options: [f(wrong1), f(right), f(wrong2)], correct: 1, explain: `c = (0.100 × ${t.toFixed(2)}) ÷ 25.0 = ${right.toPrecision(3)} mol/dm³ (1 : 1 ratio).` };
  },
};
const _orange = new THREE.Color(0xf0850f);

// 3. GAS TESTS
// The three gases are shuffled each time the bench restarts. Any test can be used on any tube,
// and negative results are recorded too. The bench is done when all three gases are identified.
const GASES = { H2: 'H₂', O2: 'O₂', CO2: 'CO₂' };
const GAS_TOOLS = { lit: 'lighted splint', glow: 'glowing splint', limewater: 'limewater tube' };
const GAS_FOR_TOOL = { lit: 'H2', glow: 'O2', limewater: 'CO2' };
const gasTests = {
  short: 'Gas tests', title: 'Tests for gases', subject: 'Chemistry', colour: '#ef6c00',
  aim: 'Identify three unknown gases (1, 2 and 3) using a lighted splint, a glowing splint and limewater.',
  predict: { q: 'Predict: which gas will relight a glowing splint?', options: ['Oxygen', 'Hydrogen', 'Carbon dioxide'], correct: 0,
    why: 'Oxygen helps things burn, so a glowing splint bursts back into flame.' },
  build(st) {
    st.addStatic(rack(3, 0.09), -0.05, 0.9, 0.0);
    for (let i = 0; i < 3; i++) {
      const t = testTube({ r: 0.021, h: 0.15, level: 0 });
      const bung = mesh(new THREE.CylinderGeometry(0.02, 0.017, 0.022, 14), mat(0xb03a2e), 0, 0.155, 0);
      t.add(bung); t.userData.bung = bung;
      st.add('gas' + (i + 1), t, `Gas ${i + 1} (colourless, stoppered)`, -0.14 + i * 0.09, 0.92, 0.0);
      const l = label(String(i + 1), { w: 0.04, h: 0.04, font: 'bold 30px system-ui' });
      st.addStatic(l, -0.14 + i * 0.09, 0.955, 0.05);
    }
    st.add('burner', burner(), 'Bunsen burner (lit)', -0.6, 0.9, 0.1, { interactive: false });
    const s1 = splint(); s1.rotation.z = Math.PI / 2;
    st.add('lit', s1, 'Lighted splint', -0.42, 0.91, 0.22, { tool: true });
    const s2 = splint(); s2.rotation.z = Math.PI / 2;
    st.add('glow', s2, 'Glowing splint', -0.42, 0.91, 0.3, { tool: true });
    const lw = testTube({ r: 0.018, h: 0.15, color: 0xeef6f8, level: 0.5, opacity: 0.45 });
    lw.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8), new THREE.MeshBasicMaterial({ visible: false }), 0, 0.08, 0));
    lw.userData.gripY = 0.11;
    st.add('limewater', lw, 'Limewater (calcium hydroxide solution)', 0.35, 0.91, 0.12, { tool: true });
    st.addStatic(rack(1, 0.07), 0.35, 0.89, 0.12);
  },
  reset(st) {
    const o = st.objects;
    st.gases = shuffle(['H2', 'O2', 'CO2']);
    st.found = new Set(); st.tested = new Set();
    for (let i = 1; i <= 3; i++) { const b = o['gas' + i].userData.bung; b.position.set(0, 0.155, 0); b.rotation.set(0, 0, 0); b.visible = true; }
    this.lightTools(st);
    this.freshLimewater(st);
    o.burner.userData.flame.visible = true;
  },
  lightTools(st) {
    const o = st.objects;
    o.lit.userData.flame.visible = true; o.lit.userData.ember.visible = false; o.lit.userData.flame.scale.setScalar(1);
    o.glow.userData.flame.visible = false; o.glow.userData.ember.visible = true; o.glow.userData.flame.scale.setScalar(1);
  },
  freshLimewater(st) { const m = st.objects.limewater.userData.tube.liqMat; m.color.set(0xeef6f8); m.opacity = 0.45; },
  // Runs one test and returns { text, positive }.
  async runTest(st, tool, gas, n) {
    const o = st.objects, tube = o['gas' + n];
    const b = tube.userData.bung;
    await tween(0.25, (k) => { b.position.y = 0.155 + k * 0.06; b.position.x = k * 0.03; b.rotation.z = k; });
    b.visible = false;
    let res;
    if (tool === 'lit') {
      const f = o.lit.userData.flame;
      if (gas === 'H2') {
        sfx.pop();
        const fl = flame(2.4, 0xffd27a); fl.position.copy(topOf(tube, -0.02)); scene.add(fl);
        await tween(0.35, (k) => { fl.scale.setScalar(1 + k); fl.userData.outer.material.opacity = 0.6 * (1 - k); });
        scene.remove(fl); disposeTree(fl);
        f.visible = false; o.lit.userData.ember.visible = true;
        res = { text: `Gas ${n} + lighted splint: burns with a SQUEAKY POP.`, positive: true };
      } else if (gas === 'O2') {
        await tween(0.5, (k) => f.scale.setScalar(1 + k)); await wait(0.5);
        res = { text: `Gas ${n} + lighted splint: burns more brightly, but no pop.`, positive: false };
      } else {
        f.visible = false; o.lit.userData.ember.visible = true; await wait(0.7);
        res = { text: `Gas ${n} + lighted splint: the flame goes out.`, positive: false };
      }
    } else if (tool === 'glow') {
      const ud = o.glow.userData;
      await wait(0.6);
      if (gas === 'O2') {
        ud.ember.visible = false; ud.flame.visible = true;
        await tween(0.5, (k) => ud.flame.scale.setScalar(0.5 + k));
        sfx.good(); await wait(0.6);
        res = { text: `Gas ${n} + glowing splint: RELIGHTS.`, positive: true };
      } else {
        ud.ember.visible = gas === 'H2'; await wait(0.5);
        res = { text: `Gas ${n} + glowing splint: ${gas === 'H2' ? 'does not relight' : 'goes out'}.`, positive: false };
      }
    } else {
      this.freshLimewater(st);
      const lw = o.limewater;
      const a = topOf(tube, -0.01), bpt = lw.localToWorld(new THREE.Vector3(0, 0.02, 0));
      const pipe = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6), glassMat);
      pipe.position.copy(a).add(bpt).multiplyScalar(0.5); pipe.scale.y = a.distanceTo(bpt);
      pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bpt.clone().sub(a).normalize());
      scene.add(pipe);
      const m = lw.userData.tube.liqMat;
      bubbles(bpt, 0.06, 2.5, 0.01);
      if (gas === 'CO2') await tween(2.5, (k) => { m.color.lerpColors(_clear, _milky, k); m.opacity = 0.45 + 0.5 * k; });
      else await wait(2.5);
      scene.remove(pipe); pipe.geometry.dispose();
      res = gas === 'CO2' ? { text: `Gas ${n} bubbled through limewater: turns MILKY.`, positive: true }
        : { text: `Gas ${n} bubbled through limewater: stays clear.`, positive: false };
    }
    b.visible = true; b.position.set(0, 0.155, 0); b.rotation.set(0, 0, 0);   // stopper the tube again
    return res;
  },
  steps: [
    { text: 'Test the gases. Use any test on any tube, until you have identified all three.',
      arrow(st) {
        const holding = held.obj && held.station === st ? held.id : null;
        if (!holding) return Object.keys(GAS_TOOLS).find((t) => !st.found.has(GAS_FOR_TOOL[t])) || null;
        for (let i = 1; i <= 3; i++) if (!st.tested.has(`${holding}:${i}`) && !st.found.has(st.gases[i - 1])) return 'gas' + i;
        return null;
      },
      async onClick(st, id, hand) {
        if (GAS_TOOLS[id]) {
          if (held.obj && held.id === id && held.station === st) { st.say(`You are holding the ${GAS_TOOLS[id]}. Now ${useOn('one of the gas tubes')}.`); return; }
          await pickUp(st, id, hand);
          st.say(`Holding the ${GAS_TOOLS[id]}. Now ${useOn('one of the gas tubes')}.`);
          return;
        }
        const m = /^gas(\d)$/.exec(id);
        if (!m) { sfx.bad(); st.say('Pick up a test (a splint or the limewater), then use it on a gas tube.', 'warn'); return; }
        if (!held.obj || held.station !== st) { sfx.bad(); st.say('First pick up a test: the lighted splint, the glowing splint or the limewater.', 'warn'); return; }
        const n = +m[1], tool = held.id, gas = st.gases[n - 1], target = st.objects[id];
        sfx.click();
        const pos = tool === 'limewater' ? baseOf(target).add(new THREE.Vector3(0, 0.08, 0.06)) : topOf(target, tool === 'lit' ? 0.015 : -0.04);
        await bringTo(st.objects[tool], pos);
        const res = await gasTests.runTest(st, tool, gas, n);
        const key = `${tool}:${n}`;
        if (!st.tested.has(key)) { st.tested.add(key); st.results.push(res.text); }
        if (res.positive) st.found.add(gas);
        const h = held.hand; held.obj = null;
        await pickUp(st, tool, h);   // keep holding the tool
        gasTests.lightTools(st);       // splints are relit or blown out again at the burner
        if (st.found.size === 3) { await putBack(); return 'done'; }
        const left = 3 - st.found.size;
        if (res.positive) { sfx.good(); st.say(`A positive test! ${left} gas${left > 1 ? 'es' : ''} still to identify.`, 'good'); }
        else st.say('A negative result: this test does not identify that gas. Note it, then try another test.', 'info');
      } },
  ],
  quiz: (st) => {
    const fmt = (p) => p.map((g, i) => `${i + 1} = ${GASES[g]}`).join(', ');
    const { options, correct } = mcqFromPerm(st.gases, fmt);
    return { q: 'From your results, which identification is correct?', options, correct,
      explain: 'Hydrogen pops with a lighted splint, oxygen relights a glowing splint, carbon dioxide turns limewater milky.' };
  },
};
const _clear = new THREE.Color(0xeef6f8), _milky = new THREE.Color(0xf4f4ee);

// 4. IDENTIFYING CATIONS WITH NaOH(aq)
// The ions are shuffled each time the bench restarts, and the tubes can be tested in any order.
const IONS = {
  Cu: { f: 'Cu²⁺', sol: 0x8fc9f0, ppt: 0x3c8fd8, pptName: 'light BLUE precipitate' },
  Fe2: { f: 'Fe²⁺', sol: 0xc9e3b5, ppt: 0x4c6b3a, pptName: 'dirty GREEN precipitate' },
  Fe3: { f: 'Fe³⁺', sol: 0xe0b25a, ppt: 0x8a3a12, pptName: 'RED-BROWN precipitate' },
};
const ionTests = {
  short: 'Ion tests', title: 'Identifying metal ions', subject: 'Chemistry', colour: '#6a1b9a',
  aim: 'Add aqueous sodium hydroxide to three unknown solutions (P, Q, R) and use the precipitate colour to identify the metal ion.',
  predict: { q: 'Predict: copper compounds are often blue. What colour precipitate will Cu²⁺ give with NaOH?', options: ['Light blue', 'Red-brown', 'White'], correct: 0,
    why: 'Copper(II) hydroxide is a light blue solid.' },
  build(st) {
    st.addStatic(rack(3), -0.05, 0.9, 0.05);
    ['P', 'Q', 'R'].forEach((n, i) => {
      st.add('tube' + n, testTube({ color: 0xffffff, level: 0.35, opacity: 0.6 }), `Solution ${n}`, -0.135 + i * 0.085, 0.92, 0.05);
      const l = label(n, { w: 0.04, h: 0.04, font: 'bold 30px system-ui' });
      st.addStatic(l, -0.135 + i * 0.085, 0.955, 0.1);
    });
    st.add('naohBottle', bottle(0xe8f0f6, 'NaOH(aq)'), 'Sodium hydroxide solution', -0.4, 0.9, 0.12, { alias: 'naoh', tool: true });
    st.add('naoh', dropper(0xe8f0f6), 'Sodium hydroxide (dropper)', -0.4, 0.97, 0.12, { tool: true });
  },
  reset(st) {
    st.ions = shuffle(['Cu', 'Fe2', 'Fe3']);
    st.tested = new Set();
    'PQR'.split('').forEach((n, i) => { const t = st.objects['tube' + n]; t.userData.tube.liqMat.color.set(IONS[st.ions[i]].sol); t.userData.tube.liqMat.opacity = 0.6; setPpt(t, 0); setLevel(t, 0.35); });
  },
  steps: [
    { text: 'Add NaOH(aq) drop by drop to each solution, P, Q and R, in any order. Note the colour of each precipitate.',
      arrow(st) {
        if (!(held.obj && held.id === 'naoh' && held.station === st)) return 'naoh';
        return ['P', 'Q', 'R'].map((n) => 'tube' + n).find((id) => !st.tested.has(id)) || null;
      },
      async onClick(st, id, hand) {
        const holding = held.obj && held.id === 'naoh' && held.station === st;
        if (id === 'naoh') {
          if (holding) { st.say(`You are holding the sodium hydroxide dropper. Now ${useOn('a solution')}.`); return; }
          await pickUp(st, 'naoh', hand);
          st.say(`Holding the sodium hydroxide dropper. Now ${useOn('solution P, Q or R')}.`);
          return;
        }
        const m = /^tube([PQR])$/.exec(id);
        if (!m) { sfx.bad(); st.say('Pick up the sodium hydroxide dropper, then use it on a solution.', 'warn'); return; }
        if (!holding) { sfx.bad(); st.say('First pick up the sodium hydroxide dropper.', 'warn'); return; }
        if (st.tested.has(id)) { st.say(`You have already tested solution ${m[1]}. Try one you have not tested yet.`); return; }
        const n = m[1], ion = IONS[st.ions['PQR'.indexOf(n)]], t = st.objects[id];
        sfx.click();
        await bringTo(st.objects.naoh, topOf(t, 0.03));
        await drops(st.objects.naoh.getWorldPosition(new THREE.Vector3()), topOf(t, -0.06), 0xe8f0f6, 4);
        setLevel(t, 0.42);
        const lc = t.userData.tube.liqMat.color.clone(); const pc = new THREE.Color(ion.ppt);
        await tween(1.4, (k) => { setPpt(t, 0.18 * k, ion.ppt); t.userData.tube.liqMat.color.lerpColors(lc, pc, k * 0.7); t.userData.tube.liqMat.opacity = 0.6 + 0.3 * k; });
        st.tested.add(id);
        st.results.push(`${n}: ${ion.pptName}, insoluble in excess NaOH.`);
        const h = held.hand; held.obj = null;
        await pickUp(st, 'naoh', h);
        if (st.tested.size === 3) { await putBack(); return 'done'; }
        sfx.good(); st.say(`Note the colour. ${3 - st.tested.size} solution${st.tested.size === 2 ? '' : 's'} still to test.`, 'good');
      } },
  ],
  quiz: (st) => {
    const fmt = (p) => p.map((ion, i) => `${'PQR'[i]} = ${IONS[ion].f}`).join(', ');
    const { options, correct } = mcqFromPerm(st.ions, fmt);
    return { q: 'Which ions were in P, Q and R?', options, correct,
      explain: 'Cu²⁺ gives a light blue, Fe²⁺ a green, and Fe³⁺ a red-brown hydroxide precipitate.' };
  },
};

// 5. SIMPLE PENDULUM
// Pinch the bob, pull it aside (up to 15°) and let go: it swings in real time. Time 10 swings with
// the stopwatch buttons. Three lengths give a T² against L graph, and g comes from its gradient.
const G = 9.81;
const PEND_LENGTHS = [0.2, 0.4, 0.8];
const MAX_SWING = 15 * Math.PI / 180;
const PIVOT = new THREE.Vector3(-0.2, 0.9 + 0.95, 0.1);
const pendulum = {
  short: 'Pendulum', title: 'The simple pendulum', subject: 'Physics', colour: '#00838f',
  aim: 'Find how the period T of a pendulum depends on its length L, and use a graph of T² against L to find g.',
  predict: { q: 'Predict: if the pendulum is made 4 times longer, what happens to the time of one swing (the period)?',
    options: ['It doubles', 'It becomes 4 times longer', 'It stays the same'], correct: 0,
    why: 'T = 2π√(L/g), so 4 times the length gives √4 = 2 times the period.' },
  build(st) {
    st.addStatic(stand(1.0), PIVOT.x - 0.12, 0.9, PIVOT.z + 0.07);
    st.addStatic(mesh(new THREE.BoxGeometry(0.15, 0.02, 0.03), mat(0x39424a)), PIVOT.x - 0.06, PIVOT.y, PIVOT.z);
    const pivot = new THREE.Group();
    st.add('pivot', pivot, null, PIVOT.x, PIVOT.y, PIVOT.z, { interactive: false });
    const str = mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 4), mat(0xffffff));
    const bob = mesh(new THREE.SphereGeometry(0.025, 18, 14), mat(0xb7950b, { metalness: 0.7, roughness: 0.3 }));
    const col = mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    bob.add(col);
    pivot.add(str, bob);
    st.objects.bob = bob;
    makeInteractive(bob, { id: 'bob', name: 'Pendulum bob: pinch, pull aside and let go', station: st, near: false });
    input.addNearTarget(bob, { onPinch: (p) => pendulum.grab(st, p), onDrag: () => {}, onRelease: () => pendulum.letGo(st) });
    st.pend = { str, bob, pivot };
    // marker behind the lowest point: count a swing each time the bob passes it the same way
    const marker = mesh(new THREE.BoxGeometry(0.003, 0.1, 0.003), new THREE.MeshBasicMaterial({ color: 0xd32f2f }));
    marker.userData.noHit = true;
    st.addStatic(marker, PIVOT.x, PIVOT.y - 0.4, PIVOT.z - 0.05);
    st.pend.marker = marker;
    const rule = mesh(new THREE.BoxGeometry(0.03, 0.9, 0.004), mat(0xf3e2a9), PIVOT.x + 0.08, PIVOT.y - 0.45, PIVOT.z - 0.01);
    st.group.add(rule);
    for (let i = 0; i <= 9; i++) st.group.add(mesh(new THREE.BoxGeometry(0.015, 0.002, 0.002), mat(0x222222), PIVOT.x + 0.07, PIVOT.y - i * 0.1, PIVOT.z - 0.007));
    PEND_LENGTHS.forEach((L, i) => {
      const b = button(`Set L = ${L.toFixed(2)} m`, 0.26, 0.09, { bg: '#00838f', font: 'bold 28px system-ui, sans-serif' });
      b.rotation.x = -Math.PI / 2 + 0.6;
      st.add('len' + i, b, `Set length to ${L.toFixed(2)} m`, -0.1 + i * 0.3, 0.95, 0.25);
    });
    // stopwatch: display with Start/Stop and Reset buttons beside the pendulum
    const disp = canvasPlane(0.3, 0.11, 1400);
    disp.mesh.position.set(0.22, 1.13, -0.02);
    disp.mesh.rotation.x = -0.35;
    st.group.add(disp.mesh);
    st.display = disp;
    const ws = button('Start / Stop', 0.17, 0.08, { bg: '#1f6fb2', font: 'bold 26px system-ui, sans-serif' });
    ws.rotation.x = -Math.PI / 2 + 0.6;
    st.add('watch', ws, 'Stopwatch: start or stop', 0.13, 0.98, 0.1);
    const wr = button('Reset', 0.11, 0.08, { bg: '#5b6b78', font: 'bold 26px system-ui, sans-serif' });
    wr.rotation.x = -Math.PI / 2 + 0.6;
    st.add('watchReset', wr, 'Stopwatch: reset to zero', 0.31, 0.98, 0.1);
    // T² against L graph
    const graph = canvasPlane(0.36, 0.27, 1400);
    graph.mesh.position.set(0.5, 1.2, -0.2);
    graph.mesh.rotation.y = -0.3;
    st.group.add(graph.mesh);
    st.graph = graph;
  },
  setLength(st, L) {
    st.L = L;
    const { str, bob, marker } = st.pend;
    str.scale.y = L; str.position.y = -L / 2;
    bob.position.y = -L;
    marker.position.y = PIVOT.y - L;
  },
  swingTo(st, theta) { st.swing.theta = theta; st.pend.pivot.rotation.z = theta; },
  grab(st, p) {
    ac();
    if (st.busy) return;
    st.swing.grab = p; st.swing.on = false; st.swing.omega = 0; st.swing.warned = false;
  },
  letGo(st) {
    if (!st.swing.grab) return;
    st.swing.grab = null;
    if (Math.abs(st.swing.theta) < 0.03) { this.swingTo(st, 0); st.say('Pull the bob a little to one side, then let go.'); return; }
    st.swing.on = true; st.swing.omega = 0;
    if (st.step?.timing) st.say('Swinging! Start the stopwatch as the bob passes the red marker, count 10 swings, then stop it.', 'info');
  },
  tick(st, dt) {
    dt *= window.lab?.speed || 1;
    st.clock += dt;
    const s = st.swing;
    if (s.grab) {
      const local = st.group.worldToLocal(_pp.copy(s.grab.pinchPoint));
      let a = Math.atan2(local.x - PIVOT.x, -(local.y - PIVOT.y));
      if (Math.abs(a) > MAX_SWING + 0.05 && !s.warned) { s.warned = true; st.say('Keep the angle small (15° or less), or the period changes.', 'warn'); }
      a = THREE.MathUtils.clamp(a, -MAX_SWING, MAX_SWING);
      this.swingTo(st, a);
    } else if (s.on) {
      const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
      for (let i = 0; i < n; i++) { s.omega += (-(G / st.L) * Math.sin(s.theta) - 0.015 * s.omega) * h; s.theta += s.omega * h; }
      st.pend.pivot.rotation.z = s.theta;
    }
    const w = st.watch;
    if (w.running && st.clock - w.drawn > 0.03) { w.drawn = st.clock; this.drawWatch(st); }
  },
  watchTime(st) { const w = st.watch; return w.acc + (w.running ? st.clock - w.t0 : 0); },
  drawWatch(st) {
    const { ctx, c } = st.display;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#10202e'; roundRect(ctx, 0, 0, c.width, c.height, 14); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fe2bf'; ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`Stopwatch     L = ${st.L.toFixed(2)} m`, c.width / 2, 40);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 76px ui-monospace, monospace';
    ctx.fillText(`${this.watchTime(st).toFixed(2)} s`, c.width / 2, 125);
    st.display.update();
  },
  gradient(st) {
    if (st.trials.length < 2) return null;
    let sxy = 0, sxx = 0;
    for (const tr of st.trials) { sxy += tr.L * tr.T * tr.T; sxx += tr.L * tr.L; }
    return sxy / sxx;   // best line through the origin
  },
  drawGraph(st) {
    const { ctx, c } = st.graph;
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#fbfcfd'; roundRect(ctx, 0, 0, W, H, 14); ctx.fill();
    ctx.fillStyle = '#13293d'; ctx.font = 'bold 26px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('T² against L', W / 2, 34);
    const x0 = 80, y0 = H - 60, x1 = W - 30, y1 = 56, Lmax = 1.0, Tmax = 4.0;
    const px = (L) => x0 + (L / Lmax) * (x1 - x0), py = (t2) => y0 - (t2 / Tmax) * (y0 - y1);
    ctx.strokeStyle = '#d5dde4'; ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(x0, py(i)); ctx.lineTo(x1, py(i)); ctx.stroke(); }
    for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.moveTo(px(i * 0.2), y0); ctx.lineTo(px(i * 0.2), y1); ctx.stroke(); }
    ctx.strokeStyle = '#13293d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    ctx.font = '20px system-ui, sans-serif'; ctx.fillStyle = '#13293d';
    for (let i = 0; i <= 5; i++) ctx.fillText((i * 0.2).toFixed(1), px(i * 0.2), y0 + 24);
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) ctx.fillText(String(i), x0 - 8, py(i) + 7);
    ctx.textAlign = 'center'; ctx.fillText('L / m', (x0 + x1) / 2, H - 10);
    ctx.save(); ctx.translate(22, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('T² / s²', 0, 0); ctx.restore();
    const k = this.gradient(st);
    if (k) {
      ctx.strokeStyle = '#00838f'; ctx.lineWidth = 3;
      const Lend = Math.min(Lmax, Tmax / k);
      ctx.beginPath(); ctx.moveTo(px(0), py(0)); ctx.lineTo(px(Lend), py(k * Lend)); ctx.stroke();
    }
    ctx.fillStyle = '#c0392b';
    for (const tr of st.trials) { ctx.beginPath(); ctx.arc(px(tr.L), py(tr.T * tr.T), 8, 0, Math.PI * 2); ctx.fill(); }
    st.graph.update();
  },
  reset(st) {
    st.trials = [];
    st.clock = 0;
    st.swing = { theta: 0, omega: 0, on: false, grab: null };
    st.watch = { running: false, t0: 0, acc: 0, drawn: 0 };
    st.pend.pivot.rotation.z = 0;
    this.setLength(st, 0.3);
    this.drawWatch(st);
    this.drawGraph(st);
  },
  liveResults(st) {
    const r = [...st.results, ...st.trials.map((tr) => `L = ${tr.L.toFixed(2)} m:  t(10) = ${tr.t10.toFixed(2)} s,  T = ${tr.T.toFixed(3)} s,  T² = ${(tr.T * tr.T).toFixed(3)} s²`)];
    const k = this.gradient(st);
    if (k) r.push(`Gradient of T² against L = ${k.toFixed(2)} s²/m, so g = 4π² ÷ gradient = ${(4 * Math.PI * Math.PI / k).toFixed(2)} m/s²`);
    return r;
  },
  steps: [],
  quiz: () => ({ q: 'Why do we time 10 oscillations and divide by 10, instead of timing just one swing?',
    options: ['The bob slows down after one swing', 'It reduces the effect of reaction-time error', 'It makes the period longer'], correct: 1,
    explain: 'Your reaction time error (about 0.2 s) is the same whether you time 1 or 10 swings, so it becomes a much smaller fraction of the total.' }),
};
const _pp = new THREE.Vector3();
PEND_LENGTHS.forEach((L, i) => {
  pendulum.steps.push({ text: `Set the length to L = ${L.toFixed(2)} m.`, target: 'len' + i,
    async run(st) {
      const L0 = st.L; sfx.whoosh();
      st.swing.on = false; st.swing.grab = null; pendulum.swingTo(st, 0);
      Object.assign(st.watch, { running: false, acc: 0 });
      await tween(0.8, (k) => pendulum.setLength(st, L0 + (L - L0) * k));
      pendulum.drawWatch(st);
    } });
  pendulum.steps.push({ text: 'Pull the bob aside (15° or less) and let go. Use the stopwatch to time 10 complete swings.', timing: true,
    hint: 'Start the stopwatch as the bob passes the red marker and count "nought". Then count 1, 2, … 10 each time it passes going the same way.',
    arrow: (st) => (st.swing.on ? 'watch' : 'bob'),
    async onClick(st, id) {
      const w = st.watch;
      if (id === 'bob') {   // pointing (or clicking) pulls the bob to 10° and lets go
        st.swing.on = false; st.swing.grab = null;
        const p = st.pend.pivot, a0 = p.rotation.z;
        await tween(0.6, (k) => pendulum.swingTo(st, a0 + (0.17 - a0) * k));
        st.swing.on = true; st.swing.omega = 0;
        st.say('Swinging! Start the stopwatch as the bob passes the red marker, count 10 swings, then stop it.', 'info');
        return;
      }
      if (id === 'watchReset') { Object.assign(w, { running: false, acc: 0 }); pendulum.drawWatch(st); sfx.click(); return; }
      if (id !== 'watch') { sfx.bad(); st.say('Set the pendulum swinging, then use the Start / Stop button to time 10 swings.', 'warn'); return; }
      sfx.click();
      if (!w.running) {
        if (w.acc > 0) { st.say('Press Reset first, so the stopwatch starts from zero.', 'warn'); return; }
        w.running = true; w.t0 = st.clock; w.drawn = 0;
        if (!st.swing.on) st.say('The stopwatch is running, but the pendulum is not swinging yet.', 'warn');
        return;
      }
      w.acc += st.clock - w.t0; w.running = false;
      pendulum.drawWatch(st);
      const t = w.acc, expect = 10 * 2 * Math.PI * Math.sqrt(st.L / G);
      if (!st.swing.on) { sfx.bad(); st.say('The pendulum was not swinging. Set it swinging, press Reset and time it again.', 'warn'); return; }
      if (Math.abs(t - expect) > Math.max(0.5, 0.05 * expect)) {
        sfx.bad();
        st.say(t < expect
          ? `${t.toFixed(2)} s looks too short for 10 swings. Did you count "one" as you started? Count "nought" at the start. Press Reset and try again.`
          : `${t.toFixed(2)} s looks too long for 10 swings: you may have counted 11 or more. Press Reset and try again.`, 'warn');
        return;
      }
      st.trials.push({ L: st.L, t10: t, T: t / 10 });
      pendulum.drawGraph(st);
      return 'done';
    } });
});

// ---------------------------------------------------------------- welcome board (start point)
const welcome = canvasPlane(1.6, 1.15, 640);
const welcomeGroup = new THREE.Group();
welcomeGroup.position.set(0, 0, STATION_RADIUS);
welcomeGroup.rotation.y = Math.PI;
scene.add(welcomeGroup);
welcomeGroup.add(mesh(new THREE.BoxGeometry(1.68, 1.23, 0.04), mat(0x23384d), 0, 1.62, -0.03));
welcome.mesh.position.set(0, 1.62, 0);
welcomeGroup.add(welcome.mesh);
welcomeGroup.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), mat(0x23384d), 0, 0.5, -0.05));
// start table in front of the board: bench buttons, smooth-walk switch and the goggles, all within reach
welcomeGroup.add(mesh(new THREE.BoxGeometry(1.8, 0.86, 0.45), lam(0x7b8f9c), 0, 0.43, 0.55));
const goggles = new THREE.Group();
goggles.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 20), mat(0x2e86c1), -0.035, 0, 0));
goggles.add(mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 20), mat(0x2e86c1), 0.035, 0, 0));
goggles.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), new THREE.MeshBasicMaterial({ visible: false })));
goggles.rotation.x = -Math.PI / 2 + 0.3;
goggles.position.set(0.45, 0.9, 0.68);
welcomeGroup.add(goggles);
const gogglesHome = { pos: goggles.position.clone(), quat: goggles.quaternion.clone() };
function putOnGoggles() {
  progress.goggles = true; goggles.visible = false; sfx.good(); updateWelcome();
  if (gogglesHand) { gogglesHand.held = null; gogglesHand = null; }
}
// Pointing at the goggles (or clicking) puts them on at once. Pinching them close up picks them up:
// bring them to your face to put them on, which teaches pick-up before the first practical.
let gogglesHand = null;
makeInteractive(goggles, { id: 'goggles', name: 'Safety goggles: put them on', action: putOnGoggles, near: false });
input.addNearTarget(goggles, { onPinch: (p) => {
  if (progress.goggles) return;
  gogglesHand = p; p.held = goggles;
  p.anchor.attach(goggles);
  const p0 = goggles.position.clone(), q0 = goggles.quaternion.clone();
  tween(0.25, (k) => { goggles.position.lerpVectors(p0, new THREE.Vector3(0, 0, 0), k); goggles.quaternion.slerpQuaternions(q0, new THREE.Quaternion(), k); });
} });
function dropGoggles() {
  if (!gogglesHand) return;
  gogglesHand.held = null; gogglesHand = null;
  welcomeGroup.attach(goggles);
  goggles.position.copy(gogglesHome.pos); goggles.quaternion.copy(gogglesHome.quat);
}
const gArrow = mesh(new THREE.ConeGeometry(0.03, 0.07, 12), new THREE.MeshBasicMaterial({ color: 0xffc107 }));
gArrow.rotation.x = Math.PI; gArrow.userData.noHit = true;
scene.add(gArrow);
// smooth walking (left thumbstick) is off unless the learner turns it on
const walkBtn = button('', 0.34, 0.08, { bg: '#5b6b78', font: 'bold 24px system-ui, sans-serif' });
walkBtn.position.set(-0.45, 0.93, 0.66);
walkBtn.rotation.x = -Math.PI / 2 + 0.5;
welcomeGroup.add(walkBtn);
makeInteractive(walkBtn, { id: 'walk', name: 'Smooth walking with the left thumbstick', action: () => { settings.smoothWalk = !settings.smoothWalk; drawWalkBtn(); } });
function drawWalkBtn() { walkBtn.userData.draw(`Thumbstick walking: ${settings.smoothWalk ? 'ON' : 'OFF'}`, settings.smoothWalk ? '#1e8449' : '#5b6b78'); }
drawWalkBtn();
// "go to bench" buttons on the start table
const goButtons = [];
function updateWelcome() {
  const { ctx, c } = welcome;
  const W = c.width, H = c.height;
  const k = input.kind;
  const w = inputWords(k);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fbfcfd'; roundRect(ctx, 0, 0, W, H, 18); ctx.fill();
  ctx.fillStyle = '#1d4e6e'; roundRect(ctx, 0, 0, W, 100, 18); ctx.fill(); ctx.fillRect(0, 70, W, 30);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 50px system-ui, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Welcome to the O-Level Science Lab', 28, 66);
  ctx.fillStyle = '#13293d'; ctx.font = '28px system-ui, sans-serif';
  let y = 150;
  y = wrapText(ctx, 'Carry out five core O-Level practicals. Each bench has a board with the method, your results and a question at the end.', 28, y, W - 56, 34);
  y += 8;
  ctx.font = 'bold 28px system-ui, sans-serif'; ctx.fillText('How to use the lab', 28, y); y += 36;
  ctx.font = '26px system-ui, sans-serif';
  const lines = k === 'hand' ? [
    'TOUCH buttons with your fingertip. PINCH a tool to pick it up; it stays in your hand.',
    'Bring the tool to its target and PINCH again to use it. Pinch in empty air to put it back.',
    'For things out of reach, point with your hand and PINCH. Follow the YELLOW ARROW.',
    'Use the bench buttons (Prev, Start, Next) or a green floor pad to move between benches.',
  ] : k === 'controller' ? [
    'TOUCH buttons with the controller tip, or point and pull the TRIGGER.',
    'Pull the trigger or squeeze the GRIP on a tool to pick it up. Use it the same way at the target.',
    'Follow the YELLOW ARROW: it shows what to use next.',
    'Move with the bench buttons or a green floor pad. Right thumbstick turns you.',
  ] : [
    'Click things to use them. Follow the YELLOW ARROW: it shows what to use next.',
    'In VR you can use your hands: touch buttons, pinch tools to pick them up, pinch again to use them.',
    'Drag to look around. Keys 1 to 5 jump to a bench, H returns here.',
  ];
  for (const line of lines) y = wrapText(ctx, '• ' + line, 34, y, W - 70, 31);
  y += 10;
  ctx.fillStyle = progress.goggles ? '#1e8449' : '#a93226'; ctx.font = 'bold 28px system-ui, sans-serif';
  const gog = k === 'hand' ? 'PINCH the goggles on the table and bring them up to your face.'
    : k === 'controller' ? 'Point at the GOGGLES on the table and pull the trigger.' : 'Click the GOGGLES on the table to put them on.';
  y = wrapText(ctx, progress.goggles ? '✓ Safety goggles on. Choose a bench with the buttons on the table.' : 'Safety first: ' + gog, 28, y, W - 56, 34);
  y += 6;
  ctx.fillStyle = '#13293d'; ctx.font = 'bold 28px system-ui, sans-serif';
  const done = stations.filter((s) => s.completed).length;
  const score = stations.reduce((a, s) => a + s.score, 0);
  ctx.fillText(`Progress: ${done}/5 practicals complete   •   First-try answers: ${score}/5`, 28, y);
  welcome.update();
  goButtons.forEach((b, i) => { const s = stations[i]; b.userData.draw(`${s.completed ? '✓ ' : ''}${i + 1}. ${s.def.short}`, s.completed ? '#1e8449' : s.def.colour); });
  updatePageResults();
}
// Results stay on the web page after leaving VR, so a teacher can note them.
function updatePageResults() {
  const el = document.getElementById('results'); if (!el) return;
  const done = stations.filter((s) => s.completed);
  if (!done.length) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<b>Results this visit</b><br>' + stations.map((s, i) =>
    `${i + 1}. ${s.def.short}: ${s.completed ? (s.score ? 'complete, question right first time' : 'complete') : 'not done'}`).join('<br>');
}

// ---------------------------------------------------------------- moving around
const hubPad = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 32), new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.45 }), 0, 0.01, 0);
scene.add(hubPad);
makeInteractive(hubPad, { id: 'hub', name: 'Go to the start (welcome board)', action: () => goHome(), near: false });

const STAND_VR = 0.72;      // in VR the head stands this far from a bench centre: apparatus is 0.45 to 0.7 m away
const STAND_DESKTOP = 1.05;
const HOME_VR = new THREE.Vector3(0, 0, STATION_RADIUS - 1.05);   // just behind the start table
const HOME_DESKTOP = new THREE.Vector3(0, 0, 1.6);
let place = { kind: 'home', index: -1 };

// 150 ms fade through black on every move in VR, so there is no visible jump.
const fadeSphere = mesh(new THREE.SphereGeometry(0.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
fadeSphere.renderOrder = 1002; fadeSphere.visible = false; fadeSphere.userData.noHit = true;
camera.add(fadeSphere);
let fadeBusy = false;
async function fadeMove(fn) {
  if (!renderer.xr.isPresenting || fadeBusy) { fn(); return; }
  fadeBusy = true; fadeSphere.visible = true;
  await tween(0.075, (k) => (fadeSphere.material.opacity = k), (k) => k);
  fn();
  await tween(0.075, (k) => (fadeSphere.material.opacity = 1 - k), (k) => k);
  fadeSphere.visible = false; fadeBusy = false;
}
// Put the learner's head (not the play-space origin) at pos, facing yaw.
function placeRig(pos, yaw) {
  if (renderer.xr.isPresenting) input.placeRig(rig, pos.x, pos.z, yaw);
  else { rig.position.copy(pos); rig.rotation.set(0, yaw, 0); camera.rotation.set(-0.15, 0, 0); }
}
function benchSpot(i) {
  const st = stations[i];
  const p = st.group.localToWorld(new THREE.Vector3(0, 0, renderer.xr.isPresenting ? STAND_VR : STAND_DESKTOP));
  p.y = 0;
  return p;
}
function goToStation(i, instant = false) {
  place = { kind: 'bench', index: i };
  if (gogglesHand) dropGoggles();
  const move = () => placeRig(benchSpot(i), stations[i].angle);
  if (!instant) sfx.whoosh();
  if (instant) move(); else fadeMove(move);
}
function goHome(instant = false) {
  place = { kind: 'home', index: -1 };
  const move = () => placeRig((renderer.xr.isPresenting ? HOME_VR : HOME_DESKTOP).clone(), Math.PI);
  if (instant) move(); else fadeMove(move);
}
// Start in front of the learner, and again when they recentre the headset.
input.onRecenter((head) => {
  input.setLiftFromHead(head);
  if (place.kind === 'bench') goToStation(place.index, true); else goHome(true);
});

// ---------------------------------------------------------------- build stations
[foodTests, titration, gasTests, ionTests, pendulum].forEach((def, i) => stations.push(new Station(i, def)));
stations.forEach((s, i) => {
  const b = button('', 0.28, 0.09, { font: 'bold 30px system-ui, sans-serif' });
  b.position.set(0.66 - i * 0.33, 0.93, 0.5);
  b.rotation.x = -Math.PI / 2 + 0.5;
  welcomeGroup.add(b);
  makeInteractive(b, { id: 'go' + i, name: `Go to bench ${i + 1}: ${s.def.short}`, action: () => goToStation(i) });
  goButtons.push(b);
});
updateWelcome();
goHome(true);

// ---------------------------------------------------------------- VR hover label
function updateXRHover() {
  let root = null, point = null;
  for (const p of input.pointers) {
    if (p.hover) { root = p.hover.root; point = p.hover.point; break; }
    if (p.focus && p.focus.userData.interactive) { root = p.focus; point = topOf(p.focus, 0.0); break; }
  }
  showHover(root, point);
}

// thumbsticks: right = snap turn; left = smooth walk, only if switched on at the start table
let snapReady = true;
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
function updateThumbsticks(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    const gp = src.gamepad; if (!gp || gp.axes.length < 4) continue;
    const x = gp.axes[2], y = gp.axes[3];
    if (src.handedness === 'left') {
      if (settings.smoothWalk && (Math.abs(x) > 0.2 || Math.abs(y) > 0.2)) {
        camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
        _right.set(-_fwd.z, 0, _fwd.x);
        rig.position.addScaledVector(_fwd, -y * 1.4 * dt).addScaledVector(_right, x * 1.4 * dt);
        clampRig();
      }
    } else if (src.handedness === 'right') {
      if (Math.abs(x) > 0.7 && snapReady) { snapTurn(x > 0 ? -Math.PI / 6 : Math.PI / 6); snapReady = false; }
      if (Math.abs(x) < 0.3) snapReady = true;
    }
  }
}
function snapTurn(a) {
  const head = new THREE.Vector3(); camera.getWorldPosition(head);
  rig.position.sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(head);
  rig.rotation.y += a;
}
function clampRig() {
  rig.position.x = THREE.MathUtils.clamp(rig.position.x, -6.5, 6.5);
  rig.position.z = THREE.MathUtils.clamp(rig.position.z, -6.5, 6.5);
}

// ---------------------------------------------------------------- desktop controls
const mouse = new THREE.Vector2();
let drag = null;
let desktopHover = null;
const el = renderer.domElement;
let mouseHold = null;   // something used by holding the mouse button (the burette tap)
el.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: 0 }; el.setPointerCapture(e.pointerId);
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  const h = desktopRay();
  if (h && h.root.userData.hold) { ac(); mouseHold = h.root; drag = null; h.root.userData.hold.start(null); }
});
el.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved > 6) {
      rig.rotation.y -= dx * 0.004;
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.2, 1.2);
    }
  }
});
el.addEventListener('pointerup', () => {
  if (mouseHold) { mouseHold.userData.hold.end(null); mouseHold = null; return; }
  if (drag && drag.moved <= 6) desktopClick();
  drag = null;
});
function desktopRay() {
  raycaster.setFromCamera(mouse, camera);
  return hitTest(raycaster.ray.origin.clone(), raycaster.ray.direction.clone());
}
function desktopClick() { const h = desktopRay(); if (h) activate(h.root, null); }
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (/^Digit[1-5]$/.test(e.code)) goToStation(parseInt(e.code.slice(5), 10) - 1, true);
  if (e.code === 'KeyH') goHome(true);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
function updateDesktop(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (f || s) {
    const yaw = rig.rotation.y;
    rig.position.x += (-Math.sin(yaw) * f + Math.cos(yaw) * s) * 2 * dt;
    rig.position.z += (-Math.cos(yaw) * f - Math.sin(yaw) * s) * 2 * dt;
    clampRig();
  }
  desktopHover = desktopRay();
  showHover(desktopHover?.root, desktopHover?.point);
  el.style.cursor = desktopHover ? 'pointer' : drag ? 'grabbing' : 'grab';
}

document.getElementById('helpToggle')?.addEventListener('click', (e) => {
  const h = document.getElementById('help');
  h.classList.toggle('min');
  e.target.textContent = h.classList.contains('min') ? 'Show help' : 'Hide help';
});
renderer.xr.addEventListener('sessionstart', () => { document.getElementById('help')?.classList.add('min'); camera.rotation.set(0, 0, 0); });
renderer.xr.addEventListener('sessionend', () => {
  if (gogglesHand) dropGoggles();
  rig.position.y = 0;
  if (place.kind === 'bench') goToStation(place.index, true); else goHome(true);
  updateWelcome();
});

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
const _headW = new THREE.Vector3(), _arrowP = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  updateTweens(dt * (window.lab?.speed || 1));
  input.update();
  if (renderer.xr.isPresenting) { updateThumbsticks(dt); updateXRHover(); } else updateDesktop(dt);
  if (gogglesHand) {   // goggles brought up to the face go on
    const hp = camera.getWorldPosition(_tip);
    if (goggles.getWorldPosition(_arrowP).distanceTo(hp) < 0.2) putOnGoggles();
  }
  camera.getWorldPosition(_headW);
  for (const st of stations) {
    st.def.tick?.(st, dt);
    // apparatus more than 2.5 m away is hidden (benches and boards stay), which saves draw calls
    const near = Math.hypot(_headW.x - st.group.position.x, _headW.z - st.group.position.z) < 2.5;
    if (near !== st.near) { st.near = near; }
    for (const o of st.apparatus) if (o.parent === st.group) o.visible = near;
    const t = near ? st.arrowTarget() : null;
    st.arrow.visible = !!t && !st.busy;
    if (t) { topOf(t, 0.07, _arrowP); st.arrow.position.set(_arrowP.x, _arrowP.y + Math.sin(time * 4) * 0.015, _arrowP.z); }
  }
  gArrow.visible = !progress.goggles;
  if (gArrow.visible) { goggles.getWorldPosition(_arrowP); gArrow.position.set(_arrowP.x, _arrowP.y + 0.1 + Math.sin(time * 4) * 0.015, _arrowP.z); }
  renderer.render(scene, camera);
  hud.update();
});

// Test hook (used by the automated browser test; harmless for players).
window.lab = { stations, goToStation, goHome, held, progress, activateById(stIndex, id) { return stations[stIndex].click(id, null); }, scene, camera, rig, THREE,
  input, interactables, settings, heldPress, toolTarget, renderer, titration, pendulum, gasTests, ionTests };
