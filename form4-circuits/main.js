// Circuit Workshop: Electricity (Form 4 Integrated Science, Electricity: series and parallel circuits,
// ammeters and voltmeters, Ohm's law, domestic electricity: plug wiring, fuses, kilowatt-hours).
// Built on shared/game-kit.js. A small nodal-analysis solver works out every current and voltage.
import { createGame, THREE, howTo } from '../shared/game-kit.js';

const kit = createGame({ title: 'Circuit Workshop' });
const { scene, mesh, lam, mat, basic, label, button, tween, wait, sfx, say, score, noHit } = kit;
kit.buildRoom({ sign: 'CIRCUIT WORKSHOP  ·  FORM 4', accent: 0x7d6608, signBg: '#5d4a06', wall: 0xf2efe6 });
const TABLE_Y = 0.8;
kit.table({ w: 1.4, d: 0.65, z: -0.6 });
const board = kit.board({ w: 1.6, h: 0.9 });
board.group.position.set(0, 1.72, -1.55);
scene.add(board.group);
kit.setToastAnchor(new THREE.Vector3(0, 1.22, -1.45));

// ================================================================= the circuit board
const cb = new THREE.Group();
cb.position.set(0.04, TABLE_Y + 0.2, -0.67);
cb.rotation.x = -0.62;
cb.scale.setScalar(1.22);
scene.add(cb);
{
  const c = kit.canvasPlane(0.74, 0.44, 900);
  const { ctx, c: cv } = c;
  ctx.fillStyle = '#1f5f3a'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2;
  for (let x = 0; x < cv.width; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cv.height); ctx.stroke(); }
  for (let y = 0; y < cv.height; y += 22) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cv.width, y); ctx.stroke(); }
  c.update();
  cb.add(mesh(new THREE.BoxGeometry(0.76, 0.46, 0.02), lam(0x3b2a1a), 0, 0, -0.011), c.mesh);
  // legs so the board stands on the table
  cb.add(mesh(new THREE.BoxGeometry(0.6, 0.2, 0.02), lam(0x3b2a1a), 0, -0.05, -0.12).rotateX(0.62));
  noHit(cb);
}
const circuitG = new THREE.Group(); cb.add(circuitG);

// ---------------------------------------------------------------- symbols drawn on canvases
function drawSymbol(ctx, W, H, type, text = '') {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fdfdf8'; kit.roundRect(ctx, 3, 3, W - 6, H - 6, 16); ctx.fill();
  ctx.strokeStyle = '#13293d'; ctx.fillStyle = '#13293d'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const cy = H * 0.42, cx = W / 2;
  const lead = (x1, x2) => { ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke(); };
  if (type === 'resistor' || type === 'unknown') {
    lead(18, cx - 60); lead(cx + 60, W - 18); ctx.strokeRect(cx - 60, cy - 22, 120, 44);
  } else if (type === 'bulb') {
    lead(18, cx - 30); lead(cx + 30, W - 18);
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 21, cy - 21); ctx.lineTo(cx + 21, cy + 21); ctx.moveTo(cx + 21, cy - 21); ctx.lineTo(cx - 21, cy + 21); ctx.stroke();
  } else if (type === 'ammeter' || type === 'voltmeter') {
    lead(18, cx - 32); lead(cx + 32, W - 18);
    ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI * 2); ctx.stroke();
    ctx.font = 'bold 42px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type === 'ammeter' ? 'A' : 'V', cx, cy + 2);
  } else if (type === 'switch') {
    lead(18, cx - 40); lead(cx + 40, W - 18);
    ctx.beginPath(); ctx.arc(cx - 40, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(cx + 40, cy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 40, cy); ctx.lineTo(cx + 36, text === 'closed' ? cy : cy - 38); ctx.stroke();
  } else if (type === 'wire') {
    lead(18, W - 18);
  } else if (type === 'cell') {
    lead(18, cx - 12); lead(cx + 12, W - 18);
    ctx.beginPath(); ctx.moveTo(cx - 12, cy - 40); ctx.lineTo(cx - 12, cy + 40); ctx.stroke();
    ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cx + 12, cy - 22); ctx.lineTo(cx + 12, cy + 22); ctx.stroke();
  }
  if (text && type !== 'switch') { ctx.font = 'bold 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(text, cx, H - 16); }
}
const PIECE_W = 0.13, PIECE_H = 0.058;
// a soft round glow for lit bulbs
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,240,180,0.6)'); g.addColorStop(1, 'rgba(255,220,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const COLORS = { resistor: 0xc8a165, unknown: 0x8e7cc3, bulb: 0xe8e0c0, ammeter: 0x5d8aa8, voltmeter: 0xa86b5d, switch: 0x7b8a97, wire: 0xb87333, cell: 0x3d3d3d };
function pieceMesh(type, value = null) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(PIECE_W, PIECE_H, 0.016), lam(COLORS[type]), 0, 0, -0.008));
  const c = kit.canvasPlane(PIECE_W - 0.004, PIECE_H - 0.004, 2600);
  c.mesh.position.z = 0.0005;
  g.add(c.mesh);
  g.userData.type = type; g.userData.value = value; g.userData.canvas = c;
  const text = type === 'resistor' ? `${value} Ω` : type === 'unknown' ? 'X' : type === 'cell' ? `${value} V` : type === 'bulb' ? '6 V bulb' : type === 'switch' ? 'open' : '';
  g.userData.text = text;
  drawSymbol(c.ctx, c.c.width, c.c.height, type, text); c.update();
  if (type === 'bulb') {
    const glass = new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0x000000, transparent: true, opacity: 0.85, roughness: 0.2 });
    const bulb = mesh(new THREE.SphereGeometry(0.017, 18, 12), glass, 0, 0.004, 0.022);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(0.2, 0.2, 1); halo.position.copy(bulb.position); halo.userData.noHit = true;
    g.add(bulb, halo); g.userData.glass = glass; g.userData.halo = halo;
  }
  if (type === 'switch') g.userData.closed = false;
  return g;
}
function setReading(p, txt) {
  const c = p.userData.canvas; const { ctx, c: cv } = c;
  drawSymbol(ctx, cv.width, cv.height, p.userData.type, '');
  if (txt) {
    ctx.fillStyle = '#0b1f10'; kit.roundRect(ctx, cv.width / 2 - 95, cv.height - 56, 190, 50, 10); ctx.fill();
    ctx.fillStyle = '#7dff9a'; ctx.font = 'bold 36px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, cv.width / 2, cv.height - 30);
  }
  c.update();
}
function setSwitch(p, closed) {
  p.userData.closed = closed;
  const c = p.userData.canvas; drawSymbol(c.ctx, c.c.width, c.c.height, 'switch', closed ? 'closed' : 'open'); c.update();
}

