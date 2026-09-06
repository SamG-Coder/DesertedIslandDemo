import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBeachBucket, MAX_CASTLES } from '../src/bucket-system.mjs';

test('real Blender moulds build, share geometry safely, erode and enforce a build budget', async () => {
  const original = GLTFLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync = async function(url) {
    const bytes = await readFile(new URL(url));
    return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  };
  let bucket;
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const view = { x: 0, y: 1.64, z: 0, yaw: 0, speed: 0 };
    const collisionWorld = { colliders: [], groundHeightAt: () => 0, terrainHeightAt: () => 0, solidAt: () => false };
    let flooded = false, collapsed = 0;
    bucket = await createBeachBucket({ scene, camera, view, collisionWorld,
      spawn: { x: 0, z: -1 }, environmentAt: () => ({ waterDepth: flooded ? 0.4 : 0 }),
      onCollapse: () => collapsed++ });
    assert.ok(bucket.interact());
    bucket.setEquipped(true);
    const build = x => {
      bucket.setFill(3, 'wet-sand');
      return bucket.tryMold({ kind: 'terrain', x, y: 0, z: -3 });
    };
    assert.ok(build(0));
    assert.ok(build(1));
    const meshes = scene.children.filter(child => child.name === 'Sand Turret');
    assert.equal(meshes.length, 2);
    assert.equal(meshes[0].geometry, meshes[1].geometry);
    let disposed = false;
    meshes[0].geometry.addEventListener('dispose', () => { disposed = true; });
    bucket.crushUnderPlayer({ x: 0, z: -3, y: 1.64, grounded: true });
    assert.equal(disposed, false, 'destroying one clone must preserve shared GPU geometry');
    assert.equal(bucket.progress.standing, 1);
    assert.equal(bucket.cycleMold(), 'Wall');
    assert.ok(build(2));
    assert.equal(bucket.cycleMold(), 'Gate');
    assert.ok(build(3));
    assert.equal(bucket.cycleMold(), 'Foundation');
    for (let i = 0; i < 17; i++) {
      assert.ok(build(20 + i));
      bucket.cycleMold();
    }
    assert.equal(bucket.moldName, 'Turret');
    for (let i = bucket.progress.standing; i < MAX_CASTLES; i++) assert.ok(build(i + 5));
    assert.equal(build(200), false);
    assert.equal(bucket.fill, 3, 'capacity rejection keeps the sand in the bucket');
    flooded = true;
    for (let i = 0; i < 1500; i++) bucket.update(0.1);
    assert.equal(bucket.progress.standing, 0);
    assert.ok(collapsed >= MAX_CASTLES);
  } finally {
    bucket?.dispose();
    GLTFLoader.prototype.loadAsync = original;
  }
});
