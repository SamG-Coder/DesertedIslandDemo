import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { TREASURES } from './treasure-catalog.mjs';
export { TREASURES, isTreasure } from './treasure-catalog.mjs';
const CAPACITY = 32;

export async function createBeachTreasures({ scene, inventory, collisionWorld }) {
  const source = (await new GLTFLoader().loadAsync(new URL('../assets/models/beach-collectibles.glb', import.meta.url).href)).scene;
  source.updateMatrixWorld(true);
  const pools = new Map();
  const dummy = new THREE.Object3D();
  const ray = new THREE.Raycaster();
  const normal = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
  const parentRotation = new THREE.Quaternion();
  let timer = 0;
  function write(pool, index) {
    const record = pool.records[index];
    dummy.position.copy(record?.position ?? up);
    dummy.quaternion.copy(record?.quaternion ?? new THREE.Quaternion());
    dummy.scale.setScalar(record ? 1 : 0);
    dummy.updateMatrix();pool.mesh.setMatrixAt(index,dummy.matrix);
    pool.mesh.instanceMatrix.needsUpdate = true;
    pool.mesh.boundingSphere = null;
  }
  function add(pool, position, quaternion, support = null) {
    const index = pool.records.findIndex(record => !record);
    if (index < 0) return false;
    const record = { position:position.clone(), quaternion:quaternion.clone(), support };
    if (support?.object) {
      record.localPosition = support.object.worldToLocal(position.clone());
      support.object.getWorldQuaternion(parentRotation);
      record.localRotation = parentRotation.clone().invert().multiply(quaternion);
    }
    pool.records[index]=record;pool.mesh.count=Math.max(pool.mesh.count,index+1);write(pool,index);
    return true;
  }
  for (let kind=0;kind<TREASURES.length;kind++) {
    const item = TREASURES[kind];
    const object = source.getObjectByName(item.name) ?? source.getObjectByName(item.name.replaceAll(' ','_'));
    if (!object?.isMesh) throw new Error(`Missing Blender collectible: ${item.name}`);
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();
    geometry.translate(0,-geometry.boundingBox.min.y,0);
    const material = object.material.clone();material.side=THREE.DoubleSide;
    const mesh = new THREE.InstancedMesh(geometry,material,CAPACITY);
    mesh.userData.rtxIgnore = true;
    mesh.name=item.name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.count=0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const pool={ item,mesh,records:Array(CAPACITY).fill(null) };pools.set(item.id,pool);scene.add(mesh);
    // Deterministic shore scatter, plus easy-to-find examples near the tools.
    for(let i=0;i<12;i++) {
      const x=i===0 ? -2.7+kind*.42 : Math.sin(i*7.13+kind*2.2)*18;
      const z=i===0 ? -15 : -11+((i*13+kind*7)%19);
      const y=collisionWorld.terrainHeightAt(x,z)+.018;
      const q=new THREE.Quaternion().setFromAxisAngle(up,i*2.4+kind);
      add(pool,new THREE.Vector3(x,y,z),q);
    }
  }
  source.traverse(object=>{object.geometry?.dispose();if(object.material) object.material.dispose();});
  function aim(origin,direction) {
    ray.set(origin,direction);ray.near=0;ray.far=3.5;
    const hit=ray.intersectObjects([...pools.values()].map(p=>p.mesh),false)[0];
    if(!hit || hit.instanceId==null) return null;
    const blocker=collisionWorld.raycastSurface(origin,direction,3.5);
    if(blocker && origin.distanceTo(new THREE.Vector3(blocker.x,blocker.y,blocker.z))+.13<hit.distance) return null;
    const pool=[...pools.values()].find(p=>p.mesh===hit.object);
    return pool.records[hit.instanceId] ? {pool,index:hit.instanceId} : null;
  }
  return {
    pick(origin,direction) {
      const hit=aim(origin,direction);if(!hit) return false;
      if(inventory.add(hit.pool.item.id,1)>0) return false;
      hit.pool.records[hit.index]=null;write(hit.pool,hit.index);return true;
    },
    place(itemId, hit, origin, direction) {
      const pool=pools.get(itemId);
      if(!pool || !hit || !['castle','terrain'].includes(hit.kind)) return false;
      const selected=inventory.selectedSlot();if(selected?.itemId!==itemId || selected.count<1) return false;
      let position=new THREE.Vector3(hit.x,hit.y,hit.z);normal.copy(up);
      if (position.distanceTo(origin) > 3.6) return false;
      if(hit.kind==='castle' && hit.collider?.object) {
        ray.set(origin,direction);ray.far=3.6;
        const surface=ray.intersectObject(hit.collider.object,false)[0];
        if(!surface) return false;
        position.copy(surface.point);
        normal.copy(surface.face.normal).transformDirection(hit.collider.object.matrixWorld);
      }
      position.addScaledVector(normal,.012);
      const rotation=new THREE.Quaternion().setFromUnitVectors(up,normal);
      if(!add(pool,position,rotation,hit.kind==='castle'?hit.collider:null)) return false;
      inventory.remove(itemId,1);return true;
    },
    update(dt) {
      timer+=dt;if(timer<.2)return;timer=0;
      for(const pool of pools.values())for(let i=0;i<pool.records.length;i++) {
        const record=pool.records[i];if(!record?.support)continue;
        const parent=record.support.object;
        if(!parent?.parent) {
          record.support=null;record.position.y=collisionWorld.terrainHeightAt(record.position.x,record.position.z)+.015;
          record.quaternion.identity();
        } else {
          record.position.copy(record.localPosition).applyMatrix4(parent.matrixWorld);
          parent.getWorldQuaternion(parentRotation);record.quaternion.copy(parentRotation).multiply(record.localRotation);
        }
        write(pool,i);
      }
    },
    get count() { let count=0;for(const pool of pools.values())count+=pool.records.filter(Boolean).length;return count; },
    dispose() {for(const pool of pools.values()){pool.mesh.removeFromParent();pool.mesh.geometry.dispose();pool.mesh.material.dispose();}}
  };
}
