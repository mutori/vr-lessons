// Orbit Command: an A-Level (Form 5) physics VR game on gravitational fields and circular motion.
// Four missions: Field Probe (g = GM/r², φ = −GM/r), Into Orbit (gravity provides the centripetal force),
// Geostationary (T = 24 h, equatorial, eastward) and Escape Velocity (energy: ½mv² − GMm/r ≥ 0).
// Runs in the Meta Quest Browser (hands or controllers) and on a computer.
import {
  THREE, scene, camera, renderer, input, mat, basic, glowMat, mesh, noHit, sig, board, textSprite, arrow,
  actionButton, toaster, quiz, sfx, tween, wait, onFrame, start, words, view, onKindChange, clamp,
  setEnvironment, glowSprite, fx, shockwave, celebrate, lever, toggle, grabbable, beacon, ambience, easeOut,
  canvasPlane, roundRect, time as _t, slider,
} from './kit.js';

const V3 = THREE.Vector3;
void _t;

// ---------------------------------------------------------------- physical data (as on a ZIMSEC data sheet)
const G = 6.67e-11, M = 6.00e24, R = 6.40e6, GM = G * M;
const DAY = 24 * 3600;
const g0 = GM / (R * R);                                  // 9.77 N/kg
const R_GEO = Math.cbrt(GM * DAY * DAY / (4 * Math.PI * Math.PI));   // 4.23 × 10⁷ m
const H_GEO_KM = (R_GEO - R) / 1000;                       // about 35 900 km
const V_ESC = Math.sqrt(2 * GM / R);                       // 11.2 km/s from the surface
const DATA_LINES = [
  { t: 'G = 6.67 × 10⁻¹¹ N m² kg⁻²', size: 32, color: '#cfe3ff' },
  { t: 'Mass of Earth  M = 6.00 × 10²⁴ kg', size: 32, color: '#cfe3ff' },
  { t: 'Radius of Earth  R = 6.40 × 10⁶ m', size: 32, color: '#cfe3ff' },
];
// one colour language across the games
const COL = { gravity: 0xff5a5a, velocity: 0x3ddc84, need: 0xffd34d, field: 0x5fb0ff, accent: 0x5fd1ff, gold: 0xffc94d };

// ---------------------------------------------------------------- procedural noise (for clouds, sky, moon)
function makeNoise(seed = 1) {
  const P = new Uint8Array(512), r = (() => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const V = new Float32Array(256); for (let i = 0; i < 256; i++) V[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  // value noise, periodic in x with period px (so equirectangular maps wrap round)
  function n2(x, y, px) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
    const h = (a, b) => V[P[(P[a & 255] + b) & 255]];
    const a = h(x0, yi), b = h(x1, yi), c = h(x0, yi + 1), d = h(x1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  return function fbm(x, y, px, oct = 5) {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < oct; o++) { s += amp * n2(x * f, y * f, px * f); amp *= 0.5; f *= 2; }
    return s;
  };
}
const fbm = makeNoise(7);

// ---------------------------------------------------------------- space: sky, sun, moon, lights
scene.background = new THREE.Color(0x01030a);
setEnvironment({ top: 0x1a2a4a, horizon: 0x0b1220, bottom: 0x05070c, panels: [{ pos: [6, 3, 2], w: 3, h: 3, color: 0xfff1d6, intensity: 8 }, { pos: [-4, 1, -3], w: 3, h: 2, color: 0x4f7dd6, intensity: 1.2 }], intensity: 0.9 });
const hemi = new THREE.HemisphereLight(0x9fb8ff, 0x0b0d14, 0.55);
scene.add(hemi);
const SUN_DIR = new V3(6, 3, 2).normalize();
const sunLight = new THREE.DirectionalLight(0xfff3e0, 3.0);         // key light
sunLight.position.copy(SUN_DIR).multiplyScalar(10);
scene.add(sunLight);
const rimLight = new THREE.DirectionalLight(0x6f9cff, 1.1);          // cool back / rim light
rimLight.position.set(-4, 2, -6);
scene.add(rimLight);
view.desktopPos.set(0, 0.15, 0.85);
view.desktopPitch = -0.3;
ambience('space');

(function sky() {
  // a painted sky sphere: deep blue-black, the Milky Way band with dust lanes, and faint stars
  const W = 2048, H = 1024, w = 1024, h = 512;
  const band = document.createElement('canvas'); band.width = w; band.height = h;
  const bx = band.getContext('2d');
  const img = bx.createImageData(w, h);
  const n = new V3(0.25, 0.9, 0.35).normalize();            // galactic pole
  for (let y = 0; y < h; y++) {
    const lat = (0.5 - y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * Math.PI * 2;
      const dx = Math.cos(lat) * Math.cos(lon), dy = Math.sin(lat), dz = Math.cos(lat) * Math.sin(lon);
      const gd = dx * n.x + dy * n.y + dz * n.z;
      const b = Math.exp(-((gd / 0.22) ** 2));
      const cloud = fbm(x / 40, y / 40, w / 40, 5);
      const dust = fbm(x / 18 + 50, y / 18, w / 18, 4);
      let v = b * Math.max(0, cloud * 1.5 - 0.35) * (1 - 0.8 * Math.max(0, dust - 0.45) * 3 * Math.exp(-((gd / 0.08) ** 2)));
      const neb = Math.max(0, fbm(x / 70 + 9, y / 70 + 3, w / 70, 4) - 0.55) * 2.2;
      const i = (y * w + x) * 4;
      img.data[i] = 6 + 120 * v + 70 * neb; img.data[i + 1] = 9 + 110 * v + 20 * neb; img.data[i + 2] = 20 + 150 * v + 90 * neb; img.data[i + 3] = 255;
    }
  }
  bx.putImageData(img, 0, 0);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.drawImage(band, 0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    const px = Math.random() * W, py = Math.random() * H;
    const a = Math.pow(Math.random(), 3);
    x.fillStyle = `rgba(${200 + 55 * Math.random()},${210 + 45 * Math.random()},255,${0.25 + 0.75 * a})`;
    x.fillRect(px, py, a > 0.8 ? 2 : 1, a > 0.8 ? 2 : 1);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const skyM = mesh(new THREE.SphereGeometry(160, 48, 24), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  skyM.renderOrder = -10;
  scene.add(noHit(skyM));
  // brighter stars as points with a little colour
  const N = 700, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 120;
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
    const t = Math.random(), b = 0.6 + Math.random() * 0.4;
    col.set(t < 0.15 ? [b, b * 0.8, b * 0.6] : t < 0.35 ? [b * 0.75, b * 0.85, b] : [b, b, b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(noHit(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.32, vertexColors: true, sizeAttenuation: true, toneMapped: false, transparent: true, depthWrite: false }))));
  // the Sun: a hot core and a wide halo (fake bloom)
  const sunPos = SUN_DIR.clone().multiplyScalar(140);
  const core = glowSprite(0xfff6e0, 14, 1); core.position.copy(sunPos);
  const halo = glowSprite(0xffd9a0, 60, 0.35); halo.position.copy(sunPos);
  const halo2 = glowSprite(0xff9f60, 130, 0.12); halo2.position.copy(sunPos);
  scene.add(core, halo, halo2);
  // the Moon
  const mc = document.createElement('canvas'); mc.width = 512; mc.height = 256;
  const mx = mc.getContext('2d');
  const mi = mx.createImageData(512, 256);
  for (let y = 0; y < 256; y++) for (let xx = 0; xx < 512; xx++) {
    const v = fbm(xx / 30, y / 30, 512 / 30, 5), mare = fbm(xx / 90 + 4, y / 90, 512 / 90, 3) > 0.55 ? 0.6 : 1;
    const k = (0.45 + 0.5 * v) * mare * 255, i = (y * 512 + xx) * 4;
    mi.data[i] = k; mi.data[i + 1] = k * 0.98; mi.data[i + 2] = k * 0.95; mi.data[i + 3] = 255;
  }
  mx.putImageData(mi, 0, 0);
  for (let i = 0; i < 60; i++) { const r = 2 + Math.random() * 9; const px = Math.random() * 512, py = Math.random() * 256; mx.strokeStyle = 'rgba(40,40,40,0.35)'; mx.lineWidth = 1.5; mx.beginPath(); mx.arc(px, py, r, 0, Math.PI * 2); mx.stroke(); }
  const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
  const moon = mesh(new THREE.SphereGeometry(1.6, 32, 20), new THREE.MeshStandardMaterial({ map: mt, roughness: 1, metalness: 0 }), -26, 14, -32);
  scene.add(noHit(moon));
})();

// ---------------------------------------------------------------- the station deck and console
const deck = new THREE.Group();
scene.add(deck);
{
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#2a323d'; x.fillRect(0, 0, 1024, 1024);
  // metal plates
  for (let i = 0; i < 260; i++) { const px = Math.random() * 1024, py = Math.random() * 1024; x.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; x.fillRect(px, py, 60 + Math.random() * 120, 60 + Math.random() * 120); }
  x.strokeStyle = 'rgba(10,14,20,0.8)'; x.lineWidth = 4;
  for (let r = 120; r < 520; r += 110) { x.beginPath(); x.arc(512, 512, r, 0, Math.PI * 2); x.stroke(); }
  for (let a = 0; a < 16; a++) { const t = a / 16 * Math.PI * 2; x.beginPath(); x.moveTo(512 + Math.cos(t) * 120, 512 + Math.sin(t) * 120); x.lineTo(512 + Math.cos(t) * 512, 512 + Math.sin(t) * 512); x.stroke(); }
  // hazard ring
  x.save(); x.beginPath(); x.arc(512, 512, 500, 0, Math.PI * 2); x.arc(512, 512, 470, 0, Math.PI * 2, true); x.clip();
  for (let a = 0; a < 80; a++) { x.fillStyle = a % 2 ? '#d9a81c' : '#15181d'; x.beginPath(); x.moveTo(512, 512); x.arc(512, 512, 520, a / 80 * Math.PI * 2, (a + 1) / 80 * Math.PI * 2); x.fill(); }
  x.restore();
  // emblem
  x.fillStyle = 'rgba(95,209,255,0.12)'; x.beginPath(); x.arc(512, 512, 100, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(160,220,255,0.35)'; x.font = '800 34px system-ui'; x.textAlign = 'center'; x.fillText('ORBIT COMMAND', 512, 300);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  deck.add(mesh(new THREE.CylinderGeometry(1.45, 1.5, 0.08, 64), [mat(0x3a4552, { metalness: 0.8, roughness: 0.35 }), mat(0xffffff, { map: t, metalness: 0.55, roughness: 0.5 }), mat(0x1a2029)], 0, -0.04, 0));
  const glowRing = mesh(new THREE.TorusGeometry(1.46, 0.008, 8, 96), basic(COL.accent), 0, 0.004, 0);
  glowRing.rotation.x = Math.PI / 2;
  deck.add(glowRing);
  // railing behind and beside the learner (the front is left open for the view)
  const railM = mat(0x9aa7b5, { metalness: 0.9, roughness: 0.25 });
  const rail = mesh(new THREE.TorusGeometry(1.38, 0.016, 10, 80, Math.PI * 1.35), railM, 0, 1.0, 0);
  rail.rotation.set(Math.PI / 2, 0, Math.PI / 2 - Math.PI * 1.35 / 2 + Math.PI);
  deck.add(rail);
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 + Math.PI - Math.PI * 1.35 / 2 + (i / 8) * Math.PI * 1.35;
    deck.add(mesh(new THREE.CylinderGeometry(0.012, 0.016, 1.0, 10), railM, Math.cos(a) * 1.38, 0.5, -Math.sin(a) * 1.38));
  }
  const strip = mesh(new THREE.TorusGeometry(1.38, 0.006, 6, 80, Math.PI * 1.35), basic(COL.accent), 0, 0.96, 0);
  strip.rotation.copy(rail.rotation);
  deck.add(strip);
  noHit(deck);
}

const consoleDesk = new THREE.Group();
consoleDesk.position.set(0, 0, -0.44);
scene.add(consoleDesk);
{
  const metal = mat(0x1c2530, { metalness: 0.8, roughness: 0.3 });
  consoleDesk.add(noHit(mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.82, 24), metal, 0, 0.41, -0.06)));
  consoleDesk.add(noHit(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.03, 32), metal, 0, 0.015, -0.06)));
  consoleDesk.add(noHit(mesh(new THREE.TorusGeometry(0.2, 0.005, 6, 48), basic(COL.accent), 0, 0.032, -0.06).rotateX(Math.PI / 2)));
}
export const panel = new THREE.Group();      // the sloped top: buttons and controls live here
panel.position.set(0, 1.0, 0.0);
panel.rotation.x = -0.7;
consoleDesk.add(panel);
{
  const slab = mesh(new THREE.BoxGeometry(1.14, 0.46, 0.035), mat(0x121a24, { metalness: 0.75, roughness: 0.28 }), 0, 0, -0.03);
  panel.add(noHit(slab));
  const tc = document.createElement('canvas'); tc.width = 1024; tc.height = 392;
  const g = tc.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 392); grd.addColorStop(0, '#16222f'); grd.addColorStop(1, '#0b121b');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 392);
  g.strokeStyle = 'rgba(95,209,255,0.07)'; g.lineWidth = 1;
  for (let x = 0; x <= 1024; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 392); g.stroke(); }
  for (let y = 0; y <= 392; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
  g.strokeStyle = 'rgba(95,209,255,0.22)'; g.lineWidth = 3; g.strokeRect(14, 14, 996, 364);
  g.fillStyle = 'rgba(95,209,255,0.35)'; g.font = '700 18px system-ui, sans-serif'; g.fillText('ZIMSAT-1  FLIGHT CONSOLE', 30, 372);
  for (let i = 0; i < 4; i++) { g.beginPath(); g.arc([30, 994, 30, 994][i], [30, 30, 362, 362][i], 5, 0, 7); g.fill(); }
  const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const inset = mesh(new THREE.PlaneGeometry(1.1, 0.42), mat(0xffffff, { map: tex, metalness: 0.35, roughness: 0.55 }), 0, 0, -0.012);
  panel.add(noHit(inset));
  for (const y of [0.23, -0.23]) panel.add(noHit(mesh(new THREE.BoxGeometry(1.14, 0.006, 0.006), basic(COL.accent), 0, y, -0.012)));
  for (const x of [0.57, -0.57]) panel.add(noHit(mesh(new THREE.BoxGeometry(0.006, 0.46, 0.006), basic(COL.accent), x, 0, -0.012)));
}

