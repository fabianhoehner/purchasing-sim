// Deterministic, seedable PRNG and the small family of count distributions the
// demand model needs. Everything funnels through a single uniform stream so a
// given seed reproduces the same world on reload.

export class Rng {
  private s: number;

  constructor(seed: number) {
    // Avoid a zero state, which mulberry32 handles poorly.
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform in [0, 1). mulberry32 — small, fast, good enough for a demo. */
  next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }

  /** Standard normal via Box–Muller. */
  normal(mean = 0, sd = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + sd * z;
  }

  /** Lognormal with the given log-space sd, scaled so its mean is exactly 1. */
  lognormalUnitMean(sigma: number): number {
    if (sigma <= 0) return 1;
    return Math.exp(this.normal(-0.5 * sigma * sigma, sigma));
  }

  /** Gamma(shape, scale) via Marsaglia & Tsang, with the shape<1 boost. */
  gamma(shape: number, scale: number): number {
    if (shape <= 0) return 0;
    if (shape < 1) {
      const u = this.next();
      return this.gamma(shape + 1, scale) * Math.pow(u, 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.normal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.next();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
    }
  }

  /** Poisson(lambda). Knuth for small means; a rounded normal for large ones
   *  (where Knuth's e^-lambda underflows and the loop is slow). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      const l = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= this.next();
      } while (p > l);
      return k - 1;
    }
    return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
  }

  /**
   * Negative binomial drawn as a Gamma–Poisson mixture, parameterised by the
   * mean and the dispersion d = variance / mean (>= 1). d == 1 collapses to a
   * plain Poisson. The latent gamma rate is what makes the count overdispersed.
   */
  negBinomial(mean: number, dispersion: number): number {
    if (mean <= 0) return 0;
    if (dispersion <= 1.0000001) return this.poisson(mean);
    // var = mean * dispersion = mean + mean^2 / r  =>  r = mean / (dispersion - 1)
    const r = mean / (dispersion - 1);
    const lambda = this.gamma(r, mean / r);
    return this.poisson(lambda);
  }
}
