// Orbit Command: an A-Level (Form 5) physics VR game on gravitational fields and circular motion.
// Three missions: Field Probe (g = GM/r², φ = −GM/r), Into Orbit (gravity provides the centripetal force)
// and Geostationary (T = 24 h, equatorial, eastward). Runs in the Meta Quest Browser and on a computer.
import {
  THREE, scene, camera, renderer, input, mat, basic, mesh, noHit, sig, sup, board, textSprite, arrow,
  actionButton, button, slider, toaster, quiz, makeInteractive, sfx, tween, wait, onFrame, start, words,
  view, onKindChange,
} from './kit.js';

// ---------------------------------------------------------------- physical data (as on a ZIMSEC data sheet)
const G = 6.67e-11, M = 6.00e24, R = 6.40e6, GM = G * M;
const DAY = 24 * 3600;
const g0 = GM / (R * R);                                  // 9.77 N/kg
const R_GEO = Math.cbrt(GM * DAY * DAY / (4 * Math.PI * Math.PI));   // 4.23 × 10⁷ m
const H_GEO_KM = (R_GEO - R) / 1000;                       // about 35 900 km
const DATA_LINES = [
  { t: 'G = 6.67 × 10⁻¹¹ N m² kg⁻²', size: 32, color: '#cfe3ff' },
  { t: 'Mass of Earth  M = 6.00 × 10²⁴ kg', size: 32, color: '#cfe3ff' },
  { t: 'Radius of Earth  R = 6.40 × 10⁶ m', size: 32, color: '#cfe3ff' },
];

// ---------------------------------------------------------------- space, deck and console
scene.background = new THREE.Color(0x02040b);
scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x10131a, 0.9));
const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
sunLight.position.set(6, 3, 2);
scene.add(sunLight);
view.desktopPos.set(0, 0.25, 1.15);
view.desktopPitch = -0.36;

(function stars() {
  const n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 20;
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
    const b = 0.5 + Math.random() * 0.5, warm = Math.random();
    col.set([b, b * (0.9 + warm * 0.1), b * (0.85 + (1 - warm) * 0.15)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(noHit(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, sizeAttenuation: true }))));
  const sunDisc = mesh(new THREE.SphereGeometry(2.2, 24, 16), basic(0xfff2c4), 60, 30, 20);
  scene.add(noHit(sunDisc));
})();

// the deck the learner stands on
const deck = new THREE.Group();
scene.add(deck);
deck.add(mesh(new THREE.CylinderGeometry(1.3, 1.35, 0.06, 48), mat(0x2a3442, { metalness: 0.5, roughness: 0.5 }), 0, -0.03, 0));
const rim = mesh(new THREE.TorusGeometry(1.3, 0.012, 8, 64), basic(0x3fa7ff), 0, 0.005, 0);
rim.rotation.x = Math.PI / 2;
deck.add(rim);
const grid = new THREE.GridHelper(2.4, 12, 0x3a4c62, 0x2c3a4b); grid.position.y = 0.002; deck.add(grid);
noHit(deck);

// console: a sloped desk in reach of the hands
const consoleDesk = new THREE.Group();
consoleDesk.position.set(0, 0, -0.44);
scene.add(consoleDesk);
const deskBody = mesh(new THREE.BoxGeometry(1.06, 0.9, 0.24), mat(0x1f2a36, { metalness: 0.4 }), 0, 0.45, -0.04);
consoleDesk.add(noHit(deskBody));
export const panel = new THREE.Group();      // the sloped top: buttons and sliders live here
panel.position.set(0, 1.0, 0.0);
panel.rotation.x = -0.7;
consoleDesk.add(panel);
panel.add(noHit(mesh(new THREE.BoxGeometry(1.08, 0.4, 0.03), mat(0x16202b, { metalness: 0.3 }), 0, 0, -0.03)));
panel.add(noHit(mesh(new THREE.BoxGeometry(1.08, 0.006, 0.032), basic(0x3fa7ff), 0, 0.2, -0.03)));

// boards: left = mission and questions, right = live readouts
const info = board(1.0, 0.8);
info.position.set(-0.98, 1.52, -1.0); info.rotation.y = 0.72;
scene.add(info);
const data = board(1.0, 0.8);
data.position.set(0.98, 1.52, -1.0); data.rotation.y = -0.72;
scene.add(data);
const toastHolder = new THREE.Group();
toastHolder.position.set(0, 2.02, -1.35);
scene.add(toastHolder);
const toast = toaster(toastHolder, 0.95, 0.13);

// answer buttons for questions sit on the console
const answerGroup = new THREE.Group();
answerGroup.position.set(-0.08, -0.02, 0.001);
panel.add(answerGroup);
const Q = quiz({ textBoard: info, answerGroup, w: 0.3, h: 0.1, gapX: 0.34, gapY: 0.13, toast });

// always-there buttons
const menuBtn = actionButton('Menu', 0.15, 0.06, () => openMenu(), { bg: '#5b6b78', size: 28 });
menuBtn.position.set(0.44, 0.15, 0);
panel.add(menuBtn);
const restartBtn = actionButton('Restart', 0.15, 0.06, () => current && startMission(missions.indexOf(current)), { bg: '#5b6b78', size: 28, name: 'Restart this mission' });
restartBtn.position.set(0.44, 0.075, 0);
panel.add(restartBtn);

// ---------------------------------------------------------------- the Earth system
const sys = new THREE.Group();          // orbital (equatorial) plane = local xz, tilted towards the learner
sys.position.set(0, 1.2, -2.6);
sys.rotation.x = 0.55;
scene.add(sys);
const earth = new THREE.Group();        // scaled so that 1 unit = 1 Earth radius
sys.add(earth);
let S = 0.3 / R;                        // display metres per real metre (set per mission)
earth.scale.setScalar(0.3);

