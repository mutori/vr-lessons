// Light Up the Village: a circuits game for Grades 5 to 7 (ZIMSEC Science and Technology,
// Electricity and Electronics, with Energy and Fuels: solar energy).
// Five missions on one workbench. Every bulb, pump and spark comes from a real circuit
// calculation (nodal analysis), so whatever the learner builds behaves like the real thing.
// Runs in the Meta Quest Browser (WebXR, hands first, controllers too) and on a computer.
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
scene.background = new THREE.Color(0xa9d8f2);
scene.fog = new THREE.Fog(0xcfe6f2, 30, 70);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 120);
camera.position.set(0, 1.35, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const hemi = new THREE.HemisphereLight(0xffffff, 0x9a6a4a, 2.0);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff2d8, 1.6);
sunLight.position.set(6, 10, 3);
scene.add(sunLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- small helpers
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let time = 0;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const tweens = [];
function tween(dur, fn, easing = ease) {
  return new Promise((resolve) => tweens.push({ t: 0, dur: Math.max(dur, 0.0001), fn, resolve, easing }));
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(tw.easing(k));
    if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
  }
}
function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function noHit(o) { o.traverse((c) => { c.userData.noHit = true; c.raycast = () => {}; }); return o; }
const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
// Bake the still meshes under root into one mesh per material: far fewer draw calls on the headset.
// Meshes with a texture, transparency, several materials or userData.keep are left alone.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.map || o.material.transparent || !o.material.visible) return;
    for (let a = o; a && a !== root; a = a.parent) if (a.userData.keep) return;
    victims.push(o);
  });
  for (const o of victims) {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(g);
    o.removeFromParent();
  }
  for (const [material, geos] of groups) {
    let n = 0;
    for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let k = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, k * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, k * 3);
      k += g.attributes.position.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.computeBoundingSphere();
    root.add(noHit(new THREE.Mesh(geo, material)));
  }
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
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function wrapText(ctx, text, x, y, maxW, lh, draw = true) {
  for (const l of wrapLines(ctx, text, maxW)) { if (draw) ctx.fillText(l, x, y); y += lh; }
  return y;
}
// A small text tag (sprite) that always faces the viewer.
function tagSprite(text, { scale = 0.05, bg = 'rgba(20,35,50,0.88)', fg = '#fff' } = {}) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  s.userData.draw = (t, b = bg) => {
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 34px system-ui, sans-serif';
    const tw = Math.min(250, ctx.measureText(t).width + 28);
    ctx.fillStyle = b; roundRect(ctx, (256 - tw) / 2, 6, tw, 52, 16); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, 128, 33);
    tex.needsUpdate = true;
  };
  s.userData.draw(text);
  s.scale.set(scale * 4, scale, 1);
  noHit(s);
  return s;
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
  tick: () => tone(2000, 0.02, 'square', 0.02),
  pick: () => tone(520, 0.07, 'sine', 0.1, 780),
  snap: () => { tone(900, 0.04, 'square', 0.05); tone(1300, 0.05, 'square', 0.04, null, 0.03); },
  back: () => tone(600, 0.12, 'sine', 0.06, 300),
  flip: () => tone(1500, 0.03, 'square', 0.05),
  good: () => { tone(660, 0.12, 'sine', 0.15); tone(990, 0.22, 'sine', 0.15, null, 0.1); },
  bad: () => tone(170, 0.25, 'square', 0.07),
  light: () => tone(880, 0.18, 'triangle', 0.08, 1320),
  alarm: () => { tone(880, 0.12, 'square', 0.05); tone(660, 0.12, 'square', 0.05, null, 0.14); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, null, i * 0.12)); },
  splash: () => tone(300 + Math.random() * 200, 0.08, 'sine', 0.04, 700),
};

// ---------------------------------------------------------------- the village (scenery)
const world = { sun: 1, windows: [], tankLevel: 0, garden: null, gauge: null, stream: null, cable: null, cloud: null, sunSprite: null };
const skyTex = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5fa8e0'); gr.addColorStop(0.45, '#a9d8f2'); gr.addColorStop(0.5, '#e8f1ee'); gr.addColorStop(1, '#e8f1ee');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
function buildWorld() {
  const sky = noHit(mesh(new THREE.SphereGeometry(90, 24, 16), skyMat));
  sky.renderOrder = -1;
  scene.add(sky);
  // red-brown soil with grass patches
  const ground = noHit(mesh(new THREE.CircleGeometry(80, 48), lam(0xb06a43)));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const scenery = new THREE.Group();
  scene.add(scenery);
  const grassM = lam(0x86a84e);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 30;
    const g = noHit(mesh(new THREE.CircleGeometry(1 + Math.random() * 2.5, 10), grassM, Math.cos(a) * r, 0.005 + i * 0.0002, Math.sin(a) * r));
    g.rotation.x = -Math.PI / 2; g.scale.y = 0.6;
    scenery.add(g);
  }
  // msasa trees (red and green crowns) and granite kopjes on the horizon
  const trunkM = lam(0x5b3a24), crownMs = [lam(0x6f9a3c), lam(0x9b4a2a), lam(0x7fa04a), lam(0xb0662e)];
  const trunkG = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 6), crownG = new THREE.IcosahedronGeometry(1.6, 0);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2, r = 9 + Math.random() * 12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 2 && Math.abs(x) < 5) continue;   // keep the view behind the player open
    const t = new THREE.Group();
    t.add(mesh(trunkG, trunkM, 0, 1.2, 0));
    const c = mesh(crownG, crownMs[i % 4], 0, 2.8, 0); c.scale.set(1.4, 0.55, 1.4); t.add(c);
    t.position.set(x, 0, z); t.scale.setScalar(0.8 + Math.random() * 0.6);
    scenery.add(noHit(t));
  }
  const rockM = lam(0x8d8a84), rockG = new THREE.DodecahedronGeometry(1, 0);
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + (k - 2.5) * 0.55, r = 34 + Math.random() * 8;
    const kop = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = 1.5 + Math.random() * 3;
      const rk = mesh(rockG, rockM, (Math.random() - 0.5) * 6, s * 0.6, (Math.random() - 0.5) * 4);
      rk.scale.set(s, s * 0.8, s); rk.rotation.set(Math.random(), Math.random(), 0);
      kop.add(rk);
    }
    kop.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scenery.add(noHit(kop));
  }
  // the family's round hut with two lit windows (mission 4)
  const hut = new THREE.Group();
  hut.add(mesh(new THREE.CylinderGeometry(1.5, 1.55, 1.9, 24), lam(0xd9b088), 0, 0.95, 0));
  const roof = mesh(new THREE.ConeGeometry(2.0, 1.5, 24), lam(0xc9a45a), 0, 2.6, 0);
  hut.add(roof);
  hut.add(mesh(new THREE.CylinderGeometry(1.56, 1.6, 0.22, 24), lam(0x6b4a33), 0, 0.11, 0));
  const hutPos = V3(-3.9, 0, -3.1);
  hut.position.copy(hutPos);
  const toPlayer = Math.atan2(-hutPos.x, -hutPos.z);
  hut.rotation.y = toPlayer;
  const door = mesh(new THREE.PlaneGeometry(0.7, 1.4), lam(0x4a2f1c), 0, 0.72, 1.56);
  hut.add(door);
  for (const s of [-1, 1]) {
    const a = s * 0.75;
    const wm = new THREE.MeshBasicMaterial({ color: 0x2b2420 });
    const w = mesh(new THREE.PlaneGeometry(0.42, 0.38), wm, Math.sin(a) * 1.535, 1.15, Math.cos(a) * 1.535);
    w.rotation.y = a;
    const frame = mesh(new THREE.PlaneGeometry(0.5, 0.46), lam(0x5b3a24), Math.sin(a) * 1.53, 1.15, Math.cos(a) * 1.53);
    frame.rotation.y = a;
    hut.add(frame, w);
    const lbl = tagSprite(s < 0 ? 'Room 1' : 'Room 2', { scale: 0.16 });
    lbl.position.set(Math.sin(a) * 1.7, 1.55, Math.cos(a) * 1.7);
    hut.add(lbl);
    world.windows.push({ mat: wm, level: 0 });
  }
  // the windows are numbered from the player's left
  scene.add(noHit(hut));
  mergeStatic(hut);

  // solar panel on a pole, water tank with a level gauge, and a garden (mission 5)
  const panel = new THREE.Group();
  panel.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), lam(0x777b80), 0, 0.9, 0));
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 160;
  const px = pc.getContext('2d');
  px.fillStyle = '#c9ced4'; px.fillRect(0, 0, 256, 160);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { px.fillStyle = '#1d3a78'; px.fillRect(6 + i * 41.5, 6 + j * 38, 38, 34); px.fillStyle = '#2f58a8'; px.fillRect(6 + i * 41.5, 6 + j * 38, 38, 4); }
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
  const face = mesh(new THREE.BoxGeometry(1.2, 0.04, 0.75), [lam(0x999999), lam(0x999999), mat(0xffffff, { map: ptex, roughness: 0.3 }), lam(0x999999), lam(0x999999), lam(0x999999)], 0, 1.85, 0);
  face.rotation.x = 0.5;
  panel.add(face);
  panel.position.set(2.2, 0, -3.6);
  panel.rotation.y = -0.5;
  scene.add(noHit(panel));
  const ptag = tagSprite('Solar panel', { scale: 0.14 });
  ptag.position.set(2.2, 2.5, -3.6);
  scene.add(ptag);

  const tank = new THREE.Group();
  tank.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), lam(0x6b4a33), 0, 0.45, 0));      // brick stand
  tank.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.3, 20), lam(0x2f6b44), 0, 1.55, 0));
  tank.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), lam(0x285a3a), 0, 2.22, 0));
  // gauge: white tube with blue water rising inside, facing the player
  const gauge = new THREE.Group();
  gauge.add(mesh(new THREE.BoxGeometry(0.16, 1.2, 0.02), basic(0xf4f4f0), 0, 0, 0));
  const water = mesh(new THREE.BoxGeometry(0.12, 1.14, 0.025), basic(0x2f8fe0), 0, -0.57, 0.003);
  water.geometry.translate(0, 0.57, 0);
  water.scale.y = 0.001;
  water.userData.keep = true;
  gauge.add(water);
  gauge.position.set(0, 1.55, 0.61);
  tank.add(gauge);
  const pipe = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), lam(0x3c3c3c), -0.25, 2.35, 0);
  pipe.rotation.z = Math.PI / 2;
  tank.add(pipe);
  const stream = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 8), basic(0x5fb0ff, { transparent: true, opacity: 0.8 }), -0.05, 2.2, 0);
  stream.visible = false;
  stream.userData.keep = true;
  tank.add(stream);
  tank.position.set(4.1, 0, -2.5);
  tank.rotation.y = Math.atan2(-4.1, 2.5);
  scene.add(noHit(tank));
  mergeStatic(tank);
  const ttag = tagSprite('Water tank', { scale: 0.14 });
  ttag.position.set(4.1, 2.65, -2.5);
  scene.add(ttag);
  world.gauge = water; world.stream = stream;

  const garden = new THREE.Group();
  const leafM = lam(0x3f8f3a), leafM2 = lam(0x6cbf3a), bedM = lam(0x7a4a2c);
  const plants = new THREE.Group();
  for (let r = 0; r < 3; r++) {
    garden.add(mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), bedM, 0, 0.06, r * 0.8));
    for (let i = 0; i < 6; i++) {
      const pl = mesh(new THREE.IcosahedronGeometry(0.16, 0), (i + r) % 2 ? leafM : leafM2, -1.0 + i * 0.4, 0.2, r * 0.8);
      pl.scale.set(1, 1.3, 1);
      plants.add(pl);
    }
  }
  plants.userData.keep = true;
  garden.add(plants);
  garden.position.set(4.2, 0, -4.6);
  garden.rotation.y = -0.9;
  scene.add(noHit(garden));
  mergeStatic(garden);
  plants.userData.keep = false;
  mergeStatic(plants);
  world.garden = garden;
  garden.userData.plants = plants;
  setGardenGrowth(0.35);

  // the sun and a cloud that can drift across it
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sx = sc.getContext('2d');
  const sg = sx.createRadialGradient(64, 64, 10, 64, 64, 64);
  sg.addColorStop(0, 'rgba(255,250,220,1)'); sg.addColorStop(0.35, 'rgba(255,230,140,1)'); sg.addColorStop(0.6, 'rgba(255,210,90,0.35)'); sg.addColorStop(1, 'rgba(255,200,80,0)');
  sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
  const stex = new THREE.CanvasTexture(sc); stex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: stex, fog: false, depthWrite: false, transparent: true }));
  sun.position.set(22, 30, -50); sun.scale.setScalar(14);
  scene.add(noHit(sun));
  world.sunSprite = sun;
  const cloud = new THREE.Group();
  const cm = lam(0xffffff, { fog: false });
  [[0, 0, 0, 3.2], [3, -0.6, 0.5, 2.4], [-3, -0.7, 0.3, 2.3], [1.4, 1.2, -0.4, 2.2]].forEach(([x, y, z, s]) => { const p = mesh(new THREE.SphereGeometry(1, 12, 8), cm, x, y, z); p.scale.set(s, s * 0.7, s); cloud.add(p); });
  cloud.visible = false;
  scene.add(noHit(cloud));
  world.cloud = cloud;

  // cable from the solar panel to the workbench (mission 5)
  const curve = new THREE.CatmullRomCurve3([V3(0.27, 0.792, -0.41), V3(0.5, 0.79, -0.52), V3(0.76, 0.6, -0.62), V3(1.2, 0.03, -1.0), V3(2.05, 0.03, -3.3), V3(2.16, 0.4, -3.55), V3(2.18, 1.6, -3.58)]);
  world.cable = noHit(mesh(new THREE.TubeGeometry(curve, 60, 0.012, 6), lam(0x1d1d1d)));
  world.cable.visible = false;
  scene.add(world.cable);
  mergeStatic(scenery);
}
function setGardenGrowth(k) {
  world.garden.userData.growth = k;
  world.garden.userData.plants.scale.set(0.7 + 0.3 * k, k, 0.7 + 0.3 * k);   // plants grow taller
}
let skyMode = 'day';
const SKIES = {
  day: { sky: 0xffffff, bg: 0xa9d8f2, fog: 0xcfe6f2, hemi: 2.0, sun: 1.6 },
  dusk: { sky: 0xf2a37c, bg: 0xe69a73, fog: 0xc7876a, hemi: 0.75, sun: 0.35 },
};
function setSky(name, dur = 2) {
  if (name === skyMode) return;
  skyMode = name;
  const t = SKIES[name];
  const c0 = skyMat.color.clone(), b0 = scene.background.clone(), f0 = scene.fog.color.clone(), h0 = hemi.intensity, s0 = sunLight.intensity;
  const c1 = new THREE.Color(t.sky), b1 = new THREE.Color(t.bg), f1 = new THREE.Color(t.fog);
  tween(dur, (k) => {
    skyMat.color.lerpColors(c0, c1, k); scene.background.lerpColors(b0, b1, k); scene.fog.color.lerpColors(f0, f1, k);
    hemi.intensity = h0 + (t.hemi - h0) * k; sunLight.intensity = s0 + (t.sun - s0) * k;
  });
}
buildWorld();

