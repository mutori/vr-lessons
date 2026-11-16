// Reading the Land: Contours and Relief — a Form 2 Geography VR lesson.
// WebXR + three.js. Works in the Meta Quest browser (controllers or hand pinch) and on a desktop browser (mouse).
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import * as T from './terrain.js';
import { createXRInput, inputWords } from '../shared/xr-input.js';
import { createDebugHud } from '../shared/debug-hud.js';

const { HALF, H0, INTERVAL } = T;

// ---------- Key places on the map (computed from the landscape) ----------
const PEAK = T.findPeak(100, -50);
const KOPJE = T.findPeak(-150, -650);
const RIDGE_TOP = T.findPeak(720, -450);
const SADDLE = T.findSaddle(PEAK, KOPJE);
const MAX_LEVEL = Math.floor(PEAK.h / INTERVAL) * INTERVAL;          // 1240
const MIN_LEVEL = Math.ceil((H0 + 1) / INTERVAL) * INTERVAL;          // 960
const LEVELS = (MAX_LEVEL - MIN_LEVEL) / INTERVAL + 1;

const FEATURES = [
  { id: 'hill', n: 1, name: 'Hill (Dombo Hill)', x: PEAK.x, z: PEAK.z, r: 330,
    map: 'Closed rings of contour lines, one inside another. The heights go UP towards the middle. The top has a spot height (' + Math.round(PEAK.h) + ' m).',
    land: 'A raised, rounded piece of land. This one is a granite kopje.' },
  { id: 'steep', n: 2, name: 'Steep slope', x: 280, z: -30, r: 120,
    map: 'Contour lines are CLOSE TOGETHER.',
    land: 'You climb many metres over a short distance. Hard to walk up!' },
  { id: 'gentle', n: 3, name: 'Gentle slope', x: -380, z: -30, r: 170,
    map: 'Contour lines are FAR APART.',
    land: 'The land rises slowly. Easy to walk and farm.' },
  { id: 'plateau', n: 4, name: 'Plateau (Tafura Plateau)', x: -600, z: 450, r: 270,
    map: 'Lines packed close together around the edge, then a wide EMPTY space on top.',
    land: 'High land with steep sides and a flat top, like a table.' },
  { id: 'spur', n: 5, name: 'Spur', x: 80, z: 420, r: 160,
    map: 'Contours bend into a V or U that points DOWNHILL, away from the hill.',
    land: 'A tongue of high ground sticking out from a hill into lower land.' },
  { id: 'valley', n: 6, name: 'Valley (Chenga River)', x: 475, z: -400, r: 160,
    map: 'Contours bend into a V that points UPHILL (upstream). A river often runs along it.',
    land: 'Low land between higher ground. Water collects and flows here.' },
  { id: 'ridge', n: 7, name: 'Ridge (Nhete Ridge)', x: RIDGE_TOP.x, z: RIDGE_TOP.z, r: 300,
    map: 'Long, narrow loops of contour lines.',
    land: 'A long, narrow strip of high land.' },
  { id: 'saddle', n: 8, name: 'Saddle (col)', x: SADDLE.x, z: SADDLE.z, r: 140,
    map: 'Two sets of rings face each other, like an hourglass. The dip between them is lower than both tops.',
    land: 'A low dip between two hilltops. Paths and roads often cross here.' },
];
const F = Object.fromEntries(FEATURES.map(f => [f.id, f]));

// ---------- Renderer, scene, camera ----------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const SKY_TABLE = new THREE.Color(0xbfd8e8);
scene.background = SKY_TABLE.clone();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 6000);
camera.position.set(0, 1.75, 1.1);
// The player rig: in VR it is placed so the learner's head starts in front of the table, facing it.
const rig = new THREE.Group();
scene.add(rig);
rig.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.12, -1.0);
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = 4;
controls.update();

scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6b5a3e, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-2, 4, 1);
scene.add(sun);

// ---------- Classroom space: floor and table ----------
// In VR the learner's head starts at the origin facing -z. The table's near edge is 0.2 m in front,
// with a strip of touch buttons along it; the model's centre is 0.8 m away.
const TABLE_Z = -0.8;          // model centre (m)
const TABLE_TOP = 0.78;
const room = new THREE.Group();
scene.add(room);
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);
  const tableMat = new THREE.MeshLambertMaterial({ color: 0x5b3a21 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 1.2), tableMat);
  top.position.set(0, 0.755, TABLE_Z);
  room.add(top);
  for (const [x, z] of [[-0.54, TABLE_Z + 0.54], [0.54, TABLE_Z + 0.54], [-0.54, TABLE_Z - 0.54], [0.54, TABLE_Z - 0.54]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.73, 0.06), tableMat);
    leg.position.set(x, 0.365, z);
    room.add(leg);
  }
}

// ---------- Terrain model ----------
const TABLE_SIZE = 1.0;                       // model width on the table (m): small enough to reach across
const TABLE_SCALE = TABLE_SIZE / (2 * HALF);  // world metres per landscape metre
const TABLE_EXAG = 2;                         // heights are stretched x2 on the table model
const FLAT = 0.0015;

const world = new THREE.Group();              // holds the terrain + labels; scaled to table or life size
scene.add(world);

const RES = 300;
const terrainGeo = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, RES, RES);
terrainGeo.rotateX(-Math.PI / 2);
{
  const pos = terrainGeo.attributes.position;
  const river = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, T.height(x, z) - H0);
    const ri = T.riverInfo(x, z);
    const halfW = 9 * Math.min(1, ri.s / 160 + 0.25);
    river[i] = ri.d / halfW;
  }
  terrainGeo.setAttribute('aRiver', new THREE.BufferAttribute(river, 1));
  terrainGeo.computeVertexNormals();
}

const terrainUniforms = {
  uMapMix: { value: 0 },
  uReveal: { value: MIN_LEVEL - INTERVAL },   // contours at or below this level are drawn
  uNewLevel: { value: -1 }, uNewGlow: { value: 0 },
  uLineAlpha: { value: 1 },
  uInterval: { value: INTERVAL },
  uH0: { value: H0 },
  uHi: { value: new THREE.Vector3(0, 0, 1) }, uHiOn: { value: 0 },
  uTime: { value: 0 },
  uLight: { value: new THREE.Vector3(-0.5, 0.8, 0.3).normalize() },
  uNormalWorld: { value: new THREE.Matrix3() },
  uFogColor: { value: new THREE.Color(0xbfd8e8) }, uFogNear: { value: 1e5 }, uFogFar: { value: 2e5 },
  uGrid: { value: 0 },
  uBand: { value: 0 },   // extra line width in metres of height (used at life size)
};

const terrainMat = new THREE.ShaderMaterial({
  uniforms: terrainUniforms,
  vertexShader: /* glsl */`
    attribute float aRiver;
    uniform mat3 uNormalWorld; uniform float uH0;
    varying float vH; varying vec2 vXZ; varying vec3 vN; varying float vRiver; varying float vDist;
    void main() {
      vH = position.y + uH0; vXZ = position.xz; vRiver = aRiver;
      vN = normalize(uNormalWorld * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform float uMapMix, uReveal, uNewLevel, uNewGlow, uLineAlpha, uInterval, uHiOn, uTime, uFogNear, uFogFar, uGrid, uBand;
    uniform vec3 uHi, uLight, uFogColor;
    varying float vH; varying vec2 vXZ; varying vec3 vN; varying float vRiver; varying float vDist;
    void main() {
      vec3 n = normalize(vN);
      float diff = clamp(dot(n, uLight), 0.0, 1.0);
      float t = clamp((vH - 950.0) / 300.0, 0.0, 1.0);
      vec3 low = vec3(0.55, 0.63, 0.32), mid = vec3(0.66, 0.58, 0.36), high = vec3(0.58, 0.55, 0.52);
      vec3 land = mix(mix(low, mid, smoothstep(0.0, 0.5, t)), high, smoothstep(0.5, 1.0, t));
      float rock = smoothstep(0.75, 0.55, n.y);            // steep ground shows bare granite
      land = mix(land, vec3(0.6, 0.58, 0.56), rock * 0.7);
      vec3 col3d = land * (0.5 + 0.62 * diff);
      vec3 paper = vec3(0.97, 0.95, 0.87);
      vec3 col = mix(col3d, paper, uMapMix);

      // map grid every 500 m (only when flattened to a map)
      vec2 g = abs(fract(vXZ / 500.0 + 0.5) - 0.5) / fwidth(vXZ / 500.0);
      float grid = 1.0 - min(min(g.x, g.y), 1.0);
      col = mix(col, vec3(0.55, 0.7, 0.85), grid * 0.6 * uGrid * uMapMix);

      // contour lines
      float f = vH / uInterval;
      float fw = max(fwidth(f), 1e-5);
      float k = floor(f + 0.5);
      float lvl = k * uInterval;
      float d = abs(f - k) / fw;
      bool idx = mod(lvl + 0.5, 100.0) < 1.0;
      float w = idx ? 1.7 : 0.9;
      float line = 1.0 - smoothstep(w - 0.6, w + 0.6, d);
      if (uBand > 0.0) line = max(line, 1.0 - smoothstep(0.7, 1.0, abs(vH - lvl) / (uBand * (idx ? 1.6 : 1.0))));
      float shown = step(lvl, uReveal + 0.5);
      vec3 lineCol = mix(vec3(0.40, 0.20, 0.06), vec3(0.70, 0.36, 0.10), uMapMix);
      float isNew = 1.0 - step(0.5, abs(lvl - uNewLevel));
      lineCol = mix(lineCol, vec3(1.0, 0.86, 0.15), isNew * uNewGlow);
      float wNew = 1.0 - smoothstep(w + 1.0, w + 2.2, d);
      line = max(line, isNew * uNewGlow * wNew);
      col = mix(col, lineCol, line * shown * uLineAlpha);

      // river
      float r = 1.0 - smoothstep(0.85, 1.15, vRiver);
      col = mix(col, mix(vec3(0.18, 0.42, 0.72), vec3(0.12, 0.45, 0.85), uMapMix), r);

      // highlight ring for the selected feature
      float hd = length(vXZ - uHi.xy) / uHi.z;
      float inside = 1.0 - smoothstep(0.92, 1.0, hd);
      float edge = smoothstep(0.86, 0.94, hd) * (1.0 - smoothstep(0.96, 1.02, hd));
      float pulse = 0.55 + 0.45 * sin(uTime * 4.0);
      col = mix(col, vec3(1.0, 0.82, 0.1), uHiOn * (inside * 0.22 * pulse + edge * 0.9));

      float fog = smoothstep(uFogNear, uFogFar, vDist);
      col = mix(col, uFogColor, fog);
      gl_FragColor = vec4(col, 1.0);
    }`,
});

