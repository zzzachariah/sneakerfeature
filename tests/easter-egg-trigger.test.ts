import assert from "node:assert/strict";
import test from "node:test";
import {
  EASTER_EGG_OVERLAY_Z_INDEX,
  KEY_SEQUENCE_WINDOW_MS,
  TAP_SEQUENCE_WINDOW_MS,
  appendTapTimestamp,
  advanceKeySequence
} from "../lib/easter-egg-trigger.ts";

test("advanceKeySequence counts three p presses inside the desktop trigger window", () => {
  let state = { count: 0, lastAt: 0 };

  state = advanceKeySequence(state, "p", 100);
  state = advanceKeySequence(state, "P", 500);
  state = advanceKeySequence(state, "p", 900);

  assert.equal(KEY_SEQUENCE_WINDOW_MS, 900);
  assert.equal(state.count, 3);
  assert.equal(state.lastAt, 900);
});

test("advanceKeySequence resets when the desktop trigger window is exceeded", () => {
  let state = { count: 0, lastAt: 0 };

  state = advanceKeySequence(state, "p", 100);
  state = advanceKeySequence(state, "p", 1200);

  assert.equal(state.count, 1);
  assert.equal(state.lastAt, 1200);
});

test("advanceKeySequence resets when a non-p key interrupts the sequence", () => {
  let state = { count: 0, lastAt: 0 };

  state = advanceKeySequence(state, "p", 100);
  state = advanceKeySequence(state, "x", 300);
  state = advanceKeySequence(state, "p", 500);

  assert.equal(state.count, 1);
  assert.equal(state.lastAt, 500);
});

test("appendTapTimestamp keeps only taps that are inside the mobile trigger window", () => {
  let queue = appendTapTimestamp([], 100);
  queue = appendTapTimestamp(queue, 400);
  queue = appendTapTimestamp(queue, 950);

  assert.equal(TAP_SEQUENCE_WINDOW_MS, 900);
  assert.deepEqual(queue, [100, 400, 950]);

  queue = appendTapTimestamp(queue, 2200);
  assert.deepEqual(queue, [2200]);
});

test("overlay z-index stays above existing nav and modal layers", () => {
  assert.ok(EASTER_EGG_OVERLAY_Z_INDEX > 200);
});