// ---------------------------------------------------------------- the workbench and circuit board
const TABLE_Y = 0.78;
const S = 0.1;                    // spacing between board terminals (m)
const NX = 5, NZ = 3;             // terminals across and deep
const BOARD_Z = -0.36;
const bench = new THREE.Group();
scene.add(bench);
{
  const wood = lam(0x9a6a3c), dark = lam(0x5e3c22);
  bench.add(mesh(new THREE.BoxGeometry(1.5, 0.05, 0.74), wood, 0, TABLE_Y - 0.025, -0.5));
  for (const [x, z] of [[-0.7, -0.17], [0.7, -0.17], [-0.7, -0.83], [0.7, -0.83]]) bench.add(mesh(new THREE.BoxGeometry(0.05, TABLE_Y - 0.05, 0.05), dark, x, (TABLE_Y - 0.05) / 2, z));
  // left tray
  bench.add(mesh(new THREE.BoxGeometry(0.3, 0.012, 0.34), lam(0x3a5a78), -0.47, TABLE_Y + 0.006, -0.36));
  const tl = tagSprite('Parts tray', { scale: 0.03 }); tl.position.set(-0.47, TABLE_Y + 0.025, -0.555); bench.add(tl);
  // parts bin (removed broken parts go here)
  const bin = new THREE.Group();
  bin.add(mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 14, 1, true), lam(0x56606a, { side: THREE.DoubleSide }), 0, 0.06, 0));
  bin.add(mesh(new THREE.CircleGeometry(0.06, 14), lam(0x3c444b), 0, 0.002, 0).rotateX(-Math.PI / 2));
  bin.position.set(-0.6, TABLE_Y, -0.74);
  bench.add(noHit(bin));
  const bl = tagSprite('Bin', { scale: 0.03 }); bl.position.set(-0.6, TABLE_Y + 0.17, -0.74); bench.add(bl);
  // two baskets for sorting (mission 2)
  for (const [x, t] of [[0.32, 'Conductors'], [0.52, 'Insulators']]) {
    const b = new THREE.Group();
    b.add(mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.07, 16, 1, true), lam(0xc89b5a, { side: THREE.DoubleSide }), 0, 0.035, 0));
    b.add(mesh(new THREE.CircleGeometry(0.065, 16), lam(0xa57c44), 0, 0.002, 0).rotateX(-Math.PI / 2));
    b.position.set(x, TABLE_Y, -0.72);
    bench.add(noHit(b));
    const l = tagSprite(t, { scale: 0.03, bg: x < 0.4 ? 'rgba(30,110,60,0.9)' : 'rgba(150,60,40,0.9)' }); l.position.set(x, TABLE_Y + 0.12, -0.72); bench.add(l);
    b.userData.kind = t;
  }
}
mergeStatic(bench);
const BIN_POS = V3(-0.6, TABLE_Y + 0.05, -0.74);
const BASKET_POS = { conductor: V3(0.32, TABLE_Y + 0.03, -0.72), insulator: V3(0.52, TABLE_Y + 0.03, -0.72) };

const board = new THREE.Group();
board.position.set(0, TABLE_Y + 0.012, BOARD_Z);
scene.add(board);
{
  const bc = document.createElement('canvas'); bc.width = 512; bc.height = 272;
  const bx = bc.getContext('2d');
  bx.fillStyle = '#e8dcc2'; bx.fillRect(0, 0, 512, 272);
  bx.strokeStyle = 'rgba(90,70,40,0.25)'; bx.lineWidth = 2;
  for (let i = 0; i < 512; i += 16) { bx.beginPath(); bx.moveTo(i, 0); bx.lineTo(i, 272); bx.stroke(); }
  for (let j = 0; j < 272; j += 16) { bx.beginPath(); bx.moveTo(0, j); bx.lineTo(512, j); bx.stroke(); }
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  const plate = mesh(new THREE.BoxGeometry(0.56, 0.012, 0.3), [lam(0x6e4a2c), lam(0x6e4a2c), lam(0xffffff, { map: btex }), lam(0x6e4a2c), lam(0x6e4a2c), lam(0x6e4a2c)], 0, -0.006, 0);
  board.add(noHit(plate));
}
const nodePos = (i) => V3(((i % NX) - (NX - 1) / 2) * S, 0, (Math.floor(i / NX) - (NZ - 1) / 2) * S);
const node = (c, r) => r * NX + c;
{
  const tg = new THREE.CylinderGeometry(0.008, 0.009, 0.008, 12), tm = mat(0xd4a23a, { metalness: 0.6, roughness: 0.35 });
  const terms = new THREE.Group();
  for (let i = 0; i < NX * NZ; i++) { const t = mesh(tg, tm); t.position.copy(nodePos(i)).setY(0.004); terms.add(noHit(t)); }
  board.add(terms);
  mergeStatic(terms);
}
// Slots: each gap between two neighbouring terminals holds one part.
const ghostTex = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.setLineDash([12, 8]);
  roundRect(g, 4, 4, 120, 40, 12); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const slots = [];
const slotGhostGeo = new THREE.PlaneGeometry(0.07, 0.03);
for (let r = 0; r < NZ; r++) for (let c = 0; c < NX; c++) {
  const pairs = [];
  if (c < NX - 1) pairs.push([node(c, r), node(c + 1, r), 'h']);
  if (r < NZ - 1) pairs.push([node(c, r), node(c, r + 1), 'v']);
  for (const [a, b, dir] of pairs) {
    const center = nodePos(a).add(nodePos(b)).multiplyScalar(0.5);
    const g = new THREE.Group();
    g.position.copy(center);
    g.rotation.y = dir === 'h' ? 0 : -Math.PI / 2;   // local +X points from terminal a to terminal b
    const hit = mesh(new THREE.BoxGeometry(0.07, 0.03, 0.04), hitBoxMat, 0, 0.012, 0);
    const ghost = mesh(slotGhostGeo, new THREE.MeshBasicMaterial({ map: ghostTex, transparent: true, opacity: 0.35, depthWrite: false, color: 0x6b4a2c }), 0, 0.001, 0);
    ghost.rotation.x = -Math.PI / 2;
    noHit(ghost);
    g.add(hit, ghost);
    board.add(g);
    const slot = { a, b, dir, group: g, hit, ghost, comp: null, gap: false, id: slots.length };
    hit.userData.slot = slot;
    slots.push(slot);
  }
}
function slotAt(c1, r1, c2, r2) {
  let a = node(c1, r1), b = node(c2, r2);
  if (a > b) [a, b] = [b, a];
  return slots.find((s) => s.a === a && s.b === b);
}

// ---------------------------------------------------------------- hands-first input (shared/xr-input.js)
const input = createXRInput({
  renderer, scene, camera, parent: rig,
  pickRay: (ray, p) => hitTest(ray.origin, ray.direction, !!(p && p.held)),
  onRaySelect: (p, hit) => activateHit(hit, p),
  onHeldPress: (p, source, hit) => heldPress(p, hit),
  heldFocus: (p) => { const c = compOf(p.held); const t = c ? snapForPress(p, c) : null; return t && t.free ? t.slot.hit : null; },
  sound: (n) => { ac(); if (n === 'click') sfx.tick(); },
  onKindChange: () => { boardDirty = true; drawControlsHelp(); },
});
const hud = createDebugHud({ renderer, camera, input });

// ---------------------------------------------------------------- buttons (poke, point or click)
const interactables = [];
function makeButton(text, w, h, action, { bg = '#1f6fb2', fg = '#ffffff', font = 'bold 30px system-ui, sans-serif', name = text } = {}) {
  const res = Math.max(1400, 140 / h);
  font = font.replace(/(\d+)px/, (_, n) => `${Math.round(n * res / 700)}px`);
  const g = new THREE.Group();
  const face = new THREE.Group();
  face.add(mesh(new THREE.BoxGeometry(w, h, 0.014), mat(0x23384d), 0, 0, -0.008));
  const p = canvasPlane(w, h, res);
  face.add(p.mesh);
  g.add(face);
  g.userData.button = { action, name, enabled: true };
  g.userData.draw = (t, color = bg) => {
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color; roundRect(ctx, 4, 4, c.width - 8, c.height - 8, c.height * 0.2); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // shrink the text until every line fits on the button
    let px = parseInt(font.match(/(\d+)px/)[1], 10), lines, lh;
    for (;;) {
      ctx.font = font.replace(/(\d+)px/, `${px}px`);
      lines = wrapLines(ctx, t, c.width - 36);
      lh = px * 1.12;
      if ((lines.length * lh <= c.height - 14 && lines.every((l) => ctx.measureText(l).width <= c.width - 20)) || px <= 12) break;
      px -= 2;
    }
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 2));
    p.update();
  };
  g.userData.draw(text);
  input.addPokable(g, { width: w, height: h, visual: face, onPress: () => pressButton(g), enabled: () => g.userData.button.enabled });
  interactables.push(g);
  return g;
}
let lastButtonAt = 0;
function pressButton(g) {
  const b = g.userData.button;
  if (!b.enabled || !isShown(g)) return;
  if (time - lastButtonAt < 0.25) return;   // one press, even if poke and pinch land together
  lastButtonAt = time;
  ac(); sfx.tick();
  b.action();
}
function isShown(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }

// ---------------------------------------------------------------- circuit parts
// Every part lies along its slot: local +X runs from terminal a to terminal b (length S).
const comps = [];
let compSeq = 0;
const M = {
  copper: mat(0xc77b3a, { metalness: 0.6, roughness: 0.35 }),
  steel: mat(0xb8bec4, { metalness: 0.7, roughness: 0.3 }),
  brass: mat(0xd4a23a, { metalness: 0.6, roughness: 0.35 }),
  black: mat(0x222222),
  lead: mat(0x9aa0a6, { metalness: 0.5, roughness: 0.4 }),
};
const WIRE_COLOURS = [0xd63a2f, 0x2a2a2a, 0xd8b021, 0x2f6fd1];
const leadGeo = new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6);
function lead(g, x0, x1, y = 0.004) {
  const l = mesh(leadGeo, M.lead, (x0 + x1) / 2, y, 0);
  l.scale.y = Math.abs(x1 - x0); l.rotation.z = Math.PI / 2;
  g.add(l);
}
function labelPlane(text, w, h, bg, fg = '#fff') {
  const p = canvasPlane(w, h, 64 / h);
  const { ctx, c } = p;
  ctx.fillStyle = bg; roundRect(ctx, 0, 0, c.width, c.height, 10); ctx.fill();
  let px = Math.round(c.height * 0.66);
  ctx.font = `bold ${px}px system-ui, sans-serif`;
  while (px > 10 && ctx.measureText(text).width > c.width - 10) { px -= 2; ctx.font = `bold ${px}px system-ui, sans-serif`; }
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  p.update();
  p.mesh.rotation.x = -Math.PI / 2;
  return p.mesh;
}
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,0.6)'); gr.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(g.canvas);
})();

