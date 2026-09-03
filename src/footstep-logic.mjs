export const FOOTSTEP_SURFACES = Object.freeze([
  "dry-sand",
  "wet-sand",
  "shallow-water",
  "rock",
  "wood",
]);

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function smoothstep(edge0, edge1, value) {
  const span = Number(edge1) - Number(edge0);
  if (Math.abs(span) < 1e-8) return Number(value) >= Number(edge1) ? 1 : 0;
  const t = clamp01((Number(value) - Number(edge0)) / span);
  return t * t * (3 - 2 * t);
}

export function classifyBeachSurface({
  groundHeight,
  waterLevel,
  wetness = 0,
  objectKind = null,
}) {
  if (objectKind === "wood") return "wood";
  if (objectKind === "rock") return "rock";
  const depth = Number(waterLevel) - Number(groundHeight);
  if (depth > 0.055) return "shallow-water";
  if (depth > -0.045 || Number(wetness) > 0.2) return "wet-sand";
  return "dry-sand";
}

/** Matches the pebble-hash band in the terrain shader. */
export function pebbleCoverageAt(z) {
  return clamp01(smoothstep(-0.5, 8.5, z) * (1 - smoothstep(13, 26, z)));
}

export function classifyDigBurst({
  kind = "terrain",
  surface = "dry-sand",
  z = 0,
} = {}) {
  if (kind === "rock") return "rock";
  if (surface === "shallow-water") return "water";
  if (surface === "wet-sand") return "wet-sand";
  if (pebbleCoverageAt(z) > 0.35) return "rocky-sand";
  return "dry-sand";
}

export function createStrideTracker(x = 0, z = 0) {
  return {
    previousX: Number(x) || 0,
    previousZ: Number(z) || 0,
    distance: 0.38,
    leftFoot: true,
  };
}

export function footprintFacing(yaw) {
  const angle = Number(yaw) || 0;
  return {
    directionX: -Math.sin(angle),
    directionZ: -Math.cos(angle),
  };
}

export function advanceStride(tracker, x, z, speed) {
  const nextX = Number(x) || 0;
  const nextZ = Number(z) || 0;
  const dx = nextX - tracker.previousX;
  const dz = nextZ - tracker.previousZ;
  const travelled = Math.hypot(dx, dz);
  tracker.previousX = nextX;
  tracker.previousZ = nextZ;
  if (travelled > 2.5 || Number(speed) < 0.08) return null;
  tracker.distance += travelled;
  const stride = Number(speed) > 4.35 ? 1.12 : 0.78;
  if (tracker.distance < stride) return null;
  tracker.distance %= stride;
  const event = {
    x: nextX,
    z: nextZ,
    directionX: dx / Math.max(1e-6, travelled),
    directionZ: dz / Math.max(1e-6, travelled),
    leftFoot: tracker.leftFoot,
    intensity: Math.min(1, 0.48 + Number(speed) / 8.5),
  };
  tracker.leftFoot = !tracker.leftFoot;
  return event;
}
