// Heartbeat: The Heart and Blood Circulation (Form 2 Integrated Science, Transport systems:
// structure of the heart, valves, blood vessels, double circulation). Built on shared/game-kit.js.
import { createGame, THREE, howTo } from '../shared/game-kit.js';

const kit = createGame({ title: 'Heartbeat', deskSpot: { x: 0, z: 0.5, yaw: 0, height: 1.65, pitch: -0.3 } });
const { scene, mesh, lam, mat, basic, label, tween, wait, sfx, say, score, noHit } = kit;
kit.buildRoom({ sign: 'HEARTBEAT  ·  FORM 2', accent: 0x8e3b46, signBg: '#7b2d3a', wall: 0xf3eeea });
const TABLE_Y = 0.8;
kit.table({ w: 1.4, d: 0.65, z: -0.6 });
const board = kit.board({ w: 1.6, h: 0.9 });
board.group.position.set(0, 1.75, -1.55);
scene.add(board.group);
kit.setToastAnchor(new THREE.Vector3(0, 1.27, -1.45));

// ================================================================= the heart model (front view)
// The learner faces the heart, so the heart's RIGHT side is on the learner's LEFT (as in textbooks).
const heart = new THREE.Group();
heart.position.set(0, 1.17, -0.64);
scene.add(heart);

const BLUE = 0x3f63c9, RED = 0xd23b3b, MUSCLE = 0xb04a55, CUT = 0xe9a0a0;
// heart muscle: fine fibres and a wet sheen (a canvas texture, no image files)
const muscleTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#c86a72'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) {
    const y = Math.random() * 512, a = 0.25 + Math.random() * 0.3;
    x.strokeStyle = Math.random() < 0.5 ? `rgba(120,30,45,${a * 0.5})` : `rgba(240,170,170,${a * 0.35})`; x.lineWidth = 1 + Math.random() * 2.5;
    x.beginPath(); x.moveTo(-10, y); x.bezierCurveTo(150, y + Math.random() * 40 - 20, 350, y + Math.random() * 40 - 20, 522, y + Math.random() * 30 - 15); x.stroke();
  }
  // fat streaks along the grooves
  for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(245,222,170,0.35)'; x.beginPath(); x.ellipse(Math.random() * 512, Math.random() * 512, 60, 10, Math.random(), 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
})();
const muscleMat = () => mat(0xffffff, { map: muscleTex, side: THREE.DoubleSide, roughness: 0.38, metalness: 0.02 });
function lumpy(geo, amt = 0.04, f = 7) {
  const pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const n = 1 + amt * Math.sin(v.x * f + v.y * f * 0.7) * Math.cos(v.z * f * 0.9 + v.y * 3); pos.setXYZ(i, v.x * n, v.y * n, v.z * n); }
  geo.computeVertexNormals(); return geo;
}
const parts = {};      // key -> { group, name, hint, side, center }
function part(key, name, hint, extra = {}) {
  const g = new THREE.Group(); g.name = key;
  heart.add(g);
  parts[key] = { key, group: g, name, hint, ...extra };
  return parts[key];
}
// A chamber: back half of a muscular ellipsoid, a blood-filled cavity, and the cut face showing wall thickness.
function chamber(key, name, hint, c, outer, wall, blood) {
  const pt = part(key, name, hint, { center: new THREE.Vector3(...c), radius: Math.max(...outer) * 0.8 });
  const g = pt.group; g.position.set(...c);
  const half = new THREE.SphereGeometry(1, 32, 20, Math.PI, Math.PI);
  const muscle = mesh(lumpy(half.clone(), 0.035), muscleMat());
  muscle.scale.set(...outer);
  const cav = mesh(half, mat(blood, { side: THREE.DoubleSide, roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }));
  cav.scale.set(outer[0] - wall, outer[1] - wall, outer[2] - wall); cav.position.z = 0.001;
  // cut face: an elliptical ring
  const shape = new THREE.Shape(); shape.absellipse(0, 0, outer[0], outer[1], 0, Math.PI * 2);
  const hole = new THREE.Path(); hole.absellipse(0, 0, outer[0] - wall, outer[1] - wall, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const ring = mesh(new THREE.ShapeGeometry(shape, 40), mat(CUT, { side: THREE.DoubleSide, roughness: 0.55 }), 0, 0, 0.002);
  g.add(muscle, cav, ring);
  pt.cavity = cav; pt.outer = outer;
  return pt;
}
chamber('RA', 'Right atrium', 'the upper chamber on the heart’s right side (your left). It receives blood from the body through the vena cava.', [-0.078, 0.07, 0], [0.066, 0.058, 0.05], 0.012, BLUE);
chamber('LA', 'Left atrium', 'the upper chamber on the heart’s left side (your right). It receives blood from the lungs.', [0.078, 0.075, -0.005], [0.062, 0.054, 0.048], 0.012, RED);
chamber('RV', 'Right ventricle', 'the lower chamber on the heart’s right side (your left). It pumps blood to the lungs.', [-0.06, -0.072, 0.008], [0.072, 0.085, 0.056], 0.016, BLUE);
chamber('LV', 'Left ventricle', 'the lower chamber on the heart’s left side (your right), with the thickest wall. It pumps blood to the whole body.', [0.064, -0.082, 0], [0.074, 0.1, 0.06], 0.032, RED);

// vessels
function vessel(key, name, hint, pts, r, color, branches = []) {
  const pt = part(key, name, hint);
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  // translucent walls so the streaming blood inside can be seen
  const m = mat(color, { roughness: 0.25, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  pt.group.add(mesh(new THREE.TubeGeometry(curve, 48, r, 12, false), m));
  pt.curves = [curve];
  for (const b of branches) {
    const cv = new THREE.CatmullRomCurve3(b.map((p) => new THREE.Vector3(...p)));
    pt.group.add(mesh(new THREE.TubeGeometry(cv, 32, r * 0.85, 10, false), m));
    pt.curves.push(cv);
  }
  // end caps so the tubes do not look hollow
  for (const cv of pt.curves) for (const t of [0, 1]) pt.group.add(mesh(new THREE.SphereGeometry(r * (cv === curve ? 1 : 0.85), 12, 8), m, ...cv.getPoint(t).toArray()));
  pt.radius = r; pt.mat = m;
  return pt;
}
vessel('VC', 'Vena cava', 'the large vein that brings blood from the body back into the right atrium.',
  [[-0.11, 0.3, -0.03], [-0.1, 0.2, -0.02], [-0.085, 0.12, -0.01]], 0.019, BLUE,
  [[[-0.13, -0.29, -0.05], [-0.15, -0.15, -0.05], [-0.13, -0.02, -0.03], [-0.105, 0.03, -0.02]]]);
vessel('PA', 'Pulmonary artery', 'the artery that carries blood from the right ventricle to the lungs.',
  [[-0.035, 0.0, 0.05], [-0.012, 0.13, 0.065], [0.0, 0.215, 0.05]], 0.017, BLUE,
  [[[0.0, 0.215, 0.05], [-0.16, 0.235, 0.03], [-0.3, 0.2, -0.01]], [[0.0, 0.215, 0.05], [0.16, 0.245, 0.03], [0.29, 0.21, -0.01]]]);
vessel('PV', 'Pulmonary vein', 'the vein that brings blood from the lungs back to the left atrium.',
  [[0.29, 0.12, -0.04], [0.2, 0.1, -0.04], [0.125, 0.085, -0.03]], 0.014, RED,
  [[[-0.29, 0.12, -0.05], [-0.1, 0.1, -0.09], [0.08, 0.09, -0.07], [0.12, 0.08, -0.04]]]);
vessel('AO', 'Aorta', 'the biggest artery. It arches over the top and carries blood from the left ventricle to the whole body.',
  [[0.035, 0.0, 0.015], [0.03, 0.15, 0.02], [0.02, 0.27, -0.02], [-0.04, 0.29, -0.06], [-0.035, 0.18, -0.09], [0.02, 0.0, -0.1], [0.11, -0.18, -0.08], [0.13, -0.29, -0.05]], 0.021, RED);

// lungs and body
{
  const pt = part('LU', 'Lungs', 'where blood picks up oxygen and gets rid of carbon dioxide.');
  const lm = mat(0xf0a0b4, { roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const geo = new THREE.SphereGeometry(1, 28, 20);
    const pos = geo.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const n = 1 + 0.06 * Math.sin(v.x * 9 + v.y * 7) * Math.cos(v.z * 8); pos.setXYZ(i, v.x * n, v.y * n, v.z * n); }
    geo.computeVertexNormals();
    const lung = mesh(geo, lm, sx * 0.34, 0.17, -0.04); lung.scale.set(0.085, 0.13, 0.065);
    pt.group.add(lung);
  }
  pt.center = new THREE.Vector3(-0.34, 0.17, -0.04);
}
{
  const pt = part('BO', 'Body', 'the organs and tissues, where blood gives oxygen to the cells.');
  const c = kit.canvasPlane(0.46, 0.09, 900);
  const { ctx, c: cv } = c;
  ctx.fillStyle = '#f6d7c3'; kit.roundRect(ctx, 0, 0, cv.width, cv.height, 30); ctx.fill();
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3;
  for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.moveTo(Math.random() * cv.width, Math.random() * cv.height); ctx.bezierCurveTo(Math.random() * cv.width, Math.random() * cv.height, Math.random() * cv.width, Math.random() * cv.height, Math.random() * cv.width, Math.random() * cv.height); ctx.stroke(); }
  ctx.fillStyle = '#5b2333'; ctx.font = 'bold 40px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BODY TISSUES', cv.width / 2, cv.height / 2);
  c.update();
  const slab = mesh(new THREE.BoxGeometry(0.47, 0.095, 0.05), lam(0xe8bfa7), 0, -0.31, -0.07);
  c.mesh.position.set(0, -0.31, -0.044);
  pt.group.add(slab, c.mesh);
  pt.center = new THREE.Vector3(0, -0.31, -0.04);
}
// valves: little white flaps that swing open when blood passes
function valve(key, name, hint, pos, rotZ = 0) {
  const pt = part(key, name, hint, { center: new THREE.Vector3(...pos) });
  const g = pt.group; g.position.set(...pos); g.rotation.z = rotZ;
  const fm = mat(0xfaf6ef, { side: THREE.DoubleSide, roughness: 0.5 });
  pt.flaps = [-1, 1].map((s) => {
    const hinge = new THREE.Group(); hinge.position.x = s * 0.022;
    const f = mesh(new THREE.PlaneGeometry(0.022, 0.016), fm, -s * 0.011, -0.006, 0.004);
    hinge.add(f); hinge.rotation.z = s * 0.1; g.add(hinge);
    hinge.userData.s = s;
    return hinge;
  });
  g.add(mesh(new THREE.TorusGeometry(0.022, 0.003, 6, 24), mat(0xd8d0c4), 0, 0, 0.004));
  // an invisible disc makes the whole valve easy to point at
  g.add(mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 0, 0.008));
  return pt;
}
valve('TV', 'Tricuspid valve', 'between the right atrium and right ventricle.', [-0.07, 0.005, 0.03], 0.15);
valve('BV', 'Bicuspid (mitral) valve', 'between the left atrium and left ventricle.', [0.072, 0.008, 0.03], -0.15);
valve('SP', 'Semilunar valve (pulmonary)', 'at the start of the pulmonary artery.', [-0.033, 0.02, 0.065], 0);
valve('SA', 'Semilunar valve (aortic)', 'at the start of the aorta.', [0.036, 0.025, 0.04], 0);
async function openValve(key) {
  const v = parts[key];
  sfx.tone(140, 0.12, 'sine', 0.12);
  await tween(0.18, (k) => v.flaps.forEach((h) => { h.rotation.z = h.userData.s * (0.1 + k * 1.2); }));
  await wait(0.35);
  await tween(0.25, (k) => v.flaps.forEach((h) => { h.rotation.z = h.userData.s * (1.3 - k * 1.2); }));
  sfx.tone(110, 0.1, 'sine', 0.1);
}

