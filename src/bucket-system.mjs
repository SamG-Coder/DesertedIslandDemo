import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { canInteractWithCarryable, createCarryableObject } from "./carryable-system.mjs";
import { TOOL_AIM_DISTANCE } from "./collision-system.mjs";
import { BUCKET_CAPACITY, CASTLE_SAND_COST, isSandItemId } from "./inventory-system.mjs";

export const BUCKET_AIM_DISTANCE = TOOL_AIM_DISTANCE;
export const CASTLE_FOOTPRINT_RADIUS = 0.08;

const worldPosition = new THREE.Vector3();
const bounds = new THREE.Box3();

const HELD_POSITION = [0.32, -0.38, -0.62];
const HELD_ROTATION = [-0.22, 0.55, 0.18];
const HELD_SCALE = 0.88;

const DRY_SAND_COLOR = 0xd4b07a;
const WET_SAND_COLOR = 0x9b734c;

function clampFill(value) {
  return Math.max(0, Math.min(BUCKET_CAPACITY, Math.trunc(Number(value) || 0)));
}

function prepareStudioObject(root, name) {
  root.name = name;
  root.userData.rtxIgnore = true;
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.rtxIgnore = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.envMapIntensity = 0.85;
      material.needsUpdate = true;
    }
  });
  return root;
}

async function loadStudioProp(url, name) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const anchor = new THREE.Group();
  anchor.add(gltf.scene);
  return prepareStudioObject(anchor, name);
}

function createFillMesh() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.072, 0.054, 1, 24),
    new THREE.MeshStandardMaterial({
      color: DRY_SAND_COLOR,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  mesh.name = "Bucket sand fill";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rtxIgnore = true;
  mesh.visible = false;
  return mesh;
}

export async function createBeachBucket({
  scene,
  camera,
  view,
  collisionWorld,
  spawn = { x: -0.85, z: -16.15, yaw: 0.35 },
} = {}) {
  const bucketUrl = new URL("../assets/models/red-sand-castle-bucket.glb", import.meta.url).href;
  const castleUrl = new URL("../assets/models/stackable-sand-castle.glb", import.meta.url).href;
  const [anchor, castleTemplate] = await Promise.all([
    loadStudioProp(bucketUrl, "Carryable red sand bucket"),
    loadStudioProp(castleUrl, "Sand castle turret"),
  ]);
  castleTemplate.visible = false;

  const fillMesh = createFillMesh();
  anchor.add(fillMesh);

  const state = {
    fill: 0,
    fillItemId: null,
  };
  const castles = [];
  let equipped = false;

  function syncFillVisual() {
    const amount = state.fill / BUCKET_CAPACITY;
    fillMesh.visible = amount > 0.02;
    const height = 0.02 + amount * 0.15;
    fillMesh.scale.set(1, height, 1);
    fillMesh.position.set(0, 0.012 + height * 0.5, 0);
    fillMesh.material.color.setHex(state.fillItemId === "wet-sand" ? WET_SAND_COLOR : DRY_SAND_COLOR);
  }

  function setFill(fill, fillItemId = null) {
    state.fill = clampFill(fill);
    state.fillItemId = state.fill > 0 && isSandItemId(fillItemId) ? fillItemId : (state.fill > 0 ? state.fillItemId : null);
    if (state.fill <= 0) state.fillItemId = null;
    syncFillVisual();
    return state.fill;
  }

  const carryable = createCarryableObject({
    scene,
    camera,
    object: anchor,
    view,
    collisionWorld,
    spawn,
    heldPosition: HELD_POSITION,
    heldScale: HELD_SCALE,
    heldRotation: HELD_ROTATION,
    label: "bucket",
  });

  function lookingAtPlacedBucket() {
    if (carryable.carried) return false;
    anchor.getWorldPosition(worldPosition);
    return canInteractWithCarryable(view, worldPosition.x, worldPosition.z);
  }

  function placeCastleAt(hit) {
    const castle = castleTemplate.clone(true);
    castle.visible = true;
    castle.userData.rtxIgnore = true;
    castle.traverse(object => {
      if (object.isMesh) object.userData.rtxIgnore = true;
    });
    let x = hit.x;
    let z = hit.z;
    let y = hit.y;
    if (hit.kind === "castle" && hit.collider) {
      x = hit.collider.stackX ?? x;
      z = hit.collider.stackZ ?? z;
      y = hit.collider.maxY ?? y;
    }
    castle.position.set(x, y, z);
    castle.rotation.y = view.yaw + Math.PI;
    scene.add(castle);
    castle.updateMatrixWorld(true);
    bounds.setFromObject(castle);
    castle.position.y += y - bounds.min.y;
    castle.updateMatrixWorld(true);
    bounds.setFromObject(castle);
    const collider = {
      kind: "castle",
      shape: "box",
      box: bounds.clone(),
      minY: bounds.min.y,
      maxY: bounds.max.y,
      stackX: x,
      stackZ: z,
    };
    collisionWorld.colliders.push(collider);
    const record = { object: castle, collider };
    castles.push(record);
    return record;
  }

  syncFillVisual();

  return {
    object: carryable.object,
    get carried() {
      return carryable.carried;
    },
    get equipped() {
      return equipped;
    },
    get fill() {
      return state.fill;
    },
    get fillItemId() {
      return state.fillItemId;
    },
    setEquipped(value) {
      equipped = Boolean(value);
      if (carryable.carried) anchor.visible = equipped;
    },
    setFill,
    lookingAtPlacedBucket,
    tryFill(itemId, hit = null) {
      if (carryable.carried || !lookingAtPlacedBucket()) return 0;
      if (!hit || hit.kind !== "bucket") return 0;
      if (!isSandItemId(itemId)) return 0;
      if (state.fill >= BUCKET_CAPACITY) return 0;
      if (state.fillItemId && state.fillItemId !== itemId) return 0;
      setFill(state.fill + 1, itemId);
      return 1;
    },
    tryMold(hit) {
      if (!carryable.carried || !equipped) return false;
      if (state.fill < CASTLE_SAND_COST || !state.fillItemId) return false;
      if (!hit || (hit.kind !== "terrain" && hit.kind !== "castle")) return false;
      if (hit.kind === "terrain" && collisionWorld.solidAt?.(hit.x, hit.z, CASTLE_FOOTPRINT_RADIUS)) return false;
      placeCastleAt(hit);
      setFill(0, null);
      return true;
    },
    interact() {
      const changed = carryable.interact();
      if (changed) anchor.visible = !carryable.carried || equipped;
      return changed;
    },
    update(dt) {
      carryable.update(dt);
      anchor.visible = !carryable.carried || equipped;
    },
    dispose() {
      for (const record of castles) {
        const index = collisionWorld.colliders.indexOf(record.collider);
        if (index >= 0) collisionWorld.colliders.splice(index, 1);
        record.object.removeFromParent();
        record.object.traverse(child => {
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) child.material.forEach(material => material.dispose?.());
          else child.material?.dispose?.();
        });
      }
      fillMesh.geometry.dispose();
      fillMesh.material.dispose();
      carryable.dispose();
    },
  };
}
