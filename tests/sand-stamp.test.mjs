import assert from "node:assert/strict";
import test from "node:test";
import { createSandField } from "../src/sand-chunk-field.mjs";
import {
  DUMP_RADIUS,
  pileKernelWeight,
  stampDump,
} from "../src/sand-stamp.mjs";

test("pile kernel is 1 at the center, 0 at the dump radius, and eases into the beach", () => {
  assert.equal(pileKernelWeight(0, 0, DUMP_RADIUS, DUMP_RADIUS), 1);
  assert.equal(pileKernelWeight(DUMP_RADIUS, 0, DUMP_RADIUS, DUMP_RADIUS), 0);
  assert.equal(pileKernelWeight(0, DUMP_RADIUS, DUMP_RADIUS, DUMP_RADIUS), 0);
  const mid = pileKernelWeight(DUMP_RADIUS * 0.5, 0, DUMP_RADIUS, DUMP_RADIUS);
  const toe = pileKernelWeight(DUMP_RADIUS * 0.9, 0, DUMP_RADIUS, DUMP_RADIUS);
  assert.ok(mid > 0.2, `mid-skirt weight was ${mid}`);
  assert.ok(toe < 0.05, `toe weight was ${toe}`);
  assert.ok(toe < mid);
});

test("a dumped pile raises neighboring cells instead of sitting as a one-cell pyramid", () => {
  const field = createSandField({ heightAt: () => 1 });
  const x = 2.125;
  const z = 2.125;
  stampDump(field, { x, z, forwardX: 0, forwardZ: 1 });
  let nonzero = 0;
  field.forEachChunk(chunk => {
    for (const value of chunk.sand) if (value > 1e-6) nonzero += 1;
  });
  assert.ok(nonzero >= 12, `dump should cover many cells, got ${nonzero}`);
  assert.ok(field.sandAt(x, z) >= 0.1);
  assert.ok(field.sandAt(x + 0.3, z) > 0.02, "skirt should still be raised 30cm from the peak");
  assert.ok(field.sandAt(x + DUMP_RADIUS + 0.05, z) < 0.005, "sand must fade out by the dump radius");
});