// ================================================================= the heartbeat
// beat.phase runs 0..1 each beat: the atria squeeze first, then the ventricles. A soft "lub-dub" plays,
// and a hand held close to the heart feels each beat as a buzz in the controller.
const CHAMBERS = ['RA', 'LA', 'RV', 'LV'];
const beat = { bpm: 72, phase: 0, manual: false, sound: true, lastPump: -9 };
let beatBoost = 0;
function lubDub(second) {
  if (!beat.sound) return;
  sfx.tone(second ? 70 : 52, second ? 0.09 : 0.13, 'sine', second ? 0.16 : 0.22, second ? 45 : 38);
}
function startBeat() { beat.phase = 0; lubDub(false); feelBeat(); }
function feelBeat() {
  if (!kit.renderer.xr.isPresenting) return;
  const hc = heart.getWorldPosition(new THREE.Vector3());
  for (const p of kit.input.pointers) if (p.tipOk && p.tip.distanceTo(hc) < 0.28) kit.input.haptic(p, 0.7, 45);
}
kit.tick((dt) => {
  const prev = beat.phase;
  if (beat.manual) beat.phase = Math.min(1, beat.phase + dt * 2.2);          // each pump plays one beat
  else { beat.phase += dt * beat.bpm / 60; if (beat.phase >= 1) { beat.phase -= 1; startBeat(); } }
  if (prev < 0.42 && beat.phase >= 0.42) lubDub(true);
  const ph = beat.phase;
  const atria = ph < 0.15 ? Math.sin(ph / 0.15 * Math.PI) : 0;
  const vent = ph > 0.18 && ph < 0.45 ? Math.sin((ph - 0.18) / 0.27 * Math.PI) : 0;
  beat.vent = vent;
  beatBoost = Math.max(0, beatBoost - dt * 1.5);
  const amp = 0.035 + beatBoost * 0.08;
  for (const k of CHAMBERS) {
    const sc = 1 - amp * (k[1] === 'A' ? atria : vent);
    parts[k].group.scale.set(sc, sc, sc);
  }
});

