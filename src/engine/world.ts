// Seeded world generation. The *structure* is stable across reseeds — the same
// shared parts and the same two one-way substitution pairs are always present,
// so the teaching story survives — while the *numbers* (costs, demand levels,
// margins, lead times, BOM membership and quantities) are drawn from the seed.

import { Rng } from "./rng";
import type { BomEntry, FinishedGood, Material, World } from "./types";

interface GoodSpec {
  id: string;
  name: string;
  level: [number, number];
  margin: [number, number];
  disp: [number, number];
  premium: boolean; // premium goods pull in the premium materials
}

const GOOD_SPECS: GoodSpec[] = [
  { id: "g_pump_std", name: "Standard Pump", level: [150, 210], margin: [55, 80], disp: [1.6, 2.3], premium: false },
  { id: "g_pump_prm", name: "Premium Pump", level: [55, 95], margin: [180, 260], disp: [1.8, 2.8], premium: true },
  { id: "g_valve", name: "Industrial Valve", level: [180, 260], margin: [28, 45], disp: [1.5, 2.1], premium: false },
  { id: "g_control", name: "Control Module", level: [30, 60], margin: [320, 460], disp: [2.0, 3.2], premium: true },
  { id: "g_compr", name: "Compressor Unit", level: [70, 120], margin: [140, 210], disp: [1.7, 2.6], premium: true },
  { id: "g_booster", name: "Booster Kit", level: [40, 80], margin: [90, 140], disp: [1.9, 3.0], premium: false },
];

// Shared materials live in many BOMs. Two of them are the *base* of a one-way
// substitution pair; their premium partners can rescue them but not vice-versa.
interface SharedSpec {
  id: string;
  name: string;
  cost: [number, number];
  lead: [number, number]; // [mean range low, mean range high]
  leadSd: number;
  qty: [number, number];
  // probability that any given good includes this material; premium goods get
  // a boost so the premium parts concentrate in the expensive products.
  useProb: number;
  premiumBoost?: number;
  substitutesFor?: string; // makes this the premium partner of a base material
  premiumOnly?: boolean; // only premium goods use it
}

const SHARED_SPECS: SharedSpec[] = [
  // Cheap-but-critical: a fastener set, common but no longer in every BOM and at
  // a modest count, so it does not automatically dwarf everything else.
  { id: "m_fastener", name: "Fastener Set", cost: [0.5, 1.8], lead: [1, 2], leadSd: 0.4, qty: [2, 5], useProb: 0.7 },
  // Substitution pair 1: standard vs heavy-duty bearing.
  { id: "m_bearing", name: "Bearing — Standard", cost: [4, 8], lead: [2, 4], leadSd: 0.7, qty: [1, 4], useProb: 0.85 },
  {
    id: "m_bearing_hd",
    name: "Bearing — Heavy-Duty",
    cost: [10, 17],
    lead: [3, 6],
    leadSd: 1.1,
    qty: [1, 2],
    useProb: 0.5,
    premiumBoost: 0.4,
    substitutesFor: "m_bearing",
    premiumOnly: true,
  },
  // Substitution pair 2: nitrile vs viton seal.
  { id: "m_seal", name: "Seal — Nitrile", cost: [2, 5], lead: [1, 3], leadSd: 0.5, qty: [1, 4], useProb: 0.8 },
  {
    id: "m_seal_v",
    name: "Seal — Viton",
    cost: [7, 13],
    lead: [2, 5],
    leadSd: 0.9,
    qty: [1, 3],
    useProb: 0.5,
    premiumBoost: 0.35,
    substitutesFor: "m_seal",
    premiumOnly: true,
  },
  // Expensive shared parts that gate the high-value goods.
  { id: "m_controller", name: "Controller Board", cost: [45, 95], lead: [3, 6], leadSd: 1.2, qty: [1, 1], useProb: 0.55, premiumBoost: 0.4 },
  { id: "m_housing", name: "Cast Housing", cost: [16, 38], lead: [2, 5], leadSd: 0.9, qty: [1, 1], useProb: 0.5 },
];

const UNIQUE_NAME_POOL = [
  "Drive Shaft",
  "Impeller",
  "O-Ring Kit",
  "Wiring Harness",
  "Mounting Bracket",
  "Gasket",
  "Spring Assembly",
  "Pressure Plate",
  "Coupling",
  "Filter Element",
  "Valve Stem",
  "Diaphragm",
  "Rotor",
  "Stator Pack",
  "Heat Sink",
  "Connector Block",
  "Lubricant Charge",
  "Sensor Probe",
  "Retaining Clip",
  "Inlet Manifold",
];

