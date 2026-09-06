import * as THREE from "three/webgpu";
import { GRAVITY } from "./first-person.mjs";

const MAX_PIECES = 36;
const MAX_CHIPS = 64;
const CHIP_LIFE = 1.15;

const _axis = new THREE.Vector3();
const _box = new THREE.Box3();

function triangleIndex(geometry, triangle, corner) {
  const index = geometry.getIndex();
  const slot = triangle * 3 + corner;
  return index ? index.getX(slot) : slot;
}

export function extractTrianglesByLocalY(geometry, minY, maxY) {
  if (!geometry) return null;
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) return null;
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const index = geometry.getIndex();
  const triangleCount = Math.floor((index ? index.count : position.count) / 3);
  const positions = [];
  const normals = [];
  const uvs = [];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = triangleIndex(geometry, triangle, 0);
    const b = triangleIndex(geometry, triangle, 1);
    const c = triangleIndex(geometry, triangle, 2);
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    if (y < minY || y >= maxY) continue;
    for (const vertex of [a, b, c]) {
      positions.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      if (normal) normals.push(normal.getX(vertex), normal.getY(vertex), normal.getZ(vertex));
      if (uv) uvs.push(uv.getX(vertex), uv.getY(vertex));
    }
  }
  if (positions.length < 9) return null;
  const extracted = new THREE.BufferGeometry();
  extracted.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length === positions.length) {
    extracted.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  } else {
    extracted.computeVertexNormals();
  }
  if (uvs.length === (positions.length / 3) * 2) {
    extracted.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  }
  extracted.computeBoundingBox();
  extracted.computeBoundingSphere();
  return extracted;
}

function copyWorldTransform(source, target) {
  source.updateWorldMatrix(true, false);
  source.matrixWorld.decompose(target.position, target.quaternion, target.scale);
}

function worldMesh(source, geometry = source.geometry) {
  const mesh = new THREE.Mesh(geometry, source.material);
  mesh.name = `${source.name || "Palm"} debris`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rtxIgnore = true;
  copyWorldTransform(source, mesh);
  return mesh;
}

function ignoreRayTracing(object) {
  object.userData.rtxIgnore = true;
  object.traverse?.(child => {
    child.userData.rtxIgnore = true;
  });
}

export function markPalmDynamic(palm) {
  ignoreRayTracing(palm);
  return palm;
}

function disposeMesh(mesh) {
  mesh.removeFromParent();
  if (mesh.userData.ownsGeometry) mesh.geometry?.dispose?.();
}

