"use client";

type VerificationMaturity = 'unverified' | 'pending' | 'partially' | 'verified' | 'degraded' | 'stale';

const config: Record<VerificationMaturity, { label: string; style: string; icon: string }> = {
  unverified: {
    label: "Unverified",
    style: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    icon: "\u25CB", // open circle
  },
  pending: {
    label: "Pending",
    style: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: "\u23F3", // hourglass
  },
  partially: {
    label: "Partial",
    style: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: "\u25D1", // half circle
  },
  verified: {
    label: "Verified",
    style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: "\u2713", // check
  },
  degraded: {
    label: "Degraded",
    style: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    icon: "\u25BC", // down triangle
  },
  stale: {
    label: "Stale",
    style: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: "\u2717", // cross
  },
};

export default function VerificationBadge({
  value,
  className,
}: {
  value: VerificationMaturity | null;
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
