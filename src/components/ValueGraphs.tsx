// Two candidate visualisations of the same idea: a raw material's value flows
// from the finished goods it completes. Build both; keep whichever reads better.
//   • ValueFlow  — a bipartite map: goods (sized by importance) on the left,
//     materials (sized by derived value) on the right, BOM links between.
//   • ValueBars  — one horizontal bar per material, stacked by which goods give
//     it its value; shows multiplicity and the ranking in one.

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

// ── bipartite value-flow map ────────────────────────────────────────────────
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

  const TOP = 16;
  const mats = graph.materials.slice(0, TOP);
  const matSet = new Set(mats.map((m) => m.id));
  const goods = graph.goods;
  const rowH = 24;
  const height = Math.max(goods.length * 40, mats.length * rowH) + 28;

  if (width <= 0) return <div ref={ref} style={{ minHeight: height }} />;

  const top = 16;
  const usable = height - top - 12;
  const goodX = 134;
  const matX = width - 150;
  const yOf = (i: number, n: number) => top + ((i + 0.5) / n) * usable;
  const goodY = new Map(goods.map((g, i) => [g.id, yOf(i, goods.length)]));
  const matY = new Map(mats.map((m, i) => [m.id, yOf(i, mats.length)]));

  const edges = graph.edges.filter((e) => matSet.has(e.materialId));
  const lit = (e: { goodId: string; materialId: string }) =>
    (!hoverGood && !hoverMat) || e.goodId === hoverGood || e.materialId === hoverMat;

  return (
    <div ref={ref}>
      <svg width={width} height={height} role="img">
        {edges.map((e, i) => {
          const gy = goodY.get(e.goodId)!;
          const my = matY.get(e.materialId);
          if (my === undefined) return null;
          const on = lit(e);
          return (
            <path
              key={i}
              d={`M ${goodX} ${gy} C ${(goodX + matX) / 2} ${gy}, ${(goodX + matX) / 2} ${my}, ${matX} ${my}`}
              fill="none"
              stroke={goodColor(e.goodId)}
              strokeWidth={Math.max(1, (e.flow / graph.maxGoodImportance) * 6)}
              opacity={on ? 0.5 : 0.06}
            />
          );
        })}

        {goods.map((g) => {
          const y = goodY.get(g.id)!;
          const h = Math.max(12, (g.importance / graph.maxGoodImportance) * 30);
          return (
            <g key={g.id} onMouseEnter={() => setHoverGood(g.id)} onMouseLeave={() => setHoverGood(null)} style={{ cursor: "default" }}>
              <rect x={goodX} y={y - h / 2} width={9} height={h} rx={2} fill={goodColor(g.id)} />
              <text x={goodX - 6} y={y + 3} textAnchor="end" fontSize={10.5} fill={theme.ink}>
                {g.name}
              </text>
            </g>
          );
        })}

        {mats.map((m) => {
          const y = matY.get(m.id)!;
          const r = 3 + Math.sqrt(m.importance / graph.maxMaterialImportance) * 6;
          const isFocus = m.id === focusId;
          return (
            <g key={m.id} onMouseEnter={() => setHoverMat(m.id)} onMouseLeave={() => setHoverMat(null)} onClick={() => onSelect(m.id)} style={{ cursor: "pointer" }}>
              <circle cx={matX} cy={y} r={r} fill={theme.requirement} opacity={hoverMat === null || hoverMat === m.id ? 0.85 : 0.3} />
              <text x={matX + 9} y={y + 3} fontSize={10} fill={isFocus ? theme.red : theme.inkSoft} fontWeight={isFocus ? 700 : 400}>
                {m.name}
                <tspan fill={theme.inkFaint}> ·{m.goodCount}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      {graph.materials.length > TOP && (
        <p className="vbars-foot">+ {graph.materials.length - TOP} smaller parts not shown. Hover a good or part to trace its links; click a part to inspect it below.</p>
      )}
    </div>
  );
}

// ── stacked value bars ──────────────────────────────────────────────────────
export function ValueBars({
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
  const goodName = useMemo(() => new Map(graph.goods.map((g) => [g.id, g.name])), [graph]);
  const edgesByMat = useMemo(() => {
    const m = new Map<string, { goodId: string; flow: number }[]>();
    for (const e of graph.edges) {
      if (!m.has(e.materialId)) m.set(e.materialId, []);
      m.get(e.materialId)!.push({ goodId: e.goodId, flow: e.flow });
    }
    return m;
  }, [graph]);

  return (
    <div className="vbars">
      {graph.materials.map((mat) => {
        const segs = (edgesByMat.get(mat.id) ?? []).slice().sort((a, b) => b.flow - a.flow);
        return (
          <div className={`vbar-row${mat.id === focusId ? " focused" : ""}`} key={mat.id} onClick={() => onSelect(mat.id)}>
            <div className="vbar-label" title={mat.name}>
              {mat.name} <span className="vbar-count">×{mat.goodCount}</span>
            </div>
            <div className="vbar-track">
              {segs.map((s) => (
                <span
                  key={s.goodId}
                  className="vbar-seg"
                  style={{ width: `${(s.flow / graph.maxMaterialImportance) * 100}%`, background: goodColor(s.goodId) }}
                  title={`${goodName.get(s.goodId)} → ${mat.name}`}
                />
              ))}
            </div>
          </div>
        );
      })}
      <p className="vbars-foot">Bar length = the material's value (Σ importance of the goods that use it). Click a part to inspect it below.</p>
    </div>
  );
}
