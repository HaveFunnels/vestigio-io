"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { formatCurrency, severityColors } from "../map-utils";

export default function RootCauseNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const tc = useTranslations("console.common");
	const nodeIndex = data._nodeIndex ?? 0;

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
			animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
			transition={{
				duration: 0.5,
				ease: [0.22, 1, 0.36, 1],
				delay: nodeIndex * 0.05,
			}}
			className={`min-w-[200px] cursor-pointer rounded-lg border-2 px-4 py-3 transition-shadow hover:shadow-lg hover:shadow-red-500/10 ${severityColors[data.severity] || "border-edge bg-surface-inset/50"}`}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-muted'
			/>
			<div className='text-xs font-semibold uppercase tracking-wider text-content-muted'>
				{t("nodeTypes.rootCause")}
			</div>
			<div className='mt-1 text-sm font-medium text-content'>{data.label}</div>
			{data.impact && (
				<div className='mt-1 font-mono text-xs text-red-600 dark:text-red-400'>
					{formatCurrency(data.impact.min)} – {formatCurrency(data.impact.max)}
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