const terrain = new THREE.Mesh(terrainGeo, terrainMat);
terrain.raycast = () => {};                     // we hit-test the land analytically (much cheaper)
world.add(terrain);

// Side walls so the table model looks like a solid block of land
{
  const N = RES;
  const verts = [], idx = [];
  const sides = [
    (t) => [-HALF + 2 * HALF * t, HALF], (t) => [HALF, HALF - 2 * HALF * t],
    (t) => [HALF - 2 * HALF * t, -HALF], (t) => [-HALF, -HALF + 2 * HALF * t],
  ];
  for (const side of sides) {
    const base = verts.length / 3;
    for (let i = 0; i <= N; i++) {
      const [x, z] = side(i / N);
      verts.push(x, T.height(x, z) - H0, z, x, -15, z);
    }
    for (let i = 0; i < N; i++) {
      const a = base + i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const skirt = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x7a5232, side: THREE.DoubleSide }));
  terrain.add(skirt);
  var skirtMesh = skirt;
}

// Water used to "flood" the model and draw contours as shorelines
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(2 * HALF, 2 * HALF).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x2f7fc1, transparent: true, opacity: 0.62, depthWrite: false })
);
water.position.y = -5;
water.visible = false;
water.renderOrder = 2;
terrain.add(water);
let waterLevel = H0;

// Large plain around the life-size landscape, hidden by fog
const outerGround = new THREE.Mesh(new THREE.CircleGeometry(7000, 64).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x8fa15a }));
outerGround.position.y = 955 - H0;
outerGround.visible = false;
world.add(outerGround);

// ---------- Small helpers: text textures, labels ----------
function textCanvas(lines, opts = {}) {
  const font = opts.font || 'bold 44px system-ui, sans-serif';
  const pad = opts.pad ?? 14;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + pad * 2;
  const lh = parseInt(font.match(/(\d+)px/)[1], 10) * 1.2;
  c.width = w; c.height = Math.ceil(lh * lines.length + pad * 2);
  ctx.font = font;
  if (opts.bg) { ctx.fillStyle = opts.bg; roundRect(ctx, 0, 0, c.width, c.height, 14); ctx.fill(); }
  ctx.fillStyle = opts.color || '#222';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + i * lh));
  return c;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function makeLabel(text, heightM, opts = {}) {
  const c = textCanvas(Array.isArray(text) ? text : [text], opts);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: opts.depthTest ?? true, transparent: true }));
  s.scale.set(heightM * c.width / c.height, heightM, 1);
  s.renderOrder = 5;
  return s;
}

// Labels sit on the land; their height follows the vertical stretch of the model.
const labels = [];   // { obj, x, z, lift(world m), modes }
function placeOnLand(obj, x, z, lift, kind = 'map') {
  world.add(obj);
  labels.push({ obj, x, z, lift, kind });
}

// Spot heights, index-contour values and names
const spot = (x, z, txt) => placeOnLand(makeLabel(txt, 0.022, { font: 'bold 40px system-ui', color: '#3b2a12', bg: 'rgba(255,252,240,.85)', pad: 8 }), x, z, 0.018, 'map');
spot(PEAK.x, PEAK.z, '▲ ' + Math.round(PEAK.h));
spot(KOPJE.x, KOPJE.z, '• ' + Math.round(KOPJE.h));
spot(-600, 450, '• ' + T.PLATEAU_TOP);
spot(RIDGE_TOP.x, RIDGE_TOP.z, '• ' + Math.round(RIDGE_TOP.h));
spot(420, -930, '• ' + Math.round(T.height(420, -930)));
spot(870, 930, '• ' + Math.round(T.height(870, 930)));
for (const [L, dx, dz] of [[1200, -1, 0], [1100, -1, 0], [1000, -0.5, 0.866]]) {
  const p = T.findLevelAlong(L, PEAK.x, PEAK.z, dx, dz);
  if (p) placeOnLand(makeLabel(String(L), 0.02, { font: 'bold 40px system-ui', color: '#8a4510', bg: 'rgba(255,250,235,.9)', pad: 6 }), p.x, p.z, 0.012, 'map');
}
const nameLabel = (x, z, t) => placeOnLand(makeLabel(t, 0.024, { font: 'italic bold 40px Georgia, serif', color: '#20331f', bg: 'rgba(255,255,255,.6)', pad: 8 }), x, z, 0.05, 'names');
nameLabel(PEAK.x - 120, PEAK.z + 90, 'Dombo Hill');
nameLabel(-600, 560, 'Tafura Plateau');
nameLabel(800, -700, 'Nhete Ridge');
nameLabel(700, 450, 'Chenga River');

// North arrow, scale bar and rim turn with the model (turntable)
const turnGroup = new THREE.Group();
turnGroup.position.set(0, TABLE_TOP, TABLE_Z);
room.add(turnGroup);
const rim = new THREE.Group();
let tableYaw = 0;
{
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f6f1e3'; x.beginPath(); x.arc(128, 128, 120, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#222'; x.beginPath(); x.moveTo(128, 30); x.lineTo(168, 190); x.lineTo(128, 160); x.lineTo(88, 190); x.closePath(); x.fill();
  x.font = 'bold 64px system-ui'; x.textAlign = 'center'; x.fillText('N', 128, 250 - 14);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  m.rotation.x = -Math.PI / 2; m.position.set(TABLE_SIZE / 2 + 0.018, 0.032, -TABLE_SIZE / 2 - 0.018);
  turnGroup.add(m);

  // Scale bar: 500 m on the model. On the canvas the bar is 420 px of 512 px.
  const c2 = document.createElement('canvas'); c2.width = 512; c2.height = 128;
  const y = c2.getContext('2d');
  y.fillStyle = '#f6f1e3'; roundRect(y, 0, 0, 512, 128, 16); y.fill();
  y.fillStyle = '#222'; y.fillRect(46, 56, 210, 16); y.strokeStyle = '#222'; y.lineWidth = 4; y.strokeRect(256, 56, 210, 16);
  y.font = 'bold 30px system-ui'; y.textAlign = 'center';
  y.fillText('0', 46, 108); y.fillText('250 m', 256, 108); y.fillText('500 m', 466, 108);
  y.font = 'bold 28px system-ui'; y.fillText('Contour interval 20 m', 256, 14 + 14);
  const t2 = new THREE.CanvasTexture(c2); t2.colorSpace = THREE.SRGBColorSpace;
  const wBar = 500 * TABLE_SCALE * 512 / 420;
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(wBar, wBar / 4), new THREE.MeshBasicMaterial({ map: t2, transparent: true }));
  bar.rotation.x = -Math.PI / 2; bar.position.set(-0.2, 0.002, -TABLE_SIZE / 2 - 0.075);
  turnGroup.add(bar);
  // wooden rim round the model: pinch it (or grip it) and drag sideways to turn the model
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
  const h = TABLE_SIZE / 2 + 0.018;
  for (const [x, z, w, d] of [[0, -h, 2 * h + 0.036, 0.036], [0, h, 2 * h + 0.036, 0.036], [-h, 0, 0.036, 2 * h], [h, 0, 0.036, 2 * h]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), rimMat);
    r.position.set(x, 0.015, z);
    rim.add(r);
  }
  turnGroup.add(rim);
  var rimMaterial = rimMat;
}

// ---------- Feature pins (Station 2) and quiz letters ----------
const interactables = []; // { obj, onSelect(hit), onHover(hit|null), enabled() }
const pins = new THREE.Group();
world.add(pins);
const pinObjs = [];
for (const f of FEATURES) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 6), new THREE.MeshBasicMaterial({ color: 0x333333 }));
  stick.position.y = 0.03; g.add(stick);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), new THREE.MeshLambertMaterial({ color: 0xd9462b }));
  head.position.y = 0.065; g.add(head);
  const num = makeLabel(String(f.n), 0.03, { font: 'bold 56px system-ui', color: '#fff', bg: 'rgba(30,30,30,.8)', pad: 10, depthTest: false });
  num.position.y = 0.105; g.add(num);
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.075; g.add(hit);
  pins.add(g);
  const rec = { f, g, head, visited: false };
  pinObjs.push(rec);
  labels.push({ obj: g, x: f.x, z: f.z, lift: 0, kind: 'pin', parentIsWorld: false });
  interactables.push({ obj: hit, enabled: () => pins.visible, onSelect: () => selectFeature(f.id),
    onHover: (h) => head.material.emissive?.setHex(h ? 0x553300 : 0x000000) });
}
pins.visible = false;

const letters = {};
for (const [L, x, z] of [['A', 300, -30], ['B', -400, -30], ['C', -300, 820], ['D', -600, 450], ['E', 475, -420]]) {
  const s = makeLabel(L, 0.045, { font: 'bold 64px system-ui', color: '#fff', bg: 'rgba(170,30,30,.92)', pad: 12, depthTest: false });
  s.visible = false;
  placeOnLand(s, x, z, 0.03, 'letter');
  letters[L] = s;
}

// Marker that shows where a learner pointed
const pointMarker = new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b1f, depthTest: false }));
pointMarker.renderOrder = 6;
pointMarker.visible = false;
scene.add(pointMarker);

// ---------- Info board (canvas UI drawn on a plane) ----------
const PANEL_W = 1.5, PANEL_H = 0.98, CW = 1400, CH = Math.round(1400 * PANEL_H / PANEL_W);
const panelCanvas = document.createElement('canvas'); panelCanvas.width = CW; panelCanvas.height = CH;
const pctx = panelCanvas.getContext('2d');
const panelTex = new THREE.CanvasTexture(panelCanvas); panelTex.colorSpace = THREE.SRGBColorSpace;
panelTex.anisotropy = 4;
const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true }));
scene.add(panel);
function placePanelAtTable() { panel.rotation.order = 'XYZ'; panel.position.set(0, 1.7, -1.62); panel.rotation.set(-0.12, 0, 0); }
placePanelAtTable();

let ui = { title: '', body: '', buttons: [], layout: 'row', tag: '' };
const btnRects = [];

// Hover on the board is shown by a small highlight over the button, one per pointer, so pointing
// never redraws the board's canvas (redrawing re-uploads a 1400 x 915 texture).
const hoverQuads = [];
{
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,214,90,0.22)'; roundRect(x, 4, 4, 248, 88, 18); x.fill();
  x.strokeStyle = '#ffd65a'; x.lineWidth = 8; roundRect(x, 4, 4, 248, 88, 18); x.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 3; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    q.visible = false; q.raycast = () => {}; q.renderOrder = 3;
    panel.add(q); hoverQuads.push(q);
  }
}
function showBoardHover(i, b) {
  const q = hoverQuads[i];
  const r = b && b.enabled !== false ? btnRects.find((r) => r.b === b) : null;
  if (!r) { q.visible = false; return; }
  q.visible = true;
  q.position.set((r.x + r.w / 2) / CW * PANEL_W - PANEL_W / 2, PANEL_H / 2 - (r.y + r.h / 2) / CH * PANEL_H, 0.002);
  q.scale.set(r.w / CW * PANEL_W + 0.01, r.h / CH * PANEL_H + 0.01, 1);
}

