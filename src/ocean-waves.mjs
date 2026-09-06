// Shared by CPU interactions and the GPU displacement material.
export const OCEAN_WAVES = Object.freeze([
  { x: 0.94, z: 0.34, frequency: 0.42, speed: 0.78, amplitude: 0.20, chop: 0.55 },
  { x: -0.31, z: 0.95, frequency: 0.76, speed: -0.64, amplitude: 0.11, chop: 0.42 },
  { x: 0.62, z: -0.78, frequency: 1.28, speed: 0.96, amplitude: 0.055, chop: 0.28 },
  { x: -0.82, z: -0.56, frequency: 2.15, speed: -1.22, amplitude: 0.028, chop: 0.18 },
  { x: 0.22, z: -0.97, frequency: 3.85, speed: 1.64, amplitude: 0.012, chop: 0.10 },
]);

export function sampleOceanHeight(x, z, seconds, level = 0.16) {
  const t = Math.max(0, Math.min(1, (z - 3.5) / 18.5));
  const envelope = t * t * (3 - 2 * t);
  let height = level;
  for (const wave of OCEAN_WAVES) {
    height += Math.sin((x * wave.x + z * wave.z) * wave.frequency + seconds * wave.speed)
      * wave.amplitude * envelope;
  }
  return height;
}
