import * as THREE from "three/webgpu";
import WebGPU from "three/addons/capabilities/WebGPU.js";
import { createViewState, stepFirstPerson, cameraOrientation } from "./first-person.mjs";
import { createBeachCollisionWorld, TOOL_AIM_DISTANCE } from "./collision-system.mjs";
import { carryableInteractScore } from "./carryable-system.mjs";
import { SHOVEL_RADIUS_X, SHOVEL_RADIUS_Z, SHOVEL_STAMP_RADIUS } from "./sand-stamp.mjs";
import { createAimPreview } from "./aim-preview.mjs";
import { createBeachFootstepSystem } from "./footstep-system.mjs";
import { loadAllTileMaps, syncSkyUniforms, waterTime } from "./materials.mjs";
import { applySkyCycle, createSkyClock } from "./sky-cycle.mjs";
import {
  NativeRtxRenderer,
  prepareRtxGuideMaterials,
} from "./native-rtx-renderer.mjs";
import { collectStaticBeachScene } from "./rtx-scene.mjs";
import { buildBeachScene, createBeachEnvironment, WATER_LEVEL, WORLD } from "./scene.mjs";
import { terrainHeight } from "./terrain.mjs";
import { createTerrainSim } from "./terrain-sim.mjs";
import { createBeachWeather } from "./weather.mjs";
import { canShovelHit, createBeachShovel } from "./shovel-system.mjs";
import {
  CASTLE_FOOTPRINT_RADIUS,
  CASTLE_PLACEMENT_IGNORE,
  createBeachBucket,
  isCastleStackAim,
} from "./bucket-system.mjs";
import { classifyBeachSurface, classifyDigBurst } from "./footstep-logic.mjs";
import { createDigBurstSystem } from "./dig-burst.mjs";
import { BUCKET_CAPACITY, CASTLE_SAND_COST, createInventory, dumpableSandId, harvestItemId, hotbarIndexFromCode, isSandItemId } from "./inventory-system.mjs";
import { createInventoryHud } from "./inventory-hud.mjs";
import { isBrowserHost, reportProgress, yieldToBrowser } from "./async-load.mjs";