// Instructions name the input in use: {tokens} in board text are filled in when the board is drawn.
function phrase(key) {
  const k = input.kind;
  const P = {
    howto: { hand: 'touch a button on the near edge of the table with your fingertip, or point at the board and pinch.',
      controller: 'touch a button on the near edge of the table with the controller tip, or point at the board and pull the trigger.',
      mouse: 'click a button on the board.' },
    touchPin: { hand: 'Touch a pin with your fingertip, or point at it and pinch,', controller: 'Touch a pin with the controller tip, or point at it and pull the trigger,', mouse: 'Click a pin' },
    touchLand: { hand: 'Touch the spot with your fingertip, or point at it and pinch.', controller: 'Touch the spot with the controller tip, or point at it and pull the trigger.', mouse: 'Click on it.' },
    lift: { hand: 'Pinch the BLUE handle at the left corner of the table and lift it slowly: the water follows your hand. Or press "Raise water".',
      controller: 'Squeeze the grip on the BLUE handle at the left corner of the table and lift it slowly: the water follows. Or press "Raise water".',
      mouse: 'Press "Raise water" to lift the water by 20 m.' },
    squash: { hand: 'Or pinch the GREEN handle at the right corner of the table and move it up and down to squash the land at your own speed.',
      controller: 'Or squeeze the grip on the GREEN handle at the right corner of the table and move it up and down.',
      mouse: '' },
    turn: { hand: 'To bring far places closer, pinch the wooden edge of the model and drag it sideways.',
      controller: 'To bring far places closer, squeeze the grip on the wooden edge of the model and drag it sideways.',
      mouse: 'In VR you can turn the model by its wooden edge.' },
  };
  if (P[key]) return P[key][k === 'hand' || k === 'controller' ? k : 'mouse'];
  return inputWords(k)[key] ?? key;
}
const fill = (t) => String(t).replace(/\{(\w+)\}/g, (_, k) => phrase(k));

// Wrap text with **bold** spans. Returns lines of [{t, bold}] words.
function wrapRich(ctx, text, maxW, size) {
  const out = [];
  const fontFor = (b) => `${b ? 'bold ' : ''}${size}px system-ui`;
  for (const para of text.split('\n')) {
    if (para.trim() === '') { out.push([]); continue; }
    const words = [];
    para.split('**').forEach((seg, i) => seg.split(' ').forEach(w => { if (w) words.push({ t: w, bold: i % 2 === 1 }); }));
    let line = [], width = 0;
    ctx.font = fontFor(false); const space = ctx.measureText(' ').width;
    for (const w of words) {
      ctx.font = fontFor(w.bold);
      const ww = ctx.measureText(w.t).width;
      if (line.length && width + space + ww > maxW) { out.push(line); line = []; width = 0; }
      w.w = ww; width += (line.length ? space : 0) + ww; line.push(w);
    }
    out.push(line);
  }
  return out;
}

function drawPanel() {
  const c = pctx;
  c.clearRect(0, 0, CW, CH);
  c.fillStyle = 'rgba(20,36,24,0.94)'; roundRect(c, 0, 0, CW, CH, 36); c.fill();
  c.strokeStyle = '#c9a46a'; c.lineWidth = 6; roundRect(c, 3, 3, CW - 6, CH - 6, 34); c.stroke();
  const M = 56;
  c.textBaseline = 'top';
  if (ui.tag) { c.font = 'bold 30px system-ui'; c.fillStyle = '#c9a46a'; c.fillText(ui.tag.toUpperCase(), M, 34); }
  c.font = 'bold 54px system-ui'; c.fillStyle = '#fff6df';
  c.fillText(fill(ui.title), M, 74);

  // buttons layout
  btnRects.length = 0;
  const bs = ui.buttons;
  let btnTop;
  if (ui.layout === 'column') {
    const bh = 84, gap = 14;
    btnTop = CH - M + 10 - bs.length * (bh + gap);
    bs.forEach((b, i) => btnRects.push({ b, x: M, y: btnTop + i * (bh + gap), w: CW - 2 * M, h: bh }));
  } else {
    const bh = 96, gap = 24;
    const totalW = CW - 2 * M;
    const bw = bs.length ? (totalW - gap * (bs.length - 1)) / bs.length : 0;
    btnTop = CH - M - bh + 10;
    bs.forEach((b, i) => btnRects.push({ b, x: M + i * (bw + gap), y: btnTop, w: bw, h: bh }));
  }

  // body text: shrink to fit the space above the buttons
  const maxH = btnTop - 160 - 20;
  let size = 40, lines;
  for (; size >= 24; size -= 2) {
    lines = wrapRich(c, fill(ui.body), CW - 2 * M, size);
    if (lines.length * size * 1.32 <= maxH) break;
  }
  c.font = `${size}px system-ui`;
  const space = c.measureText(' ').width;
  lines.forEach((line, i) => {
    let x = M;
    for (const w of line) {
      c.font = `${w.bold ? 'bold ' : ''}${size}px system-ui`;
      c.fillStyle = w.bold ? '#ffd27a' : '#f4efe2';
      c.fillText(w.t, x, 160 + i * size * 1.32);
      x += w.w + space;
    }
  });

  for (const r of btnRects) {
    const { b } = r;
    const on = b.enabled !== false;
    c.fillStyle = btnColor(b);
    roundRect(c, r.x, r.y, r.w, r.h, 20); c.fill();
    c.fillStyle = on ? '#ffffff' : '#9aa39c';
    let fs = ui.layout === 'column' ? 34 : 38;
    c.font = `bold ${fs}px system-ui`;
    while (c.measureText(b.label).width > r.w - 30 && fs > 20) { fs -= 2; c.font = `bold ${fs}px system-ui`; }
    c.textBaseline = 'middle';
    c.textAlign = ui.layout === 'column' ? 'left' : 'center';
    c.fillText(b.label, ui.layout === 'column' ? r.x + 28 : r.x + r.w / 2, r.y + r.h / 2 + 2);
    c.textAlign = 'left'; c.textBaseline = 'top';
  }
  panelTex.needsUpdate = true;
  hoverQuads.forEach((q) => (q.visible = false));
  syncConsole();
}
function btnColor(b) {
  if (b.enabled === false) return '#3b403c';
  if (b.style === 'chosen') return '#8a6a1f';
  return b.style === 'good' ? '#2e7d3a' : b.style === 'bad' ? '#a3372b' : b.style === 'quiet' ? '#3a4a3e' : '#2f6b3a';
}

function setUI(next) { ui = { layout: 'row', tag: '', ...next }; ui.buttons = ui.buttons.filter(Boolean); drawPanel(); }

// ---------- Touch console: the board's buttons, mirrored within reach ----------
// On the table it is a strip along the near edge; at real size it sits 0.45 m in front of the learner.
const consoleGroup = new THREE.Group();
scene.add(consoleGroup);
const CONSOLE_W = 0.84, CBTN_H = 0.065, CGAP = 0.016;
const consoleBtns = [];
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  const face = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 420; cv.height = 168;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const back = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.012), new THREE.MeshLambertMaterial({ color: 0x1d2a1f }));
  back.position.z = -0.007;
  const front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  face.add(back, front);
  g.add(face);
  g.userData.face = face;
  g.visible = false;
  consoleGroup.add(g);
  const rec = { g, face, back, front, cv, tex, b: null, key: '', w: 0.15 };
  consoleBtns.push(rec);
}
function drawConsoleBtn(rec) {
  const { cv, b } = rec;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  x.fillStyle = btnColor(b); roundRect(x, 4, 4, cv.width - 8, cv.height - 8, 26); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 4; roundRect(x, 4, 4, cv.width - 8, cv.height - 8, 26); x.stroke();
  x.fillStyle = b.enabled === false ? '#9aa39c' : '#ffffff';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const label = b.consoleLabel || b.label;
  let fs = 50;
  const words = label.split(' ');
  let lines;
  for (; fs >= 26; fs -= 2) {
    x.font = `bold ${fs}px system-ui`;
    lines = [];
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > cv.width - 36 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    if (lines.length <= 2 && lines.every((l) => x.measureText(l).width <= cv.width - 30)) break;
  }
  lines.forEach((l, i) => x.fillText(l, cv.width / 2, cv.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.1 + 2));
  rec.tex.needsUpdate = true;
}
function syncConsole() {
  const bs = ui.buttons;
  const n = Math.min(bs.length, consoleBtns.length);
  const w = Math.min(0.2, (CONSOLE_W - CGAP * (n - 1)) / Math.max(n, 1));
  consoleBtns.forEach((rec, i) => {
    const b = bs[i];
    rec.g.visible = i < n;
    if (!b) { rec.b = null; return; }
    if (ui.layout === 'column') b.consoleLabel = String.fromCharCode(65 + i);   // long answers: the board shows the full text
    else b.consoleLabel = null;
    rec.b = b;
    rec.g.position.set(-((n - 1) * (w + CGAP)) / 2 + i * (w + CGAP), 0, 0);
    rec.face.scale.set(w, CBTN_H, 1);
    rec.g.userData.size = { w, h: CBTN_H };
    if (pokes[i]) { pokes[i].entry.w = w; pokes[i].entry.h = CBTN_H; }
    const key = [b.consoleLabel || b.label, b.style, b.enabled, w].join('|');
    if (key !== rec.key) { rec.key = key; drawConsoleBtn(rec); }
  });
}
function pressConsole(i) {
  const b = consoleBtns[i].b;
  if (b && b.enabled !== false && b.onClick) { beep(660, 0.06); b.onClick(); }
}
// ---------- Map in hand at real size (G8) ----------
// The flat contour map is rendered once to a texture at start-up, then shown on a small board beside
// the console at real size, with a "you are here" marker and an arrow for the way you face.
const MINIMAP = 0.22;
const miniMapRT = new THREE.WebGLRenderTarget(1024, 1024);
miniMapRT.texture.colorSpace = THREE.SRGBColorSpace;
const miniMap = new THREE.Group();
{
  const back = new THREE.Mesh(new THREE.PlaneGeometry(MINIMAP + 0.016, MINIMAP + 0.05), new THREE.MeshBasicMaterial({ color: 0x1d2a1f }));
  back.position.set(0, 0.015, -0.002);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(MINIMAP, MINIMAP), new THREE.MeshBasicMaterial({ map: miniMapRT.texture }));
  miniMap.add(back, face);
  // header text drawn onto the back panel's top strip
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f6f1e3'; x.font = 'bold 34px system-ui'; x.textBaseline = 'middle';
  x.fillText('MAP   ▲ N', 12, 34);
  const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
  const title = new THREE.Mesh(new THREE.PlaneGeometry(MINIMAP, MINIMAP / 8), new THREE.MeshBasicMaterial({ map: tt, transparent: true }));
  title.position.set(0, MINIMAP / 2 + 0.017, 0.001);
  miniMap.add(title);
}
// you-are-here marker: a red arrow pointing the way the learner faces
const youMarker = new THREE.Mesh(
  new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0.012), new THREE.Vector2(0.008, -0.009), new THREE.Vector2(0, -0.004), new THREE.Vector2(-0.008, -0.009)])),
  new THREE.MeshBasicMaterial({ color: 0xd92b1f }));
