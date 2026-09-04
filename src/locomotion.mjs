export const MAX_WALK_ANGLE = 38 * Math.PI / 180;
export const STEP_HEIGHT = 0.12;
export const SLIDE_ACCEL = 18;

const EPS = 1e-8;
const MAX_DT = 0.05;
const MAX_TAN_ANGLE = Math.PI / 2 - 0.05;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unitXZ(x, z) {
  const length = Math.hypot(x, z);
  if (length < 1e-5) return { x: 0, z: 0, length: 0 };
  return { x: x / length, z: z / length, length };
}

export function sampleSlope(heightAt, x, z, epsilon = 0.18) {
  const e = Math.max(1e-6, finite(epsilon, 0.18));
  const px = finite(x);
  const pz = finite(z);
  const height = finite(heightAt(px, pz));
  const dhdx = (finite(heightAt(px + e, pz)) - finite(heightAt(px - e, pz))) / (2 * e);
  const dhdz = (finite(heightAt(px, pz + e)) - finite(heightAt(px, pz - e))) / (2 * e);
  let nx = -dhdx;
  let ny = 1;
  let nz = -dhdz;
  const inverse = 1 / (Math.hypot(nx, ny, nz) || 1);
  nx *= inverse;
  ny *= inverse;
  nz *= inverse;
  return {
    angle: Math.acos(clamp(ny, -1, 1)),
    nx,
    ny,
    nz,
    height,
  };
}

export function projectWishOnGround(wishX, wishZ, nx, ny, nz) {
  const wx = finite(wishX);
  const wy = 0;
  const wz = finite(wishZ);
  const gx = finite(nx);
  const gy = finite(ny);
  const gz = finite(nz);
  const dot = gx * wx + gy * wy + gz * wz;
  return {
    x: wx - gx * dot,
    z: wz - gz * dot,
  };
}

export function shouldSlide(angle, maxWalkAngle = MAX_WALK_ANGLE) {
  return finite(angle) > finite(maxWalkAngle, MAX_WALK_ANGLE);
}

export function slideAcceleration(nx, ny, nz, gravity = SLIDE_ACCEL) {
  const angle = Math.acos(clamp(finite(ny), -1, 1));
  const horiz = Math.hypot(finite(nx), finite(nz));
  if (horiz < EPS) return { x: 0, z: 0 };
  const mag = finite(gravity, SLIDE_ACCEL) * Math.sin(angle);
  return { x: (nx / horiz) * mag, z: (nz / horiz) * mag };
}

function followAllowance(stepHeight, angle, maxWalkAngle, stride) {
  const theta = clamp(
    finite(angle),
    0,
    Math.min(finite(maxWalkAngle, MAX_WALK_ANGLE), MAX_TAN_ANGLE),
  );
  return finite(stepHeight, STEP_HEIGHT) + Math.tan(theta) * stride;
}

function canStepTo(heightAt, feetY, fromX, fromZ, toX, toZ, stepHeight, angle, maxWalkAngle) {
  const rise = finite(heightAt(toX, toZ)) - feetY;
  if (rise <= stepHeight) return true;
  const stride = Math.hypot(toX - fromX, toZ - fromZ);
  return rise <= followAllowance(stepHeight, angle, maxWalkAngle, stride);
}

function applyCollide(collide, x, z, feetY, nextX, nextZ) {
  if (typeof collide !== "function") return { x: nextX, z: nextZ };
  const resolved = collide(x, z, feetY, nextX, nextZ);
  if (!resolved || !Number.isFinite(resolved.x) || !Number.isFinite(resolved.z)) {
    return { x: nextX, z: nextZ };
  }
  return { x: resolved.x, z: resolved.z };
}

function resolvePlanarMove(
  x,
  z,
  nextX,
  nextZ,
  feetY,
  heightAt,
  collide,
  stepHeight,
  angle,
  maxWalkAngle,
) {
  const attempt = (fromX, fromZ, toX, toZ) => applyCollide(collide, fromX, fromZ, feetY, toX, toZ);
  const allowed = (fromX, fromZ, toX, toZ) =>
    canStepTo(heightAt, feetY, fromX, fromZ, toX, toZ, stepHeight, angle, maxWalkAngle);

  const full = attempt(x, z, nextX, nextZ);
  if (allowed(x, z, full.x, full.z)) return full;

  const onlyX = attempt(x, z, nextX, z);
  const onlyZ = attempt(x, z, x, nextZ);
  const okX = allowed(x, z, onlyX.x, onlyX.z);
  const okZ = allowed(x, z, onlyZ.x, onlyZ.z);
  if (okX) {
    const thenZ = attempt(onlyX.x, onlyX.z, onlyX.x, nextZ);
    if (allowed(x, z, thenZ.x, thenZ.z)) return thenZ;
    return onlyX;
  }
  if (okZ) {
    const thenX = attempt(onlyZ.x, onlyZ.z, nextX, onlyZ.z);
    if (allowed(x, z, thenX.x, thenX.z)) return thenX;
    return onlyZ;
  }
  return { x, z };
}

