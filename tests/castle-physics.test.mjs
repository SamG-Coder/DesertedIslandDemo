import test from 'node:test';
import assert from 'node:assert/strict';
import { createCastleCondition, stepCastleCondition, builderRank } from '../src/castle-physics.mjs';
import { sampleOceanHeight, OCEAN_WAVES } from '../src/ocean-waves.mjs';
import { createAdaptiveResolution } from '../src/adaptive-resolution.mjs';

test('sheltered damp castles remain stable; undermining destroys the support', () => {
  const state = createCastleCondition();
  for (let i = 0; i < 60; i++) stepCastleCondition(state, 1);
  assert.equal(state.integrity, 1);
  for (let i = 0; i < 4; i++) stepCastleCondition(state, 1, { supportLoss: 0.15 });
  assert.equal(state.integrity, 0);
});

test('damp moulds initially resist washing better than dry moulds', () => {
  const wet = createCastleCondition('wet-sand'), dry = createCastleCondition('dry-sand');
  stepCastleCondition(wet, 0.1, { waterDepth: 0.12 });
  stepCastleCondition(dry, 0.1, { waterDepth: 0.12 });
  assert.ok(wet.integrity > dry.integrity);
});

test('flooding saturates and ultimately washes away sand, without negative integrity', () => {
  const state = createCastleCondition();
  for (let i = 0; i < 120; i++) stepCastleCondition(state, 1, { waterDepth: 0.3 });
  assert.equal(state.integrity, 0);
  assert.equal(state.moisture, 1);
});

test('unsupported upper blocks fall, and zero delta preserves condition', () => {
  const state = createCastleCondition();
  const before = { ...state };
  stepCastleCondition(state, 0, { supported: false });
  assert.deepEqual(state, before);
  stepCastleCondition(state, 1, { supported: false });
  assert.equal(state.integrity, 0);
  assert.equal(builderRank(0), 'Beach apprentice');
  assert.equal(builderRank(300), 'Master sculptor');
});

test('CPU wave heights match the shared displacement sum and fade at shore', () => {
  assert.equal(sampleOceanHeight(0, 0, 100), 0.16);
  const expected = 0.16 + OCEAN_WAVES.reduce((sum, w) => sum + Math.sin(
    (4 * w.x + 30 * w.z) * w.frequency + 3 * w.speed) * w.amplitude, 0);
  assert.ok(Math.abs(sampleOceanHeight(4, 30, 3) - expected) < 1e-12);
});

test('adaptive resolution ignores pauses, reduces sustained load and recovers gradually', () => {
  const quality = createAdaptiveResolution();
  for (let i = 0; i < 100; i++) quality.observe(1000);
  assert.equal(quality.scale, 1);
  for (let i = 0; i < 1000; i++) quality.observe(35);
  assert.equal(quality.scale, 0.6);
  for (let i = 0; i < 3000; i++) quality.observe(16);
  assert.equal(quality.scale, 1);
});
