import { HEIGHT_BOUNDS } from "./terrain.mjs";
import { pileKernelWeight, shovelKernelWeight } from "./sand-stamp.mjs";

export const CELL_SIZE = 0.25;
export const CHUNK_CELLS = 16;
export const CHUNK_SIZE = CELL_SIZE * CHUNK_CELLS;

const CELL_COUNT = CHUNK_CELLS * CHUNK_CELLS;
const SAND_MIN = -8;
const SAND_MAX = 8;

export function worldToCell(x, z) {
  return {
    x: Math.floor(Number(x) / CELL_SIZE),
    z: Math.floor(Number(z) / CELL_SIZE),
  };
}

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export function cellCenter(ix, iz) {
  return {
    x: (ix + 0.5) * CELL_SIZE,
    z: (iz + 0.5) * CELL_SIZE,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function inWorld(x, z) {
  return x >= HEIGHT_BOUNDS.minX && x <= HEIGHT_BOUNDS.maxX
    && z >= HEIGHT_BOUNDS.minZ && z <= HEIGHT_BOUNDS.maxZ;
}

function cellChunk(i) {
  return Math.floor(i / CHUNK_CELLS);
}

function localIndex(ix, iz, cx, cz) {
  return (iz - cz * CHUNK_CELLS) * CHUNK_CELLS + (ix - cx * CHUNK_CELLS);
}

function asHeightFn(value) {
  if (typeof value === "function") return value;
  const constant = Number(value);
  const height = Number.isFinite(constant) ? constant : 0;
  return () => height;
}

export function createSandField(options = {}) {
  const baseHeight = asHeightFn(options.heightAt ?? options.baseHeight);
  const chunks = new Map();
  const dirtyKeys = new Set();
  const dirtyList = [];
  let dirtyHead = 0;

  function getChunk(cx, cz) {
    return chunks.get(chunkKey(cx, cz)) ?? null;
  }

  function ensureChunk(cx, cz) {
    cx = Math.floor(cx);
    cz = Math.floor(cz);
    const key = chunkKey(cx, cz);
    let chunk = chunks.get(key);
    if (!chunk) {
      const base = new Float32Array(CELL_COUNT);
      const originIx = cx * CHUNK_CELLS;
      const originIz = cz * CHUNK_CELLS;
      for (let lz = 0; lz < CHUNK_CELLS; lz += 1) {
        for (let lx = 0; lx < CHUNK_CELLS; lx += 1) {
          const center = cellCenter(originIx + lx, originIz + lz);
          base[lz * CHUNK_CELLS + lx] = baseHeight(center.x, center.z);
        }
      }
      chunk = {
        sand: new Float32Array(CELL_COUNT),
        wet: new Float32Array(CELL_COUNT),
        water: new Float32Array(CELL_COUNT),
        base,
        dirty: true,
        cx,
        cz,
        key,
      };
      chunks.set(key, chunk);
    }
    return chunk;
  }

  function packCell(ix, iz) {
    return `${ix},${iz}`;
  }

  function markCellDirty(ix, iz) {
    const key = packCell(ix, iz);
    if (dirtyKeys.has(key)) return;
    dirtyKeys.add(key);
    dirtyList.push(ix, iz);
  }

  function markExisting(cx, cz) {
    const chunk = getChunk(cx, cz);
    if (chunk) chunk.dirty = true;
  }

  function markDirty(ix, iz) {
    ix = Math.floor(ix);
    iz = Math.floor(iz);
    const cx = cellChunk(ix);
    const cz = cellChunk(iz);
    ensureChunk(cx, cz).dirty = true;
    const lx = ix - cx * CHUNK_CELLS;
    const lz = iz - cz * CHUNK_CELLS;
    const dx = lx === 0 ? -1 : lx === CHUNK_CELLS - 1 ? 1 : 0;
    const dz = lz === 0 ? -1 : lz === CHUNK_CELLS - 1 ? 1 : 0;
    if (dx) markExisting(cx + dx, cz);
    if (dz) markExisting(cx, cz + dz);
    if (dx && dz) markExisting(cx + dx, cz + dz);
  }

  function cellScalar(kind, ix, iz) {
    const cx = cellChunk(ix);
    const cz = cellChunk(iz);
    const chunk = getChunk(cx, cz);
    if (!chunk) return 0;
    return chunk[kind][localIndex(ix, iz, cx, cz)];
  }

  // Samples live at cell centres, so world XZ is shifted by half a cell.
  function sampleBilinear(kind, x, z) {
    if (!inWorld(x, z)) return 0;
    const gx = x / CELL_SIZE - 0.5;
    const gz = z / CELL_SIZE - 0.5;
    const ix0 = Math.floor(gx);
    const iz0 = Math.floor(gz);
    const tx = gx - ix0;
    const tz = gz - iz0;
    const a = cellScalar(kind, ix0, iz0);
    const b = cellScalar(kind, ix0 + 1, iz0);
    const c = cellScalar(kind, ix0, iz0 + 1);
    const d = cellScalar(kind, ix0 + 1, iz0 + 1);
    const ab = a + (b - a) * tx;
    const cd = c + (d - c) * tx;
    return ab + (cd - ab) * tz;
  }

  function addAtCell(ix, iz, amount, wetness, limits = {}) {
    ix = Math.floor(ix);
    iz = Math.floor(iz);
    const center = cellCenter(ix, iz);
    if (!inWorld(center.x, center.z)) return;
    const sandAdd = Number(amount);
    const wetAdd = Number(wetness);
    const writeSand = Number.isFinite(sandAdd) && sandAdd !== 0;
    const writeWet = Number.isFinite(wetAdd) && wetAdd !== 0;
    if (!writeSand && !writeWet) return;
    const cx = cellChunk(ix);
    const cz = cellChunk(iz);
    const chunk = ensureChunk(cx, cz);
    const index = localIndex(ix, iz, cx, cz);
    if (writeSand) {
      let next = chunk.sand[index] + sandAdd;
      if (Number.isFinite(limits.minSand)) next = Math.max(limits.minSand, next);
      if (Number.isFinite(limits.maxSand)) next = Math.min(limits.maxSand, next);
      chunk.sand[index] = clamp(next, SAND_MIN, SAND_MAX);
      options.onHeightChange?.(ix, iz);
    }
    if (writeWet) {
      chunk.wet[index] = clamp01(chunk.wet[index] + wetAdd);
    }
    markDirty(ix, iz);
    // An excavation wakes its rim as well as the cells removed by the shovel.
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) markCellDirty(ix + dx, iz + dz);
    }
  }

  function stamp(x, z, options = {}) {
    const amount = Number(options.amount) || 0;
    const radiusX = Math.max(1e-4, Number(options.radiusX) || 0.2);
    const radiusZ = Math.max(1e-4, Number(options.radiusZ) || 0.26);
    let forwardX = Number(options.forwardX);
    let forwardZ = Number(options.forwardZ);
    if (!Number.isFinite(forwardX) || !Number.isFinite(forwardZ) || (forwardX === 0 && forwardZ === 0)) {
      forwardX = 0;
      forwardZ = 1;
    } else {
      const length = Math.hypot(forwardX, forwardZ) || 1;
      forwardX /= length;
      forwardZ /= length;
    }
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const peaked = options.peaked == null ? amount >= 0 : Boolean(options.peaked);
    const wetness = Number(options.wetness);
    const hasWet = Number.isFinite(wetness);
    const extentX = Math.abs(rightX) * radiusX + Math.abs(forwardX) * radiusZ;
    const extentZ = Math.abs(rightZ) * radiusX + Math.abs(forwardZ) * radiusZ;
    const minIx = Math.floor((x - extentX) / CELL_SIZE);
    const maxIx = Math.floor((x + extentX) / CELL_SIZE);
    const minIz = Math.floor((z - extentZ) / CELL_SIZE);
    const maxIz = Math.floor((z + extentZ) / CELL_SIZE);
    const minSand = Number(options.minSand);
    const maxSand = Number(options.maxSand);
    const limits = {};
    if (Number.isFinite(minSand)) limits.minSand = minSand;
    if (Number.isFinite(maxSand)) limits.maxSand = maxSand;
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const center = cellCenter(ix, iz);
        const dx = center.x - x;
        const dz = center.z - z;
        const localX = dx * rightX + dz * rightZ;
        const localZ = dx * forwardX + dz * forwardZ;
        const weight = options.kernel === "pile"
          ? pileKernelWeight(localX, localZ, radiusX, radiusZ)
          : shovelKernelWeight(localX, localZ, radiusX, radiusZ, peaked);
        if (weight <= 0) continue;
        addAtCell(ix, iz, amount * weight, hasWet ? wetness * weight : undefined, limits);
      }
    }
  }

  function sandAt(x, z) {
    x = Number(x);
    z = Number(z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    return sampleBilinear("sand", x, z);
  }

  function wetAt(x, z) {
    x = Number(x);
    z = Number(z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    return sampleBilinear("wet", x, z);
  }

  function waterAt(x, z) {
    x = Number(x);
    z = Number(z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    return sampleBilinear("water", x, z);
  }

  function addWet(x, z, amount) {
    const cell = worldToCell(x, z);
    addAtCell(cell.x, cell.z, 0, amount);
  }

  function heightAt(x, z, baseHeightFn = baseHeight) {
    const fn = typeof baseHeightFn === "function" ? baseHeightFn : baseHeight;
    const base = Number(fn(x, z));
    return (Number.isFinite(base) ? base : 0) + sandAt(x, z);
  }

  function forEachChunk(fn) {
    for (const chunk of chunks.values()) fn(chunk, chunk.cx, chunk.cz);
  }

  function forEachDirtyChunk(fn) {
    const dirty = [];
    for (const chunk of chunks.values()) {
      if (chunk.dirty) dirty.push(chunk);
    }
    for (const chunk of dirty) fn(chunk, chunk.cx, chunk.cz);
  }

  function hasChunk(cx, cz) {
    return chunks.has(chunkKey(Math.floor(cx), Math.floor(cz)));
  }

  function cellSurface(ix, iz) {
    const cx = cellChunk(ix);
    const cz = cellChunk(iz);
    const chunk = getChunk(cx, cz);
    if (!chunk) {
      const center = cellCenter(ix, iz);
      return baseHeight(center.x, center.z);
    }
    const index = localIndex(ix, iz, cx, cz);
    return chunk.base[index] + chunk.sand[index];
  }

  function takeDirtyCells(maxCells = 256) {
    const budget = Math.max(0, Math.floor(Number(maxCells) || 0));
    const count = Math.min(budget, (dirtyList.length - dirtyHead) / 2);
    const taken = [];
    for (let i = 0; i < count; i += 1) {
      const ix = dirtyList[dirtyHead++];
      const iz = dirtyList[dirtyHead++];
      dirtyKeys.delete(packCell(ix, iz));
      taken.push(ix, iz);
    }
    // Amortized compaction avoids moving the entire queue twice per cell.
    if (dirtyHead === dirtyList.length) {
      dirtyList.length = 0;
      dirtyHead = 0;
    } else if (dirtyHead > 4096 && dirtyHead > dirtyList.length / 2) {
      dirtyList.splice(0, dirtyHead);
      dirtyHead = 0;
    }
    return taken;
  }

  function dirtyRecords() {
    const records = [];
    forEachDirtyChunk((chunk, cx, cz) => {
      records.push({
        active: true,
        x: (cx + 0.5) * CHUNK_SIZE,
        z: (cz + 0.5) * CHUNK_SIZE,
        forwardX: 0,
        forwardZ: 1,
        rightX: 1,
        rightZ: 0,
        radiusX: CHUNK_SIZE * 0.5 + 0.35,
        radiusZ: CHUNK_SIZE * 0.5 + 0.35,
      });
    });
    return records;
  }

  return {
    cellSize: CELL_SIZE,
    chunkCells: CHUNK_CELLS,
    chunks,
    baseHeight,
    worldToCell,
    chunkKey,
    cellCenter,
    ensureChunk,
    hasChunk,
    sandAt,
    wetAt,
    waterAt,
    addWet,
    addAtCell,
    notifyHeightChange(ix, iz) { options.onHeightChange?.(ix, iz); },
    stamp,
    forEachChunk,
    forEachDirtyChunk,
    markDirty,
    markCellDirty,
    cellAt(ix, iz) {
      const cx = cellChunk(ix);
      const cz = cellChunk(iz);
      const chunk = getChunk(cx, cz);
      if (!chunk) return null;
      return { chunk, index: localIndex(ix, iz, cx, cz), cx, cz };
    },
    cellSurface,
    takeDirtyCells,
    get dirtyCellCount() {
      return (dirtyList.length - dirtyHead) / 2;
    },
    heightAt,
    dirtyRecords,
    CELL_SIZE,
    CHUNK_CELLS,
  };
}
