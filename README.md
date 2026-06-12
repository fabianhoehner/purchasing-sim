# Manufacturing Purchasing Simulator

A browser-based teaching simulator for buying raw materials when finished-good
demand is uncertain. It generates probabilistic demand for a set of finished
goods, explodes that demand through bills of material into raw-material
requirements, and ranks every candidate purchase into a single economic priority
list, Lokad-style. Given a budget, it fills that list top-down and shows what to
buy — and a per-part requirement histogram shows why each quantity was chosen.

> **The teaching point.** You do not plan to the mean, you plan to the economics
> of the tail. Parts that are shared across many products, or that are hard to
> substitute, earn priority because of the flexibility they buy — and that
> priority *emerges* from the economics, it is not wired in by hand.

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
  heavy-duty bearing) is scored on its own demand *plus* a discounted claim on
  the overflow of the base material it can rescue. That raises its marginal
  reward, but its higher cost slows how far down the list its units appear, so
  the tool holds enough of it for its own demand plus a thin flexibility buffer
  rather than planning to cover the base with it. Switch the substitution link
  off and the premium loses that buffer (its quantity drops) while the base —
  now without a backup — becomes more critical and is bought a little deeper.

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

### Two coverage metrics (α and β)
The **investment-vs-coverage** curve plots both, because they answer different
questions and have different shapes:

- **Service level (α)** — P(no stockout) = the percentile a quantity reaches on
  the requirement distribution. S-shaped in spend; this is the per-part figure on
  the histogram and the table's coverage column.
- **Fill rate (β)** — expected share of demand units served = `Σ pConsumed / Σ
  demand`. Concave in spend (each unit's marginal fill is its consumption
  probability), and nearly maxed by the economic optimum.

At the optimum β is ~99% while α is ~87%: you serve almost all demand, but fully
avoid stockouts only 87% of the time. Pushing α toward 99% means buying the
expensive tail — the diminishing-returns region the curve makes visible.

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
| `engine/scoring.ts` | Stock-reward score per unit (swappable seam) |
| `engine/allocate.ts` | Pool units, rank by score/€, walk the budget cut line |
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

The **requirement histogram** is the picture that explains a line in the purchase
list: the empirical distribution of a part's requirement over its coverage
window, with the chosen buy quantity drawn as a vertical line. The share of the
distribution to its left is the **service level** that quantity buys —
`P(requirement ≤ quantity)`, the percentile — so "buy 2,038" reads off as "98%
service level" (this is α, not the fill rate β). Click any table row (or the left
selector) to inspect a part; move the budget and the line slides live.