youMarker.position.z = 0.002;
miniMap.add(youMarker);
miniMap.position.set(-0.56, 0.02, 0);
miniMap.visible = false;
miniMap.traverse((o) => { o.raycast = () => {}; });
consoleGroup.add(miniMap);
function renderMiniMap() {
  const mapScene = new THREE.Scene();
  mapScene.background = new THREE.Color(0xf7f2e0);
  const flat = new THREE.Mesh(terrainGeo, terrainMat);
  flat.scale.set(1, FLAT, 1);
  mapScene.add(flat);
  const cam = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 1, 4000);
  cam.position.set(0, 2000, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  const U = terrainUniforms, keep = {};
  for (const k of ['uMapMix', 'uReveal', 'uGrid', 'uHiOn', 'uNewGlow', 'uBand', 'uFogNear', 'uFogFar']) keep[k] = U[k].value;
  U.uMapMix.value = 1; U.uReveal.value = MAX_LEVEL; U.uGrid.value = 1; U.uHiOn.value = 0; U.uNewGlow.value = 0; U.uBand.value = 0; U.uFogNear.value = 1e5; U.uFogFar.value = 2e5;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(miniMapRT);
  renderer.render(mapScene, cam);
  renderer.setRenderTarget(prev);
  for (const k in keep) U[k].value = keep[k];
}
function updateMiniMap() {
  miniMap.visible = lifeSize;
  if (!lifeSize || !viewpoint) return;
  const vp = VIEWPOINTS[viewpoint];
  youMarker.position.set(vp.x / (2 * HALF) * MINIMAP, -vp.z / (2 * HALF) * MINIMAP, 0.002);
  youMarker.rotation.z = headYaw() - world.rotation.y;
}

function placeConsoleAtTable() {
  consoleGroup.position.set(0, TABLE_TOP + 0.045, TABLE_Z + TABLE_SIZE / 2 + 0.058);
  consoleGroup.rotation.set(-Math.PI / 2 + 0.75, 0, 0, 'YXZ');
}
placeConsoleAtTable();

function buttonAtUV(uv) {
  if (!uv) return null;
  const px = uv.x * CW, py = (1 - uv.y) * CH;
  const r = btnRects.find(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
  return r ? r.b : null;
}
interactables.push({
  obj: panel, enabled: () => panel.visible,
  onHover: (hit, i = 2) => showBoardHover(i, hit ? buttonAtUV(hit.uv) : null),
  onSelect: (hit) => { const b = buttonAtUV(hit.uv); if (b && b.enabled !== false && b.onClick) { beep(660, 0.06); b.onClick(); } },
});
// console buttons can also be pointed at (and clicked on a computer)
consoleBtns.forEach((rec, i) => interactables.push({
  obj: rec.front, enabled: () => rec.g.visible && consoleGroup.visible,
  onHover: () => {}, onSelect: () => pressConsole(i),
}));

// ---------- Sound and speech ----------
let audioCtx = null;
function beep(freq = 660, dur = 0.1, type = 'sine', vol = 0.08) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = vol;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* audio not available */ }
}
const good = () => { beep(523, 0.12); setTimeout(() => beep(784, 0.18), 110); };
const bad = () => beep(196, 0.25, 'triangle', 0.1);
function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, '').replace(/▲/g, ''));
    u.rate = 0.95; u.lang = 'en-GB';
    speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
// Quest Browser may have no speech voices; then the button is left out rather than doing nothing.
let voicesReady = false;
function checkVoices() { try { voicesReady = 'speechSynthesis' in window && speechSynthesis.getVoices().length > 0; } catch (e) { voicesReady = false; } return voicesReady; }
checkVoices();
try { speechSynthesis.addEventListener('voiceschanged', () => { const had = voicesReady; if (checkVoices() !== had && STEPS[state.step] && !['flatten', 'quiz', 'flood'].includes(state.step)) go(state.step); }); } catch (e) { /* no speech */ }
const readBtn = () => (voicesReady ? { label: '🔊 Read to me', style: 'quiet', onClick: () => speak(fill(ui.title) + '. ' + fill(ui.body)) } : null);

// ---------- Animations ----------
const tweens = [];
function tween(dur, fn, done) { const tw = { t0: performance.now(), dur, fn, done }; tweens.push(tw); return tw; }
function runTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    tw.fn(e);
    if (k >= 1) { tweens.splice(i, 1); tw.done && tw.done(); }
  }
}

// Vertical stretch of the model: TABLE_EXAG = real 3D model, ~0 = flat map
let exag = TABLE_EXAG;
function setExag(v) { exag = v; terrain.scale.y = v; terrainUniforms.uMapMix.value = THREE.MathUtils.clamp(1 - (v - FLAT) / (TABLE_EXAG * 0.35), 0, 1); }
let isFlat = false;
let flatTween = null;
function flatten(toFlat, dur = 2600, done) {
  if (flatTween) { const i = tweens.indexOf(flatTween); if (i >= 0) tweens.splice(i, 1); }   // never two at once
  const from = exag, to = toFlat ? FLAT : TABLE_EXAG;
  isFlat = toFlat;
  flatTween = tween(dur, e => setExag(from + (to - from) * e), () => { flatTween = null; done && done(); });
}

// Fade to black (for jumping to life size)
const fade = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
fade.renderOrder = 10;
camera.add(fade);
function fadeThrough(mid) {
  tween(450, e => fade.material.opacity = e, () => { mid(); tween(600, e => fade.material.opacity = 1 - e); });
}

