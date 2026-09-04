import assert from "node:assert/strict";
import test from "node:test";
import { createSandField } from "../src/sand-chunk-field.mjs";
import { terrainHeight } from "../src/terrain.mjs";

const DUMP = Object.freeze({ amount: 0.16, peaked: true });
const DIG = Object.freeze({ amount: -0.16, peaked: false });

function createField() {
  return createSandField({ heightAt: terrainHeight });
}

function height(field, x, z) {
  return field.heightAt(x, z, terrainHeight);
}

function isOriginChunk(key, chunk, cx, cz) {
  const chunkX = cx ?? chunk?.cx;
  const chunkZ = cz ?? chunk?.cz;
  if (chunkX === 0 && chunkZ === 0) return true;
  return key === "0,0" || key === "0:0";
}

function originChunkAllocated(field) {
  let found = false;
  field.forEachDirtyChunk?.((chunk, cx, cz) => {
    if (isOriginChunk(chunk?.key, chunk, cx, cz)) found = true;
  });
  if (typeof field.hasChunk === "function") {
    found = found || Boolean(field.hasChunk(0, 0));
  }
  if (field.chunks instanceof Map) {
    for (const [key, chunk] of field.chunks) {
      if (isOriginChunk(key, chunk)) found = true;
    }
  }
  return found;
}

test("unedited sandAt is 0 and heightAt equals the base terrain function", () => {
  const field = createField();
  for (const [x, z] of [[0, 0], [3.5, -2], [-6.25, 4], [12.75, 0.5]]) {
    assert.equal(field.sandAt(x, z), 0);
    assert.equal(height(field, x, z), terrainHeight(x, z));
  }
});

test("stamp dump at a point raises heightAt near the center by about 0.1+ meters", () => {
  const field = createField();
  const x = 2.125;
  const z = -3.125;
  const before = height(field, x, z);
  field.stamp(x, z, DUMP);
  const centerLift = height(field, x, z) - before;
  const nearbyLift = height(field, x + 0.04, z - 0.03) - terrainHeight(x + 0.04, z - 0.03);
  assert.ok(centerLift >= 0.1, `center lift was ${centerLift}`);
  assert.ok(field.sandAt(x, z) >= 0.1);
  assert.ok(nearbyLift > 0, "sand next to the dump center should also rise");
});

test("stamp dig lowers height", () => {
  const field = createField();
  const x = -1.875;
  const z = 2.125;
  const before = height(field, x, z);
  field.stamp(x, z, DIG);
  assert.ok(height(field, x, z) < before);
  assert.ok(field.sandAt(x, z) < 0);
});

test("dump then dig on the same point roughly cancels at the center", () => {
  const field = createField();
  const x = 4.125;
  const z = -2.875;
  field.stamp(x, z, DUMP);
  field.stamp(x, z, DIG);
  assert.ok(Math.abs(field.sandAt(x, z)) < 0.02);
  assert.ok(Math.abs(height(field, x, z) - terrainHeight(x, z)) < 0.02);
});

test("stamping far away does not allocate a chunk at the origin", () => {
  const field = createField();
  const farX = 48.125;
  const farZ = 40.125;
  field.stamp(farX, farZ, DUMP);
  assert.ok(field.sandAt(farX, farZ) > 0, "far stamp should write sand");
  assert.equal(field.sandAt(0, 0), 0);
  assert.equal(height(field, 0, 0), terrainHeight(0, 0));
  const inspectable = typeof field.forEachDirtyChunk === "function"
    || typeof field.hasChunk === "function"
    || field.chunks instanceof Map;
  assert.ok(inspectable, "lazy chunks must be observable via chunks or forEachDirtyChunk");
  assert.equal(originChunkAllocated(field), false);
});

test("bilinear sample is finite", () => {
  const field = createField();
  field.stamp(2.125, -1.875, DUMP);
  for (const [x, z] of [
    [2.125, -1.875],
    [2.2, -1.8],
    [2.25, -1.75],
    [0.125, 0.125],
    [-0.37, 1.11],
    [8.01, -0.01],
    [1 / 3, 2 / 3],
  ]) {
    assert.ok(Number.isFinite(field.sandAt(x, z)), `sandAt(${x}, ${z})`);
    assert.ok(Number.isFinite(height(field, x, z)), `heightAt(${x}, ${z})`);
  }
});
