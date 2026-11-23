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

const BLUE = 0x3f63c9, RED = 0xd23b3b, MUSCLE = 0xa8434f, CUT = 0xe9a0a0;
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
  const muscle = mesh(half, mat(MUSCLE, { side: THREE.DoubleSide, roughness: 0.7 }));
  muscle.scale.set(...outer);
  const cav = mesh(half, mat(blood, { side: THREE.DoubleSide, roughness: 0.5 }));
  cav.scale.set(outer[0] - wall, outer[1] - wall, outer[2] - wall); cav.position.z = 0.001;
  // cut face: an elliptical ring
  const shape = new THREE.Shape(); shape.absellipse(0, 0, outer[0], outer[1], 0, Math.PI * 2);
  const hole = new THREE.Path(); hole.absellipse(0, 0, outer[0] - wall, outer[1] - wall, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const ring = mesh(new THREE.ShapeGeometry(shape, 40), mat(CUT, { side: THREE.DoubleSide, roughness: 0.8 }), 0, 0, 0.002);
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
  const m = mat(color, { roughness: 0.45 });
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

// heart beat: the four chambers squeeze gently
const CHAMBERS = ['RA', 'LA', 'RV', 'LV'];
let beatBoost = 0;
kit.tick((dt, t) => {
  const rate = 1.2;   // beats per second (72 per minute)
  const ph = (t * rate) % 1;
  const atria = ph < 0.15 ? Math.sin(ph / 0.15 * Math.PI) : 0;
  const vent = ph > 0.18 && ph < 0.45 ? Math.sin((ph - 0.18) / 0.27 * Math.PI) : 0;
  beatBoost = Math.max(0, beatBoost - dt * 1.5);
  const amp = 0.035 + beatBoost * 0.08;
  for (const k of CHAMBERS) {
    const s = 1 - amp * (k[1] === 'A' ? atria : vent);
    parts[k].group.scale.set(s, s, s);
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
  mode.kind = 'label';
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
  mode.kind = 'route';
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
  mode.kind = 'quiz';
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

// ================================================================= levels
const flow = kit.levelFlow({
  key: 'form2-heart',
  board,
  intro: {
    heading: 'Heartbeat: the heart and circulation',
    body: ['Your heart beats about 72 times a minute, pushing blood through two circuits: to the lungs and to the body.',
      'Label the parts of the heart, guide a blood cell round the double circulation, then test yourself.',
      'Choose a level on the panel to your left to begin.'],
    footer: 'Form 2 Integrated Science: transport systems in animals.',
  },
  levels: [
    { title: 'Label the heart', short: 'Label it', max: 80, start: l1Start },
    { title: 'Pump the blood round the body', short: 'Pump it', max: 190, start: l2Start },
    { title: 'Heart quiz', short: 'Quiz', max: 60, start: l3Start },
  ],
});
// before a level starts the labels wait on the table and the pins are hidden
pins.forEach((p) => { p.visible = false; });
flow.showIntro();
kit.onKind(() => { if (mode.kind === 'label') l1Draw(); else if (mode.kind === 'route') l2Draw(); else if (mode.kind === 'quiz') l3Draw(); });
kit.start();

window.game = { kit, flow, parts, cards, pins, mode, L1, L2, L3, ROUTE, QUIZ, board, heart, cell, speed: 1 };
