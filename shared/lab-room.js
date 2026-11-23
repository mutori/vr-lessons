// A school science laboratory built from code: tiled floor, windows onto a Zimbabwean
// landscape, benches, shelves of glassware, posters and a working wall clock.
// Static parts are merged by material so the whole room costs only a few draw calls
// (Meta's WebXR guidance: keep draw calls low and avoid real-time lights and shadows).
import * as THREE from 'three';

// ---------------------------------------------------------------- canvas textures
function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function noise(ctx, w, h, amt = 10, n = 9000) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * amt / 255})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}
export function softDiscTexture(inner = 'rgba(0,0,0,0.55)') {
  return canvasTex(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner); g.addColorStop(0.55, inner.replace(/[\d.]+\)$/, (m) => `${parseFloat(m) * 0.45})`)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
}
export function glowTexture(color = '255,255,255') {
  return canvasTex(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(0.25, `rgba(${color},0.55)`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
}

const floorTex = () => canvasTex(1024, 1024, (ctx, w, h) => {
  const cols = ['#cfd3cf', '#c7ccc8', '#d4d7d2', '#c3c9c6'];
  const n = 4, s = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    ctx.fillStyle = cols[(i * 3 + j * 5) % cols.length]; ctx.fillRect(i * s, j * s, s, s);
  }
  noise(ctx, w, h, 14, 26000);
  // terrazzo chips
  for (let i = 0; i < 1400; i++) { ctx.fillStyle = ['#9aa3a0', '#e6e8e3', '#a99f8f', '#7c8784'][i % 4]; ctx.globalAlpha = 0.35; ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 4, 3 + Math.random() * 3); }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(90,96,94,0.55)'; ctx.lineWidth = 4;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke(); }
}, { repeat: [3.5, 3.5] });

const plasterTex = (base) => canvasTex(512, 512, (ctx, w, h) => { ctx.fillStyle = base; ctx.fillRect(0, 0, w, h); noise(ctx, w, h, 8, 12000); }, { repeat: [4, 2] });

const woodTex = (base = '#b98a5a', dark = '#8a5f37') => canvasTex(512, 512, (ctx, w, h) => {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * h; ctx.strokeStyle = dark; ctx.globalAlpha = 0.08 + Math.random() * 0.14; ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x / 70 + i) * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1; noise(ctx, w, h, 8, 6000);
});

// outdoor view: Highveld sky, granite kopje with balancing rocks, msasa trees
const outdoorTex = () => canvasTex(1024, 640, (ctx, w, h) => {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, '#5b9bd5'); sky.addColorStop(0.6, '#a9cde9'); sky.addColorStop(1, '#e8eee6');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [cx, cy, s] of [[200, 120, 1], [620, 80, 1.3], [880, 170, 0.8]]) for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.ellipse(cx + k * 28 * s - 70 * s, cy + Math.sin(k) * 8, 45 * s, 24 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  // far hills
  ctx.fillStyle = '#9fb59a';
  ctx.beginPath(); ctx.moveTo(0, h * 0.62);
  for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.58 - Math.sin(x / 140) * 22 - Math.sin(x / 47) * 6);
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
  // granite kopje with balancing rocks
  ctx.fillStyle = '#8d8580';
  ctx.beginPath(); ctx.ellipse(700, h * 0.66, 210, 90, 0, Math.PI, 0); ctx.fill();
  for (const [x, y, rx, ry, c] of [[640, 0.50, 50, 34, '#9b938d'], [700, 0.42, 38, 30, '#a59d96'], [735, 0.36, 26, 22, '#948c86'], [770, 0.52, 44, 30, '#8a827c']]) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, h * y, rx, ry, 0.2, 0, Math.PI * 2); ctx.fill();
  }
  // ground
  const gr = ctx.createLinearGradient(0, h * 0.64, 0, h);
  gr.addColorStop(0, '#9aa45b'); gr.addColorStop(1, '#6f7a3a');
  ctx.fillStyle = gr; ctx.fillRect(0, h * 0.64, w, h * 0.36);
  // msasa trees: flat-ish canopies in greens and spring reds
  for (const [x, s, col] of [[120, 1.2, '#4f7a3a'], [300, 0.9, '#8c3b2a'], [450, 1.1, '#5d8a43'], [960, 1.3, '#47703a'], [560, 0.7, '#a0522d']]) {
    const by = h * 0.72;
    ctx.strokeStyle = '#4a3527'; ctx.lineWidth = 9 * s; ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x - 4, by - 90 * s); ctx.stroke();
    ctx.fillStyle = col;
    for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(x - 60 * s + k * 20 * s, by - 105 * s - Math.sin(k) * 14 * s, 38 * s, 22 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  noise(ctx, w, h, 6, 8000);
});

