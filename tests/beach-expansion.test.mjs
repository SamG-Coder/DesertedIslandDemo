import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createBeachBucket, CASTLE_MOLDS } from '../src/bucket-system.mjs';
import { createBeachTreasures } from '../src/beach-treasures.mjs';
import { createInventory } from '../src/inventory-system.mjs';
import { createBeachCollisionWorld } from '../src/collision-system.mjs';
import { sculptSand, shovelBrush } from '../src/shovel-brush.mjs';

async function withAssets(run) {
  const original = GLTFLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync = async function(url) {
    const bytes = await readFile(new URL(url));
    return this.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  };
  try { await run(); } finally { GLTFLoader.prototype.loadAsync = original; }
}

test('large Blender moulds charge volume costs and match their snapped preview', async () => withAssets(async () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const world = createBeachCollisionWorld({});world.attachTerrainSim({heightAt:()=>0});
  let reserve = 191;
  const bucket = await createBeachBucket({scene,camera,view:{x:0,y:1.64,z:0,yaw:0},collisionWorld:world,
    spawn:{x:0,z:-1},extraSandAvailable:()=>reserve,spendExtraSand:(_,n)=>{reserve-=n;return true;}});
  try {
    bucket.interact();bucket.setEquipped(true);
    while(bucket.moldName!=='Foundation')bucket.cycleMold();
    bucket.cycleSize();bucket.cycleSize();bucket.rotate();bucket.setFill(3,'wet-sand');
    assert.equal(bucket.sandCost,192);
    const hit={kind:'terrain',x:1.13,y:0,z:-3.12}, preview=bucket.preview(hit);
    assert.equal(preview.x,1.25);assert.equal(preview.z,-3);assert.ok(preview.valid);
    assert.ok(bucket.tryMold(hit));assert.equal(reserve,2);assert.equal(bucket.fill,0);
    const castle=scene.getObjectByName('Sand Foundation');
    assert.equal(castle.geometry,preview.geometry);assert.equal(castle.scale.x,4);
    assert.equal(castle.rotation.y,preview.yaw);assert.equal(castle.position.x,preview.x);
    assert.ok(world.groundHeightAt(1.25,-3)>.1,'large foundation supports walking');
    bucket.setFill(3,'wet-sand');assert.equal(bucket.tryMold({...hit,x:8}),false);
    assert.equal(bucket.fill,3);assert.equal(reserve,2);
    assert.equal(CASTLE_MOLDS.length,20);
  } finally {bucket.dispose();}
}));

test('real Blender beach treasures can be collected, attached and recovered after collapse', async () => withAssets(async () => {
  const scene=new THREE.Scene(),inventory=createInventory();
  const world=createBeachCollisionWorld({});world.attachTerrainSim({heightAt:()=>0});
  const treasures=await createBeachTreasures({scene,inventory,collisionWorld:world});
  const down=new THREE.Vector3(0,-1,0),origin=new THREE.Vector3(-2.7,2,-15);
  try {
    scene.updateMatrixWorld(true);
    assert.equal(treasures.count,72);
    assert.ok(treasures.pick(origin,down));assert.equal(treasures.count,71);
    assert.ok(inventory.findItem('scallop-shell')>=0);
    // Place from the selected hotbar, including on a real triangle surface.
    inventory.add('scallop-shell',1,{preferSelected:true});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(2,.5,2),new THREE.MeshBasicMaterial());
    mesh.position.set(0,.25,0);scene.add(mesh);scene.updateMatrixWorld(true);
    const collider={kind:'castle',object:mesh};
    assert.ok(treasures.place('scallop-shell',{kind:'castle',x:0,y:.5,z:0,collider},new THREE.Vector3(0,2,0),down));
    assert.equal(treasures.count,72);
    mesh.removeFromParent();treasures.update(.2);scene.updateMatrixWorld(true);
    assert.ok(treasures.pick(new THREE.Vector3(0,2,0),down),'fallen decoration remains collectible');
    const before=treasures.count;
    for(const item of Object.keys(inventory.catalog)) inventory.add(item,100000);
    assert.equal(treasures.pick(new THREE.Vector3(-2.28,2,-15),down),false);
    assert.equal(treasures.count,before,'full inventory leaves collectible in world');
    mesh.geometry.dispose();mesh.material.dispose();
  } finally {treasures.dispose();}
}));

test('smoothing and flattening reduce roughness without removing sand', () => {
  for(const toolMode of ['Smooth','Flatten']) {
    const values=new Map();
    const field={cellSize:.25,cellCenter:(x,z)=>({x:(x+.5)*.25,z:(z+.5)*.25}),
      cellSurface:(x,z)=>values.get(`${x},${z}`)||0,
      addAtCell:(x,z,h)=>values.set(`${x},${z}`,(values.get(`${x},${z}`)||0)+h)};
    values.set('0,0',1);values.set('-1,0',-.2);
    const before=[...values.values()].reduce((a,b)=>a+b,0);
    sculptSand(field,{x:0,z:0,toolMode});
    assert.ok(Math.abs([...values.values()].reduce((a,b)=>a+b,0)-before)<1e-10);
    assert.ok(values.get('0,0')<1);assert.ok(values.get('-1,0')>-.2);
  }
  assert.ok(shovelBrush('Trench').radiusZ>2*shovelBrush('Dig').radiusZ);
});

test('new palm GLB stays below 10000 triangles in six material groups', async () => withAssets(async () => {
  const {scene}=await new GLTFLoader().loadAsync(new URL('../assets/models/blender-coconut-palm.glb',import.meta.url));
  let meshes=0,triangles=0;const ids=new Set();
  scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    ids.add(o.material.userData.studioMaterialId);o.geometry.dispose();o.material.dispose();});
  assert.equal(meshes,6);assert.ok(triangles<10000);assert.equal(ids.size,6);assert.ok(ids.has('material/palm-bark'));
}));