export function createPalmDebrisSystem(scene, collisionWorld) {
  const pieces = [];
  const chipGeometry = new THREE.BoxGeometry(1, 1, 1);
  const chipMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c3a22,
    roughness: 0.92,
    metalness: 0,
  });
  chipMaterial.userData.rtxIgnore = true;
  const chips = new THREE.InstancedMesh(chipGeometry, chipMaterial, MAX_CHIPS);
  chips.name = "Palm chop chips";
  chips.userData.rtxIgnore = true;
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chips.count = 0;
  chips.frustumCulled = false;
  scene.add(chips);
  const chipStates = [];
  const dummy = new THREE.Object3D();

  function groundAt(x, z) {
    return collisionWorld?.groundHeightAt?.(x, z) ?? 0;
  }

  function prunePieces() {
    while (pieces.length > MAX_PIECES) {
      const oldest = pieces.find(piece => piece.settled) ?? pieces[0];
      disposeMesh(oldest.mesh);
      pieces.splice(pieces.indexOf(oldest), 1);
    }
  }

  function launch(mesh, options) {
    scene.add(mesh);
    pieces.push({
      mesh,
      vx: options.vx,
      vy: options.vy,
      vz: options.vz,
      wx: options.wx,
      wy: options.wy,
      wz: options.wz,
      drag: options.drag,
      bounce: options.bounce,
      settled: false,
    });
    prunePieces();
  }

  function sprayChips(origin, direction) {
    const length = Math.hypot(direction.x, direction.z) || 1;
    const nx = direction.x / length;
    const nz = direction.z / length;
    for (let index = 0; index < 8; index += 1) {
      if (chipStates.length >= MAX_CHIPS) chipStates.shift();
      const spread = (Math.random() - 0.5) * 2.4;
      chipStates.push({
        x: origin.x,
        y: origin.y + 0.12,
        z: origin.z,
        vx: nx * (1.2 + Math.random() * 2.4) + (Math.random() - 0.5) * 1.6,
        vy: 1.8 + Math.random() * 3.2,
        vz: nz * (1.2 + Math.random() * 2.4) + (Math.random() - 0.5) * 1.6,
        wx: spread,
        wy: (Math.random() - 0.5) * 8,
        wz: spread,
        life: CHIP_LIFE * (0.65 + Math.random() * 0.5),
        size: 0.03 + Math.random() * 0.05,
        age: 0,
      });
    }
  }

  function launchMesh(source, direction, style) {
    const mesh = worldMesh(source);
    const length = Math.hypot(direction.x, direction.z) || 1;
    const nx = direction.x / length;
    const nz = direction.z / length;
    const lateral = (Math.random() - 0.5);
    launch(mesh, {
      vx: nx * style.speed + lateral * style.spread,
      vy: style.lift,
      vz: nz * style.speed - lateral * style.spread,
      wx: -nz * style.spin + (Math.random() - 0.5) * 1.4,
      wy: (Math.random() - 0.5) * style.spin,
      wz: nx * style.spin + (Math.random() - 0.5) * 1.4,
      drag: style.drag,
      bounce: style.bounce,
    });
  }

  function splitTrunk(source) {
    const geometry = source.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const minY = geometry.boundingBox.min.y;
    const maxY = geometry.boundingBox.max.y;
    const span = Math.max(0.2, maxY - minY);
    const stumpCut = minY + span * 0.14;
    const midCut = minY + span * 0.52;
    const stumpGeometry = extractTrianglesByLocalY(geometry, minY - 1, stumpCut);
    if (stumpGeometry) {
      const stump = worldMesh(source, stumpGeometry);
      stump.name = "Palm stump";
      stump.userData.ownsGeometry = true;
      scene.add(stump);
    }
    const lower = extractTrianglesByLocalY(geometry, stumpCut, midCut);
    const upper = extractTrianglesByLocalY(geometry, midCut, maxY + 1);
    return [lower, upper].filter(Boolean).map(part => {
      const mesh = worldMesh(source, part);
      mesh.userData.ownsGeometry = true;
      return mesh;
    });
  }

  return {
    impact(hit) {
      if (!hit) return;
      const direction = {
        x: Number(hit.directionX) || 0,
        z: Number(hit.directionZ) || 1,
      };
      sprayChips({
        x: Number(hit.x) || 0,
        y: Number(hit.y) || 0,
        z: Number(hit.z) || 0,
      }, direction);
    },
    fell(hit) {
      const object = hit?.object;
      if (!object) return;
      object.updateWorldMatrix(true, true);
      const direction = {
        x: Number(hit.directionX) || 0,
        z: Number(hit.directionZ) || 1,
      };
      const meshes = [];
      if (object.isMesh) meshes.push(object);
      else object.traverse(child => {
        if (child.isMesh && child.visible) meshes.push(child);
      });
      for (const mesh of meshes) {
        const materialId = mesh.userData.studioMaterialId || "";
        if (materialId === "material/palm-bark") {
          const logs = splitTrunk(mesh);
          if (logs.length === 0) launchMesh(mesh, direction, {
            speed: 1.6, lift: 1.1, spread: 0.55, spin: 2.4, drag: 0.35, bounce: 0.18,
          });
          else {
            for (const [index, log] of logs.entries()) {
              launch(log, {
                vx: direction.x * (1.15 + index * 0.35) + (Math.random() - 0.5) * 0.4,
                vy: 0.85 + index * 0.55,
                vz: direction.z * (1.15 + index * 0.35) + (Math.random() - 0.5) * 0.4,
                wx: -direction.z * (2.2 + index),
                wy: (Math.random() - 0.5) * 1.2,
                wz: direction.x * (2.2 + index),
                drag: 0.28,
                bounce: 0.16,
              });
            }
          }
          continue;
        }
        const foliage = materialId.includes("leaf") || materialId.includes("rachis");
        const coconut = materialId.includes("coconut");
        launchMesh(mesh, direction, foliage
          ? { speed: 2.4, lift: 2.6, spread: 1.8, spin: 5.5, drag: 1.15, bounce: 0.08 }
          : coconut
            ? { speed: 1.8, lift: 3.1, spread: 1.1, spin: 6.2, drag: 0.22, bounce: 0.42 }
            : { speed: 1.5, lift: 1.4, spread: 0.7, spin: 2.8, drag: 0.4, bounce: 0.2 });
      }
      object.visible = false;
    },
    update(dt) {
      const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
      for (const piece of pieces) {
        if (piece.settled) continue;
        piece.vy -= GRAVITY * step;
        const damp = Math.exp(-piece.drag * step);
        piece.vx *= damp;
        piece.vz *= damp;
        piece.mesh.position.x += piece.vx * step;
        piece.mesh.position.y += piece.vy * step;
        piece.mesh.position.z += piece.vz * step;
        _axis.set(piece.wx, piece.wy, piece.wz);
        const spin = _axis.length();
        if (spin > 1e-5) {
          _axis.multiplyScalar(1 / spin);
          piece.mesh.rotateOnWorldAxis(_axis, spin * step);
        }
        piece.mesh.updateWorldMatrix(true, false);
        _box.setFromObject(piece.mesh);
        const ground = groundAt(piece.mesh.position.x, piece.mesh.position.z);
        if (_box.min.y <= ground) {
          piece.mesh.position.y += ground - _box.min.y;
          if (piece.vy < 0) piece.vy *= -piece.bounce;
          piece.vx *= 0.55;
          piece.vz *= 0.55;
          piece.wx *= 0.45;
          piece.wy *= 0.45;
          piece.wz *= 0.45;
          if (Math.abs(piece.vy) < 0.85 && Math.hypot(piece.vx, piece.vz) < 0.45) {
            piece.vy = 0;
            piece.vx = 0;
            piece.vz = 0;
            piece.wx = 0;
            piece.wy = 0;
            piece.wz = 0;
            piece.settled = true;
          }
        }
      }

      for (let index = chipStates.length - 1; index >= 0; index -= 1) {
        const chip = chipStates[index];
        chip.age += step;
        if (chip.age >= chip.life) {
          chipStates.splice(index, 1);
          continue;
        }
        chip.vy -= GRAVITY * 1.15 * step;
        chip.vx *= Math.exp(-1.4 * step);
        chip.vz *= Math.exp(-1.4 * step);
        chip.x += chip.vx * step;
        chip.y += chip.vy * step;
        chip.z += chip.vz * step;
        const ground = groundAt(chip.x, chip.z);
        if (chip.y < ground + chip.size * 0.5) {
          chip.y = ground + chip.size * 0.5;
          chip.vy *= -0.12;
          chip.vx *= 0.4;
          chip.vz *= 0.4;
        }
      }
      chips.count = chipStates.length;
      for (const [index, chip] of chipStates.entries()) {
        dummy.position.set(chip.x, chip.y, chip.z);
        dummy.rotation.set(chip.wx * chip.age, chip.wy * chip.age, chip.wz * chip.age);
        dummy.scale.setScalar(chip.size);
        dummy.updateMatrix();
        chips.setMatrixAt(index, dummy.matrix);
      }
      chips.instanceMatrix.needsUpdate = true;
      chips.computeBoundingSphere();
    },
    dispose() {
      for (const piece of pieces) disposeMesh(piece.mesh);
      pieces.length = 0;
      chips.removeFromParent();
      chipGeometry.dispose();
      chipMaterial.dispose();
    },
  };
}
