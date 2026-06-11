import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartsPanel } from "./components/ChartsPanel";
import { Controls } from "./components/Controls";
import { Histogram } from "./components/Histogram";
import { InvestmentCurve } from "./components/InvestmentCurve";
import { PurchaseTable } from "./components/PurchaseTable";
import { Summary } from "./components/Summary";
import { Tour, type TourStep } from "./components/Tour";
import { useSimulation } from "./hooks/useSimulation";

const BREAKDOWN = "__breakdown";

const TOUR_STEPS: TourStep[] = [
  {
    selector: ".charts",
    title: "Demand is a distribution, not a line",
    body: "Top: probabilistic demand for a finished good — observed history, then a forecast fan. Bottom: that demand exploded through the bills of material into raw-material requirement. Parts shared across many products get the lumpiest, fattest-tailed demand.",
  },
  {
    selector: ".budget-panel",
    title: "Buying is competitive",
    body: "Every euro is spent only once. The question isn't “what service level do we want?” — it's where the next euro removes the most expected loss. Every candidate unit of every part competes in one list. Drag this budget and the cut re-allocates instantly.",
  },
  {
    selector: "#purchase-section",
    title: "One prioritised list, filled top-down",
    body: "Each unit is ranked by reward per euro. Cheap parts that gate expensive goods rank high; shared parts get bought deep into the tail. Spend down to the red cut line — everything above is funded. Click any row to inspect that part.",
  },
  {
    selector: "#distribution-section",
    title: "Why this quantity",
    body: "A part's requirement is a distribution. The quantity you buy sits at a point on it — the share of scenarios it covers is its service level. The blue mass is served, the pink is stockout risk. Move the budget and the red line slides.",
  },
  {
    selector: "#investment-section",
    title: "Plan to the tail, not the mean",
    body: "Fill rate (demand served) is nearly maxed cheaply — the first euros buy near-certain demand. Service level (never stocking out) lags, and the last points to ~99% need the expensive tail. Past the economic optimum, more stock destroys value.",
  },
  {
    selector: ".substitution-panel",
    title: "Flexibility has option value",
    body: "A premium part can stand in for a base part — one way only. It carries its own demand plus a discounted claim on the base's overflow, so it's quietly worth holding a little extra. Switch a link off and watch that buffer disappear from the list.",
  },
];

