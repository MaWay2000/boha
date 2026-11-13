(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BohaYouTubeLoader = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  return function createYouTubeLoader(win) {
    let pending = null;
    return function load() {
      if (win.YT?.Player) return Promise.resolve();
      if (pending) return pending;
      pending = new Promise((resolve, reject) => {
        const script = win.document.createElement('script');
        const previous = win.onYouTubeIframeAPIReady;
        let done = false;
        const finish = error => {
          if (done) return;
          done = true; win.clearTimeout(timer);
          if (win.onYouTubeIframeAPIReady === ready) win.onYouTubeIframeAPIReady = previous;
          if (error) { script.remove(); pending = null; reject(error); } else resolve();
        };
        const ready = () => { if (win.YT?.Player) finish(); else finish(new Error('YouTube player unavailable.')); };
        const timer = win.setTimeout(() => finish(new Error('YouTube timed out. Press Play to retry.')), 30000);
        win.onYouTubeIframeAPIReady = ready;
        script.async = true; script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () => finish(new Error('Could not load YouTube. Press Play to retry.'));
        win.document.head.append(script);
      });
      return pending;
    };
  };
});
