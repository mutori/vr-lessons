// Shared engine for the single-station science games (Forms 1–4 Integrated Science).
//
// Each game stands the learner at one table with a big board in front. Everything is done with
// three moves that work the same with hands, controllers and a mouse:
//   * Touch (poke) a button with a fingertip, or point at it and pinch / pull the trigger / click.
//   * Pinch a piece to pick it up. It stays in the hand (sticky). Bring it to a glowing spot and
//     pinch again to put it there, or point at the spot and pinch. Pinch in empty air to put it back.
//   * Point at far things and pinch to choose them.
// Uses shared/xr-input.js for hands and controllers. No build step; three.js is vendored.
import * as THREE from 'three';
import { VRButton } from './vendor/VRButton.js';
import { createXRInput, inputWords, distanceToObject } from './xr-input.js';
import { createDebugHud } from './debug-hud.js';
import { buildLab, makeEnvironment, softDiscTexture, glowTexture } from './lab-room.js';

export { THREE };

export function createGame(opts = {}) {
  const {
    title = 'Science game',
    sky = 0xdfe7ee,
    // Where the learner's head goes in VR (x, z, facing yaw) and the desktop camera.
    vrSpot = { x: 0, z: 0, yaw: 0 },
    deskSpot = { x: 0, z: 0.5, yaw: 0, height: 1.65, pitch: -0.36 },
  } = opts;

  // ---------------------------------------------------------------- renderer / scene
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  document.body.appendChild(renderer.domElement);
  const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
  document.body.appendChild(vrButton);
  document.getElementById('loading')?.remove();

  const scene = new THREE.Scene();
  // the room encloses everything, so clear to black (cheapest clear on Quest)
  scene.background = new THREE.Color(0x000000);
  scene.environment = makeEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 80);
  camera.position.set(0, deskSpot.height, 0);
  const rig = new THREE.Group();
  rig.add(camera);
  scene.add(rig);
  // one cheap directional light plus soft sky/ground fill; no real-time shadows (Meta WebXR guidance)
  scene.add(new THREE.HemisphereLight(0xf4f1ea, 0x6f6a60, 1.25));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
  sun.position.set(-3, 4, 1.5);
  scene.add(sun);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------------------------------------------------------------- small helpers
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
  // matte by default; still picks up soft reflections from the room environment
  const lam = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
  const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });
  function mesh(geo, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    return m;
  }
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const tweens = [];
  function tween(dur, fn, easing = ease) {
    return new Promise((resolve) => tweens.push({ t: 0, dur: Math.max(dur, 0.0001), fn, resolve, easing }));
  }
  const wait = (s) => tween(s, () => {});
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.easing(k));
      if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
  }
  function colorTo(material, hex, dur = 0.6) {
    const from = material.color.clone(); const to = new THREE.Color(hex);
    return tween(dur, (k) => material.color.lerpColors(from, to, k));
  }
  function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const noHit = (o) => { o.traverse((c) => { c.userData.noHit = true; }); return o; };

  // Meta's colour guidance: no pure white or pure black surfaces in the headset
  const soft = (c) => (typeof c === 'string' && /^#(fff|ffffff)$/i.test(c) ? '#e8e6e0' : typeof c === 'string' && /^#(000|000000)$/i.test(c) ? '#1c1c1c' : c);
  const softInk = (c) => (typeof c === 'string' && /^#(fff|ffffff)$/i.test(c) ? '#f3f2ee' : c);
  // ---------------------------------------------------------------- text on canvases
  function canvasPlane(w, h, res = 700) {
    const c = document.createElement('canvas');
    c.width = Math.round(w * res); c.height = Math.round(h * res);
    const ctx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    return { mesh: m, c, ctx, tex, res, update() { tex.needsUpdate = true; } };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Wraps text; supports **bold** spans. Returns the y below the last line.
  function wrapText(ctx, text, x, y, maxW, lh, { draw = true, font = null, bold = null, align = 'left' } = {}) {
    const base = font || ctx.font;
    const strong = bold || 'bold ' + base.replace(/^(bold|normal)\s+/, '');
    const tokens = [];
    String(text).split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (!part) return;
      const b = part.startsWith('**') && part.endsWith('**');
      const t = b ? part.slice(2, -2) : part;
      t.split(/(\s+)/).forEach((w) => { if (w) tokens.push({ w, b }); });
    });
    const lines = []; let line = []; let lw = 0;
    const measure = (tk) => { ctx.font = tk.b ? strong : base; return ctx.measureText(tk.w).width; };
    for (const tk of tokens) {
      if (tk.w === '\n') { lines.push(line); line = []; lw = 0; continue; }
      const isSpace = /^\s+$/.test(tk.w);
      if (isSpace && tk.w.includes('\n')) { lines.push(line); line = []; lw = 0; continue; }
      const wdt = measure(tk);
      if (!isSpace && lw + wdt > maxW && line.length) {
        while (line.length && /^\s+$/.test(line[line.length - 1].w)) line.pop();
        lines.push(line); line = []; lw = 0;
      }
      if (isSpace && !line.length) continue;
      line.push(tk); lw += wdt;
    }
    if (line.length) lines.push(line);
    for (const ln of lines) {
      if (draw) {
        let total = 0; for (const tk of ln) total += measure(tk);
        let cx = align === 'center' ? x - total / 2 : x;
        const prevAlign = ctx.textAlign; ctx.textAlign = 'left';
        for (const tk of ln) { ctx.font = tk.b ? strong : base; ctx.fillText(tk.w, cx, y); cx += ctx.measureText(tk.w).width; }
        ctx.textAlign = prevAlign;
      }
      y += lh;
    }
    ctx.font = base;
    return y;
  }
  function label(text, { w = 0.12, h = 0.04, bg = '#ffffff', fg = '#13293d', font = 'bold 34px system-ui, sans-serif', res = 900, radius = 16 } = {}) {
    const p = canvasPlane(w, h, res);
    p.mesh.userData.draw = (t, color = bg, ink = fg) => {
      const { ctx, c } = p;
      color = soft(color); ink = softInk(ink);
      ctx.clearRect(0, 0, c.width, c.height);
      if (color) { ctx.fillStyle = color; roundRect(ctx, 2, 2, c.width - 4, c.height - 4, Math.min(radius, c.height / 3)); ctx.fill(); }
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = String(t).split('\n');
      // shrink the font until the text fits
      let size = parseInt(font.match(/(\d+)px/)[1], 10);
      for (;;) {
        ctx.font = font.replace(/(\d+)px/, `${size}px`);
        if ((Math.max(...lines.map((l) => ctx.measureText(l).width)) <= c.width - 16 && lines.length * size * 1.15 <= c.height) || size <= 10) break;
        size -= 2;
      }
      const lh = size * 1.15;
      lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 2));
      p.update();
    };
    p.mesh.userData.draw(text);
    return p.mesh;
  }
  // A pressable button: a box with a canvas face that sinks when poked.
  function button(text, w, h, { bg = '#1f6fb2', fg = '#ffffff', font = 'bold 40px system-ui, sans-serif', depth = 0.02 } = {}) {
    font = font.replace(/(\d+)px/, (_, n) => `${n * 2}px`);
    const g = new THREE.Group();
    const face = new THREE.Group();
    const back = mesh(new THREE.BoxGeometry(w, h, depth), lam(0x23384d), 0, 0, -depth / 2 - 0.001);
    const p = canvasPlane(w, h, 1400);
    face.add(back, p.mesh);
    g.add(face);
    g.userData.face = face; g.userData.size = { w, h }; g.userData.isButton = true;
    g.userData.draw = (t, color = bg, ink = fg) => {
      const { ctx, c } = p;
      ink = softInk(ink);
      ctx.clearRect(0, 0, c.width, c.height);
      const base = new THREE.Color(color);
      const lite = '#' + base.clone().offsetHSL(0, 0, 0.09).getHexString(), dark = '#' + base.clone().offsetHSL(0, 0, -0.12).getHexString();
      ctx.fillStyle = dark; roundRect(ctx, 4, 4, c.width - 8, c.height - 8, 30); ctx.fill();
      const gr = ctx.createLinearGradient(0, 0, 0, c.height);
      gr.addColorStop(0, lite); gr.addColorStop(1, color);
      ctx.fillStyle = gr; roundRect(ctx, 10, 10, c.width - 20, c.height - 22, 26); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; roundRect(ctx, 18, 14, c.width - 36, (c.height - 28) * 0.42, 20); ctx.fill();
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // wrap, and shrink the font until every line fits the face
      let size = parseInt(font.match(/(\d+)px/)[1], 10);
      let lines;
      for (;;) {
        const f = font.replace(/(\d+)px/, `${size}px`);
        ctx.font = f;
        lines = [];
        String(t).split('\n').forEach((para) => {
          let line = '';
          for (const word of para.split(' ')) {
            const tt = line ? line + ' ' + word : word;
            if (ctx.measureText(tt).width > c.width - 36 && line) { lines.push(line); line = word; } else line = tt;
          }
          lines.push(line);
        });
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        if ((widest <= c.width - 24 && lines.length * size * 1.12 <= c.height - 8) || size <= 14) break;
        size -= 2;
      }
      const lh = size * 1.12;
      lines.forEach((l, i) => ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * lh + 3));
      p.update();
      g.userData.text = t;
    };
    g.userData.draw(text);
    return g;
  }

  // ---------------------------------------------------------------- sound (Web Audio, no files)
  let audio = null;
  function ac() {
    if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { audio = null; } }
    if (audio && audio.state === 'suspended') audio.resume();
    return audio;
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator(); const gn = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    tone,
    click: () => tone(1200, 0.05, 'square', 0.04),
    tick: () => tone(2000, 0.02, 'square', 0.02),
    good: () => { [523, 659, 784].forEach((f, i) => { tone(f, 0.28, 'sine', 0.11, null, i * 0.07); tone(f * 2, 0.2, 'triangle', 0.03, null, i * 0.07); }); },
    bad: () => { tone(220, 0.18, 'triangle', 0.12, 150); tone(165, 0.22, 'triangle', 0.08, 110, 0.12); },
    pick: () => { tone(520, 0.09, 'sine', 0.07, 880); tone(1320, 0.05, 'sine', 0.02, null, 0.03); },
    drop: () => { tone(760, 0.08, 'sine', 0.07, 420); tone(300, 0.1, 'triangle', 0.04, null, 0.04); },
    spark: () => { for (let i = 0; i < 4; i++) tone(1600 + Math.random() * 1400, 0.06, 'sine', 0.025, null, i * 0.04); },
    whoosh: () => tone(300, 0.25, 'sawtooth', 0.03, 120),
    fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, null, i * 0.12)); },
    star: (i = 0) => tone(880 + i * 220, 0.18, 'triangle', 0.12),
  };

  // ---------------------------------------------------------------- room and furniture
  let lab = null;
  function buildRoom({ sign = title.toUpperCase(), accent = 0x5d7f6e, wall = 0xe6e2d8, signBg = '#1d4e6e' } = {}) {
    lab = buildLab({ scene, title, sign, accent, signBg, wall });
    tickers.push((dt, t) => lab.update(dt, t));
    return lab.room;
  }
  // soft contact shadow: a blurred dark disc just above a surface (a baked look, no shadow maps)
  const shadowTex = softDiscTexture('rgba(20,16,10,0.6)');
  function contactShadow(w, d, opacity = 0.7) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1; noHit(m);
    return m;
  }
  // A school lab bench: black epoxy worktop on a cabinet with doors and steel handles.
  function table({ w = 1.3, d = 0.62, h = 0.8, x = 0, z = -0.55 } = {}) {
    const g = new THREE.Group();
    const top = mesh(new THREE.BoxGeometry(w, 0.035, d), mat(0x2b3034, { roughness: 0.3, metalness: 0.05 }), 0, h - 0.0175, 0);
    const lip = mesh(new THREE.BoxGeometry(w + 0.012, 0.012, d + 0.012), mat(0x1f2326, { roughness: 0.4 }), 0, h - 0.03, 0);
    const body = mesh(new THREE.BoxGeometry(w - 0.06, h - 0.13, d - 0.08), lam(0xd9d4c7), 0, (h - 0.13) / 2 + 0.08, -0.01);
    const kick = mesh(new THREE.BoxGeometry(w - 0.1, 0.08, d - 0.14), lam(0x33383d), 0, 0.04, -0.02);
    g.add(top, lip, body, kick);
    const doorM = lam(0xb58a5c, { roughness: 0.6 }), steel = mat(0xc9ced3, { metalness: 0.8, roughness: 0.3 });
    const n = Math.max(2, Math.round(w / 0.45));
    for (const side of [1, -1]) for (let i = 0; i < n; i++) {
      const dx = -w / 2 + 0.03 + (i + 0.5) * ((w - 0.06) / n);
      const door = mesh(new THREE.BoxGeometry((w - 0.06) / n - 0.01, h - 0.2, 0.014), doorM, dx, (h - 0.2) / 2 + 0.1, side * ((d - 0.08) / 2 - 0.003));
      const handle = mesh(new THREE.BoxGeometry(0.1, 0.012, 0.018), steel, dx, h - 0.2, side * ((d - 0.08) / 2 + 0.008));
      g.add(door, handle);
    }
    const sh = contactShadow(w + 0.35, d + 0.35, 0.55); sh.position.y = 0.003; g.add(sh);
    g.position.set(x, 0, z);
    g.userData.topY = h;
    noHit(g);
    scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- the board (instructions + score)
  // A large canvas board. draw({ heading, level, body, items, footer, tone }) redraws it.
  function makeBoard({ w = 1.5, h = 0.86, res = 1000 } = {}) {
    const g = new THREE.Group();
    // a slim display on a floor stand
    const frame = mesh(new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.035), mat(0x2a3138, { roughness: 0.45, metalness: 0.2 }), 0, 0, -0.02);
    const p = canvasPlane(w, h, res);
    g.add(frame, p.mesh);
    const poleM = mat(0x8d969e, { metalness: 0.7, roughness: 0.35 });
    for (const sx of [-1, 1]) {
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 12), poleM, sx * (w / 2 - 0.2), -h / 2 - 0.75, -0.05));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.03, 0.5), poleM, sx * (w / 2 - 0.2), -h / 2 - 1.5 + 0.015, -0.05));
    }
    noHit(g);
    let last = {};
    function draw(d = last) {
      last = d;
      const { ctx, c } = p; const W = c.width, H = c.height, s = W / 1500;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1f2b35'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, 110 * s, W, 8 * s);
      // header bar
      const toneCol = { good: '#2a7d4f', bad: '#a8443a', info: '#2b5d80' }[d.tone || 'info'] || d.tone;
      ctx.fillStyle = toneCol; ctx.fillRect(0, 0, W, 110 * s);
      ctx.fillStyle = '#f3f2ee'; ctx.textBaseline = 'middle';
      ctx.textAlign = 'right'; ctx.font = `bold ${44 * s}px system-ui, sans-serif`;
      ctx.fillText(`Score ${score.points}`, W - 34 * s, 56 * s);
      let rightW = ctx.measureText(`Score ${score.points}`).width + 34 * s;
      if (d.level) {
        ctx.font = `${38 * s}px system-ui, sans-serif`;
        ctx.fillText(d.level, W - rightW - 40 * s, 58 * s);
        rightW += 40 * s + ctx.measureText(d.level).width;
      }
      // the heading shrinks to fit the space left of the score
      let hs = 52;
      ctx.textAlign = 'left';
      do { ctx.font = `bold ${hs * s}px system-ui, sans-serif`; hs -= 2; } while (ctx.measureText(d.heading || title).width > W - rightW - 34 * s - 40 * s && hs > 26);
      ctx.fillText(d.heading || title, 34 * s, 56 * s);
      // body
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#e4e8ea';
      let y = 190 * s;
      const bodyFont = `${d.big ? 50 : 42}px system-ui, sans-serif`.replace(/(\d+)px/, (_, n) => `${n * s}px`);
      for (const para of [].concat(d.body || [])) {
        ctx.font = bodyFont;
        y = wrapText(ctx, para, 40 * s, y, W - 80 * s, (d.big ? 64 : 56) * s, { font: bodyFont });
        y += 16 * s;
      }
      if (d.items) {
        y += 6 * s;
        const f = `${38 * s}px system-ui, sans-serif`;
        for (const it of d.items) {
          const col = it.state === 'done' ? '#3fa36a' : it.state === 'now' ? '#e0a83a' : it.state === 'bad' ? '#d9604f' : '#5f7282';
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(58 * s, y - 13 * s, 13 * s, 0, Math.PI * 2); ctx.fill();
          if (it.state === 'done') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.moveTo(51 * s, y - 13 * s); ctx.lineTo(57 * s, y - 6 * s); ctx.lineTo(66 * s, y - 20 * s); ctx.stroke(); }
          ctx.fillStyle = it.state === 'todo' ? '#9fb0bd' : '#e8ecee';
          ctx.font = it.state === 'now' ? f.replace(/^/, 'bold ') : f;
          y = wrapText(ctx, it.text, 90 * s, y, W - 130 * s, 48 * s, { font: ctx.font });
          y += 6 * s;
        }
      }
      if (d.footer) {
        // fit the footer in the bottom strip: shrink a little, then grow upwards if it still needs a third line
        let fs = 34, n = 0;
        for (; fs >= 26; fs -= 2) {
          ctx.font = `${fs * s}px system-ui, sans-serif`;
          n = Math.round((wrapText(ctx, d.footer, 0, 0, W - 80 * s, 1, { draw: false, font: ctx.font })));
          if (n <= 2) break;
        }
        if (fs < 26) fs = 26;
        const lh = fs * 1.3 * s;
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, H - 36 * s - (Math.max(1, n)) * lh, W, 36 * s + Math.max(1, n) * lh);
        ctx.font = `${fs * s}px system-ui, sans-serif`; ctx.fillStyle = '#b4c1ca';
        wrapText(ctx, d.footer, 40 * s, H - 26 * s - (Math.max(1, n) - 1) * lh, W - 80 * s, lh, { font: ctx.font });
      }
      if (d.stars != null) drawStars(ctx, W - 300 * s, H - 150 * s, 80 * s, d.stars);
      p.update();
    }
    function drawStars(ctx, x, y, r, n) {
      for (let i = 0; i < 3; i++) {
        const cx = x + i * r * 1.25, cy = y;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.22 : r * 0.5;
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = i < n ? '#f2c230' : '#3d4b56'; ctx.fill();
        ctx.strokeStyle = '#8a6d00'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    return { group: g, draw, redraw: () => draw(last), get last() { return last; } };
  }

  // ---------------------------------------------------------------- score
  const score = {
    points: 0, streak: 0, best: 0,
    add(n, at = null) {
      this.points = Math.max(0, this.points + n);
      if (n > 0) { this.streak++; } else this.streak = 0;
      if (at && n) popText((n > 0 ? '+' : '') + n, at, n > 0 ? '#3fbf6f' : '#e06a5a');
      if (at && n > 0) { sparkle(at, n >= 15 ? 26 : 16); sfx.spark(); }
      pulse(n > 0 ? 0.55 : 0.35, n > 0 ? 70 : 140);
      boards.forEach((b) => b.redraw());
    },
    reset() { this.points = 0; this.streak = 0; boards.forEach((b) => b.redraw()); },
  };
  const boards = [];
  function board(o) { const b = makeBoard(o); boards.push(b); return b; }

  // floating "+10" text
  const _pt = new THREE.Vector3();
  function popText(text, at, color = '#1e8449') {
    const l = label(text, { w: 0.16, h: 0.07, bg: null, fg: color, font: 'bold 64px system-ui, sans-serif', res: 800 });
    l.material.depthTest = false; l.renderOrder = 990; noHit(l);
    (at.isVector3 ? _pt.copy(at) : at.getWorldPosition(_pt));
    l.position.copy(_pt).add(new THREE.Vector3(0, 0.06, 0));
    scene.add(l);
    const y0 = l.position.y;
    tween(1.1, (k) => { l.position.y = y0 + k * 0.12; l.material.opacity = 1 - k * k; l.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion())); }, (k) => k)
      .then(() => { scene.remove(l); l.geometry.dispose(); l.material.map.dispose(); l.material.dispose(); });
  }
  // sparkles: small additive stars that fly out and fade (cheap: a handful of sprites, short-lived)
  const sparkTex = glowTexture('255,236,160');
  const sparkMat = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = [];
  function sparkle(at, n = 16, color = 0xffe08a) {
    const p0 = at.isVector3 ? at.clone() : at.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(sparkMat.clone()); sp.material.color.set(color);
      sp.position.copy(p0); sp.userData.noHit = true; sp.renderOrder = 985;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize();
      sp.userData.v = dir.multiplyScalar(0.25 + Math.random() * 0.35); sp.userData.life = 0.55 + Math.random() * 0.3; sp.userData.max = sp.userData.life;
      sp.scale.setScalar(0.02 + Math.random() * 0.02);
      scene.add(sp); sparks.push(sp);
    }
  }
  function updateSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.userData.v.y -= 0.5 * dt; sp.position.addScaledVector(sp.userData.v, dt);
      sp.userData.life -= dt; sp.material.opacity = Math.max(0, sp.userData.life / sp.userData.max);
      if (sp.userData.life <= 0) { scene.remove(sp); sp.material.dispose(); sparks.splice(i, 1); }
    }
  }
  // a short buzz on every controller that has a motor
  function pulse(intensity = 0.5, ms = 60) { if (input && renderer.xr.isPresenting) for (const p of input.pointers) input.haptic(p, intensity, ms); }
  // confetti burst
  const confGeo = new THREE.BoxGeometry(0.012, 0.012, 0.003);
  const confMats = [0xf4c20d, 0x2ecc71, 0x3498db, 0xe74c3c, 0x9b59b6].map((c) => basic(c, { side: THREE.DoubleSide }));
  const confetti = [];
  function burst(at, n = 40) {
    const p0 = at.isVector3 ? at.clone() : at.getWorldPosition(new THREE.Vector3());
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(confGeo, confMats[i % confMats.length]);
      m.position.copy(p0); m.userData.noHit = true;
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.0, (Math.random() - 0.5) * 1.2);
      m.userData.spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0);
      m.userData.life = 1.4 + Math.random() * 0.4;
      scene.add(m); confetti.push(m);
    }
  }
  function updateConfetti(dt) {
    for (let i = confetti.length - 1; i >= 0; i--) {
      const m = confetti[i];
      m.userData.v.y -= 2.2 * dt; m.userData.v.multiplyScalar(0.985);
      m.position.addScaledVector(m.userData.v, dt);
      m.rotation.x += m.userData.spin.x * dt; m.rotation.y += m.userData.spin.y * dt;
      m.userData.life -= dt;
      if (m.userData.life <= 0) { scene.remove(m); confetti.splice(i, 1); }
    }
  }

  // toast: a short message strip that floats above the table
  const toastP = canvasPlane(1.0, 0.12, 900);
  const toast = toastP.mesh; toast.visible = false; toast.renderOrder = 980; toast.material.depthTest = false; noHit(toast);
  scene.add(toast);
  let toastTimer = 0;
  function say(text, tone = 'info', secs = 3.2) {
    const { ctx, c } = toastP;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = { good: 'rgba(30,132,73,0.95)', bad: 'rgba(176,58,46,0.95)', info: 'rgba(20,45,70,0.93)' }[tone] || tone;
    roundRect(ctx, 4, 4, c.width - 8, c.height - 8, 30); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    let size = 46;
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    // shrink to fit two lines
    const fits = () => { ctx.font = `bold ${size}px system-ui, sans-serif`; return wrapText(ctx, text, 0, 0, c.width - 60, size * 1.15, { draw: false }) <= size * 1.15 * 2; };
    while (!fits() && size > 26) size -= 2;
    const lines = wrapText(ctx, text, 0, 0, c.width - 60, size * 1.15, { draw: false }) / (size * 1.15);
    ctx.textAlign = 'center';
    wrapText(ctx, text, c.width / 2, c.height / 2 - (lines - 1) * size * 0.575, c.width - 60, size * 1.15, { align: 'center' });
    toastP.update();
    toast.visible = true; toastTimer = secs;
    lastSaid = text;
    if (tone === 'good') sfx.good(); else if (tone === 'bad') sfx.bad();
  }
  let lastSaid = '';

  // ---------------------------------------------------------------- interaction registry
  let input = null;
  const interactables = [];
  function interactive(obj, o = {}) {
    obj.userData.interactive = { name: o.name || '', onSelect: o.onSelect || null, enabled: o.enabled || (() => true), kind: o.kind || 'thing' };
    interactables.push(obj);
    obj.userData._handles = [];
    if (obj.userData.isButton) obj.userData._handles.push(input.addPokable(obj, { onPress: (p) => activate(obj, p), enabled: o.enabled }));
    else if (o.near !== false) obj.userData._handles.push(input.addNearTarget(obj, { onPinch: (p) => activate(obj, p), enabled: () => (o.enabled ? o.enabled() : true) && !(carry.item && carry.item === obj), priority: o.priority || 0, distance: o.distance || null, highlight: o.highlight }));
    return obj;
  }
  // stop an object being used: off the ray list, off the near / poke lists, and no longer a slot
  function uninteractive(obj) {
    const i = interactables.indexOf(obj); if (i >= 0) interactables.splice(i, 1);
    if (obj.userData.interactive) obj.userData.interactive.enabled = () => false;
    (obj.userData._handles || []).forEach((h) => h.remove());
    obj.userData._handles = [];
    const si = slots.indexOf(obj); if (si >= 0) slots.splice(si, 1);
    if (carry.item === obj) releaseCarry();
  }
  // the nearest enabled interactive ancestor (a locked piece sitting in a tray passes clicks to the tray)
  function findInteractive(o) {
    while (o) { const i = o.userData.interactive; if (i && i.enabled() && interactables.includes(o)) return o; o = o.parent; }
    return null;
  }
  function isShown(o) { while (o) { if (!o.visible) return false; if (!o.parent) return o === scene; o = o.parent; } return false; }
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = 0.003; raycaster.params.Points.threshold = 0.003;   // default is 1 m
  function hitTest(origin, dir) {
    raycaster.set(origin, dir); raycaster.far = 12;
    const list = interactables.filter((o) => o !== carry.item && isShown(o) && o.userData.interactive.enabled());
    const hits = raycaster.intersectObjects(list, true);
    for (const h of hits) {
      if (h.object.userData.noHit) continue;
      if (carry.item && isInside(h.object, carry.item)) continue;
      const root = findInteractive(h.object);
      if (root && root !== carry.item) return { root, point: h.point, distance: h.distance };
    }
    return null;
  }
  function isInside(o, root) { while (o) { if (o === root) return true; o = o.parent; } return false; }

  function activate(root, p) {
    const info = root.userData.interactive;
    if (!info || !info.enabled()) return;
    ac();
    if (carry.item && root.userData.slot) { placeInto(root, p); return; }
    // a piece sitting in a slot stands in for that slot while something else is carried (swap)
    if (carry.item && root.userData.slotProxy) { placeInto(root.userData.slotProxy, p); return; }
    if (root.userData.carry && root.userData.carry.canPick() && !root.userData.locked) { pick(root, p); return; }
    if (root.userData.slot) { root.userData.slot.onEmptySelect?.(p); return; }
    if (info.onSelect) { if (!root.userData.isButton) sfx.click(); info.onSelect(p); }
  }

  // ---------------------------------------------------------------- carry and place
  // A carryable piece is picked up by pinch / trigger / click and held until placed in a slot.
  const carry = { item: null, hand: null };
  const slots = [];
  const desktopHold = new THREE.Object3D();
  desktopHold.position.set(0.14, -0.13, -0.42);
  camera.add(desktopHold);
  function carryable(obj, o = {}) {
    obj.userData.carry = { canPick: o.canPick || (() => true), onPick: o.onPick || null, onReturn: o.onReturn || null, holdOffset: o.holdOffset || new THREE.Vector3(), holdScale: o.holdScale || 1 };
    storeHome(obj);
    interactive(obj, { name: o.name, enabled: o.enabled || (() => obj.userData.carry.canPick() && !obj.userData.locked), onSelect: o.onSelect || null, priority: o.priority || 0 });
    return obj;
  }
  function storeHome(obj) { obj.userData.home = { parent: obj.parent, pos: obj.position.clone(), quat: obj.quaternion.clone(), scale: obj.scale.clone() }; }
  function slot(obj, o = {}) {
    obj.userData.slot = { accept: o.accept || (() => true), onPlace: o.onPlace || null, onEmptySelect: o.onEmptySelect || null, reach: o.reach ?? 0.07 };
    slots.push(obj);
    interactive(obj, { name: o.name, near: false, enabled: o.enabled || (() => true) });
    return obj;
  }
  async function pick(obj, p) {
    if (carry.item === obj) return;
    if (carry.item) returnHome(carry.item);
    const c = obj.userData.carry;
    if (!c.canPick() || obj.userData.locked) return;
    carry.item = obj; carry.hand = p || null;
    const anchor = p && p.anchor;
    if (anchor) p.held = obj;
    const holder = anchor || desktopHold;
    holder.attach(obj);
    const p0 = obj.position.clone(), q0 = obj.quaternion.clone(), s0 = obj.scale.clone();
    const p1 = c.holdOffset.clone(); const q1 = new THREE.Quaternion();
    if (!anchor) q1.setFromEuler(new THREE.Euler(0.35, 0, 0));
    const s1 = obj.userData.home.scale.clone().multiplyScalar(c.holdScale);
    sfx.pick();
    c.onPick?.(p);
    await tween(0.22, (k) => { obj.position.lerpVectors(p0, p1, k); obj.quaternion.slerpQuaternions(q0, q1, k); obj.scale.lerpVectors(s0, s1, k); });
  }
  function releaseCarry() {
    if (carry.hand && carry.hand.held) carry.hand.held = null;
    for (const p of input.pointers) if (p.held === carry.item) p.held = null;
    carry.item = null; carry.hand = null;
  }
  async function returnHome(obj) {
    if (carry.item === obj) releaseCarry();
    const h = obj.userData.home;
    h.parent.attach(obj);
    const p0 = obj.position.clone(), q0 = obj.quaternion.clone(), s0 = obj.scale.clone();
    obj.userData.carry?.onReturn?.();
    await tween(0.35, (k) => { obj.position.lerpVectors(p0, h.pos, k); obj.quaternion.slerpQuaternions(q0, h.quat, k); obj.scale.lerpVectors(s0, h.scale, k); });
  }
  // Move obj into parent at a local position (used by slots' onPlace).
  async function settle(obj, parent, pos, quat = new THREE.Quaternion(), scale = null, dur = 0.25) {
    if (carry.item === obj) releaseCarry();
    parent.attach(obj);
    const p0 = obj.position.clone(), q0 = obj.quaternion.clone(), s0 = obj.scale.clone();
    const s1 = scale || obj.userData.home?.scale || s0;
    await tween(dur, (k) => { obj.position.lerpVectors(p0, pos, k); obj.quaternion.slerpQuaternions(q0, quat, k); obj.scale.lerpVectors(s0, s1, k); });
  }
  function placeInto(slotObj, p) {
    const item = carry.item; if (!item) return;
    const s = slotObj.userData.slot;
    const res = s.accept(item, slotObj);
    if (res === true) { sfx.drop(); s.onPlace?.(item, slotObj, p); if (carry.item === item) releaseCarry(); }
    else { sfx.bad(); if (typeof res === 'string') say(res, 'bad'); }
  }
  const _ip = new THREE.Vector3();
  // The slot nearest the held item, or nearest the hand holding it (both feel natural in VR).
  function nearestSlot(item, p = null) {
    item.getWorldPosition(_ip);
    let best = null, bd = Infinity;
    for (const s of slots) {
      if (!isShown(s) || !s.userData.interactive.enabled()) continue;
      let d = distanceToObject(s, _ip);
      if (p && p.tipOk) d = Math.min(d, distanceToObject(s, p.pinchPoint));
      if (d < s.userData.slot.reach && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  function heldPress(p, hit) {
    if (!carry.item || (carry.hand && carry.hand !== p)) { p.held = null; return; }
    const s = nearestSlot(carry.item, p);
    if (s) return placeInto(s, p);
    if (hit) {
      if (hit.root.userData.slot) return placeInto(hit.root, p);
      return activate(hit.root, p);
    }
    // a near button or piece under the free fingers
    const n = input.nearestTarget(p.pinchPoint, input.TUNING.grabRadius, carry.item);
    if (n && n.obj !== carry.item) return activate(n.obj, p);
    returnHome(carry.item);
  }

  const tickers0 = [];
  // ---------------------------------------------------------------- dragging (levers, sliders, turntables)
  // draggable(obj, { name, onStart(point, p), onMove(point, p), onEnd(p), enabled, plane(point) -> THREE.Plane })
  // Hands: pinch the handle and move. Rays and the mouse: press on it and move; the point is found on
  // a plane through the grab point (facing the viewer unless plane() is given).
  const dragState = { obj: null, src: null, p: null, plane: new THREE.Plane(), pt: new THREE.Vector3() };
  function draggable(obj, o = {}) {
    obj.userData.drag = o;
    obj.userData.interactive = { name: o.name || '', onSelect: null, enabled: o.enabled || (() => true), kind: 'drag' };
    interactables.push(obj);
    obj.userData._handles = [input.addNearTarget(obj, {
      onPinch: (p) => beginDrag(obj, 'near', p, p.pinchPoint), onDrag: (p) => moveDrag(p.pinchPoint, p), onRelease: (p) => endDrag(p),
      enabled: () => obj.userData.interactive.enabled() && !carry.item, priority: o.priority ?? 1, distance: o.distance || null,
    })];
    return obj;
  }
  function beginDrag(obj, src, p, point) {
    const o = obj.userData.drag; if (!o || !obj.userData.interactive.enabled()) return;
    ac();
    dragState.obj = obj; dragState.src = src; dragState.p = p;
    if (o.plane) dragState.plane.copy(o.plane(point));
    else { const n = camera.getWorldPosition(new THREE.Vector3()).sub(point).normalize(); dragState.plane.setFromNormalAndCoplanarPoint(n, point); }
    sfx.tick();
    o.onStart?.(point.clone(), p);
    o.onMove?.(point.clone(), p);
  }
  function moveDrag(point, p) { if (dragState.obj) dragState.obj.userData.drag.onMove?.(point.clone(), p); }
  function endDrag(p) { const obj = dragState.obj; if (!obj) return; dragState.obj = null; obj.userData.drag.onEnd?.(p); sfx.tick(); }
  function rayDragPoint(ray) { return ray.intersectPlane(dragState.plane, dragState.pt); }
  tickers0.push(() => {
    if (dragState.obj && dragState.src === 'ray' && dragState.p) { const q = rayDragPoint(dragState.p.worldRay); if (q) moveDrag(q, dragState.p); }
  });

  // ---------------------------------------------------------------- input
  input = createXRInput({
    renderer, scene, camera, parent: rig,
    pickRay: (ray) => hitTest(ray.origin, ray.direction),
    onRaySelect: (p, hit) => (hit.root.userData.drag ? beginDrag(hit.root, 'ray', p, hit.point) : activate(hit.root, p)),
    onRayRelease: (p) => { if (dragState.obj && dragState.src === 'ray' && dragState.p === p) endDrag(p); },
    onHeldPress: (p, source, hit) => heldPress(p, hit),
    heldFocus: (p) => (carry.item && carry.hand === p ? nearestSlot(carry.item, p) : null),
    extraNear: () => false,
    sound: (n) => { ac(); if (n === 'click') sfx.tick(); },
    onKindChange: (k) => kindListeners.forEach((f) => f(k)),
  });
  const kindListeners = [];
  const hud = createDebugHud({ renderer, camera, input });

  // hover label
  const hoverP = canvasPlane(0.5, 0.07, 800);
  const hoverSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hoverP.tex, depthTest: false, transparent: true }));
  hoverSprite.scale.set(0.5, 0.07, 1); hoverSprite.renderOrder = 999; hoverSprite.visible = false; noHit(hoverSprite);
  scene.add(hoverSprite);
  let hoverName = '';
  function showHover(root, point) {
    const name = root?.userData.interactive?.name;
    if (!root || !name) { hoverSprite.visible = false; hoverName = ''; return; }
    if (name !== hoverName) {
      hoverName = name;
      const { ctx, c } = hoverP;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.font = 'bold 30px system-ui, sans-serif';
      const tw = Math.min(c.width - 10, ctx.measureText(name).width + 40);
      ctx.fillStyle = 'rgba(15,30,45,0.9)'; roundRect(ctx, (c.width - tw) / 2, 4, tw, c.height - 8, 14); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(name, c.width / 2, c.height / 2 + 1);
      hoverP.update();
    }
    hoverSprite.visible = true;
    hoverSprite.position.copy(point).add(new THREE.Vector3(0, 0.06, 0));
  }
  function updateXRHover() {
    let root = null, point = null;
    for (const p of input.pointers) {
      if (p.hover) { root = p.hover.root; point = p.hover.point; break; }
    }
    showHover(root, point);
  }

  // ---------------------------------------------------------------- placement
  const fadeSphere = mesh(new THREE.SphereGeometry(0.2, 16, 12), basic(0x000000, { side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false }));
  fadeSphere.renderOrder = 1002; fadeSphere.visible = false; noHit(fadeSphere);
  camera.add(fadeSphere);
  let spot = { vr: vrSpot, desk: deskSpot };
  function placeLearner() {
    if (renderer.xr.isPresenting) input.placeRig(rig, spot.vr.x, spot.vr.z, spot.vr.yaw);
    else {
      rig.position.set(spot.desk.x, 0, spot.desk.z); rig.rotation.set(0, spot.desk.yaw, 0);
      camera.position.set(0, spot.desk.height, 0); camera.rotation.set(spot.desk.pitch, 0, 0, 'YXZ');
    }
  }
  input.onRecenter((head) => { input.setLiftFromHead(head); placeLearner(); });

  // thumbsticks: right stick snap turn (no walking; everything is within reach)
  let snapReady = true;
  function updateThumbsticks() {
    const session = renderer.xr.getSession(); if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp || gp.axes.length < 4) continue;
      const x = gp.axes[2];
      if (src.handedness === 'right') {
        if (Math.abs(x) > 0.7 && snapReady) { snapTurn(x > 0 ? -Math.PI / 6 : Math.PI / 6); snapReady = false; }
        if (Math.abs(x) < 0.3) snapReady = true;
      }
    }
  }
  function snapTurn(a) {
    const head = new THREE.Vector3(); camera.getWorldPosition(head);
    rig.position.sub(head).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(head);
    rig.rotation.y += a;
  }

  // ---------------------------------------------------------------- desktop controls
  const mouse = new THREE.Vector2(-2, -2);
  let drag = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const h = desktopRay();
    if (h && h.root.userData.drag && !carry.item) { drag = null; beginDrag(h.root, 'mouse', null, h.point); }
  });
  el.addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    if (dragState.obj && dragState.src === 'mouse') { raycaster.setFromCamera(mouse, camera); const q = rayDragPoint(raycaster.ray); if (q) moveDrag(q, null); return; }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
      if (drag.moved > 6) {
        rig.rotation.y -= dx * 0.004;
        camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * 0.004, -1.2, 1.0);
      }
    }
  });
  el.addEventListener('pointerup', () => {
    if (dragState.obj && dragState.src === 'mouse') { endDrag(null); return; }
    if (drag && drag.moved <= 6) desktopClick(); drag = null;
  });
  function desktopRay() {
    raycaster.setFromCamera(mouse, camera);
    return hitTest(raycaster.ray.origin.clone(), raycaster.ray.direction.clone());
  }
  function desktopClick() {
    const h = desktopRay();
    if (h) activate(h.root, null);
    else if (carry.item) returnHome(carry.item);
  }
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyR') placeLearner(); if (e.code === 'Escape' && carry.item) returnHome(carry.item); });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  function updateDesktop(dt) {
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (f || s) {
      const yaw = rig.rotation.y;
      rig.position.x += (-Math.sin(yaw) * f + Math.cos(yaw) * s) * 1.2 * dt;
      rig.position.z += (-Math.cos(yaw) * f - Math.sin(yaw) * s) * 1.2 * dt;
    }
    const h = desktopRay();
    showHover(h?.root, h?.point);
    el.style.cursor = h ? 'pointer' : drag ? 'grabbing' : 'grab';
  }
  document.getElementById('helpToggle')?.addEventListener('click', (e) => {
    const hEl = document.getElementById('help');
    hEl.classList.toggle('min');
    e.target.textContent = hEl.classList.contains('min') ? 'Show help' : 'Hide help';
  });
  renderer.xr.addEventListener('sessionstart', () => { document.getElementById('help')?.classList.add('min'); camera.rotation.set(0, 0, 0); });
  renderer.xr.addEventListener('sessionend', () => { if (carry.item) returnHome(carry.item); rig.position.y = 0; placeLearner(); });

  // ---------------------------------------------------------------- loop
  const tickers = [];
  const clock = new THREE.Clock();
  let time = 0;
  let toastAnchor = new THREE.Vector3(0, 1.25, -0.75), toastAnchorVR = null;
  function start() {
    placeLearner();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05) * (window.game?.speed || 1);
      time += dt;
      updateTweens(dt);
      input.update();
      if (renderer.xr.isPresenting) { updateThumbsticks(); updateXRHover(); } else updateDesktop(dt);
      for (const f of tickers0) f(dt, time);
      for (const f of tickers) f(dt, time);
      updateConfetti(dt); updateSparks(dt);
      if (toast.visible) {
        toastTimer -= dt;
        toast.position.copy(renderer.xr.isPresenting && toastAnchorVR ? toastAnchorVR : toastAnchor);
        toast.material.opacity = Math.min(1, toastTimer * 3);
        if (toastTimer <= 0) toast.visible = false;
      }
      renderer.render(scene, camera);
      hud.update();
    });
  }

  // Best score per game in this browser (a convenience only; the game works without it).
  function loadBest(key) { try { return JSON.parse(localStorage.getItem('vrsci:' + key) || 'null'); } catch { return null; } }
  function saveBest(key, val) { try { localStorage.setItem('vrsci:' + key, JSON.stringify(val)); } catch { /* storage blocked */ } }

  // A tiny state machine helper: run an async step and ignore it if a newer one started.
  let runId = 0;
  function newRun() { return ++runId; }
  function isRun(id) { return id === runId; }

  // ---------------------------------------------------------------- levels and the menu pod
  // levels: [{ title, short, max, start(), stop() }]. A pod of big buttons on the left of the
  // table chooses a level; complete(text) shows the level result with stars.
  // ---------------------------------------------------------------- story guide
  // A friendly character on a small screen beside the board tells the story between levels.
  // guide({ name, role, look: { skin, hair: 'short'|'bun'|'braids'|'bald', coat, shirt, glasses, accent } })
  // .play(lines) queues speech (each line is typed out, then the next follows; press the panel to skip on)
  // .chapter(text) sets the strip above the speech.
  function guide({ name, role, look = {}, pos = new THREE.Vector3(1.12, 1.6, -1.38), yaw = -0.42 }) {
    const L = { skin: '#7a4a2e', hair: 'short', hairCol: '#1d1a18', coat: '#e8e6e0', shirt: '#2b5d80', glasses: false, accent: '#2b5d80', ...look };
    const W = 0.56, H = 0.3;
    const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = yaw;
    const frame = mesh(new THREE.BoxGeometry(W + 0.03, H + 0.03, 0.03), mat(0x2a3138, { roughness: 0.45, metalness: 0.2 }), 0, 0, -0.018);
    const p = canvasPlane(W, H, 1400);
    g.add(frame, p.mesh);
    const pole = mat(0x8d969e, { metalness: 0.7, roughness: 0.35 });
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, pos.y - H / 2, 10), pole, 0, -H / 2 - (pos.y - H / 2) / 2, -0.03));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.02, 24), pole, 0, -pos.y + 0.01, -0.03));
    scene.add(g);
    const st = { queue: [], line: '', shown: 0, hold: 0, chapter: '', talking: false, blink: 0, mouth: 0, dirty: true };
    function face(ctx, x, y, r, talking, blink) {
      // background disc
      const bg = ctx.createRadialGradient(x, y - r * 0.2, r * 0.2, x, y, r);
      bg.addColorStop(0, L.accent); bg.addColorStop(1, '#16202a');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
      // shoulders: lab coat over a shirt
      ctx.fillStyle = L.coat; ctx.beginPath(); ctx.ellipse(x, y + r * 1.05, r * 0.85, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = L.shirt; ctx.beginPath(); ctx.moveTo(x - r * 0.2, y + r * 0.5); ctx.lineTo(x + r * 0.2, y + r * 0.5); ctx.lineTo(x, y + r * 0.95); ctx.closePath(); ctx.fill();
      ctx.fillStyle = L.skin; ctx.fillRect(x - r * 0.14, y + r * 0.2, r * 0.28, r * 0.32);
      // hair behind the head
      ctx.fillStyle = L.hairCol;
      if (L.hair === 'braids') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sx * r * 0.36, y + r * 0.1, r * 0.16, r * 0.42, 0, 0, Math.PI * 2); ctx.fill(); } }
      if (L.hair === 'bun') { ctx.beginPath(); ctx.arc(x, y - r * 0.62, r * 0.2, 0, Math.PI * 2); ctx.fill(); }
      // head and ears
      ctx.fillStyle = L.skin;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sx * r * 0.36, y - r * 0.05, r * 0.07, r * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(x, y - r * 0.08, r * 0.35, r * 0.43, 0, 0, Math.PI * 2); ctx.fill();
      // hair on top
      ctx.fillStyle = L.hairCol;
      if (L.hair !== 'bald') { ctx.beginPath(); ctx.ellipse(x, y - r * 0.33, r * 0.37, r * 0.22, 0, Math.PI, Math.PI * 2); ctx.fill(); if (L.hair !== 'short') { ctx.beginPath(); ctx.ellipse(x, y - r * 0.36, r * 0.36, r * 0.17, 0, 0, Math.PI * 2); ctx.fill(); } }
      // eyes, brows, mouth
      const ey = y - r * 0.1;
      for (const sx of [-1, 1]) {
        if (blink) { ctx.strokeStyle = '#1d1a18'; ctx.lineWidth = r * 0.03; ctx.beginPath(); ctx.moveTo(x + sx * r * 0.15 - r * 0.06, ey); ctx.lineTo(x + sx * r * 0.15 + r * 0.06, ey); ctx.stroke(); }
        else { ctx.fillStyle = '#f3f2ee'; ctx.beginPath(); ctx.ellipse(x + sx * r * 0.15, ey, r * 0.07, r * 0.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1d1a18'; ctx.beginPath(); ctx.arc(x + sx * r * 0.15, ey + r * 0.005, r * 0.032, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = L.hairCol; ctx.lineWidth = r * 0.03; ctx.beginPath(); ctx.moveTo(x + sx * r * 0.08, ey - r * 0.1); ctx.quadraticCurveTo(x + sx * r * 0.15, ey - r * 0.14, x + sx * r * 0.23, ey - r * 0.1); ctx.stroke();
      }
      if (L.glasses) { ctx.strokeStyle = '#2a3138'; ctx.lineWidth = r * 0.022; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * r * 0.15, ey, r * 0.1, 0, Math.PI * 2); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(x - r * 0.05, ey); ctx.lineTo(x + r * 0.05, ey); ctx.stroke(); }
      ctx.fillStyle = 'rgba(60,30,20,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.04, r * 0.04, r * 0.03, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a2620';
      if (talking) { ctx.beginPath(); ctx.ellipse(x, y + r * 0.17, r * 0.09, r * 0.06, 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.strokeStyle = '#5a2620'; ctx.lineWidth = r * 0.03; ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.11, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); }
      ctx.restore();
    }
    function draw() {
      const { ctx, c } = p; const Wp = c.width, Hp = c.height, k = Wp / 784;
      ctx.fillStyle = '#1f2b35'; ctx.fillRect(0, 0, Wp, Hp);
      ctx.fillStyle = L.accent; ctx.fillRect(0, 0, Wp, 58 * k);
      ctx.fillStyle = '#f3f2ee'; ctx.font = `bold ${30 * k}px system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(st.chapter || `${name} · ${role}`, 18 * k, 30 * k);
      face(ctx, 112 * k, 230 * k, 92 * k, st.talking && st.mouth > 0.5, st.blink > 0);
      ctx.textAlign = 'center'; ctx.fillStyle = '#e4e8ea'; ctx.font = `bold ${24 * k}px system-ui, sans-serif`; ctx.fillText(name, 112 * k, 350 * k);
      ctx.fillStyle = '#b4c1ca'; ctx.font = `${20 * k}px system-ui, sans-serif`; ctx.fillText(role, 112 * k, 378 * k);
      // speech
      ctx.fillStyle = '#e4e8ea'; ctx.textBaseline = 'top'; ctx.font = `${32 * k}px system-ui, sans-serif`;
      wrapText(ctx, st.line.slice(0, Math.floor(st.shown)), 230 * k, 80 * k, Wp - 250 * k, 41 * k);
      if (st.queue.length && st.shown >= st.line.length) { ctx.fillStyle = '#e0a83a'; ctx.textAlign = 'right'; ctx.font = `bold ${22 * k}px system-ui, sans-serif`; ctx.fillText('more ▸', Wp - 20 * k, Hp - 34 * k); }
      p.update();
    }
    function next() {
      if (!st.queue.length) { st.talking = false; st.dirty = true; return; }
      st.line = st.queue.shift(); st.shown = 0; st.talking = true;
      st.hold = Math.max(3, st.line.length / 16);
      st.dirty = true;
    }
    let tAcc = 0;
    tickers.push((dt) => {
      if (!g.visible) return;
      tAcc += dt;
      if (st.talking) {
        const before = Math.floor(st.shown);
        st.shown = Math.min(st.line.length, st.shown + dt * 45);
        if (Math.floor(st.shown) !== before) { st.dirty = true; if (Math.floor(st.shown) % 4 === 0 && st.shown < st.line.length && audio && audio.state === 'running') tone(260 + Math.random() * 80, 0.04, 'triangle', 0.025); }
        st.mouth = st.shown < st.line.length ? (Math.sin(tAcc * 22) > 0 ? 1 : 0) : 0;
        if (st.shown >= st.line.length) { st.hold -= dt; if (st.hold <= 0) next(); }
      }
      st.blink = st.blink > 0 ? st.blink - dt : (Math.random() < dt * 0.3 ? 0.14 : 0);
      if (st.dirty || st.blink > 0 || st.talking) { if (tAcc > 0.06 || st.dirty) { draw(); tAcc = 0; st.dirty = false; } }
    });
    const api = {
      group: g, state: st,
      play(lines, { chapter } = {}) { if (chapter != null) st.chapter = chapter; st.queue = [].concat(lines).filter(Boolean); next(); },
      chapter(t) { st.chapter = t; st.dirty = true; },
      skip() { if (st.shown < st.line.length) st.shown = st.line.length; else next(); st.dirty = true; },
      get busy() { return st.talking || st.queue.length > 0; },
    };
    interactive(frame, { name: `${name}: press to hear the next line`, onSelect: () => api.skip(), enabled: () => g.visible && api.busy });
    draw();
    return api;
  }

  function levelFlow({ key, levels, board: b, intro, podPos = new THREE.Vector3(-0.53, 0.98, -0.36), podYaw = 0.9, guide: gd = null, prologue = null, ending = null }) {
    const pod = new THREE.Group();
    pod.position.copy(podPos); pod.rotation.set(0, podYaw, 0, 'YXZ');
    const tilt = new THREE.Group(); tilt.rotation.x = -0.55; pod.add(tilt);
    // the panel grows with the number of levels
    const STEP = levels.length > 4 ? 0.062 : 0.075, BH = levels.length > 4 ? 0.052 : 0.062;
    const podH = levels.length * STEP + 0.08, top = podH / 2 - 0.045;
    const back = mesh(new THREE.BoxGeometry(0.27, podH, 0.02), mat(0x2b3138, { roughness: 0.5 }), 0, 0, -0.02); noHit(back); tilt.add(back);
    const btns = [];
    const state = { index: -1, startPoints: 0, done: levels.map(() => false), stars: levels.map(() => 0), finished: false };
    const best = loadBest(key) || { points: 0 };
    levels.forEach((lv, i) => {
      const bt = button(`${i + 1}. ${lv.short}`, 0.24, BH, { font: 'bold 22px system-ui, sans-serif', bg: '#34506b' });
      bt.position.set(0, top - i * STEP, 0);
      tilt.add(bt);
      interactive(bt, { name: `Level ${i + 1}: ${lv.title}`, onSelect: () => go(i) });
      btns.push(bt);
    });
    const restart = button('Restart level', 0.24, 0.05, { font: 'bold 20px system-ui, sans-serif', bg: '#7b8a97' });
    restart.position.set(0, top - levels.length * STEP + (STEP - 0.05) / 2 + 0.004, 0);
    tilt.add(restart);
    interactive(restart, { name: 'Restart this level', onSelect: () => { if (state.index >= 0) go(state.index); }, enabled: () => state.index >= 0 });
    scene.add(pod);
    function paint() {
      btns.forEach((bt, i) => {
        const cur = i === state.index;
        const star = state.stars[i] ? ' ' + '★'.repeat(state.stars[i]) : '';
        const next = !cur && state.index >= 0 && state.done[state.index] && i === state.index + 1;
        bt.userData.draw(`${i + 1}. ${levels[i].short}${star}`, cur ? '#1f6fb2' : next ? '#1e8449' : state.done[i] ? '#4d6b57' : '#34506b');
      });
      restart.userData.draw('Restart level', state.index >= 0 ? '#7b8a97' : '#b8c2ca');
    }
    function showIntro() {
      b.draw({ heading: intro.heading, body: intro.body, items: levels.map((lv, i) => ({ text: `${lv.story ? 'Chapter' : 'Level'} ${i + 1}: ${lv.title}`, state: state.done[i] ? 'done' : 'todo' })), footer: intro.footer });
      paint();
      if (gd && prologue) gd.play(prologue, { chapter: 'Prologue' });
    }
    function go(i) {
      if (carry.item) returnHome(carry.item);
      newRun();
      if (state.index >= 0) levels[state.index].stop?.();
      if (state.index === i && state.done[i]) state.done[i] = false;
      state.index = i;
      // replaying a level replaces its points
      score.points -= (state.levelPoints?.[i] || 0);
      state.levelPoints = state.levelPoints || levels.map(() => 0);
      state.levelPoints[i] = 0;
      state.startPoints = score.points;
      score.streak = 0;
      paint();
      sfx.whoosh();
      levels[i].start();
      if (gd && levels[i].story) gd.play(levels[i].story.intro || [], { chapter: `Chapter ${i + 1} · ${levels[i].story.chapter || levels[i].title}` });
    }
    function complete(extra = []) {
      const i = state.index; if (i < 0) return;
      const got = score.points - state.startPoints;
      state.levelPoints[i] = got;
      const k = got / (levels[i].max || 1);
      const stars = k >= 0.85 ? 3 : k >= 0.6 ? 2 : 1;
      state.stars[i] = Math.max(state.stars[i], stars);
      state.done[i] = true;
      const all = state.done.every(Boolean);
      if (all && score.points > best.points) { best.points = score.points; saveBest(key, best); }
      paint();
      sfx.fanfare(); pulse(0.8, 160);
      if (gd && levels[i].story) gd.play([...(levels[i].story.outro || []), ...(all && ending ? ending : [])], all && ending ? { chapter: 'The end' } : {});
      burst(new THREE.Vector3(0, 1.3, -1.0), 60);
      sparkle(new THREE.Vector3(-0.3, 1.35, -1.0), 30); sparkle(new THREE.Vector3(0.3, 1.35, -1.0), 30);
      const nextTxt = i < levels.length - 1 ? `Press **${i + 2}. ${levels[i + 1].short}** on the left to go on.` : 'You have finished every level. Well done!';
      b.draw({
        heading: `Level ${i + 1} complete!`, tone: 'good', big: true,
        body: [`You scored **${got}** out of ${levels[i].max} in this level.`, ...extra, nextTxt,
          all ? `Total score: **${score.points}**. Best on this device: ${best.points}.` : ''],
        stars,
      });
      return stars;
    }
    paint();
    return { go, complete, showIntro, paint, state, levels, pod, buttons: btns, restart,
      get index() { return state.index; }, levelPoints: () => score.points - state.startPoints };
  }

  const kit = {
    levelFlow,
    THREE, renderer, scene, camera, rig, input, sfx, ac, tone,
    mat, lam, basic, mesh, tween, wait, colorTo, shuffle, ease, noHit,
    canvasPlane, roundRect, wrapText, label, button,
    buildRoom, table, board, score, say, popText, burst, sparkle, pulse, contactShadow, glowTexture,
    guide, interactive, uninteractive, carryable, slot, draggable, get dragging() { return dragState.obj; }, pick, returnHome, settle, carry, slots, storeHome, activate, hitTest,
    tick: (f) => tickers.push(f), start, placeLearner, onKind: (f) => kindListeners.push(f),
    words: () => inputWords(input.kind), get kind() { return input.kind; },
    setToastAnchor: (v, vr = null) => { toastAnchor.copy(v); toastAnchorVR = vr ? vr.clone() : null; }, get lastSaid() { return lastSaid; },
    setSpot: (s) => { spot = { ...spot, ...s }; },
    loadBest, saveBest, newRun, isRun, get time() { return time; },
    interactables,
    // test helpers (used by the automated browser tests)
    desktopRayAt(x, y) { mouse.set(x, y); return desktopRay(); },
  };
  return kit;
}

// Plain words for "pick it up / put it there" in the current input.
export function howTo(kind) {
  if (kind === 'hand') return { pick: 'pinch it', place: 'bring it to the glowing spot and pinch, or point at the spot and pinch', press: 'touch', choose: 'point at and pinch' };
  if (kind === 'controller') return { pick: 'pull the trigger on it', place: 'bring it to the glowing spot and pull the trigger, or point at the spot and pull', press: 'touch, or point at and pull the trigger on', choose: 'point at and pull the trigger on' };
  return { pick: 'click it', place: 'click the glowing spot', press: 'click', choose: 'click' };
}
