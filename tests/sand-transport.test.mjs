import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandField } from '../src/sand-chunk-field.mjs';
import { transportLooseSand } from '../src/sand-transport.mjs';
import { createWaterField } from '../src/water-flow.mjs';

const sum = field => [...field.chunks.values()].reduce((total, chunk) =>
  total + chunk.sand.reduce((a, b) => a + b, 0), 0);

test('flow carries loose sand across chunks while conserving sediment', () => {
  const field = createSandField({ baseHeight: 0 });
  field.addAtCell(15, 0, 0.5);
  const before = sum(field);
  assert.equal(transportLooseSand(field, 15, 0, 16, 0, 0.2), 0.008);
  assert.ok(field.cellAt(16, 0).chunk.sand[0] > 0);
  assert.ok(Math.abs(sum(field) - before) < 1e-7);
  assert.ok(field.dirtyCellCount > 0);
});

test('transport cannot excavate the base terrain or overflow a full destination', () => {
  const field = createSandField({ baseHeight: 0 });
  field.addAtCell(0, 0, -0.1);
  assert.equal(transportLooseSand(field, 0, 0, 1, 0, 100), 0);
  field.addAtCell(0, 0, 0.5);
  field.addAtCell(1, 0, 8);
  assert.equal(transportLooseSand(field, 0, 0, 1, 0, 100), 0);
});

test('the water solver actually transports sediment down a wet pile', () => {
  const field = createSandField({ baseHeight: 0 });
  field.addAtCell(0, 0, 0.4);
  const before = sum(field);
  const water = createWaterField(field);
  water.addDepth(0.125, 0.125, 0.5);
  water.stepFlow(0.05);
  assert.ok(field.cellAt(0, 0).chunk.sand[0] < 0.4);
  assert.ok(Math.abs(sum(field) - before) < 1e-6);
});
