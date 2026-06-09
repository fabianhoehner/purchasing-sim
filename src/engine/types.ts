// Shared domain types for the simulation engine. Plain data only — no Maps or
// class instances — so a World/Config can be cloned, serialised, and diffed
// cheaply, and so the UI can hold them in React state without surprises.

export interface FinishedGood {
  id: string;
  name: string;
  /** Baseline monthly demand level (latent). */
  baseLevel: number;
  /** Per-month multiplicative drift (1 = flat). */
  trend: number;
  /** Seasonal amplitude, 0..~0.4. */
  seasonalAmp: number;
  /** Seasonal phase offset in months. */
  seasonalPhase: number;
  /** Overdispersion d = variance / mean (>= 1). */
  dispersion: number;
  /** Contribution margin earned per unit sold (euros). */
  margin: number;
}

export interface Material {
  id: string;
  name: string;
  unitCost: number;
  /** Procurement lead time — a small distribution, not a constant. */
  leadTimeMean: number;
  leadTimeSd: number;
  /** Annualised carrying-cost rate (e.g. 0.27). */
  carryingRateAnnual: number;
  /**
   * One-way compatibility: ids of the materials THIS material can stand in for.
   * e.g. a premium "A-bis" lists ["A"]; A lists nothing. A-bis can rescue A,
   * never the reverse.
   */
  substitutesFor: string[];
  /** Derived convenience flags, filled in by world generation. */
  shared: boolean; // used by more than one finished good
  premium: boolean; // a substitution donor (can rescue another material)
  hasBackup: boolean; // some other material can rescue this one
}

export interface BomEntry {
  goodId: string;
  materialId: string;
  qtyPerUnit: number;
}

export interface World {
  seed: number;
  historyMonths: number;
  horizonMonths: number;
  goods: FinishedGood[];
  materials: Material[];
  bom: BomEntry[];
}

export interface Config {
  seed: number;
  historyMonths: number; // observed history length
  horizonMonths: number; // forecast horizon
  /** Production leads sale by this many periods (raw consumption is earlier). */
  manufacturingLeadTime: number;
  /** Shared demand shock that moves goods up/down together. */
  correlatedShock: boolean;
  shockSd: number; // log-space sd of the shared shock
  nTrajectories: number;
  /** Stockout penalty as a multiple of enabled margin (the tolerance dial). */
  stockoutPenaltyRatio: number;
  /** Default annual carrying-cost rate (materials may carry their own). */
  carryingRateAnnual: number;
  budget: number;
  /** Discount applied to a premium material's substitution option value. */
  optionDiscount: number;
  /** Per-material live edits from the UI. */
  materialOverrides: Record<string, MaterialOverride>;
  /** "<donorId>->.<recipientId>" links the user has switched off. */
  disabledSubstitutions: string[];
}

export interface MaterialOverride {
  unitCost?: number;
  leadTimeMean?: number;
}

/** Five quantiles used to draw a fan: q05, q25, q50, q75, q95. */
export interface Band {
  q05: number;
  q25: number;
  q50: number;
  q75: number;
  q95: number;
}

export interface SeriesPoint {
  /** Month index relative to "now": negative is history, 0..horizon is future. */
  t: number;
  value: number;
}

export interface McResult {
  config: Config;
  months: number[]; // forecast month indices, 1..horizon
  historyMonths: number[]; // history month indices, -(history-1)..0
  /** Observed history per good and aggregate (single sampled realisation). */
  historyByGood: Record<string, SeriesPoint[]>;
  historyAggregate: SeriesPoint[];
  /** Forecast quantile fans per good and aggregate, per future month. */
  forecastByGood: Record<string, Band[]>;
  forecastAggregate: Band[];
  /** Time-shifted raw-material requirement fans per material and aggregate. */
  requirementByMaterial: Record<string, Band[]>;
  requirementAggregate: Band[];
  /** Sorted (ascending) window-requirement samples per material, for scoring. */
  windowSamplesByMaterial: Record<string, number[]>;
  /** Mean window requirement per material (for weighting / display). */
  windowMeanByMaterial: Record<string, number>;
}

export interface ScoredUnit {
  materialId: string;
  n: number; // the n-th unit of this material (1-based)
  pConsumed: number; // P(requirement >= n)
  reward: number; // euros of expected reward this unit adds
  scorePerEuro: number; // reward / unitCost
  unitCost: number;
}

export interface MaterialLine {
  materialId: string;
  name: string;
  qty: number;
  unitCost: number;
  lineCost: number;
  cumulativeSpend: number;
  coverage: number; // P(requirement <= qty) — the service level bought
  meanRequirement: number;
  totalReward: number; // summed reward of the funded units
  marginalScorePerEuro: number; // score/€ of the last funded unit
  funded: boolean;
}

export interface Allocation {
  lines: MaterialLine[]; // every material with >0 demand, funded flag set
  cutIndex: number; // index into the global priority list where the budget ran out
  totalSpend: number;
  budget: number;
  expectedCoverage: number; // demand-weighted mean service level
  stockoutExposureAvoided: number; // expected penalty euros avoided by funded units
  unitsFunded: number;
}

export interface SubstitutionPair {
  donorId: string; // the premium material that can stand in
  donorName: string;
  baseId: string; // the base material it can rescue
  baseName: string;
  enabled: boolean;
}

export interface Prepared {
  world: World;
  mc: McResult;
  priorityList: ScoredUnit[]; // sorted by score/€ desc
  valueByMaterial: Record<string, number>; // enabled-margin value per unit
  penaltyByMaterial: Record<string, number>; // stockout penalty per unit
  substitutionPairs: SubstitutionPair[]; // stable across enable/disable toggles
}
