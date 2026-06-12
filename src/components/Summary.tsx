import type { Allocation } from "../engine/types";

function euro(v: number): string {
  return `€${Math.round(v).toLocaleString("en-US")}`;
}

const FULFIL_TIP =
  "Share of finished-good demand (weighted by margin × demand) you can actually complete. A good needs ALL its parts, so this is the weakest part across each good's BOM — buying one part to 99% does nothing if another is at 50%.";
const OUTPUT_TIP =
  "Finished-good margin per month the funded stock lets you complete (Σ over goods of completion × margin × demand). This is the value the purchase actually unlocks.";

export function Summary({ allocation }: { allocation: Allocation }) {
  const funded = allocation.lines.filter((l) => l.funded).length;
  const stats = [
    { label: "Total spend", value: euro(allocation.totalSpend), sub: `of ${euro(allocation.budget)} budget` },
    { label: "Materials funded", value: `${funded}`, sub: `of ${allocation.lines.length} with demand` },
    {
      label: "Finished-good fulfilment",
      value: `${(allocation.fgFulfilment * 100).toFixed(0)}%`,
      sub: "of FG demand completable (weakest link)",
      tip: FULFIL_TIP,
    },
    {
      label: "Output value enabled",
      value: `${euro(allocation.enabledOutputValue)}/mo`,
      sub: "finished-good margin you can complete",
      tip: OUTPUT_TIP,
    },
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
