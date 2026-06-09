// The two stacked, time-aligned charts (driven by the selectors in the left
// panel). Top: finished-good demand (observed history + forecast fan). Bottom:
// the raw-material requirement it explodes into — its own observed history plus
// the forecast. The two charts share the exact same time axis (no offset: in
// this model manufacturing timing doesn't change quantities, so a visual shift
// only added clutter). The requirement chart has three views: a per-material
// breakdown (history + one sampled future scenario, so past and future look
// alike and the lines sum to the total), the total with its uncertainty fan, or
// a single material drilled down.

import { useMemo } from "react";
import { useMeasure } from "../hooks/useMeasure";
import { theme } from "../theme";
import type { Band, BomEntry, McResult, SeriesPoint, World } from "../engine/types";
import { FanChart, type LineSeries } from "./FanChart";

const PALETTE = [
  "#2b6e7a", "#7a5a2b", "#496a8f", "#8f4949", "#5a7a3a", "#6a4a7a",
  "#a0762b", "#3a8f7a", "#8f7a3a", "#7a3a5a", "#4a5a8f", "#2b8f5a",
];
const lineColor = (i: number) => PALETTE[i % PALETTE.length];

const BREAKDOWN = "__breakdown";
const TOTAL = "__total";

function maxOf(arr: number[], seed = 1): number {
  let m = seed;
  for (const v of arr) if (v > m) m = v;
  return m;
}