// one-line names next to each part (shown when the label is placed correctly in level 1)
const LABEL_SPOTS = {
  RA: [-0.25, 0.0, 0.03], RV: [-0.25, -0.1, 0.03], LA: [0.25, 0.0, 0.03], LV: [0.25, -0.12, 0.03],
  AO: [0.14, 0.33, 0.0], PA: [-0.16, 0.33, 0.04], PV: [0.41, -0.01, 0.0], VC: [-0.27, -0.22, 0.0],
};
const PIN_SPOTS = {
  RA: [-0.09, 0.07, 0.012], RV: [-0.07, -0.08, 0.012], LA: [0.085, 0.08, 0.01], LV: [0.075, -0.1, 0.01],
  AO: [0.03, 0.27, -0.0], PA: [-0.1, 0.228, 0.045], PV: [0.21, 0.1, -0.025], VC: [-0.148, -0.18, -0.04],
};
const LABEL_KEYS = Object.keys(LABEL_SPOTS);

// ================================================================= blood cell
const cellGeo = new THREE.LatheGeometry([[0, 0.003], [0.008, 0.004], [0.013, 0.0035], [0.016, 0], [0.013, -0.0035], [0.008, -0.004], [0, -0.003]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
const cellMat = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.4, depthTest: false });
const cell = mesh(cellGeo, cellMat);
cell.scale.setScalar(1.3); cell.renderOrder = 960; noHit(cell);
const cellGlow = mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false }));
cellGlow.renderOrder = 959; noHit(cellGlow);
cell.add(cellGlow);
heart.add(cell);
cell.visible = false;
const _cp = new THREE.Vector3();
async function moveAlong(points, dur = 1.2) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p))));
  await tween(dur, (k) => { curve.getPoint(k, _cp); cell.position.copy(_cp); cell.rotation.set(kit.time * 3, kit.time * 2, 0); });
}
function curvePts(key, a, b, idx = 0, n = 8) {
  const cv = parts[key].curves[idx]; const out = [];
  for (let i = 0; i <= n; i++) out.push(cv.getPoint(a + (b - a) * i / n));
  return out;
}
const C = (k) => parts[k].center.clone();

// the route of one lap and how the cell moves into each place
const ROUTE = ['VC', 'RA', 'RV', 'PA', 'LU', 'PV', 'LA', 'LV', 'AO', 'BO'];
const MOVES = {
  VC: () => moveAlong(curvePts('VC', 0, 0.55, 1)),
  RA: () => moveAlong([...curvePts('VC', 0.55, 1, 1, 4), C('RA')], 0.9),
  RV: async () => { beatBoost = 1; openValve('TV'); await moveAlong([C('RA'), parts.TV.center, C('RV')], 0.9); },
  PA: async () => { beatBoost = 1; openValve('SP'); await moveAlong([C('RV'), parts.SP.center, ...curvePts('PA', 0.15, 1, 0, 5)], 1.0); },
  LU: async () => {
    await moveAlong([...curvePts('PA', 0, 1, 1, 6), new THREE.Vector3(-0.34, 0.15, 0.03)], 1.1);
    kit.popText('O₂ in, CO₂ out', heart.localToWorld(new THREE.Vector3(-0.34, 0.25, 0.08)), '#1e8449');
    await kit.colorTo(cellMat, RED, 0.9);
  },
  PV: () => moveAlong([new THREE.Vector3(-0.34, 0.15, 0.03), ...curvePts('PV', 0, 0.45, 1, 5)], 1.1),
  LA: () => moveAlong([...curvePts('PV', 0.45, 1, 1, 5), C('LA')], 1.0),
  LV: async () => { beatBoost = 1; openValve('BV'); await moveAlong([C('LA'), parts.BV.center, C('LV')], 0.9); },
  AO: async () => { beatBoost = 1; openValve('SA'); await moveAlong([C('LV'), parts.SA.center, ...curvePts('AO', 0.1, 0.45, 0, 6)], 1.1); },
  BO: async () => {
    await moveAlong([...curvePts('AO', 0.45, 1, 0, 8), new THREE.Vector3(0.05, -0.31, 0.0)], 1.3);
    kit.popText('O₂ to the cells', heart.localToWorld(new THREE.Vector3(0.05, -0.22, 0.06)), '#b03a2e');
    await kit.colorTo(cellMat, BLUE, 0.9);
  },
};
for (const k in parts) if (!parts[k].center) parts[k].center = parts[k].curves[k === 'VC' ? 1 : 0].getPoint(0.5);
parts.RA.center = new THREE.Vector3(-0.08, 0.07, 0.01);
parts.LA.center = new THREE.Vector3(0.08, 0.075, 0.0);
parts.RV.center = new THREE.Vector3(-0.06, -0.075, 0.01);
parts.LV.center = new THREE.Vector3(0.065, -0.085, 0.0);

