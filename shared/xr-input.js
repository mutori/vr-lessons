// Hands-first WebXR input shared by the VR lessons (Meta Quest Browser first).
//
// One module so hands and controllers behave the same in every lesson:
//   * Near things are touched: poke buttons with the index fingertip (or the controller tip),
//     pinch (or trigger / grip) on an object to pick it up or use it.
//   * Far things are pointed at: aim the ray and pinch (or pull the trigger).
//   * When a hand is near something touchable its ray is hidden, so one gesture does one thing.
//   * Nothing needs a thumbstick and no pinch has to be held for long (held tools are sticky).
//
// The lesson keeps its own picking logic and passes it in (pickRay / onRaySelect / onRayHover).
// Distances are starting values, to be tuned on a headset. Record final values here.
import * as THREE from 'three';

export const TUNING = {
  pinchOn: 0.018,        // thumb-tip to index-tip centre distance that starts a pinch (m)
  pinchOff: 0.030,       // ...and that ends it (gap between on and off stops chatter)
  pokeFire: 0.010,       // fingertip surface this far past a button face fires it once
  pokeMaxSink: 0.012,    // how far a button visibly sinks
  pokeHover: 0.05,       // a fingertip this close in front of a button counts as hovering
  pokeMargin: 0.008,     // slack beyond a button's edges
  grabRadius: 0.06,      // pinch this close to an object to take or use it
  nearRadius: 0.12,      // a hand this close to anything touchable hides its far ray
  rayLookbackMs: 100,    // a hand pinch selects what the ray hovered this long ago
  anchorFollow: 28,      // 1/s smoothing for held objects following the hand
  ctrlTipRadius: 0.012,  // controller "fingertip" size for poking
};

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _q1 = new THREE.Quaternion();
const _box = new THREE.Box3();
const Y = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, -1);

// ------------------------------------------------------------------ small utilities
export function yawOfQuaternion(q) {
  _v1.copy(FWD).applyQuaternion(q);
  return Math.atan2(-_v1.x, -_v1.z);
}

// Bounding box of an object (and its children) in the object's own local space. Cached.
export function localBox(obj, refresh = false) {
  if (obj.userData._localBox && !refresh) return obj.userData._localBox;
  obj.updateWorldMatrix(true, true);
  const inv = _m1.copy(obj.matrixWorld).invert();
  const out = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.geometry || o.isSprite || o.isLine || o.userData.noBox) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _box.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    out.union(_box);
  });
  if (out.isEmpty()) out.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.05, 0.05, 0.05));
  obj.userData._localBox = out;
  return out;
}

// Distance (m) from a world point to an object's local bounding box. 0 when inside.
export function distanceToObject(obj, worldPoint) {
  const b = localBox(obj);
  obj.updateWorldMatrix(true, false);
  const s = obj.matrixWorld.getMaxScaleOnAxis();
  _v2.copy(worldPoint).applyMatrix4(_m1.copy(obj.matrixWorld).invert());
  return b.distanceToPoint(_v2) * s;
}

function isShown(o) {
  while (o) { if (!o.visible) return false; o = o.parent; }
  return true;
}

// One Euro filter (Casiez et al. 2012): steady when still, responsive when moving fast.
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.x = null; this.dx = new THREE.Vector3();
  }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  reset() { this.x = null; }
  filter(v, dt) {
    if (!this.x || dt <= 0) { this.x = v.clone(); this.dx.set(0, 0, 0); return this.x; }
    const d = _v3.copy(v).sub(this.x).divideScalar(dt);
    this.dx.lerp(d, OneEuro.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * this.dx.length();
    this.x.lerp(v, OneEuro.alpha(cutoff, dt));
    return this.x;
  }
}

// A thin outline box used to highlight whatever a hand is about to touch or use.
export class FocusBox {
  constructor(scene, color = 0xffd34d) {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 998;
    this.mesh.visible = false;
    this.mesh.userData.noHit = true;
    this.mesh.raycast = () => {};
    scene.add(this.mesh);
    this.target = null;
  }
  show(obj, pad = 0.006) {
    this.target = obj;
    if (!obj) { this.mesh.visible = false; return; }
    const b = localBox(obj);
    obj.updateWorldMatrix(true, false);
    const size = b.getSize(_v1).addScalar(pad * 2);
    const c = b.getCenter(_v2);
    this.mesh.matrix.copy(obj.matrixWorld).multiply(_m1.compose(c, _q1.identity(), size));
    this.mesh.matrixWorldNeedsUpdate = true;
    this.mesh.visible = true;
  }
}

