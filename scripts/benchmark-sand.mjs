import { performance } from 'node:perf_hooks';
import { createSandField } from '../src/sand-chunk-field.mjs';
import { relaxSandRepose } from '../src/sand-repose.mjs';

// Isolate queue draining from terrain sampling and rendering. Baseline mirrors
// the former pair of Array.shift calls with the same string-key deduplication.
const count = 40000;
function queueTrial(legacy) {
  const field = createSandField({ baseHeight: 0 });
  const list = [], keys = new Set();
  for (let i = 0; i < count; i++) {
    if (legacy) { list.push(i, 0); keys.add(`${i},0`); }
    else field.markCellDirty(i, 0);
  }
  const start = performance.now();
  if (legacy) {
    while (list.length) {
      const taken = [];
      for (let i = 0, n = Math.min(256, list.length / 2); i < n; i++) {
        const x = list.shift(), z = list.shift();
        keys.delete(`${x},${z}`);
        taken.push(x, z);
      }
    }
  } else while (field.dirtyCellCount) field.takeDirtyCells(256);
  return performance.now() - start;
}
const field = createSandField({ baseHeight: 0 });
field.addAtCell(8, 8, 2);
let steps = 0;
while (field.dirtyCellCount && steps < 3000) {
  relaxSandRepose(field, 0.05);
  steps++;
}
const legacyMs = queueTrial(true), currentMs = queueTrial(false);
console.log(JSON.stringify({ queueCells: count, legacyDrainMs: legacyMs,
  currentDrainMs: currentMs, queueSpeedup: legacyMs / currentMs,
  pileStepsUntilSleep: steps, remainingActiveCells: field.dirtyCellCount }, null, 2));
