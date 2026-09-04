import { CELL_SIZE, CHUNK_CELLS, createSandField } from "./sand-chunk-field.mjs";

export { createSandField };

export const DRY_REPOSE = 34 * Math.PI / 180;
export const WET_REPOSE = 42 * Math.PI / 180;
export const SUBMERGED_REPOSE = 18 * Math.PI / 180;

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const HALO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const MAX_DT = 0.05;
const RELAX_RATE = 1.15;
const MIN_EXCESS = 1e-8;

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function cellSizeOf(field) {
  const size = Number(field?.CELL_SIZE ?? field?.cellSize);
  return size > 0 ? size : CELL_SIZE;
}

function chunkCellsOf(field) {
  const size = Number(field?.CHUNK_CELLS ?? field?.chunkSize);
  return size > 0 ? Math.floor(size) : CHUNK_CELLS;
}

function chunkKeyOf(field, cx, cz) {
  if (typeof field.chunkKey === "function") return field.chunkKey(cx, cz);
  return `${cx},${cz}`;
}

function getChunk(field, cx, cz, create) {
  const key = chunkKeyOf(field, cx, cz);
  const existing = field.chunks?.get?.(key);
  if (existing) return existing;
  if (create && typeof field.ensureChunk === "function") return field.ensureChunk(cx, cz);
  return null;
}

function cellCenterOf(field, ix, iz, cellSize) {
  if (typeof field.cellCenter === "function") return field.cellCenter(ix, iz);
  return { x: (ix + 0.5) * cellSize, z: (iz + 0.5) * cellSize };
}

function sampleHeight(field, chunk, index, center) {
  if (typeof field.heightAt === "function") {
    const value = Number(field.heightAt(center.x, center.z));
    if (Number.isFinite(value)) return value;
  }
  const baseFn = field.baseHeight;
  const base = typeof baseFn === "function"
    ? Number(baseFn(center.x, center.z))
    : Number(baseFn);
  return (Number.isFinite(base) ? base : 0) + chunk.sand[index];
}

function collectDirtyChunks(field) {
  const dirty = [];
  if (typeof field.forEachDirtyChunk === "function") {
    field.forEachDirtyChunk(chunk => dirty.push(chunk));
    return dirty;
  }
  if (!field.chunks) return dirty;
  for (const chunk of field.chunks.values()) {
    if (chunk.dirty) dirty.push(chunk);
  }
  return dirty;
}

function withHalo(field, dirty) {
  const work = [];
  const seen = new Set();
  const add = chunk => {
    if (!chunk) return;
    const key = chunk.key ?? chunkKeyOf(field, chunk.cx, chunk.cz);
    if (seen.has(key)) return;
    seen.add(key);
    work.push(chunk);
  };
  for (const chunk of dirty) add(chunk);
  for (const chunk of dirty) {
    for (const [dx, dz] of HALO) add(getChunk(field, chunk.cx + dx, chunk.cz + dz, false));
  }
  work.sort((a, b) => (a.cz - b.cz) || (a.cx - b.cx));
  return work;
}

export function reposeLimit(wetness = 0, waterDepth = 0) {
  if (Number(waterDepth) > 0.02) return SUBMERGED_REPOSE;
  return DRY_REPOSE + (WET_REPOSE - DRY_REPOSE) * clamp01(wetness);
}

