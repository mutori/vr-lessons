// Particle Lab: States of Matter (Form 1 Integrated Science, Matter: kinetic theory, changes of
// state, elements, compounds and mixtures). Built on shared/game-kit.js.
import { createGame, THREE, howTo } from '../shared/game-kit.js';

const kit = createGame({ title: 'Particle Lab' });
const { scene, mesh, lam, mat, basic, label, button, tween, wait, sfx, say, score, noHit } = kit;
kit.buildRoom({ sign: 'PARTICLE LAB  ·  FORM 1', accent: 0x6c5b7b, signBg: '#4a3c63' });
const TABLE_Y = 0.8;
kit.table({ w: 1.4, d: 0.65, z: -0.6 });
const board = kit.board({ w: 1.6, h: 0.9 });
board.group.position.set(0, 1.7, -1.5);
scene.add(board.group);
kit.setToastAnchor(new THREE.Vector3(0, 1.19, -1.42), new THREE.Vector3(0, 1.215, -1.42));

// ================================================================= the particle chamber
const CH = { x: 0.03, z: -0.7, w: 0.34, h: 0.42, d: 0.2 };
const chamber = new THREE.Group();
chamber.position.set(CH.x, TABLE_Y + 0.035, CH.z);
scene.add(chamber);
{
  // glass box with polished steel corner posts (reflections come from the room environment)
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6f7, transparent: true, opacity: 0.13, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  const box = mesh(new THREE.BoxGeometry(CH.w, CH.h, CH.d), glass, 0, CH.h / 2, 0);
  box.renderOrder = 3;
  const steel = mat(0xb9c2c9, { metalness: 0.85, roughness: 0.28 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chamber.add(mesh(new THREE.BoxGeometry(0.012, CH.h, 0.012), steel, sx * CH.w / 2, CH.h / 2, sz * CH.d / 2));
  for (const sz of [-1, 1]) chamber.add(mesh(new THREE.BoxGeometry(CH.w + 0.012, 0.012, 0.012), steel, 0, CH.h, sz * CH.d / 2));
  for (const sx of [-1, 1]) chamber.add(mesh(new THREE.BoxGeometry(0.012, 0.012, CH.d), steel, sx * CH.w / 2, CH.h, 0));
  const lid = mesh(new THREE.BoxGeometry(CH.w + 0.03, 0.014, CH.d + 0.03), mat(0x3b4752, { metalness: 0.4, roughness: 0.4 }), 0, CH.h + 0.013, 0);
  chamber.add(box, lid);
}
// the hotplate unit under the chamber: enamelled body, ceramic top with coils, a slider on its front
const hotplate = mesh(new THREE.BoxGeometry(CH.w + 0.1, 0.05, CH.d + 0.16), mat(0xd9d6cf, { roughness: 0.45 }), 0, -0.04, 0.03);
chamber.add(hotplate);
const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, emissive: 0x000000, roughness: 0.35, metalness: 0.2 });
const plate = mesh(new THREE.BoxGeometry(CH.w + 0.03, 0.012, CH.d + 0.03), plateMat, 0, -0.009, 0);
chamber.add(plate);
const coilMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
for (let i = 0; i < 4; i++) {
  const coil = mesh(new THREE.TorusGeometry(0.03 + i * 0.03, 0.004, 6, 40), coilMat, 0, -0.002, 0);
  coil.rotation.x = Math.PI / 2; coil.scale.set(1, 0.6, 1); chamber.add(coil);
}
// a name plate and a state read-out on the hotplate's front edge
const plaque = new THREE.Group(); plaque.position.set(0, -0.032, CH.d / 2 + 0.135); plaque.rotation.x = -0.45; chamber.add(plaque);
plaque.add(mesh(new THREE.BoxGeometry(0.36, 0.048, 0.006), mat(0x2b3138, { roughness: 0.5 }), 0, 0, -0.004));
const chamberLabel = label('Water', { w: 0.15, h: 0.036, bg: '#dfe4e6', fg: '#13293d', font: 'bold 34px system-ui, sans-serif' });
chamberLabel.position.set(-0.085, 0, 0); plaque.add(chamberLabel);
const stateLabel = label('SOLID', { w: 0.17, h: 0.036, bg: '#1d4e6e', fg: '#ffffff', font: 'bold 34px system-ui, sans-serif' });
stateLabel.position.set(0.085, 0, 0); plaque.add(stateLabel);
noHit(chamber);

// particles
const N = 64, R = 0.019, SP = 0.043;
const pGeo = new THREE.SphereGeometry(R, 16, 12);
// white base colour: each particle's own instance colour shows its substance and how fast it moves
const pMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.05 });
const parts = new THREE.InstancedMesh(pGeo, pMat, N);
for (let i = 0; i < N; i++) parts.setColorAt(i, new THREE.Color(0x3a8fd9));
parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
parts.userData.noHit = true; parts.raycast = () => {};
chamber.add(parts);
const P = [];
for (let i = 0; i < N; i++) {
  const ix = i % 4, iz = Math.floor(i / 4) % 4, iy = Math.floor(i / 16);
  const site = new THREE.Vector3((ix - 1.5) * SP, R + 0.002 + iy * SP, (iz - 1.5) * SP * 0.95);
  P.push({ site, pos: site.clone(), vel: new THREE.Vector3(), state: 0, rank: 0, jit: Math.random() * 100 });
}
// melting order: top layer first; ties broken randomly so the surface melts unevenly
const order = P.map((p, i) => i).sort((a, b) => (P[b].site.y - P[a].site.y) || (Math.random() - 0.5));
order.forEach((pi, r) => { P[pi].rank = r; });