const periodicPosterTex = () => canvasTex(1400, 800, (ctx, w, h) => {
  ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1d3346'; ctx.font = 'bold 56px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('The Periodic Table', w / 2, 70);
  const cols = { a: '#f3b77a', e: '#f6d77a', t: '#e7a3a3', m: '#b8d8a8', n: '#a8c8e8', g: '#d3b8e8', h: '#cfcfcf' };
  // a simplified 18-column layout for the first 4 periods plus blocks for the rest
  const layout = ['h................g', 'ae..........mnnnng', 'ae..........mmnnng', 'aettttttttttmmmnng', 'aettttttttttmmmmng', 'aettttttttttmmmmmg', 'aettttttttttmmmmmg'];
  const cw = 70, ch = 84, x0 = (w - cw * 18) / 2, y0 = 110;
  layout.forEach((row, r) => [...row].forEach((k, c) => {
    if (k === '.') return;
    ctx.fillStyle = cols[k]; ctx.fillRect(x0 + c * cw + 3, y0 + r * ch + 3, cw - 6, ch - 6);
  }));
  ctx.fillStyle = 'rgba(29,51,70,0.75)'; ctx.font = '26px system-ui'; ctx.fillText('metals  ·  metalloids  ·  non-metals  ·  noble gases', w / 2, h - 30);
});

const safetyPosterTex = () => canvasTex(700, 900, (ctx, w, h) => {
  ctx.fillStyle = '#fbf6e9'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1e7a3c'; ctx.fillRect(0, 0, w, 130);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 64px system-ui'; ctx.textAlign = 'center'; ctx.fillText('LAB SAFETY', w / 2, 88);
  const rules = ['Wear safety goggles', 'Tie back long hair', 'No eating or drinking', 'Report all spills', 'Wash your hands'];
  ctx.textAlign = 'left'; ctx.font = '44px system-ui';
  rules.forEach((r, i) => {
    ctx.fillStyle = '#1e7a3c'; ctx.beginPath(); ctx.arc(70, 220 + i * 140, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 36px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), 70, 233 + i * 140);
    ctx.fillStyle = '#1d2a22'; ctx.font = '42px system-ui'; ctx.textAlign = 'left'; ctx.fillText(r, 125, 235 + i * 140);
  });
});

const signTex = (text, bg) => canvasTex(1800, 220, (ctx, w, h) => {
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 0, w, 10); ctx.fillRect(0, h - 10, w, 10);
  ctx.fillStyle = '#f7f4ec'; ctx.font = 'bold 118px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let s = 118; while (ctx.measureText(text).width > w - 120 && s > 40) { s -= 4; ctx.font = `bold ${s}px system-ui, sans-serif`; }
  ctx.fillText(text, w / 2, h / 2 + 6);
});

// ---------------------------------------------------------------- geometry merging
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const drop = [];
  group.traverse((m) => {
    if (!m.isMesh || m.userData.keep) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const key = m.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: m.material, geos: [] });
    buckets.get(key).geos.push(g);
    drop.push(m);
  });
  for (const m of drop) m.parent.remove(m);
  for (const { mat, geos } of buckets.values()) {
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = mat.transparent ? 2 : 0;
    group.add(mesh);
  }
}

// ---------------------------------------------------------------- glassware
const LATHE = {
  flask: [[0, 0], [0.06, 0], [0.07, 0.01], [0.072, 0.04], [0.05, 0.1], [0.02, 0.14], [0.017, 0.2], [0.02, 0.205]],
  beaker: [[0, 0], [0.045, 0], [0.047, 0.005], [0.047, 0.11], [0.052, 0.115]],
  bottle: [[0, 0], [0.04, 0], [0.042, 0.01], [0.042, 0.12], [0.03, 0.15], [0.016, 0.16], [0.016, 0.185]],
  round: [[0, 0], [0.02, 0.003], [0.055, 0.035], [0.06, 0.07], [0.045, 0.11], [0.017, 0.125], [0.015, 0.2], [0.018, 0.205]],
};
function latheGeo(kind, scale = 1) {
  return new THREE.LatheGeometry(LATHE[kind].map(([r, y]) => new THREE.Vector2(r * scale, y * scale)), 18);
}