// Plain-language names for the current input, used in on-board instructions.
export function inputWords(kind) {
  if (kind === 'hand') return { select: 'pinch', Select: 'Pinch', point: 'point and pinch', touch: 'touch', Touch: 'Touch', grab: 'pinch it' };
  if (kind === 'controller') return { select: 'pull the trigger', Select: 'Pull the trigger', point: 'point and pull the trigger', touch: 'touch it with the controller tip', Touch: 'Touch', grab: 'squeeze the grip or pull the trigger' };
  return { select: 'click', Select: 'Click', point: 'click', touch: 'click', Touch: 'Click', grab: 'click it' };
}

// ------------------------------------------------------------------ visuals
const FINGERS = [
  ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ...['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].map((f) => [
    'wrist', `${f}-metacarpal`, `${f}-phalanx-proximal`, `${f}-phalanx-intermediate`, `${f}-phalanx-distal`, `${f}-tip`]),
];
const JOINTS = [...new Set(FINGERS.flat())];             // 25 joints
const BONES = FINGERS.flatMap((ch) => ch.slice(1).map((j, i) => [ch[i], j]));   // 24 bones

// Hand drawn from its tracked joints: one instanced mesh of spheres and one of bones.
class HandVisual {
  constructor(hand, color) {
    const mat = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.62, depthWrite: true });
    this.hand = hand;
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat, JOINTS.length);
    this.bones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), mat, BONES.length);
    for (const m of [this.joints, this.bones]) {
      m.frustumCulled = false; m.renderOrder = 50; m.raycast = () => {}; m.userData.noHit = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      hand.add(m);
    }
    this.tipGlow = 0;
    this.mat = mat;
    this.baseColor = new THREE.Color(color);
  }
  update(highlight) {
    const J = this.hand.joints;
    if (!J || !J['wrist']) { this.joints.visible = this.bones.visible = false; return; }
    this.joints.visible = this.bones.visible = true;
    const m = _m1, s = _v1;
    JOINTS.forEach((name, i) => {
      const j = J[name];
      if (!j) { m.makeScale(0, 0, 0); this.joints.setMatrixAt(i, m); return; }
      const r = (j.jointRadius || 0.008) * 0.95;
      m.compose(j.position, j.quaternion, s.set(r, r, r));
      this.joints.setMatrixAt(i, m);
    });
    BONES.forEach(([a, b], i) => {
      const ja = J[a], jb = J[b];
      if (!ja || !jb) { m.makeScale(0, 0, 0); this.bones.setMatrixAt(i, m); return; }
      const len = ja.position.distanceTo(jb.position);
      const r = Math.min(ja.jointRadius || 0.008, jb.jointRadius || 0.008) * 0.8;
      _v2.subVectors(jb.position, ja.position).normalize();
      _q1.setFromUnitVectors(Y, _v2);
      _v3.addVectors(ja.position, jb.position).multiplyScalar(0.5);
      m.compose(_v3, _q1, s.set(r, len, r));
      this.bones.setMatrixAt(i, m);
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
    this.mat.color.copy(this.baseColor);
    if (highlight) this.mat.color.lerp(new THREE.Color(0xffe27a), 0.45);
  }
}

// A simple controller shape drawn in code (no model download).
function makeControllerVisual(color) {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x2b3238 });
  const accent = new THREE.MeshLambertMaterial({ color });
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.07, 4, 10), body);
  handle.rotation.x = Math.PI / 2 - 0.35; handle.position.set(0, -0.005, 0.03);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 24), accent);
  ring.rotation.x = Math.PI / 2 - 0.5; ring.position.set(0, 0.015, -0.035);
  g.add(handle, ring);
  g.traverse((o) => { o.raycast = () => {}; o.userData.noHit = true; });
  return g;
}

