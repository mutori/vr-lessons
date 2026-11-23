// Atom Forge: Atomic Structure and Ionic Bonding (Form 3 Integrated Science, Matter: protons,
// neutrons, electrons, electron arrangement, isotopes, ions and ionic bonding). Built on shared/game-kit.js.
import { createGame, THREE, howTo } from '../shared/game-kit.js';

const kit = createGame({ title: 'Atom Forge' });
const { scene, mesh, lam, mat, basic, label, button, tween, wait, sfx, say, score, noHit } = kit;
kit.buildRoom({ sign: 'ATOM FORGE  ·  FORM 3', accent: 0x2e5e8c, signBg: '#1f4466', wall: 0xedf0f4 });
const TABLE_Y = 0.8;
kit.table({ w: 1.4, d: 0.65, z: -0.6 });
const board = kit.board({ w: 1.6, h: 0.9 });
board.group.position.set(0, 1.74, -1.55);
scene.add(board.group);
kit.setToastAnchor(new THREE.Vector3(0, 1.24, -1.45));

// ================================================================= element data (first 20)
const ELEMENTS = [
  ['H', 'Hydrogen', 1], ['He', 'Helium', 4], ['Li', 'Lithium', 7], ['Be', 'Beryllium', 9], ['B', 'Boron', 11],
  ['C', 'Carbon', 12], ['N', 'Nitrogen', 14], ['O', 'Oxygen', 16], ['F', 'Fluorine', 19], ['Ne', 'Neon', 20],
  ['Na', 'Sodium', 23], ['Mg', 'Magnesium', 24], ['Al', 'Aluminium', 27], ['Si', 'Silicon', 28], ['P', 'Phosphorus', 31],
  ['S', 'Sulphur', 32], ['Cl', 'Chlorine', 35], ['Ar', 'Argon', 40], ['K', 'Potassium', 39], ['Ca', 'Calcium', 40],
];
const el = (z) => ({ sym: ELEMENTS[z - 1][0], name: ELEMENTS[z - 1][1], A: ELEMENTS[z - 1][2], Z: z });
const CAP = [2, 8, 8];
function arrangement(n) { const out = []; let left = n; for (const c of CAP) { if (left <= 0) break; out.push(Math.min(c, left)); left -= c; } return out; }

// periodic table panel on an easel to the right
{
  const p = kit.canvasPlane(0.52, 0.32, 1400);
  const { ctx, c } = p; const W = c.width, H = c.height;
  ctx.fillStyle = '#e8e6e0'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#13293d'; ctx.font = 'bold 30px system-ui'; ctx.textBaseline = 'top';
  ctx.fillText('Periodic table: elements 1 to 20', 14, 10);
  const pos = {};   // Z -> [col, row]
  const groupsOf = [[1, 8], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2]];
  let z = 1;
  groupsOf.forEach((cols, row) => cols.forEach((col) => { pos[z++] = [col, row]; }));
  const cw = (W - 28) / 8, ch = (H - 60) / 4;
  for (let zz = 1; zz <= 20; zz++) {
    const [col, row] = pos[zz]; const x = 14 + (col - 1) * cw, y = 52 + row * ch;
    const metal = [3, 4, 11, 12, 13, 19, 20].includes(zz), noble = [2, 10, 18].includes(zz);
    ctx.fillStyle = metal ? '#fde3c8' : noble ? '#e6dcf5' : '#d8f0e0';
    kit.roundRect(ctx, x + 3, y + 3, cw - 6, ch - 6, 10); ctx.fill();
    ctx.fillStyle = '#13293d'; ctx.textAlign = 'left'; ctx.font = '20px system-ui'; ctx.fillText(String(zz), x + 10, y + 8);
    ctx.textAlign = 'right'; ctx.fillText(String(ELEMENTS[zz - 1][2]), x + cw - 10, y + 8);
    ctx.textAlign = 'center'; ctx.font = 'bold 40px system-ui'; ctx.fillText(ELEMENTS[zz - 1][0], x + cw / 2, y + ch / 2 - 10);
    ctx.font = '17px system-ui'; ctx.fillText(ELEMENTS[zz - 1][1], x + cw / 2, y + ch - 28);
  }
  ctx.textAlign = 'left'; ctx.font = '18px system-ui'; ctx.fillStyle = '#4a5a68';
  ctx.fillText('top left: atomic number   top right: mass number   orange: metals', 14, H - 22);
  p.update();
  const easel = new THREE.Group();
  easel.position.set(0.58, TABLE_Y + 0.3, -0.62); easel.rotation.set(-0.1, -0.55, 0, 'YXZ');
  easel.add(mesh(new THREE.BoxGeometry(0.54, 0.34, 0.015), lam(0x2a3a48), 0, 0, -0.01), p.mesh);
  easel.add(mesh(new THREE.BoxGeometry(0.02, 0.3, 0.02), lam(0x2a3a48), 0, -0.3, -0.03));
  noHit(easel); scene.add(easel);
}

