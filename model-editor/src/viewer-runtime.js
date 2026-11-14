// Used independently for model fetches and scene preparation.
export function createTaskGate() {
  let generation = 0;
  return { begin: () => ++generation, isCurrent: (token) => token === generation, current: () => generation };
}

export function parseCoordinateInput(rawValue) {
  if (String(rawValue).trim() === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

// OrbitControls.update() reports whether damping still changed the camera.
export function createRenderScheduler({ requestFrame, cancelFrame, update, render, isHidden = () => false }) {
  let frame = null;
  function request() {
    if (frame === null && !isHidden()) frame = requestFrame(tick);
  }
  function tick() {
    frame = null;
    if (isHidden()) return;
    const changed = update();
    render();
    if (changed) request();
  }
  function cancel() {
    if (frame !== null) cancelFrame(frame);
    frame = null;
  }
  return { request, cancel };
}
