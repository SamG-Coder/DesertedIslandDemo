import * as THREE from "three/webgpu";

const VALID = 0xf0d089;
const FILL = 0x4ade80;
const CASTLE = 0xe8c48a;
const BLOCKED = 0xe24b4b;

function makeOverlayMaterial(color, opacity) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;
  return material;
}

export function previewColor(mode, valid) {
  if (!valid) return BLOCKED;
  if (mode === "fill") return FILL;
  if (mode === "castle") return CASTLE;
  return VALID;
}

export function createAimPreview(scene) {
  const group = new THREE.Group();
  group.name = "Tool aim preview";
  group.userData.rtxIgnore = true;
  group.visible = false;

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    makeOverlayMaterial(VALID, 0.18),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1, 48),
    makeOverlayMaterial(VALID, 0.92),
  );
  disc.rotation.x = -Math.PI / 2;
  ring.rotation.x = -Math.PI / 2;
  disc.userData.rtxIgnore = true;
  ring.userData.rtxIgnore = true;
  group.add(disc, ring);
  scene.add(group);

  function hide() {
    group.visible = false;
  }

  return {
    update(aim) {
      if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.z)) {
        hide();
        return;
      }
      const radiusX = Math.max(0.04, Number(aim.radiusX) || 0.2);
      const radiusZ = Math.max(0.04, Number(aim.radiusZ) || radiusX);
      const valid = aim.valid !== false;
      const color = previewColor(aim.mode, valid);
      const yaw = Number.isFinite(aim.yaw) ? aim.yaw : 0;
      const y = (Number(aim.y) || 0) + 0.028;
      disc.material.color.setHex(color);
      ring.material.color.setHex(color);
      disc.scale.set(radiusX, radiusZ, 1);
      ring.scale.set(radiusX, radiusZ, 1);
      group.position.set(aim.x, y, aim.z);
      group.rotation.y = yaw;
      group.visible = true;
    },
    hide,
    dispose() {
      group.removeFromParent();
      disc.geometry.dispose();
      ring.geometry.dispose();
      disc.material.dispose();
      ring.material.dispose();
    },
  };
}
