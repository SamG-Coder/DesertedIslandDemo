import * as THREE from "three/webgpu";
import { WATER_LEVEL } from "./terrain.mjs";

const GRAIN_COUNT = 256;
const DUST_COUNT = 180;
const DROP_COUNT = 180;
const GRAVITY = 16.4;

export const DIG_BURST_PRESETS = Object.freeze({
  "dry-sand": Object.freeze({
    grains: 34,
    dust: 20,
    drops: 0,
    speed: 2.55,
    lift: 2.35,
    spread: 1.35,
    life: 0.7,
    gravity: 11.4,
    drag: 0.55,
    size: [0.016, 0.038],
    bounce: 0,
    grainColors: Object.freeze([0xf3ddb0, 0xe8c98a, 0xd4b06c, 0xc49a58, 0xefd7a0]),
    dustColors: Object.freeze([0xf0d7a4, 0xe2c48c, 0xd8b878]),
    dropColors: Object.freeze([0xf0d7a4]),
  }),
  "wet-sand": Object.freeze({
    grains: 16,
    dust: 5,
    drops: 12,
    speed: 1.42,
    lift: 1.22,
    spread: 0.7,
    life: 0.46,
    gravity: 18.2,
    drag: 2.4,
    size: [0.024, 0.056],
    bounce: 0,
    grainColors: Object.freeze([0x8a6240, 0x6f4c32, 0xa07850, 0x5c3c28, 0x7a5638]),
    dustColors: Object.freeze([0x9a7050, 0x7a5840]),
    dropColors: Object.freeze([0xc9e7f4, 0x9bcfe4, 0xe7f7ff]),
  }),
  "rocky-sand": Object.freeze({
    grains: 22,
    dust: 8,
    drops: 0,
    speed: 2.18,
    lift: 1.78,
    spread: 0.95,
    life: 0.56,
    gravity: 15.6,
    drag: 0.7,
    size: [0.015, 0.048],
    bounce: 1,
    grainColors: Object.freeze([0xd2b07a, 0x8a8680, 0x6c6964, 0xc4a66c, 0x4e4c48, 0xe8c98a]),
    dustColors: Object.freeze([0xddd6c8, 0xc9a66c]),
    dropColors: Object.freeze([0xddd6c8]),
  }),
  rock: Object.freeze({
    grains: 14,
    dust: 5,
    drops: 0,
    speed: 2.85,
    lift: 1.32,
    spread: 0.52,
    life: 0.42,
    gravity: 19.4,
    drag: 0.25,
    size: [0.012, 0.034],
    bounce: 1,
    grainColors: Object.freeze([0x9a9690, 0x6c6964, 0xc5c0b8, 0x4a4844, 0xb8b0a4]),
    dustColors: Object.freeze([0xd8d4ce, 0xb0aca6]),
    dropColors: Object.freeze([0xd8d4ce]),
  }),
  water: Object.freeze({
    grains: 0,
    dust: 0,
    drops: 28,
    speed: 1.85,
    lift: 3.05,
    spread: 1.28,
    life: 0.62,
    gravity: 12.6,
    drag: 0.9,
    size: [0.02, 0.04],
    bounce: 0,
    grainColors: Object.freeze([0x9ed3ea]),
    dustColors: Object.freeze([0xe7f7ff]),
    dropColors: Object.freeze([0xe7f7ff, 0xb7e4f4, 0x7fc5e0, 0xffffff]),
  }),
});

