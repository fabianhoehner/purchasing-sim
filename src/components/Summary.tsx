import type { Allocation } from "../engine/types";

function euro(v: number): string {
  return `€${Math.round(v).toLocaleString("en-US")}`;
}

const FILL_TIP =
  "Fill rate (β): the share of all demand units you actually serve. Example — stock 10, demand comes in at 15: you serve 10, so β counts 10/15 = 67%.";
const SL_TIP =
  "Service level (α): how often you fully cover demand with no shortage at all. Example — stock 10, demand 15: that period is a stockout (a miss), even though you served 10 units.";

export function Summary({ allocation }: { allocation: Allocation }) {
  const stats = [
    { label: "Total spend", value: euro(allocation.totalSpend), sub: `of ${euro(allocation.budget)} budget` },
    { label: "Fill rate", value: `${(allocation.expectedFillRate * 100).toFixed(0)}%`, sub: "demand units served (β)", tip: FILL_TIP },
    { label: "Service level", value: `${(allocation.expectedCoverage * 100).toFixed(0)}%`, sub: "no-stockout chance (α)", tip: SL_TIP },
    { label: "Stockout exposure avoided", value: euro(allocation.stockoutExposureAvoided), sub: "expected penalty removed" },
  ];
  return (
    <div className="summary">
      {stats.map((s) => (
        <div className="stat" key={s.label} title={s.tip}>
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">
            {s.label}
            {s.tip && <span className="stat-info">ⓘ</span>}
          </div>
          <div className="stat-sub">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
