import { useMemo, useState } from "react";
import { ChartsPanel } from "./components/ChartsPanel";
import { Controls } from "./components/Controls";
import { Histogram } from "./components/Histogram";
import { PurchaseTable } from "./components/PurchaseTable";
import { Summary } from "./components/Summary";
import { useSimulation } from "./hooks/useSimulation";

const BREAKDOWN = "__breakdown";
const TOTAL = "__total";

export function App() {
  const { config, prepared, allocation, fullCost, actions } = useSimulation();
  const [goodSel, setGoodSel] = useState<string>("__agg");
  const [matView, setMatView] = useState<string>(BREAKDOWN);

  const fundedMaterials = useMemo(() => allocation.lines.filter((l) => l.funded).length, [allocation]);

  // The part shown in the distribution: the drilled-in material, else the top
  // funded line (so there's always something instructive to look at).
  const focusId = useMemo(() => {
    if (matView !== BREAKDOWN && matView !== TOTAL) return matView;
    return allocation.lines.find((l) => l.funded)?.materialId ?? allocation.lines[0]?.materialId ?? prepared.world.materials[0]?.id;
  }, [matView, allocation.lines, prepared.world.materials]);

  const focusMaterial = prepared.world.materials.find((m) => m.id === focusId);
  const focusLine = allocation.lines.find((l) => l.materialId === focusId);
  const focusSamples = focusId ? prepared.mc.windowSamplesByMaterial[focusId] ?? [] : [];

  return (
    <div className="app">
      <header className="app-header">
        <h1>Manufacturing Purchasing Simulator</h1>
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

          <Summary allocation={allocation} fundedMaterials={fundedMaterials} />

          <section className="card">
            <div className="section-head">
              <h2>Prioritised purchase list</h2>
              <p>Every candidate unit competes for the next euro, ranked by reward per euro. The red line is the budget cut. Click a row to inspect a part.</p>
            </div>
            <PurchaseTable allocation={allocation} world={prepared.world} focusId={focusId ?? ""} onSelect={setMatView} />
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Requirement distribution — why this quantity</h2>
              <p>The buy quantity sits on the part's requirement distribution at exactly its fill rate. Move the budget and the red line slides.</p>
            </div>
            {focusMaterial && <Histogram material={focusMaterial} samples={focusSamples} line={focusLine} />}
          </section>
        </main>
      </div>

      <footer className="app-footer">
        Stock-reward prioritisation, Lokad style. Demand is a seeded negative-binomial process; requirement
        distributions are Monte Carlo over {config.nTrajectories.toLocaleString("en-US")} trajectories. A clean seam is
        left for swapping in action-reward scoring.
      </footer>
    </div>
  );
}