// boards: left = mission and questions, right = live readouts (about 30° either side, easy to read)
const info = board(0.96, 0.8);
info.position.set(-0.9, 1.52, -1.05); info.rotation.y = 0.66;
scene.add(info);
const data = board(0.96, 0.8);
data.position.set(0.9, 1.52, -1.05); data.rotation.y = -0.66;
scene.add(data);
const toastHolder = new THREE.Group();
toastHolder.position.set(0, 2.05, -1.35);
scene.add(toastHolder);
const toast = toaster(toastHolder, 0.95, 0.13);
const hint = beacon(COL.accent);

const answerGroup = new THREE.Group();
answerGroup.position.set(-0.08, -0.02, 0.001);
panel.add(answerGroup);
const Q = quiz({ textBoard: info, answerGroup, w: 0.3, h: 0.1, gapX: 0.34, gapY: 0.13, toast });

const menuBtn = actionButton('Menu', 0.15, 0.065, () => openMenu(), { bg: '#4b5d6e', size: 28 });
menuBtn.position.set(0.47, 0.16, 0);
panel.add(menuBtn);
const restartBtn = actionButton('Restart', 0.15, 0.065, () => current && startMission(missions.indexOf(current)), { bg: '#4b5d6e', size: 28, name: 'Restart this mission' });
restartBtn.position.set(0.47, 0.08, 0);
panel.add(restartBtn);

// ---------------------------------------------------------------- the Earth hologram
const sys = new THREE.Group();          // orbital (equatorial) plane = local xz, tilted towards the learner
sys.position.set(0, 1.3, -1.9);
sys.rotation.x = 0.55;
scene.add(sys);
const earth = new THREE.Group();        // scaled so that 1 unit = 1 Earth radius
sys.add(earth);
let S = 0.3 / R;                        // display metres per real metre (set per mission)
earth.scale.setScalar(0.3);
// projector on the deck: the Earth is a hologram, which is why it can zoom
const projector = new THREE.Group();
scene.add(projector);
{
  projector.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 40), mat(0x1c2530, { metalness: 0.8, roughness: 0.3 }), 0, 0.03, 0));
  projector.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.004, 40), basic(0x2a8fd6), 0, 0.062, 0));
  const beam = mesh(new THREE.CylinderGeometry(0.05, 0.2, 1, 32, 1, true).translate(0, -0.5, 0), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float t; varying vec2 vUv; void main(){ float a = 0.09 * (1.0 - vUv.y) * (0.7 + 0.3 * sin(vUv.y * 40.0 - t * 4.0)); gl_FragColor = vec4(0.3, 0.7, 1.0, 1.0) * a; }',
  }));
  beam.name = 'beam';
  projector.add(beam);
  projector.userData.beam = beam;
  noHit(projector);
}
function placeProjector() {
  projector.position.set(sys.position.x, 0, sys.position.z);
  const b = projector.userData.beam;
  b.position.y = sys.position.y - 0.05;
  b.scale.y = Math.max(0.1, sys.position.y - 0.12);
  b.material.uniforms.t.value += 0.016;
}

function lonLatToUnit(lon, lat, out = new V3()) {     // matches SphereGeometry's uv mapping
  const phi = (lon + 180) / 360 * Math.PI * 2, b = lat * Math.PI / 180;
  return out.set(-Math.cos(phi) * Math.cos(b), Math.sin(b), Math.sin(phi) * Math.cos(b));
}
function unitToLonLat(v) {
  const b = Math.asin(clamp(v.y / v.length(), -1, 1));
  const phi = Math.atan2(v.z, -v.x);
  let lon = phi / (Math.PI * 2) * 360 - 180;
  if (lon < -180) lon += 360;
  return { lon, lat: b * 180 / Math.PI };
}
const HARARE = { lon: 31.05, lat: -17.83 };

// NASA Blue Marble (day) and Earth at Night images, both public domain; clouds made in code.
const texLoader = new THREE.TextureLoader();
const dayTex = texLoader.load('./assets/earth-day.jpg'); dayTex.colorSpace = THREE.SRGBColorSpace; dayTex.anisotropy = 8;
const nightTex = texLoader.load('./assets/earth-night.jpg'); nightTex.colorSpace = THREE.SRGBColorSpace;
const cloudTex = (() => {
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), img = x.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(0.5 - y / h) * 2;
    const belt = 0.75 + 0.35 * Math.cos(lat * Math.PI * 2.2);      // storm belts, clearer subtropics
    for (let xx = 0; xx < w; xx++) {
      const v = fbm(xx / 64, y / 64, w / 64, 6) * belt;
      const k = clamp((v - 0.5) * 3.2, 0, 1) * 255, i = (y * w + xx) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  return t;
})();
const earthMat = new THREE.ShaderMaterial({
  uniforms: { day: { value: dayTex }, night: { value: nightTex }, clouds: { value: cloudTex }, sun: { value: SUN_DIR.clone() }, cloudShift: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform sampler2D day, night, clouds; uniform vec3 sun; uniform float cloudShift;
    varying vec2 vUv; varying vec3 vN; varying vec3 vW;
    void main(){
      vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW); vec3 L = normalize(sun);
      float d = dot(N, L);
      float lit = smoothstep(-0.12, 0.25, d);
      vec3 c = texture2D(day, vUv).rgb;
      float ocean = smoothstep(0.01, 0.05, c.b - max(c.r, c.g * 0.9));
      float cl = texture2D(clouds, vec2(vUv.x + cloudShift, vUv.y)).r; cl *= smoothstep(0.02, 0.12, vUv.y) * smoothstep(0.98, 0.88, vUv.y);
      vec3 dayCol = c * (0.08 + 1.35 * max(d, 0.0));
      vec3 H = normalize(L + V);
      dayCol += vec3(1.0, 0.92, 0.8) * pow(max(dot(N, H), 0.0), 70.0) * ocean * 1.2 * step(0.0, d);
      dayCol = mix(dayCol, vec3(0.95, 0.97, 1.0) * (0.06 + 1.1 * max(d, 0.0)), cl * 0.8);
      float nl = texture2D(night, vUv).r;
      vec3 nightCol = vec3(1.0, 0.72, 0.38) * pow(nl, 1.6) * 1.8 * (1.0 - cl * 0.75) + c * 0.025;
      vec3 col = mix(nightCol, dayCol, lit);
      float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      col += vec3(0.3, 0.6, 1.0) * fr * (0.15 + 0.95 * smoothstep(-0.3, 0.5, d));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const earthMesh = mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
earth.add(noHit(earthMesh));
// atmosphere: a back-faced shell that glows at the limb, brighter on the sunny side
const atmoMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
  uniforms: { sun: { value: SUN_DIR.clone() } },
  vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vW;
    void main(){ vec3 V = normalize(cameraPosition - vW); float k = pow(abs(dot(normalize(vN), V)), 2.2) * 1.4;
      float s = 0.2 + smoothstep(-0.35, 0.5, dot(normalize(vN), normalize(sun)));
      gl_FragColor = vec4(vec3(0.3, 0.62, 1.0) * k * s, 1.0);
      #include <colorspace_fragment>
    }`,
});
earth.add(noHit(mesh(new THREE.SphereGeometry(1.085, 64, 40), atmoMat)));

// Harare: a glowing pin, a pulsing ring and a tracking dish (sized in metres; scale undoes the Earth's)
const harareN = lonLatToUnit(HARARE.lon, HARARE.lat);
const pin = new THREE.Group();
pin.add(mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.04, 8).translate(0, 0.02, 0), basic(0xffffff)));
pin.add(mesh(new THREE.SphereGeometry(0.008, 14, 10), basic(0xff3b30), 0, 0.042, 0));
const pinGlow = glowSprite(0xff5040, 0.05, 0.8); pinGlow.position.y = 0.042; pin.add(pinGlow);
const pinRing = mesh(new THREE.RingGeometry(0.012, 0.016, 32).rotateX(-Math.PI / 2), glowMat(0xff6a50, { side: THREE.DoubleSide }));
pin.add(pinRing);
const dish = new THREE.Group();            // a small dish that turns to face the satellite
dish.position.y = 0.012;
{
  const pts = []; for (let i = 0; i <= 10; i++) { const r = i / 10 * 0.016; pts.push(new THREE.Vector2(r, r * r * 18)); }
  const bowl = mesh(new THREE.LatheGeometry(pts, 20).rotateX(Math.PI / 2), mat(0xf2f4f7, { side: THREE.DoubleSide, metalness: 0.2, roughness: 0.4 }));
  const feed = mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.014, 6).rotateX(Math.PI / 2).translate(0, 0, 0.008), basic(0x888888));
  dish.add(bowl, feed);
}
pin.add(dish);
pin.position.copy(harareN);
pin.quaternion.setFromUnitVectors(new V3(0, 1, 0), harareN);
earth.add(noHit(pin));
const harareLabel = textSprite('Harare', { size: 0.028 });
harareLabel.position.copy(harareN).multiplyScalar(1.3);
harareLabel.userData.base = harareLabel.scale.clone();
earth.add(harareLabel);
function keepMarkerSizes(t) {
  const k = 1 / earth.scale.x;
  pin.scale.setScalar(k);
  harareLabel.scale.copy(harareLabel.userData.base).multiplyScalar(k);
  const p = (t * 0.8) % 1;
  pinRing.scale.setScalar(1 + p * 2.5); pinRing.material.opacity = 1 - p;
}

// ---------------------------------------------------------------- satellite and rocket models
function foilTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c99a3a'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,160' : '120,80,20'},${Math.random() * 0.35})`; x.beginPath(); x.moveTo(Math.random() * 128, Math.random() * 128); for (let k = 0; k < 3; k++) x.lineTo(Math.random() * 128, Math.random() * 128); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cellTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c8ccd4'; x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    const gr = x.createLinearGradient(0, j * 32, 0, j * 32 + 30); gr.addColorStop(0, '#1d3a8a'); gr.addColorStop(1, '#0d1f55');
    x.fillStyle = gr; x.fillRect(i * 32 + 2, j * 32 + 2, 28, 28);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const FOIL = foilTexture(), CELLS = cellTexture();
function makeSatellite() {
  const g = new THREE.Group();
  const body = new THREE.Group();          // dish (+z) points at Earth once lookAt is used
  body.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.036), mat(0xffffff, { map: FOIL, metalness: 0.85, roughness: 0.32 })));
  const wingM = mat(0xffffff, { map: CELLS, metalness: 0.5, roughness: 0.3, emissive: 0x0a1640, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    body.add(mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.02, 6).rotateZ(Math.PI / 2), mat(0xaaaaaa, { metalness: 0.9 }), s * 0.025, 0, 0));
    body.add(mesh(new THREE.BoxGeometry(0.06, 0.0015, 0.03), wingM, s * 0.065, 0, 0));
  }
  const pts = []; for (let i = 0; i <= 8; i++) { const r = i / 8 * 0.013; pts.push(new THREE.Vector2(r, r * r * 30)); }
  const dishM = mesh(new THREE.LatheGeometry(pts, 18).rotateX(-Math.PI / 2), mat(0xf4f4f4, { side: THREE.DoubleSide, roughness: 0.4 }), 0, 0, 0.026);
  body.add(dishM);
  body.add(mesh(new THREE.ConeGeometry(0.008, 0.012, 12).rotateX(Math.PI / 2), mat(0x444a52, { metalness: 0.8 }), 0, 0, -0.024));
  const red = glowSprite(0xff3030, 0.02, 1); red.position.set(-0.095, 0, 0);
  const green = glowSprite(0x30ff60, 0.02, 1); green.position.set(0.095, 0, 0);
  const flame = glowSprite(0xff9a3c, 0.06, 0); flame.position.set(0, 0, -0.04);
  body.add(red, green, flame);
  g.add(body);
  g.userData = { body, red, green, flame };
  noHit(g);
  return g;
}
function satTick(sat, t, burn = 0) {
  const u = sat.userData;
  const on = (t * 1.2) % 1 < 0.12;
  u.red.material.opacity = on ? 1 : 0.1; u.green.material.opacity = on ? 0.1 : 1;
  u.flame.material.opacity = burn * (0.7 + 0.3 * Math.random());
  u.flame.scale.setScalar(0.05 + 0.05 * burn * Math.random());
}
const _ec = new V3();
function faceEarth(sat) { sys.updateWorldMatrix(true, false); sys.getWorldPosition(_ec); sat.lookAt(_ec); }

