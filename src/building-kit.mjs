export const EXTRA_MOLDS = Object.freeze(['Foundation', 'Square tower', 'Round tower', 'Pillar',
  'Cone roof', 'Dome', 'Stairs', 'Ramp', 'Corner wall', 'Window wall', 'Bridge',
  'Battlement', 'Buttress', 'Balcony', 'Curved wall', 'Gatehouse', 'Fortress keep']);
export const BUILD_SCALES = Object.freeze([1, 2, 4]);
export const GRID_STEP = 0.25;
export function buildSandCost(scale = 1) { return Math.round(3 * scale ** 3); }
export function snapBuildCoordinate(value, enabled) {
  return enabled ? Math.round(value / GRID_STEP) * GRID_STEP : value;
}
