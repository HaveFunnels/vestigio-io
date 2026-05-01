"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";

export default function JourneySupportNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
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
			className='min-w-[160px] max-w-[200px] rounded-md border border-dashed border-edge bg-surface-card/50 px-3 py-2'
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-faint'
			/>
			<div className='text-[10px] font-semibold uppercase tracking-wider text-content-faint'>
				{t(`page_types.${data.pageType || "page"}` as never)}
			</div>
			<div
				className='mt-0.5 truncate text-xs text-content-muted'
				title={data.label}
			>
				{data.label}
			</div>
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-content-faint'
			/>
		</motion.div>
	);
}