// ================================================================= blood streaming through the heart
// Red and blue cells flow along every vessel in the right direction and swirl in the chambers.
// They surge when the ventricles squeeze. Two instanced meshes: two draw calls for every cell.
const flowCellGeo = new THREE.LatheGeometry([[0, 0.002], [0.0045, 0.0026], [0.007, 0.002], [0.0085, 0], [0.007, -0.002], [0.0045, -0.0026], [0, -0.002]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
const streams = [];   // { curve, reverse, color: 'red'|'blue', r }
const addStream = (key, idx, reverse) => { const pt = parts[key]; streams.push({ curve: pt.curves[idx], reverse, blue: pt.mat.color.getHex() === BLUE, r: (idx ? 0.85 : 1) * pt.radius }); };
addStream('VC', 0, false); addStream('VC', 1, false);                 // into the right atrium
addStream('PA', 0, false); addStream('PA', 1, false); addStream('PA', 2, false);   // out to the lungs
addStream('PV', 0, false); addStream('PV', 1, false);                 // back from the lungs
addStream('AO', 0, false);                                            // out to the body
const flowCells = [];
for (const [si, st] of streams.entries()) {
  const n = Math.round(st.curve.getLength() / 0.03);
  for (let i = 0; i < n; i++) flowCells.push({ st: si, t: i / n, off: new THREE.Vector2((Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(st.r * 0.9), spin: Math.random() * 6 });
}
// cells swirling inside each chamber
const chamberCells = [];
for (const k of CHAMBERS) for (let i = 0; i < 9; i++) chamberCells.push({ k, a: Math.random() * 6.28, b: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8 });
const nBlue = flowCells.filter((c) => streams[c.st].blue).length + chamberCells.filter((c) => c.k[0] === 'R').length;
const nRed = flowCells.length + chamberCells.length - nBlue;
const blueCells = new THREE.InstancedMesh(flowCellGeo, mat(0x4f6fd6, { roughness: 0.35 }), nBlue);
const redCells = new THREE.InstancedMesh(flowCellGeo, mat(0xe0423f, { roughness: 0.35 }), nRed);
for (const m of [blueCells, redCells]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; noHit(m); m.raycast = () => {}; heart.add(m); }
const _fp = new THREE.Vector3(), _ft = new THREE.Vector3(), _fn = new THREE.Vector3(), _fb = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fm = new THREE.Matrix4(), _fs = new THREE.Vector3(1, 1, 1), _fe = new THREE.Euler();
kit.tick((dt, t) => {
  const surge = 0.25 + 1.6 * (beat.vent || 0);
  let ib = 0, ir = 0;
  for (const c of flowCells) {
    const st = streams[c.st];
    c.t = (c.t + dt * surge * 0.09 / st.curve.getLength() * 0.3 * 3) % 1;
    const u = st.reverse ? 1 - c.t : c.t;
    st.curve.getPointAt(u, _fp); st.curve.getTangentAt(u, _ft);
    _fn.set(0, 1, 0).cross(_ft).normalize(); if (_fn.lengthSq() < 0.01) _fn.set(1, 0, 0); _fb.crossVectors(_ft, _fn);
    _fp.addScaledVector(_fn, c.off.x).addScaledVector(_fb, c.off.y);
    _fq.setFromEuler(_fe.set(t * 2 + c.spin, c.spin, t * 1.3));
    _fm.compose(_fp, _fq, _fs);
    if (st.blue) blueCells.setMatrixAt(ib++, _fm); else redCells.setMatrixAt(ir++, _fm);
  }
  for (const c of chamberCells) {
    const pt = parts[c.k]; const o = pt.outer; const sc = pt.group.scale.x;
    c.a += dt * c.sp * surge * 0.8; c.b += dt * c.sp * 0.5;
    _fp.set(Math.cos(c.a) * o[0] * 0.55, Math.sin(c.b) * o[1] * 0.55, -Math.abs(Math.sin(c.a + c.b)) * o[2] * 0.5).multiplyScalar(sc).add(pt.group.position);
    _fq.setFromEuler(_fe.set(t + c.a, c.b, 0));
    _fm.compose(_fp, _fq, _fs);
    if (c.k[0] === 'R') blueCells.setMatrixAt(ib++, _fm); else redCells.setMatrixAt(ir++, _fm);
  }
  blueCells.instanceMatrix.needsUpdate = true; redCells.instanceMatrix.needsUpdate = true;
});

// ================================================================= turntable: turn the heart round to see the back
const turntable = new THREE.Group();
turntable.position.set(0, TABLE_Y, -0.64);
scene.add(turntable);
{
  const steel = mat(0xb9c2c9, { metalness: 0.8, roughness: 0.3 });
  turntable.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 48), mat(0x2b3138, { roughness: 0.4 }), 0, 0.01, 0));
  turntable.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 12), steel, 0, 0.055, 0));
  const sh = kit.contactShadow(0.6, 0.6, 0.5); sh.position.y = 0.002; turntable.add(sh);
  noHit(turntable);
}
const spinRing = new THREE.Group(); turntable.add(spinRing);
const ringMat = mat(0x6f8fa8, { metalness: 0.4, roughness: 0.35, emissive: 0x000000 });
spinRing.add(mesh(new THREE.TorusGeometry(0.205, 0.009, 10, 64).rotateX(Math.PI / 2), ringMat, 0, 0.022, 0));
const gripMat = mat(0xe0a83a, { roughness: 0.35 });
const grip = mesh(new THREE.SphereGeometry(0.022, 16, 12), gripMat, 0, 0.03, 0.205);
spinRing.add(grip);
// arrows printed on the ring
for (const a of [0.7, -0.7, Math.PI - 0.7, Math.PI + 0.7]) {
  const ar = mesh(new THREE.ConeGeometry(0.009, 0.022, 10).rotateZ(Math.PI / 2), mat(0xe8e6e0), Math.sin(a) * 0.205, 0.034, Math.cos(a) * 0.205);
  ar.rotation.y = a + (a > 0 && a < Math.PI ? 0 : Math.PI); spinRing.add(ar);
}
const spin = { a0: 0, r0: 0, active: false };
kit.draggable(spinRing, {
  name: 'Turn the heart round',
  enabled: () => true,
  // drag on the turntable's own horizontal plane; the angle around its centre turns the heart
  plane: () => new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TABLE_Y + 0.03)),
  distance: (wp) => { turntable.worldToLocal(_lp2.copy(wp)); return Math.abs(Math.hypot(_lp2.x, _lp2.z) - 0.205) + Math.max(0, Math.abs(_lp2.y - 0.025) - 0.02); },
  onStart: (pt) => { const l = turntable.worldToLocal(pt.clone()); spin.a0 = Math.atan2(l.x, l.z); spin.r0 = heart.rotation.y; spin.active = true; ringMat.emissive.set(0x23506e); },
  onMove: (pt) => { const l = turntable.worldToLocal(pt.clone()); const a = Math.atan2(l.x, l.z); let d = a - spin.a0; d = Math.atan2(Math.sin(d), Math.cos(d)); setSpin(spin.r0 + d); },
  onEnd: () => { spin.active = false; ringMat.emissive.set(0x000000); },
});
const _lp2 = new THREE.Vector3();
function setSpin(r) { heart.rotation.y = r; spinRing.rotation.y = r; }
async function resetSpin() { const r0 = heart.rotation.y; const r1 = Math.round(r0 / (Math.PI * 2)) * Math.PI * 2; if (Math.abs(r1 - r0) > 0.01) await tween(0.6, (k) => setSpin(r0 + (r1 - r0) * k)); setSpin(0); }