export async function startDesertedIsland({ onProgress } = {}) {
  if (!onProgress) {
    let lastStage = "";
    onProgress = ({ stage, ratio }) => {
      if (stage === lastStage) return;
      lastStage = stage;
      console.log(`[Deserted Island] ${Math.round((Number(ratio) || 0) * 100)}% ${stage}`);
    };
  }
document.title = "Deserted Island — ThreeBrowser";
await reportProgress(onProgress, "Starting renderer", 0.08);

const RTX_INTERNAL_PIXELS = 5_300_000;
const RASTER_INTERNAL_PIXELS = 2560 * 1440;
const MAX_INTERNAL_RATIO = 2.25;

function hasNativeRays() {
  const bridge = navigator.gpu?.threeBrowserRTX;
  return typeof bridge?.evaluateRayLighting === "function"
    || typeof bridge?.evaluateRayReflections === "function";
}

function chooseInternalRatio(width, height) {
  const cssPixels = Math.max(1, width * height);
  if (!hasNativeRays()) {
    return Math.min(1, Math.sqrt(RASTER_INTERNAL_PIXELS / cssPixels));
  }
  const budgetRatio = Math.sqrt(RTX_INTERNAL_PIXELS / cssPixels);
  return Math.min(MAX_INTERNAL_RATIO, budgetRatio);
}

function reportBridge(rtx) {
  if (!rtx) {
    console.warn("[First-Person Beach] RTX bridge unavailable; WebGPU raster remains active.");
    return;
  }
  const capabilities = rtx.capabilities ?? {};
  console.log(
    `[First-Person Beach] adapter=${capabilities.adapterName || "unknown"}` +
    ` · RTX=${Boolean(capabilities.rtx)}` +
    ` · rayLighting=${typeof rtx.evaluateRayLighting === "function"}` +
    ` · rayReflections=${typeof rtx.evaluateRayReflections === "function"}`,
  );
}

if (!WebGPU.isAvailable()) {
  throw new Error("First-person beach requires native WebGPU; there is no WebGL path.");
}

const renderer = new THREE.WebGPURenderer({
  antialias: true,
  powerPreference: "high-performance",
  trackTimestamp: false,
});
const displayPixelRatio = Math.max(1, Number(globalThis.devicePixelRatio || 1));
let internalRatio = chooseInternalRatio(innerWidth, innerHeight);
renderer.setPixelRatio(displayPixelRatio);
renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight));
renderer.setClearColor(0x87b0d2, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
renderer.domElement.style.touchAction = "none";
document.body.appendChild(renderer.domElement);
if (isBrowserHost()) renderer.domElement.style.opacity = "0";
await renderer.init();
await yieldToBrowser();
if (!renderer.backend?.isWebGPUBackend) {
  throw new Error("WebGPURenderer did not initialize its WebGPU backend.");
}
renderer.backend.device?.addEventListener?.("uncapturederror", event => {
  console.error("[Beach WebGPU]", event.error?.message || event.error || event);
});

const rtx = navigator.gpu?.threeBrowserRTX ?? null;
reportBridge(rtx);
console.log("[First-Person Beach] Click/dig · Right-click fill bucket, scoop piles, dump sand, or mold castle · WASD walk · Shift sprint · Space jump · E carry/drop · Tab inventory · 1-9 hotbar · X RTX");

const scene = new THREE.Scene();
scene.name = "First-person tropical beach";
scene.background = new THREE.Color(0x87b0d2);
scene.fog = new THREE.FogExp2(0x9ec0dc, 0.0088);

const camera = new THREE.PerspectiveCamera(72, innerWidth / Math.max(1, innerHeight), 0.08, 4000);
// Held props are camera children, so the camera must be part of the rendered
// scene graph even though it is also passed directly to render().
scene.add(camera);
const environment = createBeachEnvironment(renderer);
scene.environment = environment.texture;
scene.environmentIntensity = 0.62;

await reportProgress(onProgress, "Loading island materials", 0.16);
const maps = await loadAllTileMaps({
  onProgress: ({ stage, detail, ratio }) => {
    onProgress?.({ stage, detail, ratio: 0.16 + ratio * 0.42 });
  },
});
await reportProgress(onProgress, "Building the shoreline", 0.6);
const world = await buildBeachScene(scene, maps, renderer);
await yieldToBrowser();
await reportProgress(onProgress, "Placing weather and tools", 0.72);
const collisionWorld = createBeachCollisionWorld(world);
const terrainSim = createTerrainSim({ terrainHeight, waterLevel: WATER_LEVEL });
collisionWorld.attachTerrainSim(terrainSim);
const weather = createBeachWeather(scene, camera, world);
await yieldToBrowser();
const footsteps = createBeachFootstepSystem(scene, world, weather.surfaceWater, collisionWorld, terrainSim);
const view = createViewState(0, -18, Math.PI, -0.05);
view.y = collisionWorld.groundHeightAt(view.x, view.z) + 1.64;
camera.position.set(view.x, view.y, view.z);
const inventory = createInventory();
const hud = createInventoryHud({
  inventory,
  icons: {
    "dry-sand": maps["dry-sand"]?.albedo,
    "wet-sand": maps["wet-sand"]?.albedo,
    rock: maps["coastal-rock"]?.albedo,
  },
  nativeOverlay: !isBrowserHost(),
});
hud.resize(innerWidth, innerHeight, displayPixelRatio);
const digBurst = createDigBurstSystem(scene, collisionWorld);

function collectFromDig(hit) {
  const kind = hit.kind || "terrain";
  if (kind === "terrain") footsteps.dig(hit);
  const support = collisionWorld.surfaceAt(hit.x, hit.z);
  const surface = classifyBeachSurface({
    groundHeight: support.height,
    waterLevel: WATER_LEVEL,
    wetness: weather.surfaceWater?.wetnessAt?.(hit.x, hit.z) ?? 0,
    objectKind: kind === "terrain" ? null : kind,
  });
  const burst = classifyDigBurst({ kind, surface, z: hit.z });
  digBurst.spawn(hit, burst);
  if (burst === "water") {
    weather.surfaceWater?.impact?.({
      x: hit.x,
      y: WATER_LEVEL + 0.03,
      z: hit.z,
      kind: "water",
      intensity: 1.15,
    });
  } else if (burst === "wet-sand") {
    weather.surfaceWater?.impact?.({
      x: hit.x,
      y: hit.y + 0.02,
      z: hit.z,
      kind: "terrain",
      intensity: 0.42,
    });
  }
  const itemId = harvestItemId({ kind, surface });
  if (!itemId) return;
  const leftover = inventory.add(itemId, 1);
  if (leftover > 0) {
    console.log("[First-Person Beach] Inventory full");
    return;
  }
  const item = inventory.catalog[itemId];
  console.log(`[First-Person Beach] Collected ${item?.name ?? itemId}`);
  hud.markDirty();
}

const aimOrigin = new THREE.Vector3();
const aimDirection = new THREE.Vector3();

function dumpOntoGround() {
  if (hud.open || shovel.digging) return false;
  if (bucket.carried && bucket.equipped) return false;
  const itemId = dumpableSandId(inventory);
  if (!itemId) return false;
  camera.getWorldPosition(aimOrigin);
  camera.getWorldDirection(aimDirection);
  const hit = collisionWorld.raycastSurface(aimOrigin, aimDirection, TOOL_AIM_DISTANCE);
  if (!hit || hit.kind !== "terrain") return false;
  if (!collisionWorld.canStampTerrain(hit.x, hit.z, SHOVEL_STAMP_RADIUS)) return false;
  if (inventory.remove(itemId, 1) < 1) return false;
  const horizontal = Math.hypot(aimDirection.x, aimDirection.z) || 1;
  const dumpHit = {
    x: hit.x,
    y: hit.y,
    z: hit.z,
    forwardX: aimDirection.x / horizontal,
    forwardZ: aimDirection.z / horizontal,
    kind: "terrain",
  };
  footsteps.dump(dumpHit);
  dumpHit.y = collisionWorld.terrainHeightAt(dumpHit.x, dumpHit.z);
  digBurst.spawn(dumpHit, itemId, { dump: true });
  hud.markDirty();
  return true;
}

const shovel = await createBeachShovel(
  scene,
  camera,
  view,
  collisionWorld,
  collectFromDig,
);
function collapseCastleIntoMound(mound) {
  footsteps.dump(mound);
  mound.y = collisionWorld.terrainHeightAt(mound.x, mound.z);
  digBurst.spawn(mound, mound.itemId || "dry-sand", { dump: true });
}

const bucket = await createBeachBucket({
  scene,
  camera,
  view,
  collisionWorld,
  onCollapse: collapseCastleIntoMound,
});

function persistBucketFill() {
  const index = inventory.findItem("bucket");
  if (index < 0) return;
  inventory.setToolData(index, { fill: bucket.fill, fillItemId: bucket.fillItemId });
}

function syncToolEquipment() {
  shovel.setEquipped(shovel.carried && inventory.selectedItemId() === "shovel");
  bucket.setEquipped(bucket.carried && inventory.selectedItemId() === "bucket");
}

function fillPlacedBucket() {
  if (hud.open || bucket.carried) return false;
  const itemId = inventory.selectedItemId();
  const sandId = isSandItemId(itemId) ? itemId : dumpableSandId(inventory);
  if (!sandId) return false;
  camera.getWorldPosition(aimOrigin);
  camera.getWorldDirection(aimDirection);
  const hit = collisionWorld.raycastSurface(aimOrigin, aimDirection, TOOL_AIM_DISTANCE);
  if (bucket.tryFill(sandId, hit) < 1) return false;
  if (inventory.remove(sandId, 1) < 1) {
    bucket.setFill(bucket.fill - 1, bucket.fillItemId);
    return false;
  }
  hud.markDirty();
  console.log(`[First-Person Beach] Bucket ${bucket.fill}/${BUCKET_CAPACITY} ${inventory.catalog[sandId]?.name ?? sandId}`);
  return true;
}

function pileSandId(hit) {
  const support = collisionWorld.surfaceAt(hit.x, hit.z);
  const surface = classifyBeachSurface({
    groundHeight: support.height,
    waterLevel: WATER_LEVEL,
    wetness: terrainSim.wetnessAt?.(hit.x, hit.z) ?? weather.surfaceWater?.wetnessAt?.(hit.x, hit.z) ?? 0,
  });
  return harvestItemId({ kind: "terrain", surface }) ?? "dry-sand";
}

function scoopPileIntoBucket() {
  if (hud.open || !bucket.carried || !bucket.equipped) return false;
  if (bucket.fill >= BUCKET_CAPACITY) return false;
  camera.getWorldPosition(aimOrigin);
  camera.getWorldDirection(aimDirection);
  const hit = collisionWorld.raycastSurface(aimOrigin, aimDirection, TOOL_AIM_DISTANCE);
  if (!hit || hit.kind !== "terrain") return false;
  if (!terrainSim.isSandPile?.(hit.x, hit.z)) return false;
  const sandId = pileSandId(hit);
  if (bucket.tryScoop(sandId) < 1) return false;
  const horizontal = Math.hypot(aimDirection.x, aimDirection.z) || 1;
  const scoopHit = {
    x: hit.x,
    y: hit.y,
    z: hit.z,
    forwardX: aimDirection.x / horizontal,
    forwardZ: aimDirection.z / horizontal,
    kind: "terrain",
  };
  footsteps.scoop(scoopHit);
  persistBucketFill();
  scoopHit.y = collisionWorld.terrainHeightAt(scoopHit.x, scoopHit.z);
  digBurst.spawn(scoopHit, sandId);
  hud.markDirty();
  console.log(`[First-Person Beach] Scooped ${inventory.catalog[sandId]?.name ?? sandId} · bucket ${bucket.fill}/${BUCKET_CAPACITY}`);
  return true;
}

function moldSandCastle() {
  if (hud.open || !bucket.carried || !bucket.equipped) return false;
  camera.getWorldPosition(aimOrigin);
  camera.getWorldDirection(aimDirection);
  const hit = collisionWorld.raycastSurface(aimOrigin, aimDirection, TOOL_AIM_DISTANCE);
  if (!bucket.tryMold(hit)) return false;
  persistBucketFill();
  hud.markDirty();
  console.log("[First-Person Beach] Molded a sand castle");
  return true;
}

const interactPosition = new THREE.Vector3();
const aimPreview = createAimPreview(scene);

function currentAim() {
  if (hud.open) return null;
  camera.getWorldPosition(aimOrigin);
  camera.getWorldDirection(aimDirection);
  const hit = collisionWorld.raycastSurface(aimOrigin, aimDirection, TOOL_AIM_DISTANCE);
  if (!hit) return null;
  const yaw = Math.atan2(aimDirection.x, aimDirection.z);
  const sandId = dumpableSandId(inventory);
  if (bucket.carried && bucket.equipped) {
    if (bucket.fill < BUCKET_CAPACITY && hit.kind === "terrain" && terrainSim.isSandPile?.(hit.x, hit.z)) {
      const sandId = pileSandId(hit);
      const typeOk = !bucket.fillItemId || bucket.fillItemId === sandId;
      return {
        mode: "fill",
        x: hit.x,
        y: hit.y,
        z: hit.z,
        radiusX: SHOVEL_RADIUS_X,
        radiusZ: SHOVEL_RADIUS_Z,
        yaw,
        valid: typeOk,
      };
    }
    const stacked = isCastleStackAim(hit);
    const beside = hit.kind === "terrain" || hit.kind === "castle";
    const stampOk = stacked || (
      beside && !collisionWorld.solidAt(hit.x, hit.z, CASTLE_FOOTPRINT_RADIUS, CASTLE_PLACEMENT_IGNORE)
    );
    return {
      mode: "castle",
      x: stacked ? (hit.collider?.stackX ?? hit.x) : hit.x,
      y: stacked ? (hit.collider?.maxY ?? hit.y) : (collisionWorld.terrainHeightAt(hit.x, hit.z) ?? hit.y),
      z: stacked ? (hit.collider?.stackZ ?? hit.z) : hit.z,
      radiusX: CASTLE_FOOTPRINT_RADIUS,
      radiusZ: CASTLE_FOOTPRINT_RADIUS,
      yaw: 0,
      valid: bucket.fill >= CASTLE_SAND_COST && Boolean(bucket.fillItemId) && stampOk,
    };
  }
  if (!bucket.carried && hit.kind === "bucket" && bucket.lookingAtPlacedBucket()) {
    const selected = inventory.selectedItemId();
    const fillId = isSandItemId(selected) ? selected : sandId;
    const typeOk = !bucket.fillItemId || bucket.fillItemId === fillId;
    return {
      mode: "fill",
      x: hit.x,
      y: hit.y,
      z: hit.z,
      radiusX: 0.14,
      radiusZ: 0.14,
      yaw: 0,
      valid: Boolean(fillId) && bucket.fill < BUCKET_CAPACITY && typeOk,
    };
  }
  if (shovel.carried && shovel.equipped) {
    return {
      mode: "dig",
      x: hit.x,
      y: hit.y,
      z: hit.z,
      radiusX: SHOVEL_RADIUS_X,
      radiusZ: SHOVEL_RADIUS_Z,
      yaw,
      valid: canShovelHit(hit, collisionWorld),
    };
  }
  if (sandId) {
    return {
      mode: "dump",
      x: hit.x,
      y: hit.y,
      z: hit.z,
      radiusX: SHOVEL_RADIUS_X,
      radiusZ: SHOVEL_RADIUS_Z,
      yaw,
      valid: hit.kind === "terrain" && collisionWorld.canStampTerrain(hit.x, hit.z, SHOVEL_STAMP_RADIUS),
    };
  }
  return null;
}

function takeTool(itemId, persist) {
  inventory.add(itemId, 1, { preferSelected: true });
  persist?.();
  const index = inventory.findItem(itemId);
  if (index >= inventory.storageSize) inventory.selectHotbar(index - inventory.storageSize);
}

function interactCarryables() {
  if (shovel.carried && shovel.equipped) {
    if (shovel.interact()) inventory.remove("shovel", 1);
    return;
  }
  if (bucket.carried && bucket.equipped) {
    persistBucketFill();
    if (bucket.interact()) inventory.remove("bucket", 1);
    return;
  }
  shovel.object.getWorldPosition(interactPosition);
  const shovelScore = shovel.carried ? -Infinity : carryableInteractScore(view, interactPosition.x, interactPosition.z);
  bucket.object.getWorldPosition(interactPosition);
  const bucketScore = bucket.carried ? -Infinity : carryableInteractScore(view, interactPosition.x, interactPosition.z);
  const preferBucket = bucketScore > shovelScore;
  if (preferBucket && !bucket.carried && inventory.canAdd("bucket", 1) && bucket.interact()) {
    takeTool("bucket", persistBucketFill);
    return;
  }
  if (!shovel.carried && inventory.canAdd("shovel", 1) && shovel.interact()) {
    takeTool("shovel");
    return;
  }
  if (!bucket.carried && inventory.canAdd("bucket", 1) && bucket.interact()) {
    takeTool("bucket", persistBucketFill);
  }
}

prepareRtxGuideMaterials(scene);
await yieldToBrowser();

const keys = new Set();
const look = { x: 0, y: 0 };
let nativeRequested = true;
let looking = false;
let jumpQueued = false;
let lastPathLabel = "";

const rtxRenderer = new NativeRtxRenderer(renderer, camera, rtx);
let nativeReady = false;
const sunDirection = new THREE.Vector3();
const sunTarget = new THREE.Vector3();
const skyClock = createSkyClock();

async function warmScenePipelines() {
  const savedPosition = camera.position.clone();
  const savedQuaternion = camera.quaternion.clone();
  try {
    camera.position.set(0, 5.5, -10);
    camera.lookAt(0, 6, -38);
    camera.updateMatrixWorld(true);
    if (isBrowserHost() && typeof renderer.compileAsync === "function") {
      await renderer.compileAsync(scene, camera);
      await yieldToBrowser();
    }
    const warmed = nativeReady
      ? rtxRenderer.render(scene, camera, { maxDistance: 180, rayBias: 0.022 })
      : rtxRenderer.renderRaster(scene, camera);
    if (warmed) console.log("[First-Person Beach] WebGPU palm and shadow pipelines warmed");
  } catch (error) {
    console.warn(`[First-Person Beach] Pipeline warm-up skipped: ${error?.message || error}`);
  } finally {
    camera.position.copy(savedPosition);
    camera.quaternion.copy(savedQuaternion);
    camera.updateMatrixWorld(true);
  }
}

function internalSize() {
  return new THREE.Vector2(
    Math.max(1, Math.round(innerWidth * internalRatio)),
    Math.max(1, Math.round(innerHeight * internalRatio)),
  );
}

async function configureNative() {
  const size = internalSize();
  rtxRenderer.resize(size.x, size.y);
  nativeReady = false;
  const hasRays = typeof rtx?.evaluateRayLighting === "function"
    || typeof rtx?.evaluateRayReflections === "function";
  if (!nativeRequested || !hasRays) return false;
  try {
    world.terrain.updateWorldMatrix(true, true);
    world.dressing.updateWorldMatrix(true, true);
    const staticScene = collectStaticBeachScene(world.staticRoots, []);
    nativeReady = await rtxRenderer.configure(size.x, size.y, staticScene);
  } catch (error) {
    console.warn(`[First-Person Beach] RTX setup failed: ${error?.message || error}`);
    nativeReady = false;
  }
  return nativeReady;
}

await reportProgress(onProgress, "Preparing lighting", 0.82);
await configureNative();
await reportProgress(onProgress, "Compiling shaders", 0.9);
await warmScenePipelines();
await reportProgress(onProgress, "Ready", 1);
if (isBrowserHost()) {
  renderer.domElement.style.transition = "opacity 280ms ease";
  renderer.domElement.style.opacity = "1";
}

function applyCamera() {
  const pose = cameraOrientation(view);
  camera.rotation.order = "YXZ";
  camera.rotation.x = pose.pitch;
  camera.rotation.y = pose.yaw;
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
}

function clampToWorld(state) {
  state.x = THREE.MathUtils.clamp(state.x, WORLD.minX + 4, WORLD.maxX - 4);
  state.z = THREE.MathUtils.clamp(state.z, WORLD.minZ + 4, 18);
}

const canvas = renderer.domElement;
canvas.addEventListener("contextmenu", event => event.preventDefault());
canvas.addEventListener("pointerdown", event => {
  footsteps.arm();
  const locked = document.pointerLockElement === canvas;
  const ui = hud.handlePointer(event, canvas, { pointerLocked: locked });
  syncToolEquipment();
  if (hud.open || ui.handled) {
    looking = false;
    if (hud.open) document.exitPointerLock?.();
    return;
  }
  if (event.button === 2) {
    if (bucket.carried && bucket.equipped) {
      if (!scoopPileIntoBucket()) moldSandCastle();
    } else if (!fillPlacedBucket()) dumpOntoGround();
    return;
  }
  if (event.button !== 0) return;
  if (shovel.carried && shovel.equipped) shovel.dig();
  looking = true;
  try {
    canvas.setPointerCapture?.(event.pointerId);
  } catch {
    // Pointer lock or a cancelled pointer can reject capture.
  }
  canvas.requestPointerLock?.();
});
canvas.addEventListener("pointerup", event => {
  hud.handlePointer(event, canvas, {
    pointerLocked: document.pointerLockElement === canvas,
  });
  syncToolEquipment();
  looking = false;
  try {
    canvas.releasePointerCapture?.(event.pointerId);
  } catch {
    // Capture may already have been released by pointer lock.
  }
});
canvas.addEventListener("pointercancel", event => {
  hud.handlePointer(event, canvas, { pointerLocked: false });
  looking = false;
});
canvas.addEventListener("pointermove", event => {
  const locked = document.pointerLockElement === canvas;
  hud.handlePointer(event, canvas, { pointerLocked: locked });
  if (hud.open) return;
  if (!looking && !locked) return;
  look.x += event.movementX || 0;
  look.y += event.movementY || 0;
});
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas) looking = false;
});
addEventListener("keydown", event => {
  if (event.code === "Tab") {
    event.preventDefault?.();
    if (event.repeat) return;
    hud.toggle();
    looking = false;
    if (hud.open) document.exitPointerLock?.();
    else canvas.requestPointerLock?.();
    return;
  }
  if (event.code === "Escape" && hud.open) {
    event.preventDefault?.();
    hud.setOpen(false);
    looking = false;
    return;
  }
  const hotbar = hotbarIndexFromCode(event.code);
  if (hotbar >= 0) {
    inventory.selectHotbar(hotbar);
    syncToolEquipment();
    hud.markDirty();
    return;
  }
  if (event.code === "KeyX") {
    nativeRequested = !nativeRequested;
    if (nativeRequested) configureNative();
    else nativeReady = false;
    console.log(`[First-Person Beach] RTX requested=${nativeRequested}`);
  }
  if (!hud.open) footsteps.arm();
  keys.add(event.code);
  if (hud.open) {
    if (event.code === "Space") event.preventDefault?.();
    return;
  }
  if (event.code === "Space" && !event.repeat) {
    jumpQueued = true;
    event.preventDefault?.();
  }
  if (event.code === "KeyE" && !event.repeat) {
    interactCarryables();
    syncToolEquipment();
    hud.markDirty();
  }
});
addEventListener("keyup", event => keys.delete(event.code));

