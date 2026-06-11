// Orchestration. `prepare` runs the expensive pipeline (world → Monte Carlo →
// scoring → priority list); `allocateFor` runs only the cheap budget walk. The
// UI memoises `prepare` on structural inputs and re-runs `allocateFor` on every
// budget tick, so the slider stays smooth.

import { allocate, buildPriorityList } from "./allocate";
import { runMonteCarlo, serviceLevelAt } from "./montecarlo";
import { scoreAll } from "./scoring";
import { applyOverrides, buildWorld } from "./world";
import type { Allocation, Config, InvestmentPoint, Prepared, SubstitutionPair } from "./types";

export const DEFAULT_CONFIG: Config = {
  seed: 1742,
  historyMonths: 24,
  horizonMonths: 12,
  correlatedShock: false,
  shockSd: 0.25,
  nTrajectories: 3000,
  stockoutPenaltyRatio: 0.5,
  carryingRateAnnual: 0.27,
  budget: 60000,
  optionDiscount: 0.5,
  materialOverrides: {},
  disabledSubstitutions: [],
};

export function prepare(config: Config): Prepared {
  const base = buildWorld({
    seed: config.seed,
    historyMonths: config.historyMonths,
    horizonMonths: config.horizonMonths,
    carryingRateAnnual: config.carryingRateAnnual,
  });
  const world = applyOverrides(base, config.materialOverrides, config.disabledSubstitutions);
  const mc = runMonteCarlo(world, config);
  const { units, values, penalties } = scoreAll(world, mc, config.stockoutPenaltyRatio);
  const priorityList = buildPriorityList(units);

  // Derive substitution pairs from the *base* world so the toggles persist even
  // when a link is switched off (which removes it from the working world).
  const disabled = new Set(config.disabledSubstitutions);
  const nameById = new Map(base.materials.map((m) => [m.id, m.name]));
  const substitutionPairs: SubstitutionPair[] = [];
  for (const m of base.materials) {
    for (const baseId of m.substitutesFor) {
      substitutionPairs.push({
        donorId: m.id,
        donorName: m.name,
        baseId,
        baseName: nameById.get(baseId) ?? baseId,
        enabled: !disabled.has(`${m.id}->${baseId}`),
      });
    }
  }

  const curve = buildInvestmentCurve(mc, priorityList);

  return {
    world,
    mc,
    priorityList,
    valueByMaterial: values,
    penaltyByMaterial: penalties,
    substitutionPairs,
    investmentCurve: curve.points,
    economicSpend: curve.economicSpend,
    economicFillRate: curve.economicFillRate,
    economicServiceLevel: curve.economicServiceLevel,
    fullFillRate: curve.fullFillRate,
    fullServiceLevel: curve.fullServiceLevel,
  };
}

/**
 * Walk the ranked list cumulatively, tracking two curves as each unit is funded:
 *  - fill rate (β): expected share of demand units served. The n-th unit of a
 *    material is consumed with probability pConsumed = survival(n), so the
 *    marginal fill it adds is exactly pConsumed — high for early near-certain
 *    units, low for the tail → concave.
 *  - service level (α): demand-weighted P(no stockout) = P(req <= qty). S-shaped.
 * Also returns the economic optimum (where score/€ crosses zero) and the ceiling.
 */
function buildInvestmentCurve(
  mc: Prepared["mc"],
  priorityList: Prepared["priorityList"],
): {
  points: InvestmentPoint[];
  economicSpend: number;
  economicFillRate: number;
  economicServiceLevel: number;
  fullFillRate: number;
  fullServiceLevel: number;
} {
  const meanReq = mc.windowMeanByMaterial;
  const sorted = mc.windowSamplesByMaterial;
  const mats = new Set(priorityList.map((u) => u.materialId));
  let totalDemand = 0;
  let alphaNum = 0; // sum of serviceLevel_m * meanReq_m
  const qty = new Map<string, number>();
  for (const id of mats) {
    const w = meanReq[id] ?? 0;
    totalDemand += w;
    alphaNum += serviceLevelAt(sorted[id] ?? [], 0) * w;
  }
  const beta = (served: number) => (totalDemand > 0 ? served / totalDemand : 0);
  const alpha = () => (totalDemand > 0 ? alphaNum / totalDemand : 0);

  const fullCost = priorityList.reduce((a, u) => a + u.unitCost, 0);
  const step = fullCost > 0 ? fullCost / 400 : 1;
  const points: InvestmentPoint[] = [{ spend: 0, fillRate: 0, serviceLevel: alpha() }];

  let spend = 0;
  let served = 0;
  let lastRecorded = 0;
  let economicSpend = fullCost;
  let economicFillRate = 0;
  let economicServiceLevel = alpha();
  let crossed = false;

  for (const u of priorityList) {
    if (!crossed && u.scorePerEuro <= 0) {
      economicSpend = spend;
      economicFillRate = beta(served);
      economicServiceLevel = alpha();
      crossed = true;
    }
    const id = u.materialId;
    const q0 = qty.get(id) ?? 0;
    const arr = sorted[id] ?? [];
    served += u.pConsumed;
    alphaNum += (serviceLevelAt(arr, q0 + 1) - serviceLevelAt(arr, q0)) * (meanReq[id] ?? 0);
    qty.set(id, q0 + 1);
    spend += u.unitCost;
    if (spend - lastRecorded >= step) {
      points.push({ spend, fillRate: beta(served), serviceLevel: alpha() });
      lastRecorded = spend;
    }
  }
  const fullFillRate = beta(served);
  const fullServiceLevel = alpha();
  points.push({ spend, fillRate: fullFillRate, serviceLevel: fullServiceLevel });
  if (!crossed) {
    economicSpend = spend;
    economicFillRate = fullFillRate;
    economicServiceLevel = fullServiceLevel;
  }
  return { points, economicSpend, economicFillRate, economicServiceLevel, fullFillRate, fullServiceLevel };
}

export function allocateFor(prepared: Prepared, budget: number): Allocation {
  return allocate(prepared.world, prepared.mc, prepared.priorityList, prepared.penaltyByMaterial, budget);
}

/** Total cash needed to fund every positive-reward unit — the natural slider max. */
export function fullListCost(prepared: Prepared): number {
  let c = 0;
  for (const u of prepared.priorityList) c += u.unitCost;
  return c;
}
