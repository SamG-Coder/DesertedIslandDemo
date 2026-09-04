import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_WALK_ANGLE,
  SLIDE_ACCEL,
  STEP_HEIGHT,
  groundedMove,
  projectWishOnGround,
  sampleSlope,
  shouldSlide,
  slideAcceleration,
} from "../src/locomotion.mjs";

function plane(dhdx, dhdz = 0, base = 0) {
  return (x, z) => base + dhdx * x + dhdz * z;
}

function stepWall(height = 2, atX = 0.4) {
  return (x) => (x >= atX ? height : 0);
}

function move(overrides) {
  const heightAt = overrides.heightAt ?? plane(0);
  const eyeHeight = overrides.eyeHeight ?? 1.64;
  const x = overrides.x ?? 0;
  const z = overrides.z ?? 0;
  return groundedMove({
    x,
    z,
    y: overrides.y ?? heightAt(x, z) + eyeHeight,
    eyeHeight,
    verticalVelocity: 0,
    grounded: true,
    wishX: 0,
    wishZ: 0,
    speed: 3.25,
    dt: 0.05,
    gravity: 14.8,
    ...overrides,
    heightAt,
  });
}

test("sampleSlope recovers the unit normal and tilt of a height plane", () => {
  const slope = sampleSlope(plane(0.5), 0, 0);
  const length = Math.hypot(slope.nx, slope.ny, slope.nz);
  assert.ok(Math.abs(length - 1) < 1e-9);
  assert.ok(Math.abs(slope.angle - Math.atan(0.5)) < 1e-6);
  assert.ok(slope.nx < 0);
  assert.ok(slope.ny > 0.8);
  assert.equal(slope.height, 0);
});

test("projectWishOnGround keeps contour motion and shortens upslope xz", () => {
  const slope = sampleSlope(plane(0.5), 0, 0);
  const along = projectWishOnGround(0, 1, slope.nx, slope.ny, slope.nz);
  assert.ok(Math.abs(along.x) < 1e-9);
  assert.ok(Math.abs(along.z - 1) < 1e-9);
  const up = projectWishOnGround(1, 0, slope.nx, slope.ny, slope.nz);
  assert.ok(up.x > 0 && up.x < 1);
  assert.ok(Math.abs(up.z) < 1e-9);
});

test("shouldSlide uses MAX_WALK_ANGLE and slideAcceleration points downslope", () => {
  assert.equal(shouldSlide(MAX_WALK_ANGLE), false);
  assert.equal(shouldSlide(MAX_WALK_ANGLE + 0.01), true);
  const slope = sampleSlope(plane(2), 0, 0);
  assert.equal(shouldSlide(slope.angle), true);
  const accel = slideAcceleration(slope.nx, slope.ny, slope.nz, 10);
  assert.ok(accel.x < 0);
  assert.ok(Math.abs(accel.z) < 1e-9);
  const mag = Math.hypot(accel.x, accel.z);
  assert.ok(Math.abs(mag - 10 * Math.sin(slope.angle)) < 1e-6);
});

test("walkable ground follows a projected wish and stays at eye height", () => {
  const heightAt = plane(0.2);
  const state = move({ heightAt, wishX: 1, x: 0, z: 0, dt: 0.05 });
  assert.ok(state.x > 0);
  assert.equal(state.z, 0);
  assert.ok(Math.abs(state.y - (heightAt(state.x, state.z) + 1.64)) < 1e-9);
  assert.equal(state.grounded, true);
  assert.ok(state.slopeAngle < MAX_WALK_ANGLE);
});

test("steep walls do not snap the eye up and block that axis", () => {
  const heightAt = stepWall(2, 0.15);
  const state = move({ heightAt, wishX: 1, x: 0, z: 0, dt: 0.05, speed: 4 });
  assert.ok(state.x < 0.15);
  assert.ok(state.y < 1.64 + STEP_HEIGHT + 1e-6);
  assert.equal(state.grounded, true);
});

test("a curb within STEP_HEIGHT is walkable", () => {
  const heightAt = stepWall(0.1, 0.05);
  const state = move({ heightAt, wishX: 1, x: 0, dt: 0.05, speed: 3.25 });
  assert.ok(state.x > 0.05);
  assert.ok(Math.abs(state.y - (0.1 + 1.64)) < 1e-9);
});

test("steep slopes ignore uphill wish and accelerate downslope", () => {
  const heightAt = plane(2);
  const up = move({
    heightAt, wishX: 1, x: 0, vx: 0, vz: 0, dt: 0.05, gravity: 14.8, speed: 3.25,
  });
  assert.ok(up.x < 0, "uphill wish is ignored so gravity can pull downslope");
  assert.ok(up.vx < 0);
  const still = move({
    heightAt, wishX: 0, x: 0, vx: 0, vz: 0, dt: 0.05, gravity: 14.8, speed: 0,
  });
  assert.ok(still.x < 0);
  assert.ok(still.vx < 0);
});

test("gravity integrates while airborne and lands when y meets the floor", () => {
  const heightAt = plane(0);
  let state = {
    x: 0, z: 0, y: 4, eyeHeight: 1.64, verticalVelocity: 0, grounded: false,
    wishX: 0, wishZ: 0, speed: 0, dt: 1 / 60, heightAt, gravity: 14.8, vx: 0, vz: 0,
  };
  for (let i = 0; i < 180; i += 1) {
    state = { ...state, ...groundedMove(state) };
  }
  assert.equal(state.grounded, true);
  assert.equal(state.verticalVelocity, 0);
  assert.ok(Math.abs(state.y - 1.64) < 1e-6);
});

test("dt is clamped and collide can block a single axis", () => {
  const heightAt = plane(0);
  const far = move({ heightAt, wishX: 1, dt: 4, speed: 3.25 });
  const cap = move({ heightAt, wishX: 1, dt: 0.05, speed: 3.25 });
  assert.ok(Math.abs(far.x - cap.x) < 1e-9);
  const collided = move({
    heightAt,
    wishX: 1,
    wishZ: 1,
    dt: 0.05,
    collide(x, z, feetY, nextX, nextZ) {
      return { x, z: nextZ };
    },
  });
  assert.equal(collided.x, 0);
  assert.ok(collided.z > 0);
});

test("walking off a ledge leaves the ground instead of snapping down", () => {
  const heightAt = (x) => (x >= 0.2 ? -3 : 0);
  const state = move({ heightAt, wishX: 1, x: 0, dt: 0.05, speed: 8 });
  assert.equal(state.grounded, false);
  assert.ok(state.y > -3 + 1.64 + 1);
});

test("too-high walls block only the colliding axis", () => {
  const heightAt = (x) => (x >= 0.15 ? 2 : 0);
  const state = move({ heightAt, wishX: 1, wishZ: 1, x: 0, z: 0, dt: 0.05, speed: 4 });
  assert.ok(state.x < 0.15);
  assert.ok(state.z > 0);
});

test("upward vertical velocity leaves the ground instead of snapping to the floor", () => {
  const state = move({
    heightAt: plane(0),
    verticalVelocity: 5.25,
    grounded: true,
    wishX: 0,
    dt: 0.016,
  });
  assert.equal(state.grounded, false);
  assert.ok(state.y > 1.64);
  assert.ok(state.verticalVelocity < 5.25);
});

test("module stays CPU-only", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const source = await readFile(fileURLToPath(new URL("../src/locomotion.mjs", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /three/i);
});
