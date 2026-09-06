import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createMappedMaterial } from "./materials.mjs";
import { applyBoxProjectedUvs } from "./rock-model.mjs";
import { builderRank, createCastleCondition, stepCastleCondition } from "./castle-physics.mjs";
import { EXTRA_MOLDS, BUILD_SCALES, buildSandCost, snapBuildCoordinate } from './building-kit.mjs';
import { canInteractWithCarryable, createCarryableObject } from "./carryable-system.mjs";
import { TOOL_AIM_DISTANCE } from "./collision-system.mjs";
import { EYE_HEIGHT } from "./first-person.mjs";
import { BUCKET_CAPACITY, CASTLE_SAND_COST, isSandItemId } from "./inventory-system.mjs";

export const BUCKET_AIM_DISTANCE = TOOL_AIM_DISTANCE;
export const CASTLE_FOOTPRINT_RADIUS = 0.22;
export const MAX_CASTLES = 256;
export const CASTLE_MOLDS = Object.freeze(['Turret', 'Wall', 'Gate', ...EXTRA_MOLDS]);
export const CASTLE_PLACEMENT_IGNORE = Object.freeze(new Set(["castle"]));

export function isCastleStackAim(hit) {
  if (!hit || hit.kind !== "castle" || !hit.collider) return false;
  return hit.y >= (Number(hit.collider.maxY) || hit.y) - 0.05;
}

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

