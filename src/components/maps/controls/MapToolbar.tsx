"use client";

import type { Node } from "@xyflow/react";
import SeverityFilter from "./SeverityFilter";
import { MapSearchButton } from "./MapSearch";
import MapExportButton from "./MapExportButton";

interface MapToolbarProps {
	nodes: Node[];
	mapTitle: string;
	activeSeverities: Set<string>;
	onToggleSeverity: (severity: string) => void;
	onOpenSearch: () => void;
}

export default function MapToolbar({
	nodes,
	mapTitle,
	activeSeverities,
	onToggleSeverity,
	onOpenSearch,
}: MapToolbarProps) {
	return (
		<div className='absolute left-2 right-2 top-2 z-20 flex items-center gap-2 rounded-xl border border-edge bg-zinc-900/60 p-1.5 backdrop-blur-md sm:left-3 sm:right-3 sm:top-3 sm:p-2'>
			{/* Left: Severity Filter — scrolls horizontally on narrow viewports
			    so the search + export controls always stay visible. */}
			<div className='min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
				<SeverityFilter
					nodes={nodes}
					activeSeverities={activeSeverities}
					onToggle={onToggleSeverity}
				/>
			</div>

			{/* Right: Search + Export */}
			<div className='flex shrink-0 items-center gap-1.5'>
				<MapSearchButton onClick={onOpenSearch} />
				<MapExportButton mapTitle={mapTitle} />
			</div>
		</div>
	);
}