// ---------- Table / life-size placement ----------
let lifeSize = false;
function setTableMode() {
  lifeSize = false;
  world.scale.setScalar(TABLE_SCALE);
  world.rotation.set(0, tableYaw, 0);
  world.position.set(0, TABLE_TOP + 0.02, TABLE_Z);
  setExag(isFlat ? FLAT : TABLE_EXAG);
  room.visible = true; outerGround.visible = false;
  scene.background.copy(SKY_TABLE);
  terrainUniforms.uFogNear.value = 1e5; terrainUniforms.uFogFar.value = 2e5;
  terrainUniforms.uBand.value = 0;
  skirtMesh.visible = true;
  placePanelAtTable();
  placeConsoleAtTable();
  aimRings.forEach((m) => (m.visible = false));
  if (!renderer.xr.isPresenting) { camera.position.set(0, 1.75, 1.1); controls.target.set(0, 1.12, -1.0); controls.update(); }
}
// Head pose in the scene. In VR it is taken from this frame's viewer pose and the rig (always fresh,
// even straight after the rig has moved).
function headPosition() {
  const p = new THREE.Vector3();
  if (renderer.xr.isPresenting && input.head.valid) { const h = input.head; rig.updateMatrixWorld(true); return rig.localToWorld(p.set(h.x, h.y, h.z)); }
  if (renderer.xr.isPresenting) renderer.xr.getCamera().getWorldPosition(p); else camera.getWorldPosition(p);
  return p;
}
function headYaw() {
  if (renderer.xr.isPresenting && input.head.valid) return rig.rotation.y + input.head.yaw;
  const q = new THREE.Quaternion();
  (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldQuaternion(q);
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  return e.y;
}
// Viewpoints at real size. "south" looks north at Dombo Hill side-on, so both slopes show in profile.
const VIEWPOINTS = {
  south: { x: PEAK.x, z: 900 },
  summit: { x: PEAK.x, z: PEAK.z },
};
let viewpoint = null;
function setLifeMode(vpName = 'south') {
  lifeSize = true; viewpoint = vpName;
  const vp = VIEWPOINTS[vpName];
  world.scale.setScalar(1);
  isFlat = false; terrain.scale.y = 1; exag = 1; terrainUniforms.uMapMix.value = 0;
  room.visible = false; outerGround.visible = true;
  skirtMesh.visible = false;
  const head = renderer.xr.isPresenting ? headPosition() : new THREE.Vector3(0, 1.6, 0);
  // Turn the land so that map-north is straight ahead of the learner, then put the viewpoint under their feet.
  const yaw = renderer.xr.isPresenting ? headYaw() : 0;
  world.rotation.set(0, yaw, 0);
  const local = new THREE.Vector3(vp.x, T.height(vp.x, vp.z) - H0, vp.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const floorY = rig.position.y;   // raised for a seated learner
  world.position.set(head.x - local.x, floorY - local.y, head.z - local.z);
  scene.background.set(0xcfe3f0);
  terrainUniforms.uFogColor.value.set(0xcfe3f0);
  terrainUniforms.uFogNear.value = 400; terrainUniforms.uFogFar.value = 2400;
  terrainUniforms.uBand.value = 0.7;
  outerGround.material.color.set(0x9fae78);
  // board sits low in front, tilted up like a lectern, so the view of the land stays clear
  const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  panel.rotation.order = 'YXZ';
  panel.position.set(head.x + dir.x * 1.0, floorY + 0.95, head.z + dir.z * 1.0);
  panel.rotation.set(-0.65, yaw, 0);
  // touch buttons 0.45 m in front, at waist height, below the line of sight to the board
  consoleGroup.position.set(head.x + dir.x * 0.42, head.y - 0.5, head.z + dir.z * 0.42);
  consoleGroup.rotation.set(-0.85, yaw, 0, 'YXZ');
  if (!renderer.xr.isPresenting) {   // desktop: board further away so it fits on screen
    panel.position.set(0, 0.92, -1.9); panel.rotation.set(-0.3, 0, 0);
    consoleGroup.position.set(0, 0.62, -0.9); consoleGroup.rotation.set(-0.6, 0, 0, 'YXZ');
    camera.position.set(0, 1.6, 0.01); controls.target.set(0, 1.4, -1); controls.update();
  }
}

// ---------- Pointing at the land ----------
// Heights cached on the model's own grid (from the terrain mesh), sampled bilinearly. Cheap enough
// to test a ray against the land every frame for the live aim ring and fingertip touch.
const GRID_N = RES + 1;
const heightGrid = new Float32Array(GRID_N * GRID_N);
{
  const pos = terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) heightGrid[i] = pos.getY(i);
}
function sampleHeight(x, z) {   // local height (m above H0) at landscape x, z
  const fx = THREE.MathUtils.clamp((x + HALF) / (2 * HALF) * RES, 0, RES - 1e-6);
  const fz = THREE.MathUtils.clamp((z + HALF) / (2 * HALF) * RES, 0, RES - 1e-6);
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i = iz * GRID_N + ix;
  const a = heightGrid[i], b = heightGrid[i + 1], c = heightGrid[i + GRID_N], d = heightGrid[i + GRID_N + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

const _inv = new THREE.Matrix4();
const _ho = new THREE.Vector3(), _hd = new THREE.Vector3(), _hp = new THREE.Vector3();
// Where a ray meets the land. exact=false uses only the cached grid (for per-frame hover).
function hitLand(ray, exact = true) {
  terrain.updateMatrixWorld(true);
  _inv.copy(terrain.matrixWorld).invert();
  const o = _ho.copy(ray.origin).applyMatrix4(_inv);
  // transform direction without normalising (affine): p(t) = o + D t
  const D = _hd.copy(ray.origin).add(ray.direction).applyMatrix4(_inv).sub(o);
  const grid = (p) => sampleHeight(p.x, p.z);
  const real = (p) => T.height(p.x, p.z) - H0;
  const maxT = lifeSize ? 4000 : 6;
  let t = 0, prevT = 0;
  const p = _hp;
  while (t < maxT) {
    p.copy(D).multiplyScalar(t).add(o);
    if (Math.abs(p.x) <= HALF && Math.abs(p.z) <= HALF && p.y <= grid(p)) {
      const yAt = exact ? real : grid;
      let a = prevT, b = t;
      for (let i = 0; i < 18; i++) {
        const m = (a + b) / 2; p.copy(D).multiplyScalar(m).add(o);
        if (p.y <= yAt(p)) b = m; else a = m;
      }
      p.copy(D).multiplyScalar(b).add(o);
      return { x: p.x, z: p.z, world: new THREE.Vector3(p.x, yAt(p), p.z).applyMatrix4(terrain.matrixWorld) };
    }
    prevT = t;
    t += lifeSize ? Math.max(1, t * 0.006) : 0.003;
  }
  return null;
}
let landPointHandler = null;   // set when a task asks the learner to point at the land
function showPointMarker(hit) {
  pointMarker.visible = true;
  pointMarker.position.copy(hit.world);
  const s = lifeSize ? Math.max(1.5, hit.world.distanceTo(headPosition()) * 0.02) : 0.02;
  pointMarker.scale.setScalar(s);
  pointMarker.position.y += lifeSize ? 0.3 : 0.004;
}

// ---------- Lesson steps ----------
const state = { step: 'intro', raises: 0, prediction: null, visited: new Set(), quizIndex: 0, score: 0, answers: [], retry: null, practised: [] };

function highlight(f, on = true) {
  if (!f || !on) { terrainUniforms.uHiOn.value = 0; return; }
  terrainUniforms.uHi.value.set(f.x, f.z, f.r);
  terrainUniforms.uHiOn.value = 1;
}

const AFTER_FLOOD = ['predict', 'flatten', 'features', 'stand', 'onHill', 'summit', 'quizIntro', 'quiz', 'done'];
function go(step) {
  state.step = step;
  if (step !== 'flood') water.visible = false;
  if (AFTER_FLOOD.includes(step)) { terrainUniforms.uReveal.value = MAX_LEVEL; terrainUniforms.uNewGlow.value = 0; }
  landPointHandler = null; pointMarker.visible = false;
  Object.values(letters).forEach(l => l.visible = false);
  if (STEPS[step]) STEPS[step]();
}

const STEPS = {
  intro() {
    pins.visible = false; highlight(null);
    setUI({
      tag: 'Form 2 Geography · Map work', title: 'Reading the Land: Contours and Relief',
      body: '**By the end of this lesson you will be able to:**\n' +
        '1. Explain what a contour line and a contour interval are.\n' +
        '2. Tell a steep slope from a gentle slope on a map.\n' +
        '3. Recognise a hill, plateau, spur, valley, ridge and saddle from contours.\n' +
        '4. Use contours to work out which way a river flows.\n\n' +
        'How to use: {howto} Stay standing or sitting where you are. About 15 minutes.',
      buttons: [readBtn(), { label: 'Start ▶', onClick: () => go('words') }],
    });
  },
  words() {
    setUI({
      tag: 'Key words', title: 'Four words to know first',
      body: '**Relief**: the shape of the land, its highs and lows.\n' +
        '**Contour line**: a line on a map joining places that are at the SAME height above sea level.\n' +
        '**Contour interval**: the difference in height between two lines next to each other. On our map it is 20 m.\n' +
        '**Spot height**: a dot with a number that shows the exact height of one place.\n\n' +
        'Look down at the table: it holds a model of Dombo Hill and the land around it. The arrow marked N on the table shows north, which starts at the far side. You can lean in close to look.\n\n{turn}',
      buttons: [readBtn(), { label: '◀ Back', style: 'quiet', onClick: () => go('intro') }, { label: 'Next ▶', onClick: () => go('flood') }],
    });
  },
  flood() {
    terrainUniforms.uReveal.value = MIN_LEVEL - INTERVAL;
    water.visible = true; waterLevel = H0; water.position.y = 0.2; state.raises = 0;
    revealed = MIN_LEVEL - INTERVAL;
    if (isFlat) flatten(false, 1200);
    renderFlood();
  },
  predict() {
    setUI({
      tag: 'Station 1 · Predict', title: 'Make a prediction',
      body: 'Next, we will squash the model flat so it becomes a map. The contour lines will stay.\n\n' +
        'Look at Dombo Hill. Its east side (right) is steep. Its west side (left) is gentle.\n\n' +
        '**On the flat map, where do you think the contour lines will be CLOSEST together?**',
      buttons: [
        { label: 'East side (steep)', onClick: () => { state.prediction = 'steep'; go('flatten'); } },
        { label: 'West side (gentle)', onClick: () => { state.prediction = 'gentle'; go('flatten'); } },
      ],
    });
  },
  flatten() {
    const right = state.prediction === 'steep';
    flatten(true, 3200, () => {
      if (right) good();
      setUI({
        tag: 'Station 1 · Observe and explain', title: right ? 'Your prediction was right!' : 'Look again at the east side',
        body: (right ? 'Well done. ' : 'The lines are actually closest on the steep east side. ') +
          'On the steep side you climb 20 m in a short distance, so the lines are squeezed together. On the gentle side you must walk much further to climb 20 m, so the lines are far apart.\n\n' +
          '**Lines close together = steep slope. Lines far apart = gentle slope.**\n\n' +
          'Press "Raise the land" and "Flatten" a few times. Watch each line stay in the same place. {squash}',
        buttons: [readBtn(), { label: '⇅ Raise the land', onClick: toggleFlat }, { label: 'Next ▶', onClick: () => go('features') }],
      });
      const tb = ui.buttons.find((b) => b.label.startsWith('⇅'));
      if (tb) { tb.label = isFlat ? '⇅ Raise the land' : '⇅ Flatten to a map'; drawPanel(); }
    });
    setUI({ tag: 'Station 1 · Observe', title: 'Watch the land flatten…', body: 'The hill is being squashed down into a map. Keep your eyes on the lines.', buttons: [] });
  },
  features() {
    pins.visible = true;
    if (isFlat) flatten(false, 1500);
    renderFeatures(null);
  },
  stand() {
    pins.visible = false; highlight(null);
    setUI({
      tag: 'Station 3 · Real size', title: 'Stand in front of Dombo Hill',
      body: 'Now you will stand on the flat land south of Dombo Hill, looking north at it. Everything is real size and NOT stretched. The brown lines are contour lines painted onto the land, one every 20 m of height.\n\n' +
        'Compare the two sides of the hill. Then you can climb to the top.',
      buttons: [readBtn(), { label: 'Skip to the test', style: 'quiet', onClick: () => go('quizIntro') }, { label: 'Take me there ▶', onClick: () => fadeThrough(() => { setLifeMode('south'); go('onHill'); }) }],
    });
  },
  onHill() {
    const base = {
      tag: 'Station 3 · South of Dombo Hill', title: 'Which side is steeper?',
      body: 'Look up at Dombo Hill. West is on your left, east is on your right.\n\n**Point at the STEEPER side of the hill and {select}.** Look at how close the brown lines are on each side.\n\nThe small map beside your buttons shows where you stand (red arrow).',
    };
    const btns = (done) => [readBtn(),
      { label: 'Climb to the summit ▲', style: done ? undefined : 'quiet', onClick: () => fadeThrough(() => { setLifeMode('summit'); go('summit'); }) },
      { label: 'Back to the table', style: 'quiet', onClick: backToTable }];
    setUI({ ...base, buttons: btns(false) });
    landPointHandler = (hit) => {
      showPointMarker(hit);
      const s = T.slopeAt(hit.x, hit.z);
      const run = s > 0.005 ? (1 / s) : Infinity;
      const onHill = Math.hypot(hit.x - PEAK.x, hit.z - PEAK.z) < 520;
      const steep = s > 0.45 && hit.x > PEAK.x && onHill;
      if (steep) good(); else beep(330, 0.12);
      const msg = steep
        ? `Yes! On the east side the land climbs about 1 m for every ${run.toFixed(1)} m you walk. That is steep, so the brown lines are squeezed close together.`
        : (!onHill
          ? 'That spot is not on Dombo Hill. Point higher up, at the hill in front of you.'
          : (hit.x <= PEAK.x
            ? `That is the west side. It climbs only about 1 m for every ${isFinite(run) ? run.toFixed(1) : 'many'} m, so its lines are far apart. It is the gentle side. Try the other side.`
            : `That part is fairly gentle (1 m up for every ${run.toFixed(1)} m). Point a little higher on the east side, where the lines are closest.`));
      setUI({ ...base, body: msg, buttons: btns(steep) });
    };
  },
  summit() {
    setUI({
      tag: 'Station 3 · Summit', title: 'On top of Dombo Hill: ' + Math.round(PEAK.h) + ' m',
      body: 'Look all the way round. The land falls away on EVERY side. That is why a hill shows on a map as closed rings, with the smallest ring at the top.\n\n' +
        'Ahead and a little to your left (north-west) you can see the small kopje. The low dip between you and it is the saddle.\n\nFrom up here the steep east face drops out of sight, which is one reason map readers use contours, not just their eyes.',
      buttons: [readBtn(), { label: '◀ Back down to the plain', style: 'quiet', onClick: () => fadeThrough(() => { setLifeMode('south'); go('onHill'); }) },
        { label: 'Back to the table ▶', onClick: backToTable }],
    });
  },
  quizIntro() {
    pins.visible = false; highlight(null);
    if (!isFlat) flatten(true, 1800);
    terrainUniforms.uGrid.value = 1;
    setUI({
      tag: 'Check your understanding', title: `Map test: ${QUIZ.length} questions`,
      body: 'The model is now a flat topographical map, just like the maps in your exam. Some questions ask you to choose an answer. Others ask you to POINT at the map.\n\nYou get feedback after each question.',
      buttons: [readBtn(), { label: 'Begin the test ▶', onClick: () => { state.quizIndex = 0; state.score = 0; state.answers = []; state.retry = null; state.practised = []; go('quiz'); } }],
    });
  },
  quiz() { renderQuestion(); },
  done() {
    highlight(null);
    const s = state.score, n = QUIZ.length;
    const wrong = state.answers.filter(a => !a.ok).map(a => '• ' + a.topic);
    setUI({
      tag: 'Lesson complete', title: `You scored ${s} out of ${n}`,
      body: (s === n ? 'Excellent: full marks!\n\n' : s >= n - 2 ? 'Good work.\n\n' : 'Keep practising.\n\n') +
        (wrong.length ? '**Look again at:**\n' + wrong.join('\n') + '\n\n' : '') +
        ((state.practised || []).length ? `**Practised again:** ${state.practised.map(a => a.topic + (a.ok ? ' ✔' : ' ✘')).join(', ')}\n\n` : '') +
        '**Say these rules out loud, or explain them to a partner:**\n' +
        'Close lines = steep. Far apart = gentle. Closed rings = hill. V pointing uphill = valley. V pointing downhill = spur. Rivers flow from high contours to low ones.',
      buttons: [readBtn(), { label: '↺ Try the test again', onClick: () => go('quizIntro') }, { label: '⌂ Start lesson again', style: 'quiet', onClick: () => { terrainUniforms.uGrid.value = 0; go('intro'); } }],
    });
    showPageResult(s, n, state.answers.filter(a => !a.ok).map(a => a.topic));
  },
};

function toggleFlat() {
  flatten(!isFlat, 2200);
  const b = ui.buttons.find(b => b.label.startsWith('⇅'));
  if (b) { b.label = isFlat ? '⇅ Raise the land' : '⇅ Flatten to a map'; drawPanel(); }
}

function backToTable() {
  fadeThrough(() => { setTableMode(); go('quizIntro'); });
}

// Station 1: flooding the model to draw contours
function renderFlood() {
  const drawn = Math.max(0, Math.round((terrainUniforms.uReveal.value - MIN_LEVEL) / INTERVAL) + 1);
  const allDone = waterLevel >= MAX_LEVEL;
  const enough = state.raises >= 5;
  setUI({
    tag: 'Station 1 · Make contour lines', title: allDone ? 'All the contour lines are drawn' : 'Flood the land',
    body: allDone
      ? 'The water has covered every height up to ' + MAX_LEVEL + ' m. Each shoreline it left behind is a contour line. Each line joins places at the same height, 20 m apart.'
      : 'Imagine a flood. The edge of the water (the shoreline) touches the land at ONE height all the way round. That shoreline is a contour line.\n\n' +
        '{lift} Watch each new shoreline turn into a line.\n\n' +
        `**Water level: ${waterLevel} m.   Contour lines drawn: ${drawn} of ${LEVELS}.**`,
    buttons: allDone
      ? [readBtn(), { label: 'Next ▶', onClick: () => go('predict') }]
      : [readBtn(), { label: '▲ Raise water 20 m', onClick: raiseWater },
         { label: enough ? 'Fill the rest ▶▶' : `Raise ${5 - state.raises} more`, enabled: enough, style: 'quiet', onClick: fillRest }],
  });
}
let raising = false;
function raiseWater() {
  if (raising || filling) return;
  raising = true;
  const base = Math.max(waterLevel, revealed);
  const from = water.position.y - 0.2 + H0, to = Math.min(MAX_LEVEL, (base < MIN_LEVEL ? MIN_LEVEL : base + INTERVAL));
  tween(900, e => { water.position.y = (from + (to - from) * e) - H0 + 0.2; }, () => {
    waterLevel = to; state.raises++;
    revealed = Math.max(revealed, to);
    terrainUniforms.uReveal.value = revealed;
    terrainUniforms.uNewLevel.value = to;
    tween(1400, e => terrainUniforms.uNewGlow.value = 1 - e * 0.6);
    beep(440 + (to - 960) * 2, 0.12);
    raising = false;
    if (waterLevel >= MAX_LEVEL) drainThen(); else renderFlood();
  });
}
let filling = false;
function fillRest() {
  if (filling || raising) return;
  filling = true;
  const from = water.position.y - 0.2 + H0;
  tween(2200, e => {
    const lvl = from + (MAX_LEVEL - from) * e;
    water.position.y = lvl - H0 + 0.2;
    revealed = Math.max(revealed, Math.floor(lvl / INTERVAL) * INTERVAL);
    terrainUniforms.uReveal.value = revealed;
  }, () => { filling = false; waterLevel = MAX_LEVEL; revealed = MAX_LEVEL; terrainUniforms.uReveal.value = MAX_LEVEL; drainThen(); });
}
function drainThen() {
  const from = water.position.y;
  terrainUniforms.uNewGlow.value = 0;
  tween(1200, e => water.position.y = from + ((H0 - 30 - H0) - from) * e, () => { water.visible = false; renderFlood(); });
}

// Station 2: exploring landforms
function selectFeature(id) {
  const f = F[id];
  state.visited.add(id);
  pinObjs.forEach(p => p.head.material.color.setHex(state.visited.has(p.f.id) ? 0x2e9a44 : 0xd9462b));
  highlight(f);
  beep(587, 0.08);
  renderFeatures(f);
}
function renderFeatures(f) {
  const n = state.visited.size;
  setUI({
    tag: `Station 2 · Landforms (${n} of ${FEATURES.length} explored)`,
    title: f ? `${f.n}. ${f.name}` : 'Find the landforms',
    body: f
      ? `**On a map:** ${f.map}\n\n**On the land:** ${f.land}\n\nFlatten the model to see this pattern as a map, then raise it again. Then pick another pin.`
      : 'Eight red pins stand on the model. {touchPin} to learn about the landform there. The land under it will glow.\n\nUse "Flatten to a map" to compare the real shape with its contour pattern.',
    buttons: [readBtn(), { label: isFlat ? '⇅ Raise the land' : '⇅ Flatten to a map', onClick: toggleFlat },
      { label: n >= FEATURES.length ? 'Next ▶' : `Next (${n}/${FEATURES.length}) ▶`, style: n >= FEATURES.length ? undefined : 'quiet', onClick: () => { highlight(null); go('stand'); } }],
  });
}

// ---------- The test ----------
const QUIZ = [
  { topic: 'Steep and gentle slopes', letters: ['A', 'B', 'C', 'D'],
    q: 'Look at the red letters on the map. Which letter marks the STEEPEST slope?',
    options: ['A', 'B', 'C', 'D'], answer: 0,
    why: 'At A, on the east side of Dombo Hill, the contour lines are packed closest together. The land rises many metres over a short distance.', show: 'steep' },
  { topic: 'Contour interval',
    q: 'Find the thick lines marked 1100 and 1200 (they are west of the summit). Count the thin lines between them. What is the contour interval?',
    options: ['10 m', '20 m', '25 m', '50 m'], answer: 1,
    why: 'There are 4 thin lines between 1100 and 1200, which makes 5 equal gaps. 100 m ÷ 5 = 20 m. Every 5th line (each 100 m) is drawn thicker.' },
  { topic: 'Saddle', point: 'saddle',
    q: 'POINT at the map: find the SADDLE, the low dip between Dombo Hill and the smaller hill to its north-west. {touchLand}',
    why: 'The saddle is where the two sets of rings face each other, like an hourglass. It is lower than both hilltops.' },
  { topic: 'Valleys and spurs', letters: ['E'],
    q: 'At letter E the contour lines bend into a V that points UPHILL (towards higher ground). What landform is at E?',
    options: ['A valley', 'A spur', 'A ridge', 'A plateau'], answer: 0,
    why: 'A V pointing uphill shows a valley. Here the Chenga River flows along it. (A spur is the opposite: its V points downhill.)', show: 'valley' },
  { topic: 'River direction',
    q: 'Look at the spot heights along the Chenga River (the blue line) and the north arrow. Which way does the river flow?',
    options: ['From north to south', 'From south to north', 'From east to west', 'It does not flow'], answer: 0,
    why: `Rivers flow downhill, from high to low. The river starts near ${Math.round(T.height(420, -930))} m in the north and leaves the map at about ${Math.round(T.height(870, 930))} m in the south. Also, the contour Vs along it point north, upstream.`, show: 'valley' },
  { topic: 'Hills and spot heights', point: 'hill',
    q: 'POINT at the map: find the HIGHEST point of the land shown. {touchLand}',
    why: `The highest point is the top of Dombo Hill, inside the smallest closed ring. It is marked with a trig station: ▲ ${Math.round(PEAK.h)} m.` },
  { topic: 'Finding a valley', point: 'valley', accept: (h) => (T.riverInfo(h.x, h.z).d < 90 && h.z < 150) || Math.hypot(h.x - F.valley.x, h.z - F.valley.z) <= F.valley.r,
    q: 'POINT at the map: find a VALLEY, where the contours make a V that points uphill. {touchLand}',
    why: 'The Chenga River runs along a valley in the north-east. Its contours bend into Vs that point upstream, towards higher ground.' },
  { topic: 'Finding a spur', point: 'spur', accept: (h) => Math.hypot(h.x - F.spur.x, h.z - F.spur.z) <= 150,
    q: 'POINT at the map: find a SPUR, a tongue of high land where the contours bend into a V that points DOWNHILL. {touchLand}',
    why: 'South of Dombo Hill the contours bulge out into a V pointing downhill, away from the hill. That tongue of land is a spur.' },
  { topic: 'Finding a ridge', point: 'ridge', accept: (h) => { const a = 15 * Math.PI / 180, dx = h.x - 720, dz = h.z + 450; const u = dx * Math.sin(a) - dz * Math.cos(a), v = dx * Math.cos(a) + dz * Math.sin(a); return Math.abs(v) < 100 && Math.abs(u) < 420; },
    q: 'POINT at the map: find a RIDGE, a long narrow strip of high land. {touchLand}',
    why: 'Nhete Ridge in the north-east shows as long, narrow loops of contour lines.' },
  { topic: 'Finding a plateau', point: 'plateau', accept: (h) => Math.hypot(h.x - F.plateau.x, h.z - F.plateau.z) <= 230,
    q: 'POINT at the map: find a PLATEAU, high land with a flat top. {touchLand}',
    why: 'Tafura Plateau in the south-west has lines packed close round its edge and a wide empty space on top.' },
  { topic: 'Reading heights', point: 'hill', accept: (h) => T.height(h.x, h.z) > 1100,
    q: 'POINT at the map: find any place that is HIGHER than 1100 m. Use the thick 1100 m contour line. {touchLand}',
    why: 'Anywhere inside the 1100 m contour ring around Dombo Hill is higher than 1100 m.' },
  { topic: 'Explaining contour spacing',
    q: 'A friend asks: "Why are contour lines close together on a steep slope?" Choose the best explanation.',
    options: [
      'The land climbs many metres over a short distance, so you cross many 20 m levels quickly.',
      'Steep land is always higher than gentle land.',
      'Map makers draw the lines closer to warn people about danger.',
      'Rivers push the contour lines together.',
    ], answer: 0, layout: 'column',
    why: 'Each line is one 20 m step in height. On a steep slope you pass many steps in a short distance, so the lines crowd together.' },
];

// After the last question, each missed question is asked once more as practice (not scored).
function quizOrder() { return [...QUIZ.keys(), ...(state.retry || [])]; }
function renderQuestion() {
  const order = quizOrder();
  const i = state.quizIndex;
  if (i === QUIZ.length && !state.retry) {
    state.retry = state.answers.map((a, k) => (a.ok ? -1 : k)).filter((k) => k >= 0);
    if (state.retry.length) {
      setUI({ tag: `Score ${state.score} of ${QUIZ.length}`, title: 'Practise the ones you missed',
        body: `You missed ${state.retry.length} question${state.retry.length > 1 ? 's' : ''}. Try each one again now. These do not change your score.`,
        buttons: [readBtn(), { label: 'Try them again ▶', onClick: () => renderQuestion() }, { label: 'Skip to my score', style: 'quiet', onClick: () => go('done') }] });
      state.quizIndex = QUIZ.length; state.retryStarted = true;
      return;
    }
  }
  if (i >= order.length) { go('done'); return; }
  const Q = QUIZ[order[i]];
  const practice = i >= QUIZ.length;
  highlight(null);
  (Q.letters || []).forEach(L => letters[L].visible = true);
  const tag = practice ? `Practice ${i - QUIZ.length + 1} of ${state.retry.length}` : `Question ${i + 1} of ${QUIZ.length}  ·  Score ${state.score}`;
  if (Q.point) {
    setUI({ tag, title: Q.topic, body: Q.q, buttons: [readBtn()] });
    landPointHandler = (hit) => {
      showPointMarker(hit);
      if (Q.accept) {
        const ok = Q.accept(hit);
        const hgt = Math.round(T.height(hit.x, hit.z));
        answerQuestion(ok, Q, ok ? `That spot is ${hgt} m high.` : `That spot is ${hgt} m high, and not on the right kind of land.`);
        return;
      }
      const f = F[Q.point];
      const d = Math.hypot(hit.x - f.x, hit.z - f.z);
      const tol = Q.point === 'hill' ? 90 : 150;
      answerQuestion(d <= tol, Q, d <= tol ? null : `You pointed ${Math.round(d)} m away from it.`);
    };
  } else {
    const opts = Q.options.map((o, k) => ({ label: (Q.layout === 'column' ? String.fromCharCode(65 + k) + '.  ' : '') + o, onClick: () => answerQuestion(k === Q.answer, Q, null, k) }));
    setUI({ tag, title: Q.topic, body: Q.q, buttons: opts, layout: Q.layout || 'row' });
  }
}

function answerQuestion(ok, Q, extra, chosen) {
  landPointHandler = null;
  const practice = state.quizIndex >= QUIZ.length;
  if (ok) { if (!practice) state.score++; good(); } else bad();
  if (practice) state.practised.push({ topic: Q.topic, ok }); else state.answers.push({ topic: Q.topic, ok });
  const f = Q.show ? F[Q.show] : (Q.point ? F[Q.point] : null);
  if (f) highlight(f);
  const i = state.quizIndex;
  const correctText = Q.options ? `The answer is: ${Q.options[Q.answer]}. ` : '';
  const more = i + 1 < quizOrder().length || (i + 1 === QUIZ.length && !state.retry && state.answers.some((a) => !a.ok));
  setUI({
    tag: practice ? 'Practice' : `Question ${i + 1} of ${QUIZ.length}  ·  Score ${state.score}`,
    title: ok ? '✔ Correct' : '✘ Not quite',
    body: (ok ? '' : correctText) + (extra ? extra + ' ' : '') + Q.why + (f && !ok ? '\n\nThe glowing ring shows where it is.' : ''),
    buttons: [readBtn(), { label: more ? 'Next question ▶' : 'See my score ▶', onClick: () => { state.quizIndex++; go('quiz'); } }],
  });
}

// ---------- Input: hands and controllers (shared/xr-input.js), and the mouse ----------
const raycaster = new THREE.Raycaster();
function pickUI(ray) {
  raycaster.ray.copy(ray);
  const objs = interactables.filter(i => i.enabled()).map(i => i.obj);
  const hits = raycaster.intersectObjects(objs, false);
  if (!hits.length) return null;
  const h = hits[0];
  return { item: interactables.find(i => i.obj === h.object), hit: h };
}
function onSelect(ray) {
  const p = pickUI(ray);
  if (p) { p.item.onSelect(p.hit); return; }
  if (landPointHandler) {
    const h = hitLand(ray);
    if (h) landPointHandler(h);
  }
}
// What a pointer's ray is on: a board/console button or pin ('ui'), or the land during a pointing task.
function pickRay(ray) {
  const p = pickUI(ray);
  if (p) return { kind: 'ui', item: p.item, hit: p.hit, point: p.hit.point, distance: p.hit.distance };
  if (landPointHandler) {
    const h = hitLand(ray, false);
    if (h) return { kind: 'land', land: h, point: h.world, distance: h.world.distanceTo(ray.origin) };
  }
  return null;
}

// Live aim rings: show where a ray meets the land before the learner commits (one per pointer).
const aimRings = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 6, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, depthTest: false, transparent: true, opacity: 0.9 }));
  m.renderOrder = 6; m.visible = false; m.raycast = () => {};
  scene.add(m);
  return m;
});
function placeRing(m, world) {
  m.visible = true;
  m.position.copy(world);
  const s = lifeSize ? Math.max(1.5, world.distanceTo(headPosition()) * 0.02) : 0.016;
  m.scale.setScalar(s);
  m.position.y += lifeSize ? 0.3 : 0.004;
}