// A glowing trail that fades with age (in the parent's display units).
function trail(color, n = 2400, parent = sys) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const line = new THREE.Line(g, material);
  line.frustumCulled = false;
  noHit(line);
  parent.add(line);
  const c = new THREE.Color(color);
  let count = 0, bright = 1;
  const recolor = () => {
    for (let i = 0; i < count; i++) { const k = bright * (0.15 + 0.85 * Math.pow(i / Math.max(1, count - 1), 0.6)); col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
    g.attributes.color.needsUpdate = true;
  };
  return {
    line,
    clear() { count = 0; g.setDrawRange(0, 0); },
    push(v) {
      if (count >= n) { pos.copyWithin(0, 3); count = n - 1; }
      pos[count * 3] = v.x; pos[count * 3 + 1] = v.y; pos[count * 3 + 2] = v.z;
      count++;
      g.attributes.position.needsUpdate = true;
      g.setDrawRange(0, count);
      recolor();
    },
    setColor(cc, b = 1) { c.set(cc); bright = b; recolor(); },
    copyFrom(o) { pos.set(o.line.geometry.attributes.position.array); count = o.line.geometry.drawRange.count; g.attributes.position.needsUpdate = true; g.setDrawRange(0, count); recolor(); },
  };
}

// ---------------------------------------------------------------- progress (stars) saved in this browser
const STORE = 'orbit-command-v2';
let stars = [0, 0, 0, 0];
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (Array.isArray(s)) stars = [0, 1, 2, 3].map((i) => s[i] | 0); } catch { /* storage blocked */ }
function saveStars(i, n) {
  stars[i] = Math.max(stars[i], n);
  try { localStorage.setItem(STORE, JSON.stringify(stars)); } catch { /* storage blocked */ }
}
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ---------------------------------------------------------------- mission framework
let current = null;
const missions = [];
function setView({ rDisp, pos = [0, 1.3, -1.9], tilt = 0.55 }, dur = 0.9) {
  const from = earth.scale.x, p0 = sys.position.clone(), t0 = sys.rotation.x, p1 = new V3(...pos);
  S = rDisp / R;
  return tween(dur, (k) => { earth.scale.setScalar(from + (rDisp - from) * k); sys.position.lerpVectors(p0, p1, k); sys.rotation.x = t0 + (tilt - t0) * k; });
}
function hideAllMissionThings() {
  for (const m of missions) { m.controls.visible = false; m.world.visible = false; }
  Q.cancel();
  toast.hide();
  hint.hide();
}
function startMission(i) {
  sfx.whoosh();
  hideAllMissionThings();
  current = missions[i];
  menuGroup.visible = false;
  restartBtn.visible = true;
  current.controls.visible = true;
  doneGroup.visible = false;
  current.world.visible = true;
  setView(current.view);
  current.enter();
}
function finishMission(m, n, lines = []) {
  saveStars(missions.indexOf(m), n);
  m.controls.visible = false;
  Q.cancel();
  hint.hide();
  celebrate(new V3(0, 1.75, -1.3), { stars: n });
  const i = missions.indexOf(m);
  info.userData.draw([
    { t: `Mission complete  ${starText(n)}`, size: 46, bold: true, color: '#ffd34d', gap: 16 },
    ...lines,
    { rule: true },
    i < missions.length - 1 ? { t: `Next: Mission ${i + 2}, ${missions[i + 1].short}. Use the green button on the console.`, size: 32, color: '#9fe2bf' }
      : { t: 'You have finished all four missions. Well done, Mission Controller!', size: 34, color: '#9fe2bf' },
  ], { title: m.title });
  doneGroup.visible = true;
  nextBtn.visible = i < missions.length - 1;
  nextBtn.userData.next = i + 1;
  if (nextBtn.visible) hint.show(nextBtn, [0, 0.08, 0.02]);
}
const doneGroup = new THREE.Group();
panel.add(doneGroup);
doneGroup.visible = false;
const nextBtn = actionButton('Next mission', 0.3, 0.1, () => startMission(nextBtn.userData.next), { bg: '#1e8449', size: 30 });
nextBtn.position.set(-0.1, 0, 0);
doneGroup.add(nextBtn);
const againBtn = actionButton('Play again', 0.22, 0.1, () => current && startMission(missions.indexOf(current)), { bg: '#4b5d6e', size: 28 });
againBtn.position.set(0.2, 0, 0);
doneGroup.add(againBtn);
const askIf = (m) => (o) => (current === m ? Q.ask(o) : Promise.resolve(true));

// A short countdown on the toast with beeps.
async function countdown(m) {
  for (const n of [3, 2, 1]) { toast(`${n}`, 'info', 0); sfx.beep(1); await wait(0.28); if (current !== m) return false; }
  sfx.beep(0);
  return true;
}

// ---------------------------------------------------------------- menu
const menuGroup = new THREE.Group();
panel.add(menuGroup);
const missionButtons = [];
function openMenu() {
  hideAllMissionThings();
  doneGroup.visible = false;
  current = null;
  menuGroup.visible = true;
  restartBtn.visible = false;
  setView({ rDisp: 0.4 });
  missionButtons.forEach((b, i) => b.userData.draw(`${i + 1}. ${missions[i].short}\n${starText(stars[i])}`));
  const next = stars.findIndex((s) => s === 0);
  hint.show(missionButtons[next < 0 ? 0 : next], [0, 0.1, 0.02]);
  drawWelcome();
  drawDataSheet();
}
function drawWelcome() {
  const w = words();
  info.userData.draw([
    { t: 'Form 5 · Gravitational fields and circular motion', size: 32, color: '#9fb6cc', gap: 14 },
    { t: 'You are the controller for ZimSat-1, a new Zimbabwean satellite. Learn how Earth\'s field behaves, then put the satellite where it needs to go.', size: 33, gap: 14 },
    { t: '1. Field Probe: how g changes with distance.', size: 31, color: '#cfe3ff' },
    { t: '2. Into Orbit: launch at exactly the right speed.', size: 31, color: '#cfe3ff' },
    { t: '3. Geostationary: park it over Zimbabwe for good.', size: 31, color: '#cfe3ff' },
    { t: '4. Escape Velocity: how fast to leave Earth for ever?', size: 31, color: '#cfe3ff', gap: 14 },
    { rule: true },
    { t: input.kind === 'hand' ? 'Touch buttons with a fingertip. Pinch things that glow to grab, turn or push them. For far things, point and pinch.'
      : input.kind === 'controller' ? 'Touch buttons with the controller tip, or point and pull the trigger. Hold the trigger on a lever or object to move it.'
        : 'Click buttons. Drag levers, knobs and glowing objects. Drag the background to look around.', size: 29, color: '#ffd34d' },
    { t: `Choose a mission on the console (${w.select} it).`, size: 29, color: '#ffd34d' },
  ], { title: 'Orbit Command' });
}
function drawDataSheet() {
  data.userData.draw([
    { t: 'Data sheet', size: 38, bold: true, color: '#ffd34d', gap: 10 },
    ...DATA_LINES,
    { rule: true },
    { t: 'Useful equations', size: 34, bold: true, color: '#ffd34d' },
    { t: 'F = GMm / r²        g = GM / r²', size: 32 },
    { t: 'φ = −GM / r          v = rω = 2πr / T', size: 32 },
    { t: 'F = mv² / r = mrω²     Eₚ = −GMm / r', size: 32 },
    { rule: true },
    { t: `Your stars:  ${stars.map((s, i) => `${i + 1} ${starText(s)}`).join('   ')}`, size: 28, color: '#9fe2bf' },
  ], { title: 'Mission control' });
}
onKindChange(() => { if (!current) drawWelcome(); else current.redraw?.(); });

