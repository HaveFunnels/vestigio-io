"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";

export default function CategoryNode({ data }: { data: any }) {
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
			className='min-w-[160px] rounded-md border border-blue-600/50 bg-blue-500/10 px-4 py-3'
		>
			<div className='text-sm font-semibold text-blue-600 dark:text-blue-400'>
				{data.label || t("nodeTypes.category")}
			</div>
			<Handle
				type='source'
				position={Position.Right}
				className='!bg-blue-500'
			/>
		</motion.div>
	);
}