const hoverItems = [null, null, null];
function setHover(i, item, hit) {
  if (hoverItems[i] && hoverItems[i] !== item) hoverItems[i].onHover(null, i);
  if (item) item.onHover(hit, i);
  hoverItems[i] = item;
}

// Turntable: pinch the model's wooden rim (or grip it) and drag sideways to turn the model.
const turn = { active: null, startAngle: 0, startYaw: 0 };
const modelAngle = (p) => Math.atan2(-(p.z - TABLE_Z), p.x);
function rimDistance(pt) {
  if (lifeSize || !room.visible) return Infinity;
  const dx = pt.x, dz = pt.z - TABLE_Z;
  const c = Math.cos(tableYaw), sn = Math.sin(tableYaw);
  const lx = c * dx - sn * dz, lz = sn * dx + c * dz;
  const h = TABLE_SIZE / 2 + 0.018;
  const ax = Math.abs(lx), az = Math.abs(lz);
  const outside = Math.hypot(Math.max(ax - h, 0), Math.max(az - h, 0));
  const edge = ax <= h && az <= h ? h - Math.max(ax, az) : outside;
  const dy = pt.y - (TABLE_TOP + 0.03);
  return Math.hypot(edge, Math.max(0, Math.abs(dy) - 0.06));
}
function setTableYaw(y) {
  tableYaw = y;
  turnGroup.rotation.y = y;
  if (!lifeSize) world.rotation.y = y;
}

