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
		<div className='absolute left-3 right-3 top-3 z-40 flex items-center gap-2 rounded-xl border border-edge bg-zinc-900/60 p-2 backdrop-blur-md'>
			{/* Left: Severity Filter */}
			<SeverityFilter
				nodes={nodes}
				activeSeverities={activeSeverities}
				onToggle={onToggleSeverity}
			/>

			{/* Spacer */}
			<div className='flex-1' />

			{/* Right: Search + Export */}
			<div className='flex items-center gap-1.5'>
				<MapSearchButton onClick={onOpenSearch} />
				<MapExportButton mapTitle={mapTitle} />
			</div>
		</div>
	);
}
