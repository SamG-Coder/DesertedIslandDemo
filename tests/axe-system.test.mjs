import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { applyAxeChop, CHOPS_TO_FELL } from "../src/axe-system.mjs";

const sampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function glbJson(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
}

test("Studio felling axe GLB keeps haft, blade, and steel roles", async () => {
  const bytes = await readFile(join(sampleRoot, "assets", "models", "beach-felling-axe.glb"));
  const json = glbJson(bytes);
  assert.equal(json.nodes.length, 5);
  assert.equal(json.meshes.length, 4);
  for (const name of ["Felling Axe", "Haft", "Head Eye", "Blade", "Poll"]) {
    assert.ok(json.nodes.some(node => node.name === name), `${name} is missing`);
  }
  assert.deepEqual(new Set(json.materials.map(material => material.extras?.studioMaterialId)), new Set([
    "material/axe-haft",
    "material/axe-steel",
  ]));
});

test("four palm chops drop wood and release the collider without hiding the mesh", () => {
  const palm = { visible: true };
  const collider = { kind: "palm", chops: 0, object: palm };
  const world = { colliders: [collider] };
  const hit = { kind: "palm", collider, x: 1, y: 2, z: 3 };
  for (let swing = 1; swing < CHOPS_TO_FELL; swing += 1) {
    const result = applyAxeChop(hit, world);
    assert.equal(result.itemId, "palm-wood");
    assert.equal(result.felled, false);
    assert.equal(result.object, palm);
    assert.equal(palm.visible, true);
    assert.equal(world.colliders.length, 1);
  }
  const last = applyAxeChop(hit, world);
  assert.equal(last.felled, true);
  assert.equal(last.object, palm);
  assert.equal(palm.visible, true);
  assert.equal(world.colliders.length, 0);
});
