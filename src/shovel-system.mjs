import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createCarryableObject } from "./carryable-system.mjs";
import { TOOL_AIM_DISTANCE } from "./collision-system.mjs";
import { SHOVEL_STAMP_RADIUS } from "./sand-stamp.mjs";
import { SHOVEL_MODES, shovelBrush } from './shovel-brush.mjs';

const READY_POSITION = new THREE.Vector3(0.24, -0.26, -0.92);
const READY_ROTATION = new THREE.Euler(2.0, Math.PI, 0.3, "XYZ");
const HELD_SCALE = 1.0;
const SWING_START_POSITION = new THREE.Vector3(0.28, -0.08, -0.95);
const SWING_END_POSITION = new THREE.Vector3(0.06, -0.5, -1.35);
const SHOULDER_POSITION = new THREE.Vector3(0.32, 0.02, -0.86);
const SWING_START_ROTATION = new THREE.Euler(2.1, Math.PI, 0.32, "XYZ");
const SWING_END_ROTATION = new THREE.Euler(1.85, Math.PI, 0.24, "XYZ");
const SHOULDER_ROTATION = new THREE.Euler(2.2, Math.PI, 0.38, "XYZ");
const DIG_AIM_TRACE = TOOL_AIM_DISTANCE;

const WINDUP_SECONDS = 0.14;
const SWING_SECONDS = 0.3;
const SHOULDER_SECONDS = 0.26;
const SHOULDER_HOLD_SECONDS = 0.025;
const RECOVER_SECONDS = 0.18;

function smoothstep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function canShovelHit(hit, collisionWorld) {
  if (!hit) return false;
  if (hit.kind === "rock") return true;
  if (hit.kind !== "terrain") return false;
  return !collisionWorld?.solidAt?.(hit.x, hit.z, SHOVEL_STAMP_RADIUS);
}

function createDigAnimation(object, camera, collisionWorld, isCarried, onDig, getMode) {
  const startPosition = new THREE.Vector3();
  const phaseStartPosition = new THREE.Vector3();
  const readyPosition = new THREE.Vector3();
  const aimOrigin = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const startRotation = new THREE.Quaternion();
  const phaseStartRotation = new THREE.Quaternion();
  const readyRotation = new THREE.Quaternion();
  const swingStartRotation = new THREE.Quaternion().setFromEuler(SWING_START_ROTATION);
  const swingEndRotation = new THREE.Quaternion().setFromEuler(SWING_END_ROTATION);
  const shoulderRotation = new THREE.Quaternion().setFromEuler(SHOULDER_ROTATION);
  let phase = "idle";
  let phaseTime = 0;
  let targetKind = "terrain";
  let targetMode = 'Dig';
  let cutSteps = 0;

  function poseBetween(fromPosition, toPosition, fromRotation, toRotation, alpha) {
    object.position.lerpVectors(fromPosition, toPosition, alpha);
    object.quaternion.slerpQuaternions(fromRotation, toRotation, alpha);
    object.updateWorldMatrix(true, true);
  }

  function beginPhase(nextPhase) {
    phaseStartPosition.copy(object.position);
    phaseStartRotation.copy(object.quaternion);
    phase = nextPhase;
    phaseTime = 0;
  }

  function beginRecover() {
    beginPhase("recover");
  }

  return {
    get active() {
      return phase !== "idle";
    },
    trigger() {
      if (!isCarried() || phase !== "idle") return false;
      camera.getWorldPosition(aimOrigin);
      camera.getWorldDirection(aimDirection);
      const aimedContact = collisionWorld.raycastSurface?.(aimOrigin, aimDirection, DIG_AIM_TRACE)
        ?? collisionWorld.sweepPoint(
          aimOrigin,
          aimDirection.clone().multiplyScalar(DIG_AIM_TRACE).add(aimOrigin),
          0.035,
        );
      if (!canShovelHit(aimedContact, collisionWorld)) return false;
      startPosition.copy(object.position);
      startRotation.copy(object.quaternion);
      targetWorld.set(aimedContact.x, aimedContact.y, aimedContact.z);
      targetKind = aimedContact.kind;
      targetMode = getMode();
      cutSteps = 0;
      phase = "windup";
      phaseTime = 0;
      return true;
    },
    cancel() {
      phase = "idle";
      phaseTime = 0;
    },
    update(dt) {
      if (!isCarried()) {
        this.cancel();
        return;
      }
      if (phase === "idle") return;

      // The carryable controller has already supplied the current ready pose.
      readyPosition.copy(object.position);
      readyRotation.copy(object.quaternion);
      phaseTime += dt;

      if (phase === "windup") {
        const t = smoothstep01(phaseTime / WINDUP_SECONDS);
        poseBetween(startPosition, SWING_START_POSITION, startRotation, swingStartRotation, t);
        if (phaseTime >= WINDUP_SECONDS) beginPhase("swing");
        return;
      }

      if (phase === "swing") {
        const t = smoothstep01(phaseTime / SWING_SECONDS);
        poseBetween(phaseStartPosition, SWING_END_POSITION, phaseStartRotation, swingEndRotation, t);
        // Dip the middle of the right-to-left sweep so it reads as cutting
        // through sand rather than moving across a flat horizontal rail.
        object.position.y -= Math.sin(t * Math.PI) * 0.09;
        const desiredCuts = Math.min(3, Math.max(0, Math.floor((phaseTime / SWING_SECONDS - .25) * 4)));
        while (cutSteps < desiredCuts) {
          cutSteps++;
          if (targetKind === "terrain" || targetKind === "rock") {
            const horizontalLength = Math.hypot(aimDirection.x, aimDirection.z) || 1;
            onDig?.({
              x: targetWorld.x,
              y: targetWorld.y,
              z: targetWorld.z,
              forwardX: aimDirection.x / horizontalLength,
              forwardZ: aimDirection.z / horizontalLength,
              kind: targetKind,
              toolMode: targetMode,
              strength: 1 / 3,
              partialStroke: cutSteps < 3,
            });
          }
        }
        if (phaseTime >= SWING_SECONDS) {
          if (targetKind === "terrain") beginPhase("shoulder");
          else beginPhase("recover");
        }
        return;
      }

      if (phase === "shoulder") {
        const t = smoothstep01(phaseTime / SHOULDER_SECONDS);
        poseBetween(phaseStartPosition, SHOULDER_POSITION, phaseStartRotation, shoulderRotation, t);
        if (phaseTime >= SHOULDER_SECONDS) beginPhase("shoulderHold");
        return;
      }

      if (phase === "shoulderHold") {
        object.position.copy(SHOULDER_POSITION);
        object.quaternion.copy(shoulderRotation);
        if (phaseTime >= SHOULDER_HOLD_SECONDS) beginRecover();
        return;
      }

      const t = smoothstep01(phaseTime / RECOVER_SECONDS);
      poseBetween(phaseStartPosition, readyPosition, phaseStartRotation, readyRotation, t);
      if (phaseTime >= RECOVER_SECONDS) phase = "idle";
    },
  };
}

