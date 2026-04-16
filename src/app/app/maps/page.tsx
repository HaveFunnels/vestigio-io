"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import { loadAllMaps } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type {
	MapDefinition,
	MapNode,
	MapNodeType,
	MapEdgeType,
} from "../../../../packages/maps";

// ──────────────────────────────────────────────
// Maps Gallery — the "Antesala" the revamp doc describes.
// Lists every available map (User Journey + engine maps) as a card so
// (a) the module scales to more map types without a pill bar getting
// crowded, and (b) each map has space to explain itself before the
// user commits to opening its canvas.
// ──────────────────────────────────────────────

const JOURNEY_MAP_ID = "user_journey";

export default function MapsGalleryPage() {
	const t = useTranslations("console.maps");
	const tc = useTranslations("console.common");
	const mcpData = useMcpData();
	const enginesState =
		mcpData.maps.status !== "not_ready" ? mcpData.maps : loadAllMaps();

	// User Journey lives outside MCP — load on mount.
	const [journeyMap, setJourneyMap] = useState<MapDefinition | null>(null);
	useEffect(() => {
		fetch("/api/maps/user-journey")
			.then((r) => r.json())
			.then((data) => {
				if (data?.map) setJourneyMap(data.map as MapDefinition);
			})
			.catch(() => {});
	}, []);

	return (
		<div className='flex h-full flex-col'>
			<div className='flex items-center justify-between border-b border-edge px-6 py-4'>
				<div className='[&>div]:mb-0'>
					<PageHeader
						title={t("title")}
						subtitle={t("subtitle")}
						tooltip={tc("page_tooltips.maps")}
					/>
				</div>
			</div>

			<div className='flex-1 overflow-auto'>
				<ConsoleState
					state={enginesState}
					loadingLabel={t("loading")}
					emptyLabel={t("empty")}
				>
					{(engineMaps) => (
						<GalleryGrid
							maps={journeyMap ? [journeyMap, ...engineMaps] : engineMaps}
						/>
					)}
				</ConsoleState>
			</div>
		</div>
	);
}