let previous = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  stepFirstPerson(view, {
    forward: Number(keys.has("KeyW") || keys.has("ArrowUp")),
    back: Number(keys.has("KeyS") || keys.has("ArrowDown")),
    left: Number(keys.has("KeyA") || keys.has("ArrowLeft")),
    right: Number(keys.has("KeyD") || keys.has("ArrowRight")),
    sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
    jump: hud.open ? false : jumpQueued,
    lookX: hud.open ? 0 : look.x,
    lookY: hud.open ? 0 : look.y,
  }, collisionWorld.groundHeightAt, WATER_LEVEL, dt, collisionWorld);
  jumpQueued = false;
  look.x = 0;
  look.y = 0;
  bucket.crushUnderPlayer(view);
  clampToWorld(view);
  applyCamera();
  world.sky.position.copy(camera.position);
  waterTime.value += dt;
  world.foamField?.update(dt);
  const sky = skyClock.advance(dt);
  syncSkyUniforms(sky);
  applySkyCycle(sky, {
    sun: world.sun,
    moonLight: world.moonLight,
    hemi: world.lights.hemi,
    bounce: world.lights.bounce,
    moon: world.moon,
    stars: world.stars,
    camera,
    scene,
    renderer,
  });
  const weatherFrame = weather.update(dt, sky, world);
  footsteps.update(dt, view);
  syncToolEquipment();
  shovel.update(dt);
  bucket.update(dt);
  aimPreview.update(currentAim());
  digBurst.update(dt);
  hud.sync(renderer);

  world.sun.updateWorldMatrix(true, false);
  world.sun.target.updateWorldMatrix(true, false);
  if (sky.keyIsSun) {
    world.sun.getWorldPosition(sunDirection);
    world.sun.target.getWorldPosition(sunTarget);
  } else {
    world.moonLight.updateWorldMatrix(true, false);
    world.moonLight.target.updateWorldMatrix(true, false);
    world.moonLight.getWorldPosition(sunDirection);
    world.moonLight.target.getWorldPosition(sunTarget);
  }
  sunDirection.sub(sunTarget).normalize();

  const frameOptions = {
    sunDirection,
    sunIntensity: sky.rtxSunIntensity * (1 - weatherFrame.cloudShadow * 0.62),
    shadowStrength: Math.min(0.9, sky.shadowStrength + weatherFrame.cloudShadow * 0.42),
    aoStrength: sky.day * 0.1 + 0.04,
    aoRadius: 1.15,
    maxDistance: 180,
    rayBias: 0.022,
    reflectionStrength: 0.35 + sky.day * 0.35,
    environmentColor: sky.horizon,
    environmentIntensity: (0.18 + sky.day * 0.62) * (1 - weatherFrame.cloudShadow * 0.48),
  };

  let rendered = false;
  if (nativeRequested && nativeReady) {
    rendered = rtxRenderer.render(scene, camera, frameOptions);
  }
  if (!rendered) {
    nativeReady = false;
    rendered = rtxRenderer.renderRaster(scene, camera);
  }
  if (!rtxRenderer.present(hud.frame())) {
    renderer.setRenderTarget(null);
    renderer.setMRT(null);
    renderer.render(scene, camera);
  }
  hud.afterPresent();

  const pathLabel = nativeReady ? rtxRenderer.rayPathLabel : "WEBGPU RASTER FALLBACK";
  if (pathLabel !== lastPathLabel) {
    lastPathLabel = pathLabel;
    console.log(`[First-Person Beach] path=${pathLabel}`);
  }
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / Math.max(1, innerHeight);
  camera.updateProjectionMatrix();
  internalRatio = chooseInternalRatio(innerWidth, innerHeight);
  renderer.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight));
  hud.resize(innerWidth, innerHeight, displayPixelRatio);
  const size = internalSize();
  const resized = rtxRenderer.resize(size.x, size.y);
  if (nativeReady) nativeReady = resized;
});

addEventListener("beforeunload", () => {
  world.foamField?.dispose();
  weather.dispose();
  footsteps.dispose();
  digBurst.dispose();
  shovel.dispose();
  bucket.dispose();
  aimPreview.dispose();
  hud.dispose();
  rtxRenderer.dispose();
});
}

if (globalThis.__DESERTED_ISLAND_RUNTIME_MODE__ !== "browser") {
  await startDesertedIsland();
}
