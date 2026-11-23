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
  ctx.fillStyle = '#ecebe4'; kit.roundRect(ctx, 3, 3, W - 6, H - 6, 16); ctx.fill();
  ctx.strokeStyle = '#13293d'; ctx.fillStyle = '#13293d'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const cy = H * 0.42, cx = W / 2;
  const lead = (x1, x2) => { ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy); ctx.stroke(); };
  if (type === 'resistor' || type === 'unknown') {
    lead(18, cx - 60); lead(cx + 60, W - 18); ctx.strokeRect(cx - 60, cy - 22, 120, 44);
  } else if (type === 'rheostat') {
    lead(18, cx - 60); lead(cx + 60, W - 18); ctx.strokeRect(cx - 60, cy - 22, 120, 44);
    ctx.beginPath(); ctx.moveTo(cx - 52, cy + 38); ctx.lineTo(cx + 46, cy - 36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 52, cy - 42); ctx.lineTo(cx + 30, cy - 38); ctx.lineTo(cx + 44, cy - 22); ctx.closePath(); ctx.fill();
  } else if (type === 'bulb') {
    lead(18, cx - 30); lead(cx + 30, W - 18);
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 21, cy - 21); ctx.lineTo(cx + 21, cy + 21); ctx.moveTo(cx + 21, cy - 21); ctx.lineTo(cx - 21, cy + 21); ctx.stroke();
  } else if (type === 'ammeter' || type === 'voltmeter') {
    // an analogue meter: leads, a cream dial window with a scale, and the meter's letter
    lead(18, 64); lead(W - 64, W - 18);
    ctx.fillStyle = '#f4efdf'; kit.roundRect(ctx, 64, 8, W - 128, H - 16, 12); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#13293d'; kit.roundRect(ctx, 64, 8, W - 128, H - 16, 12); ctx.stroke();
    const max = type === 'ammeter' ? 3 : 6, dx = cx, dy = H - 18, R = (H - 18) * 0.78;
    ctx.lineWidth = 3;
    for (let i = 0; i <= max * 2; i++) {
      const a = Math.PI / 2 + (0.5 - i / (max * 2)) * DIAL_SWEEP;
      const r0 = i % 2 ? R * 0.88 : R * 0.8;
      ctx.beginPath(); ctx.moveTo(dx + Math.cos(a) * r0, dy - Math.sin(a) * r0); ctx.lineTo(dx + Math.cos(a) * R, dy - Math.sin(a) * R); ctx.stroke();
      if (i % 2 === 0) { ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#13293d'; ctx.fillText(String(i / 2), dx + Math.cos(a) * R * 0.63, dy - Math.sin(a) * R * 0.63); }
    }
    ctx.beginPath(); ctx.arc(64 + 26, H - 30, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.font = 'bold 24px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(type === 'ammeter' ? 'A' : 'V', 64 + 26, H - 29);
    if (text) { ctx.font = 'bold 22px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.fillStyle = '#1e6b3a'; ctx.fillText(text, W - 72, H - 26); }
    return;
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
const DIAL_SWEEP = 2.4;   // radians from 0 to full scale
// a soft round glow for lit bulbs
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,240,180,0.6)'); g.addColorStop(1, 'rgba(255,220,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const COLORS = { rheostat: 0x6f8fa8, resistor: 0xc8a165, unknown: 0x8e7cc3, bulb: 0xe8e0c0, ammeter: 0x5d8aa8, voltmeter: 0xa86b5d, switch: 0x7b8a97, wire: 0xb87333, cell: 0x3d3d3d };
function pieceMesh(type, value = null) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(PIECE_W, PIECE_H, 0.016), lam(COLORS[type]), 0, 0, -0.008));
  const c = kit.canvasPlane(PIECE_W - 0.004, PIECE_H - 0.004, 2600);
  c.mesh.position.z = 0.0005;
  g.add(c.mesh);
  g.userData.type = type; g.userData.value = value; g.userData.canvas = c;
  const text = type === 'resistor' ? `${value} Ω` : type === 'unknown' ? 'X' : type === 'rheostat' ? 'rheostat' : type === 'cell' ? `${value} V` : type === 'bulb' ? '6 V bulb' : type === 'switch' ? 'open' : '';
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
  if (type === 'ammeter' || type === 'voltmeter') {
    const ch = PIECE_H - 0.004;
    const pivot = new THREE.Group(); pivot.position.set(0, -ch / 2 + ch * (18 / 140), 0.002);
    const len = ch * 0.75;
    pivot.add(mesh(new THREE.BoxGeometry(0.0013, len, 0.0008), basic(0xb03a2e), 0, len / 2, 0));
    pivot.add(mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 12).rotateX(Math.PI / 2), basic(0x13293d)));
    noHit(pivot); g.add(pivot);
    g.userData.needle = pivot; g.userData.max = type === 'ammeter' ? 3 : 6; g.userData.val = 0; g.userData.shown = 0; g.userData.vel = 0;
    pivot.rotation.z = DIAL_SWEEP / 2;
    meters.add(g);
  }
  return g;
}
// meter needles swing to their readings with a little overshoot, like a real moving-coil meter
const meters = new Set();
kit.tick((dt) => {
  for (const m of meters) {
    if (!m.parent) { meters.delete(m); continue; }
    const u = m.userData, target = Math.min(u.val, u.max * 1.05);
    u.vel += ((target - u.shown) * 90 - u.vel * 11) * dt; u.shown += u.vel * dt;
    u.needle.rotation.z = (0.5 - THREE.MathUtils.clamp(u.shown / u.max, -0.03, 1.06)) * DIAL_SWEEP;
  }
});
function setReading(p, txt) {
  if (p.userData.needle) {
    p.userData.val = txt && txt !== 'ERR' ? parseFloat(txt) : txt === 'ERR' ? p.userData.max * 1.2 : 0;
    const c = p.userData.canvas; drawSymbol(c.ctx, c.c.width, c.c.height, p.userData.type, txt); c.update();
    return;
  }
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
        circuitG.add(p); e.fixedObj = p; p.userData.spec = ed.fixed;
        if (ed.fixed.type === 'rheostat') makeRheostat(p);
        else kit.interactive(p, { name: ed.fixed.name || pieceName(ed.fixed.type, ed.fixed.value), near: false, onSelect: () => {} });
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
// A rheostat is a variable resistor: slide its contact to change the resistance from 1 Ω to 20 Ω.
const RHEO = { min: 1, max: 20, half: 0.046 };
function makeRheostat(p) {
  const track = mesh(new THREE.BoxGeometry(RHEO.half * 2 + 0.012, 0.007, 0.006), mat(0x8d969e, { metalness: 0.7, roughness: 0.3 }), 0, PIECE_H / 2 + 0.006, 0.004);
  const knob = new THREE.Group();
  knob.add(mesh(new THREE.BoxGeometry(0.016, 0.02, 0.016), mat(0xe0a83a, { roughness: 0.35 }), 0, 0, 0.01));
  knob.add(mesh(new THREE.BoxGeometry(0.004, 0.026, 0.004), mat(0x3a4550), 0, -0.012, 0.004));
  knob.position.set(0, PIECE_H / 2 + 0.006, 0);
  p.add(track, knob); p.userData.knob = knob;
  const setX = (x, now = true) => {
    x = THREE.MathUtils.clamp(x, -RHEO.half, RHEO.half); knob.position.x = x;
    const R = RHEO.min + (x + RHEO.half) / (RHEO.half * 2) * (RHEO.max - RHEO.min);
    p.userData.spec.value = Math.round(R * 10) / 10; if (now) solve();
  };
  p.userData.setR = (R, now = true) => setX(((R - RHEO.min) / (RHEO.max - RHEO.min)) * RHEO.half * 2 - RHEO.half, now);
  const _l = new THREE.Vector3(), _n = new THREE.Vector3(), _w = new THREE.Vector3();
  kit.draggable(knob, {
    name: 'Rheostat: slide to change the resistance',
    enabled: () => mode.kind === 'graph' && cb.visible,
    plane: () => { knob.getWorldPosition(_w); _n.set(0, 0, 1).transformDirection(p.matrixWorld); return new THREE.Plane().setFromNormalAndCoplanarPoint(_n, _w); },
    onMove: (pt) => { p.worldToLocal(_l.copy(pt)); setX(_l.x); },
  });
  p.userData.setR(p.userData.spec.value, false);
}
function pieceName(type, value) {
  return { rheostat: 'Rheostat', resistor: `${value} Ω resistor`, unknown: 'Resistor X', bulb: 'Bulb', ammeter: 'Ammeter', voltmeter: 'Voltmeter', switch: 'Switch', wire: 'Connecting wire', cell: `${value} V cell` }[type];
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
    case 'resistor': case 'unknown': case 'rheostat': return 1 / c.value;
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
// ---------------------------------------------------------------- moving current
// Yellow dots stream along the wires (conventional current, + to −). Faster dots = more current.
const DOT_MAX = 420;
const dotMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0034, 8, 6), dotMat, DOT_MAX);
dots.count = 0; dots.frustumCulled = false; noHit(dots); cb.add(dots);
{
  const m = new THREE.Matrix4(), v = new THREE.Vector3(), SP = 0.03;
  kit.tick((dt) => {
    if (!circ || !cb.visible || !result.I.length) { dots.count = 0; return; }
    let n = 0;
    circ.edges.forEach((e, i) => {
      const I = result.I[i] || 0, a = Math.abs(I);
      if (a < 0.02) return;
      const speed = Math.min(0.2, 0.012 + 0.07 * Math.sqrt(a)) * (result.short ? 2.5 : 1);
      e.flow = (e.flow || 0) + dt * speed * Math.sign(I);
      const len = e.A.distanceTo(e.B), k = Math.floor(len / SP);
      for (let j = 0; j < k && n < DOT_MAX; j++) {
        const f = ((((j * SP + e.flow) % len) + len) % len) / len;
        v.lerpVectors(e.A, e.B, f); v.z = 0.0048;
        dots.setMatrixAt(n++, m.makeTranslation(v.x, v.y, v.z));
      }
    });
    dots.count = n; dots.instanceMatrix.needsUpdate = true;
    dotMat.color.set(result.short ? 0xff5a4a : 0xffd34d);
  });
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
  if (task.i >= task.list.length) { mode.kind = 'done'; setRow([]); graphG.visible = false; fuseSet.visible = false; clinicG.visible = false; flow.complete(task.endNotes || []); return; }
  loadTask();
}
function loadTask() {
  const t = task.list[task.i];
  task.done = false; task.state = {}; task.tries = 0;
  mode.kind = t.kind || 'circuit';
  graphG.visible = false; showAppliance(null); fuseSet.visible = false; task.fuse = null; clinicG.visible = false;
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
  {
    title: 'Plot the V–I graph', kind: 'graph', circuit: () => RHEO_CIRCUIT(),
    setup: () => { task.pts = []; task.live = null; lastLive = ''; graphG.visible = true; drawGraph(); },
    body: (w) => ['The **rheostat** is a variable resistor. Slide its orange knob to change the current through resistor **R**.',
      `Take **4 readings** spread out from low to high: slide the knob (${kit.kind === 'hand' ? 'pinch it and move your hand' : kit.kind === 'controller' ? 'hold the trigger on it and move' : 'drag it with the mouse'}, or use the buttons), then press **Record**.`,
      'Then use your graph to find R.'],
    row: () => [{ text: '◀ Less R', act: () => nudge(-3), name: 'Rheostat: less resistance' }, { text: 'More R ▶', act: () => nudge(3), name: 'Rheostat: more resistance' }, { text: 'Record', act: recordReading, color: '#1e8449', name: 'Record this reading on the graph' }],
    footer: 'In a school practical you plot V against I and the gradient gives the resistance.',
  },
];
// ---------------------------------------------------------------- the V–I graph (level 2, task 4)
const RHEO_CIRCUIT = () => ({
  nodes: [[-0.3, -0.15], [-0.3, 0.15], [-0.1, 0.15], [0.12, 0.15], [0.12, -0.15], [0.3, 0.15], [0.3, -0.15]],
  edges: [
    { a: 0, b: 1, fixed: { type: 'cell', value: 6 }, id: 'cell' },
    { a: 1, b: 2, fixed: { type: 'ammeter' }, id: 'amm' },
    { a: 2, b: 3, fixed: { type: 'rheostat', value: 12 }, id: 'rheo' },
    { a: 3, b: 4, fixed: { type: 'unknown', value: task.gR, name: 'Resistor R (unknown)' }, id: 'load' },
    { a: 4, b: 0, kind: 'wire' }, { a: 3, b: 5, kind: 'wire' },
    { a: 5, b: 6, fixed: { type: 'voltmeter' }, id: 'vm' }, { a: 6, b: 4, kind: 'wire' },
  ],
});
const graph = kit.canvasPlane(0.44, 0.34, 1300);
const graphG = new THREE.Group();
graphG.position.set(0.6, TABLE_Y + 0.32, -0.6); graphG.rotation.set(-0.12, -0.6, 0, 'YXZ');
graphG.add(mesh(new THREE.BoxGeometry(0.46, 0.36, 0.015), mat(0x3a4550, { metalness: 0.3, roughness: 0.4 }), 0, 0, -0.01), graph.mesh);
graphG.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.33, 10), mat(0x8d969e, { metalness: 0.7, roughness: 0.35 }), 0, -0.33, -0.02));
noHit(graphG); graphG.visible = false; scene.add(graphG);
const GV = 6.5, GI = 1.6;
function drawGraph() {
  const { ctx, c } = graph; const W = c.width, H = c.height;
  ctx.fillStyle = '#1f2b35'; ctx.fillRect(0, 0, W, H);
  const x0 = 90, y0 = H - 70, gw = W - 130, gh = H - 130;
  const X = (v) => x0 + (v / GV) * gw, Y = (i) => y0 - (i / GI) * gh;
  ctx.strokeStyle = 'rgba(180,193,202,0.18)'; ctx.lineWidth = 1;
  for (let v = 1; v <= 6; v++) { ctx.beginPath(); ctx.moveTo(X(v), y0); ctx.lineTo(X(v), y0 - gh); ctx.stroke(); }
  for (let i = 0.2; i <= GI + 1e-6; i += 0.2) { ctx.beginPath(); ctx.moveTo(x0, Y(i)); ctx.lineTo(x0 + gw, Y(i)); ctx.stroke(); }
  ctx.strokeStyle = '#b4c1ca'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0 - gh); ctx.lineTo(x0, y0); ctx.lineTo(x0 + gw, y0); ctx.stroke();
  ctx.fillStyle = '#e4e8ea'; ctx.font = '24px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let v = 0; v <= 6; v++) ctx.fillText(String(v), X(v), y0 + 8);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= GI + 1e-6; i += 0.4) ctx.fillText(i.toFixed(1), x0 - 10, Y(i));
  ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('Voltage across R (V)', x0 + gw / 2, y0 + 36);
  ctx.save(); ctx.translate(26, y0 - gh / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Current (A)', 0, -12); ctx.restore();
  ctx.textAlign = 'left'; ctx.font = 'bold 30px system-ui'; ctx.fillStyle = '#e4e8ea'; ctx.fillText('Ohm’s law graph', 20, 14);
  const pts = task.pts || [];
  // the live reading moves as you slide the rheostat
  if (task.live) { ctx.strokeStyle = 'rgba(224,168,58,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(task.live[0]), Y(task.live[1]), 12, 0, Math.PI * 2); ctx.stroke(); }
  if (pts.length >= 4) {
    const k = pts.reduce((a, [v, i]) => a + v * i, 0) / pts.reduce((a, [v]) => a + v * v, 0);
    ctx.strokeStyle = '#5fb8ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(GV), Y(k * GV)); ctx.stroke();
  }
  ctx.fillStyle = '#5df08f';
  for (const [v, i] of pts) { ctx.beginPath(); ctx.arc(X(v), Y(i), 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.textAlign = 'right'; ctx.font = '24px system-ui'; ctx.fillStyle = '#b4c1ca'; ctx.fillText(`${pts.length} of 4 readings`, W - 20, 18);
  graph.update();
}
const loadV = () => edgeVolt('load'), loadI = () => edgeCur('amm');
let lastLive = '';
kit.tick(() => {
  if (!graphG.visible || mode.kind !== 'graph') return;
  const key = loadV().toFixed(2) + loadI().toFixed(3);
  if (key !== lastLive) { lastLive = key; task.live = [loadV(), loadI()]; drawGraph(); }
});
function recordReading() {
  if (mode.kind !== 'graph' || task.done) return;
  const v = loadV(), i = loadI();
  if ((task.pts || []).some(([pv]) => Math.abs(pv - v) < 0.35)) { say('You already have a reading near there. Slide the rheostat to get a different voltage first.', 'bad'); return; }
  task.pts.push([v, i]); sfx.pick(); kit.sparkle(graphG.localToWorld(new THREE.Vector3(-0.2 + 0.4 * v / GV, -0.13 + 0.26 * i / GI, 0.02)), 8, 0x5df08f);
  drawGraph(); drawTask(`Reading ${task.pts.length}: **${v.toFixed(2)} V**, **${i.toFixed(2)} A**.`);
  if (task.pts.length >= 4) {
    const span = Math.max(...task.pts.map((p) => p[0])) - Math.min(...task.pts.map((p) => p[0]));
    if (span < 2) { task.pts.shift(); drawGraph(); say('Spread your readings out more: use low and high settings of the rheostat.', 'bad'); return; }
    const opts = kit.shuffle([task.gR, ...[2, 3, 4, 5, 6, 8, 10].filter((x) => x !== task.gR).sort(() => Math.random() - 0.5).slice(0, 2)]);
    setRow(opts.map((o) => ({ text: `R = ${o} Ω`, act: () => answerGraph(o) })));
    drawTask('The points lie on a **straight line through the origin**: current is proportional to voltage. Read a point on the line: **R = V ÷ I**. Choose R below.');
  }
}
function answerGraph(o) {
  if (task.done) return;
  if (o === task.gR) taskDone({ points: task.tries ? 8 : 20, success: `R = V ÷ I = ${task.gR} Ω. A straight line through the origin shows that V ∝ I: this is Ohm’s law.` });
  else { task.tries++; score.streak = 0; say(`Not ${o} Ω. Pick a point on the line and divide its voltage by its current.`, 'bad'); }
}
const nudge = (d) => { const e = circ.edges.find((x) => x.id === 'rheo'); e.fixedObj.userData.setR(THREE.MathUtils.clamp(e.fixed.value + d, RHEO.min, RHEO.max)); };
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
const LEAD_N = 12;
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
  const fuse = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 14), mat(0xe8e2d0), 0.075, 0.035, 0.012); fuse.rotation.z = 0; fuse.userData.noHit = true;
  plug.add(fuse); plug.userData.fuse = fuse;
  // brass clips that hold the fuse; in the fuse tasks they are the slot for a fuse cartridge
  const clips = new THREE.Group(); clips.position.set(0.075, 0.035, 0.008);
  for (const y of [-0.026, 0.026]) clips.add(mesh(new THREE.BoxGeometry(0.024, 0.008, 0.012), mat(0xd4a017, { metalness: 0.6, roughness: 0.3 }), 0, y, 0));
  clips.add(mesh(new THREE.BoxGeometry(0.04, 0.08, 0.02), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), 0, 0, 0.004));
  plug.add(clips); plug.userData.clips = clips;
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
    const lead = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 8), mat(WIRE_COL[k], { roughness: 0.45 }), LEAD_N);
    lead.userData.noHit = true; lead.raycast = () => {}; lead.frustumCulled = false;
    plug.add(lead);
    wireEnds[k] = { end, lead, grip: grip.clone().add(new THREE.Vector3((i - 1) * 0.015, 0, 0)) };
    kit.carryable(end, { name: WIRE_NAME[k], canPick: () => mode.kind === 'plug' && !end.userData.placed, holdOffset: new THREE.Vector3(0, 0, 0), holdScale: 1 });
  });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);
  const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _down = new THREE.Vector3(), _iq = new THREE.Quaternion();
  const bez = (t, out) => out.set(0, 0, 0).addScaledVector(_a, (1 - t) * (1 - t)).addScaledVector(_c, 2 * t * (1 - t)).addScaledVector(_b, t * t);
  kit.tick(() => {
    if (!plug.visible) return;
    plug.getWorldQuaternion(_iq).invert();
    _down.set(0, -1, 0).applyQuaternion(_iq);           // "down" in the plug's own frame: cables sag under gravity
    for (const k in wireEnds) {
      const { end, lead, grip: gp } = wireEnds[k];
      _a.copy(gp); end.getWorldPosition(_b); plug.worldToLocal(_b);
      // the cable leaves the end straight back from the brass tip
      _b.add(_d.set(0, 0, -0.012).applyQuaternion(end.getWorldQuaternion(_q)).applyQuaternion(_iq));
      const span = _a.distanceTo(_b);
      _c.addVectors(_a, _b).multiplyScalar(0.5).addScaledVector(_down, Math.min(0.08, 0.02 + span * 0.25));
      for (let i = 0; i < LEAD_N; i++) {
        bez(i / LEAD_N, _p0); bez((i + 1) / LEAD_N, _p1);
        _d.subVectors(_p1, _p0); const len = Math.max(0.0005, _d.length());
        _q.setFromUnitVectors(_u, _d.normalize());
        lead.setMatrixAt(i, _m.compose(_p0.add(_p1).multiplyScalar(0.5), _q, _s.set(1, len * 1.08, 1)));
      }
      lead.instanceMatrix.needsUpdate = true;
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
// ---------------------------------------------------------------- fuse cartridges and the appliances
// Three cartridges wait on the table: 3 A (red), 5 A (black) and 13 A (brown). Put the right one in the plug.
const fuseSet = new THREE.Group(); fuseSet.visible = false; scene.add(fuseSet);
const cartridges = [[3, 0xc0392b], [5, 0x2b2b2b], [13, 0x7a4a2a]].map(([A, col], i) => {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.058, 18), mat(col, { roughness: 0.45 })));
  for (const y of [-0.034, 0.034]) g.add(mesh(new THREE.CylinderGeometry(0.0122, 0.0122, 0.012, 18), mat(0xc9cfd4, { metalness: 0.85, roughness: 0.25 }), 0, y, 0));
  // they stand in a rack, each above its label
  const tag = label(`${A} A`, { w: 0.05, h: 0.022, bg: '#2b3138', fg: '#f3f2ee', font: 'bold 44px system-ui, sans-serif', res: 1600 });
  tag.position.set(0.24 + i * 0.07, TABLE_Y + 0.015, -0.4 + 0.027); tag.rotation.x = -0.35; noHit(tag); fuseSet.add(tag);
  g.position.set(0.24 + i * 0.07, TABLE_Y + 0.05, -0.41);
  g.userData.fuseA = A;
  fuseSet.add(g);
  kit.carryable(g, { name: `${A} A fuse`, canPick: () => mode.kind === 'answer' && !!task.fuse && !g.userData.placed, holdOffset: new THREE.Vector3(0, 0.02, -0.01) });
  return g;
});
{
  const rack = mesh(new THREE.BoxGeometry(0.23, 0.03, 0.05), mat(0x8d969e, { metalness: 0.5, roughness: 0.35 }), 0.31, TABLE_Y + 0.015, -0.41); noHit(rack); fuseSet.add(rack);
  const sh = kit.contactShadow(0.32, 0.12, 0.45); sh.position.set(0.31, TABLE_Y + 0.002, -0.41); fuseSet.add(sh);
}
kit.slot(plug.userData.clips, {
  name: 'Fuse holder', reach: 0.06,
  enabled: () => mode.kind === 'answer' && !!task.fuse && !task.done && !!kit.carry.item?.userData.fuseA,
  accept: (item) => { const v = fuseVerdict(item.userData.fuseA); if (v.ok) return true; task.tries++; score.streak = 0; return v.msg; },
  onPlace: (item) => {
    item.userData.placed = true; item.userData.locked = true;
    plug.userData.fuse.visible = false;
    kit.settle(item, plug, new THREE.Vector3(0.075, 0.035, 0.014), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(0.78 / 1.0), 0.2);
    answerFuse(item.userData.fuseA, task.fuse.right, task.fuse.I, task.fuse.f);
  },
});
function resetFuses() {
  for (const c of cartridges) { if (kit.carry.item === c) kit.returnHome(c); c.userData.placed = false; c.userData.locked = false; const h = c.userData.home; h.parent.attach(c); c.position.copy(h.pos); c.quaternion.copy(h.quat); c.scale.copy(h.scale); }
  plug.userData.fuse.visible = true;
}
// simple appliance models with their rating plates
const appliances = {};
{
  const at = (g) => { g.position.set(-0.25, TABLE_Y, -0.5); g.rotation.y = 0.25; const sh = kit.contactShadow(0.26, 0.26, 0.5); sh.position.y = 0.002; g.add(sh); noHit(g); g.visible = false; scene.add(g); return g; };
  const plate = (g, text, y = 0.02, z = 0.1) => { const l = label(text, { w: 0.15, h: 0.04, bg: '#2b3138', fg: '#f3f2ee', font: 'bold 32px system-ui, sans-serif' }); l.position.set(0, y, z); l.rotation.x = -0.6; g.add(l); };
  const white = mat(0xd9d6cf, { roughness: 0.35 }), dark = mat(0x2b3138, { roughness: 0.45 }), steel = mat(0xc9cfd4, { metalness: 0.85, roughness: 0.25 });
  // kettle
  let g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 32), dark, 0, 0.01, 0));
  g.add(mesh(new THREE.LatheGeometry([[0, 0], [0.068, 0], [0.072, 0.03], [0.07, 0.11], [0.06, 0.15], [0.045, 0.16], [0, 0.16]].map(([x, y]) => new THREE.Vector2(x, y)), 32), steel, 0, 0.02, 0));
  g.add(mesh(new THREE.TorusGeometry(0.05, 0.011, 10, 24, Math.PI), dark, -0.075, 0.1, 0).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.ConeGeometry(0.018, 0.06, 14).rotateZ(-1.1), steel, 0.085, 0.13, 0));
  g.add(mesh(new THREE.SphereGeometry(0.012, 12, 8), dark, 0, 0.185, 0));
  plate(g, '2200 W · 230 V'); appliances.kettle = at(g);
  // table lamp
  g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.02, 32), dark, 0, 0.01, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 10), steel, 0, 0.12, 0));
  g.add(mesh(new THREE.LatheGeometry([[0.045, 0], [0.09, -0.09], [0.088, -0.092], [0.043, -0.002]].map(([x, y]) => new THREE.Vector2(x, y)), 32), mat(0xe8dcc0, { roughness: 0.7, side: THREE.DoubleSide }), 0, 0.3, 0));
  g.add(mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), 0, 0.235, 0));
  plate(g, '60 W · 230 V'); appliances.lamp = at(g);
  // iron
  g = new THREE.Group();
  const sole = new THREE.Shape(); sole.moveTo(-0.08, -0.045); sole.lineTo(0.05, -0.045); sole.quadraticCurveTo(0.11, -0.02, 0.12, 0); sole.quadraticCurveTo(0.11, 0.02, 0.05, 0.045); sole.lineTo(-0.08, 0.045); sole.closePath();
  g.add(mesh(new THREE.ExtrudeGeometry(sole, { depth: 0.012, bevelEnabled: false }).rotateX(-Math.PI / 2), steel, 0, 0.0, 0));
  g.add(mesh(new THREE.ExtrudeGeometry(sole, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008 }).rotateX(-Math.PI / 2).scale(0.92, 1, 0.92), mat(0x2f7f8f, { roughness: 0.4 }), 0, 0.014, 0));
  g.add(mesh(new THREE.TorusGeometry(0.045, 0.011, 10, 24, Math.PI), dark, -0.005, 0.07, 0));
  plate(g, '1000 W · 230 V'); appliances.iron = at(g);
  // heater
  g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.2, 0.15, 0.06), mat(0xd9d6cf, { roughness: 0.4 }), 0, 0.095, 0));
  for (const y of [0.06, 0.095, 0.13]) g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 10).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a3a }), 0, y, 0.032));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.02, 0.09), dark, 0, 0.01, 0));
  plate(g, '2 kW heater', 0.03, 0.075); appliances.heater = at(g);
}
function showAppliance(k) { for (const a in appliances) appliances[a].visible = a === k; }
const FUSES = [
  { name: 'Electric kettle', P: 2200, model: 'kettle' }, { name: 'Table lamp', P: 60, model: 'lamp' }, { name: 'Electric iron', P: 1000, model: 'iron' },
];
function fuseVerdict(a) {
  const { right, I, f } = task.fuse;
  if (a === right) return { ok: true };
  return { ok: false, msg: a < right ? `A ${a} A fuse would blow in normal use: the ${f.name.toLowerCase()} takes ${I.toFixed(1)} A.` : `Too big: a ${a} A fuse would let a dangerous current flow before it blew. Work out I = P ÷ V.` };
}
function fuseTask(f) {
  const I = f.P / 230; const right = I <= 3 ? 3 : I <= 5 ? 5 : 13;
  return {
    title: `Choose the fuse: ${f.name.toLowerCase()}`, kind: 'answer',
    body: [`A **${f.name.toLowerCase()}** is rated **${f.P} W** on our **230 V** mains.`, 'Which fuse should its plug have? Pick the **smallest fuse that is bigger than the normal current**.', 'Current: I = P ÷ V'],
    setup: () => { task.fuse = { right, I, f }; resetFuses(); fuseSet.visible = true; plug.visible = true; showAppliance(f.model); },
    row: () => [3, 5, 13].map((a) => ({ text: `${a} A fuse`, act: () => answerFuse(a, right, I, f) })),
    footer: 'Put the right fuse cartridge into the plug’s fuse holder, or choose on the buttons. Fuses come in 3 A, 5 A and 13 A.',
  };
}
function answerFuse(a, right, I, f) {
  if (task.done) return;
  if (a === right && !cartridges.some((c) => c.userData.placed)) {
    // pressing the button fits the cartridge for you
    const c = cartridges.find((x) => x.userData.fuseA === a);
    c.userData.placed = true; c.userData.locked = true; plug.userData.fuse.visible = false;
    kit.settle(c, plug, new THREE.Vector3(0.075, 0.035, 0.014), new THREE.Quaternion(), new THREE.Vector3(0.78, 0.78, 0.78), 0.3);
  }
  if (a === right) taskDone({ points: task.tries ? 3 : 10, success: `I = ${f.P} ÷ 230 = ${I.toFixed(2)} A, so a ${right} A fuse. A bigger fuse would not blow in time; a smaller one would blow in normal use.` });
  else { task.tries++; score.streak = 0; say(fuseVerdict(a).msg, 'bad', 5); }
}
const KWH = {
  title: 'Paying for electricity', kind: 'answer',
  body: ['A **2 kW** heater is left on for **3 hours**.', 'How much electrical energy does it use?', 'Energy (kWh) = power (kW) × time (h)'],
  setup: () => { task.fuse = null; showAppliance('heater'); plug.visible = false; },
  row: () => kit.shuffle(['6 kWh', '0.67 kWh', '6000 kWh']).map((o) => ({ text: o, act: () => answerKwh(o) })),
  footer: 'Your electricity units are counted in kilowatt-hours (kWh).',
};
function answerKwh(o) {
  if (task.done) return;
  if (o === '6 kWh') taskDone({ points: task.tries ? 3 : 10, success: '2 kW × 3 h = 6 kWh. One kWh is one "unit" of electricity on your meter.' });
  else { task.tries++; score.streak = 0; say(o === '6000 kWh' ? 'Keep power in kilowatts, not watts: 2 kW × 3 h.' : 'Multiply, do not divide: energy = power × time.', 'bad'); }
}

