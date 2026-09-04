import { CELL_SIZE, CHUNK_CELLS } from "./sand-chunk-field.mjs";
import { WATER_LEVEL } from "./terrain.mjs";

const INFILTRATE_RATE = 0.08;
const OCEAN_FILL_RATE = 0.55;
const SEEP_RATE = 0.15;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function isLikelySeaConnected(x, z, heightAt, waterLevel = WATER_LEVEL, neighborWaterFn = null) {
  if (x && typeof x === "object") {
    const snapshot = x;
    return isLikelySeaConnected(
      snapshot.x,
      snapshot.z,
      () => snapshot.surface,
      snapshot.waterLevel ?? waterLevel,
    );
  }
  const surface = Number(typeof heightAt === "function" ? heightAt(x, z) : heightAt);
  if (surface >= waterLevel) return false;
  if (Number(z) > 6) return true;
  if (neighborWaterFn?.(x, z) > 0.04 && surface < waterLevel) return true;
  return false;
}

function cellRef(field, ix, iz) {
  const cx = Math.floor(ix / CHUNK_CELLS);
  const cz = Math.floor(iz / CHUNK_CELLS);
  const chunk = field.chunks.get(field.chunkKey(cx, cz));
  if (!chunk) return null;
  const index = (iz - cz * CHUNK_CELLS) * CHUNK_CELLS + (ix - cx * CHUNK_CELLS);
  return { chunk, index, ix, iz };
}

export function stepSeepage(waterField, sandField, dt, {
  waterLevel = WATER_LEVEL,
  heightAt = null,
  wetnessAt = null,
} = {}) {
  if (typeof sandField === "number") {
    dt = sandField;
    sandField = waterField?.sandField ?? waterField;
    waterField = { sandField };
  }
  const field = sandField ?? waterField?.sandField;
  if (!field?.forEachDirtyChunk) return 0;
  const delta = Math.max(0, Math.min(0.05, Number(dt) || 0));
  if (delta <= 0) return 0;
  const surfaceAt = heightAt ?? ((x, z) => field.heightAt(x, z));
  let changed = 0;

  const iterate = field.forEachDirtyChunk ?? field.forEachChunk;
  iterate.call(field, chunk => {
    const originIx = chunk.cx * CHUNK_CELLS;
    const originIz = chunk.cz * CHUNK_CELLS;
    for (let lz = 0; lz < CHUNK_CELLS; lz += 1) {
      for (let lx = 0; lx < CHUNK_CELLS; lx += 1) {
        const index = lz * CHUNK_CELLS + lx;
        const ix = originIx + lx;
        const iz = originIz + lz;
        const center = field.cellCenter(ix, iz);
        const surface = chunk.base
          ? chunk.base[index] + chunk.sand[index]
          : surfaceAt(center.x, center.z);
        const wet = wetnessAt?.(center.x, center.z) ?? chunk.wet[index];
        const belowTable = surface < waterLevel;
        const neighborWater = () => {
          let max = 0;
          for (const [dx, dz] of NEIGHBORS) {
            const ref = cellRef(field, ix + dx, iz + dz);
            if (ref) max = Math.max(max, ref.chunk.water[ref.index]);
          }
          return max;
        };
        const sea = belowTable && isLikelySeaConnected(center.x, center.z, () => surface, waterLevel, neighborWater);
        if (chunk.water[index] > 1e-5 && !sea) {
          const soak = Math.min(chunk.water[index], INFILTRATE_RATE * delta);
          chunk.water[index] -= soak;
          chunk.wet[index] = Math.min(1, chunk.wet[index] + soak * 2.2);
          changed += soak;
        }
        if (sea) {
          const target = waterLevel - surface;
          const fill = Math.min(Math.max(0, target - chunk.water[index]), OCEAN_FILL_RATE * delta);
          if (fill > 0) {
            chunk.water[index] += fill;
            chunk.dirty = true;
            changed += fill;
          }
        } else if (belowTable) {
          const seep = SEEP_RATE * delta * (0.2 + wet);
          for (const [dx, dz] of NEIGHBORS) {
            const ref = cellRef(field, ix + dx, iz + dz);
            if (!ref || ref.chunk.water[ref.index] <= 0.01) continue;
            const nCenter = field.cellCenter(ix + dx, iz + dz);
            const nSurface = surfaceAt(nCenter.x, nCenter.z) + ref.chunk.water[ref.index];
            const here = surface + chunk.water[index];
            if (nSurface <= here + 0.01) continue;
            const share = Math.min(ref.chunk.water[ref.index] * seep, nSurface - here);
            if (share <= 0) continue;
            ref.chunk.water[ref.index] -= share;
            chunk.water[index] += share;
            chunk.dirty = true;
            ref.chunk.dirty = true;
            changed += share;
          }
        }
      }
    }
  });
  return changed;
}

export const stepInfiltration = stepSeepage;