// ---------------------------------------------------------------- the room
export function buildLab({ scene, title = 'Science lab', sign, accent = 0x4f6d7a, signBg = '#1d4e6e', wall = 0xe6e2d8 } = {}) {
  const room = new THREE.Group(); room.name = 'lab-room';
  const W = 3.4, ZB = -4.2, ZF = 2.6, H = 3.1;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); room.add(o); return o; };

  // floor
  const floorM = std(0xffffff, { map: floorTex(), roughness: 0.55 });
  add(new THREE.PlaneGeometry(2 * W, ZF - ZB), floorM, 0, 0, (ZF + ZB) / 2, -Math.PI / 2);
  // walls: plaster above, painted dado below, a timber rail between
  const wallM = std(wall, { map: plasterTex('#ffffff') });
  const dadoM = std(accent, { roughness: 0.7 });
  const railM = std(0x6b4a2f, { map: woodTex(), roughness: 0.6 });
  const skirtM = std(0x3a3f44, { roughness: 0.6 });
  const walls = [
    { len: 2 * W, x: 0, z: ZB, ry: 0 }, { len: 2 * W, x: 0, z: ZF, ry: Math.PI },
    { len: ZF - ZB, x: -W, z: (ZF + ZB) / 2, ry: Math.PI / 2 }, { len: ZF - ZB, x: W, z: (ZF + ZB) / 2, ry: -Math.PI / 2 },
  ];
  for (const wl of walls) {
    const n = new THREE.Vector3(Math.sin(wl.ry), 0, Math.cos(wl.ry));
    const at = (d) => [wl.x + n.x * d, wl.z + n.z * d];
    let [x, z] = at(0);
    if (wl.x === -W) {
      // the window wall is built from pieces around three openings
      buildWindowWall(room, wl, wallM, dadoM, H);
    } else {
      add(new THREE.PlaneGeometry(wl.len, H - 1.0), wallM, x, 1.0 + (H - 1.0) / 2, z, 0, wl.ry);
    }
    [x, z] = at(0.002); add(new THREE.PlaneGeometry(wl.len, 1.0), dadoM, x, 0.5, z, 0, wl.ry);
    [x, z] = at(0.015); add(new THREE.BoxGeometry(wl.len, 0.05, 0.03), railM, x, 1.0, z, 0, wl.ry);
    [x, z] = at(0.01); add(new THREE.BoxGeometry(wl.len, 0.1, 0.02), skirtM, x, 0.05, z, 0, wl.ry);
  }
  // ceiling with light panels (emissive, so they read as lights without costing a real light)
  add(new THREE.PlaneGeometry(2 * W, ZF - ZB), std(0xf1efe9), 0, H, (ZF + ZB) / 2, Math.PI / 2);
  const panelM = new THREE.MeshBasicMaterial({ color: 0xfffaf0 });
  const panelFrameM = std(0xb8bcc0, { metalness: 0.3, roughness: 0.4 });
  for (const px of [-1.4, 1.4]) for (const pz of [-2.8, -0.6, 1.6]) {
    add(new THREE.BoxGeometry(1.24, 0.03, 0.64), panelFrameM, px, H - 0.016, pz);
    add(new THREE.PlaneGeometry(1.18, 0.58), panelM, px, H - 0.033, pz, Math.PI / 2);
  }

  // back wall: sign, posters, clock, low cabinets with glassware
  const signM = new THREE.MeshBasicMaterial({ map: signTex(sign || title.toUpperCase(), signBg), toneMapped: false });
  add(new THREE.PlaneGeometry(3.6, 0.44), signM, 0, 2.72, ZB + 0.012);
  add(new THREE.PlaneGeometry(1.5, 0.86), std(0xffffff, { map: periodicPosterTex(), roughness: 0.9 }), -2.15, 1.75, ZB + 0.012);
  add(new THREE.PlaneGeometry(0.56, 0.72), std(0xffffff, { map: safetyPosterTex(), roughness: 0.9 }), 2.2, 1.7, ZB + 0.012);
  const carcassM = std(0xdedad0, { roughness: 0.65 });
  const doorM = std(0xffffff, { map: woodTex('#c49a6c', '#8f6a45'), roughness: 0.6 });
  const epoxyM = std(0x24282c, { roughness: 0.32, metalness: 0.05 });
  const steelM = std(0xc9ced3, { metalness: 0.8, roughness: 0.3 });
  const cabinetRun = (x0, x1, z, ry, depth = 0.6) => {
    const len = x1 - x0, cx = (x0 + x1) / 2;
    const g = new THREE.Group(); g.position.set(cx, 0, z); g.rotation.y = ry; room.add(g);
    const part = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); g.add(o); };
    part(new THREE.BoxGeometry(len, 0.82, depth - 0.04), carcassM, 0, 0.45, -0.02);
    part(new THREE.BoxGeometry(len + 0.02, 0.04, depth + 0.02), epoxyM, 0, 0.88, 0);
    part(new THREE.BoxGeometry(len, 0.08, depth - 0.1), skirtM, 0, 0.04, -0.05);
    const doors = Math.max(1, Math.round(len / 0.5));
    for (let i = 0; i < doors; i++) {
      const dx = -len / 2 + (i + 0.5) * (len / doors);
      part(new THREE.BoxGeometry(len / doors - 0.012, 0.7, 0.018), doorM, dx, 0.46, depth / 2 - 0.02);
      part(new THREE.BoxGeometry(0.012, 0.11, 0.02), steelM, dx + (i % 2 ? -1 : 1) * (len / doors / 2 - 0.05), 0.68, depth / 2);
    }
    return g;
  };
  cabinetRun(-3.3, 3.3, ZB + 0.31, 0);
  // the cabinet along the window wall has a sink and two swan-neck taps
  const winBench = cabinetRun(-1.3, 1.3, -W + 0.31, Math.PI / 2);
  winBench.position.set(-W + 0.31, 0, -0.6);
  {
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.36), std(0x8f979e, { metalness: 0.6, roughness: 0.35 })); sink.position.set(0, 0.875, 0); winBench.add(sink);
    for (const tx of [-0.6, 0.6]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(tx, 0.9, -0.22), new THREE.Vector3(tx, 1.18, -0.22), new THREE.Vector3(tx, 1.24, -0.12), new THREE.Vector3(tx, 1.15, -0.02)]);
      const tap = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.011, 8), steelM); winBench.add(tap);
    }
  }
  // glassware on the cabinets: liquids in a few vivid but not neon colours
  const glassM = new THREE.MeshStandardMaterial({ color: 0xdff1ff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
  const liquids = [0x2e86c1, 0x27ae60, 0xd35400, 0x8e44ad, 0xc0392b, 0xf1c40f].map((c) => std(c, { roughness: 0.2, transparent: true, opacity: 0.8 }));
  const kinds = ['flask', 'beaker', 'bottle', 'round'];
  const place = (x, y, z, i, s = 1) => {
    const k = kinds[i % 4];
    const glass = new THREE.Mesh(latheGeo(k, s), glassM); glass.position.set(x, y, z); room.add(glass);
    const fill = new THREE.Mesh(latheGeo(k, s * 0.93).scale(1, 0.45, 1), liquids[i % liquids.length]); fill.position.set(x, y + 0.004, z); room.add(fill);
  };
  for (let i = 0; i < 9; i++) place(-3.0 + i * 0.32 + (i > 4 ? 1.6 : 0), 0.9, ZB + 0.3 + (i % 2) * 0.12, i, 1);
  // shelving on the right wall
  const shelfM = std(0xffffff, { map: woodTex('#a77b4f', '#6e4a2c'), roughness: 0.6 });
  for (const sy of [0.95, 1.35, 1.75, 2.15]) add(new THREE.BoxGeometry(0.3, 0.025, 2.2), shelfM, W - 0.16, sy, -1.6);
  for (const sz of [-2.7, -0.5]) add(new THREE.BoxGeometry(0.3, 1.3, 0.03), shelfM, W - 0.16, 1.5, sz);
  let k = 0;
  for (const sy of [1.35, 1.75, 2.15]) for (let i = 0; i < 6; i++) { place(W - 0.17, sy + 0.013, -2.5 + i * 0.36 + (sy % 0.5) * 0.2, k++, 0.85 + (k % 3) * 0.1); }
  // fire extinguisher and a potted plant
  add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 16), std(0xc0392b, { roughness: 0.35 }), W - 0.2, 0.3, 0.9);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), std(0x2c2c2c), W - 0.2, 0.59, 0.9);
  add(new THREE.CylinderGeometry(0.16, 0.12, 0.34, 16), std(0x9c5b3b), -W + 0.4, 0.17, 1.9);
  const leafM = std(0x3f7d3a, { roughness: 0.7 });
  for (let i = 0; i < 9; i++) add(new THREE.SphereGeometry(0.11 + (i % 3) * 0.03, 10, 8), leafM, -W + 0.4 + Math.cos(i * 2.1) * 0.12, 0.45 + (i % 4) * 0.12, 1.9 + Math.sin(i * 2.1) * 0.12);
  // a door behind the learner
  add(new THREE.BoxGeometry(0.95, 2.1, 0.04), doorM, 1.6, 1.05, ZF - 0.02);
  add(new THREE.SphereGeometry(0.03, 10, 8), steelM, 1.22, 1.02, ZF - 0.06);

  mergeByMaterial(room);

  // light from the windows: soft sun patches on the floor (no large overlapping transparent quads: they cost fill rate)
  const patchTex = canvasTex(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128); g.addColorStop(0, 'rgba(255,236,200,0.55)'); g.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  });
  const patchM = new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });
  for (const wz of WINDOW_Z) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), patchM); patch.rotation.x = -Math.PI / 2; patch.position.set(-W + 1.5, 0.004, wz + 0.25); room.add(patch);
  }
  // dust motes drifting in the sunlight
  const NM = 140;
  const mp = new Float32Array(NM * 3);
  for (let i = 0; i < NM; i++) { mp[i * 3] = -W + 0.3 + Math.random() * 1.6; mp[i * 3 + 1] = 0.3 + Math.random() * 2.2; mp[i * 3 + 2] = -3.2 + Math.random() * 4.4; }
  const motesGeo = new THREE.BufferGeometry(); motesGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ size: 0.012, map: glowTexture('255,245,220'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  room.add(motes);

  // a wall clock that tells the real time (a canvas redrawn once a second)
  const clockC = document.createElement('canvas'); clockC.width = clockC.height = 256;
  const clockT = new THREE.CanvasTexture(clockC); clockT.colorSpace = THREE.SRGBColorSpace;
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshBasicMaterial({ map: clockT, toneMapped: false }));
  clock.position.set(-0.95, 2.25, ZB + 0.02); room.add(clock);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 8, 40), std(0x2c3e50, { roughness: 0.4 })); rim.position.copy(clock.position); room.add(rim);
  let lastSec = -1;
  function drawClock() {
    const d = new Date(); const s = d.getSeconds(); if (s === lastSec) return; lastSec = s;
    const ctx = clockC.getContext('2d');
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1d2a33';
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; ctx.lineWidth = i % 5 ? 2 : 6; const r0 = i % 5 ? 112 : 100; ctx.beginPath(); ctx.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); ctx.lineTo(128 + Math.sin(a) * 120, 128 - Math.cos(a) * 120); ctx.stroke(); }
    const hand = (a, len, wdt, col) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.sin(a) * len, 128 - Math.cos(a) * len); ctx.stroke(); };
    hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, 60, 9, '#1d2a33');
    hand((d.getMinutes() + s / 60) / 60 * Math.PI * 2, 90, 6, '#1d2a33');
    hand(s / 60 * Math.PI * 2, 100, 2, '#c0392b');
    clockT.needsUpdate = true;
  }
  drawClock();

  room.traverse((o) => { o.userData.noHit = true; });
  scene.add(room);
  const update = (dt, t) => {
    drawClock();
    const a = motesGeo.attributes.position.array;
    for (let i = 0; i < NM; i++) {
      a[i * 3 + 1] += Math.sin(t * 0.3 + i) * 0.0006 + 0.0002;
      a[i * 3] += Math.cos(t * 0.21 + i * 1.7) * 0.0004;
      if (a[i * 3 + 1] > 2.6) a[i * 3 + 1] = 0.3;
    }
    motesGeo.attributes.position.needsUpdate = true;
  };
  return { room, update };
}

