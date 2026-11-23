// Field Lab: an A-Level (Form 6) physics VR game on electromagnetism.
// Four missions: Motor Effect (Fleming's left-hand rule, F = BIL sin θ), Particle Paths (F = Bqv, r = mv/Bq),
// Mass Spectrometer (velocity selector E = vB, then r = mv/Bq) and Induction (Faraday's and Lenz's laws).
// Runs in the Meta Quest Browser (hands or controllers) and on a computer.
import {
  THREE, scene, renderer, input, mat, basic, mesh, noHit, sig, board, textSprite, arrow,
  actionButton, slider, toaster, quiz, makeInteractive, sfx, tween, wait, onFrame, start, words,
  view, onKindChange, shuffle, closestOnLineToRay, clamp, camera,
} from './kit.js';

const V3 = THREE.Vector3;
const E_CH = 1.6e-19, U = 1.66e-27;

// ---------------------------------------------------------------- the lab
scene.background = new THREE.Color(0x1a2330);
scene.fog = new THREE.Fog(0x1a2330, 7, 16);
scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x3a3a40, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(1.5, 4, 2);
scene.add(key);
view.desktopPos.set(0, 0.05, 1.0);
view.desktopPitch = -0.3;

(function room() {
  const floorC = document.createElement('canvas'); floorC.width = floorC.height = 256;
  const fx = floorC.getContext('2d');
  fx.fillStyle = '#3b4552'; fx.fillRect(0, 0, 256, 256);
  fx.strokeStyle = '#323b47'; fx.lineWidth = 4;
  for (let i = 0; i <= 256; i += 64) { fx.beginPath(); fx.moveTo(i, 0); fx.lineTo(i, 256); fx.stroke(); fx.beginPath(); fx.moveTo(0, i); fx.lineTo(256, i); fx.stroke(); }
  const ft = new THREE.CanvasTexture(floorC); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(8, 8); ft.colorSpace = THREE.SRGBColorSpace;
  const floor = mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshLambertMaterial({ map: ft }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(noHit(floor));
  const wallM = new THREE.MeshLambertMaterial({ color: 0x46556a });
  const back = mesh(new THREE.PlaneGeometry(14, 4), wallM, 0, 2, -3.2);
  scene.add(noHit(back));
  for (const s of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(10, 4), wallM, s * 4, 2, 0); w.rotation.y = -s * Math.PI / 2; scene.add(noHit(w)); }
  // poster: the left-hand rule
  const p = board(1.2, 0.5, { bg: 'rgba(245,240,225,0.97)', frame: 0x8a6d3b });
  p.position.set(0, 2.45, -3.15);
  scene.add(p);
  p.userData.draw([
    { t: "Fleming's LEFT-hand rule (motors)", size: 54, bold: true, color: '#7a2e12', center: true },
    { t: 'thuMb = Motion (force)    First finger = Field    seCond finger = Current', size: 38, color: '#2b2b2b', center: true },
    { t: 'F = BIL sin θ        F = Bqv        r = mv / Bq        E = −N dΦ/dt', size: 40, color: '#1f4e79', center: true, bold: true },
  ]);
  // table
  const tableTop = mesh(new THREE.BoxGeometry(1.4, 0.04, 0.75), new THREE.MeshLambertMaterial({ color: 0x2f3b48 }), 0, 0.93, -0.82);
  scene.add(noHit(tableTop));
  for (const [x, z] of [[-0.65, -0.5], [0.65, -0.5], [-0.65, -1.15], [0.65, -1.15]]) scene.add(noHit(mesh(new THREE.BoxGeometry(0.05, 0.92, 0.05), new THREE.MeshLambertMaterial({ color: 0x232c36 }), x, 0.46, z)));
})();

// control panel at the front of the table, in easy reach
const panelStand = mesh(new THREE.BoxGeometry(1.0, 0.82, 0.12), mat(0x1f2a36, { metalness: 0.4 }), 0, 0.41, -0.33);
scene.add(noHit(panelStand));
const panel = new THREE.Group();
panel.position.set(0, 0.92, -0.36);
panel.rotation.x = -0.75;
scene.add(panel);
panel.add(noHit(mesh(new THREE.BoxGeometry(1.08, 0.4, 0.03), mat(0x16202b, { metalness: 0.3 }), 0, 0, -0.03)));
panel.add(noHit(mesh(new THREE.BoxGeometry(1.08, 0.006, 0.032), basic(0x3fa7ff), 0, 0.2, -0.03)));

// boards
const info = board(1.0, 0.8);
info.position.set(-0.98, 1.55, -1.0); info.rotation.y = 0.72;
scene.add(info);
const data = board(1.0, 0.8);
data.position.set(0.98, 1.55, -1.0); data.rotation.y = -0.72;
scene.add(data);
const toastHolder = new THREE.Group();
toastHolder.position.set(0, 1.98, -1.3);
scene.add(toastHolder);
const toast = toaster(toastHolder, 0.95, 0.13);

const answerGroup = new THREE.Group();
answerGroup.position.set(-0.08, -0.02, 0.001);
panel.add(answerGroup);
const Q = quiz({ textBoard: info, answerGroup, w: 0.3, h: 0.1, gapX: 0.34, gapY: 0.13, toast });

const menuBtn = actionButton('Menu', 0.15, 0.06, () => openMenu(), { bg: '#5b6b78', size: 28 });
menuBtn.position.set(0.44, 0.15, 0);
panel.add(menuBtn);
const restartBtn = actionButton('Restart', 0.15, 0.06, () => current && startMission(missions.indexOf(current)), { bg: '#5b6b78', size: 28, name: 'Restart this mission' });
restartBtn.position.set(0.44, 0.075, 0);
panel.add(restartBtn);

// the apparatus sits on the table
const app = new THREE.Group();
app.position.set(0, 0.95, -0.8);
scene.add(app);

// ---------------------------------------------------------------- shared helpers
const DIRS = {
  '+x': new V3(1, 0, 0), '-x': new V3(-1, 0, 0), '+y': new V3(0, 1, 0), '-y': new V3(0, -1, 0), '+z': new V3(0, 0, 1), '-z': new V3(0, 0, -1),
};
const DIR_WORDS = { '+x': 'to the right', '-x': 'to the left', '+y': 'up', '-y': 'down', '+z': 'towards you', '-z': 'away from you' };
function dirKey(v) {
  const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
  const i = a.indexOf(Math.max(...a));
  return (v.getComponent(i) > 0 ? '+' : '-') + 'xyz'[i];
}
// A pickable 3D arrow (thick, with a generous invisible hit volume).
function pickArrow(color, len = 0.13, r = 0.009) {
  const g = new THREE.Group();
  const m = mat(color, { emissive: color, emissiveIntensity: 0.25 });
  const shaft = mesh(new THREE.CylinderGeometry(r, r, len - 0.04, 12).translate(0, (len - 0.04) / 2, 0), m);
  const head = mesh(new THREE.ConeGeometry(r * 2.8, 0.045, 16).translate(0, len - 0.0225, 0), m);
  const hit = mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 8).translate(0, len / 2, 0), new THREE.MeshBasicMaterial({ visible: false }));
  g.add(shaft, head, hit);
  g.userData.mat = m;
  g.userData.setColor = (c) => { m.color.set(c); m.emissive.set(c); };
  g.userData.point = (dir, offset = 0.045) => {
    g.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
    g.position.copy(dir).multiplyScalar(offset);
  };
  return g;
}
// A pool of small glowing balls for particles and ions.
function particlePool(n, radius, parent) {
  const geo = new THREE.SphereGeometry(radius, 8, 6);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  noHit(im);
  parent.add(im);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  return {
    im,
    set(i, p, color, s = 1) { m4.makeScale(s, s, s).setPosition(p); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(color)); },
    hide(i) { m4.makeScale(0, 0, 0); im.setMatrixAt(i, m4); },
    commit() { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; },
  };
}
function glassBox(w, h, d) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.1 })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.6 })));
  return noHit(g);
}

// ---------------------------------------------------------------- stars saved in this browser
const STORE = 'field-lab-v1';
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
function hideAll() {
  for (const m of missions) { m.controls.visible = false; m.world.visible = false; }
  Q.cancel(); toast.hide();
}
function startMission(i) {
  sfx.whoosh();
  hideAll();
  current = missions[i];
  menuGroup.visible = false; doneGroup.visible = false;
  restartBtn.visible = true;
  current.controls.visible = true; current.world.visible = true;
  current.enter();
}
const doneGroup = new THREE.Group();
panel.add(doneGroup);
doneGroup.visible = false;
const nextBtn = actionButton('Next mission', 0.3, 0.1, () => startMission(nextBtn.userData.next), { bg: '#1e8449', size: 30 });
nextBtn.position.set(-0.1, 0, 0);
const againBtn = actionButton('Play again', 0.22, 0.1, () => current && startMission(missions.indexOf(current)), { bg: '#5b6b78', size: 28 });
againBtn.position.set(0.2, 0, 0);
doneGroup.add(nextBtn, againBtn);
function finishMission(m, n, lines = []) {
  const i = missions.indexOf(m);
  saveStars(i, n);
  sfx.great();
  m.controls.visible = false;
  Q.cancel();
  info.userData.draw([
    { t: `Mission complete  ${starText(n)}`, size: 46, bold: true, color: '#ffd34d', gap: 16 },
    ...lines,
    { rule: true },
    i < missions.length - 1 ? { t: `Next: Mission ${i + 2}, ${missions[i + 1].short}. Use the green button on the panel.`, size: 32, color: '#9fe2bf' }
      : { t: 'You have finished all four missions. Excellent work!', size: 34, color: '#9fe2bf' },
  ], { title: m.title });
  doneGroup.visible = true;
  nextBtn.visible = i < missions.length - 1;
  nextBtn.userData.next = i + 1;
}
const askIfCurrent = (m) => (o) => (current === m ? Q.ask(o) : Promise.resolve(true));

