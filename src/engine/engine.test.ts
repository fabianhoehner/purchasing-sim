import { describe, expect, it } from "vitest";
import { buildBomIndex, explodeTrajectory } from "./bom";
import { meanRequirementLines } from "./requirement";
import { latentLevel } from "./demand";
import { serviceLevelAt, survivalAtLeast } from "./stats";
import { baseReferenceQuantiles, scoreMaterial } from "./scoring";
import { applyOptionValue, penaltyFactor } from "./substitution";
import { runMonteCarlo } from "./montecarlo";
import { allocateFor, DEFAULT_CONFIG, fullListCost, prepare } from "./simulate";
import { applyOverrides, buildWorld } from "./world";
import type { Material, World } from "./types";

function tinyWorld(): World {
  const materials: Material[] = [
    { id: "a", name: "A", unitCost: 5, leadTimeMean: 2, leadTimeSd: 0, carryingRateAnnual: 0.27, substitutesFor: [], shared: true, premium: false, hasBackup: true },
    { id: "abis", name: "A-bis", unitCost: 10, leadTimeMean: 2, leadTimeSd: 0, carryingRateAnnual: 0.27, substitutesFor: ["a"], shared: false, premium: true, hasBackup: false },
  ];
  return {
    seed: 1,
    historyMonths: 4,
    horizonMonths: 3,
    goods: [
      { id: "g1", name: "G1", baseLevel: 10, trend: 1, seasonalAmp: 0, seasonalPhase: 0, dispersion: 1, margin: 100 },
      { id: "g2", name: "G2", baseLevel: 5, trend: 1, seasonalAmp: 0, seasonalPhase: 0, dispersion: 1, margin: 200 },
    ],
    materials,
    bom: [
      { goodId: "g1", materialId: "a", qtyPerUnit: 2 },
      { goodId: "g2", materialId: "abis", qtyPerUnit: 1 },
    ],
  };
}

describe("bom explosion", () => {
  it("sums BOM quantity times the demand of each good that uses a material", () => {
    const world = tinyWorld();
    const index = buildBomIndex(world);
    // goods in order [g1, g2]; horizon 3
    const demand = [
      [4, 6, 2], // g1
      [1, 0, 3], // g2
    ];
    const req = explodeTrajectory(index, demand, 3);
    expect(req["a"]).toEqual([8, 12, 4]); // g1 uses 2 each
    expect(req["abis"]).toEqual([1, 0, 3]); // g2 uses 1 each
  });
});

describe("requirement breakdown", () => {
  it("per-good lines equal qty x latent demand, and material lines sum across goods", () => {
    const world = tinyWorld(); // g1 uses 2x 'a'; g2 uses 1x 'abis'
    const bd = meanRequirementLines(world);
    // g1's line for material 'a' is 2 x latentLevel(g1)
    for (let t = 1; t <= world.horizonMonths; t++) {
      expect(bd.byGood["g1"]["a"][t - 1]).toBeCloseTo(2 * latentLevel(world.goods[0], t), 9);
    }
    // 'a' total across goods equals g1's contribution (only g1 uses it)
    expect(bd.all["a"]).toEqual(bd.byGood["g1"]["a"]);
    // total BOM qty per good
    expect(bd.goodTotalQty["g1"]).toBe(2);
    expect(bd.goodTotalQty["g2"]).toBe(1);
  });

  it("on the default world, per-material lines sum to the aggregate per period", () => {
    const prepared = prepare({ ...DEFAULT_CONFIG, nTrajectories: 200 });
    const bd = prepared.mc.breakdown;
    const H = prepared.world.horizonMonths;
    for (let t = 0; t < H; t++) {
      let sum = 0;
      for (const id of Object.keys(bd.all)) sum += bd.all[id][t];
      // aggregate mean across goods of total requirement, computed independently
      let direct = 0;
      for (const e of prepared.world.bom) {
        const g = prepared.world.goods.find((x) => x.id === e.goodId)!;
        direct += e.qtyPerUnit * latentLevel(g, t + 1);
      }
      expect(sum).toBeCloseTo(direct, 6);
    }
  });
});