// ================================================================= heart-rate monitor (ECG)
const ecg = kit.canvasPlane(0.4, 0.24, 1100);
const monitor = new THREE.Group();
monitor.position.set(0.6, TABLE_Y + 0.2, -0.6); monitor.rotation.set(-0.15, -0.55, 0, 'YXZ');
monitor.add(mesh(new THREE.BoxGeometry(0.43, 0.27, 0.05), mat(0x2a3138, { roughness: 0.45, metalness: 0.2 }), 0, 0, -0.028), ecg.mesh);
monitor.add(mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), mat(0x8d969e, { metalness: 0.7, roughness: 0.35 }), 0, -0.2, -0.04));
monitor.add(mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), mat(0x8d969e, { metalness: 0.7, roughness: 0.35 }), 0, -0.294, -0.04));
noHit(monitor); scene.add(monitor);
const trace = new Float32Array(240); let traceI = 0, ecgT = 0, lastBpmShown = '';
function ecgValue(ph) {
  // a P wave, the QRS spike and a T wave for one beat
  const g = (x, m, w) => Math.exp(-((x - m) * (x - m)) / (2 * w * w));
  return 0.12 * g(ph, 0.08, 0.025) - 0.12 * g(ph, 0.17, 0.008) + 1.0 * g(ph, 0.19, 0.01) - 0.25 * g(ph, 0.215, 0.01) + 0.25 * g(ph, 0.38, 0.04);
}
kit.tick((dt) => {
  ecgT += dt;
  trace[traceI] = beat.manual && beat.phase >= 1 ? 0 : ecgValue(beat.phase);
  traceI = (traceI + 1) % trace.length;
  if (ecgT < 1 / 30) return; ecgT = 0;
  const { ctx, c } = ecg; const W = c.width, H = c.height;
  ctx.fillStyle = '#0f1a14'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(80,160,110,0.15)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.strokeStyle = '#5df08f'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath();
  const gx = W * 0.68;
  for (let i = 0; i < trace.length; i++) {
    const v = trace[(traceI + i) % trace.length];
    const x = (i / trace.length) * gx, y = H * 0.62 - v * H * 0.42;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#5df08f'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 30px system-ui'; ctx.fillText('HEART RATE', W - 18, 46);
  const shown = Math.round(shownBpm()), inBand = !L4.target || (shown >= L4.target[0] && shown <= L4.target[1]);
  ctx.fillStyle = inBand ? '#5df08f' : '#f0b75d';
  ctx.font = 'bold 110px system-ui'; ctx.fillText(String(shown), W - 18, 160);
  ctx.font = '30px system-ui'; ctx.fillText('beats / min', W - 18, 200);
  if (L4.target) {
    ctx.fillStyle = '#e0a83a'; ctx.font = 'bold 30px system-ui'; ctx.fillText(`target ${L4.target[0]}–${L4.target[1]}`, W - 18, 252);
    const st = STAGES[L4.stage]; ctx.textAlign = 'left'; ctx.fillStyle = '#e4e8ea'; ctx.font = 'bold 30px system-ui';
    ctx.fillText(`${st.name.toUpperCase()}  ·  ${Math.max(0, Math.ceil(STAGE_S - L4.t))} s`, 18, H - 24);
    // a bar showing how much of this stage you have kept in the band
    ctx.fillStyle = 'rgba(93,240,143,0.18)'; ctx.fillRect(18, H - 16, gx - 36, 8);
    ctx.fillStyle = '#5df08f'; ctx.fillRect(18, H - 16, (gx - 36) * Math.min(1, L4.inBand / SCORE_S), 8);
  }
  // a heart symbol that pulses with each beat
  const pulse = 1 + 0.25 * Math.max(0, 1 - beat.phase * 4);
  ctx.save(); ctx.translate(W - 240, 40); ctx.scale(pulse, pulse); ctx.fillStyle = '#ff5a6a'; ctx.font = '40px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♥', 0, 14); ctx.restore();
  ecg.update();
});
function shownBpm() { return beat.manual ? (L4.bpm || 0) : beat.bpm; }

// ================================================================= selecting parts (levels 2 and 3)
const mode = { kind: 'idle' };
const SELECTABLE = (k) => (mode.kind === 'route' && !['TV', 'BV', 'SP', 'SA'].includes(k)) || mode.kind === 'quiz';
const _lp = new THREE.Vector3();
for (const k in parts) {
  const pt = parts[k];
  // near distance: to the vessel centre line, or to the chamber / organ centre
  const distance = (wp) => {
    heart.worldToLocal(_lp.copy(wp));
    if (pt.curves) { let best = Infinity; for (const cv of pt.curves) for (let i = 0; i <= 24; i++) best = Math.min(best, cv.getPoint(i / 24).distanceTo(_lp)); return best - pt.radius; }
    if (k === 'LU') return Math.min(_lp.distanceTo(new THREE.Vector3(-0.34, 0.17, -0.04)), _lp.distanceTo(new THREE.Vector3(0.34, 0.17, -0.04))) - 0.08;
    if (k === 'BO') return Math.max(0, Math.abs(_lp.x) - 0.23, Math.abs(_lp.y + 0.31) - 0.05);
    return _lp.distanceTo(pt.center) - (pt.radius || 0.02);
  };
  kit.interactive(pt.group, { name: '', onSelect: () => onPart(k), enabled: () => SELECTABLE(k), distance, highlight: true, priority: pt.flaps ? 2 : 0 });
}
async function flash(k, color = 0xffe066, times = 3) {
  const mats = [];
  parts[k].group.traverse((o) => { if (o.material && o.material.emissive) mats.push(o.material); });
  for (let i = 0; i < times; i++) {
    mats.forEach((m) => m.emissive.set(color)); mats.forEach((m) => { m.emissiveIntensity = 0.6; });
    await wait(0.22);
    mats.forEach((m) => m.emissive.set(0x000000));
    await wait(0.18);
  }
}
function onPart(k) {
  if (mode.kind === 'route') routePick(k);
  else if (mode.kind === 'quiz') quizPick(k);
}