const OBJECTS = {
  nail: { name: 'Iron nail', conductor: true },
  copper: { name: 'Copper wire', conductor: true },
  foil: { name: 'Aluminium foil', conductor: true },
  key: { name: 'Brass key', conductor: true },
  ruler: { name: 'Plastic ruler', conductor: false },
  band: { name: 'Rubber band', conductor: false },
  stick: { name: 'Wooden stick', conductor: false },
  eraser: { name: 'Eraser', conductor: false },
};

function makeComp(type, o = {}) {
  const c = {
    id: ++compSeq, type, group: new THREE.Group(), slot: null, locked: !!o.locked, heldBy: null, spawner: null,
    closed: !!o.closed, flat: !!o.flat, blown: !!o.blown, kind: o.kind || null, room: o.room || 0,
    I: 0, bright: 0, speed: 0, hot: 0, sorted: false, wrongTries: 0, lastToggle: -9, anim: 0, colour: o.colour ?? 0, parts: {},
  };
  const g = c.group;
  g.userData.comp = c;
  const L = S;
  if (type === 'wire') {
    const curve = new THREE.QuadraticBezierCurve3(V3(-L / 2 + 0.006, 0.006, 0), V3(0, 0.024, 0), V3(L / 2 - 0.006, 0.006, 0));
    g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.0032, 6), mat(WIRE_COLOURS[c.colour % 4], { roughness: 0.5 })));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.012, 0.007, 0.009), M.steel, s * (L / 2 - 0.006), 0.005, 0));
  } else if (type === 'cell') {
    const body = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.058, 18), mat(c.flat ? 0x77736c : 0x1f7a3a, { roughness: 0.45 }), 0, 0.016, 0);
    body.rotation.z = Math.PI / 2;
    const band = mesh(new THREE.CylinderGeometry(0.0142, 0.0142, 0.012, 18), mat(c.flat ? 0x8a857c : 0xd4a23a, { metalness: 0.5, roughness: 0.4 }), 0.023, 0.016, 0);
    band.rotation.z = Math.PI / 2;
    const nub = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 10), M.steel, 0.032, 0.016, 0);
    nub.rotation.z = Math.PI / 2;
    g.add(body, band, nub);
    const lbl = labelPlane(c.flat ? '0 V  FLAT' : '1.5 V   +', 0.042, 0.012, c.flat ? '#5a5650' : '#155c2b');
    lbl.position.set(-0.002, 0.0305, 0);
    g.add(lbl);
    lead(g, -L / 2, -0.029); lead(g, 0.035, L / 2);
    c.parts.body = body;
  } else if (type === 'bulb') {
    g.add(mesh(new THREE.BoxGeometry(0.036, 0.01, 0.026), mat(0x2b2b2b), 0, 0.005, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.014, 12), M.steel, 0, 0.017, 0));
    const glassM = new THREE.MeshStandardMaterial({ color: c.blown ? 0x8c8c86 : 0xfff6dc, transparent: true, opacity: c.blown ? 0.7 : 0.5, roughness: 0.15, emissive: 0xffc860, emissiveIntensity: 0 });
    const glass = mesh(new THREE.SphereGeometry(0.016, 16, 12), glassM, 0, 0.038, 0);
    g.add(glass);
    const filM = new THREE.MeshBasicMaterial({ color: 0x5a4a3a });
    if (c.blown) {
      const a = mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.008, 4), filM, -0.004, 0.036, 0); a.rotation.z = 0.7;
      const b = mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.007, 4), filM, 0.005, 0.033, 0); b.rotation.z = -1.1;
      g.add(a, b);
    } else {
      const f = mesh(new THREE.TorusGeometry(0.005, 0.0008, 4, 12, Math.PI), filM, 0, 0.034, 0);
      g.add(f);
      c.parts.fil = filM;
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.set(0, 0.038, 0); glow.scale.setScalar(0.0001); noHit(glow);
    g.add(glow);
    lead(g, -L / 2, -0.018); lead(g, 0.018, L / 2);
    c.parts.glass = glassM; c.parts.glow = glow;
    if (o.room) { const t = tagSprite('Room ' + o.room, { scale: 0.022 }); t.position.set(0, 0.075, 0); g.add(t); }
  } else if (type === 'switch') {
    g.add(mesh(new THREE.BoxGeometry(0.056, 0.007, 0.028), mat(0x8a5a2b), 0, 0.0035, 0));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.008, 0.008, 0.012), M.brass, s * 0.02, 0.011, 0));
    const pivot = new THREE.Group(); pivot.position.set(-0.02, 0.015, 0);
    const lever = mesh(new THREE.BoxGeometry(0.044, 0.003, 0.008), M.steel, 0.022, 0, 0);
    const cap = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.016), mat(0xd23a2a), 0.042, 0.004, 0);
    lever.userData.lever = true; cap.userData.lever = true;
    pivot.add(lever, cap);
    g.add(pivot);
    lead(g, -L / 2, -0.026); lead(g, 0.026, L / 2);
    c.parts.pivot = pivot;
    const tag = tagSprite(c.closed ? 'ON' : 'OFF', { scale: 0.016, bg: c.closed ? 'rgba(30,130,70,0.92)' : 'rgba(160,50,40,0.92)' });
    tag.position.set(0, 0.05, 0);
    g.add(tag); c.parts.tag = tag;
    pivot.rotation.z = c.closed ? 0 : 0.55;
    // the poke face sits over the lever, facing up
    const pokeFace = new THREE.Object3D(); pokeFace.position.set(0.012, 0.028, 0); pokeFace.rotation.x = -Math.PI / 2;
    g.add(pokeFace);
    c.poke = input.addPokable(pokeFace, { width: 0.06, height: 0.034, onPress: () => toggleSwitch(c, 'poke'), enabled: () => !!c.slot && !c.heldBy && !c.locked && state.phase !== 'question' });
  } else if (type === 'motor') {
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.007, 0.03), mat(0x444a50), 0, 0.0035, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 16), mat(0x2e6fd1, { roughness: 0.4 }), 0, 0.022, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.012, 6), M.steel, 0, 0.043, 0));
    const fan = new THREE.Group(); fan.position.set(0, 0.048, 0);
    for (let i = 0; i < 3; i++) { const bl = mesh(new THREE.BoxGeometry(0.03, 0.0015, 0.008), mat(0xf2c12e), 0.015, 0, 0); const h = new THREE.Group(); h.rotation.y = (i * Math.PI * 2) / 3; bl.rotation.x = 0.4; h.add(bl); fan.add(h); }
    g.add(fan);
    const lbl = labelPlane('PUMP', 0.03, 0.01, '#1d4f9e');
    lbl.position.set(0, 0.0075, 0.0105); lbl.rotation.x = 0; g.add(lbl);
    lead(g, -L / 2, -0.02); lead(g, 0.02, L / 2);
    c.parts.fan = fan;
  } else if (type === 'panel') {
    g.add(mesh(new THREE.BoxGeometry(0.07, 0.01, 0.036), mat(0x1d3a78, { roughness: 0.3 }), 0, 0.006, 0));
    const lbl = labelPlane('SOLAR', 0.05, 0.016, '#1d3a78', '#ffd84d');
    lbl.position.set(0, 0.0115, 0); g.add(lbl);
    lead(g, -L / 2, -0.035); lead(g, 0.035, L / 2);
  } else if (type === 'object') {
    const k = c.kind;
    if (k === 'nail') {
      const sh = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.06, 8), M.steel, 0, 0.006, 0); sh.rotation.z = Math.PI / 2;
      const hd = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 12), M.steel, -0.03, 0.006, 0); hd.rotation.z = Math.PI / 2;
      const tip = mesh(new THREE.ConeGeometry(0.0022, 0.006, 8), M.steel, 0.033, 0.006, 0); tip.rotation.z = -Math.PI / 2;
      g.add(sh, hd, tip);
    } else if (k === 'copper') {
      const pts = []; for (let i = 0; i <= 80; i++) { const t = i / 80; pts.push(V3(-0.028 + t * 0.056, 0.009 + Math.sin(t * Math.PI * 10) * 0.006, Math.cos(t * Math.PI * 10) * 0.006)); }
      g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.0012, 5), M.copper));
    } else if (k === 'foil') {
      const f = mesh(new THREE.IcosahedronGeometry(0.014, 1), mat(0xd9dde2, { metalness: 0.8, roughness: 0.35, flatShading: true }), 0, 0.012, 0);
      f.scale.set(1.5, 0.8, 1); g.add(f);
    } else if (k === 'key') {
      g.add(mesh(new THREE.BoxGeometry(0.034, 0.003, 0.009), M.brass, 0.008, 0.003, 0));
      const ring = mesh(new THREE.TorusGeometry(0.009, 0.003, 6, 16), M.brass, -0.017, 0.003, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.004, 0.003, 0.005), M.brass, 0.012 + i * 0.007, 0.003, 0.006));
    } else if (k === 'ruler') {
      g.add(mesh(new THREE.BoxGeometry(0.066, 0.003, 0.016), mat(0x3f8fe0, { transparent: true, opacity: 0.75, roughness: 0.2 }), 0, 0.003, 0));
      for (let i = 0; i < 7; i++) g.add(mesh(new THREE.BoxGeometry(0.001, 0.0035, 0.005), mat(0x0d2d55), -0.03 + i * 0.01, 0.003, -0.005));
    } else if (k === 'band') {
      const t = mesh(new THREE.TorusGeometry(0.017, 0.0025, 6, 24), mat(0xc0702a, { roughness: 0.8 }), 0, 0.004, 0); t.rotation.x = Math.PI / 2; t.scale.set(1.4, 1, 1); g.add(t);
    } else if (k === 'stick') {
      g.add(mesh(new THREE.BoxGeometry(0.066, 0.004, 0.01), mat(0xd9b27c, { roughness: 0.9 }), 0, 0.004, 0));
    } else if (k === 'eraser') {
      g.add(mesh(new THREE.BoxGeometry(0.036, 0.012, 0.018), mat(0xf29bb0, { roughness: 0.9 }), -0.003, 0.006, 0));
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.0121, 0.0181), mat(0x3f6fd1, { roughness: 0.9 }), 0.012, 0.006, 0));
    }
  }
  // a generous invisible box makes parts easy to point at and pinch
  g.add(mesh(new THREE.BoxGeometry(type === 'wire' ? 0.08 : 0.07, 0.04, 0.034), hitBoxMat, 0, 0.018, 0));
  c.name = compName(c);
  // close up: pinch to pick up. A placed switch flips on a quick pinch and comes away if you pull it.
  c.near = input.addNearTarget(g, {
    enabled: () => canTouch(c),
    onPinch: (p) => {
      if (c.type === 'switch' && c.slot && !c.locked) { c.pinchStart = { pos: p.pinchPoint.clone(), quiet: time - c.lastToggle < 0.6 }; return; }
      pick(c, p);
    },
    onDrag: (p) => { if (c.pinchStart && p.pinchPoint.distanceTo(c.pinchStart.pos) > 0.035) { c.pinchStart = null; pick(c, p); } },
    onRelease: () => { if (c.pinchStart) { const q = c.pinchStart.quiet; c.pinchStart = null; if (!q) toggleSwitch(c, 'pinch'); } },
  });
  comps.push(c);
  interactables.push(g);
  return c;
}
function compName(c) {
  switch (c.type) {
    case 'wire': return 'Wire';
    case 'cell': return c.flat ? 'Cell: 0 V (flat, used up)' : 'Cell: 1.5 V';
    case 'bulb': return c.blown ? 'Bulb (look at the filament)' : (c.room ? `Bulb for room ${c.room}` : 'Bulb');
    case 'switch': return c.closed ? 'Switch: ON' : 'Switch: OFF';
    case 'motor': return 'Pump motor';
    case 'panel': return 'Solar panel (its wires come from the panel)';
    case 'object': return OBJECTS[c.kind].name;
  }
  return c.type;
}
function compOf(o) { while (o) { if (o.userData?.comp) return o.userData.comp; o = o.parent; } return null; }
function canTouch(c) {
  return !c.locked && !c.heldBy && !c.sorted && !c.flying && state.phase !== 'question' && c.group.parent !== null;
}
function disposeComp(c) {
  c.near?.remove(); c.poke?.remove();
  const i = comps.indexOf(c); if (i >= 0) comps.splice(i, 1);
  const j = interactables.indexOf(c.group); if (j >= 0) interactables.splice(j, 1);
  if (c.slot) { c.slot.comp = null; c.slot = null; }
  for (const p of input.pointers) if (p.held === c.group) p.held = null;
  if (desk.held === c) desk.held = null;
  c.group.removeFromParent();
  c.group.traverse((o) => { if (o.material?.map && o.material.map !== glowTex && o.material.map !== ghostTex) o.material.map.dispose(); });
}

