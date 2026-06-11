// Stock-reward scoring. For each material we walk candidate units n = 1, 2, 3…
// and ask what the n-th unit is worth:
//
//   reward(n) = P(consumed) * value_unlocked  -  P(not consumed) * leftover_cost
//
//   P(consumed)    = P(requirement >= n), the survival function of the
//                    material's window-requirement distribution.
//   value_unlocked = the stockout penalty avoided — a demand-weighted blend of
//                    the margins of the goods this material gates (its
//                    "stockout cover"), scaled by the penalty dial and the
//                    substitution penalty factor.
//   leftover_cost  = carrying the unit through the coverage window if it turns
//                    out not to be needed.
//
// score/€ = reward / unitCost lets every material's units compete for the same
// next euro of budget. This is intentionally the simpler stock-reward form; the
// signature is the seam where an action-reward scorer could drop in.

import { meanHorizonLevel } from "./demand";
import { survivalAtLeast } from "./montecarlo";
import { penaltyFactor } from "./substitution";
import type { McResult, ScoredUnit, World } from "./types";

/**
 * Per-unit "stockout cover" value of each material: the demand-weighted blend of
 * the gated goods' margins. A unit of a material that needs qty per finished
 * good unlocks margin/qty of that good; we weight across goods by each good's
 * share of the material's total mean requirement.
 */
export function computeMaterialValues(world: World): Record<string, number> {
  const meanLevel = new Map<string, number>();
  for (const g of world.goods) meanLevel.set(g.id, meanHorizonLevel(g, world.horizonMonths));

  // gather BOM lines per material
  const linesByMaterial = new Map<string, { goodId: string; qty: number }[]>();
  for (const e of world.bom) {
    if (!linesByMaterial.has(e.materialId)) linesByMaterial.set(e.materialId, []);
    linesByMaterial.get(e.materialId)!.push({ goodId: e.goodId, qty: e.qtyPerUnit });
  }
  const marginByGood = new Map(world.goods.map((g) => [g.id, g.margin]));

  const values: Record<string, number> = {};
  for (const m of world.materials) {
    const lines = linesByMaterial.get(m.id) ?? [];
    let total = 0;
    for (const l of lines) total += (meanLevel.get(l.goodId) ?? 0) * l.qty;
    if (total <= 0) {
      values[m.id] = 0;
      continue;
    }
    let v = 0;
    for (const l of lines) {
      const contribution = (meanLevel.get(l.goodId) ?? 0) * l.qty;
      const share = contribution / total;
      const perUnitFromGood = (marginByGood.get(l.goodId) ?? 0) / l.qty;
      v += share * perUnitFromGood;
    }
    values[m.id] = v;
  }
  return values;
}

/** Stockout penalty per unit = dial * enabled margin * substitution factor. */
export function computePenalties(
  world: World,
  values: Record<string, number>,
  stockoutPenaltyRatio: number,
): Record<string, number> {
  const penalties: Record<string, number> = {};
  for (const m of world.materials) {
    penalties[m.id] = stockoutPenaltyRatio * (values[m.id] ?? 0) * penaltyFactor(m);
  }
  return penalties;
}

/**
 * Walk the units of one material. We do NOT stop at the economic optimum
 * (reward <= 0); we keep going to a high quantile of the requirement
 * distribution, so a large budget can chase a high fill rate. Units past the
 * optimum carry a negative reward (and negative score/€), so the global ranking
 * naturally places them last — you only buy them when you over-invest. Each unit
 * is flagged `economic` (reward > 0) so the optimum can be marked.
 */
export function scoreMaterial(
  materialId: string,
  unitCost: number,
  carryingRateAnnual: number,
  leadTimeMean: number,
  sortedWindow: number[],
  penaltyPerUnit: number,
): ScoredUnit[] {
  const N = sortedWindow.length;
  if (N === 0) return [];
  const windowYears = Math.max(leadTimeMean, 1) / 12;
  const leftoverCost = unitCost * carryingRateAnnual * windowYears;
  // extend to the 99.5th percentile so the tail (the last few % of fill) exists
  const q995 = sortedWindow[Math.min(N - 1, Math.floor(0.995 * (N - 1)))];
  const nMax = Math.max(1, Math.ceil(q995));
  const units: ScoredUnit[] = [];
  for (let n = 1; n <= nMax; n++) {
    const p = survivalAtLeast(sortedWindow, n);
    const reward = p * penaltyPerUnit - (1 - p) * leftoverCost;
    units.push({
      materialId,
      n,
      pConsumed: p,
      reward,
      scorePerEuro: reward / Math.max(unitCost, 1e-6),
      unitCost,
      economic: reward > 0,
    });
  }
  return units;
}

/** Score every unit of every material into one flat list (unsorted). */
export function scoreAll(
  world: World,
  mc: McResult,
  stockoutPenaltyRatio: number,
): { units: ScoredUnit[]; values: Record<string, number>; penalties: Record<string, number> } {
  const values = computeMaterialValues(world);
  const penalties = computePenalties(world, values, stockoutPenaltyRatio);
  const units: ScoredUnit[] = [];
  for (const m of world.materials) {
    const sorted = mc.windowSamplesByMaterial[m.id] ?? [];
    const scored = scoreMaterial(m.id, m.unitCost, m.carryingRateAnnual, m.leadTimeMean, sorted, penalties[m.id]);
    for (const u of scored) units.push(u);
  }
  return { units, values, penalties };
}