// ================================================================= an atom model (Bohr style, facing the learner)
const SHELL_R = [0.05, 0.082, 0.114];
const NUC_R = 0.0072;
const pGeo = new THREE.SphereGeometry(NUC_R, 14, 10), eGeo = new THREE.SphereGeometry(0.0085, 14, 10);
const protonMat = mat(0xd63a2f, { roughness: 0.35 }), neutronMat = mat(0x9aa3ab, { roughness: 0.45 });
const eMats = { own: mat(0x3b9ae1, { roughness: 0.25, emissive: 0x1d5a8c }), given: mat(0xf1c40f, { roughness: 0.25, emissive: 0x8a6a00 }) };
const nucGlowTex = kit.glowTexture('255,150,110'), ionTex = { pos: kit.glowTexture('255,120,90'), neg: kit.glowTexture('90,160,255') };
// packed nucleon positions: a jittered lattice sorted by distance from the centre
const NUC_PTS = (() => {
  const pts = []; const s = NUC_R * 1.75;
  for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) {
    const v = new THREE.Vector3(x + (y % 2) * 0.5, y * 0.87, z + (x % 2) * 0.3).multiplyScalar(s);
    v.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(s * 0.15));
    pts.push(v);
  }
  return pts.sort((a, b) => a.length() - b.length()).slice(0, 60);
})();
const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fa6c4 });
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
function atomView() {
  const g = new THREE.Group();
  const prot = new THREE.InstancedMesh(pGeo, protonMat, 60), neut = new THREE.InstancedMesh(pGeo, neutronMat, 60);
  prot.count = neut.count = 0;
  const nuc = new THREE.Group(); nuc.add(prot, neut); g.add(nuc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: nucGlowTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(0.001); noHit(glow); g.add(glow);
  const shells = SHELL_R.map((r, i) => {
    const ring = mesh(new THREE.TorusGeometry(r, 0.0021, 6, 96), ringMat.clone());
    ring.material.transparent = true;
    const hit = mesh(new THREE.TorusGeometry(r, 0.011, 6, 48), hitMat);
    ring.add(hit);
    ring.userData.index = i; ring.userData.r = r;
    g.add(ring);
    return ring;
  });
  const sym = label('', { w: 0.14, h: 0.05, bg: null, fg: '#13293d', font: 'bold 52px system-ui, sans-serif' });
  sym.position.set(0, -SHELL_R[2] - 0.035, 0); g.add(sym);
  noHit(sym);
  const charge = label('', { w: 0.08, h: 0.05, bg: null, fg: '#b03a2e', font: 'bold 52px system-ui, sans-serif' });
  charge.position.set(SHELL_R[2] + 0.02, -SHELL_R[2] - 0.01, 0); g.add(charge); noHit(charge);
  const view = { group: g, shells, electrons: [[], [], []], p: 0, n: 0, sym, charge, nuc, glow, orbit: [0, 0, 0], spin: true };
  VIEWS.add(view);
  view.setNucleus = (p, n) => {
    view.p = p; view.n = n;
    const total = Math.min(60, p + n);
    // spread protons evenly through the clump
    let pi = 0, ni = 0;
    const m = new THREE.Matrix4();
    for (let i = 0; i < total; i++) {
      const wantP = pi < p && (ni >= n || (pi + 1) / p <= (ni + 1) / n + 1e-9);
      m.makeTranslation(NUC_PTS[i].x, NUC_PTS[i].y, NUC_PTS[i].z);
      if (wantP) prot.setMatrixAt(pi++, m); else neut.setMatrixAt(ni++, m);
    }
    prot.count = pi; neut.count = ni;
    prot.instanceMatrix.needsUpdate = neut.instanceMatrix.needsUpdate = true;
    prot.computeBoundingSphere(); neut.computeBoundingSphere();
    glow.scale.setScalar(total ? 0.05 + Math.cbrt(total) * 0.018 : 0.001);
  };
  // place electrons of one shell evenly round its ring
  view.layout = (si, animate = true) => {
    const list = view.electrons[si]; const r = SHELL_R[si];
    list.forEach((e, i) => {
      const u = e.userData;
      u.slotA = Math.PI / 2 - (i / Math.max(1, list.length)) * Math.PI * 2 - (si * 0.4); u.tr = r;
      if (e.parent !== g) g.attach(e);
      if (u.owner !== g || !animate) { u.owner = g; u.ang = Math.atan2(e.position.y, e.position.x); u.r = Math.hypot(e.position.x, e.position.y); }
      if (!animate) { u.ang = u.slotA + view.orbit[si]; u.r = r; e.position.set(Math.cos(u.ang) * r, Math.sin(u.ang) * r, 0); }
    });
  };
  view.addElectron = (si, kind = 'own', animate = true) => {
    const e = mesh(eGeo, eMats[kind]); e.userData.kind = kind; e.userData.view = view; e.userData.shell = si;
    if (animate) { const r = SHELL_R[si]; e.position.set(r * 1.6, r * 1.2, 0); }
    g.add(e); view.electrons[si].push(e); view.layout(si, animate);
    return e;
  };
  view.removeElectron = (e) => {
    const si = e.userData.shell; const list = view.electrons[si];
    const i = list.indexOf(e); if (i >= 0) list.splice(i, 1);
    view.layout(si);
  };
  view.clearElectrons = () => { view.electrons.forEach((l) => l.forEach((e) => { e.parent?.remove(e); })); view.electrons = [[], [], []]; };
  view.config = () => view.electrons.map((l) => l.length);
  view.eCount = () => view.electrons.reduce((s, l) => s + l.length, 0);
  view.outer = () => { for (let i = 2; i >= 0; i--) if (view.electrons[i].length) return i; return 0; };
  view.showShells = (n) => shells.forEach((s, i) => { s.visible = i < n; });
  view.build = ({ p, n, e, sym: s = '', kinds = null }) => {
    view.setNucleus(p, n); view.clearElectrons();
    e.forEach((cnt, si) => { for (let i = 0; i < cnt; i++) view.addElectron(si, kinds ? kinds[si] : 'own', false); view.layout(si, false); });
    view.showShells(Math.max(1, e.length));
    sym.userData.draw(s, null); charge.userData.draw('', null);
  };
  return view;
}

// Electrons glide to their places and slowly orbit; the nucleus turns gently. Electrons that can be
// picked up hold still (and pulse) so they are easy to grab.
const VIEWS = new Set();
const ORBIT_W = [0.55, 0.38, 0.28];
kit.tick((dt, t) => {
  for (const v of VIEWS) {
    if (!v.group.parent || !v.group.visible) continue;
    v.nuc.rotation.y += dt * 0.35; v.nuc.rotation.x = Math.sin(t * 0.5) * 0.3;
    const k = Math.min(1, dt * 9);
    for (let si = 0; si < 3; si++) {
      if (v.spin) v.orbit[si] += dt * ORBIT_W[si];
      for (const e of v.electrons[si]) {
        if (e.parent !== v.group) continue;
        const u = e.userData; if (u.ang == null) continue;
        let d = u.slotA + v.orbit[si] - u.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
        u.ang += d * k; u.r += (u.tr - u.r) * k;
        e.position.set(Math.cos(u.ang) * u.r, Math.sin(u.ang) * u.r, e.position.z * (1 - k));
        const pickable = u.carry && !u.moved && mode.kind === 'bond' && L2.phase === 'move';
        e.scale.setScalar(pickable ? 1 + 0.18 * (0.5 + 0.5 * Math.sin(t * 5 + u.slotA)) : 1);
      }
    }
  }
});

// the main atom (levels 1 and 3)
const main = atomView();
main.group.position.set(0.0, 1.17, -0.6);
main.group.scale.setScalar(1.25);
scene.add(main.group);

// info panel: target + your atom (left of the atom)
const info = kit.canvasPlane(0.3, 0.34, 1300);
const infoG = new THREE.Group();
infoG.position.set(-0.37, 1.25, -0.68); infoG.rotation.y = 0.4;
infoG.add(mesh(new THREE.BoxGeometry(0.325, 0.365, 0.015), mat(0x3a4550, { metalness: 0.3, roughness: 0.4 }), 0, 0, -0.01), info.mesh);
infoG.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.27, 10), mat(0x8d969e, { metalness: 0.7, roughness: 0.35 }), 0, -0.31, -0.02));
noHit(infoG); scene.add(infoG);
function drawInfo({ target = null, title = 'Your atom', showCounts = true } = {}) {
  const { ctx, c } = info; const W = c.width, H = c.height;
  ctx.fillStyle = '#1f2b35'; ctx.fillRect(0, 0, W, H);
  let y = 20;
  if (target) {
    ctx.fillStyle = '#2b5d80'; ctx.fillRect(0, 0, W, 210);
    ctx.fillStyle = '#f3f2ee'; ctx.font = 'bold 30px system-ui'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText(`BUILD: ${target.name.toUpperCase()}`, 18, 14);
    // nuclide notation: mass number top-left, atomic number bottom-left
    const cx = W / 2 + 20;
    ctx.font = 'bold 120px system-ui'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const sw = ctx.measureText(target.sym).width;
    ctx.fillText(target.sym, cx - sw / 2, 180);
    ctx.font = 'bold 46px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(String(target.A), cx - sw / 2 - 8, 110);
    ctx.fillText(String(target.Z), cx - sw / 2 - 8, 182);
    y = 240;
  }
  ctx.fillStyle = '#e4e8ea'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.font = 'bold 32px system-ui'; ctx.fillText(title, 18, y); y += 50;
  if (showCounts) {
    const rows = [['Protons', main.p, '#e0574b'], ['Neutrons', main.n, '#9aa3ab'], ['Electrons', main.eCount(), '#3b9ae1']];
    for (const [n, v, col] of rows) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(32, y + 18, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e4e8ea'; ctx.font = '34px system-ui'; ctx.fillText(n, 58, y); ctx.font = 'bold 38px system-ui'; ctx.textAlign = 'right'; ctx.fillText(String(v), W - 24, y); ctx.textAlign = 'left';
      y += 50;
    }
    ctx.font = '30px system-ui'; ctx.fillStyle = '#b4c1ca';
    const cfg = main.config().filter((x, i) => x || main.config().slice(i + 1).some(Boolean));
    ctx.fillText(`Arrangement: ${cfg.length ? cfg.join(', ') : '—'}`, 18, y + 4);
  }
  info.update();
}