// ---------------------------------------------------------------- the parts tray
const TRAY_SPOTS = [V3(-0.42, 0, -0.24), V3(-0.42, 0, -0.32), V3(-0.42, 0, -0.40), V3(-0.42, 0, -0.48), V3(-0.53, 0, -0.24), V3(-0.53, 0, -0.32), V3(-0.53, 0, -0.40), V3(-0.53, 0, -0.48)];
const spawners = [];
function addSpawner(type, stock, opts = {}, spotIndex = spawners.length) {
  const sp = { type, stock, opts, spot: TRAY_SPOTS[spotIndex].clone().setY(TABLE_Y + 0.002), display: null, tag: null, wireCount: 0 };
  sp.tag = tagSprite('', { scale: 0.016 });
  sp.tag.position.copy(sp.spot).add(V3(0, 0.055, 0));
  scene.add(sp.tag);
  spawners.push(sp);
  refillSpawner(sp);
  return sp;
}
function refillSpawner(sp) {
  if (!sp.display && sp.stock > 0) {
    const o = { ...sp.opts };
    if (sp.type === 'wire') o.colour = sp.wireCount++;
    const c = makeComp(sp.type, o);
    c.spawner = sp;
    sp.display = c;
    scene.add(c.group);
    c.group.position.copy(sp.spot); c.group.rotation.set(0, 0, 0);
    c.group.scale.setScalar(0.01);
    tween(0.2, (k) => c.group.scale.setScalar(Math.max(0.01, k)));
  }
  sp.tag.userData.draw(sp.stock === Infinity ? 'many' : (sp.stock > 0 ? '× ' + sp.stock : 'none left'));
  sp.tag.visible = sp.type !== 'object';
}
function clearSpawners() {
  for (const sp of spawners) { if (sp.display) disposeComp(sp.display); sp.tag.removeFromParent(); }
  spawners.length = 0;
}

// ---------------------------------------------------------------- picking up, placing, returning
const desk = { held: null, hold: new THREE.Object3D() };
desk.hold.position.set(0.1, -0.12, -0.32);
camera.add(desk.hold);

function pick(c, p) {
  if (!canTouch(c)) return;
  ac(); sfx.pick();
  const sp = c.spawner;
  if (sp && sp.display === c) { sp.display = null; sp.stock -= 1; refillSpawner(sp); }
  if (c.slot) { c.slot.comp = null; c.slot = null; onBoardChanged(); }
  c.anim++;
  if (p) {
    // one thing per hand: anything already in this hand goes back first
    if (p.held && p.held !== c.group) { const o = compOf(p.held); if (o) returnComp(o); }
    c.heldBy = p; p.held = c.group;
    p.anchor.attach(c.group);
    const p0 = c.group.position.clone(), q0 = c.group.quaternion.clone(), id = c.anim;
    tween(0.15, (k) => { if (c.anim !== id) return; c.group.position.lerpVectors(p0, V3(0, -0.012, 0), k); c.group.quaternion.slerpQuaternions(q0, new THREE.Quaternion(), k); });
  } else {
    if (desk.held && desk.held !== c) returnComp(desk.held);
    c.heldBy = 'desk'; desk.held = c;
    desk.hold.attach(c.group);
    const p0 = c.group.position.clone(), q0 = c.group.quaternion.clone(), id = c.anim;
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0));
    tween(0.15, (k) => { if (c.anim !== id) return; c.group.position.lerpVectors(p0, V3(0, 0, 0), k); c.group.quaternion.slerpQuaternions(q0, q1, k); });
  }
  levelHook('onPick', c);
}
function releaseHold(c) {
  if (c.heldBy && c.heldBy !== 'desk' && c.heldBy.held === c.group) c.heldBy.held = null;
  if (c.heldBy === 'desk' && desk.held === c) desk.held = null;
  c.heldBy = null;
}
function slotAccepts(slot, c) {
  return c.type === 'object' ? slot.gap : !slot.gap;
}
// Where would this held part go? The nearest gap within reach, measured mostly across the board,
// so a part held a little above the board still drops into the gap below it.
const _sw = new THREE.Vector3(), _cw = new THREE.Vector3(), _bl = new THREE.Vector3();
const SNAP = 0.075;
function snapTarget(c) {
  c.group.getWorldPosition(_cw);
  _bl.copy(_cw); board.worldToLocal(_bl);
  if (_bl.y > 0.2 || _bl.y < -0.06) return null;
  let best = null, bestD = SNAP, bestFree = null, bestFreeD = SNAP;
  for (const s of slots) {
    if (!slotAccepts(s, c)) continue;
    const d = Math.hypot(s.group.position.x - _bl.x, s.group.position.z - _bl.z, Math.max(0, _bl.y - 0.05) * 0.5);
    if (d < bestD) { bestD = d; best = s; }
    if (!s.comp && d < bestFreeD) { bestFreeD = d; bestFree = s; }
  }
  if (bestFree) return { slot: bestFree, free: true };
  if (best) return { slot: best, free: false };
  return null;
}
// Closing a pinch moves the fingertips a little, which can drag the part toward the next gap.
// So a pinch uses the gap that was highlighted just before the fingers started to close.
const SNAP_LOOKBACK = 0.15;
function recordSnap(dt) {
  for (const p of input.pointers) {
    const c = compOf(p.held);
    if (!c) { p.snapHist = []; continue; }
    const t = snapTarget(c);
    (p.snapHist ||= []).push({ t: time, target: t, strength: p.pinchStrength || 0 });
    while (p.snapHist.length && p.snapHist[0].t < time - 0.6) p.snapHist.shift();
  }
}
function snapForPress(p, c) {
  const now = snapTarget(c);
  if (p.kind !== 'hand' || !p.snapHist || !p.snapHist.length) return now;
  // the last moment the hand was still open, no later than SNAP_LOOKBACK ago
  let pick = null;
  for (const h of p.snapHist) { if (h.t <= time - SNAP_LOOKBACK || h.strength < 0.35) pick = h; }
  const t = pick ? pick.target : null;
  if (t && t.free && !t.slot.comp && slotAccepts(t.slot, c)) return t;
  return now;
}
function heldPress(p, rayHit) {
  const c = compOf(p.held);
  if (!c) { p.held = null; return; }
  const t = snapForPress(p, c);
  if (t && t.free) { place(c, t.slot); return; }
  if (t && !t.free) { sfx.bad(); toast('That gap already has a part in it. Choose an empty gap, or pick that part up first.', 'warn'); return; }
  if (rayHit && rayHit.slot && !rayHit.slot.comp && slotAccepts(rayHit.slot, c)) { place(c, rayHit.slot); return; }
  if (c.type === 'object') toast('Objects go in the yellow gap between the clips.', 'info', 4);
  returnComp(c);
}
function place(c, slot, instant = false) {
  releaseHold(c);
  c.slot = slot; slot.comp = c;
  slot.group.attach(c.group);
  c.anim++;
  const id = c.anim;
  if (instant) { c.group.position.set(0, 0, 0); c.group.quaternion.identity(); c.group.scale.setScalar(1); }
  else {
    const p0 = c.group.position.clone(), q0 = c.group.quaternion.clone();
    tween(0.14, (k) => { if (c.anim !== id) return; c.group.position.lerpVectors(p0, V3(0, 0, 0), k); c.group.quaternion.slerpQuaternions(q0, new THREE.Quaternion(), k); });
    sfx.snap();
  }
  onBoardChanged();
  levelHook('onPlace', c);
}
// Put a part back: tray parts fly back to the tray; parts that came with the board go in the bin.
function returnComp(c) {
  releaseHold(c);
  if (c.slot) { c.slot.comp = null; c.slot = null; onBoardChanged(); }
  c.anim++;
  const id = c.anim;
  const sp = c.spawner;
  scene.attach(c.group);
  const p0 = c.group.position.clone(), q0 = c.group.quaternion.clone();
  const to = sp ? sp.spot : BIN_POS;
  c.flying = true;
  sfx.back();
  const keep = sp && !sp.display;
  if (sp) { sp.stock += 1; if (keep) sp.display = c; }
  tween(0.3, (k) => {
    if (c.anim !== id) return;
    c.group.position.lerpVectors(p0, to, k);
    c.group.position.y += Math.sin(k * Math.PI) * 0.08;
    c.group.quaternion.slerpQuaternions(q0, new THREE.Quaternion(), k);
  }).then(() => {
    if (c.anim !== id) return;
    c.flying = false;
    if (keep) { refillSpawner(sp); return; }
    disposeComp(c);
    if (sp) refillSpawner(sp);
  });
}
function toggleSwitch(c, how) {
  if (c.type !== 'switch' || !c.slot) return;
  if (time - c.lastToggle < 0.35) return;
  c.lastToggle = time;
  c.closed = !c.closed;
  ac(); sfx.flip();
  const r0 = c.parts.pivot.rotation.z, r1 = c.closed ? 0 : 0.55;
  tween(0.1, (k) => (c.parts.pivot.rotation.z = r0 + (r1 - r0) * k));
  c.parts.tag.userData.draw(c.closed ? 'ON' : 'OFF', c.closed ? 'rgba(30,130,70,0.92)' : 'rgba(160,50,40,0.92)');
  c.name = compName(c);
  onBoardChanged();
  levelHook('onToggle', c, how);
}
function clearBoard() {
  for (const c of [...comps]) if (c.slot && !c.locked) returnComp(c);
}