// ================================================================= substances and heat
// Heat content Q (arbitrary units) drives everything. Plateaus are where the state changes.
const SUBSTANCES = {
  water: {
    name: 'Water', color: 0x3a8fd9, gasColor: 0x8cc4f0,
    // [Qstart, Qend, Tstart, Tend, kind]
    segs: [[0, 20, -20, 0, 'solid'], [20, 60, 0, 0, 'melt'], [60, 160, 0, 100, 'liquid'], [160, 260, 100, 100, 'boil'], [260, 300, 100, 140, 'gas']],
    mp: 0, bp: 100,
  },
  iodine: {
    name: 'Iodine', color: 0x5b2c6f, gasColor: 0xb57edc,
    segs: [[0, 20, 20, 35, 'solid'], [20, 120, 35, 60, 'sublime'], [120, 140, 60, 70, 'gas']],
    sublimes: true,
  },
};
const sim = { sub: SUBSTANCES.water, Q: 0, heater: 0, rate: 12, hold: false, history: [], histT: 0 };
const QMAX = () => sim.sub.segs[sim.sub.segs.length - 1][1];
function tempOf(Q) {
  for (const [a, b, ta, tb] of sim.sub.segs) if (Q <= b) return ta + (tb - ta) * ((Q - a) / (b - a));
  const s = sim.sub.segs[sim.sub.segs.length - 1]; return s[3];
}
function segOf(Q) { for (const s of sim.sub.segs) if (Q <= s[1]) return s; return sim.sub.segs[sim.sub.segs.length - 1]; }
// counts of particles in each state for heat content Q
function counts(Q) {
  const seg = segOf(Q); const f = (Q - seg[0]) / (seg[1] - seg[0]);
  const k = seg[4];
  if (k === 'solid') return { s: N, l: 0, g: 0 };
  if (k === 'melt') { const l = Math.round(f * N); return { s: N - l, l, g: 0 }; }
  if (k === 'liquid') return { s: 0, l: N, g: 0 };
  if (k === 'boil') { const g = Math.round(f * N); return { s: 0, l: N - g, g }; }
  if (k === 'sublime') { const g = Math.round(f * N); return { s: N - g, l: 0, g }; }
  return { s: 0, l: 0, g: N };
}
function stateName(c) {
  if (c.s === N) return 'SOLID';
  if (c.l === N) return 'LIQUID';
  if (c.g === N) return 'GAS';
  if (c.s && c.l) return 'SOLID + LIQUID';
  if (c.l && c.g) return 'LIQUID + GAS';
  return 'SOLID + GAS';
}
function setSubstance(key, Q) {
  sim.sub = SUBSTANCES[key]; sim.Q = Q; sim.heater = 0; sim.history = []; sim.histT = 0;
  chamberLabel.userData.draw(sim.sub.name);
  const c = counts(Q);
  // place particles straight into their states
  for (const p of P) {
    const st = p.rank < c.g ? 2 : p.rank < c.g + c.l ? 1 : 0;
    p.state = st; p.vel.set(0, 0, 0);
    if (st === 0) p.pos.copy(p.site);
    else if (st === 1) p.pos.set((Math.random() - 0.5) * (CH.w - 0.05), R + Math.random() * 0.08, (Math.random() - 0.5) * (CH.d - 0.05));
    else p.pos.set((Math.random() - 0.5) * (CH.w - 0.05), R + Math.random() * (CH.h - 2 * R), (Math.random() - 0.5) * (CH.d - 0.05));
  }
  paintHeater(); drawGraph(true);
}

// particle motion: solid vibrates about its site, liquid slides in a heap, gas flies about
const _m = new THREE.Matrix4(), _d = new THREE.Vector3();
const HALF = new THREE.Vector3(CH.w / 2 - R, CH.h - R, CH.d / 2 - R);
function stepParticles(dt) {
  const T = tempOf(sim.Q);
  const c = counts(sim.Q);
  for (const p of P) p.state = p.rank < c.g ? 2 : p.rank < c.g + c.l ? 1 : 0;
  const heat = THREE.MathUtils.clamp((T + 30) / 170, 0.05, 1);
  findPushers();
  let touched = false;
  const sub = Math.min(3, Math.ceil(dt / 0.012));
  const h = dt / sub;
  for (let it = 0; it < sub; it++) {
    for (const p of P) {
      if (p.state === 0) {
        // spring to the lattice site plus a vibration that grows with temperature
        _d.copy(p.site).sub(p.pos);
        p.vel.addScaledVector(_d, 160 * h).multiplyScalar(Math.exp(-14 * h));
        p.pos.addScaledVector(p.vel, h);
      } else if (p.state === 1) {
        p.vel.x += (Math.random() - 0.5) * 10 * heat * h;
        p.vel.z += (Math.random() - 0.5) * 10 * heat * h;
        p.vel.y += (Math.random() - 0.5) * 5 * heat * h - 2.5 * h;
        p.vel.multiplyScalar(Math.exp(-3 * h));
        p.pos.addScaledVector(p.vel, h);
      } else {
        const speed = 0.35 + 0.35 * heat;
        if (p.vel.lengthSq() < 0.0001) p.vel.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5);
        p.vel.setLength(THREE.MathUtils.lerp(p.vel.length(), speed, 0.08));
        p.pos.addScaledVector(p.vel, h);
      }
      // hands (or the mouse) push particles away: a solid springs back, a liquid or gas scatters
      for (const q of pushers) {
        _d.subVectors(p.pos, q); const dd = _d.length();
        if (dd < PUSH_R && dd > 1e-5) {
          const f = (PUSH_R - dd) / PUSH_R;
          p.vel.addScaledVector(_d.multiplyScalar(1 / dd), f * (p.state === 0 ? 2.5 : 6) * h * 60 * 0.02);
          p.pos.addScaledVector(_d, f * 0.004);
          touched = true;
        }
      }
      // walls
      for (const ax of ['x', 'z']) {
        if (p.pos[ax] > HALF[ax]) { p.pos[ax] = HALF[ax]; p.vel[ax] = -Math.abs(p.vel[ax]); }
        if (p.pos[ax] < -HALF[ax]) { p.pos[ax] = -HALF[ax]; p.vel[ax] = Math.abs(p.vel[ax]); }
      }
      if (p.pos.y < R) { p.pos.y = R; p.vel.y = Math.abs(p.vel.y) * (p.state === 2 ? 1 : 0.2); }
      if (p.pos.y > HALF.y) { p.pos.y = HALF.y; p.vel.y = -Math.abs(p.vel.y); }
    }
    // keep liquid and solid particles from overlapping (gas particles are far apart anyway)
    for (let i = 0; i < N; i++) {
      const a = P[i]; if (a.state === 2) continue;
      for (let j = i + 1; j < N; j++) {
        const b = P[j]; if (b.state === 2) continue;
        if (a.state === 0 && b.state === 0) continue;
        _d.subVectors(a.pos, b.pos);
        const dd = _d.lengthSq(), min = 2 * R * 1.02;
        if (dd < min * min && dd > 1e-10) {
          const dist = Math.sqrt(dd), push = (min - dist) * 0.5;
          _d.multiplyScalar(1 / dist);
          if (a.state !== 0) a.pos.addScaledVector(_d, push * (b.state === 0 ? 2 : 1));
          if (b.state !== 0) b.pos.addScaledVector(_d, -push * (a.state === 0 ? 2 : 1));
        }
      }
    }
  }
  // vibration shown on top of the solid position
  const amp = 0.0015 + 0.004 * heat;
  const t = kit.time;
  const gasAll = c.g === N;
  const base = _c1.set(gasAll ? sim.sub.gasColor : sim.sub.color);
  for (let i = 0; i < N; i++) {
    const p = P[i];
    _d.copy(p.pos);
    if (p.state === 0) _d.add(_v.set(Math.sin(t * 31 + p.jit) * amp, Math.sin(t * 37 + p.jit * 2) * amp, Math.sin(t * 29 + p.jit * 3) * amp));
    p.show.copy(_d);
    _m.makeTranslation(_d.x, _d.y, _d.z);
    parts.setMatrixAt(i, _m);
    // every particle of one substance keeps the same colour (different colours would mean different
    // substances); the whole lot only warms slightly as the temperature rises
    parts.setColorAt(i, _c2.copy(base).lerp(HOT, heat * 0.22));
  }
  parts.instanceMatrix.needsUpdate = true;
  parts.instanceColor.needsUpdate = true;
  drawBondsAndTrails(base);
  if (touched && kit.time - lastTouchBuzz > 0.12) { lastTouchBuzz = kit.time; kit.pulse(0.15, 15); }
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();
const HOT = new THREE.Color(0xffe2b8);
let lastTouchBuzz = 0;
P.forEach((p) => { p.show = p.pos.clone(); });

