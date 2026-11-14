// Measure consecutive one-second windows only while loaded previews are visible.
export function createLowFpsDetector({threshold = 10, duration = 5000} = {}) {
  let start = null, frames = 0, lowFor = 0, tripped = false;
  function reset() { start = null; frames = 0; lowFor = 0; tripped = false; }
  return {
    reset,
    sample(time, active = true) {
      if (!active || !Number.isFinite(time)) { reset(); return false; }
      if (tripped) return false;
      if (start === null || time < start) { start = time; frames = 0; return false; }
      frames++;
      const elapsed = time - start;
      if (elapsed < 1000) return false;
      const fps = frames * 1000 / elapsed;
      lowFor = fps < threshold ? lowFor + elapsed : 0;
      start = time; frames = 0;
      if (lowFor < duration) return false;
      tripped = true;
      return true;
    }
  };
}

export function isPreviewVisible(element) {
  if (!element || element.ownerDocument?.hidden) return false;
  let rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const gallery = element.closest?.('.stats-favorite-unit-gallery');
  if (gallery) {
    const clip = gallery.getBoundingClientRect();
    rect = {top: Math.max(rect.top, clip.top), left: Math.max(rect.left, clip.left), bottom: Math.min(rect.bottom, clip.bottom), right: Math.min(rect.right, clip.right)};
    if (rect.bottom <= rect.top || rect.right <= rect.left) return false;
  }
  let win = element.ownerDocument.defaultView;
  while (win) {
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) return false;
    // Clip to each viewport before translating into the parent frame.
    rect = {top: Math.max(0, rect.top), left: Math.max(0, rect.left), bottom: Math.min(win.innerHeight, rect.bottom), right: Math.min(win.innerWidth, rect.right)};
    try {
      if (win.parent === win || !win.frameElement) break;
      const frame = win.frameElement.getBoundingClientRect();
      rect = {top: rect.top + frame.top, bottom: rect.bottom + frame.top, left: rect.left + frame.left, right: rect.right + frame.left};
      win = win.parent;
    } catch { break; }
  }
  return true;
}

export function freezePreviewItem(item, doc, disposeModel) {
  const source = item.renderer?.domElement || item.softwareCanvas;
  try {
    if (source) {
      // WebGL drawing buffers are cleared after compositing; capture immediately.
      if (item.renderer && item.model) item.renderer.render(item.scene, item.camera);
      const still = doc.createElement('canvas');
      still.width = source.width; still.height = source.height;
      still.dataset.engine = 'still';
      still.setAttribute('aria-label', 'Still image of the unit model');
      const context = still.getContext('2d');
      if (!context) throw new Error('Still preview unavailable');
      context.drawImage(source, 0, 0);
      source.replaceWith(still);
    }
  } catch {
    source?.remove();
    if (item.message) { item.message.hidden = false; item.message.textContent = '3D preview disabled'; }
  } finally {
    item.resizeObserver?.disconnect();
    disposeModel(item.model);
    item.renderer?.dispose();
    item.renderer?.forceContextLoss?.();
    item.model = null; item.renderer = null; item.softwareCanvas = null;
    item.scene = null; item.camera = null;
  }
}
