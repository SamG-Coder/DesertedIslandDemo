import {
  CELL_SIZE,
  CHUNK_CELLS,
  cellCenter,
  chunkKey,
  worldToCell,
} from "./sand-chunk-field.mjs";
import { transportLooseSand } from './sand-transport.mjs';

export const FLOW_RATE = 2.5;
export const MAX_FLOW_DT = 0.05;
export const DEFAULT_ADD_RADIUS = 0.25;

const CHUNK_AREA = CHUNK_CELLS * CHUNK_CELLS;
const DIRS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([0, -1]),
]);
const MIN_DEPTH = 1e-7;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function chunkOfCell(ix, iz) {
  return {
    cx: Math.floor(ix / CHUNK_CELLS),
    cz: Math.floor(iz / CHUNK_CELLS),
  };
}

function localIndex(ix, iz, cx, cz) {
  return (iz - cz * CHUNK_CELLS) * CHUNK_CELLS + (ix - cx * CHUNK_CELLS);
}

function cellKey(ix, iz) {
  return `${ix},${iz}`;
}

function makeWaterArray(existing) {
  if (existing instanceof Float32Array && existing.length === CHUNK_AREA) return existing;
  return new Float32Array(CHUNK_AREA);
}

export function standingDepth(field, col, row) {
  if (!field) return 0;
  if (typeof field.depthAtCell === "function") {
    return Math.max(0, finiteNumber(field.depthAtCell(col, row), 0));
  }
  const water = field.water;
  const columns = field.columns ?? CHUNK_CELLS;
  if (water instanceof Float32Array && columns > 0) {
    const index = row * columns + col;
    if (index < 0 || index >= water.length) return 0;
    return Math.max(0, finiteNumber(water[index], 0));
  }
  return 0;
}

export function setStandingDepth(field, col, row, depth) {
  if (!field) return 0;
  const value = Math.max(0, finiteNumber(depth, 0));
  if (typeof field.setDepthAtCell === "function") {
    field.setDepthAtCell(col, row, value);
    return value;
  }
  const water = field.water;
  const columns = field.columns ?? CHUNK_CELLS;
  if (water instanceof Float32Array && columns > 0) {
    const index = row * columns + col;
    if (index >= 0 && index < water.length) water[index] = value;
  }
  return value;
}

export { createSandField } from "./sand-chunk-field.mjs";

