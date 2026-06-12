// Budget allocation. Every (material, unit n) pair from every material competes
// in one global priority list, ranked by return on cash (score per euro). The
// budget is spent strictly top-down, giving a single clean cut line: everything
// above it is funded, everything below falls short. A material's purchase
// quantity is simply how many of its units landed above the cut.
//
// This step is deliberately cheap so the budget slider can re-run it live; the
// expensive Monte Carlo and scoring upstream do not re-run when only the budget
// moves.

import { meanHorizonLevel } from "./demand";
import { serviceLevelAt } from "./stats";
import type { Allocation, MaterialLine, McResult, ScoredUnit, World } from "./types";

/** Sort units into the global priority list: best return on cash first. */
export function buildPriorityList(units: ScoredUnit[]): ScoredUnit[] {
  return [...units].sort((a, b) => b.scorePerEuro - a.scorePerEuro || b.reward - a.reward);
}

export function allocate(
  world: World,
  mc: McResult,
  priorityList: ScoredUnit[],
  penalties: Record<string, number>,
  budget: number,
): Allocation {
  const qty = new Map<string, number>();
  const fundedReward = new Map<string, number>();
  const marginal = new Map<string, number>();
  const firstRank = new Map<string, number>();
  const bestScore = new Map<string, number>();

  let spend = 0;
  let cutIndex = priorityList.length;
  let unitsFunded = 0;
  let stockoutExposureAvoided = 0;
  let servedUnits = 0; // expected demand units served = sum of funded pConsumed
  let funding = true; // flips false at the cut; we keep scanning for the table

  for (let i = 0; i < priorityList.length; i++) {
    const u = priorityList[i];
    if (!firstRank.has(u.materialId)) firstRank.set(u.materialId, i);
    if (!bestScore.has(u.materialId)) bestScore.set(u.materialId, u.scorePerEuro);

    if (funding && spend + u.unitCost <= budget) {
      spend += u.unitCost;
      unitsFunded++;
      qty.set(u.materialId, (qty.get(u.materialId) ?? 0) + 1);
      fundedReward.set(u.materialId, (fundedReward.get(u.materialId) ?? 0) + u.reward);
      marginal.set(u.materialId, u.scorePerEuro);
      stockoutExposureAvoided += u.pConsumed * (penalties[u.materialId] ?? 0);
      servedUnits += u.pConsumed;
    } else if (funding) {
      // first unit we cannot afford: this is the single, clean cut line. We
      // stop funding here (no skipping ahead to cheaper units) but keep walking
      // so every material below still gets a row in the table.
      cutIndex = i;
      funding = false;
    }
  }

  // One line per material that has any demand worth scoring (appears in the
  // priority list), funded or not.
  const considered = new Set<string>([...firstRank.keys()]);
  const lines: MaterialLine[] = [];
  for (const m of world.materials) {
    if (!considered.has(m.id)) continue;
    const q = qty.get(m.id) ?? 0;
    const sorted = mc.windowSamplesByMaterial[m.id] ?? [];
    lines.push({
      materialId: m.id,
      name: m.name,
      qty: q,
      unitCost: m.unitCost,
      lineCost: q * m.unitCost,
      cumulativeSpend: 0, // filled after ordering
      coverage: serviceLevelAt(sorted, q),
      meanRequirement: mc.windowMeanByMaterial[m.id] ?? 0,
      totalReward: fundedReward.get(m.id) ?? 0,
      marginalScorePerEuro: marginal.get(m.id) ?? bestScore.get(m.id) ?? 0,
      funded: q > 0,
    });
  }

  // Order: funded first in priority order, then unfunded by how close they came.
  lines.sort((a, b) => {
    if (a.funded !== b.funded) return a.funded ? -1 : 1;
    if (a.funded) return (firstRank.get(a.materialId) ?? 0) - (firstRank.get(b.materialId) ?? 0);
    return (bestScore.get(b.materialId) ?? 0) - (bestScore.get(a.materialId) ?? 0);
  });

  let cum = 0;
  for (const line of lines) {
    if (line.funded) {
      cum += line.lineCost;
      line.cumulativeSpend = cum;
    }
  }

  // Two aggregate metrics across the considered materials:
  //  - service level (α): demand-weighted P(no stockout) — S-shaped in spend.
  //  - fill rate (β): share of demand units actually served — concave in spend.
  let wsum = 0;
  let wcov = 0;
  for (const line of lines) {
    wsum += line.meanRequirement;
    wcov += line.coverage * line.meanRequirement;
  }
  const expectedCoverage = wsum > 0 ? wcov / wsum : 0;
  const expectedFillRate = wsum > 0 ? servedUnits / wsum : 0;

  // Finished-good output: a good can be completed only as well as its weakest
  // component (it needs all its parts). So fulfilment is the min part-coverage
  // across each good's BOM, weighted by the good's economic importance — this is
  // the "capacity to finish finished goods", not per-part availability.
  const coverageByMaterial = new Map(lines.map((l) => [l.materialId, l.coverage]));
  const componentsByGood = new Map<string, string[]>();
  for (const e of world.bom) {
    if (!componentsByGood.has(e.goodId)) componentsByGood.set(e.goodId, []);
    componentsByGood.get(e.goodId)!.push(e.materialId);
  }
  let weightSum = 0;
  let weightedCompletion = 0;
  let enabledOutputValue = 0;
  for (const g of world.goods) {
    const comps = componentsByGood.get(g.id) ?? [];
    if (comps.length === 0) continue;
    let completion = 1;
    for (const mId of comps) completion = Math.min(completion, coverageByMaterial.get(mId) ?? 0);
    const weight = g.margin * meanHorizonLevel(g, world.horizonMonths);
    weightSum += weight;
    weightedCompletion += completion * weight;
    enabledOutputValue += completion * weight;
  }
  const fgFulfilment = weightSum > 0 ? weightedCompletion / weightSum : 0;

  return {
    lines,
    cutIndex,
    totalSpend: spend,
    budget,
    expectedCoverage,
    expectedFillRate,
    stockoutExposureAvoided,
    unitsFunded,
    fgFulfilment,
    enabledOutputValue,
  };
}
