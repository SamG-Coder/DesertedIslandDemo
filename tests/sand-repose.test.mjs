import assert from "node:assert/strict";
import test from "node:test";
import {
  createSandField,
  relaxSandRepose,
  reposeLimit,
} from "../src/sand-repose.mjs";

function asDegrees(angle) {
  return Math.abs(angle) <= Math.PI + 1e-6 ? angle * (180 / Math.PI) : angle;
}

function totalSand(field) {
  let sum = 0;
  field.forEachChunk(chunk => {
    for (const value of chunk.sand) sum += value;
  });
  return sum;
}

function snapshotSand(field) {
  const copies = [];
  field.forEachChunk(chunk => copies.push(Float32Array.from(chunk.sand)));
  return copies;
}

test("reposeLimit(0, 0) is about 34°, (1, 0) is steeper, and (0, 1) is about 18°", () => {
  const dry = reposeLimit(0, 0);
  const cohesive = reposeLimit(1, 0);
  const saturated = reposeLimit(0, 1);
  assert.ok(Math.abs(asDegrees(dry) - 34) < 2.5, `dry repose should be ~34°, got ${asDegrees(dry)}`);
  assert.ok(cohesive > dry, "cohesion raises the angle of repose");
  assert.ok(Math.abs(asDegrees(saturated) - 18) < 2.5, `saturated repose should be ~18°, got ${asDegrees(saturated)}`);
});

test("a tall dumped spike relaxes onto neighbors and conserves mass", () => {
  const field = createSandField({ baseHeight: 0 });
  const ix = 8;
  const iz = 8;
  field.addAtCell(ix, iz, 6);
  const peak = field.cellCenter(ix, iz);
  const neighbor = field.cellCenter(ix + 1, iz);
  const peakBefore = field.sandAt(peak.x, peak.z);
  const neighborBefore = field.sandAt(neighbor.x, neighbor.z);
  const massBefore = totalSand(field);
  assert.ok(peakBefore > 1, "spike should dump a tall pile onto one cell");

  for (let step = 0; step < 16; step += 1) {
    relaxSandRepose(field, 1 / 20);
  }

  assert.ok(field.sandAt(peak.x, peak.z) < peakBefore, "peak lowers");
  assert.ok(field.sandAt(neighbor.x, neighbor.z) > neighborBefore, "neighbors gain sand");
  const massAfter = totalSand(field);
  assert.ok(
    Math.abs(massAfter - massBefore) <= Math.abs(massBefore) * 0.05,
    `mass should stay within 5% (before ${massBefore}, after ${massAfter})`,
  );
});

test("dt=0 does nothing", () => {
  const field = createSandField({ baseHeight: 0 });
  field.addAtCell(8, 8, 6);
  const before = snapshotSand(field);
  const peak = field.cellCenter(8, 8);
  const peakBefore = field.sandAt(peak.x, peak.z);
  relaxSandRepose(field, 0);
  assert.equal(field.sandAt(peak.x, peak.z), peakBefore);
  const after = snapshotSand(field);
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i += 1) {
    assert.deepEqual(Array.from(after[i]), Array.from(before[i]));
  }
});
