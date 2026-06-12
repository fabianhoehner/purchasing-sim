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

/**
 * Expected (mean) requirement decomposition. Because means add, a material's
 * per-good lines sum to its total line, and all material lines sum to the
 * aggregate — so these can be overlaid as a clean decomposition without the
 * clutter of stacking many uncertainty fans.
 */
export interface BreakdownLines {
  /** good id -> material id -> mean requirement per sale month (1..horizon). */
  byGood: Record<string, Record<string, number[]>>;
  /** material id -> mean requirement summed across all goods, per sale month. */
  all: Record<string, number[]>;
  /** good id -> total BOM quantity (units of raw material per finished unit). */
  goodTotalQty: Record<string, number>;
}

export interface McResult {
  config: Config;
  months: number[]; // forecast month indices, 1..horizon
  historyMonths: number[]; // history month indices, -(history-1)..0
  /** Observed history per good and aggregate (single sampled realisation). */
  historyByGood: Record<string, SeriesPoint[]>;
  historyAggregate: SeriesPoint[];
  /** One sampled future trajectory per good — the jagged "scenario" line drawn
   *  in the breakdown view so the future looks like the past, not a smooth mean. */
  futureScenarioByGood: Record<string, number[]>;
  /** Forecast quantile fans per good and aggregate, per future month. */
  forecastByGood: Record<string, Band[]>;
  forecastAggregate: Band[];
  /** Time-shifted raw-material requirement fans per material and aggregate. */
  requirementByMaterial: Record<string, Band[]>;
  requirementAggregate: Band[];
  /** Expected per-material requirement lines (decomposition), see above. */
  breakdown: BreakdownLines;
  /** Sorted (ascending) window-requirement samples per material, for scoring and
   *  the histogram. These ARE option-adjusted: a premium material's samples
   *  include the discounted base-overflow it can rescue. */
  windowSamplesByMaterial: Record<string, number[]>;
  /** Mean window requirement per material — the TRUE expected requirement,
   *  computed pre-option-value. Used as the demand weight in α/β and shown as
   *  "mean requirement"; it is NOT option-adjusted. */
  windowMeanByMaterial: Record<string, number>;
}

export interface ScoredUnit {
  materialId: string;
  n: number; // the n-th unit of this material (1-based)
  pConsumed: number; // P(requirement >= n)
  reward: number; // euros of expected reward this unit adds
  scorePerEuro: number; // reward / unitCost
  unitCost: number;
  economic: boolean; // reward > 0 (above the economic optimum)
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
  expectedCoverage: number; // service level (α): demand-weighted P(no stockout)
  expectedFillRate: number; // fill rate (β): share of demand units served
  stockoutExposureAvoided: number; // expected penalty euros avoided by funded units
  unitsFunded: number;
  /** Share of finished-good demand (margin×demand weighted) that can be COMPLETED
   *  given the funded stock — a good needs all its parts, so this is the weakest
   *  link across each good's BOM, not per-part availability. */
  fgFulfilment: number;
  /** Finished-good margin per month the funded stock can complete (€/mo). */
  enabledOutputValue: number;
}

export interface SubstitutionPair {
  donorId: string; // the premium material that can stand in
  donorName: string;
  baseId: string; // the base material it can rescue
  baseName: string;
  enabled: boolean;
}

/** A point on the spend → coverage curves (diminishing returns). */
export interface InvestmentPoint {
  spend: number;
  fillRate: number; // β: share of demand units served (concave)
  serviceLevel: number; // α: P(no stockout), demand-weighted (S-shaped)
}

/**
 * The value-derivation graph: a raw material's worth flows from the finished
 * goods it completes. good importance = margin × mean demand; a material's
 * importance = the sum of the importance of every good that uses it (a good
 * depends on each of its parts to be built, so each part carries the good's full
 * weight).
 */
export interface ValueGood {
  id: string;
  name: string;
  importance: number; // margin × mean demand (€/mo)
}
export interface ValueMaterial {
  id: string;
  name: string;
  importance: number; // Σ importance of goods that use it
  goodCount: number; // how many finished goods use it
  shared: boolean;
  premium: boolean;
}
export interface ValueEdge {
  goodId: string;
  materialId: string;
  flow: number; // the good's importance carried into this material
}
export interface ValueGraph {
  goods: ValueGood[]; // sorted by importance desc
  materials: ValueMaterial[]; // sorted by importance desc
  edges: ValueEdge[];
  maxGoodImportance: number;
  maxMaterialImportance: number;
}

export interface Prepared {
  world: World;
  mc: McResult;
  priorityList: ScoredUnit[]; // sorted by score/€ desc
  valueByMaterial: Record<string, number>; // enabled-margin value per unit
  penaltyByMaterial: Record<string, number>; // stockout penalty per unit
  substitutionPairs: SubstitutionPair[]; // stable across enable/disable toggles
  /** Spend → fill-rate / service-level curves, from €0 to the full list. */
  investmentCurve: InvestmentPoint[];
  /** The economic optimum: spend on all value-positive (reward > 0) units. */
  economicSpend: number;
  economicFillRate: number;
  economicServiceLevel: number;
  /** Values if the whole (extended) list is funded — the practical ceiling. */
  fullFillRate: number;
  fullServiceLevel: number;
  /** Where value comes from: finished goods → the raw materials they complete. */
  valueGraph: ValueGraph;
}