// ================================================================= the forge: a projector under the atom
const forge = new THREE.Group();
forge.position.set(0, TABLE_Y, -0.6);
scene.add(forge);
{
  const steel = mat(0xb9c2c9, { metalness: 0.8, roughness: 0.3 });
  forge.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.04, 48), mat(0x2b3138, { roughness: 0.4, metalness: 0.3 }), 0, 0.02, 0));
  forge.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.006, 48), steel, 0, 0.043, 0));
  forge.add(mesh(new THREE.TorusGeometry(0.115, 0.005, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fb8ff }), 0, 0.041, 0));
  // a faint beam of light up to the atom
  const beam = mesh(new THREE.CylinderGeometry(0.035, 0.09, 0.26, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x2a6ea8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, 0.175, 0);
  forge.add(beam);
  const sh = kit.contactShadow(0.42, 0.42, 0.5); sh.position.y = 0.002; forge.add(sh);
  noHit(forge);
}

// ================================================================= particle bins: pick up a proton, neutron or electron
// Hold a particle and press on the nucleus (protons, neutrons) or on a shell ring (electrons). The particle
// stays in your hand, so you can keep adding; put it back by pressing anywhere else.
const TOKEN = { p: { name: 'proton', mat: protonMat, color: '#e0574b', tag: 'PROTONS  +' }, n: { name: 'neutron', mat: neutronMat, color: '#9aa3ab', tag: 'NEUTRONS  0' }, e: { name: 'electron', mat: eMats.own, color: '#3b9ae1', tag: 'ELECTRONS  −' } };
const BIN_POS = { p: [-0.34, -0.53], n: [-0.2, -0.56], e: [0.22, -0.55] };
const tokens = {};
for (const k of ['p', 'n', 'e']) {
  const bin = new THREE.Group();
  bin.position.set(BIN_POS[k][0], TABLE_Y, BIN_POS[k][1]);
  scene.add(bin);
  bin.add(mesh(new THREE.LatheGeometry([[0, 0.003], [0.05, 0.003], [0.056, 0.008], [0.058, 0.026], [0.054, 0.027], [0.05, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y)), 40), mat(0x3a4550, { roughness: 0.35, metalness: 0.4 })));
  const r = k === 'e' ? 0.0085 : NUC_R;
  const pile = new THREE.InstancedMesh(k === 'e' ? eGeo : pGeo, TOKEN[k].mat, 14);
  for (let i = 0; i < 14; i++) { const a = i * 2.4, d = 0.012 + (i % 5) * 0.007; pile.setMatrixAt(i, new THREE.Matrix4().makeScale(1.8, 1.8, 1.8).setPosition(Math.cos(a) * d, 0.018 + (i > 8 ? r * 2 : 0), Math.sin(a) * d)); }
  bin.add(pile);
  const tag = label(TOKEN[k].tag, { w: 0.12, h: 0.026, bg: '#2b3138', fg: TOKEN[k].color, font: 'bold 30px system-ui, sans-serif' });
  tag.position.set(0, 0.008, 0.075); tag.rotation.x = -1.1; bin.add(tag);
  const sh = kit.contactShadow(0.16, 0.16, 0.45); sh.position.y = 0.001; bin.add(sh);
  noHit(bin);
  // the particle you pick up (a fresh one appears each time it is used)
  const tok = mesh(new THREE.SphereGeometry(0.017, 20, 14), TOKEN[k].mat, 0, 0.05, 0);
  tok.userData.token = k;
  bin.add(tok);
  kit.carryable(tok, { name: `Pick up a ${TOKEN[k].name}`, canPick: () => mode.kind === 'build', holdOffset: new THREE.Vector3(0, 0.025, -0.01), holdScale: 1 });
  tokens[k] = tok;
}
const heldToken = () => kit.carry.item && kit.carry.item.userData.token;
kit.tick((dt, t) => { for (const k in tokens) if (kit.carry.item !== tokens[k]) tokens[k].position.y = 0.05 + Math.sin(t * 2 + k.charCodeAt(0)) * 0.006; });
// a copy of the particle flies from the hand into the atom
function flyIn(k, toLocal) {
  const tok = tokens[k];
  const ghost = mesh(tok.geometry, tok.material);
  tok.getWorldPosition(ghost.position); ghost.scale.copy(tok.getWorldScale(new THREE.Vector3()));
  scene.add(ghost);
  const from = ghost.position.clone(), to = main.group.localToWorld(toLocal.clone());
  const s0 = ghost.scale.x, s1 = (k === 'e' ? 0.0085 : NUC_R) / 0.017 * main.group.scale.x;
  return tween(0.28, (q) => { ghost.position.lerpVectors(from, to, q); ghost.position.y += Math.sin(q * Math.PI) * 0.04; ghost.scale.setScalar(s0 + (s1 - s0) * q); }).then(() => { scene.remove(ghost); });
}
// the nucleus accepts protons and neutrons while one is held
const nucHit = mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
main.group.add(nucHit);
kit.interactive(nucHit, {
  name: 'Nucleus: add the particle you hold',
  enabled: () => mode.kind === 'build' && (heldToken() === 'p' || heldToken() === 'n'),
  onSelect: () => {
    const k = heldToken(); if (k !== 'p' && k !== 'n') return;
    flyIn(k, new THREE.Vector3()).then(() => { changeNucleus(k === 'p' ? 1 : 0, k === 'n' ? 1 : 0); kit.sparkle(main.group.getWorldPosition(new THREE.Vector3()), 8, k === 'p' ? 0xff8a6a : 0xc8d0d6); });
  },
});

