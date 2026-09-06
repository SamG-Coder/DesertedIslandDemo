import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BUCKET_CAPACITY,
  CASTLE_SAND_COST,
  cloneSlot,
  createInventory,
  isSandItemId,
} from "../src/inventory-system.mjs";
import { CASTLE_PLACEMENT_IGNORE, castleShouldCollapse, isCastleStackAim } from "../src/bucket-system.mjs";

const sampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function glbJson(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
}

test("Studio bucket GLB is an empty red pail with handle parts", async () => {
  const bytes = await readFile(join(sampleRoot, "assets", "models", "red-sand-castle-bucket.glb"));
  const json = glbJson(bytes);
  assert.equal(json.nodes.length, 6);
  assert.equal(json.meshes.length, 5);
  for (const name of ["Pail Body", "Handle Wire", "Handle Grip", "Lug Left", "Lug Right"]) {
    assert.ok(json.nodes.some(node => node.name === name), `${name} is missing`);
  }
  assert.ok(!json.nodes.some(node => /fill|turret keep|battlement/i.test(node.name || "")));
  assert.deepEqual(new Set(json.materials.map(material => material.extras?.studioMaterialId)), new Set([
    "material/red-plastic",
    "material/handle-wire",
    "material/yellow-grip",
  ]));
});

test("Studio castle GLB is a stackable turret keep", async () => {
  const bytes = await readFile(join(sampleRoot, "assets", "models", "stackable-sand-castle.glb"));
  const json = glbJson(bytes);
  assert.ok(json.nodes.length >= 5);
  assert.equal(json.meshes.length, 5);
  assert.ok(json.nodes.some(node => node.name === "Turret Keep"));
  for (const name of ["Battlement North", "Battlement South", "Battlement East", "Battlement West"]) {
    assert.ok(json.nodes.some(node => node.name === name), `${name} is missing`);
  }
  assert.equal(json.materials[0]?.extras?.studioMaterialId, "material/packed-sand");
});

test("bucket fill is remembered on the inventory slot", () => {
  const inventory = createInventory();
  assert.equal(inventory.add("bucket", 1, { preferSelected: true }), 0);
  const index = inventory.findItem("bucket");
  assert.ok(index >= 0);
  assert.equal(inventory.setToolData(index, { fill: 2, fillItemId: "wet-sand" }), true);
  const slot = cloneSlot(inventory.slot(index));
  assert.equal(slot.itemId, "bucket");
  assert.equal(slot.fill, 2);
  assert.equal(slot.fillItemId, "wet-sand");
  assert.equal(BUCKET_CAPACITY, 3);
  assert.equal(CASTLE_SAND_COST, 3);
  assert.equal(isSandItemId("dry-sand"), true);
  assert.equal(isSandItemId("bucket"), false);
});

test("bucket gameplay lives in code, not a sand mesh inside the pail", async () => {
  const [bucket, main] = await Promise.all([
    readFile(join(sampleRoot, "src", "bucket-system.mjs"), "utf8"),
    readFile(join(sampleRoot, "src", "main.mjs"), "utf8"),
  ]);
  assert.match(bucket, /createBeachBucket/);
  assert.match(bucket, /CylinderGeometry/);
  assert.match(bucket, /tryFill/);
  assert.match(bucket, /tryScoop/);
  assert.match(bucket, /tryMold/);
  assert.match(bucket, /kind === "castle"/);
  assert.match(bucket, /stackable-sand-castle\.glb/);
  assert.match(bucket, /blender-builders-bucket\.glb/);
  assert.match(main, /createBeachBucket/);
  assert.match(main, /fillPlacedBucket/);
  assert.match(main, /moldSandCastle/);
  assert.match(main, /persistBucketFill/);
  assert.match(main, /bucket.carried && bucket.equipped/);
  assert.match(main, /shovel.carried && shovel.equipped/);
  assert.match(main, /else if \(!placeTreasure\(\) && !fillPlacedBucket\(\)\) dumpOntoGround/);
  assert.doesNotMatch(main, /if \(fillPlacedBucket\(\)\) return;/);
  assert.match(main, /if \(shovel.carried && shovel.equipped\)/);
  assert.match(main, /if \(bucket.carried && bucket.equipped\)/);
  assert.doesNotMatch(main, /if \(shovel.carried\) \{\s*if \(shovel.interact\(\)\)/);
  assert.match(main, /crushUnderPlayer/);
  assert.match(main, /collapseCastleIntoMound/);
  assert.match(main, /scoopPileIntoBucket/);
  assert.match(main, /if \(bucket.carried && bucket.equipped\) scoopPileIntoBucket/);
});

test("walking or landing on a castle footprint collapses it", () => {
  const collider = {
    box: { min: { x: -0.08, y: 0.2, z: -0.08 }, max: { x: 0.08, y: 0.37, z: 0.08 } },
    minY: 0.2,
    maxY: 0.37,
  };
  assert.equal(castleShouldCollapse({ x: 0, y: 1.84, z: 0, grounded: true, verticalVelocity: 0 }, collider), true);
  assert.equal(castleShouldCollapse({ x: 0, y: 2.1, z: 0, grounded: false, verticalVelocity: -2 }, collider), true);
  assert.equal(castleShouldCollapse({ x: 0, y: 3.2, z: 0, grounded: false, verticalVelocity: -1 }, collider), false);
  assert.equal(castleShouldCollapse({ x: 0, y: 2.0, z: 0, grounded: false, verticalVelocity: 3 }, collider), false);
  assert.equal(castleShouldCollapse({ x: 2, y: 1.84, z: 2, grounded: true, verticalVelocity: 0 }, collider), false);
});

test("castles stack only on the crown and can sit beside each other", () => {
  const collider = { maxY: 0.37 };
  assert.equal(isCastleStackAim({ kind: "castle", y: 0.36, collider }), true);
  assert.equal(isCastleStackAim({ kind: "castle", y: 0.22, collider }), false);
  assert.equal(isCastleStackAim({ kind: "terrain", y: 0.36, collider }), false);
  assert.ok(CASTLE_PLACEMENT_IGNORE.has("castle"));
});
