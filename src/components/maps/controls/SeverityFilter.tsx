"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Node } from "@xyflow/react";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;

const SEVERITY_COLORS: Record<string, { dot: string; active: string }> = {
	critical: {
		dot: "bg-red-500",
		active:
			"border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
	},
	high: {
		dot: "bg-orange-500",
		active:
			"border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400",
	},
	medium: {
		dot: "bg-amber-500",
		active:
			"border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	},
	low: {
		dot: "bg-zinc-400",
		active: "border-edge bg-surface-inset text-content-muted",
	},
};

interface SeverityFilterProps {
	nodes: Node[];
	activeSeverities: Set<string>;
	onToggle: (severity: string) => void;
}

export default function SeverityFilter({
	nodes,
	activeSeverities,
	onToggle,
}: SeverityFilterProps) {
	const t = useTranslations("console.maps.toolbar");

	const counts = useMemo(() => {
		const map: Record<string, number> = {
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
		};
		for (const n of nodes) {
			const sev = (n.data?.severity as string) || "";
			if (sev in map) map[sev]++;
		}
		return map;
	}, [nodes]);

	// Only render if there are nodes with severity
	const totalWithSeverity = Object.values(counts).reduce((a, b) => a + b, 0);
	if (totalWithSeverity === 0) return null;

	return (
		<div className='flex items-center gap-1' aria-label={t("severity_filter")}>
			{SEVERITIES.map((sev) => {
				if (counts[sev] === 0) return null;
				const isActive = activeSeverities.has(sev);
				const colors = SEVERITY_COLORS[sev];
				return (
					<button
						key={sev}
						onClick={() => onToggle(sev)}
						className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium capitalize transition-all ${
							isActive
								? colors.active
								: "border-edge/50 bg-transparent text-content-muted/40 line-through"
						}`}
					>
						<span
							className={`inline-block h-2 w-2 rounded-full ${colors.dot} ${
								!isActive ? "opacity-30" : ""
							}`}
						/>
						<span>{sev}</span>
						<span
							className={`ml-0.5 font-mono text-[10px] ${
								!isActive ? "opacity-40" : "opacity-70"
							}`}
						>
							{counts[sev]}
						</span>
					</button>
				);
			})}
		</div>
	);
}
