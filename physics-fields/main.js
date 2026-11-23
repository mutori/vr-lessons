// Field Lab: an A-Level (Form 6) physics VR game on electromagnetism.
// Five experiments: Motor Effect (Fleming's left-hand rule, F = BIL sin θ), Particle Paths (F = Bqv, r = mv/Bq),
// Mass Spectrometer (velocity selector E = vB, then r = mv/Bq), Induction (Faraday's and Lenz's laws)
// and Generator (E = BANω sin ωt).
// Runs in the Meta Quest Browser (hands or controllers) and on a computer.
import {
  THREE, scene, camera, renderer, input, mat, basic, glowMat, mesh, noHit, sig, board, textSprite, arrow,
  actionButton, slider, dial, toggle, grabbable, beacon, toaster, quiz, makeInteractive, sfx, tween, wait, onFrame, start, words,
  view, onKindChange, shuffle, closestOnLineToRay, clamp, setEnvironment, glowSprite, blobShadow, fx, shockwave, celebrate,
  canvasPlane, roundRect, ambience, easeOut,
} from './kit.js';

const V3 = THREE.Vector3;
const E_CH = 1.6e-19, U = 1.66e-27;
// one colour language across the games
const COL = { field: 0x5fb0ff, current: 0xffd34d, force: 0x3ddc84, efield: 0xff6b5a, north: 0xd8463b, south: 0x2f6fd6, accent: 0x5fd1ff, copper: 0xc8793a };
const cssOf = (c) => '#' + new THREE.Color(c).getHexString();
const dragWord = () => (input.kind === 'hand' ? 'pinch and move' : input.kind === 'controller' ? 'point at, hold the trigger and move' : 'drag');

// ---------------------------------------------------------------- the lab
scene.background = new THREE.Color(0x1a1f26);
scene.fog = new THREE.Fog(0x1a1f26, 7, 15);
setEnvironment({
  top: 0xf4f6fa, horizon: 0x5d6670, bottom: 0x24272b, intensity: 0.75,
  panels: [{ pos: [0, 5, -1], w: 4, h: 2, color: 0xffffff, intensity: 3 }, { pos: [-5, 1.6, -1], w: 3, h: 2, color: 0xffd2a0, intensity: 2.2 }],
});
scene.add(new THREE.HemisphereLight(0xe6eeff, 0x3b342c, 0.75));
const key = new THREE.DirectionalLight(0xfff4e6, 1.9);
key.position.set(0.8, 3.2, 1.0); key.target.position.set(0, 0.9, -0.8);
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x8fb6ff, 0.9);
rim.position.set(-1.5, 2.2, -3);
scene.add(rim);
const windowLight = new THREE.PointLight(0xffc98a, 6, 7, 2);
windowLight.position.set(-2.6, 1.8, -1.0);
scene.add(windowLight);
view.desktopPos.set(0, 0.12, 0.78);
view.desktopPitch = -0.37;

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
(function room() {
  // vinyl tile floor
  const floorT = canvasTex(512, 512, (x) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `hsl(208, 9%, ${40 + Math.random() * 5}%)`; x.fillRect(i * 128, j * 128, 128, 128); }
    for (let k = 0; k < 5000; k++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
    x.strokeStyle = 'rgba(25,28,33,0.7)'; x.lineWidth = 3;
    for (let i = 0; i <= 512; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  }, [6, 6]);
  const floor = mesh(new THREE.PlaneGeometry(12, 12), mat(0xffffff, { map: floorT, roughness: 0.42, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(noHit(floor));
  // walls: blue-grey dado, pale upper wall, ceiling with light panels
  const upper = mat(0xc4cbd3, { roughness: 0.9 }), dado = mat(0x3e566b, { roughness: 0.7 }), trim = mat(0x2a3440, { roughness: 0.5 });
  const wall = (w, x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    g.add(mesh(new THREE.PlaneGeometry(w, 2.1), upper, 0, 2.05, 0), mesh(new THREE.PlaneGeometry(w, 1.0), dado, 0, 0.5, 0));
    g.add(mesh(new THREE.BoxGeometry(w, 0.04, 0.03), trim, 0, 1.0, 0.015), mesh(new THREE.BoxGeometry(w, 0.1, 0.02), trim, 0, 0.05, 0.01));
    scene.add(noHit(g));
  };
  wall(7, 0, -3, 0); wall(7, -3.2, 0, Math.PI / 2); wall(7, 3.2, 0, -Math.PI / 2); wall(7, 0, 3, Math.PI);
  const ceil = mesh(new THREE.PlaneGeometry(7, 7), mat(0xe3e6ea, { roughness: 0.95 }), 0, 3.1, 0);
  ceil.rotation.x = Math.PI / 2; scene.add(noHit(ceil));
  for (const [x, z] of [[-1.2, -1.6], [1.2, -1.6], [-1.2, 0.4], [1.2, 0.4]]) {
    const p = mesh(new THREE.PlaneGeometry(1.2, 0.55), basic(0xfdfcf6), x, 3.09, z);
    p.rotation.x = Math.PI / 2; scene.add(noHit(p));
  }
  // a window on the left wall: an evening over the Harare hills
  const winT = canvasTex(1024, 600, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3d6fb6'); g.addColorStop(0.55, '#9fb9d8'); g.addColorStop(0.78, '#f2c58c'); g.addColorStop(1, '#e58f5a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const sun = x.createRadialGradient(700, 430, 0, 700, 430, 200);
    sun.addColorStop(0, 'rgba(255,240,200,1)'); sun.addColorStop(0.15, 'rgba(255,220,160,0.8)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
    x.fillStyle = sun; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5a6b7a';
    x.beginPath(); x.moveTo(0, 470); for (let i = 0; i <= w; i += 20) x.lineTo(i, 450 - 40 * Math.sin(i / 160) - 20 * Math.sin(i / 47)); x.lineTo(w, h); x.lineTo(0, h); x.fill();
    x.fillStyle = '#2f3a2c';
    x.beginPath(); x.moveTo(0, 520); for (let i = 0; i <= w; i += 16) x.lineTo(i, 505 - 18 * Math.sin(i / 90) - 8 * Math.sin(i / 23)); x.lineTo(w, h); x.lineTo(0, h); x.fill();
    // msasa trees: flat umbrella crowns
    x.fillStyle = '#1f281e';
    for (const [tx, s] of [[140, 1], [380, 0.8], [860, 1.2], [960, 0.7]]) {
      x.fillRect(tx - 4 * s, 470 - 10 * s, 8 * s, 70 * s);
      for (let k = 0; k < 7; k++) { x.beginPath(); x.ellipse(tx + (k - 3) * 16 * s, 455 - 12 * s - Math.abs(k - 3) * -3 * s, 30 * s, 14 * s, 0, 0, 7); x.fill(); }
    }
  });
  const win = new THREE.Group(); win.position.set(-3.19, 1.75, -0.9); win.rotation.y = Math.PI / 2;
  win.add(mesh(new THREE.PlaneGeometry(2.2, 1.3), basic(0xd8d8d8, { map: winT })));
  const frameM = mat(0xeef1f4, { roughness: 0.5 });
  for (const y of [-0.67, 0.67, 0]) win.add(mesh(new THREE.BoxGeometry(2.3, 0.05, 0.06), frameM, 0, y, 0.02));
  for (const x of [-1.12, 1.12, -0.37, 0.37]) win.add(mesh(new THREE.BoxGeometry(0.05, 1.38, 0.06), frameM, x, 0, 0.02));
  win.add(mesh(new THREE.BoxGeometry(2.4, 0.04, 0.2), frameM, 0, -0.71, 0.08));
  scene.add(noHit(win));
  // shelves on the right wall with glassware and books
  const shelves = new THREE.Group(); shelves.position.set(3.05, 0, -1.2); shelves.rotation.y = -Math.PI / 2;
  const wood = mat(0x8a6a4a, { roughness: 0.6 }), glass = new THREE.MeshPhysicalMaterial({ color: 0xdff2ff, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.35, depthWrite: false });
  const beaker = (h, r) => { const pts = []; pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h), new THREE.Vector2(r * 1.08, h + 0.01)); return mesh(new THREE.LatheGeometry(pts, 20), glass); };
  const flask = (h, r) => { const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(t < 0.6 ? r * (1 - t * 1.2) + r * 0.25 * t : r * 0.22, t * h)); } return mesh(new THREE.LatheGeometry(pts, 20), glass); };
  const liquid = (h, r, c) => mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, h, 20).translate(0, h / 2 + 0.002, 0), mat(c, { roughness: 0.2, transparent: true, opacity: 0.75 }));
  for (const y of [1.25, 1.65, 2.05]) {
    shelves.add(mesh(new THREE.BoxGeometry(1.6, 0.03, 0.26), wood, 0, y, 0.13));
    for (const x of [-0.75, 0.75]) shelves.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.2), trim, x, y - 0.07, 0.1));
  }
  const bookCols = [0x8e3b2f, 0x2f5d8e, 0x3f7d4b, 0xb9842f, 0x5b3f8e, 0x2f2f35];
  for (let i = 0; i < 9; i++) { const h = 0.18 + Math.random() * 0.07; const b = mesh(new THREE.BoxGeometry(0.04, h, 0.17), mat(bookCols[i % 6], { roughness: 0.7 }), -0.68 + i * 0.045, 1.265 + h / 2, 0.12); shelves.add(b); }
  [[0.1, 0.06, 0.035, 0x5fc7ff], [0.25, 0.08, 0.04, 0xff8a5f], [0.4, 0.05, 0.03, 0x8fe08a]].forEach(([x, h, r, c]) => { const b = beaker(h, r); b.position.set(x, 1.265, 0.12); shelves.add(b, liquid(h * 0.5, r, c).translateX(x).translateY(1.265).translateZ(0.12)); });
  [[-0.5, 0.16, 0.06], [-0.2, 0.12, 0.05], [0.5, 0.14, 0.055]].forEach(([x, h, r]) => { const f = flask(h, r); f.position.set(x, 1.665, 0.12); shelves.add(f); });
  for (let i = 0; i < 6; i++) { const b = beaker(0.07, 0.025); b.position.set(-0.6 + i * 0.12, 2.065, 0.12); shelves.add(b); }
  scene.add(noHit(shelves));
  // poster on the back wall
  const poster = board(1.3, 0.62, { light: true });
  poster.position.set(0, 2.15, -2.97);
  scene.add(poster);
  poster.userData.draw([
    { t: "Fleming's LEFT-hand rule (motors)", size: 50, bold: true, color: '#7a2e12', center: true, gap: 10 },
    { t: 'thuMb = Motion (force)', size: 38, color: '#1f7a43', center: true, bold: true },
    { t: 'First finger = Field (N to S)', size: 38, color: '#1f4e9a', center: true, bold: true },
    { t: 'seCond finger = Current (+ to −)', size: 38, color: '#9a6a00', center: true, bold: true, gap: 12 },
    { t: 'F = BIL sin θ     F = Bqv     r = mv / Bq     E = −N dΦ/dt     E = BANω sin ωt', size: 30, color: '#2b2b2b', center: true },
  ], { title: null });
})();

// the bench
const bench = new THREE.Group();
bench.position.set(0, 0, -0.86);
scene.add(bench);
{
  bench.add(mesh(new THREE.BoxGeometry(1.8, 0.05, 0.8), mat(0x1c2126, { roughness: 0.28, metalness: 0.05 }), 0, 0.925, 0));
  bench.add(mesh(new THREE.BoxGeometry(1.8, 0.012, 0.012), mat(0x3a4450, { metalness: 0.6, roughness: 0.3 }), 0, 0.93, 0.402));
  const cab = mat(0x7f8f9f, { roughness: 0.55 });
  bench.add(mesh(new THREE.BoxGeometry(1.72, 0.8, 0.7), cab, 0, 0.5, -0.02));
  bench.add(mesh(new THREE.BoxGeometry(1.72, 0.1, 0.66), mat(0x2a3138), 0, 0.05, -0.03));
  for (let i = 0; i < 4; i++) {
    const x = -0.645 + i * 0.43;
    bench.add(mesh(new THREE.BoxGeometry(0.41, 0.66, 0.006), mat(0x8c9cac, { roughness: 0.5 }), x, 0.5, 0.336));
    bench.add(mesh(new THREE.BoxGeometry(0.12, 0.012, 0.02), mat(0xc9d2db, { metalness: 0.9, roughness: 0.25 }), x, 0.78, 0.35));
  }
  const sh = blobShadow(2.2, 1.2, 0.5); sh.position.y = 0.002; bench.add(sh);
}

// control panel on a slim stand, in easy reach
const consoleDesk = new THREE.Group();
consoleDesk.position.set(0, 0, -0.3);
scene.add(consoleDesk);
{
  const metal = mat(0x1c2530, { metalness: 0.8, roughness: 0.3 });
  consoleDesk.add(noHit(mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.74, 24), metal, 0, 0.37, -0.04)));
  consoleDesk.add(noHit(mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.03, 32), metal, 0, 0.015, -0.04)));
  const sh = blobShadow(0.6, 0.6, 0.45); sh.position.set(0, 0.003, -0.04); consoleDesk.add(sh);
}
const panel = new THREE.Group();
panel.position.set(0, 0.86, 0);
panel.rotation.x = -0.85;
consoleDesk.add(panel);
{
  panel.add(noHit(mesh(new THREE.BoxGeometry(1.14, 0.46, 0.035), mat(0x121a24, { metalness: 0.75, roughness: 0.28 }), 0, 0, -0.03)));
  const tex = canvasTex(1024, 392, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 392); grd.addColorStop(0, '#17222e'); grd.addColorStop(1, '#0c131b');
    g.fillStyle = grd; g.fillRect(0, 0, 1024, 392);
    g.strokeStyle = 'rgba(95,209,255,0.07)'; g.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 392); g.stroke(); }
    for (let y = 0; y <= 392; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
    g.strokeStyle = 'rgba(95,209,255,0.22)'; g.lineWidth = 3; g.strokeRect(14, 14, 996, 364);
    g.fillStyle = 'rgba(95,209,255,0.35)'; g.font = '700 18px system-ui, sans-serif'; g.fillText('FIELD LAB  ·  CONTROL PANEL', 30, 372);
  });
  panel.add(noHit(mesh(new THREE.PlaneGeometry(1.1, 0.42), mat(0xffffff, { map: tex, metalness: 0.35, roughness: 0.55 }), 0, 0, -0.012)));
  for (const y of [0.23, -0.23]) panel.add(noHit(mesh(new THREE.BoxGeometry(1.14, 0.006, 0.006), basic(COL.accent), 0, y, -0.012)));
  for (const x of [0.57, -0.57]) panel.add(noHit(mesh(new THREE.BoxGeometry(0.006, 0.46, 0.006), basic(COL.accent), x, 0, -0.012)));
}

// boards on stands, either side of the bench
function standBoard(x, ry) {
  const b = board(0.96, 0.8);
  b.position.set(x, 1.5, -1.02); b.rotation.y = ry;
  scene.add(b);
  const pole = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.08, 12), mat(0x2a3440, { metalness: 0.7, roughness: 0.3 }), x, 0.54, -1.02);
  const foot = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.025, 24), mat(0x2a3440, { metalness: 0.7, roughness: 0.3 }), x, 0.012, -1.02);
  scene.add(noHit(pole), noHit(foot));
  return b;
}
const info = standBoard(-0.95, 0.68);
const data = standBoard(0.95, -0.68);
const toastHolder = new THREE.Group();
toastHolder.position.set(0, 1.97, -1.3);
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
const restartBtn = actionButton('Restart', 0.15, 0.065, () => current && startMission(missions.indexOf(current)), { bg: '#4b5d6e', size: 28, name: 'Restart this experiment' });
restartBtn.position.set(0.47, 0.08, 0);
panel.add(restartBtn);

// the apparatus sits on the bench (y = 0 is the bench top)
const app = new THREE.Group();
app.position.set(0, 0.95, -0.76);
scene.add(app);

