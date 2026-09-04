import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JUDGE_DESK } from "../src/table-model.mjs";
import { terrainHeight, WATER_LEVEL } from "../src/terrain.mjs";

const sampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function glbJson(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
}

test("Studio oak table GLB keeps the dining assembly and PBR roles", async () => {
  const bytes = await readFile(join(sampleRoot, "assets", "models", "oak-dining-table.glb"));
  const json = glbJson(bytes);
  assert.equal(json.nodes.length, 14);
  assert.equal(json.meshes.length, 13);
  for (const name of [
    "Oak Dining Table",
    "Tabletop",
    "Apron Front",
    "Leg Front Right",
    "Foot Front Left",
  ]) {
    assert.ok(json.nodes.some(node => node.name === name), `${name} is missing`);
  }
  const root = json.nodes.find(node => node.name === "Oak Dining Table");
  assert.ok(root.children?.length >= 13);
  assert.deepEqual(
    root.rotation.map(value => Math.round(value * 1e6) / 1e6),
    [-0.707107, 0, 0, 0.707107],
  );
  assert.deepEqual(new Set(json.materials.map(material => material.extras?.studioMaterialId)), new Set([
    "material/oak-top",
    "material/oak-frame",
    "material/brass",
  ]));
});

test("judge desk sits on a dry ocean-facing terrace away from spawn tools", () => {
  const ground = terrainHeight(JUDGE_DESK.x, JUDGE_DESK.z);
  assert.ok(ground - WATER_LEVEL > 3.5);
  assert.ok(Math.hypot(JUDGE_DESK.x - 0, JUDGE_DESK.z + 18) > 8);
  assert.ok(Math.hypot(JUDGE_DESK.x - 1, JUDGE_DESK.z + 16.3) > 6);
  const corners = [
    [-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45],
  ].map(([dx, dz]) => terrainHeight(JUDGE_DESK.x + dx, JUDGE_DESK.z + dz));
  assert.ok(Math.max(...corners, ground) - Math.min(...corners, ground) < 0.08);
});
