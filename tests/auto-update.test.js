import test from "node:test";
import assert from "node:assert/strict";
import { isSafeToReload } from "../src/hub/autoUpdate.js";

const now = 10_000_000;

test("a new release never reloads while someone is typing or composing Korean", () => {
  assert.equal(isSafeToReload({ now, lastInput: 0, hidden: true, composing: true, editing: false }), false);
  assert.equal(isSafeToReload({ now, lastInput: 0, hidden: true, composing: false, editing: true }), false);
});

test("a new release applies after the window has been idle", () => {
  assert.equal(isSafeToReload({ now, lastInput: now - 60_000, hidden: false, composing: false, editing: false }), false);
  assert.equal(isSafeToReload({ now, lastInput: now - 120_000, hidden: false, composing: false, editing: false }), true);
  assert.equal(isSafeToReload({ now, lastInput: now - 10_000, hidden: true, composing: false, editing: false }), false);
  assert.equal(isSafeToReload({ now, lastInput: now - 30_000, hidden: true, composing: false, editing: false }), true);
});
