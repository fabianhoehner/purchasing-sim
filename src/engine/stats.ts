// Small distribution-query helpers over ascending-sorted sample arrays. Kept in
// their own module so both the Monte Carlo layer and the scoring layer can use
// them without an import cycle (montecarlo now imports scoring for the option-
// value reference quantiles, and scoring needs survival queries).

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
