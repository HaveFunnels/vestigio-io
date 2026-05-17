"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { formatCurrency, severityColors } from "../map-utils";

export default function FindingNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const tc = useTranslations("console.common");
	const nodeIndex = data._nodeIndex ?? 0;

	// Phase 2F revenue heat: severity drives discrete scale + glow.
	// Impact magnitude (via _scaleFactor from map-converters) modulates within tier.
	const severity: string = data.severity ?? "low";
	const scaleFactor: number | undefined = data._scaleFactor;

	const scaleClass =
		severity === "critical"
			? "scale-110"
			: severity === "high"
				? "scale-105"
				: "";

	const glowClass =
		severity === "critical"
			? "shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse"
			: severity === "high"
				? "shadow-[0_0_12px_rgba(248,113,113,0.25)]"
				: severity === "medium"
					? "shadow-[0_0_8px_rgba(251,191,36,0.2)]"
					: "";

	return (
		<motion.div
			initial={{ opacity: 0, filter: "blur(4px)" }}
			animate={{ opacity: 1, filter: "blur(0px)" }}
			transition={{
				duration: 0.5,
				ease: [0.22, 1, 0.36, 1],
				delay: nodeIndex * 0.05,
			}}
			className={`min-w-[180px] cursor-pointer rounded-md border px-3 py-2 transition-transform duration-300 hover:shadow-lg hover:shadow-amber-500/10 ${scaleClass} ${glowClass} ${severityColors[data.severity] || "border-edge bg-surface-inset/50"}`}
			style={scaleFactor ? { zoom: scaleFactor } : undefined}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-muted'
			/>
			<div className='text-xs text-content-muted'>{t("nodeTypes.finding")}</div>
			<div className='mt-0.5 text-sm text-content-secondary'>{data.label}</div>
			{data.impact && (
				<div className='mt-1 font-mono text-xs text-red-600 dark:text-red-400'>
					{formatCurrency(data.impact.midpoint)}
					{tc("per_month_short")}
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-muted'
			/>
		</motion.div>
	);
}