const input = createXRInput({
  renderer, scene, camera, parent: rig,
  pickRay,
  onRaySelect: (p, hit) => {
    if (hit.kind === 'ui') hit.item.onSelect(hit.hit);
    else if (hit.kind === 'land' && landPointHandler) { const h = hitLand(p.worldRay); if (h) landPointHandler(h); }
  },
  onRayHover: (p, hit) => {
    setHover(p.index, hit && hit.kind === 'ui' ? hit.item : null, hit && hit.hit);
    if (hit && hit.kind === 'land') placeRing(aimRings[p.index], hit.point); else aimRings[p.index].visible = false;
  },
  extraNear: (p) => nearLand(p),
  rayLength: () => (lifeSize ? 30 : 3),
  sound: () => {},
  onKindChange: () => drawPanel(),
});
const hud = createDebugHud({ renderer, camera, input });
// console buttons are poked
const pokes = consoleBtns.map((rec, i) => input.addPokable(rec.g, { onPress: () => pressConsole(i), enabled: () => rec.g.visible && consoleGroup.visible }));
// pins are touched
pinObjs.forEach((rec) => input.addTouchable(rec.head, { radius: 0.02, onTouch: () => selectFeature(rec.f.id), enabled: () => pins.visible && !lifeSize }));
// the rim is pinched and dragged
input.addNearTarget(rim, {
  distance: rimDistance, highlight: false,
  onPinch: (p) => { turn.active = p; turn.startAngle = modelAngle(p.pinchPoint); turn.startYaw = tableYaw; beep(520, 0.05); },
  onDrag: (p) => {
    let d = modelAngle(p.pinchPoint) - turn.startAngle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    setTableYaw(turn.startYaw + d);
  },
  onRelease: () => { turn.active = null; },
});