// ================================================================= the button row
const row = new THREE.Group();
row.position.set(0.05, TABLE_Y + 0.06, -0.36); row.rotation.x = -0.9;
scene.add(row);
row.add(noHit(mesh(new THREE.BoxGeometry(0.98, 0.1, 0.02), lam(0x2a3a48), 0, 0, -0.02)));
const rowBtns = [];
function setRow(defs) {
  rowBtns.forEach((b) => { b.visible = false; });
  const w = defs.length > 6 ? 0.105 : defs.length > 3 ? 0.15 : 0.22;
  const step = w + 0.012;
  defs.forEach((d, i) => {
    let b = rowBtns.find((x) => !x.visible && x.userData.w === w);
    if (!b) {
      b = button('', w, 0.075, { font: 'bold 26px system-ui, sans-serif' });
      b.userData.w = w; row.add(b); rowBtns.push(b);
      kit.interactive(b, { name: '', onSelect: () => b.userData.act?.(), enabled: () => b.visible });
    }
    b.userData.act = d.act; b.userData.interactive.name = d.name || d.text.replace('\n', ' ');
    b.userData.draw(d.text, d.color || '#1f6fb2');
    b.position.set((i - (defs.length - 1) / 2) * step, 0, 0);
    b.visible = true; b.userData.key = d.key || d.text;
  });
}
const rowBtn = (key) => rowBtns.find((b) => b.visible && b.userData.key === key);

