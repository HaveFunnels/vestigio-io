"use client";

type ChangeClass = 'regression' | 'improvement' | 'new_issue' | 'resolved' | 'stable_risk';

const config: Record<ChangeClass, { label: string; style: string; icon: string }> = {
  regression: {
    label: "Regression",
    style: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: "\u2191", // arrow up
  },
  improvement: {
    label: "Improved",
    style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: "\u2193", // arrow down
  },
  new_issue: {
    label: "New",
    style: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: "+",
  },
  resolved: {
    label: "Resolved",
    style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: "\u2713", // check
  },
  stable_risk: {
    label: "Stable Risk",
    style: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: "\u2014", // minus / em dash
  },
};

export default function ChangeBadge({
  value,
  className,
}: {
  value: ChangeClass | null;
  className?: string;
}) {
  if (!value) return null;

  const c = config[value];
  if (!c) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${c.style} ${className || ""}`}
    >
      <span>{c.icon}</span>
      {c.label}
    </span>
  );
}
