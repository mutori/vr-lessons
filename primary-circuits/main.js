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
const TABLE_Y_FOR_LIGHT = 0.78;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Neutral tone mapping keeps the painted colours true while taming the bright sun.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
// One small shadow map, only over the workbench: parts sit on the board and a held part
// throws a shadow where it will land, which makes placing easy to judge in VR.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // cheaper than soft PCF on a mobile GPU; shadow.radius still softens it
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(0.5);
document.body.appendChild(renderer.domElement);
const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
document.body.appendChild(vrButton);
document.getElementById('loading')?.remove();

// One palette for the whole village: warm earth, thatch and msasa reds, against a cool sky.
const PAL = {
  soil: 0xb5673e, soilDark: 0x8a4a2c, yard: 0xc98a5c, grass: 0x8fa64a, grassDry: 0xc2a85a, grassDeep: 0x5f8a3a,
  bark: 0x5a3b26, barkDark: 0x3f2818, leafGreen: 0x6f9a3c, leafRed: 0xb4502c, leafAmber: 0xd08a34, leafOlive: 0x8a9a3e,
  mud: 0xc99466, mudDark: 0x8e5b3a, thatch: 0xd6b26a, thatchDark: 0xa98443, wood: 0x9a6a3c, woodDark: 0x5e3c22,
  granite: 0x9b958c, graniteDark: 0x77736c, hillFar: 0x7f8fa0, steel: 0x8d949b, tank: 0x2f6b44, brick: 0xa4583a,
  white: 0xf4efe4, ink: 0x13293d, skin: 0x6b3f26, skinDark: 0x4e2c1a, shirt: 0x4f8fd0, shorts: 0x22385a, hair: 0x1c1410,
};
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9dcc6);
scene.fog = new THREE.Fog(0xe9dcc6, 22, 85);   // fog takes the horizon colour, so far hills fade into it

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 140);
camera.position.set(0, 1.35, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

// warm key light (the sun) and cool sky fill: the classic painterly pairing
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x9a6040, 1.55);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffe0b0, 2.4);
sunLight.position.set(1.96, 4.88, -4.4);   // the same direction as the sun in the sky
sunLight.target.position.set(0, TABLE_Y_FOR_LIGHT, -0.5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
Object.assign(sunLight.shadow.camera, { left: -0.85, right: 0.85, top: 0.7, bottom: -0.7, near: 3, far: 9 });
sunLight.shadow.bias = -0.0004;
sunLight.shadow.normalBias = 0.004;
sunLight.shadow.radius = 3;
scene.add(sunLight, sunLight.target);

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
// Meshes with transparency (unless userData.merge), several materials or userData.keep are left alone.
const MERGE_ATTRS = ['position', 'normal', 'color', 'uv'];
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || !o.material.visible) return;
    if (o.material.transparent && !o.userData.merge) return;
    for (let a = o; a && a !== root; a = a.parent) if (a.userData.keep) return;
    victims.push(o);
  });
  for (const o of victims) {
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const key = o.material;
    if (!groups.has(key)) groups.set(key, { geos: [], shadow: false, receive: false });
    const gr = groups.get(key);
    gr.geos.push(g); gr.shadow ||= o.castShadow; gr.receive ||= o.receiveShadow;
    o.removeFromParent();
  }
  for (const [material, gr] of groups) {
    const geo = joinGeos(gr.geos);
    const m = noHit(new THREE.Mesh(geo, material));
    m.castShadow = gr.shadow; m.receiveShadow = gr.receive;
    m.renderOrder = material.transparent ? 1 : 0;
    root.add(m);
  }
}
// Join non-indexed geometries, keeping the attributes they all share.
function joinGeos(geos) {
  const names = MERGE_ATTRS.filter((n) => geos.every((g) => g.attributes[n]));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const geo = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(n * size);
    let k = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, k * size); k += g.attributes.position.count; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  for (const g of geos) g.dispose();
  geo.computeBoundingSphere();
  return geo;
}
// Low-poly models: each part is a primitive painted with one flat colour (vertex colours, flat facets),
// so a whole model, or the whole village, bakes down to a single draw call.
const VC = new THREE.MeshLambertMaterial({ vertexColors: true });
const _col = new THREE.Color();
function paint(geo, color, flat = true) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (flat) g.computeVertexNormals();
  _col.set(color);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _col.r; a[i * 3 + 1] = _col.g; a[i * 3 + 2] = _col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// part(geometry, colour, [x,y,z], [rx,ry,rz], [sx,sy,sz])
function part(geo, color, p = [0, 0, 0], r = [0, 0, 0], sc = [1, 1, 1]) {
  const m = new THREE.Mesh(paint(geo, color), VC);
  m.position.set(...p); m.rotation.set(...r); m.scale.set(...(typeof sc === 'number' ? [sc, sc, sc] : sc));
  return m;
}
// Bake a group of painted parts into one geometry (for instancing or for a single moving piece).
function bake(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const geos = [];
  group.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); geos.push(g); } });
  return joinGeos(geos);
}
// Soft round contact shadows (fake ambient occlusion) under things standing on the ground.
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x3a1c10, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function blob(x, z, rx, rz = rx, y = 0.012, opacity = 1) {
  const m = new THREE.Mesh(blobGeo, opacity === 1 ? blobMat : blobMat.clone());
  if (opacity !== 1) m.material.opacity *= opacity;
  m.position.set(x, y, z); m.scale.set(rx * 2, 1, rz * 2);
  m.userData.merge = opacity === 1;
  return noHit(m);
}
// Seeded random numbers, so the village looks the same every visit.
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = (a, b) => a + rnd() * (b - a);

