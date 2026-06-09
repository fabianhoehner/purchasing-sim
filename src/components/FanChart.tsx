// A time-series chart that can draw, on a shared time axis:
//   * one quantile fan (median + 50%/90% bands) — an uncertainty view,
//   * an observed-history line, and
//   * any number of plain lines, each spanning history and forecast — used for
//     the per-material requirement breakdown.
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
  /** Points across the whole axis (t is the plot month, history and forecast). */
  points: { t: number; v: number }[];
  color: string;
  width?: number;
  bold?: boolean;
  dash?: string;
}

export interface FanChartProps {
  width: number;
  height: number;
  xDomain: [number, number];
  yMax: number;
  /** Observed history line (dark). t is the plot month. */
  history?: SeriesPoint[];
  /** X positions (month indices) for the forecast bands. */
  forecastX: number[];
  /** Optional quantile fan. */
  bands?: Band[];
  color: string;
  bandColor: string;
  bandInnerColor: string;
  /** Optional overlaid lines (decomposition); hover snaps to the nearest one. */
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
  const [hover, setHover] = useState<{ mx: number; my: number } | null>(null);

  if (width <= 0) return <svg width="100%" height={height} />;

  const x = scaleLinear().domain(xDomain).range([CHART_MARGIN.left, width - CHART_MARGIN.right]);
  const y = scaleLinear().domain([0, yMax * 1.08]).nice().range([height - CHART_MARGIN.bottom, CHART_MARGIN.top]);

  const bandPts = bands ? forecastX.map((t, i) => ({ t, b: bands[i] })) : [];
  const outer = area<{ t: number; b: Band }>().x((d) => x(d.t)).y0((d) => y(d.b.q05)).y1((d) => y(d.b.q95));
  const inner = area<{ t: number; b: Band }>().x((d) => x(d.t)).y0((d) => y(d.b.q25)).y1((d) => y(d.b.q75));
  const median = line<{ t: number; b: Band }>().x((d) => x(d.t)).y((d) => y(d.b.q50));
  const histLine = line<SeriesPoint>().x((d) => x(d.t)).y((d) => y(d.value));
  const seriesLine = line<{ t: number; v: number }>().x((d) => x(d.t)).y((d) => y(d.v));

  // x ticks: integers across the domain, spaced to ~7 labels.
  const span = xDomain[1] - xDomain[0];
  const step = Math.max(1, Math.round(span / 7));
  const xTicks: number[] = [];
  for (let t = Math.ceil(xDomain[0] / step) * step; t <= xDomain[1]; t += step) xTicks.push(t);
  if (!xTicks.includes(0) && 0 >= xDomain[0] && 0 <= xDomain[1]) xTicks.push(0);
  const yTicks = y.ticks(5);

  // --- hover -----------------------------------------------------------------
  const monthX = hover ? x.invert(hover.mx) : null;

  // nearest line by vertical pixel distance at the hovered month
  let hotLine: LineSeries | null = null;
  let hotPt: { t: number; v: number } | null = null;
  if (hover && monthX !== null && lines && lines.length) {
    let best = Infinity;
    for (const l of lines) {
      let p = l.points[0];
      for (const q of l.points) if (Math.abs(q.t - monthX) < Math.abs(p.t - monthX)) p = q;
      if (!p) continue;
      const dy = Math.abs(hover.my - y(p.v));
      if (dy < best) {
        best = dy;
        hotLine = l;
        hotPt = p;
      }
    }
  }
  // band readout (when there are no overlaid lines)
  let hotBand: { t: number; b: Band } | null = null;
  if (hover && monthX !== null && bands && (!lines || !lines.length) && forecastX.length) {
    let hi = 0;
    for (let i = 1; i < forecastX.length; i++) if (Math.abs(forecastX[i] - monthX) < Math.abs(forecastX[hi] - monthX)) hi = i;
    hotBand = { t: forecastX[hi], b: bands[hi] };
  }

  return (
    <svg
      width={width}
      height={height}
      role="img"
      onMouseMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        setHover({ mx: e.clientX - rect.left, my: e.clientY - rect.top });
      }}
      onMouseLeave={() => setHover(null)}
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

      {lines?.map((l) => {
        const dim = hotLine && l !== hotLine;
        return (
          <path
            key={l.id}
            d={seriesLine([...l.points].sort((a, b) => a.t - b.t)) ?? ""}
            fill="none"
            stroke={l.color}
            strokeWidth={l === hotLine ? (l.width ?? 1.2) + 1.4 : l.width ?? (l.bold ? 2 : 1.2)}
            strokeDasharray={l.dash}
            opacity={dim ? 0.28 : l.bold ? 1 : 0.9}
          />
        );
      })}

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

      {/* hover: nearest line */}
      {hotLine && hotPt && (
        <g>
          <line x1={x(hotPt.t)} x2={x(hotPt.t)} y1={CHART_MARGIN.top} y2={height - CHART_MARGIN.bottom} stroke={hotLine.color} strokeWidth={0.7} opacity={0.45} />
          <circle cx={x(hotPt.t)} cy={y(hotPt.v)} r={3} fill={hotLine.color} />
          <g transform={`translate(${Math.min(x(hotPt.t) + 8, width - 150)}, ${Math.max(CHART_MARGIN.top, y(hotPt.v) - 30)})`}>
            <rect width={146} height={30} rx={3} fill={theme.paper} stroke={theme.line} opacity={0.97} />
            <text x={8} y={13} fontSize={10.5} fill={theme.ink}>
              {hotLine.name}
            </text>
            <text x={8} y={25} fontSize={9.5} fill={theme.inkSoft}>
              {fmt(hotPt.v)} {props.unit} · month {hotPt.t === 0 ? "now" : hotPt.t > 0 ? `+${hotPt.t}` : hotPt.t}
            </text>
          </g>
        </g>
      )}

      {/* hover: band readout */}
      {hotBand && (
        <g>
          <line x1={x(hotBand.t)} x2={x(hotBand.t)} y1={CHART_MARGIN.top} y2={height - CHART_MARGIN.bottom} stroke={color} strokeWidth={0.8} opacity={0.5} />
          <circle cx={x(hotBand.t)} cy={y(hotBand.b.q50)} r={3} fill={color} />
          <g transform={`translate(${Math.min(x(hotBand.t) + 8, width - 132)}, ${CHART_MARGIN.top + 4})`}>
            <rect width={124} height={46} rx={3} fill={theme.paper} stroke={theme.line} opacity={0.96} />
            <text x={8} y={15} fontSize={10} fill={theme.inkSoft}>
              month {hotBand.t === 0 ? "now" : hotBand.t > 0 ? `+${hotBand.t}` : hotBand.t}
            </text>
            <text x={8} y={29} fontSize={10.5} fill={theme.ink}>
              median {fmt(hotBand.b.q50)} {props.unit}
            </text>
            <text x={8} y={41} fontSize={9.5} fill={theme.inkFaint}>
              80% in [{fmt(hotBand.b.q05)}, {fmt(hotBand.b.q95)}]
            </text>
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