// ---------------------------------------------------------------- circuit model
// A circuit: nodes [x, y] on the board, and edges { a, b, fixed?: piece spec, slot?: true }.
// A cell edge goes from its negative terminal a to its positive terminal b.
let circ = null;
const studMat = mat(0xd4a017, { metalness: 0.6, roughness: 0.35 });
const copper = lam(0xb87333);
function wireBetween(p1, p2, w = 0.006) {
  const d = new THREE.Vector3().subVectors(p2, p1); const len = d.length();
  const m = mesh(new THREE.BoxGeometry(len + w, w, 0.004), copper);
  m.position.copy(p1).add(p2).multiplyScalar(0.5); m.position.z = 0.002;
  m.rotation.z = Math.atan2(d.y, d.x);
  return m;
}
function buildCircuit(def) {
  // clear the old one
  if (circ) {
    for (const e of circ.edges) {
      if (e.slotObj) { if (e.piece) { kit.returnHome(e.piece); e.piece.userData.inEdge = null; } kit.uninteractive(e.slotObj); }
      if (e.fixedObj) kit.uninteractive(e.fixedObj);
    }
  }
  circuitG.clear();
  circ = { def, nodes: def.nodes.map(([x, y]) => new THREE.Vector3(x, y, 0)), edges: [] };
  circ.nodes.forEach((n) => circuitG.add(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 14), studMat, n.x, n.y, 0.004).rotateX(Math.PI / 2)));
  def.edges.forEach((ed, i) => {
    const A = circ.nodes[ed.a], B = circ.nodes[ed.b];
    const e = { ...ed, i, A, B, piece: null };
    const dir = new THREE.Vector3().subVectors(B, A); const len = dir.length(); dir.normalize();
    const mid = A.clone().add(B).multiplyScalar(0.5);
    e.mid = mid; e.angle = Math.atan2(dir.y, dir.x);
    if (ed.kind === 'wire' || (!ed.slot && !ed.fixed)) { circuitG.add(wireBetween(A, B)); e.fixed = { type: 'wire' }; }
    else {
      // wire stubs from the studs to the part
      const half = PIECE_W / 2;
      if (len / 2 > half) {
        circuitG.add(wireBetween(A, mid.clone().addScaledVector(dir, -half)));
        circuitG.add(wireBetween(mid.clone().addScaledVector(dir, half), B));
      }
      if (ed.fixed) {
        const p = pieceMesh(ed.fixed.type, ed.fixed.value);
        p.position.set(mid.x, mid.y, 0.009); p.rotation.z = e.angle + (ed.flip ? Math.PI : 0);
        circuitG.add(p); e.fixedObj = p;
        kit.interactive(p, { name: ed.fixed.name || pieceName(ed.fixed.type, ed.fixed.value), near: false, onSelect: () => {} });
      } else {
        // an empty slot: a dashed outline that glows
        const s = new THREE.Group(); s.position.set(mid.x, mid.y, 0.006); s.rotation.z = e.angle;
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(PIECE_W + 0.008, PIECE_H + 0.008)), new THREE.LineBasicMaterial({ color: 0xffd34d }));
        const pad = mesh(new THREE.PlaneGeometry(PIECE_W + 0.008, PIECE_H + 0.008), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.18, depthWrite: false }));
        outline.userData.noHit = true; outline.raycast = () => {};
        s.add(outline, pad);
        circuitG.add(s); e.slotObj = s; s.userData.edge = e; s.userData.pad = pad;
        kit.slot(s, {
          name: ed.slotName || 'Empty gap in the circuit', reach: 0.05,
          enabled: () => mode.kind === 'circuit' && !!kit.carry.item,
          accept: (item) => (item.userData.pieceType ? true : false),
          onPlace: (item) => placePiece(item, e),
        });
      }
    }
    circ.edges.push(e);
  });
  solve();
}
function pieceName(type, value) {
  return { resistor: `${value} Ω resistor`, unknown: 'Resistor X', bulb: 'Bulb', ammeter: 'Ammeter', voltmeter: 'Voltmeter', switch: 'Switch', wire: 'Connecting wire', cell: `${value} V cell` }[type];
}
async function placePiece(item, e) {
  if (e.piece && e.piece !== item) {
    const old = e.piece; old.userData.inEdge = null; old.userData.slotProxy = null; e.piece = null;
    if (old.userData.pieceType === 'ammeter' || old.userData.pieceType === 'voltmeter') setReading(old, '');
    if (old.userData.pieceType === 'switch') setSwitch(old, false);
    kit.returnHome(old);
  }
  e.piece = item; item.userData.inEdge = e; item.userData.slotProxy = e.slotObj;
  e.slotObj.userData.pad.material.opacity = 0;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, e.angle));
  kit.settle(item, circuitG, new THREE.Vector3(e.mid.x, e.mid.y, 0.009), q, new THREE.Vector3(1, 1, 1), 0.2).then(() => solve());
  solve();
}
function unplace(item) {
  const e = item.userData.inEdge; if (!e) return;
  e.piece = null; item.userData.inEdge = null; item.userData.slotProxy = null;
  if (e.slotObj) e.slotObj.userData.pad.material.opacity = 0.18;
  if (item.userData.pieceType === 'ammeter' || item.userData.pieceType === 'voltmeter') setReading(item, '');
  solve();
}