// forces of attraction drawn as thin links between close particles; gas particles leave short glowing trails.
// Thin instanced cylinders rather than GL lines (lines are 1 pixel wide and shimmer in a headset).
const MAXL = 240, MAXT = N;
const linkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfe3f2, transparent: true, opacity: 0.5, depthWrite: false }), MAXL);
const trailMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0, 1, 1, 8, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), MAXT);
for (const m of [linkMesh, trailMesh]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.userData.noHit = true; m.raycast = () => {}; m.count = 0; chamber.add(m); }
for (let i = 0; i < MAXT; i++) trailMesh.setColorAt(i, new THREE.Color(0));
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _dir = new THREE.Vector3(), _sc = new THREE.Vector3(), _mid = new THREE.Vector3();
function segMatrix(a, b, r, centred) {
  _dir.subVectors(b, a); const len = _dir.length() || 1e-6;
  _q.setFromUnitVectors(_up, _dir.multiplyScalar(1 / len));
  _sc.set(r, len, r);
  if (centred) _mid.addVectors(a, b).multiplyScalar(0.5); else _mid.copy(a);
  return _m.compose(_mid, _q, _sc);
}
function drawBondsAndTrails(base) {
  let nl = 0, nt = 0;
  const solidL = SP * 1.12, liqL = 2 * R * 1.35;
  for (let i = 0; i < N; i++) {
    const a = P[i];
    if (a.state === 2) {
      // a cone from behind the particle to its centre: longer and brighter when it moves faster
      const sp = a.vel.length();
      _v.copy(a.show).addScaledVector(a.vel, -0.07);
      trailMesh.setMatrixAt(nt, segMatrix(_v, a.show, R * 0.55, false));
      trailMesh.setColorAt(nt, _c2.copy(base).multiplyScalar(THREE.MathUtils.clamp(sp * 0.35, 0.06, 0.22)));
      nt++;
      continue;
    }
    for (let j = i + 1; j < N && nl < MAXL; j++) {
      const b = P[j]; if (b.state === 2) continue;
      const d = a.show.distanceTo(b.show);
      const both = a.state === 0 && b.state === 0;
      if (d < (both ? solidL : liqL)) { linkMesh.setMatrixAt(nl++, segMatrix(a.show, b.show, both ? 0.0028 : 0.0018, true)); }
    }
  }
  linkMesh.count = nl; trailMesh.count = nt;
  linkMesh.instanceMatrix.needsUpdate = true; trailMesh.instanceMatrix.needsUpdate = true;
  if (trailMesh.instanceColor) trailMesh.instanceColor.needsUpdate = true;
}

// what pushes particles: fingertips / controller tips inside the chamber, or the mouse pointer on it
const PUSH_R = 0.045;
const pushers = [];
const pushPool = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const pushGlow = [0, 1, 2].map(() => {
  const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.glowTexture('170,220,255'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
  g.scale.setScalar(PUSH_R * 2.2); g.visible = false; g.userData.noHit = true; chamber.add(g); return g;
});
const _ray = new THREE.Raycaster(), _pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), _hit = new THREE.Vector3();
const mouseOn = { active: false, x: 0, y: 0 };
kit.renderer.domElement.addEventListener('pointermove', (e) => { mouseOn.x = (e.clientX / innerWidth) * 2 - 1; mouseOn.y = -(e.clientY / innerHeight) * 2 + 1; mouseOn.active = true; });
kit.renderer.domElement.addEventListener('pointerleave', () => { mouseOn.active = false; });
function inside(v) { return Math.abs(v.x) < CH.w / 2 + 0.02 && v.y > -0.01 && v.y < CH.h + 0.02 && Math.abs(v.z) < CH.d / 2 + 0.03; }
function findPushers() {
  pushers.length = 0;
  if (!chamber.visible) return;
  if (kit.renderer.xr.isPresenting) {
    for (const p of kit.input.pointers) {
      if (!p.tipOk || pushers.length >= 2) continue;
      const v = chamber.worldToLocal(pushPool[pushers.length].copy(p.tip));
      if (inside(v)) pushers.push(v);
    }
  } else if (mouseOn.active && !kit.carry.item && !kit.dragging) {
    // the mouse pushes on the middle plane of the chamber
    _ray.setFromCamera({ x: mouseOn.x, y: mouseOn.y }, kit.camera);
    chamber.updateMatrixWorld();
    const r = _ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(chamber.matrixWorld).invert());
    if (r.intersectPlane(_pl, _hit) && inside(_hit)) pushers.push(pushPool[2].copy(_hit));
  }
  pushGlow.forEach((g, i) => { g.visible = i < pushers.length; if (g.visible) g.position.copy(pushers[i]); });
}

// ================================================================= thermometer and graph
const thermo = new THREE.Group();
thermo.position.set(CH.x + CH.w / 2 + 0.1, TABLE_Y, CH.z + 0.02);
scene.add(thermo);
const T_MIN = -20, T_MAX = 140, TH_H = 0.36;
{
  thermo.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.02, 20), lam(0x445566), 0, 0.01, 0));
  thermo.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, TH_H + 0.04, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.35, depthWrite: false }), 0, 0.04 + TH_H / 2, 0));
  thermo.add(mesh(new THREE.SphereGeometry(0.017, 16, 12), basic(0xd62c1a), 0, 0.035, 0));
  const scaleP = kit.canvasPlane(0.07, TH_H + 0.04, 1200);
  const { ctx, c } = scaleP;
  ctx.fillStyle = '#e6e8e6'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#13293d'; ctx.font = 'bold 26px system-ui'; ctx.textBaseline = 'middle';
  for (let T = T_MIN; T <= T_MAX; T += 10) {
    const y = c.height - (0.02 + (T - T_MIN) / (T_MAX - T_MIN) * TH_H) * 1200;
    const major = T % 20 === 0;
    ctx.fillRect(0, y - 1.5, major ? 26 : 14, 3);
    if (major) ctx.fillText(String(T), 32, y);
  }
  scaleP.update();
  scaleP.mesh.position.set(0.05, 0.04 + TH_H / 2, 0);
  thermo.add(scaleP.mesh);
}
const colMat = basic(0xd62c1a);
const column = mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 1, 10).translate(0, 0.5, 0), colMat, 0, 0.045, 0);
thermo.add(column);
const tRead = label('-20 °C', { w: 0.16, h: 0.05, bg: '#13293d', fg: '#ffffff', font: 'bold 36px system-ui, sans-serif' });
tRead.position.set(0.02, 0.06 + TH_H + 0.05, 0); thermo.add(tRead);
noHit(thermo);
let lastTRead = '';
function paintThermo() {
  const T = tempOf(sim.Q);
  column.scale.y = Math.max(0.001, 0.02 + (T - T_MIN) / (T_MAX - T_MIN) * TH_H - 0.01);
  const txt = `${Math.round(T)} °C`;
  if (txt !== lastTRead) { lastTRead = txt; tRead.userData.draw(txt, '#13293d'); }
}