function lonLatToUnit(lon, lat, out = new THREE.Vector3()) {     // matches SphereGeometry's uv mapping
  const phi = (lon + 180) / 360 * Math.PI * 2, b = lat * Math.PI / 180;
  return out.set(-Math.cos(phi) * Math.cos(b), Math.sin(b), Math.sin(phi) * Math.cos(b));
}
function unitToLonLat(v) {
  const b = Math.asin(THREE.MathUtils.clamp(v.y / v.length(), -1, 1));
  let phi = Math.atan2(v.z, -v.x);
  let lon = phi / (Math.PI * 2) * 360 - 180;
  if (lon < -180) lon += 360;
  return { lon, lat: b * 180 / Math.PI };
}
const HARARE = { lon: 31.05, lat: -17.83 };

function earthTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#163d6e'); sea.addColorStop(0.5, '#1f5f9e'); sea.addColorStop(1, '#163d6e');
  ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
  const X = (lon) => (lon + 180) / 360 * W, Yc = (lat) => (90 - lat) / 180 * H;
  const land = {
    africa: [[-17, 21], [-10, 30], [-5, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [42, -1], [40, -10], [40, -16], [35, -24], [32, -29], [27, -34], [20, -35], [18, -30], [12, -17], [13, -6], [9, 4], [5, 5], [-8, 4], [-13, 8], [-17, 14]],
    eurasia: [[-10, 36], [-9, 43], [-2, 48], [-5, 58], [5, 61], [10, 64], [20, 70], [40, 68], [60, 70], [80, 73], [100, 77], [140, 72], [180, 68], [180, 62], [160, 58], [142, 50], [140, 40], [122, 30], [120, 22], [108, 18], [106, 10], [100, 5], [98, 15], [92, 22], [80, 15], [77, 8], [72, 20], [66, 25], [57, 26], [50, 30], [56, 25], [52, 17], [44, 12], [38, 20], [34, 29], [36, 36], [27, 37], [22, 40], [15, 40], [12, 44], [3, 43]],
    namerica: [[-168, 66], [-160, 71], [-130, 70], [-95, 72], [-80, 73], [-62, 60], [-55, 52], [-66, 45], [-75, 35], [-81, 25], [-90, 30], [-97, 26], [-97, 20], [-87, 20], [-83, 10], [-79, 8], [-92, 15], [-105, 20], [-112, 30], [-118, 34], [-124, 40], [-125, 49], [-135, 57], [-152, 58], [-165, 60]],
    greenland: [[-50, 60], [-40, 65], [-20, 70], [-20, 80], [-60, 82], [-70, 77], [-55, 70]],
    samerica: [[-79, 8], [-72, 12], [-62, 11], [-50, 0], [-35, -6], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-65, -42], [-68, -52], [-72, -50], [-74, -40], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 1]],
    australia: [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [135, -34], [129, -32], [115, -34]],
    madagascar: [[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]],
    borneo: [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
    sumatra: [[95, 5], [98, 4], [106, -6], [102, -4]],
    japan: [[130, 31], [135, 34], [141, 41], [141, 36], [135, 33]],
    uk: [[-5, 50], [1, 51], [-2, 57], [-5, 58], [-6, 55]],
    newguinea: [[131, -1], [141, -3], [150, -10], [142, -9]],
    nz: [[172, -34], [178, -38], [174, -41], [167, -46], [170, -44]],
  };
  ctx.lineJoin = 'round';
  for (const pts of Object.values(land)) {
    ctx.beginPath();
    pts.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Yc(la)) : ctx.moveTo(X(lo), Yc(la))));
    ctx.closePath();
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#6f8f52'); gr.addColorStop(0.42, '#9a8a55'); gr.addColorStop(0.5, '#4f8a3a'); gr.addColorStop(0.6, '#8f8250'); gr.addColorStop(1, '#6f8f52');
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,20,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.fillStyle = '#eef4f8';
  ctx.fillRect(0, Yc(-68), W, H - Yc(-68));
  ctx.fillRect(0, 0, W, Yc(82));
  // equator and Harare
  ctx.strokeStyle = 'rgba(255,220,120,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath(); ctx.arc(X(HARARE.lon), Yc(HARARE.lat), 9, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const earthMesh = mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshStandardMaterial({ map: earthTexture(), roughness: 0.85, metalness: 0 }));
earth.add(noHit(earthMesh));
const atmo = mesh(new THREE.SphereGeometry(1.035, 48, 32), new THREE.MeshBasicMaterial({ color: 0x5fb0ff, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }));
earth.add(noHit(atmo));
// Harare: a red pin and a dish that tracks the satellite in the geostationary mission
const harareN = lonLatToUnit(HARARE.lon, HARARE.lat);
const pin = new THREE.Group();       // sized in metres; its scale undoes the Earth's scale every frame
pin.add(mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.045, 8).translate(0, 0.0225, 0), basic(0xffffff)));
pin.add(mesh(new THREE.SphereGeometry(0.01, 12, 8), basic(0xff3b30), 0, 0.048, 0));
pin.position.copy(harareN);
pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), harareN);
earth.add(noHit(pin));
const harareLabel = textSprite('Harare', { size: 0.03 });
harareLabel.position.copy(harareN).multiplyScalar(1.3);
harareLabel.userData.base = harareLabel.scale.clone();
earth.add(harareLabel);
function keepMarkerSizes() {
  const k = 1 / earth.scale.x;
  pin.scale.setScalar(k);
  harareLabel.scale.copy(harareLabel.userData.base).multiplyScalar(k);
}

// ---------------------------------------------------------------- satellite model
function makeSatellite() {
  const g = new THREE.Group();
  const gold = mat(0xd9a441, { metalness: 0.7, roughness: 0.35 });
  const panelM = mat(0x2747a8, { metalness: 0.3, roughness: 0.4, emissive: 0x0a1640 });
  g.add(mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), gold));
  g.add(mesh(new THREE.BoxGeometry(0.11, 0.002, 0.03), panelM));
  g.add(mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.012, 12), mat(0xdddddd), 0, 0.024, 0));
  const glow = mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.35, depthWrite: false }));
  g.add(glow);
  noHit(g);
  return g;
}