// ---------------------------------------------------------------- solver (nodal analysis)
const R_WIRE = 0.001, R_CELL = 0.001, R_VOLT = 1e6;
let result = { V: [], I: [], cellI: 0, short: false };
function compOf(e) {
  if (e.fixed) return e.fixed;
  if (e.piece) return { type: e.piece.userData.pieceType, value: e.piece.userData.value, closed: e.piece.userData.closed, obj: e.piece };
  return null;
}
function conductance(c) {
  switch (c.type) {
    case 'wire': case 'ammeter': return 1 / R_WIRE;
    case 'switch': return c.closed ? 1 / R_WIRE : 0;
    case 'voltmeter': return 1 / R_VOLT;
    case 'resistor': case 'unknown': return 1 / c.value;
    case 'bulb': return 1 / 6;
    case 'cell': return 1 / R_CELL;
    default: return 0;
  }
}
function solve() {
  if (!circ) return;
  const n = circ.nodes.length;
  const G = Array.from({ length: n }, () => new Float64Array(n)); const J = new Float64Array(n);
  for (const e of circ.edges) {
    const c = compOf(e); if (!c) continue;
    const g = conductance(c); if (!g) continue;
    G[e.a][e.a] += g; G[e.b][e.b] += g; G[e.a][e.b] -= g; G[e.b][e.a] -= g;
    if (c.type === 'cell') { const isrc = c.value / R_CELL; J[e.b] += isrc; J[e.a] -= isrc; }
  }
  for (let i = 0; i < n; i++) G[i][i] += 1e-9;
  // ground node 0, solve the rest by Gaussian elimination
  const m = n - 1; const A = []; const bvec = [];
  for (let i = 1; i < n; i++) { A.push(Array.from(G[i]).slice(1)); bvec.push(J[i]); }
  for (let col = 0; col < m; col++) {
    let piv = col; for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]]; [bvec[col], bvec[piv]] = [bvec[piv], bvec[col]];
    for (let r = col + 1; r < m; r++) { const f = A[r][col] / A[col][col]; if (!f) continue; for (let k = col; k < m; k++) A[r][k] -= f * A[col][k]; bvec[r] -= f * bvec[col]; }
  }
  const x = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) { let s = bvec[r]; for (let k = r + 1; k < m; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  const V = [0, ...x];
  const I = circ.edges.map((e) => {
    const c = compOf(e); if (!c) return 0;
    const g = conductance(c);
    if (c.type === 'cell') return (c.value - (V[e.b] - V[e.a])) / R_CELL;
    return (V[e.a] - V[e.b]) * g;
  });
  let cellI = 0;
  circ.edges.forEach((e, i) => { const c = compOf(e); if (c && c.type === 'cell') cellI = Math.max(cellI, Math.abs(I[i])); });
  result = { V, I, cellI, short: cellI > 20 };
  // show it
  circ.edges.forEach((e, i) => {
    const c = compOf(e); if (!c) return;
    const obj = c.obj || e.fixedObj; if (!obj) return;
    const t = c.type;
    if (t === 'ammeter') setReading(obj, result.short ? 'ERR' : `${Math.abs(I[i]).toFixed(2)} A`);
    if (t === 'voltmeter') setReading(obj, `${Math.abs(V[e.a] - V[e.b]).toFixed(2)} V`);
    if (t === 'bulb') {
      const p = I[i] * I[i] * 6; const k = THREE.MathUtils.clamp(p / 6, 0, 1.3);
      obj.userData.glass.emissive.setRGB(1 * k, 0.8 * k, 0.3 * k);
      obj.userData.halo.material.opacity = Math.min(0.9, k * 0.8);
      obj.userData.lit = k > 0.15; obj.userData.bright = k;
    }
  });
  shortWarn(result.short);
  levelCheck();
}
let shortShown = false;
function shortWarn(on) {
  if (on && !shortShown) { say('Short circuit! A huge current flows through the easy path and the cell overheats. Take a part out.', 'bad', 5); sfx.tone(90, 0.5, 'sawtooth', 0.08); }
  shortShown = on;
}
const edgeCur = (k) => { const i = circ.edges.findIndex((e) => e.id === k); return i >= 0 ? Math.abs(result.I[i]) : 0; };
const edgeVolt = (k) => { const e = circ.edges.find((x) => x.id === k); return e ? Math.abs(result.V[e.a] - result.V[e.b]) : 0; };
const bulbsLit = () => circ.edges.map(compOf).filter((c) => c && c.type === 'bulb').map((c) => (c.obj || circ.edges.find((e) => e.fixed === c)?.fixedObj)?.userData.lit);
const inEdge = (id) => { const e = circ.edges.find((x) => x.id === id); const c = e && compOf(e); return c ? c.type : null; };

// ---------------------------------------------------------------- the parts tray
const tray = new THREE.Group(); scene.add(tray);
tray.add(noHit(mesh(new THREE.BoxGeometry(0.98, 0.012, 0.11), lam(0x5b4a3a), 0.05, TABLE_Y + 0.006, -0.42)));
const pieces = [];
function makePiece(type, value = null) {
  const p = pieceMesh(type, value);
  p.userData.pieceType = type;
  p.rotation.x = -Math.PI / 2 + 0.35;
  tray.add(p);
  pieces.push(p);
  kit.carryable(p, {
    name: pieceName(type, value),
    canPick: () => mode.kind === 'circuit' && !(type === 'switch' && p.userData.inEdge),
    enabled: () => mode.kind === 'circuit' && p.visible,
    onSelect: () => { if (type === 'switch' && p.userData.inEdge) { setSwitch(p, !p.userData.closed); sfx.click(); solve(); } },
    onPick: () => unplace(p),
    holdOffset: new THREE.Vector3(0, 0.03, -0.01),
  });
  return p;
}
function setTray(list) {
  for (const p of pieces) { if (p.userData.inEdge) unplace(p); kit.uninteractive(p); p.parent?.remove(p); }
  pieces.length = 0;
  list.forEach((spec, i) => {
    const p = makePiece(spec[0], spec[1]);
    p.position.set(0.05 + (i - (list.length - 1) / 2) * 0.145, TABLE_Y + 0.03, -0.42);
    kit.storeHome(p);
    if (spec[0] === 'switch') setSwitch(p, false);
  });
}

// ---------------------------------------------------------------- the button row (answers and tools)
const row = new THREE.Group();
row.position.set(0.05, TABLE_Y + 0.045, -0.31); row.rotation.x = -1.0;
scene.add(row);
const rowBack = noHit(mesh(new THREE.BoxGeometry(0.8, 0.075, 0.02), lam(0x2a3a48), 0, 0, -0.02)); row.add(rowBack);
const rowBtns = [];
function setRow(defs) {
  rowBtns.forEach((b) => { b.visible = false; });
  const w = defs.length > 4 ? 0.13 : 0.18; const step = w + 0.014;
  defs.forEach((d, i) => {
    let b = rowBtns.find((x) => !x.visible && x.userData.w === w);
    if (!b) { b = button('', w, 0.06, { font: 'bold 26px system-ui, sans-serif' }); b.userData.w = w; row.add(b); rowBtns.push(b); kit.interactive(b, { name: '', onSelect: () => b.userData.act?.(), enabled: () => b.visible }); }
    b.userData.act = d.act; b.userData.key = d.key || d.text; b.userData.interactive.name = d.name || d.text;
    b.userData.draw(d.text, d.color || '#1f6fb2');
    b.position.set((i - (defs.length - 1) / 2) * step, 0, 0); b.visible = true;
  });
  row.visible = defs.length > 0;
}
const rowBtn = (k) => rowBtns.find((b) => b.visible && b.userData.key === k);
const clearBtn = { text: 'Clear board', act: () => { for (const p of pieces) if (p.userData.inEdge) { unplace(p); kit.returnHome(p); } }, color: '#7b8a97', name: 'Take every part off the board' };

// ================================================================= circuits for each task
const LOOP = (top, right, bottom = 'wire') => ({
  nodes: [[-0.27, -0.14], [-0.27, 0.14], [0.27, 0.14], [0.27, -0.14]],
  edges: [
    { a: 0, b: 1, fixed: { type: 'cell', value: 6 }, id: 'cell' },
    { a: 1, b: 2, id: 'top', ...top },
    { a: 2, b: 3, id: 'right', ...right },
    { a: 3, b: 0, id: 'bottom', ...(bottom === 'wire' ? { kind: 'wire' } : bottom) },
  ],
});
const SERIES3 = {
  nodes: [[-0.27, -0.14], [-0.27, 0.14], [0.0, 0.14], [0.27, 0.14], [0.27, -0.14]],
  edges: [
    { a: 0, b: 1, fixed: { type: 'cell', value: 6 }, id: 'cell' },
    { a: 1, b: 2, slot: true, id: 's1' }, { a: 2, b: 3, slot: true, id: 's2' },
    { a: 3, b: 4, slot: true, id: 's3' }, { a: 4, b: 0, kind: 'wire' },
  ],
};
const PARALLEL = (topFixed = null) => ({
  nodes: [[-0.3, -0.15], [-0.3, 0.15], [-0.06, 0.15], [0.3, 0.15], [-0.06, -0.15], [0.3, -0.15], [0.12, 0.15], [0.12, -0.15]],
  edges: [
    { a: 0, b: 1, fixed: { type: 'cell', value: 6 }, id: 'cell' },
    topFixed ? { a: 1, b: 2, fixed: topFixed, id: 'main' } : { a: 1, b: 2, slot: true, id: 'main' },
    { a: 2, b: 6, kind: 'wire' }, { a: 6, b: 3, kind: 'wire' },
    { a: 2, b: 4, slot: true, id: 'b1' },
    { a: 3, b: 5, slot: true, id: 'b2' },
    { a: 5, b: 7, kind: 'wire' }, { a: 7, b: 4, kind: 'wire' }, { a: 4, b: 0, kind: 'wire' },
  ],
});
const MEASURE = (fixedR = null) => ({
  nodes: [[-0.3, -0.15], [-0.3, 0.15], [0.12, 0.15], [0.12, -0.15], [0.3, 0.15], [0.3, -0.15]],
  edges: [
    { a: 0, b: 1, fixed: { type: 'cell', value: 6 }, id: 'cell' },
    fixedR ? { a: 1, b: 2, fixed: { type: 'ammeter' }, id: 'amm' } : { a: 1, b: 2, slot: true, id: 'amm' },
    fixedR ? { a: 2, b: 3, fixed: fixedR, id: 'load' } : { a: 2, b: 3, fixed: { type: 'bulb' }, id: 'load' },
    { a: 3, b: 0, kind: 'wire' },
    { a: 2, b: 4, kind: 'wire' },
    fixedR ? { a: 4, b: 5, fixed: { type: 'voltmeter' }, id: 'vm' } : { a: 4, b: 5, slot: true, id: 'vm' },
    { a: 5, b: 3, kind: 'wire' },
  ],
});
const TARGET_SERIES = {
  nodes: [[-0.3, -0.15], [-0.3, 0.15], [-0.04, 0.15], [0.3, 0.15], [0.3, -0.15]],
  edges: [
    { a: 0, b: 1, fixed: { type: 'cell', value: 6 }, id: 'cell' },
    { a: 1, b: 2, fixed: { type: 'ammeter' }, id: 'amm' },
    { a: 2, b: 3, slot: true, id: 's1' }, { a: 3, b: 4, slot: true, id: 's2' }, { a: 4, b: 0, kind: 'wire' },
  ],
};

// ================================================================= level flow
const mode = { kind: 'idle' };
const task = { list: [], i: 0, state: {}, done: false, tries: 0 };
let checkPending = false;
function levelCheck() {
  if (mode.kind !== 'circuit' || task.done || checkPending) return;
  const t = task.list[task.i]; if (!t || !t.check) return;
  checkPending = true;
  // wait a moment so a part that has just landed is shown before we judge
  setTimeout(() => {
    checkPending = false;
    if (mode.kind !== 'circuit' || task.done || task.list[task.i] !== t) return;
    const r = t.check(task.state);
    if (r === true) taskDone(t);
    else if (typeof r === 'string') { drawTask(r); }
  }, 250);
}
async function taskDone(t) {
  task.done = true;
  const run = kit.newRun();
  const pts = t.points ?? 20;
  score.add(pts, cb.localToWorld(new THREE.Vector3(0, 0.2, 0.05)));
  kit.burst(cb.localToWorld(new THREE.Vector3(0, 0.1, 0.05)), 30);
  say(t.success, 'good', 6);
  drawTask(`**Done.** ${t.success}`, 'good');
  await wait(3.2);
  if (!kit.isRun(run)) return;
  nextTask();
}
function nextTask() {
  task.i++;
  if (task.i >= task.list.length) { mode.kind = 'done'; setRow([]); flow.complete(task.endNotes || []); return; }
  loadTask();
}
function loadTask() {
  const t = task.list[task.i];
  task.done = false; task.state = {}; task.tries = 0;
  mode.kind = t.kind || 'circuit';
  if (t.circuit) { buildCircuit(t.circuit()); cb.visible = true; } else cb.visible = false;
  setTray(t.parts || []);
  tray.visible = !!(t.parts && t.parts.length);
  setRow(t.row ? t.row() : (t.parts ? [clearBtn] : []));
  t.setup?.();
  drawTask();
  solve();
}
function drawTask(extra = '', tone = 'info') {
  const t = task.list[task.i]; if (!t) return;
  const w = howTo(kit.kind);
  board.draw({
    heading: `${task.title}: ${t.title}`, level: `Task ${task.i + 1} of ${task.list.length}`, tone,
    body: [...[].concat(typeof t.body === 'function' ? t.body(w) : t.body), extra],
    footer: t.footer || `Pick up a part (${w.pick}) and put it in a glowing gap (${w.place}). ${w.choose[0].toUpperCase() + w.choose.slice(1)} a switch on the board to flip it.`,
  });
}

// ---------------------------------------------------------------- level 1: make it work
const L1_TASKS = [
  {
    title: 'Light the bulb', circuit: () => LOOP({ slot: true, slotName: 'Gap at the top' }, { slot: true, slotName: 'Gap on the right' }),
    parts: [['bulb'], ['switch'], ['resistor', 1000]],
    body: ['The circuit has a **6 V cell** and two gaps. Fill them with a **bulb** and a **switch**, then close the switch to light the bulb.', 'Then open the switch again to turn it off.'],
    check: (s) => {
      const lit = bulbsLit().some(Boolean);
      const hasSwitch = ['top', 'right'].some((k) => inEdge(k) === 'switch');
      if (lit && hasSwitch) s.wasLit = true;
      if (s.wasLit && hasSwitch && !lit && inEdge('top') && inEdge('right')) return true;
      if (inEdge('top') === 'resistor' || inEdge('right') === 'resistor') return 'The 1000 Ω resistor lets almost no current through, so the bulb stays dark. Swap it for the switch.';
      if (s.wasLit) return 'The bulb is lit! Now open the switch to turn it off.';
      return null;
    },
    success: 'A switch breaks the circuit. With no complete path, no current flows and the bulb goes out.',
  },
  {
    title: 'Bulbs in series', circuit: () => SERIES3,
    parts: [['bulb'], ['bulb'], ['wire']],
    body: ['Put **two bulbs and a wire** in the three gaps so both bulbs light. They share one path: this is a **series** circuit.', 'Then take one bulb out and watch the other.'],
    check: (s) => {
      const lit = bulbsLit();
      if (lit.length === 2 && lit.every(Boolean)) { s.both = true; return 'Both bulbs are lit, but dimmer than one bulb alone. Now pick one bulb up and take it out.'; }
      if (s.both && lit.length === 1 && !lit[0]) return true;
      return null;
    },
    success: 'In series there is only one path. Take one bulb out and the whole circuit is broken, so the other bulb goes out too.',
  },
  {
    title: 'Bulbs in parallel', circuit: () => PARALLEL(),
    parts: [['bulb'], ['bulb'], ['wire']],
    body: ['Now each bulb has **its own branch**: this is a **parallel** circuit. Fill the gaps so both bulbs light brightly.', 'Then take one bulb out and watch the other.'],
    check: (s) => {
      const lit = bulbsLit();
      if (lit.length === 2 && lit.every(Boolean) && inEdge('main') === 'wire') { s.both = true; return 'Both bulbs are bright. Now take one bulb out.'; }
      if (s.both && lit.length === 1 && lit[0]) return true;
      if (inEdge('main') === 'bulb') return 'A bulb in the main wire is in series with everything. Put the wire there, and bulbs in the two branches.';
      return null;
    },
    success: 'In parallel each bulb has its own path, so one bulb keeps shining when the other is removed. Houses are wired in parallel.',
  },
  {
    title: 'Measure current and voltage', circuit: () => MEASURE(),
    parts: [['ammeter'], ['voltmeter']],
    body: ['Measure the current through the bulb and the voltage across it.', 'An **ammeter** goes **in series** (in the main path). A **voltmeter** goes **in parallel** (across the bulb).'],
    check: () => {
      if (inEdge('amm') === 'voltmeter') return 'The voltmeter is in series: it has a huge resistance, so almost no current flows and the bulb stays dark. Swap the meters.';
      if (inEdge('vm') === 'ammeter' && inEdge('amm')) return 'The ammeter is across the bulb: it has almost no resistance, so the current skips the bulb. Swap the meters.';
      if (inEdge('amm') === 'ammeter' && inEdge('vm') === 'voltmeter') return true;
      return null;
    },
    success: 'Ammeter in series, voltmeter in parallel. The bulb takes about 1 A at 6 V.',
  },
];
// ---------------------------------------------------------------- level 2: Ohm's law
const L2_TASKS = [
  {
    title: 'Find the resistance', kind: 'answer',
    circuit: () => MEASURE({ type: 'unknown', value: task.xValue, name: 'Resistor X (unknown)' }),
    setup: () => {},
    body: ['Read the **ammeter** and the **voltmeter**. What is the resistance of **X**?', 'Use **R = V ÷ I**.'],
    row: () => {
      const v = task.xValue; const opts = kit.shuffle([v, ...[2, 3, 4, 6, 12, 1.5, 8].filter((x) => x !== v).slice(0, 2)]);
      return opts.map((o) => ({ text: `${o} Ω`, act: () => answerX(o) }));
    },
    footer: 'Choose your answer on the buttons in front of you.',
  },
  {
    title: 'Hit the target current', circuit: () => TARGET_SERIES,
    parts: [['resistor', 2], ['resistor', 4], ['resistor', 12], ['wire']],
    body: ['Make the ammeter read **1.00 A** using the 6 V cell. Fill **both** gaps.', 'Work it out first: R = V ÷ I = 6 ÷ 1 = ? Ω. Resistors in series add up.'],
    check: () => {
      if (!inEdge('s1') || !inEdge('s2')) return null;
      const I = edgeCur('amm');
      if (Math.abs(I - 1) < 0.03) return true;
      return `The ammeter reads ${I.toFixed(2)} A. ${I > 1 ? 'Too much current: you need more resistance.' : 'Too little current: you need less resistance.'}`;
    },
    success: '2 Ω + 4 Ω = 6 Ω in series, and 6 V ÷ 6 Ω = 1 A.',
  },
  {
    title: 'Parallel puzzle', circuit: () => PARALLEL({ type: 'ammeter' }),
    parts: [['resistor', 2], ['resistor', 4], ['resistor', 6], ['resistor', 12]],
    body: ['Put a resistor in **each branch** so the ammeter reads **2.50 A**.', 'In parallel, each branch gets the full 6 V. Add the branch currents: I = 6 ÷ R₁ + 6 ÷ R₂.'],
    check: () => {
      if (!inEdge('b1') || !inEdge('b2')) return null;
      const I = edgeCur('main');
      if (Math.abs(I - 2.5) < 0.04) return true;
      return `The ammeter reads ${I.toFixed(2)} A. Try another pair: you need 2.50 A in total.`;
    },
    success: '6 ÷ 4 = 1.5 A and 6 ÷ 6 = 1 A. In parallel the currents add: 1.5 + 1 = 2.5 A.',
  },
];
function answerX(o) {
  if (task.done) return;
  if (o === task.xValue) { taskDone({ points: task.tries ? 8 : 20, success: `R = V ÷ I = 6 V ÷ ${(6 / task.xValue).toFixed(2)} A = ${task.xValue} Ω.` }); }
  else { task.tries++; score.streak = 0; say(`Not ${o} Ω. Divide the voltmeter reading by the ammeter reading.`, 'bad'); }
}

// ---------------------------------------------------------------- level 3: safe at home (plug, fuses, kWh)
const plug = new THREE.Group();
plug.position.set(0.0, TABLE_Y + 0.17, -0.62); plug.rotation.x = -0.75; plug.scale.setScalar(1.35);
scene.add(plug);
const TERMS = { E: [0, 0.075], N: [-0.075, -0.035], L: [0.075, -0.035] };
const WIRE_COL = { L: 0x8b4513, N: 0x1f5fbf, E: 0x3fa34d };
const WIRE_NAME = { L: 'Brown (live) wire', N: 'Blue (neutral) wire', E: 'Green and yellow (earth) wire' };
const termObjs = {}; const wireEnds = {};
{
  // plug body (shown three times life size, from the back with the cover off)
  const body = new THREE.Shape(); body.moveTo(-0.15, -0.14); body.lineTo(0.15, -0.14); body.lineTo(0.15, 0.13); body.quadraticCurveTo(0.15, 0.16, 0.12, 0.16); body.lineTo(-0.12, 0.16); body.quadraticCurveTo(-0.15, 0.16, -0.15, 0.13); body.closePath();
  plug.add(noHit(mesh(new THREE.ExtrudeGeometry(body, { depth: 0.03, bevelEnabled: false }), lam(0x2b2b2b), 0, 0, -0.03)));
  // cable grip and cable at the bottom
  plug.add(noHit(mesh(new THREE.BoxGeometry(0.08, 0.025, 0.012), lam(0x555555), 0, -0.105, 0.006)));
  const cable = noHit(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 14), lam(0xeeeeee), 0, -0.22, 0.006));
  plug.add(cable);
  for (const k in TERMS) {
    const [x, y] = TERMS[k];
    const t = new THREE.Group(); t.position.set(x, y, 0.004);
    t.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16).rotateX(Math.PI / 2), mat(0xd4a017, { metalness: 0.6, roughness: 0.3 })));
    t.add(mesh(new THREE.BoxGeometry(0.02, 0.003, 0.003), basic(0x5b4a00), 0, 0, 0.007));
    t.add(mesh(new THREE.CircleGeometry(0.03, 20), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 0, 0.008));
    const tag = label(k, { w: 0.03, h: 0.03, bg: '#ffffff', fg: '#13293d', font: 'bold 60px system-ui, sans-serif', res: 2000, radius: 40 });
    tag.position.set(k === 'E' ? 0.035 : k === 'L' ? 0.035 : -0.035, 0.0, 0.01); tag.visible = false; tag.userData.noHit = true;
    t.add(tag); t.userData.tag = tag; t.userData.term = k;
    plug.add(t); termObjs[k] = t;
    kit.slot(t, {
      name: 'Terminal', reach: 0.05,
      enabled: () => mode.kind === 'plug' && !!kit.carry.item && !t.userData.filled,
      accept: (item) => {
        const w = item.userData.wire; if (!w) return false;
        if (w === k) return true;
        task.tries++; score.streak = 0;
        return { L: 'Brown is LIVE. It goes to the terminal on the right, through the fuse.', N: 'Blue is NEUTRAL. It goes to the terminal on the left.', E: 'Green and yellow is EARTH. It goes to the top terminal, the longest pin.' }[w];
      },
      onPlace: (item) => placeWire(item, t),
    });
  }
  // fuse holder beside the live terminal
  const fuse = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 14), mat(0xf5f0e0), 0.075, 0.035, 0.012); fuse.rotation.z = 0; fuse.userData.noHit = true;
  plug.add(fuse);
  const fuseTag = label('FUSE', { w: 0.05, h: 0.018, bg: null, fg: '#ffffff', font: 'bold 30px system-ui, sans-serif', res: 1600 }); fuseTag.position.set(0.075, 0.075, 0.012); noHit(fuseTag); plug.add(fuseTag);
  // the three wire ends, waiting near the cable
  const grip = new THREE.Vector3(0, -0.105, 0.012);
  ['N', 'L', 'E'].forEach((k, i) => {
    const end = new THREE.Group();
    end.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 10).rotateX(Math.PI / 2), lam(WIRE_COL[k])));
    if (k === 'E') end.add(mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.008, 10).rotateX(Math.PI / 2), lam(0xe6d200), 0, 0, 0.004));
    end.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.012, 8).rotateX(Math.PI / 2), mat(0xd4a017, { metalness: 0.6 }), 0, 0, 0.02));
    end.position.set(-0.05 + i * 0.05, -0.16, 0.02);
    end.userData.wire = k;
    plug.add(end);
    // the flexible part from the grip to the end: a thin cylinder we stretch every frame
    const lead = mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 8), lam(WIRE_COL[k]));
    lead.userData.noHit = true; lead.raycast = () => {};
    plug.add(lead);
    wireEnds[k] = { end, lead, grip: grip.clone().add(new THREE.Vector3((i - 1) * 0.015, 0, 0)) };
    kit.carryable(end, { name: WIRE_NAME[k], canPick: () => mode.kind === 'plug' && !end.userData.placed, holdOffset: new THREE.Vector3(0, 0, 0), holdScale: 1 });
  });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
  kit.tick(() => {
    if (!plug.visible) return;
    for (const k in wireEnds) {
      const { end, lead, grip: gp } = wireEnds[k];
      _a.copy(gp); end.getWorldPosition(_b); plug.worldToLocal(_b);
      const d = _b.clone().sub(_a); const len = Math.max(0.001, d.length());
      lead.position.copy(_a).addScaledVector(d, 0.5);
      lead.quaternion.setFromUnitVectors(_u, d.normalize());
      lead.scale.set(1, len, 1);
    }
  });
}
async function placeWire(item, t) {
  t.userData.filled = true; item.userData.placed = true; item.userData.locked = true;
  t.userData.tag.visible = true;
  score.add(task.tries ? 3 : 10, plug.localToWorld(t.position.clone().add(new THREE.Vector3(0, 0.04, 0.03))));
  task.tries = 0;
  say({ L: 'Live (brown) to the fuse terminal: right.', N: 'Neutral (blue) to the left terminal.', E: 'Earth (green and yellow) to the top terminal.' }[item.userData.wire], 'good');
  await kit.settle(item, plug, new THREE.Vector3(t.position.x, t.position.y - 0.012, 0.02), new THREE.Quaternion(), null, 0.2);
  if (['L', 'N', 'E'].every((k) => termObjs[k].userData.filled)) {
    task.state.plugDone = true;
    taskDone({ points: 0, success: 'Plug wired: brown to L, blue to N, green and yellow to E. The fuse is in the live wire.' });
  }
}
function resetPlug() {
  for (const k in wireEnds) {
    const e = wireEnds[k].end; e.userData.placed = false; e.userData.locked = false;
    plug.attach(e);
    e.position.copy(e.userData.home.pos); e.quaternion.copy(e.userData.home.quat);
  }
  for (const k in termObjs) { termObjs[k].userData.filled = false; termObjs[k].userData.tag.visible = false; }
}
const FUSES = [
  { name: 'Electric kettle', P: 2200 }, { name: 'Table lamp', P: 60 }, { name: 'Electric iron', P: 1000 },
];
function fuseTask(f) {
  const I = f.P / 230; const right = I <= 3 ? 3 : I <= 5 ? 5 : 13;
  return {
    title: `Choose the fuse: ${f.name.toLowerCase()}`, kind: 'answer',
    body: [`A **${f.name.toLowerCase()}** is rated **${f.P} W** on our **230 V** mains.`, 'Which fuse should its plug have? Pick the **smallest fuse that is bigger than the normal current**.', 'Current: I = P ÷ V'],
    row: () => [3, 5, 13].map((a) => ({ text: `${a} A fuse`, act: () => answerFuse(a, right, I, f) })),
    footer: 'Fuses come in 3 A, 5 A and 13 A. Choose on the buttons in front of you.',
  };
}
function answerFuse(a, right, I, f) {
  if (task.done) return;
  if (a === right) taskDone({ points: task.tries ? 3 : 10, success: `I = ${f.P} ÷ 230 = ${I.toFixed(2)} A, so a ${right} A fuse. A bigger fuse would not blow in time; a smaller one would blow in normal use.` });
  else { task.tries++; score.streak = 0; say(a < right ? `A ${a} A fuse would blow in normal use: the ${f.name.toLowerCase()} takes ${I.toFixed(1)} A.` : `Too big: a ${a} A fuse would let a dangerous current flow before it blew. Work out I = P ÷ V.`, 'bad', 5); }
}
const KWH = {
  title: 'Paying for electricity', kind: 'answer',
  body: ['A **2 kW** heater is left on for **3 hours**.', 'How much electrical energy does it use?', 'Energy (kWh) = power (kW) × time (h)'],
  row: () => kit.shuffle(['6 kWh', '0.67 kWh', '6000 kWh']).map((o) => ({ text: o, act: () => answerKwh(o) })),
  footer: 'Your electricity units are counted in kilowatt-hours (kWh).',
};
function answerKwh(o) {
  if (task.done) return;
  if (o === '6 kWh') taskDone({ points: task.tries ? 3 : 10, success: '2 kW × 3 h = 6 kWh. One kWh is one "unit" of electricity on your meter.' });
  else { task.tries++; score.streak = 0; say(o === '6000 kWh' ? 'Keep power in kilowatts, not watts: 2 kW × 3 h.' : 'Multiply, do not divide: energy = power × time.', 'bad'); }
}

