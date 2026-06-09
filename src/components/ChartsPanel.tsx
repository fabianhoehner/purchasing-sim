// The two stacked, time-aligned charts.
//   Top:    finished-good demand (observed history + forecast fan), one good or all.
//   Bottom: the raw-material requirement that demand explodes into — its own
//           observed history plus the forecast — plotted shifted earlier by the
//           manufacturing lead time. Three views: a per-material *breakdown* (one
//           line per material, each with its own history, the default), the
//           *total* with its uncertainty fan, or a single material drilled down.
// The good selector drives both charts; both share width, margins and x-domain.

import { useMemo, useState } from "react";
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

export function ChartsPanel({ world, mc }: { world: World; mc: McResult }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [goodSel, setGoodSel] = useState<string>("__agg");
  const [reqView, setReqView] = useState<string>(BREAKDOWN);

  const mfg = mc.config.manufacturingLeadTime;
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

  // --- requirement (bottom): explode observed history through the BOMs -------
  const reqX = mc.months.map((m) => m - mfg);

  // historical consumption of one material (optionally one good), plotted shifted
  const matHistory = useMemo(
    () =>
      (matId: string): { t: number; v: number }[] =>
        mc.historyMonths.map((hm, i) => {
          let v = 0;
          for (const e of bomByMat.get(matId) ?? []) {
            if (goodSel !== "__agg" && e.goodId !== goodSel) continue;
            v += e.qtyPerUnit * (mc.historyByGood[e.goodId]?.[i]?.value ?? 0);
          }
          return { t: hm - mfg, v };
        }),
    [bomByMat, goodSel, mc.historyByGood, mc.historyMonths, mfg],
  );

  const totalReqHistory: SeriesPoint[] = useMemo(
    () =>
      mc.historyMonths.map((hm, i) => {
        let v = 0;
        for (const e of world.bom) {
          if (goodSel !== "__agg" && e.goodId !== goodSel) continue;
          v += e.qtyPerUnit * (mc.historyByGood[e.goodId]?.[i]?.value ?? 0);
        }
        return { t: hm - mfg, value: v };
      }),
    [world.bom, goodSel, mc.historyByGood, mc.historyMonths, mfg],
  );

  // breakdown: one line per material, history + forecast-mean, sharing a colour
  const breakdown = useMemo(() => {
    const source = goodSel === "__agg" ? mc.breakdown.all : mc.breakdown.byGood[goodSel] ?? {};
    const ids = Object.keys(source).filter((id) => source[id].some((v) => v > 0.01));
    ids.sort((a, b) => Math.max(...source[b]) - Math.max(...source[a]));
    const lines: LineSeries[] = ids.map((id, i) => {
      const future = mc.months.map((m, k) => ({ t: m - mfg, v: source[id][k] }));
      return { id, name: matName.get(id) ?? id, points: [...matHistory(id), ...future], color: lineColor(i) };
    });
    let yMax = 1;
    for (const l of lines) for (const p of l.points) if (p.v > yMax) yMax = p.v;
    return { lines, yMax };
  }, [goodSel, mc.breakdown, mc.months, matName, matHistory, mfg]);

  // Total requirement fan, good-aware (a good's total requirement is its demand
  // scaled by its total BOM quantity).
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
  if (reqView === BREAKDOWN) {
    reqLines = breakdown.lines;
    reqYMax = breakdown.yMax;
  } else if (reqView === TOTAL) {
    reqBands = goodSel === "__agg" ? mc.requirementAggregate : scaledGoodFan(goodSel);
    reqHistory = totalReqHistory;
    reqYMax = Math.max(maxOf(reqBands.map((b) => b.q95)), maxOf(reqHistory.map((h) => h.value)));
  } else {
    reqBands = mc.requirementByMaterial[reqView];
    reqHistory = matHistory(reqView).map((p) => ({ t: p.t, value: p.v }));
    reqYMax = Math.max(reqBands ? maxOf(reqBands.map((b) => b.q95)) : 1, maxOf(reqHistory.map((h) => h.value)));
  }

  const height = 188;
  const goodLabel = goodSel === "__agg" ? "all goods" : world.goods.find((g) => g.id === goodSel)?.name;

  return (
    <div ref={ref} className="charts">
      <div className="chart-block">
        <div className="chart-head">
          <h3>Finished-good demand</h3>
          <select value={goodSel} onChange={(e) => setGoodSel(e.target.value)} aria-label="Select good">
            <option value="__agg">All goods (aggregate)</option>
            {world.goods.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
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
          <select value={reqView} onChange={(e) => setReqView(e.target.value)} aria-label="Requirement view">
            <option value={BREAKDOWN}>Breakdown — one line per material</option>
            <option value={TOTAL}>Total — with uncertainty fan</option>
            <optgroup label="Drill down to one material">
              {world.materials.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <FanChart
          width={width}
          height={height}
          xDomain={xDomain}
          yMax={reqYMax}
          forecastX={reqX}
          bands={reqBands}
          lines={reqLines}
          history={reqHistory}
          color={theme.requirement}
          bandColor={theme.requirementBand}
          bandInnerColor={theme.requirementBandInner}
          yLabel="units consumed / month"
          unit="u"
          shift={mfg > 0 ? { months: mfg, label: `leads sales by ${mfg} mo` } : undefined}
        />
        {reqView === BREAKDOWN && breakdown.lines.length > 0 && (
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
        right is the forecast. The requirement chart sits {mfg > 0 ? `${mfg} month(s) ` : ""}left of demand because parts
        are consumed before goods are sold.{" "}
        {reqView === BREAKDOWN
          ? "Each coloured line is one raw material's consumption — past (jagged) and expected future; they sum to the total. Hover snaps to the nearest line."
          : reqView === TOTAL
            ? "The fan shows the median with 50% and 90% bands — the tail the priority list buys against."
            : "Drilled into one material: the fan is its forecast uncertainty across all goods."}
      </p>
    </div>
  );
}