// ================================================================= level 1: build the atom
const mode = { kind: 'idle' };
const L1 = { targets: [6, 8, 11, 12, 17], i: 0, checks: 0, history: [] };
// shells: tap (pinch / click) a shell to add an electron there
main.shells.forEach((ring, si) => {
  const r = SHELL_R[si];
  const lp = new THREE.Vector3();
  kit.interactive(ring, {
    name: `Shell ${si + 1}: add an electron`,
    enabled: () => mode.kind === 'build' && ring.visible,
    distance: (wp) => { main.group.worldToLocal(lp.copy(wp)); return (Math.abs(Math.hypot(lp.x, lp.y) - r) + Math.abs(lp.z)) * 1.25 - 0.006; },
    highlight: false,
    onSelect: () => {
      const k = heldToken();
      if (k === 'p' || k === 'n') { say(`A ${TOKEN[k].name} belongs in the nucleus, in the middle of the atom. Shells hold electrons.`, 'bad'); return; }
      if (k === 'e' && main.electrons[si].length < CAP[si]) { const a = 3.5; flyIn('e', new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
      addShellElectron(si);
    },
  });
});
function addShellElectron(si) {
  if (main.electrons[si].length >= CAP[si]) { say(`Shell ${si + 1} is full: it holds at most ${CAP[si]} electrons.`, 'bad'); return; }
  main.addElectron(si); L1.history.push(si);
  sfx.tone(900 + si * 200, 0.08, 'sine', 0.08);
  drawInfo({ target: el(L1.targets[L1.i]) });
}
function undoElectron() {
  const si = L1.history.pop(); if (si == null) return;
  const e = main.electrons[si][main.electrons[si].length - 1];
  if (e) { main.group.remove(e); main.electrons[si].pop(); main.layout(si); }
  drawInfo({ target: el(L1.targets[L1.i]) });
}
function changeNucleus(dp, dn) {
  const p = THREE.MathUtils.clamp(main.p + dp, 0, 20), n = THREE.MathUtils.clamp(main.n + dn, 0, 24);
  if (p === main.p && n === main.n) return;
  main.setNucleus(p, n);
  sfx.tone(dp ? 520 : 380, 0.06, 'triangle', 0.08);
  drawInfo({ target: el(L1.targets[L1.i]) });
}
function l1Draw(extra = '') {
  const t = el(L1.targets[L1.i]);
  const w = howTo(kit.kind);
  board.draw({
    heading: 'Level 1: Build the atom', level: `Atom ${L1.i + 1} of ${L1.targets.length}`,
    body: [`Build an atom of **${t.name.toLowerCase()}-${t.A}**. The card on your left shows its symbol with the **mass number** on top and the **atomic number** below.`,
      `Take particles from the bins on the table: put **protons** and **neutrons** into the nucleus, and **electrons** onto a shell ring (${w.choose} the ring). The P and N buttons are quick shortcuts. Then press **Check**.`, extra],
    items: [
      { text: 'Protons = atomic number', state: 'todo' },
      { text: 'Neutrons = mass number − atomic number', state: 'todo' },
      { text: 'Electrons = protons (a neutral atom); fill shells from the inside: 2, then 8, then 8', state: 'todo' },
    ],
    footer: '20 points for an atom right first time, 10 on the second check, 5 after that.',
  });
}
function l1Load() {
  const t = el(L1.targets[L1.i]);
  main.build({ p: 0, n: 0, e: [], sym: '' });
  main.showShells(3);
  L1.checks = 0; L1.history = [];
  drawInfo({ target: t });
  l1Draw();
}
function l1Start() {
  mode.kind = 'build'; binsShow(true);
  showMain(true); showPair(false);
  L1.i = 0;
  setRow([
    { text: 'P −1', act: () => changeNucleus(-1, 0), color: '#a93226', name: 'Remove a proton' },
    { text: 'P +1', act: () => changeNucleus(1, 0), color: '#c0392b', name: 'Add a proton' },
    { text: 'P +5', act: () => changeNucleus(5, 0), color: '#c0392b', name: 'Add five protons' },
    { text: 'N −1', act: () => changeNucleus(0, -1), color: '#5d6d7e', name: 'Remove a neutron' },
    { text: 'N +1', act: () => changeNucleus(0, 1), color: '#7b8a97', name: 'Add a neutron' },
    { text: 'N +5', act: () => changeNucleus(0, 5), color: '#7b8a97', name: 'Add five neutrons' },
    { text: 'Undo e⁻', act: undoElectron, color: '#2471a3', name: 'Remove the last electron' },
    { text: 'Check', act: l1Check, color: '#1e8449', name: 'Check my atom' },
  ]);
  l1Load();
}
async function l1Check() {
  if (mode.kind !== 'build') return;
  const t = el(L1.targets[L1.i]);
  const cfg = main.config(); const want = arrangement(t.Z);
  const N = t.A - t.Z;
  let msg = null;
  if (main.p !== t.Z) msg = `Protons: the atomic number (the bottom number) is ${t.Z}, so ${t.name.toLowerCase()} has ${t.Z} protons. You have ${main.p}.`;
  else if (main.n !== N) msg = `Neutrons = mass number − atomic number = ${t.A} − ${t.Z} = ${N}. You have ${main.n}.`;
  else if (main.eCount() !== t.Z) msg = `A neutral atom has as many electrons as protons: ${t.Z}. You have ${main.eCount()}.`;
  else if (cfg.some((c, i) => c !== (want[i] || 0))) msg = `Right number of electrons, wrong shells. Fill from the inside: ${want.join(', ')}.`;
  L1.checks++;
  if (msg) { score.streak = 0; say(msg, 'bad', 6); l1Draw(`**Not yet.** ${msg}`); return; }
  const run = kit.newRun();
  mode.kind = 'build-wait';
  const pts = L1.checks === 1 ? 20 : L1.checks === 2 ? 10 : 5;
  score.add(pts, main.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)));
  main.sym.userData.draw(`${t.sym}`, null);
  kit.burst(main.group.position.clone().add(new THREE.Vector3(0, 0.1, 0.05)), 40);
  say(`Perfect ${t.name.toLowerCase()} atom: ${t.Z} protons, ${N} neutrons, electrons ${want.join(', ')}.`, 'good', 5);
  // spin the electrons for a moment
  await tween(1.6, (k) => { main.group.rotation.z = k * Math.PI * 2; });
  main.group.rotation.z = 0;
  if (!kit.isRun(run)) return;
  mode.kind = 'build';
  L1.i++;
  if (L1.i >= L1.targets.length) { mode.kind = 'done'; setRow([]); flow.complete(['Atomic number = protons. Mass number = protons + neutrons. Electrons fill shells 2, 8, 8.']); return; }
  l1Load();
}

