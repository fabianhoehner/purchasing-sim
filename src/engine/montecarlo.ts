// Monte Carlo requirement builder. Samples a few thousand finished-good demand
// trajectories, explodes each through the BOMs, and keeps two things:
//   * per-period quantile fans (for the two charts), and
//   * the empirical distribution of each material's requirement over the window
//     the current purchase is responsible for (for scoring).
//
// The window length is itself sampled per trajectory from the material's
// procurement lead-time distribution, so lead-time uncertainty widens the
// requirement tail — which is part of why shared/long-lead parts get bought deep.

import { buildBomIndex } from "./bom";
import { sampleHistory, sampleTrajectory } from "./demand";
import { meanRequirementLines } from "./requirement";
import { Rng } from "./rng";
import { applyOptionValue } from "./substitution";
import type { Band, Config, McResult, SeriesPoint, World } from "./types";

function clampInt(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

function bandFromSorted(sorted: number[]): Band {
  const q = (p: number): number => {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  };
  return { q05: q(0.05), q25: q(0.25), q50: q(0.5), q75: q(0.75), q95: q(0.95) };
}

function emptyMatrix(periods: number, n: number): number[][] {
  const m = new Array<number[]>(periods);
  // Zero-filled: aggregate matrices accumulate with +=, so holes would yield NaN.
  for (let t = 0; t < periods; t++) m[t] = new Array<number>(n).fill(0);
  return m;
}

export function runMonteCarlo(world: World, config: Config): McResult {
  const n = config.nTrajectories;
  const H = config.horizonMonths;
  const index = buildBomIndex(world);

  // --- observed history: a single realisation, its own deterministic stream --
  const histRng = new Rng((config.seed ^ 0x1a2b3c4d) >>> 0);
  const histRaw = sampleHistory(world.goods, config.historyMonths, histRng);
  const historyMonths: number[] = [];
  for (let i = world.historyMonths - 1; i >= 0; i--) historyMonths.push(-i);
  const historyByGood: Record<string, SeriesPoint[]> = {};
  const historyAggregate: SeriesPoint[] = historyMonths.map((t) => ({ t, value: 0 }));
  for (const good of world.goods) {
    const series = histRaw[good.id];
    historyByGood[good.id] = series.map((value, i) => ({ t: historyMonths[i], value }));
    for (let i = 0; i < series.length; i++) historyAggregate[i].value += series[i];
  }

  // --- one sampled future "scenario" (own stream) ---------------------------
  // The breakdown view draws this single realisation so the future is jagged
  // like the past, and per-material lines sum exactly to the aggregate.
  const scenRng = new Rng((config.seed ^ 0x2f9a7c1b) >>> 0);
  const scenario = sampleTrajectory(world.goods, H, scenRng, config.correlatedShock, config.shockSd);
  const futureScenarioByGood: Record<string, number[]> = {};
  world.goods.forEach((g, gi) => (futureScenarioByGood[g.id] = scenario[gi]));

  // --- forecast trajectories + explosion ------------------------------------
  const goodPeriod: Record<string, number[][]> = {};
  for (const g of world.goods) goodPeriod[g.id] = emptyMatrix(H, n);
  const aggGoodPeriod = emptyMatrix(H, n);
  const matPeriod: Record<string, number[][]> = {};
  for (const m of world.materials) matPeriod[m.id] = emptyMatrix(H, n);
  const aggMatPeriod = emptyMatrix(H, n);
  const baseWindow: Record<string, number[]> = {};
  for (const m of world.materials) baseWindow[m.id] = new Array<number>(n);

  const mcRng = new Rng((config.seed ^ 0x51ed270b) >>> 0);

  for (let k = 0; k < n; k++) {
    const demand = sampleTrajectory(world.goods, H, mcRng, config.correlatedShock, config.shockSd);

    for (let gi = 0; gi < world.goods.length; gi++) {
      const id = world.goods[gi].id;
      const d = demand[gi];
      for (let t = 0; t < H; t++) {
        goodPeriod[id][t][k] = d[t];
        aggGoodPeriod[t][k] += d[t];
      }
    }

    for (const m of world.materials) {
      const lines = index.byMaterial.get(m.id);
      const windowLen = clampInt(mcRng.normal(m.leadTimeMean, m.leadTimeSd), 1, H);
      let windowSum = 0;
      const periodArr = matPeriod[m.id];
      for (let t = 0; t < H; t++) {
        let req = 0;
        if (lines) {
          for (const line of lines) req += line.qtyPerUnit * demand[index.goodCol.get(line.goodId)!][t];
        }
        periodArr[t][k] = req;
        aggMatPeriod[t][k] += req;
        if (t < windowLen) windowSum += req;
      }
      baseWindow[m.id][k] = windowSum;
    }
  }

  // --- substitution option value, then sort window samples for survival ------
  const windowSamplesByMaterial = applyOptionValue(world, baseWindow, config.optionDiscount);
  const windowMeanByMaterial: Record<string, number> = {};
  for (const id of Object.keys(windowSamplesByMaterial)) {
    const arr = windowSamplesByMaterial[id];
    let s = 0;
    for (const v of arr) s += v;
    windowMeanByMaterial[id] = s / arr.length;
    arr.sort((a, b) => a - b); // ascending, for survival queries in scoring
  }

  // --- collapse per-period samples to quantile fans --------------------------
  const months: number[] = [];
  for (let t = 1; t <= H; t++) months.push(t);

  const bandsFromMatrix = (mtx: number[][]): Band[] =>
    mtx.map((col) => {
      col.sort((a, b) => a - b);
      return bandFromSorted(col);
    });

  const forecastByGood: Record<string, Band[]> = {};
  for (const g of world.goods) forecastByGood[g.id] = bandsFromMatrix(goodPeriod[g.id]);
  const forecastAggregate = bandsFromMatrix(aggGoodPeriod);
  const requirementByMaterial: Record<string, Band[]> = {};
  for (const m of world.materials) requirementByMaterial[m.id] = bandsFromMatrix(matPeriod[m.id]);
  const requirementAggregate = bandsFromMatrix(aggMatPeriod);

  return {
    config,
    months,
    historyMonths,
    historyByGood,
    historyAggregate,
    futureScenarioByGood,
    forecastByGood,
    forecastAggregate,
    requirementByMaterial,
    requirementAggregate,
    breakdown: meanRequirementLines(world),
    windowSamplesByMaterial,
    windowMeanByMaterial,
  };
}

/** Survival P(requirement >= n) from an ascending-sorted sample array. */
export function survivalAtLeast(sortedAsc: number[], n: number): number {
  if (sortedAsc.length === 0) return 0;
  // first index with value >= n
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] >= n) hi = mid;
    else lo = mid + 1;
  }
  return (sortedAsc.length - lo) / sortedAsc.length;
}

/** Service level P(requirement <= q) from an ascending-sorted sample array. */
export function serviceLevelAt(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 1;
  // count of values <= q
  let lo = 0;
  let hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= q) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedAsc.length;
}