// temperature–time graph on an easel to the right
const graph = kit.canvasPlane(0.46, 0.34, 1300);
const easel = new THREE.Group();
easel.position.set(0.6, TABLE_Y + 0.25, -0.62); easel.rotation.set(-0.12, -0.55, 0, 'YXZ');
easel.add(mesh(new THREE.BoxGeometry(0.49, 0.37, 0.018), mat(0x2a3138, { roughness: 0.45, metalness: 0.2 }), 0, 0, -0.011), graph.mesh);
easel.add(mesh(new THREE.BoxGeometry(0.02, 0.25, 0.02), lam(0x2a3a48), 0, -0.29, -0.03));
noHit(easel);
scene.add(easel);
function drawGraph(clear = false) {
  if (clear) sim.history = [];
  const { ctx, c } = graph; const W = c.width, H = c.height;
  ctx.fillStyle = '#1f2b35'; ctx.fillRect(0, 0, W, H);
  const L = 90, Rm = 20, Tp = 60, B = 60;
  const gx = (t) => L + (t / 40) * (W - L - Rm);
  const gy = (T) => H - B - ((T - T_MIN) / (T_MAX - T_MIN)) * (H - B - Tp);
  ctx.fillStyle = '#e8ecee'; ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Temperature (°C) against time', 14, 12);
  // the states as coloured bands behind the graph
  if (!sim.sub.sublimes) {
    for (const [a, b, col, name] of [[T_MIN, sim.sub.mp, 'rgba(90,160,220,0.16)', 'solid'], [sim.sub.mp, sim.sub.bp, 'rgba(70,190,160,0.13)', 'liquid'], [sim.sub.bp, T_MAX, 'rgba(230,140,80,0.14)', 'gas']]) {
      ctx.fillStyle = col; ctx.fillRect(L, gy(b), W - Rm - L, gy(a) - gy(b));
      ctx.fillStyle = 'rgba(232,236,238,0.55)'; ctx.font = '20px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(name, W - Rm - 8, (gy(a) + gy(b)) / 2);
    }
  }
  ctx.strokeStyle = 'rgba(232,236,238,0.12)'; ctx.lineWidth = 2; ctx.font = '22px system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  for (let T = T_MIN; T <= T_MAX; T += 20) { ctx.beginPath(); ctx.moveTo(L, gy(T)); ctx.lineTo(W - Rm, gy(T)); ctx.stroke(); ctx.fillStyle = '#a9b8c3'; ctx.fillText(String(T), L - 10, gy(T)); }
  if (!sim.sub.sublimes) {
    ctx.setLineDash([10, 8]); ctx.strokeStyle = '#e0a83a';
    for (const [T, n] of [[sim.sub.mp, 'melting point'], [sim.sub.bp, 'boiling point']]) {
      ctx.beginPath(); ctx.moveTo(L, gy(T)); ctx.lineTo(W - Rm, gy(T)); ctx.stroke();
      ctx.fillStyle = '#e0a83a'; ctx.textAlign = 'left'; ctx.font = '22px system-ui'; ctx.fillText(`${n} ${T} °C`, L + 8, gy(T) - 16);
    }
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = '#c9d3da'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(L, Tp); ctx.lineTo(L, H - B); ctx.lineTo(W - Rm, H - B); ctx.stroke();
  ctx.fillStyle = '#a9b8c3'; ctx.textAlign = 'center'; ctx.fillText('time (last 40 s)', (L + W) / 2, H - 25);
  const hst = sim.history;
  if (hst.length > 1) {
    const t0 = Math.max(0, hst[hst.length - 1][0] - 40);
    ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
    let first = true, lx = 0, ly = 0;
    for (const [t, T] of hst) { if (t < t0) continue; const x = gx(t - t0), y = gy(T); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); lx = x; ly = y; }
    ctx.stroke();
    // the live point glows
    const gl = ctx.createRadialGradient(lx, ly, 0, lx, ly, 26); gl.addColorStop(0, 'rgba(255,180,140,0.9)'); gl.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(lx, ly, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff1e8'; ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
  }
  graph.update();
}

// ================================================================= heater
function paintHeater() {
  const h = sim.heater, a = Math.abs(h);
  plateMat.emissive.set(h > 0 ? 0xd2451e : h < 0 ? 0x2e86c1 : 0x000000);
  plateMat.emissiveIntensity = a * 0.9;
  coilMat.color.set(0x333333).lerp(new THREE.Color(h > 0 ? 0xff7a3d : 0x9fd8ff), a);
  if (knob) {
    knob.position.x = h * SL_HALF;
    knobMat.color.set(h > 0.05 ? 0xe0592a : h < -0.05 ? 0x3c8dc9 : 0x8d99a3);
    slReadout.userData.draw(h > 0.05 ? `HEAT ${Math.round(h * 100)}%` : h < -0.05 ? `COOL ${Math.round(-h * 100)}%` : 'OFF', h > 0.05 ? '#a8432a' : h < -0.05 ? '#2b6a99' : '#4a5864');
  }
  if (heatBtns.length) {
    heatBtns[0].userData.draw('COOL', h < 0 ? '#1b6fa8' : '#5d7e9a');
    heatBtns[1].userData.draw('OFF', h === 0 ? '#34495e' : '#7b8a97');
    heatBtns[2].userData.draw('HEAT', h > 0 ? '#c0392b' : '#c97a6d');
  }
}
let edgeWarned = false;
function stepHeat(dt) {
  if (!sim.heater) return;
  const before = sim.Q;
  sim.Q = THREE.MathUtils.clamp(sim.Q + sim.heater * sim.rate * dt, 0, QMAX());
  if (sim.Q === before && !edgeWarned && mode.kind === 'heat') {
    edgeWarned = true;
    say(sim.heater > 0 ? 'The heater is at its highest temperature. Try COOL.' : 'The cooler cannot go any colder. Try HEAT.', 'info');
  }
}

// ================================================================= the heater slider on the hotplate's front
// Pinch the knob and slide it (or drag it with the mouse): left cools, the middle is off, right heats.
const SL_HALF = 0.26;
const slider = new THREE.Group();
const slTrackTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 48; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 512, 0); g.addColorStop(0, '#3c8dc9'); g.addColorStop(0.45, '#56636d'); g.addColorStop(0.55, '#56636d'); g.addColorStop(1, '#e0592a');
  x.fillStyle = g; kit.roundRect(x, 4, 8, 504, 32, 16); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.75)'; for (const t of [0, 0.25, 0.5, 0.75, 1]) x.fillRect(8 + t * 494, 4, 3, 40);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
})();
slider.add(mesh(new THREE.PlaneGeometry(SL_HALF * 2 + 0.02, 0.024), new THREE.MeshBasicMaterial({ map: slTrackTex }), 0, 0, 0.0005));
const knobMat = mat(0x8d99a3, { roughness: 0.35, metalness: 0.2 });
const knob = new THREE.Group();
knob.add(mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.036, 24).rotateX(Math.PI / 2), knobMat, 0, 0, 0.019));
knob.add(mesh(new THREE.BoxGeometry(0.005, 0.03, 0.002), basic(0xf3f2ee), 0, 0, 0.038));
slider.add(knob);
const slReadout = label('OFF', { w: 0.12, h: 0.032, bg: '#4a5864', fg: '#f3f2ee', font: 'bold 30px system-ui, sans-serif' });
slReadout.position.set(SL_HALF + 0.1, 0, 0.002); slider.add(slReadout);
noHit(slider);
knob.traverse((o) => { o.userData.noHit = false; });
kit.draggable(knob, {
  name: 'Heater: slide left to cool, right to heat',
  enabled: () => mode.kind === 'heat' && chamber.visible,
  // the drag point is found on the slider's own plane, then only its sideways position is used
  plane: () => { slider.updateMatrixWorld(); const n = new THREE.Vector3(0, 0, 1).transformDirection(slider.matrixWorld); return new THREE.Plane().setFromNormalAndCoplanarPoint(n, slider.getWorldPosition(new THREE.Vector3())); },
  onMove: (pt) => {
    const lx = slider.worldToLocal(pt.clone()).x;
    let v = THREE.MathUtils.clamp(lx / SL_HALF, -1, 1);
    if (Math.abs(v) < 0.1) v = 0;                 // a gentle detent at OFF
    const before = sim.heater;
    setHeater(Math.round(v * 20) / 20, true);
    if (Math.sign(before) !== Math.sign(sim.heater) || Math.abs(before - sim.heater) > 0.24) sfx.tick();
  },
});
// heat shimmer (warm glows rising) and frost (cold glows sinking) around the hotplate
const shimmer = [];
for (let i = 0; i < 14; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.glowTexture('255,160,90'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  sp.userData.noHit = true; sp.userData.t = Math.random(); sp.userData.x = (Math.random() - 0.5) * CH.w; sp.userData.z = (Math.random() - 0.5) * CH.d;
  sp.scale.setScalar(0.05); chamber.add(sp); shimmer.push(sp);
}
function stepShimmer(dt) {
  const h = sim.heater, a = Math.abs(h);
  for (const sp of shimmer) {
    sp.userData.t += dt * (0.5 + a * 0.6);
    if (sp.userData.t > 1) { sp.userData.t -= 1; sp.userData.x = (Math.random() - 0.5) * CH.w; sp.userData.z = (Math.random() - 0.5) * CH.d; }
    const t = sp.userData.t;
    sp.material.color.set(h >= 0 ? 0xffa15a : 0x9fd8ff);
    sp.position.set(sp.userData.x, h >= 0 ? 0.01 + t * 0.09 : 0.06 - t * 0.07, sp.userData.z + CH.d / 2 + 0.02);
    sp.material.opacity = a * Math.sin(t * Math.PI) * 0.45;
    sp.visible = a > 0.02;
  }
}

// ================================================================= controls in front of the learner
const row = new THREE.Group();
row.position.set(0.05, TABLE_Y + 0.06, -0.36); row.rotation.x = -0.9;
scene.add(row);
row.add(noHit(mesh(new THREE.BoxGeometry(0.9, 0.17, 0.02), mat(0x2b3138, { roughness: 0.5 }), 0, 0, -0.02)));
slider.position.set(-0.05, 0.045, 0); row.add(slider);
const heatBtns = ['COOL', 'OFF', 'HEAT'].map((t, i) => {
  const b = button(t, 0.12, 0.05, { font: 'bold 30px system-ui, sans-serif' });
  b.position.set(-0.05 + (i - 1) * SL_HALF, -0.035, 0);
  row.add(b);
  kit.interactive(b, { name: ['Cool the chamber', 'Switch the heater off', 'Heat the chamber'][i], onSelect: () => setHeater(i - 1), enabled: () => b.visible });
  return b;
});
function setHeater(h, quiet = false) {
  if (mode.kind !== 'heat') return;
  if (h !== sim.heater) edgeWarned = false;
  sim.heater = h; paintHeater();
  if (h && !quiet) sfx.tone(h > 0 ? 300 : 900, 0.3, 'sine', 0.06, h > 0 ? 600 : 450);
}
// answer buttons (A B C or names of changes) share the same row
const ansBtns = [];
const ansPools = {};
function showAnswers(labels, onPick, width = 0.16, font = 'bold 30px system-ui, sans-serif') {
  ansBtns.forEach((b) => { b.visible = false; });
  heatBtns.forEach((b) => { b.visible = false; });
  slider.visible = false;
  const step = width + 0.016;
  const pool = (ansPools[width + font] ||= []);
  labels.forEach((t, i) => {
    let b = pool[i];
    if (!b) {
      b = button('', width, 0.075, { font });
      row.add(b); pool.push(b); ansBtns.push(b);
      kit.interactive(b, { name: '', onSelect: () => b.userData.onPick?.(b.userData.idx), enabled: () => b.visible });
    }
    b.userData.onPick = onPick; b.userData.idx = i;
    b.userData.draw(t, '#1f6fb2');
    b.userData.interactive.name = `Answer: ${t.replace('\n', ' ')}`;
    b.position.set((i - (labels.length - 1) / 2) * step, 0, 0);
    b.visible = true;
  });
  // scale stretches the canvas text: redraw with a matching font width is not needed for short labels
}
function showHeaterButtons() { ansBtns.forEach((b) => { b.visible = false; }); heatBtns.forEach((b) => { b.visible = true; }); slider.visible = true; paintHeater(); }
function hideRow() { ansBtns.forEach((b) => { b.visible = false; }); heatBtns.forEach((b) => { b.visible = false; }); slider.visible = false; }

// ================================================================= level 1: heat and cool
const mode = { kind: 'idle' };
const L1 = {
  missions: [
    { text: 'Melt the ice: turn it all into liquid water.', done: () => sim.Q >= 60 && sim.Q < 160 },
    { text: 'Boil the water until it is all gas (steam).', done: () => sim.Q >= 260 },
    { text: 'Cool the steam until it is all liquid water again.', done: () => sim.Q < 160 && sim.Q >= 60 },
    { text: 'Freeze the water back into solid ice.', done: () => sim.Q <= 20 },
  ],
  questions: {
    1: { q: 'While the water was boiling, the thermometer stayed at 100 °C even though the heater was on. Why?',
      opts: ['The heat energy was used to separate the particles (overcome the forces between them), not to raise the temperature.', 'The heater switched itself off while the water boiled.', 'The particles stopped moving while the water boiled.'], answer: 0,
      why: 'At the boiling point the energy goes into pulling particles apart, so the temperature stays the same until all the liquid has turned to gas.' },
    3: { q: 'When steam condenses and when water freezes, what happens to heat energy?',
      opts: ['Heat energy is taken in from the surroundings.', 'Heat energy is given out to the surroundings.', 'No heat energy changes at all.'], answer: 1,
      why: 'Particles come closer together and attract each other again, so energy is given out. That is why the cooler had to keep taking heat away.' },
  },
  i: 0, phase: 'mission', tries: 0,
};
function l1Start() {
  mode.kind = 'heat';
  showChamber(true); showSorting(false);
  setSubstance('water', 0);
  L1.i = 0; L1.phase = 'mission';
  showHeaterButtons();
  l1Draw();
  say(kit.kind === 'mouse' ? 'Click HEAT to start warming the ice.' : 'Press HEAT to start warming the ice.', 'info', 4);
}
function l1Draw(extra = null) {
  const c = counts(sim.Q);
  const items = L1.missions.map((m, i) => ({ text: m.text, state: i < L1.i ? 'done' : i === L1.i && L1.phase === 'mission' ? 'now' : 'todo' }));
  if (L1.phase === 'question') {
    const qq = L1.questions[L1.i - 1];
    board.draw({ heading: 'Level 1: Heat and cool', level: 'Question', body: [qq.q, ...qq.opts.map((o, k) => `**${'ABC'[k]}.** ${o}`)], footer: extra || 'Choose A, B or C on the buttons in front of you.' });
    return;
  }
  board.draw({
    heading: 'Level 1: Heat and cool', level: `Task ${Math.min(L1.i + 1, 4)} of 4`,
    body: [`Use the **HEAT**, **OFF** and **COOL** buttons. Watch how the particles move, and watch the thermometer and the graph.`,
      `Now: **${stateName(c).toLowerCase()}** at **${Math.round(tempOf(sim.Q))} °C**.`],
    items, footer: extra || 'Solid: particles vibrate in fixed places. Liquid: close together but sliding past each other. Gas: far apart and moving fast.',
  });
}
let l1Redraw = 0;
function l1Tick(dt) {
  if (mode.kind !== 'heat' || L1.phase !== 'mission') return;
  l1Redraw -= dt;
  if (l1Redraw <= 0) { l1Redraw = 0.25; l1Draw(); }
  const m = L1.missions[L1.i];
  if (m && m.done()) {
    sim.heater = 0; paintHeater();
    score.add(20, chamber.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
    kit.burst(chamber.position.clone().add(new THREE.Vector3(0, 0.45, 0)), 30);
    say(['All liquid! The particles broke out of their fixed places.', 'All gas! The particles are far apart and moving fast.', 'Condensed! The particles came close together again.', 'Frozen! The particles are back in fixed places, just vibrating.'][L1.i], 'good');
    L1.i++;
    if (L1.questions[L1.i - 1]) { L1.phase = 'question'; L1.tries = 0; askL1(); }
    else if (L1.i >= L1.missions.length) l1Finish();
    else l1Draw();
  }
}
function askL1() {
  const qq = L1.questions[L1.i - 1];
  l1Draw();
  const run = kit.newRun();
  showAnswers(['A', 'B', 'C'], async (k) => {
    if (!kit.isRun(run)) return;
    if (k === qq.answer) {
      score.add(L1.tries ? 10 : 30, row.position.clone().add(new THREE.Vector3(0, 0.15, 0)));
      say('Correct! ' + qq.why, 'good', 6);
      hideRow();
      L1.phase = 'mission';
      await wait(1.2);
      if (!kit.isRun(run)) return;
      if (L1.i >= L1.missions.length) { l1Finish(); return; }
      showHeaterButtons(); l1Draw();
    } else {
      L1.tries++;
      say('Not quite. Read the board again and try another answer.', 'bad');
      l1Draw(`Not ${'ABC'[k]}. Try again.`);
    }
  });
}
function l1Finish() {
  mode.kind = 'done'; sim.heater = 0; paintHeater(); hideRow();
  flow.complete(['Remember: during melting and boiling the temperature stays the same while the state changes.']);
}

// ================================================================= level 2: name the change
const CHANGES = {
  melting: { label: 'Melting', sub: 'water', from: 5, to: 70, explain: 'Melting: solid to liquid. Heat is taken in and particles leave their fixed places.' },
  freezing: { label: 'Freezing', sub: 'water', from: 70, to: 5, explain: 'Freezing: liquid to solid. Heat is given out and particles settle into fixed places.' },
  boiling: { label: 'Boiling', sub: 'water', from: 130, to: 275, explain: 'Boiling (evaporation): liquid to gas. Heat is taken in and particles escape far apart.' },
  condensing: { label: 'Condensation', sub: 'water', from: 275, to: 130, explain: 'Condensation: gas to liquid. Heat is given out and particles come close together.' },
  sublimation: { label: 'Sublimation', sub: 'iodine', from: 5, to: 135, explain: 'Sublimation: solid straight to gas, with no liquid. Iodine crystals do this when warmed.' },
};
const CH_KEYS = Object.keys(CHANGES);
const L2 = { rounds: [], i: 0, tries: 0, answered: false };
function l2Start() {
  mode.kind = 'name';
  showChamber(true); showSorting(false);
  L2.rounds = kit.shuffle(CH_KEYS); L2.i = 0;
  showAnswers(CH_KEYS.map((k) => CHANGES[k].label), l2Answer, 0.168, 'bold 26px system-ui, sans-serif');
  l2Round();
}
function l2Draw(extra = null, tone = 'info') {
  board.draw({
    heading: 'Level 2: Name the change', level: `Round ${Math.min(L2.i + 1, L2.rounds.length)} of ${L2.rounds.length}`, tone,
    body: ['Watch the particles in the chamber. Which change of state is happening?', 'Choose the name on the buttons in front of you. Answer first time for **15** points.', extra || ''],
    footer: 'Tip: look at where the particles start and where they end up, not only at the thermometer.',
  });
}
async function l2Round() {
  const run = kit.newRun();
  const ch = CHANGES[L2.rounds[L2.i]];
  L2.tries = 0; L2.answered = false;
  setSubstance(ch.sub, ch.from);
  sim.heater = 0; paintHeater();
  l2Draw();
  await wait(1.0);
  if (!kit.isRun(run)) return;
  // run the change automatically
  sim.heater = ch.to > ch.from ? 1 : -1; paintHeater();
  sim.target = ch.to;
}
function l2Tick() {
  if (mode.kind !== 'name' || sim.target == null) return;
  if ((sim.heater > 0 && sim.Q >= sim.target) || (sim.heater < 0 && sim.Q <= sim.target)) { sim.heater = 0; sim.target = null; paintHeater(); }
}
async function l2Answer(k) {
  if (mode.kind !== 'name' || L2.answered) return;
  const key = L2.rounds[L2.i];
  const run = kit.newRun();
  if (CH_KEYS[k] === key) {
    L2.answered = true;
    score.add(L2.tries === 0 ? 15 : L2.tries === 1 ? 5 : 0, row.position.clone().add(new THREE.Vector3(0, 0.15, 0)));
    say(CHANGES[key].explain, 'good', 5);
    l2Draw(`**Correct.** ${CHANGES[key].explain}`, 'good');
    await wait(3.2);
    if (!kit.isRun(run)) return;
    L2.i++;
    if (L2.i >= L2.rounds.length) { mode.kind = 'done'; sim.heater = 0; sim.target = null; paintHeater(); hideRow(); flow.complete(['The five changes of state: melting, freezing, boiling (evaporation), condensation and sublimation.']); return; }
    l2Round();
  } else {
    L2.tries++;
    say(`Not ${CHANGES[CH_KEYS[k]].label.toLowerCase()}. Watch again: what state did it start in?`, 'bad');
    // replay the change so they can watch again
    const ch = CHANGES[key];
    setSubstance(ch.sub, ch.from); sim.heater = 0; paintHeater();
    await wait(0.6);
    if (!kit.isRun(run) || L2.answered) return;
    sim.heater = ch.to > ch.from ? 1 : -1; sim.target = ch.to; paintHeater();
  }
}

// ================================================================= level 3: element, compound or mixture
const sorting = new THREE.Group();
scene.add(sorting);
const ATOM = { O: 0xd63a2f, H: 0xf2f2f2, C: 0x2d2d2d, N: 0x3a62c9, He: 0xf2c80f, Ar: 0xe67e22, Fe: 0x8a8f96, Na: 0x8e44ad, Cl: 0x27ae60 };
const ATOM_R = { O: 0.0085, H: 0.006, C: 0.0085, N: 0.0085, He: 0.008, Ar: 0.0095, Fe: 0.0095, Na: 0.0095, Cl: 0.0095 };
const atomGeo = new THREE.SphereGeometry(1, 12, 9);
const atomMats = {};
const atomMat = (el) => (atomMats[el] ||= mat(ATOM[el], { roughness: 0.4 }));
// molecule shapes in local coordinates
const MOL = {
  He: [['He', 0, 0, 0]], Ar: [['Ar', 0, 0, 0]],
  O2: [['O', -0.0075, 0, 0], ['O', 0.0075, 0, 0]],
  N2: [['N', -0.0075, 0, 0], ['N', 0.0075, 0, 0]],
  H2: [['H', -0.005, 0, 0], ['H', 0.005, 0, 0]],
  H2O: [['O', 0, 0, 0], ['H', -0.009, -0.006, 0], ['H', 0.009, -0.006, 0]],
  CO2: [['C', 0, 0, 0], ['O', -0.014, 0, 0], ['O', 0.014, 0, 0]],
};
const JAR = 0.1;
const jarGlass = new THREE.MeshStandardMaterial({ color: 0xd4ebfb, transparent: true, opacity: 0.2, roughness: 0.04, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide });
const corkMat = mat(0xa9774a, { roughness: 0.9 });
function jarMesh(letter) {
  const g = new THREE.Group();
  // a round glass jar with a cork stopper
  const body = mesh(new THREE.CylinderGeometry(JAR * 0.52, JAR * 0.52, JAR, 28, 1, true), jarGlass); body.renderOrder = 3;
  const bottom = mesh(new THREE.CircleGeometry(JAR * 0.52, 28).rotateX(-Math.PI / 2), jarGlass, 0, -JAR / 2, 0);
  const rim = mesh(new THREE.TorusGeometry(JAR * 0.52, 0.003, 6, 28).rotateX(Math.PI / 2), mat(0xcfe0ea, { roughness: 0.1, metalness: 0.2 }), 0, JAR / 2, 0);
  const cork = mesh(new THREE.CylinderGeometry(JAR * 0.42, JAR * 0.38, 0.02, 20), corkMat, 0, JAR / 2 + 0.006, 0);
  g.add(body, bottom, rim, cork);
  const tag = label(letter, { w: 0.04, h: 0.04, bg: '#13293d', fg: '#ffffff', font: 'bold 44px system-ui, sans-serif', res: 1500, radius: 30 });
  tag.position.set(0, JAR / 2 + 0.04, 0); tag.userData.noHit = true;
  g.add(tag); g.userData.tag = tag;
  return g;
}
function addAtoms(g, list) {
  const byEl = {};
  for (const [el, x, y, z, mol] of list) (byEl[el] ||= []).push([x, y, z, mol]);
  for (const el in byEl) {
    const im = new THREE.InstancedMesh(atomGeo, atomMat(el), byEl[el].length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.userData.base = byEl[el].map(([x, y, z, mol]) => ({ x, y, z, mol: mol ?? -1, r: ATOM_R[el] }));
    byEl[el].forEach(([x, y, z], i) => { const r = ATOM_R[el]; im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r, r))); });
    g.add(im); (g.userData.atomMeshes ||= []).push(im);
  }
}
// scatter molecules in the jar (random positions and turns, no overlaps)
function scatter(mols) {
  const out = []; const placed = [];
  for (const [mi, m] of mols.entries()) {
    let p, tries = 0;
    do { p = new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06); tries++; }
    while (placed.some((q) => q.distanceTo(p) < 0.027) && tries < 80);
    placed.push(p);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    for (const [el, x, y, z] of MOL[m]) { const v = new THREE.Vector3(x, y, z).applyQuaternion(q).add(p); out.push([el, v.x, v.y, v.z, mi]); }
  }
  return out;
}
function lattice(a, b = a) {
  const out = []; const s = 0.019;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) out.push([(i + j + k) % 2 ? b : a, (i - 1) * s, (j - 1) * s, (k - 1) * s]);
  return out;
}
const JARS = [
  { name: 'helium gas (He)', kind: 'element', atoms: () => scatter(Array(7).fill('He')), why: 'only one kind of atom, so it is an element.' },
  { name: 'oxygen gas (O₂)', kind: 'element', atoms: () => scatter(Array(6).fill('O2')), why: 'its molecules are made of two atoms of the SAME element, so it is still an element.' },
  { name: 'iron (Fe)', kind: 'element', atoms: () => lattice('Fe'), why: 'one kind of atom packed closely: an element (a solid metal).' },
  { name: 'water (H₂O)', kind: 'compound', atoms: () => scatter(Array(6).fill('H2O')), why: 'every particle has hydrogen and oxygen chemically joined in a fixed ratio: a compound.' },
  { name: 'carbon dioxide (CO₂)', kind: 'compound', atoms: () => scatter(Array(6).fill('CO2')), why: 'carbon and oxygen chemically joined, all particles the same: a compound.' },
  { name: 'sodium chloride (NaCl)', kind: 'compound', atoms: () => lattice('Na', 'Cl'), why: 'sodium and chlorine chemically joined in a fixed pattern: a compound.' },
  { name: 'air', kind: 'mixture', atoms: () => scatter(['N2', 'N2', 'N2', 'O2', 'O2', 'Ar']), why: 'different substances (nitrogen, oxygen, argon) not joined together: a mixture.' },
  { name: 'carbon dioxide and water vapour', kind: 'mixture', atoms: () => scatter(['CO2', 'CO2', 'CO2', 'H2O', 'H2O', 'H2O']), why: 'two different compounds mixed, not joined to each other: a mixture.' },
];
const KINDS = ['element', 'compound', 'mixture'];
const trays = KINDS.map((k, i) => {
  const g = new THREE.Group();
  g.position.set(-0.24 + i * 0.27, TABLE_Y, -0.43);
  const base = mesh(new THREE.BoxGeometry(0.25, 0.02, 0.17), lam([0x2e86c1, 0xc0392b, 0x27ae60][i]), 0, 0.01, 0);
  const rimM = lam(0xd8d6cf);
  for (const [w, d, x, z] of [[0.25, 0.01, 0, 0.08], [0.25, 0.01, 0, -0.08], [0.01, 0.17, 0.12, 0], [0.01, 0.17, -0.12, 0]]) g.add(mesh(new THREE.BoxGeometry(w, 0.03, d), rimM, x, 0.025, z));
  g.add(base);
  const t = label(k.toUpperCase(), { w: 0.23, h: 0.045, bg: ['#2e86c1', '#c0392b', '#27ae60'][i], fg: '#ffffff', font: 'bold 34px system-ui, sans-serif' });
  t.position.set(0, 0.075, -0.09); t.userData.noHit = true; g.add(t);
  g.userData.kind = k; g.userData.count = 0;
  sorting.add(g);
  kit.slot(g, {
    name: `${k[0].toUpperCase() + k.slice(1)} tray`,
    accept: (item) => {
      if (!item.userData.jar) return false;
      const ok = item.userData.jar.kind === k;
      if (!ok) { item.userData.wrong = (item.userData.wrong || 0) + 1; score.streak = 0; return `Not a${k === 'element' ? 'n' : ''} ${k}. Look at the particles: are the atoms the same, joined, or just mixed?`; }
      return true;
    },
    onPlace: (item) => placeJar(item, g),
    enabled: () => mode.kind === 'sort',
  });
  return g;
});
const jars = [];
JARS.forEach((def, i) => {
  const j = jarMesh('ABCDEFGH'[i]);
  addAtoms(j, def.atoms());
  j.userData.jar = def;
  sorting.add(j);
  jars.push(j);
});
function layoutJars() {
  const order = kit.shuffle(jars);
  order.forEach((j, i) => {
    j.position.set(-0.36 + i * 0.105, TABLE_Y + JAR / 2 + 0.005, -0.72 + (i % 2) * 0.05);
    j.rotation.set(0, 0, 0); j.scale.set(1, 1, 1);
    j.userData.locked = false; j.userData.wrong = 0;
    j.userData.tag.userData.draw('ABCDEFGH'[i]);
    j.userData.letter = 'ABCDEFGH'[i];
    if (j.userData.interactive) j.userData.interactive.name = `Jar ${j.userData.letter}`;
  });
}
layoutJars();
jars.forEach((j) => {
  kit.carryable(j, { name: `Jar ${j.userData.letter}`, holdOffset: new THREE.Vector3(0, -0.07, 0), canPick: () => mode.kind === 'sort' });
});
async function placeJar(j, tray) {
  const n = tray.userData.count++;
  j.userData.locked = true;
  const pos = new THREE.Vector3(-0.07 + (n % 3) * 0.07, 0.02 + 0.03, (n < 3 ? 0.03 : -0.04));
  const firstTry = !j.userData.wrong;
  score.add(firstTry ? 10 : 3, tray.position.clone().add(new THREE.Vector3(0, 0.15, 0)));
  kit.burst(tray.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 16);
  const def = j.userData.jar;
  say(`Jar ${j.userData.letter} is ${def.name}: ${def.why}`, 'good', 6);
  L3.done++;
  l3Draw();
  await kit.settle(j, tray, pos, new THREE.Quaternion(), new THREE.Vector3(0.62, 0.62, 0.62));
  if (L3.done === jars.length && mode.kind === 'sort') {
    mode.kind = 'done';
    await wait(1.5);
    flow.complete(['Element: one kind of atom (alone or in molecules). Compound: different atoms chemically joined. Mixture: different substances not joined.']);
  }
}
const L3 = { done: 0 };
function l3Draw() {
  const w = howTo(kit.kind);
  board.draw({
    heading: 'Level 3: Element, compound or mixture?', level: `${L3.done} of ${jars.length} sorted`,
    body: [`Each jar shows the particles of a substance. Colours are different kinds of atom; touching atoms are joined.`,
      `Pick up a jar (${w.pick}) and put it in the right tray (${w.place}).`],
    items: [
      { text: '**Element:** only one kind of atom. The atoms may be on their own or joined in molecules.', state: 'todo' },
      { text: '**Compound:** two or more different kinds of atom chemically joined.', state: 'todo' },
      { text: '**Mixture:** two or more different substances that are not joined to each other.', state: 'todo' },
    ],
    footer: '10 points for each jar sorted first time.',
  });
}
function l3Start() {
  mode.kind = 'sort';
  showChamber(false); showSorting(true); hideRow();
  L3.done = 0;
  trays.forEach((t) => { t.userData.count = 0; });
  jars.forEach((j) => { j.userData.home.parent.attach(j); });
  layoutJars();
  jars.forEach((j) => kit.storeHome(j));
  l3Draw();
}