// ================================================================= level 1: label the heart
const labelsGroup = new THREE.Group(); scene.add(labelsGroup);
const cards = LABEL_KEYS.map((k, i) => {
  const card = label(parts[k].name, { w: 0.17, h: 0.045, bg: '#ffffff', fg: '#13293d', font: 'bold 30px system-ui, sans-serif', res: 1200 });
  card.material.side = THREE.DoubleSide;
  const back = mesh(new THREE.BoxGeometry(0.175, 0.05, 0.006), lam(0x2a3a48), 0, 0, -0.004);
  card.add(back);
  card.userData.part = k;
  labelsGroup.add(card);
  return card;
});
function layoutCards() {
  kit.shuffle(cards).forEach((c, i) => {
    labelsGroup.attach(c);
    c.position.set(-0.28 + (i % 4) * 0.19, TABLE_Y + 0.03, -0.34 - Math.floor(i / 4) * 0.08);
    c.rotation.set(-1.05, 0, 0);
    c.scale.set(1, 1, 1);
    c.userData.locked = false; c.userData.wrong = 0;
    c.userData.line && (c.userData.line.visible = false);
  });
}
layoutCards();
cards.forEach((c) => kit.carryable(c, { name: `Label: ${parts[c.userData.part].name}`, canPick: () => mode.kind === 'label', holdOffset: new THREE.Vector3(0, 0.035, -0.02) }));
// pins: glowing dots on each part; a label carried to a pin is placed there
const pinMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
const pins = LABEL_KEYS.map((k) => {
  const pin = new THREE.Group();
  pin.position.set(...PIN_SPOTS[k]);
  pin.add(mesh(new THREE.SphereGeometry(0.009, 12, 8), pinMat));
  const halo = mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  pin.add(halo);
  pin.userData.part = k;
  heart.add(pin);
  kit.slot(pin, {
    name: 'Label spot', reach: 0.06,
    enabled: () => mode.kind === 'label' && !pin.userData.filled,
    accept: (card) => {
      if (card.userData.part === k) return true;
      card.userData.wrong++;
      score.streak = 0;
      const a = card.userData.part, b = k;
      const sides = { RA: 'LA', LA: 'RA', RV: 'LV', LV: 'RV' };
      if (sides[a] === b) return `Careful with sides: this spot is the heart’s ${b[0] === 'R' ? 'RIGHT' : 'LEFT'} side. The heart’s right is on YOUR left.`;
      return `That is not the ${parts[a].name.toLowerCase()}. Look for ${parts[a].hint}`;
    },
    onPlace: (card) => placeCard(card, pin),
  });
  return pin;
});
kit.tick((dt, t) => { pinMat.color.setHSL(0.13, 1, 0.5 + 0.15 * Math.sin(t * 5)); });
async function placeCard(card, pin) {
  const k = pin.userData.part;
  pin.userData.filled = true; pin.visible = false;
  card.userData.locked = true;
  score.add(card.userData.wrong ? 3 : 10, heart.localToWorld(new THREE.Vector3(...LABEL_SPOTS[k])));
  say(`Yes: the ${parts[k].name.toLowerCase()} is ${parts[k].hint}`, 'good', 5);
  L1.done++;
  l1Draw();
  flash(k, 0x2ecc71, 2);
  const spot = new THREE.Vector3(...LABEL_SPOTS[k]);
  await kit.settle(card, heart, spot, new THREE.Quaternion(), new THREE.Vector3(0.85, 0.85, 0.85));
  // leader line from the label to the part
  if (!card.userData.line) {
    const g = new THREE.BufferGeometry().setFromPoints([spot, new THREE.Vector3(...PIN_SPOTS[k])]);
    card.userData.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x13293d }));
    card.userData.line.userData.noHit = true;
    heart.add(card.userData.line);
  }
  card.userData.line.visible = true;
  if (L1.done === cards.length && mode.kind === 'label') {
    mode.kind = 'done';
    await wait(1.4);
    flow.complete(['Remember: the right side of the heart (your left) carries deoxygenated blood; the left side carries oxygenated blood.']);
  }
}
const L1 = { done: 0 };
function l1Draw() {
  const w = howTo(kit.kind);
  board.draw({
    heading: 'Level 1: Label the heart', level: `${L1.done} of 8 labels`,
    body: ['You are looking at the front of a heart cut open. **Blue** is blood without much oxygen, **red** is blood full of oxygen.',
      `Pick up a label (${w.pick}) and put it on the glowing dot of the right part (${w.place}).`,
      'Watch out: the heart’s **right** side is on **your left**, just like in your textbook diagrams.'],
    footer: '10 points for each label placed first time.',
  });
}
function l1Start() {
  mode.kind = 'label'; resetSpin();
  cell.visible = false;
  L1.done = 0;
  cards.forEach((c) => { c.userData.home.parent.attach(c); if (c.userData.line) c.userData.line.visible = false; });
  layoutCards(); cards.forEach((c) => { kit.storeHome(c); c.visible = true; });
  pins.forEach((p) => { p.userData.filled = false; p.visible = true; });
  labelsGroup.visible = true;
  l1Draw();
}
function hideLabels() {
  cards.forEach((c) => { if (c.userData.locked) c.visible = true; });
  pins.forEach((p) => { p.visible = false; });
}

// ================================================================= level 2: pump the blood
const L2 = { lap: 0, step: 0, tries: 0, busy: false, t0: 0, missed: 0 };
const ROUTE_HINTS = {
  VC: 'Blood from the body returns to the heart along the big vein, the vena cava.',
  RA: 'The vena cava empties into the RIGHT ATRIUM (top chamber, your left).',
  RV: 'From the right atrium, blood passes the tricuspid valve down into the RIGHT VENTRICLE.',
  PA: 'The right ventricle pumps blood up the PULMONARY ARTERY.',
  LU: 'The pulmonary artery takes blood to the LUNGS to pick up oxygen.',
  PV: 'Oxygenated blood returns from the lungs in the PULMONARY VEINS.',
  LA: 'The pulmonary veins empty into the LEFT ATRIUM (top chamber, your right).',
  LV: 'From the left atrium, blood passes the bicuspid valve into the LEFT VENTRICLE.',
  AO: 'The left ventricle pumps blood out through the AORTA.',
  BO: 'The aorta carries oxygenated blood to the BODY organs and tissues.',
};
function l2Draw(extra = '') {
  const w = howTo(kit.kind);
  const timed = L2.lap === 1;
  board.draw({
    heading: timed ? 'Level 2: Pump the blood (timed lap)' : 'Level 2: Pump the blood', level: `Step ${Math.min(L2.step + 1, 10)} of 10`,
    body: [`A blood cell is in the body. Guide it all the way round. Each time, ${w.choose} the part where the blood goes **next**.`,
      timed ? 'Lap 2: do it again from memory. Finish in under 40 seconds for a bonus.' : 'Lap 1: take your time. A wrong choice shows you a hint.',
      extra],
    items: [{ text: `Route so far: **Body** → ${ROUTE.slice(0, L2.step).map((k) => parts[k].name).join(' → ')}${L2.step ? ' → ' : ''}**?**`, state: 'now' }],
    footer: 'Double circulation: blood passes through the heart twice in each full lap of the body.',
  });
}
async function l2Start() {
  mode.kind = 'route'; resetSpin();
  hideLabels();
  Object.values(parts).forEach((p) => { p.group.userData.interactive.name = ''; });
  L2.lap = 0; L2.step = 0; L2.tries = 0; L2.busy = false;
  cellMat.color.set(BLUE);
  cell.position.set(-0.05, -0.31, 0.0); cell.visible = true;
  l2Draw();
  L2.t0 = kit.time;
}
async function routePick(k) {
  if (L2.busy) return;
  const want = ROUTE[L2.step];
  const run = kit.newRun();
  if (k === want) {
    L2.busy = true;
    const pts = L2.tries ? 3 : 8;
    score.add(pts, heart.localToWorld(C(k).add(new THREE.Vector3(0, 0.06, 0.06))));
    sfx.good();
    L2.tries = 0;
    await MOVES[k]();
    if (!kit.isRun(run)) return;
    L2.step++;
    L2.busy = false;
    if (L2.step >= ROUTE.length) {
      if (L2.lap === 0) {
        say('One full lap! The blood went through the heart twice. Now a timed lap.', 'good', 5);
        kit.burst(heart.localToWorld(new THREE.Vector3(0, 0.1, 0.1)), 40);
        L2.lap = 1; L2.step = 0;
        await wait(1.2);
        if (!kit.isRun(run)) return;
        L2.t0 = kit.time; l2Draw();
      } else {
        const secs = kit.time - L2.t0;
        const bonus = Math.max(0, Math.min(30, Math.round(40 - secs)));
        if (bonus) score.add(bonus, heart.localToWorld(new THREE.Vector3(0, 0.3, 0.1)));
        mode.kind = 'done';
        flow.complete([`Timed lap: **${secs.toFixed(1)} s**${bonus ? `, bonus **${bonus}**` : ' (no time bonus)'}.`,
          'Route: body → vena cava → right atrium → right ventricle → pulmonary artery → lungs → pulmonary vein → left atrium → left ventricle → aorta → body.']);
      }
    } else l2Draw();
  } else {
    L2.tries++;
    score.streak = 0;
    say(`Not the ${parts[k].name.toLowerCase()}. ${ROUTE_HINTS[want]}`, 'bad', 5);
    l2Draw(`Hint: ${ROUTE_HINTS[want]}`);
    if (L2.tries >= 2) flash(want);
  }
}