const menuGroup = new THREE.Group();
panel.add(menuGroup);
const missionButtons = [];
function openMenu() {
  hideAll();
  doneGroup.visible = false;
  current = null;
  menuGroup.visible = true;
  restartBtn.visible = false;
  missionButtons.forEach((b, i) => b.userData.draw(`${i + 1}. ${missions[i].short}\n${starText(stars[i])}`));
  drawWelcome();
  data.userData.draw([
    { t: 'Data', size: 38, bold: true, color: '#ffd34d', gap: 10 },
    { t: 'e = 1.60 × 10⁻¹⁹ C       1 u = 1.66 × 10⁻²⁷ kg', size: 32, color: '#cfe3ff' },
    { t: 'mass of electron = 9.11 × 10⁻³¹ kg', size: 32, color: '#cfe3ff' },
    { t: 'mass of proton = 1.67 × 10⁻²⁷ kg', size: 32, color: '#cfe3ff' },
    { rule: true },
    { t: 'Equations', size: 34, bold: true, color: '#ffd34d' },
    { t: 'F = BIL sin θ          F = Bqv', size: 32 },
    { t: 'r = mv / Bq          E = V / d', size: 32 },
    { t: 'Φ = BA          E.m.f. = −N dΦ/dt', size: 32 },
    { rule: true },
    { t: `Stars: ${stars.map((s, i) => `${i + 1} ${starText(s)}`).join('   ')}`, size: 28, color: '#9fe2bf' },
  ], { title: 'Field Lab' });
}
function drawWelcome() {
  info.userData.draw([
    { t: 'Form 6 · Electromagnetism, induction and charged particles', size: 32, color: '#9fb6cc', gap: 14 },
    { t: 'Magnetic forces act in three dimensions. Here you can walk round them, turn them and test your predictions.', size: 33, gap: 12 },
    { t: '1. Motor Effect: predict the force on a wire.', size: 31, color: '#cfe3ff' },
    { t: '2. Particle Paths: steer charged particles onto a target.', size: 31, color: '#cfe3ff' },
    { t: '3. Mass Spectrometer: select a speed, then weigh atoms.', size: 31, color: '#cfe3ff' },
    { t: '4. Induction: push a magnet into a coil.', size: 31, color: '#cfe3ff', gap: 12 },
    { rule: true },
    { t: input.kind === 'hand' ? 'Touch buttons with your fingertip. Pinch a knob or the magnet and move it. Point and pinch for things further away.'
      : input.kind === 'controller' ? 'Touch buttons with the controller tip, or point and pull the trigger. Hold the trigger to drag a knob or the magnet.'
        : 'Click buttons and arrows. Drag knobs and the magnet. Drag the background to look around.', size: 30, color: '#ffd34d' },
    { t: `Choose a mission on the panel in front of you.`, size: 30, color: '#ffd34d' },
  ], { title: 'Field Lab' });
}
onKindChange(() => { if (!current) drawWelcome(); else current.redraw?.(); });

