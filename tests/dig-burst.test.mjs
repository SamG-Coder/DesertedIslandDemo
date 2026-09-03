import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three/webgpu";
import { createDigBurstSystem, DIG_BURST_PRESETS } from "../src/dig-burst.mjs";
import { WATER_LEVEL } from "../src/terrain.mjs";

function createBurst() {
  const scene = new THREE.Scene();
  const collisionWorld = { groundHeightAt() { return 0; } };
  let sequence = 0;
  const random = () => {
    sequence += 1;
    return (sequence % 10) / 10;
  };
  return { scene, burst: createDigBurstSystem(scene, collisionWorld, random) };
}

test("presets distinguish dry sand, wet sand, rocky sand, and water", () => {
  assert.ok(DIG_BURST_PRESETS["dry-sand"].grains > DIG_BURST_PRESETS["wet-sand"].grains);
  assert.equal(DIG_BURST_PRESETS.water.grains, 0);
  assert.ok(DIG_BURST_PRESETS.water.drops > DIG_BURST_PRESETS["wet-sand"].drops);
  assert.equal(DIG_BURST_PRESETS["dry-sand"].drops, 0);
  assert.equal(DIG_BURST_PRESETS["rocky-sand"].bounce, 1);
  assert.ok(DIG_BURST_PRESETS["wet-sand"].gravity > DIG_BURST_PRESETS["dry-sand"].gravity);
});

test("a shovel strike emits pooled grains that fall under gravity", () => {
  const { scene, burst } = createBurst();
  burst.spawn({ x: 1, y: 0.2, z: -16, forwardX: 0, forwardZ: 1 }, "dry-sand");
  const grains = scene.getObjectByName("Shovel dig grain bursts");
  const dust = scene.getObjectByName("Shovel dig dust");
  assert.ok(grains.isInstancedMesh);
  assert.ok(dust.isPoints);
  assert.equal(burst.live.grains, DIG_BURST_PRESETS["dry-sand"].grains);
  assert.equal(burst.live.dust, DIG_BURST_PRESETS["dry-sand"].dust);
  assert.equal(burst.live.drops, 0);
  const dummy = new THREE.Object3D();
  grains.getMatrixAt(0, dummy.matrix);
  dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
  const startY = dummy.position.y;
  burst.update(0.05);
  grains.getMatrixAt(0, dummy.matrix);
  dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
  assert.ok(dummy.position.y !== startY);
  burst.dispose();
  assert.equal(scene.getObjectByName("Shovel dig grain bursts"), undefined);
});

test("water bursts splash at sea level instead of throwing sand grains", () => {
  const { scene, burst } = createBurst();
  burst.spawn({ x: 2, y: -0.4, z: 18, forwardX: 0, forwardZ: 1 }, "water");
  assert.equal(burst.live.grains, 0);
  assert.equal(burst.live.dust, 0);
  assert.equal(burst.live.drops, DIG_BURST_PRESETS.water.drops);
  const drops = scene.getObjectByName("Shovel dig droplets");
  const y = drops.geometry.getAttribute("position").getY(0);
  assert.ok(y >= WATER_LEVEL);
  burst.dispose();
});

test("wet sand throws heavier clumps plus water droplets", () => {
  const { burst } = createBurst();
  burst.spawn({ x: 0, y: 0.12, z: -2, forwardX: 1, forwardZ: 0 }, "wet-sand");
  assert.equal(burst.live.grains, DIG_BURST_PRESETS["wet-sand"].grains);
  assert.ok(burst.live.drops > 0);
  burst.dispose();
});

test("unknown burst kinds fall back to dry sand and expire", () => {
  const { burst } = createBurst();
  burst.spawn({ x: 0, y: 0.2, z: -20, forwardX: 0, forwardZ: 1 }, "unknown");
  assert.equal(burst.live.grains, DIG_BURST_PRESETS["dry-sand"].grains);
  for (let i = 0; i < 40; i += 1) burst.update(0.05);
  assert.equal(burst.live.grains, 0);
  assert.equal(burst.live.dust, 0);
  burst.dispose();
});