function showChamber(v) { chamber.visible = thermo.visible = easel.visible = row.visible = v; }
function showSorting(v) { sorting.visible = v; }

// ================================================================= levels
const flow = kit.levelFlow({
  key: 'form1-particles',
  board,
  intro: {
    heading: 'Particle Lab: States of Matter',
    body: ['Everything is made of tiny particles. In this lab you can see them.',
      'Heat and cool a substance and watch its particles change state, name each change, then sort substances into **elements**, **compounds** and **mixtures**.',
      'Choose a level on the panel to your left to begin.'],
    footer: 'Form 1 Integrated Science: matter and the kinetic theory.',
  },
  levels: [
    { title: 'Heat and cool', short: 'Heat & cool', max: 140, start: l1Start, stop: () => { sim.heater = 0; } },
    { title: 'Name the change', short: 'Name it', max: 75, start: l2Start, stop: () => { sim.heater = 0; sim.target = null; } },
    { title: 'Element, compound or mixture', short: 'Sort it', max: 80, start: l3Start },
  ],
});
showSorting(false); hideRow();
setSubstance('water', 0);
flow.showIntro();
kit.onKind(() => { if (mode.kind === 'sort') l3Draw(); });

const _jm = new THREE.Matrix4(), _jp = new THREE.Vector3(), _jq = new THREE.Quaternion(), _js = new THREE.Vector3();
function animateJars(t) {
  for (const j of jars) for (const im of j.userData.atomMeshes || []) {
    im.userData.base.forEach((b, i) => {
      if (b.mol >= 0) { const ph = b.mol * 1.7 + j.userData.letter.charCodeAt(0); _jp.set(b.x + Math.sin(t * 1.3 + ph) * 0.005, b.y + Math.sin(t * 1.1 + ph * 2) * 0.005, b.z + Math.cos(t * 1.2 + ph) * 0.005); }
      else { const ph = i * 2.3; _jp.set(b.x + Math.sin(t * 23 + ph) * 0.0007, b.y + Math.sin(t * 29 + ph) * 0.0007, b.z + Math.sin(t * 19 + ph) * 0.0007); }
      im.setMatrixAt(i, _jm.compose(_jp, _jq, _js.setScalar(b.r)));
    });
    im.instanceMatrix.needsUpdate = true;
  }
}

kit.tick((dt) => {
  if (sorting.visible) animateJars(kit.time);
  if (chamber.visible) {
    stepHeat(dt);
    stepParticles(dt);
    stepShimmer(dt);
    paintThermo();
    const c = counts(sim.Q); const sn = stateName(c);
    if (sn !== stateLabel.userData.last) { stateLabel.userData.last = sn; stateLabel.userData.draw(sn, '#1d4e6e'); }
    sim.histT += dt;
    if (!sim.history.length || sim.histT - sim.history[sim.history.length - 1][0] > 0.2) {
      sim.history.push([sim.histT, tempOf(sim.Q)]);
      if (sim.history.length > 400) sim.history.shift();
      drawGraph();
    }
  }
  l1Tick(dt); l2Tick();
});
kit.start();

// Test hook (used by the automated browser test; harmless for players).
window.game = { kit, flow, sim, counts, tempOf, L1, L2, L3, jars, trays, heatBtns, ansBtns, mode, CHANGES, CH_KEYS, board, setSubstance, slider, knob, SL_HALF, speed: 1 };
