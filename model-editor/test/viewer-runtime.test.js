import assert from "node:assert/strict";
import test from "node:test";
import { createRenderScheduler, parseCoordinateInput } from "../src/viewer-runtime.js";

test("coordinate drafts cannot silently become zero or a non-finite value", () => {
  for (const value of ["", " ", "-", "1e", "NaN", "Infinity", "1e999"]) assert.equal(parseCoordinateInput(value), null);
  for (const [text, expected] of [["0", 0], ["-2.35", -2.35], ["1e-6", 0.000001]]) assert.equal(parseCoordinateInput(text), expected);
});

test("renders on demand, coalesces changes, lets damping settle, and sleeps while hidden", () => {
  let renders = 0, damping = 2, hidden = false, nextId = 0;
  const callbacks = new Map();
  const scheduler = createRenderScheduler({
    requestFrame: (callback) => { callbacks.set(++nextId, callback); return nextId; },
    cancelFrame: (id) => callbacks.delete(id), update: () => damping-- > 0,
    render: () => renders++, isHidden: () => hidden,
  });
  const tick = () => { const [id, callback] = callbacks.entries().next().value; callbacks.delete(id); callback(); };
  scheduler.request(); scheduler.request(); scheduler.request();
  assert.equal(callbacks.size, 1);
  while (callbacks.size) tick();
  assert.equal(renders, 3);
  assert.equal(callbacks.size, 0);
  hidden = true; scheduler.request(); assert.equal(callbacks.size, 0);
  hidden = false; scheduler.request(); tick(); assert.equal(renders, 4);
  scheduler.request(); scheduler.cancel(); assert.equal(callbacks.size, 0);
});