// ================================================================= level 2: ionic bonding
const pairG = new THREE.Group(); scene.add(pairG);
const PAIRS = [
  { atoms: [11, 17], formula: 'NaCl', options: ['NaCl', 'Na₂Cl', 'NaCl₂'], ions: ['Na⁺', 'Cl⁻'] },
  { atoms: [12, 8], formula: 'MgO', options: ['MgO', 'Mg₂O', 'MgO₂'], ions: ['Mg²⁺', 'O²⁻'] },
  { atoms: [17, 12, 17], formula: 'MgCl₂', options: ['MgCl', 'MgCl₂', 'Mg₂Cl'], ions: ['Cl⁻', 'Mg²⁺', 'Cl⁻'] },
];
const METALS = [3, 4, 11, 12, 13, 19, 20];
const L2 = { i: 0, views: [], phase: 'move', tries: 0, moves: 0, need: 0 };
function clearPair() {
  if (kit.carry.item && L2.views.some((v) => v.electrons.flat().includes(kit.carry.item))) kit.returnHome(kit.carry.item);
  for (const v of L2.views) { v.electrons.flat().forEach((e) => kit.uninteractive(e)); v.shells.forEach((s) => kit.uninteractive(s)); pairG.remove(v.group); VIEWS.delete(v); }
  L2.views = [];
}
function needs(v) { const o = v.config()[v.outer()]; return v.isMetal ? 0 : CAP[v.outer()] - o; }
function l2Load() {
  clearPair();
  const pr = PAIRS[L2.i];
  const n = pr.atoms.length;
  const gap = n === 2 ? 0.34 : 0.3;
  pr.atoms.forEach((z, ai) => {
    const v = atomView();
    const e = el(z);
    v.isMetal = METALS.includes(z); v.z = z;
    v.spin = false;   // electrons hold still while you move them; they orbit once the ions have formed
    v.build({ p: z, n: e.A - z, e: arrangement(z), sym: e.sym, kinds: v.isMetal ? ['given', 'given', 'given'] : null });
    v.group.position.set((ai - (n - 1) / 2) * gap, 1.17, -0.62);
    v.group.scale.setScalar(n === 2 ? 1.1 : 0.95);
    v.home = v.group.position.clone();
    pairG.add(v.group);
    L2.views.push(v);
    // outer electrons can be picked up
    const outer = v.outer();
    v.electrons[outer].forEach((ee) => makeMovable(ee));
    // the outer shell of each atom accepts an electron
    const ring = v.shells[outer];
    ring.userData.pairShell = true;
    kit.slot(ring, {
      name: `Outer shell of ${e.name.toLowerCase()}`,
      reach: 0.05,
      enabled: () => mode.kind === 'bond' && L2.phase === 'move' && !!kit.carry.item,
      accept: (item) => acceptElectron(item, v),
      onPlace: (item) => placeElectron(item, v),
    });
  });
  L2.phase = 'move'; L2.moves = 0; L2.tries = 0;
  L2.need = L2.views.reduce((s, v) => s + needs(v), 0);
  l2Draw();
}
function makeMovable(e) {
  kit.carryable(e, { name: 'Outer electron', canPick: () => mode.kind === 'bond' && L2.phase === 'move' && !e.userData.moved, holdOffset: new THREE.Vector3(0, 0.02, 0), holdScale: 1.6 });
}
function acceptElectron(item, to) {
  const from = item.userData.view;
  if (from === to) return false;
  if (!from.isMetal) { L2.tries++; score.streak = 0; return `${el(from.z).name} is a non-metal: it GAINS electrons to fill its outer shell, it does not give them away.`; }
  if (to.isMetal) { L2.tries++; return 'Both are metals. Give the electron to the non-metal.'; }
  if (needs(to) <= 0) { L2.tries++; return `This ${el(to.z).name.toLowerCase()} already has a full outer shell of 8. Give the electron to another atom.`; }
  return true;
}
async function placeElectron(e, to) {
  const from = e.userData.view;
  from.removeElectron(e);
  e.userData.moved = true; e.userData.locked = true;
  e.userData.view = to; e.userData.shell = to.outer();
  // settle into the receiving shell
  to.electrons[to.outer()].push(e);
  to.group.attach(e);
  to.layout(to.outer());
  e.scale.setScalar(1);
  score.add(L2.tries ? 3 : 10, to.group.position.clone().add(new THREE.Vector3(0, 0.18, 0)));
  L2.tries = 0;
  L2.moves++;
  sfx.tone(1200, 0.1, 'sine', 0.1, 1600);
  kit.sparkle(e.getWorldPosition(new THREE.Vector3()), 10, 0xffe066);
  // the metal's empty outer shell fades away
  {
    const empty = from.shells.findIndex((s, i) => s.visible && from.electrons[i].length === 0);
    if (empty >= 0) tween(0.5, (k) => { from.shells[empty].scale.setScalar(1 + k * 0.4); from.shells[empty].material.opacity = 1 - k; }).then(() => { from.shells[empty].visible = false; from.shells[empty].scale.setScalar(1); });
  }
  l2Draw();
  if (L2.moves >= L2.need) await bonded();
}
async function bonded() {
  const run = kit.newRun();
  L2.phase = 'formula';
  const pr = PAIRS[L2.i];
  // show charges, then pull the ions together
  L2.views.forEach((v, i) => {
    v.spin = true;
    v.sym.userData.draw(pr.ions[i], null, v.isMetal ? '#b03a2e' : '#1f4466');
    v.charge.userData.draw('', null);
    // a soft halo shows the charge: warm for positive ions, cool for negative ions
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: v.isMetal ? ionTex.pos : ionTex.neg, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(SHELL_R[2] * 3.2); halo.position.z = -0.02; noHit(halo); v.group.add(halo);
    tween(0.6, (k) => { halo.material.opacity = 0.32 * k; });
  });
  say('Ions formed! Opposite charges attract: this is an ionic bond.', 'good', 5);
  kit.burst(new THREE.Vector3(0, 1.2, -0.55), 40);
  const n = L2.views.length;
  const to = L2.views.map((v, i) => new THREE.Vector3((i - (n - 1) / 2) * (n === 2 ? 0.27 : 0.26), 1.17, -0.62));
  const from = L2.views.map((v) => v.group.position.clone());
  await tween(0.9, (k) => L2.views.forEach((v, i) => v.group.position.lerpVectors(from[i], to[i], k)));
  if (!kit.isRun(run)) return;
  sfx.tone(220, 0.25, 'sine', 0.12, 330);
  l2Draw();
  setRow(pr.options.map((o) => ({ text: o, act: () => pickFormula(o), name: `Formula ${o}` })));
}
async function pickFormula(o) {
  if (L2.phase !== 'formula') return;
  const pr = PAIRS[L2.i];
  if (o === pr.formula) {
    const run = kit.newRun();
    L2.phase = 'next';
    score.add(L2.tries ? 3 : 10, row.position.clone().add(new THREE.Vector3(0, 0.15, 0)));
    say(`Yes: ${pr.formula}. The charges balance: ${pr.ions.join(' + ')} add up to zero.`, 'good', 5);
    setRow([]);
    await wait(1.2);
    if (!kit.isRun(run)) return;
    await showLattice(pr, run);
    if (!kit.isRun(run)) return;
    L2.i++; L2.tries = 0;
    if (L2.i >= PAIRS.length) { mode.kind = 'done'; clearPair(); flow.complete(['Metals lose electrons to form positive ions; non-metals gain electrons to form negative ions.']); return; }
    l2Load();
  } else {
    L2.tries++; score.streak = 0;
    say(`Not ${o}. Count the ions: the positive and negative charges must cancel out.`, 'bad');
  }
}
function l2Draw() {
  const pr = PAIRS[L2.i];
  const names = pr.atoms.map((z) => el(z).name.toLowerCase());
  const w = howTo(kit.kind);
  const body = L2.phase === 'formula'
    ? ['Every atom now has a full outer shell. Look at the charges on the ions.', `What is the **formula** of the compound? Choose it on the buttons in front of you.`]
    : [`Make ${[...new Set(names)].join(' and ')} react. Atoms want a **full outer shell** (like a noble gas).`,
      `Pick up an outer electron (${w.pick}) and give it to an atom that needs one (${w.place}). Yellow electrons came from the metal.`,
      `Electrons moved: **${L2.moves}** of ${L2.need}.`];
  board.draw({
    heading: 'Level 2: Make ions, make a bond', level: `Reaction ${L2.i + 1} of ${PAIRS.length}`,
    body,
    items: L2.views.map((v) => ({ text: `${el(v.z).name}: ${v.isMetal ? 'metal' : 'non-metal'}, electrons ${v.config().filter((x, i) => x || i < v.outer()).join(', ')}`, state: 'todo' })),
    footer: 'Dot-and-cross idea: yellow = electrons that came from the metal, blue = the non-metal’s own.',
  });
}
function l2Start() {
  mode.kind = 'bond'; binsShow(false);
  showMain(false); showPair(true);
  L2.i = 0;
  setRow([]);
  l2Load();
}

