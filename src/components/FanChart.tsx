// A time-series chart that can draw, on a shared time axis:
//   * one quantile fan (median + 50%/90% bands) — used for an uncertainty view, and
//   * any number of plain lines — used for the per-material requirement breakdown.
// The two app charts share width, margins and x-domain so their axes line up and
// the manufacturing-lead-time offset between demand and requirement is visible.

import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useState } from "react";
import { theme } from "../theme";
import type { Band, SeriesPoint } from "../engine/types";

export const CHART_MARGIN = { top: 26, right: 18, bottom: 26, left: 60 };

export interface LineSeries {
  id: string;
  name: string;
  values: number[]; // aligned to forecastX
  color: string;
  width?: number;
  bold?: boolean; // the total / focused line — used for the hover readout
  dash?: string;
}

export interface FanChartProps {
  width: number;
  height: number;
  xDomain: [number, number];
  yMax: number;
  /** Observed history line (months <= 0). Optional. */
  history?: SeriesPoint[];
  /** X positions (month indices) for the forecast bands / lines. */
  forecastX: number[];
  /** Optional quantile fan. */
  bands?: Band[];
  color: string;
  bandColor: string;
  bandInnerColor: string;
  /** Optional overlaid lines (decomposition). */
  lines?: LineSeries[];
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
  const { width, height, xDomain, yMax, history, forecastX, bands, color, lines } = props;
  const [hoverX, setHoverX] = useState<number | null>(null);

  if (width <= 0) return <svg width="100%" height={height} />;

  const x = scaleLinear().domain(xDomain).range([CHART_MARGIN.left, width - CHART_MARGIN.right]);
  const y = scaleLinear().domain([0, yMax * 1.08]).nice().range([height - CHART_MARGIN.bottom, CHART_MARGIN.top]);

  const bandPts = bands ? forecastX.map((t, i) => ({ t, b: bands[i] })) : [];
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
  const seriesLine = line<{ t: number; v: number }>()
    .x((d) => x(d.t))
    .y((d) => y(d.v));

  // x ticks: integers across the domain, spaced to ~7 labels.
  const span = xDomain[1] - xDomain[0];
  const step = Math.max(1, Math.round(span / 7));
  const xTicks: number[] = [];
  for (let t = Math.ceil(xDomain[0] / step) * step; t <= xDomain[1]; t += step) xTicks.push(t);
  if (!xTicks.includes(0) && 0 >= xDomain[0] && 0 <= xDomain[1]) xTicks.push(0);
  const yTicks = y.ticks(5);

  // hover: nearest forecast month index
  let hi = -1;
  if (hoverX !== null && forecastX.length) {
    hi = 0;
    for (let i = 1; i < forecastX.length; i++) {
      if (Math.abs(forecastX[i] - hoverX) < Math.abs(forecastX[hi] - hoverX)) hi = i;
    }
  }
  const hoverBand = hi >= 0 && bands ? { t: forecastX[hi], b: bands[hi] } : null;
  const boldLine = lines?.find((l) => l.bold) ?? lines?.[0];
  const hoverLine = hi >= 0 && boldLine ? { t: forecastX[hi], v: boldLine.values[hi] } : null;

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
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={CHART_MARGIN.left} x2={width - CHART_MARGIN.right} y1={y(t)} y2={y(t)} stroke={theme.lineFaint} />
          <text x={CHART_MARGIN.left - 8} y={y(t) + 3} textAnchor="end" fontSize={10} fill={theme.inkFaint}>
            {fmt(t)}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={x(t)} x2={x(t)} y1={height - CHART_MARGIN.bottom} y2={height - CHART_MARGIN.bottom + 4} stroke={theme.line} />
          <text x={x(t)} y={height - CHART_MARGIN.bottom + 16} textAnchor="middle" fontSize={10} fill={theme.inkFaint}>
            {t === 0 ? "now" : t > 0 ? `+${t}` : `${t}`}
          </text>
        </g>
      ))}

      <line x1={x(0)} x2={x(0)} y1={CHART_MARGIN.top} y2={height - CHART_MARGIN.bottom} stroke={theme.inkFaint} strokeDasharray="2 3" opacity={0.6} />

      {bands && (
        <>
          <path d={outer(bandPts) ?? ""} fill={props.bandColor} />
          <path d={inner(bandPts) ?? ""} fill={props.bandInnerColor} />
          <path d={median(bandPts) ?? ""} fill="none" stroke={color} strokeWidth={1.8} />
        </>
      )}

      {lines?.map((l) => (
        <path
          key={l.id}
          d={seriesLine(forecastX.map((t, i) => ({ t, v: l.values[i] }))) ?? ""}
          fill="none"
          stroke={l.color}
          strokeWidth={l.width ?? (l.bold ? 2 : 1.1)}
          strokeDasharray={l.dash}
          opacity={l.bold ? 1 : 0.85}
        />
      ))}

      {history && history.length > 0 && (
        <path d={histLine(history) ?? ""} fill="none" stroke={theme.ink} strokeWidth={1.2} opacity={0.75} />
      )}

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

      {(hoverBand || hoverLine) && (
        <g>
          <line x1={x(forecastX[hi])} x2={x(forecastX[hi])} y1={CHART_MARGIN.top} y2={height - CHART_MARGIN.bottom} stroke={color} strokeWidth={0.8} opacity={0.5} />
          {hoverBand && <circle cx={x(hoverBand.t)} cy={y(hoverBand.b.q50)} r={3} fill={color} />}
          {!hoverBand && hoverLine && <circle cx={x(hoverLine.t)} cy={y(hoverLine.v)} r={3} fill={boldLine!.color} />}
          <g transform={`translate(${Math.min(x(forecastX[hi]) + 8, width - 132)}, ${CHART_MARGIN.top + 4})`}>
            <rect width={124} height={hoverBand ? 46 : 32} rx={3} fill={theme.paper} stroke={theme.line} opacity={0.96} />
            <text x={8} y={15} fontSize={10} fill={theme.inkSoft}>
              month {forecastX[hi] === 0 ? "now" : forecastX[hi] > 0 ? `+${forecastX[hi]}` : forecastX[hi]}
            </text>
            {hoverBand ? (
              <>
                <text x={8} y={29} fontSize={10.5} fill={theme.ink}>
                  median {fmt(hoverBand.b.q50)} {props.unit}
                </text>
                <text x={8} y={41} fontSize={9.5} fill={theme.inkFaint}>
                  80% in [{fmt(hoverBand.b.q05)}, {fmt(hoverBand.b.q95)}]
                </text>
              </>
            ) : (
              hoverLine && (
                <text x={8} y={29} fontSize={10.5} fill={theme.ink}>
                  {boldLine!.name} {fmt(hoverLine.v)} {props.unit}
                </text>
              )
            )}
          </g>
        </g>
      )}

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