// ================================================================= level 3: heart quiz
const QUIZ = [
  { q: 'Which chamber has the **thickest muscular wall**?', a: 'LV', why: 'The left ventricle pumps blood all round the body, so it needs the strongest muscle. Look at the thick cut wall.' },
  { q: 'Which blood vessel carries **deoxygenated** blood **to the lungs**?', a: 'PA', why: 'The pulmonary artery is the only artery that carries deoxygenated blood.' },
  { q: 'Which blood vessel brings **oxygenated** blood **from the lungs** to the heart?', a: 'PV', why: 'The pulmonary vein is the only vein that carries oxygenated blood.' },
  { q: 'Which chamber **receives blood from the body**?', a: 'RA', why: 'The vena cava empties into the right atrium.' },
  { q: 'Which valve stops blood flowing back from the **left ventricle** into the **left atrium**?', a: 'BV', why: 'The bicuspid (mitral) valve has two flaps and closes when the left ventricle squeezes.' },
  { q: 'Which is the **largest artery**, carrying blood from the heart to the whole body?', a: 'AO', why: 'The aorta carries oxygenated blood under high pressure from the left ventricle.' },
];
const L3 = { order: [], i: 0, tries: 0, busy: false };
function l3Draw(extra = '') {
  const qq = QUIZ[L3.order[L3.i]];
  board.draw({
    heading: 'Level 3: Heart quiz', level: `Question ${L3.i + 1} of ${QUIZ.length}`, big: true,
    body: [qq.q, `${howTo(kit.kind).choose[0].toUpperCase() + howTo(kit.kind).choose.slice(1)} the part on the model. The valves are the small white flaps.`, extra],
    footer: '10 points first time, 3 points after a wrong try.',
  });
}
function l3Start() {
  mode.kind = 'quiz'; resetSpin();
  hideLabels(); cell.visible = false;
  Object.values(parts).forEach((p) => { p.group.userData.interactive.name = ''; });
  L3.order = kit.shuffle(QUIZ.map((_, i) => i)); L3.i = 0; L3.tries = 0; L3.busy = false;
  l3Draw();
}
async function quizPick(k) {
  if (L3.busy) return;
  const qq = QUIZ[L3.order[L3.i]];
  const run = kit.newRun();
  if (k === qq.a) {
    L3.busy = true;
    score.add(L3.tries ? 3 : 10, heart.localToWorld(C(k).add(new THREE.Vector3(0, 0.06, 0.06))));
    say(`Correct: ${parts[k].name}. ${qq.why}`, 'good', 5);
    l3Draw(`**${parts[k].name}.** ${qq.why}`);
    await flash(k, 0x2ecc71, 2);
    await wait(2.2);
    if (!kit.isRun(run)) return;
    L3.i++; L3.tries = 0; L3.busy = false;
    if (L3.i >= QUIZ.length) { mode.kind = 'done'; flow.complete(['Arteries carry blood away from the heart; veins carry blood back to it.']); }
    else l3Draw();
  } else {
    L3.tries++; score.streak = 0;
    say(`That is the ${parts[k].name.toLowerCase()}. Try again.`, 'bad');
    if (L3.tries >= 2) { l3Draw(`Hint: look for ${parts[qq.a].hint}`); flash(qq.a); }
  }
}

// ================================================================= level 4: exercise (you are the pacemaker)
// Each squeeze of the bulb makes the heart beat once. Keep the heart rate inside the target band
// while the body rests, walks and runs: exercise needs more oxygen, so the heart must beat faster.
const pump = new THREE.Group();
pump.position.set(0.5, TABLE_Y, -0.37);
scene.add(pump);
const bulbMat = mat(0xc0392b, { roughness: 0.55, emissive: 0x000000 });
const bulb = mesh(new THREE.LatheGeometry([[0, 0], [0.026, 0.004], [0.041, 0.03], [0.043, 0.055], [0.035, 0.082], [0.016, 0.1], [0.011, 0.112], [0, 0.114]].map(([x, y]) => new THREE.Vector2(x, y)), 32), bulbMat, 0, 0.022, 0);
pump.add(bulb);
{
  const steel = mat(0xb9c2c9, { metalness: 0.8, roughness: 0.3 });
  const base = mesh(new THREE.CylinderGeometry(0.075, 0.082, 0.022, 40), mat(0x2b3138, { roughness: 0.4 }), 0, 0.011, 0); pump.add(base);
  pump.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 16), steel, 0, 0.145, 0));
  // a tube from the bulb to the turntable post: the "pacemaker lead"
  const a = new THREE.Vector3(0, 0.16, 0), b = pump.worldToLocal(new THREE.Vector3(0.0, TABLE_Y + 0.07, -0.64));
  const curve = new THREE.CatmullRomCurve3([a, a.clone().add(new THREE.Vector3(0, 0.08, -0.02)), new THREE.Vector3(b.x * 0.5, 0.16, b.z * 0.5), b.clone().add(new THREE.Vector3(0.04, 0.03, 0.02)), b]);
  pump.add(mesh(new THREE.TubeGeometry(curve, 48, 0.006, 8), mat(0x8f2a20, { roughness: 0.5 })));
  const sh = kit.contactShadow(0.22, 0.22, 0.5); sh.position.y = 0.002; pump.add(sh);
  noHit(base);
}
// a ring of light around the base flashes at the target tempo: a beat to follow
const paceMat = new THREE.MeshBasicMaterial({ color: 0x3a2a20 });
const paceRing = mesh(new THREE.TorusGeometry(0.078, 0.006, 8, 48).rotateX(Math.PI / 2), paceMat, 0, 0.023, 0);
noHit(paceRing); pump.add(paceRing);
const pumpTag = label('SQUEEZE', { w: 0.13, h: 0.034, bg: '#2b3138', fg: '#e8e6e0', font: 'bold 34px system-ui, sans-serif' });
pumpTag.position.set(0, 0.012, 0.09); pumpTag.rotation.x = -1.1; noHit(pumpTag); pump.add(pumpTag);

