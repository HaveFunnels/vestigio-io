"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";

const HATCH_STYLE: React.CSSProperties = {
	backgroundImage:
		"repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 1px, transparent 6px)",
	backgroundBlendMode: "normal",
	opacity: 0.9,
};

export default function JourneyOtherEventsNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const nodeIndex = data._nodeIndex ?? 0;
	const rate =
		typeof data.conversionRate === "number" ? data.conversionRate : null;

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
			animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
			transition={{
				duration: 0.5,
				ease: [0.22, 1, 0.36, 1],
				delay: nodeIndex * 0.05,
			}}
			className='relative min-w-[140px] max-w-[180px] overflow-hidden rounded-md border border-dashed border-content-muted/60 bg-surface-card/60 px-3 py-2 text-content-muted'
		>
			<div
				aria-hidden
				className='pointer-events-none absolute inset-0 text-content-muted/15'
				style={HATCH_STYLE}
			/>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-faint'
			/>
			<div className='relative text-[10px] font-semibold uppercase tracking-wider text-content-muted'>
				{t("journey.other_events")}
			</div>
			{rate !== null && (
				<div className='relative mt-0.5 font-mono text-xs tabular-nums text-content-secondary'>
					{rate}%
				</div>
			)}
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-faint'
			/>
		</motion.div>
	);
}
