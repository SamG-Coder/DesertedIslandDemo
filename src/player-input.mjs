// Own transient input separately from gameplay so losing focus cannot leave a
// held key, queued jump, or mouse delta active when play resumes.
export function createPlayerInput() {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  let jump = false;
  return {
    keys, look,
    reset() { keys.clear(); look.x = 0; look.y = 0; jump = false; },
    queueJump() { jump = true; },
    sample(active) {
      if (!active) this.reset();
      const frame = {
        forward: Number(keys.has('KeyW') || keys.has('ArrowUp')),
        back: Number(keys.has('KeyS') || keys.has('ArrowDown')),
        left: Number(keys.has('KeyA') || keys.has('ArrowLeft')),
        right: Number(keys.has('KeyD') || keys.has('ArrowRight')),
        sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        jump, lookX: look.x, lookY: look.y,
      };
      jump = false; look.x = 0; look.y = 0;
      return frame;
    },
  };
}

export function shouldCapturePointer({ browser, locked, button }) {
  return browser && !locked && button === 0;
}

export function nextHotbarSlot(current, delta, count = 9) {
  return (current + Math.sign(delta) + count) % count;
}
