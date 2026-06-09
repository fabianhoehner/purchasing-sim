// Orchestration. `prepare` runs the expensive pipeline (world → Monte Carlo →
// scoring → priority list); `allocateFor` runs only the cheap budget walk. The
// UI memoises `prepare` on structural inputs and re-runs `allocateFor` on every
// budget tick, so the slider stays smooth.

import { allocate, buildPriorityList } from "./allocate";
import { runMonteCarlo } from "./montecarlo";
import { scoreAll } from "./scoring";
import { applyOverrides, buildWorld } from "./world";
import type { Allocation, Config, Prepared, SubstitutionPair } from "./types";

export const DEFAULT_CONFIG: Config = {
  seed: 1742,
  historyMonths: 24,
  horizonMonths: 12,
  manufacturingLeadTime: 1,
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

  return {
    world,
    mc,
    priorityList,
    valueByMaterial: values,
    penaltyByMaterial: penalties,
    substitutionPairs,
  };
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
