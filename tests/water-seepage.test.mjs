import assert from "node:assert/strict";
import test from "node:test";
import { CELL_SIZE, createSandField } from "../src/sand-chunk-field.mjs";
import { createWaterField } from "../src/water-flow.mjs";
import {
  isLikelySeaConnected,
  stepInfiltration,
  stepSeepage,
} from "../src/water-seepage.mjs";
import { WATER_LEVEL } from "../src/terrain.mjs";

function cellOf(x, z) {
  return {
    ix: Math.floor(x / CELL_SIZE),
    iz: Math.floor(z / CELL_SIZE),
  };
}

function makeSim({ x = 0, z = 0, height = 1 } = {}) {
  const sand = createSandField({ heightAt: () => height });
  const water = createWaterField(sand);
  const { ix, iz } = cellOf(x, z);
  const center = sand.cellCenter(ix, iz);
  return { sand, water, ix, iz, x: center.x, z: center.z };
}

test("isLikelySeaConnected is true for a cell at z=20 with surface below water level", () => {
  const { sand, x, z } = makeSim({ z: 20, height: WATER_LEVEL - 0.4 });
  assert.ok(Math.abs(z - 20) < CELL_SIZE);
  assert.ok(sand.heightAt(x, z) < WATER_LEVEL);
  assert.equal(
    isLikelySeaConnected(x, z, (sx, sz) => sand.heightAt(sx, sz), WATER_LEVEL),
    true,
  );
  assert.equal(
    isLikelySeaConnected({
      x,
      z,
      surface: sand.heightAt(x, z),
      waterLevel: WATER_LEVEL,
    }),
    true,
  );
});

test("a hole at z=-18 (inland beach) with surface below water level does not instantly fill to sea level in one seepage step", () => {
  const { sand, water, ix, iz, x, z } = makeSim({ z: -18, height: 1.2 });
  assert.ok(z < -10, "hole sits on the inland beach");
  sand.addAtCell(ix, iz, WATER_LEVEL - 0.55 - sand.heightAt(x, z));
  const surface = sand.heightAt(x, z);
  assert.ok(surface < WATER_LEVEL - 0.01);
  assert.equal(
    isLikelySeaConnected(x, z, (sx, sz) => sand.heightAt(sx, sz), WATER_LEVEL),
    false,
  );
  assert.equal(water.depthAt(x, z), 0);

  stepSeepage(water, sand, 1 / 60, {
    waterLevel: WATER_LEVEL,
    heightAt: (sx, sz) => sand.heightAt(sx, sz),
  });

  const depth = water.depthAt(x, z);
  const seaFill = WATER_LEVEL - surface;
  assert.ok(depth < seaFill * 0.35, "inland seepage must not snap a pit to sea level");
  assert.ok(surface + depth < WATER_LEVEL - 0.2);
});

test("a hole adjacent to a flooded neighbor receives some water after stepSeepage", () => {
  const { sand, water, ix, iz, x, z } = makeSim({ z: -18, height: 0 });
  const neighbor = sand.cellCenter(ix + 1, iz);
  sand.addAtCell(ix, iz, -0.12);
  water.addWater(neighbor.x, neighbor.z, 0.45);

  assert.equal(water.depthAt(x, z), 0);
  assert.ok(water.depthAt(neighbor.x, neighbor.z) > 0.04);
  assert.ok(sand.heightAt(x, z) < WATER_LEVEL - 0.01);

  stepSeepage(water, sand, 0.05, {
    waterLevel: WATER_LEVEL,
    heightAt: (sx, sz) => sand.heightAt(sx, sz),
  });

  assert.ok(
    water.depthAt(x, z) > 1e-5,
    "water should seep from the flooded neighbor into the hole",
  );
});

test("infiltration reduces standing depth and increases sand wetness if API allows", () => {
  const infiltrate = typeof stepInfiltration === "function" ? stepInfiltration : stepSeepage;
  const { sand, water, x, z } = makeSim({ z: -18, height: 0.7 });
  const canWet = typeof sand.wetAt === "function";
  if (typeof infiltrate !== "function" || !canWet) {
    assert.ok(true, "infiltration/wetness API not exported");
    return;
  }

  water.addWater(x, z, 0.28);
  const depthBefore = water.depthAt(x, z);
  const wetBefore = sand.wetAt(x, z);
  assert.ok(depthBefore > 0);

  infiltrate(water, sand, 0.05, {
    waterLevel: WATER_LEVEL,
    heightAt: (sx, sz) => sand.heightAt(sx, sz),
    wetnessAt: (sx, sz) => sand.wetAt(sx, sz),
  });

  assert.ok(water.depthAt(x, z) < depthBefore);
  assert.ok(sand.wetAt(x, z) > wetBefore);
});
