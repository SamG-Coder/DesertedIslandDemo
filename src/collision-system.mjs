import * as THREE from "three/webgpu";
import { terrainHeight } from "./terrain.mjs";

export const PLAYER_RADIUS = 0.31;
export const TOOL_AIM_DISTANCE = 64;
const STEP_CLEARANCE = 0.08;
const MAX_TOOL_SWEEP_STEPS = 64;
const RAY_STEP = 0.1;

function signedAmount(record) {
  const amount = Number(record?.amount);
  if (Number.isFinite(amount)) return amount;
  const depth = Number(record?.depth);
  return Number.isFinite(depth) ? -depth : 0;
}

function editWeight(record, x, z) {
  const radiusX = Math.max(1e-4, Number(record.radiusX) || 0.2);
  const radiusZ = Math.max(1e-4, Number(record.radiusZ) || 0.26);
  const dx = x - record.x;
  const dz = z - record.z;
  const localX = dx * record.rightX + dz * record.rightZ;
  const localZ = dx * record.forwardX + dz * record.forwardZ;
  const q = Math.pow(Math.abs(localX) / radiusX, 3)
    + Math.pow(Math.abs(localZ) / radiusZ, 3);
  if (q >= 1) return 0;
  if (signedAmount(record) >= 0) {
    const t = THREE.MathUtils.smoothstep(q, 0, 1);
    return (1 - t) * (1 - t);
  }
  const edge = THREE.MathUtils.smoothstep(q, 0.32, 1);
  return 1 - edge;
}

function circleIntersectsBox(x, z, radius, box) {
  const closestX = THREE.MathUtils.clamp(x, box.min.x, box.max.x);
  const closestZ = THREE.MathUtils.clamp(z, box.min.z, box.max.z);
  return Math.hypot(x - closestX, z - closestZ) < radius;
}

function containsTop(box, x, z, margin = 0) {
  return x >= box.min.x + margin && x <= box.max.x - margin
    && z >= box.min.z + margin && z <= box.max.z - margin;
}