// ---------------------------------------------------------------- the three levels
function startLevel(title, list, notes) {
  task.title = title; task.list = list; task.i = 0; task.endNotes = notes;
  plug.visible = false; cb.visible = true;
  loadTask();
}
function l1Start() { startLevel('Level 1', L1_TASKS, ['Series: one path, parts share the voltage. Parallel: separate branches, each gets the full voltage.']); }
function l2Start() {
  task.xValue = [3, 4, 12][Math.floor(Math.random() * 3)];
  startLevel('Level 2', L2_TASKS, ['Ohm’s law: V = I × R. In series resistances add; in parallel the branch currents add.']);
}
function l3Start() {
  resetPlug();
  const plugTask = {
    title: 'Wire the plug', kind: 'plug',
    body: (w) => ['This is a 3-pin plug from the back, with the cover off. Connect each wire to the right terminal.', `Pick up a wire end (${w.pick}) and put it on a brass terminal (${w.place}).`, 'Remember the colour code: **brown**, **blue**, and **green and yellow**.'],
    setup: () => { plug.visible = true; cb.visible = false; tray.visible = false; },
    footer: '10 points for each wire connected first time.',
  };
  task.title = 'Level 3'; task.list = [plugTask, ...FUSES.map(fuseTask), KWH]; task.i = 0;
  task.endNotes = ['The fuse is always in the live wire. The earth wire makes a metal case safe if a fault happens.'];
  loadTask();
  plug.visible = true;
}