const STAGES = [
  { name: 'Resting', target: [60, 80], fact: 'At rest the heart beats about 60 to 80 times a minute.' },
  { name: 'Walking', target: [90, 110], fact: 'Walking muscles respire faster and need more oxygen, so the heart speeds up.' },
  { name: 'Running', target: [120, 150], fact: 'Running muscles need lots of oxygen and glucose: the heart can pass 150 beats a minute.' },
];
const STAGE_S = 15, SCORE_S = 12;   // seconds per stage; the last 12 s of each stage count
// squeeze rhythm is measured in real seconds (a test can swap in its own clock)
const realNow = () => (window.__testClock ? window.__testClock() : performance.now() / 1000);
const L4 = { on: false, stage: 0, t: 0, inBand: 0, bpm: 0, taps: [], target: null, pts: [], busy: false };
function l4Bpm(now) {
  const tp = L4.taps; if (tp.length < 2) return 0;
  const iv = []; for (let i = Math.max(1, tp.length - 4); i < tp.length; i++) iv.push(tp[i] - tp[i - 1]);
  const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
  let bpm = 60 / mean;
  const since = now - tp[tp.length - 1];
  if (since > mean * 1.3) bpm = Math.min(bpm, 60 / since);   // slows down if you stop squeezing
  return bpm < 25 ? 0 : Math.min(bpm, 220);
}
function squeeze() {
  if (!L4.on) return;
  L4.taps.push(realNow()); if (L4.taps.length > 8) L4.taps.shift();
  beat.manual = true; startBeat(); beatBoost = 0.4;
  tween(0.08, (k) => bulb.scale.set(1 - 0.18 * k, 1 - 0.08 * k, 1 - 0.18 * k)).then(() => tween(0.16, (k) => bulb.scale.set(0.82 + 0.18 * k, 0.92 + 0.08 * k, 0.82 + 0.18 * k)));
  bulbMat.emissive.set(0x3a0a06); setTimeout(() => bulbMat.emissive.set(0x000000), 90);
}
kit.interactive(bulb, { name: 'Squeeze the pump', onSelect: squeeze, enabled: () => L4.on });
function l4Draw(extra = '') {
  const w = howTo(kit.kind);
  board.draw({
    heading: 'Level 4: Exercise! You are the pacemaker', level: L4.on ? `${STAGES[L4.stage].name}` : 'Finished',
    body: ['When you exercise, your muscles respire faster. They need more **oxygen** and **glucose**, so the heart must pump blood faster.',
      `Each squeeze of the red bulb (${w.choose}) makes the heart beat once. Keep the heart rate on the monitor **inside the target band**. Follow the flashing ring if you like.`,
      extra],
    items: STAGES.map((st, i) => ({ text: `${st.name}: ${st.target[0]}–${st.target[1]} beats/min${L4.pts[i] != null ? `  ·  ${L4.pts[i]} pts` : ''}`, state: i < L4.stage || (!L4.on && L4.pts[i] != null) ? 'done' : i === L4.stage ? 'now' : 'todo' })),
    footer: `${STAGE_S} seconds for each stage. Up to 20 points for each stage, for time spent in the band.`,
  });
}
let paceT = 0;
kit.tick((dt) => {
  if (!L4.on) { paceMat.color.set(0x3a2a20); return; }
  const now = realNow(), st = STAGES[L4.stage];
  L4.bpm = l4Bpm(now);
  if (beat.manual && L4.taps.length && now - L4.taps[L4.taps.length - 1] > 2.5) beat.phase = 1;   // flat line when you stop
  // the guide light flashes at the middle of the band
  paceT += dt * (st.target[0] + st.target[1]) / 2 / 60;
  if (paceT >= 1) paceT -= 1;
  paceMat.color.setRGB(0.23 + 0.75 * Math.max(0, 1 - paceT * 5), 0.16 + 0.5 * Math.max(0, 1 - paceT * 5), 0.12);
  if (L4.busy) return;
  L4.t += dt;
  const ok = L4.bpm >= st.target[0] && L4.bpm <= st.target[1];
  if (L4.t > STAGE_S - SCORE_S && ok) L4.inBand += dt;
  if (L4.t >= STAGE_S) l4EndStage();
});
async function l4EndStage() {
  L4.busy = true;
  const i = L4.stage, st = STAGES[i];
  const frac = Math.min(1, L4.inBand / SCORE_S), pts = Math.round(20 * frac);
  L4.pts[i] = pts;
  if (pts) score.add(pts, heart.localToWorld(new THREE.Vector3(0, 0.3, 0.1)));
  say(`${st.name}: in the band ${Math.round(frac * 100)}% of the time. ${st.fact}`, pts >= 14 ? 'good' : pts >= 6 ? undefined : 'bad', 5);
  if (i + 1 >= STAGES.length) {
    L4.on = false; L4.target = null; beat.manual = false; mode.kind = 'done';
    flow.complete(['Exercise makes muscles respire faster, so they need more oxygen and glucose and make more carbon dioxide.',
      'The heart beats faster (and breathing speeds up) to carry blood to and from the muscles more quickly.']);
    return;
  }
  L4.stage = i + 1; L4.t = 0; L4.inBand = 0; L4.target = STAGES[L4.stage].target;
  l4Draw(`**Now ${STAGES[L4.stage].name.toLowerCase()}!** Speed up to ${STAGES[L4.stage].target[0]}–${STAGES[L4.stage].target[1]}.`);
  L4.busy = false;
}
function l4Start() {
  mode.kind = 'pump';
  hideLabels(); cell.visible = false; resetSpin();
  Object.assign(L4, { on: true, stage: 0, t: 0, inBand: 0, bpm: 0, taps: [], target: STAGES[0].target, pts: [], busy: false });
  beat.manual = true; beat.phase = 1;
  l4Draw('Start squeezing now: about one squeeze a second.');
}
function l4Stop() { L4.on = false; L4.target = null; beat.manual = false; }

// ================================================================= levels
const flow = kit.levelFlow({
  key: 'form2-heart',
  board,
  intro: {
    heading: 'Heartbeat: the heart and circulation',
    body: ['Your heart beats about 72 times a minute, pushing blood through two circuits: to the lungs and to the body.',
      'Label the parts of the heart, guide a blood cell round the double circulation, test yourself, then keep the heart pumping while the body exercises.',
      'Turn the heart round on its turntable (drag the ring) to see it from every side.',
      'Choose a level on the panel to your left to begin.'],
    footer: 'Form 2 Integrated Science: transport systems in animals.',
  },
  levels: [
    { title: 'Label the heart', short: 'Label it', max: 80, start: l1Start },
    { title: 'Pump the blood round the body', short: 'Pump it', max: 190, start: l2Start },
    { title: 'Heart quiz', short: 'Quiz', max: 60, start: l3Start },
    { title: 'Exercise: keep the heart pumping', short: 'Exercise', max: 60, start: l4Start, stop: l4Stop },
  ],
});
// before a level starts the labels wait on the table and the pins are hidden
pins.forEach((p) => { p.visible = false; });
flow.showIntro();
kit.onKind(() => { if (mode.kind === 'label') l1Draw(); else if (mode.kind === 'route') l2Draw(); else if (mode.kind === 'quiz') l3Draw(); else if (mode.kind === 'pump') l4Draw(); });
kit.start();

window.game = { kit, flow, parts, cards, pins, mode, L1, L2, L3, L4, STAGES, ROUTE, QUIZ, board, heart, cell, bulb, beat, spinRing, setSpin, squeeze, monitor, speed: 1 };
