import type { Allocation } from "../engine/types";

function euro(v: number): string {
  return `€${Math.round(v).toLocaleString("en-US")}`;
}

export function Summary({ allocation, fundedMaterials }: { allocation: Allocation; fundedMaterials: number }) {
  const stats = [
    { label: "Total spend", value: euro(allocation.totalSpend), sub: `of ${euro(allocation.budget)} budget` },
    { label: "Units funded", value: allocation.unitsFunded.toLocaleString("en-US"), sub: `${fundedMaterials} materials` },
    { label: "Expected coverage", value: `${(allocation.expectedCoverage * 100).toFixed(0)}%`, sub: "demand-weighted service level" },
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
