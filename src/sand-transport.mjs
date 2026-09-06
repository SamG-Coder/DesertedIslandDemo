import { HEIGHT_BOUNDS } from './terrain.mjs';

// Transport loose deposits, leaving the base island intact. Water carries up
// to 4% sediment per cell-to-cell transfer by volume.
export function transportLooseSand(field, ix, iz, nx, nz, waterTransfer) {
  if (!field?.cellAt || !(waterTransfer > 0)) return 0;
  const from = field.cellAt(ix, iz);
  if (!from) return 0;
  const center = field.cellCenter(nx, nz);
  if (center.x < HEIGHT_BOUNDS.minX || center.x > HEIGHT_BOUNDS.maxX
    || center.z < HEIGHT_BOUNDS.minZ || center.z > HEIGHT_BOUNDS.maxZ) return 0;
  const available = Math.max(0, from.chunk.sand[from.index]);
  if (available < 0.00001) return 0;
  field.ensureChunk(Math.floor(nx / field.chunkCells), Math.floor(nz / field.chunkCells));
  const to = field.cellAt(nx, nz);
  const moved = Math.min(available, waterTransfer * 0.04, Math.max(0, 8 - to.chunk.sand[to.index]));
  if (moved <= 0) return 0;
  from.chunk.sand[from.index] -= moved;
  to.chunk.sand[to.index] += moved;
  field.markDirty(ix, iz);
  field.markDirty(nx, nz);
  field.markCellDirty(ix, iz);
  field.markCellDirty(nx, nz);
  return moved;
}