function pick(list, random) {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

function createSprayLayer(scene, { name, count, size, opacity, renderOrder }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  positions.fill(-1000);
  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  const material = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  points.renderOrder = renderOrder;
  points.userData.rtxIgnore = true;
  points.visible = false;
  scene.add(points);

  const state = Array.from({ length: count }, () => ({
    active: false,
    life: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    gravity: GRAVITY,
    drag: 0,
    floor: "ground",
  }));
  const color = new THREE.Color();
  let cursor = 0;
  let live = 0;

  function kill(index) {
    const particle = state[index];
    if (!particle.active) return;
    particle.active = false;
    particle.life = 0;
    live = Math.max(0, live - 1);
    positions[index * 3 + 1] = -1000;
    if (live === 0) points.visible = false;
  }

  return {
    get live() {
      return live;
    },
    emit(origin, forwardX, forwardZ, preset, colorList, random, floor, style) {
      const index = cursor;
      cursor = (cursor + 1) % count;
      const particle = state[index];
      if (!particle.active) live += 1;
      particle.active = true;
      particle.life = preset.life * (0.42 + random() * 0.72);
      particle.gravity = preset.gravity * (style === "drop" ? 0.72 : 0.84);
      particle.drag = preset.drag;
      particle.floor = floor;
      const along = random() * 1.35 - 0.22;
      const hang = style === "drop" ? 1.18 : 0.78;
      particle.vx = forwardX * preset.speed * along * 0.82 + (random() * 2 - 1) * preset.spread;
      particle.vy = preset.lift * hang * (0.65 + random() * 0.95);
      particle.vz = forwardZ * preset.speed * along * 0.82 + (random() * 2 - 1) * preset.spread;
      const offset = index * 3;
      positions[offset] = origin.x + (random() * 2 - 1) * 0.05;
      positions[offset + 1] = origin.y + 0.02 + random() * 0.04;
      positions[offset + 2] = origin.z + (random() * 2 - 1) * 0.05;
      color.set(pick(colorList, random));
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
      points.visible = true;
      positionAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    },
    update(dt, collisionWorld) {
      if (live <= 0) return;
      for (let index = 0; index < count; index += 1) {
        const particle = state[index];
        if (!particle.active) continue;
        particle.life -= dt;
        const offset = index * 3;
        const damp = Math.max(0, 1 - particle.drag * dt);
        particle.vx *= damp;
        particle.vz *= damp;
        particle.vy -= particle.gravity * dt;
        positions[offset] += particle.vx * dt;
        positions[offset + 1] += particle.vy * dt;
        positions[offset + 2] += particle.vz * dt;
        const floorY = particle.floor === "water"
          ? WATER_LEVEL
          : collisionWorld?.groundHeightAt?.(positions[offset], positions[offset + 2])
            ?? positions[offset + 1] - 1;
        if (particle.life <= 0 || positions[offset + 1] <= floorY) kill(index);
      }
      positionAttr.needsUpdate = true;
    },
    dispose() {
      scene.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createDigBurstSystem(scene, collisionWorld, random = Math.random) {
  const grainGeometry = new THREE.IcosahedronGeometry(1, 0);
  const grainMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8c98a,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.28,
    toneMapped: true,
  });
  const grains = new THREE.InstancedMesh(grainGeometry, grainMaterial, GRAIN_COUNT);
  grains.name = "Shovel dig grain bursts";
  grains.frustumCulled = false;
  grains.renderOrder = 8;
  grains.castShadow = false;
  grains.receiveShadow = false;
  grains.visible = false;
  grains.userData.rtxIgnore = true;
  grains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const euler = new THREE.Euler();
  const spin = new THREE.Quaternion();
  const grainState = Array.from({ length: GRAIN_COUNT }, () => ({
    active: false,
    life: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spinX: 0,
    spinY: 0,
    spinZ: 0,
    bounce: 0,
    maxBounce: 0,
    gravity: GRAVITY,
    drag: 0,
    floor: "ground",
  }));

  for (let index = 0; index < GRAIN_COUNT; index += 1) {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    grains.setMatrixAt(index, dummy.matrix);
    grains.setColorAt(index, color.setRGB(0, 0, 0));
  }
  if (grains.instanceColor) grains.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(grains);

  const dust = createSprayLayer(scene, {
    name: "Shovel dig dust",
    count: DUST_COUNT,
    size: 0.046,
    opacity: 0.7,
    renderOrder: 30,
  });
  const drops = createSprayLayer(scene, {
    name: "Shovel dig droplets",
    count: DROP_COUNT,
    size: 0.072,
    opacity: 0.88,
    renderOrder: 31,
  });

  let grainCursor = 0;
  let grainsLive = 0;

  function killGrain(index) {
    const particle = grainState[index];
    if (!particle.active) return;
    particle.active = false;
    particle.life = 0;
    grainsLive = Math.max(0, grainsLive - 1);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    grains.setMatrixAt(index, dummy.matrix);
    if (grainsLive === 0) grains.visible = false;
  }

  function emitGrain(origin, forwardX, forwardZ, preset, floor) {
    const index = grainCursor;
    grainCursor = (grainCursor + 1) % GRAIN_COUNT;
    const particle = grainState[index];
    if (!particle.active) grainsLive += 1;
    particle.active = true;
    particle.life = preset.life * (0.72 + random() * 0.5);
    particle.gravity = preset.gravity;
    particle.drag = preset.drag;
    particle.bounce = 0;
    particle.maxBounce = preset.bounce;
    particle.floor = floor;
    const toward = random() < 0.22 ? -0.48 : 1;
    const side = random() * 2 - 1;
    const along = 0.22 + random();
    particle.vx = forwardX * preset.speed * along * toward + side * preset.spread * (random() * 0.7 + 0.3);
    particle.vy = preset.lift * (0.45 + random() * 0.85);
    particle.vz = forwardZ * preset.speed * along * toward + (random() * 2 - 1) * preset.spread * 0.65;
    particle.spinX = (random() * 2 - 1) * 10;
    particle.spinY = (random() * 2 - 1) * 12;
    particle.spinZ = (random() * 2 - 1) * 9;
    dummy.position.set(
      origin.x + (random() * 2 - 1) * 0.07,
      origin.y + random() * 0.05,
      origin.z + (random() * 2 - 1) * 0.07,
    );
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    const size = preset.size[0] + random() * (preset.size[1] - preset.size[0]);
    dummy.scale.set(size, size * (0.55 + random() * 0.7), size * (0.65 + random() * 0.55));
    dummy.updateMatrix();
    grains.setMatrixAt(index, dummy.matrix);
    grains.setColorAt(index, color.set(pick(preset.grainColors, random)));
    grains.visible = true;
  }

  return {
    get live() {
      return { grains: grainsLive, dust: dust.live, drops: drops.live };
    },
    spawn(hit, kind = "dry-sand") {
      const preset = DIG_BURST_PRESETS[kind] ?? DIG_BURST_PRESETS["dry-sand"];
      const floor = kind === "water" ? "water" : "ground";
      const hitY = Number(hit.y) || 0;
      const origin = {
        x: Number(hit.x) || 0,
        y: kind === "water" ? Math.max(hitY, WATER_LEVEL) + 0.04 : hitY + 0.045,
        z: Number(hit.z) || 0,
      };
      let forwardX = Number(hit.forwardX) || 0;
      let forwardZ = Number(hit.forwardZ) || 1;
      const length = Math.hypot(forwardX, forwardZ) || 1;
      forwardX /= length;
      forwardZ /= length;
      for (let i = 0; i < preset.grains; i += 1) emitGrain(origin, forwardX, forwardZ, preset, floor);
      for (let i = 0; i < preset.dust; i += 1) {
        dust.emit(origin, forwardX, forwardZ, preset, preset.dustColors, random, floor, "dust");
      }
      for (let i = 0; i < preset.drops; i += 1) {
        drops.emit(origin, forwardX, forwardZ, preset, preset.dropColors, random, floor, "drop");
      }
      grains.instanceMatrix.needsUpdate = true;
      if (grains.instanceColor) grains.instanceColor.needsUpdate = true;
    },
    update(dt) {
      const delta = Math.min(0.05, Math.max(0, Number(dt) || 0));
      if (grainsLive > 0) {
        for (let index = 0; index < GRAIN_COUNT; index += 1) {
          const particle = grainState[index];
          if (!particle.active) continue;
          particle.life -= delta;
          grains.getMatrixAt(index, dummy.matrix);
          dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
          const damp = Math.max(0, 1 - particle.drag * delta);
          particle.vx *= damp;
          particle.vz *= damp;
          particle.vy -= particle.gravity * delta;
          dummy.position.x += particle.vx * delta;
          dummy.position.y += particle.vy * delta;
          dummy.position.z += particle.vz * delta;
          const floorY = particle.floor === "water"
            ? WATER_LEVEL
            : collisionWorld?.groundHeightAt?.(dummy.position.x, dummy.position.z)
              ?? dummy.position.y - 1;
          if (dummy.position.y <= floorY + 0.008) {
            if (particle.bounce < particle.maxBounce && particle.vy < -0.4) {
              dummy.position.y = floorY + 0.01;
              particle.vy *= -0.32;
              particle.vx *= 0.55;
              particle.vz *= 0.55;
              particle.bounce += 1;
            } else {
              killGrain(index);
              continue;
            }
          }
          if (particle.life <= 0) {
            killGrain(index);
            continue;
          }
          euler.set(particle.spinX * delta, particle.spinY * delta, particle.spinZ * delta);
          dummy.quaternion.multiply(spin.setFromEuler(euler));
          dummy.updateMatrix();
          grains.setMatrixAt(index, dummy.matrix);
        }
        grains.instanceMatrix.needsUpdate = true;
      }
      dust.update(delta, collisionWorld);
      drops.update(delta, collisionWorld);
    },
    dispose() {
      scene.remove(grains);
      grainGeometry.dispose();
      grainMaterial.dispose();
      dust.dispose();
      drops.dispose();
    },
  };
}
