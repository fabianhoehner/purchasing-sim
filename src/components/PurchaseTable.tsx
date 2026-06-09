// The prioritised purchase list. Funded materials first (in priority order),
// then a red cut line, then the next-best materials that fell below the budget.
// Quantity is how many of a material's units cleared the cut; coverage is the
// service level that quantity buys against the material's requirement
// distribution.

import { useMemo } from "react";
import { theme } from "../theme";
import type { Allocation, Material, World } from "../engine/types";

function euro(v: number): string {
  return `€${Math.round(v).toLocaleString("en-US")}`;
}

function Badges({ m }: { m: Material }) {
  return (
    <span className="badges">
      {m.shared && <span className="badge badge-shared">shared</span>}
      {m.premium && <span className="badge badge-premium">premium · option</span>}
      {m.hasBackup && <span className="badge badge-backup">has backup</span>}
    </span>
  );
}

export function PurchaseTable({
  allocation,
  world,
  focusId,
  onSelect,
}: {
  allocation: Allocation;
  world: World;
  focusId: string;
  onSelect: (id: string) => void;
}) {
  const matById = useMemo(() => new Map(world.materials.map((m) => [m.id, m])), [world.materials]);
  const funded = allocation.lines.filter((l) => l.funded);
  const unfundedAll = allocation.lines.filter((l) => !l.funded);
  const unfunded = unfundedAll.slice(0, 12);
  const rowClass = (l: { materialId: string; funded: boolean }) =>
    `${l.funded ? "funded" : "unfunded"}${l.materialId === focusId ? " focused" : ""}`;

  return (
    <div className="table-wrap">
      <table className="purchase-table">
        <thead>
          <tr>
            <th className="col-mat">Material</th>
            <th className="num">Buy qty</th>
            <th className="num">Unit €</th>
            <th className="num">Line €</th>
            <th className="num">Cumulative €</th>
            <th className="num">Coverage</th>
            <th className="num">Score €/€</th>
          </tr>
        </thead>
        <tbody>
          {funded.map((l) => {
            const m = matById.get(l.materialId)!;
            return (
              <tr key={l.materialId} className={rowClass(l)} onClick={() => onSelect(l.materialId)}>
                <td className="col-mat">
                  <span className="mat-name">{l.name}</span>
                  <Badges m={m} />
                </td>
                <td className="num strong">{l.qty}</td>
                <td className="num">{l.unitCost.toFixed(2)}</td>
                <td className="num">{euro(l.lineCost)}</td>
                <td className="num">{euro(l.cumulativeSpend)}</td>
                <td className="num">{(l.coverage * 100).toFixed(0)}%</td>
                <td className="num faint">{l.marginalScorePerEuro.toFixed(2)}</td>
              </tr>
            );
          })}

          <tr className="cut-row">
            <td colSpan={7}>
              <span className="cut-label">budget cut line — {euro(allocation.totalSpend)} of {euro(allocation.budget)} spent</span>
            </td>
          </tr>

          {unfunded.map((l) => {
            const m = matById.get(l.materialId)!;
            return (
              <tr key={l.materialId} className={rowClass(l)} onClick={() => onSelect(l.materialId)}>
                <td className="col-mat">
                  <span className="mat-name">{l.name}</span>
                  <Badges m={m} />
                </td>
                <td className="num">{l.qty || "—"}</td>
                <td className="num">{l.unitCost.toFixed(2)}</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">{(l.coverage * 100).toFixed(0)}%</td>
                <td className="num faint">{l.marginalScorePerEuro.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unfundedAll.length > unfunded.length && (
        <p className="table-foot" style={{ color: theme.inkFaint }}>
          + {unfundedAll.length - unfunded.length} more material(s) below the cut line.
        </p>
      )}
    </div>
  );
}