function walkVelocity(wishX, wishZ, nx, ny, nz, speed) {
  const wish = unitXZ(wishX, wishZ);
  if (wish.length === 0 || !(speed > 0)) return { x: 0, z: 0 };
  const tangent = projectWishOnGround(wish.x, wish.z, nx, ny, nz);
  const ty = -finite(ny) * (finite(nx) * wish.x + finite(nz) * wish.z);
  const length = Math.hypot(tangent.x, ty, tangent.z);
  if (length < EPS) return { x: 0, z: 0 };
  return { x: tangent.x / length * speed, z: tangent.z / length * speed };
}

function stripUphillWish(wishX, wishZ, nx, nz) {
  const down = unitXZ(nx, nz);
  if (down.length === 0) return { x: wishX, z: wishZ };
  const along = wishX * down.x + wishZ * down.z;
  if (along >= 0) return { x: wishX, z: wishZ };
  return { x: wishX - along * down.x, z: wishZ - along * down.z };
}

export function groundedMove({
  x = 0,
  z = 0,
  y = 0,
  eyeHeight = 0,
  verticalVelocity = 0,
  grounded = false,
  wishX = 0,
  wishZ = 0,
  speed = 0,
  dt = 0,
  heightAt,
  collide,
  maxWalkAngle = MAX_WALK_ANGLE,
  stepHeight = STEP_HEIGHT,
  gravity = SLIDE_ACCEL,
  vx = 0,
  vz = 0,
} = {}) {
  const delta = clamp(finite(dt), 0, MAX_DT);
  const walkAngle = finite(maxWalkAngle, MAX_WALK_ANGLE);
  const step = finite(stepHeight, STEP_HEIGHT);
  const g = finite(gravity, SLIDE_ACCEL);
  const eye = finite(eyeHeight);
  const startX = finite(x);
  const startZ = finite(z);
  const startY = finite(y);
  let velX = finite(vx);
  let velZ = finite(vz);
  let vy = finite(verticalVelocity);
  let onGround = Boolean(grounded);
  const wishSpeed = Math.max(0, finite(speed));
  const slope = sampleSlope(heightAt, startX, startZ);
  const feetY = startY - eye;
  const sliding = onGround && shouldSlide(slope.angle, walkAngle);

  let moveX = 0;
  let moveZ = 0;
  if (onGround && !sliding) {
    const walk = walkVelocity(wishX, wishZ, slope.nx, slope.ny, slope.nz, wishSpeed);
    velX = walk.x;
    velZ = walk.z;
    moveX = velX;
    moveZ = velZ;
  } else if (sliding) {
    const accel = slideAcceleration(slope.nx, slope.ny, slope.nz, g);
    velX += accel.x * delta;
    velZ += accel.z * delta;
    moveX = velX;
    moveZ = velZ;
    const wish = unitXZ(wishX, wishZ);
    if (wish.length > 0 && wishSpeed > 0) {
      const control = stripUphillWish(wish.x * wishSpeed, wish.z * wishSpeed, slope.nx, slope.nz);
      moveX += control.x;
      moveZ += control.z;
    }
  } else {
    const wish = unitXZ(wishX, wishZ);
    if (wish.length > 0 && wishSpeed > 0) {
      velX = wish.x * wishSpeed;
      velZ = wish.z * wishSpeed;
    }
    moveX = velX;
    moveZ = velZ;
  }

  const resolved = resolvePlanarMove(
    startX,
    startZ,
    startX + moveX * delta,
    startZ + moveZ * delta,
    feetY,
    heightAt,
    collide,
    step,
    slope.angle,
    walkAngle,
  );
  let px = resolved.x;
  let pz = resolved.z;
  if (delta > 0) {
    if (Math.abs(px - startX) < EPS) velX = 0;
    if (Math.abs(pz - startZ) < EPS) velZ = 0;
  }

  const destSlope = sampleSlope(heightAt, px, pz);
  const floorY = destSlope.height + eye;
  const stride = Math.hypot(px - startX, pz - startZ);
  const follow = followAllowance(step, slope.angle, walkAngle, stride);
  const rise = destSlope.height - feetY;
  const drop = feetY - destSlope.height;
  let py = startY;

  if (vy > 0) onGround = false;

  if (onGround && vy <= 0) {
    if (rise > step && rise > follow) {
      px = startX;
      pz = startZ;
      velX = 0;
      velZ = 0;
      py = startY;
      vy = 0;
    } else if (
      drop > step
      && drop > follow
      && !sliding
      && !shouldSlide(destSlope.angle, walkAngle)
    ) {
      onGround = false;
    } else {
      py = floorY;
      vy = 0;
    }
  }

  if (!onGround) {
    vy -= g * delta;
    py += vy * delta;
    const landY = finite(heightAt(px, pz)) + eye;
    if (py <= landY && vy <= 0) {
      py = landY;
      vy = 0;
      onGround = true;
    }
  }

  const moved = Math.hypot(px - startX, pz - startZ);
  const slopeAngle = sampleSlope(heightAt, px, pz).angle;
  return {
    x: px,
    y: py,
    z: pz,
    verticalVelocity: vy,
    grounded: onGround,
    vx: velX,
    vz: velZ,
    speed: delta > 0 ? moved / delta : 0,
    slopeAngle,
  };
}
