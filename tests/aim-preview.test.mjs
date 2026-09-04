import assert from "node:assert/strict";
import test from "node:test";
import { canShovelHit } from "../src/shovel-system.mjs";
import { previewColor } from "../src/aim-preview.mjs";
import { carryableInteractScore } from "../src/carryable-system.mjs";

test("shovel hits only open terrain or a rock, never sand under solids", () => {
  const occupied = {
    solidAt(x, z) {
      return Math.hypot(x, z) < 0.4 ? { kind: "bucket" } : null;
    },
  };
  assert.equal(canShovelHit({ kind: "terrain", x: 2, z: 2 }, occupied), true);
  assert.equal(canShovelHit({ kind: "terrain", x: 0, z: 0 }, occupied), false);
  assert.equal(canShovelHit({ kind: "bucket", x: 0, z: 0 }, occupied), false);
  assert.equal(canShovelHit({ kind: "palm", x: 3, z: 3 }, occupied), false);
  assert.equal(canShovelHit({ kind: "rock", x: 0, z: 0 }, occupied), true);
  assert.equal(canShovelHit(null, occupied), false);
});

test("aim preview is sand-yellow when valid and red when blocked", () => {
  assert.equal(previewColor("dig", true), 0xf0d089);
  assert.equal(previewColor("fill", true), 0x4ade80);
  assert.equal(previewColor("castle", true), 0xe8c48a);
  assert.equal(previewColor("dig", false), 0xe24b4b);
  assert.equal(previewColor("fill", false), 0xe24b4b);
});

test("E prefers the carryable you are facing", () => {
  const view = { x: 0, z: 0, yaw: Math.PI };
  const towardBucket = carryableInteractScore(view, 0, 1.2);
  const towardShovel = carryableInteractScore(view, 0, -1.2);
  assert.ok(towardBucket > towardShovel);
  assert.equal(towardShovel, -Infinity);
});