// ------------------------------------------------------------------ the input system
export function createXRInput(opts) {
  const {
    renderer, scene, camera,
    parent = scene,                 // where controllers/hands live (the player rig, or the scene)
    pickRay = () => null,           // (ray, pointer) => hit {point, distance, ...} | null
    onRaySelect = () => {},         // (pointer, hit)
    onRayHover = () => {},          // (pointer, hit|null) every frame
    onRayRelease = null,            // (pointer, hit) when a ray press ends (optional)
    onHeldPress = null,             // (pointer, source, rayHit) when the pointer already holds something
    heldFocus = null,               // (pointer) => object to highlight while holding
    extraNear = null,               // (pointer) => true if the lesson has something touchable near
    rayLength = () => 3,
    sound = () => {},               // (name) 'click' | 'grab'
    onKindChange = () => {},
  } = opts;

  const pokables = [], touchables = [], nears = [];
  const pointers = [];
  const kindColors = [0xc4d6ea, 0xc4d6ea];   // one neutral colour for both hands

  for (let i = 0; i < 2; i++) {
    const ray = renderer.xr.getController(i);
    const grip = renderer.xr.getControllerGrip(i);
    const hand = renderer.xr.getHand(i);
    parent.add(ray, grip, hand);
    const p = {
      index: i, ray, grip, hand, kind: null, handedness: 'none', inputSource: null,
      tracked: false, lastTracked: 0,
      worldRay: new THREE.Ray(), rayOk: false,
      tip: new THREE.Vector3(), tipRadius: 0.008, tipOk: false,
      pinchPoint: new THREE.Vector3(), pinchStrength: 0,
      pinch: false, jointPinch: false, sysSelect: false, sysQueued: false, squeeze: false, squeezeQueued: false,
      held: null, dragging: null, near: false, hover: null, history: [],
      focus: null,
      anchor: new THREE.Object3D(), anchorReady: false,
      filtO: new OneEuro(1.5, 4), filtD: new OneEuro(1.2, 1.5),
    };
    p.anchor.name = 'hold-anchor-' + i;
    scene.add(p.anchor);
    p.handVisual = new HandVisual(hand, kindColors[i]);
    p.ctrlVisual = makeControllerVisual(kindColors[i]);
    grip.add(p.ctrlVisual);
    // ray: a thin tube from the hand, and a cursor where it lands
    p.rayMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    p.cursor = new THREE.Group();
    const dot = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }));
    const ringM = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    p.cursor.add(dot, ringM); p.cursorRing = ringM;
    for (const o of [p.rayMesh, p.cursor, dot, ringM]) { o.raycast = () => {}; o.userData.noHit = true; o.renderOrder = 997; }
    p.rayMesh.visible = p.cursor.visible = false;
    scene.add(p.rayMesh, p.cursor);
    p.focusBox = new FocusBox(scene);

    ray.addEventListener('connected', (e) => {
      const src = e.data;
      p.inputSource = src; p.handedness = src.handedness;
      p.kind = src.hand ? 'hand' : (src.targetRayMode === 'tracked-pointer' ? 'controller' : 'other');
      p.filtO.reset(); p.filtD.reset();
      updateKind();
    });
    ray.addEventListener('disconnected', () => {
      p.kind = null; p.inputSource = null; p.tracked = false;
      p.sysSelect = p.jointPinch = p.squeeze = false;
      if (p.dragging) endDrag(p);
      if (p.raySelect) { const h = p.raySelect.hit; p.raySelect = null; if (onRayRelease) onRayRelease(p, h); }
      updateKind();
    });
    ray.addEventListener('selectstart', () => { p.sysSelect = true; p.sysQueued = true; });
    ray.addEventListener('selectend', () => { p.sysSelect = false; });
    ray.addEventListener('squeezestart', () => { p.squeeze = true; p.squeezeQueued = true; });
    ray.addEventListener('squeezeend', () => { p.squeeze = false; });
    pointers.push(p);
  }

  let kind = 'mouse';
  function updateKind() {
    const kinds = pointers.map((p) => p.kind);
    const k = kinds.includes('hand') ? 'hand' : kinds.includes('controller') ? 'controller' : (renderer.xr.isPresenting ? 'controller' : 'mouse');
    if (k !== kind) { kind = k; onKindChange(kind); }
  }
  renderer.xr.addEventListener('sessionend', () => { kind = 'none'; updateKind(); });

  // ---------------------------------------------------------------- registration
  function addPokable(obj, o = {}) {
    const size = obj.userData.size || {};
    const e = {
      obj, onPress: o.onPress, enabled: o.enabled || (() => true),
      w: o.width ?? size.w ?? 0.1, h: o.height ?? size.h ?? 0.05,
      visual: o.visual || obj.userData.face || null, sink: 0,
      state: ['idle', 'idle'],
    };
    pokables.push(e);
    return { remove() { const i = pokables.indexOf(e); if (i >= 0) pokables.splice(i, 1); }, entry: e };
  }
  function addTouchable(obj, o = {}) {
    const e = { obj, radius: o.radius ?? 0.03, onTouch: o.onTouch, enabled: o.enabled || (() => true), inside: [false, false] };
    touchables.push(e);
    return { remove() { const i = touchables.indexOf(e); if (i >= 0) touchables.splice(i, 1); }, entry: e };
  }
  // A near target is pinched (or trigger/grip) when the hand is within grabRadius of it.
  // onPinch(pointer, source) handles a single press; give onDrag/onRelease to make it a drag
  // that lasts while the pinch is held. distance(worldPoint) can replace the box test.
  function addNearTarget(obj, o = {}) {
    const e = { obj, enabled: o.enabled || (() => true), onPinch: o.onPinch, onDrag: o.onDrag, onRelease: o.onRelease,
      distance: o.distance || null, highlight: o.highlight !== false, priority: o.priority || 0 };
    nears.push(e);
    return { remove() { const i = nears.indexOf(e); if (i >= 0) nears.splice(i, 1); }, entry: e };
  }

  function nearestTarget(point, maxDist, exclude = null) {
    let best = null, bestD = maxDist;
    for (const e of nears) {
      if (e.obj === exclude || !e.enabled() || !isShown(e.obj)) continue;
      let d;
      if (e.distance) d = e.distance(point);
      else {
        e.obj.getWorldPosition(_v1);
        if (_v1.distanceToSquared(point) > 1.0) continue;   // cheap cull: more than 1 m away
        d = distanceToObject(e.obj, point);
      }
      d -= e.priority * 0.01;
      if (d <= bestD) { bestD = d; best = e; }
    }
    return best ? { entry: best, obj: best.obj, distance: bestD } : null;
  }

  // ---------------------------------------------------------------- feedback
  function haptic(p, intensity = 0.4, ms = 30) {
    try { const h = p.inputSource?.gamepad?.hapticActuators?.[0]; if (h?.pulse) h.pulse(intensity, ms); } catch (e) { /* no haptics */ }
  }

  // ---------------------------------------------------------------- presses
  function press(p, source) {
    if (p.dragging) return;
    const now = performance.now();
    if (p.held) {
      const hit = p.rayOk && !p.near ? p.hover : null;
      if (onHeldPress) onHeldPress(p, source, hit); else p.held = null;
      haptic(p);
      return;
    }
    const near = nearestTarget(p.pinchPoint, TUNING.grabRadius);
    if (near) {
      const e = near.entry;
      haptic(p, 0.5, 35);
      if (e.onDrag) { p.dragging = e; e.dragSource = source; }
      if (e.onPinch) e.onPinch(p, source);
      return;
    }
    if (source === 'squeeze' || p.near) return;   // near a button: poke it instead
    let hit = p.hover;
    if (p.kind === 'hand') {        // use what was aimed at just before the pinch started
      const target = now - TUNING.rayLookbackMs;
      let pick = null;
      for (const h of p.history) { if (h.t <= target) pick = h; else break; }
      if (pick && pick.hit) hit = pick.hit;
    }
    if (hit) { haptic(p); p.raySelect = { hit, source }; onRaySelect(p, hit); }
  }
  function release(p, source) {
    if (p.dragging && p.dragging.dragSource === source) endDrag(p);
    // a ray press that is held (for example a tap that flows while held) is told when it ends
    if (p.raySelect && p.raySelect.source === source) { const h = p.raySelect.hit; p.raySelect = null; if (onRayRelease) onRayRelease(p, h); }
  }
  function endDrag(p) {
    const e = p.dragging; p.dragging = null;
    if (e && e.onRelease) e.onRelease(p);
  }

  // ---------------------------------------------------------------- per frame
  let head = { x: 0, y: 1.6, z: 0, yaw: 0, valid: false };
  let needRecenter = false;
  let recenterCb = null;
  renderer.xr.addEventListener('sessionstart', () => {
    needRecenter = true;
    try {
      const rs = renderer.xr.getReferenceSpace();
      rs?.addEventListener?.('reset', () => { needRecenter = true; });
    } catch (e) { /* reset events not supported */ }
    for (const p of pointers) { p.anchorReady = false; }
  });

  let lastT = performance.now();
  function update() {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
    if (!renderer.xr.isPresenting) {
      for (const p of pointers) { p.rayMesh.visible = p.cursor.visible = false; p.focusBox.show(null); }
      return;
    }
    // head pose (in reference space = parent space)
    const frame = renderer.xr.getFrame?.();
    const rs = renderer.xr.getReferenceSpace();
    const vp = frame && rs ? frame.getViewerPose(rs) : null;
    if (vp) {
      const t = vp.transform;
      _q1.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      head = { x: t.position.x, y: t.position.y, z: t.position.z, yaw: yawOfQuaternion(_q1), valid: true };
      if (needRecenter) { needRecenter = false; if (recenterCb) recenterCb(head); }
    }
    parent.updateWorldMatrix(true, false);
    for (const p of pointers) updatePointer(p, dt, now);
    updatePokes();
    updateTouches();
  }

  function updatePointer(p, dt, now) {
    const isHand = p.kind === 'hand';
    p.ray.updateMatrixWorld(true);
    p.grip.updateMatrixWorld(true);
    p.hand.updateMatrixWorld(true);
    p.tracked = !!p.kind && p.kind !== 'other' && (isHand ? p.hand.visible : p.ray.visible);
    if (p.tracked) p.lastTracked = now;

    // ray (system target ray; smoothed for hands)
    p.rayOk = p.tracked && p.ray.visible;
    if (p.rayOk) {
      const o = _v1.setFromMatrixPosition(p.ray.matrixWorld);
      const d = _v2.copy(FWD).transformDirection(p.ray.matrixWorld);
      if (isHand) { p.worldRay.origin.copy(p.filtO.filter(o, dt)); p.worldRay.direction.copy(p.filtD.filter(d, dt)).normalize(); }
      else { p.worldRay.origin.copy(o); p.worldRay.direction.copy(d); }
    }

    // fingertip, pinch point and joint pinch
    p.tipOk = false;
    if (isHand && p.tracked) {
      const J = p.hand.joints, it = J['index-finger-tip'], tt = J['thumb-tip'];
      if (it && tt) {
        p.tip.setFromMatrixPosition(it.matrixWorld); p.tipRadius = it.jointRadius || 0.008; p.tipOk = true;
        _v3.setFromMatrixPosition(tt.matrixWorld);
        p.pinchPoint.addVectors(p.tip, _v3).multiplyScalar(0.5);
        const d = p.tip.distanceTo(_v3);
        if (p.jointPinch && d > TUNING.pinchOff) p.jointPinch = false;
        else if (!p.jointPinch && d < TUNING.pinchOn) p.jointPinch = true;
        p.pinchStrength = THREE.MathUtils.clamp((0.06 - d) / (0.06 - TUNING.pinchOn), 0, 1);
      }
    } else if (p.kind === 'controller' && p.tracked) {
      p.tip.setFromMatrixPosition(p.ray.matrixWorld); p.tipRadius = TUNING.ctrlTipRadius; p.tipOk = true;
      p.pinchPoint.copy(p.tip);
      p.pinchStrength = p.inputSource?.gamepad?.buttons?.[0]?.value || 0;
      p.jointPinch = false;
    } else p.jointPinch = false;

    // hold anchor: follows the pinch point upright, waits in place while tracking is lost
    if (p.tipOk) {
      const yaw = p.rayOk ? Math.atan2(-p.worldRay.direction.x, -p.worldRay.direction.z) : 0;
      _q1.setFromAxisAngle(Y, yaw);
      if (!p.anchorReady) { p.anchor.position.copy(p.pinchPoint); p.anchor.quaternion.copy(_q1); p.anchorReady = true; }
      else {
        const k = 1 - Math.exp(-TUNING.anchorFollow * dt);
        p.anchor.position.lerp(p.pinchPoint, k);
        p.anchor.quaternion.slerp(_q1, k);
      }
    }

    // near check: hide the far ray when a hand is close to something touchable
    p.near = false;
    if (p.tipOk) {
      if (nearestTarget(p.pinchPoint, TUNING.nearRadius, p.held && p.held.obj ? p.held.obj : p.held)) p.near = true;
      else if (pokables.some((e) => pokeRegion(e, p) < TUNING.nearRadius)) p.near = true;
      else if (touchables.some((e) => e.enabled() && isShown(e.obj) && e.obj.getWorldPosition(_v1).distanceTo(p.tip) < e.radius + TUNING.nearRadius)) p.near = true;
      else if (extraNear && extraNear(p)) p.near = true;
    }

    // presses: system select or joint pinch for hands (whichever comes first), trigger for controllers
    const pinchNow = p.sysSelect || p.jointPinch;
    if ((pinchNow || p.sysQueued) && !p.pinch) { p.pinch = true; press(p, 'pinch'); }
    p.sysQueued = false;
    if (!pinchNow && p.pinch) { p.pinch = false; release(p, 'pinch'); }
    if (p.squeezeQueued) { p.squeezeQueued = false; press(p, 'squeeze'); }
    if (!p.squeeze && p.dragging && p.dragging.dragSource === 'squeeze') release(p, 'squeeze');
    if (p.dragging && p.dragging.onDrag) p.dragging.onDrag(p);

    // ray hover
    const showRay = p.rayOk && !p.near && !p.dragging;
    let hit = null;
    if (showRay) hit = pickRay(p.worldRay, p);
    p.hover = hit;
    p.history.push({ t: now, hit });
    while (p.history.length && p.history[0].t < now - 400) p.history.shift();
    onRayHover(p, hit);

    // ray visuals
    p.rayMesh.visible = showRay;
    p.cursor.visible = showRay && !!hit;
    if (showRay) {
      const len = hit ? hit.distance : rayLength(p);
      p.rayMesh.position.copy(p.worldRay.origin);
      p.rayMesh.quaternion.setFromUnitVectors(FWD, p.worldRay.direction);
      p.rayMesh.scale.set(1, 1, Math.max(0.01, len));
      p.rayMesh.material.color.set(hit ? 0xffd34d : 0xffffff);
      p.rayMesh.material.opacity = hit ? 0.75 : 0.4;
      if (hit) {
        const cam = renderer.xr.getCamera();
        cam.getWorldPosition(_v1);
        const dist = _v1.distanceTo(hit.point);
        p.cursor.position.copy(hit.point).lerp(_v1, 0.002 / Math.max(dist, 0.01));
        p.cursor.quaternion.copy(cam.getWorldQuaternion(_q1));
        const s = Math.max(0.0025, dist * 0.004);
        p.cursor.scale.setScalar(s);
        p.cursorRing.scale.setScalar(1 - 0.45 * p.pinchStrength);
      }
    }

    // highlight what this hand would take or use
    let focus = null;
    if (p.tipOk && !p.dragging) {
      if (p.held) focus = heldFocus ? heldFocus(p) : null;
      else { const n = nearestTarget(p.pinchPoint, TUNING.grabRadius); if (n && n.entry.highlight) focus = n.obj; }
    }
    p.focus = focus;
    p.focusBox.show(focus);

    // hand / controller visuals
    p.ctrlVisual.visible = p.kind === 'controller';
    if (isHand) p.handVisual.update(p.near || !!focus);
  }

  // Distance from the fingertip to a button's front region (Infinity if not facing it).
  function pokeRegion(e, p) {
    if (!e.enabled() || !isShown(e.obj)) return Infinity;
    e.obj.updateWorldMatrix(true, false);
    const l = _v1.copy(p.tip).applyMatrix4(_m1.copy(e.obj.matrixWorld).invert());
    const ox = Math.max(0, Math.abs(l.x) - e.w / 2), oy = Math.max(0, Math.abs(l.y) - e.h / 2);
    if (l.z < -0.03) return Infinity;
    return Math.hypot(ox, oy, Math.max(0, l.z));
  }

  function updatePokes() {
    for (const e of pokables) {
      let sink = 0;
      const live = e.enabled() && isShown(e.obj);
      for (const p of pointers) {
        const i = p.index;
        if (!live || !p.tipOk) { e.state[i] = 'idle'; continue; }
        e.obj.updateWorldMatrix(true, false);
        const l = _v1.copy(p.tip).applyMatrix4(_m1.copy(e.obj.matrixWorld).invert());
        const over = Math.abs(l.x) <= e.w / 2 + TUNING.pokeMargin && Math.abs(l.y) <= e.h / 2 + TUNING.pokeMargin;
        const depth = p.tipRadius - l.z;      // > 0 once the fingertip surface is past the face
        const st = e.state[i];
        if (!over || l.z > TUNING.pokeHover + p.tipRadius) { e.state[i] = 'idle'; continue; }
        if (st === 'idle') e.state[i] = depth > 0 ? 'blocked' : 'armed';   // arriving from behind or the side is ignored
        else if (st === 'blocked') { if (depth <= 0) e.state[i] = 'armed'; }
        else if (st === 'armed') {
          if (depth >= TUNING.pokeFire) {
            e.state[i] = 'fired';
            sound('click'); haptic(p, 0.6, 30);
            if (e.onPress) e.onPress(p);
          }
        } else if (st === 'fired') { if (depth <= 0) e.state[i] = 'armed'; }
        if (e.state[i] !== 'blocked') sink = Math.max(sink, THREE.MathUtils.clamp(depth, 0, TUNING.pokeMaxSink));
      }
      // sink the visible face only (never the frame we measure from)
      e.sink += (sink - e.sink) * 0.6;
      if (e.visual) e.visual.position.z = -e.sink;
    }
  }

  function updateTouches() {
    for (const e of touchables) {
      const live = e.enabled() && isShown(e.obj);
      if (live) e.obj.getWorldPosition(_v2);
      for (const p of pointers) {
        const i = p.index;
        if (!live || !p.tipOk) { e.inside[i] = false; continue; }
        const d = _v2.distanceTo(p.tip) - p.tipRadius;
        if (!e.inside[i] && d < e.radius) {
          e.inside[i] = true; sound('click'); haptic(p, 0.5, 30);
          if (e.onTouch) e.onTouch(p);
        } else if (e.inside[i] && d > e.radius + 0.015) e.inside[i] = false;
      }
    }
  }

  // Put the player rig so the head ends up at (x, z) facing yaw. Used on start and on teleport.
  let lift = 0;
  function placeRig(rig, x, z, yaw) {
    if (!renderer.xr.isPresenting || !head.valid) {
      rig.position.set(x, 0, z); rig.rotation.set(0, yaw, 0); return;
    }
    const ry = yaw - head.yaw;
    rig.rotation.set(0, ry, 0);
    _v1.set(head.x, 0, head.z).applyAxisAngle(Y, ry);
    rig.position.set(x - _v1.x, lift, z - _v1.z);
    rig.updateMatrixWorld(true);
    for (const p of pointers) { p.filtO.reset(); p.filtD.reset(); }
  }
  // Seated learners: lift the view so benches and tables are at a working height.
  function setLiftFromHead(h = head) {
    lift = h.y > 0.3 && h.y < 1.25 ? THREE.MathUtils.clamp(1.5 - h.y, 0, 0.5) : 0;
    return lift;
  }

  return {
    pointers, TUNING, update, addPokable, addTouchable, addNearTarget, nearestTarget, haptic,
    placeRig, setLiftFromHead,
    get lift() { return lift; },
    get head() { return head; },
    get kind() { return kind; },
    onRecenter(cb) { recenterCb = cb; },
    words() { return inputWords(kind); },
  };
}
