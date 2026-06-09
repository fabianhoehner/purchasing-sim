// The two stacked, time-aligned charts. Top: finished-good demand (history +
// forecast fan). Bottom: the exploded raw-material requirement, plotted shifted
// earlier by the manufacturing lead time so the offset is visible. Both charts
// share width, margins and x-domain, so a column in one lines up with the same
// month in the other.

import { useMemo, useState } from "react";
import { useMeasure } from "../hooks/useMeasure";
import { theme } from "../theme";
import type { Band, McResult, World } from "../engine/types";
import { FanChart } from "./FanChart";

function bandsYMax(bands: Band[], history: { value: number }[] = []): number {
  let m = 1;
  for (const b of bands) m = Math.max(m, b.q95);
  for (const h of history) m = Math.max(m, h.value);
  return m;
}

export function ChartsPanel({ world, mc }: { world: World; mc: McResult }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [goodSel, setGoodSel] = useState<string>("__agg");
  const [matSel, setMatSel] = useState<string>("__agg");

  const mfg = mc.config.manufacturingLeadTime;
  const xDomain = useMemo<[number, number]>(
    () => [-(world.historyMonths - 1), world.horizonMonths],
    [world.historyMonths, world.horizonMonths],
  );

  const demandBands = goodSel === "__agg" ? mc.forecastAggregate : mc.forecastByGood[goodSel];
  const demandHistory = goodSel === "__agg" ? mc.historyAggregate : mc.historyByGood[goodSel];
  const demandYMax = bandsYMax(demandBands, demandHistory);

  const reqBands = matSel === "__agg" ? mc.requirementAggregate : mc.requirementByMaterial[matSel];
  const reqYMax = bandsYMax(reqBands);
  // requirement leads the sale by the manufacturing lead time
  const reqX = mc.months.map((m) => m - mfg);

  const height = 188;

  return (
    <div ref={ref} className="charts">
      <div className="chart-block">
        <div className="chart-head">
          <h3>Finished-good demand</h3>
          <select value={goodSel} onChange={(e) => setGoodSel(e.target.value)} aria-label="Select good">
            <option value="__agg">All goods (aggregate)</option>
            {world.goods.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
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
          <select value={matSel} onChange={(e) => setMatSel(e.target.value)} aria-label="Select material">
            <option value="__agg">All materials (aggregate)</option>
            {world.materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <FanChart
          width={width}
          height={height}
          xDomain={xDomain}
          yMax={reqYMax}
          forecastX={reqX}
          bands={reqBands}
          color={theme.requirement}
          bandColor={theme.requirementBand}
          bandInnerColor={theme.requirementBandInner}
          yLabel="units consumed / month"
          unit="u"
          shift={mfg > 0 ? { months: mfg, label: `leads sales by ${mfg} mo` } : undefined}
        />
      </div>
      <p className="chart-foot">
        The dashed line is <em>now</em>. History is the dark line; the shaded fans show the median with 50% and 90%
        bands. The requirement fan sits {mfg > 0 ? `${mfg} month(s) ` : ""}left of demand because parts are consumed
        before goods are sold.
      </p>
    </div>
  );
}
