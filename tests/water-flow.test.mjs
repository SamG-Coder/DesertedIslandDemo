import assert from "node:assert/strict";
import test from "node:test";
import { createSandField, createWaterField } from "../src/water-flow.mjs";

const GRID = Object.freeze({
  columns: 33,
  rows: 33,
  cellSize: 1,
});

function createFields(heightAt = () => 0) {
  const sand = createSandField({ ...GRID, heightAt });
  const water = createWaterField(sand, { heightAt });
  return { sand, water, heightAt };
}

function samplePoints(sand) {
  const columns = sand.columns ?? GRID.columns;
  const rows = sand.rows ?? GRID.rows;
  const cellSize = sand.cellSize ?? GRID.cellSize;
  const minX = sand.minX ?? -columns * cellSize / 2;
  const minZ = sand.minZ ?? -rows * cellSize / 2;
  const points = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      points.push({
        x: minX + (col + 0.5) * cellSize,
        z: minZ + (row + 0.5) * cellSize,
      });
    }
  }
  return points;
}

function sampledVolume(sand, water) {
  if (typeof water.totalVolume === "function") return water.totalVolume();
  const cellSize = sand.cellSize ?? GRID.cellSize;
  let sum = 0;
  for (const point of samplePoints(sand)) {
    sum += water.depthAt(point.x, point.z);
  }
  return sum * cellSize * cellSize;
}

function sampledCentroidZ(sand, water) {
  let mass = 0;
  let zMass = 0;
  for (const point of samplePoints(sand)) {
    const depth = water.depthAt(point.x, point.z);
    mass += depth;
    zMass += depth * point.z;
  }
  return mass > 0 ? zMass / mass : 0;
}

function stepFlow(water, heightAt) {
  water.stepFlow(0.05, { heightAt });
}

test("addWater leaves standing depth at the pour point", () => {
  const { water } = createFields();
  assert.equal(water.depthAt(0, 0), 0);
  water.addWater(0, 0, 1.25);
  assert.ok(water.depthAt(0, 0) > 0);
});

test("water flows toward +z on a downhill slope", () => {
  const heightAt = (x, z) => -z * 0.2;
  const { sand, water } = createFields(heightAt);
  water.addWater(0, 0, 3);
  for (let i = 0; i < 48; i += 1) stepFlow(water, heightAt);
  const downslope = water.depthAt(0, 5);
  const upslope = water.depthAt(0, -5);
  assert.ok(downslope > upslope, "more water should collect toward +z");
  assert.ok(sampledCentroidZ(sand, water) > 0.35, "mass should shift downslope");
});

test("flow roughly conserves water volume", () => {
  const heightAt = (x, z) => -z * 0.2;
  const { sand, water } = createFields(heightAt);
  water.addWater(0, 0, 2.5);
  const before = sampledVolume(sand, water);
  assert.ok(before > 0);
  for (let i = 0; i < 36; i += 1) stepFlow(water, heightAt);
  const after = sampledVolume(sand, water);
  assert.ok(Math.abs(after - before) <= Math.max(1e-6, Math.abs(before) * 0.02));
});

test("depth stays finite and non-negative", () => {
  const heightAt = (x, z) => -z * 0.2;
  const { sand, water } = createFields(heightAt);
  water.addWater(0, 0, 4);
  water.addWater(2, -1, 1.5);
  for (let i = 0; i < 40; i += 1) stepFlow(water, heightAt);
  if (water.depths) {
    for (const depth of water.depths) {
      assert.ok(Number.isFinite(depth) && depth >= 0);
    }
  }
  for (const point of samplePoints(sand)) {
    const depth = water.depthAt(point.x, point.z);
    assert.ok(Number.isFinite(depth) && depth >= 0);
  }
  assert.equal(water.depthAt(80, 80), 0);
});
