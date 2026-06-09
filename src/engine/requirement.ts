// Expected raw-material requirement decomposition. For each good g and material
// m, the mean requirement at sale month t is just qty(g,m) × E[demand_g(t)], and
// E[demand] is the latent level (the shared shock has mean 1, on or off). Means
// add, so these lines stack exactly into per-material totals and the aggregate —
// which is what lets the chart overlay one line per material cleanly.

import { latentLevel } from "./demand";
import type { BreakdownLines, World } from "./types";

export function meanRequirementLines(world: World): BreakdownLines {
  const H = world.horizonMonths;
  const byGood: Record<string, Record<string, number[]>> = {};
  const all: Record<string, number[]> = {};
  const goodTotalQty: Record<string, number> = {};
  for (const g of world.goods) {
    byGood[g.id] = {};
    goodTotalQty[g.id] = 0;
  }
  for (const m of world.materials) all[m.id] = new Array<number>(H).fill(0);

  const goodById = new Map(world.goods.map((g) => [g.id, g]));
  for (const e of world.bom) {
    const g = goodById.get(e.goodId);
    if (!g) continue;
    const line = byGood[e.goodId][e.materialId] ?? new Array<number>(H).fill(0);
    for (let t = 1; t <= H; t++) {
      const v = e.qtyPerUnit * latentLevel(g, t);
      line[t - 1] += v;
      all[e.materialId][t - 1] += v;
    }
    byGood[e.goodId][e.materialId] = line;
    goodTotalQty[e.goodId] += e.qtyPerUnit;
  }
  return { byGood, all, goodTotalQty };
}