const flow = kit.levelFlow({
  key: 'form4-circuits',
  board,
  intro: {
    heading: 'Circuit Workshop: electricity',
    body: ['Build real circuits on the board. Every current and voltage is worked out as you go.',
      'Light bulbs in series and parallel, use meters, apply **Ohm’s law**, then wire a plug and choose the right fuse.',
      'Choose a level on the panel to your left to begin.'],
    footer: 'Form 4 Integrated Science: electricity and its safe use at home.',
  },
  levels: [
    { title: 'Make it work', short: 'Circuits', max: 80, start: l1Start },
    { title: 'Ohm’s law challenges', short: 'Ohm’s law', max: 60, start: l2Start },
    { title: 'Safe at home', short: 'Safety', max: 70, start: l3Start },
  ],
});
plug.visible = false; tray.visible = false; row.visible = false;
buildCircuit(LOOP({ fixed: { type: 'bulb' } }, { fixed: { type: 'switch' } }));
flow.showIntro();
kit.onKind(() => { if (task.list.length && mode.kind !== 'done' && mode.kind !== 'idle') drawTask(); });
kit.start();

window.game = { kit, flow, mode, task, pieces, rowBtns, rowBtn, get circ() { return circ; }, get result() { return result; }, solve, termObjs, wireEnds, plug, cb, setSwitch, speed: 1 };