// ---------------------------------------------------------------- text on canvases
function canvasPlane(w, h, res = 700) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * res);
  c.height = Math.round(h * res);
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, toneMapped: false }));
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
// Art direction: one focal point (the workbench and board), the homestead framing it on the left,
// the solar pump on the right, a msasa tree shading the learner, and granite kopjes fading into
// the haze. Flat-shaded low-poly shapes in one shared palette; textures only where they tell a story
// (swept soil, mud walls with a painted band, thatch, wood grain).
const world = {
  sun: 1, dusk: 0, night: 0, windows: [], tankLevel: 0, garden: null, gauge: null, stream: null, cable: null, cloud: null, sunSprite: null,
  chickens: [], birds: null, fireflies: null, motes: null, clouds: null,
};
function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function speckle(g, w, h, n, colours, size = [1, 3]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colours[i % colours.length];
    const s = size[0] + rnd() * (size[1] - size[0]);
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}
const TEX = {
  soil: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b5673e'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1400, ['rgba(120,60,30,0.35)', 'rgba(220,150,100,0.3)', 'rgba(90,45,25,0.25)'], [1, 4]);
  }, [36, 36]),
  // a swept yard: smooth pale earth with the curved marks of a grass broom
  yard: canvasTex(512, 512, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(214,160,112,1)'); gr.addColorStop(0.8, 'rgba(206,148,100,0.95)'); gr.addColorStop(1, 'rgba(200,140,95,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,95,60,0.18)'; g.lineWidth = 2;
    for (let i = 0; i < 160; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 40, a = rnd() * Math.PI * 2;
      if (Math.hypot(x - w / 2, y - h / 2) > w * 0.42) continue;
      g.beginPath(); g.arc(x, y, r, a, a + 0.9); g.stroke();
    }
  }),
  mud: canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#cf9a68'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['rgba(140,90,55,0.25)', 'rgba(235,190,140,0.3)'], [1, 5]);
    // painted band: a dark base and a zig-zag frieze in white and red ochre, as on many rural huts
    g.fillStyle = '#7d4a2c'; g.fillRect(0, h * 0.8, w, h * 0.2);
    g.fillStyle = '#f2e6cf'; g.fillRect(0, h * 0.58, w, h * 0.12);
    g.fillStyle = '#9b3d22';
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, h * 0.70); g.lineTo(x + 16, h * 0.58); g.lineTo(x + 32, h * 0.70); g.fill(); }
    g.fillStyle = '#3b2416'; g.fillRect(0, h * 0.565, w, 4); g.fillRect(0, h * 0.70, w, 4);
  }, [3, 1]),
  thatch: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d2ad66'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const x = rnd() * w, y = rnd() * h, l = 20 + rnd() * 50;
      g.strokeStyle = ['rgba(150,110,55,0.5)', 'rgba(235,205,140,0.55)', 'rgba(120,85,40,0.4)'][i % 3];
      g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y + l); g.stroke();
    }
    // two binding rings
    g.fillStyle = 'rgba(110,75,35,0.55)'; g.fillRect(0, h * 0.3, w, 5); g.fillRect(0, h * 0.62, w, 5);
  }, [6, 1]),
  wood: canvasTex(512, 256, (g, w, h) => {
    const planks = 4;
    for (let p = 0; p < planks; p++) {
      const y0 = (p * h) / planks;
      g.fillStyle = ['#a57142', '#9a6638', '#ad7a48', '#94603a'][p];
      g.fillRect(0, y0, w, h / planks);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(80,45,20,${0.12 + rnd() * 0.18})`; g.lineWidth = 1 + rnd();
        const y = y0 + rnd() * (h / planks);
        g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5);
        g.stroke();
      }
      g.fillStyle = 'rgba(50,28,12,0.6)'; g.fillRect(0, y0, w, 2);
    }
  }),
};
const MATS = {
  soil: new THREE.MeshLambertMaterial({ map: TEX.soil }),
  mud: new THREE.MeshLambertMaterial({ map: TEX.mud }),
  thatch: new THREE.MeshLambertMaterial({ map: TEX.thatch, flatShading: true }),
  wood: new THREE.MeshLambertMaterial({ map: TEX.wood }),
};
// sky: a vertical gradient (deep blue overhead to warm haze at the horizon) drawn by a tiny shader
const skyUniforms = { top: { value: new THREE.Color(0x3f86cf) }, mid: { value: new THREE.Color(0x92c6ea) }, hor: { value: new THREE.Color(0xe9dcc6) } };
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.85, h));
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
// a glow texture for suns, window light, fireflies and light pools
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const additive = (color, opacity = 1) => new THREE.MeshBasicMaterial({ map: softTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });

function msasa(x, z, s, colours) {
  const t = new THREE.Group();
  t.add(part(new THREE.CylinderGeometry(0.14, 0.22, 2.2, 6), PAL.bark, [0, 1.1, 0], [0, 0, rr(-0.08, 0.08)]));
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + rnd();
    t.add(part(new THREE.CylinderGeometry(0.05, 0.09, 1.3, 5), PAL.bark, [Math.cos(a) * 0.35, 2.4, Math.sin(a) * 0.35], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]));
  }
  // msasa crowns are wide, flat umbrellas: a few squashed clumps in spring reds, ambers and greens
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2, r = i === 0 ? 0 : rr(0.6, 1.2);
    t.add(part(new THREE.IcosahedronGeometry(rr(0.9, 1.25), 0), colours[i % colours.length], [Math.cos(a) * r, rr(2.9, 3.3), Math.sin(a) * r], [rnd(), rnd(), 0], [1.35, 0.5, 1.35]));
  }
  t.position.set(x, 0, z); t.scale.setScalar(s); t.rotation.y = rnd() * 6;
  return t;
}
function roundTree(x, z, s) {   // a dark, round muhacha-like tree, for size and colour variety
  const t = new THREE.Group();
  t.add(part(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), PAL.barkDark, [0, 0.8, 0]));
  t.add(part(new THREE.IcosahedronGeometry(1.5, 1), PAL.grassDeep, [0, 2.6, 0], [0, 0, 0], [1, 0.85, 1]));
  t.add(part(new THREE.IcosahedronGeometry(0.9, 0), 0x557f34, [0.7, 2.3, 0.4]));
  t.position.set(x, 0, z); t.scale.setScalar(s);
  return t;
}
function grassTuft(x, z, s, colour) {
  const t = new THREE.Group();
  for (let i = 0; i < 3; i++) t.add(part(new THREE.ConeGeometry(0.06, 0.45, 3), colour, [rr(-0.08, 0.08), 0.2, rr(-0.08, 0.08)], [rr(-0.3, 0.3), rnd() * 3, rr(-0.3, 0.3)]));
  t.position.set(x, 0, z); t.scale.setScalar(s);
  return t;
}
function roundHut(r, h, roofR, roofH) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, h, 28, 1, true), MATS.mud).translateY(h / 2));
  g.add(part(new THREE.CylinderGeometry(r + 0.12, r + 0.2, 0.16, 28), PAL.mudDark, [0, 0.08, 0]));     // raised floor ledge
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofR, roofH, 22, 2, true), MATS.thatch);
  roof.position.y = h + roofH / 2 - 0.12;
  g.add(roof);
  const under = part(new THREE.ConeGeometry(roofR, roofH, 22, 1, true), PAL.barkDark, [0, h + roofH / 2 - 0.13, 0]);
  under.material = VC; under.geometry.scale(-1, 1, 1);   // the inside of the eaves, so the roof is not paper-thin
  g.add(under);
  g.add(part(new THREE.ConeGeometry(0.18, 0.4, 6), PAL.thatchDark, [0, h + roofH - 0.05, 0]));
  return g;
}

// The neighbours' houses (chapter 6): each one lights up when its job is done.
const HOUSES = [
  { name: 'Gogo', kind: 'hut', x: -8.5, z: -8.2 },
  { name: "Mai Rudo's shop", kind: 'shop', x: -2.6, z: -12.8, sign: "MAI RUDO'S SHOP", wall: 0xe2b845 },
  { name: 'School', kind: 'school', x: 5.4, z: -12.2, sign: 'CHIRODZO PRIMARY SCHOOL', wall: 0xefe2c4 },
  { name: 'Clinic', kind: 'clinic', x: 10.6, z: -5.8, sign: '✚ CLINIC', wall: 0xf4f1ea },
];
function signPlane(text, w, h, bg, fg) {
  const p = canvasPlane(w, h, 160);
  const { ctx, c } = p;
  ctx.fillStyle = bg; roundRect(ctx, 0, 0, c.width, c.height, 10); ctx.fill();
  let px = Math.round(c.height * 0.62);
  do { ctx.font = `bold ${px}px system-ui, sans-serif`; px -= 2; } while (ctx.measureText(text).width > c.width - 16 && px > 8);
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 1);
  p.update();
  p.mesh.material.toneMapped = true;
  return p.mesh;
}
function buildHouse(h) {
  const g = new THREE.Group();
  const wm = new THREE.MeshBasicMaterial({ color: 0x2b2420 });
  const windows = [];
  const win = (x, y, z, w = 0.5, hh = 0.45) => {
    g.add(part(new THREE.BoxGeometry(w + 0.1, hh + 0.1, 0.06), PAL.woodDark, [x, y, z]));
    g.add(mesh(new THREE.PlaneGeometry(w, hh), wm, x, y, z + 0.035));
    windows.push(V3(x, y, z + 0.25));
  };
  if (h.kind === 'hut') {
    g.add(roundHut(1.2, 1.6, 1.75, 1.3));
    g.add(part(new THREE.BoxGeometry(0.66, 1.3, 0.06), 0x6e4527, [0, 0.66, 1.21]));
    win(0.7, 1.0, 0.98, 0.4, 0.36);
  } else {
    const W = h.kind === 'school' ? 5 : h.kind === 'shop' ? 3 : 3.6, H = 2.3, D = 2.6;
    g.add(part(new THREE.BoxGeometry(W, H, D), h.wall, [0, H / 2, 0]));
    g.add(part(new THREE.BoxGeometry(W + 0.04, 0.5, D + 0.04), h.kind === 'clinic' ? 0x3f8a5a : h.kind === 'school' ? 0x9b4a2c : 0x7a5a2a, [0, 0.25, 0]));   // painted plinth band
    // corrugated tin roof: a shallow gable for the school and clinic, a lean-to for the shop
    const tin = 0x9aa1a6;
    if (h.kind === 'shop') g.add(part(new THREE.BoxGeometry(W + 0.5, 0.06, D + 0.8), tin, [0, H + 0.2, 0.15], [0.16, 0, 0]));
    else for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(W + 0.4, 0.06, D / 2 + 0.45), s < 0 ? tin : 0x868d92, [0, H + 0.32, s * (D / 4 + 0.08)], [s * 0.3, 0, 0]));
    if (h.kind !== 'shop') g.add(part(new THREE.CylinderGeometry(0.02, 0.02, W, 4, 1), 0x6a7075, [0, H + 0.62, 0], [0, 0, Math.PI / 2]));
    if (h.kind !== 'shop') for (const s of [-1, 1]) g.add(part(new THREE.CylinderGeometry(D / 2 + 0.05, D / 2 + 0.05, 0.04, 3, 1), h.wall, [s * (W / 2 - 0.02), H + 0.0, 0], [0, 0, Math.PI / 2], [1, 1, 0.42]));
    g.add(part(new THREE.BoxGeometry(0.8, 1.6, 0.06), h.kind === 'clinic' ? 0x3f8a5a : 0x6e4527, [h.kind === 'school' ? -1.6 : -0.6, 0.8, D / 2 + 0.01]));
    if (h.kind === 'school') { win(-0.3, 1.25, D / 2); win(0.8, 1.25, D / 2); win(1.9, 1.25, D / 2); }
    else win(0.6, 1.25, D / 2);
    const sign = signPlane(h.sign, Math.min(W - 0.2, 2.8), 0.36, h.kind === 'clinic' ? '#ffffff' : '#13293d', h.kind === 'clinic' ? '#c0392b' : '#ffd84d');
    sign.position.set(0, H - 0.25, D / 2 + 0.04);
    g.add(sign);
  }
  g.position.set(h.x, 0, h.z);
  g.rotation.y = Math.atan2(-h.x, -h.z);
  const glows = windows.map((wp) => {
    const glow = noHit(new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    glow.position.copy(wp); glow.scale.setScalar(1.4);
    g.add(glow);
    return glow;
  });
  const pool = noHit(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2).rotateX(-Math.PI / 2), additive(0xffa850, 0)));
  pool.position.set(0, 0.025, (h.kind === 'hut' ? 1.2 : 1.3) + 1.1);
  g.add(pool);
  const tag = tagSprite(h.name, { scale: 0.22 });
  tag.position.set(0, h.kind === 'hut' ? 3.4 : 3.3, 0);
  g.add(tag);
  return { group: g, wm, glows, pool, level: 0 };
}

function buildWorld() {
  const sky = noHit(new THREE.Mesh(new THREE.SphereGeometry(110, 32, 16), skyMat));
  sky.renderOrder = -1;
  scene.add(sky);
  const ground = noHit(new THREE.Mesh(new THREE.CircleGeometry(100, 48), MATS.soil));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  scene.add(ground);
  const yard = noHit(new THREE.Mesh(new THREE.CircleGeometry(8, 40), new THREE.MeshLambertMaterial({ map: TEX.yard, transparent: true, depthWrite: false })));
  yard.rotation.x = -Math.PI / 2; yard.position.set(-0.6, 0.004, -2.4);
  scene.add(yard);

  const scenery = new THREE.Group();
  scene.add(scenery);
  const blobs = new THREE.Group();
  scene.add(blobs);

  // the shade tree the class sits under: trunk on the left, crown spread over the learner
  {
    const t = new THREE.Group();
    t.add(part(new THREE.CylinderGeometry(0.2, 0.34, 2.9, 7), PAL.bark, [0, 1.45, 0], [0, 0, -0.1]));
    for (const [a, l, tilt] of [[0.2, 2.2, 0.9], [1.9, 1.8, 0.8], [3.6, 1.9, 0.75], [5.0, 1.7, 0.85], [-0.6, 2.4, 1.0]]) {
      const b = part(new THREE.CylinderGeometry(0.06, 0.14, l, 5), PAL.bark);
      b.position.set(0.15 + Math.cos(a) * l * 0.35, 2.75 + l * 0.25, Math.sin(a) * l * 0.35);
      b.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      t.add(b);
    }
    const cols = [PAL.leafGreen, PAL.leafRed, PAL.leafAmber, PAL.leafOlive, PAL.leafGreen, PAL.leafRed];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, r = i === 0 ? 0 : rr(1.0, 2.4);
      t.add(part(new THREE.IcosahedronGeometry(rr(1.0, 1.4), 0), cols[i % cols.length], [0.9 + Math.cos(a) * r, rr(3.9, 4.4), 0.4 + Math.sin(a) * r], [rnd(), rnd(), 0], [1.4, 0.45, 1.4]));
    }
    t.position.set(-2.3, 0, -0.7);
    scenery.add(t);
    blobs.add(blob(-2.3, -0.7, 0.9), blob(-1.4, -0.3, 2.6, 2.4, 0.008, 0.5));
  }
  // trees around the homestead: msasa in spring colours, a few round dark trees
  const msasaCols = [[PAL.leafRed, PAL.leafAmber, PAL.leafGreen], [PAL.leafGreen, PAL.leafOlive, PAL.leafAmber], [PAL.leafAmber, PAL.leafRed, PAL.leafOlive]];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rr(-0.1, 0.1), r = rr(10, 26);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 1 && Math.abs(x) < 6) continue;   // keep the space behind the learner open
    if (Math.abs(x - 3.5) < 3 && z < -1 && z > -9) continue;   // keep the sun's side open over the pump
    if (HOUSES.some((h) => Math.hypot(h.x - x, h.z - z) < 4)) continue;
    const s = rr(0.8, 1.35);
    scenery.add(i % 4 === 3 ? roundTree(x, z, s) : msasa(x, z, s, msasaCols[i % 3]));
    blobs.add(blob(x, z, 1.6 * s));
  }
  // grass tufts outside the swept yard
  const tuftCols = [PAL.grass, PAL.grassDry, PAL.grassDeep, PAL.grassDry];
  for (let i = 0; i < 170; i++) {
    const a = rnd() * Math.PI * 2, r = rr(7.5, 32);
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 2;
    scenery.add(grassTuft(x, z, rr(0.7, 1.4), tuftCols[i % 4]));
  }
  // granite kopjes with balancing rocks, then a far blue ridge: three layers of depth
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.5 + rr(-0.1, 0.1), r = rr(34, 44);
    const kop = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = rr(1.4, 3.6);
      kop.add(part(new THREE.DodecahedronGeometry(1, 0), i % 2 ? PAL.granite : PAL.graniteDark, [rr(-3, 3), s * 0.55, rr(-2, 2)], [rnd(), rnd(), 0], [s, s * 0.75, s]));
    }
    kop.add(part(new THREE.DodecahedronGeometry(1, 0), PAL.granite, [0.3, 5.2, 0], [0.4, 0.2, 0.3], [1.6, 1.3, 1.5]));   // a balancing rock on top
    kop.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    scenery.add(kop);
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, r = rr(68, 80);
    scenery.add(part(new THREE.IcosahedronGeometry(1, 0), PAL.hillFar, [Math.cos(a) * r, 0, Math.sin(a) * r], [0, rnd() * 3, 0], [rr(14, 24), rr(5, 10), rr(10, 16)]));
  }

  // the family's round hut, with two windows that light up in mission 4
  const hut = roundHut(1.5, 1.9, 2.15, 1.55);
  const hutPos = V3(-3.9, 0, -3.1);
  hut.position.copy(hutPos);
  hut.rotation.y = Math.atan2(-hutPos.x, -hutPos.z);
  hut.add(part(new THREE.BoxGeometry(0.86, 1.56, 0.08), PAL.woodDark, [0, 0.8, 1.5]));          // door frame
  hut.add(part(new THREE.BoxGeometry(0.66, 1.42, 0.06), 0x6e4527, [0, 0.79, 1.53]));             // plank door
  for (let i = 0; i < 3; i++) hut.add(part(new THREE.BoxGeometry(0.02, 1.38, 0.065), PAL.woodDark, [-0.2 + i * 0.2, 0.79, 1.535]));
  hut.add(part(new THREE.CylinderGeometry(0.5, 0.55, 0.1, 10, 1, false, -Math.PI / 2, Math.PI), PAL.mudDark, [0, 0.05, 1.55]));   // half-round doorstep
  for (let s = 0; s < 2; s++) {
    const a = (s ? 1 : -1) * 0.78;
    const wm = new THREE.MeshBasicMaterial({ color: 0x2b2420 });
    const w = mesh(new THREE.PlaneGeometry(0.44, 0.4), wm, Math.sin(a) * 1.545, 1.2, Math.cos(a) * 1.545);
    w.rotation.y = a; w.userData.keep = true;
    const frame = part(new THREE.BoxGeometry(0.56, 0.52, 0.06), PAL.woodDark, [Math.sin(a) * 1.52, 1.2, Math.cos(a) * 1.52], [0, a, 0]);
    hut.add(frame, w);
    // light spilling out of the window at night: a soft glow and a warm pool on the ground
    const glow = noHit(new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    glow.position.set(Math.sin(a) * 1.75, 1.2, Math.cos(a) * 1.75); glow.scale.setScalar(1.3);
    const pool = noHit(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), additive(0xffa850, 0)));
    pool.position.set(Math.sin(a) * 2.3, 0.02, Math.cos(a) * 2.3);
    pool.userData.keep = true;
    hut.add(glow, pool);
    const lbl = tagSprite(s === 0 ? 'Room 1' : 'Room 2', { scale: 0.16 });
    lbl.position.set(Math.sin(a) * 1.75, 1.66, Math.cos(a) * 1.75);
    hut.add(lbl);
    world.windows.push({ mat: wm, level: 0, glow, pool });
  }
  scene.add(noHit(hut));
  mergeStatic(hut);
  blobs.add(blob(hutPos.x, hutPos.z, 2.3));

  world.houses = HOUSES.map((h) => {
    const house = buildHouse(h);
    scenery.add(house.group);
    blobs.add(blob(h.x, h.z, h.kind === 'school' ? 3.2 : 2.2));
    return house;
  });
  // a granary on stilts, a cooking hut fire-pit of three stones, and a clay pot
  {
    const gr = roundHut(0.62, 0.8, 0.95, 0.9);
    gr.children.forEach((c) => (c.position.y += 0.55));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      gr.add(part(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 5), PAL.woodDark, [Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4]));
      gr.add(part(new THREE.DodecahedronGeometry(0.1, 0), PAL.granite, [Math.cos(a) * 0.4, 0.04, Math.sin(a) * 0.4]));
    }
    gr.position.set(-6.3, 0, -1.6);
    scene.add(noHit(gr)); mergeStatic(gr);
    blobs.add(blob(-6.3, -1.6, 1.0));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; scenery.add(part(new THREE.DodecahedronGeometry(0.14, 0), PAL.graniteDark, [-2.2 + Math.cos(a) * 0.22, 0.08, -4.6 + Math.sin(a) * 0.22])); }
    scenery.add(part(new THREE.SphereGeometry(0.28, 9, 6), 0x9a4a2a, [-2.75, 0.24, -4.3], [0, 0, 0], [1, 0.85, 1]));
    scenery.add(part(new THREE.CylinderGeometry(0.12, 0.16, 0.08, 9), 0x7d3b22, [-2.75, 0.5, -4.3]));
  }

  // solar panel on a pole (mission 5)
  const panel = new THREE.Group();
  panel.add(part(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6), PAL.steel, [0, 0.9, 0]));
  panel.add(part(new THREE.BoxGeometry(0.4, 0.12, 0.4), 0xbdb5a6, [0, 0.06, 0]));
  const ptex = canvasTex(256, 160, (px) => {
    px.fillStyle = '#c9ced4'; px.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const gr = px.createLinearGradient(0, 6 + j * 38, 0, 40 + j * 38);
      gr.addColorStop(0, '#3a66b8'); gr.addColorStop(1, '#16306a');
      px.fillStyle = gr; px.fillRect(6 + i * 41.5, 6 + j * 38, 38, 34);
    }
  });
  const face = mesh(new THREE.BoxGeometry(1.2, 0.04, 0.75), [lam(0x999999), lam(0x999999), mat(0xffffff, { map: ptex, roughness: 0.25, metalness: 0.2 }), lam(0x999999), lam(0x999999), lam(0x999999)], 0, 1.85, 0);
  face.rotation.x = 0.5;
  panel.add(face);
  panel.position.set(2.2, 0, -3.6);
  panel.rotation.y = -0.5;
  scene.add(noHit(panel)); mergeStatic(panel);
  blobs.add(blob(2.2, -3.6, 0.7));
  const ptag = tagSprite('Solar panel', { scale: 0.14 });
  ptag.position.set(2.2, 2.55, -3.6);
  scene.add(ptag);

  // the water tank on a steel stand, fed by a pipe from the borehole pump
  const tank = new THREE.Group();
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) tank.add(part(new THREE.BoxGeometry(0.06, 1.0, 0.06), PAL.steel, [x, 0.5, z]));
  tank.add(part(new THREE.BoxGeometry(1.05, 0.06, 1.05), PAL.steel, [0, 1.0, 0]));
  tank.add(part(new THREE.BoxGeometry(0.95, 0.04, 0.04), PAL.steel, [0, 0.45, 0.45], [0, 0, 0.9]));
  tank.add(part(new THREE.BoxGeometry(0.95, 0.04, 0.04), PAL.steel, [0, 0.45, -0.45], [0, 0, -0.9]));
  tank.add(part(new THREE.CylinderGeometry(0.6, 0.6, 1.25, 16), PAL.tank, [0, 1.66, 0]));
  for (const y of [1.25, 1.66, 2.07]) tank.add(part(new THREE.CylinderGeometry(0.615, 0.615, 0.05, 16), 0x285a3a, [0, y, 0]));   // moulded ribs
  tank.add(part(new THREE.CylinderGeometry(0.6, 0.5, 0.12, 16), 0x285a3a, [0, 2.34, 0]));
  tank.add(part(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10), 0x1f4a2e, [0, 2.42, 0]));
  // gauge: white tube with blue water rising inside, facing the player
  const gauge = new THREE.Group();
  gauge.add(mesh(new THREE.BoxGeometry(0.16, 1.15, 0.02), basic(0xf4f4f0), 0, 0, 0));
  const water = mesh(new THREE.BoxGeometry(0.12, 1.09, 0.025), basic(0x2f8fe0), 0, -0.545, 0.003);
  water.geometry.translate(0, 0.545, 0);
  water.scale.y = 0.001;
  water.userData.keep = true;
  gauge.add(water);
  gauge.position.set(0, 1.66, 0.62);
  tank.add(gauge);
  // pipe from the pump (on the ground) up the stand and over the lid
  tank.add(part(new THREE.CylinderGeometry(0.035, 0.035, 2.35, 6), 0x3c3c3c, [-0.62, 1.2, 0]));
  tank.add(part(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), 0x3c3c3c, [-0.4, 2.38, 0], [0, 0, Math.PI / 2]));
  tank.add(part(new THREE.BoxGeometry(0.3, 0.25, 0.25), 0x2e6fd1, [-0.62, 0.12, 0]));            // the pump box at the borehole
  const stream = mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.3, 8), basic(0x7fc4ff, { transparent: true, opacity: 0.85 }), -0.16, 2.24, 0);
  stream.visible = false;
  stream.userData.keep = true;
  tank.add(stream);
  tank.position.set(4.1, 0, -2.5);
  tank.rotation.y = Math.atan2(-4.1, 2.5);
  scene.add(noHit(tank));
  mergeStatic(tank);
  blobs.add(blob(4.1, -2.5, 0.9));
  const ttag = tagSprite('Water tank', { scale: 0.14 });
  ttag.position.set(4.1, 2.8, -2.5);
  scene.add(ttag);
  world.gauge = water; world.stream = stream;
  world.splashAt = V3(-0.16, 2.1, 0).applyEuler(tank.rotation).add(tank.position);

  // vegetable garden behind a pole fence: rape (covo) in the beds, maize at the back
  const garden = new THREE.Group();
  const plants = new THREE.Group();
  for (let r = 0; r < 3; r++) {
    garden.add(part(new THREE.BoxGeometry(2.4, 0.12, 0.55), PAL.soilDark, [0, 0.06, r * 0.8]));
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.Group();
      for (let l = 0; l < 4; l++) pl.add(part(new THREE.IcosahedronGeometry(0.09, 0), l % 2 ? 0x3f8f3a : 0x5fb03a, [Math.cos(l * 1.6) * 0.06, 0.12, Math.sin(l * 1.6) * 0.06], [l, l * 2, 0], [1.4, 0.5, 0.9]));
      pl.position.set(-1.0 + i * 0.4, 0.1, r * 0.8);
      plants.add(pl);
    }
  }
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Group();
    m.add(part(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 5), 0x7fa03a, [0, 0.75, 0]));
    for (let l = 0; l < 4; l++) m.add(part(new THREE.ConeGeometry(0.05, 0.7, 3), 0x8fb04a, [0, 0.5 + l * 0.25, 0], [1.0, l * 1.7, 0], [1, 1, 0.3]));
    m.position.set(-1.1 + i * 0.36, 0, -0.75);
    plants.add(m);
  }
  plants.userData.keep = true;
  garden.add(plants);
  // fence posts with two rails, open at the front
  const fx = 1.6, fz0 = -1.1, fz1 = 2.1;
  const post = (x, z) => garden.add(part(new THREE.CylinderGeometry(0.035, 0.045, 0.95, 5), PAL.woodDark, [x, 0.47, z]));
  const rail = (x0, z0, x1, z1) => { for (const y of [0.35, 0.75]) { const l = Math.hypot(x1 - x0, z1 - z0); garden.add(part(new THREE.CylinderGeometry(0.018, 0.018, l, 4), PAL.wood, [(x0 + x1) / 2, y, (z0 + z1) / 2], [Math.PI / 2, Math.atan2(x1 - x0, z1 - z0), 0])); } };
  for (let i = 0; i <= 8; i++) { const x = -fx + (i / 8) * 2 * fx; post(x, fz0); }
  for (let i = 1; i <= 6; i++) { const z = fz0 + (i / 6) * (fz1 - fz0); post(-fx, z); post(fx, z); }
  post(-fx + 0.5, fz1); post(fx - 0.5, fz1);
  rail(-fx, fz0, fx, fz0); rail(-fx, fz0, -fx, fz1); rail(fx, fz0, fx, fz1); rail(-fx, fz1, -fx + 0.5, fz1); rail(fx, fz1, fx - 0.5, fz1);
  garden.position.set(4.4, 0, -4.9);
  garden.rotation.y = -0.9;
  scene.add(noHit(garden));
  mergeStatic(garden);
  plants.userData.keep = false;
  mergeStatic(plants);
  world.garden = garden;
  garden.userData.plants = plants;
  setGardenGrowth(0.35);

  // the sun, a cloud that can drift across it, and slow fair-weather clouds
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xfff2c8, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
  sun.position.set(20, 42, -40); sun.scale.setScalar(18);
  scene.add(noHit(sun));
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xffffff, fog: false, depthWrite: false, transparent: true, toneMapped: false }));
  sunCore.scale.setScalar(5); sunCore.position.copy(sun.position);
  scene.add(noHit(sunCore));
  world.sunSprite = sun; world.sunCore = sunCore;
  const cloudPuffs = (g, col) => {
    [[0, 0, 0, 3.2], [3, -0.6, 0.5, 2.4], [-3, -0.7, 0.3, 2.3], [1.4, 1.1, -0.4, 2.2], [-1.4, 0.8, 0.4, 2]].forEach(([x, y, z, s]) => g.add(part(new THREE.IcosahedronGeometry(1, 1), col, [x, y, z], [0, 0, 0], [s, s * 0.62, s])));
  };
  const cloud = new THREE.Group();
  cloudPuffs(cloud, 0xffffff);
  const cloudMesh = new THREE.Mesh(bake(cloud), new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: 0x8a96a8 }));
  world.cloud = noHit(cloudMesh);
  world.cloud.visible = false;
  scene.add(world.cloud);
  const clouds = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group(); cloudPuffs(c, 0xffffff);
    const a = (i / 6) * Math.PI * 2 + 0.3, r = rr(55, 70);
    c.position.set(Math.cos(a) * r, rr(26, 36), Math.sin(a) * r); c.scale.setScalar(rr(1.2, 2)); c.lookAt(0, c.position.y, 0);
    clouds.add(c);
  }
  const cloudsMesh = noHit(new THREE.Mesh(bake(clouds), new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: 0x9aa6b8 })));
  scene.add(cloudsMesh);
  world.clouds = cloudsMesh;

  // cable from the solar panel to the workbench (mission 5)
  const curve = new THREE.CatmullRomCurve3([V3(0.27, 0.792, -0.435), V3(0.5, 0.79, -0.54), V3(0.76, 0.6, -0.62), V3(1.2, 0.03, -1.0), V3(2.05, 0.03, -3.3), V3(2.16, 0.4, -3.55), V3(2.18, 1.6, -3.58)]);
  world.cable = noHit(mesh(new THREE.TubeGeometry(curve, 60, 0.012, 6), lam(0x1d1d1d)));
  world.cable.visible = false;
  scene.add(world.cable);
  mergeStatic(scenery);
  mergeStatic(blobs);
  buildLife();
}
function setGardenGrowth(k) {
  world.garden.userData.growth = k;
  world.garden.userData.plants.scale.set(0.7 + 0.3 * k, Math.max(0.05, k), 0.7 + 0.3 * k);   // plants grow taller
}

// ---------------------------------------------------------------- life: chickens, birds, fireflies, motes
const HOME_CHICKENS = [V3(-2.2, 0, -3.4), V3(-1.4, 0, -4.4), V3(-3.0, 0, -5.4), V3(-5.0, 0, -0.8), V3(-0.6, 0, -3.6)];
function buildLife() {
  // chickens: one baked model drawn five times (one draw call), each pecking and wandering
  const ch = new THREE.Group();
  ch.add(part(new THREE.IcosahedronGeometry(0.11, 0), 0xffffff, [0, 0.2, 0], [0, 0, 0], [0.9, 0.85, 1.25]));
  ch.add(part(new THREE.ConeGeometry(0.07, 0.14, 4), 0xe8e0d0, [0, 0.27, -0.12], [-0.9, 0, 0]));
  ch.add(part(new THREE.IcosahedronGeometry(0.055, 0), 0xffffff, [0, 0.33, 0.11]));
  ch.add(part(new THREE.BoxGeometry(0.015, 0.04, 0.05), 0xd8281e, [0, 0.39, 0.11]));
  ch.add(part(new THREE.ConeGeometry(0.018, 0.05, 4), 0xf0b020, [0, 0.33, 0.175], [Math.PI / 2, 0, 0]));
  ch.add(part(new THREE.BoxGeometry(0.012, 0.012, 0.01), 0x111111, [0.045, 0.345, 0.135]));
  ch.add(part(new THREE.BoxGeometry(0.012, 0.012, 0.01), 0x111111, [-0.045, 0.345, 0.135]));
  for (const s of [-1, 1]) ch.add(part(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), 0xe0a020, [s * 0.04, 0.06, 0]));
  const cm = new THREE.InstancedMesh(bake(ch), VC, HOME_CHICKENS.length);
  const tints = [0xb5703a, 0xffffff, 0x5a4a3e, 0xc98a4a, 0xffffff];
  HOME_CHICKENS.forEach((p, i) => {
    cm.setColorAt(i, new THREE.Color(tints[i]));
    world.chickens.push({ pos: p.clone(), home: p.clone(), heading: rnd() * 6, target: p.clone(), wait: rnd() * 2, peck: 0, hop: 0, lost: false, found: false });
  });
  cm.frustumCulled = false;
  scene.add(noHit(cm));
  world.chickenMesh = cm;
  // a few birds wheeling high over the kopjes
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.5, 0.15, -0.1, 0, 0, -0.08, 0, 0, 0.12, 0, 0, -0.08, 0.5, 0.15, -0.1], 3));
  bg.computeVertexNormals();
  world.birds = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0x2a2420, side: THREE.DoubleSide }), 5);
  world.birds.frustumCulled = false;
  scene.add(noHit(world.birds));
  // fireflies at dusk, and pollen motes drifting in the sunlight by day
  const pts = (n, spread, colour, size) => {
    const g = new THREE.BufferGeometry(), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = spread.x0 + rnd() * (spread.x1 - spread.x0); a[i * 3 + 1] = spread.y0 + rnd() * (spread.y1 - spread.y0); a[i * 3 + 2] = spread.z0 + rnd() * (spread.z1 - spread.z0); }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    g.userData.base = a.slice();
    const p = new THREE.Points(g, new THREE.PointsMaterial({ map: softTex, color: colour, size, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
    p.frustumCulled = false;
    scene.add(noHit(p));
    return p;
  };
  world.fireflies = pts(46, { x0: -7, x1: 6, y0: 0.3, y1: 1.8, z0: -7, z1: -1.5 }, 0xd8ff70, 0.09);
  // stars for the night-time bonus
  {
    const n = 400, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = rnd() * Math.PI * 2, y = 0.08 + rnd() * 0.92, r = Math.sqrt(1 - y * y);
      a[i * 3] = Math.cos(th) * r * 100; a[i * 3 + 1] = y * 100; a[i * 3 + 2] = Math.sin(th) * r * 100;
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    world.stars = noHit(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false })));
    world.stars.frustumCulled = false;
    scene.add(world.stars);
  }
  world.motes = pts(60, { x0: -1.2, x1: 1.2, y0: 0.85, y1: 2.2, z0: -1.4, z1: 0.3 }, 0xfff2c0, 0.012);
}
const _lm = new THREE.Matrix4(), _lp = new THREE.Vector3(), _lq = new THREE.Quaternion(), _ls = new THREE.Vector3(1, 1, 1);
function updateLife(dt) {
  const cm = world.chickenMesh;
  world.chickens.forEach((c, i) => {
    if (c.wait > 0) {
      c.wait -= dt;
      c.peck = Math.max(0, Math.sin(time * 9 + i) * (c.wait % 1.4 < 0.7 ? 1 : 0));
      if (c.wait <= 0) {
        const base = c.lost ? c.pos : c.home;
        const r = c.lost ? 0.5 : 1.6;
        c.target.set(base.x + rr(-r, r), 0, base.z + rr(-r, r));
      }
    } else {
      const dx = c.target.x - c.pos.x, dz = c.target.z - c.pos.z, d = Math.hypot(dx, dz);
      const sp = c.running ? 2.2 : 0.35;
      if (d < 0.05) { c.wait = rr(1, 3.5); c.running = false; }
      else {
        const want = Math.atan2(dx, dz);
        let dh = want - c.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        c.heading += dh * Math.min(1, dt * 6);
        const step = Math.min(d, sp * dt);
        c.pos.x += (dx / d) * step; c.pos.z += (dz / d) * step;
      }
      c.peck = 0;
    }
    c.hop = Math.max(0, c.hop - dt * 3);
    _lq.setFromEuler(new THREE.Euler(c.peck * 0.6, c.heading, 0, 'YXZ'));
    _lp.set(c.pos.x, Math.sin(c.hop * Math.PI) * 0.25 + (c.wait <= 0 ? Math.abs(Math.sin(time * 16 + i)) * 0.02 : 0), c.pos.z);
    _lm.compose(_lp, _lq, _ls.set(1, 1, 1));
    cm.setMatrixAt(i, _lm);
  });
  cm.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < 5; i++) {
    const a = time * (0.12 + i * 0.015) + i * 1.3, r = 14 + i * 3;
    _lp.set(Math.cos(a) * r + 6, 15 + i * 1.5 + Math.sin(time * 0.5 + i) * 0.8, Math.sin(a) * r - 26);
    _lq.setFromEuler(new THREE.Euler(0, -a, 0.25));
    const flap = Math.sin(time * 9 + i * 2);
    _lm.compose(_lp, _lq, _ls.set(1.4, flap * 1.4, 1.4));
    world.birds.setMatrixAt(i, _lm);
  }
  world.birds.instanceMatrix.needsUpdate = true;
  // drifting points (fireflies blink, motes float)
  for (const [p, amp, spd] of [[world.fireflies, 0.35, 0.6], [world.motes, 0.12, 0.25]]) {
    const a = p.geometry.attributes.position.array, b = p.geometry.userData.base;
    for (let i = 0; i < a.length; i += 3) {
      a[i] = b[i] + Math.sin(time * spd + i) * amp;
      a[i + 1] = b[i + 1] + Math.sin(time * spd * 1.3 + i * 0.7) * amp * 0.6;
      a[i + 2] = b[i + 2] + Math.cos(time * spd * 0.9 + i * 1.1) * amp;
    }
    p.geometry.attributes.position.needsUpdate = true;
  }
  world.fireflies.material.opacity = world.dusk * (0.6 + 0.4 * Math.sin(time * 3));
  world.motes.material.opacity = (1 - world.dusk) * 0.55;
  world.clouds.rotation.y += dt * 0.004;
}

let skyMode = 'day';
const SKIES = {
  night: { sunVis: 0, top: 0x0b1030, mid: 0x1e2550, hor: 0x3a3a5e, hemiSky: 0x5060a0, hemiGround: 0x201828, hemi: 0.45, sunCol: 0x8090c0, sun: 0.15, dusk: 1, exposure: 1.0 },
  day: { sunVis: 1, top: 0x3f86cf, mid: 0x92c6ea, hor: 0xe9dcc6, hemiSky: 0xcfe4ff, hemiGround: 0x9a6040, hemi: 1.55, sunCol: 0xffe0b0, sun: 2.4, dusk: 0, exposure: 1.0 },
  dusk: { sunVis: 1, top: 0x27305e, mid: 0x7a5a86, hor: 0xf0a060, hemiSky: 0x8a86c8, hemiGround: 0x6a3a2a, hemi: 0.9, sunCol: 0xff9050, sun: 0.75, dusk: 1, exposure: 1.1 },
};
function setSky(name, dur = 2) {
  if (name === skyMode) return;
  skyMode = name;
  const t = SKIES[name];
  const from = {
    top: skyUniforms.top.value.clone(), mid: skyUniforms.mid.value.clone(), hor: skyUniforms.hor.value.clone(),
    hs: hemi.color.clone(), hg: hemi.groundColor.clone(), sc: sunLight.color.clone(),
    h: hemi.intensity, s: sunLight.intensity, d: world.dusk, e: renderer.toneMappingExposure, v: world.sunSprite.material.opacity, n: world.night,
  };
  const nightTo = name === 'night' ? 1 : 0;
  const to = { top: new THREE.Color(t.top), mid: new THREE.Color(t.mid), hor: new THREE.Color(t.hor), hs: new THREE.Color(t.hemiSky), hg: new THREE.Color(t.hemiGround), sc: new THREE.Color(t.sunCol) };
  tween(dur, (k) => {
    skyUniforms.top.value.lerpColors(from.top, to.top, k);
    skyUniforms.mid.value.lerpColors(from.mid, to.mid, k);
    skyUniforms.hor.value.lerpColors(from.hor, to.hor, k);
    scene.background.copy(skyUniforms.hor.value); scene.fog.color.copy(skyUniforms.hor.value);
    hemi.color.lerpColors(from.hs, to.hs, k); hemi.groundColor.lerpColors(from.hg, to.hg, k); sunLight.color.lerpColors(from.sc, to.sc, k);
    hemi.intensity = from.h + (t.hemi - from.h) * k; sunLight.intensity = from.s + (t.sun - from.s) * k;
    world.dusk = from.d + (t.dusk - from.d) * k;
    renderer.toneMappingExposure = from.e + (t.exposure - from.e) * k;
    world.sunSprite.material.color.setHex(0xfff2c8).lerp(new THREE.Color(0xff8a40), world.dusk);
    world.sunSprite.material.opacity = from.v + (t.sunVis - from.v) * k;
    world.sunCore.material.opacity = (1 - world.dusk * 0.6) * world.sunSprite.material.opacity;
    world.night = from.n + (nightTo - from.n) * k;
    world.stars.material.opacity = world.night;
    world.clouds.visible = world.night < 0.95;
  });
}
buildWorld();

// ---------------------------------------------------------------- the workbench and circuit board
const TABLE_Y = 0.78;
const S = 0.1;                    // spacing between board terminals (m)
const NX = 5, NZ = 3;             // terminals across and deep
const BOARD_Z = -0.385;
const bench = new THREE.Group();
scene.add(bench);
{
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.74), MATS.wood);
  top.position.set(0, TABLE_Y - 0.025, -0.5); top.receiveShadow = true;
  bench.add(top);
  for (const [x, z, w, d] of [[0, -0.15, 1.42, 0.03], [0, -0.85, 1.42, 0.03], [-0.71, -0.5, 0.03, 0.66], [0.71, -0.5, 0.03, 0.66]]) bench.add(part(new THREE.BoxGeometry(w, 0.07, d), PAL.woodDark, [x, TABLE_Y - 0.085, z]));
  for (const [x, z] of [[-0.7, -0.17], [0.7, -0.17], [-0.7, -0.83], [0.7, -0.83]]) bench.add(part(new THREE.BoxGeometry(0.055, TABLE_Y - 0.05, 0.055), PAL.woodDark, [x, (TABLE_Y - 0.05) / 2, z]));
  bench.add(part(new THREE.BoxGeometry(1.36, 0.025, 0.025), PAL.woodDark, [0, 0.16, -0.83]));
  // the parts tray: green felt in a wooden frame
  const felt = part(new THREE.BoxGeometry(0.3, 0.008, 0.34), 0x2f5a4a, [-0.47, TABLE_Y + 0.004, -0.36]);
  felt.receiveShadow = true; bench.add(felt);
  for (const [x, z, w, d] of [[-0.47, -0.19, 0.32, 0.016], [-0.47, -0.53, 0.32, 0.016], [-0.62, -0.36, 0.016, 0.34], [-0.32, -0.36, 0.016, 0.34]]) bench.add(part(new THREE.BoxGeometry(w, 0.022, d), PAL.wood, [x, TABLE_Y + 0.011, z]));
  const tl = tagSprite('Parts tray', { scale: 0.03 }); tl.position.set(-0.47, TABLE_Y + 0.03, -0.565); bench.add(tl);
  // the bin (broken parts go here): a small steel bucket
  bench.add(part(new THREE.CylinderGeometry(0.07, 0.058, 0.12, 12), 0x7d878f, [-0.6, TABLE_Y + 0.06, -0.74]));
  bench.add(part(new THREE.TorusGeometry(0.07, 0.006, 4, 12), 0x9aa3ab, [-0.6, TABLE_Y + 0.12, -0.74], [Math.PI / 2, 0, 0]));
  bench.add(part(new THREE.CircleGeometry(0.064, 12), 0x2a3036, [-0.6, TABLE_Y + 0.115, -0.74], [-Math.PI / 2, 0, 0]));
  const bl = tagSprite('Bin', { scale: 0.03 }); bl.position.set(-0.6, TABLE_Y + 0.18, -0.74); bench.add(bl);
  // two woven baskets for sorting (mission 2)
  for (const [x, t] of [[0.32, 'Conductors'], [0.52, 'Insulators']]) {
    bench.add(part(new THREE.CylinderGeometry(0.08, 0.065, 0.07, 12), 0xc89b5a, [x, TABLE_Y + 0.035, -0.72]));
    for (const y of [0.02, 0.045]) bench.add(part(new THREE.TorusGeometry(0.073 + y * 0.2, 0.004, 3, 12), 0xa57c44, [x, TABLE_Y + y, -0.72], [Math.PI / 2, 0, 0]));
    bench.add(part(new THREE.TorusGeometry(0.08, 0.007, 4, 12), 0x8a6232, [x, TABLE_Y + 0.07, -0.72], [Math.PI / 2, 0, 0]));
    bench.add(part(new THREE.CircleGeometry(0.075, 12), 0x5e4224, [x, TABLE_Y + 0.066, -0.72], [-Math.PI / 2, 0, 0]));
    const l = tagSprite(t, { scale: 0.03, bg: x < 0.4 ? 'rgba(30,110,60,0.9)' : 'rgba(150,60,40,0.9)' }); l.position.set(x, TABLE_Y + 0.13, -0.72); bench.add(l);
  }
  bench.add(blob(0, -0.5, 0.95, 0.55, 0.01));
}
mergeStatic(bench);
const BIN_POS = V3(-0.6, TABLE_Y + 0.07, -0.74);
const BASKET_POS = { conductor: V3(0.32, TABLE_Y + 0.07, -0.72), insulator: V3(0.52, TABLE_Y + 0.07, -0.72) };

const board = new THREE.Group();
board.position.set(0, TABLE_Y + 0.012, BOARD_Z);
scene.add(board);
{
  const btex = canvasTex(512, 272, (bx) => {
    bx.fillStyle = '#efe4cb'; bx.fillRect(0, 0, 512, 272);
    speckle(bx, 512, 272, 500, ['rgba(160,130,90,0.12)', 'rgba(255,255,255,0.25)'], [1, 3]);
    bx.strokeStyle = 'rgba(90,70,40,0.16)'; bx.lineWidth = 1.5;
    for (let i = 16; i < 512; i += 16) { bx.beginPath(); bx.moveTo(i, 0); bx.lineTo(i, 272); bx.stroke(); }
    for (let j = 16; j < 272; j += 16) { bx.beginPath(); bx.moveTo(0, j); bx.lineTo(512, j); bx.stroke(); }
    bx.strokeStyle = '#7a5a36'; bx.lineWidth = 6; bx.strokeRect(5, 5, 502, 262);
  });
  const edge = lam(0x6e4a2c);
  const plate = mesh(new THREE.BoxGeometry(0.56, 0.012, 0.3), [edge, edge, lam(0xffffff, { map: btex }), edge, edge, edge], 0, -0.006, 0);
  plate.receiveShadow = true;
  board.add(noHit(plate));
}
const nodePos = (i) => V3(((i % NX) - (NX - 1) / 2) * S, 0, (Math.floor(i / NX) - (NZ - 1) / 2) * S);
const node = (c, r) => r * NX + c;
{
  const tg = new THREE.CylinderGeometry(0.008, 0.0095, 0.008, 12), sg = new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 8), tm = mat(0xd4a23a, { metalness: 0.6, roughness: 0.35 }), sm = mat(0x8a6a2a, { metalness: 0.6, roughness: 0.4 });
  const terms = new THREE.Group();
  for (let i = 0; i < NX * NZ; i++) {
    const t = mesh(tg, tm); t.position.copy(nodePos(i)).setY(0.004); t.castShadow = true; terms.add(noHit(t));
    const sc = mesh(sg, sm); sc.position.copy(nodePos(i)).setY(0.0095); terms.add(noHit(sc));
  }
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

// ---------------------------------------------------------------- Tendai, the learner's guide
// A friendly low-poly child who stands by the board, looks at the learner, and reacts:
// claps for progress, cheers at the end of a mission, shrugs at a mistake, and holds their head
// when there is a short circuit. A speech bubble says a few words at a time.
const tendai = (() => {
  const root = new THREE.Group();
  root.position.set(0.98, 0, -1.26);
  root.rotation.y = Math.atan2(-0.98, 1.26 + 0.1);
  const one = (build) => { const g = new THREE.Group(); build(g); return new THREE.Mesh(bake(g), VC); };
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.07, 0.62, 0);
    pivot.add(one((g) => {
      g.add(part(new THREE.BoxGeometry(0.115, 0.2, 0.13), PAL.shorts, [0, -0.08, 0]));
      g.add(part(new THREE.CylinderGeometry(0.038, 0.034, 0.42, 6), PAL.skin, [0, -0.37, 0]));
      g.add(part(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 6), 0xf4f4f4, [0, -0.54, 0]));    // socks
      g.add(part(new THREE.BoxGeometry(0.085, 0.06, 0.16), 0x1a1a1a, [0, -0.59, 0.025]));          // school shoes
    }));
    root.add(pivot); legs.push(pivot);
  }
  const torso = new THREE.Group(); torso.position.set(0, 0.62, 0);
  torso.add(one((g) => {
    g.add(part(new THREE.CylinderGeometry(0.13, 0.12, 0.38, 7), PAL.shirt, [0, 0.19, 0], [0, 0, 0], [1, 1, 0.72]));
    g.add(part(new THREE.BoxGeometry(0.24, 0.035, 0.15), PAL.shorts, [0, 0.0, 0]));               // waistband
    g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), PAL.skin, [0, 0.41, 0]));
    g.add(part(new THREE.BoxGeometry(0.12, 0.03, 0.03), 0xf4f4f4, [0, 0.37, 0.07], [0.3, 0, 0]));  // collar
    g.add(part(new THREE.BoxGeometry(0.06, 0.06, 0.01), 0xf2c12e, [0.06, 0.27, 0.088]));           // school badge
  }));
  root.add(torso);
  const head = new THREE.Group(); head.position.set(0, 0.44, 0);
  head.add(one((g) => {
    g.add(part(new THREE.IcosahedronGeometry(0.115, 1), PAL.skin, [0, 0.12, 0], [0, 0, 0], [0.95, 1.05, 1]));
    g.add(part(new THREE.SphereGeometry(0.122, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2.1), PAL.hair, [0, 0.135, -0.01], [-0.25, 0, 0]));
    for (const s of [-1, 1]) g.add(part(new THREE.IcosahedronGeometry(0.025, 0), PAL.skin, [s * 0.112, 0.115, 0]));
    g.add(part(new THREE.ConeGeometry(0.018, 0.035, 4), PAL.skinDark, [0, 0.105, 0.112], [Math.PI / 2, 0, 0]));   // nose
    g.add(part(new THREE.TorusGeometry(0.028, 0.006, 3, 8, Math.PI), 0x6a1f1a, [0, 0.07, 0.1], [0, 0, Math.PI]));  // smile
  }));
  const eyes = one((g) => {
    for (const s of [-1, 1]) {
      g.add(part(new THREE.SphereGeometry(0.019, 8, 6), 0xffffff, [s * 0.042, 0.14, 0.098]));
      g.add(part(new THREE.SphereGeometry(0.011, 6, 4), 0x140c08, [s * 0.042, 0.14, 0.113]));
    }
  });
  head.add(eyes);
  torso.add(head);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.155, 0.35, 0);
    sh.add(one((g) => {
      g.add(part(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 6), PAL.shirt, [0, -0.04, 0]));
      g.add(part(new THREE.CylinderGeometry(0.032, 0.03, 0.2, 6), PAL.skin, [0, -0.15, 0]));
    }));
    const el = new THREE.Group(); el.position.set(0, -0.24, 0);
    el.add(one((g) => {
      g.add(part(new THREE.CylinderGeometry(0.03, 0.027, 0.2, 6), PAL.skin, [0, -0.1, 0]));
      g.add(part(new THREE.IcosahedronGeometry(0.038, 0), PAL.skin, [0, -0.22, 0.005]));
    }));
    sh.add(el);
    torso.add(sh);
    arms.push({ s, sh, el });
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  scene.add(noHit(root));
  const shadow = blob(0, 0, 0.28, 0.24, 0.008); root.add(shadow);

  // speech bubble
  const bubble = canvasPlane(0.62, 0.2, 900);
  bubble.mesh.position.set(1.08, 1.53, -1.02);
  bubble.mesh.visible = false;
  bubble.mesh.renderOrder = 5;
  scene.add(noHit(bubble.mesh));
  let sayUntil = 0, pose = 'idle', poseUntil = 0, blinkAt = 2;
  const cur = { arms: [[0, 0, 0], [0, 0, 0]], hop: 0 };
  function say(text, secs = 3.5) {
    const { ctx, c } = bubble;
    ctx.clearRect(0, 0, c.width, c.height);
    let px = 64, lines;
    for (;;) { ctx.font = `bold ${px}px system-ui, sans-serif`; lines = wrapLines(ctx, text, c.width - 70); if (lines.length * px * 1.15 <= c.height - 50 || px < 30) break; px -= 4; }
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#13293d'; ctx.lineWidth = 6;
    roundRect(ctx, 6, 6, c.width - 12, c.height - 40, 40); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.width * 0.42, c.height - 37); ctx.lineTo(c.width * 0.5, c.height - 4); ctx.lineTo(c.width * 0.55, c.height - 37); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c.width * 0.42, c.height - 35); ctx.lineTo(c.width * 0.5, c.height - 4); ctx.lineTo(c.width * 0.55, c.height - 35); ctx.stroke();
    ctx.fillStyle = '#13293d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lh = px * 1.15, y0 = (c.height - 34) / 2 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, c.width / 2, y0 + i * lh));
    bubble.update();
    bubble.mesh.visible = true;
    bubble.mesh.scale.setScalar(0.3);
    tween(0.18, (k) => bubble.mesh.scale.setScalar(0.3 + 0.7 * k));
    sayUntil = time + secs;
  }
  function act(name, secs = 2) { pose = name; poseUntil = time + secs; }
  const _cam = new THREE.Vector3(), _hp = new THREE.Vector3();
  // target arm angles per pose: [shoulder x (forward), shoulder z (outward), elbow x (bend)]
  function armTarget(s, t) {
    switch (pose) {
      case 'cheer': return [-0.2, s * (2.7 + Math.sin(t * 14) * 0.15), -0.2];
      case 'clap': return [-1.25, s * (-0.05 + Math.abs(Math.sin(t * 9)) * 0.35), -0.5];
      case 'wave': return s < 0 ? [-0.2, -2.5 + Math.sin(t * 10) * 0.35, -0.4] : [0, 0.12, -0.1];
      case 'shrug': return [-0.5, s * 0.55, -1.2];
      case 'worried': return [-0.55, s * 2.35, -2.1];
      case 'point': return s < 0 ? [-1.45, -0.35, 0] : [0, 0.12, -0.1];
      default: return [Math.sin(t * 1.3 + s) * 0.05, s * 0.13, -0.15];
    }
  }
  function update(dt) {
    if (time > poseUntil && pose !== 'worried') pose = 'idle';
    if (pose === 'worried' && time > poseUntil) pose = 'idle';
    const t = time;
    const k = Math.min(1, dt * 10);
    arms.forEach((a, i) => {
      const [x, z, e] = armTarget(a.s, t);
      const c = cur.arms[i];
      c[0] += (x - c[0]) * k; c[1] += (z - c[1]) * k; c[2] += (e - c[2]) * k;
      a.sh.rotation.set(c[0], 0, c[1]); a.el.rotation.set(c[2], 0, 0);
    });
    const hopT = pose === 'cheer' ? Math.abs(Math.sin(t * 7)) * 0.08 : 0;
    cur.hop += (hopT - cur.hop) * Math.min(1, dt * 12);
    root.position.y = cur.hop;
    legs.forEach((l, i) => (l.rotation.x = pose === 'cheer' ? (i ? 1 : -1) * cur.hop * 2 : 0));
    torso.scale.y = 1 + Math.sin(t * 2.2) * 0.012;
    torso.position.y = 0.62 + (pose === 'shrug' ? 0.02 : 0);
    // look at the learner
    camera.getWorldPosition(_cam);
    root.worldToLocal(_cam);
    head.getWorldPosition(_hp); root.worldToLocal(_hp);
    const yaw = THREE.MathUtils.clamp(Math.atan2(_cam.x - _hp.x, _cam.z - _hp.z), -0.8, 0.8);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(_cam.y - _hp.y - 0.12, Math.hypot(_cam.x - _hp.x, _cam.z - _hp.z)), -0.5, 0.4);
    head.rotation.set(pitch + (pose === 'worried' ? 0.15 : 0), yaw, pose === 'shrug' ? 0.25 : Math.sin(t * 0.9) * 0.04, 'YXZ');
    // blink
    if (t > blinkAt) { eyes.scale.y = 0.1; if (t > blinkAt + 0.12) { eyes.scale.y = 1; blinkAt = t + 2 + rnd() * 3; } }
    // the bubble faces the learner
    if (bubble.mesh.visible) {
      camera.getWorldPosition(_cam);
      bubble.mesh.lookAt(_cam);
      if (time > sayUntil) bubble.mesh.visible = false;
    }
  }
  return { root, say, act, update, get pose() { return pose; }, bubble: bubble.mesh };
})();

// ---------------------------------------------------------------- particles (sparks, confetti, sparkles, splashes)
const FX_MAX = 320;
const fxMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), FX_MAX);
fxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
fxMesh.setColorAt(0, new THREE.Color(1, 1, 1));
fxMesh.frustumCulled = false;
fxMesh.count = 0;
scene.add(noHit(fxMesh));
const fx = [];
const _fm = new THREE.Matrix4(), _fq = new THREE.Quaternion(), _fe = new THREE.Euler(), _fs = new THREE.Vector3(), _fc = new THREE.Color();
function burst(pos, { n = 12, colours = [0xffd54a], speed = 0.6, up = 0.4, life = 0.8, size = 0.006, gravity = 2, spread = 1, flat = false } = {}) {
  for (let i = 0; i < n && fx.length < FX_MAX; i++) {
    const a = rnd() * Math.PI * 2, e = rnd() * spread;
    fx.push({
      p: pos.clone(),
      v: V3(Math.cos(a) * e * speed, up * speed * (0.6 + rnd()), Math.sin(a) * e * speed),
      life: life * (0.6 + rnd() * 0.6), age: 0, size: size * (0.6 + rnd() * 0.8), gravity,
      colour: colours[i % colours.length], spin: V3(rnd() * 10, rnd() * 10, rnd() * 10), flat,
    });
  }
}
const CONFETTI = [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6, 0xff8a3c];
function confetti(at = V3(0, 2.1, -1.0), n = 90) { burst(at, { n, colours: CONFETTI, speed: 1.6, up: 1.3, life: 2.6, size: 0.012, gravity: 1.6, flat: true }); }
function updateFx(dt) {
  let k = 0;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.age += dt;
    if (f.age >= f.life) { fx.splice(i, 1); continue; }
    f.v.y -= f.gravity * dt;
    if (f.flat) { f.v.multiplyScalar(1 - dt * 1.5); f.v.x += Math.sin(time * 5 + i) * dt * 0.3; }
    f.p.addScaledVector(f.v, dt);
    const s = f.size * (f.flat ? 1 : 1 - f.age / f.life);
    _fe.set(f.spin.x * f.age, f.spin.y * f.age, f.spin.z * f.age);
    _fq.setFromEuler(_fe);
    _fs.set(s, f.flat ? s * 0.15 : s, s);
    _fm.compose(f.p, _fq, _fs);
    fxMesh.setMatrixAt(k, _fm);
    fxMesh.setColorAt(k, _fc.set(f.colour));
    k++;
  }
  fxMesh.count = k;
  fxMesh.instanceMatrix.needsUpdate = true;
  if (fxMesh.instanceColor) fxMesh.instanceColor.needsUpdate = true;
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
  g.userData.keep = true;
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
// debounces use wall-clock time, so they behave the same however fast the frames come
const wallNow = () => performance.now() / 1000;
let lastButtonAt = -9;
function pressButton(g) {
  const b = g.userData.button;
  if (!b.enabled || !isShown(g)) return;
  if (wallNow() - lastButtonAt < 0.25) return;   // one press, even if poke and pinch land together
  lastButtonAt = wallNow();
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
  l.scale.y = Math.abs(x1 - x0); l.rotation.z = Math.PI / 2; l.userData.lead = true;
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
    closed: !!o.closed, flat: !!o.flat, blown: !!o.blown, kind: o.kind || null, room: o.room || 0, rev: !!o.rev,
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
    const inner = new THREE.Group(); g.add(inner);
    const body = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.058, 18), mat(c.flat ? 0x77736c : 0x1f7a3a, { roughness: 0.45 }), 0, 0.016, 0);
    body.rotation.z = Math.PI / 2;
    const band = mesh(new THREE.CylinderGeometry(0.0142, 0.0142, 0.012, 18), mat(c.flat ? 0x8a857c : 0xd4a23a, { metalness: 0.5, roughness: 0.4 }), 0.023, 0.016, 0);
    band.rotation.z = Math.PI / 2;
    const nub = mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.006, 10), M.steel, 0.032, 0.016, 0);
    nub.rotation.z = Math.PI / 2;
    inner.add(body, band, nub);
    // the label always reads from the learner's side and shows which end is + (it changes when the cell is turned round)
    const lbls = [c.flat ? '0 V  FLAT' : '−  1.5 V  +', c.flat ? '0 V  FLAT' : '+  1.5 V  −'].map((t) => {
      const l = labelPlane(t, 0.05, 0.012, c.flat ? '#5a5650' : '#155c2b'); l.position.set(0, 0.0305, 0); g.add(l); return l;
    });
    lead(inner, -L / 2, -0.029); lead(inner, 0.035, L / 2);
    c.parts.body = body; c.parts.inner = inner; c.parts.labels = lbls;
    inner.rotation.y = c.rev ? Math.PI : 0;
    lbls[0].visible = !c.rev; lbls[1].visible = c.rev;
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
    const pool = noHit(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2).rotateX(-Math.PI / 2), additive(0xffc060, 0)));
    pool.position.set(0, 0.0015, 0);
    g.add(pool);
    c.parts.glass = glassM; c.parts.glow = glow; c.parts.pool = pool;
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
    const isFan = c.kind === 'fan', bladeL = isFan ? 0.045 : 0.03;
    const fan = new THREE.Group(); fan.position.set(0, 0.048, 0);
    for (let i = 0; i < 3; i++) { const bl = mesh(new THREE.BoxGeometry(bladeL, 0.0015, isFan ? 0.016 : 0.008), mat(isFan ? 0xe8573a : 0xf2c12e), bladeL / 2, 0, 0); const h = new THREE.Group(); h.rotation.y = (i * Math.PI * 2) / 3; bl.rotation.x = 0.4; h.add(bl); fan.add(h); }
    fan.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8), mat(0x333333), 0, 0.002, 0));
    g.add(fan);
    const lbl = labelPlane(isFan ? 'FAN' : 'PUMP', 0.03, 0.01, isFan ? '#8e2a17' : '#1d4f9e');
    lbl.position.set(0, 0.0075, 0.0105); lbl.rotation.x = 0; g.add(lbl);
    lead(g, -L / 2, -0.02); lead(g, 0.02, L / 2);
    c.parts.fan = fan;
  } else if (type === 'buzzer') {
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.007, 0.03), mat(0x444a50), 0, 0.0035, 0));
    const body = new THREE.Group();
    body.add(mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.02, 18), mat(0x1c1c1c, { roughness: 0.4 }), 0, 0.017, 0));
    body.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.0015, 8), mat(0x555555), 0, 0.0275, 0));
    g.add(body);
    const lbl = labelPlane('BUZZER', 0.034, 0.01, '#3b3b3b', '#ffd84d');
    lbl.position.set(0, 0.0075, 0.0105); lbl.rotation.x = 0; g.add(lbl);
    lead(g, -L / 2, -0.02); lead(g, 0.02, L / 2);
    c.parts.body = body;
  } else if (type === 'torch') {
    // the learner's own torch: it points along local +Z
    g.add(mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.11, 14).rotateX(Math.PI / 2), mat(0xc0392b, { roughness: 0.45 }), 0, 0.02, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.026, 0.018, 0.035, 14).rotateX(Math.PI / 2), mat(0xb8bec4, { metalness: 0.6, roughness: 0.3 }), 0, 0.02, 0.07));
    const lens = mesh(new THREE.CircleGeometry(0.023, 14), new THREE.MeshBasicMaterial({ color: 0xfff3c0, toneMapped: false }), 0, 0.02, 0.0876);
    g.add(lens);
    g.add(mesh(new THREE.BoxGeometry(0.008, 0.006, 0.016), mat(0x222222), 0, 0.039, -0.01));
    // the beam: a soft cone and a pool of light where it lands
    const beamTex = canvasTex(8, 128, (bx) => { const gr = bx.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,240,190,0.55)'); gr.addColorStop(1, 'rgba(255,240,190,0)'); bx.fillStyle = gr; bx.fillRect(0, 0, 8, 128); });
    const beam = noHit(new THREE.Mesh(new THREE.ConeGeometry(0.55, 4, 20, 1, true).translate(0, -2, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
    beam.position.set(0, 0.02, 0.088);
    beam.visible = false;
    g.add(beam);
    c.parts.beam = beam; c.parts.lens = lens;
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
  g.traverse((o) => { if (o.isMesh && o.material.visible !== false && !o.material.transparent && !o.userData.lead) o.castShadow = true; });
  // a generous invisible box makes parts easy to point at and pinch
  g.add(mesh(new THREE.BoxGeometry(type === 'wire' ? 0.08 : 0.07, 0.04, 0.034), hitBoxMat, 0, 0.018, 0));
  c.name = compName(c);
  // close up: pinch to pick up. A placed switch flips on a quick pinch and comes away if you pull it.
  c.near = input.addNearTarget(g, {
    enabled: () => canTouch(c),
    onPinch: (p) => {
      if (quickToggles(c)) { c.pinchStart = { pos: p.pinchPoint.clone(), quiet: wallNow() - c.lastToggle < 0.6 }; return; }
      pick(c, p);
    },
    onDrag: (p) => { if (c.pinchStart && p.pinchPoint.distanceTo(c.pinchStart.pos) > 0.035) { c.pinchStart = null; pick(c, p); } },
    onRelease: () => { if (c.pinchStart) { const q = c.pinchStart.quiet; c.pinchStart = null; if (!q) { if (c.type === 'cell') flipCell(c); else toggleSwitch(c, 'pinch'); } } },
  });
  comps.push(c);
  interactables.push(g);
  return c;
}
function compName(c) {
  switch (c.type) {
    case 'wire': return 'Wire';
    case 'cell': return c.flat ? 'Cell: 0 V (flat, used up)' : 'Cell: 1.5 V' + (c.slot && isWorkshop() ? `, + end ${cellPlusSide(c)}` : '');
    case 'bulb': return c.blown ? 'Bulb (look at the filament)' : (c.room ? `Bulb for room ${c.room}` : 'Bulb');
    case 'switch': return c.closed ? 'Switch: ON' : 'Switch: OFF';
    case 'motor': return c.kind === 'fan' ? 'Fan (a motor)' : 'Pump motor';
    case 'buzzer': return 'Buzzer';
    case 'torch': return 'Your torch: pick it up and shine it';
    case 'panel': return 'Solar panel (its wires come from the panel)';
    case 'object': return OBJECTS[c.kind].name;
  }
  return c.type;
}
// A placed switch flips on a quick pinch; in the workshop a placed cell turns round the same way.
function quickToggles(c) { return !!c.slot && !c.locked && (c.type === 'switch' || (c.type === 'cell' && !c.flat && (isWorkshop() || !!MISSIONS[state.mission]?.flipCells))); }
function cellPlusSide(c) {
  const toB = !c.rev;
  return c.slot.dir === 'h' ? (toB ? 'on the right' : 'on the left') : (toB ? 'nearer you' : 'away from you');
}
function flipCell(c) {
  if (c.type !== 'cell' || !c.slot || c.locked) return;
  if (wallNow() - c.lastToggle < 0.35) return;
  c.lastToggle = wallNow();
  c.rev = !c.rev;
  ac(); sfx.flip();
  const r0 = c.parts.inner.rotation.y, r1 = c.rev ? Math.PI : 0, id = ++c.anim;
  tween(0.25, (k) => { if (c.anim === id) { c.parts.inner.rotation.y = r0 + (r1 - r0) * k; c.parts.inner.position.y = Math.sin(k * Math.PI) * 0.02; } });
  c.parts.labels[0].visible = !c.rev; c.parts.labels[1].visible = c.rev;
  c.name = compName(c);
  hapticFor(c);
  onBoardChanged();
  levelHook('onFlip', c);
}
function hapticFor(c, strength = 0.5) { for (const p of input.pointers) if (p.tracked && (p.held === c.group || (p.near && p.focus && compOf(p.focus) === c))) input.haptic(p, strength, 30); }
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
  const spot = spotIndex.isVector3 ? spotIndex.clone() : TRAY_SPOTS[spotIndex].clone().setY(TABLE_Y + 0.002);
  const sp = { type, stock, opts, spot, display: null, tag: null, wireCount: 0 };
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
  sp.tag.visible = sp.type !== 'object' && sp.type !== 'torch';
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
  if (p) input.haptic(p, 0.35, 25);
  const sp = c.spawner;
  if (sp && sp.display === c) { sp.display = null; sp.stock -= 1; refillSpawner(sp); }
  if (c.slot) { c.slot.comp = null; c.slot = null; onBoardChanged(); }
  c.anim++;
  c.group.scale.setScalar(1);
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
  if (c.type === 'torch') return false;
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
  const hb = c.heldBy;
  if (hb && hb !== 'desk') input.haptic(hb, 0.6, 35);
  releaseHold(c);
  c.slot = slot; slot.comp = c;
  slot.group.attach(c.group);
  c.anim++;
  const id = c.anim;
  if (instant) { c.group.position.set(0, 0, 0); c.group.quaternion.identity(); c.group.scale.setScalar(1); }
  else {
    const p0 = c.group.position.clone(), q0 = c.group.quaternion.clone();
    tween(0.14, (k) => { if (c.anim !== id) return; c.group.position.lerpVectors(p0, V3(0, 0, 0), k); c.group.quaternion.slerpQuaternions(q0, new THREE.Quaternion(), k); })
      .then(() => {
        if (c.anim !== id) return;
        burst(slot.group.getWorldPosition(new THREE.Vector3()).add(V3(0, 0.005, 0)), { n: 8, colours: [0xfff4d0, 0xe8d8b0], speed: 0.25, up: 0.25, life: 0.35, size: 0.003, gravity: 1 });
        return tween(0.16, (k) => { if (c.anim !== id) return; const q = Math.sin(k * Math.PI) * 0.18; c.group.scale.set(1 + q, 1 - q, 1 + q); });
      })
      .then(() => { if (c.anim === id) c.group.scale.setScalar(1); });
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
  if (wallNow() - c.lastToggle < 0.35) return;
  c.lastToggle = wallNow();
  c.closed = !c.closed;
  ac(); sfx.flip(); hapticFor(c);
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
const CELL_EMF = 1.5, CELL_R = 0.3, BULB_R = 6, WIRE_R = 0.02, MOTOR_R = 4, PANEL_EMF = 2.2, PANEL_R = 3, BUZZ_R = 8;
const BULB_REF = (CELL_EMF / (BULB_R + CELL_R)) ** 2 * BULB_R;   // one bulb on one fresh cell = brightness 1
const MOTOR_REF = PANEL_EMF / (MOTOR_R + PANEL_R);                // pump on the panel in full sun = speed 1
const SHORT_AMPS = 2;
function electrical(c, ov) {
  if (ov && ov.remove && ov.remove.includes(c)) return null;
  switch (c.type) {
    case 'wire': return { g: 1 / WIRE_R };
    case 'cell': return c.flat ? { g: 1 / 40, emf: 0 } : { g: 1 / CELL_R, emf: c.rev ? -CELL_EMF : CELL_EMF };
    case 'buzzer': return { g: 1 / BUZZ_R };
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
const isOn = (res, c) => (c.type === 'motor' ? motorSpeed(res, c) > 0.25 : c.type === 'buzzer' ? Math.abs(res.get(c) || 0) > 0.06 : brightness(res, c) > 0.1);
// Does this switch really control that bulb (or pump)? Try it both ways.
function switchControls(sw, target) {
  if (!sw || !target || !sw.slot || !target.slot) return false;
  return isOn(sim({ sw, closed: true }), target) && !isOn(sim({ sw, closed: false }), target);
}
let live = new Map();
const circuit = { short: false, shortSince: 0 };
function onBoardChanged() { boardDirty = true; state.boardVer++; }

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
answer.group.position.set(0.5, TABLE_Y + 0.15, -0.36);
answer.group.rotation.set(-0.85, -0.6, 0, 'YXZ');
answer.group.add(mesh(new THREE.BoxGeometry(0.33, 0.37, 0.012), mat(0x23384d), 0, -0.02, -0.012));
answer.title.mesh.position.set(0, 0.125, 0.001);
answer.group.add(answer.title.mesh);
const answerStand = noHit(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), mat(0x23384d), 0.5, TABLE_Y + 0.05, -0.39));
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
controls.position.set(0, TABLE_Y + 0.03, -0.15);
controls.rotation.x = -Math.PI / 2 + 0.75;
scene.add(controls);
controls.add(part(new THREE.BoxGeometry(0.87, 0.072, 0.014), PAL.woodDark, [-0.01, 0, -0.014]));
controls.add(part(new THREE.BoxGeometry(0.87, 0.012, 0.03), PAL.wood, [-0.01, -0.04, -0.006]));
const missionButtons = [];
const MISSION_COLOURS = ['#c0392b', '#2471a3', '#7d3c98', '#b9770e', '#1e8449', '#a04070', '#16766f'];
const MISSION_NAMES = ['Make a torch', 'Conductor or insulator?', 'Fix the faults', 'Light up the hut', 'Solar water pump', 'Lights for the neighbours', 'Workshop: free build'];
for (let i = 0; i < 7; i++) {
  const b = makeButton(i < 6 ? String(i + 1) : 'W', 0.046, 0.05, () => startMission(i), { bg: MISSION_COLOURS[i], font: 'bold 21px system-ui, sans-serif', name: i < 6 ? `Chapter ${i + 1}: ${MISSION_NAMES[i]}` : MISSION_NAMES[i] });
  b.position.set(-0.41 + i * 0.051, 0, 0);
  controls.add(b);
  missionButtons.push(b);
}
const speakBtn = makeButton('Read aloud', 0.1, 0.05, () => readAloud(), { bg: '#4a5a8a', font: 'bold 13px system-ui, sans-serif', name: 'Read the board aloud' });
speakBtn.position.set(0.0, 0, 0); controls.add(speakBtn);
if (!('speechSynthesis' in window)) { speakBtn.visible = false; speakBtn.userData.button.enabled = false; }
const restartBtn = makeButton('↺ Restart', 0.1, 0.05, () => restartStep(), { bg: '#5b6b78', font: 'bold 13px system-ui, sans-serif', name: 'Restart' });
restartBtn.position.set(0.108, 0, 0); controls.add(restartBtn);
const clearBtn = makeButton('Clear board', 0.1, 0.05, () => clearBoard(), { bg: '#5b6b78', font: 'bold 13px system-ui, sans-serif', name: 'Clear the board (parts go back)' });
clearBtn.position.set(0.216, 0, 0); controls.add(clearBtn);
const nextBtn = makeButton('Next ▶', 0.12, 0.05, () => nextMission(), { bg: '#7f8c8d', font: 'bold 15px system-ui, sans-serif', name: 'Next mission' });
nextBtn.position.set(0.334, 0, 0); controls.add(nextBtn);
mergeStatic(controls);
function drawControlsHelp() { boardDirty = true; }
// Read the board aloud (for younger readers and for learners who read English as a second language).
function boardSpeech() {
  const m = MISSIONS[state.mission];
  if (state.phase === 'question') return m.question.q + ' ' + state.qOrder.map((k, i) => `Answer ${i + 1}: ${m.question.options[k]}`).join('. ');
  if (state.phase === 'complete' && state.hunt) return 'Night has fallen. Pick up your torch and shine it around the yard to find Tendai\'s lost chickens.';
  if (state.phase === 'complete') return 'Chapter complete! Well done.';
  if (m.workshop) { const next = CHALLENGES.find((c, i) => !saved.ws[i]); return m.story + (next ? ' Next challenge: ' + next.text : ''); }
  const st = m.steps[state.step];
  return (state.step === 0 ? m.story + ' ' : '') + st.text + (state.stepT > 25 ? ' Hint: ' + st.hint : '');
}
function readAloud() {
  try {
    const sy = window.speechSynthesis;
    sy.cancel();
    const u = new SpeechSynthesisUtterance(boardSpeech().replace(/[▶✓★☆↺]/g, ''));
    const voices = sy.getVoices();
    u.voice = voices.find((v) => /en[-_](ZA|ZW|GB)/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
    u.rate = 0.92;
    sy.speak(u);
  } catch { /* speech not available */ }
}

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
  if (c.locked) { sfx.bad(); toast('That part is fixed to the board for this level.', 'warn'); return; }
  // pointing at a placed switch flips it (in VR, anywhere on it; with a mouse, on the lever).
  // To take a placed switch off the board: pinch it and pull, or click its base.
  if (c.type === 'switch' && c.slot && (hit.lever || p)) { toggleSwitch(c, p ? 'ray' : 'click'); return; }
  if (c.type === 'cell' && p && quickToggles(c)) { flipCell(c); return; }
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
  else if (c.type === 'cell' && quickToggles(c)) t += renderer.xr.isPresenting ? ' (quick pinch: turn round)' : ' (right-click: turn round)';
  return t;
}

// ---------------------------------------------------------------- game state and missions
// Save: stars and done for the six chapters and the workshop, workshop challenges, and the neighbours' lit houses.
const SAVE_KEY = 'light-up-village-v2';
let saved = { stars: [0, 0, 0, 0, 0, 0, 0], done: [false, false, false, false, false, false, false], ws: [false, false, false, false, false], houses: [false, false, false, false] };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s && Array.isArray(s.stars)) Object.assign(saved, s);
  else {   // first visit since the story update: keep the five missions' stars from before
    const old = JSON.parse(localStorage.getItem('light-up-village-v1') || 'null');
    if (old && Array.isArray(old.stars)) for (let i = 0; i < 5; i++) { saved.stars[i] = old.stars[i] || 0; saved.done[i] = !!old.done?.[i]; }
  }
} catch { /* storage blocked */ }
while (saved.stars.length < 7) saved.stars.push(0);
while (saved.done.length < 7) saved.done.push(false);
if (!Array.isArray(saved.ws)) saved.ws = [false, false, false, false, false];
if (!Array.isArray(saved.houses)) saved.houses = [false, false, false, false];
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch { /* storage blocked */ } }

const state = {
  mission: 0, step: 0, stepT: 0, phase: 'build', pending: 0, toast: null, firstTry: true,
  sorted: 0, sortedRight: 0, sawOff: false, fault: null, cloud: null, decor: [], wrongAnswers: new Set(),
  fanDirs: new Set(), hunt: null, boardVer: 0, wsVer: -1,
};
const WORKSHOP = 6, NEIGHBOURS = 5;
const isWorkshop = () => state.mission === WORKSHOP;
const PRAISE = ['Yes! Well done!', 'It works!', 'Great thinking!', 'You did it!', 'Super!', 'Brilliant!'];
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
// A gap between two crocodile clips that only takes test objects (mission 2).
function makeGap(c1, r1, c2, r2, off) {
  const g = slotAt(c1, r1, c2, r2);
  g.gap = true;
  const vertical = g.dir === 'v';
  [[c1, r1], [c2, r2]].forEach(([c, r], k) => {
    const clip = new THREE.Group();
    clip.add(mesh(new THREE.BoxGeometry(0.014, 0.012, 0.022), mat(k === 0 ? 0xd63a2f : 0x2a2a2a), 0, 0.006, 0));
    clip.add(mesh(new THREE.BoxGeometry(0.01, 0.004, 0.012), M.steel, 0, 0.013, 0));
    clip.position.copy(nodePos(node(c, r))).add(vertical ? V3(off, 0, 0) : V3(0, 0, off));
    if (!vertical) clip.rotation.y = Math.PI / 2;
    board.add(addDecor(noHit(clip)));
  });
  g.ghost.material.color.set(0xffc107); g.ghost.material.opacity = 0.8;
  addDecor({ removeFromParent() { g.ghost.material.color.set(0x6b4a2c); g.ghost.material.opacity = 0.35; } });
  return g;
}

const MISSIONS = [
  {
    title: 'Make a torch', short: 'Torch', intro: "Mhoro! I'm Tendai. Our village has no power lines, so we build our own circuits. First, a torch for the dark path!", outro: 'My torch works! Thank you!',
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
    title: 'Conductor or insulator?', short: 'Materials', intro: "Which things let electricity through? Let's test them!", outro: 'Now we know which things carry electricity!',
    story: 'This tester has a gap between two clips. Which things let electricity pass through them?',
    setup() {
      buildTorch({ locked: true, gapLeft: true });
      makeGap(1, 1, 1, 2, -0.014);
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
        level: 'Sort the objects',
        arrow: () => {
          const g = slotAt(1, 1, 1, 2);
          if (g.comp) return answer.buttons[0];
          const sp = spawners.find((s) => s.display && !s.display.sorted);
          return sp ? sp.display.group : null;
        },
      },
      {
        rebuild: true, level: 'Mend the torch',
        text: 'Tendai dropped the torch and a wire is lost! Mend it with one of the things on the tray. Which one will work?',
        hint: 'Only a conductor lets the current through. Which of these things is made of metal?',
        tray() { ['ruler', 'nail', 'band', 'stick'].forEach((k, i) => addSpawner('object', 1, { kind: k }, [0, 4, 1, 5][i])); },
        enter: () => { buildTorch({ locked: true, skip: 'w3' }); makeGap(3, 1, 3, 0, 0.016); },
        check: () => placedOf('bulb').some((b) => isOn(live, b)),
        done: 'The torch works again! The iron nail is a conductor, so it closed the loop.',
        arrow: () => { const sp = spawners.find((x) => x.display && x.opts.kind === 'nail'); return state.stepT > 25 && sp ? sp.display.group : null; },
      },
    ],
    onPlace(c) {
      if (c.type !== 'object') return;
      if (state.step === 0) { askSort(c); return; }
      if (!OBJECTS[c.kind].conductor) { sfx.bad(); tendai.act('shrug', 1.6); tendai.say('Still dark. Try something else!', 2.5); toast(`The ${OBJECTS[c.kind].name.toLowerCase()} is an insulator, so the torch stays dark. Try another object.`, 'warn', 5); }
    },
    onPick(c) { if (c.type === 'object' && state.phase === 'build') hideAnswers(); },
    question: {
      q: 'Why are electric wires covered in plastic?',
      options: ['Plastic is an insulator, so it keeps the electricity in the wire and keeps us safe.', 'Plastic helps electricity flow faster.', 'Plastic turns the wire into a conductor.'],
      explain: 'Think about what an insulator does.',
    },
  },
  {
    title: 'Fix the faults', short: 'Faults', intro: "Five torches are broken at the repair shop. Can you find what is wrong?", outro: 'Every torch works again. You are a good fixer!',
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
    arrowAfterHint: true, perStep: true,
    question: {
      q: 'What is a short circuit?',
      options: ['The current takes an easy path back to the cell and skips the bulb.', 'The wires are too short to reach.', 'The bulb is too bright.'],
      explain: 'Remember torch 5: where did the current go?',
    },
  },
  {
    title: 'Light up the hut', short: 'Series and parallel', sky: 'dusk', intro: "It's getting dark. Help me light up our hut!", outro: 'Our hut glows at night!',
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
      {
        level: 'A switch for each room',
        text: 'Tendai\'s little brother sleeps in room 2. Give EACH room its own switch, so one light can be off while the other is on. Then turn both lights on.',
        hint: 'Keep your parallel circuit. Swap the wire next to each bulb for a switch, so each bulb\'s own path has a switch in it.',
        enter: () => { addSpawner('switch', 2, {}, 4); },
        check: () => ownSwitches(placedOf('bulb')),
        status: () => `Switches placed: ${placedOf('switch').length} of 2`,
        done: 'Each room has its own switch, just like a real house!',
        arrow: () => (placedOf('switch').length < 2 ? traySpot('switch') : null),
      },
    ],
    question: {
      q: 'Why are the lights in a house wired in parallel?',
      options: ['Each light has its own path, so one can be off while the others stay on.', 'It needs fewer wires.', 'It makes all the lights dimmer.'],
      explain: 'Remember what happened when you took one bulb out of the series circuit.',
    },
  },
  {
    title: 'Solar water pump', short: 'Solar energy', intro: "The garden is thirsty. Let's pump water with sunshine!", outro: 'Water from the sun! Now the neighbours want light too.',
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
  {
    title: 'Lights for the neighbours', short: 'Neighbours', perStep: true, flipCells: true, sky: 'dusk',
    intro: 'Everyone wants light for the big village party tonight. Will you help our neighbours?',
    story: 'Four neighbours need light before the party. Each job has its own parts, so plan before you build.',
    outro: 'Every house has light. Let\'s celebrate!',
    tray() {},
    steps: [
      {
        house: 0, level: "Gogo's kitchen",
        text: "Gogo's kitchen light has TWO cells, but it stays dark! Make the bulb extra bright.",
        hint: 'One cell is the wrong way round, so the two cells push against each other. Pinch it quickly (or right-click it) to turn it round.',
        tray: () => { addSpawner('cell', 1); addSpawner('wire', Infinity); },
        enter: () => {
          const add = (type, o, a) => { const c = makeComp(type, o); scene.add(c.group); place(c, a, true); };
          add('cell', {}, slotAt(1, 0, 2, 0)); add('cell', { rev: true }, slotAt(2, 0, 3, 0)); add('bulb', {}, slotAt(3, 0, 3, 1));
          add('wire', { colour: 1 }, slotAt(2, 1, 3, 1)); add('wire', { colour: 1 }, slotAt(1, 1, 2, 1)); add('wire', { colour: 0 }, slotAt(1, 0, 1, 1));
        },
        check: () => placedOf('bulb').some((b) => brightness(live, b) > 1.8),
        done: "Gogo's kitchen is bright! Cells in a row add their pushes, but only when + meets −.",
      },
      {
        house: 1, level: "Mai Rudo's shop",
        text: "Mai Rudo's shop needs THREE bright bulbs. You have only ONE cell and 8 wires.",
        hint: 'In series the bulbs share the push and are dim. Give each bulb its own path to the cell (parallel).',
        tray: () => { addSpawner('cell', 1); addSpawner('bulb', 3); addSpawner('wire', 8); },
        check: () => { const b = placedOf('bulb'); return b.length >= 3 && b.filter((x) => brightness(live, x) > 0.55).length >= 3; },
        status: () => { const b = placedOf('bulb'); return b.length ? 'Bulbs: ' + b.map((x) => (brightness(live, x) > 0.55 ? 'BRIGHT' : brightness(live, x) > 0.1 ? 'dim' : 'off')).join(', ') : ''; },
        done: 'The shop is bright! Parallel paths keep every bulb bright.',
      },
      {
        house: 2, level: 'The school bell',
        text: 'At the school, the classroom light must stay ON all the time, but the bell (buzzer) must ring ONLY when the switch is ON.',
        hint: 'Give the bulb and the buzzer separate paths to the cell. Put the switch only in the buzzer\'s path.',
        tray: () => { addSpawner('cell', 1, {}, 0); addSpawner('switch', 1, {}, 1); addSpawner('wire', Infinity, {}, 2); addSpawner('bulb', 1, {}, 4); addSpawner('buzzer', 1, {}, 6); },
        check: () => {
          const bz = placedOf('buzzer')[0], b = placedOf('bulb')[0], sw = placedOf('switch')[0];
          return !!bz && !!b && !!sw && sw.closed && isOn(live, b) && isOn(live, bz) && switchControls(sw, bz) && !switchControls(sw, b);
        },
        done: 'Ring ring! The bell has its own switch, and the classroom light stays on.',
      },
      {
        house: 3, level: 'The clinic',
        text: 'The night nurse at the clinic needs a light and a fan, EACH with its own switch. Build it and turn both on.',
        hint: 'Two paths from the cell: one with the bulb and a switch, the other with the fan and a switch.',
        tray: () => { addSpawner('cell', 1, {}, 0); addSpawner('switch', 2, {}, 1); addSpawner('wire', Infinity, {}, 2); addSpawner('bulb', 1, {}, 4); addSpawner('motor', 1, { kind: 'fan' }, 6); },
        check: () => ownSwitches([...placedOf('bulb'), ...placedOf('motor')]),
        done: 'The clinic has light and a cool breeze. Thank you!',
      },
    ],
    question: {
      q: "Gogo's bulb stayed dark with two cells. Why?",
      options: ['One cell was the wrong way round, so the two cells pushed against each other.', 'Two cells are too many for one bulb.', 'The wires were too long.'],
      explain: 'Think about which way each cell pushes the current.',
    },
  },
  {
    title: 'Workshop: free build', short: 'Workshop', workshop: true,
    intro: 'The workshop is yours! Build anything. Can you do my five challenges?',
    story: 'Plenty of parts, two new ones (a buzzer and a fan), and five challenges. Build whatever you like.',
    tray() {
      addSpawner('cell', Infinity); addSpawner('bulb', Infinity); addSpawner('wire', Infinity); addSpawner('switch', Infinity);
      addSpawner('buzzer', Infinity); addSpawner('motor', Infinity, { kind: 'fan' });
    },
    setup() { state.fanDirs = new Set(); state.wsVer = -1; },
    steps: [],
  },
];
// Workshop challenges: any order, checked whenever the board changes.
const CHALLENGES = [
  { text: 'Light THREE bulbs at the same time.', hint: 'Give each bulb its own path to the cell (parallel), or put them all in one loop (series).',
    check: () => placedOf('bulb').filter((b) => isOn(live, b)).length >= 3 },
  { text: 'Make the buzzer sound, with a switch that turns it ON and OFF.', hint: 'Make a loop like your torch, with the buzzer where the bulb was.',
    check: () => placedOf('buzzer').some((bz) => isOn(live, bz) && placedOf('switch').some((sw) => switchControls(sw, bz))) },
  { text: 'Make the fan spin. Then make it spin the OTHER way.', hint: 'Turn the cell round: pinch it quickly (on a computer, right-click it). The current then flows the other way.',
    check: () => state.fanDirs.size >= 2 },
  { text: 'Use TWO cells to make a bulb extra bright.', hint: 'Put two cells one after the other in the same loop. Both must point the same way: + of one cell to − of the next.',
    check: () => placedOf('bulb').some((b) => brightness(live, b) > 1.8) },
  { text: 'Light two bulbs, each with its OWN switch.', hint: 'Give each bulb its own path to the cell, and put a switch in each path, like the rooms of a house.',
    check: () => ownSwitches() },
];
function ownSwitches(loads = placedOf('bulb')) {
  const b = loads.filter((x) => !x.blown), sw = placedOf('switch');
  if (b.length < 2 || sw.length < 2) return false;
  for (const s1 of sw) for (const b1 of b) {
    if (!s1.closed || !switchControls(s1, b1)) continue;
    for (const s2 of sw) for (const b2 of b) {
      if (s2 === s1 || b2 === b1 || !s2.closed) continue;
      if (switchControls(s2, b2) && !switchControls(s1, b2) && !switchControls(s2, b1)) return true;
    }
  }
  return false;
}
function updateWorkshop(dt) {
  for (const f of placedOf('motor')) if (f.kind === 'fan' && motorSpeed(live, f) > 0.3) {
    const d = Math.sign(live.get(f) || 0);
    if (d && !state.fanDirs.has(d)) { state.fanDirs.add(d); state.boardVer++; if (state.fanDirs.size === 1 && !saved.ws[2]) tendai.say('It spins! Now make it spin the other way.', 4); }
  }
  if (state.wsVer === state.boardVer) return;
  state.wsVer = state.boardVer;
  let newly = false;
  CHALLENGES.forEach((ch, i) => {
    if (saved.ws[i] || !ch.check()) return;
    saved.ws[i] = true; save(); newly = true;
    sfx.good();
    toast(`Challenge ${i + 1} done! ${CHALLENGES.filter((_, k) => saved.ws[k]).length} of 5.`, 'good', 5);
    tendai.act('clap', 2); tendai.say(PRAISE[i % PRAISE.length], 2.5);
    burst(V3(0, TABLE_Y + 0.1, BOARD_Z), { n: 30, colours: CONFETTI, speed: 0.6, up: 1.2, life: 1.4, size: 0.008, gravity: 1.5, flat: true });
    boardDirty = true;
  });
  if (newly && saved.ws.every(Boolean) && state.phase === 'build') { sfx.fanfare(); completeMission(); }
}
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
  endHunt();
  state.party = null;
}
function startMission(i) {
  resetBoard();
  state.huntAt = 0;
  state.mission = i; state.phase = 'build'; state.firstTry = true; state.pending = 0; state.toast = null; state.wrongAnswers = new Set();
  const m = MISSIONS[i];
  setSky(m.sky || 'day');
  m.setup?.();
  m.tray();
  if (m.steps.length) enterStep(0); else { state.step = 0; state.stepT = 0; }
  drawMissionButtons();
  tendai.act('wave', 2); tendai.say(m.intro, 5);
  drawNext();
  boardDirty = true;
}
function drawMissionButtons() {
  missionButtons.forEach((b, k) => { const l = k === WORKSHOP ? 'W' : String(k + 1); b.userData.draw(saved.done[k] ? '✓' + l : l, k === state.mission ? '#f1c40f' : MISSION_COLOURS[k]); });
}
function enterStep(k) {
  state.step = k; state.stepT = 0;
  const st = MISSIONS[state.mission].steps[k];
  st.enter?.();
  if (k > 0 && st.level) { tendai.act('wave', 1.5); tendai.say('Next: ' + st.level + '!', 3); }
  boardDirty = true;
}
// Levels that set up their own board (the five torches, the neighbours' houses) restart just that level.
const rebuilds = (m, k) => !!(m.perStep || m.steps[k]?.rebuild);
function clearForLevel() {
  for (const p of input.pointers) p.held = null;
  desk.held = null;
  for (const c of [...comps]) disposeComp(c);
  clearSpawners();
  for (const d of state.decor) d.removeFromParent();
  state.decor = [];
  for (const s of slots) { s.comp = null; s.gap = false; }
  circuit.short = false;
}
function restartStep() {
  const m = MISSIONS[state.mission];
  const k = state.step;
  if (state.phase === 'build' && k > 0 && rebuilds(m, k) || (state.phase === 'build' && m.perStep)) {
    state.pending = 0;
    clearForLevel();
    (m.steps[k].tray || m.tray)();
    enterStep(k);
    toast(`Level ${k + 1} is back as it was.`, 'info', 3);
    return;
  }
  startMission(state.mission);
}
function nextMission() {
  if (state.phase !== 'complete') { sfx.bad(); toast('Finish this chapter first. Next lights up when you are done.', 'warn', 4); return; }
  startMission((state.mission + 1) % MISSIONS.length);
}
function drawNext() {
  const ready = state.phase === 'complete';
  nextBtn.userData.draw(state.mission === WORKSHOP && ready ? 'Again ▶' : 'Next ▶', ready ? '#1e8449' : '#7f8c8d');
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
      tendai.act('clap', 1.2);
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
      tendai.act('shrug', 1.8); tendai.say('Hmm, look at the bulb!', 2.5);
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
      tendai.act('shrug', 1.8); tendai.say('Not quite. Try again!', 2.5);
      toast('Not that one. ' + m.question.explain, 'warn', 8);
      showAnswers('Question: try again', opts(), handler);
    }
  };
  showAnswers('Question: choose your answer', opts(), handler);
  tendai.act('point', 1.5); tendai.say('Quick question for you!', 3);
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
  drawMissionButtons();
  drawNext();
  updatePageResults();
  if (i === 3) world.windows.forEach((w) => (w.keep = true));
  confetti();
  tendai.act('cheer', 3);
  tendai.say(i === WORKSHOP ? 'All five challenges! You are a real electrician!' : (MISSIONS[i].outro || `Chapter complete! ${'★'.repeat(stars)}`), 4);
  if (i === 0) state.huntAt = time + 2.6;
  if (i === NEIGHBOURS) startParty();
  boardDirty = true;
}

// ---------------------------------------------------------------- mission 1 bonus: night falls, find the lost chickens with your torch
const LOST_SPOTS = [V3(-6.8, 0, -4.6), V3(5.6, 0, -6.9), V3(-1.2, 0, -8.5)];
function startHunt() {
  state.hunt = { found: 0, torch: null };
  setSky('night', 3);
  world.chickens.slice(0, 3).forEach((c, i) => { c.lost = true; c.found = false; c.pos.copy(LOST_SPOTS[i]); c.target.copy(c.pos); c.wait = 1; });
  const sp = addSpawner('torch', 1, {}, V3(0.32, TABLE_Y + 0.002, -0.27));
  state.hunt.torch = sp;
  tendai.act('worried', 2.5);
  tendai.say('Night has come and three chickens are lost! Shine your torch to find them.', 6);
  toast('Bonus: night has fallen. Pick up your torch and shine it around the yard to find Tendai\'s 3 lost chickens.', 'info', 10);
  boardDirty = true;
}
function endHunt() {
  if (!state.hunt) return;
  state.hunt = null;
  world.chickens.forEach((c) => { c.lost = false; c.found = false; c.pos.copy(c.home); c.target.copy(c.home); });
}
const _tp = new THREE.Vector3(), _td = new THREE.Vector3(), _tc = new THREE.Vector3();
let beamPool = null;
function updateHunt(dt) {
  const h = state.hunt;
  const torch = comps.find((c) => c.type === 'torch');
  if (!beamPool) { beamPool = noHit(new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), additive(0xfff0c0, 0.7))); beamPool.visible = false; scene.add(beamPool); }
  beamPool.visible = false;
  if (!torch) return;
  const held = !!torch.heldBy;
  torch.parts.beam.visible = held;
  torch.parts.lens.material.color.setHex(held ? 0xfff8d0 : 0x8a8270);
  if (!held) return;
  torch.group.getWorldPosition(_tp);
  const p = torch.heldBy !== 'desk' ? torch.heldBy : null;
  if (p && p.rayOk !== false && p.worldRay) _td.copy(p.worldRay.direction);
  else camera.getWorldDirection(_td);
  torch.group.lookAt(_tc.copy(_tp).add(_td));
  // where the beam lands on the ground
  if (_td.y < -0.02) {
    const t = -_tp.y / _td.y;
    if (t < 25) {
      beamPool.visible = true;
      beamPool.position.set(_tp.x + _td.x * t, 0.03, _tp.z + _td.z * t);
      beamPool.scale.setScalar(Math.min(2.5, 0.15 + t * 0.14));
      beamPool.material.opacity = Math.max(0.15, 0.8 - t * 0.04);
    }
  }
  if (!h) return;
  world.chickens.forEach((c, i) => {
    if (!c.lost || c.found) return;
    _tc.set(c.pos.x, 0.25, c.pos.z).sub(_tp);
    const d = _tc.length();
    if (d < 16 && _tc.normalize().dot(_td) > Math.cos(0.15)) {
      c.found = true; c.lost = false; c.hop = 1; c.running = true; c.wait = 0;
      c.target.copy(c.home);
      h.found += 1;
      cluck();
      burst(V3(c.pos.x, 0.5, c.pos.z), { n: 16, colours: [0xffffff, 0xffe080], speed: 0.8, up: 1, life: 0.9, size: 0.03, gravity: 1 });
      toast(`You found a chicken! ${h.found} of 3.`, 'good', 4);
      tendai.act(h.found === 3 ? 'cheer' : 'clap', 2);
      tendai.say(h.found === 3 ? 'All my chickens are home. Thank you!' : 'There it is!', 3);
      if (h.found === 3) { sfx.fanfare(); confetti(); }
      boardDirty = true;
    }
  });
}
// ---------------------------------------------------------------- the neighbours' houses and the village party
function lightHouse(i) {
  if (!saved.houses[i]) { saved.houses[i] = true; save(); }
  const h = world.houses[i];
  const p = h.group.getWorldPosition(new THREE.Vector3()).add(V3(0, 3.2, 0));
  burst(p, { n: 40, colours: [0xffe9a0, 0xffffff, 0xffc060], speed: 2.2, up: 1.5, life: 1.6, size: 0.06, gravity: 1.2 });
  tone(523, 0.2, 'triangle', 0.08); tone(784, 0.3, 'triangle', 0.08, null, 0.15);
}
function startParty() {
  state.party = { t: 0, nextPop: 0 };
  world.windows.forEach((w) => (w.keep = true));
  setSky('night', 3);
  saved.houses = saved.houses.map(() => true); save();
  toast('Every house has light! The village party begins.', 'good', 10);
}
const PARTY_TUNE = [523, 659, 784, 659, 698, 880, 784, 0, 523, 659, 784, 1047, 988, 784, 880, 0];
function updateHouses(dt) {
  world.houses.forEach((h, i) => {
    const target = saved.houses[i] ? 1 : 0;
    h.level += (target - h.level) * Math.min(1, dt * 3);
    const party = state.party ? 0.85 + 0.15 * Math.sin(time * 6 + i) : 1;
    h.wm.color.setRGB(0.17 + 0.83 * h.level * party, 0.14 + 0.68 * h.level * party, 0.12 + 0.36 * h.level);
    const k = h.level * (0.3 + 0.7 * world.dusk);
    h.glows.forEach((g) => (g.material.opacity = k));
    h.pool.material.opacity = h.level * world.dusk * 0.7;
  });
  const pt = state.party;
  if (!pt) return;
  pt.t += dt;
  // fireworks over the kopjes, a little tune, and Tendai dancing
  if (pt.t < 40 && time > pt.nextPop) {
    pt.nextPop = time + 0.5 + Math.random() * 0.7;
    const at = V3((Math.random() - 0.5) * 20, 8 + Math.random() * 5, -12 - Math.random() * 6);
    burst(at, { n: 70, colours: [CONFETTI[Math.floor(Math.random() * CONFETTI.length)], 0xffffff], speed: 4.5, up: 0.15, life: 2, size: 0.22, gravity: 1.0 });
    tone(140 + Math.random() * 60, 0.25, 'sine', 0.08, 60);
  }
  if (pt.t < 16) {
    const beat = Math.floor(pt.t * 4);
    if (beat !== pt.beat) { pt.beat = beat; const f = PARTY_TUNE[beat % PARTY_TUNE.length]; if (f) tone(f, 0.2, 'triangle', 0.05); }
  }
  if (pt.t < 40) tendai.act(Math.floor(pt.t / 2) % 2 ? 'cheer' : 'clap', 0.3);
}
function cluck() { tone(700, 0.06, 'square', 0.06, 1100); tone(900, 0.08, 'square', 0.05, 600, 0.09); }

// ---------------------------------------------------------------- per-frame mission logic
let alarmAt = 0;
function updateGame(dt) {
  state.stepT += dt;
  live = sim();
  // short circuit: a cell pushing far more current than any bulb needs
  const short = comps.some((c) => c.slot && c.type === 'cell' && !c.flat && Math.abs(live.get(c) || 0) > SHORT_AMPS);
  if (short && !circuit.short) { toast('SHORT CIRCUIT! The current is skipping the bulb. The cell and wires are getting hot. Take away the wire that makes the shortcut.', 'danger', 9); sfx.alarm(); alarmAt = time; tendai.say('Hot! Short circuit!', 3); }
  if (short) tendai.act('worried', 0.4);
  if (state.huntAt && time > state.huntAt) { state.huntAt = 0; if (state.mission === 0 && state.phase === 'complete') startHunt(); }
  if (short && time - alarmAt > 2.5) { sfx.alarm(); alarmAt = time; }
  circuit.short = short;

  const m = MISSIONS[state.mission];
  if (m.workshop) updateWorkshop(dt);
  else if (state.phase === 'build') {
    if (state.pending > 0) {
      state.pending -= dt;
      if (state.pending <= 0) {
        if (state.step + 1 < m.steps.length) {
          const nk = state.step + 1;
          if (m.steps[nk].tray) { clearForLevel(); m.steps[nk].tray(); }
          else if (rebuilds(m, nk)) {   // the next broken torch replaces this one
            for (const c of [...comps]) if (c.slot || !c.spawner) disposeComp(c);
            for (const s of slots) s.comp = null;
            for (const sp of spawners) refillSpawner(sp);
          }
          enterStep(nk);
        } else askQuestion();
      }
    } else {
      const st = m.steps[state.step];
      if (st.check()) {
        sfx.good();
        tendai.act('clap', 1.6); tendai.say(PRAISE[(state.mission + state.step) % PRAISE.length], 2.5);
        toast(st.done, 'good', m.perStep ? 5 : 7);
        state.pending = m.perStep || m.steps[state.step + 1]?.rebuild ? 2.8 : 1.6;
        st.onDone?.();
        if (st.house !== undefined) lightHouse(st.house);
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
    if (sp > 0.1 && Math.random() < dt * 10 * sp) burst(world.splashAt, { n: 3, colours: [0x9fd4ff, 0xe0f4ff], speed: 0.5, up: 0.6, life: 0.5, size: 0.02, gravity: 4 });
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
  updateHunt(dt);
  updateHouses(dt);
  // hut windows follow the two room bulbs in mission 4
  world.windows.forEach((w, i) => {
    let target = w.keep ? 1 : 0;
    if (state.mission === 3) { const b = placedOf('bulb').find((x) => x.room === i + 1); target = b ? Math.min(1, brightness(live, b)) : (w.keep ? 1 : 0); }
    w.level += (target - w.level) * Math.min(1, dt * 6);
    w.mat.color.setRGB(0.17 + 0.83 * w.level, 0.14 + 0.68 * w.level, 0.12 + 0.36 * w.level);
    w.glow.material.opacity = w.level * (0.35 + 0.65 * world.dusk);
    w.pool.material.opacity = w.level * world.dusk * 0.8;
  });
}

// ---------------------------------------------------------------- visuals for parts
let lastLit = new Set(), buzz = 0;
const _spk = new THREE.Vector3();
// the buzzer: one oscillator whose loudness follows the current through the buzzers
let buzzOsc = null;
function setBuzz(level) {
  const a = audio;
  if (!a) return;
  if (!buzzOsc) {
    if (level <= 0) return;
    const o = a.createOscillator(), o2 = a.createOscillator(), gn = a.createGain();
    o.type = 'square'; o.frequency.value = 520; o2.type = 'sine'; o2.frequency.value = 1040;
    gn.gain.value = 0;
    o.connect(gn); o2.connect(gn); gn.connect(a.destination);
    o.start(); o2.start();
    buzzOsc = { o, o2, gn };
  }
  buzzOsc.gn.gain.setTargetAtTime(level * 0.03, a.currentTime, 0.03);
  buzzOsc.o.frequency.setTargetAtTime(380 + level * 220, a.currentTime, 0.05);
}
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
      // a warm pool of light on the board: faint by day, strong at dusk
      c.parts.pool.material.opacity = Math.min(1, k) * (0.25 + 0.6 * world.dusk);
      c.parts.pool.scale.setScalar(0.6 + 0.6 * Math.min(1.3, k));
      if (b > 0.1) litNow.add(c);
    }
    if (c.type === 'motor') {
      const sp = c.slot ? motorSpeed(live, c) : 0;
      c.speed += (sp - c.speed) * Math.min(1, dt * 3);
      c.dir = Math.sign(I || c.dir || 1);
      c.parts.fan.rotation.y += c.speed * dt * 25 * c.dir;
    }
    if (c.type === 'buzzer') {
      const on = c.slot && Math.abs(I) > 0.06;
      buzz = Math.max(buzz, on ? Math.min(1, Math.abs(I) / 0.18) : 0);
      c.parts.body.position.set(on ? (Math.random() - 0.5) * 0.0015 : 0, 0, on ? (Math.random() - 0.5) * 0.0015 : 0);
    }
    if (c.type === 'cell') {
      const hot = c.slot && Math.abs(I) > SHORT_AMPS ? 1 : 0;
      c.hot += (hot - c.hot) * Math.min(1, dt * 2);
      c.parts.body.material.emissive.setRGB(c.hot * (0.6 + 0.3 * Math.sin(time * 10)), c.hot * 0.08, 0);
      // sparks fly from a shorted cell
      if (c.hot > 0.5 && Math.random() < dt * 8) burst(c.group.getWorldPosition(_spk).add(V3((Math.random() - 0.5) * 0.06, 0.03, 0)), { n: 6, colours: [0xfff3a0, 0xffb030, 0xff6a20], speed: 0.7, up: 0.9, life: 0.5, size: 0.0035, gravity: 3 });
    }
  }
  setBuzz(buzz); buzz = 0;
  // a bulb that lights for the first time gives a little sparkle
  for (const c of litNow) if (!lastLit.has(c)) { sfx.light(); burst(c.group.getWorldPosition(_spk).add(V3(0, 0.04, 0)), { n: 12, colours: [0xffffff, 0xfff0a0], speed: 0.35, up: 0.3, life: 0.6, size: 0.004, gravity: -0.2 }); }
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
  ctx.fillText(m.workshop ? m.title : `Chapter ${state.mission + 1}: ${m.title}`, 26, 62);
  ctx.textAlign = 'right'; ctx.font = 'bold 40px system-ui, sans-serif';
  const st = saved.stars[state.mission] || 0;
  ctx.fillText(m.workshop ? `${saved.ws.filter(Boolean).length}/5 ✓` : '★'.repeat(st) + '☆'.repeat(2 - st), W - 24, 62);
  ctx.textAlign = 'left';
  let y = 136;
  ctx.fillStyle = '#6b5236'; ctx.font = '30px system-ui, sans-serif';
  y = wrapText(ctx, m.story, 26, y, W - 52, 36) + 6;
  if (m.workshop) {
    CHALLENGES.forEach((ch, i) => {
      const done = saved.ws[i];
      ctx.fillStyle = done ? '#1e8449' : '#13293d';
      ctx.font = (done ? '' : 'bold ') + '31px system-ui, sans-serif';
      ctx.fillText(done ? '✓' : String(i + 1), 26, y);
      y = wrapText(ctx, ch.text, 66, y, W - 92, 37) + 4;
    });
    const next = CHALLENGES.findIndex((c, i) => !saved.ws[i]);
    if (next >= 0 && state.stepT > 25 && y < H - 130) {
      ctx.fillStyle = '#b9770e'; ctx.font = '28px system-ui, sans-serif';
      y = wrapText(ctx, `Hint for ${next + 1}: ` + CHALLENGES[next].hint, 26, y + 4, W - 52, 34) + 4;
    }
  } else if (state.phase === 'build') {
    m.steps.forEach((s, i) => {
      const doneStep = i < state.step || (i === state.step && state.pending > 0);
      const cur = i === state.step && !doneStep;
      if (m.perStep && !cur && !doneStep) return;   // levels that set their own board appear one at a time
      if (m.perStep && doneStep && i < state.step - 1) return;
      ctx.fillStyle = doneStep ? '#1e8449' : cur ? '#13293d' : '#9aa3ab';
      ctx.font = (cur ? 'bold ' : '') + '33px system-ui, sans-serif';
      const mark = doneStep ? '✓' : cur ? '▶' : '○';
      ctx.fillText(mark, 26, y);
      const lbl = m.steps.length > 1 && (m.perStep || s.level) ? `Level ${i + 1} of ${m.steps.length}${s.level ? ' · ' + s.level : ''}: ` : '';
      y = wrapText(ctx, lbl + s.text, 66, y, W - 92, 39) + 6;
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
    y = wrapText(ctx, m.workshop ? 'All five challenges done!' : `Chapter complete!  ${'★'.repeat(state.lastStars || 1)}`, 26, y + 20, W - 52, 58);
    ctx.fillStyle = '#13293d'; ctx.font = '31px system-ui, sans-serif';
    const all = saved.done.slice(0, 6).every(Boolean);
    const total = saved.stars.slice(0, 6).reduce((a, b) => a + (b || 0), 0);
    if (state.mission === 1) y = wrapText(ctx, `You sorted ${state.sortedRight} of 8 objects right the first time.`, 26, y + 4, W - 52, 38);
    if (state.hunt) {
      ctx.fillStyle = '#7d3c98'; ctx.font = 'bold 33px system-ui, sans-serif';
      y = wrapText(ctx, `Bonus: find the lost chickens with your torch. Found: ${state.hunt.found} of 3.`, 26, y + 6, W - 52, 40) + 2;
      ctx.fillStyle = '#13293d'; ctx.font = '31px system-ui, sans-serif';
    }
    y = wrapText(ctx, m.workshop ? 'Keep building anything you like. Every part on the tray is free to use.'
      : state.party ? `The whole village has light! Party time! Stars: ${total} of 12.${all ? '' : ' Finish the other chapters to collect every star.'} Try the Workshop (button W) next.`
        : all ? `Well done! You finished the whole story and lit up the village. Stars: ${total} of 12. Try the Workshop (button W) next.`
        : `${w.Touch} NEXT on the edge of the table to go on. One star for finishing, one for answering the question right first time.`, 26, y + 8, W - 52, 38);
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
  } else if (state.phase === 'build' || m.workshop) {
    ctx.fillStyle = '#6b6b6b'; ctx.font = '26px system-ui, sans-serif';
    const how = input.kind === 'hand' ? 'PINCH a part to pick it up. PINCH again over an empty gap to place it. PINCH in the air to put it back. TOUCH switches and buttons.'
      : input.kind === 'controller' ? 'Pull the TRIGGER on a part to pick it up, and again over an empty gap to place it. Touch or point at switches and buttons.'
        : 'Click a part to pick it up, then click an empty gap to place it. Click a switch lever to flip it. Drag to look around.';
    const extra = m.workshop || m.flipCells ? (input.kind === 'mouse' || !input.kind ? '  Right-click a cell to turn it round.' : '  Pinch a cell quickly to turn it round.') : '  Yellow dots show the current flowing.';
    wrapText(ctx, how + extra, 26, H - 58, W - 52, 31);
  }
  boardCanvas.update();
}
function updatePageResults() {
  const el = document.getElementById('results'); if (!el) return;
  if (!saved.done.some(Boolean) && !saved.ws.some(Boolean)) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = '<b>Progress on this device</b><br>' + MISSIONS.slice(0, 6).map((m, i) =>
    `${i + 1}. ${m.title}: ${saved.done[i] ? '★'.repeat(saved.stars[i] || 1) + '☆'.repeat(2 - (saved.stars[i] || 1)) : 'not done'}`).join('<br>')
    + `<br>Workshop challenges: ${saved.ws.filter(Boolean).length} of 5`;
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
el.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  const h = desktopRay();
  if (h && h.comp && h.comp.type === 'cell' && quickToggles(h.comp)) flipCell(h.comp);
});
el.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
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
el.addEventListener('pointerup', (e) => {
  if (e.button === 2) { drag = null; return; }
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
  if (/^Digit[1-7]$/.test(e.code)) startMission(parseInt(e.code.slice(5), 10) - 1);
  if (e.code === 'KeyF') { const h = desktopRay(); if (h && h.comp && quickToggles(h.comp) && h.comp.type === 'cell') flipCell(h.comp); }
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
{ const k = saved.done.slice(0, 6).findIndex((d) => !d); startMission(k >= 0 ? k : WORKSHOP); }
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
  updateLife(dt);
  tendai.update(dt);
  updateFx(dt);
  recordSnap(dt);
  if (renderer.xr.isPresenting) updateXRHover(); else updateDesktop();
  // guide arrow: what to use next (for the faults, only after the hint appears)
  const m = MISSIONS[state.mission];
  let t = null;
  if (m.workshop) t = null;
  else if (state.phase === 'build' && state.pending <= 0) {
    const s = m.steps[state.step];
    if (m.arrowAfterHint) t = state.stepT > 25 ? state.fault : null;
    else t = s.arrow ? s.arrow() : null;
  } else if (state.phase === 'question') t = null;
  else if (state.phase === 'complete') {
    const torch = state.hunt && state.hunt.found < 3 ? comps.find((c) => c.type === 'torch') : null;
    t = torch ? (torch.heldBy ? null : torch.group) : nextBtn;
  }
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
  missionButtons, nextBtn, restartBtn, clearBtn, speakBtn, pressButton, desktopClick, mouse, tendai, flipCell, CHALLENGES, startHunt, fx, WORKSHOP,
  get live() { return live; }, get time() { return time; }, setSpeed(s) { speed = s; },
};
