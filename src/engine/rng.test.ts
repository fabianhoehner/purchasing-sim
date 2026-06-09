import { describe, expect, it } from "vitest";
import { Rng } from "./rng";

function moments(xs: number[]): { mean: number; variance: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length;
  return { mean, variance };
}

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different streams for different seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it("uniform stays within bounds", () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.uniform(3, 9);
      expect(x).toBeGreaterThanOrEqual(3);
      expect(x).toBeLessThan(9);
    }
  });

  it("negative binomial matches its target mean and overdispersed variance", () => {
    const r = new Rng(123);
    const mean = 50;
    const dispersion = 2; // variance should be ~ mean * dispersion = 100
    const xs = Array.from({ length: 40000 }, () => r.negBinomial(mean, dispersion));
    const m = moments(xs);
    expect(m.mean).toBeGreaterThan(48);
    expect(m.mean).toBeLessThan(52);
    expect(m.variance).toBeGreaterThan(85);
    expect(m.variance).toBeLessThan(115);
  });

  it("dispersion of 1 behaves like a Poisson (variance ~ mean)", () => {
    const r = new Rng(99);
    const xs = Array.from({ length: 40000 }, () => r.negBinomial(20, 1));
    const m = moments(xs);
    expect(m.variance).toBeGreaterThan(17);
    expect(m.variance).toBeLessThan(23);
  });

  it("lognormalUnitMean averages to ~1", () => {
    const r = new Rng(5);
    const xs = Array.from({ length: 50000 }, () => r.lognormalUnitMean(0.3));
    const m = moments(xs);
    expect(m.mean).toBeGreaterThan(0.96);
    expect(m.mean).toBeLessThan(1.04);
  });
});
