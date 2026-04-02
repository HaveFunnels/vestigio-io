"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="h-10" />,
});

export interface SummaryCard {
  label: string;
  value: string | number;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  sparkData?: number[];
}

const variantStyles = {
  default: "border-edge text-content",
  success: "border-emerald-800/50 text-emerald-400",
  warning: "border-amber-800/50 text-amber-400",
  danger: "border-red-800/50 text-red-400",
  info: "border-blue-800/50 text-blue-400",
};

const variantSparkColors: Record<string, string> = {
  default: "#a1a1aa",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
};

function sparkOptions(color: string): ApexOptions {
  return {
    chart: { sparkline: { enabled: true }, animations: { enabled: false } },
    stroke: { width: 2, curve: "smooth" },
    colors: [color],
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [0, 100] },
    },
    tooltip: { enabled: false },
  };
}

export default function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => {
        const variant = card.variant || "default";
        return (
          <div
            key={card.label}
            className={`rounded-lg border bg-surface-card/50 px-4 py-3 ${variantStyles[variant]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wider text-content-faint">
                  {card.label}
                </div>
                <div className="mt-1 text-xl font-bold">{card.value}</div>
                {card.subtext && (
                  <div className="mt-0.5 text-xs text-content-faint">{card.subtext}</div>
                )}
              </div>
              {card.sparkData && card.sparkData.length > 1 && (
                <div className="h-10 w-20 shrink-0">
                  <ReactApexChart
                    type="area"
                    height={40}
                    width="100%"
                    options={sparkOptions(variantSparkColors[variant])}
                    series={[{ data: card.sparkData }]}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