const WINDOW_Z = [-2.6, -0.6, 1.4];
function buildWindowWall(room, wl, wallM, dadoM, H) {
  const x = wl.x, zc = wl.z, len = wl.len, ry = wl.ry;
  const z0 = zc - len / 2;
  const WW = 1.3, WY0 = 1.05, WY1 = 2.55;
  const outdoor = new THREE.MeshBasicMaterial({ map: outdoorTex(), toneMapped: false });
  const frameM = new THREE.MeshStandardMaterial({ color: 0x3d4a52, roughness: 0.5, metalness: 0.3 });
  const sillM = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.5 });
  const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.y = ry; room.add(o); return o; };
  // wall strips: above and below the windows, and the piers between them
  add(new THREE.PlaneGeometry(len, H - WY1), wallM, x, WY1 + (H - WY1) / 2, zc);
  add(new THREE.PlaneGeometry(len, WY0 - 1.0), wallM, x, 1.0 + (WY0 - 1.0) / 2, zc);
  let prev = z0;
  for (const wz of [...WINDOW_Z, null]) {
    const next = wz == null ? z0 + len : wz - WW / 2;
    if (next > prev) add(new THREE.PlaneGeometry(next - prev, WY1 - WY0), wallM, x, (WY0 + WY1) / 2, (prev + next) / 2);
    if (wz != null) prev = wz + WW / 2;
  }
  for (const wz of WINDOW_Z) {
    // the view is set back a little so it shifts as the learner moves (parallax)
    add(new THREE.PlaneGeometry(WW * 1.6, (WY1 - WY0) * 1.6), outdoor, x - 0.6, (WY0 + WY1) / 2 + 0.1, wz);
    // reveals (the thickness of the wall)
    add(new THREE.BoxGeometry(0.02, WY1 - WY0, 0.25).rotateY(Math.PI / 2), sillM, x - 0.12, (WY0 + WY1) / 2, wz - WW / 2);
    add(new THREE.BoxGeometry(0.02, WY1 - WY0, 0.25).rotateY(Math.PI / 2), sillM, x - 0.12, (WY0 + WY1) / 2, wz + WW / 2);
    add(new THREE.BoxGeometry(WW + 0.02, 0.02, 0.25).rotateY(Math.PI / 2), sillM, x - 0.12, WY1, wz);
    add(new THREE.BoxGeometry(WW + 0.12, 0.035, 0.3).rotateY(Math.PI / 2), sillM, x + 0.02, WY0, wz);
    // window frame and glazing bars
    const fz = (dz, w2, h2, py) => add(new THREE.BoxGeometry(w2, h2, 0.04).rotateY(Math.PI / 2), frameM, x - 0.05, py, wz + dz);
    fz(0, WW, 0.04, WY0 + 0.02); fz(0, WW, 0.04, WY1 - 0.02); fz(0, WW, 0.035, (WY0 + WY1) / 2 + 0.2);
    fz(-WW / 2 + 0.02, 0.04, WY1 - WY0, (WY0 + WY1) / 2); fz(WW / 2 - 0.02, 0.04, WY1 - WY0, (WY0 + WY1) / 2); fz(0, 0.035, WY1 - WY0, (WY0 + WY1) / 2);
  }
}

// An environment for reflections: a dim room box with bright window strips and ceiling panels.
export function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0x8c8a84, side: THREE.BackSide }));
  box.position.y = 1.6; env.add(box);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0x77786f })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; env.add(floor);
  const bright = (w, h, color, x, y, z, ry, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m); };
  for (const wz of [-2.6, -0.6, 1.4]) bright(1.3, 1.5, 0xd8ecff, -3.95, 1.8, wz, Math.PI / 2);
  for (const px of [-1.4, 1.4]) for (const pz of [-2.4, 0, 2.4]) bright(1.2, 0.6, 0xffffff, px, 3.15, pz, 0, Math.PI / 2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}
