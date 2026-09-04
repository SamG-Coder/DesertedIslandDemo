export const SCOOP_VOLUME_HEIGHT = 0.16; // matches current DIG_DEPTH
export const SHOVEL_RADIUS_X = 0.2;
export const SHOVEL_RADIUS_Z = 0.26;
export const SHOVEL_STAMP_RADIUS = Math.max(SHOVEL_RADIUS_X, SHOVEL_RADIUS_Z);

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

export function shovelKernelWeight(localX, localZ, radiusX, radiusZ, peaked) {
  const rx = Math.max(1e-4, Number(radiusX) || 0);
  const rz = Math.max(1e-4, Number(radiusZ) || 0);
  const q = Math.pow(Math.abs(Number(localX) / rx), 3)
    + Math.pow(Math.abs(Number(localZ) / rz), 3);
  if (!(q < 1)) return 0;
  if (peaked) {
    const t = 1 - smoothstep(0, 1, q);
    return t * t;
  }
  return 1 - smoothstep(0.32, 1, q);
}

export function stampDig(field, hit) {
  return field.stamp(hit.x, hit.z, {
    amount: -SCOOP_VOLUME_HEIGHT,
    radiusX: SHOVEL_RADIUS_X,
    radiusZ: SHOVEL_RADIUS_Z,
    forwardX: hit.forwardX,
    forwardZ: hit.forwardZ,
    peaked: false,
    wetness: 0,
  });
}

export function stampDump(field, hit, { wetness = 0 } = {}) {
  return field.stamp(hit.x, hit.z, {
    amount: SCOOP_VOLUME_HEIGHT,
    radiusX: SHOVEL_RADIUS_X,
    radiusZ: SHOVEL_RADIUS_Z,
    forwardX: hit.forwardX,
    forwardZ: hit.forwardZ,
    peaked: true,
    wetness,
  });
}
