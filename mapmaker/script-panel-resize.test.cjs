const assert = require('node:assert/strict');

(async () => {
  const {getScriptPanelWidthBounds, mountScriptPanelResize} = await import('./js/scriptPanelResize.js');
  for (const viewport of [320, 500, 640, 800, 1280, 1920, 2560]) {
    const {min, max} = getScriptPanelWidthBounds(viewport);
    assert(min <= max && min > 0);
    assert(viewport - max >= Math.min(300, viewport / 2), 'Map always keeps visible space');
    assert.equal(min, Math.min(320, viewport / 2));
  }
  assert.doesNotThrow(() => mountScriptPanelResize(null, null, () => {}));

  const classes = new Set(), properties = {}, frames = [], windowListeners = {}, observers = [];
  const view = {
    innerWidth:1600,
    requestAnimationFrame:fn => frames.push(fn),
    addEventListener:(type, fn) => { windowListeners[type] = fn; },
    ResizeObserver:class {
      constructor(fn) { this.fn = fn; observers.push(this); }
      observe(target) { this.target = target; }
    }
  };
  const body = {
    classList:{
      contains:name => classes.has(name),
      toggle:(name, on) => on ? classes.add(name) : classes.delete(name)
    },
    style:{setProperty:(name, value) => { properties[name] = value; }}
  };
  const panel = {getBoundingClientRect:() => {
    if (!classes.has('script-tab-open')) return {width:430};
    const {min, max} = getScriptPanelWidthBounds(view.innerWidth);
    const preferred = properties['--script-editor-width']
      ? parseFloat(properties['--script-editor-width']) : Math.min(view.innerWidth * 0.6, 1100);
    return {width:Math.max(min, Math.min(max, preferred))};
  }};
  const listeners = {}, attributes = {}, captures = new Set();
  const handle = {
    ownerDocument:{body, defaultView:view},
    addEventListener:(type, fn) => { listeners[type] = fn; },
    setAttribute:(name, value) => { attributes[name] = String(value); },
    setPointerCapture:id => captures.add(id),
    hasPointerCapture:id => captures.has(id),
    releasePointerCapture:id => captures.delete(id),
    focus:() => {}
  };
  function event(extra = {}) {
    return {pointerId:1, button:0, isPrimary:true, clientX:960,
      preventDefault(){ this.prevented = true; },
      stopPropagation(){ this.stopped = true; }, ...extra};
  }
  let resizes = 0;
  mountScriptPanelResize(handle, panel, () => { resizes++; });
  assert.equal(observers[0].target, panel);
  listeners.pointerdown(event());
  listeners.keydown(event({key:'ArrowRight'}));
  assert.equal(captures.size, 0, 'Other tabs cannot start a width drag');
  assert.equal(Object.keys(properties).length, 0, 'Other tabs keep their widths');

  classes.add('script-tab-open');
  observers[0].fn();
  assert.equal(attributes['aria-valuenow'], '960');
  assert.equal(attributes['aria-valuemin'], '320');
  assert.equal(attributes['aria-valuemax'], '1300');
  listeners.pointerdown(event({button:2}));
  listeners.pointerdown(event({isPrimary:false}));
  assert.equal(captures.size, 0, 'Only primary left-button drags resize');
  const down = event();
  listeners.pointerdown(down);
  assert(down.prevented && down.stopped && captures.has(1));
  assert(classes.has('script-width-resizing'));
  listeners.pointermove(event({pointerId:2, clientX:1200}));
  assert.equal(properties['--script-editor-width'], undefined, 'Unrelated pointers are ignored');
  listeners.pointermove(event({clientX:1100}));
  listeners.pointermove(event({clientX:1200}));
  assert.equal(panel.getBoundingClientRect().width, 1200);
  assert.equal(attributes['aria-valuenow'], '1200');
  assert.equal(frames.length, 1, 'Pointer moves coalesce renderer resizes');
  assert.equal(resizes, 0);
  frames.shift()();
  assert.equal(resizes, 1);
  listeners.pointermove(event({clientX:9000}));
  assert.equal(panel.getBoundingClientRect().width, 1300, 'Map space cannot be dragged away');
  listeners.pointerup(event({pointerId:2}));
  assert(captures.has(1));
  listeners.pointerup(event());
  assert(!captures.has(1) && !classes.has('script-width-resizing'));
  frames.shift()();

  listeners.keydown(event({key:'Home'}));
  assert.equal(panel.getBoundingClientRect().width, 320);
  const right = event({key:'ArrowRight'});
  listeners.keydown(right);
  assert(right.prevented && right.stopped, 'Arrow keys do not reach map camera controls');
  assert.equal(panel.getBoundingClientRect().width, 340);
  listeners.keydown(event({key:'ArrowRight', shiftKey:true}));
  assert.equal(panel.getBoundingClientRect().width, 440);
  listeners.keydown(event({key:'ArrowLeft'}));
  assert.equal(panel.getBoundingClientRect().width, 420);
  listeners.keydown(event({key:'End'}));
  assert.equal(panel.getBoundingClientRect().width, 1300);
  const unchanged = properties['--script-editor-width'];
  listeners.keydown(event({key:'ArrowLeft', ctrlKey:true}));
  listeners.keydown(event({key:'a'}));
  assert.equal(properties['--script-editor-width'], unchanged);
  frames.shift()();

  listeners.pointerdown(event({clientX:1300}));
  listeners.pointermove(event({clientX:-100}));
  assert.equal(panel.getBoundingClientRect().width, 320);
  listeners.pointercancel(event());
  assert(!captures.has(1) && !classes.has('script-width-resizing'));
  frames.shift()();
  listeners.pointerdown(event());
  captures.delete(1);
  listeners.lostpointercapture(event());
  assert(!classes.has('script-width-resizing'), 'Lost pointer capture ends resizing');

  listeners.keydown(event({key:'End'}));
  view.innerWidth = 700;
  windowListeners.resize();
  assert.equal(panel.getBoundingClientRect().width, 400);
  assert.equal(attributes['aria-valuenow'], '400');
  assert.equal(attributes['aria-valuemax'], '400', 'Bounds follow window width');
  classes.delete('script-tab-open');
  frames.shift()();
  const before = resizes;
  listeners.keydown(event({key:'Home'}));
  listeners.pointerdown(event());
  assert.equal(captures.size, 0);
  assert.equal(panel.getBoundingClientRect().width, 430, 'Other tabs recover their standard sidebar');
  assert.equal(resizes, before, 'Queued drag does not resize an inactive tab');
  classes.add('script-tab-open');
  for (const blocked of ['overlay-open', 'loading-map']) {
    classes.add(blocked);
    listeners.pointerdown(event());
    listeners.keydown(event({key:'Home'}));
    assert.equal(captures.size, 0, 'Hidden divider is inactive');
    classes.delete(blocked);
  }
  console.log('PASS: Script width divider drag, keyboard, bounds, frame throttling, pointer cleanup and tab isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
