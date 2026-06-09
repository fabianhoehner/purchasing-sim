// BOM explosion. A finished-good demand trajectory becomes raw-material
// requirement by summing, for each material, the BOM quantity times the demand
// of every good that uses it. Raw consumption leads the sale by the
// manufacturing lead time, so the requirement curve is the demand curve shifted
// earlier in time — that shift is purely positional (it changes *when* a unit is
// needed, not *how many*). How many units a single purchase must cover is set
// later by the procurement lead-time window (see montecarlo.ts).

import type { BomEntry, World } from "./types";

export interface BomIndex {
  /** materialId -> the BOM lines that consume it. */
  byMaterial: Map<string, BomEntry[]>;
  /** goodId -> column index in a demand matrix. */
  goodCol: Map<string, number>;
  materialIds: string[];
}

export function buildBomIndex(world: World): BomIndex {
  const byMaterial = new Map<string, BomEntry[]>();
  for (const e of world.bom) {
    if (!byMaterial.has(e.materialId)) byMaterial.set(e.materialId, []);
    byMaterial.get(e.materialId)!.push(e);
  }
  const goodCol = new Map<string, number>();
  world.goods.forEach((g, i) => goodCol.set(g.id, i));
  return { byMaterial, goodCol, materialIds: world.materials.map((m) => m.id) };
}

/**
 * Explode one trajectory. `goodDemand[goodCol][saleMonth]` holds sampled demand
 * for sale months 0..horizon-1. Returns requirement per material indexed by the
 * same sale-month axis (quantities are independent of any lead-time shift; the
 * shift is applied only when plotting).
 */
export function explodeTrajectory(
  index: BomIndex,
  goodDemand: number[][],
  horizon: number,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const materialId of index.materialIds) {
    const lines = index.byMaterial.get(materialId);
    const series = new Array<number>(horizon).fill(0);
    if (lines) {
      for (const line of lines) {
        const col = index.goodCol.get(line.goodId)!;
        const d = goodDemand[col];
        for (let t = 0; t < horizon; t++) series[t] += line.qtyPerUnit * d[t];
      }
    }
    out[materialId] = series;
  }
  return out;
}