export function ChartsPanel({ world, mc, goodSel, matView }: { world: World; mc: McResult; goodSel: string; matView: string }) {
  const [ref, width] = useMeasure<HTMLDivElement>();

  const matName = useMemo(() => new Map(world.materials.map((m) => [m.id, m.name])), [world.materials]);
  const bomByMat = useMemo(() => {
    const map = new Map<string, BomEntry[]>();
    for (const e of world.bom) {
      if (!map.has(e.materialId)) map.set(e.materialId, []);
      map.get(e.materialId)!.push(e);
    }
    return map;
  }, [world.bom]);
  const xDomain = useMemo<[number, number]>(
    () => [-(world.historyMonths - 1), world.horizonMonths],
    [world.historyMonths, world.horizonMonths],
  );

  // --- demand (top) ---------------------------------------------------------
  const demandBands = goodSel === "__agg" ? mc.forecastAggregate : mc.forecastByGood[goodSel];
  const demandHistory = goodSel === "__agg" ? mc.historyAggregate : mc.historyByGood[goodSel];
  const demandYMax = Math.max(maxOf(demandBands.map((b) => b.q95)), maxOf(demandHistory.map((h) => h.value)));

  // --- requirement (bottom): explode observed history + one sampled future ---
  // `gf` = good filter: null means all goods.
  const matHistoryPts = (matId: string, gf: string | null) =>
    mc.historyMonths.map((hm, i) => {
      let v = 0;
      for (const e of bomByMat.get(matId) ?? []) {
        if (gf && e.goodId !== gf) continue;
        v += e.qtyPerUnit * (mc.historyByGood[e.goodId]?.[i]?.value ?? 0);
      }
      return { t: hm, v };
    });
  const matFuturePts = (matId: string, gf: string | null) =>
    mc.months.map((m, k) => {
      let v = 0;
      for (const e of bomByMat.get(matId) ?? []) {
        if (gf && e.goodId !== gf) continue;
        v += e.qtyPerUnit * (mc.futureScenarioByGood[e.goodId]?.[k] ?? 0);
      }
      return { t: m, v };
    });

  const totalHistory = (gf: string | null): SeriesPoint[] =>
    mc.historyMonths.map((hm, i) => {
      let v = 0;
      for (const e of world.bom) {
        if (gf && e.goodId !== gf) continue;
        v += e.qtyPerUnit * (mc.historyByGood[e.goodId]?.[i]?.value ?? 0);
      }
      return { t: hm, value: v };
    });

  const gf = goodSel === "__agg" ? null : goodSel;

  // breakdown: one line per material, history + sampled future, shared colour
  const breakdown = useMemo(() => {
    const source = goodSel === "__agg" ? mc.breakdown.all : mc.breakdown.byGood[goodSel] ?? {};
    const ids = Object.keys(source).filter((id) => source[id].some((v) => v > 0.01));
    ids.sort((a, b) => Math.max(...source[b]) - Math.max(...source[a]));
    const lines: LineSeries[] = ids.map((id, i) => ({
      id,
      name: matName.get(id) ?? id,
      points: [...matHistoryPts(id, gf), ...matFuturePts(id, gf)],
      color: lineColor(i),
    }));
    let yMax = 1;
    for (const l of lines) for (const p of l.points) if (p.v > yMax) yMax = p.v;
    return { lines, yMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodSel, mc, matName]);

  const scaledGoodFan = (gid: string): Band[] => {
    const q = mc.breakdown.goodTotalQty[gid] ?? 0;
    return mc.forecastByGood[gid].map((b) => ({
      q05: b.q05 * q, q25: b.q25 * q, q50: b.q50 * q, q75: b.q75 * q, q95: b.q95 * q,
    }));
  };

  let reqBands: Band[] | undefined;
  let reqLines: LineSeries[] | undefined;
  let reqHistory: SeriesPoint[] | undefined;
  let reqYMax = 1;
  if (matView === BREAKDOWN) {
    reqLines = breakdown.lines;
    reqYMax = breakdown.yMax;
  } else if (matView === TOTAL) {
    reqBands = goodSel === "__agg" ? mc.requirementAggregate : scaledGoodFan(goodSel);
    reqHistory = totalHistory(gf);
    reqYMax = Math.max(maxOf(reqBands.map((b) => b.q95)), maxOf(reqHistory.map((h) => h.value)));
  } else {
    reqBands = mc.requirementByMaterial[matView];
    reqHistory = matHistoryPts(matView, null).map((p) => ({ t: p.t, value: p.v }));
    reqYMax = Math.max(reqBands ? maxOf(reqBands.map((b) => b.q95)) : 1, maxOf(reqHistory.map((h) => h.value)));
  }

  const height = 190;
  const goodLabel = goodSel === "__agg" ? "all goods" : world.goods.find((g) => g.id === goodSel)?.name;
  const reqLabel =
    matView === BREAKDOWN ? "breakdown by material" : matView === TOTAL ? "total + uncertainty" : matName.get(matView);

  return (
    <div ref={ref} className="charts">
      <div className="chart-block">
        <div className="chart-head">
          <h3>Finished-good demand</h3>
          <span className="chart-sub">{goodLabel}</span>
        </div>
        <FanChart
          width={width}
          height={height}
          xDomain={xDomain}
          yMax={demandYMax}
          history={demandHistory}
          forecastX={mc.months}
          bands={demandBands}
          color={theme.demand}
          bandColor={theme.demandBand}
          bandInnerColor={theme.demandBandInner}
          yLabel="units sold / month"
          unit="u"
        />
      </div>

      <div className="chart-block">
        <div className="chart-head">
          <h3>Raw-material requirement</h3>
          <span className="chart-sub">{reqLabel}</span>
        </div>
        <FanChart
          width={width}
          height={height}
          xDomain={xDomain}
          yMax={reqYMax}
          forecastX={mc.months}
          bands={reqBands}
          lines={reqLines}
          history={reqHistory}
          color={theme.requirement}
          bandColor={theme.requirementBand}
          bandInnerColor={theme.requirementBandInner}
          yLabel="units consumed / month"
          unit="u"
        />
        {matView === BREAKDOWN && breakdown.lines.length > 0 && (
          <div className="legend">
            {breakdown.lines.slice(0, 14).map((l) => (
              <span className="legend-item" key={l.id}>
                <span className="legend-swatch" style={{ background: l.color }} />
                {l.name}
              </span>
            ))}
            {breakdown.lines.length > 14 && <span className="legend-more">+ {breakdown.lines.length - 14} more</span>}
          </div>
        )}
      </div>

      <p className="chart-foot">
        Showing <strong>{goodLabel}</strong>. The dashed vertical line is <em>now</em>; left of it is observed history,
        right is one sampled future. Both charts share the same months.{" "}
        {matView === BREAKDOWN
          ? "Each coloured line is one raw material's consumption — past and a sampled future; they sum to the total. Hover snaps to the nearest line."
          : matView === TOTAL
            ? "The fan shows the median with 50% and 90% bands — the tail the priority list buys against."
            : "Drilled into one material: the fan is its forecast uncertainty across all goods."}
      </p>
    </div>
  );
}
