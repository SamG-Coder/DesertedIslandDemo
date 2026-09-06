// A scoop is three litres in one 25 cm simulation cell.
export const WATER_SCOOP_DEPTH = .048;
export function collectBucketWater(bucket, sim, hit, seaLevel) {
  if (!hit || hit.kind !== 'terrain') return false;
  const sea = hit.y < seaLevel - .015;
  if (!sea && sim.waterDepthAt(hit.x, hit.z) < WATER_SCOOP_DEPTH) return false;
  if (bucket.tryScoop('water') < 1) return false;
  if (!sea) sim.waterField.addDepth(hit.x, hit.z, -WATER_SCOOP_DEPTH);
  return true;
}
export function pourBucketWater(bucket, sim, hit) {
  if (!hit || hit.kind !== 'terrain' || bucket.fillItemId !== 'water' || bucket.fill <= 0) return false;
  if (!(sim.waterField.addDepth(hit.x, hit.z, WATER_SCOOP_DEPTH) > 0)) return false;
  // Splashing also wets the exposed banks; retain this after the pool drains.
  for (let z=-1;z<=1;z++) for(let x=-1;x<=1;x++) {
    sim.sandField.addWet(hit.x+x*.25, hit.z+z*.25, .7/(1+Math.hypot(x,z)));
  }
  bucket.setFill(bucket.fill - 1, 'water');
  return true;
}