// ---------------------------------------------------------------- the circuit calculation
// Nodal analysis: terminals are nodes, every part is a conductance, cells and the solar panel are
// voltage sources with internal resistance (written in Norton form). A tiny leak to "ground" on
// every node keeps the maths solvable when parts are left floating.
const CELL_EMF = 1.5, CELL_R = 0.3, BULB_R = 6, WIRE_R = 0.02, MOTOR_R = 4, PANEL_EMF = 2.2, PANEL_R = 3;
const BULB_REF = (CELL_EMF / (BULB_R + CELL_R)) ** 2 * BULB_R;   // one bulb on one fresh cell = brightness 1
const MOTOR_REF = PANEL_EMF / (MOTOR_R + PANEL_R);                // pump on the panel in full sun = speed 1
const SHORT_AMPS = 2;
function electrical(c, ov) {
  if (ov && ov.remove && ov.remove.includes(c)) return null;
  switch (c.type) {
    case 'wire': return { g: 1 / WIRE_R };
    case 'cell': return c.flat ? { g: 1 / 40, emf: 0 } : { g: 1 / CELL_R, emf: CELL_EMF };
    case 'bulb': return c.blown ? null : { g: 1 / BULB_R };
    case 'switch': { const on = ov && ov.sw === c ? ov.closed : c.closed; return on ? { g: 1 / WIRE_R } : null; }
    case 'motor': return { g: 1 / MOTOR_R };
    case 'panel': return { g: 1 / PANEL_R, emf: PANEL_EMF * world.sun };
    case 'object': return OBJECTS[c.kind].conductor ? { g: 50 } : null;
  }
  return null;
}
function gauss(A, b) {
  const n = b.length;
  const Mx = A.map((r, i) => [...r, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(Mx[r][col]) > Math.abs(Mx[piv][col])) piv = r;
    [Mx[col], Mx[piv]] = [Mx[piv], Mx[col]];
    const d = Mx[col][col];
    if (Math.abs(d) < 1e-18) continue;
    for (let r = col + 1; r < n; r++) {
      const f = Mx[r][col] / d;
      if (!f) continue;
      for (let k = col; k <= n; k++) Mx[r][k] -= f * Mx[col][k];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = Mx[r][n];
    for (let k = r + 1; k < n; k++) s -= Mx[r][k] * x[k];
    x[r] = Math.abs(Mx[r][r]) < 1e-18 ? 0 : s / Mx[r][r];
  }
  return x;
}
// Returns a Map: part -> current (A) flowing through it from terminal a to terminal b.
// For a source, positive current means it is pushing current out of its + end (terminal b).
function solve(list, ov = null) {
  const n = NX * NZ;
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  const J = new Array(n).fill(0);
  for (let i = 0; i < n; i++) G[i][i] += 1e-7;
  const els = [];
  for (const c of list) {
    if (!c.slot) continue;
    const e = electrical(c, ov);
    if (!e) continue;
    const { a, b } = c.slot;
    G[a][a] += e.g; G[b][b] += e.g; G[a][b] -= e.g; G[b][a] -= e.g;
    if (e.emf) { const j = e.emf * e.g; J[b] += j; J[a] -= j; }
    els.push([c, e]);
  }
  const V = gauss(G, J);
  const res = new Map();
  for (const [c, e] of els) {
    const { a, b } = c.slot;
    res.set(c, e.emf !== undefined ? (e.emf - (V[b] - V[a])) * e.g : (V[a] - V[b]) * e.g);
  }
  return res;
}
const placed = () => comps.filter((c) => c.slot);
const placedOf = (type) => comps.filter((c) => c.slot && c.type === type);
const brightness = (res, b) => { const I = res.get(b) || 0; return (I * I * BULB_R) / BULB_REF; };
const motorSpeed = (res, m) => Math.abs(res.get(m) || 0) / MOTOR_REF;
const sim = (ov) => solve(placed(), ov);
const isOn = (res, c) => (c.type === 'motor' ? motorSpeed(res, c) > 0.25 : brightness(res, c) > 0.1);
// Does this switch really control that bulb (or pump)? Try it both ways.
function switchControls(sw, target) {
  if (!sw || !target || !sw.slot || !target.slot) return false;
  return isOn(sim({ sw, closed: true }), target) && !isOn(sim({ sw, closed: false }), target);
}
let live = new Map();
const circuit = { short: false, shortSince: 0 };
function onBoardChanged() { boardDirty = true; }

// ---------------------------------------------------------------- current-flow dots
const DOTS_PER = 3;
const dotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14d }), slots.length * DOTS_PER);
dotMesh.frustumCulled = false; noHit(dotMesh);
board.add(dotMesh);
const dotPhase = new Float32Array(slots.length);
const _dm = new THREE.Matrix4(), _dp = new THREE.Vector3(), _dq = new THREE.Quaternion(), _ds = new THREE.Vector3(1, 1, 1);
function updateDots(dt) {
  let k = 0;
  for (const s of slots) {
    const c = s.comp;
    const I = c ? (live.get(c) || 0) : 0;
    if (!c || Math.abs(I) < 0.01 || c.heldBy) continue;
    dotPhase[s.id] = (dotPhase[s.id] + Math.sign(I) * Math.min(6, 1 + Math.abs(I) * 5) * dt) % 1;
    const A = nodePos(s.a), B = nodePos(s.b);
    for (let d = 0; d < DOTS_PER; d++) {
      let t = (dotPhase[s.id] + d / DOTS_PER) % 1; if (t < 0) t += 1;
      _dp.lerpVectors(A, B, t); _dp.y = 0.01 + Math.sin(t * Math.PI) * (c.type === 'wire' ? 0.012 : 0.03);
      _dm.compose(_dp, _dq, _ds);
      dotMesh.setMatrixAt(k++, _dm);
    }
  }
  dotMesh.count = k;
  dotMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------- instruction board and answer panel
const BW = 1.3, BH = 0.82;
const boardCanvas = canvasPlane(BW, BH, 820);
const infoBoard = new THREE.Group();
infoBoard.position.set(0, 1.42, -1.2);
infoBoard.rotation.x = -0.08;
infoBoard.add(mesh(new THREE.BoxGeometry(BW + 0.06, BH + 0.06, 0.04), lam(0x5e3c22), 0, 0, -0.025));
infoBoard.add(boardCanvas.mesh);
infoBoard.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), lam(0x5e3c22), -0.5, -0.9, -0.03));
infoBoard.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), lam(0x5e3c22), 0.5, -0.9, -0.03));
scene.add(noHit(infoBoard));
mergeStatic(infoBoard);
let boardDirty = true, boardDrawnAt = -1;

// answer panel: rises at the right of the board for questions and for sorting
const answer = { group: new THREE.Group(), title: canvasPlane(0.3, 0.06, 1400), buttons: [], visible: false };
answer.group.position.set(0.42, TABLE_Y + 0.14, -0.33);
answer.group.rotation.set(-0.85, -0.6, 0, 'YXZ');
answer.group.add(mesh(new THREE.BoxGeometry(0.33, 0.37, 0.012), mat(0x23384d), 0, -0.02, -0.012));
answer.title.mesh.position.set(0, 0.125, 0.001);
answer.group.add(answer.title.mesh);
const answerStand = noHit(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), mat(0x23384d), 0.42, TABLE_Y + 0.05, -0.36));
scene.add(answerStand);
for (let i = 0; i < 3; i++) {
  const b = makeButton('', 0.3, 0.085, () => answer.onPick?.(i), { font: 'bold 15px system-ui, sans-serif' });
  b.position.set(0, 0.05 - i * 0.092, 0.002);
  answer.group.add(b);
  answer.buttons.push(b);
}
answer.group.visible = false; answerStand.visible = false;
scene.add(answer.group);
function showAnswers(title, options, onPick) {
  const { ctx, c } = answer.title;
  ctx.clearRect(0, 0, c.width, c.height);
  let px = 44;
  ctx.font = `bold ${px}px system-ui, sans-serif`;
  while (px > 18 && ctx.measureText(title).width > c.width - 20) { px -= 2; ctx.font = `bold ${px}px system-ui, sans-serif`; }
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(title, c.width / 2, c.height / 2);
  answer.title.update();
  answer.buttons.forEach((b, i) => {
    const o = options[i];
    b.visible = !!o;
    b.userData.button.enabled = !!o;
    if (o) { b.userData.draw(o.text, o.colour || '#1f6fb2'); b.userData.button.name = o.text; }
  });
  answer.options = options;
  answer.onPick = (i) => onPick(i, answer.buttons[i]);
  if (!answer.visible) {
    answer.visible = true; answer.group.visible = true; answerStand.visible = true;
    answer.group.scale.setScalar(0.01);
    tween(0.25, (k) => answer.group.scale.setScalar(Math.max(0.01, k)));
  }
}
function hideAnswers() {
  answer.visible = false; answer.group.visible = false; answerStand.visible = false;
  answer.buttons.forEach((b) => (b.userData.button.enabled = false));
  answer.onPick = null;
}

// ---------------------------------------------------------------- controls strip (front edge of the table)
const controls = new THREE.Group();
controls.position.set(0.04, TABLE_Y + 0.035, -0.18);
controls.rotation.x = -Math.PI / 2 + 0.75;
scene.add(controls);
controls.add(mesh(new THREE.BoxGeometry(0.72, 0.07, 0.01), mat(0x2c3e50), 0, 0, -0.012));
const missionButtons = [];
const MISSION_COLOURS = ['#c0392b', '#2471a3', '#7d3c98', '#b9770e', '#1e8449'];
for (let i = 0; i < 5; i++) {
  const b = makeButton(String(i + 1), 0.052, 0.052, () => startMission(i), { bg: MISSION_COLOURS[i], font: 'bold 22px system-ui, sans-serif', name: `Mission ${i + 1}: ${['Make a torch', 'Conductor or insulator?', 'Fix the faults', 'Light up the hut', 'Solar water pump'][i]}` });
  b.position.set(-0.325 + i * 0.06, 0, 0);
  controls.add(b);
  missionButtons.push(b);
}
const restartBtn = makeButton('↺ Restart', 0.12, 0.052, () => restartStep(), { bg: '#5b6b78', font: 'bold 13px system-ui, sans-serif', name: 'Restart' });
restartBtn.position.set(0.0, 0, 0); controls.add(restartBtn);
const clearBtn = makeButton('Clear board', 0.12, 0.052, () => clearBoard(), { bg: '#5b6b78', font: 'bold 13px system-ui, sans-serif', name: 'Clear the board (parts go back)' });
clearBtn.position.set(0.13, 0, 0); controls.add(clearBtn);
const nextBtn = makeButton('Next ▶', 0.12, 0.052, () => nextMission(), { bg: '#7f8c8d', font: 'bold 15px system-ui, sans-serif', name: 'Next mission' });
nextBtn.position.set(0.26, 0, 0); controls.add(nextBtn);
function drawControlsHelp() { boardDirty = true; }

// ---------------------------------------------------------------- hover label and guide arrow
const hoverTag = tagSprite('', { scale: 0.022 });
hoverTag.material.depthTest = false; hoverTag.renderOrder = 999; hoverTag.visible = false;
scene.add(hoverTag);
let hoverText = '';
function showHover(text, point) {
  if (!text) { hoverTag.visible = false; return; }
  if (text !== hoverText) {
    hoverText = text;
    const ctx = hoverTag.material.map.image.getContext('2d');
    ctx.font = 'bold 34px system-ui, sans-serif';
    const w = Math.min(1024, ctx.measureText(text).width + 40);
    const cv = hoverTag.material.map.image; cv.width = Math.max(256, w);
    const c2 = cv.getContext('2d');
    c2.clearRect(0, 0, cv.width, 64);
    c2.fillStyle = 'rgba(15,30,45,0.9)'; roundRect(c2, 2, 6, cv.width - 4, 52, 16); c2.fill();
    c2.fillStyle = '#fff'; c2.font = 'bold 34px system-ui, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(text, cv.width / 2, 33);
    hoverTag.material.map.dispose();
    hoverTag.material.map = new THREE.CanvasTexture(cv); hoverTag.material.map.colorSpace = THREE.SRGBColorSpace;
    hoverTag.scale.set(0.022 * cv.width / 64, 0.022, 1);
  }
  hoverTag.visible = true;
  hoverTag.position.copy(point).add(V3(0, 0.06, 0));
}
const arrow = noHit(mesh(new THREE.ConeGeometry(0.018, 0.045, 12), basic(0xffc107)));
arrow.rotation.x = Math.PI;
scene.add(arrow);

// ---------------------------------------------------------------- hit testing (ray or mouse)
const raycaster = new THREE.Raycaster();
function hitTest(origin, dir, holding) {
  raycaster.set(origin, dir);
  raycaster.far = 8;
  const targets = interactables.filter((o) => isShown(o));
  if (holding) for (const s of slots) if (!s.comp) targets.push(s.hit);
  const hits = raycaster.intersectObjects(targets, true);
  for (const h of hits) {
    if (h.object.userData.noHit) continue;
    if (h.object.userData.slot) return { slot: h.object.userData.slot, point: h.point, distance: h.distance, object: h.object };
    let o = h.object, lever = false;
    while (o) {
      if (o.userData.lever) lever = true;
      if (o.userData.button) return { button: o, point: h.point, distance: h.distance, object: h.object };
      if (o.userData.comp) {
        const c = o.userData.comp;
        if (c.sorted || c.flying || c.heldBy) break;
        // the switch's easy-grab box surrounds the lever: a ray that also crosses the lever counts as the lever
        if (c.type === 'switch' && !lever) lever = hits.some((k) => k.object.userData.lever && compOf(k.object) === c && k.distance - h.distance < 0.06);
        return { comp: c, lever, point: h.point, distance: h.distance, object: h.object };
      }
      o = o.parent;
    }
  }
  return null;
}
function activateHit(hit, p) {
  ac();
  if (hit.button) { pressButton(hit.button); return; }
  const c = hit.comp;
  if (!c) return;
  if (c.locked) { sfx.bad(); toast('That part is fixed to the board for this mission.', 'warn'); return; }
  // pointing at a placed switch flips it (in VR, anywhere on it; with a mouse, on the lever).
  // To take a placed switch off the board: pinch it and pull, or click its base.
  if (c.type === 'switch' && c.slot && (hit.lever || p)) { toggleSwitch(c, p ? 'ray' : 'click'); return; }
  pick(c, p);
}
function hoverText4(hit) {
  if (!hit) return '';
  if (hit.button) return hit.button.userData.button.name;
  if (hit.slot) return 'Empty gap: place it here';
  const c = hit.comp;
  if (!c) return '';
  let t = c.name;
  if (c.locked) t += ' (fixed)';
  else if (c.type === 'switch' && c.slot) t += (hit.lever || renderer.xr.isPresenting) ? ': flip it' : ': click the lever to flip it';
  return t;
}

// ---------------------------------------------------------------- game state and missions
const SAVE_KEY = 'light-up-village-v1';
let saved = { stars: [0, 0, 0, 0, 0], done: [false, false, false, false, false] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && Array.isArray(s.stars)) saved = s; } catch { /* storage blocked */ }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch { /* storage blocked */ } }

