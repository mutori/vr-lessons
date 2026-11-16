// Performance and input overlay, shown only when the page URL has ?debug=1.
// Shows frames per second, the slowest frame in the last 5 s, draw calls and triangles for the
// last frame (both eyes), and which input each hand slot is using.
import * as THREE from 'three';

export function createDebugHud({ renderer, camera, input }) {
  const on = new URLSearchParams(location.search).get('debug') === '1';
  if (!on) return { update() {}, enabled: false };

  const c = document.createElement('canvas'); c.width = 512; c.height = 200;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.256, 0.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }));
  mesh.renderOrder = 1000; mesh.raycast = () => {}; mesh.userData.noHit = true;
  mesh.position.set(-0.17, -0.13, -0.6); mesh.rotation.x = 0.15;
  camera.add(mesh);
  if (!camera.parent) console.warn('debug HUD: camera has no parent; add the camera to the scene');

  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:20;font:12px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.7);color:#9fe2bf;padding:6px 8px;border-radius:6px;white-space:pre;pointer-events:none';
  document.body.appendChild(el);

  renderer.info.autoReset = false;
  let last = performance.now(), frames = 0, acc = 0, fps = 0;
  const recent = [];   // [time, frame ms]
  let calls = 0, tris = 0, drawAt = 0;

  function update() {
    mesh.visible = renderer.xr.isPresenting;   // in the headset only; the page shows the same lines
    const now = performance.now();
    const ms = now - last; last = now;
    recent.push([now, ms]);
    while (recent.length && recent[0][0] < now - 5000) recent.shift();
    frames++; acc += ms;
    calls = renderer.info.render.calls; tris = renderer.info.render.triangles;
    renderer.info.reset();
    if (acc >= 500) { fps = frames * 1000 / acc; frames = 0; acc = 0; }
    if (now - drawAt < 500) return;
    drawAt = now;
    const worst = recent.reduce((a, r) => Math.max(a, r[1]), 0);
    const kinds = input ? input.pointers.map((p) => `${p.handedness || '-'}:${p.kind || 'none'}${p.held ? '+held' : ''}`).join('  ') : '';
    const lines = [
      `fps ${fps.toFixed(0)}   worst 5 s ${worst.toFixed(1)} ms`,
      `draw calls ${calls}   tris ${(tris / 1000).toFixed(0)}k`,
      kinds,
    ];
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = worst > 20 ? '#ffb3a3' : '#9fe2bf';
    ctx.font = 'bold 34px monospace';
    lines.forEach((l, i) => ctx.fillText(l, 14, 50 + i * 54));
    tex.needsUpdate = true;
    el.textContent = lines.join('\n');
  }
  return { update, enabled: true };
}