// ---------------------------------------------------------------- shared helpers
const DIRS = { '+x': new V3(1, 0, 0), '-x': new V3(-1, 0, 0), '+y': new V3(0, 1, 0), '-y': new V3(0, -1, 0), '+z': new V3(0, 0, 1), '-z': new V3(0, 0, -1) };
const DIR_WORDS = { '+x': 'right', '-x': 'left', '+y': 'up', '-y': 'down', '+z': 'towards you', '-z': 'away from you' };
function dirKey(v) {
  const a = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)];
  const i = a.indexOf(Math.max(...a));
  return (v.getComponent(i) > 0 ? '+' : '-') + 'xyz'[i];
}
function setArrowColor(a, c) { a.traverse((o) => { if (o.material && o.material.color) o.material.color.set(c); }); }
// A pool of glowing dots (instanced): set(i, position, scale, color), then commit().
function dotPool(n, radius, parent, { additive = true, color = 0xffffff } = {}) {
  const m = additive ? glowMat(0xffffff) : basic(0xffffff);
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 10, 8), m, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  noHit(im); parent.add(im);
  const m4 = new THREE.Matrix4(), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { m4.makeScale(0, 0, 0); im.setMatrixAt(i, m4); im.setColorAt(i, col); }
  return {
    im,
    set(i, p, s = 1, c = null) { m4.makeScale(s, s, s).setPosition(p); im.setMatrixAt(i, m4); if (c != null) im.setColorAt(i, col.set(c)); },
    hide(i) { m4.makeScale(0, 0, 0); im.setMatrixAt(i, m4); },
    hideAll() { for (let i = 0; i < n; i++) this.hide(i); this.commit(); },
    commit() { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; },
  };
}
function glassBox(w, h, d) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhysicalMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.05, metalness: 0 })));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.55 })));
  return noHit(g);
}
// A trail of glowing beads (reads better in a headset than a 1-pixel line).
function beadTrail(color, n, parent, radius = 0.0032, spacing = 0.006) {
  const pool = dotPool(n, radius, parent, { color });
  const pts = [];
  const c = new THREE.Color(color);
  let bright = 1;
  const paint = () => { const cc = c.clone().multiplyScalar(bright); for (let i = 0; i < pts.length; i++) pool.set(i, pts[i], 1, cc.getHex()); pool.commit(); };
  return {
    clear() { pts.length = 0; pool.hideAll(); },
    push(v) { if (pts.length >= n) return; if (pts.length && pts[pts.length - 1].distanceTo(v) < spacing) return; pts.push(v.clone()); pool.set(pts.length - 1, v, 1, c.clone().multiplyScalar(bright).getHex()); pool.commit(); },
    setColor(cc, b = 1) { c.set(cc); bright = b; paint(); },
    copyFrom(o) { this.clear(); for (const p of o.points) pts.push(p.clone()); paint(); },
    get points() { return pts; },
  };
}
const poleLabel = (t, c) => textSprite(t, { size: 0.045, bg: c === 'N' ? 'rgba(160,30,25,0.9)' : 'rgba(25,60,160,0.9)', border: 'rgba(255,255,255,0.5)' });

// ---------------------------------------------------------------- stars saved in this browser
const STORE = 'field-lab-v2';
const N_EXP = 5;
let stars = new Array(N_EXP).fill(0);
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (Array.isArray(s)) stars = stars.map((_, i) => s[i] | 0); } catch { /* storage blocked */ }
function saveStars(i, n) {
  stars[i] = Math.max(stars[i], n);
  try { localStorage.setItem(STORE, JSON.stringify(stars)); } catch { /* storage blocked */ }
}
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ---------------------------------------------------------------- experiment framework
let current = null;
const missions = [];
function hideAll() {
  for (const m of missions) { if (m.world.visible || m === current) m.leave?.(); m.controls.visible = false; m.world.visible = false; }
  Q.cancel(); toast.hide(); hint.hide();
}
function startMission(i) {
  sfx.whoosh();
  hideAll();
  current = missions[i];
  menuGroup.visible = false; doneGroup.visible = false;
  restartBtn.visible = true; menuBtn.visible = true;
  current.controls.visible = true; current.world.visible = true;
  current.world.scale.setScalar(current.scale0 * 0.6);
  tween(0.5, (k) => current && current.world.scale.setScalar(current.scale0 * (0.6 + 0.4 * k)), easeOut);
  current.enter();
}
const doneGroup = new THREE.Group();
panel.add(doneGroup);
doneGroup.visible = false;
const nextBtn = actionButton('Next experiment', 0.32, 0.1, () => startMission(nextBtn.userData.next), { bg: '#1e8449', size: 30 });
nextBtn.position.set(-0.12, 0, 0);
const againBtn = actionButton('Play again', 0.22, 0.1, () => current && startMission(missions.indexOf(current)), { bg: '#4b5d6e', size: 28 });
againBtn.position.set(0.18, 0, 0);
doneGroup.add(nextBtn, againBtn);
function finishMission(m, n, lines = []) {
  const i = missions.indexOf(m);
  saveStars(i, n);
  m.controls.visible = false;
  Q.cancel(); hint.hide();
  celebrate(new V3(0, 1.6, -1.1), { stars: n });
  info.userData.draw([
    { t: `Experiment complete  ${starText(n)}`, size: 46, bold: true, color: '#ffd34d', gap: 16 },
    ...lines,
    { rule: true },
    i < missions.length - 1 ? { t: `Next: Experiment ${i + 2}, ${missions[i + 1].short}. Use the green button on the panel.`, size: 32, color: '#9fe2bf' }
      : { t: 'You have finished all five experiments. Excellent work!', size: 34, color: '#9fe2bf' },
  ], { title: m.title });
  doneGroup.visible = true;
  nextBtn.visible = i < missions.length - 1;
  nextBtn.userData.next = i + 1;
  if (nextBtn.visible) hint.show(nextBtn, [0, 0.08, 0.02]);
}
const askIf = (m) => (o) => (current === m ? Q.ask(o) : Promise.resolve(true));

const menuGroup = new THREE.Group();
panel.add(menuGroup);
const missionButtons = [];
function openMenu() {
  hideAll();
  doneGroup.visible = false;
  current = null;
  menuGroup.visible = true;
  restartBtn.visible = false; menuBtn.visible = false;
  missionButtons.forEach((b, i) => b.userData.draw(`${i + 1}. ${missions[i].short}\n${starText(stars[i])}`));
  const next = stars.findIndex((s) => s === 0);
  hint.show(missionButtons[next < 0 ? 0 : next], [0, 0.1, 0.02]);
  drawWelcome();
  data.userData.draw([
    { t: 'Data', size: 38, bold: true, color: '#ffd34d', gap: 10 },
    { t: 'e = 1.60 × 10⁻¹⁹ C       1 u = 1.66 × 10⁻²⁷ kg', size: 31, color: '#cfe3ff' },
    { t: 'mass of electron = 9.11 × 10⁻³¹ kg', size: 31, color: '#cfe3ff' },
    { t: 'mass of proton = 1.67 × 10⁻²⁷ kg', size: 31, color: '#cfe3ff' },
    { rule: true },
    { t: 'Equations', size: 34, bold: true, color: '#ffd34d' },
    { t: 'F = BIL sin θ          F = Bqv', size: 31 },
    { t: 'r = mv / Bq          E = V / d', size: 31 },
    { t: 'Φ = BA       E = −N dΦ/dt       E = BANω sin ωt', size: 31 },
    { rule: true },
    { t: `Stars: ${stars.map((s, i) => `${i + 1} ${starText(s)}`).join('  ')}`, size: 26, color: '#9fe2bf' },
  ], { title: 'Field Lab' });
}
function drawWelcome() {
  const w = words();
  info.userData.draw([
    { t: 'Form 6 · Electromagnetism, charged particles and induction', size: 31, color: '#9fb6cc', gap: 12 },
    { t: 'Magnetic forces act in three dimensions. Walk round them, test your predictions, then measure.', size: 32, gap: 10 },
    { t: '1. Motor Effect: predict the force on a wire.', size: 29, color: '#cfe3ff' },
    { t: '2. Particle Paths: steer particles onto a detector.', size: 29, color: '#cfe3ff' },
    { t: '3. Mass Spectrometer: select a speed, weigh atoms.', size: 29, color: '#cfe3ff' },
    { t: '4. Induction: push a magnet into a coil.', size: 29, color: '#cfe3ff' },
    { t: '5. Generator: make alternating current.', size: 29, color: '#cfe3ff', gap: 10 },
    { rule: true },
    { t: input.kind === 'hand' ? 'Touch buttons with a fingertip. Pinch glowing things to grab, turn or slide them. For far things, point and pinch.'
      : input.kind === 'controller' ? 'Touch buttons with the controller tip, or point and pull the trigger. Hold the trigger on a knob or object to move it.'
        : 'Click buttons. Drag knobs, handles and glowing objects. Drag the background to look around.', size: 28, color: '#ffd34d' },
    { t: `Choose an experiment on the panel (${w.select} it).`, size: 28, color: '#ffd34d' },
  ], { title: 'Field Lab' });
}
onKindChange(() => { if (!current) drawWelcome(); else current.redraw?.(); });

