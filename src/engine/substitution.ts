// One-way substitution. A premium material can stand in for a base material, not
// the reverse (A-bis rescues A; A never rescues A-bis). Two consequences are
// encoded here, and both are meant to *emerge* into the priority list rather
// than be hard-coded as "buy more of X":
//
//  1. Option value. A premium material carries, on top of its own demand, a
//     discounted claim on the overflow of every base it can rescue — the demand
//     the base can't cover itself. That extends the premium's requirement tail,
//     so its later units keep a non-trivial survival probability. We never plan
//     to cover the base *with* the premium (the overflow is only what spills past
//     a reference coverage of the base, and it is discounted), so the base still
//     covers the bulk of its own demand.
//
//  2. Penalty asymmetry. A material that has a backup is a little less critical;
//     a premium with no upstream backup (and which others lean on) is a little
//     more critical. This rides on the substitution graph, not on names.

import type { Material, World } from "./types";

/** Reference coverage quantile of a base's own demand; overflow past it is what
 *  a premium realistically rescues. */
const BASE_REFERENCE_QUANTILE = 0.7;

function quantileOfUnsorted(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Add discounted base-overflow option value to each premium material's window
 * samples. Operates per trajectory index so correlation between a base and its
 * premium partner is preserved. Returns a new map; inputs are not mutated.
 */
export function applyOptionValue(
  world: World,
  baseWindowSamples: Record<string, number[]>,
  optionDiscount: number,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const id of Object.keys(baseWindowSamples)) out[id] = baseWindowSamples[id].slice();

  for (const m of world.materials) {
    if (m.substitutesFor.length === 0) continue;
    const premiumSamples = out[m.id];
    if (!premiumSamples) continue;
    for (const baseId of m.substitutesFor) {
      const baseSamples = baseWindowSamples[baseId];
      if (!baseSamples) continue;
      const ref = quantileOfUnsorted(baseSamples, BASE_REFERENCE_QUANTILE);
      const n = Math.min(premiumSamples.length, baseSamples.length);
      for (let i = 0; i < n; i++) {
        const overflow = Math.max(0, baseSamples[i] - ref);
        premiumSamples[i] += Math.floor(optionDiscount * overflow);
      }
    }
  }
  return out;
}

/**
 * Stockout-penalty multiplier from the substitution graph. > 1 for a premium
 * with no backup (more painful to miss), < 1 for a material that has a fallback.
 */
export function penaltyFactor(material: Material): number {
  if (material.premium && !material.hasBackup) return 1.25;
  if (material.hasBackup) return 0.8;
  return 1;
}
