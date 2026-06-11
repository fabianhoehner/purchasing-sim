import type { Allocation } from "../engine/types";

function euro(v: number): string {
  return `€${Math.round(v).toLocaleString("en-US")}`;
}

export function Summary({ allocation }: { allocation: Allocation }) {
  const stats = [
    { label: "Total spend", value: euro(allocation.totalSpend), sub: `of ${euro(allocation.budget)} budget` },
    { label: "Fill rate", value: `${(allocation.expectedFillRate * 100).toFixed(0)}%`, sub: "β · share of demand served" },
    { label: "Service level", value: `${(allocation.expectedCoverage * 100).toFixed(0)}%`, sub: "α · P(no stockout), weighted" },
    { label: "Stockout exposure avoided", value: euro(allocation.stockoutExposureAvoided), sub: "expected penalty removed" },
  ];
  return (
    <div className="summary">
      {stats.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">{s.label}</div>
          <div className="stat-sub">{s.sub}</div>
        </div>
      ))}
    </div>
  );
}