describe("survival / service-level queries", () => {
  const sorted = [0, 1, 1, 2, 2, 2, 3, 4, 5, 9]; // 10 samples

  it("survival is non-increasing in n", () => {
    let prev = 1;
    for (let n = 0; n <= 12; n++) {
      const s = survivalAtLeast(sorted, n);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
  });

  it("survival and service level are complementary around a point", () => {
    // P(>=3) counts {3,4,5,9} = 4/10; P(<=2) counts six values = 6/10
    expect(survivalAtLeast(sorted, 3)).toBeCloseTo(0.4, 9);
    expect(serviceLevelAt(sorted, 2)).toBeCloseTo(0.6, 9);
  });
});

describe("scoreMaterial", () => {
  it("produces non-increasing rewards and extends to a high quantile", () => {
    // requirement concentrated around 5
    const sorted = Array.from({ length: 1000 }, (_, i) => (i < 500 ? 5 : i < 800 ? 6 : 8));
    sorted.sort((a, b) => a - b);
    const units = scoreMaterial("m", 4, 0.27, 2, sorted, 40);
    expect(units.length).toBeGreaterThan(0);
    for (let i = 1; i < units.length; i++) {
      expect(units[i].n).toBe(units[i - 1].n + 1);
      expect(units[i].reward).toBeLessThanOrEqual(units[i - 1].reward + 1e-9);
    }
    // extends past the median into the tail (here up to the 99.5th pct = 8)
    expect(units[units.length - 1].n).toBeGreaterThanOrEqual(8);
  });

  it("keeps the value-positive units economic and flags the negative tail", () => {
    // high carrying cost + low penalty pushes the deep-tail units negative
    const sorted = Array.from({ length: 1000 }, (_, i) => (i < 500 ? 5 : i < 800 ? 6 : 8));
    sorted.sort((a, b) => a - b);
    const units = scoreMaterial("m", 100, 0.27, 6, sorted, 5);
    const positive = units.filter((u) => u.economic);
    const negative = units.filter((u) => !u.economic);
    expect(positive.length).toBeGreaterThan(0);
    expect(negative.length).toBeGreaterThan(0);
    // economic units come first (higher n is deeper / less likely consumed)
    expect(Math.max(...positive.map((u) => u.n))).toBeLessThan(Math.min(...negative.map((u) => u.n)));
    for (const u of units) expect(u.economic).toBe(u.reward > 0);
  });
});

describe("substitution", () => {
  it("penalty factor is higher for a backup-less premium, lower for a backed base", () => {
    const world = tinyWorld();
    const a = world.materials.find((m) => m.id === "a")!;
    const abis = world.materials.find((m) => m.id === "abis")!;
    expect(penaltyFactor(abis)).toBeGreaterThan(1);
    expect(penaltyFactor(a)).toBeLessThan(1);
  });

  it("option value extends the premium's window samples but not the base's", () => {
    const world = tinyWorld();
    const base = { a: [0, 5, 10, 20, 30], abis: [1, 1, 1, 1, 1] };
    // reference at the base's median (10) → overflow beyond 10 is rescued
    const out = applyOptionValue(world, base, 0.5, { a: 0.5 });
    expect(out["a"]).toEqual(base["a"]); // base unchanged
    const grew = out["abis"].some((v, i) => v > base["abis"][i]);
    expect(grew).toBe(true);
    const sumBefore = base["abis"].reduce((x, y) => x + y, 0);
    const sumAfter = out["abis"].reduce((x, y) => x + y, 0);
    expect(sumAfter).toBeGreaterThan(sumBefore);
  });

  it("a deeper reference quantile leaves less overflow for the premium", () => {
    const world = tinyWorld();
    const base = { a: [0, 5, 10, 20, 30], abis: [0, 0, 0, 0, 0] };
    const shallow = applyOptionValue(world, base, 1, { a: 0.5 }); // ref ~10
    const deep = applyOptionValue(world, base, 1, { a: 0.95 }); // ref ~28
    const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
    expect(sum(deep["abis"])).toBeLessThan(sum(shallow["abis"]));
  });

  it("the reference quantile rises with the stockout-penalty dial", () => {
    const world = buildWorld({ seed: 1742, historyMonths: 24, horizonMonths: 12, carryingRateAnnual: 0.27 });
    const low = baseReferenceQuantiles(world, 0.05);
    const high = baseReferenceQuantiles(world, 1.0);
    // a base that is rescued (m_bearing): covered deeper when missing it hurts more
    expect(high["m_bearing"]).toBeGreaterThan(low["m_bearing"]);
    expect(high["m_bearing"]).toBeLessThanOrEqual(0.995);
    expect(low["m_bearing"]).toBeGreaterThanOrEqual(0.5);
  });

  it("disabling both links drops the donors' premium flag and 1.25x penalty", () => {
    const base = buildWorld({ seed: 1742, historyMonths: 24, horizonMonths: 12, carryingRateAnnual: 0.27 });
    const world = applyOverrides(base, {}, ["m_bearing_hd->m_bearing", "m_seal_v->m_seal"]);
    for (const id of ["m_bearing_hd", "m_seal_v"]) {
      const m = world.materials.find((x) => x.id === id)!;
      expect(m.substitutesFor).toEqual([]);
      expect(m.premium).toBe(false);
      expect(penaltyFactor(m)).toBe(1);
    }
  });
});

describe("monte carlo option value", () => {
  it("option discount changes the premium's samples but not its true mean", () => {
    const world = buildWorld({ seed: 1742, historyMonths: 24, horizonMonths: 12, carryingRateAnnual: 0.27 });
    const cfg = { ...DEFAULT_CONFIG, nTrajectories: 1500 };
    const withOpt = runMonteCarlo(world, { ...cfg, optionDiscount: 0.5 });
    const noOpt = runMonteCarlo(world, { ...cfg, optionDiscount: 0 });
    // the mean is the TRUE pre-option requirement — identical for any discount
    expect(withOpt.windowMeanByMaterial["m_bearing_hd"]).toBeCloseTo(noOpt.windowMeanByMaterial["m_bearing_hd"], 9);
    // but the scored / histogram samples carry the option overflow, so they differ
    const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
    expect(sum(withOpt.windowSamplesByMaterial["m_bearing_hd"])).toBeGreaterThan(
      sum(noOpt.windowSamplesByMaterial["m_bearing_hd"]),
    );
  });
});

describe("allocation", () => {
  it("never spends more than the budget and a quantity equals funded units", () => {
    const prepared = prepare({ ...DEFAULT_CONFIG, nTrajectories: 800 });
    const full = fullListCost(prepared);
    const budget = Math.round(full * 0.4);
    const alloc = allocateFor(prepared, budget);
    expect(alloc.totalSpend).toBeLessThanOrEqual(budget + 1e-6);
    const funded = alloc.lines.filter((l) => l.funded);
    const unitsFromLines = funded.reduce((a, l) => a + l.qty, 0);
    expect(unitsFromLines).toBe(alloc.unitsFunded);
    // spending more never reduces coverage
    const more = allocateFor(prepared, Math.round(full * 0.8));
    expect(more.expectedCoverage).toBeGreaterThanOrEqual(alloc.expectedCoverage - 1e-9);
    expect(more.totalSpend).toBeGreaterThanOrEqual(alloc.totalSpend);
  });

  it("the economic optimum sits below full cost, and the curves are sensible", () => {
    const prepared = prepare({ ...DEFAULT_CONFIG, nTrajectories: 600 });
    expect(prepared.economicSpend).toBeGreaterThan(0);
    expect(prepared.economicSpend).toBeLessThan(fullListCost(prepared));
    // both metrics improve from the optimum to the full list
    expect(prepared.fullServiceLevel).toBeGreaterThan(prepared.economicServiceLevel);
    expect(prepared.fullFillRate).toBeGreaterThanOrEqual(prepared.economicFillRate);
    // fill rate (β) leads service level (α) at any given spend
    expect(prepared.economicFillRate).toBeGreaterThan(prepared.economicServiceLevel);
    // both curves are monotone non-decreasing in spend
    const c = prepared.investmentCurve;
    for (let i = 1; i < c.length; i++) {
      expect(c[i].spend).toBeGreaterThanOrEqual(c[i - 1].spend - 1e-9);
      expect(c[i].fillRate).toBeGreaterThanOrEqual(c[i - 1].fillRate - 1e-9);
      expect(c[i].serviceLevel).toBeGreaterThanOrEqual(c[i - 1].serviceLevel - 1e-9);
    }
    // funding exactly the economic optimum reproduces ~ its fill rate / service level
    const alloc = allocateFor(prepared, prepared.economicSpend);
    expect(Math.abs(alloc.expectedFillRate - prepared.economicFillRate)).toBeLessThan(0.03);
    expect(Math.abs(alloc.expectedCoverage - prepared.economicServiceLevel)).toBeLessThan(0.03);
    expect(prepared.fullFillRate).toBeGreaterThan(0.95);
  });

  it("a zero budget funds nothing and a huge budget funds the whole list", () => {
    const prepared = prepare({ ...DEFAULT_CONFIG, nTrajectories: 800 });
    const none = allocateFor(prepared, 0);
    expect(none.unitsFunded).toBe(0);
    const all = allocateFor(prepared, fullListCost(prepared) + 1000);
    expect(all.unitsFunded).toBe(prepared.priorityList.length);
  });
});

describe("world generation", () => {
  it("is reproducible for a seed and has the expected shape", () => {
    const a = buildWorld({ seed: 1742, historyMonths: 24, horizonMonths: 12, carryingRateAnnual: 0.27 });
    const b = buildWorld({ seed: 1742, historyMonths: 24, horizonMonths: 12, carryingRateAnnual: 0.27 });
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(a.goods.length).toBe(6);
    expect(a.materials.length).toBeGreaterThanOrEqual(25);
    expect(a.materials.length).toBeLessThanOrEqual(35);
    // both substitution pairs present and one-way
    const premium = a.materials.filter((m) => m.substitutesFor.length > 0);
    expect(premium.length).toBe(2);
    for (const p of premium) {
      expect(p.hasBackup).toBe(false); // nothing rescues the premium
      for (const t of p.substitutesFor) {
        expect(a.materials.find((m) => m.id === t)!.hasBackup).toBe(true);
      }
    }
    // at least a few shared materials
    expect(a.materials.filter((m) => m.shared).length).toBeGreaterThanOrEqual(3);
  });
});