export function castleShouldCollapse(player, collider, eyeHeight = EYE_HEIGHT) {
  if (!player || !collider?.box) return false;
  if (collider.walkable) return false;
  const box = collider.box;
  const pad = 0.08;
  if (player.x < box.min.x - pad || player.x > box.max.x + pad) return false;
  if (player.z < box.min.z - pad || player.z > box.max.z + pad) return false;
  if (!player.grounded && player.verticalVelocity > 0.45) return false;
  const feetY = (Number(player.y) || 0) - eyeHeight;
  if (feetY > collider.maxY + 0.22) return false;
  if (feetY < collider.minY - 0.14) return false;
  return true;
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
    new THREE.CylinderGeometry(0.14, 0.10, 1, 24),
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
  onCollapse = null,
  maps = null,
  environmentAt = () => ({}),
  extraSandAvailable = () => 0,
  spendExtraSand = () => false,
} = {}) {
  const bucketUrl = new URL("../assets/models/blender-builders-bucket.glb", import.meta.url).href;
  const castleUrl = new URL("../assets/models/stackable-sand-castle.glb", import.meta.url).href;
  const [anchor, castleTemplate, wallTemplate, gateTemplate, library] = await Promise.all([
    loadStudioProp(bucketUrl, "Carryable builder's bucket"),
    loadStudioProp(castleUrl, "Sand castle turret"),
    loadStudioProp(new URL('../assets/models/sandcastle-wall.glb', import.meta.url).href, 'Sand curtain wall'),
    loadStudioProp(new URL('../assets/models/sandcastle-gate.glb', import.meta.url).href, 'Sand arched gate'),
    loadStudioProp(new URL('../assets/models/castle-mould-library.glb', import.meta.url).href, 'Castle mould library'),
  ]);
  castleTemplate.visible = false;
  // One shared geometry per mould, one draw per block. Clones never own it.
  function mergeMold(template, scale) {
    template.updateMatrixWorld(true);
    const parts = [];
    template.traverse(child => {
      if (!child.isMesh) return;
      let part = child.geometry.clone().applyMatrix4(child.matrixWorld);
      if (part.index) { const expanded = part.toNonIndexed(); part.dispose(); part = expanded; }
      for (const name of Object.keys(part.attributes)) {
        if (name !== 'position' && name !== 'normal') part.deleteAttribute(name);
      }
      parts.push(part);
    });
    const castleGeometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!castleGeometry) throw new Error('Unable to prepare the sandcastle mould');
    castleGeometry.scale(scale, scale, scale);
    applyBoxProjectedUvs(castleGeometry, 0.32);
    return castleGeometry;
  }
  const castleGeometries = [mergeMold(castleTemplate, 2.6), mergeMold(wallTemplate, 1), mergeMold(gateTemplate, 1)];
  library.updateMatrixWorld(true);
  for (const name of EXTRA_MOLDS) {
    const source = library.getObjectByName(name.replaceAll(' ', '_')) ?? library.getObjectByName(name);
    if (!source) throw new Error(`Missing Blender mould: ${name}`);
    // Bake the authored root transform without moving the template.
    const holder = new THREE.Group();
    const clone = source.clone();
    clone.matrix.copy(source.matrixWorld); clone.matrixAutoUpdate = false;
    holder.add(clone);
    castleGeometries.push(mergeMold(holder, 1));
  }
  let mold = 0;
  let sizeIndex = 0, rotation = 0, gridSnap = true;
  const castleMaterials = ['dry-sand', 'wet-sand'].map(name => maps
    ? createMappedMaterial(maps['dry-sand'], { objectUv: true, uvScale: [1, 1],
      tint: name === 'wet-sand' ? [0.72, 0.67, 0.60] : [1, 1, 1],
      roughness: name === 'wet-sand' ? 0.72 : 0.93, normalScale: 0.18, reflectionMask: 0.04 })
    : new THREE.MeshStandardMaterial({ color: name === 'wet-sand' ? WET_SAND_COLOR : DRY_SAND_COLOR, roughness: 0.9 }));

  const fillMesh = createFillMesh();
  anchor.add(fillMesh);

  const state = {
    fill: 0,
    fillItemId: null,
  };
  const castles = [];
  let equipped = false;
  let clock = 0, nextTick = 0, cursor = 0, built = 0, xp = 0;

  function syncFillVisual() {
    const amount = state.fill / BUCKET_CAPACITY;
    fillMesh.visible = amount > 0.02;
    const height = 0.02 + amount * 0.22;
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
    const castle = new THREE.Mesh(castleGeometries[mold], castleMaterials[state.fillItemId === 'wet-sand' ? 1 : 0]);
    castle.name = `Sand ${CASTLE_MOLDS[mold]}`;
    castle.castShadow = true;
    castle.receiveShadow = true;
    castle.visible = true;
    castle.userData.rtxIgnore = true;
    castle.traverse(object => {
      if (object.isMesh) object.userData.rtxIgnore = true;
    });
    let x = hit.x;
    let z = hit.z;
    let y = hit.y;
    const buildScale = BUILD_SCALES[sizeIndex];
    castle.scale.setScalar(buildScale);
    if (hit.kind === "castle" && hit.collider) {
      x = hit.collider.stackX ?? x;
      z = hit.collider.stackZ ?? z;
      y = hit.collider.maxY ?? y;
    }
    castle.position.set(x, y, z);
    castle.rotation.y = rotation;
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
      object: castle,
      walkable: buildScale > 1 || ['Foundation', 'Stairs', 'Ramp', 'Bridge', 'Balcony'].includes(CASTLE_MOLDS[mold]),
    };
    collisionWorld.colliders.push(collider);
    const record = {
      object: castle,
      collider,
      itemId: state.fillItemId,
      x,
      z,
      foundationY: y,
      support: hit.kind === 'castle' ? hit.collider : null,
      condition: createCastleCondition(state.fillItemId),
      lastSimTime: clock,
      rewarded: false,
      buildScale,
    };
    castles.push(record);
    built++;
    xp += 20;
    return record;
  }

  function disposeCastle(record) {
    const index = collisionWorld.colliders.indexOf(record.collider);
    if (index >= 0) collisionWorld.colliders.splice(index, 1);
    record.object.removeFromParent();
    // Geometry and materials belong to the system, not to an individual block.
  }

  function collapseRecord(record) {
    const mound = {
      x: record.x,
      y: record.collider.minY,
      z: record.z,
      forwardX: 0,
      forwardZ: 1,
      kind: "terrain",
      itemId: record.itemId || "dry-sand",
    };
    disposeCastle(record);
    onCollapse?.(mound);
    return mound;
  }

  function crushUnderPlayer(player) {
    const fallen = [];
    const columns = new Set();
    for (const record of castles) {
      if (!castleShouldCollapse(player, record.collider)) continue;
      columns.add(`${record.x.toFixed(3)},${record.z.toFixed(3)}`);
    }
    if (columns.size === 0) return fallen;
    for (let index = castles.length - 1; index >= 0; index -= 1) {
      const record = castles[index];
      if (!columns.has(`${record.x.toFixed(3)},${record.z.toFixed(3)}`)) continue;
      castles.splice(index, 1);
      fallen.push(collapseRecord(record));
    }
    if (fallen.length > 0) {
      console.log(`[First-Person Beach] Sand castle collapsed into a mound`);
    }
    return fallen;
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
    get progress() {
      return { built, standing: castles.length, xp, rank: builderRank(xp), capacity: MAX_CASTLES };
    },
    get moldName() { return CASTLE_MOLDS[mold]; },
    get buildScale() { return BUILD_SCALES[sizeIndex]; },
    get sandCost() { return buildSandCost(BUILD_SCALES[sizeIndex]); },
    get gridSnap() { return gridSnap; },
    get buildRotation() { return rotation; },
    cycleMold(direction = 1) { mold = (mold + direction + CASTLE_MOLDS.length) % CASTLE_MOLDS.length; return CASTLE_MOLDS[mold]; },
    cycleSize() { sizeIndex = (sizeIndex + 1) % BUILD_SCALES.length; },
    rotate() { rotation = (rotation + Math.PI / 12) % (Math.PI * 2); },
    toggleSnap() { gridSnap = !gridSnap; },
    preview(hit) {
      if (!hit || (hit.kind !== 'terrain' && hit.kind !== 'castle')) return null;
      const stacked = isCastleStackAim(hit);
      const x = stacked ? hit.collider.stackX : snapBuildCoordinate(hit.x, gridSnap);
      const z = stacked ? hit.collider.stackZ : snapBuildCoordinate(hit.z, gridSnap);
      const y = stacked ? hit.collider.maxY : collisionWorld.terrainHeightAt(x, z);
      const geometry = castleGeometries[mold];
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const size = geometry.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(BUILD_SCALES[sizeIndex]);
      const extra = Math.max(0, buildSandCost(BUILD_SCALES[sizeIndex]) - state.fill);
      return { mode: 'castle', x, y, z, yaw: rotation, geometry, scale: BUILD_SCALES[sizeIndex],
        radiusX: size.x / 2, radiusZ: size.z / 2,
        valid: Boolean(state.fillItemId) && state.fill >= CASTLE_SAND_COST
          && extraSandAvailable(state.fillItemId) >= extra
          && (stacked || !collisionWorld.solidAt?.(x, z, Math.max(size.x, size.z) * 0.5, CASTLE_PLACEMENT_IGNORE)) };
    },
    populateBenchmark() {
      // Explicit opt-in benchmark, never used by a normal play session.
      const previousItem = state.fillItemId, previousMold = mold;
      state.fillItemId = 'wet-sand';
      for (let i = castles.length; i < MAX_CASTLES; i++) {
        mold = i % CASTLE_MOLDS.length;
        const x = (i % 12 - 5.5) * 1.25;
        const z = -13 + Math.floor(i / 12) * 1.35;
        placeCastleAt({ kind: 'terrain', x, z, y: collisionWorld.terrainHeightAt(x, z) });
      }
      state.fillItemId = previousItem;
      mold = previousMold;
      built = 0;
      xp = 0;
    },
    setEquipped(value) {
      equipped = Boolean(value);
      if (carryable.carried) anchor.visible = equipped;
    },
    setFill,
    lookingAtPlacedBucket,
    tryScoop(itemId) {
      if (!carryable.carried || !equipped) return 0;
      if (!isSandItemId(itemId)) return 0;
      if (state.fill >= BUCKET_CAPACITY) return 0;
      if (state.fillItemId && state.fillItemId !== itemId) return 0;
      setFill(state.fill + 1, itemId);
      return 1;
    },
    tryFill(itemId, hit = null) {
      if (carryable.carried || !lookingAtPlacedBucket()) return 0;
      if (!hit || hit.kind !== "bucket") return 0;
      if (!isSandItemId(itemId)) return 0;
      if (state.fill >= BUCKET_CAPACITY) return 0;
      if (state.fillItemId && state.fillItemId !== itemId) return 0;
      setFill(state.fill + 1, itemId);
      return 1;
    },
    crushUnderPlayer,
    tryMold(hit) {
      if (!carryable.carried || !equipped) return false;
      if (state.fill < CASTLE_SAND_COST || !state.fillItemId) return false;
      if (castles.length >= MAX_CASTLES) return false;
      if (!hit || (hit.kind !== "terrain" && hit.kind !== "castle")) return false;
      const preview = this.preview(hit);
      if (!preview?.valid) return false;
      const stacked = isCastleStackAim(hit);
      const placed = stacked ? hit : {
        kind: "terrain",
        x: preview.x,
        y: preview.y,
        z: preview.z,
      };
      if (!stacked && collisionWorld.solidAt?.(placed.x, placed.z, CASTLE_FOOTPRINT_RADIUS, CASTLE_PLACEMENT_IGNORE)) {
        return false;
      }
      const extra = Math.max(0, buildSandCost(BUILD_SCALES[sizeIndex]) - state.fill);
      if (extra && !spendExtraSand(state.fillItemId, extra)) return false;
      placeCastleAt(placed);
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
      clock += Math.max(0, Math.min(0.1, Number(dt) || 0));
      if (clock < nextTick) return;
      nextTick = clock + 0.1;
      // Bounded round-robin work: at most sixteen castle conditions per tick.
      for (let n = 0, count = Math.min(16, castles.length); n < count && castles.length; n++) {
        cursor %= castles.length;
        const record = castles[cursor];
        const environment = environmentAt(record.x, record.z, record.collider.minY);
        const supportLoss = record.support ? 0 : Math.max(0,
          record.foundationY - (collisionWorld.terrainHeightAt?.(record.x, record.z) ?? record.foundationY));
        stepCastleCondition(record.condition, clock - record.lastSimTime, {
          ...environment, supportLoss,
          supported: !record.support || collisionWorld.colliders.includes(record.support),
        });
        record.lastSimTime = clock;
        if (record.condition.survived && !record.rewarded) { record.rewarded = true; xp += 30; }
        record.object.material = castleMaterials[record.condition.moisture > 0.35 ? 1 : 0];
        if (record.condition.integrity <= 0) {
          castles.splice(cursor, 1);
          collapseRecord(record);
        } else {
          // Erosion visibly rounds down the mould; stacked blocks follow support.
          record.object.scale.y = record.buildScale * (0.72 + record.condition.integrity * 0.28);
          record.object.updateMatrixWorld(true);
          bounds.setFromObject(record.object);
          const baseY = record.support?.maxY ?? record.foundationY;
          record.object.position.y += baseY - bounds.min.y;
          record.object.updateMatrixWorld(true);
          bounds.setFromObject(record.object);
          record.collider.box.copy(bounds);
          record.collider.minY = bounds.min.y;
          record.collider.maxY = bounds.max.y;
          cursor++;
        }
      }
    },
    dispose() {
      for (const record of castles) disposeCastle(record);
      castleGeometries.forEach(geometry => geometry.dispose());
      castleMaterials.forEach(material => material.dispose());
      for (const template of [castleTemplate, wallTemplate, gateTemplate, library]) template.traverse(child => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
        else child.material?.dispose?.();
      });
      fillMesh.geometry.dispose();
      fillMesh.material.dispose();
      carryable.dispose();
    },
  };
}
