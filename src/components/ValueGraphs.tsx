// The value-flow map: a raw material's worth flows from the finished goods it
// completes. Finished goods (sized by importance = margin × demand) on the left,
// raw materials (sized by derived value, sorted high → low) on the right, BOM
// links between, coloured by good. Hover a node to trace its links; click a part
// to inspect its distribution. Makes the buy order legible: the parts under the
// most — or most profitable — goods sit at the top.

import { useMemo, useState } from "react";
import { useMeasure } from "../hooks/useMeasure";
import { theme } from "../theme";
import type { ValueGraph } from "../engine/types";

const PALETTE = ["#2b6e7a", "#7a5a2b", "#496a8f", "#8f4949", "#5a7a3a", "#6a4a7a", "#a0762b", "#3a8f7a"];

export function useGoodColors(graph: ValueGraph): (id: string) => string {
  return useMemo(() => {
    const map = new Map(graph.goods.map((g, i) => [g.id, PALETTE[i % PALETTE.length]]));
    return (id: string) => map.get(id) ?? theme.inkFaint;
  }, [graph]);
}

export function GoodLegend({ graph, goodColor }: { graph: ValueGraph; goodColor: (id: string) => string }) {
  return (
    <div className="legend">
      {graph.goods.map((g) => (
        <span className="legend-item" key={g.id}>
          <span className="legend-swatch" style={{ background: goodColor(g.id) }} />
          {g.name}
        </span>
      ))}
    </div>
  );
}

export function ValueFlow({
  graph,
  goodColor,
  focusId,
  onSelect,
}: {
  graph: ValueGraph;
  goodColor: (id: string) => string;
  focusId: string;
  onSelect: (id: string) => void;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [hoverGood, setHoverGood] = useState<string | null>(null);
  const [hoverMat, setHoverMat] = useState<string | null>(null);

  const goods = graph.goods;
  const mats = graph.materials;
  const headerH = 30;
  const rowH = 18;
  const height = Math.max(goods.length * 52, mats.length * rowH) + headerH + 16;

  if (width <= 0) return <div ref={ref} style={{ minHeight: height }} />;

  const goodX = 138;
  const matX = width - 188;
  const usable = height - headerH - 14;
  const yOf = (i: number, n: number) => headerH + ((i + 0.5) / n) * usable;
  const goodY = new Map(goods.map((g, i) => [g.id, yOf(i, goods.length)]));
  const matY = new Map(mats.map((m, i) => [m.id, yOf(i, mats.length)]));

  const active = hoverGood !== null || hoverMat !== null;
  const lit = (e: { goodId: string; materialId: string }) =>
    !active || e.goodId === hoverGood || e.materialId === hoverMat;

  return (
    <div ref={ref}>
      <svg width={width} height={height} role="img" onMouseLeave={() => { setHoverGood(null); setHoverMat(null); }}>
        <text x={goodX} y={16} textAnchor="end" fontSize={10.5} fontWeight={600} fill={theme.inkFaint}>
          FINISHED GOODS
        </text>
        <text x={matX} y={16} fontSize={10.5} fontWeight={600} fill={theme.inkFaint}>
          RAW MATERIALS — by value
        </text>

        {/* edges */}
        {graph.edges.map((e, i) => {
          const gy = goodY.get(e.goodId);
          const my = matY.get(e.materialId);
          if (gy === undefined || my === undefined) return null;
          const on = lit(e);
          return (
            <path
              key={i}
              d={`M ${goodX} ${gy} C ${(goodX + matX) / 2} ${gy}, ${(goodX + matX) / 2} ${my}, ${matX} ${my}`}
              fill="none"
              stroke={goodColor(e.goodId)}
              strokeWidth={Math.max(1, (e.flow / graph.maxGoodImportance) * 6)}
              opacity={on ? 0.5 : 0.05}
            />
          );
        })}

        {/* finished-good nodes */}
        {goods.map((g) => {
          const y = goodY.get(g.id)!;
          const h = Math.max(14, (g.importance / graph.maxGoodImportance) * 40);
          const dim = active && hoverGood !== g.id && hoverMat === null;
          return (
            <g key={g.id} onMouseEnter={() => setHoverGood(g.id)} onMouseLeave={() => setHoverGood(null)} style={{ cursor: "default" }}>
              <rect x={goodX} y={y - h / 2} width={11} height={h} rx={2} fill={goodColor(g.id)} opacity={dim ? 0.35 : 1} />
              <text x={goodX - 7} y={y + 3.5} textAnchor="end" fontSize={11} fill={theme.ink} opacity={dim ? 0.4 : 1}>
                {g.name}
              </text>
            </g>
          );
        })}

        {/* raw-material nodes */}
        {mats.map((m) => {
          const y = matY.get(m.id)!;
          const r = 2.5 + Math.sqrt(m.importance / graph.maxMaterialImportance) * 7;
          const isFocus = m.id === focusId;
          const dim = active && hoverMat !== m.id && hoverGood === null;
          return (
            <g key={m.id} onMouseEnter={() => setHoverMat(m.id)} onMouseLeave={() => setHoverMat(null)} onClick={() => onSelect(m.id)} style={{ cursor: "pointer" }}>
              <circle cx={matX} cy={y} r={r} fill={isFocus ? theme.red : theme.requirement} opacity={dim ? 0.25 : 0.9} />
              <text x={matX + r + 5} y={y + 3} fontSize={9.5} fill={isFocus ? theme.red : theme.inkSoft} fontWeight={isFocus ? 700 : 400} opacity={dim ? 0.35 : 1}>
                {m.name}
                <tspan fill={theme.inkFaint}> ·{m.goodCount}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <p className="vbars-foot">
        Node size = importance; link colour = which good. Hover a good or part to trace its links; click a part to
        inspect its distribution above. ·N = how many goods it feeds.
      </p>
    </div>
  );
}