export function App() {
  const { config, prepared, allocation, fullCost, actions } = useSimulation();
  const [goodSel, setGoodSel] = useState<string>("__agg");
  const [matView, setMatView] = useState<string>(BREAKDOWN);
  // The distribution panel has its own part selection, independent of the chart.
  const [histPart, setHistPart] = useState<string>("");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const tourSnapshot = useRef<number | null>(null);

  // First-time visitors get the guided tour (once per browser session, so reloads
  // during a demo don't nag). The header button relaunches it anytime.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("psim_tour_seen") === "1";
      sessionStorage.setItem("psim_tour_seen", "1");
    } catch {
      /* storage blocked — just show the tour */
    }
    if (!seen) setTourStep(0);
  }, []);

  const startTour = useCallback(() => {
    tourSnapshot.current = config.budget;
    setTourStep(0);
  }, [config.budget]);

  const endTour = useCallback(() => {
    actions.setBudget(tourSnapshot.current ?? prepared.economicSpend);
    tourSnapshot.current = null;
    setTourStep(null);
  }, [actions, prepared.economicSpend]);

  const nextStep = useCallback(() => {
    if (tourStep === null) return;
    if (tourStep + 1 >= TOUR_STEPS.length) endTour();
    else setTourStep(tourStep + 1);
  }, [tourStep, endTour]);

  const backStep = useCallback(() => {
    setTourStep((s) => (s === null || s === 0 ? s : s - 1));
  }, []);

  // Per-step budget nudge: scarce to open the ranking story, then the optimum so
  // the histogram and the investment curve sit on the meaningful point.
  useEffect(() => {
    if (tourStep === null) return;
    const opt = prepared.economicSpend;
    if (tourStep === 1) actions.setBudget(Math.round(opt * 0.35));
    else if (tourStep === 3 || tourStep === 4) actions.setBudget(Math.round(opt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  // Default the distribution to the top funded line, until the user picks a part
  // (via the histogram selector or by clicking a table row).
  const focusId = useMemo(() => {
    if (histPart && prepared.world.materials.some((m) => m.id === histPart)) return histPart;
    return allocation.lines.find((l) => l.funded)?.materialId ?? allocation.lines[0]?.materialId ?? prepared.world.materials[0]?.id;
  }, [histPart, allocation.lines, prepared.world.materials]);

  const focusMaterial = prepared.world.materials.find((m) => m.id === focusId);
  const focusLine = allocation.lines.find((l) => l.materialId === focusId);
  const focusSamples = focusId ? prepared.mc.windowSamplesByMaterial[focusId] ?? [] : [];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>Manufacturing Purchasing Simulator</h1>
          <button className="tour-launch" onClick={startTour}>
            ▶ Take the tour
          </button>
        </div>
        <p className="lede">
          Probabilistic demand for finished goods, exploded through bills of material into raw-material requirements,
          then ranked into a single economic priority list. Given a budget, the list is filled top-down. The lesson:
          plan to the economics of the tail, not the mean — and let shared and hard-to-substitute parts earn their
          priority.
        </p>
      </header>

      <div className="layout">
        <Controls
          config={config}
          prepared={prepared}
          fullCost={fullCost}
          actions={actions}
          goodSel={goodSel}
          setGoodSel={setGoodSel}
          matView={matView}
          setMatView={setMatView}
        />

        <main className="content">
          <section className="card">
            <ChartsPanel world={prepared.world} mc={prepared.mc} goodSel={goodSel} matView={matView} />
          </section>

          <Summary allocation={allocation} />

          <section className="card" id="purchase-section">
            <div className="section-head">
              <h2>Prioritised purchase list</h2>
              <p>Every candidate unit competes for the next euro, ranked by reward per euro. The red line is the budget cut. Click a row to inspect its distribution below.</p>
            </div>
            <PurchaseTable allocation={allocation} world={prepared.world} focusId={focusId ?? ""} onSelect={setHistPart} />
          </section>

          <section className="card" id="distribution-section">
            <div className="section-head">
              <h2>Requirement distribution — why this quantity</h2>
              <p>The buy quantity sits on the part's requirement distribution at exactly its fill rate. Move the budget and the red line slides.</p>
            </div>
            {focusMaterial && (
              <Histogram
                material={focusMaterial}
                samples={focusSamples}
                line={focusLine}
                materials={prepared.world.materials}
                onSelect={setHistPart}
              />
            )}
          </section>

          <section className="card" id="investment-section">
            <div className="section-head">
              <h2>Investment vs. coverage</h2>
              <p>Two curves: fill rate (β, demand served) is nearly maxed cheaply; service level (α, never stocking out) is what costs the expensive tail to push toward ~99%. That's why "max budget" looked like 87% — that was α.</p>
            </div>
            <div className="metric-note">
              <strong>Service level vs. fill rate, in one example:</strong> you stock <strong>10</strong> units and demand
              turns out to be <strong>15</strong>. You serve 10 and miss 5.
              <ul>
                <li>
                  <span className="dot dot-alpha" /> <strong>Service level (α)</strong> — “was I fully covered?” No: that
                  period counts as a <em>stockout</em>. It asks <em>how often</em> you never fall short.
                </li>
                <li>
                  <span className="dot dot-beta" /> <strong>Fill rate (β)</strong> — “what share of units did I serve?”
                  10 of 15 = <strong>67%</strong>. It gives credit for the units you did ship.
                </li>
              </ul>
              The first units serve near-certain demand, so fill rate climbs fast and is nearly maxed at the economic
              optimum. Pushing service level to ~99% means stocking for the rare big spikes — the expensive tail.
            </div>
            <InvestmentCurve
              curve={prepared.investmentCurve}
              economicSpend={prepared.economicSpend}
              currentSpend={allocation.totalSpend}
              currentFillRate={allocation.expectedFillRate}
              currentServiceLevel={allocation.expectedCoverage}
            />
          </section>
        </main>
      </div>

      <footer className="app-footer">
        <div className="credit">
          Manufacturing Purchasing Simulator — a supply-chain concept simulator, inspired by Lokad, built by{" "}
          <a href="https://www.linkedin.com/in/fabianhoehner/" target="_blank" rel="noreferrer">
            Fabian Höhner
          </a>
          .
        </div>
        <div className="colophon">
          Seeded negative-binomial demand · Monte Carlo requirement distributions over{" "}
          {config.nTrajectories.toLocaleString("en-US")} trajectories · stock-reward prioritisation. A clean seam is left
          for action-reward scoring.
        </div>
      </footer>

      {tourStep !== null && (
        <Tour steps={TOUR_STEPS} index={tourStep} onNext={nextStep} onBack={backStep} onClose={endTour} />
      )}
    </div>
  );
}