const state = {
  mission: 0, step: 0, stepT: 0, phase: 'build', pending: 0, toast: null, firstTry: true,
  sorted: 0, sortedRight: 0, sawOff: false, fault: null, cloud: null, decor: [], wrongAnswers: new Set(),
};
function toast(text, kind = 'info', secs = 7) { state.toast = { text, kind, until: time + secs }; boardDirty = true; }
const spawner = (type) => spawners.find((s) => s.type === type);
const traySpot = (type) => { const s = spawner(type); return s && s.display ? s.display.group : null; };

// Torch layout used by missions 1 (hint), 2 and 3: a loop of six gaps around the middle of the board.
function buildTorch({ cell = {}, bulb = {}, sw = null, skip = null, locked = false, gapLeft = false } = {}) {
  const parts = {};
  const put = (key, type, o, c1, r1, c2, r2) => {
    if (skip === key) return;
    const c = makeComp(type, { ...o, locked });
    scene.add(c.group);
    place(c, slotAt(c1, r1, c2, r2), true);
    parts[key] = c;
  };
  put('cell', 'cell', cell, 1, 2, 2, 2);
  if (sw) put('switch', 'switch', sw, 2, 2, 3, 2); else put('w1', 'wire', { colour: 0 }, 2, 2, 3, 2);
  put('w2', 'wire', { colour: 1 }, 3, 2, 3, 1);
  put('w3', 'wire', { colour: 1 }, 3, 1, 3, 0);
  put('bulb', 'bulb', bulb, 3, 0, 2, 0);
  put('w4', 'wire', { colour: 0 }, 2, 0, 1, 0);
  put('w5', 'wire', { colour: 0 }, 1, 0, 1, 1);
  if (!gapLeft) put('w6', 'wire', { colour: 0 }, 1, 1, 1, 2);
  return parts;
}
function addDecor(o) { state.decor.push(o); return o; }

const MISSIONS = [
  {
    title: 'Make a torch', short: 'Torch',
    story: 'Tendai walks to the borehole after dark. Build a torch so the path is safe.',
    tray() { addSpawner('cell', 1); addSpawner('bulb', 1); addSpawner('wire', Infinity); addSpawner('switch', 1); },
    steps: [
      {
        text: 'Make the bulb light up. Join the cell and the bulb with wires to make a complete loop.',
        hint: 'Put the cell in one gap and the bulb in another. Then add wires so there is a path from one end of the cell, through the bulb, and back to the other end of the cell.',
        check: () => placedOf('bulb').some((b) => isOn(live, b)),
        done: 'It lights! Electricity only flows around a COMPLETE loop. We call this a closed circuit.',
        arrow: () => (!placedOf('cell').length ? traySpot('cell') : !placedOf('bulb').length ? traySpot('bulb') : traySpot('wire')),
      },
      {
        text: 'A torch needs a switch. Put the switch into your loop. Then turn it OFF, and ON again.',
        hint: 'Pick up one wire from your loop and put the switch in its gap. Touch the red lever to flip the switch.',
        enter: () => { state.sawOff = false; },
        check: () => {
          const sw = placedOf('switch')[0];
          const b = placedOf('bulb').find((x) => switchControls(sw, x));
          if (!b) return false;
          if (!sw.closed) state.sawOff = true;
          return state.sawOff && sw.closed && isOn(live, b);
        },
        status: () => { const sw = placedOf('switch')[0]; return sw ? (state.sawOff ? 'Switch was turned OFF. Now turn it ON again.' : `Switch is ${sw.closed ? 'ON' : 'OFF'}.`) : ''; },
        done: 'Your torch works! A switch opens and closes the loop. OFF = open circuit. ON = closed circuit.',
        arrow: () => { const sw = placedOf('switch')[0]; return sw ? sw.group : traySpot('switch'); },
      },
    ],
    question: {
      q: 'Why did the bulb go out when the switch was OFF?',
      options: ['The loop was broken, so electricity could not flow.', 'The cell was used up.', 'The bulb needed a rest.'],
      explain: 'Look again: when the switch is OFF there is a gap in the loop.',
    },
  },
  {
    title: 'Conductor or insulator?', short: 'Materials',
    story: 'This tester has a gap between two clips. Which things let electricity pass through them?',
    setup() {
      slotAt(1, 1, 1, 2).gap = true;
      buildTorch({ locked: true, gapLeft: true });
      for (const r of [1, 2]) {
        const clip = new THREE.Group();
        clip.add(mesh(new THREE.BoxGeometry(0.014, 0.012, 0.022), mat(r === 1 ? 0xd63a2f : 0x2a2a2a), 0, 0.006, 0));
        clip.add(mesh(new THREE.BoxGeometry(0.01, 0.004, 0.012), M.steel, 0, 0.013, r === 1 ? 0.01 : -0.01));
        clip.position.copy(nodePos(node(1, r))).add(V3(-0.014, 0, 0));
        board.add(addDecor(noHit(clip)));
      }
      const g = slotAt(1, 1, 1, 2);
      g.ghost.material.color.set(0xffc107); g.ghost.material.opacity = 0.8;
      addDecor({ removeFromParent() { g.ghost.material.color.set(0x6b4a2c); g.ghost.material.opacity = 0.35; } });
      state.sorted = 0; state.sortedRight = 0;
    },
    tray() { Object.keys(OBJECTS).forEach((k, i) => addSpawner('object', 1, { kind: k }, [0, 4, 1, 5, 2, 6, 3, 7][i])); },
    steps: [
      {
        text: 'Put an object in the yellow gap between the clips. If the bulb lights, it is a CONDUCTOR. If not, it is an INSULATOR. Sort all 8 objects.',
        hint: 'Pick an object from the tray, bring it to the yellow gap and place it. Then choose CONDUCTOR or INSULATOR on the panel on the right.',
        check: () => state.sorted >= 8,
        status: () => `Sorted: ${state.sorted} of 8`,
        done: 'All sorted! Metals are conductors. Plastic, rubber and wood are insulators.',
        arrow: () => {
          const g = slotAt(1, 1, 1, 2);
          if (g.comp) return answer.buttons[0];
          const sp = spawners.find((s) => s.display && !s.display.sorted);
          return sp ? sp.display.group : null;
        },
      },
    ],
    onPlace(c) { if (c.type === 'object') askSort(c); },
    onPick(c) { if (c.type === 'object' && state.phase === 'build') hideAnswers(); },
    question: {
      q: 'Why are electric wires covered in plastic?',
      options: ['Plastic is an insulator, so it keeps the electricity in the wire and keeps us safe.', 'Plastic helps electricity flow faster.', 'Plastic turns the wire into a conductor.'],
      explain: 'Think about what an insulator does.',
    },
  },
  {
    title: 'Fix the faults', short: 'Faults',
    story: 'Five torches at the village workshop do not work. Find each fault and fix it.',
    tray() { addSpawner('wire', Infinity); addSpawner('bulb', 2); addSpawner('cell', 2); },
    steps: [
      {
        text: 'Torch 1 does not light. Find the fault and fix it.',
        enter: () => { const t = buildTorch({ sw: { closed: false } }); state.fault = t.switch.group; },
        hint: 'Look at the switch. Is it ON or OFF?',
        check: () => torchWorks(), done: 'Fault 1: the switch was OFF, so the loop was open.',
      },
      {
        text: 'Torch 2 does not light. Find the fault and fix it.',
        enter: () => { buildTorch({ skip: 'w3' }); state.fault = slotAt(3, 1, 3, 0).hit; },
        hint: 'Follow the loop with your finger. Is there a gap with no wire? Fill it with a wire from the tray.',
        check: () => torchWorks(), done: 'Fault 2: a wire was missing. The gap broke the loop.',
      },
      {
        text: 'Torch 3 does not light. Find the fault and fix it.',
        enter: () => { const t = buildTorch({ bulb: { blown: true } }); state.fault = t.bulb.group; },
        hint: 'Look closely at the bulb. Is the thin wire inside it (the filament) broken? Put the old bulb in the bin and use a new one.',
        check: () => torchWorks(), done: 'Fault 3: the bulb was blown. Its broken filament broke the loop.',
      },
      {
        text: 'Torch 4 does not light. Find the fault and fix it.',
        enter: () => { const t = buildTorch({ cell: { flat: true } }); state.fault = t.cell.group; },
        hint: 'Read the label on the cell. A flat cell has no energy left. Swap it for a new cell from the tray.',
        check: () => torchWorks(), done: 'Fault 4: the cell was flat. It had no energy left to push the current.',
      },
      {
        text: 'Torch 5 does not light, and the cell is getting HOT! Find the fault and fix it.',
        enter: () => {
          buildTorch();
          for (const [c1, r1, c2, r2, col] of [[3, 1, 2, 1, 2], [2, 1, 2, 0, 2]]) {   // a path round the bulb
            const w = makeComp('wire', { colour: col }); scene.add(w.group); place(w, slotAt(c1, r1, c2, r2), true);
          }
          state.fault = slotAt(2, 0, 2, 1).comp.group;
        },
        hint: 'Two yellow wires let the current go round the bulb instead of through it. Take one of them away.',
        check: () => torchWorks(), done: 'Fault 5: a short circuit. The current took an easy path and skipped the bulb. Short circuits make wires hot and can start fires.',
      },
    ],
    arrowAfterHint: true,
    question: {
      q: 'What is a short circuit?',
      options: ['The current takes an easy path back to the cell and skips the bulb.', 'The wires are too short to reach.', 'The bulb is too bright.'],
      explain: 'Remember torch 5: where did the current go?',
    },
  },
  {
    title: 'Light up the hut', short: 'Series and parallel', sky: 'dusk',
    story: 'It is getting dark. Tendai\'s home has two rooms, and each room needs a light.',
    tray() { addSpawner('cell', 1); addSpawner('bulb', 1, { room: 1 }); addSpawner('bulb', 1, { room: 2 }, 2); addSpawner('wire', Infinity, {}, 3); },
    steps: [
      {
        text: 'Light BOTH bulbs with ONE single loop that goes through the cell and both bulbs. This is a SERIES circuit.',
        hint: 'Make one loop: from the cell, through the first bulb, through the second bulb, and back to the cell.',
        check: () => { const b = placedOf('bulb'); return b.length === 2 && b.every((x) => isOn(live, x)) && isSeries(b); },
        done: 'Both bulbs light, but they are dim. In series the bulbs share the push of one cell.',
        arrow: () => (!placedOf('cell').length ? traySpot('cell') : placedOf('bulb').length < 2 ? (traySpot('bulb') || spawners[2].display?.group) : traySpot('wire')),
      },
      {
        text: 'Now pick up ONE of the bulbs. Watch the other bulb carefully.',
        hint: 'Pinch one bulb (or click it) to lift it off the board.',
        check: () => placedOf('bulb').length < 2,
        done: 'The other bulb went out! A series circuit has only ONE path. Break it anywhere and everything stops.',
        arrow: () => placedOf('bulb')[0]?.group,
      },
      {
        text: 'Now give EACH bulb its own path to the cell. This is a PARALLEL circuit. Make both bulbs shine brightly.',
        hint: 'Put the cell on the left. Join the top end of the cell to the top end of both bulbs, and the bottom end of the cell to the bottom end of both bulbs. Use Clear board if you want to start again.',
        check: () => { const b = placedOf('bulb'); return b.length === 2 && b.every((x) => brightness(live, x) > 0.55) && isParallel(b); },
        status: () => { const b = placedOf('bulb'); return b.length ? 'Bulbs: ' + b.map((x) => `Room ${x.room} ${brightness(live, x) > 0.55 ? 'BRIGHT' : brightness(live, x) > 0.1 ? 'dim' : 'off'}`).join(', ') : ''; },
        done: 'Both bulbs are bright, and each one has its own path. Houses are wired in parallel.',
      },
    ],
    question: {
      q: 'Why are the lights in a house wired in parallel?',
      options: ['Each light has its own path, so one can be off while the others stay on.', 'It needs fewer wires.', 'It makes all the lights dimmer.'],
      explain: 'Remember what happened when you took one bulb out of the series circuit.',
    },
  },
  {
    title: 'Solar water pump', short: 'Solar energy',
    story: 'The garden needs water. Use energy from the sun to run a water pump.',
    setup() {
      const p = makeComp('panel', { locked: true }); scene.add(p.group); place(p, slotAt(4, 0, 4, 1), true);
      world.cable.visible = true;
      world.tankLevel = 0; world.gauge.scale.y = 0.001; setGardenGrowth(saved.done[4] ? 1 : 0.35);
      state.cloud = null; world.sun = 1;
    },
    tray() { addSpawner('switch', 1); addSpawner('motor', 1); addSpawner('wire', Infinity); },
    steps: [
      {
        text: 'Build a loop with the SOLAR PANEL, the SWITCH and the PUMP. Then turn the switch ON.',
        hint: 'The blue solar panel part is already on the right of the board. Join its two ends through the pump and the switch with wires.',
        check: () => { const m = placedOf('motor')[0], sw = placedOf('switch')[0]; return !!m && !!sw && sw.closed && switchControls(sw, m) && motorSpeed(live, m) > 0.3; },
        done: 'The pump is running on sunshine!',
        arrow: () => (!placedOf('motor').length ? traySpot('motor') : !placedOf('switch').length ? traySpot('switch') : (placedOf('switch')[0].closed ? traySpot('wire') : placedOf('switch')[0].group)),
      },
      {
        text: 'Keep the pump running until the water tank (on your right) is full.',
        hint: 'Keep the switch ON and watch the blue water rise in the gauge on the tank.',
        check: () => world.tankLevel >= 1,
        status: () => `Water tank: ${Math.floor(world.tankLevel * 100)}% full${world.sun < 0.9 ? '   (cloud!)' : ''}`,
        done: 'The tank is full and the garden can grow!',
      },
    ],
    question: {
      q: 'Which energy changes happen in the solar pump?',
      options: ['Light energy → electrical energy → movement (kinetic) energy', 'Electrical energy → light energy → heat energy', 'Sound energy → electrical energy → light energy'],
      explain: 'Start with what the panel takes in, and end with what the pump does.',
    },
  },
];
function isSeries(b) {
  return isOn(sim({ remove: [b[0]] }), b[1]) === false && isOn(sim({ remove: [b[1]] }), b[0]) === false;
}
function isParallel(b) {
  return isOn(sim({ remove: [b[0]] }), b[1]) && isOn(sim({ remove: [b[1]] }), b[0]);
}
function torchWorks() {
  return !circuit.short && placedOf('bulb').some((b) => !b.blown && isOn(live, b));
}
function levelHook(name, ...args) { const m = MISSIONS[state.mission]; if (m && m[name]) m[name](...args); }

