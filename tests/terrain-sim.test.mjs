import assert from "node:assert/strict";
import test from "node:test";
import { createTerrainSim } from "../src/terrain-sim.mjs";

const WATER_LEVEL = 0.16;

function createSim() {
  return createTerrainSim({
    terrainHeight: () => 1,
    waterLevel: WATER_LEVEL,
  });
}

function digUntilBelowWater(sim, x, z) {
  sim.stampDig(x, z);
  for (let i = 0; i < 48 && sim.heightAt(x, z) >= WATER_LEVEL; i += 1) {
    sim.stampDig(x, z);
  }
  assert.ok(sim.heightAt(x, z) < WATER_LEVEL, "stampDig must cut below the water table");
}

test("createTerrainSim uses the provided terrain height and water level", () => {
  const sim = createSim();
  assert.equal(sim.heightAt(0, 0), 1);
  assert.equal(sim.heightAt(8, -12), 1);
  assert.equal(sim.waterDepthAt(0, 0), 0);
});

test("stampDig lowers heightAt", () => {
  const sim = createSim();
  const before = sim.heightAt(1, -2);
  sim.stampDig(1, -2);
  assert.ok(sim.heightAt(1, -2) < before);
});

test("stampDump raises heightAt", () => {
  const sim = createSim();
  const before = sim.heightAt(-1, 3);
  sim.stampDump(-1, 3);
  assert.ok(sim.heightAt(-1, 3) > before);
});

test("a dump mound has a skirt that meets the beach instead of a one-cell pyramid", () => {
  const sim = createSim();
  sim.stampDump(2.125, 2.125);
  const peak = sim.heightAt(2.125, 2.125);
  const skirt = sim.heightAt(2.425, 2.125);
  const toe = sim.heightAt(2.125 + 0.75, 2.125);
  assert.ok(peak > 1.1);
  assert.ok(skirt > 1.02, `skirt was ${skirt}`);
  assert.ok(skirt < peak);
  assert.ok(toe < 1.01, `toe was ${toe}`);
});

test("a bucket scoop takes from a pile without digging a hole", () => {
  const sim = createSim();
  assert.equal(sim.isSandPile(2, -4), false);
  sim.stampDump(2, -4);
  assert.equal(sim.isSandPile(2, -4), true);
  const piled = sim.heightAt(2, -4);
  const base = 1;
  sim.stampScoop(2, -4);
  assert.ok(sim.heightAt(2, -4) < piled);
  assert.ok(sim.heightAt(2, -4) >= base - 1e-6);
  for (let i = 0; i < 8; i += 1) sim.stampScoop(2, -4);
  assert.ok(sim.heightAt(2, -4) >= base - 1e-6);
  assert.equal(sim.isSandPile(2, -4), false);
});

test("updating a dump pile does not throw and keeps a finite height", () => {
  const sim = createSim();
  sim.stampDump(0, 0);
  assert.doesNotThrow(() => {
    for (let i = 0; i < 8; i += 1) sim.update(0.05);
  });
  assert.ok(Number.isFinite(sim.heightAt(0, 0)));
});

test("ocean fill heuristic floods a pit dug below water at z=20", () => {
  const sim = createSim();
  const x = 0;
  const z = 20;
  for (let i = 0; i < 12; i += 1) sim.stampDig(x, z);
  assert.ok(sim.heightAt(x, z) < WATER_LEVEL - 0.2);
  for (let i = 0; i < 24; i += 1) sim.update(0.05);
  assert.ok(sim.waterDepthAt(x, z) > 0);
});

test("inland pits at z=-40 stay dry after a few updates", () => {
  const sim = createSim();
  const x = 0;
  const z = -40;
  sim.stampDig(x, z);
  for (let i = 0; i < 6; i += 1) sim.update(0.05);
  assert.ok(sim.waterDepthAt(x, z) < 1e-3);
});
