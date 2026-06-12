// Value derivation: a raw material has no worth of its own — its worth flows
// from the finished goods it lets you complete. A good's importance is its
// economic weight (margin × mean demand); because a good needs *all* of its
// parts to be built, each part carries the good's full importance, and a
// material's importance is the sum across every good that uses it. So a part in
// many goods, or under a few very profitable goods, is the one to buy first.
//
// This is the same quantity the scorer already values parts by (its per-unit
// "stockout cover" V_m equals this total divided by the units required); here we
// expose it as a graph so the relationship is legible.

import { meanHorizonLevel } from "./demand";
import type { ValueGraph, World } from "./types";

export function buildValueGraph(world: World): ValueGraph {
  const importanceByGood = new Map<string, number>();
  for (const g of world.goods) {
    importanceByGood.set(g.id, g.margin * meanHorizonLevel(g, world.horizonMonths));
  }

  const matImportance = new Map<string, number>();
  const matCount = new Map<string, number>();
  const edges = world.bom.map((e) => {
    const flow = importanceByGood.get(e.goodId) ?? 0;
    matImportance.set(e.materialId, (matImportance.get(e.materialId) ?? 0) + flow);
    matCount.set(e.materialId, (matCount.get(e.materialId) ?? 0) + 1);
    return { goodId: e.goodId, materialId: e.materialId, flow };
  });

  const byId = new Map(world.materials.map((m) => [m.id, m]));
  const materials = [...matImportance.keys()]
    .map((id) => {
      const m = byId.get(id)!;
      return {
        id,
        name: m.name,
        importance: matImportance.get(id) ?? 0,
        goodCount: matCount.get(id) ?? 0,
        shared: m.shared,
        premium: m.premium,
      };
    })
    .sort((a, b) => b.importance - a.importance);

  const goods = world.goods
    .map((g) => ({ id: g.id, name: g.name, importance: importanceByGood.get(g.id) ?? 0 }))
    .sort((a, b) => b.importance - a.importance);

  return {
    goods,
    materials,
    edges,
    maxGoodImportance: Math.max(1, ...goods.map((g) => g.importance)),
    maxMaterialImportance: Math.max(1, ...materials.map((m) => m.importance)),
  };
}