// ---------------------------------------------------------------- level 4: the clinic job
// A rural clinic: wire two rooms in parallel with their own switches, share a 10 A supply, then cost the fridge.
const CLINIC = () => ({
  nodes: [[-0.32, -0.17], [-0.32, 0.13], [-0.2, 0.13], [-0.02, 0.13], [0.18, 0.13], [0.3, 0.13], [-0.2, -0.02], [-0.02, -0.02], [0.18, -0.02], [0.3, -0.02], [0.3, -0.17]],
  edges: [
    { a: 0, b: 1, fixed: { type: 'cell', value: 6 }, id: 'cell' },
    { a: 1, b: 2, kind: 'wire' },
    { a: 2, b: 3, slot: true, id: 'a1', slotName: 'Ward light: first gap' },
    { a: 3, b: 4, slot: true, id: 'a2', slotName: 'Ward light: second gap' },
    { a: 4, b: 5, kind: 'wire' },
    { a: 2, b: 6, kind: 'wire' },
    { a: 6, b: 7, slot: true, id: 'b1', slotName: 'Office light: first gap' },
    { a: 7, b: 8, slot: true, id: 'b2', slotName: 'Office light: second gap' },
    { a: 8, b: 9, kind: 'wire' },
    { a: 5, b: 9, kind: 'wire' },
    { a: 9, b: 10, kind: 'wire' },
    { a: 10, b: 0, kind: 'wire' },
  ],
});
const ROOMS = [['a1', 'a2', 'ward'], ['b1', 'b2', 'office']];
const CLINIC_WIRING = {
  title: 'Light the ward and the office', circuit: CLINIC,
  parts: [['bulb'], ['switch'], ['bulb'], ['wire'], ['switch']],
  setup: () => {
    for (const [txt, y] of [['WARD', 0.17], ['OFFICE', 0.02]]) {
      const l = label(txt, { w: 0.095, h: 0.028, bg: '#14402a', fg: '#f3f2ee', font: 'bold 40px system-ui, sans-serif', res: 1600 });
      l.position.set(0.245, y, 0.003); noHit(l); circuitG.add(l);
    }
  },
  body: ['This board is a model of the clinic wiring; the 6 V cell stands in for the solar battery.', 'Each room needs a **bulb** and **its own switch**, so the nurse can turn one light off without the other. Fill the gaps, then light both rooms.'],
  check: (s) => {
    for (const [g1, g2, room] of ROOMS) {
      const a = inEdge(g1), b = inEdge(g2);
      if (!a || !b) continue;
      if (a !== 'switch' && b !== 'switch') return `The ${room} light has no switch, so it could never be turned off. Each room needs a bulb and its own switch.`;
      if (a !== 'bulb' && b !== 'bulb') return `The ${room} row has no bulb in it. Each room needs a bulb and its own switch.`;
    }
    if (ROOMS.some(([g1, g2]) => !inEdge(g1) || !inEdge(g2))) return null;
    const lit = bulbsLit();
    if (lit[0] && lit[1]) { s.both = true; return 'Both rooms are lit. The office is empty now: switch the **office** light off, but keep the ward light on.'; }
    if (s.both && lit[0] && !lit[1]) return true;
    if (s.both && !lit[0] && lit[1]) return 'Oops, that is the ward light, and the nurse is still with a patient! Turn the ward light back on and the office light off.';
    return null;
  },
  points: 20,
  success: 'Each room is its own parallel branch with its own switch, so one light can go off while the other stays on. That is how every building is wired.',
};
const LOADS = [
  { k: 'fridge', name: 'Vaccine fridge', short: 'Fridge', P: 150 },
  { k: 'lights', name: 'Lights (4 × 60 W)', short: 'Lights', P: 240 },
  { k: 'steril', name: 'Steriliser', short: 'Steriliser', P: 1500 },
  { k: 'kettle', name: 'Kettle', short: 'Kettle', P: 2000 },
  { k: 'pc', name: 'Computer', short: 'Computer', P: 100 },
];
const BREAKER = 10;
const clinic = { on: {}, tripped: 0 };
const clinicP = kit.canvasPlane(0.66, 0.42, 1300);
const clinicG = new THREE.Group();
clinicG.position.set(0.04, TABLE_Y + 0.3, -0.68); clinicG.rotation.x = -0.22;
clinicG.add(mesh(new THREE.BoxGeometry(0.68, 0.44, 0.015), mat(0x3a4550, { metalness: 0.3, roughness: 0.4 }), 0, 0, -0.01), clinicP.mesh);
clinicG.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 10), mat(0x8d969e, { metalness: 0.7, roughness: 0.35 }), 0, -0.27, -0.02));
noHit(clinicG); clinicG.visible = false; scene.add(clinicG);
const clinicAmps = () => LOADS.reduce((t, l) => t + (clinic.on[l.k] ? l.P / 230 : 0), 0);
function drawClinic() {
  const { ctx, c } = clinicP; const W = c.width, H = c.height;
  ctx.fillStyle = '#1f2b35'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7d6608'; ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = '#f3f2ee'; ctx.font = 'bold 36px system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText('Clinic supply: 230 V, 10 A breaker', 22, 33);
  let y = 100;
  ctx.font = '30px system-ui'; ctx.fillStyle = '#b4c1ca';
  ctx.fillText('Appliance', 60, y); ctx.textAlign = 'right'; ctx.fillText('Power', W * 0.62, y); ctx.fillText('Current', W - 30, y); ctx.textAlign = 'left';
  y += 50;
  for (const l of LOADS) {
    const on = !!clinic.on[l.k];
    ctx.fillStyle = on ? '#58d68d' : '#4a5864'; ctx.beginPath(); ctx.arc(34, y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = on ? '#f3f2ee' : '#8796a3'; ctx.font = `${on ? 'bold ' : ''}36px system-ui`;
    ctx.fillText(l.name, 60, y);
    ctx.textAlign = 'right'; ctx.fillText(`${l.P} W`, W * 0.62, y);
    ctx.fillText(on ? `${(l.P / 230).toFixed(2)} A` : 'off', W - 30, y); ctx.textAlign = 'left';
    y += 54;
  }
  // total current against the breaker limit
  const I = clinicAmps(), x0 = 30, bw = W - 60, by = H - 62;
  ctx.fillStyle = '#2b3a46'; kit.roundRect(ctx, x0, by, bw, 40, 10); ctx.fill();
  const frac = Math.min(1, I / 20);
  ctx.fillStyle = clinic.tripped > 0 ? '#e74c3c' : I > BREAKER * 0.85 ? '#e0a83a' : '#58d68d';
  if (frac > 0) { kit.roundRect(ctx, x0, by, Math.max(20, bw * frac), 40, 10); ctx.fill(); }
  const lx = x0 + bw * (BREAKER / 20);
  ctx.fillStyle = '#f3f2ee'; ctx.fillRect(lx - 2, by - 12, 4, 64);
  ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center'; ctx.fillText('10 A', lx, by - 26);
  ctx.textAlign = 'left'; ctx.font = 'bold 32px system-ui';
  ctx.fillText(clinic.tripped > 0 ? 'BREAKER TRIPPED: everything is off' : `Total current: ${I.toFixed(2)} A`, x0, by - 26);
  clinicP.update();
}
kit.tick((dt) => { if (clinic.tripped > 0) { clinic.tripped -= dt; if (clinic.tripped <= 0) drawClinic(); } });
function clinicRow() {
  return LOADS.map((l) => ({ key: l.k, text: `${l.short} ${clinic.on[l.k] ? 'ON' : 'off'}`, color: clinic.on[l.k] ? '#1e8449' : '#5d6d7e', name: `Switch the ${l.name.toLowerCase()} ${clinic.on[l.k] ? 'off' : 'on'}`, act: () => toggleLoad(l.k) }));
}
function toggleLoad(k) {
  if (task.done || mode.kind !== 'answer' || !clinicG.visible) return;
  clinic.on[k] = !clinic.on[k];
  sfx.click();
  const I = clinicAmps();
  if (I > BREAKER) {
    const names = LOADS.filter((l) => clinic.on[l.k]).map((l) => l.short.toLowerCase());
    clinic.on = {}; clinic.tripped = 2.5; task.tries++; score.streak = 0;
    sfx.tone(110, 0.4, 'square', 0.08);
    say(`Breaker tripped! The ${names.join(', ')} together need ${I.toFixed(1)} A, more than 10 A. Everything went off, even the vaccine fridge!`, 'bad', 7);
    drawTask(`**Tripped at ${I.toFixed(1)} A.** Currents in parallel add up: I = P ÷ V for each appliance.`, 'bad');
  }
  setRow(clinicRow()); drawClinic();
  if (clinic.on.fridge && clinic.on.lights && clinic.on.steril && I <= BREAKER) {
    taskDone({ points: task.tries ? 10 : 20, success: `Fridge, lights and steriliser together take ${I.toFixed(2)} A, under the 10 A limit. The kettle (${(2000 / 230).toFixed(1)} A on its own) has to wait.` });
  }
}
const CLINIC_POWER = {
  title: 'Share the power', kind: 'answer',
  body: ['The clinic’s solar system gives **230 V** through a **10 A** breaker. Someone has left the **kettle** on.',
    'The nurse needs the **vaccine fridge**, the **lights** and the **steriliser** on together. Switch appliances on and off with the buttons, without tripping the breaker.',
    'Each appliance takes **I = P ÷ V**, and in parallel the currents **add up**.'],
  setup: () => { clinic.on = { fridge: true, kettle: true }; clinic.tripped = 0; clinicG.visible = true; drawClinic(); },
  row: clinicRow,
  footer: 'Plan it first: 2000 W ÷ 230 V is almost 9 A for the kettle alone.',
};
const CLINIC_BILL = {
  title: 'The fridge’s monthly bill', kind: 'answer',
  body: ['The **150 W** vaccine fridge runs **24 hours a day** for a **30-day** month. Electricity costs **$0.10 per kWh** (an example price).', 'What does the fridge cost to run for the month?', 'Energy (kWh) = power (kW) × time (h). Cost = kWh × price.'],
  setup: () => { clinicG.visible = false; },
  row: () => kit.shuffle(['$10.80', '$10 800', '$0.36']).map((o) => ({ text: o, act: () => answerBill(o) })),
  footer: 'Change watts to kilowatts first: 150 W = 0.15 kW.',
};
function answerBill(o) {
  if (task.done) return;
  if (o === '$10.80') taskDone({ points: task.tries ? 8 : 20, success: '0.15 kW × 24 h × 30 days = 108 kWh, and 108 × $0.10 = $10.80 a month to keep the vaccines cold.' });
  else { task.tries++; score.streak = 0; say(o === '$10 800' ? 'Change watts to kilowatts first: 150 W = 0.15 kW.' : 'That is the cost for one day (3.6 kWh). Multiply by 30 days.', 'bad', 5); }
}
const L4_TASKS = [CLINIC_WIRING, CLINIC_POWER, CLINIC_BILL];

// ---------------------------------------------------------------- the levels
function startLevel(title, list, notes) {
  task.title = title; task.list = list; task.i = 0; task.endNotes = notes;
  plug.visible = false; cb.visible = true;
  loadTask();
}
function l1Start() { startLevel('Level 1', L1_TASKS, ['Series: one path, parts share the voltage. Parallel: separate branches, each gets the full voltage.']); }
function l2Start() {
  task.xValue = [3, 4, 12][Math.floor(Math.random() * 3)];
  task.gR = [4, 5, 8][Math.floor(Math.random() * 3)];
  startLevel('Level 2', L2_TASKS, ['Ohm’s law: V = I × R. In series resistances add; in parallel the branch currents add.']);
}
function l4Start() { clinic.on = {}; startLevel('Level 4', L4_TASKS, ['Rooms are wired in parallel so each has its own switch. Currents in parallel add up, so a breaker limits how much can run at once.']); }
function l3Start() {
  resetPlug(); task.fuse = null;
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
      'Light bulbs in series and parallel, use meters, apply **Ohm’s law**, wire a plug and choose fuses, then power a rural clinic.',
      'Choose a level on the panel to your left to begin.'],
    footer: 'Form 4 Integrated Science: electricity and its safe use at home.',
  },
  levels: [
    { title: 'Make it work', short: 'Circuits', max: 80, start: l1Start,
      story: { chapter: 'The apprentice', intro: ['Before you touch real wiring, you must master the circuit board.', 'Light the bulbs, and learn the difference between series and parallel.'], outro: ['Good. You understand how current needs a complete path. Now for some numbers.'] } },
    { title: 'Ohm’s law challenges', short: 'Ohm’s law', max: 80, start: l2Start,
      story: { chapter: 'The numbers game', intro: ['An electrician who cannot calculate is a dangerous electrician.', 'Use Ohm’s law, V = I × R, to hit every target.'], outro: ['Spot on. Ohm’s law will never let you down.'] } },
    { title: 'Safe at home', short: 'Safety', max: 70, start: l3Start,
      story: { chapter: 'House calls', intro: ['Gogo Moyo’s plug sparks and her kettle keeps blowing fuses. Let us make her home safe.', 'Wire her plug correctly, then choose the right fuse for each appliance.'], outro: ['Gogo Moyo is safe again, and now she knows what her electricity costs.'] } },
    { title: 'The clinic job', short: 'Clinic', max: 60, start: l4Start, stop: () => { clinicG.visible = false; },
      story: { chapter: 'The clinic job', intro: ['Our biggest job yet: the new rural clinic in Gutu. It runs on solar power with a 10 A limit.', 'Wire the rooms, share the power wisely, and keep the vaccine fridge running.'], outro: ['The clinic is open and the vaccines are safe. Brilliant work!'] } },
  ],
  guide: kit.guide({ name: 'Nyasha Dube', role: 'Electrician', look: { skin: '#5a3a22', hair: 'bun', hairCol: '#1d1a18', coat: '#2f5f8f', shirt: '#e0a83a', accent: '#7d6608' } }),
  prologue: ['Mhoro! I am Nyasha Dube, electrician. I have more jobs than hands, so I need an apprentice.', 'Every job here is a real circuit: the currents and voltages are worked out as you build.', 'Choose Chapter 1 on the panel to your left, and let us get to work.'],
  ending: ['You are a fully qualified electrician now. I would trust you with any job.', 'Come back any time and try to beat your best score.'],
});
plug.visible = false; tray.visible = false; row.visible = false;
buildCircuit(LOOP({ fixed: { type: 'bulb' } }, { fixed: { type: 'switch' } }));
flow.showIntro();
kit.onKind(() => { if (task.list.length && mode.kind !== 'done' && mode.kind !== 'idle') drawTask(); });
kit.start();

window.game = { kit, flow, mode, task, pieces, rowBtns, rowBtn, get circ() { return circ; }, get result() { return result; }, solve, termObjs, wireEnds, plug, cb, setSwitch, cartridges, graphG, dots, meters, loadTask, clinic, clinicG, LOADS, bulbsLit, speed: 1 };
