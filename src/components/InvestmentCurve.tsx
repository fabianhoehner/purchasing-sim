// Investment → coverage curves. Two lines vs cumulative spend:
//   • Fill rate (β): share of demand units served. Concave — the first euros buy
//     near-certain demand, the last chase the rare tail.
//   • Service level (α): probability of never stocking out. S-shaped, and the
//     last points (87% → 99%) need the expensive tail.
// Markers: the economic optimum (stop past here and you destroy value) and the
// current budget (slides live).

import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { useMeasure } from "../hooks/useMeasure";
import { theme } from "../theme";
import type { InvestmentPoint } from "../engine/types";

const M = { top: 18, right: 18, bottom: 38, left: 46 };

function euro(v: number): string {
  if (v >= 1000) return `€${(v / 1000).toFixed(0)}k`;
  return `€${Math.round(v)}`;
}

export function InvestmentCurve({
  curve,
  economicSpend,
  currentSpend,
  currentFillRate,
  currentServiceLevel,
}: {
  curve: InvestmentPoint[];
  economicSpend: number;
  currentSpend: number;
  currentFillRate: number;
  currentServiceLevel: number;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const height = 240;

  const maxSpend = curve.length ? curve[curve.length - 1].spend || 1 : 1;
  const x = scaleLinear().domain([0, maxSpend]).range([M.left, Math.max(M.left, width - M.right)]);
  const y = scaleLinear().domain([0, 1]).range([height - M.bottom, M.top]);
  const safe = (v: number) => (Number.isFinite(v) ? v : 0);
  const cSpend = safe(currentSpend);
  const cFill = safe(currentFillRate);
  const cServ = safe(currentServiceLevel);
  const betaLine = line<InvestmentPoint>().x((d) => x(d.spend)).y((d) => y(d.fillRate));
  const alphaLine = line<InvestmentPoint>().x((d) => x(d.spend)).y((d) => y(d.serviceLevel));

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img">
          {y.ticks(5).map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={theme.lineFaint} />
              <text x={M.left - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={theme.inkFaint}>
                {(t * 100).toFixed(0)}%
              </text>
            </g>
          ))}
          {x.ticks(6).map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={height - M.bottom} y2={height - M.bottom + 4} stroke={theme.line} />
              <text x={x(t)} y={height - M.bottom + 15} textAnchor="middle" fontSize={9.5} fill={theme.inkFaint}>
                {euro(t)}
              </text>
            </g>
          ))}

          {/* the two curves */}
          <path d={alphaLine(curve) ?? ""} fill="none" stroke={theme.demand} strokeWidth={1.6} strokeDasharray="4 3" />
          <path d={betaLine(curve) ?? ""} fill="none" stroke={theme.requirement} strokeWidth={2} />

          {/* economic optimum marker */}
          <line x1={x(economicSpend)} x2={x(economicSpend)} y1={M.top} y2={height - M.bottom} stroke={theme.inkFaint} strokeDasharray="2 3" />
          <text x={Math.min(x(economicSpend) + 5, width - 110)} y={M.top + 10} fontSize={9.5} fill={theme.inkSoft}>
            economic optimum
          </text>

          {/* current budget marker */}
          <line x1={x(cSpend)} x2={x(cSpend)} y1={M.top} y2={height - M.bottom} stroke={theme.red} strokeWidth={2} />
          <circle cx={x(cSpend)} cy={y(cFill)} r={3.5} fill={theme.requirement} stroke="#fff" strokeWidth={1} />
          <circle cx={x(cSpend)} cy={y(cServ)} r={3.5} fill={theme.demand} stroke="#fff" strokeWidth={1} />
          <text x={Math.min(x(cSpend) + 6, width - 160)} y={height - M.bottom - 6} fontSize={10.5} fill={theme.red}>
            {euro(cSpend)} → β {(cFill * 100).toFixed(0)}% · α {(cServ * 100).toFixed(0)}%
          </text>

          {/* legend */}
          <g transform={`translate(${M.left + 6}, ${M.top + 2})`} fontSize={10}>
            <line x1={0} x2={16} y1={0} y2={0} stroke={theme.requirement} strokeWidth={2} />
            <text x={20} y={3} fill={theme.inkSoft}>fill rate (β)</text>
            <line x1={92} x2={108} y1={0} y2={0} stroke={theme.demand} strokeWidth={1.6} strokeDasharray="4 3" />
            <text x={112} y={3} fill={theme.inkSoft}>service level (α)</text>
          </g>

          <text x={(M.left + width - M.right) / 2} y={height - 4} textAnchor="middle" fontSize={10} fill={theme.inkSoft}>
            cumulative spend
          </text>
        </svg>
      )}
      <p className="hist-foot">
        <strong>Fill rate (β)</strong> — the share of demand actually served — climbs fast and is nearly maxed by the
        economic optimum: cheap, near-certain demand is served first. <strong>Service level (α)</strong> — never
        stocking out — lags, and dragging it from the optimum toward ~99% means buying the expensive tail (each extra
        point costs far more). Past the optimum (dashed grey) those units cost more in carrying than the stockouts they
        prevent. Drag the budget to move the red marker.
      </p>
    </div>
  );
}
