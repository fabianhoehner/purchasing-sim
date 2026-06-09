// A single quantile fan chart. The two charts in the app share the same width,
// margins and x-domain (month indices), so their time axes line up pixel-for-
// pixel and the manufacturing-lead-time offset between demand and requirement is
// visible. Rendered as plain SVG with d3 scales — full control, no clutter.

import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useState } from "react";
import { theme } from "../theme";
import type { Band, SeriesPoint } from "../engine/types";

export const CHART_MARGIN = { top: 26, right: 18, bottom: 26, left: 60 };

export interface FanChartProps {
  width: number;
  height: number;
  xDomain: [number, number];
  yMax: number;
  /** Observed history line (months <= 0). Optional. */
  history?: SeriesPoint[];
  /** X positions (month indices) for the forecast bands. */
  forecastX: number[];
  bands: Band[];
  color: string;
  bandColor: string;
  bandInnerColor: string;
  yLabel: string;
  unit: string;
  /** Optional bracket annotation marking the lead-time shift. */
  shift?: { months: number; label: string };
}

function fmt(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return Math.round(v).toString();
}

export function FanChart(props: FanChartProps) {
  const { width, height, xDomain, yMax, history, forecastX, bands, color } = props;
  const [hoverX, setHoverX] = useState<number | null>(null);

  if (width <= 0) return <svg width="100%" height={height} />;

  const x = scaleLinear().domain(xDomain).range([CHART_MARGIN.left, width - CHART_MARGIN.right]);
  const y = scaleLinear().domain([0, yMax * 1.08]).nice().range([height - CHART_MARGIN.bottom, CHART_MARGIN.top]);

  const pts = forecastX.map((t, i) => ({ t, b: bands[i] }));
  const outer = area<{ t: number; b: Band }>()
    .x((d) => x(d.t))
    .y0((d) => y(d.b.q05))
    .y1((d) => y(d.b.q95));
  const inner = area<{ t: number; b: Band }>()
    .x((d) => x(d.t))
    .y0((d) => y(d.b.q25))
    .y1((d) => y(d.b.q75));
  const median = line<{ t: number; b: Band }>()
    .x((d) => x(d.t))
    .y((d) => y(d.b.q50));
  const histLine = line<SeriesPoint>()
    .x((d) => x(d.t))
    .y((d) => y(d.value));

  // x ticks: integers across the domain, spaced to ~7 labels.
  const span = xDomain[1] - xDomain[0];
  const step = Math.max(1, Math.round(span / 7));
  const xTicks: number[] = [];
  for (let t = Math.ceil(xDomain[0] / step) * step; t <= xDomain[1]; t += step) xTicks.push(t);
  if (!xTicks.includes(0) && 0 >= xDomain[0] && 0 <= xDomain[1]) xTicks.push(0);
  const yTicks = y.ticks(5);

  // hover: nearest forecast month
  const hovered =
    hoverX === null
      ? null
      : pts.reduce<{ t: number; b: Band } | null>((best, p) => {
          if (best === null) return p;
          return Math.abs(p.t - hoverX) < Math.abs(best.t - hoverX) ? p : best;
        }, null);

  return (
    <svg
      width={width}
      height={height}
      role="img"
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        setHoverX(x.invert(e.clientX - rect.left));
      }}
      onMouseLeave={() => setHoverX(null)}
    >
      {/* y gridlines + labels */}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={CHART_MARGIN.left} x2={width - CHART_MARGIN.right} y1={y(t)} y2={y(t)} stroke={theme.lineFaint} />
          <text x={CHART_MARGIN.left - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={theme.inkFaint}>
            {fmt(t)}
          </text>
        </g>
      ))}
      {/* x ticks */}
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={x(t)} x2={x(t)} y1={height - CHART_MARGIN.bottom} y2={height - CHART_MARGIN.bottom + 4} stroke={theme.line} />
          <text x={x(t)} y={height - CHART_MARGIN.bottom + 16} textAnchor="middle" fontSize={10} fill={theme.inkFaint}>
            {t === 0 ? "now" : t > 0 ? `+${t}` : `${t}`}
          </text>
        </g>
      ))}

      {/* "now" divider */}
      <line x1={x(0)} x2={x(0)} y1={CHART_MARGIN.top} y2={height - CHART_MARGIN.bottom} stroke={theme.inkFaint} strokeDasharray="2 3" opacity={0.6} />

      {/* bands + lines */}
      <path d={outer(pts) ?? ""} fill={props.bandColor} />
      <path d={inner(pts) ?? ""} fill={props.bandInnerColor} />
      <path d={median(pts) ?? ""} fill="none" stroke={color} strokeWidth={1.8} />
      {history && history.length > 0 && (
        <path d={histLine(history) ?? ""} fill="none" stroke={theme.ink} strokeWidth={1.2} opacity={0.75} />
      )}

      {/* lead-time shift bracket */}
      {props.shift && props.shift.months > 0 && (
        <g>
          <line x1={x(0 - props.shift.months)} x2={x(0)} y1={CHART_MARGIN.top - 8} y2={CHART_MARGIN.top - 8} stroke={theme.red} strokeWidth={1} />
          <line x1={x(0 - props.shift.months)} x2={x(0 - props.shift.months)} y1={CHART_MARGIN.top - 11} y2={CHART_MARGIN.top - 5} stroke={theme.red} strokeWidth={1} />
          <line x1={x(0)} x2={x(0)} y1={CHART_MARGIN.top - 11} y2={CHART_MARGIN.top - 5} stroke={theme.red} strokeWidth={1} />
          <text x={x(-props.shift.months / 2)} y={CHART_MARGIN.top - 13} textAnchor="middle" fontSize={9.5} fill={theme.red}>
            {props.shift.label}
          </text>
        </g>
      )}

      {/* hover crosshair + readout */}
      {hovered && (
        <g>
          <line x1={x(hovered.t)} x2={x(hovered.t)} y1={CHART_MARGIN.top} y2={height - CHART_MARGIN.bottom} stroke={color} strokeWidth={0.8} opacity={0.5} />
          <circle cx={x(hovered.t)} cy={y(hovered.b.q50)} r={3} fill={color} />
          <g transform={`translate(${Math.min(x(hovered.t) + 8, width - 130)}, ${CHART_MARGIN.top + 4})`}>
            <rect width={122} height={46} rx={3} fill={theme.paper} stroke={theme.line} opacity={0.96} />
            <text x={8} y={15} fontSize={10} fill={theme.inkSoft}>
              month {hovered.t === 0 ? "now" : hovered.t > 0 ? `+${hovered.t}` : hovered.t}
            </text>
            <text x={8} y={29} fontSize={10.5} fill={theme.ink}>
              median {fmt(hovered.b.q50)} {props.unit}
            </text>
            <text x={8} y={41} fontSize={9.5} fill={theme.inkFaint}>
              80% in [{fmt(hovered.b.q05)}, {fmt(hovered.b.q95)}]
            </text>
          </g>
        </g>
      )}

      {/* y axis label */}
      <text
        transform={`translate(14, ${(height - CHART_MARGIN.bottom + CHART_MARGIN.top) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize={10.5}
        fill={theme.inkSoft}
      >
        {props.yLabel}
      </text>
    </svg>
  );
}