function resetBoard() {
  for (const p of input.pointers) p.held = null;
  desk.held = null;
  for (const c of [...comps]) disposeComp(c);
  clearSpawners();
  for (const d of state.decor) d.removeFromParent();
  state.decor = [];
  for (const s of slots) { s.gap = false; s.comp = null; }
  hideAnswers();
  circuit.short = false;
  world.cable.visible = false;
  world.stream.visible = false;
  world.cloud.visible = false;
  world.sun = 1;
}
function startMission(i) {
  resetBoard();
  state.mission = i; state.phase = 'build'; state.firstTry = true; state.pending = 0; state.toast = null; state.wrongAnswers = new Set();
  const m = MISSIONS[i];
  setSky(m.sky || 'day');
  m.setup?.();
  m.tray();
  enterStep(0);
  missionButtons.forEach((b, k) => b.userData.draw(saved.done[k] ? '✓' + (k + 1) : String(k + 1), MISSION_COLOURS[k]));
  missionButtons[i].userData.draw(saved.done[i] ? '✓' + (i + 1) : String(i + 1), '#f1c40f');
  drawNext();
  boardDirty = true;
}
function enterStep(k) {
  state.step = k; state.stepT = 0;
  MISSIONS[state.mission].steps[k].enter?.();
  boardDirty = true;
}
// Restart: missions that set up each step (the five torches) restart the current step.
function restartStep() {
  const m = MISSIONS[state.mission];
  if (state.mission === 2 && state.phase === 'build') {
    const k = state.step;
    state.pending = 0;
    for (const p of input.pointers) p.held = null;
    desk.held = null;
    for (const c of [...comps]) disposeComp(c);
    clearSpawners();
    for (const s of slots) s.comp = null;
    circuit.short = false;
    m.tray();
    enterStep(k);
    toast('Torch ' + (k + 1) + ' is back as it was.', 'info', 3);
    return;
  }
  startMission(state.mission);
}
function nextMission() {
  if (state.phase !== 'complete') { sfx.bad(); toast('Finish this mission first. Next lights up when you are done.', 'warn', 4); return; }
  startMission((state.mission + 1) % 5);
}
function drawNext() {
  const ready = state.phase === 'complete';
  nextBtn.userData.draw(state.mission === 4 && ready ? 'Again ▶' : 'Next ▶', ready ? '#1e8449' : '#7f8c8d');
}

// Mission 2: sorting the object in the gap
function askSort(obj) {
  showAnswers(`Is the ${OBJECTS[obj.kind].name.toLowerCase()} a…`, [
    { text: 'CONDUCTOR (lets electricity through)', colour: '#1e8449' },
    { text: 'INSULATOR (stops electricity)', colour: '#a04000' },
  ], (i) => {
    if (obj.slot !== slotAt(1, 1, 1, 2)) return;
    const saysConductor = i === 0;
    if (saysConductor === OBJECTS[obj.kind].conductor) {
      sfx.good();
      state.sorted += 1;
      if (!obj.wrongTries) state.sortedRight += 1;
      const kind = OBJECTS[obj.kind].conductor ? 'conductor' : 'insulator';
      toast(`Yes! The ${OBJECTS[obj.kind].name.toLowerCase()} is ${kind === 'conductor' ? 'a CONDUCTOR: the bulb lit' : 'an INSULATOR: the bulb stayed off'}.`, 'good', 4);
      hideAnswers();
      obj.sorted = true;
      obj.slot.comp = null; obj.slot = null; onBoardChanged();
      scene.attach(obj.group);
      const n = comps.filter((c) => c.sorted && OBJECTS[c.kind].conductor === OBJECTS[obj.kind].conductor).length - 1;
      const to = BASKET_POS[kind].clone().add(V3(((n % 2) - 0.5) * 0.04, 0.01 + Math.floor(n / 2) * 0.012, ((n % 3) - 1) * 0.02));
      const p0 = obj.group.position.clone(), id = ++obj.anim;
      tween(0.5, (k) => { if (obj.anim !== id) return; obj.group.position.lerpVectors(p0, to, k); obj.group.position.y += Math.sin(k * Math.PI) * 0.12; obj.group.rotation.y = k * 2; });
    } else {
      sfx.bad();
      obj.wrongTries += 1;
      toast('Not quite. Look at the bulb: is it ON or OFF? A lit bulb means electricity flows through the object.', 'warn', 6);
    }
  });
}

// questions at the end of each mission
function askQuestion() {
  const m = MISSIONS[state.mission];
  state.phase = 'question';
  for (const p of input.pointers) { const c = compOf(p.held); if (c) returnComp(c); }
  if (desk.held) returnComp(desk.held);
  const order = shuffle([0, 1, 2]);
  state.qOrder = order;
  const opts = () => order.map((k) => ({ text: m.question.options[k], colour: state.wrongAnswers.has(k) ? '#922b21' : '#1f6fb2' }));
  const handler = (i) => {
    const k = order[i];
    if (state.phase !== 'question') return;
    if (k === 0) {
      sfx.fanfare();
      completeMission();
    } else {
      sfx.bad();
      state.firstTry = false;
      state.wrongAnswers.add(k);
      toast('Not that one. ' + m.question.explain, 'warn', 8);
      showAnswers('Question: try again', opts(), handler);
    }
  };
  showAnswers('Question: choose your answer', opts(), handler);
  boardDirty = true;
}
function completeMission() {
  const i = state.mission;
  const stars = 1 + (state.firstTry ? 1 : 0);
  saved.stars[i] = Math.max(saved.stars[i] || 0, stars);
  saved.done[i] = true;
  save();
  state.phase = 'complete';
  state.lastStars = stars;
  hideAnswers();
  missionButtons[i].userData.draw('✓' + (i + 1), '#f1c40f');
  drawNext();
  updatePageResults();
  if (i === 3) world.windows.forEach((w) => (w.keep = true));
  if (saved.done.every(Boolean)) setSky('dusk', 3);
  boardDirty = true;
}

// ---------------------------------------------------------------- per-frame mission logic
let alarmAt = 0;
function updateGame(dt) {
  state.stepT += dt;
  live = sim();
  // short circuit: a cell pushing far more current than any bulb needs
  const short = comps.some((c) => c.slot && c.type === 'cell' && !c.flat && Math.abs(live.get(c) || 0) > SHORT_AMPS);
  if (short && !circuit.short) { toast('SHORT CIRCUIT! The current is skipping the bulb. The cell and wires are getting hot. Take away the wire that makes the shortcut.', 'danger', 9); sfx.alarm(); alarmAt = time; }
  if (short && time - alarmAt > 2.5) { sfx.alarm(); alarmAt = time; }
  circuit.short = short;

  const m = MISSIONS[state.mission];
  if (state.phase === 'build') {
    if (state.pending > 0) {
      state.pending -= dt;
      if (state.pending <= 0) {
        if (state.step + 1 < m.steps.length) {
          if (state.mission === 2) {   // the next broken torch replaces this one
            for (const c of [...comps]) if (c.slot || !c.spawner) disposeComp(c);
            for (const s of slots) s.comp = null;
            for (const sp of spawners) refillSpawner(sp);
          }
          enterStep(state.step + 1);
        } else askQuestion();
      }
    } else {
      const st = m.steps[state.step];
      if (st.check()) {
        sfx.good();
        toast(st.done, 'good', state.mission === 2 ? 4 : 7);
        state.pending = state.mission === 2 ? 2.5 : 1.6;
        if (state.step + 1 >= m.steps.length) state.pending = 2.2;
      }
    }
  }
  // mission 5: water and clouds
  if (state.mission === 4) {
    const pump = placedOf('motor')[0];
    const sp = pump ? motorSpeed(live, pump) : 0;
    const before = world.tankLevel;
    if (state.phase === 'build' && state.step === 1) world.tankLevel = Math.min(1, world.tankLevel + (sp > 0.05 ? sp : 0) * dt / 20);
    world.gauge.scale.y = Math.max(0.001, world.tankLevel);
    world.stream.visible = sp > 0.1;
    world.stream.scale.x = world.stream.scale.z = 0.4 + Math.min(1, sp);
    if (sp > 0.1 && Math.random() < dt * 3 * sp) sfx.splash();
    if (before < 0.4 && world.tankLevel >= 0.4 && !state.cloud) { state.cloud = { t: 0 }; toast('A cloud is covering the sun! Less light reaches the panel, so it makes less electricity, and the pump slows down.', 'warn', 9); }
    if (state.cloud) {
      const c = state.cloud; c.t += dt;
      const T = 9;
      const k = Math.min(1, c.t / T);
      world.cloud.visible = k < 1;
      const sunP = world.sunSprite.position;
      world.cloud.position.set(sunP.x * 0.55 + (k - 0.5) * 30, sunP.y * 0.55, sunP.z * 0.55);
      const cover = Math.max(0, 1 - Math.abs(k - 0.5) / 0.3);
      world.sun = 1 - 0.75 * Math.min(1, cover * 1.4);
      if (k >= 1) { world.sun = 1; c.t = T; }
    }
    if (world.tankLevel >= 1 && world.garden.userData.growth < 1) setGardenGrowth(Math.min(1, world.garden.userData.growth + dt * 0.3));
  }
  // hut windows follow the two room bulbs in mission 4
  world.windows.forEach((w, i) => {
    let target = w.keep ? 1 : 0;
    if (state.mission === 3) { const b = placedOf('bulb').find((x) => x.room === i + 1); target = b ? Math.min(1, brightness(live, b)) : (w.keep ? 1 : 0); }
    w.level += (target - w.level) * Math.min(1, dt * 6);
    w.mat.color.setRGB(0.17 + 0.83 * w.level, 0.14 + 0.68 * w.level, 0.12 + 0.36 * w.level);
  });
}

