"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { formatCurrency } from "../map-utils";

export default function ActionNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const nodeIndex = data._nodeIndex ?? 0;

	// Phase 2F revenue heat: actions scale by impact magnitude (the upside they unlock).
	// Bigger unlocks get bigger nodes + emerald glow (positive, not severity-tinted).
	const scaleFactor: number | undefined = data._scaleFactor;
	const impactMid: number = data.impact?.midpoint ?? 0;

	const scaleClass =
		scaleFactor && scaleFactor >= 1.3
			? "scale-110"
			: scaleFactor && scaleFactor >= 1.15
				? "scale-105"
				: "";

	const glowClass =
		impactMid > 0 && scaleFactor && scaleFactor >= 1.3
			? "shadow-[0_0_16px_rgba(16,185,129,0.3)]"
			: impactMid > 0 && scaleFactor && scaleFactor >= 1.15
				? "shadow-[0_0_10px_rgba(16,185,129,0.2)]"
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
			className={`min-w-[180px] cursor-pointer rounded-md border border-emerald-600/50 bg-emerald-500/10 px-3 py-2 transition-transform duration-300 hover:shadow-lg hover:shadow-emerald-500/10 ${scaleClass} ${glowClass}`}
			style={scaleFactor ? { zoom: scaleFactor } : undefined}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-emerald-500'
			/>
			<div className='text-xs text-emerald-600 dark:text-emerald-400'>
				{t("nodeTypes.action")}
			</div>
			<div className='mt-0.5 text-sm text-content-secondary'>{data.label}</div>
			{data.impact && (
				<div className='mt-1 font-mono text-xs text-emerald-600 dark:text-emerald-400'>
					{t("impact_unlocks", {
						amount: formatCurrency(data.impact.midpoint),
					})}
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-emerald-500'
			/>
		</motion.div>
	);
}
