(() => {
  'use strict';
  if (!window.BohaAtomIconRenderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const draw = window.BohaAtomIconRenderer(canvas);
  const existing = [...document.querySelectorAll('link[rel="icon"]')];
  const icon = document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/png'; icon.sizes = '64x64';
  // A still version remains available with ?atom_motion=off.
  const animate = new URLSearchParams(location.search).get('atom_motion') !== 'off';
  let elapsed = 0, last = null, timer = null;
  function frame() {
    const now = performance.now();
    if (last !== null) elapsed += Math.min(0.25, (now - last) / 1000) * 0.7;
    last = now;
    draw(elapsed);
    icon.href = canvas.toDataURL('image/png');
  }
  function schedule() {
    clearInterval(timer); timer = null; last = null;
    icon.dataset.documentHidden = String(document.hidden);
    icon.dataset.animation = animate ? 'enabled' : 'disabled';
    if (!document.hidden && animate) timer = setInterval(frame, 125);
  }
  try {
    frame();
    existing.forEach(link => link.remove());
    document.head.append(icon);
    schedule();
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pagehide', () => clearInterval(timer));
    window.addEventListener('pageshow', schedule);
  } catch (error) {
    icon.remove();
    existing.forEach(link => document.head.append(link));
    console.warn('Atom favicon unavailable; keeping static icon.', error);
  }
})();