// ---------------------------------------------------------------- visuals for parts
let lastLit = new Set();
function updateParts(dt) {
  const litNow = new Set();
  for (const c of comps) {
    const I = c.slot ? (live.get(c) || 0) : 0;
    c.I = I;
    if (c.type === 'bulb' && !c.blown) {
      const b = c.slot ? brightness(live, c) : 0;
      c.bright += (b - c.bright) * Math.min(1, dt * 14);
      const k = Math.min(1.3, c.bright);
      c.parts.glass.emissiveIntensity = k * 2.2;
      c.parts.fil.color.setRGB(0.35 + 0.65 * Math.min(1, k * 1.5), 0.29 + 0.6 * Math.min(1, k * 1.2), 0.23 + 0.3 * k);
      c.parts.glow.scale.setScalar(k > 0.02 ? 0.03 + 0.12 * k : 0.0001);
      if (b > 0.1) litNow.add(c);
    }
    if (c.type === 'motor') {
      const sp = c.slot ? motorSpeed(live, c) : 0;
      c.speed += (sp - c.speed) * Math.min(1, dt * 3);
      c.parts.fan.rotation.y += c.speed * dt * 25 * Math.sign(I || 1);
    }
    if (c.type === 'cell') {
      const hot = c.slot && Math.abs(I) > SHORT_AMPS ? 1 : 0;
      c.hot += (hot - c.hot) * Math.min(1, dt * 2);
      c.parts.body.material.emissive.setRGB(c.hot * (0.6 + 0.3 * Math.sin(time * 10)), c.hot * 0.08, 0);
    }
  }
  for (const c of litNow) if (!lastLit.has(c)) sfx.light();
  lastLit = litNow;
  // empty gaps glow brighter while something is being held
  const holding = input.pointers.some((p) => p.held) || !!desk.held;
  for (const s of slots) {
    if (s.gap) continue;
    s.ghost.visible = !s.comp;
    s.ghost.material.opacity = holding ? 0.85 : 0.3;
    s.ghost.material.color.set(holding ? 0xffffff : 0x6b4a2c);
  }
  updateDots(dt);
}

// ---------------------------------------------------------------- drawing the instruction board
function drawBoard() {
  const { ctx, c } = boardCanvas;
  const W = c.width, H = c.height;
  const m = MISSIONS[state.mission];
  const w = inputWords(input.kind);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fbf7ee'; roundRect(ctx, 0, 0, W, H, 20); ctx.fill();
  ctx.fillStyle = MISSION_COLOURS[state.mission]; roundRect(ctx, 0, 0, W, 92, 20); ctx.fill(); ctx.fillRect(0, 60, W, 32);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 46px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`Mission ${state.mission + 1} of 5: ${m.title}`, 26, 62);
  ctx.textAlign = 'right'; ctx.font = 'bold 40px system-ui, sans-serif';
  const st = saved.stars[state.mission] || 0;
  ctx.fillText('★'.repeat(st) + '☆'.repeat(2 - st), W - 24, 62);
  ctx.textAlign = 'left';
  let y = 136;
  ctx.fillStyle = '#5a4630'; ctx.font = 'italic 30px system-ui, sans-serif';
  y = wrapText(ctx, m.story, 26, y, W - 52, 36) + 6;
  if (state.phase === 'build') {
    m.steps.forEach((s, i) => {
      const doneStep = i < state.step || (i === state.step && state.pending > 0);
      const cur = i === state.step && !doneStep;
      if (state.mission === 2 && !cur && !doneStep) return;   // torches appear one at a time
      if (state.mission === 2 && doneStep && i < state.step - 1) return;
      ctx.fillStyle = doneStep ? '#1e8449' : cur ? '#13293d' : '#9aa3ab';
      ctx.font = (cur ? 'bold ' : '') + '33px system-ui, sans-serif';
      const mark = doneStep ? '✓' : cur ? '▶' : '○';
      ctx.fillText(mark, 26, y);
      y = wrapText(ctx, s.text, 66, y, W - 92, 39) + 6;
    });
    const s = m.steps[state.step];
    const status = s.status?.();
    if (status) { ctx.fillStyle = '#1f4e79'; ctx.font = 'bold 32px system-ui, sans-serif'; y = wrapText(ctx, status, 66, y + 2, W - 92, 38) + 4; }
    if (state.stepT > 25 && state.pending <= 0 && y < H - 150) {
      ctx.fillStyle = '#b9770e'; ctx.font = '29px system-ui, sans-serif';
      y = wrapText(ctx, 'Hint: ' + s.hint, 26, y + 4, W - 52, 35) + 4;
    }
  } else if (state.phase === 'question') {
    ctx.fillStyle = '#13293d'; ctx.font = 'bold 38px system-ui, sans-serif';
    y = wrapText(ctx, m.question.q, 26, y + 10, W - 52, 46) + 8;
    ctx.font = '30px system-ui, sans-serif'; ctx.fillStyle = '#1f4e79';
    y = wrapText(ctx, `${w.Touch} your answer on the blue panel to the right of the board.`, 26, y, W - 52, 36);
  } else {
    ctx.fillStyle = '#1e8449'; ctx.font = 'bold 50px system-ui, sans-serif';
    y = wrapText(ctx, `Mission complete!  ${'★'.repeat(state.lastStars || 1)}`, 26, y + 20, W - 52, 58);
    ctx.fillStyle = '#13293d'; ctx.font = '31px system-ui, sans-serif';
    const all = saved.done.every(Boolean);
    const total = saved.stars.reduce((a, b) => a + (b || 0), 0);
    if (state.mission === 1) y = wrapText(ctx, `You sorted ${state.sortedRight} of 8 objects right the first time.`, 26, y + 4, W - 52, 38);
    y = wrapText(ctx, all ? `Well done! You finished all five missions and lit up the village. Stars: ${total} of 10.` : `${w.Touch} NEXT on the edge of the table to go on. One star for finishing, one for answering the question right first time.`, 26, y + 8, W - 52, 38);
  }
  // message box at the bottom
  if (state.toast && time < state.toast.until) {
    const colours = { good: ['#d5f5e3', '#145a32'], warn: ['#fdebd0', '#7e5109'], danger: ['#f5b7b1', '#7b241c'], info: ['#d6eaf8', '#1b4f72'] };
    const [bg, fg] = colours[state.toast.kind] || colours.info;
    ctx.font = 'bold 30px system-ui, sans-serif';
    const lines = wrapLines(ctx, state.toast.text, W - 90);
    const bh = lines.length * 36 + 26;
    ctx.fillStyle = bg; roundRect(ctx, 20, H - bh - 16, W - 40, bh, 16); ctx.fill();
    ctx.fillStyle = fg;
    lines.forEach((l, i) => ctx.fillText(l, 44, H - bh - 16 + 44 + i * 36));
  } else if (state.phase === 'build') {
    ctx.fillStyle = '#6b6b6b'; ctx.font = '26px system-ui, sans-serif';
    const how = input.kind === 'hand' ? 'PINCH a part to pick it up. PINCH again over an empty gap to place it. PINCH in the air to put it back. TOUCH switches and buttons.'
      : input.kind === 'controller' ? 'Pull the TRIGGER on a part to pick it up, and again over an empty gap to place it. Touch or point at switches and buttons.'
        : 'Click a part to pick it up, then click an empty gap to place it. Click a switch lever to flip it. Drag to look around.';
    wrapText(ctx, how + '  Yellow dots show the current flowing.', 26, H - 58, W - 52, 31);
  }
  boardCanvas.update();
}
function updatePageResults() {
  const el = document.getElementById('results'); if (!el) return;
  if (!saved.done.some(Boolean)) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<b>Progress on this device</b><br>' + MISSIONS.map((m, i) =>
    `${i + 1}. ${m.title}: ${saved.done[i] ? '★'.repeat(saved.stars[i] || 1) + '☆'.repeat(2 - (saved.stars[i] || 1)) : 'not done'}`).join('<br>');
}

// ---------------------------------------------------------------- where the learner stands
const STAND_VR = V3(0, 0, 0.06);
const STAND_DESK = V3(0, 0, 0.45);
function placePlayer() {
  if (renderer.xr.isPresenting) input.placeRig(rig, STAND_VR.x, STAND_VR.z, 0);
  else { rig.position.copy(STAND_DESK); rig.rotation.set(0, 0, 0); camera.position.set(0, 1.38, 0); camera.rotation.set(-0.25, 0, 0, 'YXZ'); }
}
input.onRecenter((head) => { input.setLiftFromHead(head); placePlayer(); });

// ---------------------------------------------------------------- desktop controls
const mouse = new THREE.Vector2();
let drag = null;
const el = renderer.domElement;
el.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
  el.setPointerCapture(e.pointerId);
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
el.addEventListener('pointermove', (e) => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved > 6) {
      camera.rotation.y = THREE.MathUtils.clamp(camera.rotation.y - dx * 0.004, -1.6, 1.6);
      camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.2, 0.8);
    }
  }
});
el.addEventListener('pointerup', () => {
  if (drag && drag.moved <= 6) desktopClick();
  drag = null;
});
function desktopRay() {
  raycaster.setFromCamera(mouse, camera);
  return hitTest(raycaster.ray.origin.clone(), raycaster.ray.direction.clone(), !!desk.held);
}
function desktopClick() {
  ac();
  const h = desktopRay();
  if (desk.held) {
    const c = desk.held;
    if (h && h.slot && !h.slot.comp && slotAccepts(h.slot, c)) { place(c, h.slot); return; }
    if (h && h.button) { pressButton(h.button); return; }
    if (h && h.slot && !slotAccepts(h.slot, c)) { sfx.bad(); toast(c.type === 'object' ? 'Objects go in the yellow gap between the clips.' : 'That gap is only for testing objects.', 'warn', 4); return; }
    returnComp(c);
    return;
  }
  if (h && !h.slot) activateHit(h, null);
}
window.addEventListener('keydown', (e) => {
  if (/^Digit[1-5]$/.test(e.code)) startMission(parseInt(e.code.slice(5), 10) - 1);
  if (e.code === 'KeyR') restartStep();
  if (e.code === 'KeyC') clearBoard();
  if (e.code === 'KeyN') nextMission();
});
function updateDesktop() {
  const h = desktopRay();
  showHover(hoverText4(h), h ? h.point : null);
  el.style.cursor = h ? 'pointer' : drag ? 'grabbing' : 'grab';
}
function updateXRHover() {
  let text = '', point = null;
  for (const p of input.pointers) {
    if (p.hover) { text = hoverText4(p.hover); point = p.hover.point; break; }
    if (p.focus && !p.held) { const c = compOf(p.focus); if (c) { text = c.name + (c.locked ? ' (fixed)' : ''); point = c.group.getWorldPosition(new THREE.Vector3()); break; } }
  }
  showHover(text, point);
}

document.getElementById('helpToggle')?.addEventListener('click', (e) => {
  const h = document.getElementById('help');
  h.classList.toggle('min');
  e.target.textContent = h.classList.contains('min') ? 'Show help' : 'Hide help';
});
renderer.xr.addEventListener('sessionstart', () => {
  document.getElementById('help')?.classList.add('min');
  if (desk.held) returnComp(desk.held);
  camera.rotation.set(0, 0, 0);
});
renderer.xr.addEventListener('sessionend', () => {
  for (const p of input.pointers) { const c = compOf(p.held); if (c) returnComp(c); }
  rig.position.y = 0;
  placePlayer();
  boardDirty = true;
});

// ---------------------------------------------------------------- start
world.windows.forEach((w) => (w.keep = !!saved.done[3]));
setGardenGrowth(saved.done[4] ? 1 : 0.35);
startMission(saved.done.findIndex((d) => !d) >= 0 ? saved.done.findIndex((d) => !d) : 0);
placePlayer();
updatePageResults();

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
const _ap = new THREE.Vector3();
let speed = 1;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05) * speed;
  time += dt;
  updateTweens(dt);
  input.update();
  updateGame(dt);
  updateParts(dt);
  recordSnap(dt);
  if (renderer.xr.isPresenting) updateXRHover(); else updateDesktop();
  // guide arrow: what to use next (for the faults, only after the hint appears)
  const m = MISSIONS[state.mission];
  let t = null;
  if (state.phase === 'build' && state.pending <= 0) {
    const s = m.steps[state.step];
    if (m.arrowAfterHint) t = state.stepT > 25 ? state.fault : null;
    else t = s.arrow ? s.arrow() : null;
  } else if (state.phase === 'question') t = null;
  else if (state.phase === 'complete') t = nextBtn;
  if (t && t.parent && isShown(t)) {
    t.getWorldPosition(_ap);
    arrow.visible = true;
    arrow.position.set(_ap.x, _ap.y + 0.075 + Math.sin(time * 5) * 0.01, _ap.z);
  } else arrow.visible = false;
  // redraw the board when something changed, and twice a second for live readouts
  if (boardDirty || time - boardDrawnAt > 0.5) { drawBoard(); boardDirty = false; boardDrawnAt = time; }
  renderer.render(scene, camera);
  hud.update();
});

// Test hook for the automated browser tests (harmless for players).
window.game = {
  THREE, scene, camera, rig, renderer, input, state, world, slots, comps, spawners, MISSIONS, saved, answer, circuit,
  startMission, slotAt, pick, place, heldPress, returnComp, toggleSwitch, clearBoard, restartStep, nextMission,
  solve, sim, brightness, motorSpeed, placedOf, isSeries, isParallel, switchControls, snapTarget, hitTest, desk, board,
  missionButtons, nextBtn, restartBtn, clearBtn, pressButton, desktopClick, mouse,
  get live() { return live; }, get time() { return time; }, setSpeed(s) { speed = s; },
};
