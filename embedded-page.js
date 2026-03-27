(function () {
  if (window === window.parent) {
    return;
  }

  const targetOrigin = window.location.origin;
  let lastHeight = 0;
  let animationFrame = 0;

  function readHeight() {
    return Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.offsetHeight : 0,
      document.body ? document.body.offsetHeight : 0
    );
  }

  function postHeight() {
    const height = readHeight();
    if (!height || Math.abs(height - lastHeight) < 1) {
      return;
    }

    lastHeight = height;
    window.parent.postMessage(
      {
        type: "boha:frame-height",
        height
      },
      targetOrigin
    );
  }

  function postState(search = window.location.search) {
    window.parent.postMessage(
      {
        type: "boha:page-state",
        search
      },
      targetOrigin
    );
  }

  function scheduleHeightPost() {
    if (animationFrame) {
      return;
    }

    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      postHeight();
    });
  }

  const resizeObserver = new ResizeObserver(scheduleHeightPost);
  if (document.documentElement) {
    resizeObserver.observe(document.documentElement);
  }
  if (document.body) {
    resizeObserver.observe(document.body);
  }

  const mutationObserver = new MutationObserver(scheduleHeightPost);
  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });

  document.addEventListener("DOMContentLoaded", scheduleHeightPost);
  window.addEventListener("load", scheduleHeightPost);
  window.addEventListener("resize", scheduleHeightPost);

  window.setTimeout(scheduleHeightPost, 200);
  window.setTimeout(scheduleHeightPost, 1200);

  window.bohaEmbeddedPage = {
    postState
  };
})();
