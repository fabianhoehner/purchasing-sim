import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartsPanel } from "./components/ChartsPanel";
import { Controls } from "./components/Controls";
import { Histogram } from "./components/Histogram";
import { PurchaseTable } from "./components/PurchaseTable";
import { Summary } from "./components/Summary";
import { Tour, type TourStep } from "./components/Tour";
import { GoodLegend, useGoodColors, ValueBars, ValueFlow } from "./components/ValueGraphs";
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
    body: "A part's requirement is a distribution, not a number. The quantity you buy sits at a point on it — the blue mass to its left is the share of demand scenarios it covers, the pink is the shortfall risk. Move the budget and the line slides.",
  },
  {
    selector: "#value-section",
    title: "Value comes from the finished goods",
    body: "A raw material is worth nothing on its own — its value is the finished goods it lets you complete. Each good's importance (margin × demand) flows into every part it needs, so a part used by many goods, or by a few very profitable ones, rises to the top. That relationship IS the buy order.",
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

  // Per-step budget nudge: scarce to open the ranking story (steps 1–2), then the
  // optimum at the distribution step so the quantity shown is the meaningful one.
  useEffect(() => {
    if (tourStep === null) return;
    const opt = prepared.economicSpend;
    if (tourStep === 1) actions.setBudget(Math.round(opt * 0.35));
    else if (tourStep === 3) actions.setBudget(Math.round(opt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  const goodColor = useGoodColors(prepared.valueGraph);

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
          Probabilistic demand for finished goods, exploded through bills of material into raw-material requirements. A
          raw material is worth what it lets you finish — so the tool ranks every candidate purchase by the finished-good
          value it unlocks per euro, and fills that list to your budget. The lesson: don't optimise parts in isolation,
          buy the capacity to finish finished goods.
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
              <p>The buy quantity sits on the part's requirement distribution; the mass to its left is the share of demand scenarios it covers. Move the budget and the red line slides.</p>
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

          <section className="card" id="value-section">
            <div className="section-head">
              <h2>Where value comes from: finished goods → raw materials</h2>
              <p>
                A part is worth what it lets you finish. Each good's importance (margin × demand) flows into every part it
                needs, so parts under many — or very profitable — goods are bought first. That relationship is the whole
                ranking. <em>(Two views — tell me which reads better and I'll keep one.)</em>
              </p>
            </div>
            <GoodLegend graph={prepared.valueGraph} goodColor={goodColor} />
            <h3 className="value-subhead">Option A — value-flow map (goods → parts)</h3>
            <ValueFlow graph={prepared.valueGraph} goodColor={goodColor} focusId={focusId ?? ""} onSelect={setHistPart} />
            <h3 className="value-subhead">Option B — value bars (per part, stacked by good)</h3>
            <ValueBars graph={prepared.valueGraph} goodColor={goodColor} focusId={focusId ?? ""} onSelect={setHistPart} />
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
