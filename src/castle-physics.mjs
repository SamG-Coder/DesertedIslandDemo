const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));

// A compact cohesion/erosion model, in metres and seconds. It deliberately
// operates on castle blocks rather than simulating individual grains.
export function createCastleCondition(itemId = 'wet-sand') {
  return { integrity: 1, moisture: itemId === 'wet-sand' ? 0.64 : 0.12,
    age: 0, waveSeconds: 0, survived: false };
}

export function stepCastleCondition(state, dt, {
  waterDepth = 0, rain = 0, supportLoss = 0, supported = true,
} = {}) {
  const step = clamp(Number(dt) || 0, 0, 2);
  if (!step || state.integrity <= 0) return state;
  const submerged = clamp(waterDepth / 0.18);
  state.age += step;
  state.moisture = clamp(state.moisture + step *
    (submerged * 0.22 + clamp(rain) * 0.015 - (1 - clamp(rain)) * 0.0006));
  // Damp grains bind; very dry and fully saturated moulds are less cohesive.
  const cohesion = clamp(1 - Math.abs(state.moisture - 0.62) / 0.62);
  const wash = submerged * (0.016 + (1 - cohesion) * 0.055);
  const undercut = clamp(supportLoss / 0.15) * 0.38;
  const unsupported = supported ? 0 : 1.8;
  state.integrity = clamp(state.integrity - step * (wash + undercut + unsupported));
  if (submerged > 0.05) state.waveSeconds += step;
  if (state.waveSeconds >= 12 && state.integrity > 0) state.survived = true;
  return state;
}

export function builderRank(xp) {
  if (xp >= 300) return 'Master sculptor';
  if (xp >= 140) return 'Castle architect';
  if (xp >= 50) return 'Sand mason';
  return 'Beach apprentice';
}