export function createWaterField(sandField = {}, options = {}) {
  const chunks = sandField.chunks instanceof Map ? sandField.chunks : new Map();
  const waterDirty = new Set();
  const queued = new Set();
  const dirtyIx = [];
  const dirtyIz = [];
  const defaultHeightAt = typeof options.heightAt === "function"
    ? options.heightAt
    : typeof sandField.heightAt === "function"
      ? (x, z) => sandField.heightAt(x, z)
      : () => 0;

  function keyOf(cx, cz) {
    return typeof sandField.chunkKey === "function"
      ? sandField.chunkKey(cx, cz)
      : chunkKey(cx, cz);
  }

  function getChunk(cx, cz) {
    return chunks.get(keyOf(cx, cz)) ?? null;
  }

  function ensureWaterChunk(cx, cz) {
    let chunk = typeof sandField.ensureChunk === "function"
      ? sandField.ensureChunk(cx, cz)
      : getChunk(cx, cz);
    if (!chunk) {
      chunk = {
        cx,
        cz,
        key: keyOf(cx, cz),
        dirty: true,
        sand: new Float32Array(CHUNK_AREA),
        wet: new Float32Array(CHUNK_AREA),
      };
      chunks.set(chunk.key, chunk);
    }
    chunk.cx = chunk.cx ?? cx;
    chunk.cz = chunk.cz ?? cz;
    chunk.water = makeWaterArray(chunk.water);
    chunk.flowX ??= new Float32Array(CHUNK_CELLS * CHUNK_CELLS);
    chunk.flowZ ??= new Float32Array(CHUNK_CELLS * CHUNK_CELLS);
    return chunk;
  }

  function waterAtCell(ix, iz) {
    const { cx, cz } = chunkOfCell(ix, iz);
    const chunk = getChunk(cx, cz);
    if (!chunk?.water) return 0;
    const depth = chunk.water[localIndex(ix, iz, cx, cz)];
    return depth > 0 && Number.isFinite(depth) ? depth : 0;
  }

  function enqueue(ix, iz) {
    const key = cellKey(ix, iz);
    if (queued.has(key)) return;
    queued.add(key);
    dirtyIx.push(ix);
    dirtyIz.push(iz);
  }

  function markWaterChunk(chunk) {
    chunk.waterDirty = true;
    waterDirty.add(chunk);
  }

  function markSandDirty(ix, iz) {
    if (typeof sandField.markDirty === "function") {
      sandField.markDirty(ix, iz);
      return;
    }
    const { cx, cz } = chunkOfCell(ix, iz);
    const chunk = getChunk(cx, cz);
    if (chunk) chunk.dirty = true;
  }

  function addToCell(ix, iz, delta, origin = null) {
    if (!Number.isFinite(delta) || delta === 0) return 0;
    const { cx, cz } = chunkOfCell(ix, iz);
    const chunk = ensureWaterChunk(cx, cz);
    const index = localIndex(ix, iz, cx, cz);
    const previous = Math.max(0, finiteNumber(chunk.water[index], 0));
    const next = Math.max(0, previous + delta);
    const applied = next - previous;
    if (applied === 0 && delta !== 0) return 0;
    chunk.water[index] = next;
    if (next > .001) {
      chunk.wet[index] = Math.max(chunk.wet[index], Math.min(1, .55 + next * 5));
      sandField.markCellDirty?.(ix, iz);
    }
    if ((previous > 0.02) !== (next > 0.02)) sandField.markCellDirty?.(ix, iz);
    chunk.dirty = true;
    markWaterChunk(chunk);
    enqueue(ix, iz);
    if (applied !== 0) {
      for (const [dx, dz] of DIRS) {
        if (waterAtCell(ix + dx, iz + dz) > MIN_DEPTH) enqueue(ix + dx, iz + dz);
      }
    }
    if (origin) {
      const { cx: fromCx, cz: fromCz } = chunkOfCell(origin.ix, origin.iz);
      if (fromCx !== cx || fromCz !== cz) markSandDirty(ix, iz);
    }
    return applied;
  }

  function depthAt(x, z) {
    const u = finiteNumber(x) / CELL_SIZE - 0.5;
    const v = finiteNumber(z) / CELL_SIZE - 0.5;
    const ix0 = Math.floor(u);
    const iz0 = Math.floor(v);
    const fx = u - ix0;
    const fz = v - iz0;
    const a = waterAtCell(ix0, iz0);
    const b = waterAtCell(ix0 + 1, iz0);
    const c = waterAtCell(ix0, iz0 + 1);
    const d = waterAtCell(ix0 + 1, iz0 + 1);
    const ab = a + (b - a) * fx;
    const cd = c + (d - c) * fx;
    const depth = ab + (cd - ab) * fz;
    return depth > 0 && Number.isFinite(depth) ? depth : 0;
  }

  function addWater(x, z, amount, radius = DEFAULT_ADD_RADIUS) {
    const add = finiteNumber(amount, 0);
    if (add === 0) return 0;
    const wx = finiteNumber(x);
    const wz = finiteNumber(z);
    const span = Math.max(0, finiteNumber(radius, DEFAULT_ADD_RADIUS));
    const hit = worldToCell(wx, wz);
    if (span <= 1e-8) return addToCell(hit.x, hit.z, add);

    const minIx = Math.floor((wx - span) / CELL_SIZE);
    const maxIx = Math.floor((wx + span) / CELL_SIZE);
    const minIz = Math.floor((wz - span) / CELL_SIZE);
    const maxIz = Math.floor((wz + span) / CELL_SIZE);
    let written = 0;
    let hits = 0;
    for (let iz = minIz; iz <= maxIz; iz += 1) {
      for (let ix = minIx; ix <= maxIx; ix += 1) {
        const center = cellCenter(ix, iz);
        const dist = Math.hypot(center.x - wx, center.z - wz);
        if (dist > span) continue;
        const weight = 1 - dist / span;
        if (weight <= 0) continue;
        hits += 1;
        written += addToCell(ix, iz, add * weight);
      }
    }
    if (hits === 0) written += addToCell(hit.x, hit.z, add);
    return written;
  }

  function addDepth(x, z, delta) {
    const cell = worldToCell(x, z);
    return addToCell(cell.x, cell.z, finiteNumber(delta, 0));
  }

  function totalVolume() {
    let sum = 0;
    for (const chunk of waterDirty) {
      const water = chunk.water;
      if (!water) continue;
      for (let i = 0; i < water.length; i += 1) {
        const depth = water[i];
        if (depth > 0) sum += depth;
      }
    }
    return sum * CELL_SIZE * CELL_SIZE;
  }

  function groundAt(ix, iz, heightAt, cache) {
    const key = cellKey(ix, iz);
    if (cache.has(key)) return cache.get(key);
    const center = cellCenter(ix, iz);
    const height = finiteNumber(heightAt(center.x, center.z), 0);
    cache.set(key, height);
    return height;
  }

  function stepFlow(dt = MAX_FLOW_DT, extra = {}) {
    const step = Math.min(MAX_FLOW_DT, Math.max(0, finiteNumber(dt, 0)));
    if (step <= 0) return 0;
    const heightAt = typeof extra.heightAt === "function" ? extra.heightAt : defaultHeightAt;
    const maxCells = Math.max(1, Math.floor(finiteNumber(extra.maxCells, 4096)));
    const heightCache = new Map();
    const maxFraction = Math.min(1, FLOW_RATE * step / CELL_SIZE);
    const rateCap = FLOW_RATE * step;

    const limit = Math.min(maxCells, dirtyIx.length);
    const batchIx = dirtyIx.splice(0, limit);
    const batchIz = dirtyIz.splice(0, limit);
    for (let i = 0; i < batchIx.length; i += 1) queued.delete(cellKey(batchIx[i], batchIz[i]));

    const deltas = new Map();
    const origins = new Map();
    const sedimentTransfers = [];
    const acc = (ix, iz, amount, origin) => {
      if (!(Math.abs(amount) > 0)) return;
      const key = cellKey(ix, iz);
      deltas.set(key, (deltas.get(key) || 0) + amount);
      if (origin && amount > 0) origins.set(key, origin);
    };

    for (let i = 0; i < batchIx.length; i += 1) {
      const ix = batchIx[i];
      const iz = batchIz[i];
      const depth = waterAtCell(ix, iz);
      const flowChunk = getChunk(Math.floor(ix/CHUNK_CELLS), Math.floor(iz/CHUNK_CELLS));
      const flowIndex = localIndex(ix,iz,Math.floor(ix/CHUNK_CELLS),Math.floor(iz/CHUNK_CELLS));
      if(flowChunk?.flowX) {flowChunk.flowX[flowIndex]=0;flowChunk.flowZ[flowIndex]=0;}
      if (depth <= MIN_DEPTH) continue;
      const surface = groundAt(ix, iz, heightAt, heightCache) + depth;
      let slopeSum = 0;
      const slopes = [0, 0, 0, 0];
      for (let dir = 0; dir < 4; dir += 1) {
        const nix = ix + DIRS[dir][0];
        const niz = iz + DIRS[dir][1];
        const nGround = groundAt(nix, niz, heightAt, heightCache);
        const nPoint = extra.baseHeightAt ? cellCenter(nix, niz) : null;
        const oceanBoundary = nPoint && extra.baseHeightAt(nPoint.x, nPoint.z) < extra.waterLevel;
        const neighborSurface = oceanBoundary ? extra.waterLevel : nGround + waterAtCell(nix, niz);
        const slope = surface - neighborSurface;
        if (slope > 0) {
          slopes[dir] = slope;
          slopeSum += slope;
        }
      }
      if (slopeSum <= 0) continue;

      const maxOut = Math.min(depth, depth * maxFraction, rateCap);
      if (maxOut <= MIN_DEPTH) continue;
      let outgoing = 0;
      const outs = [0, 0, 0, 0];
      for (let dir = 0; dir < 4; dir += 1) {
        const slope = slopes[dir];
        if (slope <= 0) continue;
        const transfer = Math.min(maxOut * (slope / slopeSum), slope * 0.5);
        if (transfer <= MIN_DEPTH) continue;
        outs[dir] = transfer;
        outgoing += transfer;
      }
      if (outgoing > depth) {
        const scale = depth / outgoing;
        outgoing = 0;
        for (let dir = 0; dir < 4; dir += 1) {
          outs[dir] *= scale;
          outgoing += outs[dir];
        }
      }
      if (outgoing <= MIN_DEPTH) continue;
      if(flowChunk?.flowX) for(let dir=0;dir<4;dir++) {
        flowChunk.flowX[flowIndex]+=DIRS[dir][0]*outs[dir]*CELL_SIZE/(step*depth);
        flowChunk.flowZ[flowIndex]+=DIRS[dir][1]*outs[dir]*CELL_SIZE/(step*depth);
      }

      const origin = { ix, iz };
      const loose = sandField.cellAt?.(ix, iz);
      const carriesSand = loose && loose.chunk.sand[loose.index] > 0.00001;
      acc(ix, iz, -outgoing, null);
      for (let dir = 0; dir < 4; dir += 1) {
        if (outs[dir] <= 0) continue;
        acc(ix + DIRS[dir][0], iz + DIRS[dir][1], outs[dir], origin);
        if (carriesSand) sedimentTransfers.push(ix, iz, ix + DIRS[dir][0], iz + DIRS[dir][1], outs[dir]);
      }
    }

    let moved = 0;
    for (const [key, amount] of deltas) {
      if (!(Math.abs(amount) > 0)) continue;
      const split = key.indexOf(",");
      const ix = Number(key.slice(0, split));
      const iz = Number(key.slice(split + 1));
      moved += Math.abs(addToCell(ix, iz, amount, origins.get(key) ?? null));
    }
    for (let i = 0; i < sedimentTransfers.length; i += 5) {
      moved += transportLooseSand(sandField, sedimentTransfers[i], sedimentTransfers[i + 1],
        sedimentTransfers[i + 2], sedimentTransfers[i + 3], sedimentTransfers[i + 4]);
    }
    return moved;
  }

  function forEachDirtyChunk(fn) {
    for (const chunk of waterDirty) {
      if (chunk.waterDirty) fn(chunk, chunk.cx, chunk.cz);
    }
  }

  function markDirty(x, z) {
    const cell = worldToCell(x, z);
    const { cx, cz } = chunkOfCell(cell.x, cell.z);
    const chunk = ensureWaterChunk(cx, cz);
    enqueue(cell.x, cell.z);
    markWaterChunk(chunk);
    chunk.dirty = true;
  }

  function cellToWorld(ix, iz) {
    return cellCenter(ix, iz);
  }

  function depthAtCell(ix, iz) {
    return waterAtCell(ix, iz);
  }

  function setDepthAtCell(ix, iz, depth) {
    const current = waterAtCell(ix, iz);
    addToCell(ix, iz, Math.max(0, finiteNumber(depth, 0)) - current);
  }

  function surfaceHeightAt(x, z, heightAt = defaultHeightAt) {
    const u=x/CELL_SIZE-.5, v=z/CELL_SIZE-.5;
    const ix=Math.floor(u), iz=Math.floor(v), fx=u-ix, fz=v-iz;
    let head=0, weight=0;
    for(let dz=0;dz<2;dz++) for(let dx=0;dx<2;dx++) {
      const depth=waterAtCell(ix+dx,iz+dz);
      if(depth<=MIN_DEPTH)continue;
      const w=(dx?fx:1-fx)*(dz?fz:1-fz);
      const p=cellCenter(ix+dx,iz+dz);
      head+=(heightAt(p.x,p.z)+depth)*w;weight+=w;
    }
    // Dry neighbours have no free water surface. Including their ground in
    // the interpolation makes the pool climb the bank in square patches.
    return weight>1e-6 ? head/weight : heightAt(x,z);
  }

  return {
    CELL_SIZE,
    CHUNK_CELLS,
    cellSize: CELL_SIZE,
    cellsPerChunk: CHUNK_CELLS,
    chunks,
    sandField,
    depthAt,
    depthAtCell,
    surfaceHeightAt,
    setDepthAtCell,
    addWater,
    addDepth,
    stepFlow,
    forEachDirtyChunk,
    markDirty,
    markCellDirty: enqueue,
    worldToCell,
    cellToWorld,
    totalVolume,
  };
}
