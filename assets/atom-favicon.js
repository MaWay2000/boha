(() => {
  'use strict';
  if (!window.BohaAtomIconRenderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const draw = window.BohaAtomIconRenderer(canvas);
  const existing = [...document.querySelectorAll('link[rel="icon"]')];
  const icon = document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/png'; icon.sizes = '64x64';
  try {
    draw(0);
    icon.href = canvas.toDataURL('image/png');
    existing.forEach(link => link.remove());
    document.head.append(icon);
  } catch (error) {
    icon.remove();
    existing.forEach(link => document.head.append(link));
    console.warn('Atom favicon unavailable; keeping static icon.', error);
  }
})();