export async function createBeachShovel(scene, camera, view, collisionWorld, onDig = null) {
  const loader = new GLTFLoader();
  const url = new URL("../assets/models/blender-builder-shovel.glb", import.meta.url).href;
  const gltf = await loader.loadAsync(url);
  const anchor = new THREE.Group();
  anchor.name = "Carryable detailed beach shovel";
  anchor.userData.rtxIgnore = true;
  anchor.add(gltf.scene);
  // Roll around the shaft, preserving blade/handle positions while turning
  // the concave scooping face upward instead of showing its underside.
  gltf.scene.rotation.y = Math.PI;
  gltf.scene.traverse(object => {
    if (object.userData.studioVisible === false) {
      object.visible = false;
      return;
    }
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.rtxIgnore = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.envMapIntensity = 0.9;
      material.needsUpdate = true;
    }
  });
  const carryable = createCarryableObject({
    scene,
    camera,
    object: anchor,
    view,
    collisionWorld,
    spawn: { x: 1, z: -16.3, yaw: -0.2 },
    // Ready-to-dig pose: blade close at the left, shaft receding across the
    // lower view, and the handle clear of the aiming centre.
    heldPosition: READY_POSITION.toArray(),
    heldScale: HELD_SCALE,
    heldRotation: [READY_ROTATION.x, READY_ROTATION.y, READY_ROTATION.z],
    label: "shovel",
  });
  let equipped = true;
  let mode = 0;
  const digAnimation = createDigAnimation(
    anchor,
    camera,
    collisionWorld,
    () => carryable.carried && equipped,
    onDig,
    () => SHOVEL_MODES[mode],
  );
  return {
    object: carryable.object,
    get carried() {
      return carryable.carried;
    },
    get equipped() {
      return equipped;
    },
    get digging() {
      return digAnimation.active;
    },
    get modeName() { return SHOVEL_MODES[mode]; },
    get brush() { return shovelBrush(SHOVEL_MODES[mode]); },
    cycleMode() { if (!digAnimation.active) mode = (mode + 1) % SHOVEL_MODES.length; },
    setEquipped(value) {
      equipped = Boolean(value);
      if (carryable.carried) {
        anchor.visible = equipped;
        if (!equipped) digAnimation.cancel();
      }
    },
    interact() {
      digAnimation.cancel();
      const changed = carryable.interact();
      if (changed) anchor.visible = !carryable.carried || equipped;
      return changed;
    },
    dig() {
      return digAnimation.trigger();
    },
    update(dt) {
      carryable.update(dt);
      anchor.visible = !carryable.carried || equipped;
      if (equipped) digAnimation.update(dt);
      else digAnimation.cancel();
    },
    dispose() {
      digAnimation.cancel();
      carryable.dispose();
    },
  };
}