// ================================================================= Mission 1: Motor Effect
const m1 = { title: 'Mission 1: Motor Effect', short: 'Motor Effect', controls: new THREE.Group(), world: new THREE.Group() };
missions.push(m1);
panel.add(m1.controls); app.add(m1.world);
m1.world.position.set(0, 0.24, 0);
m1.world.scale.setScalar(1.2);
{
  const W = m1.world;
  m1.poleN = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat(0xd63b30));
  m1.poleS = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat(0x2f6fd6));
  m1.labelN = textSprite('N', { size: 0.05, bg: 'rgba(150,20,20,0.85)' });
  m1.labelS = textSprite('S', { size: 0.05, bg: 'rgba(20,50,150,0.85)' });
  m1.yoke = new THREE.Group();
  W.add(noHit(m1.poleN), noHit(m1.poleS), m1.labelN, m1.labelS, m1.yoke);
  m1.fieldArrows = [];
  for (let i = 0; i < 9; i++) { const a = arrow(0x7fc8ff, { radius: 0.003, head: 0.02 }); W.add(a); m1.fieldArrows.push(a); }
  m1.wire = new THREE.Group();
  m1.wireRod = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.44, 12), mat(0xd9893b, { metalness: 0.7, roughness: 0.3 }));
  m1.wire.add(noHit(m1.wireRod));
  m1.chevrons = [];
  for (let i = 0; i < 6; i++) { const c = mesh(new THREE.ConeGeometry(0.013, 0.03, 10), basic(0xffe14d)); m1.wire.add(noHit(c)); m1.chevrons.push(c); }
  m1.labelI = textSprite('current I', { size: 0.035, color: '#ffe14d' });
  W.add(m1.wire, m1.labelI);
  m1.choices = [];
  for (let i = 0; i < 4; i++) {
    const a = pickArrow(0xb9c4cf);
    W.add(a);
    const letter = 'ABCD'[i];
    const lab = textSprite(letter, { size: 0.04, bg: 'rgba(40,50,60,0.85)' });
    W.add(lab);
    const entry = { a, dir: null, lab, letter };
    makeInteractive(a, { name: `Force direction ${letter}?`, action: () => m1.pick(entry), enabled: () => m1.phase === 'predict' });
    // the same four choices as buttons on the panel (easy to reach, and never hidden behind the apparatus)
    const b = actionButton(letter, 0.16, 0.08, () => m1.pick(entry), { bg: '#46566a', size: 26, name: `Answer ${letter}` });
    b.position.set(-0.36 + i * 0.18, 0.07, 0);
    m1.controls.add(b);
    entry.btn = b;
    m1.choices.push(entry);
  }
  m1.forceArrow = arrow(0x3ddc84, { radius: 0.01, head: 0.04 });
  W.add(m1.forceArrow);
  // Fleming's left hand: three labelled axes off to the side
  m1.hand = new THREE.Group();
  m1.hand.position.set(0.36, 0.02, 0.06);
  m1.handArrows = { F: arrow(0x3ddc84, { radius: 0.006 }), B: arrow(0x7fc8ff, { radius: 0.006 }), I: arrow(0xffe14d, { radius: 0.006 }) };
  m1.handLabels = { F: textSprite('thuMb: Motion (force)', { size: 0.026, color: '#3ddc84' }), B: textSprite('First finger: Field', { size: 0.026, color: '#7fc8ff' }), I: textSprite('seCond finger: Current', { size: 0.026, color: '#ffe14d' }) };
  for (const k of ['F', 'B', 'I']) m1.hand.add(m1.handArrows[k], m1.handLabels[k]);
  m1.hand.add(noHit(mesh(new THREE.SphereGeometry(0.014, 12, 8), mat(0xf1c9a5))));
  const handTitle = textSprite("Left hand", { size: 0.03 });
  handTitle.position.set(0, -0.07, 0);
  m1.hand.add(handTitle);
  W.add(m1.hand);

  // part B: angle slider and lock-in
  m1.angle = slider({ name: 'Angle θ to the field', min: 0, max: 90, step: 1, fine: 1, value: 90, length: 0.38, labelW: 0.46,
    format: (v) => `${v.toFixed(0)}°`, onChange: () => m1.updateB(), enabled: () => m1.phase === 'angle' });
  m1.angle.group.position.set(-0.12, 0.08, 0);
  m1.lockBtn = actionButton('Lock in angle', 0.26, 0.085, () => m1.lockAngle(), { bg: '#1e8449', size: 28 });
  m1.lockBtn.position.set(-0.12, -0.08, 0);
  m1.helpBtn = actionButton('Show left hand', 0.26, 0.085, () => { m1.hints++; m1.showHand(true); sfx.blip(); }, { bg: '#8e44ad', size: 26 });
  m1.helpBtn.position.set(-0.12, -0.08, 0);
  m1.controls.add(m1.angle.group, m1.lockBtn, m1.helpBtn);
}
m1.makeRounds = function () {
  const keys = Object.keys(DIRS);
  const all = [];
  for (const b of keys) for (const i of keys) if (b[1] !== i[1]) all.push([b, i]);
  const pick = [];
  const mustZ = shuffle(all.filter(([b, i]) => b[1] === 'z' || i[1] === 'z'));
  const noZ = shuffle(all.filter(([b, i]) => b[1] !== 'z' && i[1] !== 'z'));
  pick.push(noZ[0], mustZ[0], noZ.find((r) => r[0][1] !== noZ[0][0][1]) || noZ[1], mustZ.find((r) => r[1][1] === 'z' && r !== mustZ[0]) || mustZ[1]);
  return pick;
};
m1.enter = function () {
  this.rounds = this.makeRounds();
  this.round = 0; this.firstTry = 0; this.hints = 0; this.tries = 0;
  this.angle.set(90, true);
  this.setRound();
};
m1.setRound = function () {
  const [bk, ik] = this.rounds[this.round];
  this.B = DIRS[bk].clone(); this.I = DIRS[ik].clone();
  this.F = new V3().crossVectors(this.I, this.B);      // F = I L × B
  this.phase = 'predict';
  this.tries = 0;
  this.layout(0.44);
  const opts = shuffle([this.F.clone(), this.F.clone().negate(), this.B.clone(), this.B.clone().negate()]);
  this.choices.forEach((c, i) => {
    c.dir = opts[i]; c.a.visible = true; c.a.userData.setColor(0xb9c4cf); c.a.userData.point(c.dir); c.used = false;
    c.lab.visible = true; c.lab.position.copy(c.dir).multiplyScalar(0.2); c.lab.userData.set(c.letter, '#ffffff');
    c.btn.visible = true; c.btn.userData.setOn(true); c.btn.userData.draw(`${c.letter}: ${DIR_WORDS[dirKey(c.dir)]}`, '#46566a');
  });
  this.forceArrow.visible = false;
  this.showHand(false);
  this.angle.group.visible = false; this.lockBtn.visible = false; this.helpBtn.visible = true; this.helpBtn.userData.setOn(true);
  this.redraw(); this.drawData();
};
m1.layout = function (wireLen) {
  const B = this.B;
  this.poleN.position.copy(B).multiplyScalar(-0.15);
  this.poleS.position.copy(B).multiplyScalar(0.15);
  this.labelN.position.copy(B).multiplyScalar(-0.15).add(new V3(0, 0.065, 0));
  this.labelS.position.copy(B).multiplyScalar(0.15).add(new V3(0, 0.065, 0));
  if (Math.abs(B.y) > 0.5) { this.labelN.position.add(new V3(0.07, -0.065, 0)); this.labelS.position.add(new V3(0.07, -0.065, 0)); }
  // field arrows across the gap, on a 3×3 grid
  const u = new V3(), w = new V3();
  u.copy(Math.abs(B.x) > 0.5 ? DIRS['+y'] : DIRS['+x']); w.crossVectors(B, u).normalize();
  let k = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const start = B.clone().multiplyScalar(-0.1).addScaledVector(u, i * 0.03).addScaledVector(w, j * 0.03);
    this.fieldArrows[k++].userData.set(start, B.clone().multiplyScalar(0.2));
  }
  this.wireRod.scale.y = wireLen / 0.44;
  this.wireLen = wireLen;
  this.wire.position.set(0, 0, 0);
  this.wire.quaternion.setFromUnitVectors(new V3(0, 1, 0), this.I);
  this.labelI.position.copy(this.I).multiplyScalar(wireLen / 2 + 0.03);
};
m1.showHand = function (on) {
  this.hand.visible = on;
  if (!on) return;
  const L = 0.09;
  this.handArrows.F.userData.set(new V3(), this.F.clone().multiplyScalar(L));
  this.handArrows.B.userData.set(new V3(), this.B.clone().multiplyScalar(L));
  this.handArrows.I.userData.set(new V3(), this.I.clone().multiplyScalar(L));
  for (const k of ['F', 'B', 'I']) this.handLabels[k].position.copy(this[k]).multiplyScalar(L + 0.035).add(new V3(0, 0.012, 0));
};
m1.pick = async function (entry) {
  if (this.phase !== 'predict' || entry.used) return;
  this.tries++;
  const right = entry.dir.dot(this.F) > 0.9;
  if (right) {
    this.phase = 'show';
    if (this.tries === 1) this.firstTry++;
    entry.a.userData.setColor(0x3ddc84);
    entry.btn.userData.draw(`${entry.letter}: ${DIR_WORDS[dirKey(entry.dir)]}  ✓`, '#1e8449');
    sfx.good();
    toast(`Right: the force is ${DIR_WORDS[dirKey(this.F)]}.`, 'good', 2.4);
    this.choices.forEach((c) => { if (c !== entry) { c.a.visible = false; c.lab.visible = false; c.btn.userData.setOn(false); } });
    await this.kick();
    if (current !== this) return;
    await wait(1.2);
    if (current !== this) return;
    this.round++;
    if (this.round < this.rounds.length) this.setRound(); else this.startAngle();
  } else {
    entry.used = true;
    entry.a.userData.setColor(0xd64541);
    entry.btn.userData.draw(`${entry.letter}: ${DIR_WORDS[dirKey(entry.dir)]}  ✗`, '#b03a2e');
    sfx.bad();
    const along = Math.abs(entry.dir.dot(this.B)) > 0.9;
    toast(along ? 'No: a force along the field would need current along the field too. Try again.' : 'No: that is the opposite way. Try again.', 'bad', 3);
    this.lastWrong = along ? 'along' : 'opposite';
    this.showHand(true);
    this.redraw();
  }
};
m1.kick = async function () {
  sfx.zap();
  const F = this.F;
  await tween(0.25, (k) => this.wire.position.copy(F).multiplyScalar(0.045 * k));
  await tween(0.5, (k) => this.wire.position.copy(F).multiplyScalar(0.045 * (1 - k * 0.6)));
};
m1.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const w = words();
  if (this.phase === 'angle' || this.phase === 'angleDone') {
    info.userData.draw([
      { t: 'Part B: F = BIL sin θ', size: 36, bold: true, color: '#ffd34d' },
      { t: 'Now the wire can be turned in a horizontal plane. θ is the angle between the wire (the current) and the field.', size: 31, gap: 10 },
      { t: 'Task: set the angle so that the force is exactly HALF of its biggest value, then lock it in.', size: 32, color: '#ffd34d', gap: 10 },
      { t: 'B = 0.20 T,  I = 3.0 A,  length in the field L = 5.0 cm', size: 30, color: '#cfe3ff' },
    ], { title: this.title });
    return;
  }
  info.userData.draw([
    { t: `Round ${this.round + 1} of ${this.rounds.length}`, size: 34, bold: true, color: '#ffd34d' },
    { t: 'A current flows in a wire between the poles of a magnet. The blue arrows show the field (N to S). The yellow cones show the conventional current.', size: 31, gap: 10 },
    { t: `Which way will the wire be pushed? ${w.Select} the grey arrow (A to D) that shows the force, or the matching button on the panel. Lean in or walk round to see it in 3D.`, size: 31, color: '#ffd34d', gap: 10 },
    this.lastWrong && this.tries > 0 && { t: 'Use the left hand on the right: First finger along the Field, seCond finger along the Current, and your thuMb gives the Motion.', size: 29, color: '#e0b3ff' },
  ], { title: this.title });
  this.lastWrong = null;
};
m1.drawData = function () {
  if (this.phase === 'angle' || this.phase === 'angleDone') {
    const th = this.angle.value, F = 0.2 * 3 * 0.05 * Math.sin(th * Math.PI / 180);
    data.userData.draw([
      { t: `θ = ${th.toFixed(0)}°        sin θ = ${Math.sin(th * Math.PI / 180).toFixed(3)}`, size: 34, bold: true },
      { t: `F = BIL sin θ = 0.20 × 3.0 × 0.050 × sin θ`, size: 30, color: '#cfe3ff' },
      { t: `F = ${F.toFixed(4)} N`, size: 40, bold: true, color: '#3ddc84' },
      { t: `Biggest force (θ = 90°) = 0.0300 N`, size: 30, color: '#9fb6cc' },
      { rule: true },
      { t: 'The green arrow shows the force. It is always at right angles to both the wire and the field.', size: 28, color: '#9fb6cc' },
    ], { title: 'Force meter' });
    return;
  }
  data.userData.draw([
    { t: `Rounds right first time: ${this.firstTry} of ${this.round}`, size: 32 },
    { t: `Hints used: ${this.hints}`, size: 30, color: '#9fb6cc' },
    { rule: true },
    { t: 'Force on a current in a field:', size: 32, bold: true, color: '#ffd34d' },
    { t: 'F = BIL sin θ', size: 40, bold: true },
    { t: 'The force is at right angles to both the current and the field. If the current is along the field (θ = 0), there is no force.', size: 29, color: '#cfe3ff' },
  ], { title: 'Score' });
};
m1.startAngle = function () {
  this.phase = 'angle';
  this.B = DIRS['+x'].clone();
  this.I = DIRS['-z'].clone();
  this.F = new V3().crossVectors(this.I, this.B);
  this.layout(0.2);
  this.choices.forEach((c) => { c.a.visible = false; c.lab.visible = false; c.btn.visible = false; });
  this.showHand(false);
  this.helpBtn.visible = false;
  this.angle.group.visible = true; this.lockBtn.visible = true; this.lockBtn.userData.setOn(true);
  this.angle.set(90, true); this.angle.setEnabled();
  this.angleTries = 0;
  toast('Part B: the size of the force', 'info', 2.5);
  this.updateB(); this.redraw();
};
m1.updateB = function () {
  const th = this.angle.value * Math.PI / 180;
  const dir = new V3(Math.cos(th), 0, -Math.sin(th));     // θ measured from the field (+x) towards −z
  this.I = dir;
  this.wire.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
  this.wire.position.set(0, 0, 0);
  this.labelI.position.copy(dir).multiplyScalar(this.wireLen / 2 + 0.03);
  const F = new V3().crossVectors(dir, this.B);
  this.forceArrow.visible = true;
  this.forceArrow.userData.set(new V3(0, 0.012 * Math.sign(F.y || 1), 0), F.clone().multiplyScalar(0.16));
  this.drawData();
};
m1.lockAngle = async function () {
  if (this.phase !== 'angle') return;
  this.angleTries++;
  const th = this.angle.value;
  if (th === 30) {
    this.phase = 'angleDone';
    sfx.good(); toast('Yes: sin 30° = 0.5, so F = 0.015 N, half of 0.030 N.', 'good', 3);
    this.angle.setEnabled(); this.lockBtn.userData.setOn(false);
    await wait(3);
    if (current !== this) return;
    this.questions();
  } else {
    sfx.bad();
    const f = Math.sin(th * Math.PI / 180);
    toast(`At ${th}° the force is ${(f * 100).toFixed(0)}% of the biggest. You need sin θ = 0.5.`, 'bad', 3.5);
  }
};
m1.questions = async function () {
  this.phase = 'quiz';
  this.controls.visible = false;
  const go = askIfCurrent(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 2', q: 'A wire 5.0 cm long carries 3.0 A at right angles to a field of 0.20 T. What is the force on it?',
    options: ['3.0 N', '0.030 N', '0.015 N', '0.0030 N'], correct: 1,
    explain: 'F = BIL = 0.20 × 3.0 × 0.050 = 0.030 N.',
    why: ['That uses L = 5.0. Convert to metres: L = 0.050 m.', '', 'That includes sin 30°. Here the wire is at 90° to the field, so sin θ = 1.', 'Check the arithmetic: 0.20 × 3.0 = 0.60, then × 0.050.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 2', q: 'The wire is turned until it lies along the field lines (θ = 0). What happens to the force?',
    options: ['It is at its biggest', 'It reverses', 'It becomes zero', 'It halves'], correct: 2,
    explain: 'sin 0° = 0, so F = BIL sin θ = 0. A current along the field feels no force.',
    why: ['The biggest force is at 90°, when the wire is at right angles to the field.', 'Reversing needs the current or the field reversed.', '', 'Half the force is at θ = 30°.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  const score = this.firstTry + ok - (this.angleTries > 2 ? 1 : 0);
  const n = score >= 5 ? 3 : score >= 3 ? 2 : 1;
  finishMission(this, n, [
    { t: `Force directions right first time: ${this.firstTry} of ${this.rounds.length}. Questions right first time: ${ok} of 2.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: "• Fleming's left-hand rule: First finger = Field, seCond finger = Current, thuMb = Motion.", size: 30 },
    { t: '• F = BIL sin θ: biggest at 90°, zero when the current is along the field.', size: 30 },
  ]);
};
m1.tick = function (dt, t) {
  // current chevrons slide along the wire
  const L = this.wireLen || 0.44;
  this.chevrons.forEach((c, i) => {
    const k = ((t * 0.35 + i / this.chevrons.length) % 1);
    c.position.set(0, -L / 2 + k * L, 0);
    c.visible = true;
  });
};

// ================================================================= Mission 2: Particle Paths
const BOX = 0.27;                      // half-size of the vacuum chamber (m)
const P_ROUNDS = [
  { name: 'proton', q: E_CH, m: 1.67e-27, v: 2.0e6, d: 0.30, color: 0xff5a5a, unit: 'T', label: 'p⁺' },
  { name: 'electron', q: -E_CH, m: 9.11e-31, v: 3.0e7, d: 0.24, color: 0x5ab0ff, unit: 'mT', label: 'e⁻' },
  { name: 'alpha particle', q: 2 * E_CH, m: 6.64e-27, v: 1.5e6, d: 0.40, color: 0xffc14d, unit: 'T', label: 'α²⁺' },
];
const m2 = { title: 'Mission 2: Particle Paths', short: 'Particle Paths', controls: new THREE.Group(), world: new THREE.Group() };
missions.push(m2);
panel.add(m2.controls); app.add(m2.world);
m2.world.position.set(0, 0.09, -0.05);
{
  const W = m2.world;
  W.add(glassBox(BOX * 2, 0.1, BOX * 2));
  W.add(noHit(mesh(new THREE.BoxGeometry(BOX * 2, 0.004, BOX * 2), mat(0x203040), 0, -0.052, 0)));
  // grid on the floor of the chamber (5 cm squares)
  const gh = new THREE.GridHelper(BOX * 2, 10, 0x4f6f8f, 0x34506b); gh.position.y = -0.049; W.add(noHit(gh));
  m2.gun = new THREE.Group();
  m2.gun.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.07, 14).rotateZ(Math.PI / 2), mat(0x8899aa, { metalness: 0.6 })));
  m2.gun.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 10).rotateZ(Math.PI / 2), basic(0xffffff), 0.04, 0, 0));
  W.add(noHit(m2.gun));
  m2.target = new THREE.Group();
  m2.targetPlate = mesh(new THREE.BoxGeometry(0.01, 0.06, 0.03), mat(0x3ddc84, { emissive: 0x1d6b40 }));
  m2.target.add(m2.targetPlate);
  m2.targetLabel = textSprite('detector', { size: 0.03, color: '#3ddc84' });
  m2.targetLabel.position.set(-0.04, 0.06, 0);
  m2.target.add(m2.targetLabel);
  W.add(noHit(m2.target));
  m2.fieldArrows = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const a = arrow(0x7fc8ff, { radius: 0.0025, head: 0.016 });
    a.userData.xz = [i * 0.1, j * 0.1];
    W.add(a); m2.fieldArrows.push(a);
  }
  m2.bLabel = textSprite('', { size: 0.03, color: '#7fc8ff' });
  m2.bLabel.position.set(BOX + 0.06, 0.08, -BOX);
  W.add(m2.bLabel);
  m2.dot = mesh(new THREE.SphereGeometry(0.011, 12, 8), basic(0xffffff));
  W.add(noHit(m2.dot));
  m2.trails = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 3), 3)); g.setDrawRange(0, 0);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
    l.frustumCulled = false; W.add(noHit(l)); m2.trails.push(l);
  }
  m2.spark = mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  W.add(noHit(m2.spark));

  const fmtT = (v) => `${v > 0 ? '+' : ''}${v.toFixed(3)} T ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`;
  const fmtmT = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} mT ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`;
  const en = () => m2.phase === 'aim';
  m2.sliderT = slider({ name: 'Field B', min: -0.3, max: 0.3, step: 0.005, fine: 0.001, value: 0, length: 0.38, labelW: 0.48, format: fmtT, onChange: () => m2.fieldChanged(), enabled: en });
  m2.slidermT = slider({ name: 'Field B', min: -3, max: 3, step: 0.05, fine: 0.01, value: 0, length: 0.38, labelW: 0.48, format: fmtmT, onChange: () => m2.fieldChanged(), enabled: en });
  for (const s of [m2.sliderT, m2.slidermT]) { s.group.position.set(-0.12, 0.08, 0); m2.controls.add(s.group); }
  m2.fireBtn = actionButton('FIRE', 0.2, 0.09, () => m2.fire(), { bg: '#c0392b', size: 34 });
  m2.fireBtn.position.set(-0.28, -0.08, 0);
  m2.hintBtn = actionButton('Hint', 0.15, 0.09, () => { m2.hints++; sfx.blip(); m2.redraw(); }, { bg: '#8e44ad', size: 28 });
  m2.hintBtn.position.set(-0.08, -0.08, 0);
  m2.controls.add(m2.fireBtn, m2.hintBtn);
}
m2.enter = function () {
  this.round = 0; this.shots = 0; this.hints = 0;
  this.rounds = P_ROUNDS.map((r) => ({ ...r, side: Math.random() < 0.5 ? 1 : -1 }));
  this.setRound();
};
m2.slider = function () { return this.R.unit === 'mT' ? this.slidermT : this.sliderT; };
m2.Bvalue = function () { const s = this.slider(); return this.R.unit === 'mT' ? s.value / 1000 : s.value; };
m2.setRound = function () {
  this.R = this.rounds[this.round];
  this.phase = 'aim'; this.result = null; this.roundShots = 0;
  const R = this.R;
  this.z0 = -R.side * 0.17;                        // gun on the opposite side from the detector
  this.zT = this.z0 + R.side * R.d;
  this.gun.position.set(-BOX - 0.02, 0, this.z0);
  this.target.position.set(-BOX + 0.005, 0, this.zT);
  this.sliderT.group.visible = R.unit === 'T'; this.slidermT.group.visible = R.unit === 'mT';
  this.slider().set(0, true); this.slider().setEnabled();
  this.fireBtn.userData.setOn(true);
  this.dot.material.color.set(R.color); this.dot.visible = false;
  this.trails.forEach((l) => l.geometry.setDrawRange(0, 0));
  this.fieldChanged(); this.redraw();
};
m2.fieldChanged = function () {
  if (!this.R) return;
  const B = this.Bvalue(), max = this.R.unit === 'mT' ? 0.003 : 0.3;
  const k = Math.min(1, Math.abs(B) / (max * 0.5));
  for (const a of this.fieldArrows) {
    const [x, z] = a.userData.xz;
    a.visible = B !== 0;
    if (!a.visible) continue;
    const len = 0.03 + 0.05 * k, s = Math.sign(B);
    a.userData.set(new V3(x, -s * len / 2, z), new V3(0, s * len, 0));
  }
  this.bLabel.userData.set(B === 0 ? 'B = 0' : `B ${B > 0 ? 'up' : 'down'}`);
  this.drawData();
};
// The path is a circle: centre at the gun, offset sideways by r, on the side the force first points.
m2.path = function () {
  const R = this.R, B = this.Bvalue();
  const start = new V3(-BOX, 0, this.z0);
  const pts = [start.clone()];
  if (B === 0) { pts.push(new V3(BOX, 0, this.z0)); return { pts, r: Infinity, end: 'far', endP: pts[1] }; }
  const r = R.m * R.v / (Math.abs(R.q) * Math.abs(B));
  // initial force direction: q v × B with v = +x and B = (0, B, 0): x × y = +z
  const s = Math.sign(R.q * B);
  const c = start.clone().add(new V3(0, 0, s * r));
  let end = 'wall', endP = null;
  for (let i = 1; i <= 2000; i++) {
    const ph = i / 2000 * Math.PI * 1.02;
    const p = new V3(c.x + r * Math.sin(ph), 0, c.z - s * r * Math.cos(ph));
    if (p.x < -BOX) { // back at the entry wall
      const pPrev = pts[pts.length - 1];
      const k = (-BOX - pPrev.x) / (p.x - pPrev.x);
      endP = pPrev.clone().lerp(p, k); pts.push(endP); end = 'entry'; break;
    }
    if (p.x > BOX || Math.abs(p.z) > BOX) { endP = p; pts.push(p); end = 'far'; break; }
    if (i % 8 === 0) pts.push(p);
  }
  if (!endP) { endP = pts[pts.length - 1]; }
  return { pts, r, end, endP, s };
};
m2.fire = async function () {
  if (this.phase !== 'aim') return;
  this.phase = 'flying'; this.shots++; this.roundShots++;
  this.slider().setEnabled(); this.fireBtn.userData.setOn(false);
  const P = this.path();
  this.lastPath = P;
  // trails: keep the last three shots, fading
  const tr = this.trails.pop(); this.trails.unshift(tr);
  this.trails.forEach((l, i) => { l.material.opacity = [1, 0.4, 0.2][i]; });
  tr.material.color.set(this.R.color);
  const arr = tr.geometry.attributes.position;
  const total = P.pts.length;
  sfx.zap();
  this.dot.visible = true;
  await tween(1.4, (k) => {
    const n = Math.max(1, Math.floor(k * (total - 1)) + 1);
    for (let i = 0; i < n; i++) arr.setXYZ(i, P.pts[i].x, P.pts[i].y, P.pts[i].z);
    arr.needsUpdate = true; tr.geometry.setDrawRange(0, n);
    this.dot.position.copy(P.pts[n - 1]);
  }, (k) => k);
  if (current !== this) return;
  this.dot.visible = false;
  this.spark.position.copy(P.endP); this.spark.scale.setScalar(0.01); this.spark.material.opacity = 0.9;
  tween(0.5, (k) => { this.spark.scale.setScalar(0.01 + 0.04 * k); this.spark.material.opacity = 0.9 * (1 - k); });
  this.judge(P);
};
m2.judge = async function (P) {
  const R = this.R;
  const landed = P.end === 'entry' ? Math.abs(P.endP.z - this.z0) : null;
  const rightWay = P.end !== 'far' ? Math.sign(P.endP.z - this.z0) === R.side : null;
  const need = R.d / 2;
  let ok = false, text;
  const carrier = R.q < 0 ? `For an ${R.name} (negative charge) the current is OPPOSITE to its motion, so use the left-hand rule with the second finger pointing backwards.` : `For a positive ${R.name} the current is along its motion.`;
  if (P.r === Infinity) text = 'With no field there is no force, so it goes straight. Turn the field on.';
  else if (P.s !== R.side) text = `It curved the wrong way. ${carrier} Reverse B.`;
  else if (P.end === 'far') text = `The path radius r = mv/Bq = ${(P.r * 100).toFixed(1)} cm is too big, so it hit the far wall. A stronger field gives a smaller circle.`;
  else if (!rightWay) text = `It curved the wrong way. ${carrier} Reverse B.`;
  else if (Math.abs(landed - R.d) <= 0.012) { ok = true; text = `Hit! r = mv/Bq = ${(P.r * 100).toFixed(1)} cm, so it lands 2r = ${(2 * P.r * 100).toFixed(1)} cm from the gun.`; }
  else text = `It landed ${(landed * 100).toFixed(1)} cm from the gun (r = ${(P.r * 100).toFixed(1)} cm). The detector is ${(R.d * 100).toFixed(0)} cm away, so r must be ${(need * 100).toFixed(0)} cm. ${landed > R.d ? 'Make B stronger.' : 'Make B weaker.'}`;
  this.result = { ok, text };
  if (ok) { sfx.great(); toast(`Hit the detector with the ${R.name}!`, 'good', 2.5); }
  else { sfx.bad(); toast('Missed the detector', 'bad', 2); }
  this.redraw(); this.drawData();
  if (ok) {
    this.phase = 'hit';
    await wait(3.2);
    if (current !== this) return;
    this.round++;
    if (this.round < this.rounds.length) this.setRound(); else this.questions();
  } else {
    this.phase = 'aim';
    this.slider().setEnabled(); this.fireBtn.userData.setOn(true);
  }
};
m2.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const R = this.R;
  const hints = [
    'Hint 1: the magnetic force Bqv is the centripetal force: Bqv = mv²/r, so r = mv/Bq.',
    `Hint 2: the particle turns through a semicircle, so it lands 2r from the gun: r = ${(R.d * 50).toFixed(0)} cm = ${(R.d / 2).toFixed(2)} m.`,
    `Hint 3: B = mv/(qr). Then use the left-hand rule for the direction (${R.q < 0 ? 'current is opposite to an electron\'s motion' : 'current is along the motion'}).`,
  ].slice(0, this.hints);
  info.userData.draw([
    { t: `Round ${this.round + 1} of 3: ${R.name}`, size: 36, bold: true, color: '#ffd34d' },
    { t: 'A beam enters a vacuum chamber travelling to the right. A vertical magnetic field fills the chamber.', size: 31, gap: 8 },
    { t: `Set B (size AND direction: up or down) so the ${R.name} lands on the green detector ${(R.d * 100).toFixed(0)} cm from the gun. Then press FIRE.`, size: 31, color: '#ffd34d', gap: 8 },
    ...hints.map((t) => ({ t, size: 28, color: '#e0b3ff', gap: 4 })),
    this.result && { rule: true },
    this.result && { t: this.result.text, size: 29, color: this.result.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m2.drawData = function () {
  const R = this.R;
  data.userData.draw([
    { t: `Particle: ${R.name} (${R.label})`, size: 34, bold: true, color: '#' + R.color.toString(16).padStart(6, '0') },
    { t: `charge q = ${R.q < 0 ? '−' : '+'}${sig(Math.abs(R.q))} C`, size: 30 },
    { t: `mass m = ${sig(R.m)} kg`, size: 30 },
    { t: `speed v = ${sig(R.v)} m/s`, size: 30 },
    { t: `distance gun to detector = ${(R.d * 100).toFixed(0)} cm`, size: 30 },
    { rule: true },
    { t: `Field B = ${sig(Math.abs(this.Bvalue()))} T ${this.Bvalue() > 0 ? 'upwards' : this.Bvalue() < 0 ? 'downwards' : ''}`, size: 32, color: '#7fc8ff' },
    this.lastPath && this.lastPath.r !== Infinity && { t: `Last shot: radius r = ${(this.lastPath.r * 100).toFixed(1)} cm`, size: 30, color: '#9fb6cc' },
    { t: `Shots: ${this.shots}`, size: 28, color: '#9fb6cc' },
  ], { title: 'Beam data' });
};
m2.questions = async function () {
  this.phase = 'quiz';
  this.controls.visible = false;
  const go = askIfCurrent(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 2', q: 'An electron and a proton enter the same field at the same speed. Compared with the proton\'s path, the electron\'s path…',
    options: ['is a much smaller circle, curving the opposite way', 'is a bigger circle, curving the same way', 'is the same size, curving the opposite way', 'is a straight line'], correct: 0,
    explain: 'r = mv/Bq: the electron\'s mass is about 1/1840 of the proton\'s, so its circle is far smaller. Its charge is negative, so it curves the other way.',
    why: ['', 'r = mv/Bq, and the electron is much LESS massive.', 'Same size would need equal mass. The electron is about 1840 times lighter.', 'A moving charge crossing a field always feels a force.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 2', q: 'Why does the particle keep the same speed all the way round its circle?',
    options: ['The field is uniform', 'The magnetic force is always at right angles to the velocity, so it does no work', 'There is no air in the chamber', 'The charge is very small'], correct: 1,
    explain: 'F = Bqv is perpendicular to v, so it changes direction only. No work is done and the kinetic energy stays constant.',
    why: ['A uniform field explains the circle\'s constant radius, not why the speed stays the same.', '', 'A vacuum removes collisions, but the reason here is the direction of the force.', 'Even a small charge would be sped up by a force along its motion.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  const n = this.shots <= 4 && this.hints === 0 ? 3 : this.shots <= 7 ? 2 : 1;
  finishMission(this, n, [
    { t: `Shots: ${this.shots} (3 is perfect).  Hints: ${this.hints}.  Questions right first time: ${ok} of 2.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• F = Bqv acts at right angles to the motion, so charged particles move in circles: Bqv = mv²/r gives r = mv/Bq.', size: 30 },
    { t: '• Negative charges curve the opposite way to positive ones.', size: 30 },
  ]);
};
m2.tick = function () {};

// ================================================================= Mission 3: Mass Spectrometer
const B1 = 0.10, B2 = 0.20, PLATE_GAP = 0.04, V_SEL = 2.0e5;
const SEL_X0 = -0.42, SEL_X1 = -0.2, SLIT_X = -0.18, ENTRY_X = -0.17;
const ISOTOPES = [{ A: 20, w: 0.6, color: 0xff7b54 }, { A: 21, w: 0.15, color: 0xffd34d }, { A: 22, w: 0.25, color: 0x6fd3ff }];
const m3 = { title: 'Mission 3: Mass Spectrometer', short: 'Mass Spectrometer', controls: new THREE.Group(), world: new THREE.Group() };
missions.push(m3);
panel.add(m3.controls); app.add(m3.world);
m3.world.position.set(0.12, 0.1, 0.18);
{
  const W = m3.world;
  // ion source
  W.add(noHit(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat(0x7f8c8d, { metalness: 0.5 }), -0.5, 0, 0)));
  const srcLabel = textSprite('neon ions', { size: 0.028 }); srcLabel.position.set(-0.5, 0.07, 0); W.add(srcLabel);
  // velocity selector: two plates (the + plate at −z), magnetic field B1 downwards
  m3.plateP = mesh(new THREE.BoxGeometry(SEL_X1 - SEL_X0, 0.06, 0.004), mat(0xd64541, { metalness: 0.5 }));
  m3.plateN = mesh(new THREE.BoxGeometry(SEL_X1 - SEL_X0, 0.06, 0.004), mat(0x2f6fd6, { metalness: 0.5 }));
  m3.plateP.position.set((SEL_X0 + SEL_X1) / 2, 0, -PLATE_GAP / 2 - 0.002);
  m3.plateN.position.set((SEL_X0 + SEL_X1) / 2, 0, PLATE_GAP / 2 + 0.002);
  W.add(noHit(m3.plateP), noHit(m3.plateN));
  const lp = textSprite('+', { size: 0.035, bg: 'rgba(150,20,20,0.85)' }); lp.position.set(SEL_X1 - 0.02, 0.05, -PLATE_GAP / 2 - 0.02);
  const ln = textSprite('−', { size: 0.035, bg: 'rgba(20,50,150,0.85)' }); ln.position.set(SEL_X1 - 0.02, 0.05, PLATE_GAP / 2 + 0.02);
  W.add(lp, ln);
  const selLabel = textSprite('velocity selector', { size: 0.026 }); selLabel.position.set((SEL_X0 + SEL_X1) / 2, -0.06, 0.06); W.add(selLabel);
  // slit
  W.add(noHit(mesh(new THREE.BoxGeometry(0.006, 0.06, 0.05), mat(0x55606b), SLIT_X, 0, 0.03)));
  W.add(noHit(mesh(new THREE.BoxGeometry(0.006, 0.06, 0.05), mat(0x55606b), SLIT_X, 0, -0.03)));
  // deflection chamber (B2 downwards), detector plate along the entry wall, with a ruler from the slit
  m3.chamber = glassBox(0.3, 0.06, 0.52);
  m3.chamber.position.set(ENTRY_X + 0.15, 0, -0.26 + 0.005);
  W.add(m3.chamber);
  const plate = mesh(new THREE.BoxGeometry(0.008, 0.06, 0.5), mat(0x2b2f36), ENTRY_X - 0.005, 0, -0.27);
  W.add(noHit(plate));
  m3.ruler = (function ruler() {
    const w = 0.5, h = 0.05;
    const c = document.createElement('canvas'); c.width = 2500; c.height = 250;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f3ead2'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#222'; ctx.strokeStyle = '#222';
    for (let mm = 0; mm <= 500; mm += 2) {
      const x = 20 + mm / 500 * (c.width - 40);
      const L = mm % 50 === 0 ? 120 : mm % 10 === 0 ? 80 : 40;
      ctx.lineWidth = mm % 10 === 0 ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, L); ctx.stroke();
      if (mm % 50 === 0) { ctx.font = 'bold 70px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(mm / 10), x, 200); }
    }
    ctx.font = 'bold 50px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('cm from the slit', 1900, 200);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const m = mesh(new THREE.PlaneGeometry(w + 0.008, h), new THREE.MeshBasicMaterial({ map: t }));
    m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    m.position.set(ENTRY_X - 0.035, -0.028, -0.25);
    return noHit(m);
  })();
  W.add(m3.ruler);
  m3.b2Arrows = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
    const a = arrow(0x7fc8ff, { radius: 0.002, head: 0.012 });
    a.userData.set(new V3(ENTRY_X + 0.05 + i * 0.09, 0.025, -0.05 - j * 0.1), new V3(0, -0.05, 0));
    W.add(a); m3.b2Arrows.push(a);
  }
  const b2Label = textSprite('B₂ = 0.20 T (down)', { size: 0.026, color: '#7fc8ff' }); b2Label.position.set(ENTRY_X + 0.2, 0.06, -0.5); W.add(b2Label);
  m3.b1Arrows = [];
  for (let i = 0; i < 4; i++) {
    const a = arrow(0x7fc8ff, { radius: 0.002, head: 0.012 });
    a.userData.set(new V3(SEL_X0 + 0.03 + i * 0.055, 0.045, 0), new V3(0, -0.035, 0));
    W.add(a); m3.b1Arrows.push(a);
  }
  m3.ions = particlePool(220, 0.0045, W);
  m3.spots = ISOTOPES.map((iso) => {
    const s = mesh(new THREE.BoxGeometry(0.012, 0.05, 0.008), new THREE.MeshBasicMaterial({ color: iso.color, transparent: true, opacity: 0 }));
    const r = iso.A * U * V_SEL / (E_CH * B2);
    s.position.set(ENTRY_X - 0.008, 0, -2 * r);
    s.userData.d = 2 * r;
    W.add(s);
    makeInteractive(s, { name: `Spot at ${(2 * r * 100).toFixed(1)} cm from the slit`, action: () => toast(`This spot is ${(2 * r * 100).toFixed(1)} cm from the slit.`, 'info', 3), enabled: () => s.material.opacity > 0.2 });
    return s;
  });
  m3.slider = slider({ name: 'Plate voltage V', min: 0, max: 1600, step: 10, fine: 1, value: 300, length: 0.38, labelW: 0.48,
    format: (v) => `${v.toFixed(0)} V`, onChange: () => m3.drawData(), enabled: () => m3.phase === 'select' });
  m3.slider.group.position.set(-0.12, 0.08, 0);
  m3.checkBtn = actionButton('Check speed', 0.26, 0.09, () => m3.check(), { bg: '#1e8449', size: 28 });
  m3.checkBtn.position.set(-0.12, -0.08, 0);
  m3.controls.add(m3.slider.group, m3.checkBtn);
}
m3.enter = function () {
  this.phase = 'select'; this.checks = 0; this.stageB = false;
  this.ionList = []; this.spawnT = 0; this.passed = []; this.hitCount = [0, 0, 0];
  for (let i = 0; i < 220; i++) this.ions.hide(i);
  this.ions.commit();
  this.spots.forEach((s) => (s.material.opacity = 0));
  this.slider.set(300, true); this.slider.setEnabled();
  this.checkBtn.visible = true; this.checkBtn.userData.setOn(true);
  this.b2Arrows.forEach((a) => (a.visible = false));
  this.redraw(); this.drawData();
};
m3.E = function () { return this.slider.value / PLATE_GAP; };
m3.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  if (!this.stageB) {
    info.userData.draw([
      { t: 'Stage 1: the velocity selector', size: 36, bold: true, color: '#ffd34d' },
      { t: 'Neon ions (+1 charge) leave the source with many different speeds. Between the plates the electric force qE pushes one way and the magnetic force Bqv pushes the other.', size: 30, gap: 8 },
      { t: 'Set the plate voltage so that only ions with v = 2.0 × 10⁵ m/s go straight through the slit. Then press Check speed.', size: 31, color: '#ffd34d', gap: 8 },
      { t: `B₁ = 0.10 T,  plate gap d = 4.0 cm.  Use qE = Bqv and E = V/d.`, size: 29, color: '#cfe3ff' },
      { t: 'Ion colour shows speed: red is slow, blue is fast.', size: 27, color: '#9fb6cc' },
      this.result && { rule: true },
      this.result && { t: this.result, size: 29, color: '#ffb3a3' },
    ], { title: this.title });
  } else {
    info.userData.draw([
      { t: 'Stage 2: weighing the ions', size: 36, bold: true, color: '#ffd34d' },
      { t: 'Ions at 2.0 × 10⁵ m/s enter field B₂ = 0.20 T and travel a semicircle, landing a distance 2r from the slit.', size: 30, gap: 8 },
      { t: 'Neon has three isotopes, so three spots build up on the detector. Look at the ruler (lean in) or point at a spot to measure it.', size: 30, color: '#ffd34d', gap: 8 },
      { t: 'r = mv / Bq, so the heavier the ion, the further it lands.', size: 30, color: '#cfe3ff' },
    ], { title: this.title });
  }
};
m3.drawData = function () {
  const V = this.slider.value, E = this.E();
  const rate = this.passed.length;
  data.userData.draw([
    { t: `Plate voltage V = ${V.toFixed(0)} V`, size: 34, bold: true },
    { t: `E = V / d = ${sig(E)} V/m`, size: 32, color: '#ff9b9b' },
    { t: `B₁ = 0.10 T`, size: 32, color: '#7fc8ff' },
    { rule: true },
    { t: `Ions through the slit in the last 2 s: ${rate}`, size: 30, color: '#cfe3ff' },
    this.stageB && { t: `Detector counts:  ²⁰Ne ${this.hitCount[0]}   ²¹Ne ${this.hitCount[1]}   ²²Ne ${this.hitCount[2]}`, size: 30, color: '#ffd34d' },
    { t: `Checks used: ${this.checks}`, size: 28, color: '#9fb6cc' },
  ], { title: 'Spectrometer' });
};
m3.check = async function () {
  if (this.phase !== 'select') return;
  this.checks++;
  const V = this.slider.value, vSel = this.E() / B1;
  if (Math.abs(V - 800) <= 8) {
    this.phase = 'stageB';
    this.result = null;
    sfx.good(); toast('Correct: V = 800 V gives E = 2.0 × 10⁴ V/m, and E/B = 2.0 × 10⁵ m/s.', 'good', 3.5);
    this.slider.setEnabled(); this.checkBtn.userData.setOn(false);
    await wait(2);
    if (current !== this) return;
    this.stageB = true; this.checkBtn.visible = false;
    this.b2Arrows.forEach((a) => (a.visible = true));
    toast('Field B₂ switched on. Watch the detector.', 'info', 3);
    this.redraw(); this.drawData();
    await wait(12);
    if (current !== this) return;
    this.questions();
  } else {
    sfx.bad();
    this.result = `At ${V.toFixed(0)} V the ions that pass have v = E/B = ${sig(vSel)} m/s. You need 2.0 × 10⁵ m/s: E = vB = 2.0 × 10⁴ V/m, then V = Ed.`;
    toast('Not that speed. Read the board.', 'bad', 2.5);
    this.redraw();
  }
};
m3.questions = async function () {
  this.phase = 'quiz';
  this.controls.visible = false;
  const go = askIfCurrent(this);
  let ok = 0;
  const d = this.spots.map((s) => (s.userData.d * 100).toFixed(1));
  ok += await go({ title: 'Question 1 of 3', q: 'Which spot is made by neon-22, the heaviest isotope?',
    options: [`The nearest spot (${d[0]} cm)`, `The middle spot (${d[1]} cm)`, `The furthest spot (${d[2]} cm)`, 'They all land together'], correct: 2,
    explain: 'r = mv/Bq. All the ions have the same q, v and B, so r ∝ m: the heaviest lands furthest.',
    why: ['That is the lightest, neon-20 (the most common, so it is the brightest).', 'That is neon-21.', '', 'Different masses give different radii.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 3', q: `The middle spot is ${d[1]} cm from the slit. Using m = qBd / 2v, what is the mass of these ions in u? (1 u = 1.66 × 10⁻²⁷ kg)`,
    options: ['20 u', '21 u', '22 u', '42 u'], correct: 1,
    explain: `m = (1.6 × 10⁻¹⁹ × 0.20 × ${(this.spots[1].userData.d).toFixed(3)}) / (2 × 2.0 × 10⁵) = ${sig(E_CH * B2 * this.spots[1].userData.d / (2 * V_SEL))} kg = 21 u.`,
    why: ['Use the middle spot\'s distance, not the nearest.', '', 'That is the furthest spot.', 'd is the diameter: r = d/2. That answer forgets the 2.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 3 of 3', q: 'Why must the ions pass through a velocity selector first?',
    options: ['To give them all the same charge', 'Because r = mv/Bq depends on speed too: with one speed, r depends only on mass', 'To slow them down so they can be seen', 'To remove the electrons'], correct: 1,
    explain: 'If speeds differed, ions of the same mass would land in different places. Selecting one speed makes r ∝ m.',
    why: ['The selector does not change charge.', '', 'It picks out one speed; it does not slow ions down.', 'The ions are already charged before they reach it.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  const n = this.checks <= 1 && ok >= 2 ? 3 : this.checks <= 3 && ok >= 1 ? 2 : 1;
  finishMission(this, n, [
    { t: `Checks used: ${this.checks}.  Questions right first time: ${ok} of 3.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Velocity selector: ions go straight when qE = Bqv, so v = E/B.', size: 30 },
    { t: '• In the second field r = mv/Bq ∝ m: heavier ions land further away.', size: 30 },
  ]);
};
const _ionP = new V3(), _ionC = new THREE.Color();
m3.tick = function (dt) {
  if (!this.world.visible) return;
  const K = 0.32 / V_SEL;                 // display speed: 2 × 10⁵ m/s shows as 0.32 m/s
  const E = this.E();
  this.spawnT += dt;
  while (this.spawnT > 0.018 && this.ionList.length < 220) {
    this.spawnT -= 0.018;
    const r = Math.random();
    const iso = this.stageB ? (r < ISOTOPES[0].w ? 0 : r < ISOTOPES[0].w + ISOTOPES[1].w ? 1 : 2) : 0;
    this.ionList.push({ x: -0.47, z: (Math.random() - 0.5) * 0.004, v: 1.6e5 + Math.random() * 0.8e5, iso, m: ISOTOPES[iso].A * U, state: 'sel', phi: 0, vz: 0 });
  }
  if (this.spawnT > 0.018) this.spawnT = 0.018;
  const now = performance.now();
  this.passed = this.passed.filter((t) => now - t < 2000);
  for (let i = this.ionList.length - 1; i >= 0; i--) {
    const ion = this.ionList[i];
    const dx = ion.v * K * dt;
    if (ion.state === 'sel') {
      ion.x += dx;
      if (ion.x > SEL_X0) {
        const a = (E_CH / ion.m) * (E - ion.v * B1);        // + z is towards the − plate
        const t = (Math.min(ion.x, SEL_X1) - SEL_X0) / ion.v;
        if (ion.z0 === undefined) ion.z0 = ion.z;
        ion.z = ion.z0 + 0.5 * a * t * t;
        ion.vz = a * t;
        if (Math.abs(ion.z) > PLATE_GAP / 2) { ion.state = 'dead'; ion.life = 0.25; }
        else if (ion.x >= SEL_X1) ion.state = 'drift';
      }
    } else if (ion.state === 'drift') {
      ion.z += ion.vz * dx / ion.v;        // apparatus is drawn at real size, so real time for this step = dx / v
      ion.x += dx;
      if (ion.x >= SLIT_X) {
        if (Math.abs(ion.z) < 0.004) { ion.state = this.stageB ? 'arc' : 'free'; ion.z = 0; this.passed.push(now); ion.r = ion.m * ion.v / (E_CH * B2); }
        else { ion.state = 'dead'; ion.life = 0.25; }
      }
    } else if (ion.state === 'free') {
      ion.x += dx;
      if (ion.x > ENTRY_X + 0.28) { this.ionList.splice(i, 1); continue; }
    } else if (ion.state === 'arc') {
      ion.phi += dx / ion.r;
      if (ion.phi >= Math.PI) {
        this.hitCount[ion.iso]++;
        const s = this.spots[ion.iso]; s.material.opacity = Math.min(1, Math.max(0.35, s.material.opacity + 0.08));
        this.ionList.splice(i, 1); continue;
      }
      ion.x = ENTRY_X + ion.r * Math.sin(ion.phi);
      ion.z = -ion.r + ion.r * Math.cos(ion.phi);
    } else if (ion.state === 'dead') {
      ion.life -= dt;
      if (ion.life <= 0) { this.ionList.splice(i, 1); continue; }
    }
  }
  for (let i = 0; i < 220; i++) {
    const ion = this.ionList[i];
    if (!ion) { this.ions.hide(i); continue; }
    _ionP.set(ion.x, 0, ion.z);
    if (this.stageB && ion.state === 'arc') _ionC.set(ISOTOPES[ion.iso].color);
    else _ionC.setHSL(clamp((ion.v - 1.6e5) / 0.8e5, 0, 1) * 0.66, 0.9, 0.6);
    this.ions.set(i, _ionP, ion.state === 'dead' ? 0x777777 : _ionC.getHex(), ion.state === 'dead' ? 0.6 : 1);
  }
  this.ions.commit();
  this.dataT = (this.dataT || 0) + dt;
  if (this.dataT > 0.3 && (this.phase === 'select' || this.phase === 'stageB')) { this.dataT = 0; this.drawData(); }
};

// ================================================================= Mission 4: Induction
const COIL_X = -0.08, COIL_LEN = 0.16, COIL_R = 0.05, TURNS = 200, PHI0 = 5.0e-6, A_FLUX = 0.08;
const MAG_LEN = 0.13, X_MIN = 0, X_MAX = 0.44;       // magnet centre, measured from the coil centre
const m4 = { title: 'Mission 4: Induction', short: 'Induction', controls: new THREE.Group(), world: new THREE.Group() };
missions.push(m4);
panel.add(m4.controls); app.add(m4.world);
m4.world.position.set(0, 0.17, 0.12);
{
  const W = m4.world;
  // coil: a helix of copper wire round a clear tube, axis along x
  class Helix extends THREE.Curve {
    getPoint(t, out = new V3()) { const a = t * Math.PI * 2 * 14; return out.set(COIL_X - COIL_LEN / 2 + t * COIL_LEN, Math.sin(a) * COIL_R, Math.cos(a) * COIL_R); }
  }
  m4.coil = mesh(new THREE.TubeGeometry(new Helix(), 700, 0.0035, 6, false), mat(0xd9893b, { metalness: 0.7, roughness: 0.35 }));
  W.add(noHit(m4.coil));
  W.add(noHit(mesh(new THREE.CylinderGeometry(COIL_R - 0.004, COIL_R - 0.004, COIL_LEN + 0.01, 24, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }), COIL_X, 0, 0)));
  // stand and rail
  W.add(noHit(mesh(new THREE.BoxGeometry(0.7, 0.012, 0.05), mat(0x55606b), 0.08, -0.07, 0)));
  for (const x of [COIL_X - 0.05, COIL_X + 0.05]) W.add(noHit(mesh(new THREE.BoxGeometry(0.012, 0.07, 0.04), mat(0x55606b), x, -0.035, 0)));
  W.add(noHit(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 6).rotateZ(Math.PI / 2), mat(0x9fb6cc), 0.2, -0.03, 0)));
  // magnet
  m4.magnet = new THREE.Group();
  m4.magnetBody = new THREE.Group();
  m4.nHalf = mesh(new THREE.BoxGeometry(MAG_LEN / 2, 0.032, 0.032), mat(0xd63b30));
  m4.sHalf = mesh(new THREE.BoxGeometry(MAG_LEN / 2, 0.032, 0.032), mat(0x2f6fd6));
  m4.nHalf.position.x = -MAG_LEN / 4; m4.sHalf.position.x = MAG_LEN / 4;
  m4.magnetBody.add(m4.nHalf, m4.sHalf);
  m4.magnet.add(m4.magnetBody);
  m4.nLabel = textSprite('N', { size: 0.035, bg: 'rgba(150,20,20,0.85)' });
  m4.sLabel = textSprite('S', { size: 0.035, bg: 'rgba(20,50,150,0.85)' });
  m4.magnet.add(m4.nLabel, m4.sLabel);
  W.add(m4.magnet);
  // invisible larger grab volume
  const grab = mesh(new THREE.BoxGeometry(MAG_LEN + 0.02, 0.06, 0.06), new THREE.MeshBasicMaterial({ visible: false }));
  m4.magnet.add(grab);
  m4.target = 0.3; m4.x = 0.3; m4.dragging = false;
  m4.magnet.userData.drag = {
    begin: () => { m4.dragging = true; m4.needOffset = true; sfx.blip(); },
    point: (wp) => { const l = W.worldToLocal(wp.clone()); m4.dragTo(l.x - COIL_X); },
    ray: (ray) => {
      W.updateWorldMatrix(true, false);
      const o = W.localToWorld(new V3(COIL_X, 0, 0)), d = new V3(1, 0, 0).transformDirection(W.matrixWorld);
      m4.dragTo(closestOnLineToRay(o, d, ray) / W.matrixWorld.getMaxScaleOnAxis());
    },
    end: () => { m4.dragging = false; },
  };
  m4.grabOffset = 0;
  // the magnet keeps the spot where it was grabbed under the hand (no jump)
  m4.dragTo = (raw) => {
    if (m4.needOffset) { m4.grabOffset = raw - m4.target; m4.needOffset = false; }
    m4.target = clamp(raw - m4.grabOffset, X_MIN, X_MAX);
  };
  makeInteractive(m4.magnet, { name: 'Bar magnet (slide it)', enabled: () => m4.phase === 'play' || m4.phase === 'quiz' || m4.phase === 'done' });
  // induced pole at the coil end facing the magnet
  m4.endPole = textSprite('N', { size: 0.04 });
  m4.endPole.position.set(COIL_X + COIL_LEN / 2 + 0.005, 0.085, 0);
  W.add(m4.endPole);
  m4.endArrow = arrow(0xffffff, { radius: 0.004, head: 0.02 });
  W.add(m4.endArrow);
  // galvanometer (centre-zero) behind the coil
  m4.meter = new THREE.Group();
  m4.meter.position.set(COIL_X, 0.12, -0.12);
  m4.meter.rotation.x = -0.25;
  const face = board(0.26, 0.17, { res: 1400, bg: 'rgba(245,242,230,1)', frame: 0x333a44 });
  m4.meter.add(face);
  face.userData.draw([{ fn: (ctx, x, y, w) => {
    const c = ctx.canvas, cx = c.width / 2, cy = c.height * 0.86, R = c.height * 0.62;
    ctx.strokeStyle = '#222'; ctx.fillStyle = '#222'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.17, Math.PI * 1.83); ctx.stroke();
    ctx.font = 'bold 30px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let v = -5; v <= 5; v++) {
      const a = -Math.PI / 2 + (v / 5) * (Math.PI * 0.33);
      const r0 = R - (v % 5 === 0 ? 34 : 20);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
      if (v % 1 === 0) ctx.fillText(String(v), cx + Math.cos(a) * (R + 28), cy + Math.sin(a) * (R + 28) + 10);
    }
    ctx.font = 'bold 34px system-ui, sans-serif'; ctx.fillText('mV', cx, cy - 40);
    return y;
  } }]);
  m4.needle = new THREE.Group();
  m4.needle.position.set(0, -0.17 * 0.36, 0.004);
  m4.needle.add(noHit(mesh(new THREE.BoxGeometry(0.003, 0.105, 0.002).translate(0, 0.0525, 0), basic(0xc0392b))));
  m4.needle.add(noHit(mesh(new THREE.CircleGeometry(0.008, 16), basic(0x222222))));
  m4.meter.add(m4.needle);
  W.add(m4.meter);
  // leads from the coil ends to the meter
  for (const s of [-1, 1]) {
    const pts = [new V3(COIL_X + s * COIL_LEN / 2, -0.04, -0.02), new V3(COIL_X + s * 0.11, 0.0, -0.1), new V3(COIL_X + s * 0.06, 0.06, -0.12)];
    W.add(noHit(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.002, 5), mat(s < 0 ? 0x222222 : 0xc0392b))));
  }

  m4.flipBtn = actionButton('Turn magnet round', 0.3, 0.085, () => m4.flip(), { bg: '#2c6e91', size: 26 });
  m4.flipBtn.position.set(-0.24, 0.07, 0);
  m4.resetBtn = actionButton('Magnet back to start', 0.3, 0.085, () => { m4.target = 0.3; m4.x = 0.3; m4.prevPhi = m4.phi(m4.x); }, { bg: '#5b6b78', size: 24 });
  m4.resetBtn.position.set(-0.24, -0.06, 0);
  m4.slowBtn = actionButton('Push in slowly', 0.24, 0.085, () => m4.autoMove(0.0, 2.0), { bg: '#1f6fb2', size: 24 });
  m4.fastBtn = actionButton('Pull out slowly', 0.24, 0.085, () => m4.autoMove(0.3, 2.0), { bg: '#1f6fb2', size: 24 });
  m4.slowBtn.position.set(0.07, 0.07, 0); m4.fastBtn.position.set(0.07, -0.06, 0);
  m4.controls.add(m4.flipBtn, m4.resetBtn, m4.slowBtn, m4.fastBtn);
}
m4.TASKS = [
  'Push the N pole into the coil. Watch the meter.',
  'Hold the magnet still inside the coil.',
  'Pull the magnet out again.',
  'Move it fast enough to make the meter read more than 3 mV.',
  'Turn the magnet round and push the S pole in.',
];
m4.enter = function () {
  this.phase = 'play'; this.flipped = false; this.task = 0; this.done = [];
  this.target = 0.3; this.x = 0.3; this.emf = 0; this.shown = 0; this.peak = 0; this.stillT = 0; this.signIn = 0;
  this.prevPhi = this.phi(this.x);
  this.applyFlip(); this.place();
  this.flipBtn.userData.setOn(false);
  this.redraw(); this.drawData();
};
m4.autoMove = function (to, secs) {
  if (this.phase !== 'play' && this.phase !== 'quiz' && this.phase !== 'done') return;
  const from = this.target;
  tween(secs, (k) => { this.target = from + (to - from) * k; }, (k) => k);
};
// flux through the coil from the magnet at distance u (centre to centre); positive when the N pole faces the coil
m4.phi = function (x) { const f = 1 / Math.pow(1 + (x / A_FLUX) * (x / A_FLUX), 1.5); return (this.flipped ? -1 : 1) * PHI0 * f; };
m4.flip = function () {
  if (this.task !== 4 && !(this.phase === 'quiz' || this.phase === 'done')) { toast('First finish the steps on the board.', 'info', 2); return; }
  if (this.x < 0.2) { toast('Pull the magnet out of the coil before turning it round.', 'warn', 2.5); return; }
  this.flipped = !this.flipped; this.applyFlip(); this.prevPhi = this.phi(this.x); sfx.whoosh();
};
m4.applyFlip = function () {
  this.magnetBody.rotation.y = this.flipped ? Math.PI : 0;
  const nx = (this.flipped ? 1 : -1) * MAG_LEN / 4;
  this.nLabel.position.set(nx, 0.045, 0); this.sLabel.position.set(-nx, 0.045, 0);
};
m4.place = function () { this.magnet.position.set(COIL_X + this.x, 0, 0); };
m4.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const w = words();
  const how = input.kind === 'hand' ? 'Pinch the magnet and slide it (or point at it and pinch).' : input.kind === 'controller' ? 'Hold the trigger on the magnet and slide it.' : 'Drag the magnet with the mouse, or use the push / pull buttons.';
  info.userData.draw([
    { t: 'A coil of 200 turns is joined to a centre-zero meter. Move the bar magnet along its rail.', size: 31, gap: 8 },
    { t: how, size: 29, color: '#cfe3ff', gap: 10 },
    ...this.TASKS.map((t, i) => ({ t: `${this.done[i] ? '✓' : i === this.task ? '→' : '•'}  ${t}`, size: 31, color: this.done[i] ? '#8ef0a8' : i === this.task ? '#ffd34d' : '#9fb6cc', gap: 6 })),
    this.note && { rule: true },
    this.note && { t: this.note, size: 29, color: '#e0b3ff' },
  ], { title: this.title });
  void w;
};
m4.drawData = function () {
  const ph = this.phi(this.x);
  data.userData.draw([
    { t: `E.m.f. = ${(this.shown * 1000).toFixed(2)} mV`, size: 40, bold: true, color: Math.abs(this.shown) > 1e-4 ? '#ffd34d' : '#eef3f8' },
    { t: `Flux linkage NΦ = ${sig(TURNS * ph, 2)} Wb`, size: 30, color: '#cfe3ff' },
    { t: `Biggest reading so far: ${(this.peak * 1000).toFixed(2)} mV`, size: 30, color: '#9fb6cc' },
    { rule: true },
    { t: 'Faraday: e.m.f. = −N dΦ/dt (the RATE of change of flux linkage).', size: 29 },
    { t: 'Lenz: the induced current opposes the change that causes it.', size: 29 },
    { t: 'The letter on the coil shows the pole the induced current makes at that end.', size: 27, color: '#9fb6cc' },
  ], { title: 'Meter' });
};
m4.complete = function (i, msg) {
  if (this.done[i] || this.task !== i) return;
  this.done[i] = true; this.task = i + 1;
  this.note = msg;
  sfx.good(); toast(msg, 'good', 3.2);
  if (this.task === 4) this.flipBtn.userData.setOn(true);
  this.redraw();
  if (this.task >= this.TASKS.length) this.questions();
};
m4.tick = function (dt) {
  if (!this.world.visible) return;
  const prev = this.x;
  this.x += (this.target - this.x) * (1 - Math.exp(-30 * dt));
  this.place();
  const ph = this.phi(this.x);
  const dPhi = ph - this.prevPhi; this.prevPhi = ph;
  const emf = dt > 0 ? -TURNS * dPhi / dt : 0;
  this.emf = emf;
  this.shown += (emf - this.shown) * (1 - Math.exp(-14 * dt));
  if (Math.abs(this.shown) < 2e-6 && Math.abs(emf) < 2e-6) this.shown = 0;
  const mV = this.shown * 1000;
  this.needle.rotation.z = -clamp(mV / 5, -1.15, 1.15) * (Math.PI * 0.33);
  this.peak = Math.max(this.peak, Math.abs(this.shown));
  const v = (this.x - prev) / Math.max(dt, 1e-4);           // + = moving away from the coil
  // induced pole at the coil's end nearest the magnet (opposes the change)
  const show = Math.abs(mV) > 0.08;
  this.endPole.visible = this.endArrow.visible = show;
  this.endArrow.visible = false;
  if (show) {
    // Lenz: flux (counted positive for the N pole facing the coil) rising -> the near end becomes N; falling -> S.
    const pole = dPhi > 0 ? 'N' : 'S';
    const facing = this.flipped ? 'S' : 'N';
    this.endPole.userData.set(`${pole} pole: ${pole === facing ? 'repels' : 'attracts'}`, pole === 'N' ? '#ff8a80' : '#8ab4ff');
  }
  // task checks
  if (this.phase === 'play') {
    const inside = this.x < 0.04;
    if (this.task === 0 && v < -0.02 && Math.abs(mV) > 0.25 && !this.flipped) {
      this.signIn = Math.sign(mV);
      this.complete(0, `The needle swings ${mV > 0 ? 'right' : 'left'}: the changing flux induces an e.m.f. The coil end becomes an N pole, pushing back on the N pole (Lenz).`);
    } else if (this.task === 1) {
      if (inside && Math.abs(mV) < 0.03) this.stillT += dt; else this.stillT = 0;
      if (this.stillT > 1.2) this.complete(1, 'Zero! The magnet is inside, but the flux is not CHANGING, so there is no induced e.m.f.');
    } else if (this.task === 2 && v > 0.02 && Math.abs(mV) > 0.25 && Math.sign(mV) === -this.signIn && !this.flipped) {
      this.complete(2, 'The needle swings the other way: the flux is now decreasing. The coil end becomes an S pole, pulling the magnet back (Lenz).');
    } else if (this.task === 3 && Math.abs(mV) > 3) {
      this.complete(3, `${Math.abs(mV).toFixed(1)} mV! Faster movement means a faster rate of change of flux, so a bigger e.m.f.`);
    } else if (this.task === 4 && this.flipped && v < -0.02 && Math.abs(mV) > 0.25) {
      this.complete(4, `Pushing the S pole in swings the needle ${mV > 0 ? 'right' : 'left'}, the same way as pulling the N pole out: both make the flux change the same way.`);
    }
  }
  this.dataT = (this.dataT || 0) + dt;
  if (this.dataT > 0.25 && this.phase === 'play') { this.dataT = 0; this.drawData(); }
};
m4.questions = async function () {
  this.phase = 'quiz';
  await wait(3.5);
  if (current !== this) return;
  this.controls.visible = false;
  const go = askIfCurrent(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 2', q: 'As the N pole of a magnet is pushed towards a coil, the end of the coil nearest the magnet becomes…',
    options: ['an N pole, which repels the magnet', 'an S pole, which attracts the magnet', 'no pole at all', 'an N pole, which attracts the magnet'], correct: 0,
    explain: 'Lenz\'s law: the induced current opposes the change. Repelling the approaching N pole means you must do work, and that work becomes electrical energy.',
    why: ['', 'Attracting it would speed the magnet up and create energy from nothing: that breaks conservation of energy.', 'A current flows, so the coil acts as an electromagnet.', 'Like poles repel; they cannot attract.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 2', q: 'The flux through a 200-turn coil rises steadily from 0 to 4.0 × 10⁻⁴ Wb in 0.10 s. What is the size of the induced e.m.f.?',
    options: ['0.0040 V', '0.080 V', '0.80 V', '8.0 V'], correct: 2,
    explain: 'E = N ΔΦ/Δt = 200 × 4.0 × 10⁻⁴ / 0.10 = 0.80 V.',
    why: ['That leaves out N = 200 turns.', 'Check the powers of ten: 200 × 4.0 × 10⁻⁴ = 0.080 Wb, then divide by 0.10 s.', '', 'That multiplies by 0.10 s instead of dividing... check: ΔΦ/Δt = 4.0 × 10⁻³ Wb/s.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  finishMission(this, ok === 2 ? 3 : ok === 1 ? 2 : 1, [
    { t: `All five experiments done. Questions right first time: ${ok} of 2.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Faraday: the e.m.f. depends on the RATE of change of flux linkage: E = −N dΦ/dt.', size: 30 },
    { t: '• Lenz: the induced current always opposes the change that produces it.', size: 30 },
  ]);
};

// ---------------------------------------------------------------- menu buttons
missions.forEach((m, i) => {
  const b = actionButton(`${i + 1}. ${m.short}`, 0.2, 0.13, () => startMission(i), { bg: ['#1f6fb2', '#b9770e', '#8e44ad', '#1e8449'][i], size: 24, name: `Start ${m.title}` });
  b.position.set(-0.39 + i * 0.215, 0.0, 0);
  menuGroup.add(b);
  missionButtons.push(b);
});

onFrame((dt, t) => { if (current) current.tick(dt, t); });
openMenu();
start();

// Test hook (used by the automated browser tests; harmless for players).
window.lesson = { missions, startMission, openMenu, get current() { return current; }, Q, info, data, input, scene, renderer, THREE,
  get stars() { return stars; }, speed: 1, panel, toast, missionButtons, nextBtn, menuBtn, restartBtn, app, camera };