// The ions do not stay as a pair: millions of them pack into a giant ionic lattice. Show a small piece.
const latticeG = new THREE.Group(); latticeG.position.set(0, 1.17, -0.62); latticeG.visible = false; scene.add(latticeG);
const latLabel = label('', { w: 0.5, h: 0.05, bg: '#1f2b35', fg: '#f3f2ee', font: 'bold 34px system-ui, sans-serif' });
latLabel.position.set(0, -0.19, 0.02); noHit(latLabel); latticeG.add(latLabel);
const LAT = { NaCl: { cat: 0x9b8fd6, an: 0x5fbf6a, rc: 0.014, ra: 0.022, name: 'Sodium chloride: a giant ionic lattice' }, MgO: { cat: 0xd9d4c4, an: 0xe0574b, rc: 0.014, ra: 0.02, name: 'Magnesium oxide: a giant ionic lattice' } };
async function showLattice(pr, run) {
  const L = LAT[pr.formula];
  if (!L) { await wait(1.6); return; }
  while (latticeG.children.length > 1) latticeG.remove(latticeG.children[1]);
  const sp = 0.048, n = 3, pts = { cat: [], an: [] };
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) ((x + y + z) % 2 ? pts.an : pts.cat).push(new THREE.Vector3(x - 1, y - 1, z - 1).multiplyScalar(sp));
  const sph = new THREE.SphereGeometry(1, 20, 14);
  const ims = ['cat', 'an'].map((k) => { const im = new THREE.InstancedMesh(sph, mat(L[k], { roughness: 0.3 }), pts[k].length); latticeG.add(im); return [k, im]; });
  // bonds as thin rods between neighbours
  const rods = [];
  for (const a of pts.cat) for (const b of pts.an) if (a.distanceTo(b) < sp * 1.01) rods.push([a, b]);
  const rodIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6), mat(0x8d969e, { roughness: 0.5 }), rods.length);
  latticeG.add(rodIm);
  const starts = { cat: pts.cat.map(() => new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.2) * 0.3)), an: pts.an.map(() => new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.4, (Math.random() - 0.2) * 0.3)) };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const place = (k) => {
    for (const [key, im] of ims) pts[key].forEach((p, i) => { v.lerpVectors(starts[key][i], p, k); const r = L[key === 'cat' ? 'rc' : 'ra']; im.setMatrixAt(i, m.compose(v, q.identity(), new THREE.Vector3(r, r, r))); im.instanceMatrix.needsUpdate = true; });
    rods.forEach(([a, b], i) => { const len = a.distanceTo(b) * Math.max(0.001, k * k); v.addVectors(a, b).multiplyScalar(0.5); q.setFromUnitVectors(up, b.clone().sub(a).normalize()); rodIm.setMatrixAt(i, m.compose(v, q, new THREE.Vector3(1, len, 1))); });
    rodIm.instanceMatrix.needsUpdate = true;
  };
  place(0);
  latLabel.userData.draw(L.name, '#1f2b35');
  pairG.visible = false; latticeG.visible = true; latticeG.rotation.set(0.35, 0.5, 0);
  sfx.tone(330, 0.5, 'sine', 0.1, 660);
  await tween(1.3, (k) => { place(1 - Math.pow(1 - k, 3)); latticeG.rotation.y = 0.5 + k * 0.6; });
  kit.sparkle(latticeG.getWorldPosition(new THREE.Vector3()), 24, 0xbfe3ff);
  await tween(1.8, (k) => { latticeG.rotation.y = 1.1 + k * 0.9; });
  latticeG.visible = false; pairG.visible = true;
}