// A trail line that remembers the last n points (in sys-local display units).
function trail(color, n = 2400, parent = sys) {
  const pos = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setDrawRange(0, 0);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  line.frustumCulled = false;
  noHit(line);
  parent.add(line);
  let count = 0;
  return {
    line,
    clear() { count = 0; g.setDrawRange(0, 0); },
    push(v) {
      if (count >= n) { pos.copyWithin(0, 3); count = n - 1; }
      pos[count * 3] = v.x; pos[count * 3 + 1] = v.y; pos[count * 3 + 2] = v.z;
      count++;
      g.attributes.position.needsUpdate = true;
      g.setDrawRange(0, count);
    },
  };
}

// ---------------------------------------------------------------- progress (stars) saved in this browser
const STORE = 'orbit-command-v1';
let stars = [0, 0, 0];
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (Array.isArray(s)) stars = s.slice(0, 3).map((x) => x | 0); } catch { /* storage blocked */ }
function saveStars(i, n) {
  stars[i] = Math.max(stars[i], n);
  try { localStorage.setItem(STORE, JSON.stringify(stars)); } catch { /* storage blocked */ }
}
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ---------------------------------------------------------------- mission framework
let current = null;
const missions = [];
function setEarthScale(rDisp, dur = 0.8) {
  const from = earth.scale.x;
  S = rDisp / R;
  return tween(dur, (k) => earth.scale.setScalar(from + (rDisp - from) * k));
}
function hideAllMissionThings() {
  for (const m of missions) { m.controls.visible = false; m.world.visible = false; }
  Q.cancel();
  toast.hide();
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
  setEarthScale(current.rDisp);
  current.enter();
}
function finishMission(m, n, lines = []) {
  saveStars(missions.indexOf(m), n);
  sfx.great();
  m.controls.visible = false;
  Q.cancel();
  const i = missions.indexOf(m);
  info.userData.draw([
    { t: `Mission complete  ${starText(n)}`, size: 46, bold: true, color: '#ffd34d', gap: 16 },
    ...lines,
    { rule: true },
    i < missions.length - 1 ? { t: `Next: Mission ${i + 2}, ${missions[i + 1].title}. Use the green button on the console.`, size: 32, color: '#9fe2bf' }
      : { t: 'You have finished all three missions. Well done, Mission Controller!', size: 34, color: '#9fe2bf' },
  ], { title: m.title });
  doneGroup.visible = true;
  nextBtn.visible = i < missions.length - 1;
  nextBtn.userData.next = i + 1;
}
const doneGroup = new THREE.Group();
panel.add(doneGroup);
doneGroup.visible = false;
const nextBtn = actionButton('Next mission', 0.3, 0.1, () => startMission(nextBtn.userData.next), { bg: '#1e8449', size: 30 });
nextBtn.position.set(-0.1, 0, 0);
doneGroup.add(nextBtn);
const againBtn = actionButton('Play again', 0.22, 0.1, () => current && startMission(missions.indexOf(current)), { bg: '#5b6b78', size: 28 });
againBtn.position.set(0.2, 0, 0);
doneGroup.add(againBtn);

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
  setEarthScale(0.42);
  missionButtons.forEach((b, i) => b.userData.draw(`${i + 1}. ${missions[i].short}\n${starText(stars[i])}`));
  drawWelcome();
  drawDataSheet();
}
function drawWelcome() {
  const w = words();
  info.userData.draw([
    { t: 'Form 5 · Gravitational fields and circular motion', size: 32, color: '#9fb6cc', gap: 14 },
    { t: 'You are the controller for a new Zimbabwean satellite. Learn how Earth\'s field behaves, then put the satellite into orbit.', size: 34, gap: 14 },
    { t: '1. Field Probe: how g changes with distance.', size: 32, color: '#cfe3ff' },
    { t: '2. Into Orbit: launch at exactly the right speed.', size: 32, color: '#cfe3ff' },
    { t: '3. Geostationary: park it over Zimbabwe for good.', size: 32, color: '#cfe3ff', gap: 14 },
    { rule: true },
    { t: input.kind === 'hand' ? 'Touch buttons with your fingertip. Pinch a slider knob and slide it. For far things, point and pinch.'
      : input.kind === 'controller' ? 'Touch buttons with the controller tip, or point and pull the trigger. Hold the trigger on a slider knob to slide it.'
        : 'Click buttons. Drag a slider knob. Drag the background to look around.', size: 30, color: '#ffd34d' },
    { t: `Choose a mission on the console in front of you (${w.select}).`, size: 30, color: '#ffd34d' },
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
    { t: 'centripetal force  F = mv² / r = mrω²', size: 32 },
    { rule: true },
    { t: `Your stars:  1 ${starText(stars[0])}   2 ${starText(stars[1])}   3 ${starText(stars[2])}`, size: 30, color: '#9fe2bf' },
  ], { title: 'Mission control' });
}
onKindChange(() => { if (!current) drawWelcome(); else current.redraw?.(); });

