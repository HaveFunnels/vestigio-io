"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// TrendSparkline — mini SVG sparkline for workspace cards
//
// Renders a 5-point polyline with filled area.
// Line color: green if improving, red if declining, zinc if stable.
// ──────────────────────────────────────────────

interface TrendSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

function deriveTrendLabel(data: number[]): "improving" | "declining" | "stable" {
  if (data.length < 2) return "stable";
  const first = data[0];
  const last = data[data.length - 1];
  if (last > first) return "improving";
  if (last < first) return "declining";
  return "stable";
}

const TREND_COLORS: Record<string, { stroke: string; fill: string }> = {
  improving: { stroke: "#22c55e", fill: "rgba(34,197,94,0.12)" },
  declining: { stroke: "#ef4444", fill: "rgba(239,68,68,0.12)" },
  stable: { stroke: "#a1a1aa", fill: "rgba(161,161,170,0.08)" },
};

export default function TrendSparkline({
  data,
  color,
  width = 80,
  height = 24,
}: TrendSparklineProps) {
  const t = useTranslations("console.workspaces");

  const { points, areaPoints, trend } = useMemo(() => {
    if (data.length < 2) {
      return { points: "", areaPoints: "", trend: "stable" as const };
    }

    const trend = deriveTrendLabel(data);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    const usableW = width - padding * 2;
    const usableH = height - padding * 2;

    const pts = data.map((v, i) => {
      const x = padding + (i / (data.length - 1)) * usableW;
      const y = padding + usableH - ((v - min) / range) * usableH;
      return { x, y };
    });

    const points = pts.map((p) => `${p.x},${p.y}`).join(" ");
    const areaPoints = [
      `${pts[0].x},${height}`,
      ...pts.map((p) => `${p.x},${p.y}`),
      `${pts[pts.length - 1].x},${height}`,
    ].join(" ");

    return { points, areaPoints, trend };
  }, [data, width, height]);

  if (data.length < 2) return null;

  const resolvedColor = color
    ? { stroke: color, fill: `${color}20` }
    : TREND_COLORS[trend];

  const trendKey = `trend_${trend}` as const;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-label={t(trendKey)}
    >
      <title>{t(trendKey)}</title>
      <polygon points={areaPoints} fill={resolvedColor.fill} />
      <polyline
        points={points}
        fill="none"
        stroke={resolvedColor.stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Derive a synthetic 5-point sparkline from a workspace's change_summary.
 * When historical cycle data is unavailable, we synthesize a plausible
 * 5-point trend from current metrics.
 */
export function synthesizeSparklineData(
  changeSummary: {
    trend: string;
    regression_count: number;
    improvement_count: number;
    resolved_count: number;
  } | null,
  issueCount: number,
): number[] {
  if (!changeSummary) {
    // No change data — flat line at current issue count
    return [issueCount, issueCount, issueCount, issueCount, issueCount];
  }

  const { trend, regression_count, improvement_count, resolved_count } = changeSummary;
  const net = improvement_count + resolved_count - regression_count;

  // Build a 5-point array ending at current issue count
  // with a slope reflecting the trend direction
  const base = issueCount;
  const delta = Math.max(1, Math.abs(net));

  switch (trend) {
    case "improving":
      return [
        base + delta * 2,
        base + delta * 1.5,
        base + delta,
        base + delta * 0.4,
        base,
      ];
    case "degrading":
      return [
        Math.max(0, base - delta * 2),
        Math.max(0, base - delta * 1.5),
        Math.max(0, base - delta),
        Math.max(0, base - delta * 0.4),
        base,
      ];
    case "mixed":
      return [
        base + delta * 0.5,
        Math.max(0, base - delta * 0.3),
        base + delta * 0.8,
        Math.max(0, base - delta * 0.1),
        base,
      ];
    default: // stable
      return [base, base, base, base, base];
  }
}
