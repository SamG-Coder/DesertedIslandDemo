import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerInput, shouldCapturePointer, nextHotbarSlot } from '../src/player-input.mjs';

test('inventory or focus loss clears movement, jump and accumulated look', () => {
  const input = createPlayerInput();
  input.keys.add('KeyW'); input.keys.add('ShiftLeft');
  input.look.x = 50; input.look.y = -20; input.queueJump();
  const paused = input.sample(false);
  assert.equal(paused.forward, 0); assert.equal(paused.sprint, false);
  assert.equal(paused.jump, false); assert.equal(paused.lookX, 0);
  assert.deepEqual(input.sample(true), paused);
});

test('jump and look are consumed once while a movement key remains held', () => {
  const input = createPlayerInput(); input.keys.add('KeyW');
  input.look.x = 12; input.queueJump();
  assert.equal(input.sample(true).jump, true);
  const next = input.sample(true);
  assert.equal(next.jump, false); assert.equal(next.lookX, 0); assert.equal(next.forward, 1);
  input.reset(); assert.equal(input.sample(true).forward, 0);
});

test('browser capture click is distinct from gameplay and hotbar wraps', () => {
  assert.equal(shouldCapturePointer({browser:true,locked:false,button:0}), true);
  assert.equal(shouldCapturePointer({browser:true,locked:true,button:0}), false);
  assert.equal(shouldCapturePointer({browser:false,locked:false,button:0}), false);
  assert.equal(nextHotbarSlot(8,100), 0);
  assert.equal(nextHotbarSlot(0,-100), 8);
});
