import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { terrainHeight } from "./terrain.mjs";

/** Dry terrace east of spawn, facing the ocean, clear of tools and palms. */
export const JUDGE_DESK = Object.freeze({
  x: 7.6,
  z: -11.2,
  yaw: 0.08,
});

const SAND_EMBED = 0.012;

export function prepareStudioTable(root) {
  root.name = "Oak dining table";
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.envMapIntensity = 0.72;
      material.needsUpdate = true;
    }
  });
  return root;
}

export async function loadJudgeDesk() {
  const loader = new GLTFLoader();
  const url = new URL("../assets/models/oak-dining-table.glb", import.meta.url).href;
  const gltf = await loader.loadAsync(url);
  const anchor = new THREE.Group();
  anchor.add(gltf.scene);
  return prepareStudioTable(anchor);
}

export function placeJudgeDesk(group, desk, pose = JUDGE_DESK) {
  desk.position.set(pose.x, 0, pose.z);
  desk.rotation.y = pose.yaw;
  desk.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(desk);
  desk.position.y = terrainHeight(pose.x, pose.z) - box.min.y - SAND_EMBED;
  group.add(desk);
  return desk;
}
