import { createSandField } from "./sand-chunk-field.mjs";
import { relaxSandRepose } from "./sand-repose.mjs";
import { isSandPile as pileFromSand, stampDig as stampSandDig, stampDump as stampSandDump, stampScoop as stampSandScoop } from "./sand-stamp.mjs";
import { createWaterField } from "./water-flow.mjs";
import { stepSeepage } from "./water-seepage.mjs";
import {
  WATER_LEVEL as DEFAULT_WATER_LEVEL,
  terrainHeight as defaultTerrainHeight,
} from "./terrain.mjs";

const DEFAULT_MAX_CELLS = 256;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, finiteNumber(value, 0)));
}

function asHit(xOrHit, z) {
  if (xOrHit != null && typeof xOrHit === "object") return xOrHit;
  return { x: finiteNumber(xOrHit), z: finiteNumber(z) };
}

export function createTerrainSim({
  terrainHeight = defaultTerrainHeight,
  waterLevel = DEFAULT_WATER_LEVEL,
  maxCells = DEFAULT_MAX_CELLS,
} = {}) {
  const sampleTerrain = typeof terrainHeight === "function"
    ? terrainHeight
    : defaultTerrainHeight;
  const level = finiteNumber(waterLevel, DEFAULT_WATER_LEVEL);
  const budget = Math.max(1, Math.floor(finiteNumber(maxCells, DEFAULT_MAX_CELLS)));

  let waterField;
  const sandField = createSandField({ heightAt: sampleTerrain, onHeightChange(ix, iz) {
    for (let z=-1;z<=1;z++) for(let x=-1;x<=1;x++) waterField?.markCellDirty(ix+x, iz+z);
  } });
  waterField = createWaterField(sandField);

  function heightAt(x, z) {
    return sampleTerrain(x, z) + finiteNumber(sandField.sandAt(x, z));
  }

  function waterDepthAt(x, z) {
    return Math.max(0, finiteNumber(waterField.depthAt?.(x, z) ?? sandField.waterAt?.(x, z)));
  }

  function wetnessAt(x, z) {
    return clamp01(sandField.wetAt?.(x, z));
  }

  function stampDig(xOrHit, z) {
    return stampSandDig(sandField, asHit(xOrHit, z));
  }

  function stampScoop(xOrHit, z) {
    return stampSandScoop(sandField, asHit(xOrHit, z));
  }

  function isSandPile(xOrHit, z) {
    const hit = asHit(xOrHit, z);
    return pileFromSand(sandField.sandAt, hit.x, hit.z);
  }

  function stampDump(xOrHit, zOrOptions, maybeOptions) {
    if (xOrHit != null && typeof xOrHit === "object") {
      return stampSandDump(sandField, xOrHit, zOrOptions ?? {});
    }
    return stampSandDump(
      sandField,
      { x: finiteNumber(xOrHit), z: finiteNumber(zOrOptions) },
      maybeOptions ?? {},
    );
  }

  function update(dt, options = {}) {
    const cells = Math.max(1, Math.floor(finiteNumber(options.maxCells, budget)));
    const step = {
      maxCells: cells,
      heightAt,
      baseHeightAt: sampleTerrain,
      wetnessAt,
      waterDepthAt,
      waterLevel: level,
    };
    const seeped = stepSeepage(waterField, sandField, dt, step) || 0;
    const sandMoved = relaxSandRepose(sandField, dt, step) || 0;
    const flowed = waterField.stepFlow(dt, step) || 0;
    return sandMoved + flowed + seeped;
  }

  return {
    heightAt,
    waterDepthAt,
    wetnessAt,
    stampDig,
    stampDump,
    stampScoop,
    isSandPile,
    sandAt(x, z) {
      return finiteNumber(sandField.sandAt(x, z));
    },
    update,
    dirtyRecords() {
      return sandField.dirtyRecords?.() ?? [];
    },
    get sandField() {
      return sandField;
    },
    get waterField() {
      return waterField;
    },
  };
}