function GalleryGrid({ maps }: { maps: MapDefinition[] }) {
	const t = useTranslations("console.maps");

	const standard = useMemo(() => maps, [maps]);

	return (
		<div className='px-6 py-6'>
			<div className='mb-3 text-[11px] font-semibold uppercase tracking-wider text-content-muted'>
				{t("gallery.standard")}
			</div>
			<div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
				{standard.map((m) => (
					<MapCard key={m.id} mapDef={m} />
				))}
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Card
// ──────────────────────────────────────────────

function MapCard({ mapDef }: { mapDef: MapDefinition }) {
	const t = useTranslations("console.maps");
	const stats = summarize(mapDef);

	return (
		<Link
			href={`/app/maps/${encodeURIComponent(mapDef.id)}`}
			className='group flex flex-col overflow-hidden rounded-xl border border-edge bg-surface-card transition-all hover:-translate-y-0.5 hover:border-edge-strong hover:shadow-lg hover:shadow-black/5'
		>
			<div className='aspect-[16/9] w-full overflow-hidden bg-surface-inset'>
				<MapThumbnail mapDef={mapDef} />
			</div>
			<div className='flex flex-1 flex-col gap-2 p-4'>
				<div className='flex items-start justify-between gap-2'>
					<div className='min-w-0 text-sm font-semibold text-content'>
						{mapDef.name}
					</div>
					<MapTypeBadge type={mapDef.type} />
				</div>
				<div className='line-clamp-2 text-xs leading-relaxed text-content-muted'>
					{t(`descriptions.${mapDef.type}` as never)}
				</div>
				<div className='mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] text-content-faint'>
					<span>{t("gallery.stat_nodes", { count: stats.nodeCount })}</span>
					<span aria-hidden className='h-1 w-1 rounded-full bg-content-faint/50' />
					<span>{t("gallery.stat_edges", { count: stats.edgeCount })}</span>
					{stats.topType && (
						<>
							<span aria-hidden className='h-1 w-1 rounded-full bg-content-faint/50' />
							<span>{t(`nodeTypes.${stats.topType}` as never)}</span>
						</>
					)}
				</div>
			</div>
		</Link>
	);
}

// ──────────────────────────────────────────────
// Type badge — small chip for the map family
// ──────────────────────────────────────────────

function MapTypeBadge({ type }: { type: MapDefinition["type"] }) {
	const t = useTranslations("console.maps.gallery.types");
	const palette: Record<MapDefinition["type"], string> = {
		user_journey:
			"border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
		revenue_leakage:
			"border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
		chargeback_risk:
			"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
		root_cause:
			"border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
	};
	return (
		<span
			className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${palette[type] || "border-edge text-content-muted"}`}
		>
			{t(type as never)}
		</span>
	);
}

// ──────────────────────────────────────────────
// Stats summariser
// ──────────────────────────────────────────────

interface MapStats {
	nodeCount: number;
	edgeCount: number;
	/** Most-represented node type (for a one-line texture hint) */
	topType: MapNodeType | null;
}

function summarize(mapDef: MapDefinition): MapStats {
	const counts = new Map<MapNodeType, number>();
	for (const n of mapDef.nodes) {
		counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
	}
	let topType: MapNodeType | null = null;
	let topCount = 0;
	for (const [type, count] of counts) {
		if (count > topCount) {
			topCount = count;
			topType = type;
		}
	}
	return {
		nodeCount: mapDef.nodes.length,
		edgeCount: mapDef.edges.length,
		topType,
	};
}

// ──────────────────────────────────────────────
// Thumbnail — tiny SVG preview derived from node positions.
// Not a fidelity render; just gives each card its own texture so
// they're distinguishable at a glance. Uses the same node-type
// colors the canvas uses.
// ──────────────────────────────────────────────

const NODE_FILL: Record<MapNodeType, string> = {
	root_cause: "#ef4444",
	finding: "#f59e0b",
	action: "#10b981",
	policy: "#3b82f6",
	support: "#3b82f6",
	trust: "#3b82f6",
	measurement: "#3b82f6",
	checkout: "#3b82f6",
	journey_commercial: "#6366f1",
	journey_support: "#94a3b8",
	journey_other_events: "#a1a1aa",
	journey_dropoff: "#ef4444",
};

const EDGE_STROKE: Record<MapEdgeType, string> = {
	causal: "rgba(239, 68, 68, 0.45)",
	contributes_to: "rgba(161, 161, 170, 0.45)",
	addresses: "rgba(16, 185, 129, 0.45)",
	transition: "rgba(59, 130, 246, 0.45)",
	redirect: "rgba(167, 139, 250, 0.45)",
};

function MapThumbnail({ mapDef }: { mapDef: MapDefinition }) {
	const VIEW_W = 320;
	const VIEW_H = 180;
	const PADDING = 18;

	const nodes = mapDef.nodes;
	const edges = mapDef.edges;

	if (nodes.length === 0) {
		return (
			<div className='flex h-full w-full items-center justify-center text-[11px] text-content-faint'>
				—
			</div>
		);
	}

	// Bounding box of the raw engine positions
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const n of nodes) {
		if (n.position.x < minX) minX = n.position.x;
		if (n.position.y < minY) minY = n.position.y;
		if (n.position.x > maxX) maxX = n.position.x;
		if (n.position.y > maxY) maxY = n.position.y;
	}
	const rawW = Math.max(1, maxX - minX);
	const rawH = Math.max(1, maxY - minY);
	const sx = (VIEW_W - PADDING * 2) / rawW;
	const sy = (VIEW_H - PADDING * 2) / rawH;
	const scale = Math.min(sx, sy);
	// Center after scaling
	const offsetX = PADDING + ((VIEW_W - PADDING * 2) - rawW * scale) / 2;
	const offsetY = PADDING + ((VIEW_H - PADDING * 2) - rawH * scale) / 2;

	function project(n: MapNode) {
		return {
			x: offsetX + (n.position.x - minX) * scale,
			y: offsetY + (n.position.y - minY) * scale,
		};
	}

	const positioned = new Map<string, { x: number; y: number }>();
	for (const n of nodes) positioned.set(n.id, project(n));

	return (
		<svg
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			className='h-full w-full'
			preserveAspectRatio='xMidYMid meet'
			role='img'
			aria-hidden
		>
			<defs>
				<linearGradient id='map-thumb-bg' x1='0' y1='0' x2='0' y2='1'>
					<stop offset='0%' stopColor='rgba(255,255,255,0.02)' />
					<stop offset='100%' stopColor='rgba(0,0,0,0.04)' />
				</linearGradient>
			</defs>
			<rect width={VIEW_W} height={VIEW_H} fill='url(#map-thumb-bg)' />
			{/* Edges first */}
			{edges.map((e) => {
				const a = positioned.get(e.source);
				const b = positioned.get(e.target);
				if (!a || !b) return null;
				return (
					<line
						key={e.id}
						x1={a.x}
						y1={a.y}
						x2={b.x}
						y2={b.y}
						stroke={EDGE_STROKE[e.type] || "rgba(161,161,170,0.4)"}
						strokeWidth={1}
						strokeDasharray={e.type === "contributes_to" ? "3 3" : undefined}
					/>
				);
			})}
			{/* Nodes on top */}
			{nodes.map((n) => {
				const p = positioned.get(n.id);
				if (!p) return null;
				return (
					<circle
						key={n.id}
						cx={p.x}
						cy={p.y}
						r={3.5}
						fill={NODE_FILL[n.type] || "#71717a"}
						stroke='rgba(0,0,0,0.25)'
						strokeWidth={0.5}
					/>
				);
			})}
		</svg>
	);
}