// ================================================================= Mission 1: Field Probe
const RD1 = 0.27;
const m1 = {
  title: 'Mission 1: Field Probe', short: 'Field Probe', view: { rDisp: RD1, pos: [0, 1.3, -1.85], tilt: 0.45 },
  controls: new THREE.Group(), world: new THREE.Group(),
  need: [1, 2, 3, 4], rec: {}, phase: 'probe', rR: 1.5, dir: new V3(1, 0, 0),
};
missions.push(m1);
panel.add(m1.controls); sys.add(m1.world);
{
  // field lines (in 3D) with glowing dots flowing in towards the centre
  const dirs = [];
  for (let i = 0; i < 30; i++) { const y = 1 - (i + 0.5) / 30 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996; dirs.push(new V3(Math.cos(a) * r, y, Math.sin(a) * r)); }
  const lineMat = new THREE.LineBasicMaterial({ color: COL.field, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const fl = new THREE.Group();
  for (const d of dirs) fl.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([d.clone().multiplyScalar(RD1 * 1.03), d.clone().multiplyScalar(RD1 * 5.2)]), lineMat));
  m1.world.add(noHit(fl));
  m1.flowDirs = dirs;
  m1.flow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 8, 6), glowMat(0x9fd0ff, { opacity: 0.9 }), dirs.length * 4);
  m1.flow.frustumCulled = false;
  m1.world.add(noHit(m1.flow));
  // distance rings in the equatorial plane
  for (let k = 1; k <= 5; k++) {
    const ring = mesh(new THREE.TorusGeometry(k * RD1, k === 1 ? 0.0015 : 0.002, 6, 128), glowMat(COL.accent, { opacity: k === 1 ? 0.25 : 0.35 }));
    ring.rotation.x = Math.PI / 2;
    m1.world.add(noHit(ring));
    if (k > 1) { const t = textSprite(`${k}R`, { size: 0.03 }); t.position.set(k * RD1 * Math.cos(-0.5), 0.02, k * RD1 * Math.sin(-0.5) * -1); m1.world.add(t); }
  }
  // equipotential bubble through the probe
  m1.shell = mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { col: { value: new THREE.Color(COL.accent) } },
    vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 col; varying vec3 vN; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(normalize(vN), V)), 3.0); gl_FragColor = vec4(col * (0.03 + 0.5 * f), 1.0); }',
  }));
  m1.world.add(noHit(m1.shell));
  // the probe: grab it and move it anywhere
  m1.probe = new THREE.Group();
  m1.probeCore = mesh(new THREE.OctahedronGeometry(0.022), mat(COL.gold, { emissive: 0xffa000, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 }));
  m1.probeRing = mesh(new THREE.TorusGeometry(0.034, 0.003, 8, 32), mat(0xdfe8f2, { metalness: 0.9, roughness: 0.2 }));
  m1.probe.add(m1.probeCore, m1.probeRing, glowSprite(0xffc040, 0.08, 0.5));
  m1.world.add(m1.probe);
  m1.grab = grabbable(m1.probe, {
    name: 'Field probe (grab and move it)', space: m1.world, haloSize: 0.13,
    enabled: () => m1.phase === 'probe',
    constrain: (l) => { const r = l.length() / RD1; if (r < 1e-6) return null; return l.multiplyScalar(clamp(r, 1.0, 5.0) / r); },
    onGrab: () => { hint.hide(); },
    onMove: () => m1.fromPosition(),
    onRelease: () => { const k = m1.zone(); if (k) { m1.setR(k); sfx.snap(); } },
  });
  m1.gArrow = arrow(COL.gravity, { radius: 0.006, head: 0.028 }).userData.onTop();
  m1.world.add(m1.gArrow);
  m1.probeLabel = textSprite('', { size: 0.034 });
  m1.world.add(m1.probeLabel);

  m1.inBtn = actionButton('Move in', 0.16, 0.08, () => m1.setR(Math.round((m1.rR - 0.1) * 10) / 10), { bg: '#2d4a66', size: 26 });
  m1.outBtn = actionButton('Move out', 0.16, 0.08, () => m1.setR(Math.round((m1.rR + 0.1) * 10) / 10), { bg: '#2d4a66', size: 26 });
  m1.inBtn.position.set(-0.42, 0.06, 0); m1.outBtn.position.set(-0.42, -0.05, 0);
  m1.recordBtn = actionButton('Record reading', 0.3, 0.12, () => m1.record(), { bg: '#1e8449', size: 30 });
  m1.recordBtn.position.set(-0.12, 0.0, 0);
  m1.controls.add(m1.inBtn, m1.outBtn, m1.recordBtn);
}
m1.enter = function () {
  this.rec = {}; this.phase = 'probe';
  this.dir.set(Math.cos(-0.35), 0, -Math.sin(-0.35)).normalize();
  this.setR(1.5, true);
  for (const b of [this.inBtn, this.outBtn, this.recordBtn]) { b.visible = true; b.userData.setOn(true); }
  hint.show(this.probe, [0, 0.07, 0]);
  this.redraw();
};
m1.gAt = (rR) => GM / Math.pow(rR * R, 2);
m1.zone = function () { const k = Math.round(this.rR); return this.need.includes(k) && Math.abs(this.rR - k) <= 0.08 ? k : 0; };
m1.setR = function (rR, silent = false) {
  if (this.phase !== 'probe' && !silent) return;
  this.rR = clamp(rR, 1, 5);
  this.probe.position.copy(this.dir).multiplyScalar(this.rR * RD1);
  this.update();
};
m1.fromPosition = function () {
  const l = this.probe.position;
  this.rR = l.length() / RD1;
  this.dir.copy(l).normalize();
  const z = this.zone();
  if (z && z !== this.lastZone) { sfx.blip(); }
  this.lastZone = z;
  this.update();
};
m1.update = function () {
  const rR = this.rR, g = this.gAt(rR), p = this.probe.position;
  this.gArrow.userData.set(p, this.dir.clone().multiplyScalar(-0.024 * g));
  this.probeLabel.position.copy(p).add(new V3(0, 0.075, 0));
  const z = this.zone();
  this.probeLabel.userData.set(`r = ${rR.toFixed(2)} R\ng = ${g.toFixed(2)} N/kg`, z ? '#ffd34d' : '#ffffff');
  this.shell.scale.setScalar(rR * RD1);
  this.shell.material.uniforms.col.value.set(z ? (this.rec[z] ? 0x3ddc84 : COL.gold) : COL.accent);
  if (this.phase === 'probe') {
    if (z && !this.rec[z]) hint.show(this.recordBtn, [0, 0.1, 0.02]);
    else if (hint.target === this.recordBtn) hint.hide();
  }
  this.drawData();
};
m1.drawData = function () {
  const rR = this.rR, r = rR * R, g = this.gAt(rR), phi = -GM / r;
  const rows = this.need.filter((k) => this.rec[k]).map((k) => ({ k, g: this.rec[k] }));
  const done = rows.length === this.need.length;
  data.userData.draw([
    { t: `Distance from Earth's centre:  r = ${rR.toFixed(2)} R = ${sig(r)} m`, size: 31 },
    { t: `Field strength:  g = GM / r² = ${g.toFixed(2)} N/kg`, size: 34, bold: true, color: '#ff9b9b' },
    { t: `Potential:  φ = −GM / r = ${sig(phi)} J/kg`, size: 31, color: '#cfe3ff' },
    { t: 'The glowing bubble through the probe is an equipotential: φ and g are the same all over it.', size: 26, color: '#9fb6cc' },
    { rule: true },
    { fn: (ctx, x, y, w) => drawGraph(ctx, x, y, w, done ? 300 : 260, rows) },
  ], { title: 'Probe readings' });
};
function drawGraph(ctx, x, y, w, h, rows) {
  const L = x + 70, B = y + h - 40, Wd = w - 90, Ht = h - 60;
  ctx.strokeStyle = '#9fb6cc'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(L, y + 10); ctx.lineTo(L, B); ctx.lineTo(L + Wd, B); ctx.stroke();
  ctx.fillStyle = '#9fb6cc'; ctx.font = '600 26px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let k = 1; k <= 5; k++) ctx.fillText(`${k}R`, L + (k / 5) * Wd, B + 30);
  ctx.save(); ctx.translate(x + 20, y + Ht / 2 + 10); ctx.rotate(-Math.PI / 2); ctx.fillText('g / N kg⁻¹', 0, 0); ctx.restore();
  ctx.textAlign = 'right';
  for (const gv of [0, 5, 10]) ctx.fillText(String(gv), L - 8, B - (gv / 10) * Ht + 8);
  if (rows.length === 4) {
    ctx.strokeStyle = '#ff9b9b'; ctx.lineWidth = 4; ctx.beginPath();
    for (let i = 0; i <= 100; i++) { const rr = 1 + i * 0.04, gx = L + (rr / 5) * Wd, gy = B - (g0 / (rr * rr) / 10) * Ht; i ? ctx.lineTo(gx, gy) : ctx.moveTo(gx, gy); }
    ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('g ∝ 1/r²  (an inverse-square law)', L + 120, y + 40);
  } else { ctx.textAlign = 'left'; ctx.fillStyle = '#9fb6cc'; ctx.font = '600 26px system-ui'; ctx.fillText('Record g at 1R, 2R, 3R and 4R to plot the graph.', L + 20, y + 40); }
  for (const r of rows) {
    const px = L + (r.k / 5) * Wd, py = B - (r.g / 10) * Ht;
    const gl = ctx.createRadialGradient(px, py, 0, px, py, 22); gl.addColorStop(0, 'rgba(255,211,77,0.9)'); gl.addColorStop(1, 'rgba(255,211,77,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
  }
  return y + h;
}
m1.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const w = words();
  const how = input.kind === 'hand' ? 'Pinch the glowing probe and move it with your hand.' : input.kind === 'controller' ? 'Point at the probe, hold the trigger and move it.' : 'Drag the glowing probe with the mouse.';
  const rows = this.need.map((k) => `${k}R`.padEnd(4) + (this.rec[k] ? `   g = ${this.rec[k].toFixed(2)} N/kg    g × r² = ${sig(this.rec[k] * Math.pow(k * R, 2))}` : '   …'));
  info.userData.draw([
    { t: 'The probe measures Earth\'s gravitational field strength g (the force on each kilogram). The red arrow is the pull on it.', size: 31, gap: 10 },
    { t: `${how} Take it to 1R, 2R, 3R and 4R from the centre (the rings). The bubble turns gold when you are there: ${w.select} "Record reading".`, size: 30, color: '#ffd34d', gap: 10 },
    { rule: true },
    { t: 'Your readings', size: 31, bold: true },
    ...rows.map((t) => ({ t, size: 29, color: '#cfe3ff', gap: 4 })),
  ], { title: this.title });
};
m1.record = function () {
  if (this.phase !== 'probe') return;
  const k = this.zone();
  const left = () => this.need.filter((n) => !this.rec[n]);
  if (!k) { sfx.bad(); toast(`The probe is at ${this.rR.toFixed(2)}R. Move it onto a ring: ${left().map((n) => n + 'R').join(', ')}.`, 'warn'); return; }
  if (this.rec[k]) { toast(`${k}R is already recorded. Next: ${left().map((n) => n + 'R').join(', ')}`, 'info', 2); return; }
  this.setR(k);
  this.rec[k] = this.gAt(k);
  sfx.good();
  const wp = this.probe.getWorldPosition(new V3());
  fx.emit(wp, { count: 26, colors: [COL.gold, 0xffffff], speed: 0.35, life: 0.7, size: 0.012 });
  shockwave(wp, { color: COL.gold, size: 0.12, dur: 0.5 });
  toast(left().length ? `Recorded g at ${k}R. Next: ${left().map((n) => n + 'R').join(', ')}` : 'All four recorded. Look at the graph on the right.', 'good', 2.5);
  this.update(); this.redraw();
  if (!left().length) this.questions();
};
m1.questions = async function () {
  this.phase = 'quiz';
  hint.hide();
  this.recordBtn.visible = false; this.inBtn.visible = false; this.outBtn.visible = false;
  await wait(2.5);
  if (current !== this) return;
  this.controls.visible = false;
  const go = askIf(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 3', q: 'Your table shows g at 1R and 2R. When the distance from the centre doubles, g becomes…',
    options: ['half as big', 'a quarter as big', 'an eighth as big', 'the same'], correct: 1,
    explain: 'g = GM/r², so doubling r divides g by 2² = 4: 9.77 → 2.44 N/kg.',
    why: ['That would be g ∝ 1/r. Check your 1R and 2R readings: 9.77 and 2.44.', '', 'That would be 1/r³. Check your 1R and 2R readings.', 'g clearly falls as the probe moves out.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 3', q: 'A satellite is 3R above Earth\'s surface. What is g there? (g at the surface = 9.77 N/kg)',
    options: ['3.26 N/kg', '1.09 N/kg', '0.61 N/kg', '2.44 N/kg'], correct: 2,
    explain: '3R above the surface is r = R + 3R = 4R from the centre, so g = 9.77 / 4² = 0.61 N/kg.',
    why: ['That divides by 3. g goes as 1/r², and r is measured from the centre.', 'That uses r = 3R. Height is measured from the surface; r is measured from the centre: r = 4R.', '', 'That is g at 2R.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 3 of 3', q: 'At the surface the potential is φ = −GM/R = −6.25 × 10⁷ J/kg. What is φ at r = 2R?',
    options: ['−1.56 × 10⁷ J/kg', '−3.13 × 10⁷ J/kg', '−1.25 × 10⁸ J/kg', '+3.13 × 10⁷ J/kg'], correct: 1,
    explain: 'φ = −GM/r goes as 1/r (not 1/r²), so at 2R it is half as negative. It is zero at infinity and negative everywhere else.',
    why: ['That divides by 4. Potential goes as 1/r, not 1/r².', '', 'That doubles it. Potential gets less negative as you move away.', 'Gravitational potential is always negative: it is zero only at infinity.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  finishMission(this, ok === 3 ? 3 : ok === 2 ? 2 : 1, [
    { t: `You answered ${ok} of 3 questions right first time.`, size: 32 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Field strength g = GM/r²: an inverse-square law, with r from the centre.', size: 30 },
    { t: '• Potential φ = −GM/r: work done per kg to bring a mass from infinity. It is negative and goes as 1/r.', size: 30 },
    { t: '• Equipotentials round a planet are spheres, at right angles to the field lines.', size: 30 },
  ]);
};
const _fm = new THREE.Matrix4();
m1.tick = function (dt, t) {
  earth.rotation.y += dt * 0.05;
  // flowing field dots
  let i = 0;
  for (const d of this.flowDirs) for (let k = 0; k < 4; k++) {
    const u = 1 - (((t * 0.12 + k / 4 + d.x * 0.37) % 1) + 1) % 1;
    const r = RD1 * (1.05 + 4.1 * u);
    _fm.makeTranslation(d.x * r, d.y * r, d.z * r);
    this.flow.setMatrixAt(i++, _fm);
  }
  this.flow.instanceMatrix.needsUpdate = true;
  this.probeRing.rotation.x += dt * 1.5; this.probeRing.rotation.y += dt * 0.9;
  this.probeCore.rotation.y += dt * 2;
};

// ================================================================= Mission 2: Into Orbit
const H2 = 400e3;                       // launch height: the ISS's orbit
const r2 = R + H2;
const vCirc2 = Math.sqrt(GM / r2);       // 7.67 km/s
const vEsc2 = Math.sqrt(2 * GM / r2);
const T2 = 2 * Math.PI * r2 / vCirc2;    // about 93 minutes
const WARP2 = T2 / 13;                   // one circular orbit takes 13 s (×4 when fast-forwarding)
const RD2 = 0.48;
const m2 = {
  title: 'Mission 2: Into Orbit', short: 'Into Orbit', view: { rDisp: RD2, pos: [0, 1.32, -1.95], tilt: 0.55 },
  controls: new THREE.Group(), world: new THREE.Group(),
  phase: 'aim', launches: 0, hints: 0, result: null, burn: 0,
  pos: new V3(), vel: new V3(), simT: 0, angle: 0, lastAng: 0,
};
missions.push(m2);
panel.add(m2.controls); sys.add(m2.world);
{
  m2.sat = makeSatellite(); m2.sat.scale.setScalar(1.15); m2.world.add(m2.sat);
  m2.ghost = trail(0x8fa8c0, 3000, m2.world);
  m2.trail = trail(0xffe08a, 3000, m2.world);
  m2.vArrow = arrow(COL.velocity).userData.onTop(); m2.gArrow = arrow(COL.gravity).userData.onTop(); m2.cArrow = arrow(COL.need, { radius: 0.004, head: 0.025 }).userData.onTop();
  m2.world.add(m2.vArrow, m2.gArrow, m2.cArrow);
  m2.vLabel = textSprite('velocity', { size: 0.03, color: '#3ddc84' });
  m2.gLabel = textSprite('gravity', { size: 0.03, color: '#ff8080' });
  m2.world.add(m2.vLabel, m2.gLabel);
  // target orbit: a glowing dashed ring at the launch height
  const pts = [];
  for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; pts.push(new V3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r2 / R * RD2)); }
  m2.guide = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: COL.accent, dashSize: 0.02, gapSize: 0.016, transparent: true, opacity: 0.7, toneMapped: false }));
  m2.guide.computeLineDistances();
  m2.world.add(noHit(m2.guide));
  const gl = textSprite('target: circular orbit, 400 km up', { size: 0.024, color: '#9fe8ff' });
  gl.position.set(0.0, 0.03, -r2 / R * RD2 - 0.03); m2.world.add(gl);

  m2.lever = lever({ name: 'Launch speed', min: 5, max: 12, step: 0.05, fine: 0.01, value: 6, format: (v) => `${v.toFixed(2)} km/s`, ticks: [5, 6, 7, 8, 9, 10, 11, 12],
    onChange: () => { if (m2.phase === 'aim-after') m2.reset(); else m2.drawData(); if (hint.target === m2.lever.group) hint.show(m2.launchBtn, [0, 0.1, 0.02]); }, enabled: () => m2.phase === 'aim' || m2.phase === 'aim-after' });
  m2.lever.group.position.set(-0.4, 0.01, 0);
  m2.controls.add(m2.lever.group);
  m2.launchBtn = actionButton('LAUNCH', 0.22, 0.13, () => m2.launch(), { bg: '#d0392b', size: 36 });
  m2.launchBtn.position.set(-0.13, 0.02, 0);
  m2.resetBtn = actionButton('Reset', 0.15, 0.075, () => m2.reset(), { bg: '#4b5d6e', size: 28 });
  m2.resetBtn.position.set(0.09, 0.1, 0);
  m2.hintBtn = actionButton('Hint', 0.15, 0.075, () => m2.hint(), { bg: '#8e44ad', size: 28 });
  m2.hintBtn.position.set(0.09, 0.01, 0);
  m2.warp = toggle({ labels: ['1×', '4×'], value: 0, name: 'Time speed', w: 0.17, h: 0.07, colors: ['#2c6e91', '#b9770e'] });
  m2.warp.group.position.set(0.1, -0.09, 0);
  m2.controls.add(m2.launchBtn, m2.resetBtn, m2.hintBtn, m2.warp.group);
}
m2.enter = function () {
  this.launches = 0; this.hints = 0; this.result = null;
  this.ghost.clear();
  this.lever.set(6, true); this.warp.set(0, true);
  this.reset();
  hint.show(this.lever.group, [0, 0.2, 0.06]);
};
const TH0 = -3 * Math.PI / 4;           // launch point: front-left of the Earth, as the learner sees it
const POS0 = new V3(Math.cos(TH0), 0, -Math.sin(TH0));
const DIR0 = new V3(-Math.sin(TH0), 0, -Math.cos(TH0));   // eastward
m2.reset = function () {
  this.phase = 'aim';
  this.pos.copy(POS0).multiplyScalar(r2); this.vel.copy(DIR0);
  this.trail.clear(); this.trail.setColor(0xffe08a);
  this.sat.visible = true; this.burn = 0;
  this.lever.setEnabled(); this.launchBtn.userData.setOn(true);
  this.place(); this.redraw(); this.drawData();
};
m2.hint = function () {
  if (this.hints >= 3) { toast('That is all the hints. Use v = √(GM/r).', 'info', 2.5); return; }
  this.hints++; sfx.blip(); this.redraw();
};
m2.place = function () {
  const p = this.pos.clone().multiplyScalar(S);
  this.sat.position.copy(p);
  faceEarth(this.sat);
  const aiming = this.phase === 'aim' || this.phase === 'countdown';
  const v = aiming ? this.lever.value * 1000 : this.vel.length();
  const vdir = aiming ? DIR0.clone() : this.vel.clone().normalize();
  const r = this.pos.length();
  const g = GM / (r * r), need = v * v / r;
  this.vArrow.userData.set(p, vdir.clone().multiplyScalar(v / 1000 * 0.028));
  const inward = this.pos.clone().normalize().negate();
  const side = vdir.clone();
  this.gArrow.userData.set(p.clone().addScaledVector(side, 0.012), inward.clone().multiplyScalar(g * 0.024));
  this.cArrow.visible = aiming || this.phase === 'flying';
  this.cArrow.userData.set(p.clone().addScaledVector(side, -0.012), inward.multiplyScalar(need * 0.024));
  this.vLabel.position.copy(p).addScaledVector(vdir, v / 1000 * 0.028 + 0.05);
  this.gLabel.position.copy(p).addScaledVector(this.pos.clone().normalize(), -0.12).add(new V3(0, 0.05, 0));
  this.vLabel.visible = this.gLabel.visible = aiming;
};
m2.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const hintLines = [
    'Hint 1: for a circular orbit, gravity provides the centripetal force: GMm/r² = mv²/r.',
    `Hint 2: r is measured from Earth's centre: r = R + h = 6.40 × 10⁶ + 4.0 × 10⁵ = ${sig(r2)} m.`,
    `Hint 3: v = √(GM/r) = √(${sig(GM)} / ${sig(r2)}) = ${(vCirc2 / 1000).toFixed(2)} km/s.`,
  ].slice(0, this.hints);
  const res = this.result;
  const how = input.kind === 'hand' ? 'Pinch the red throttle handle and push it' : input.kind === 'controller' ? 'Grab the red throttle handle and push it' : 'Drag the red throttle handle';
  info.userData.draw([
    { t: 'Launch ZimSat-1 sideways from 400 km above Earth (the height of the International Space Station).', size: 31, gap: 10 },
    { t: `Goal: a circular orbit on the dashed ring. Work out the speed. ${how} to set it (or use − and +), then press LAUNCH.`, size: 30, color: '#ffd34d', gap: 10 },
    ...DATA_LINES.map((d) => ({ ...d, size: 27, gap: 2 })),
    { t: 'Height h = 400 km = 4.0 × 10⁵ m', size: 27, color: '#cfe3ff' },
    ...hintLines.map((t) => ({ t, size: 27, color: '#e0b3ff', gap: 4 })),
    res && { rule: true },
    res && { t: res.text, size: 29, color: res.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m2.drawData = function () {
  const flying = this.phase !== 'aim' && this.phase !== 'countdown';
  const r = this.pos.length(), v = flying ? this.vel.length() : this.lever.value * 1000;
  const g = GM / (r * r), need = v * v / r;
  const mins = this.simT / 60;
  const ratio = need / g;
  data.userData.draw([
    { t: `Speed  v = ${(v / 1000).toFixed(2)} km/s`, size: 34, bold: true, color: '#3ddc84' },
    { t: `Height  h = ${Math.round((r - R) / 1000).toLocaleString('en-GB')} km     r = ${sig(r)} m`, size: 30 },
    { rule: true },
    { t: `Gravity per kg   g = GM/r² = ${g.toFixed(2)} N/kg`, size: 31, color: '#ff8080' },
    { t: `Needed for a circle   v²/r = ${need.toFixed(2)} m/s²`, size: 31, color: '#ffd34d' },
    { fn: (ctx, x, y, w) => {          // a balance bar: gravity against what a circle needs
      const cx = x + w / 2, bw = w * 0.42, k = clamp(Math.log(ratio) / Math.log(2.2), -1, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(ctx, x, y + 6, w, 34, 17); ctx.fill();
      ctx.fillStyle = Math.abs(k) < 0.03 ? '#3ddc84' : k < 0 ? '#ff6b6b' : '#ffd34d';
      roundRect(ctx, Math.min(cx, cx + k * bw), y + 10, Math.max(8, Math.abs(k) * bw), 26, 13); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - 2, y, 4, 46);
      ctx.font = '600 22px system-ui'; ctx.fillStyle = '#9fb6cc'; ctx.textAlign = 'left'; ctx.fillText('curves in', x + 6, y + 64); ctx.textAlign = 'right'; ctx.fillText('swings out', x + w - 6, y + 64); ctx.textAlign = 'left';
      return y + 82;
    } },
    { t: Math.abs(g - need) / g < 0.03 ? 'Balanced: gravity provides exactly the centripetal force.' : g > need ? 'Gravity is MORE than needed: the path curves in.' : 'Gravity is LESS than needed: the path swings out.', size: 29, color: '#cfe3ff' },
    { rule: true },
    { t: flying ? `Flight time ${mins.toFixed(0)} min     launches ${this.launches}` : `Launches so far: ${this.launches}`, size: 29, color: '#9fb6cc' },
  ], { title: 'Flight data' });
};
m2.classify = function (v) {
  const ratio = v / vCirc2;
  if (v >= vEsc2) return { kind: 'escape' };
  const eps = v * v / 2 - GM / r2, a = -GM / (2 * eps), e = Math.abs(r2 * v * v / GM - 1);
  if (Math.abs(ratio - 1) <= 0.013) return { kind: 'circle', e };
  if (ratio < 1) { const rp = a * (1 - e); return rp < R ? { kind: 'crash' } : { kind: 'low', hMin: (rp - R) / 1000 }; }
  return { kind: 'high', hMax: (a * (1 + e) - R) / 1000 };
};
m2.launch = async function () {
  if (this.phase !== 'aim' && this.phase !== 'aim-after') return;
  if (this.phase === 'aim-after') this.reset();
  hint.hide();
  this.result = null;
  this.phase = 'countdown';
  this.lever.setEnabled(); this.launchBtn.userData.setOn(false);
  if (!(await countdown(this))) return;
  if (this.phase !== 'countdown') return;
  const v = this.lever.value * 1000;
  this.launches++;
  this.phase = 'flying';
  this.result = null;
  this.outcome = this.classify(v);
  // keep the last flight as a faint ghost to compare with
  this.ghost.copyFrom(this.trail); this.ghost.setColor(0x8fa8c0, 0.45);
  this.pos.copy(POS0).multiplyScalar(r2); this.vel.copy(DIR0).multiplyScalar(v);
  this.simT = 0; this.angle = 0; this.lastAng = Math.atan2(-this.pos.z, this.pos.x);
  this.trail.clear(); this.trail.push(this.pos.clone().multiplyScalar(S));
  this.sat.visible = true; this.burn = 1;
  sfx.launch(); toast(`Launched at ${(v / 1000).toFixed(2)} km/s`, 'info', 2);
  this.redraw(); this.drawData();
};
m2.finish = function (kind) {
  const v = this.lever.value, vc = (vCirc2 / 1000).toFixed(2);
  const r = this.outcome;
  let text = '', ok = false;
  if (kind === 'crash') text = `Crashed! At ${v.toFixed(2)} km/s gravity is more than the centripetal force a circle needs (GMm/r² > mv²/r), so the path curves in too much and hits Earth. Go faster.`;
  else if (kind === 'escape' && r.kind === 'escape') text = `Lost in space! ${v.toFixed(2)} km/s is above the escape speed here (${(vEsc2 / 1000).toFixed(2)} km/s), so gravity can never pull it back. Go much slower.`;
  else if (kind === 'escape') text = `Far too fast. Gravity is much less than a circle needs, so it swings out on a long ellipse to ${Math.round(r.hMax).toLocaleString('en-GB')} km, far off the screen. Go slower.`;
  else if (r.kind === 'low') text = `Close, but the orbit is an ellipse. Gravity was a little more than needed, so it dropped to ${Math.round(r.hMin)} km on the far side. Go a little faster.`;
  else if (r.kind === 'high') text = `Close, but the orbit is an ellipse. Gravity was less than needed, so it swung out to ${Math.round(r.hMax).toLocaleString('en-GB')} km on the far side. Go a little slower.`;
  else { ok = true; text = `Circular orbit! At ${v.toFixed(2)} km/s (ideal ${vc} km/s) gravity provides exactly the centripetal force all the way round. One orbit takes about ${Math.round(T2 / 60)} minutes.`; }
  this.result = { ok, text };
  if (ok) {
    this.trail.setColor(0x3ddc84, 1.3);
    celebrate(this.sat.getWorldPosition(new V3()), { stars: 0 });
    toast('Circular orbit achieved!', 'good', 3);
  } else { sfx.bad(); toast(kind === 'crash' ? 'Crashed into Earth' : kind === 'escape' ? 'Escaped from Earth' : 'Not circular yet', 'bad', 2.5); }
  if (!ok) { this.phase = 'aim-after'; hint.show(this.lever.group, [0, 0.2, 0.06]); }
  this.lever.setEnabled(); this.launchBtn.userData.setOn(!ok);
  this.redraw();
  if (ok) this.questions();
};
m2.questions = async function () {
  this.phase = 'quiz';
  this.lever.setEnabled(); this.launchBtn.userData.setOn(false);
  await wait(4);
  if (current !== this) return;
  this.controls.visible = false;
  const go = askIf(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 2', q: `Your satellite orbits at r = ${sig(r2)} m with v = ${(vCirc2 / 1000).toFixed(2)} km/s. What is its period T?`,
    options: ['93 minutes', '5.6 minutes', '24 hours', '85 minutes'], correct: 0,
    explain: `T = 2πr / v = 2π × ${sig(r2)} / ${Math.round(vCirc2)} = ${Math.round(T2)} s ≈ 93 minutes.`,
    why: ['', 'Check the units: 2πr/v gives seconds. Convert to minutes by dividing by 60.', '24 hours is the period of a geostationary orbit, much higher up.', 'That uses r = R (an orbit at ground level). Use r = R + h.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 2', q: 'At 400 km g is still about 8.7 N/kg. So why do astronauts in the ISS feel weightless?',
    options: ['There is no gravity in space', 'They and the station fall together with the same acceleration, g', 'A centrifugal force cancels their weight', 'They are above the atmosphere'], correct: 1,
    explain: 'Gravity is the centripetal force. Astronauts and station are in free fall together, so the floor pushes on them with no contact force.',
    why: ['Your probe showed g = 8.7 N/kg at this height: gravity is still strong.', '', 'In an inertial frame there is no outward force: the only force is gravity, acting as the centripetal force.', 'The atmosphere does not cause weight. Gravity does.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  const n = this.launches <= 2 && this.hints === 0 ? 3 : this.launches <= 4 && this.hints <= 1 ? 2 : 1;
  finishMission(this, n, [
    { t: `Launches: ${this.launches}.  Hints used: ${this.hints}.  Questions right first time: ${ok} of 2.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• In orbit, gravity provides the centripetal force: GMm/r² = mv²/r, so v = √(GM/r).', size: 30 },
    { t: '• Slower: the path curves in (crash or ellipse). Faster: it swings out. Above escape speed it never returns.', size: 30 },
  ]);
};
const _wp = new V3();
m2.tick = function (dt, t) {
  earth.rotation.y += dt * WARP2 * 2 * Math.PI / DAY;
  const warp = this.warp.value ? 4 : 1;
  if (this.phase === 'flying' || this.phase === 'aim-after' || this.phase === 'quiz' || this.phase === 'done') {
    if (this.sat.visible) this.integrate(dt * WARP2 * warp);
  }
  if (this.burn > 0) {
    this.burn = Math.max(0, this.burn - dt * 1.6);
    this.sat.userData.flame.getWorldPosition(_wp);
    fx.emit(_wp, { count: 3, colors: [0xffb347, 0xff7a2a, 0xffffff], speed: 0.15, life: 0.5, size: 0.02, size1: 0.05, drag: 3 });
  }
  satTick(this.sat, t, this.burn);
  this.place();
  this.dataT = (this.dataT || 0) + dt;
  if (this.dataT > 0.3) { this.dataT = 0; if (this.phase === 'flying') this.drawData(); }
};
const _acc = new V3();
m2.integrate = function (simDt) {
  const h = 2;
  let left = simDt;
  while (left > 0) {
    const dtS = Math.min(h, left); left -= dtS;
    const r = this.pos.length();
    _acc.copy(this.pos).multiplyScalar(-GM / (r * r * r));
    this.vel.addScaledVector(_acc, dtS * 0.5);
    this.pos.addScaledVector(this.vel, dtS);
    const r2n = this.pos.length();
    _acc.copy(this.pos).multiplyScalar(-GM / (r2n * r2n * r2n));
    this.vel.addScaledVector(_acc, dtS * 0.5);
    this.simT += dtS;
    if (r2n < R) {                      // hit the ground
      this.pos.multiplyScalar(R / r2n);
      this.sat.visible = false;
      const wp = this.world.localToWorld(this.pos.clone().multiplyScalar(S));
      fx.emit(wp, { count: 70, colors: [0xffd27a, 0xff7a2a, 0xff3b1f, 0xffffff], speed: 0.6, life: 1.1, size: 0.025, size1: 0.06, drag: 2.5 });
      fx.emit(wp, { count: 30, colors: [0x666a70, 0x44484e], speed: 0.25, life: 1.8, size: 0.04, size1: 0.1, drag: 1.5, alpha: 0.5 });
      shockwave(wp, { color: 0xff9a3c, size: 0.25, dur: 0.7 });
      sfx.boom();
      if (this.phase === 'flying') this.finish('crash');
      return;
    }
  }
  const ang = Math.atan2(-this.pos.z, this.pos.x);
  let d = ang - this.lastAng;
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  this.angle += d; this.lastAng = ang;
  this.trail.push(this.pos.clone().multiplyScalar(S));
  const r = this.pos.length();
  if (this.phase === 'flying') {
    if (r > 6.5 * R) { this.sat.visible = false; this.finish('escape'); }
    else if (Math.abs(this.angle) >= Math.PI * 2) this.finish('orbit');
  } else if (r > 6.5 * R) this.sat.visible = false;
};

// ================================================================= Mission 3: Geostationary
const WARP3 = DAY / 24;                 // one day in 24 seconds
const RD3 = 0.13;
const m3 = {
  title: 'Mission 3: Geostationary', short: 'GEO Orbit', view: { rDisp: RD3, pos: [0, 1.28, -2.15], tilt: 0.5 },
  controls: new THREE.Group(), world: new THREE.Group(),
  phase: 'aim', launches: 0, east: true, equatorial: true, simT: 0, result: null,
};
missions.push(m3);
panel.add(m3.controls); sys.add(m3.world);
{
  // faint distance rings in the equatorial plane, for a sense of scale (the answer is not marked)
  for (const hk of [10000, 20000, 30000, 40000]) {
    const rr = (R + hk * 1000) / R * RD3;
    const ring = mesh(new THREE.RingGeometry(rr - 0.0015, rr + 0.0015, 128).rotateX(-Math.PI / 2), glowMat(0x5fb0ff, { opacity: 0.22, side: THREE.DoubleSide }));
    m3.world.add(noHit(ring));
    const lab = textSprite(`${(hk / 1000).toFixed(0)} 000 km`, { size: 0.026, bg: null, color: '#8fc3ff' });
    lab.position.set(-rr * 0.71, 0.012, rr * 0.71); m3.world.add(lab);
  }
  m3.sat = makeSatellite(); m3.sat.scale.setScalar(1.3); m3.world.add(m3.sat);
  m3.trail = trail(0xffe08a, 2000, m3.world);
  m3.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]), new THREE.LineBasicMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, toneMapped: false }));
  m3.beam.frustumCulled = false;
  m3.world.add(noHit(m3.beam));
  m3.packets = [0, 1, 2].map(() => { const s = glowSprite(0x7dffb0, 0.035, 0.9); m3.world.add(s); return s; });
  // ground track: where the satellite is overhead, drawn on the Earth (it turns with the Earth)
  m3.trackPts = new Float32Array(800 * 3);
  m3.trackGeo = new THREE.BufferGeometry();
  m3.trackGeo.setAttribute('position', new THREE.BufferAttribute(m3.trackPts, 3));
  m3.trackGeo.setDrawRange(0, 0);
  m3.track = new THREE.Points(m3.trackGeo, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.03, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m3.track.frustumCulled = false;
  earth.add(noHit(m3.track));
  m3.clock = textSprite('', { size: 0.036 });
  m3.clock.position.set(0, 0.46, 0);
  m3.world.add(m3.clock);
  m3.hLabel = textSprite('', { size: 0.028, color: '#ffe08a' });
  m3.world.add(m3.hLabel);
  // the satellite can be grabbed and pulled out or pushed in along its line from the Earth
  m3.grab = grabbable(m3.sat, {
    name: 'ZimSat-1 (pull it out or push it in)', space: m3.world, haloSize: 0.16, hitRadius: 0.06,
    enabled: () => m3.phase === 'aim' || m3.phase === 'after',
    constrain: (l) => {
      if (m3.phase === 'after') m3.reset();
      const dir = m3.f0.p0;
      const r = Math.max(0, l.dot(dir)) / S;
      const hKm = clamp(Math.round((r - R) / 1000 / 100) * 100, 1000, 50000);
      m3.slider.set(hKm);
      return dir.clone().multiplyScalar((hKm * 1000 + R) * S);
    },
    onGrab: () => hint.hide(),
  });

  m3.slider = slider({ name: 'Orbit height', min: 1000, max: 50000, step: 100, fine: 10, value: 20000, length: 0.34, labelW: 0.44,
    format: (v) => `${Math.round(v).toLocaleString('en-GB')} km`, onChange: () => { m3.preview(); m3.drawData(); }, enabled: () => m3.phase === 'aim' || m3.phase === 'after' });
  m3.slider.group.position.set(-0.2, 0.14, 0);
  m3.controls.add(m3.slider.group);
  m3.dirT = toggle({ labels: ['Eastward', 'Westward'], value: 1, name: 'Orbit direction', w: 0.25, h: 0.075, colors: ['#2fa36b', '#b9770e'],
    onChange: (v) => { m3.east = v === 0; m3.preview(); m3.drawData(); }, enabled: () => m3.phase === 'aim' || m3.phase === 'after' });
  m3.dirT.group.position.set(-0.36, 0.01, 0);
  m3.planeT = toggle({ labels: ['Equator', 'Tilted 18°'], value: 1, name: 'Orbit plane', w: 0.25, h: 0.075, colors: ['#2fa36b', '#b9770e'],
    onChange: (v) => { m3.equatorial = v === 0; m3.preview(); m3.drawData(); }, enabled: () => m3.phase === 'aim' || m3.phase === 'after' });
  m3.planeT.group.position.set(-0.08, 0.01, 0);
  m3.launchBtn = actionButton('LAUNCH', 0.22, 0.1, () => m3.launch(), { bg: '#d0392b', size: 34 });
  m3.launchBtn.position.set(-0.36, -0.12, 0);
  m3.resetBtn = actionButton('Reset', 0.15, 0.08, () => m3.reset(), { bg: '#4b5d6e', size: 28 });
  m3.resetBtn.position.set(-0.12, -0.12, 0);
  m3.controls.add(m3.dirT.group, m3.planeT.group, m3.launchBtn, m3.resetBtn);
}
m3.enter = function () {
  this.launches = 0; this.east = false; this.equatorial = false; this.result = null;
  this.dirT.set(1, true); this.planeT.set(1, true); this.dirT.refresh(); this.planeT.refresh();
  this.slider.set(20000, true);
  this.reset();
  hint.show(this.sat, [0, 0.07, 0]);
};
m3.editable = function () { return this.phase === 'aim' || this.phase === 'after'; };
m3.reset = function () {
  this.phase = 'aim'; this.simT = 0;
  this.trail.clear(); this.trackGeo.setDrawRange(0, 0); this.trackN = 0;
  // start with Harare on the front-right of the Earth, so the satellite above it is in clear view
  this.earth0 = -Math.PI / 6 - Math.atan2(-harareN.z, harareN.x);
  earth.rotation.y = this.earth0;
  this.slider.setEnabled(); this.launchBtn.userData.setOn(true); this.dirT.refresh(); this.planeT.refresh();
  this.clock.userData.set('Day 0, 00:00');
  this.preview(); this.redraw(); this.drawData();
};
// orbit geometry at the moment of launch: p̂0 is the satellite's start direction (above Harare's longitude,
// or above Harare itself on the tilted plane), ê0 the direction it starts to move.
m3.frame0 = function () {
  earth.updateMatrixWorld(true);
  const m = harareN.clone().setY(0).normalize().applyAxisAngle(new V3(0, 1, 0), earth.rotation.y);  // meridian, sys frame
  const tilt = this.equatorial ? 0 : HARARE.lat * Math.PI / 180;
  const p0 = m.clone().multiplyScalar(Math.cos(tilt)).add(new V3(0, Math.sin(tilt), 0));
  const east = new V3(0, 1, 0).cross(m).normalize();     // eastward = +y × meridian
  const e0 = east.multiplyScalar(this.east ? 1 : -1);
  return { p0, e0 };
};
m3.satPos = function (t) {
  const r = (this.slider.value * 1000 + R);
  const w = Math.sqrt(GM / (r * r * r));
  const { p0, e0 } = this.f0;
  return p0.clone().multiplyScalar(Math.cos(w * t)).addScaledVector(e0, Math.sin(w * t)).multiplyScalar(r);
};
m3.preview = function () {
  if (this.phase === 'flying' || this.phase === 'quiz' || this.phase === 'done') return;
  if (this.phase === 'after') { this.reset(); return; }
  this.f0 = this.frame0();
  this.sat.position.copy(this.satPos(0)).multiplyScalar(S);
  faceEarth(this.sat);
  this.updateBeam();
  this.drawData();
};
const _dw = new V3(), _sw = new V3(), _nl = new V3();
m3.updateBeam = function () {
  pin.updateWorldMatrix(true, false);
  dish.getWorldPosition(_dw); this.sat.getWorldPosition(_sw);
  const n = _nl.copy(harareN).transformDirection(earth.matrixWorld);
  const visible = _sw.clone().sub(_dw).dot(n) > 0;
  dish.lookAt(_sw);
  sys.worldToLocal(_dw); sys.worldToLocal(_sw);
  this.world.worldToLocal(this.world.localToWorld(_dw));
  const a = this.beam.geometry.attributes.position;
  a.setXYZ(0, _dw.x, _dw.y, _dw.z); a.setXYZ(1, _sw.x, _sw.y, _sw.z); a.needsUpdate = true;
  this.beam.visible = visible;
  this.packets.forEach((p, i) => { p.visible = visible; const k = ((time3 * 0.8 + i / 3) % 1); p.position.lerpVectors(_sw, _dw, k); });
  this.hLabel.position.copy(_sw).add(new V3(0, 0.06, 0));
  this.hLabel.userData.set(`${Math.round(this.slider.value).toLocaleString('en-GB')} km`);
  this.hLabel.visible = this.editable();
  return visible;
};
let time3 = 0;
m3.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const res = this.result;
  const how = input.kind === 'mouse' ? 'Drag the satellite out from Earth (or use the height slider)' : 'Grab the satellite and pull it out from Earth (or use the height slider)';
  info.userData.draw([
    { t: 'A TV satellite must stay above the same place all the time, so that dishes in Zimbabwe never have to move. That is a geostationary orbit.', size: 30, gap: 10 },
    { t: `${how}. Flip the switches for direction and plane, then LAUNCH and watch it for one day (24 s).`, size: 30, color: '#ffd34d', gap: 10 },
    { t: 'Earth turns once in T = 24 h = 86 400 s. Hint: GMm/r² = mrω² with ω = 2π/T, so r³ = GMT²/4π². Remember h = r − R.', size: 27, color: '#cfe3ff', gap: 10 },
    { t: 'Yellow dots on the Earth mark the point right under the satellite (its ground track).', size: 27, color: '#cfe3ff' },
    res && { rule: true },
    res && { t: res.text, size: 29, color: res.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m3.drawData = function () {
  const r = this.slider.value * 1000 + R;
  const flying = !this.editable() || this.phase === 'after';
  const T = 2 * Math.PI * Math.sqrt(r * r * r / GM);
  data.userData.draw([
    { t: `Height  h = ${Math.round(this.slider.value).toLocaleString('en-GB')} km`, size: 34, bold: true },
    { t: `Orbit radius  r = R + h = ${sig(r)} m`, size: 30 },
    { t: `Direction: ${this.east ? 'eastward (same way as Earth turns)' : 'westward'}`, size: 30 },
    { t: `Plane: ${this.equatorial ? 'equatorial' : 'tilted 18° (passes over Harare)'}`, size: 30 },
    { rule: true },
    flying ? { t: `Orbital speed  v = √(GM/r) = ${(Math.sqrt(GM / r) / 1000).toFixed(2)} km/s`, size: 30, color: '#3ddc84' } : { t: 'Orbital speed and period appear after launch.', size: 28, color: '#9fb6cc' },
    flying && { t: `Measured period  T = ${(T / 3600).toFixed(2)} h`, size: 32, bold: true, color: '#ffd34d' },
    flying && { t: `Time since launch: ${(this.simT / 3600).toFixed(1)} h`, size: 30, color: '#9fb6cc' },
    { t: `Launches so far: ${this.launches}`, size: 28, color: '#9fb6cc' },
    { t: 'Green beam: the Harare dish can see the satellite.', size: 26, color: '#9fb6cc' },
  ], { title: 'Satellite data' });
};
m3.launch = async function () {
  if (!this.editable()) return;
  if (this.phase === 'after') this.reset();
  hint.hide();
  this.result = null;
  this.phase = 'countdown';
  this.slider.setEnabled(); this.launchBtn.userData.setOn(false); this.dirT.refresh(); this.planeT.refresh();
  if (!(await countdown(this))) return;
  if (this.phase !== 'countdown') return;
  this.launches++;
  this.phase = 'flying'; this.result = null; this.simT = 0;
  earth.rotation.y = this.earth0;
  this.f0 = this.frame0();
  this.trail.clear(); this.trackGeo.setDrawRange(0, 0); this.trackN = 0;
  this.maxLon = 0; this.maxLat = 0; this.lostSight = false; this.trackT = 0;
  const wp = this.sat.getWorldPosition(new V3());
  fx.emit(wp, { count: 30, colors: [0xffd27a, 0xffffff], speed: 0.3, life: 0.6, size: 0.015 });
  sfx.launch(); toast('Launched. Watching for one day…', 'info', 2);
  this.redraw(); this.drawData();
};
const _ll = new V3();
m3.tick = function (dt, t) {
  time3 = t;
  satTick(this.sat, t, 0);
  if (this.editable() || this.phase === 'countdown') { this.updateBeam(); return; }
  this.simT += dt * WARP3;
  earth.rotation.y = this.earth0 + 2 * Math.PI * this.simT / DAY;
  earth.updateMatrixWorld(true);
  const p = this.satPos(this.simT);
  this.sat.position.copy(p).multiplyScalar(S);
  faceEarth(this.sat);
  this.trail.push(this.sat.position);
  const vis = this.updateBeam();
  _ll.copy(p).applyAxisAngle(new V3(0, 1, 0), -earth.rotation.y);
  const ll = unitToLonLat(_ll);
  if (this.phase === 'flying') {
    let dLon = ll.lon - HARARE.lon; if (dLon > 180) dLon -= 360; if (dLon < -180) dLon += 360;
    this.maxLon = Math.max(this.maxLon, Math.abs(dLon));
    this.maxLat = Math.max(this.maxLat, Math.abs(ll.lat));
    if (!vis) this.lostSight = true;
  }
  this.trackT += dt * WARP3;
  if (this.trackT > 600 && this.trackN < 800) {
    this.trackT = 0;
    const u = _ll.normalize().multiplyScalar(1.012);
    this.trackPts.set([u.x, u.y, u.z], this.trackN * 3); this.trackN++;
    this.trackGeo.attributes.position.needsUpdate = true; this.trackGeo.setDrawRange(0, this.trackN);
  }
  const d = Math.floor(this.simT / DAY), hh = Math.floor((this.simT % DAY) / 3600), mm = Math.floor((this.simT % 3600) / 60);
  this.clock.userData.set(`Day ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  this.dataT = (this.dataT || 0) + dt;
  if (this.dataT > 0.4 && this.phase === 'flying') { this.dataT = 0; this.drawData(); }
  if (this.phase === 'flying' && this.simT >= DAY) this.finish();
};
m3.finish = function () {
  const h = this.slider.value, r = h * 1000 + R;
  const T = 2 * Math.PI * Math.sqrt(r * r * r / GM) / 3600;
  let ok = false, text;
  if (!this.equatorial) text = 'The tilted orbit swings 18° north and south of the equator every day (look at the figure-of-eight ground track), so the dish would have to keep moving. A geostationary orbit must be in the equatorial plane.';
  else if (!this.east) text = 'Going westward, the satellite moves against Earth\'s spin, so it races across the sky. It must orbit eastward, the same way the Earth turns.';
  else if (this.maxLon > 3) {
    text = T < 24 ? `The period is ${T.toFixed(1)} h, shorter than 24 h, so the satellite runs ahead of Harare (eastward drift). Go higher: T² ∝ r³.`
      : `The period is ${T.toFixed(1)} h, longer than 24 h, so the satellite falls behind Harare (westward drift). Go lower: T² ∝ r³.`;
  } else { ok = true; text = `Geostationary! Period ${T.toFixed(2)} h, eastward, above the equator: it stays over Harare's longitude all day. Ideal height ${Math.round(H_GEO_KM).toLocaleString('en-GB')} km (r = ${sig(R_GEO)} m).`; }
  this.result = { ok, text };
  if (ok) { celebrate(this.sat.getWorldPosition(new V3()), { stars: 0 }); toast('Geostationary orbit achieved!', 'good', 3); this.phase = 'quiz'; this.trail.setColor(0x3ddc84, 1.3); }
  else { sfx.bad(); toast('Not geostationary yet', 'bad', 2.5); this.phase = 'after'; hint.show(this.sat, [0, 0.07, 0]); }
  this.slider.setEnabled(); this.launchBtn.userData.setOn(!ok); this.dirT.refresh(); this.planeT.refresh();
  this.redraw(); this.drawData();
  if (ok) this.questions();
};
m3.questions = async function () {
  await wait(4);
  if (current !== this) return;
  this.controls.visible = false;
  const go = askIf(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 2', q: 'Why must a geostationary satellite orbit above the equator?',
    options: ['Its orbit must be centred on Earth\'s centre, and only an equatorial orbit can keep it above one place', 'Gravity is strongest above the equator', 'Earth\'s magnetic field holds it there', 'Satellites over the poles would overheat'], correct: 0,
    explain: 'Gravity points to Earth\'s centre, so every orbit is a circle round the centre. Only the equatorial circle can turn with a point on the ground.',
    why: ['', 'At a given distance r, g = GM/r² is the same in every direction.', 'Magnetic fields play no part in orbits.', 'Temperature has nothing to do with the orbit.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 2', q: 'For T = 24 h, r³ = GMT²/4π². A student gets r = 4.23 × 10⁷ m. What is the satellite\'s height above the surface?',
    options: ['4.23 × 10⁷ m', '3.59 × 10⁷ m', '4.87 × 10⁷ m', '6.40 × 10⁶ m'], correct: 1,
    explain: 'h = r − R = 4.23 × 10⁷ − 0.64 × 10⁷ = 3.59 × 10⁷ m (about 36 000 km).',
    why: ['That is r, measured from the centre. The height is measured from the surface.', '', 'That adds R. Subtract it: h = r − R.', 'That is Earth\'s radius.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  const n = this.launches <= 2 ? 3 : this.launches <= 4 ? 2 : 1;
  finishMission(this, n, [
    { t: `Launches: ${this.launches}.  Questions right first time: ${ok} of 2.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Geostationary: period 24 h, orbiting eastward, in the equatorial plane, at r ≈ 4.2 × 10⁷ m.', size: 30 },
    { t: '• From GMm/r² = mrω²: r³ = GMT²/4π², so T² ∝ r³ (higher orbits are slower).', size: 30 },
  ]);
};

// ================================================================= Mission 4: Escape Velocity
const RD4 = 0.075, TOP4 = 12;            // Earth radius on display, and the top of the display (in R)
const m4 = {
  title: 'Mission 4: Escape Velocity', short: 'Escape Velocity', view: { rDisp: RD4, pos: [0.22, 1.0, -1.75], tilt: 0 },
  controls: new THREE.Group(), world: new THREE.Group(),
  phase: 'aim', launches: 0, r: R, v: 0, E: 0, burn: 0,
};
missions.push(m4);
panel.add(m4.controls); sys.add(m4.world);
{
  // the rocket, standing on the North Pole and pointing straight up
  m4.rocket = new THREE.Group();
  const white = mat(0xf2f4f7, { metalness: 0.3, roughness: 0.35 }), red = mat(0xd0392b, { roughness: 0.4 });
  m4.rocket.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.045, 16), white, 0, 0.0225, 0));
  m4.rocket.add(mesh(new THREE.ConeGeometry(0.008, 0.02, 16), red, 0, 0.055, 0));
  for (let i = 0; i < 3; i++) { const f = mesh(new THREE.BoxGeometry(0.002, 0.014, 0.01), red, 0, 0.006, 0); f.rotation.y = i * Math.PI * 2 / 3; f.translateZ(0.009); m4.rocket.add(f); }
  m4.flame = glowSprite(0xff9a3c, 0.05, 0); m4.flame.position.y = -0.01; m4.rocket.add(m4.flame);
  m4.world.add(noHit(m4.rocket));
  m4.trail = trail(0xffe08a, 1500, m4.world);
  // a height scale up the side
  const sc = new THREE.Group();
  for (let k = 2; k <= TOP4; k += 2) {
    const tick = mesh(new THREE.BoxGeometry(0.03, 0.0015, 0.0015), basic(0x9fb6cc), 0.04, k * RD4, 0);
    sc.add(noHit(tick));
    const t = textSprite(`${k}R`, { size: 0.032, bg: null }); t.position.set(0.1, k * RD4, 0); sc.add(t);
  }
  sc.add(noHit(mesh(new THREE.CylinderGeometry(0.0015, 0.0015, (TOP4 - 1) * RD4, 6), glowMat(COL.accent, { opacity: 0.5 }), 0.04, (TOP4 + 1) / 2 * RD4, 0)));
  m4.world.add(sc);
  m4.offTop = textSprite('', { size: 0.026, color: '#ffd34d' }); m4.offTop.position.set(0, (TOP4 + 0.8) * RD4, 0); m4.world.add(m4.offTop);
  // 3D energy bars beside the Earth: kinetic (green, up), potential (red, down), total (yellow)
  m4.bars = new THREE.Group(); m4.bars.position.set(-0.4, 0.36, 0.3); m4.bars.scale.setScalar(1.4);
  const base = mesh(new THREE.BoxGeometry(0.34, 0.003, 0.05), glowMat(0xffffff, { opacity: 0.8 }));
  m4.bars.add(noHit(base));
  const zl = textSprite('E = 0', { size: 0.022, bg: null }); zl.position.set(-0.22, 0, 0); m4.bars.add(zl);
  m4.barMeshes = [['KE', 0x3ddc84, -0.11], ['GPE', 0xff5a5a, 0], ['Total', 0xffd34d, 0.11]].map(([n, c, x]) => {
    const b = mesh(new THREE.BoxGeometry(0.07, 1, 0.04).translate(0, 0.5, 0), mat(c, { emissive: c, emissiveIntensity: 0.55, transparent: true, opacity: 0.9 }), x, 0, 0);
    const l = textSprite(n, { size: 0.022, color: hexOf(c) }); l.position.set(x, -0.03, 0.03);
    const v = textSprite('', { size: 0.02, bg: null, color: hexOf(c) });
    m4.bars.add(b, l, v);
    return { b, l, v, x };
  });
  m4.world.add(m4.bars);

  m4.lever = lever({ name: 'Launch speed', min: 5, max: 15, step: 0.05, fine: 0.01, value: 8, format: (v) => `${v.toFixed(2)} km/s`, ticks: [5, 7, 9, 11, 13, 15],
    onChange: () => { if (m4.phase === 'after') m4.reset(); m4.preview(); }, enabled: () => m4.phase === 'aim' || m4.phase === 'after' });
  m4.lever.group.position.set(-0.4, 0.01, 0);
  m4.launchBtn = actionButton('LAUNCH', 0.22, 0.13, () => m4.launch(), { bg: '#d0392b', size: 36 });
  m4.launchBtn.position.set(-0.13, 0.02, 0);
  m4.resetBtn = actionButton('Reset', 0.15, 0.075, () => m4.reset(), { bg: '#4b5d6e', size: 28 });
  m4.resetBtn.position.set(0.09, 0.06, 0);
  m4.controls.add(m4.lever.group, m4.launchBtn, m4.resetBtn);
}
function hexOf(c) { return '#' + new THREE.Color(c).getHexString(); }
m4.enter = function () {
  this.launches = 0; this.results = [];
  this.lever.set(8, true);
  earth.rotation.y = 0;
  this.reset();
  hint.show(this.lever.group, [0, 0.2, 0.06]);
};
m4.reset = function () {
  this.phase = 'aim'; this.r = R; this.v = this.lever.value * 1000; this.burn = 0; this.result = null;
  this.trail.clear(); this.offTop.userData.set('');
  this.lever.setEnabled(); this.launchBtn.userData.setOn(true);
  this.place(); this.preview(); this.redraw();
};
m4.energy = function () { const KE = this.v * this.v / 2, PE = -GM / this.r; return { KE, PE, E: KE + PE }; };
m4.preview = function () { if (this.phase === 'aim') { this.v = this.lever.value * 1000; this.r = R; } this.updateBars(); this.drawData(); };
m4.place = function () {
  const y = Math.min(this.r / R, TOP4 + 0.5) * RD4;
  this.rocket.position.set(0, y, 0);
  this.rocket.visible = this.r / R <= TOP4 + 0.5;
};
m4.updateBars = function () {
  const { KE, PE, E } = this.energy();
  const k = 0.3 / (GM / R);                      // GM/R (6.25 × 10⁷ J/kg) shows as 0.3 m
  [KE, PE, E].forEach((e, i) => {
    const bm = this.barMeshes[i];
    bm.b.scale.y = Math.max(0.0005, Math.abs(e) * k);
    bm.b.rotation.x = e < 0 ? Math.PI : 0;
    bm.v.position.set(bm.x, e >= 0 ? Math.abs(e) * k + 0.025 : -Math.abs(e) * k - 0.06, 0.03);
    bm.v.userData.set(`${e < 0 ? '−' : '+'}${(Math.abs(e) / 1e7).toFixed(2)}`);
  });
};
m4.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const res = this.result;
  info.userData.draw([
    { t: 'Fire a probe straight up from Earth (no engine after launch). Will it come back, or leave for ever?', size: 31, gap: 10 },
    { t: 'Goal: find the LEAST launch speed that escapes. Watch the energy bars: kinetic energy (green) turns into potential energy (red) as it climbs.', size: 30, color: '#ffd34d', gap: 10 },
    { t: 'Energy per kilogram: Eₖ = ½v²,  Eₚ = −GM/r. It escapes only if the total ½v² − GM/r is zero or more.', size: 28, color: '#cfe3ff', gap: 6 },
    ...DATA_LINES.map((d) => ({ ...d, size: 26, gap: 2 })),
    res && { rule: true },
    res && { t: res.text, size: 29, color: res.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m4.drawData = function () {
  const { KE, PE, E } = this.energy();
  data.userData.draw([
    { t: `Speed v = ${(this.v / 1000).toFixed(2)} km/s     r = ${(this.r / R).toFixed(2)} R`, size: 32, bold: true, color: '#3ddc84' },
    { t: `Eₖ = ½v² = ${sig(KE)} J/kg    Eₚ = −GM/r = ${sig(PE)} J/kg`, size: 27, color: '#cfe3ff' },
    { t: `Total E = ${E >= 0 ? '+' : ''}${sig(E)} J/kg  ${E >= 0 ? '(≥ 0: escapes)' : '(< 0: trapped)'}`, size: 30, bold: true, color: E >= 0 ? '#8ef0a8' : '#ffd34d' },
    { fn: (ctx, x, y, w) => {                     // the potential well, with the total energy as a line
      const h = 300, L = x + 60, B = y + 30, Wd = w - 80, Ht = h - 70;
      const yOf = (e) => B + (-e / (GM / R)) * Ht * 0.95, xOf = (rr) => L + ((rr - 1) / (TOP4 - 1)) * Wd;
      ctx.strokeStyle = '#9fb6cc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(L, B); ctx.lineTo(L + Wd, B); ctx.stroke();
      ctx.fillStyle = '#9fb6cc'; ctx.font = '600 22px system-ui'; ctx.textAlign = 'right'; ctx.fillText('0', L - 8, B + 8);
      ctx.textAlign = 'center'; for (let k = 2; k <= TOP4; k += 2) ctx.fillText(`${k}R`, xOf(k), B - 10);
      ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 4; ctx.beginPath();
      for (let i = 0; i <= 100; i++) { const rr = 1 + i / 100 * (TOP4 - 1); const px = xOf(rr), py = yOf(-GM / (rr * R)); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.stroke();
      const ey = clamp(yOf(E), y, y + h);
      ctx.strokeStyle = '#ffd34d'; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(L, ey); ctx.lineTo(L + Wd, ey); ctx.stroke(); ctx.setLineDash([]);
      const rr = Math.min(this.r / R, TOP4), px = xOf(rr), py = yOf(-GM / this.r);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'left'; ctx.font = '600 22px system-ui';
      // legend along the bottom, clear of the moving lines
      const ly = y + h + 14;
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(L, ly - 3, 40, 6);
      ctx.fillStyle = '#ff9b9b'; ctx.fillText('potential energy Eₚ = −GM/r', L + 50, ly + 7);
      ctx.strokeStyle = '#ffd34d'; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(L + Wd * 0.62, ly); ctx.lineTo(L + Wd * 0.62 + 40, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd34d'; ctx.fillText('total energy E', L + Wd * 0.62 + 50, ly + 7);
      return y + h + 36;
    } },
  ], { title: 'Energy (per kg)' });
};
m4.launch = async function () {
  if (this.phase !== 'aim' && this.phase !== 'after') return;
  if (this.phase === 'after') this.reset();
  hint.hide();
  this.result = null;
  this.phase = 'countdown';
  this.lever.setEnabled(); this.launchBtn.userData.setOn(false);
  if (!(await countdown(this))) return;
  if (this.phase !== 'countdown') return;
  this.launches++;
  this.v0 = this.lever.value * 1000;
  this.v = this.v0; this.r = R; this.burn = 1; this.apexShown = false;
  this.trail.clear();
  this.phase = 'flying';
  sfx.launch(); toast(`Launched at ${(this.v0 / 1000).toFixed(2)} km/s`, 'info', 2);
  this.redraw();
};
m4.tick = function (dt) {
  earth.rotation.y += dt * 0.04;
  if (this.burn > 0) {
    this.burn = Math.max(0, this.burn - dt * 1.4);
    this.flame.material.opacity = this.burn * (0.7 + 0.3 * Math.random());
    this.flame.getWorldPosition(_wp);
    fx.emit(_wp, { count: 3, colors: [0xffb347, 0xff7a2a, 0xffffff], speed: 0.12, dir: new V3(0, -1, 0), spread: 0.4, life: 0.5, size: 0.015, size1: 0.04, drag: 3 });
  } else this.flame.material.opacity = 0;
  if (this.phase === 'flying') {
    // simulated time runs faster high up (by the local "free-fall time"), so every launch takes a few seconds
    const simDt = dt * 1.6 * Math.sqrt(Math.pow(this.r, 3) / GM);
    const steps = 20, h = simDt / steps;
    for (let i = 0; i < steps; i++) {
      this.v += -GM / (this.r * this.r) * h * 0.5; this.r += this.v * h; this.v += -GM / (this.r * this.r) * h * 0.5;
      if (this.r <= R) { this.r = R; break; }
    }
    this.place();
    if (this.rocket.visible) this.trail.push(this.rocket.position.clone().add(new V3(0, -0.005, 0)));
    const { E } = this.energy();
    const rMax = E < 0 ? GM / -E : Infinity;
    if (this.r / R > TOP4) {                                   // gone off the top of the display
      this.offTop.userData.set(E < 0 ? `↑ off the scale: it reaches ${(rMax / R).toFixed(0)} R, then falls back` : '↑ off the scale: still going, for ever');
      this.finish(E >= 0 ? 'escape' : 'return', rMax);
    } else if (this.v < 0 && !this.apexShown) { this.apexShown = true; this.offTop.userData.set(`Highest point: ${(this.r / R).toFixed(2)} R`); }
    else if (this.r <= R && this.v <= 0) {
      this.rocket.getWorldPosition(_wp);
      fx.emit(_wp, { count: 40, colors: [0xffd27a, 0xff7a2a, 0xffffff], speed: 0.35, life: 0.8, size: 0.015, size1: 0.04 });
      sfx.boom();
      this.finish('return', rMax);
    }
    this.updateBars();
    this.dataT = (this.dataT || 0) + dt;
    if (this.dataT > 0.15) { this.dataT = 0; this.drawData(); }
  }
};
m4.finish = function (kind, rMax) {
  const v = this.v0 / 1000, ve = V_ESC / 1000;
  let ok = false, text;
  if (kind === 'return') text = `It fell back. At ${v.toFixed(2)} km/s the total energy ½v² − GM/R is negative, so the probe is trapped in the potential well. It stops at ${(rMax / R).toFixed(1)} R, where all its kinetic energy has become potential energy. Go faster.`;
  else if (v > ve * 1.015) text = `It escaped, with energy to spare: the total energy is above zero. Now find the LEAST speed that escapes: go slower.`;
  else { ok = true; text = `Escape velocity! At ${v.toFixed(2)} km/s the total energy is just zero or more: ½v² = GM/R, so v = √(2GM/R) = ${ve.toFixed(2)} km/s. It slows down for ever but never stops.`; }
  this.results.push({ v, ok });
  this.result = { ok, text };
  this.phase = ok ? 'quiz' : 'after';
  this.lever.setEnabled(); this.launchBtn.userData.setOn(!ok);
  if (ok) { celebrate(new V3(0.1, 1.75, -1.6), { stars: 0 }); toast('Escape velocity found!', 'good', 3); this.questions(); }
  else { sfx.bad(); toast(kind === 'return' ? 'It fell back to Earth' : 'Escaped, but too fast', kind === 'return' ? 'bad' : 'warn', 2.5); hint.show(this.lever.group, [0, 0.2, 0.06]); }
  this.redraw(); this.drawData();
};
m4.questions = async function () {
  await wait(4);
  if (current !== this) return;
  this.controls.visible = false;
  const go = askIf(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 3', q: 'A probe of mass m just escapes from the surface when ½mv² = GMm/R. So the escape velocity is…',
    options: ['v = √(GM/R)', 'v = √(2GM/R)', 'v = 2GM/R', 'v = √(2GMm/R)'], correct: 1,
    explain: '½mv² = GMm/R, so v² = 2GM/R and v = √(2GM/R) = 11.2 km/s for Earth. The mass m cancels.',
    why: ['That is the speed for a circular orbit at the surface. Escape needs √2 times more.', '', 'You need the square root: v² = 2GM/R.', 'The mass m cancels out on both sides.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 3', q: 'A rocket twice as heavy is launched from the same place. Its escape velocity is…',
    options: ['twice as big', 'half as big', 'the same', '√2 times as big'], correct: 2,
    explain: 'v = √(2GM/R) does not contain the rocket\'s mass: a heavier rocket needs more energy, but the same speed.',
    why: ['The kinetic energy needed doubles, but so does the mass: the speed is the same.', 'Mass cancels: speed does not depend on it.', '', 'Mass cancels: speed does not depend on it.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 3 of 3', q: 'What does a negative total energy (½mv² − GMm/r < 0) tell you about a probe?',
    options: ['It is moving towards Earth', 'It is bound: it can never get infinitely far away', 'It has no kinetic energy', 'It will crash straight away'], correct: 1,
    explain: 'At infinity the potential energy is zero and the kinetic energy cannot be negative. So a negative total can never reach infinity: the probe is bound (it falls back, or orbits).',
    why: ['The sign of the total energy says nothing about direction.', '', 'It can have plenty of kinetic energy: the potential energy is more negative.', 'Satellites in orbit have negative total energy and never crash.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  const n = this.launches <= 3 && ok >= 2 ? 3 : this.launches <= 6 && ok >= 1 ? 2 : 1;
  finishMission(this, n, [
    { t: `Launches: ${this.launches}.  Questions right first time: ${ok} of 3.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Gravitational potential energy Eₚ = −GMm/r: zero at infinity, negative everywhere else.', size: 30 },
    { t: '• Escape velocity: ½mv² = GMm/R gives v = √(2GM/R) = 11.2 km/s. It does not depend on the mass.', size: 30 },
  ]);
};

// ---------------------------------------------------------------- menu buttons
missions.forEach((m, i) => {
  const b = actionButton(`${i + 1}. ${m.short}`, 0.2, 0.14, () => startMission(i), { bg: ['#1f6fb2', '#b9770e', '#1e8449', '#8e44ad'][i], size: 25, name: `Start ${m.title}` });
  b.position.set(-0.4 + i * 0.215, 0.0, 0);
  menuGroup.add(b);
  missionButtons.push(b);
});

// ---------------------------------------------------------------- loop
onFrame((dt, t) => {
  keepMarkerSizes(t);
  earthMat.uniforms.cloudShift.value += dt * 0.002;
  placeProjector();
  if (current) current.tick(dt, t);
  else earth.rotation.y += dt * 0.08;
});
openMenu();
start();

// Test hook (used by the automated browser tests; harmless for players).
window.lesson = { missions, startMission, openMenu, get current() { return current; }, Q, info, data, earth, sys, consts: { G, M, R, GM, vCirc2, vEsc2, H_GEO_KM, R_GEO, T2, V_ESC },
  input, scene, camera, renderer, THREE, get stars() { return stars; }, speed: 1, panel, toast, missionButtons, nextBtn, menuBtn, restartBtn, hint, fx };
