import { HEIGHT_BOUNDS } from './terrain.mjs';
export const SHOVEL_MODES = Object.freeze(['Dig', 'Trench', 'Smooth', 'Flatten']);
export function shovelBrush(mode = 'Dig') {
  return mode === 'Trench' ? { radiusX: 0.18, radiusZ: 0.75 }
    : mode === 'Smooth' || mode === 'Flatten' ? { radiusX: 0.7, radiusZ: 0.7 }
    : { radiusX: 0.2, radiusZ: 0.26 };
}

// Sculpting redistributes the selected cells' height offsets, conserving volume.
export function sculptSand(field, hit) {
  const radius = 0.7, cell = field.cellSize;
  const entries = [];
  for (let z = Math.floor((hit.z-radius)/cell); z <= Math.floor((hit.z+radius)/cell); z++) {
    for (let x = Math.floor((hit.x-radius)/cell); x <= Math.floor((hit.x+radius)/cell); x++) {
      const p = field.cellCenter(x,z);
      if (p.x < HEIGHT_BOUNDS.minX || p.x > HEIGHT_BOUNDS.maxX || p.z < HEIGHT_BOUNDS.minZ || p.z > HEIGHT_BOUNDS.maxZ) continue;
      if (Math.hypot(p.x-hit.x,p.z-hit.z) <= radius) entries.push({ x,z,h:field.cellSurface(x,z) });
    }
  }
  if (!entries.length) return;
  const mean = entries.reduce((sum,e)=>sum+e.h,0)/entries.length;
  const strength = hit.toolMode === 'Flatten' ? 0.7 : 0.3;
  for (const e of entries) field.addAtCell(e.x,e.z,(mean-e.h)*strength);
}
