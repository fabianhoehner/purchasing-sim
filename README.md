# Manufacturing Purchasing Simulator

A browser-based teaching simulator for buying raw materials when finished-good
demand is uncertain. It generates probabilistic demand for a set of finished
goods, explodes that demand through bills of material into raw-material
requirements (offset in time, because parts are consumed before goods are sold),
and ranks every candidate purchase into a single economic priority list,
Lokad-style. Given a budget, it fills that list top-down and shows what to buy.

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
  strengthens (in the default world the shared fastener jumps ~10k → ~13k units
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

Other controls: **budget** (slider + entry, moves the cut line live),
**manufacturing lead time** (shifts the requirement curve earlier), **stockout
penalty** (the ratio of stockout penalty to enabled margin), **per-material
cost / lead-time edits**, a **reseed** for a fresh world, and a **reset**.

## The model

### Demand
Each finished good has a latent expected-demand process (baseline level, gentle
trend, mild seasonality). Observed history is one realisation sampled from it;
the forecast is a fan of sampled trajectories. Counts are **negative binomial**,
drawn as a Gamma–Poisson mixture and parameterised by a dispersion
`d = variance / mean ≥ 1`, so demand is overdispersed. An optional shared
multiplicative **shock** (mean 1) moves all goods together when correlation is on.

### Bills of material and the two lead times
Each good has a BOM over up to ten materials; a few materials are shared across
many goods (so their aggregate demand is large and lumpy), the rest are unique.
Two materials are the base of a **one-way substitution pair** (a premium part can
stand in for a base part, never the reverse).

- **Manufacturing lead time** governs *timing*: raw consumption leads the sale by
  this many periods, so the requirement curve is the demand curve shifted
  earlier. It changes *when* a unit is needed, not how many — this is the visible
  offset between the two charts.
- **Procurement lead time** governs *quantity*: it sets the coverage window the
  current purchase is responsible for. It is a small distribution, not a
  constant, and the window length is sampled per trajectory — lead-time
  uncertainty widens the requirement tail.

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

This is deliberately the simpler **stock-reward** formulation, chosen for
clarity. Lokad's **action-reward** is the more advanced version (it works in
ordering space, separates ordering frequency from lead time, and respects
seasonality and varying lead times across trajectories). The scoring function is
isolated behind a clean signature so it can be swapped without touching the UI.

### Ranking and budget
Every `(material, unit n)` pair from every material competes in one global list,
sorted by score per euro. The budget is spent strictly top-down, giving a single
clean cut line; a material's purchase quantity is how many of its units cleared
the cut. The budget walk is cheap and re-runs live; the Monte Carlo and scoring
only re-run when a structural input changes.

## Defaults

6 finished goods · ~30 raw materials (a handful shared, two substitution pairs) ·
monthly periods · 24 months history · 12 months horizon · manufacturing lead time
1 · procurement lead times 1–6 · carrying cost 27%/yr · stockout penalty 0.5×
margin · 3,000 Monte Carlo trajectories · everything seeded (reload reproduces
the same world; reseed for a fresh one).

## Engine layout

The simulation engine is plain, independently testable modules, separate from the
UI:

| Module | Responsibility |
| --- | --- |
| `engine/rng.ts` | Seeded PRNG + negative-binomial / gamma / Poisson samplers |
| `engine/world.ts` | Seeded world: goods, materials, BOMs, substitution pairs |
| `engine/demand.ts` | Latent process → observed history + forecast trajectories |
| `engine/bom.ts` | Explode demand → time-shifted material requirements |
| `engine/montecarlo.ts` | Trajectories → per-material requirement distribution + chart fans |
| `engine/substitution.ts` | One-way `substitutes_for` routing + premium option value |
| `engine/scoring.ts` | Stock-reward score per unit (swappable seam) |
| `engine/allocate.ts` | Pool units, rank by score/€, walk the budget cut line |
| `engine/simulate.ts` | Orchestration; splits the expensive prepare from the cheap allocate |

The UI (`src/components`, `src/hooks`) renders two time-aligned quantile fan
charts, the prioritised purchase table with the cut line, and the controls.
