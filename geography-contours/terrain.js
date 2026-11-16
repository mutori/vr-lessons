// Landscape model for the lesson. Units are metres. x = east, z = south (so -z is north).
// The map covers 2 km x 2 km, from -1000 to +1000 on both axes.

export const HALF = 1000;          // half the map width in metres
export const H0 = 940;             // lowest height used as the model's base (m above sea level)
export const INTERVAL = 20;        // contour interval (m)
export const PLATEAU_TOP = 1092;   // flat top of Tafura Plateau (m)

const G = (dx, dz, sx, sz) => Math.exp(-0.5 * ((dx * dx) / (sx * sx) + (dz * dz) / (sz * sz)));

// River "Chenga": rises in the north and flows south-east to the plain.
export const RIVER = [
  [420, -900], [450, -700], [470, -450], [485, -200], [530, 50],
  [620, 330], [760, 620], [900, 990],
];

// Precompute river segment lengths so we know distance along the river (s).
const segs = [];
{
  let s = 0;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, s0: s });
    s += len;
  }
}

// Distance from (x,z) to the river line, and the distance along the river of the nearest point.
export function riverInfo(x, z) {
  let best = Infinity, bestS = 0;
  for (const g of segs) {
    const vx = g.bx - g.ax, vz = g.bz - g.az;
    let t = ((x - g.ax) * vx + (z - g.az) * vz) / (g.len * g.len);
    t = Math.max(0, Math.min(1, t));
    const px = g.ax + vx * t, pz = g.az + vz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bestS = g.s0 + t * g.len; }
  }
  return { d: best, s: bestS };
}

const baseHeight = (x, z) => 1000 - 0.04 * z; // land slopes gently down to the south

// Height before the river valley is carved.
function landHeight(x, z) {
  let h = baseHeight(x, z);
  // Dombo Hill: a kopje with a steep east face and a gentle west slope.
  { const dx = x - 100, dz = z + 50; const sx = dx > 0 ? 160 : 380; h += 225 * G(dx, dz, sx, 230); }
  // Small kopje to the north-west of Dombo. The low dip between them is a saddle.
  h += 135 * G(x + 150, z + 650, 140, 140);
  // Spur: a tongue of high ground running south from Dombo Hill.
  h += 70 * G(x - 80, z - 260, 80, 210);
  // Nhete Ridge: long, narrow high ground in the north-east, running NNE.
  {
    const a = 15 * Math.PI / 180, dx = x - 720, dz = z + 450;
    const u = dx * Math.sin(a) - dz * Math.cos(a);     // along the ridge
    const v = dx * Math.cos(a) + dz * Math.sin(a);     // across the ridge
    h += 115 * Math.exp(-0.5 * ((u * u) / (300 * 300) + (v * v) / (80 * 80)));
  }
  // Tafura Plateau: a flat-topped hill (table land) in the south-west.
  { const dx = x + 600, dz = z - 450; const r2 = (dx * dx + dz * dz) / (240 * 240); const m = Math.exp(-r2 * r2 * r2); h = h * (1 - m) + PLATEAU_TOP * m; }
  return h;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Final height, with the river valley carved in. The river bed always drops downstream.
export function height(x, z) {
  const h = landHeight(x, z);
  const { d, s } = riverInfo(x, z);
  if (d > 260) return h;
  // nearest river point height of the bed
  let bx = 0, bz = 0;
  for (const g of segs) { if (s >= g.s0 && s <= g.s0 + g.len + 1e-6) { const t = (s - g.s0) / g.len; bx = g.ax + (g.bx - g.ax) * t; bz = g.az + (g.bz - g.az) * t; break; } }
  const bed = baseHeight(bx, bz) - 10;
  const w = Math.exp(-0.5 * (d / 70) ** 2) * smooth(0, 250, s);
  return h > bed ? h - w * (h - bed) : h;
}

export function slopeAt(x, z) {
  const e = 4;
  const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
  const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz); // rise per metre
}

// Find the highest point near (x,z) by hill climbing.
export function findPeak(x, z) {
  let step = 40;
  let h = height(x, z);
  for (let i = 0; i < 400 && step > 0.5; i++) {
    let moved = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nh = height(x + dx * step, z + dz * step);
      if (nh > h) { h = nh; x += dx * step; z += dz * step; moved = true; break; }
    }
    if (!moved) step /= 2;
  }
  return { x, z, h };
}

// Saddle: the lowest point on the highest path between two peaks.
// Approximated by walking the straight line and, at each step, taking the highest point across it.
export function findSaddle(p, q) {
  const dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
  const nx = -dz / L, nz = dx / L;
  let best = { h: Infinity };
  for (let i = 1; i < 100; i++) {
    const t = i / 100;
    let top = { h: -Infinity };
    for (let k = -30; k <= 30; k++) {
      const x = p.x + dx * t + nx * k * 6, z = p.z + dz * t + nz * k * 6;
      const h = height(x, z);
      if (h > top.h) top = { x, z, h };
    }
    if (top.h < best.h) best = top;
  }
  return best;
}

// Find where a contour of value `level` crosses the line from (x0,z0) heading (dx,dz).
export function findLevelAlong(level, x0, z0, dx, dz, maxDist = 1400) {
  let prev = height(x0, z0);
  for (let t = 5; t < maxDist; t += 5) {
    const h = height(x0 + dx * t, z0 + dz * t);
    if ((prev - level) * (h - level) <= 0) return { x: x0 + dx * t, z: z0 + dz * t };
    prev = h;
  }
  return null;
}
