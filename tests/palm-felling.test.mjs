import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three/webgpu";
import {
  createPalmDebrisSystem,
  extractTrianglesByLocalY,
  markPalmDynamic,
} from "../src/palm-felling.mjs";

test("extractTrianglesByLocalY keeps only triangles in the height band", () => {
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const lower = extractTrianglesByLocalY(geometry, -2, 0);
  const upper = extractTrianglesByLocalY(geometry, 0, 2);
  assert.ok(lower);
  assert.ok(upper);
  assert.ok(lower.getAttribute("position").count >= 6);
  assert.ok(upper.getAttribute("position").count >= 6);
});

test("felled palms hide and spawn gravity chunks instead of vanishing", () => {
  const scene = new THREE.Scene();
  const barkGeometry = new THREE.BoxGeometry(0.28, 4, 0.28);
  barkGeometry.translate(0, 2, 0);
  const bark = new THREE.Mesh(barkGeometry, new THREE.MeshBasicMaterial({ color: 0x5c3a22 }));
  bark.userData.studioMaterialId = "material/palm-bark";
  bark.name = "Palm bark";
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.2, 1.4),
    new THREE.MeshBasicMaterial({ color: 0x174a22 }),
  );
  leaf.position.y = 4;
  leaf.userData.studioMaterialId = "material/palm-leaf";
  const palm = new THREE.Group();
  palm.name = "Coconut palm";
  palm.add(bark, leaf);
  scene.add(palm);
  markPalmDynamic(palm);
  assert.equal(palm.userData.rtxIgnore, true);
  const debris = createPalmDebrisSystem(scene, { groundHeightAt: () => 0 });
  debris.fell({ object: palm, directionX: 0, directionZ: 1, x: 0, y: 1.2, z: 0 });
  assert.equal(palm.visible, false);
  assert.ok(scene.children.some(child => child.name === "Palm stump"));
  const chunks = scene.children.filter(child => /debris/i.test(child.name || ""));
  assert.ok(chunks.length >= 2);
  const flying = chunks.reduce((highest, mesh) => (
    mesh.position.y > highest.position.y ? mesh : highest
  ));
  const startY = flying.position.y;
  for (let step = 0; step < 24; step += 1) debris.update(0.05);
  assert.ok(flying.position.y < startY - 0.5);
  debris.dispose();
});
