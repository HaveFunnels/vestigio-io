"use client";

// ──────────────────────────────────────────────
// TrendBadge — Wave 7.1
//
// Displays a multi-cycle trend pattern badge on findings.
// Placed alongside the existing ChangeBadge to show temporal
// context: "this finding has been degrading for 3 cycles."
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";

type TrendPattern =
	| "consecutive_regressions"
	| "gradual_degradation"
	| "sudden_spike"
	| "improving"
	| "oscillating"
	| "stable";

const config: Record<TrendPattern, { key: string; style: string; icon: string } | null> = {
	consecutive_regressions: {
		key: "consecutive_regressions",
		style: "bg-red-500/10 text-red-400 border-red-500/20",
		icon: "\u2B06", // up arrow
	},
	gradual_degradation: {
		key: "gradual_degradation",
		style: "bg-orange-500/10 text-orange-400 border-orange-500/20",
		icon: "\u2197", // diagonal arrow
	},
	sudden_spike: {
		key: "sudden_spike",
		style: "bg-amber-500/10 text-amber-400 border-amber-500/20",
		icon: "\u26A1", // lightning
	},
	improving: {
		key: "improving",
		style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
		icon: "\u2B07", // down arrow
	},
	oscillating: {
		key: "oscillating",
		style: "bg-violet-500/10 text-violet-400 border-violet-500/20",
		icon: "\u223F", // sine wave
	},
	stable: null, // Don't render a badge for stable — it's the default state
};

export default function TrendBadge({
	pattern,
	streak,
	className,
}: {
	pattern: TrendPattern | null;
	streak: number | null;
	className?: string;
}) {
	const t = useTranslations("console.trend_badge");

	if (!pattern) return null;

	const c = config[pattern];
	if (!c) return null;

	const label = streak && streak > 1
		? t(`${c.key}_with_streak`, { streak })
		: t(c.key);

	return (
		<span
			className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${c.style} ${className || ""}`}
			title={label}
		>
			<span>{c.icon}</span>
			{label}
		</span>
	);
}