// ================================================================= Mission 1: Field Probe
const m1 = {
  title: 'Mission 1: Field Probe', short: 'Field Probe', rDisp: 0.28,
  controls: new THREE.Group(), world: new THREE.Group(),
  need: [1, 2, 3, 4], rec: {}, wrong: 0, phase: 'probe',
};
missions.push(m1);
panel.add(m1.controls); sys.add(m1.world);
{
  // radial field lines (in 3D) pointing in to the centre
  const fl = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.28 });
  const dirs = [];
  for (let i = 0; i < 26; i++) {      // Fibonacci sphere
    const y = 1 - (i + 0.5) / 26 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  for (const d of dirs) {
    const g = new THREE.BufferGeometry().setFromPoints([d.clone().multiplyScalar(0.29), d.clone().multiplyScalar(0.85)]);
    fl.add(new THREE.Line(g, lineMat));
    const cone = mesh(new THREE.ConeGeometry(0.012, 0.035, 8), basic(0x6fa8ff, { transparent: true, opacity: 0.6 }));
    cone.position.copy(d).multiplyScalar(0.6);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().negate());
    fl.add(cone);
  }
  m1.world.add(noHit(fl));
  // the rail and its distance marks
  const rail = mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.15, 8), mat(0x9fb6cc));
  rail.rotation.z = Math.PI / 2; rail.position.x = 0.28 + 1.15 / 2;
  m1.world.add(noHit(rail));
  for (let k = 1; k <= 5; k++) {
    const tick = mesh(new THREE.BoxGeometry(0.005, 0.06, 0.005), basic(0xffffff), k * 0.28, 0, 0);
    m1.world.add(noHit(tick));
    const t = textSprite(`${k}R`, { size: 0.045 });
    t.position.set(k * 0.28, -0.08, 0);
    m1.world.add(t);
  }
  m1.probe = new THREE.Group();
  m1.probe.add(mesh(new THREE.OctahedronGeometry(0.03), mat(0xffc93c, { emissive: 0x553300 })));
  m1.probe.add(mesh(new THREE.TorusGeometry(0.04, 0.004, 8, 24), basic(0xffffff)));
  m1.world.add(noHit(m1.probe));
  m1.gArrow = arrow(0xff4d4d, { radius: 0.007, head: 0.03 });
  m1.gArrow.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 900; } });
  m1.world.add(m1.gArrow);
  m1.probeLabel = textSprite('', { size: 0.045 });
  m1.world.add(m1.probeLabel);

  m1.slider = slider({ name: 'Distance r', min: 1, max: 5, step: 0.1, fine: 0.1, value: 1.5, length: 0.4, labelW: 0.42,
    format: (v) => `${v.toFixed(1)} R`, onChange: () => m1.update(), enabled: () => m1.phase === 'probe' });
  m1.slider.group.position.set(-0.12, 0.07, 0);
  m1.controls.add(m1.slider.group);
  m1.recordBtn = actionButton('Record reading', 0.3, 0.09, () => m1.record(), { bg: '#1e8449', size: 30 });
  m1.recordBtn.position.set(-0.12, -0.08, 0);
  m1.controls.add(m1.recordBtn);
}
m1.enter = function () {
  this.rec = {}; this.wrong = 0; this.phase = 'probe';
  this.slider.set(1.5, true); this.slider.setEnabled();
  this.recordBtn.visible = true;
  this.update(); this.redraw();
};
m1.gAt = (rR) => GM / Math.pow(rR * R, 2);
m1.update = function () {
  const rR = this.slider.value;
  const p = new THREE.Vector3(rR * 0.28 + 0.035, 0, 0);
  this.probe.position.copy(p);
  const g = this.gAt(rR);
  this.gArrow.userData.set(p, new THREE.Vector3(-0.03 * g, 0, 0));
  this.probeLabel.position.set(p.x, 0.11, 0);
  this.probeLabel.userData.set(`g = ${g.toFixed(2)} N/kg`);
  this.drawData();
};
m1.drawData = function () {
  const rR = this.slider.value, r = rR * R, g = this.gAt(rR), phi = -GM / r;
  const rows = this.need.map((k) => this.rec[k] ? { k, g: this.rec[k] } : null).filter(Boolean);
  const done = rows.length === this.need.length;
  data.userData.draw([
    { t: `Distance from Earth's centre:  r = ${rR.toFixed(1)} R = ${sig(r)} m`, size: 32 },
    { t: `Field strength:  g = GM / r² = ${g.toFixed(2)} N/kg`, size: 34, bold: true, color: '#ff9b9b' },
    { t: `Potential:  φ = −GM / r = ${sig(phi)} J/kg`, size: 32, color: '#cfe3ff' },
    { rule: true },
    done ? { fn: (ctx, x, y, w) => drawGraph(ctx, x, y, w, 330, rows) } :
      { t: 'Record g at 1R, 2R, 3R and 4R to plot a graph here.', size: 30, color: '#9fb6cc' },
  ], { title: 'Probe readings' });
};
function drawGraph(ctx, x, y, w, h, rows) {
  const L = x + 70, B = y + h - 40, Wd = w - 90, Ht = h - 60;
  ctx.strokeStyle = '#9fb6cc'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(L, y + 10); ctx.lineTo(L, B); ctx.lineTo(L + Wd, B); ctx.stroke();
  ctx.fillStyle = '#9fb6cc'; ctx.font = '26px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (let k = 1; k <= 5; k++) ctx.fillText(`${k}R`, L + (k / 5) * Wd, B + 30);
  ctx.save(); ctx.translate(x + 20, y + Ht / 2 + 10); ctx.rotate(-Math.PI / 2); ctx.fillText('g / N kg⁻¹', 0, 0); ctx.restore();
  ctx.textAlign = 'right';
  for (const gv of [0, 5, 10]) ctx.fillText(String(gv), L - 8, B - (gv / 10) * Ht + 8);
  ctx.strokeStyle = '#ff9b9b'; ctx.lineWidth = 3; ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const rr = 1 + i * 0.04, gx = L + (rr / 5) * Wd, gy = B - (g0 / (rr * rr) / 10) * Ht;
    i ? ctx.lineTo(gx, gy) : ctx.moveTo(gx, gy);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffd34d';
  for (const r of rows) { ctx.beginPath(); ctx.arc(L + (r.k / 5) * Wd, B - (r.g / 10) * Ht, 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 28px system-ui, sans-serif';
  ctx.fillText('g ∝ 1/r²  (an inverse-square law)', L + 120, y + 40);
  return y + h;
}
m1.redraw = function () {
  if (Q.active || this.phase === 'done') return;
  const w = words();
  const rows = this.need.map((k) => `${k}R`.padEnd(4) + (this.rec[k] ? `   g = ${this.rec[k].toFixed(2)} N/kg    g × r² = ${sig(this.rec[k] * Math.pow(k * R, 2))}` : '   …'));
  info.userData.draw([
    { t: 'A probe on a rail measures Earth\'s gravitational field strength g (force per kilogram). The red arrow shows the pull on it.', size: 32, gap: 12 },
    { t: `Slide the probe to 1R, 2R, 3R and 4R (pinch the yellow knob and slide, or use − and +). At each one, ${w.select} "Record reading".`, size: 32, color: '#ffd34d', gap: 12 },
    { rule: true },
    { t: 'Your readings', size: 32, bold: true },
    ...rows.map((t) => ({ t, size: 30, color: '#cfe3ff', gap: 4 })),
  ], { title: this.title });
};
m1.record = function () {
  const rR = Math.round(this.slider.value * 10) / 10;
  if (!this.need.includes(rR)) { sfx.bad(); toast(`The probe is at ${rR.toFixed(1)}R. Move it to ${this.need.filter((k) => !this.rec[k]).map((k) => k + 'R').join(', ')} first.`, 'warn'); return; }
  if (this.rec[rR]) { toast(`${rR}R is already recorded.`, 'info', 2); return; }
  this.rec[rR] = this.gAt(rR);
  sfx.good();
  const left = this.need.filter((k) => !this.rec[k]);
  toast(left.length ? `Recorded g at ${rR}R. Next: ${left.map((k) => k + 'R').join(', ')}` : 'All four recorded. Look at the graph on the right.', 'good', 2.5);
  this.redraw(); this.drawData();
  if (!left.length) this.questions();
};
m1.questions = async function () {
  this.phase = 'quiz';
  this.slider.setEnabled();
  this.recordBtn.visible = false;
  await wait(2.5);
  if (current !== this) return;
  this.controls.visible = false;
  const go = (o) => (current === this ? Q.ask(o) : Promise.resolve(true));
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
  const n = ok === 3 ? 3 : ok === 2 ? 2 : 1;
  finishMission(this, n, [
    { t: `You answered ${ok} of 3 questions right first time.`, size: 32 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Field strength g = GM/r²: an inverse-square law, with r from the centre.', size: 30 },
    { t: '• Potential φ = −GM/r: work done per kg to bring a mass from infinity. It is negative and goes as 1/r.', size: 30 },
  ]);
};
m1.tick = function (dt) { earth.rotation.y += dt * 0.05; };

// ================================================================= Mission 2: Into Orbit
const H2 = 400e3;                       // launch height: the ISS's orbit
const r2 = R + H2;
const vCirc2 = Math.sqrt(GM / r2);       // 7.67 km/s
const vEsc2 = Math.sqrt(2 * GM / r2);
const T2 = 2 * Math.PI * r2 / vCirc2;    // about 93 minutes
const WARP2 = T2 / 13;                   // one circular orbit takes 13 s
const m2 = {
  title: 'Mission 2: Into Orbit', short: 'Into Orbit', rDisp: 0.5,
  controls: new THREE.Group(), world: new THREE.Group(),
  phase: 'aim', launches: 0, hints: 0, result: null,
  pos: new THREE.Vector3(), vel: new THREE.Vector3(), simT: 0, angle: 0, lastAng: 0,
};
missions.push(m2);
panel.add(m2.controls); sys.add(m2.world);
{
  m2.sat = makeSatellite(); m2.world.add(m2.sat);
  m2.trail = trail(0xffe08a, 3000, m2.world);
  m2.vArrow = arrow(0x3ddc84); m2.gArrow = arrow(0xff4d4d); m2.cArrow = arrow(0xffd34d, { radius: 0.004, head: 0.025 });
  m2.world.add(m2.vArrow, m2.gArrow, m2.cArrow);
  for (const a of [m2.vArrow, m2.gArrow, m2.cArrow]) a.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 900; } });
  m2.vLabel = textSprite('velocity', { size: 0.035, color: '#3ddc84' });
  m2.gLabel = textSprite('gravity', { size: 0.035, color: '#ff8080' });
  m2.world.add(m2.vLabel, m2.gLabel);
  // a faint guide circle at the launch height
  const pts = [];
  for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(r2 / R * 0.5)); }
  m2.guide = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x8fb3d9, dashSize: 0.02, gapSize: 0.02, transparent: true, opacity: 0.5 }));
  m2.guide.computeLineDistances();
  m2.world.add(noHit(m2.guide));
  m2.boom = mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0, depthWrite: false }));
  m2.world.add(noHit(m2.boom));

  m2.slider = slider({ name: 'Launch speed', min: 5, max: 12, step: 0.05, fine: 0.01, value: 6, length: 0.4, labelW: 0.42,
    format: (v) => `${v.toFixed(2)} km/s`, onChange: () => { if (m2.phase === 'aim-after') m2.reset(); else m2.drawData(); }, enabled: () => m2.phase !== 'flying' && m2.phase !== 'quiz' });
  m2.slider.group.position.set(-0.12, 0.08, 0);
  m2.controls.add(m2.slider.group);
  m2.launchBtn = actionButton('LAUNCH', 0.2, 0.09, () => m2.launch(), { bg: '#c0392b', size: 34 });
  m2.launchBtn.position.set(-0.28, -0.08, 0);
  m2.resetBtn = actionButton('Reset', 0.15, 0.09, () => m2.reset(), { bg: '#5b6b78', size: 28 });
  m2.resetBtn.position.set(-0.08, -0.08, 0);
  m2.hintBtn = actionButton('Hint', 0.15, 0.09, () => m2.hint(), { bg: '#8e44ad', size: 28 });
  m2.hintBtn.position.set(0.09, -0.08, 0);
  m2.controls.add(m2.launchBtn, m2.resetBtn, m2.hintBtn);
}
m2.enter = function () {
  this.launches = 0; this.hints = 0; this.result = null;
  this.slider.set(6, true);
  this.reset();
};
const TH0 = -3 * Math.PI / 4;           // launch point: front-left of the Earth, as the learner sees it
const POS0 = new THREE.Vector3(Math.cos(TH0), 0, -Math.sin(TH0));
const DIR0 = new THREE.Vector3(-Math.sin(TH0), 0, -Math.cos(TH0));   // eastward
m2.reset = function () {
  this.phase = 'aim';
  this.pos.copy(POS0).multiplyScalar(r2); this.vel.copy(DIR0);
  this.trail.clear();
  this.sat.visible = true; this.boom.material.opacity = 0;
  this.slider.setEnabled(); this.launchBtn.userData.setOn(true);
  this.place(); this.redraw(); this.drawData();
};
m2.hint = function () {
  if (this.hints >= 3) { toast('That is all the hints. Use v = √(GM/r).', 'info', 2.5); return; }
  this.hints++; sfx.blip(); this.redraw();
};
m2.place = function () {
  const p = this.pos.clone().multiplyScalar(S);
  this.sat.position.copy(p);
  const v = this.phase === 'aim' ? this.slider.value * 1000 : this.vel.length();
  const vdir = this.phase === 'aim' ? DIR0.clone() : this.vel.clone().normalize();
  const r = this.pos.length();
  const g = GM / (r * r), need = v * v / r;
  this.vArrow.userData.set(p, vdir.multiplyScalar(v / 1000 * 0.03));
  const inward = this.pos.clone().normalize().negate();
  const side = this.vel.lengthSq() ? this.vel.clone().normalize() : DIR0.clone();
  this.gArrow.userData.set(p.clone().addScaledVector(side, 0.012), inward.clone().multiplyScalar(g * 0.025));
  this.cArrow.visible = this.phase === 'aim' || this.phase === 'flying';
  this.cArrow.userData.set(p.clone().addScaledVector(side, -0.012), inward.multiplyScalar(need * 0.025));
  this.vLabel.position.copy(p).addScaledVector(vdir, v / 1000 * 0.03 + 0.05);
  this.gLabel.position.copy(p).addScaledVector(this.pos.clone().normalize(), -0.12).add(new THREE.Vector3(0, 0.05, 0));
  this.vLabel.visible = this.gLabel.visible = this.phase === 'aim';
};
m2.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const hintLines = [
    'Hint 1: for a circular orbit, gravity provides the centripetal force: GMm/r² = mv²/r.',
    `Hint 2: r is measured from Earth's centre: r = R + h = 6.40 × 10⁶ + 4.0 × 10⁵ = ${sig(r2)} m.`,
    `Hint 3: v = √(GM/r) = √(${sig(GM)} / ${sig(r2)}) = ${(vCirc2 / 1000).toFixed(2)} km/s.`,
  ].slice(0, this.hints);
  const res = this.result;
  info.userData.draw([
    { t: 'Launch the satellite sideways from 400 km above Earth (the height of the International Space Station).', size: 32, gap: 10 },
    { t: 'Goal: a circular orbit. Work out the speed, set it on the slider, then press LAUNCH.', size: 32, color: '#ffd34d', gap: 10 },
    ...DATA_LINES.map((d) => ({ ...d, size: 28, gap: 2 })),
    { t: 'Height h = 400 km = 4.0 × 10⁵ m', size: 28, color: '#cfe3ff' },
    ...hintLines.map((t) => ({ t, size: 28, color: '#e0b3ff', gap: 4 })),
    res && { rule: true },
    res && { t: res.text, size: 30, color: res.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m2.drawData = function () {
  const flying = this.phase !== 'aim';
  const r = this.pos.length(), v = flying ? this.vel.length() : this.slider.value * 1000;
  const g = GM / (r * r), need = v * v / r;
  const mins = this.simT / 60;
  data.userData.draw([
    { t: `Speed  v = ${(v / 1000).toFixed(2)} km/s`, size: 34, bold: true, color: '#3ddc84' },
    { t: `Height  h = ${Math.round((r - R) / 1000).toLocaleString('en-GB')} km     r = ${sig(r)} m`, size: 30 },
    { rule: true },
    { t: `Gravity per kg   g = GM/r² = ${g.toFixed(2)} N/kg`, size: 32, color: '#ff8080' },
    { t: `Needed for a circle   v²/r = ${need.toFixed(2)} m/s²`, size: 32, color: '#ffd34d' },
    { t: Math.abs(g - need) / g < 0.03 ? 'Equal: gravity provides exactly the centripetal force.' : g > need ? 'Gravity is MORE than needed: the path curves in.' : 'Gravity is LESS than needed: the path swings out.', size: 30, color: '#cfe3ff' },
    { rule: true },
    { t: flying ? `Flight time ${mins.toFixed(0)} min     launches ${this.launches}` : `Launches so far: ${this.launches}`, size: 30, color: '#9fb6cc' },
    { t: 'Red arrow: gravitational pull. Yellow arrow: the pull a circle would need. Green: velocity.', size: 26, color: '#9fb6cc' },
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
m2.launch = function () {
  if (this.phase === 'flying') return;
  const v = this.slider.value * 1000;
  this.launches++;
  this.phase = 'flying';
  this.result = null;
  this.outcome = this.classify(v);
  this.pos.copy(POS0).multiplyScalar(r2); this.vel.copy(DIR0).multiplyScalar(v);
  this.simT = 0; this.angle = 0; this.lastAng = Math.atan2(-this.pos.z, this.pos.x);
  this.trail.clear(); this.trail.push(this.pos.clone().multiplyScalar(S));
  this.sat.visible = true; this.boom.material.opacity = 0;
  this.slider.setEnabled(); this.launchBtn.userData.setOn(false);
  sfx.launch(); toast(`Launched at ${(v / 1000).toFixed(2)} km/s`, 'info', 2);
  this.redraw(); this.drawData();
};
m2.finish = function (kind) {
  const v = this.slider.value, vc = (vCirc2 / 1000).toFixed(2);
  const r = this.outcome;
  let text = '', ok = false;
  if (kind === 'crash') text = `Crashed! At ${v.toFixed(2)} km/s gravity is more than the centripetal force a circle needs (GMm/r² > mv²/r), so the path curves in too much and hits Earth. Go faster.`;
  else if (kind === 'escape' && r.kind === 'escape') text = `Lost in space! ${v.toFixed(2)} km/s is above the escape speed here (${(vEsc2 / 1000).toFixed(2)} km/s), so gravity can never pull it back. Go much slower.`;
  else if (kind === 'escape') text = `Far too fast. Gravity is much less than a circle needs, so it swings out on a long ellipse to ${Math.round(r.hMax).toLocaleString('en-GB')} km, far off the screen. Go slower.`;
  else if (r.kind === 'low') text = `Close, but the orbit is an ellipse. Gravity was a little more than needed, so it dropped to ${Math.round(r.hMin)} km on the far side. Go a little faster.`;
  else if (r.kind === 'high') text = `Close, but the orbit is an ellipse. Gravity was less than needed, so it swung out to ${Math.round(r.hMax).toLocaleString('en-GB')} km on the far side. Go a little slower.`;
  else { ok = true; text = `Circular orbit! At ${v.toFixed(2)} km/s (ideal ${vc} km/s) gravity provides exactly the centripetal force all the way round. One orbit takes about ${Math.round(T2 / 60)} minutes.`; }
  this.result = { ok, text };
  if (ok) { sfx.great(); toast('Circular orbit achieved!', 'good', 3); } else { sfx.bad(); toast(kind === 'crash' ? 'Crashed into Earth' : kind === 'escape' ? 'Escaped from Earth' : 'Not circular yet', 'bad', 2.5); }
  if (!ok) this.phase = 'aim-after';
  this.slider.setEnabled(); this.launchBtn.userData.setOn(true);
  this.redraw();
  if (ok) this.questions();
};
m2.questions = async function () {
  this.phase = 'quiz';
  this.slider.setEnabled(); this.launchBtn.userData.setOn(false);
  await wait(4);
  if (current !== this) return;
  this.controls.visible = false;
  const go = (o) => (current === this ? Q.ask(o) : Promise.resolve(true));
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
m2.tick = function (dt) {
  earth.rotation.y += dt * WARP2 * 2 * Math.PI / DAY;
  if (this.phase === 'flying' || this.phase === 'aim-after' || this.phase === 'quiz' || this.phase === 'done') {
    if (this.sat.visible && this.phase !== 'aim') this.integrate(dt * WARP2);
  }
  if (this.boom.material.opacity > 0) {
    this.boom.material.opacity = Math.max(0, this.boom.material.opacity - dt * 0.8);
    this.boom.scale.multiplyScalar(1 + dt * 1.5);
  }
  this.place();
  this.dataT = (this.dataT || 0) + dt;
  if (this.dataT > 0.3) { this.dataT = 0; if (this.phase === 'flying') this.drawData(); }
};
const _acc = new THREE.Vector3();
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
      this.boom.position.copy(this.pos).multiplyScalar(S);
      this.boom.scale.setScalar(0.02); this.boom.material.opacity = 0.9;
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
const m3 = {
  title: 'Mission 3: Geostationary', short: 'Geostationary', rDisp: 0.25,
  controls: new THREE.Group(), world: new THREE.Group(),
  phase: 'aim', launches: 0, east: true, equatorial: true, simT: 0, result: null,
};
missions.push(m3);
panel.add(m3.controls); sys.add(m3.world);
{
  m3.sat = makeSatellite(); m3.sat.scale.setScalar(0.8); m3.world.add(m3.sat);
  m3.trail = trail(0xffe08a, 2000, m3.world);
  m3.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x3ddc84 }));
  m3.beam.frustumCulled = false;
  m3.world.add(noHit(m3.beam));
  // ground track: where the satellite is overhead, drawn on the Earth (it turns with the Earth)
  m3.trackPts = new Float32Array(800 * 3);
  m3.trackGeo = new THREE.BufferGeometry();
  m3.trackGeo.setAttribute('position', new THREE.BufferAttribute(m3.trackPts, 3));
  m3.trackGeo.setDrawRange(0, 0);
  m3.track = new THREE.Points(m3.trackGeo, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.018, sizeAttenuation: true }));
  m3.track.frustumCulled = false;
  earth.add(noHit(m3.track));
  m3.clock = textSprite('', { size: 0.04 });
  m3.clock.position.set(0, 0.42, 0);
  m3.world.add(m3.clock);

  m3.slider = slider({ name: 'Orbit height', min: 1000, max: 50000, step: 100, fine: 10, value: 20000, length: 0.4, labelW: 0.42,
    format: (v) => `${Math.round(v).toLocaleString('en-GB')} km`, onChange: () => { m3.preview(); m3.drawData(); }, enabled: () => m3.phase !== 'flying' && m3.phase !== 'quiz' });
  m3.slider.group.position.set(-0.12, 0.1, 0);
  m3.controls.add(m3.slider.group);
  m3.dirBtn = actionButton('', 0.2, 0.07, () => { m3.east = !m3.east; m3.drawToggles(); m3.preview(); }, { bg: '#2c6e91', size: 24, name: 'Change orbit direction' });
  m3.dirBtn.position.set(-0.28, 0.0, 0);
  m3.planeBtn = actionButton('', 0.2, 0.07, () => { m3.equatorial = !m3.equatorial; m3.drawToggles(); m3.preview(); }, { bg: '#2c6e91', size: 24, name: 'Change orbit plane' });
  m3.planeBtn.position.set(-0.06, 0.0, 0);
  m3.launchBtn = actionButton('LAUNCH', 0.2, 0.08, () => m3.launch(), { bg: '#c0392b', size: 34 });
  m3.launchBtn.position.set(-0.28, -0.1, 0);
  m3.resetBtn = actionButton('Reset', 0.15, 0.08, () => m3.reset(), { bg: '#5b6b78', size: 28 });
  m3.resetBtn.position.set(-0.08, -0.1, 0);
  m3.controls.add(m3.dirBtn, m3.planeBtn, m3.launchBtn, m3.resetBtn);
}
m3.drawToggles = function () {
  const on = this.phase !== 'flying' && this.phase !== 'quiz';
  this.dirBtn.userData.setOn(on); this.planeBtn.userData.setOn(on);
  this.dirBtn.userData.draw(`Direction: ${this.east ? 'eastward' : 'westward'}`, on ? '#2c6e91' : '#4a5663');
  this.planeBtn.userData.draw(this.equatorial ? 'Plane: equator' : 'Plane: tilted 18°', on ? '#2c6e91' : '#4a5663');
};
m3.enter = function () {
  this.launches = 0; this.east = false; this.equatorial = false; this.result = null;
  this.slider.set(20000, true);
  this.reset();
};
m3.reset = function () {
  this.phase = 'aim'; this.simT = 0;
  this.trail.clear(); this.trackGeo.setDrawRange(0, 0); this.trackN = 0;
  // start with Harare on the front-right of the Earth, so the satellite above it is in clear view
  this.earth0 = -Math.PI / 6 - Math.atan2(-harareN.z, harareN.x);
  earth.rotation.y = this.earth0;
  this.slider.setEnabled(); this.launchBtn.userData.setOn(true); this.drawToggles();
  this.clock.userData.set('Day 0, 00:00');
  this.preview(); this.redraw(); this.drawData();
};
// orbit geometry at the moment of launch: p̂0 is the satellite's start direction (above Harare's longitude,
// or above Harare itself on the tilted plane), ê0 the direction it starts to move.
m3.frame0 = function () {
  earth.updateMatrixWorld(true);
  const m = harareN.clone().setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), earth.rotation.y);  // meridian, sys frame
  const tilt = this.equatorial ? 0 : HARARE.lat * Math.PI / 180;
  const p0 = m.clone().multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt), 0));
  const east = new THREE.Vector3(0, 1, 0).cross(m).normalize();     // eastward = +y × meridian
  // keep the tilted plane perpendicular to the meridian (so it passes over Harare at its southernmost point)
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
  this.updateBeam();
  this.drawData();
};
const _dw = new THREE.Vector3(), _sw = new THREE.Vector3(), _nl = new THREE.Vector3();
m3.updateBeam = function () {
  pin.getWorldPosition(_dw); this.sat.getWorldPosition(_sw);
  const n = _nl.copy(harareN).transformDirection(earth.matrixWorld);
  const visible = _sw.clone().sub(_dw).dot(n) > 0;
  sys.worldToLocal(_dw); sys.worldToLocal(_sw);
  const a = this.beam.geometry.attributes.position;
  a.setXYZ(0, _dw.x, _dw.y, _dw.z); a.setXYZ(1, _sw.x, _sw.y, _sw.z); a.needsUpdate = true;
  this.beam.visible = visible;
  return visible;
};
m3.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const res = this.result;
  info.userData.draw([
    { t: 'A TV satellite must stay above the same place all the time, so that dishes in Zimbabwe never have to move. That is a geostationary orbit.', size: 31, gap: 10 },
    { t: 'Choose the height, the direction and the orbit plane, then LAUNCH. Watch it for one day (24 s).', size: 31, color: '#ffd34d', gap: 10 },
    { t: 'Earth turns once in T = 24 h = 86 400 s. Hint: GMm/r² = mrω² with ω = 2π/T, so r³ = GMT²/4π². Remember h = r − R.', size: 28, color: '#cfe3ff', gap: 10 },
    { t: 'The yellow dots on the Earth show the point directly under the satellite (its ground track).', size: 28, color: '#cfe3ff' },
    res && { rule: true },
    res && { t: res.text, size: 30, color: res.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m3.drawData = function () {
  const r = this.slider.value * 1000 + R;
  const flying = this.phase !== 'aim';
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
    { t: 'Green line: the Harare dish can see the satellite.', size: 26, color: '#9fb6cc' },
  ], { title: 'Satellite data' });
};
m3.launch = function () {
  if (this.phase === 'flying') return;
  this.launches++;
  this.phase = 'flying'; this.result = null; this.simT = 0;
  earth.rotation.y = this.earth0;
  this.f0 = this.frame0();
  this.trail.clear(); this.trackGeo.setDrawRange(0, 0); this.trackN = 0;
  this.maxLon = 0; this.maxLat = 0; this.lostSight = false; this.trackT = 0;
  this.slider.setEnabled(); this.launchBtn.userData.setOn(false); this.drawToggles();
  sfx.launch(); toast('Launched. Watching for one day…', 'info', 2);
  this.redraw(); this.drawData();
};
const _ll = new THREE.Vector3();
m3.tick = function (dt) {
  if (this.phase === 'aim') { this.updateBeam(); return; }
  this.simT += dt * WARP3;
  earth.rotation.y = this.earth0 + 2 * Math.PI * this.simT / DAY;
  earth.updateMatrixWorld(true);
  const p = this.satPos(this.simT);
  this.sat.position.copy(p).multiplyScalar(S);
  this.trail.push(this.sat.position);
  const vis = this.updateBeam();
  // where the satellite is over (Earth's own frame)
  _ll.copy(p).applyAxisAngle(new THREE.Vector3(0, 1, 0), -earth.rotation.y);
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
  if (ok) { sfx.great(); toast('Geostationary orbit achieved!', 'good', 3); this.phase = 'quiz'; }
  else { sfx.bad(); toast('Not geostationary yet', 'bad', 2.5); this.phase = 'after'; }
  this.slider.setEnabled(); this.launchBtn.userData.setOn(!ok); this.drawToggles();
  this.redraw(); this.drawData();
  if (ok) this.questions();
};
m3.questions = async function () {
  await wait(4);
  if (current !== this) return;
  this.controls.visible = false;
  const go = (o) => (current === this ? Q.ask(o) : Promise.resolve(true));
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

// ---------------------------------------------------------------- menu buttons
missions.forEach((m, i) => {
  const b = actionButton(`${i + 1}. ${m.short}`, 0.27, 0.13, () => startMission(i), { bg: ['#1f6fb2', '#b9770e', '#1e8449'][i], size: 28, name: `Start ${m.title}` });
  b.position.set(-0.36 + i * 0.29, 0.0, 0);
  menuGroup.add(b);
  missionButtons.push(b);
});

// ---------------------------------------------------------------- loop
onFrame((dt) => {
  keepMarkerSizes();
  if (current) { current.tick(dt); }
  else earth.rotation.y += dt * 0.08;
});
openMenu();
start();

// Test hook (used by the automated browser tests; harmless for players).
window.lesson = { missions, startMission, openMenu, get current() { return current; }, Q, info, data, earth, sys, consts: { G, M, R, GM, vCirc2, vEsc2, H_GEO_KM, R_GEO, T2 },
  input, scene, camera, renderer, THREE, get stars() { return stars; }, speed: 1, panel, toast, missionButtons, nextBtn, menuBtn, restartBtn };
