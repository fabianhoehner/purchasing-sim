# Manufacturing Purchasing Simulator

A browser-based teaching simulator for buying raw materials when finished-good
demand is uncertain. It generates probabilistic demand for a set of finished
goods, explodes that demand through bills of material into raw-material
requirements, and ranks every candidate purchase into a single economic priority
list, Lokad-style. Given a budget, it fills that list top-down and shows what to
buy — and a per-part requirement histogram shows why each quantity was chosen.

> **The teaching point.** A raw material has no value of its own — its value is
> *derived* from the finished goods it lets you complete: the importance of those
> goods (margin × demand) and how many of them depend on it. So you don't optimise
> each part's availability in isolation; you buy the **capacity to finish finished
> goods**. Parts shared across many products, or that gate very profitable ones,
> earn priority — and that priority *emerges* from the economics, it is not wired
> in by hand.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests (vitest)
npm run build      # type-check + production build to dist/
```

Deploys to Vercel with the default Vite preset — no extra configuration.

## What you can watch happen

Move the controls and the two signature behaviours appear and disappear:

- **Shared parts get bought past their mean.** Any upswing in any good that uses
  a material raises that material's need, so its requirement survival function
  stays high deep into the tail and the priority list keeps buying it well beyond
  average demand. Flip the **correlated-shock** toggle on and the effect
  strengthens (in the default world the shared fastener jumps ~4.9k → ~6.2k units
  at the same budget). There is no "shared ⇒ overstock" rule — it falls out of
  the requirement distribution.

- **Premium substitutes carry option value.** A premium material (e.g. the
  heavy-duty bearing) is scored on its own demand *plus* a discounted claim on the
  overflow of the base it can rescue — but only the overflow *beyond the base's own
  economic coverage*, so it's a thin flexibility buffer, not a plan to cover the
  base with the premium. Switch the substitution link off and the premium loses
  both that buffer and its backup-less penalty premium (its quantity drops), while
  the base — now without a backup — becomes a little more critical.

Other controls: **budget** (slider + entry, moves the cut line live), **stockout
penalty** (the ratio of stockout penalty to enabled margin), **per-material cost
/ lead-time edits**, and a **reset to defaults**. All selections live in the left
panel so the graphs on the right shift as you change them.

## The model

### Demand
Each finished good has a latent expected-demand process (baseline level, gentle
trend, mild seasonality). Observed history is one realisation sampled from it;
the forecast is a fan of sampled trajectories. Counts are **negative binomial**,
drawn as a Gamma–Poisson mixture and parameterised by a dispersion
`d = variance / mean ≥ 1`, so demand is overdispersed. An optional shared
multiplicative **shock** (mean 1) moves all goods together when correlation is on.

### Bills of material and lead time
Each good has a BOM over up to ten materials; a few materials are shared across
many goods (so their aggregate demand is large and lumpy), the rest are unique.
Goods are given distinct seasonal phases and trends, so the aggregate requirement
genuinely differs in shape from any single good (not "an individual with a zero
added"). Two materials are the base of a **one-way substitution pair** (a premium
part can stand in for a base part, never the reverse).

Each material's **procurement lead time** sets the coverage window the current
purchase is responsible for — it is a small distribution, not a constant, and the
window length is sampled per trajectory, so lead-time uncertainty widens the
requirement tail. (An earlier version also drew a manufacturing-lead-time *shift*
between the two charts; since it changed timing but no quantity or economics, it
was dropped as visual complexity without insight.)

### Requirement distribution (Monte Carlo)
A few thousand demand trajectories are sampled, each exploded through the BOMs
and summed per material over its coverage window. The empirical distribution of
each material's window requirement is what the scorer reads. The premium
material's samples are extended by the discounted base-overflow option value,
computed per trajectory so correlation is preserved.

### Scoring (stock-reward)
For each material we walk candidate units `n = 1, 2, 3, …`:

```
reward(n) = P(requirement ≥ n) · value_unlocked  −  P(requirement < n) · leftover_cost
score/€   = reward(n) / unitCost
```

- `P(requirement ≥ n)` is the survival function of the window-requirement
  distribution.
- `value_unlocked` is the **stockout cover**: a demand-weighted blend of the
  margins of the goods the material gates, scaled by the stockout-penalty dial
  and a substitution penalty factor (a part with a backup is a little less
  critical; a backup-less premium is a little more).
- `leftover_cost` is carrying the unit through the window if it is not needed.

Note the framing: a consumed unit unlocks the **stockout penalty avoided**
(dial × margin), *not* margin + penalty. The lost sale is assumed recoverable —
a backorder — so the margin itself is never at stake in the reward; the dial is
the whole teaching device. That is why a very low dial legitimately shrinks the
optimum: if missing a unit barely costs anything, you rationally hold very little.

This is deliberately the simpler **stock-reward** formulation, chosen for
clarity. Lokad's **action-reward** is the more advanced version (it works in
ordering space, separates ordering frequency from lead time, and respects
seasonality and varying lead times across trajectories). The scoring function is
isolated behind a clean signature so it can be swapped without touching the UI.

### Ranking and budget
Every `(material, unit n)` pair from every material competes in one global list,
sorted by score per euro. The list extends past the **economic optimum** (the
last value-positive unit) into the tail, with those units ranked last — so a
large budget can chase a higher fill rate, uneconomically. The budget is spent
strictly top-down, giving a single clean cut line; a material's purchase quantity
is how many of its units cleared the cut. The default budget is the economic
optimum. The budget walk is cheap and re-runs live; the Monte Carlo and scoring
only re-run when a structural input changes.

### Where value comes from (the headline)
A raw material's worth is the finished goods it completes. Each good's importance
is `margin × mean demand`; because a good needs **all** its parts to be built,
each part carries the good's full importance, and a material's value is the sum
across every good that uses it:

```
value(material m) = Σ over goods g that use m of (margin_g × mean_demand_g)
```

This is exactly the per-unit value the scorer already uses (its "stockout cover"
is this total divided by the units required), so the ranking is unchanged — the
**value-flow graph** just makes the relationship legible: value pours from goods
into the parts that complete them, and the most-shared / highest-margin-gating
parts rise to the top of the buy list.

The summary reports **finished-good output**, not per-part availability:
- **Fulfilment** — the share of finished-good demand (importance-weighted) you can
  actually *complete*. A good is only as buildable as its **weakest** component, so
  this is the min part-coverage across each good's BOM — buying one part to 99%
  does nothing if a sibling is at 50%.
- **Output value enabled** — `Σ over goods of completion × margin × demand` (€/mo):
  the finished-good margin the funded stock unlocks.

(An earlier build reported part-level service level α and fill rate β; that framing
measured *part* availability rather than *finished-good* completion, so it was
removed in favour of the two metrics above.)

## Defaults

6 finished goods · ~30 raw materials (a handful shared, two substitution pairs) ·
monthly periods · 24 months history · 12 months horizon · procurement lead times
1–6 · carrying cost 27%/yr · stockout penalty 0.5×
margin · 3,000 Monte Carlo trajectories · a single fixed-seed world and observed
past, so a reload always reproduces the same status quo. The probabilistic part
is the *future* projection (the Monte Carlo fan), not the past — there is one
world and one history, deliberately, to keep the focus on the purchasing
decision rather than on alternative pasts.

## Engine layout

The simulation engine is plain, independently testable modules, separate from the
UI:

| Module | Responsibility |
| --- | --- |
| `engine/rng.ts` | Seeded PRNG + negative-binomial / gamma / Poisson samplers |
| `engine/world.ts` | Seeded world: goods, materials, BOMs, substitution pairs |
| `engine/demand.ts` | Latent process → observed history + forecast trajectories |
| `engine/bom.ts` | Explode demand → per-material requirements |
| `engine/requirement.ts` | Expected per-material requirement lines (the breakdown) |
| `engine/montecarlo.ts` | Trajectories → per-material requirement distribution + chart fans |
| `engine/substitution.ts` | One-way `substitutes_for` routing + premium option value |
| `engine/scoring.ts` | Stock-reward score per unit (swappable seam) + value helpers |
| `engine/value.ts` | Finished-good → raw-material value-derivation graph |
| `engine/stats.ts` | Sorted-sample survival / service-level queries |
| `engine/allocate.ts` | Pool units, rank by score/€, walk the budget cut line, finished-good output |
| `engine/simulate.ts` | Orchestration; splits the expensive prepare from the cheap allocate |

The UI (`src/components`, `src/hooks`) renders two time-aligned charts (sharing
the exact same months — no offset), the prioritised purchase table with the cut
line, a per-part requirement histogram, and the controls. The good selector
drives both charts: the top shows that good's (or the aggregate) demand fan, and
the bottom shows the raw materials it explodes into. The requirement chart has
three views — a **breakdown** (one line per material, each with its own exploded
history and one sampled future, so past and future look alike and the lines sum
to the total), the **total** with its uncertainty fan, and a **drill-down** to a
single material's fan. Hover snaps to the nearest line.

The **requirement histogram** explains a line in the purchase list: the empirical
distribution of a part's requirement over its coverage window, with the chosen
buy quantity drawn as a vertical line. The mass to its left is the share of demand
scenarios that quantity covers (`P(requirement ≤ quantity)`). Click any table row
(or the left selector) to inspect a part; move the budget and the line slides
live.

The **value-flow graph** shows where each part's worth comes from — finished
goods (sized by importance) on one side, raw materials (sized by derived value)
on the other, BOM links between — making the buy order legible: the parts under
the most, or most profitable, goods are funded first.