// ---------- Handles on the table corners (hands and controllers) ----------
// Blue: lift the flood water yourself (G5). Green: squash the land between model and map (G6).
const HANDLE_BASE = TABLE_TOP + 0.02;
const WATER_K = TABLE_SCALE * TABLE_EXAG;         // world metres of knob travel per metre of water
const SQUASH_TRAVEL = 0.25;
function makeHandle(color, x, z, travel) {
  const g = new THREE.Group();
  g.position.set(x, HANDLE_BASE, z);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, travel + 0.03, 8), new THREE.MeshLambertMaterial({ color: 0x444444 }));
  rod.position.y = (travel + 0.03) / 2;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  const knobMat = new THREE.MeshLambertMaterial({ color, emissive: 0x000000 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 18, 12), knobMat);
  g.add(rod, foot, knob);
  g.visible = false;
  room.add(g);
  return { g, knob, knobMat, travel, dragging: null };
}
const waterHandle = makeHandle(0x2f7fc1, -0.565, TABLE_Z + 0.42, (MAX_LEVEL - H0) * WATER_K);
const squashHandle = makeHandle(0x3a9a4a, 0.565, TABLE_Z + 0.42, SQUASH_TRAVEL);
// tick marks every 20 m on the water handle's rod, so each step reads as a contour level
{
  const ticks = new THREE.Group();
  for (let L = MIN_LEVEL; L <= MAX_LEVEL; L += INTERVAL) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(L % 100 === 0 ? 0.03 : 0.018, 0.0015, 0.003), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    t.position.set(0, (L - H0) * WATER_K, 0);
    ticks.add(t);
  }
  waterHandle.g.add(ticks);
}
function handleFrac(h, p) { return THREE.MathUtils.clamp((p.pinchPoint.y - HANDLE_BASE - h.grabOffset) / h.travel, 0, 1); }
function bindHandle(h, onMove) {
  input.addNearTarget(h.knob, {
    enabled: () => h.g.visible,
    onPinch: (p) => { h.dragging = p; h.grabOffset = p.pinchPoint.y - h.knob.getWorldPosition(new THREE.Vector3()).y; beep(520, 0.05); },
    onDrag: (p) => onMove(handleFrac(h, p)),
    onRelease: () => { h.dragging = null; },
  });
}
// water: the level follows the knob; each 20 m crossed for the first time leaves its contour
let revealed = MIN_LEVEL - INTERVAL;
bindHandle(waterHandle, (f) => {
  if (state.step !== 'flood' || raising || filling || waterLevel >= MAX_LEVEL) return;
  const lvl = H0 + f * (MAX_LEVEL - H0);
  water.position.y = lvl - H0 + 0.2;
  waterNow = lvl;
  let crossed = false;
  while (revealed + INTERVAL <= lvl && revealed < MAX_LEVEL) {
    revealed += INTERVAL;
    if (revealed < MIN_LEVEL) continue;
    crossed = true;
    state.raises++;
    terrainUniforms.uReveal.value = revealed;
    terrainUniforms.uNewLevel.value = revealed;
    terrainUniforms.uNewGlow.value = 1;
    beep(440 + (revealed - 960) * 2, 0.12);
  }
  if (crossed) tween(1400, e => terrainUniforms.uNewGlow.value = 1 - e * 0.6);
  if (crossed) {
    waterLevel = Math.max(waterLevel, revealed);
    if (revealed >= MAX_LEVEL) { waterHandle.dragging = null; drainThen(); }
    else renderFlood();
  }
});
// squash: the knob sets the vertical stretch directly
bindHandle(squashHandle, (f) => {
  if (lifeSize) return;
  if (flatTween) { const i = tweens.indexOf(flatTween); if (i >= 0) tweens.splice(i, 1); flatTween = null; }
  setExag(FLAT + f * (TABLE_EXAG - FLAT));
  const flatNow = f < 0.5;
  if (flatNow !== isFlat) {
    isFlat = flatNow;
    const tb = ui.buttons.find((b) => b.label.startsWith('⇅'));
    if (tb) { tb.label = isFlat ? '⇅ Raise the land' : '⇅ Flatten to a map'; drawPanel(); }
  }
});
let waterNow = H0;
function updateHandles() {
  waterHandle.g.visible = !lifeSize && state.step === 'flood' && water.visible && waterLevel < MAX_LEVEL;
  squashHandle.g.visible = !lifeSize && (state.step === 'flatten' || state.step === 'features') && !flatTween;
  if (!waterHandle.dragging) waterNow = water.position.y - 0.2 + H0;
  waterHandle.knob.position.y = THREE.MathUtils.clamp((waterNow - H0) * WATER_K, 0, waterHandle.travel);
  if (!squashHandle.dragging) squashHandle.knob.position.y = (exag - FLAT) / (TABLE_EXAG - FLAT) * SQUASH_TRAVEL;
  for (const h of [waterHandle, squashHandle]) {
    const near = h.g.visible && input.pointers.some((p) => p.tipOk && (h.dragging === p || h.knob.getWorldPosition(_tl).distanceTo(p.pinchPoint) < input.TUNING.grabRadius + 0.024));
    h.knobMat.emissive.setHex(h.dragging ? 0x555555 : near ? 0x333333 : 0x000000);
  }
}

// Touching the land with a fingertip answers a "point at the map" task (table model only).
const landTouch = [{ armed: true }, { armed: true }];
const _tl = new THREE.Vector3();
function landGapAt(tip) {   // fingertip height above the model surface (world metres), or null if off the model
  _tl.copy(tip).applyMatrix4(_inv.copy(terrain.matrixWorld).invert());
  if (Math.abs(_tl.x) > HALF || Math.abs(_tl.z) > HALF) return null;
  return (_tl.y - sampleHeight(_tl.x, _tl.z)) * world.scale.y * terrain.scale.y;
}
function nearLand(p) {
  if (lifeSize || !(landPointHandler || pins.visible)) return false;
  const g = landGapAt(p.tip);
  return g !== null && g < input.TUNING.nearRadius;
}
function updateLandTouch() {
  for (const p of input.pointers) {
    const st = landTouch[p.index];
    const g = (p.tipOk && !lifeSize) ? landGapAt(p.tip) : null;
    if (g === null || g > 0.03) { st.armed = true; continue; }
    // A finger already resting on the land when a question appears must lift first.
    if (!landPointHandler) { st.armed = false; continue; }
    if (st.armed && g < p.tipRadius + 0.004) {
      st.armed = false;
      _tl.set(_tl.x, sampleHeight(_tl.x, _tl.z), _tl.z);
      const world3 = _tl.clone().applyMatrix4(terrain.matrixWorld);
      input.haptic(p, 0.6, 30);
      landPointHandler({ x: _tl.x, z: _tl.z, world: world3 });
    }
  }
}
function updateRimGlow() {
  const near = !lifeSize && input.pointers.some((p) => p.tipOk && (turn.active === p || rimDistance(p.pinchPoint) < input.TUNING.grabRadius));
  rimMaterial.color.setHex(turn.active ? 0xe0a040 : near ? 0xc78a3e : 0x8a5a2b);
}

// Mouse (desktop)
const mouse = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;  // was a drag
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  onSelect(raycaster.ray.clone());
});
renderer.domElement.addEventListener('pointermove', e => {
  mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});

// ---------- Main loop ----------
const _nm = new THREE.Matrix3();
function placeLabels() {
  for (const L of labels) {
    const hLocal = L.hLocal;
    if (L.kind === 'pin') {
      L.obj.position.set(L.x, hLocal * terrain.scale.y, L.z);
      L.obj.scale.setScalar(1 / world.scale.x);
      continue;
    }
    L.obj.position.set(L.x, hLocal * terrain.scale.y + L.lift / world.scale.x, L.z);
    if (L.kind === 'map' || L.kind === 'names') L.obj.visible = !lifeSize;
    if (!L._s0) L._s0 = L.obj.scale.clone();
    L.obj.scale.copy(L._s0).multiplyScalar(1 / world.scale.x);
  }
}
for (const L of labels) L.hLocal = T.height(L.x, L.z) - H0;

renderer.setAnimationLoop((now) => {
  runTweens(now);
  terrainUniforms.uTime.value = now / 1000;
  world.updateMatrixWorld(true);
  terrainUniforms.uNormalWorld.value.getNormalMatrix(terrain.matrixWorld);
  placeLabels();
  input.update();
  updateHandles();
  updateMiniMap();
  if (renderer.xr.isPresenting) { updateLandTouch(); updateRimGlow(); }
  else {
    raycaster.setFromCamera(mouse, camera);
    const p = pickUI(raycaster.ray);
    setHover(2, p ? p.item : null, p && p.hit);
    controls.update();
    renderer.domElement.style.cursor = p ? 'pointer' : (landPointHandler ? 'crosshair' : 'grab');
  }
  renderer.render(scene, camera);
  hud.update();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Enter VR button ----------
const enterBtn = document.getElementById('enter');
async function setupVR() {
  let ok = false;
  try { ok = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch (e) { ok = false; }
  if (!ok) {
    enterBtn.textContent = 'VR not available here (desktop mode)';
    enterBtn.disabled = true;
    return;
  }
  enterBtn.textContent = 'Enter VR';
  enterBtn.disabled = false;
  let session = null;
  enterBtn.onclick = async () => {
    if (session) { session.end(); return; }
    try {
      session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      session.addEventListener('end', () => {
        session = null; enterBtn.textContent = 'Enter VR';
        rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
        if (lifeSize) { setTableMode(); go('quizIntro'); } else setTableMode();
      });
      await renderer.xr.setSession(session);
      enterBtn.textContent = 'Exit VR';
    } catch (e) {
      enterBtn.textContent = 'Could not start VR: ' + (e.message || e);
    }
  };
}
setupVR();

// Start in front of the learner (and again when they recentre the headset): head 0.2 m behind the
// table's near edge, facing the model. At real size the land is placed again around the head.
input.onRecenter((head) => {
  input.setLiftFromHead(head);
  input.placeRig(rig, 0, 0, 0);
  if (lifeSize && viewpoint) { rig.updateMatrixWorld(true); camera.updateMatrixWorld(true); setLifeMode(viewpoint); }
});

// The test result stays on the web page after leaving VR, so a teacher can note it.
function showPageResult(score, n, missed) {
  const el = document.getElementById('result'); if (!el) return;
  el.hidden = false;
  el.innerHTML = `<b>Map test: ${score} out of ${n}</b>` + (missed.length ? '<br>Look again at: ' + missed.join(', ') : '<br>Full marks.');
}

setTableMode();
renderMiniMap();
go('intro');
document.getElementById('loading').remove();

// Exposed for automated tests only
window.__lesson = { state, go, STEPS, QUIZ, FEATURES, F, PEAK, SADDLE, raiseWater, fillRest, selectFeature, toggleFlat, onSelect,
  hitLand, setLifeMode, setTableMode, get ui() { return ui; }, btnRects, panel, camera, renderer, terrain, LEVELS, MAX_LEVEL,
  input, rig, world, consoleBtns, consoleGroup, pressConsole, panelTex, pinObjs, rim, rimDistance, setTableYaw, get tableYaw() { return tableYaw; },
  sampleHeight, THREE, get lifeSize() { return lifeSize; }, get waterLevel() { return waterLevel; },
  __waterHandle: waterHandle, __squashHandle: squashHandle, __miniMap: miniMap };
window.__lp = (h) => landPointHandler && landPointHandler(h);
