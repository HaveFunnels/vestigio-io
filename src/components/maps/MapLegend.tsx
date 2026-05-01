"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NODE_SWATCH_CLASS, EDGE_SWATCH_CLASS } from "./map-utils";
import type { MapDefinition } from "../../../packages/maps";

interface MapLegendProps {
	legend: MapDefinition["legend"];
	onFilterChange?: (filter: string | null) => void;
	isMobile?: boolean;
}

export default function MapLegend({
	legend,
	onFilterChange,
	isMobile,
}: MapLegendProps) {
	const t = useTranslations("console.maps.legend");
	const [activeFilter, setActiveFilter] = useState<string | null>(null);
	const [collapsed, setCollapsed] = useState(true);

	if (
		(!legend?.nodes || legend.nodes.length === 0) &&
		(!legend?.edges || legend.edges.length === 0)
	) {
		return null;
	}

	const handleNodeClick = (swatch: string) => {
		const next = activeFilter === swatch ? null : swatch;
		setActiveFilter(next);
		onFilterChange?.(next);
	};

	const handleEdgeClick = (swatch: string) => {
		const filterKey = `edge:${swatch}`;
		const next = activeFilter === filterKey ? null : filterKey;
		setActiveFilter(next);
		onFilterChange?.(next);
	};

	const legendContent = (
		<div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-content-muted'>
			{legend.nodes.map((entry) => (
				<button
					key={`n:${entry.swatch}`}
					type='button'
					onClick={() => handleNodeClick(entry.swatch)}
					className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-all ${
						activeFilter === entry.swatch
							? "bg-surface-inset ring-1 ring-accent"
							: "hover:bg-surface-inset/50"
					}`}
				>
					<span
						className={`inline-block h-3 w-3 rounded border-2 ${
							NODE_SWATCH_CLASS[entry.swatch] ||
							"border-content-muted bg-surface-inset"
						}`}
					/>
					{t(entry.labelKey)}
				</button>
			))}
			{legend.edges.length > 0 && legend.nodes.length > 0 && (
				<span className='hidden h-4 w-px bg-edge sm:block' aria-hidden />
			)}
			{legend.edges.map((entry) => (
				<button
					key={`e:${entry.swatch}`}
					type='button'
					onClick={() => handleEdgeClick(entry.swatch)}
					className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-all ${
						activeFilter === `edge:${entry.swatch}`
							? "bg-surface-inset ring-1 ring-accent"
							: "hover:bg-surface-inset/50"
					}`}
				>
					<span
						className={`inline-block h-0.5 w-4 ${
							EDGE_SWATCH_CLASS[entry.swatch] || "bg-content-muted"
						}`}
					/>
					{t(entry.labelKey)}
				</button>
			))}
		</div>
	);

	// Mobile: collapsible bottom sheet
	if (isMobile) {
		return (
			<div className='border-t border-edge'>
				<button
					type='button'
					onClick={() => setCollapsed(!collapsed)}
					className='flex w-full items-center justify-between px-4 py-2 text-xs text-content-muted'
				>
					<span className='font-medium'>Legend</span>
					<svg
						className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
						fill='none'
						viewBox='0 0 24 24'
						stroke='currentColor'
					>
						<path
							strokeLinecap='round'
							strokeLinejoin='round'
							strokeWidth={2}
							d='M5 15l7-7 7 7'
						/>
					</svg>
				</button>
				{!collapsed && <div className='px-4 pb-3'>{legendContent}</div>}
			</div>
		);
	}

	return <div className='border-t border-edge px-6 py-3'>{legendContent}</div>;
}
