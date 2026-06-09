// Per-part requirement distribution. This is the picture that explains a line in
// the purchase list: the empirical distribution of the material's requirement
// over its coverage window (the same distribution the scorer reads), with the
// chosen buy quantity drawn as a vertical line. The share of the distribution to
// the left of that line is exactly the fill rate the quantity buys — so you can
// see why "buy 2,038" means "98% fill rate". Move the budget and the line slides.

import { scaleLinear } from "d3-scale";
import { useMeasure } from "../hooks/useMeasure";
import { theme } from "../theme";
import type { Material, MaterialLine } from "../engine/types";

const MARGIN = { top: 16, right: 18, bottom: 34, left: 46 };

function fmt(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toString();
}

export function Histogram({
  material,
  samples,
  line,
}: {
  material: Material;
  samples: number[]; // ascending window-requirement samples
  line: MaterialLine | undefined;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const height = 200;
  const qty = line?.qty ?? 0;
  const fill = line?.coverage ?? 0;

  if (samples.length === 0) {
    return (
      <div ref={ref}>
        <p className="hist-empty">No requirement for this material.</p>
      </div>
    );
  }

  const n = samples.length;
  const lo = samples[0];
  const hi = samples[n - 1];
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const median = samples[Math.floor(n / 2)];
  const p90 = samples[Math.min(n - 1, Math.floor(0.9 * n))];

  // bin
  const nBins = 30;
  const span = Math.max(1, hi - lo);
  const binW = span / nBins;
  const counts = new Array<number>(nBins).fill(0);
  for (const s of samples) {
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor((s - lo) / binW)));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);

  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const x = scaleLinear().domain([lo, lo + binW * nBins]).range([MARGIN.left, MARGIN.left + innerW]);
  const y = scaleLinear().domain([0, maxCount]).range([height - MARGIN.bottom, MARGIN.top]);
  const xTicks = x.ticks(6);

  const qtyClamped = Math.min(Math.max(qty, x.domain()[0]), x.domain()[1]);

  return (
    <div ref={ref}>
      <div className="hist-head">
        <span className="hist-title">{material.name}</span>
        <span className="hist-readout">
          buy <strong>{qty.toLocaleString("en-US")}</strong> → <strong style={{ color: theme.red }}>{(fill * 100).toFixed(0)}%</strong> fill rate
        </span>
      </div>
      {width > 0 && (
        <svg width={width} height={height} role="img">
          {y.ticks(4).map((t) => (
            <line key={t} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke={theme.lineFaint} />
          ))}
          {/* bars: covered (left of qty) vs at-risk (right of qty) */}
          {counts.map((c, i) => {
            const x0 = lo + i * binW;
            const center = x0 + binW / 2;
            const covered = center <= qty;
            const px = x(x0);
            const pw = Math.max(0.5, x(x0 + binW) - px - 1);
            return (
              <rect
                key={i}
                x={px}
                y={y(c)}
                width={pw}
                height={y(0) - y(c)}
                fill={covered ? theme.demand : theme.red}
                opacity={covered ? 0.5 : 0.28}
              />
            );
          })}

          {/* mean + median markers */}
          {[{ v: median, label: "median", dash: "3 3" }, { v: mean, label: "mean", dash: "1 3" }].map((mk) => (
            <line key={mk.label} x1={x(mk.v)} x2={x(mk.v)} y1={MARGIN.top} y2={height - MARGIN.bottom} stroke={theme.inkFaint} strokeDasharray={mk.dash} />
          ))}

          {/* buy-quantity line — the cut */}
          <line x1={x(qtyClamped)} x2={x(qtyClamped)} y1={MARGIN.top - 4} y2={height - MARGIN.bottom} stroke={theme.red} strokeWidth={2} />
          <text x={x(qtyClamped)} y={MARGIN.top - 6} textAnchor="middle" fontSize={10} fill={theme.red}>
            buy {fmt(qty)}
          </text>

          {/* x axis */}
          {xTicks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={height - MARGIN.bottom} y2={height - MARGIN.bottom + 4} stroke={theme.line} />
              <text x={x(t)} y={height - MARGIN.bottom + 15} textAnchor="middle" fontSize={9.5} fill={theme.inkFaint}>
                {fmt(t)}
              </text>
            </g>
          ))}
          <text x={(MARGIN.left + width - MARGIN.right) / 2} y={height - 4} textAnchor="middle" fontSize={10} fill={theme.inkSoft}>
            units required over the coverage window
          </text>
          <text transform={`translate(12, ${(height - MARGIN.bottom + MARGIN.top) / 2}) rotate(-90)`} textAnchor="middle" fontSize={9.5} fill={theme.inkFaint}>
            scenarios
          </text>
        </svg>
      )}
      <p className="hist-foot">
        Blue mass left of the red line is served ({(fill * 100).toFixed(0)}% of scenarios); pink mass to its right is the
        stockout risk. Mean {fmt(mean)}, median {fmt(median)}, 90th pct {fmt(p90)} units. Lead time{" "}
        {material.leadTimeMean.toFixed(1)} mo sets the window.
      </p>
    </div>
  );
}
