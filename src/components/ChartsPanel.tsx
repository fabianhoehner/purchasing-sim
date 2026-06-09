// The two stacked, time-aligned charts.
//   Top:    finished-good demand (history + forecast fan), for one good or all.
//   Bottom: the raw-material requirement that demand explodes into, plotted
//           shifted earlier by the manufacturing lead time. It offers three
//           views: a per-material *breakdown* (one expected line per material,
//           the default), the *total* requirement with its uncertainty fan, or a
//           single material drilled down to its fan.
// The good selector drives both charts; both share width, margins and x-domain
// so a column in one lines up with the same month in the other.

import { useMemo, useState } from "react";
import { useMeasure } from "../hooks/useMeasure";
import { theme } from "../theme";
import type { Band, McResult, World } from "../engine/types";
import { FanChart, type LineSeries } from "./FanChart";

// A muted categorical palette for the breakdown lines.
const PALETTE = [
  "#2b6e7a", "#7a5a2b", "#496a8f", "#8f4949", "#5a7a3a", "#6a4a7a",
  "#a0762b", "#3a8f7a", "#8f7a3a", "#7a3a5a", "#4a5a8f", "#2b8f5a",
];
const lineColor = (i: number) => PALETTE[i % PALETTE.length];

function bandsYMax(bands: Band[], extra: { value: number }[] = []): number {
  let m = 1;
  for (const b of bands) m = Math.max(m, b.q95);
  for (const h of extra) m = Math.max(m, h.value);
  return m;
}

const BREAKDOWN = "__breakdown";
const TOTAL = "__total";

export function ChartsPanel({ world, mc }: { world: World; mc: McResult }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [goodSel, setGoodSel] = useState<string>("__agg");
  const [reqView, setReqView] = useState<string>(BREAKDOWN);

  const mfg = mc.config.manufacturingLeadTime;
  const matName = useMemo(() => new Map(world.materials.map((m) => [m.id, m.name])), [world.materials]);
  const xDomain = useMemo<[number, number]>(
    () => [-(world.historyMonths - 1), world.horizonMonths],
    [world.historyMonths, world.horizonMonths],
  );

  // --- demand (top) ---------------------------------------------------------
  const demandBands = goodSel === "__agg" ? mc.forecastAggregate : mc.forecastByGood[goodSel];
  const demandHistory = goodSel === "__agg" ? mc.historyAggregate : mc.historyByGood[goodSel];
  const demandYMax = bandsYMax(demandBands, demandHistory);

  // --- requirement (bottom) -------------------------------------------------
  const reqX = mc.months.map((m) => m - mfg);

  const breakdown = useMemo(() => {
    const source = goodSel === "__agg" ? mc.breakdown.all : mc.breakdown.byGood[goodSel] ?? {};
    const ids = Object.keys(source).filter((id) => source[id].some((v) => v > 0.01));
    ids.sort((a, b) => Math.max(...source[b]) - Math.max(...source[a]));
    const lines: LineSeries[] = ids.map((id, i) => ({
      id,
      name: matName.get(id) ?? id,
      values: source[id],
      color: lineColor(i),
    }));
    let yMax = 1;
    for (const l of lines) for (const v of l.values) if (v > yMax) yMax = v;
    return { lines, yMax };
  }, [goodSel, mc.breakdown, matName]);

  // Total requirement fan, good-aware: a good's total requirement is its demand
  // scaled by its total BOM quantity, so we scale that good's demand fan.
  const scaledGoodFan = (gid: string): Band[] => {
    const q = mc.breakdown.goodTotalQty[gid] ?? 0;
    return mc.forecastByGood[gid].map((b) => ({
      q05: b.q05 * q, q25: b.q25 * q, q50: b.q50 * q, q75: b.q75 * q, q95: b.q95 * q,
    }));
  };

  let reqBands: Band[] | undefined;
  let reqLines: LineSeries[] | undefined;
  let reqYMax = 1;
  if (reqView === BREAKDOWN) {
    reqLines = breakdown.lines;
    reqYMax = breakdown.yMax;
  } else if (reqView === TOTAL) {
    reqBands = goodSel === "__agg" ? mc.requirementAggregate : scaledGoodFan(goodSel);
    reqYMax = bandsYMax(reqBands);
  } else {
    reqBands = mc.requirementByMaterial[reqView];
    reqYMax = reqBands ? bandsYMax(reqBands) : 1;
    // overlay the selected good's contribution to this material, if filtered
    if (goodSel !== "__agg" && mc.breakdown.byGood[goodSel]?.[reqView]) {
      reqLines = [{
        id: "contrib", name: `${world.goods.find((g) => g.id === goodSel)?.name} share`,
        values: mc.breakdown.byGood[goodSel][reqView], color: theme.requirement, dash: "4 3", bold: true,
      }];
    }
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
        Showing <strong>{goodLabel}</strong>. The dashed vertical line is <em>now</em>; the dark line is observed
        history. The requirement chart sits {mfg > 0 ? `${mfg} month(s) ` : ""}left of demand because parts are consumed
        before goods are sold.{" "}
        {reqView === BREAKDOWN
          ? "Each coloured line is one raw material's expected consumption; they sum to the total."
          : reqView === TOTAL
            ? "The fan shows the median with 50% and 90% bands — the tail the priority list buys against."
            : "Drilled into one material: the fan is its requirement uncertainty across all goods."}
      </p>
    </div>
  );
}
