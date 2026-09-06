import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createCarryableObject } from "./carryable-system.mjs";
import { TOOL_AIM_DISTANCE } from "./collision-system.mjs";

export const CHOPS_TO_FELL = 4;

const READY_POSITION = new THREE.Vector3(0.34, -0.14, -0.58);
const READY_ROTATION = new THREE.Euler(0.22, 0, 0.32, "XYZ");
const HELD_SCALE = 0.72;
const WINDUP_POSITION = new THREE.Vector3(0.22, 0.42, -0.4);
const WINDUP_ROTATION = new THREE.Euler(-1.12, 0.08, 0.18, "XYZ");
const CHOP_POSITION = new THREE.Vector3(0.16, -0.44, -0.76);
const CHOP_ROTATION = new THREE.Euler(1.18, 0.04, 0.12, "XYZ");
const AIM_TRACE = TOOL_AIM_DISTANCE;

const WINDUP_SECONDS = 0.18;
const SWING_SECONDS = 0.22;
const RECOVER_SECONDS = 0.28;

function smoothstep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function removeCollider(colliders, collider) {
  if (!collider || !colliders) return;
  const index = colliders.indexOf(collider);
  if (index >= 0) colliders.splice(index, 1);
}

export function canAxeHit(hit) {
  return hit?.kind === "palm" || hit?.kind === "wood";
}

export function applyAxeChop(hit, collisionWorld) {
  if (!canAxeHit(hit)) return null;
  const collider = hit.collider;
  const point = {
    x: Number(hit.x) || 0,
    y: Number(hit.y) || 0,
    z: Number(hit.z) || 0,
    object: collider?.object ?? null,
  };
  if (hit.kind === "wood") {
    removeCollider(collisionWorld?.colliders, collider);
    return { kind: "wood", itemId: "palm-wood", felled: true, chops: 1, ...point };
  }
  const chops = (collider.chops || 0) + 1;
  if (collider) collider.chops = chops;
  const felled = chops >= CHOPS_TO_FELL;
  if (felled) removeCollider(collisionWorld?.colliders, collider);
  return { kind: "palm", itemId: "palm-wood", felled, chops, ...point };
}

function createChopAnimation(object, camera, collisionWorld, isReady, onChop) {
  const startPosition = new THREE.Vector3();
  const phaseStartPosition = new THREE.Vector3();
  const readyPosition = new THREE.Vector3();
  const aimOrigin = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const startRotation = new THREE.Quaternion();
  const phaseStartRotation = new THREE.Quaternion();
  const readyRotation = new THREE.Quaternion();
  const windupRotation = new THREE.Quaternion().setFromEuler(WINDUP_ROTATION);
  const chopRotation = new THREE.Quaternion().setFromEuler(CHOP_ROTATION);
  let phase = "idle";
  let phaseTime = 0;
  let pendingHit = null;

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

  return {
    get active() {
      return phase !== "idle";
    },
    trigger() {
      if (!isReady() || phase !== "idle") return false;
      camera.getWorldPosition(aimOrigin);
      camera.getWorldDirection(aimDirection);
      const aimedContact = collisionWorld.raycastSurface?.(aimOrigin, aimDirection, AIM_TRACE)
        ?? collisionWorld.sweepPoint(
          aimOrigin,
          aimDirection.clone().multiplyScalar(AIM_TRACE).add(aimOrigin),
          0.035,
        );
      if (!canAxeHit(aimedContact)) return false;
      startPosition.copy(object.position);
      startRotation.copy(object.quaternion);
      pendingHit = aimedContact;
      phase = "windup";
      phaseTime = 0;
      return true;
    },
    cancel() {
      phase = "idle";
      phaseTime = 0;
      pendingHit = null;
    },
    update(dt) {
      if (!isReady()) {
        this.cancel();
        return;
      }
      if (phase === "idle") return;
      readyPosition.copy(object.position);
      readyRotation.copy(object.quaternion);
      phaseTime += dt;

      if (phase === "windup") {
        const t = smoothstep01(phaseTime / WINDUP_SECONDS);
        poseBetween(startPosition, WINDUP_POSITION, startRotation, windupRotation, t);
        if (phaseTime >= WINDUP_SECONDS) beginPhase("swing");
        return;
      }

      if (phase === "swing") {
        const t = smoothstep01(phaseTime / SWING_SECONDS);
        poseBetween(phaseStartPosition, CHOP_POSITION, phaseStartRotation, chopRotation, t);
        if (phaseTime >= SWING_SECONDS) {
          const result = applyAxeChop(pendingHit, collisionWorld);
          if (result) {
            result.directionX = aimDirection.x;
            result.directionZ = aimDirection.z;
            console.log(
              result.felled
                ? `[First-Person Beach] Chopped down ${result.kind}`
                : `[First-Person Beach] Axe struck ${result.kind} · ${result.chops}/${CHOPS_TO_FELL}`,
            );
            onChop?.(result);
          }
          pendingHit = null;
          beginPhase("recover");
        }
        return;
      }

      const t = smoothstep01(phaseTime / RECOVER_SECONDS);
      poseBetween(phaseStartPosition, readyPosition, phaseStartRotation, readyRotation, t);
      if (phaseTime >= RECOVER_SECONDS) phase = "idle";
    },
  };
}

export async function createBeachAxe(scene, camera, view, collisionWorld, onChop = null) {
  const loader = new GLTFLoader();
  const url = new URL("../assets/models/beach-felling-axe.glb", import.meta.url).href;
  const gltf = await loader.loadAsync(url);
  const anchor = new THREE.Group();
  anchor.name = "Carryable felling axe";
  anchor.userData.rtxIgnore = true;
  const visual = new THREE.Group();
  visual.name = "Axe blade-forward visual";
  visual.rotation.y = Math.PI;
  visual.add(gltf.scene);
  anchor.add(visual);
  gltf.scene.traverse(object => {
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
    spawn: { x: 2.15, z: -15.85, yaw: 0.55 },
    heldPosition: READY_POSITION.toArray(),
    heldScale: HELD_SCALE,
    heldRotation: [READY_ROTATION.x, READY_ROTATION.y, READY_ROTATION.z],
    label: "axe",
  });
  let equipped = true;
  const chopAnimation = createChopAnimation(
    anchor,
    camera,
    collisionWorld,
    () => carryable.carried && equipped,
    onChop,
  );
  return {
    object: carryable.object,
    get carried() {
      return carryable.carried;
    },
    get equipped() {
      return equipped;
    },
    get chopping() {
      return chopAnimation.active;
    },
    setEquipped(value) {
      equipped = Boolean(value);
      if (carryable.carried) {
        anchor.visible = equipped;
        if (!equipped) chopAnimation.cancel();
      }
    },
    interact() {
      chopAnimation.cancel();
      const changed = carryable.interact();
      if (changed) anchor.visible = !carryable.carried || equipped;
      return changed;
    },
    chop() {
      return chopAnimation.trigger();
    },
    update(dt) {
      carryable.update(dt);
      anchor.visible = !carryable.carried || equipped;
      if (equipped) chopAnimation.update(dt);
      else chopAnimation.cancel();
    },
    dispose() {
      chopAnimation.cancel();
      carryable.dispose();
    },
  };
}
