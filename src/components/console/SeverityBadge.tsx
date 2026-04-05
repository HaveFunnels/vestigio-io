"use client";

const colors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  low: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  none: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",

  // Health statuses
  healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  at_risk: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  unknown: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",

  // Decision impacts
  incident: "bg-red-500/10 text-red-400 border-red-500/20",
  block_launch: "bg-red-500/10 text-red-400 border-red-500/20",
  fix_before_scale: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  optimize: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  observe: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",

  // Preflight
  ready: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  ready_with_risks: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  blocker: "bg-red-500/10 text-red-400 border-red-500/20",
  na: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
};

export default function SeverityBadge({ value, className }: { value: string; className?: string }) {
  const style = colors[value] || colors.none;
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${style} ${className || ""}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}