// ================================================================= level 3: what particle is this?
const QUIZ3 = [
  { p: 6, n: 6, e: 6, a: 'Carbon-12 atom', opts: ['Carbon-12 atom', 'Carbon-14 atom', 'Nitrogen-12 atom'], why: '6 protons make it carbon; 6 + 6 = mass number 12.' },
  { p: 6, n: 8, e: 6, a: 'Carbon-14 atom', opts: ['Carbon-14 atom', 'Nitrogen-14 atom', 'Oxygen-14 atom'], why: 'Still 6 protons, so still carbon. Two extra neutrons make the isotope carbon-14.' },
  { p: 11, n: 12, e: 10, a: 'Sodium ion, Na⁺', opts: ['Sodium atom, Na', 'Sodium ion, Na⁺', 'Neon atom, Ne'], why: '11 protons is sodium. One fewer electron than protons gives a charge of +1.' },
  { p: 17, n: 18, e: 18, a: 'Chloride ion, Cl⁻', opts: ['Chlorine atom, Cl', 'Argon atom, Ar', 'Chloride ion, Cl⁻'], why: '17 protons is chlorine. One extra electron gives a charge of −1.' },
  { p: 8, n: 8, e: 10, a: 'Oxide ion, O²⁻', opts: ['Oxide ion, O²⁻', 'Neon atom, Ne', 'Oxygen atom, O'], why: '8 protons is oxygen. Two extra electrons give a charge of −2.' },
  { p: 10, n: 10, e: 10, a: 'Neon atom, Ne', opts: ['Sodium ion, Na⁺', 'Neon atom, Ne', 'Oxide ion, O²⁻'], why: 'Na⁺, Ne and O²⁻ all have electrons 2, 8. Only the protons tell them apart: 10 protons is neon.' },
];
const L3 = { order: [], i: 0, tries: 0, busy: false };
function l3Load() {
  const q = QUIZ3[L3.order[L3.i]];
  main.build({ p: q.p, n: q.n, e: arrangement(q.e), sym: '?' });
  drawInfo({ title: 'Mystery particle' });
  setRow(kit.shuffle(q.opts).map((o) => ({ text: o, act: () => l3Pick(o), name: o })));
  board.draw({
    heading: 'Level 3: What particle is this?', level: `Particle ${L3.i + 1} of ${QUIZ3.length}`, big: true,
    body: ['Read the counts on the left. Use the periodic table on your right.', 'Is it an atom, an ion or an isotope? Choose the answer on the buttons.'],
    items: [{ text: 'Protons decide the element.', state: 'todo' }, { text: 'Electrons different from protons: it is an ion.', state: 'todo' }, { text: 'Same protons, different neutrons: isotopes.', state: 'todo' }],
    footer: '10 points first time, 3 after a wrong try.',
  });
}
async function l3Pick(o) {
  if (L3.busy || mode.kind !== 'quiz') return;
  const q = QUIZ3[L3.order[L3.i]];
  if (o === q.a) {
    const run = kit.newRun();
    L3.busy = true;
    score.add(L3.tries ? 3 : 10, main.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)));
    main.sym.userData.draw(q.a.split(', ')[1] || q.a.split(' ')[0], null);
    say(`Correct. ${q.why}`, 'good', 5);
    await wait(2.8);
    if (!kit.isRun(run)) return;
    L3.i++; L3.tries = 0; L3.busy = false;
    if (L3.i >= QUIZ3.length) { mode.kind = 'done'; setRow([]); flow.complete(['Protons tell you the element. Electrons tell you the charge. Neutrons tell you the isotope.']); return; }
    l3Load();
  } else {
    L3.tries++; score.streak = 0;
    say(`Not ${o.split(',')[0].toLowerCase()}. Count the protons first, then compare electrons with protons.`, 'bad');
  }
}
function l3Start() {
  mode.kind = 'quiz'; binsShow(false);
  showMain(true); showPair(false);
  L3.order = kit.shuffle(QUIZ3.map((_, i) => i)); L3.i = 0; L3.tries = 0; L3.busy = false;
  l3Load();
}

function binsShow(v) { if (kit.carry.item && kit.carry.item.userData.token) kit.returnHome(kit.carry.item); for (const k in tokens) tokens[k].parent.visible = v; }
function showMain(v) { main.group.visible = v; main.group.rotation.z = 0; infoG.visible = v; }
function showPair(v) { pairG.visible = v; latticeG.visible = false; if (!v) clearPair(); }

// ================================================================= levels
const flow = kit.levelFlow({
  key: 'form3-atoms',
  board,
  intro: {
    heading: 'Atom Forge: atoms, ions and bonds',
    body: ['Atoms are built from **protons** and **neutrons** in the nucleus, with **electrons** in shells around it.',
      'Build atoms from their symbols, move electrons to make ions and ionic bonds, then identify mystery particles.',
      'Choose a level on the panel to your left to begin.'],
    footer: 'Form 3 Integrated Science: atomic structure, electron arrangement and ionic bonding.',
  },
  levels: [
    { title: 'Build the atom', short: 'Build it', max: 100, start: l1Start, stop: () => { if (heldToken()) kit.returnHome(kit.carry.item); } },
    { title: 'Make ions, make a bond', short: 'Bond it', max: 80, start: l2Start, stop: () => { if (kit.carry.item) kit.returnHome(kit.carry.item); } },
    { title: 'What particle is this?', short: 'Name it', max: 60, start: l3Start },
  ],
});
main.build({ p: 11, n: 12, e: [2, 8, 1], sym: 'Na' });
drawInfo({ title: 'Sodium atom' });
setRow([]);
flow.showIntro();
kit.onKind(() => { if (mode.kind === 'build') l1Draw(); else if (mode.kind === 'bond') l2Draw(); });
kit.start();

window.game = { kit, flow, main, mode, L1, L2, L3, PAIRS, QUIZ3, board, rowBtns, rowBtn, el, arrangement, l2Load, tokens, nucHit, latticeG, speed: 1 };
