import { CELL_SIZE, CHUNK_CELLS } from "./sand-chunk-field.mjs";
import { WATER_LEVEL } from "./terrain.mjs";

const INFILTRATE_RATE = 0.002;
const OCEAN_FILL_RATE = 0.55;
const SEEP_RATE = 0.15;
const seepageCursors = new WeakMap();
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
  baseHeightAt = null,
  wetnessAt = null,
  maxCells = 4096,
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
  const chunks = [];
  iterate.call(field, chunk => chunks.push(chunk));
  if (!chunks.length) return 0;
  let schedule = seepageCursors.get(field);
  if (!schedule) {
    schedule = { chunk: 0, time: 0, visits: new WeakMap() };
    seepageCursors.set(field, schedule);
  }
  schedule.time += delta;
  const budget = Math.max(0, Math.floor(Number(maxCells) || 0));
  let visited = 0;
  for (let pass = 0; pass < chunks.length && visited < budget; pass++) {
    schedule.chunk %= chunks.length;
    const chunk = chunks[schedule.chunk];
    let times = schedule.visits.get(chunk);
    if (!times) {
      times = new Float64Array(CHUNK_CELLS * CHUNK_CELLS).fill(schedule.time - delta);
      schedule.visits.set(chunk, times);
    }
    const originIx = chunk.cx * CHUNK_CELLS;
    const originIz = chunk.cz * CHUNK_CELLS;
    let index = chunk.seepageCursor || 0;
    for (; index < CHUNK_CELLS * CHUNK_CELLS && visited < budget; index++, visited++) {
        const lx = index % CHUNK_CELLS;
        const lz = Math.floor(index / CHUNK_CELLS);
        const cellDt = Math.min(0.25, schedule.time - times[index]);
        times[index] = schedule.time;
        const previousDepth = chunk.water[index];
        const previousWet = chunk.wet[index];
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
        const sea = belowTable && (baseHeightAt
          ? baseHeightAt(center.x, center.z) < waterLevel
          : isLikelySeaConnected(center.x, center.z, () => surface, waterLevel, neighborWater));
        if (chunk.water[index] > 1e-5 && !sea) {
          // Damp sand absorbs progressively more slowly, allowing a poured
          // pool to remain visible instead of vanishing within one second.
          const soak = Math.min(chunk.water[index], INFILTRATE_RATE * cellDt * (1 - wet * .85));
          chunk.water[index] -= soak;
          chunk.wet[index] = Math.min(1, chunk.wet[index] + soak * 2.2);
          changed += soak;
        }
        if (sea) {
          const target = waterLevel - surface;
          const fill = Math.min(Math.max(0, target - chunk.water[index]), OCEAN_FILL_RATE * cellDt);
          if (fill > 0) {
            chunk.water[index] += fill;
            chunk.dirty = true;
            changed += fill;
          }
        } else if (belowTable) {
          const seep = SEEP_RATE * cellDt * (0.2 + wet);
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
        if (Math.abs(previousDepth - chunk.water[index]) > 1e-7) {
          waterField.markCellDirty?.(ix, iz);
          for (const [dx,dz] of NEIGHBORS) waterField.markCellDirty?.(ix+dx, iz+dz);
        }
        if ((previousDepth > 0.02) !== (chunk.water[index] > 0.02)
          || Math.abs(previousWet - chunk.wet[index]) > 0.001) {
          field.markCellDirty?.(ix, iz);
        }
    }
    chunk.seepageCursor = index === CHUNK_CELLS * CHUNK_CELLS ? 0 : index;
    if (chunk.seepageCursor === 0) schedule.chunk++;
  }
  return changed;
}

export const stepInfiltration = stepSeepage;
