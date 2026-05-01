"use client";

import { Handle, Position } from "@xyflow/react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { NodeInsights } from "../insights-matcher";

// ── Style mapping for page types ──

const journeyPageTypeStyles: Record<
	string,
	{ border: string; bg: string; text: string; icon: string }
> = {
	homepage: {
		border: "border-emerald-500/50",
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		icon: "Homepage",
	},
	landing: {
		border: "border-emerald-500/50",
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		icon: "Landing",
	},
	product: {
		border: "border-blue-500/50",
		bg: "bg-blue-500/10",
		text: "text-blue-600 dark:text-blue-400",
		icon: "Product",
	},
	category: {
		border: "border-blue-500/50",
		bg: "bg-blue-500/10",
		text: "text-blue-600 dark:text-blue-400",
		icon: "Category",
	},
	pricing: {
		border: "border-violet-500/50",
		bg: "bg-violet-500/10",
		text: "text-violet-600 dark:text-violet-400",
		icon: "Pricing",
	},
	cart: {
		border: "border-amber-500/50",
		bg: "bg-amber-500/10",
		text: "text-amber-600 dark:text-amber-400",
		icon: "Cart",
	},
	checkout: {
		border: "border-red-500/50",
		bg: "bg-red-500/10",
		text: "text-red-600 dark:text-red-400",
		icon: "Checkout",
	},
	thank_you: {
		border: "border-emerald-500/50",
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		icon: "Confirmation",
	},
};

// ── InsightBadge subcomponent ──

const SEVERITY_BADGE_COLORS: Record<
	string,
	{ dot: string; bg: string; ring: string }
> = {
	critical: {
		dot: "bg-red-500",
		bg: "bg-red-500/10",
		ring: "ring-red-500/30",
	},
	high: {
		dot: "bg-orange-500",
		bg: "bg-orange-500/10",
		ring: "ring-orange-500/30",
	},
	medium: {
		dot: "bg-amber-400",
		bg: "bg-amber-400/10",
		ring: "ring-amber-400/30",
	},
	low: {
		dot: "bg-content-muted",
		bg: "bg-surface-inset",
		ring: "ring-content-muted/20",
	},
};

function InsightBadge({ insights }: { insights: NodeInsights }) {
	const colors =
		SEVERITY_BADGE_COLORS[insights.highestSeverity] ||
		SEVERITY_BADGE_COLORS.low;
	const count = insights.items.length;
	return (
		<div
			className={`absolute -right-2 -top-2 z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full border border-edge px-1 text-[10px] font-bold tabular-nums text-white shadow-sm ${colors.dot} ring-2 ${colors.ring}`}
			title={`${count} finding${count !== 1 ? "s" : ""} · $${Math.round(insights.totalImpact).toLocaleString()}/mo`}
		>
			<span className='relative'>{count}</span>
			{/* Pulse animation for critical/high */}
			{(insights.highestSeverity === "critical" ||
				insights.highestSeverity === "high") && (
				<span
					className={`absolute inset-0 animate-ping rounded-full opacity-30 ${colors.dot}`}
					style={{ animationDuration: "2s" }}
				/>
			)}
		</div>
	);
}

// ── Main component ──

export default function JourneyCommercialNode({ data }: { data: any }) {
	const t = useTranslations("console.maps");
	const nodeIndex = data._nodeIndex ?? 0;
	const style = journeyPageTypeStyles[data.pageType] || {
		border: "border-edge",
		bg: "bg-surface-inset/50",
		text: "text-content-muted",
		icon: "Page",
	};
	const pageTypeLabel = t(`page_types.${data.pageType || "page"}` as never);
	const conversionRate =
		typeof data.conversionRate === "number" ? data.conversionRate : null;
	const insights: NodeInsights | null = data._insights || null;

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
			animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
			transition={{
				duration: 0.5,
				ease: [0.22, 1, 0.36, 1],
				delay: nodeIndex * 0.05,
			}}
			className={`relative min-w-[180px] max-w-[220px] rounded-lg border-2 px-4 py-3 ${style.border} ${style.bg}`}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!bg-content-muted'
			/>
			{/* AI Insights badge */}
			{insights && insights.items.length > 0 && (
				<InsightBadge insights={insights} />
			)}
			<div
				className={`flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider ${style.text}`}
			>
				<span>{pageTypeLabel}</span>
				{conversionRate !== null && (
					<span className='font-mono text-[11px] tabular-nums'>
						{conversionRate}%
					</span>
				)}
			</div>
			<div
				className='mt-1 truncate text-sm font-medium text-content'
				title={data.label}
			>
				{data.label}
			</div>
			{data.path && (
				<div className='mt-0.5 truncate font-mono text-[10px] text-content-faint'>
					{data.path}
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