function pick(rng: Rng, range: [number, number]): number {
  return rng.uniform(range[0], range[1]);
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function buildWorld(opts: {
  seed: number;
  historyMonths: number;
  horizonMonths: number;
  carryingRateAnnual: number;
}): World {
  const rng = new Rng(opts.seed);

  const goods: FinishedGood[] = GOOD_SPECS.map((spec, i) => ({
    id: spec.id,
    name: spec.name,
    baseLevel: Math.round(pick(rng, spec.level)),
    // Some goods grow, some decline — so the aggregate isn't a scaled individual.
    trend: rng.uniform(0.982, 1.022),
    // Pronounced, and the phases are spread around the year (with a little
    // jitter) so goods peak in different months and the aggregate has a genuinely
    // different shape than any single good.
    seasonalAmp: rng.uniform(0.12, 0.45),
    seasonalPhase: (i * 2 + rng.int(0, 1)) % 12,
    dispersion: round1(pick(rng, spec.disp)),
    margin: Math.round(pick(rng, spec.margin)),
  }));

  const materials: Material[] = [];
  const bom: BomEntry[] = [];
  const usedNames = new Set<string>();

  // --- shared materials + their BOM membership -----------------------------
  for (const spec of SHARED_SPECS) {
    materials.push({
      id: spec.id,
      name: spec.name,
      unitCost: round1(pick(rng, spec.cost)),
      leadTimeMean: round1(pick(rng, spec.lead)),
      leadTimeSd: spec.leadSd,
      carryingRateAnnual: opts.carryingRateAnnual,
      substitutesFor: spec.substitutesFor ? [spec.substitutesFor] : [],
      shared: false, // set below from actual membership
      premium: !!spec.substitutesFor,
      hasBackup: false, // set below
    });

    for (const good of goods) {
      const gSpec = GOOD_SPECS.find((g) => g.id === good.id)!;
      if (spec.premiumOnly && !gSpec.premium) continue;
      const p = spec.useProb + (gSpec.premium ? spec.premiumBoost ?? 0 : 0);
      if (rng.next() < Math.min(1, p)) {
        bom.push({ goodId: good.id, materialId: spec.id, qtyPerUnit: rng.int(spec.qty[0], spec.qty[1]) });
      }
    }
    usedNames.add(spec.name);
  }

  // Guarantee each premium part is actually pulled by at least one good, and
  // that its base partner is too — otherwise the substitution story is moot.
  for (const spec of SHARED_SPECS) {
    if (!spec.substitutesFor) continue;
    ensureUsed(spec.id, bom, goods, GOOD_SPECS, rng, spec.qty, true);
    ensureUsed(spec.substitutesFor, bom, goods, GOOD_SPECS, rng, [1, 3], false);
  }

  // --- unique materials, a handful per good --------------------------------
  let nameIdx = 0;
  for (const good of goods) {
    const count = rng.int(3, 5);
    for (let i = 0; i < count; i++) {
      const baseName = UNIQUE_NAME_POOL[nameIdx % UNIQUE_NAME_POOL.length];
      nameIdx++;
      const id = `m_${good.id}_${i}`;
      const name = `${baseName} (${shortGood(good.name)})`;
      materials.push({
        id,
        name,
        unitCost: round1(rng.uniform(3, 42)),
        leadTimeMean: round1(rng.uniform(1, 6)),
        leadTimeSd: rng.uniform(0.4, 1.3),
        carryingRateAnnual: opts.carryingRateAnnual,
        substitutesFor: [],
        shared: false,
        premium: false,
        hasBackup: false,
      });
      // A wider quantity spread, so a unique high-count part can sometimes be
      // the biggest line — the dominant material varies across goods.
      bom.push({ goodId: good.id, materialId: id, qtyPerUnit: rng.int(1, 6) });
    }
  }

  // --- derive convenience flags from the finished BOM ----------------------
  const goodsByMaterial = new Map<string, Set<string>>();
  for (const e of bom) {
    if (!goodsByMaterial.has(e.materialId)) goodsByMaterial.set(e.materialId, new Set());
    goodsByMaterial.get(e.materialId)!.add(e.goodId);
  }
  const backed = new Set<string>();
  for (const m of materials) for (const t of m.substitutesFor) backed.add(t);
  for (const m of materials) {
    m.shared = (goodsByMaterial.get(m.id)?.size ?? 0) > 1;
    m.hasBackup = backed.has(m.id);
  }

  return {
    seed: opts.seed,
    historyMonths: opts.historyMonths,
    horizonMonths: opts.horizonMonths,
    goods,
    materials,
    bom,
  };
}

function ensureUsed(
  materialId: string,
  bom: BomEntry[],
  goods: FinishedGood[],
  specs: GoodSpec[],
  rng: Rng,
  qty: [number, number],
  premiumOnly: boolean,
): void {
  if (bom.some((e) => e.materialId === materialId)) return;
  const candidates = goods.filter((g) => {
    const s = specs.find((x) => x.id === g.id)!;
    return premiumOnly ? s.premium : true;
  });
  const g = candidates[rng.int(0, candidates.length - 1)];
  bom.push({ goodId: g.id, materialId, qtyPerUnit: rng.int(qty[0], qty[1]) });
}

function shortGood(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("");
}

/** Apply the user's live per-material edits and substitution toggles. */
export function applyOverrides(
  world: World,
  overrides: Record<string, { unitCost?: number; leadTimeMean?: number }>,
  disabledSubstitutions: string[],
): World {
  const disabled = new Set(disabledSubstitutions);
  const materials = world.materials.map((m) => {
    const o = overrides[m.id];
    const substitutesFor = m.substitutesFor.filter((t) => !disabled.has(`${m.id}->${t}`));
    return {
      ...m,
      unitCost: o?.unitCost ?? m.unitCost,
      leadTimeMean: o?.leadTimeMean ?? m.leadTimeMean,
      substitutesFor,
    };
  });
  const backed = new Set<string>();
  for (const m of materials) for (const t of m.substitutesFor) backed.add(t);
  for (const m of materials) m.hasBackup = backed.has(m.id);
  return { ...world, materials };
}
