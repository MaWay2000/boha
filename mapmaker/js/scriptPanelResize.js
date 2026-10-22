export function getScriptPanelWidthBounds(viewportWidth) {
  // Leave room for the map, even when the browser window becomes narrow.
  return {
    min: Math.min(320, viewportWidth / 2),
    max: Math.max(viewportWidth / 2, viewportWidth - 300)
  };
}

export function mountScriptPanelResize(handle, panel, onResize) {
  if (!handle || !panel) return;
  const {body, defaultView:view} = handle.ownerDocument;
  let drag = null, resizeQueued = false;
  const isActive = () => body.classList.contains('script-tab-open') &&
    !body.classList.contains('overlay-open') && !body.classList.contains('loading-map');
  const bounds = () => getScriptPanelWidthBounds(view.innerWidth);
  const clamp = width => {
    const {min, max} = bounds();
    return Math.min(max, Math.max(min, width));
  };
  function refreshAria() {
    if (!isActive()) return;
    const {min, max} = bounds();
    handle.setAttribute('aria-valuemin', Math.round(min));
    handle.setAttribute('aria-valuemax', Math.round(max));
    handle.setAttribute('aria-valuenow', Math.round(panel.getBoundingClientRect().width));
  }
  function setWidth(width) {
    const next = clamp(Math.round(width));
    if (Math.abs(panel.getBoundingClientRect().width - next) < 0.5) return;
    body.style.setProperty('--script-editor-width', next + 'px');
    refreshAria();
    // Resize the existing renderer at most once per frame; never rebuild the map.
    if (!resizeQueued) {
      resizeQueued = true;
      view.requestAnimationFrame(() => {
        resizeQueued = false;
        if (isActive()) onResize();
      });
    }
  }
  function finishDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const {pointerId} = drag;
    drag = null;
    body.classList.toggle('script-width-resizing', false);
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  }
  handle.addEventListener('pointerdown', event => {
    if (!isActive() || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopPropagation();
    drag = {pointerId:event.pointerId, x:event.clientX, width:panel.getBoundingClientRect().width};
    handle.setPointerCapture(event.pointerId);
    handle.focus();
    body.classList.toggle('script-width-resizing', true);
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!isActive()) return finishDrag(event);
    event.preventDefault();
    setWidth(drag.width + event.clientX - drag.x);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    handle.addEventListener(type, finishDrag);
  }
  handle.addEventListener('keydown', event => {
    if (!isActive() || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 100 : 20;
    const current = panel.getBoundingClientRect().width;
    let width;
    if (event.key === 'ArrowLeft') width = current - step;
    else if (event.key === 'ArrowRight') width = current + step;
    else if (event.key === 'Home') width = bounds().min;
    else if (event.key === 'End') width = bounds().max;
    else return;
    event.preventDefault();
    event.stopPropagation();
    setWidth(width);
  });
  view.addEventListener('resize', refreshAria);
  if (view.ResizeObserver) new view.ResizeObserver(refreshAria).observe(panel);
  refreshAria();
}
