// Demand generation. A latent level process per good (baseline + gentle trend +
// seasonality) drives an overdispersed negative-binomial count. Observed history
// is one sampled realisation of that latent process; the forecast is a fan of
// sampled trajectories. An optional shared shock moves all goods together, which
// is what fattens the tail of any material they have in common.

import { Rng } from "./rng";
import type { FinishedGood } from "./types";

/** Latent expected demand for a good at month offset t (t can be negative). */
export function latentLevel(good: FinishedGood, t: number): number {
  const trend = Math.pow(good.trend, t);
  const seasonal = 1 + good.seasonalAmp * Math.sin((2 * Math.PI * (t + good.seasonalPhase)) / 12);
  return Math.max(0, good.baseLevel * trend * seasonal);
}

/** Mean latent demand of a good averaged over the forecast horizon. */
export function meanHorizonLevel(good: FinishedGood, horizon: number): number {
  let s = 0;
  for (let t = 1; t <= horizon; t++) s += latentLevel(good, t);
  return s / horizon;
}

/**
 * One observed history realisation per good. Months run from -(history-1)..0,
 * sampled from the latent process so the chart's history and forecast are
 * visibly the same world.
 */
export function sampleHistory(
  goods: FinishedGood[],
  history: number,
  rng: Rng,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const good of goods) {
    const series: number[] = [];
    for (let i = history - 1; i >= 0; i--) {
      const t = -i; // -(history-1) .. 0
      series.push(rng.negBinomial(latentLevel(good, t), good.dispersion));
    }
    out[good.id] = series;
  }
  return out;
}

/**
 * One forecast trajectory: demand[goodIndex][monthIndex] for months 1..horizon.
 * When correlated, a single shared multiplicative shock (mean 1) scales every
 * good's level this trajectory, so goods swing up and down together.
 */
export function sampleTrajectory(
  goods: FinishedGood[],
  horizon: number,
  rng: Rng,
  correlatedShock: boolean,
  shockSd: number,
): number[][] {
  const shock = correlatedShock ? rng.lognormalUnitMean(shockSd) : 1;
  const out: number[][] = [];
  for (const good of goods) {
    const series = new Array<number>(horizon);
    for (let t = 1; t <= horizon; t++) {
      series[t - 1] = rng.negBinomial(latentLevel(good, t) * shock, good.dispersion);
    }
    out.push(series);
  }
  return out;
}