export function relaxSandRepose(field, dt, {
  wetnessAt = null,
  waterDepthAt = null,
  maxCells = 384,
} = {}) {
  if (!field) return 0;
  const delta = Math.max(0, Math.min(MAX_DT, Number(dt) || 0));
  if (delta <= 0) return 0;
  const rate = 1 - Math.exp(-delta * RELAX_RATE);
  if (rate <= 0) return 0;

  if (typeof field.takeDirtyCells === "function" && typeof field.cellAt === "function") {
    const taken = field.takeDirtyCells(maxCells);
    let moved = 0;
    for (let i = 0; i < taken.length; i += 2) {
      const ix = taken[i];
      const iz = taken[i + 1];
      const here = field.cellAt(ix, iz);
      if (!here) continue;
      const wet = here.chunk.wet[here.index];
      const depth = here.chunk.water[here.index];
      const maxDh = Math.tan(reposeLimit(wet, depth)) * cellSizeOf(field);
      let h = here.chunk.base[here.index] + here.chunk.sand[here.index];
      if (Math.abs(here.chunk.sand[here.index]) < 1e-5) continue;
      for (const [dx, dz] of NEIGHBORS) {
        const nix = ix + dx;
        const niz = iz + dz;
        let neighbor = field.cellAt(nix, niz);
        const hn = neighbor
          ? neighbor.chunk.base[neighbor.index] + neighbor.chunk.sand[neighbor.index]
          : field.cellSurface(nix, niz);
        const excess = h - hn - maxDh;
        if (excess <= MIN_EXCESS) continue;
        if (!neighbor) {
          field.ensureChunk(Math.floor(nix / chunkCellsOf(field)), Math.floor(niz / chunkCellsOf(field)));
          neighbor = field.cellAt(nix, niz);
          if (!neighbor) continue;
        }
        const transfer = excess * 0.5 * rate;
        here.chunk.sand[here.index] -= transfer;
        neighbor.chunk.sand[neighbor.index] += transfer;
        h -= transfer;
        field.markCellDirty(nix, niz);
        moved += transfer;
      }
      if (Math.abs(here.chunk.sand[here.index]) > 1e-4) field.markCellDirty(ix, iz);
    }
    return moved;
  }

  const cellSize = cellSizeOf(field);
  const chunkCells = chunkCellsOf(field);
  const budget = Math.max(0, Math.floor(Number(maxCells) || 0));
  const original = collectDirtyChunks(field);
  if (original.length === 0 || budget <= 0) return 0;

  const originalSet = new Set(original);
  for (const chunk of original) chunk.dirty = false;
  const work = withHalo(field, original);
  for (const chunk of work) {
    if (!originalSet.has(chunk)) chunk.dirty = false;
  }

  let visited = 0;
  let workIndex = 0;
  for (; workIndex < work.length && visited < budget; workIndex += 1) {
    const chunk = work[workIndex];
    const originIx = chunk.cx * chunkCells;
    const originIz = chunk.cz * chunkCells;
    const total = chunkCells * chunkCells;
    let cursor = Number(chunk.reposeCursor) || 0;
    if (cursor < 0 || cursor >= total) cursor = 0;
    let moved = false;
    let index = cursor;
    for (; index < total && visited < budget; index += 1) {
      visited += 1;
      const lx = index % chunkCells;
      const lz = (index / chunkCells) | 0;
      const sandIndex = lz * chunkCells + lx;
      const ix = originIx + lx;
      const iz = originIz + lz;
      const center = cellCenterOf(field, ix, iz, cellSize);
      const wet = wetnessAt?.(center.x, center.z) ?? chunk.wet?.[sandIndex] ?? 0;
      const depth = waterDepthAt?.(center.x, center.z) ?? chunk.water?.[sandIndex] ?? 0;
      const maxDh = Math.tan(reposeLimit(wet, depth)) * cellSize;
      let h = sampleHeight(field, chunk, sandIndex, center);
      for (const [dx, dz] of NEIGHBORS) {
        const nix = ix + dx;
        const niz = iz + dz;
        const ncx = Math.floor(nix / chunkCells);
        const ncz = Math.floor(niz / chunkCells);
        let neighbor = getChunk(field, ncx, ncz, false);
        const nCenter = cellCenterOf(field, nix, niz, cellSize);
        const nIndex = (niz - ncz * chunkCells) * chunkCells + (nix - ncx * chunkCells);
        let hn;
        if (neighbor) {
          hn = sampleHeight(field, neighbor, nIndex, nCenter);
        } else if (typeof field.heightAt === "function") {
          hn = Number(field.heightAt(nCenter.x, nCenter.z));
          if (!Number.isFinite(hn)) continue;
        } else {
          continue;
        }
        const excess = h - hn - maxDh;
        if (excess <= MIN_EXCESS) continue;
        if (!neighbor) {
          neighbor = getChunk(field, ncx, ncz, true);
          if (!neighbor) continue;
        }
        const transfer = excess * 0.5 * rate;
        chunk.sand[sandIndex] -= transfer;
        neighbor.sand[nIndex] += transfer;
        h -= transfer;
        neighbor.dirty = true;
        moved = true;
      }
    }
    const finished = index >= total;
    chunk.reposeCursor = finished ? 0 : index;
    if (!finished || moved) chunk.dirty = true;
  }

  for (; workIndex < work.length; workIndex += 1) {
    if (originalSet.has(work[workIndex])) work[workIndex].dirty = true;
  }
  return visited;
}