export function createBeachCollisionWorld(world) {
  const colliders = [];
  const terrainDepressions = [];
  let simHeightAt = null;
  world.dressing?.updateWorldMatrix?.(true, true);

  for (const palm of world.palms ?? []) {
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    palm.getWorldPosition(position);
    palm.getWorldScale(scale);
    colliders.push({
      kind: "palm",
      shape: "cylinder",
      x: position.x,
      z: position.z,
      radius: 0.34 * Math.max(scale.x, scale.z),
      minY: position.y - 0.05,
      maxY: position.y + 10.8 * scale.y,
    });
  }

  for (const object of world.dressing?.children ?? []) {
    const name = String(object.name || "").toLowerCase();
    if (!name.includes("rock") && !name.includes("driftwood")) continue;
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) colliders.push({
      kind: name.includes("driftwood") ? "wood" : "rock",
      shape: "box",
      box,
      minY: box.min.y,
      maxY: box.max.y,
    });
  }

  function overlaps(collider, x, z, radius = 0) {
    if (collider.shape === "cylinder") {
      return Math.hypot(x - collider.x, z - collider.z) < collider.radius + radius;
    }
    return circleIntersectsBox(x, z, radius, collider.box);
  }

  function blockedAt(x, z, feetY) {
    for (const collider of colliders) {
      if (collider.kind === "castle") continue;
      if (feetY > collider.maxY + STEP_CLEARANCE || feetY + 1.58 < collider.minY) continue;
      if (overlaps(collider, x, z, PLAYER_RADIUS)) return true;
    }
    return false;
  }

  function terrainSurfaceHeight(x, z) {
    if (simHeightAt) return simHeightAt(x, z);
    let offset = 0;
    for (const record of terrainDepressions) {
      if (!record) continue;
      const weight = editWeight(record, x, z);
      if (weight <= 0) continue;
      offset += signedAmount(record) * weight;
    }
    return terrainHeight(x, z) + offset;
  }

  function supportAt(x, z) {
    let height = terrainSurfaceHeight(x, z);
    let kind = "terrain";
    for (const collider of colliders) {
      // Palm trunks are walls, not walkable columns. Rock and driftwood tops
      // can support the player after a jump without snapping them upward from
      // ground level merely for approaching the object.
      if (collider.kind === "palm" || collider.kind === "castle" || collider.shape !== "box") continue;
      if (!containsTop(collider.box, x, z, 0.035)) continue;
      if (collider.maxY > height) {
        height = collider.maxY;
        kind = collider.kind;
      }
    }
    return { height, kind };
  }

  function propContact(x, y, z, radius = 0.055) {
    for (const collider of colliders) {
      if (y + radius < collider.minY || y - radius > collider.maxY) continue;
      if (collider.shape === "cylinder") {
        if (Math.hypot(x - collider.x, z - collider.z) <= collider.radius + radius) {
          return { kind: collider.kind, collider, x, y, z };
        }
        continue;
      }
      const box = collider.box;
      if (x >= box.min.x - radius && x <= box.max.x + radius
        && z >= box.min.z - radius && z <= box.max.z + radius) {
        return { kind: collider.kind, collider, x, y, z };
      }
    }
    return null;
  }

  function pointContact(x, y, z, radius = 0.055) {
    const prop = propContact(x, y, z, radius);
    if (prop) return prop;
    const groundY = terrainSurfaceHeight(x, z);
    if (y - radius <= groundY) return { kind: "terrain", collider: null, x, y: groundY, z };
    return null;
  }

  function raycastSurface(origin, direction, maxDistance = TOOL_AIM_DISTANCE, radius = 0.035) {
    const ox = Number(origin.x) || 0;
    const oy = Number(origin.y) || 0;
    const oz = Number(origin.z) || 0;
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const dx = direction.x / length;
    const dy = direction.y / length;
    const dz = direction.z / length;
    const range = Math.max(0.2, Number(maxDistance) || TOOL_AIM_DISTANCE);
    const steps = Math.max(1, Math.ceil(range / RAY_STEP));
    for (let index = 1; index <= steps; index += 1) {
      const t = Math.min(range, index * RAY_STEP);
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      const prop = propContact(x, y, z, radius);
      if (prop) return { ...prop, alpha: t / range };
      const groundY = terrainSurfaceHeight(x, z);
      if (y - radius <= groundY) {
        return { kind: "terrain", collider: null, x, y: groundY, z, alpha: t / range };
      }
    }
    return null;
  }

  function sweepPoint(from, to, radius = 0.055) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const stepLength = Math.max(0.018, radius * 0.6);
    const steps = Math.min(MAX_TOOL_SWEEP_STEPS, Math.max(1, Math.ceil(distance / stepLength)));
    for (let index = 0; index <= steps; index += 1) {
      const alpha = index / steps;
      const hit = pointContact(
        THREE.MathUtils.lerp(from.x, to.x, alpha),
        THREE.MathUtils.lerp(from.y, to.y, alpha),
        THREE.MathUtils.lerp(from.z, to.z, alpha),
        radius,
      );
      if (hit) return { ...hit, alpha };
    }
    return null;
  }

  return {
    colliders,
    groundHeightAt(x, z) {
      return supportAt(x, z).height;
    },
    surfaceAt(x, z) {
      return supportAt(x, z);
    },
    terrainHeightAt: terrainSurfaceHeight,
    attachTerrainSim(sim) {
      simHeightAt = typeof sim?.heightAt === "function" ? sim.heightAt : null;
    },
    setTerrainDepression(index, depression) {
      terrainDepressions[index] = depression ? { ...depression } : null;
    },
    pointContact,
    raycastSurface,
    sweepPoint,
    solidAt(x, z, radius = 0.05, ignoreKinds = null) {
      for (const collider of colliders) {
        if (ignoreKinds?.has?.(collider.kind)) continue;
        if (overlaps(collider, x, z, radius)) return collider;
      }
      return null;
    },
    canStampTerrain(x, z, radius = 0.22, ignoreKinds = null) {
      for (const collider of colliders) {
        if (ignoreKinds?.has?.(collider.kind)) continue;
        if (overlaps(collider, x, z, radius)) return false;
      }
      return true;
    },
    resolveMovement(fromX, fromZ, toX, toZ, feetY) {
      let x = fromX;
      let z = fromZ;
      // Axis-separated resolution naturally slides along rocks/logs instead
      // of cancelling the complete stride when only one axis is obstructed.
      if (!blockedAt(toX, z, feetY)) x = toX;
      if (!blockedAt(x, toZ, feetY)) z = toZ;
      return { x, z };
    },
  };
}