// ================================================================= Experiment 1: Motor Effect
const AIM_R = 0.2;
const m1 = { title: 'Experiment 1: Motor Effect', short: 'Motor Effect', controls: new THREE.Group(), world: new THREE.Group(), scale0: 1.45 };
missions.push(m1);
panel.add(m1.controls); app.add(m1.world);
m1.world.position.set(0, 0.33, 0);
{
  const W = m1.world;
  const poleBlock = (color) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.085, 0.085, 0.085), mat(color, { roughness: 0.35, metalness: 0.25 })));
    g.add(glowSprite(color, 0.16, 0.35));
    return noHit(g);
  };
  // a display plinth on the bench under the magnet rig
  const plinth = new THREE.Group(); plinth.position.y = -0.33 / 1.45;
  plinth.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.025, 40), mat(0x2a3440, { metalness: 0.7, roughness: 0.3 }), 0, 0.0125, 0));
  plinth.add(mesh(new THREE.TorusGeometry(0.15, 0.003, 6, 64).rotateX(Math.PI / 2), basic(COL.accent), 0, 0.026, 0));
  plinth.add(glowSprite(COL.accent, 0.35, 0.12).translateY(0.03));
  const psh = blobShadow(0.5, 0.5, 0.5); psh.position.y = 0.001; plinth.add(psh);
  W.add(noHit(plinth));
  m1.plinth = plinth;
  m1.poleN = poleBlock(COL.north); m1.poleS = poleBlock(COL.south);
  m1.labelN = poleLabel('N', 'N'); m1.labelS = poleLabel('S', 'S');
  W.add(m1.poleN, m1.poleS, m1.labelN, m1.labelS);
  m1.fieldArrows = [];
  for (let i = 0; i < 9; i++) { const a = arrow(COL.field, { radius: 0.0025, head: 0.018, glow: false }); W.add(a); m1.fieldArrows.push(a); }
  m1.fieldDots = dotPool(27, 0.0045, W, { color: 0x9fd0ff });
  // the wire, with yellow chevrons for the conventional current, and flowing charge when switched on
  m1.wire = new THREE.Group();
  m1.wireMat = mat(COL.copper, { metalness: 0.75, roughness: 0.3, emissive: 0xff8a2a, emissiveIntensity: 0 });
  m1.wireRod = mesh(new THREE.CylinderGeometry(0.007, 0.007, 1, 14), m1.wireMat);
  m1.wire.add(noHit(m1.wireRod));
  m1.ends = [0, 1].map(() => { const e = mesh(new THREE.SphereGeometry(0.012, 14, 10), mat(0x2a2f36, { metalness: 0.6 })); m1.wire.add(noHit(e)); return e; });
  m1.chevrons = [];
  for (let i = 0; i < 5; i++) { const c = mesh(new THREE.ConeGeometry(0.012, 0.028, 12), basic(COL.current)); m1.wire.add(noHit(c)); m1.chevrons.push(c); }
  m1.flowDots = dotPool(16, 0.006, m1.wire, { color: 0xffe28a });
  m1.labelI = textSprite('current I', { size: 0.032, color: '#ffe14d' });
  W.add(m1.wire, m1.labelI);
  // your prediction: a green arrow you aim by its handle (or with the direction buttons)
  m1.aim = arrow(COL.force, { radius: 0.007, head: 0.032 });
  W.add(m1.aim);
  m1.aimHandle = new THREE.Group();
  m1.aimBall = mesh(new THREE.SphereGeometry(0.02, 18, 12), mat(COL.force, { emissive: COL.force, emissiveIntensity: 0.5, roughness: 0.3 }));
  m1.aimHandle.add(m1.aimBall);
  W.add(m1.aimHandle);
  m1.aimDir = new V3(1, 1, 1).normalize();
  m1.aimGrab = grabbable(m1.aimHandle, {
    name: 'Force prediction arrow (grab and aim it)', space: W, haloSize: 0.12, color: 0x8ef0a8, hitRadius: 0.035,
    enabled: () => m1.phase === 'predict',
    constrain: (l) => { if (l.length() < 1e-4) return null; m1.aimDir.copy(l).normalize(); return l.normalize().multiplyScalar(AIM_R); },
    onGrab: () => hint.hide(),
    onMove: () => m1.drawAim(),
    onRelease: () => m1.choose(dirKey(m1.aimDir)),
  });
  m1.aimLabel = textSprite('', { size: 0.03, color: '#8ef0a8' });
  W.add(m1.aimLabel);
  // the real force, shown when the current is switched on
  m1.forceArrow = arrow(0xffffff, { radius: 0.006, head: 0.03 });
  W.add(m1.forceArrow);
  // Fleming's left hand: a palm with thumb, first and second fingers
  m1.hand = new THREE.Group();
  m1.hand.position.set(0.4, -0.02, 0.06);
  const skin = mat(0xe0b48f, { roughness: 0.6 });
  m1.hand.add(noHit(mesh(new THREE.SphereGeometry(0.03, 16, 12), skin)));
  m1.fingers = {};
  for (const [k, c, label] of [['F', COL.force, 'thuMb: Motion'], ['B', COL.field, 'First finger: Field'], ['I', COL.current, 'seCond finger: Current']]) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CapsuleGeometry(0.011, 0.07, 6, 12).translate(0, 0.055, 0), skin));
    g.add(mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.02, 12).translate(0, 0.06, 0), basic(c)));
    const lab = textSprite(label, { size: 0.024, color: cssOf(c) });
    g.add(lab); lab.position.y = 0.12;
    m1.hand.add(noHit(g));
    m1.fingers[k] = g;
  }
  const ht = textSprite('Left hand', { size: 0.028 }); ht.position.set(0, -0.07, 0); m1.hand.add(ht);
  W.add(m1.hand);

  // Part B: a turntable to set the angle between the wire and the field
  m1.table = new THREE.Group(); m1.table.position.y = -0.07;
  const prot = canvasPlane(0.34, 0.34, 1600);
  {
    const { ctx, c } = prot; const cx = c.width / 2, R = c.width * 0.47;
    ctx.fillStyle = 'rgba(15,22,30,0.85)'; ctx.beginPath(); ctx.arc(cx, cx, R, 0, 7); ctx.fill();
    ctx.strokeStyle = '#cfe3ff'; ctx.fillStyle = '#cfe3ff'; ctx.font = '700 30px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let d = 0; d <= 90; d += 5) {
      const a = -d * Math.PI / 180;            // canvas: 0° along +x, angles towards −z (up the canvas)
      const r0 = R * (d % 30 === 0 ? 0.8 : d % 10 === 0 ? 0.86 : 0.9);
      ctx.lineWidth = d % 10 === 0 ? 5 : 3;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * R, cx + Math.sin(a) * R); ctx.stroke();
      if (d % 30 === 0) ctx.fillText(`${d}°`, cx + Math.cos(a) * R * 0.68, cx + Math.sin(a) * R * 0.68);
    }
    prot.update();
  }
  prot.mesh.rotation.x = -Math.PI / 2; noHit(prot.mesh);
  m1.table.add(prot.mesh);
  m1.table.add(noHit(mesh(new THREE.CylinderGeometry(0.175, 0.18, 0.012, 48), mat(0x2a3440, { metalness: 0.6, roughness: 0.35 }), 0, -0.007, 0)));
  W.add(m1.table);
  m1.turnHandle = new THREE.Group();
  m1.turnHandle.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 16), mat(0xf2f4f7, { metalness: 0.4, roughness: 0.3 })));
  W.add(m1.turnHandle);
  m1.turnGrab = grabbable(m1.turnHandle, {
    name: 'Wire end (turn the wire)', space: W, haloSize: 0.1, hitRadius: 0.03,
    enabled: () => m1.phase === 'angle', planeNormal: new V3(0, 1, 0),
    constrain: (l) => {
      // the handle sits on the near end of the wire (−I direction), so it is easy to reach and see
      let th = Math.round(Math.atan2(l.z, -l.x) * 180 / Math.PI);
      th = clamp(th, 0, 90);
      m1.angle.set(th);
      const a = th * Math.PI / 180;
      return new V3(-Math.cos(a), 0, Math.sin(a)).multiplyScalar(m1.wireLen / 2);
    },
  });

  // panel controls
  m1.dirBtns = [['+y', 'Up'], ['-y', 'Down'], ['-x', 'Left'], ['+x', 'Right'], ['+z', 'Towards you'], ['-z', 'Away']].map(([k, t], i) => {
    const b = actionButton(t, 0.15, 0.07, () => { hint.hide(); m1.choose(k); }, { bg: '#2d4a66', size: 24, name: `Predict: force ${DIR_WORDS[k]}` });
    b.position.set(-0.44 + (i % 3) * 0.16, 0.1 - Math.floor(i / 3) * 0.085, 0);
    m1.controls.add(b);
    return b;
  });
  m1.testBtn = actionButton('Switch on\nand test', 0.22, 0.13, () => m1.test(), { bg: '#d0392b', size: 28 });
  m1.testBtn.position.set(0.12, 0.06, 0);
  m1.handBtn = actionButton('Show left hand', 0.22, 0.07, () => { m1.hints++; m1.showHand(true); sfx.blip(); m1.drawData(); }, { bg: '#8e44ad', size: 24 });
  m1.handBtn.position.set(0.12, -0.08, 0);
  m1.controls.add(m1.testBtn, m1.handBtn);
  m1.angle = slider({ name: 'Angle θ', min: 0, max: 90, step: 1, fine: 1, value: 90, length: 0.36, labelW: 0.42,
    format: (v) => `${v.toFixed(0)}°`, onChange: () => m1.updateB(), enabled: () => m1.phase === 'angle' });
  m1.angle.group.position.set(-0.18, 0.1, 0);
  m1.lockBtn = actionButton('Lock in angle', 0.26, 0.09, () => m1.lockAngle(), { bg: '#1e8449', size: 28 });
  m1.lockBtn.position.set(-0.18, -0.07, 0);
  m1.controls.add(m1.angle.group, m1.lockBtn);
}
m1.makeRounds = function () {
  const keys = Object.keys(DIRS);
  const all = [];
  for (const b of keys) for (const i of keys) if (b[1] !== i[1]) all.push([b, i]);
  const mustZ = shuffle(all.filter(([b, i]) => b[1] === 'z' || i[1] === 'z'));
  const noZ = shuffle(all.filter(([b, i]) => b[1] !== 'z' && i[1] !== 'z'));
  return [noZ[0], mustZ[0], noZ.find((r) => r[0][1] !== noZ[0][0][1]) || noZ[1], mustZ.find((r) => r[1][1] === 'z' && r !== mustZ[0]) || mustZ[1]];
};
m1.enter = function () {
  this.rounds = this.makeRounds();
  this.round = 0; this.right = 0; this.hints = 0; this.angleTries = 0; this.powered = false;
  this.setRound();
};
m1.leave = function () { this.powerOn(false); };
m1.setRound = function () {
  const [bk, ik] = this.rounds[this.round];
  this.B = DIRS[bk].clone(); this.I = DIRS[ik].clone();
  this.F = new V3().crossVectors(this.I, this.B);      // F = I L × B
  this.phase = 'predict';
  this.choice = null; this.result = null;
  this.layout(0.44);
  this.wire.position.set(0, 0, 0);
  this.aimDir.set(0.55, 0.62, 0.56).normalize();
  this.aimHandle.visible = true; this.aim.visible = true;
  this.drawAim();
  this.forceArrow.visible = false;
  this.showHand(false);
  this.powerOn(false);
  this.table.visible = false; this.turnHandle.visible = false;
  this.dirBtns.forEach((b) => { b.visible = true; b.userData.setOn(true); });
  this.testBtn.visible = true; this.testBtn.userData.setOn(false);
  this.handBtn.visible = true; this.handBtn.userData.setOn(true);
  this.angle.group.visible = false; this.lockBtn.visible = false;
  hint.show(this.aimHandle, [0, 0.06, 0]);
  this.redraw(); this.drawData();
};
m1.layout = function (wireLen) {
  const B = this.B;
  this.poleN.position.copy(B).multiplyScalar(-0.15);
  this.poleS.position.copy(B).multiplyScalar(0.15);
  const up = Math.abs(B.y) > 0.5 ? new V3(0.075, 0, 0) : new V3(0, 0.075, 0);
  this.labelN.position.copy(this.poleN.position).add(up);
  this.labelS.position.copy(this.poleS.position).add(up);
  this.u = Math.abs(B.x) > 0.5 ? DIRS['+y'].clone() : DIRS['+x'].clone();
  this.w = new V3().crossVectors(B, this.u).normalize();
  let k = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const s = B.clone().multiplyScalar(-0.1).addScaledVector(this.u, i * 0.03).addScaledVector(this.w, j * 0.03);
    this.fieldArrows[k++].userData.set(s, B.clone().multiplyScalar(0.2));
  }
  this.wireLen = wireLen;
  this.wireRod.scale.y = wireLen;
  this.ends[0].position.y = -wireLen / 2; this.ends[1].position.y = wireLen / 2;
  this.wire.quaternion.setFromUnitVectors(new V3(0, 1, 0), this.I);
  this.labelI.position.copy(this.I).multiplyScalar(wireLen / 2 + 0.04);
  this.chevrons.forEach((c, i) => c.position.set(0, -wireLen / 2 + (i + 0.5) / 5 * wireLen, 0));
};
m1.drawAim = function () {
  const d = this.aimDir;
  this.aim.userData.set(new V3(0, 0, 0), d.clone().multiplyScalar(AIM_R - 0.02));
  if (!this.aimGrab.held) this.aimHandle.position.copy(d).multiplyScalar(AIM_R);
  this.aimLabel.position.copy(d).multiplyScalar(AIM_R + 0.05);
  this.aimLabel.userData.set(this.choice ? `you: ${DIR_WORDS[this.choice]}` : 'aim me', this.choice ? '#8ef0a8' : '#cfe3ff');
  setArrowColor(this.aim, this.choice ? COL.force : 0x9aa5b0);
};
m1.choose = function (k) {
  if (this.phase !== 'predict') return;
  this.choice = k;
  sfx.snap();
  const from = this.aimDir.clone(), to = DIRS[k];
  tween(0.15, (t) => { this.aimDir.copy(from).lerp(to, t).normalize(); this.drawAim(); });
  this.dirBtns.forEach((b, i) => b.userData.draw(undefined, ['+y', '-y', '-x', '+x', '+z', '-z'][i] === k ? '#1e8449' : '#2d4a66'));
  this.testBtn.userData.setOn(true);
  hint.show(this.testBtn, [0, 0.09, 0.02]);
  this.drawAim();
};
m1.powerOn = function (on) {
  this.powered = on;
  this.wireMat.emissiveIntensity = on ? 0.35 : 0;
  if (!on) this.flowDots.hideAll();
};
m1.test = async function () {
  if (this.phase !== 'predict' || !this.choice) return;
  this.phase = 'testing';
  hint.hide();
  this.dirBtns.forEach((b) => b.userData.setOn(false)); this.testBtn.userData.setOn(false); this.handBtn.userData.setOn(false);
  this.powerOn(true);
  sfx.zap();
  const F = this.F, right = DIRS[this.choice].dot(F) > 0.9;
  await wait(0.35);
  if (current !== this) return;
  await tween(0.2, (k) => this.wire.position.copy(F).multiplyScalar(0.05 * easeOut(k)));
  this.wire.updateWorldMatrix(true, true);
  for (const e of this.ends) fx.emit(e.getWorldPosition(new V3()), { count: 18, colors: [0xffe28a, 0xffffff, 0xffa040], speed: 0.4, life: 0.4, size: 0.008, gravity: -1.5 });
  this.forceArrow.visible = true;
  this.forceArrow.userData.set(F.clone().multiplyScalar(0.05), F.clone().multiplyScalar(0.18));
  setArrowColor(this.forceArrow, right ? COL.force : 0xffffff);
  if (right) {
    this.right++;
    sfx.good();
    shockwave(this.wire.getWorldPosition(new V3()), { color: COL.force, size: 0.25 });
    this.result = { ok: true, text: `Right! The force is ${DIR_WORDS[dirKey(F)]}: at right angles to both the field and the current.` };
    toast(`Correct: the force is ${DIR_WORDS[dirKey(F)]}`, 'good', 2.4);
  } else {
    sfx.bad();
    this.result = { ok: false, text: `The wire moved ${DIR_WORDS[dirKey(F)]}, not ${DIR_WORDS[this.choice]}. Check with the left hand: First finger along the Field (blue), seCond finger along the Current (yellow); your thuMb gives the Motion.` };
    toast(`Not quite: it moved ${DIR_WORDS[dirKey(F)]}`, 'bad', 2.6);
    this.showHand(true);
  }
  this.redraw(); this.drawData();
  await wait(right ? 2.0 : 4.5);
  if (current !== this) return;
  await tween(0.3, (k) => this.wire.position.copy(F).multiplyScalar(0.05 * (1 - k)));
  this.round++;
  if (this.round < this.rounds.length) this.setRound(); else this.startAngle();
};
m1.showHand = function (on) {
  this.hand.visible = on;
  if (!on) return;
  for (const k of ['F', 'B', 'I']) this.fingers[k].quaternion.setFromUnitVectors(new V3(0, 1, 0), this[k]);
};
m1.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const w = words();
  if (this.phase === 'angle' || this.phase === 'angleDone') {
    info.userData.draw([
      { t: 'Part B: F = BIL sin θ', size: 36, bold: true, color: '#ffd34d' },
      { t: 'The wire now lies on a turntable. θ is the angle between the wire (the current) and the field. The current is switched on.', size: 30, gap: 10 },
      { t: `Task: turn the wire (${dragWord()} its white end, or use the slider) so the force is exactly HALF its biggest value. Then lock it in.`, size: 31, color: '#ffd34d', gap: 10 },
      { t: 'B = 0.20 T,  I = 3.0 A,  length in the field L = 5.0 cm', size: 29, color: '#cfe3ff' },
      this.angleMsg && { rule: true },
      this.angleMsg && { t: this.angleMsg, size: 29, color: '#ffb3a3' },
    ], { title: this.title });
    return;
  }
  info.userData.draw([
    { t: `Round ${this.round + 1} of ${this.rounds.length}`, size: 34, bold: true, color: '#ffd34d' },
    { t: 'A current flows in a wire between the poles of a magnet. Blue arrows: the field (N to S). Yellow cones: the current.', size: 30, gap: 8 },
    { t: `Predict the force on the wire: ${dragWord()} the green ball to aim the arrow, or use the direction buttons. Then switch on and test.`, size: 30, color: '#ffd34d', gap: 8 },
    { t: 'Walk round or lean in: some of these point towards you or away.', size: 27, color: '#9fb6cc' },
    this.result && { rule: true },
    this.result && { t: this.result.text, size: 29, color: this.result.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m1.drawData = function () {
  if (this.phase === 'angle' || this.phase === 'angleDone') {
    const th = this.angle.value, F = 0.2 * 3 * 0.05 * Math.sin(th * Math.PI / 180);
    data.userData.draw([
      { t: `θ = ${th.toFixed(0)}°        sin θ = ${Math.sin(th * Math.PI / 180).toFixed(3)}`, size: 34, bold: true },
      { t: 'F = BIL sin θ = 0.20 × 3.0 × 0.050 × sin θ', size: 29, color: '#cfe3ff' },
      { t: `F = ${F.toFixed(4)} N`, size: 42, bold: true, color: '#3ddc84' },
      { fn: (ctx, x, y, wd) => {                    // a force meter bar
        const h = 44; ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(ctx, x, y, wd, h, 12); ctx.fill();
        ctx.fillStyle = '#3ddc84'; roundRect(ctx, x, y, Math.max(8, wd * F / 0.03), h, 12); ctx.fill();
        ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + wd / 2, y - 6); ctx.lineTo(x + wd / 2, y + h + 6); ctx.stroke();
        ctx.fillStyle = '#ffd34d'; ctx.font = '700 24px system-ui'; ctx.textAlign = 'center'; ctx.fillText('half', x + wd / 2, y + h + 30); ctx.textAlign = 'left';
        return y + h + 40;
      } },
      { t: 'Biggest force (θ = 90°) = 0.0300 N', size: 29, color: '#9fb6cc' },
    ], { title: 'Force meter' });
    return;
  }
  data.userData.draw([
    { t: `Correct predictions: ${this.right} of ${this.round}`, size: 32 },
    { t: `Left-hand hints used: ${this.hints}`, size: 29, color: '#9fb6cc' },
    { rule: true },
    { t: 'Force on a current in a field', size: 32, bold: true, color: '#ffd34d' },
    { t: 'F = BIL sin θ', size: 42, bold: true },
    { t: 'The force is at right angles to both the current and the field. A current along the field feels no force.', size: 28, color: '#cfe3ff' },
  ], { title: 'Score' });
};
m1.startAngle = function () {
  this.phase = 'angle'; this.angleMsg = null;
  this.B = DIRS['+x'].clone(); this.I = DIRS['-z'].clone();
  this.F = new V3().crossVectors(this.I, this.B);
  this.layout(0.24);
  this.aimHandle.visible = false; this.aim.visible = false; this.aimLabel.userData.set('');
  this.showHand(false);
  this.powerOn(true);
  this.table.visible = true; this.turnHandle.visible = true;
  this.dirBtns.forEach((b) => (b.visible = false)); this.testBtn.visible = false; this.handBtn.visible = false;
  this.angle.group.visible = true; this.lockBtn.visible = true; this.lockBtn.userData.setOn(true);
  this.angle.set(90, true); this.angle.setEnabled();
  toast('Part B: the size of the force', 'info', 2.5);
  hint.show(this.turnHandle, [0, 0.06, 0]);
  this.updateB(); this.redraw();
};
m1.updateB = function () {
  const th = this.angle.value * Math.PI / 180;
  const dir = new V3(Math.cos(th), 0, -Math.sin(th));     // θ measured from the field (+x) towards −z
  this.I = dir;
  this.wire.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
  this.wire.position.set(0, 0, 0);
  this.labelI.position.copy(dir).multiplyScalar(this.wireLen / 2 + 0.05);
  if (!this.turnGrab.held) this.turnHandle.position.copy(dir).multiplyScalar(-this.wireLen / 2);
  const F = new V3().crossVectors(dir, this.B);
  this.forceArrow.visible = true;
  setArrowColor(this.forceArrow, COL.force);
  this.forceArrow.userData.set(new V3(0, 0.012 * Math.sign(F.y || 1), 0), F.clone().multiplyScalar(0.2));
  if (this.phase === 'angle') sfx.tick();
  this.drawData();
};
m1.lockAngle = async function () {
  if (this.phase !== 'angle') return;
  this.angleTries++;
  const th = this.angle.value;
  if (th === 30) {
    this.phase = 'angleDone'; hint.hide();
    sfx.good(); toast('Yes: sin 30° = 0.5, so F = 0.015 N, half of 0.030 N.', 'good', 3);
    celebrate(this.wire.getWorldPosition(new V3()), { stars: 0 });
    this.angle.setEnabled(); this.lockBtn.userData.setOn(false);
    await wait(3);
    if (current !== this) return;
    this.questions();
  } else {
    sfx.bad();
    const f = Math.sin(th * Math.PI / 180);
    this.angleMsg = `At ${th}° the force is ${(f * 100).toFixed(0)}% of the biggest. You need sin θ = 0.5.`;
    toast('Not half yet', 'bad', 2);
    this.redraw();
  }
};
m1.questions = async function () {
  this.phase = 'quiz';
  this.controls.visible = false;
  const go = askIf(this);
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
  this.powerOn(false);
  const score = this.right + ok - (this.hints > 1 ? 1 : 0) - (this.angleTries > 2 ? 1 : 0);
  const n = score >= 5 ? 3 : score >= 3 ? 2 : 1;
  finishMission(this, n, [
    { t: `Predictions right: ${this.right} of ${this.rounds.length}. Questions right first time: ${ok} of 2.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: "• Fleming's left-hand rule: First finger = Field, seCond finger = Current, thuMb = Motion.", size: 30 },
    { t: '• F = BIL sin θ: biggest at 90°, zero when the current is along the field.', size: 30 },
  ]);
};
const _p1 = new V3();
m1.tick = function (dt, t) {
  // field: dots flow from N to S along each field line
  const B = this.B;
  let k = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let n = 0; n < 3; n++) {
    const s = ((t * 0.25 + n / 3 + (i + j) * 0.13) % 1 + 1) % 1;
    _p1.copy(B).multiplyScalar(-0.1 + s * 0.2).addScaledVector(this.u, i * 0.03).addScaledVector(this.w, j * 0.03);
    this.fieldDots.set(k++, _p1, Math.sin(s * Math.PI));
  }
  this.fieldDots.commit();
  if (this.powered) {
    const L = this.wireLen;
    for (let i = 0; i < 16; i++) { const s = (t * 0.9 + i / 16) % 1; _p1.set(0, -L / 2 + s * L, 0); this.flowDots.set(i, _p1, 1); }
    this.flowDots.commit();
  }
  this.aimBall.material.emissiveIntensity = this.phase === 'predict' && !this.choice ? 0.4 + 0.35 * Math.sin(t * 5) : 0.5;
};

// ================================================================= Experiment 2: Particle Paths
const BOX = 0.27;                      // half-size of the vacuum chamber (m)
const P_ROUNDS = [
  { name: 'proton', q: E_CH, m: 1.67e-27, v: 2.0e6, d: 0.30, color: 0xff6a5a, unit: 'T', label: 'p⁺' },
  { name: 'electron', q: -E_CH, m: 9.11e-31, v: 3.0e7, d: 0.24, color: 0x5ab8ff, unit: 'mT', label: 'e⁻' },
  { name: 'alpha particle', q: 2 * E_CH, m: 6.64e-27, v: 1.5e6, d: 0.40, color: 0xffc14d, unit: 'T', label: 'α²⁺' },
];
const m2 = { title: 'Experiment 2: Particle Paths', short: 'Particle Paths', controls: new THREE.Group(), world: new THREE.Group(), scale0: 1 };
missions.push(m2);
panel.add(m2.controls); app.add(m2.world);
m2.world.position.set(0, 0.15, -0.1);
{
  const W = m2.world;
  W.add(glassBox(BOX * 2, 0.1, BOX * 2));
  const gridT = canvasTex(1024, 1024, (x, w) => {
    x.fillStyle = '#152230'; x.fillRect(0, 0, w, w);
    for (let i = 0; i <= 54; i++) { const p = i / 54 * w; x.strokeStyle = i % 10 === 0 ? 'rgba(120,180,240,0.55)' : 'rgba(120,180,240,0.16)'; x.lineWidth = i % 10 === 0 ? 3 : 1; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, w); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(w, p); x.stroke(); }
  });
  const fl = mesh(new THREE.PlaneGeometry(BOX * 2, BOX * 2), mat(0xffffff, { map: gridT, roughness: 0.6 }), 0, -0.05, 0);
  fl.rotation.x = -Math.PI / 2; W.add(noHit(fl));
  W.add(noHit(mesh(new THREE.BoxGeometry(BOX * 2 + 0.03, 0.02, BOX * 2 + 0.03), mat(0x2a3440, { metalness: 0.6, roughness: 0.35 }), 0, -0.062, 0)));
  const sh = blobShadow(0.9, 0.9, 0.5); sh.position.y = -0.149; W.add(sh);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) W.add(noHit(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.08, 10), mat(0x3a4450, { metalness: 0.7, roughness: 0.3 }), x * (BOX - 0.02), -0.11, z * (BOX - 0.02))));
  // Helmholtz coils above and below: they glow with the field, and the current runs round them
  m2.coilGlows = []; m2.coilChevrons = [];
  for (const s of [1, -1]) {
    const y = s * 0.09;
    const coil = mesh(new THREE.TorusGeometry(0.31, 0.014, 12, 96), mat(COL.copper, { metalness: 0.8, roughness: 0.3 }), 0, y, 0);
    coil.rotation.x = Math.PI / 2; W.add(noHit(coil));
    const glow = mesh(new THREE.TorusGeometry(0.31, 0.032, 8, 96), glowMat(COL.field, { opacity: 0 }), 0, y, 0);
    glow.rotation.x = Math.PI / 2; W.add(noHit(glow)); m2.coilGlows.push(glow);
    for (let i = 0; i < 10; i++) { const c = mesh(new THREE.ConeGeometry(0.012, 0.03, 10), basic(COL.current)); c.userData = { a0: i / 10 * Math.PI * 2, y }; W.add(noHit(c)); m2.coilChevrons.push(c); }
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) W.add(noHit(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 8), mat(0x55606b, { metalness: 0.6 }), Math.cos(a) * 0.31, y - s * 0.045 + (s > 0 ? 0 : 0), Math.sin(a) * 0.31)));
  }
  m2.fieldArrows = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const a = arrow(COL.field, { radius: 0.0022, head: 0.014, glow: false });
    a.userData.xz = [i * 0.1, j * 0.1];
    W.add(a); m2.fieldArrows.push(a);
  }
  m2.bLabel = textSprite('', { size: 0.032, color: '#9fd0ff' });
  m2.bLabel.position.set(BOX + 0.07, 0.12, -BOX);
  W.add(m2.bLabel);
  // the particle gun
  m2.gun = new THREE.Group();
  m2.gun.add(mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.09, 20).rotateZ(Math.PI / 2), mat(0x8a9aab, { metalness: 0.8, roughness: 0.3 })));
  for (const x of [-0.03, 0, 0.03]) m2.gun.add(mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 24).rotateY(Math.PI / 2), mat(0x3a4450, { metalness: 0.8 }), x, 0, 0));
  m2.muzzle = glowSprite(0xffffff, 0.06, 0.6); m2.muzzle.position.x = 0.05; m2.gun.add(m2.muzzle);
  W.add(noHit(m2.gun));
  // the detector: a glowing ring on the entry wall
  m2.target = new THREE.Group();
  m2.targetRing = mesh(new THREE.TorusGeometry(0.024, 0.005, 10, 32).rotateY(Math.PI / 2), mat(0x3ddc84, { emissive: 0x3ddc84, emissiveIntensity: 0.8 }));
  m2.targetGlow = glowSprite(0x3ddc84, 0.09, 0.5);
  m2.target.add(m2.targetRing, m2.targetGlow);
  m2.targetLabel = textSprite('detector', { size: 0.028, color: '#3ddc84' });
  m2.targetLabel.position.set(-0.03, 0.06, 0);
  m2.target.add(m2.targetLabel);
  W.add(noHit(m2.target));
  m2.dot = new THREE.Group();
  m2.dotCore = mesh(new THREE.SphereGeometry(0.009, 12, 8), basic(0xffffff));
  m2.dotGlow = glowSprite(0xffffff, 0.07, 0.9);
  m2.dot.add(m2.dotCore, m2.dotGlow); noHit(m2.dot);
  W.add(m2.dot);
  m2.trails = [0, 1, 2].map(() => beadTrail(0xffffff, 200, W));

  const fmtT = (v) => `${v.toFixed(3)} T`;
  const fmtmT = (v) => `${v.toFixed(2)} mT`;
  const en = () => m2.phase === 'aim';
  m2.dialT = dial({ name: 'Field strength', min: 0, max: 0.3, step: 0.005, fine: 0.001, value: 0, format: fmtT, onChange: () => m2.fieldChanged(), enabled: en, color: COL.field });
  m2.dialmT = dial({ name: 'Field strength', min: 0, max: 3, step: 0.05, fine: 0.01, value: 0, format: fmtmT, onChange: () => m2.fieldChanged(), enabled: en, color: COL.field });
  for (const d of [m2.dialT, m2.dialmT]) { d.group.position.set(-0.38, 0.02, 0); m2.controls.add(d.group); }
  m2.dirT = toggle({ labels: ['Field UP', 'Field DOWN'], value: 0, name: 'Field direction', w: 0.26, h: 0.075, colors: ['#2c6e91', '#8e44ad'], onChange: () => m2.fieldChanged(), enabled: en });
  m2.dirT.group.position.set(-0.04, 0.12, 0);
  m2.fireBtn = actionButton('FIRE', 0.2, 0.11, () => m2.fire(), { bg: '#d0392b', size: 36 });
  m2.fireBtn.position.set(-0.06, -0.04, 0);
  m2.hintBtn = actionButton('Hint', 0.14, 0.075, () => { m2.hints++; sfx.blip(); m2.redraw(); }, { bg: '#8e44ad', size: 28 });
  m2.hintBtn.position.set(0.17, -0.04, 0);
  m2.controls.add(m2.dirT.group, m2.fireBtn, m2.hintBtn);
}
m2.enter = function () {
  this.round = 0; this.shots = 0; this.hints = 0;
  this.rounds = P_ROUNDS.map((r) => ({ ...r, side: Math.random() < 0.5 ? 1 : -1 }));
  this.setRound();
};
m2.dial = function () { return this.R.unit === 'mT' ? this.dialmT : this.dialT; };
m2.Bvalue = function () { const s = this.dirT.value === 0 ? 1 : -1; return s * (this.R.unit === 'mT' ? this.dial().value / 1000 : this.dial().value); };
m2.setRound = function () {
  this.R = this.rounds[this.round];
  this.phase = 'aim'; this.result = null; this.lastPath = null;
  const R = this.R;
  this.z0 = -R.side * 0.17;                        // gun on the opposite side from the detector
  this.zT = this.z0 + R.side * R.d;
  this.gun.position.set(-BOX - 0.045, 0, this.z0);
  this.target.position.set(-BOX + 0.004, 0, this.zT);
  this.dialT.group.visible = R.unit === 'T'; this.dialmT.group.visible = R.unit === 'mT';
  this.dial().set(0, true); this.dirT.set(0, true); this.dial().setEnabled(); this.dirT.refresh();
  this.fireBtn.userData.setOn(true);
  this.dotCore.material.color.set(R.color); this.dotGlow.material.color.set(R.color); this.dot.visible = false;
  this.trails.forEach((tr) => tr.clear());
  hint.show(this.dial().group, [0, 0.16, 0.03]);
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
  this.coilGlows.forEach((g) => (g.material.opacity = 0.05 + 0.45 * k * (B !== 0 ? 1 : 0)));
  this.bLabel.userData.set(B === 0 ? 'B = 0 (no field)' : `B ${B > 0 ? 'upwards ↑' : 'downwards ↓'}`);
  if (this.phase === 'aim') hint.show(this.fireBtn, [0, 0.09, 0.02]);
  this.drawData();
};
// The path is a circle: centre beside the gun, on the side the force first points.
m2.path = function () {
  const R = this.R, B = this.Bvalue();
  const start = new V3(-BOX, 0, this.z0);
  const pts = [start.clone()];
  if (B === 0) { for (let i = 1; i <= 40; i++) pts.push(new V3(-BOX + i / 40 * 2 * BOX, 0, this.z0)); return { pts, r: Infinity, end: 'far', endP: pts[pts.length - 1] }; }
  const r = R.m * R.v / (Math.abs(R.q) * Math.abs(B));
  // initial force: q v × B with v = +x and B = (0, B, 0): x × y = +z
  const s = Math.sign(R.q * B);
  const c = start.clone().add(new V3(0, 0, s * r));
  let end = 'wall', endP = null;
  for (let i = 1; i <= 2000; i++) {
    const ph = i / 2000 * Math.PI * 1.02;
    const p = new V3(c.x + r * Math.sin(ph), 0, c.z - s * r * Math.cos(ph));
    if (p.x < -BOX) {
      const pPrev = pts[pts.length - 1];
      const k = (-BOX - pPrev.x) / (p.x - pPrev.x);
      endP = pPrev.clone().lerp(p, k); pts.push(endP); end = 'entry'; break;
    }
    if (p.x > BOX || Math.abs(p.z) > BOX) { endP = p; pts.push(p); end = 'far'; break; }
    if (i % 6 === 0) pts.push(p);
  }
  if (!endP) endP = pts[pts.length - 1];
  return { pts, r, end, endP, s };
};
m2.fire = async function () {
  if (this.phase !== 'aim') return;
  this.phase = 'flying'; this.shots++; this.result = null;
  hint.hide();
  this.dial().setEnabled(); this.dirT.refresh(); this.fireBtn.userData.setOn(false);
  const P = this.path();
  this.lastPath = P;
  // keep the last two shots as faint ghosts
  this.trails[2].copyFrom(this.trails[1]); this.trails[2].setColor(0x8fa8c0, 0.25);
  this.trails[1].copyFrom(this.trails[0]); this.trails[1].setColor(0x8fa8c0, 0.45);
  const tr = this.trails[0]; tr.clear(); tr.setColor(this.R.color, 1.4);
  sfx.zap();
  this.gun.updateWorldMatrix(true, true);
  fx.emit(this.muzzle.getWorldPosition(new V3()), { count: 14, color: this.R.color, speed: 0.25, life: 0.3, size: 0.01 });
  this.dot.visible = true;
  let len = 0; for (let i = 1; i < P.pts.length; i++) len += P.pts[i].distanceTo(P.pts[i - 1]);
  const total = P.pts.length;
  let shown = 0;
  await tween(clamp(len / 0.45, 0.6, 2.2), (k) => {
    const n = Math.max(1, Math.floor(k * (total - 1)) + 1);
    while (shown < n) tr.push(P.pts[shown++]);
    this.dot.position.copy(P.pts[n - 1]);
  }, (k) => k);
  if (current !== this) return;
  this.dot.visible = false;
  this.world.updateWorldMatrix(true, true);
  const wp = this.world.localToWorld(P.endP.clone());
  fx.emit(wp, { count: 26, colors: [this.R.color, 0xffffff], speed: 0.35, life: 0.5, size: 0.009 });
  this.judge(P);
};
m2.judge = async function (P) {
  const R = this.R;
  const landed = P.end === 'entry' ? Math.abs(P.endP.z - this.z0) : null;
  const rightWay = P.end !== 'far' ? Math.sign(P.endP.z - this.z0) === R.side : null;
  const need = R.d / 2;
  let ok = false, text;
  const carrier = R.q < 0 ? `For an ${R.name} (negative charge) the current is OPPOSITE to its motion, so point your second finger backwards.` : `For a positive ${R.name} the current is along its motion.`;
  if (P.r === Infinity) text = 'With no field there is no force, so it goes straight. Turn the field up.';
  else if (P.s !== R.side) text = `It curved the wrong way. ${carrier} Reverse the field.`;
  else if (P.end === 'far') text = `The path radius r = mv/Bq = ${(P.r * 100).toFixed(1)} cm is too big, so it hit the far wall. A stronger field gives a smaller circle.`;
  else if (!rightWay) text = `It curved the wrong way. ${carrier} Reverse the field.`;
  else if (Math.abs(landed - R.d) <= 0.012) { ok = true; text = `Hit! r = mv/Bq = ${(P.r * 100).toFixed(1)} cm, so it lands 2r = ${(2 * P.r * 100).toFixed(1)} cm from the gun.`; }
  else text = `It landed ${(landed * 100).toFixed(1)} cm from the gun (r = ${(P.r * 100).toFixed(1)} cm). The detector is ${(R.d * 100).toFixed(0)} cm away, so r must be ${(need * 100).toFixed(0)} cm. ${landed > R.d ? 'Make the field stronger.' : 'Make the field weaker.'}`;
  this.result = { ok, text };
  if (ok) {
    sfx.great(); toast(`Hit the detector with the ${R.name}!`, 'good', 2.5);
    this.target.updateWorldMatrix(true, true);
    const tp = this.target.getWorldPosition(new V3());
    celebrate(tp, { stars: 0 }); shockwave(tp, { color: 0x3ddc84, size: 0.2, normal: new V3(1, 0, 0) });
  } else { sfx.bad(); toast('Missed the detector', 'bad', 2); }
  this.redraw(); this.drawData();
  if (ok) {
    this.phase = 'hit';
    await wait(3.2);
    if (current !== this) return;
    this.round++;
    if (this.round < this.rounds.length) this.setRound(); else this.questions();
  } else {
    this.phase = 'aim';
    this.dial().setEnabled(); this.dirT.refresh(); this.fireBtn.userData.setOn(true);
    hint.show(this.dial().group, [0, 0.16, 0.03]);
  }
};
m2.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const R = this.R;
  const hints = [
    'Hint 1: the magnetic force Bqv is the centripetal force: Bqv = mv²/r, so r = mv/Bq.',
    `Hint 2: it turns through a semicircle, so it lands 2r from the gun: r = ${(R.d * 50).toFixed(0)} cm = ${(R.d / 2).toFixed(2)} m.`,
    `Hint 3: B = mv/(qr). For the direction use the left-hand rule (${R.q < 0 ? 'the current is opposite to an electron\'s motion' : 'the current is along the motion'}).`,
  ].slice(0, this.hints);
  info.userData.draw([
    { t: `Round ${this.round + 1} of 3: ${R.name}`, size: 36, bold: true, color: '#ffd34d' },
    { t: 'A beam enters a vacuum chamber travelling to the right. Coils above and below make a vertical magnetic field.', size: 30, gap: 8 },
    { t: `Set the field (strength on the dial, and up or down) so the ${R.name} lands on the green detector ${(R.d * 100).toFixed(0)} cm from the gun. Then FIRE.`, size: 30, color: '#ffd34d', gap: 8 },
    ...hints.map((t) => ({ t, size: 27, color: '#e0b3ff', gap: 4 })),
    this.result && { rule: true },
    this.result && { t: this.result.text, size: 28, color: this.result.ok ? '#8ef0a8' : '#ffb3a3' },
  ], { title: this.title });
};
m2.drawData = function () {
  const R = this.R;
  data.userData.draw([
    { t: `Particle: ${R.name} (${R.label})`, size: 34, bold: true, color: cssOf(R.color) },
    { t: `charge q = ${R.q < 0 ? '−' : '+'}${sig(Math.abs(R.q))} C`, size: 30 },
    { t: `mass m = ${sig(R.m)} kg`, size: 30 },
    { t: `speed v = ${sig(R.v)} m/s`, size: 30 },
    { t: `gun to detector = ${(R.d * 100).toFixed(0)} cm`, size: 30 },
    { rule: true },
    { t: `Field B = ${sig(Math.abs(this.Bvalue()))} T ${this.Bvalue() > 0 ? 'upwards' : this.Bvalue() < 0 ? 'downwards' : ''}`, size: 32, color: '#9fd0ff' },
    this.lastPath && this.lastPath.r !== Infinity && { t: `Last shot: radius r = ${(this.lastPath.r * 100).toFixed(1)} cm`, size: 30, color: '#9fb6cc' },
    { t: `Shots: ${this.shots}`, size: 28, color: '#9fb6cc' },
  ], { title: 'Beam data' });
};
m2.questions = async function () {
  this.phase = 'quiz';
  this.controls.visible = false;
  const go = askIf(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 2', q: 'An electron and a proton enter the same field at the same speed. Compared with the proton\'s path, the electron\'s path…',
    options: ['is a much smaller circle, curving the opposite way', 'is a bigger circle, curving the same way', 'is the same size, curving the opposite way', 'is a straight line'], correct: 0,
    explain: 'r = mv/Bq: the electron\'s mass is about 1/1840 of the proton\'s, so its circle is far smaller. Its charge is negative, so it curves the other way.',
    why: ['', 'r = mv/Bq, and the electron is much LESS massive.', 'Same size would need equal mass. The electron is about 1840 times lighter.', 'A moving charge crossing a field always feels a force.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 2', q: 'Why does the particle keep the same speed all the way round its circle?',
    options: ['The field is uniform', 'The magnetic force is always at right angles to the velocity, so it does no work', 'There is no air in the chamber', 'The charge is very small'], correct: 1,
    explain: 'F = Bqv is perpendicular to v, so it changes direction only. No work is done and the kinetic energy stays constant.',
    why: ['A uniform field explains the constant radius, not why the speed stays the same.', '', 'A vacuum removes collisions, but the reason here is the direction of the force.', 'Even a small charge would be sped up by a force along its motion.'] }) ? 1 : 0;
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
m2.tick = function (dt, t) {
  const B = this.R ? this.Bvalue() : 0, s = Math.sign(B);
  for (const c of this.coilChevrons) {
    c.visible = B !== 0;
    if (!c.visible) continue;
    const a = c.userData.a0 + s * t * 0.8;
    c.position.set(Math.cos(a) * 0.31, c.userData.y, -Math.sin(a) * 0.31);
    c.quaternion.setFromUnitVectors(new V3(0, 1, 0), new V3(-Math.sin(a) * s, 0, -Math.cos(a) * s));
  }
  this.targetGlow.material.opacity = 0.35 + 0.25 * Math.sin(t * 4);
  this.muzzle.material.opacity = 0.4 + 0.2 * Math.sin(t * 7);
};

// ================================================================= Experiment 3: Mass Spectrometer
const B1 = 0.10, B2 = 0.20, PLATE_GAP = 0.04, V_SEL = 2.0e5;
const SEL_X0 = -0.42, SEL_X1 = -0.2, SLIT_X = -0.18, ENTRY_X = -0.17;
const ISOTOPES = [{ A: 20, w: 0.6, color: 0xff7b54 }, { A: 21, w: 0.15, color: 0xffd34d }, { A: 22, w: 0.25, color: 0x6fd3ff }];
const N_IONS = 240;
const m3 = { title: 'Experiment 3: Mass Spectrometer', short: 'Mass Spectrometer', controls: new THREE.Group(), world: new THREE.Group(), scale0: 1.3 };
missions.push(m3);
panel.add(m3.controls); app.add(m3.world);
m3.world.position.set(0.14, 0.063, 0.06);
{
  const W = m3.world;
  const steel = mat(0x7f8c99, { metalness: 0.75, roughness: 0.3 });
  W.add(noHit(mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), steel, -0.5, 0, 0)));
  W.add(noHit(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12).rotateZ(Math.PI / 2), steel, -0.455, 0, 0)));
  m3.srcGlow = glowSprite(0xff9a5a, 0.08, 0.6); m3.srcGlow.position.set(-0.44, 0, 0); W.add(m3.srcGlow);
  const srcLabel = textSprite('neon ion source', { size: 0.026 }); srcLabel.position.set(-0.5, 0.075, 0); W.add(srcLabel);
  // velocity selector: + plate at −z, − plate at +z, magnetic field B1 downwards
  m3.plateMatP = mat(0xd64541, { metalness: 0.5, roughness: 0.35, emissive: 0xff3020, emissiveIntensity: 0 });
  m3.plateMatN = mat(0x2f6fd6, { metalness: 0.5, roughness: 0.35, emissive: 0x2050ff, emissiveIntensity: 0 });
  const pw = SEL_X1 - SEL_X0;
  W.add(noHit(mesh(new THREE.BoxGeometry(pw, 0.06, 0.004), m3.plateMatP, (SEL_X0 + SEL_X1) / 2, 0, -PLATE_GAP / 2 - 0.002)));
  W.add(noHit(mesh(new THREE.BoxGeometry(pw, 0.06, 0.004), m3.plateMatN, (SEL_X0 + SEL_X1) / 2, 0, PLATE_GAP / 2 + 0.002)));
  const lp = textSprite('+', { size: 0.035, bg: 'rgba(150,20,20,0.9)' }); lp.position.set(SEL_X1 - 0.02, 0.055, -PLATE_GAP / 2 - 0.02);
  const ln = textSprite('−', { size: 0.035, bg: 'rgba(20,50,150,0.9)' }); ln.position.set(SEL_X1 - 0.02, 0.055, PLATE_GAP / 2 + 0.02);
  W.add(lp, ln);
  const selLabel = textSprite('velocity selector', { size: 0.026 }); selLabel.position.set((SEL_X0 + SEL_X1) / 2, -0.06, 0.07); W.add(selLabel);
  m3.eArrows = [];
  for (let i = 0; i < 4; i++) { const a = arrow(COL.efield, { radius: 0.0018, head: 0.01, glow: false }); W.add(a); m3.eArrows.push(a); }
  // slit
  W.add(noHit(mesh(new THREE.BoxGeometry(0.006, 0.06, 0.05), steel, SLIT_X, 0, 0.03)));
  W.add(noHit(mesh(new THREE.BoxGeometry(0.006, 0.06, 0.05), steel, SLIT_X, 0, -0.03)));
  // deflection chamber, detector plate and ruler (along −z from the slit)
  const ch = glassBox(0.3, 0.06, 0.52); ch.position.set(ENTRY_X + 0.15, 0, -0.26 + 0.005); W.add(ch);
  W.add(noHit(mesh(new THREE.BoxGeometry(0.008, 0.06, 0.5), mat(0x2b2f36, { metalness: 0.5 }), ENTRY_X - 0.005, 0, -0.27)));
  W.add(noHit(mesh(new THREE.BoxGeometry(0.62, 0.012, 0.6), mat(0x2a3440, { metalness: 0.6, roughness: 0.35 }), -0.15, -0.042, -0.2)));
  const sh = blobShadow(0.9, 0.8, 0.45); sh.position.set(-0.15, -0.049, -0.2); W.add(sh);
  m3.ruler = (function ruler() {
    const w = 0.5, h = 0.05;
    const t = canvasTex(2500, 250, (ctx, cw, chh) => {
      ctx.fillStyle = '#f3ead2'; ctx.fillRect(0, 0, cw, chh);
      ctx.fillStyle = '#222'; ctx.strokeStyle = '#222';
      for (let mm = 0; mm <= 500; mm += 2) {
        const x = 20 + mm / 500 * (cw - 40);
        const L = mm % 50 === 0 ? 120 : mm % 10 === 0 ? 80 : 40;
        ctx.lineWidth = mm % 10 === 0 ? 5 : 2;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, L); ctx.stroke();
        if (mm % 50 === 0) { ctx.font = 'bold 70px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(mm / 10), x, 200); }
      }
      ctx.font = 'bold 50px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('cm from the slit', 1900, 200);
    });
    const m = mesh(new THREE.PlaneGeometry(w + 0.008, h), new THREE.MeshBasicMaterial({ map: t }));
    m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    m.position.set(ENTRY_X - 0.035, -0.035, -0.25);
    return noHit(m);
  })();
  W.add(m3.ruler);
  m3.b2Arrows = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
    const a = arrow(COL.field, { radius: 0.002, head: 0.012, glow: false });
    a.userData.set(new V3(ENTRY_X + 0.05 + i * 0.09, 0.025, -0.05 - j * 0.1), new V3(0, -0.05, 0));
    W.add(a); m3.b2Arrows.push(a);
  }
  const b2Label = textSprite('B₂ = 0.20 T (down)', { size: 0.026, color: '#9fd0ff' }); b2Label.position.set(ENTRY_X + 0.2, 0.06, -0.5); W.add(b2Label);
  m3.b1Arrows = [];
  for (let i = 0; i < 4; i++) {
    const a = arrow(COL.field, { radius: 0.002, head: 0.012, glow: false });
    a.userData.set(new V3(SEL_X0 + 0.03 + i * 0.055, 0.045, 0), new V3(0, -0.035, 0));
    W.add(a); m3.b1Arrows.push(a);
  }
  m3.ions = dotPool(N_IONS, 0.0045, W, { additive: false });
  m3.spots = ISOTOPES.map((iso) => {
    const g = new THREE.Group();
    const r = iso.A * U * V_SEL / (E_CH * B2);
    g.position.set(ENTRY_X - 0.0095, 0, -2 * r);
    const bar = mesh(new THREE.BoxGeometry(0.004, 0.05, 0.006), new THREE.MeshBasicMaterial({ color: iso.color, transparent: true, opacity: 0, toneMapped: false }));
    const glow = glowSprite(iso.color, 0.06, 0);
    g.add(bar, glow); noHit(g);
    g.userData = { d: 2 * r, bar, glow };
    W.add(g);
    return g;
  });
  // the measuring marker: slide it along the ruler
  m3.marker = new THREE.Group();
  m3.marker.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.008), mat(0xe74c3c, { emissive: 0xe74c3c, emissiveIntensity: 0.4 })));
  m3.marker.add(noHit(mesh(new THREE.BoxGeometry(0.06, 0.0015, 0.0015), basic(0xff4a3a), 0.03, 0, 0)));
  m3.markerLabel = textSprite('', { size: 0.026, color: '#ffd34d' });
  m3.markerLabel.position.set(-0.03, 0.035, 0); m3.marker.add(m3.markerLabel);
  W.add(m3.marker);
  m3.markGrab = grabbable(m3.marker, {
    name: 'Measuring marker (slide it along the ruler)', space: W, haloSize: 0.08, hitRadius: 0.025, color: 0xff8a7a,
    enabled: () => m3.phase === 'measure', planeNormal: new V3(0, 1, 0),
    constrain: (l) => { const d = clamp(Math.round(-l.z * 1000) / 10, 0, 50); m3.markSlider.set(d); return new V3(ENTRY_X - 0.035, -0.02, -d / 100); },
    onGrab: () => hint.hide(),
  });
  // controls
  m3.dial = dial({ name: 'Plate voltage', min: 0, max: 1600, step: 10, fine: 1, value: 300, format: (v) => `${v.toFixed(0)} V`,
    onChange: () => { m3.updatePlates(); m3.drawData(); }, enabled: () => m3.phase === 'select', color: COL.efield });
  m3.dial.group.position.set(-0.38, 0.02, 0);
  m3.checkBtn = actionButton('Check speed', 0.24, 0.1, () => m3.check(), { bg: '#1e8449', size: 30 });
  m3.checkBtn.position.set(-0.06, 0.02, 0);
  m3.markSlider = slider({ name: 'Marker', min: 0, max: 50, step: 0.1, fine: 0.1, value: 30, length: 0.4, labelW: 0.42,
    format: (v) => `${v.toFixed(1)} cm`, onChange: () => m3.placeMarker(), enabled: () => m3.phase === 'measure' });
  m3.markSlider.group.position.set(-0.2, 0.1, 0);
  m3.recordBtn = actionButton('Record spot', 0.24, 0.1, () => m3.record(), { bg: '#1e8449', size: 30 });
  m3.recordBtn.position.set(-0.2, -0.07, 0);
  m3.controls.add(m3.dial.group, m3.checkBtn, m3.markSlider.group, m3.recordBtn);
}
m3.enter = function () {
  this.phase = 'select'; this.checks = 0; this.stageB = false; this.result = null; this.misses = 0;
  this.ionList = []; this.spawnT = 0; this.passed = []; this.hitCount = [0, 0, 0]; this.recorded = [null, null, null];
  this.ions.hideAll();
  this.spots.forEach((s) => { s.userData.bar.material.opacity = 0; s.userData.glow.material.opacity = 0; });
  this.dial.set(300, true); this.dial.setEnabled();
  this.dial.group.visible = true; this.checkBtn.visible = true; this.checkBtn.userData.setOn(true);
  this.markSlider.group.visible = false; this.recordBtn.visible = false; this.marker.visible = false;
  this.b2Arrows.forEach((a) => (a.visible = false));
  hint.show(this.dial.group, [0, 0.16, 0.03]);
  this.updatePlates(); this.redraw(); this.drawData();
};
m3.E = function () { return this.dial.value / PLATE_GAP; };
m3.updatePlates = function () {
  const k = this.dial.value / 1600;
  this.plateMatP.emissiveIntensity = 0.1 + 0.9 * k; this.plateMatN.emissiveIntensity = 0.1 + 0.9 * k;
  this.eArrows.forEach((a, i) => {
    a.visible = k > 0.01;
    a.userData.set(new V3(SEL_X0 + 0.03 + i * 0.055, -0.015, -PLATE_GAP / 2 + 0.002), new V3(0, 0, (PLATE_GAP - 0.004) * Math.min(1, 0.25 + k)));
  });
};
m3.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const w = words();
  if (!this.stageB) {
    info.userData.draw([
      { t: 'Stage 1: the velocity selector', size: 36, bold: true, color: '#ffd34d' },
      { t: 'Neon ions (+1 charge) leave the source at many speeds. Between the plates the electric force qE pushes one way and the magnetic force Bqv the other.', size: 29, gap: 8 },
      { t: 'Turn the voltage dial so only ions with v = 2.0 × 10⁵ m/s go straight through the slit. Then press Check speed.', size: 30, color: '#ffd34d', gap: 8 },
      { t: 'B₁ = 0.10 T,  plate gap d = 4.0 cm.  Use qE = Bqv and E = V/d.', size: 28, color: '#cfe3ff' },
      { t: 'Ion colour shows speed: red is slow, blue is fast.', size: 26, color: '#9fb6cc' },
      this.result && { rule: true },
      this.result && { t: this.result, size: 28, color: '#ffb3a3' },
    ], { title: this.title });
  } else {
    const done = this.recorded.filter((x) => x != null).length;
    info.userData.draw([
      { t: 'Stage 2: weighing the ions', size: 36, bold: true, color: '#ffd34d' },
      { t: 'Ions at 2.0 × 10⁵ m/s enter field B₂ = 0.20 T, travel a semicircle and land a distance 2r from the slit. Neon has three isotopes, so three lines build up.', size: 29, gap: 8 },
      { t: `Measure each line: ${dragWord()} the red marker along the ruler (or use the Marker slider) until it sits on a line, then Record spot.`, size: 30, color: '#ffd34d', gap: 8 },
      { t: `Lines measured: ${done} of 3`, size: 30, color: '#cfe3ff' },
      this.result && { rule: true },
      this.result && { t: this.result, size: 28, color: '#ffb3a3' },
    ], { title: this.title });
  }
};
m3.drawData = function () {
  const V = this.dial.value, E = this.E();
  const rate = this.passed.length;
  const lines = [
    { t: `Plate voltage V = ${V.toFixed(0)} V`, size: 33, bold: true },
    { t: `E = V / d = ${sig(E)} V/m      B₁ = 0.10 T`, size: 30, color: '#ff9b9b' },
    { t: `Ions through the slit (last 2 s): ${rate}`, size: 29, color: '#cfe3ff' },
  ];
  if (this.stageB) {
    lines.push({ rule: true }, { t: 'Detector counts', size: 30, bold: true, color: '#ffd34d' }, { fn: (ctx, x, y, wd) => {
      const h = 150, max = Math.max(10, ...this.hitCount);
      ISOTOPES.forEach((iso, i) => {
        const bx = x + 40 + i * (wd - 80) / 3, bw = (wd - 80) / 3 - 40, bh = h * this.hitCount[i] / max;
        ctx.fillStyle = cssOf(iso.color); roundRect(ctx, bx, y + h - bh, bw, Math.max(2, bh), 8); ctx.fill();
        ctx.fillStyle = '#cfe3ff'; ctx.font = '700 24px system-ui'; ctx.textAlign = 'center';
        const rec = this.recorded[i];
        ctx.fillText(rec != null ? `${rec.toFixed(1)} cm` : `line ${i + 1}`, bx + bw / 2, y + h + 28);
        ctx.fillText(String(this.hitCount[i]), bx + bw / 2, y + h - bh - 8);
      });
      ctx.textAlign = 'left';
      return y + h + 40;
    } });
  }
  lines.push({ t: `Speed checks: ${this.checks}`, size: 26, color: '#9fb6cc' });
  data.userData.draw(lines, { title: 'Spectrometer' });
};
m3.check = async function () {
  if (this.phase !== 'select') return;
  this.checks++;
  const V = this.dial.value, vSel = this.E() / B1;
  if (Math.abs(V - 800) <= 8) {
    this.phase = 'stageB'; this.result = null; hint.hide();
    sfx.good(); toast('Correct: E = 2.0 × 10⁴ V/m, and E/B = 2.0 × 10⁵ m/s.', 'good', 3.5);
    this.dial.setEnabled(); this.checkBtn.userData.setOn(false);
    await wait(2);
    if (current !== this) return;
    this.stageB = true;
    this.b2Arrows.forEach((a) => (a.visible = true));
    toast('Field B₂ is on. Watch the detector.', 'info', 3);
    this.redraw(); this.drawData();
    await wait(6);
    if (current !== this) return;
    this.phase = 'measure';
    this.dial.group.visible = false; this.checkBtn.visible = false;
    this.markSlider.group.visible = true; this.recordBtn.visible = true; this.recordBtn.userData.setOn(true);
    this.marker.visible = true; this.markSlider.set(30, true); this.markSlider.setEnabled(); this.placeMarker();
    hint.show(this.marker, [0, 0.06, 0]);
    this.redraw();
  } else {
    sfx.bad();
    this.result = `At ${V.toFixed(0)} V the ions that pass have v = E/B = ${sig(vSel)} m/s. You need 2.0 × 10⁵ m/s: E = vB = 2.0 × 10⁴ V/m, then V = Ed.`;
    toast('Not that speed. Read the board.', 'bad', 2.5);
    this.redraw();
  }
};
m3.placeMarker = function () {
  const d = this.markSlider.value;
  if (!this.markGrab.held) this.marker.position.set(ENTRY_X - 0.035, -0.02, -d / 100);
  this.markerLabel.userData.set(`${d.toFixed(1)} cm`);
};
m3.record = function () {
  if (this.phase !== 'measure') return;
  const d = this.markSlider.value;
  let best = -1, bestErr = 1e9;
  this.spots.forEach((s, i) => { const e = Math.abs(s.userData.d * 100 - d); if (e < bestErr && this.hitCount[i] > 3) { bestErr = e; best = i; } });
  if (best >= 0 && bestErr <= 0.3) {
    if (this.recorded[best] != null) { toast('You have measured that line already.', 'info', 2); return; }
    this.recorded[best] = d; this.result = null;
    sfx.good(); toast(`Recorded: line at ${d.toFixed(1)} cm`, 'good', 2);
    this.spots[best].updateWorldMatrix(true, true);
    shockwave(this.spots[best].getWorldPosition(new V3()), { color: ISOTOPES[best].color, size: 0.1 });
    this.redraw(); this.drawData();
    if (this.recorded.every((x) => x != null)) { this.phase = 'quiz'; hint.hide(); this.markSlider.setEnabled(); this.recordBtn.userData.setOn(false); wait(2.5).then(() => current === this && this.questions()); }
  } else {
    this.misses++;
    sfx.bad();
    this.result = 'The marker is not on a line. Move it until the red line points exactly at a coloured line (within 3 mm).';
    toast('No line under the marker', 'bad', 2); this.redraw();
  }
};
m3.questions = async function () {
  this.phase = 'quiz';
  this.controls.visible = false;
  const go = askIf(this);
  let ok = 0;
  const d = this.spots.map((s) => (s.userData.d * 100).toFixed(1));
  ok += await go({ title: 'Question 1 of 3', q: 'Which line is made by neon-22, the heaviest isotope?',
    options: [`The nearest (${d[0]} cm)`, `The middle one (${d[1]} cm)`, `The furthest (${d[2]} cm)`, 'They all land together'], correct: 2,
    explain: 'r = mv/Bq. All the ions have the same q, v and B, so r ∝ m: the heaviest lands furthest.',
    why: ['That is the lightest, neon-20 (the most common, so it is the brightest).', 'That is neon-21.', '', 'Different masses give different radii.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 3', q: `The middle line is ${d[1]} cm from the slit. Using m = qBd / 2v, what is the mass of these ions in u? (1 u = 1.66 × 10⁻²⁷ kg)`,
    options: ['20 u', '21 u', '22 u', '42 u'], correct: 1,
    explain: `m = (1.6 × 10⁻¹⁹ × 0.20 × ${(this.spots[1].userData.d).toFixed(3)}) / (2 × 2.0 × 10⁵) = ${sig(E_CH * B2 * this.spots[1].userData.d / (2 * V_SEL))} kg = 21 u.`,
    why: ['Use the middle line\'s distance, not the nearest.', '', 'That is the furthest line.', 'd is the diameter: r = d/2. That answer forgets the 2.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 3 of 3', q: 'Why must the ions pass through a velocity selector first?',
    options: ['To give them all the same charge', 'Because r = mv/Bq depends on speed too: with one speed, r depends only on mass', 'To slow them down so they can be seen', 'To remove the electrons'], correct: 1,
    explain: 'If speeds differed, ions of the same mass would land in different places. Selecting one speed makes r ∝ m.',
    why: ['The selector does not change charge.', '', 'It picks out one speed; it does not slow ions down.', 'The ions are already charged before they reach it.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  const n = this.checks <= 1 && ok >= 2 && this.misses <= 2 ? 3 : this.checks <= 3 && ok >= 1 ? 2 : 1;
  finishMission(this, n, [
    { t: `Speed checks: ${this.checks}.  Measuring misses: ${this.misses}.  Questions right first time: ${ok} of 3.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Velocity selector: ions go straight when qE = Bqv, so v = E/B.', size: 30 },
    { t: '• In the second field r = mv/Bq ∝ m: heavier ions land further away.', size: 30 },
  ]);
};
const _ionP = new V3(), _ionC = new THREE.Color();
m3.tick = function (dt, t) {
  const K = 0.32 / V_SEL;                 // display speed: 2 × 10⁵ m/s shows as 0.32 m/s
  const E = this.E();
  this.srcGlow.material.opacity = 0.45 + 0.2 * Math.sin(t * 9);
  this.spawnT += dt;
  while (this.spawnT > 0.018 && this.ionList.length < N_IONS) {
    this.spawnT -= 0.018;
    const r = Math.random();
    const iso = this.stageB ? (r < ISOTOPES[0].w ? 0 : r < ISOTOPES[0].w + ISOTOPES[1].w ? 1 : 2) : 0;
    this.ionList.push({ x: -0.44, z: (Math.random() - 0.5) * 0.004, v: 1.6e5 + Math.random() * 0.8e5, iso, m: ISOTOPES[iso].A * U, state: 'sel', phi: 0, vz: 0 });
  }
  if (this.spawnT > 0.018) this.spawnT = 0.018;
  const now = performance.now();
  this.passed = this.passed.filter((tt) => now - tt < 2000);
  for (let i = this.ionList.length - 1; i >= 0; i--) {
    const ion = this.ionList[i];
    const dx = ion.v * K * dt;
    if (ion.state === 'sel') {
      ion.x += dx;
      if (ion.x > SEL_X0) {
        const a = (E_CH / ion.m) * (E - ion.v * B1);        // + z is towards the − plate
        const tt = (Math.min(ion.x, SEL_X1) - SEL_X0) / ion.v;
        if (ion.z0 === undefined) ion.z0 = ion.z;
        ion.z = ion.z0 + 0.5 * a * tt * tt;
        ion.vz = a * tt;
        if (Math.abs(ion.z) > PLATE_GAP / 2) { ion.state = 'dead'; ion.life = 0.25; }
        else if (ion.x >= SEL_X1) ion.state = 'drift';
      }
    } else if (ion.state === 'drift') {
      ion.z += ion.vz * dx / ion.v;
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
        const s = this.spots[ion.iso].userData;
        s.bar.material.opacity = Math.min(1, Math.max(0.35, s.bar.material.opacity + 0.06));
        s.glow.material.opacity = Math.min(0.9, s.glow.material.opacity + 0.05);
        this.ionList.splice(i, 1); continue;
      }
      ion.x = ENTRY_X + ion.r * Math.sin(ion.phi);
      ion.z = -ion.r + ion.r * Math.cos(ion.phi);
    } else if (ion.state === 'dead') {
      ion.life -= dt;
      if (ion.life <= 0) { this.ionList.splice(i, 1); continue; }
    }
  }
  for (let i = 0; i < N_IONS; i++) {
    const ion = this.ionList[i];
    if (!ion) { this.ions.hide(i); continue; }
    _ionP.set(ion.x, 0, ion.z);
    if (this.stageB && ion.state === 'arc') _ionC.set(ISOTOPES[ion.iso].color);
    else _ionC.setHSL(clamp((ion.v - 1.6e5) / 0.8e5, 0, 1) * 0.66, 0.95, 0.6);
    this.ions.set(i, _ionP, ion.state === 'dead' ? 0.6 : 1, ion.state === 'dead' ? 0x666666 : _ionC.getHex());
  }
  this.ions.commit();
  this.dataT = (this.dataT || 0) + dt;
  if (this.dataT > 0.3 && this.phase !== 'quiz' && this.phase !== 'done') { this.dataT = 0; this.drawData(); }
};

// ================================================================= Experiment 4: Induction
const COIL_X = -0.08, COIL_LEN = 0.16, COIL_R = 0.05, TURNS = 200, PHI0 = 5.0e-6, A_FLUX = 0.08;
const MAG_LEN = 0.13, X_MIN = 0, X_MAX = 0.44;       // magnet centre, measured from the coil centre
const m4 = { title: 'Experiment 4: Induction', short: 'Induction', controls: new THREE.Group(), world: new THREE.Group(), scale0: 1.4 };
missions.push(m4);
panel.add(m4.controls); app.add(m4.world);
m4.world.position.set(0, 0.105, 0.05);
{
  const W = m4.world;
  class Helix extends THREE.Curve {
    getPoint(t, out = new V3()) { const a = t * Math.PI * 2 * 14; return out.set(COIL_X - COIL_LEN / 2 + t * COIL_LEN, Math.sin(a) * COIL_R, Math.cos(a) * COIL_R); }
  }
  m4.helix = new Helix();
  m4.coil = mesh(new THREE.TubeGeometry(m4.helix, 700, 0.0035, 6, false), mat(COL.copper, { metalness: 0.75, roughness: 0.32, emissive: 0xff8a2a, emissiveIntensity: 0 }));
  W.add(noHit(m4.coil));
  W.add(noHit(mesh(new THREE.CylinderGeometry(COIL_R - 0.004, COIL_R - 0.004, COIL_LEN + 0.01, 24, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), COIL_X, 0, 0)));
  m4.coilDots = dotPool(40, 0.0042, W, { color: 0xffe28a });
  // stand and rail
  const steel = mat(0x55606b, { metalness: 0.6, roughness: 0.35 });
  W.add(noHit(mesh(new THREE.BoxGeometry(0.7, 0.012, 0.06), steel, 0.08, -0.07, 0)));
  for (const x of [COIL_X - 0.05, COIL_X + 0.05]) W.add(noHit(mesh(new THREE.BoxGeometry(0.012, 0.07, 0.04), steel, x, -0.035, 0)));
  W.add(noHit(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.5, 6).rotateZ(Math.PI / 2), mat(0x9fb6cc, { metalness: 0.8 }), 0.2, -0.03, 0)));
  const sh = blobShadow(0.8, 0.3, 0.45); sh.position.set(0.08, -0.074, 0); W.add(sh);
  W.add(noHit(mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.1, 10), steel, COIL_X, -0.025, -0.14)));
  // the magnet with its field lines
  m4.magnet = new THREE.Group();
  m4.magnetBody = new THREE.Group();
  m4.nHalf = mesh(new THREE.BoxGeometry(MAG_LEN / 2, 0.032, 0.032), mat(COL.north, { roughness: 0.35, metalness: 0.2 }));
  m4.sHalf = mesh(new THREE.BoxGeometry(MAG_LEN / 2, 0.032, 0.032), mat(COL.south, { roughness: 0.35, metalness: 0.2 }));
  m4.nHalf.position.x = -MAG_LEN / 4; m4.sHalf.position.x = MAG_LEN / 4;
  m4.magnetBody.add(m4.nHalf, m4.sHalf);
  // dipole field lines (r = k sin²θ round the magnet's axis), from N round to S
  m4.lines = [];
  const lineMat = new THREE.LineBasicMaterial({ color: COL.field, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const k of [0.035, 0.05, 0.07]) for (let p = 0; p < 4; p++) {
    const phi = p * Math.PI / 2 + Math.PI / 4, pts = [];
    for (let i = 0; i <= 60; i++) {
      const th = Math.PI - 0.32 - (i / 60) * (Math.PI - 0.64);
      const r = k * Math.sin(th) ** 2 / Math.sin(0.32) ** 2 * 0.36;
      const x = r * Math.cos(th), rho = r * Math.sin(th);
      pts.push(new V3(x, rho * Math.cos(phi), rho * Math.sin(phi)));
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    m4.magnetBody.add(noHit(l)); m4.lines.push(pts);
  }
  m4.lineDots = dotPool(m4.lines.length * 2, 0.0035, m4.magnetBody, { color: 0x9fd0ff });
  m4.magnet.add(m4.magnetBody);
  m4.nLabel = poleLabel('N', 'N'); m4.sLabel = poleLabel('S', 'S');
  m4.nLabel.scale.multiplyScalar(0.75); m4.sLabel.scale.multiplyScalar(0.75);
  m4.magnet.add(m4.nLabel, m4.sLabel);
  W.add(m4.magnet);
  m4.magnet.add(mesh(new THREE.BoxGeometry(MAG_LEN + 0.03, 0.07, 0.07), new THREE.MeshBasicMaterial({ visible: false })));
  m4.halo = glowSprite(0xffe08a, 0.22, 0); m4.magnet.add(m4.halo);
  m4.target = 0.3; m4.x = 0.3; m4.dragging = false;
  m4.magnet.userData.onHover = (on) => { m4.hover = on; };
  m4.magnet.userData.drag = {
    begin: () => { m4.dragging = true; m4.needOffset = true; sfx.grab(); hint.hide(); },
    point: (wp) => { const l = W.worldToLocal(wp.clone()); m4.dragTo(l.x - COIL_X); },
    ray: (ray) => {
      W.updateWorldMatrix(true, false);
      const o = W.localToWorld(new V3(COIL_X, 0, 0)), d = new V3(1, 0, 0).transformDirection(W.matrixWorld);
      m4.dragTo(closestOnLineToRay(o, d, ray) / W.matrixWorld.getMaxScaleOnAxis());
    },
    end: () => { m4.dragging = false; sfx.release(); },
  };
  m4.grabOffset = 0;
  m4.dragTo = (raw) => {
    if (m4.needOffset) { m4.grabOffset = raw - m4.target; m4.needOffset = false; }
    m4.target = clamp(raw - m4.grabOffset, X_MIN, X_MAX);
  };
  makeInteractive(m4.magnet, { name: 'Bar magnet (slide it)', enabled: () => m4.phase === 'play' || m4.phase === 'quiz' || m4.phase === 'done', priority: 1 });
  // induced pole at the coil end facing the magnet
  m4.endPole = textSprite('N', { size: 0.036 });
  m4.endPole.position.set(COIL_X + COIL_LEN / 2 + 0.005, 0.09, 0);
  W.add(m4.endPole);
  // centre-zero meter behind the coil
  m4.meter = new THREE.Group();
  m4.meter.position.set(COIL_X, 0.13, -0.13);
  m4.meter.rotation.x = -0.25;
  m4.meter.add(noHit(mesh(new THREE.BoxGeometry(0.3, 0.21, 0.05), mat(0x2a3138, { metalness: 0.5, roughness: 0.4 }), 0, 0, -0.03)));
  const face = canvasPlane(0.26, 0.17, 1400);
  {
    const { ctx, c } = face; const cx = c.width / 2, cy = c.height * 0.86, R = c.height * 0.62;
    ctx.fillStyle = '#f4f1e6'; roundRect(ctx, 0, 0, c.width, c.height, 18); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.fillStyle = '#222'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.17, Math.PI * 1.83); ctx.stroke();
    ctx.font = 'bold 30px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let v = -5; v <= 5; v++) {
      const a = -Math.PI / 2 + (v / 5) * (Math.PI * 0.33);
      const r0 = R - (v % 5 === 0 ? 34 : 20);
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
      ctx.fillText(String(v), cx + Math.cos(a) * (R + 28), cy + Math.sin(a) * (R + 28) + 10);
    }
    ctx.font = 'bold 34px system-ui, sans-serif'; ctx.fillText('mV', cx, cy - 40);
    face.update();
  }
  noHit(face.mesh); face.mesh.position.z = 0.0;
  m4.meter.add(face.mesh);
  m4.needle = new THREE.Group();
  m4.needle.position.set(0, -0.17 * 0.36, 0.004);
  m4.needle.add(noHit(mesh(new THREE.BoxGeometry(0.003, 0.105, 0.002).translate(0, 0.0525, 0), basic(0xc0392b))));
  m4.needle.add(noHit(mesh(new THREE.CircleGeometry(0.008, 16), basic(0x222222))));
  m4.meter.add(m4.needle);
  W.add(m4.meter);
  // two LEDs, wired opposite ways: one lights for each direction of current
  m4.leds = [[0xff3b30, -0.045], [0x30d158, 0.045]].map(([c, x]) => {
    const g = new THREE.Group(); g.position.set(COIL_X + 0.17 + x, -0.051, -0.09);
    const m = mat(c, { emissive: c, emissiveIntensity: 0.05, transparent: true, opacity: 0.85, roughness: 0.2 });
    g.add(mesh(new THREE.SphereGeometry(0.011, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m), mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16).translate(0, -0.006, 0), m));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.012, 0.03).translate(0, -0.018, 0), mat(0x222831)));
    const glow = glowSprite(c, 0.09, 0); glow.position.y = 0.006; g.add(glow);
    W.add(noHit(g));
    return { m, glow };
  });
  // leads from the coil ends to the meter
  for (const s of [-1, 1]) {
    const pts = [new V3(COIL_X + s * COIL_LEN / 2, -0.04, -0.02), new V3(COIL_X + s * 0.11, 0.0, -0.1), new V3(COIL_X + s * 0.06, 0.06, -0.13)];
    W.add(noHit(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.002, 5), mat(s < 0 ? 0x222222 : 0xc0392b))));
  }
  m4.flipBtn = actionButton('Turn magnet round', 0.3, 0.085, () => m4.flip(), { bg: '#2c6e91', size: 26 });
  m4.flipBtn.position.set(-0.24, 0.07, 0);
  m4.resetBtn = actionButton('Magnet back to start', 0.3, 0.085, () => { m4.target = 0.3; m4.x = 0.3; m4.prevPhi = m4.phi(m4.x); }, { bg: '#4b5d6e', size: 24 });
  m4.resetBtn.position.set(-0.24, -0.06, 0);
  m4.inBtn = actionButton('Push in slowly', 0.24, 0.085, () => m4.autoMove(0.0, 2.0), { bg: '#1f6fb2', size: 24 });
  m4.outBtn = actionButton('Pull out slowly', 0.24, 0.085, () => m4.autoMove(0.3, 2.0), { bg: '#1f6fb2', size: 24 });
  m4.inBtn.position.set(0.07, 0.07, 0); m4.outBtn.position.set(0.07, -0.06, 0);
  m4.controls.add(m4.flipBtn, m4.resetBtn, m4.inBtn, m4.outBtn);
}
m4.TASKS = [
  'Push the N pole into the coil. Watch the meter.',
  'Hold the magnet still inside the coil.',
  'Pull the magnet out again.',
  'Move it fast enough to make the meter read more than 3 mV.',
  'Turn the magnet round and push the S pole in.',
];
m4.enter = function () {
  this.phase = 'play'; this.flipped = false; this.task = 0; this.done = []; this.note = null;
  this.target = 0.3; this.x = 0.3; this.emf = 0; this.shown = 0; this.peak = 0; this.stillT = 0; this.signIn = 0; this.dotPhase = 0;
  this.prevPhi = this.phi(this.x);
  this.applyFlip(); this.place();
  this.flipBtn.userData.setOn(false);
  this.hum = sfx.loop({ type: 'sawtooth', freq: 90, vol: 0, cutoff: 500 });
  hint.show(this.magnet, [0, 0.07, 0]);
  this.redraw(); this.drawData();
};
m4.leave = function () { this.hum?.stop(); this.hum = null; };
m4.autoMove = function (to, secs) {
  if (this.phase !== 'play' && this.phase !== 'quiz' && this.phase !== 'done') return;
  hint.hide();
  const from = this.target;
  tween(secs, (k) => { this.target = from + (to - from) * k; }, (k) => k);
};
// flux through the coil from the magnet at distance x (centre to centre); positive when the N pole faces the coil
m4.phi = function (x) { const f = 1 / Math.pow(1 + (x / A_FLUX) * (x / A_FLUX), 1.5); return (this.flipped ? -1 : 1) * PHI0 * f; };
m4.flip = function () {
  if (this.task !== 4 && !(this.phase === 'quiz' || this.phase === 'done')) { toast('First finish the steps on the board.', 'info', 2); return; }
  if (this.x < 0.2) { toast('Pull the magnet out of the coil before turning it round.', 'warn', 2.5); return; }
  this.flipped = !this.flipped; this.prevPhi = this.phi(this.x); sfx.whoosh();
  const from = this.magnetBody.rotation.y, to = this.flipped ? Math.PI : 0;
  tween(0.4, (k) => { this.magnetBody.rotation.y = from + (to - from) * k; }, easeOut);
  this.applyFlip(false);
};
m4.applyFlip = function (snap = true) {
  if (snap) this.magnetBody.rotation.y = this.flipped ? Math.PI : 0;
  const nx = (this.flipped ? 1 : -1) * MAG_LEN / 4;
  this.nLabel.position.set(nx, 0.045, 0); this.sLabel.position.set(-nx, 0.045, 0);
};
m4.place = function () { this.magnet.position.set(COIL_X + this.x, 0, 0); };
m4.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  const how = input.kind === 'hand' ? 'Pinch the magnet and slide it (or point at it and pinch).' : input.kind === 'controller' ? 'Hold the trigger on the magnet and slide it.' : 'Drag the magnet with the mouse, or use the push and pull buttons.';
  info.userData.draw([
    { t: 'A coil of 200 turns is joined to a centre-zero meter and two LEDs. Move the bar magnet along its rail.', size: 30, gap: 8 },
    { t: how, size: 28, color: '#cfe3ff', gap: 10 },
    ...this.TASKS.map((t, i) => ({ t: `${this.done[i] ? '✓' : i === this.task ? '→' : '•'}  ${t}`, size: 30, color: this.done[i] ? '#8ef0a8' : i === this.task ? '#ffd34d' : '#9fb6cc', gap: 6 })),
    this.note && { rule: true },
    this.note && { t: this.note, size: 28, color: '#e0b3ff' },
  ], { title: this.title });
};
m4.drawData = function () {
  const ph = this.phi(this.x);
  data.userData.draw([
    { t: `E.m.f. = ${(this.shown * 1000).toFixed(2)} mV`, size: 40, bold: true, color: Math.abs(this.shown) > 1e-4 ? '#ffd34d' : '#eef3f8' },
    { t: `Flux linkage NΦ = ${sig(TURNS * ph, 2)} Wb`, size: 30, color: '#cfe3ff' },
    { t: `Biggest reading so far: ${(this.peak * 1000).toFixed(2)} mV`, size: 30, color: '#9fb6cc' },
    { rule: true },
    { t: 'Faraday: e.m.f. = −N dΦ/dt (the RATE of change of flux linkage).', size: 28 },
    { t: 'Lenz: the induced current opposes the change that causes it.', size: 28 },
    { t: 'The letter on the coil shows the pole the induced current makes at that end. Red LED: current one way; green: the other.', size: 26, color: '#9fb6cc' },
  ], { title: 'Meter' });
};
m4.complete = function (i, msg) {
  if (this.done[i] || this.task !== i) return;
  this.done[i] = true; this.task = i + 1;
  this.note = msg;
  sfx.good(); toast(msg.split(':')[0].split('.')[0], 'good', 2.6);
  if (this.task === 4) { this.flipBtn.userData.setOn(true); hint.show(this.flipBtn, [0, 0.07, 0.02]); }
  this.redraw();
  if (this.task >= this.TASKS.length) this.questions();
};
const _p4 = new V3();
m4.tick = function (dt, t) {
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
  // what you see and hear: LEDs, glowing coil, current dots, a hum that rises with the e.m.f.
  const lvl = clamp(Math.abs(mV) / 3, 0, 1);
  this.leds[0].m.emissiveIntensity = mV > 0.05 ? 0.3 + 2.5 * lvl : 0.05; this.leds[0].glow.material.opacity = mV > 0.05 ? lvl : 0;
  this.leds[1].m.emissiveIntensity = mV < -0.05 ? 0.3 + 2.5 * lvl : 0.05; this.leds[1].glow.material.opacity = mV < -0.05 ? lvl : 0;
  this.coil.material.emissiveIntensity = 0.5 * lvl;
  this.dotPhase += dt * clamp(mV / 2, -2.5, 2.5) * 0.25;
  if (Math.abs(mV) > 0.05) {
    for (let i = 0; i < 40; i++) { const s = (((i / 40 + this.dotPhase) % 1) + 1) % 1; this.helix.getPoint(s, _p4); this.coilDots.set(i, _p4, 1); }
    this.coilDots.commit(); this.dotsOn = true;
  } else if (this.dotsOn) { this.coilDots.hideAll(); this.dotsOn = false; }
  this.hum?.set({ vol: 0.05 * lvl, freq: 80 + 120 * lvl });
  m4.halo.material.opacity += ((this.hover || this.dragging ? 0.6 : 0) - m4.halo.material.opacity) * 0.25;
  // field-line dots flow from N round to S
  let k = 0;
  for (const pts of this.lines) for (let n = 0; n < 2; n++) {
    const s = ((t * 0.3 + n / 2 + k * 0.07) % 1), idx = Math.floor(s * (pts.length - 1));
    this.lineDots.set(k * 2 + n - (n ? 1 : 0) + (n ? 1 : 0), pts[idx], 1);
    if (n === 1) k++;
  }
  this.lineDots.commit();
  // induced pole at the coil's end nearest the magnet (opposes the change)
  const show = Math.abs(mV) > 0.08;
  this.endPole.visible = show;
  if (show) {
    const pole = dPhi > 0 ? 'N' : 'S';
    const facing = this.flipped ? 'S' : 'N';
    this.endPole.userData.set(`${pole} pole: ${pole === facing ? 'repels' : 'attracts'}`, pole === 'N' ? '#ff8a80' : '#8ab4ff');
  }
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
  const go = askIf(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 2', q: 'As the N pole of a magnet is pushed towards a coil, the end of the coil nearest the magnet becomes…',
    options: ['an N pole, which repels the magnet', 'an S pole, which attracts the magnet', 'no pole at all', 'an N pole, which attracts the magnet'], correct: 0,
    explain: 'Lenz\'s law: the induced current opposes the change. Repelling the approaching N pole means you must do work, and that work becomes electrical energy.',
    why: ['', 'Attracting it would speed the magnet up and create energy from nothing: that breaks conservation of energy.', 'A current flows, so the coil acts as an electromagnet.', 'Like poles repel; they cannot attract.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 2', q: 'The flux through a 200-turn coil rises steadily from 0 to 4.0 × 10⁻⁴ Wb in 0.10 s. What is the size of the induced e.m.f.?',
    options: ['0.0040 V', '0.080 V', '0.80 V', '8.0 V'], correct: 2,
    explain: 'E = N ΔΦ/Δt = 200 × 4.0 × 10⁻⁴ / 0.10 = 0.80 V.',
    why: ['That leaves out N = 200 turns.', 'Check the powers of ten: 200 × 4.0 × 10⁻⁴ = 0.080 Wb, then divide by 0.10 s.', '', 'Check: ΔΦ/Δt = 4.0 × 10⁻³ Wb/s, then multiply by N = 200.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  finishMission(this, ok === 2 ? 3 : ok === 1 ? 2 : 1, [
    { t: `All five steps done. Questions right first time: ${ok} of 2.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• Faraday: the e.m.f. depends on the RATE of change of flux linkage: E = −N dΦ/dt.', size: 30 },
    { t: '• Lenz: the induced current always opposes the change that produces it.', size: 30 },
  ]);
};

// ================================================================= Experiment 5: Generator
const GEN_B = 0.10, GEN_A = 0.010, GEN_N = 200, CRANK_R = 0.075, SCOPE_N = 300, SCOPE_V = 8;
const m5 = { title: 'Experiment 5: Generator', short: 'Generator', controls: new THREE.Group(), world: new THREE.Group(), scale0: 1.35 };
missions.push(m5);
panel.add(m5.controls); app.add(m5.world);
m5.world.position.set(0.02, 0.21, -0.02);
{
  const W = m5.world;
  // magnet: N and S pole pieces on a U-shaped iron yoke (field along +x, N on the left)
  const iron = mat(0x3a4048, { metalness: 0.7, roughness: 0.4 });
  W.add(noHit(mesh(new THREE.BoxGeometry(0.46, 0.03, 0.18), iron, 0, -0.135, 0)));
  for (const s of [-1, 1]) W.add(noHit(mesh(new THREE.BoxGeometry(0.03, 0.1, 0.18), iron, s * 0.215, -0.08, 0)));
  const poleN = mesh(new THREE.BoxGeometry(0.06, 0.17, 0.18), mat(COL.north, { roughness: 0.35, metalness: 0.2 }), -0.17, 0, 0);
  const poleS = mesh(new THREE.BoxGeometry(0.06, 0.17, 0.18), mat(COL.south, { roughness: 0.35, metalness: 0.2 }), 0.17, 0, 0);
  W.add(noHit(poleN), noHit(poleS));
  const ln = poleLabel('N', 'N'); ln.position.set(-0.17, 0.12, 0.05); const ls = poleLabel('S', 'S'); ls.position.set(0.17, 0.12, 0.05);
  W.add(ln, ls);
  const sh = blobShadow(0.7, 0.5, 0.45); sh.position.set(0, -0.155, 0); W.add(sh);
  m5.fieldDots = dotPool(30, 0.0035, W, { color: 0x9fd0ff });
  const fieldMat = new THREE.LineBasicMaterial({ color: COL.field, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  m5.fieldYZ = [];
  for (const y of [-0.05, 0, 0.05]) for (const z of [-0.06, -0.02, 0.02, 0.06]) {
    if (Math.abs(y) < 0.01 && Math.abs(z) < 0.03) continue;
    W.add(noHit(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(-0.14, y, z), new V3(0.14, y, z)]), fieldMat)));
    m5.fieldYZ.push([y, z]);
  }
  // the coil (turns about the z axis, which points at you) on an axle with slip rings and a crank
  m5.rotor = new THREE.Group();
  W.add(m5.rotor);
  const copper = mat(COL.copper, { metalness: 0.75, roughness: 0.3, emissive: 0xff8a2a, emissiveIntensity: 0 });
  m5.copper = copper;
  for (let k = -1; k <= 1; k++) {
    const h = 0.07 + k * 0.003, z0 = 0.07 + k * 0.003;
    const path = new THREE.CurvePath();
    const P = [[0, -h, -z0], [0, h, -z0], [0, h, z0], [0, -h, z0], [0, -h, -z0]].map(([x, y, z]) => new V3(x + k * 0.004, y, z));
    for (let i = 0; i < 4; i++) path.add(new THREE.LineCurve3(P[i], P[i + 1]));
    m5.rotor.add(noHit(mesh(new THREE.TubeGeometry(path, 40, 0.0045, 6, false), copper)));
  }
  m5.normalArrow = arrow(0xffffff, { radius: 0.0025, head: 0.016, glow: false });
  m5.normalArrow.userData.set(new V3(0, 0, 0), new V3(0.09, 0, 0));
  m5.rotor.add(m5.normalArrow);
  const steel = mat(0xc9d2db, { metalness: 0.9, roughness: 0.2 });
  W.add(noHit(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 12).rotateX(Math.PI / 2), steel, 0, 0, 0.07)));
  for (const z of [0.15, 0.175]) {
    m5.rotor.add(noHit(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 24).rotateX(Math.PI / 2), mat(0xd9a441, { metalness: 0.9, roughness: 0.25 }), 0, 0, z)));
    W.add(noHit(mesh(new THREE.BoxGeometry(0.01, 0.03, 0.01), mat(0x222222, { roughness: 0.8 }), 0, -0.03, z)));
  }
  W.add(noHit(mesh(new THREE.BoxGeometry(0.04, 0.12, 0.03), iron, 0, -0.08, 0.165)));
  m5.crank = new THREE.Group(); m5.crank.position.z = 0.245;
  m5.crank.add(mesh(new THREE.BoxGeometry(0.016, CRANK_R + 0.016, 0.01).translate(0, CRANK_R / 2, 0), steel));
  m5.crank.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 16).rotateX(Math.PI / 2).translate(0, CRANK_R, 0.025), mat(0xb03a2e, { roughness: 0.4 })));
  W.add(noHit(m5.crank));
  // the grip: grab it and wind (it follows the crank when you let go)
  m5.crankSpace = new THREE.Group(); m5.crankSpace.position.z = 0.27; W.add(m5.crankSpace);
  m5.grip = new THREE.Group();
  m5.crankSpace.add(m5.grip);
  m5.gripGrab = grabbable(m5.grip, {
    name: 'Crank handle (grab it and wind)', space: m5.crankSpace, haloSize: 0.1, hitRadius: 0.03, planeNormal: new V3(0, 0, 1),
    enabled: () => m5.handAllowed(),
    constrain: (l) => { const a = Math.atan2(l.y, l.x); m5.handTo(a); return new V3(Math.cos(a) * CRANK_R, Math.sin(a) * CRANK_R, 0); },
    onGrab: () => { hint.hide(); m5.lastHandA = null; },
  });
  // the bulb
  m5.bulb = new THREE.Group(); m5.bulb.position.set(0.33, -0.07, 0.1);
  m5.bulb.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 20), mat(0x2a3138), 0, -0.07, 0));
  m5.bulb.add(mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.025, 16), mat(0xbfc7cf, { metalness: 0.9 }), 0, -0.045, 0));
  m5.bulbGlass = mesh(new THREE.SphereGeometry(0.03, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xfff6e0, transparent: true, opacity: 0.3, roughness: 0.05, emissive: 0xffc46b, emissiveIntensity: 0, depthWrite: false }), 0, 0, 0);
  m5.filament = mesh(new THREE.TorusGeometry(0.008, 0.0012, 6, 16), basic(0x553311), 0, 0, 0);
  m5.bulbGlow = glowSprite(0xffd38a, 0.3, 0);
  m5.bulb.add(m5.bulbGlass, m5.filament, m5.bulbGlow);
  m5.bulbLight = new THREE.PointLight(0xffc47a, 0, 1.2, 2); m5.bulb.add(m5.bulbLight);
  W.add(noHit(m5.bulb));
  // the oscilloscope
  m5.scope = new THREE.Group(); m5.scope.position.set(-0.37, -0.07, -0.06); m5.scope.rotation.y = 0.35;
  m5.scope.add(noHit(mesh(new THREE.BoxGeometry(0.24, 0.17, 0.12), mat(0x2f3a46, { metalness: 0.4, roughness: 0.45 }), 0, 0, -0.06)));
  m5.screen = canvasPlane(0.2, 0.12, 2200);
  m5.screen.mesh.position.set(-0.008, 0.012, 0.001); noHit(m5.screen.mesh);
  m5.scope.add(m5.screen.mesh);
  for (let i = 0; i < 3; i++) m5.scope.add(noHit(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 16).rotateX(Math.PI / 2), mat(0xc9d2db, { metalness: 0.8 }), 0.108, 0.04 - i * 0.035, 0.004)));
  const sl = textSprite('e.m.f. against time', { size: 0.022, bg: null }); sl.position.set(0, 0.11, 0); m5.scope.add(sl);
  W.add(m5.scope);
  // leads
  for (const [z, c] of [[0.15, 0x222222], [0.175, 0xc0392b]]) {
    W.add(noHit(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(0, -0.045, z), new V3(0.12, -0.12, z + 0.02), new V3(0.3, -0.13, 0.1)]), 24, 0.0022, 5), mat(c))));
    W.add(noHit(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(0, -0.045, z), new V3(-0.15, -0.12, z), new V3(-0.32, -0.04, -0.02)]), 24, 0.0022, 5), mat(c))));
  }
  // controls
  m5.motor = dial({ name: 'Motor speed', min: 0, max: 6, step: 0.1, fine: 0.1, value: 0, format: (v) => `${v.toFixed(1)} rev/s`,
    onChange: () => { m5.motorChanged(); }, enabled: () => m5.phase === 'play' || m5.phase === 'quiz' || m5.phase === 'done', color: 0xffc94d });
  m5.motor.group.position.set(-0.38, 0.02, 0);
  m5.nudgeL = actionButton('◀ 10°', 0.13, 0.07, () => m5.nudge(10), { bg: '#2d4a66', size: 26, name: 'Turn the coil 10° anticlockwise' });
  m5.nudgeR = actionButton('10° ▶', 0.13, 0.07, () => m5.nudge(-10), { bg: '#2d4a66', size: 26, name: 'Turn the coil 10° clockwise' });
  m5.nudgeL.position.set(-0.1, 0.1, 0); m5.nudgeR.position.set(0.05, 0.1, 0);
  m5.checkBtn = actionButton('Check angle', 0.28, 0.09, () => m5.checkAngle(), { bg: '#1e8449', size: 28 });
  m5.checkBtn.position.set(-0.025, -0.03, 0);
  m5.controls.add(m5.motor.group, m5.nudgeL, m5.nudgeR, m5.checkBtn);
}
m5.TASKS = [
  'Grab the red crank handle and wind the coil round at least one full turn. Watch the scope.',
  'Use the motor to light the bulb fully: a peak e.m.f. between 3.0 V and 3.8 V.',
  'Now double the motor speed. Watch the trace.',
  'Stop the motor. Turn the coil to where the e.m.f. is biggest as it turns, then press Check angle.',
];
m5.enter = function () {
  this.phase = 'play'; this.task = 0; this.done = []; this.note = null; this.checks = 0;
  this.angle = 0; this.omega = 0; this.nudging = false; this.nudgeId = (this.nudgeId || 0) + 1; this.turned = 0; this.signsSeen = new Set(); this.holdT = 0; this.f1 = null;
  this.trace = new Float32Array(SCOPE_N); this.traceI = 0; this.traceT = 0; this.peak = 0; this.peakT = 0;
  this.motor.set(0, true); this.motor.setEnabled();
  this.checkBtn.userData.setOn(false);
  this.hum = sfx.loop({ type: 'triangle', freq: 60, vol: 0, cutoff: 900 });
  hint.show(this.grip, [0, 0.06, 0.02]);
  this.place(); this.redraw(); this.drawData();
};
m5.leave = function () { this.hum?.stop(); this.hum = null; };
m5.handAllowed = function () { return (this.phase === 'play' || this.phase === 'quiz' || this.phase === 'done') && this.motor.value === 0; };
m5.handTo = function (a) {
  if (this.lastHandA == null) { this.lastHandA = a; return; }
  let d = a - this.lastHandA; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  this.lastHandA = a;
  this.angle += d; this.handD = (this.handD || 0) + d;
  if (this.task === 0) this.turned += Math.abs(d);
};
m5.motorChanged = function () {
  if (this.motor.value > 0) { this.omega = 2 * Math.PI * this.motor.value; hint.hide(); }
  this.nudgeL.userData.setOn(this.motor.value === 0); this.nudgeR.userData.setOn(this.motor.value === 0);
  this.drawData();
};
m5.nudge = function (deg) {
  if (!this.handAllowed()) return;
  this.omega = 0;
  // quick repeated presses add up: each press turns on from where the last one will end
  const base = this.nudging ? this.nudgeTarget : this.angle;
  this.nudgeTarget = base + deg * Math.PI / 180; this.nudging = true;
  const from = this.angle, to = this.nudgeTarget, id = (this.nudgeId = (this.nudgeId || 0) + 1);
  sfx.tick();
  tween(0.25, (k) => { if (id === this.nudgeId) this.angle = from + (to - from) * k; }, easeOut)
    .then(() => { if (id === this.nudgeId) { this.angle = to; this.nudging = false; } });
};
m5.emfAt = function (angle, omega) { return GEN_B * GEN_A * GEN_N * omega * Math.sin(angle); };
m5.place = function () {
  this.rotor.rotation.z = this.angle;
  this.crank.rotation.z = this.angle - Math.PI / 2;
  if (!this.gripGrab.held) this.grip.position.set(Math.cos(this.angle) * CRANK_R, Math.sin(this.angle) * CRANK_R, 0);
};
m5.redraw = function () {
  if (Q.active || this.phase === 'done' || this.phase === 'quiz') return;
  info.userData.draw([
    { t: 'A coil of 200 turns (area 0.010 m²) turns in a field of 0.10 T. Slip rings take its e.m.f. to a bulb and an oscilloscope.', size: 29, gap: 8 },
    { t: 'Φ = BA cos θ, so E = BANω sin θ. The white arrow on the coil shows its normal; θ is its angle to the field.', size: 27, color: '#cfe3ff', gap: 10 },
    ...this.TASKS.map((t, i) => ({ t: `${this.done[i] ? '✓' : i === this.task ? '→' : '•'}  ${t}`, size: 29, color: this.done[i] ? '#8ef0a8' : i === this.task ? '#ffd34d' : '#9fb6cc', gap: 6 })),
    this.note && { rule: true },
    this.note && { t: this.note, size: 27, color: '#e0b3ff' },
  ], { title: this.title });
};
m5.drawData = function () {
  const deg = ((this.angle * 180 / Math.PI) % 360 + 360) % 360;
  const f = Math.abs(this.omega) / (2 * Math.PI);
  data.userData.draw([
    { t: `e.m.f. = ${this.emf >= 0 ? '+' : '−'}${Math.abs(this.emf || 0).toFixed(2)} V`, size: 40, bold: true, color: '#ffd34d' },
    { t: `Peak e.m.f. E₀ = BANω = ${this.peak.toFixed(2)} V`, size: 30, color: '#cfe3ff' },
    { t: `Speed ${f.toFixed(2)} rev/s   (ω = ${Math.abs(this.omega).toFixed(1)} rad/s)`, size: 29, color: '#cfe3ff' },
    { t: `Coil angle θ = ${deg.toFixed(0)}°    Φ = BA cos θ = ${sig(GEN_B * GEN_A * Math.cos(this.angle), 2)} Wb`, size: 27, color: '#9fb6cc' },
    { rule: true },
    { t: 'The e.m.f. is biggest when the flux is changing fastest: when the coil\'s plane is ALONG the field (θ = 90°), not across it.', size: 26, color: '#9fb6cc' },
  ], { title: 'Generator' });
};
m5.drawScope = function () {
  const { ctx, c } = this.screen, w = c.width, h = c.height;
  ctx.fillStyle = '#04140c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(80,255,160,0.15)'; ctx.lineWidth = 2;
  for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, h); ctx.stroke(); }
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(80,255,160,0.4)'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  // band for "bulb fully lit"
  ctx.fillStyle = 'rgba(255,211,77,0.12)';
  for (const s of [1, -1]) { const y0 = h / 2 - s * 3.0 / SCOPE_V * h / 2, y1 = h / 2 - s * 3.8 / SCOPE_V * h / 2; ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0)); }
  ctx.shadowColor = '#5dff9d'; ctx.shadowBlur = 12;
  ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 6; ctx.beginPath();
  for (let i = 0; i < SCOPE_N; i++) {
    const v = this.trace[(this.traceI + i) % SCOPE_N];
    const x = i / (SCOPE_N - 1) * w, y = h / 2 - clamp(v / SCOPE_V, -1, 1) * h / 2 * 0.98;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(125,255,176,0.8)'; ctx.font = '700 44px system-ui'; ctx.fillText(`${SCOPE_V} V`, 14, 48); ctx.fillText(`−${SCOPE_V} V`, 14, h - 16);
  ctx.textAlign = 'right'; ctx.fillText('3 s', w - 14, h - 16); ctx.textAlign = 'left';
  this.screen.update();
};
m5.complete = function (i, msg) {
  if (this.done[i] || this.task !== i) return;
  this.done[i] = true; this.task = i + 1; this.holdT = 0;
  this.note = msg;
  sfx.good(); toast(msg.split('.')[0], 'good', 2.6);
  if (this.task === 1) hint.show(this.motor.group, [0, 0.16, 0.03]);
  if (this.task === 3) { this.checkBtn.userData.setOn(true); }
  this.redraw();
};
m5.checkAngle = async function () {
  if (this.phase !== 'play' || this.task !== 3) return;
  if (this.motor.value > 0) { toast('Stop the motor first (turn the dial to 0).', 'warn', 2.5); hint.show(this.motor.group, [0, 0.16, 0.03]); return; }
  this.checks++;
  const s = Math.abs(Math.sin(this.angle));
  const deg = ((this.angle * 180 / Math.PI) % 360 + 360) % 360;
  if (s >= Math.cos(10 * Math.PI / 180)) {
    this.done[3] = true; this.task = 4;
    this.note = `Yes! At θ = ${deg.toFixed(0)}° the coil's plane lies along the field. The flux through it is zero, but it is changing fastest, so the e.m.f. is biggest.`;
    sfx.great(); toast('Biggest e.m.f. position found', 'good', 3);
    celebrate(this.rotor.getWorldPosition(new V3()), { stars: 0 });
    this.checkBtn.userData.setOn(false);
    this.redraw();
    this.questions();
  } else {
    sfx.bad();
    this.note = `At θ = ${deg.toFixed(0)}° the flux Φ = BA cos θ is ${Math.abs(Math.cos(this.angle)) > 0.7 ? 'near its biggest, and it is hardly changing as the coil turns: the e.m.f. there is small' : 'still changing slowly'}. Think: where does cos θ change fastest?`;
    toast('Not the biggest e.m.f. yet', 'bad', 2.2);
    this.redraw();
  }
};
m5.questions = async function () {
  this.phase = 'quiz';
  await wait(3.5);
  if (current !== this) return;
  this.controls.visible = false;
  const go = askIf(this);
  let ok = 0;
  ok += await go({ title: 'Question 1 of 3', q: 'A 200-turn coil of area 0.010 m² turns at 5.0 rev/s in a field of 0.10 T. What is the peak e.m.f.?',
    options: ['6.3 V', '1.0 V', '0.20 V', '63 V'], correct: 0,
    explain: 'ω = 2πf = 31.4 rad/s, so E₀ = BANω = 0.10 × 0.010 × 200 × 31.4 = 6.3 V.',
    why: ['', 'That uses f instead of ω. ω = 2πf = 31.4 rad/s.', 'That leaves out ω.', 'Check the powers of ten: A = 0.010 m².'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 2 of 3', q: 'At the instant the coil\'s plane is at right angles to the field, the flux linkage is biggest. What is the e.m.f. at that instant?',
    options: ['Zero', 'Its biggest value', 'Half its biggest value', 'It depends on which way the coil turns'], correct: 0,
    explain: 'The e.m.f. is the RATE of change of flux linkage. At the top of the cos θ curve the flux is momentarily not changing, so the e.m.f. is zero.',
    why: ['', 'Biggest flux is not biggest rate of change: the e.m.f. is biggest when the flux is zero.', 'sin 0° = 0, not 0.5.', 'The direction changes the sign of the e.m.f. later, not its value at this instant.'] }) ? 1 : 0;
  if (current !== this) return;
  ok += await go({ title: 'Question 3 of 3', q: 'The coil is turned twice as fast. What happens to the output?',
    options: ['The peak e.m.f. doubles and the frequency doubles', 'The peak e.m.f. doubles; the frequency stays the same', 'The frequency doubles; the peak e.m.f. stays the same', 'Neither changes'], correct: 0,
    explain: 'E = BANω sin ωt: ω appears in front (the peak) and inside the sine (the frequency), so both double.',
    why: ['', 'Each turn is one cycle, so twice the turns per second is twice the frequency.', 'The peak is BANω: it is proportional to ω.', 'Faster turning changes the flux faster.'] }) ? 1 : 0;
  if (current !== this) return;
  this.phase = 'done';
  finishMission(this, ok === 3 && this.checks <= 2 ? 3 : ok >= 2 ? 2 : 1, [
    { t: `Angle checks: ${this.checks}.  Questions right first time: ${ok} of 3.`, size: 30 },
    { t: 'Key ideas', size: 32, bold: true, color: '#ffd34d' },
    { t: '• A coil turning in a field gives alternating e.m.f.: E = BANω sin ωt.', size: 30 },
    { t: '• The e.m.f. is biggest when the flux is zero (plane along the field), and zero when the flux is biggest.', size: 30 },
  ]);
};
m5.tick = function (dt, t) {
  const f = this.motor.value;
  if (f > 0) { this.omega = 2 * Math.PI * f; this.angle += this.omega * dt; }
  else if (this.gripGrab.held) {
    const d = this.handD || 0; this.handD = 0;
    this.omega += ((d / Math.max(dt, 1e-3)) - this.omega) * (1 - Math.exp(-10 * dt));
  } else {
    this.omega *= Math.exp(-0.7 * dt);                   // a flywheel: it keeps turning, slowly stopping
    if (Math.abs(this.omega) < 0.02) this.omega = 0;
    this.angle += this.omega * dt;
    if (this.task === 0) this.turned += Math.abs(this.omega * dt);
  }
  this.place();
  const emf = this.emfAt(this.angle, this.omega);
  this.emf = emf;
  if (Math.abs(emf) > 0.05) this.signsSeen.add(Math.sign(emf));
  this.peak = Math.max(this.peak * Math.exp(-dt * 0.8), Math.abs(emf));
  // scope: 3 s across the screen
  this.traceT += dt;
  while (this.traceT > 3 / SCOPE_N) { this.traceT -= 3 / SCOPE_N; this.trace[this.traceI] = emf; this.traceI = (this.traceI + 1) % SCOPE_N; }
  this.scopeT = (this.scopeT || 0) + dt;
  if (this.scopeT > 1 / 30) { this.scopeT = 0; this.drawScope(); }
  // bulb, coil glow, hum
  const lvl = clamp(Math.abs(emf) / 3.4, 0, 1.3);
  this.bulbGlass.material.emissiveIntensity = 2.5 * lvl;
  this.bulbGlow.material.opacity = Math.min(1, lvl);
  this.bulbLight.intensity = 0.6 * lvl;
  this.filament.material.color.setRGB(0.33 + lvl, 0.2 + 0.8 * lvl, 0.07 + 0.5 * lvl);
  this.copper.emissiveIntensity = 0.25 * Math.min(1, lvl);
  this.hum?.set({ vol: Math.min(0.05, 0.004 * Math.abs(this.omega)), freq: 40 + Math.abs(this.omega) * 4 });
  // field dots drift from N to S
  let k = 0;
  for (const [y, z] of this.fieldYZ) for (let n = 0; n < 3; n++) { if (k >= 30) break; const s = (t * 0.3 + n / 3 + k * 0.11) % 1; _p4.set(-0.14 + s * 0.28, y, z); this.fieldDots.set(k++, _p4, Math.sin(s * Math.PI)); }
  this.fieldDots.commit();
  // tasks
  if (this.phase === 'play') {
    if (this.task === 0 && this.turned >= Math.PI * 2 && this.signsSeen.size === 2) {
      this.complete(0, 'One full turn gives one full cycle: the e.m.f. goes positive, then negative. That is alternating current. The faster you wind, the bigger the e.m.f.');
    } else if (this.task === 1) {
      const E0 = GEN_B * GEN_A * GEN_N * 2 * Math.PI * f;
      if (f > 0 && E0 >= 3.0 && E0 <= 3.8) this.holdT += dt; else this.holdT = 0;
      if (this.holdT > 1.5) { this.f1 = f; this.complete(1, `Fully lit at ${f.toFixed(1)} rev/s: E₀ = BANω = 0.10 × 0.010 × 200 × 2π × ${f.toFixed(1)} = ${E0.toFixed(2)} V.`); hint.show(this.motor.group, [0, 0.16, 0.03]); }
    } else if (this.task === 2) {
      if (Math.abs(f - 2 * this.f1) <= 0.1 + 1e-9) this.holdT += dt; else this.holdT = 0;
      if (this.holdT > 1.5) this.complete(2, `Twice as fast: the peaks are twice as tall AND twice as close together. Both E₀ = BANω and the frequency are proportional to ω.`);
    }
  }
  this.dataT = (this.dataT || 0) + dt;
  if (this.dataT > 0.2 && this.phase === 'play') { this.dataT = 0; this.drawData(); }
};

// ---------------------------------------------------------------- menu buttons
missions.forEach((m, i) => {
  const b = actionButton(`${i + 1}. ${m.short}`, 0.185, 0.14, () => startMission(i), { bg: ['#1f6fb2', '#b9770e', '#8e44ad', '#1e8449', '#c0392b'][i], size: 24, name: `Start ${m.title}` });
  b.position.set(-0.42 + i * 0.205, 0.0, 0);
  menuGroup.add(b);
  missionButtons.push(b);
});

onFrame((dt, t) => { if (current && current.world.visible) current.tick(dt, t); });
ambience('lab');
openMenu();
start();

// Test hook (used by the automated browser tests; harmless for players).
window.lesson = { missions, startMission, openMenu, get current() { return current; }, Q, info, data, input, scene, renderer, THREE, camera,
  get stars() { return stars; }, speed: 1, panel, toast, missionButtons, nextBtn, menuBtn, restartBtn, app, hint, fx };
