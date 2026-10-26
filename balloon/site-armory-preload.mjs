// Share a bounded preparation job. A retry reuses successful renderer caches,
// but a failed or cancelled batch can never announce that all models are ready.
export function createModelPreloader({items, load, validate = () => {}, onState, active = () => true, concurrency = 3}) {
  let pending = null, complete = false;
  return function prepare() {
    if (pending) return pending;
    if (complete) return Promise.resolve();
    pending = (async () => {
      let ready = 0, cursor = 0, failure = null;
      const notify = (status, total) => { if (active()) onState({status, ready, total}); };
      notify('loading', 0);
      try {
        const list = await items();
        if (!list.length) throw Error('No models available.');
        notify('loading', list.length);
        await Promise.all(Array.from({length: Math.min(concurrency, list.length)}, async () => {
          while (active() && cursor < list.length) {
            const item = list[cursor++];
            try { const model = await load(item); await validate(model); ready++; notify('loading', list.length); }
            catch (error) { failure ||= error; }
          }
        }));
        if (!active()) throw Error('Model preparation cancelled.');
        if (failure) throw failure;
        complete = true; notify('ready', list.length);
      } catch (error) { notify('error', 0); throw error; }
    })().finally(() => { pending = null; });
    return pending;
  };
}

export function publishModelState(root, kind, state) {
  root.dataset['models' + kind] = state.status;
  root.dataset['models' + kind + 'Ready'] = String(state.ready);
  root.dataset['models' + kind + 'Total'] = String(state.total);
  root.dispatchEvent(new CustomEvent('boha:armory-models'));
}

export function createRenderCheck(draw, doc = document) {
  const canvas = doc.createElement('canvas');
  return model => {
    model.traverse(node => {
      if (!node.isMesh) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        const image = material.map?.image;
        if (!image || image.complete === false || !(image.naturalWidth || image.width)) throw Error('Model texture not ready.');
      }
    });
    draw(model, canvas);
    if (!(Number(canvas.dataset.triangles) > 0)) throw Error('Model has no visible triangles.');
  };
}

export function boundedAsset(promise, timeout = 8000) {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(Error('Model asset timed out.')); }, timeout);
    Promise.resolve(promise).then(value => {
      clearTimeout(timer);
      if (expired) { value?.dispose?.(); return; }
      resolve(value);
    }, error => { clearTimeout(timer); reject(error); });
  });
}
