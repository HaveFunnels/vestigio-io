"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { MapDefinition, MapNode, MapNodeType } from "../../../../packages/maps";
import type { MapsSection } from "../types";

/*
 * MapsRich — standalone "Mapa do mês" page.
 *
 * The Plan card showed a bunch of graph stats + a pill row that named
 * the 4 map types. The user complaint: this page didn't communicate
 * its purpose and required a second click to reach the actual maps.
 *
 * Reframed: the standalone page is the NAVIGATION HUB into the 4 map
 * lenses. Big preview cards (with real thumbnails fetched from the
 * /api/maps/* endpoints) lead the eye; the cycle stats become a
 * supporting strip below the cards. Click on a card opens that map
 * directly (no "Abrir mapas" middleman).
 */

interface Props {
	maps: MapsSection | null | undefined;
	month: string;
}

// ──────────────────────────────────────────────
// Thumbnail (lifted from /app/maps/page.tsx MapCard layout)
// ──────────────────────────────────────────────

const NODE_FILL: Record<string, string> = {
	page: "#34d399",
	finding: "#fb7185",
	action: "#fbbf24",
	cause: "#a78bfa",
	signal: "#60a5fa",
	hub: "#f472b6",
};
const EDGE_STROKE: Record<string, string> = {
	contributes_to: "rgba(161,161,170,0.3)",
	links_to: "rgba(34,197,94,0.35)",
	leaks_from: "rgba(244,63,94,0.35)",
	caused_by: "rgba(167,139,250,0.35)",
};

function MapThumb({ mapDef }: { mapDef: MapDefinition }) {
	const VIEW_W = 320;
	const VIEW_H = 180;
	const PADDING = 18;
	const nodes = mapDef.nodes;
	const edges = mapDef.edges;
	if (nodes.length === 0) {
		return (
			<div className="flex h-full w-full items-center justify-center text-[11px] text-content-faint">
				—
			</div>
		);
	}
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
	const offsetX = PADDING + ((VIEW_W - PADDING * 2) - rawW * scale) / 2;
	const offsetY = PADDING + ((VIEW_H - PADDING * 2) - rawH * scale) / 2;
	function project(n: MapNode) {
		return { x: offsetX + (n.position.x - minX) * scale, y: offsetY + (n.position.y - minY) * scale };
	}
	const positioned = new Map<string, { x: number; y: number }>();
	for (const n of nodes) positioned.set(n.id, project(n));
	return (
		<svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
			<defs>
				<linearGradient id="map-thumb-bg-rich" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
					<stop offset="100%" stopColor="rgba(0,0,0,0.04)" />
				</linearGradient>
			</defs>
			<rect width={VIEW_W} height={VIEW_H} fill="url(#map-thumb-bg-rich)" />
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
						stroke="rgba(0,0,0,0.25)"
						strokeWidth={0.5}
					/>
				);
			})}
		</svg>
	);
}

// ──────────────────────────────────────────────
// Map type description + accent
// ──────────────────────────────────────────────

const MAP_META: Record<
	string,
	{ name: string; description: string; accent: string }
> = {
	revenue_leakage: {
		name: "Vazamento de receita",
		description:
			"Mostra onde dinheiro está escapando: páginas com fricção, formulários quebrados, redirecionamentos que perdem o comprador.",
		accent: "from-rose-500/15 to-transparent",
	},
	chargeback_risk: {
		name: "Risco de chargeback",
		description:
			"Cruza sinais de checkout (selo de trust, política visível, dados sensíveis) para mostrar onde o risco de disputa concentra.",
		accent: "from-amber-500/15 to-transparent",
	},
	root_cause: {
		name: "Causa raiz",
		description:
			"Liga findings a causas comuns por trás. Útil para ver que múltiplos sintomas dependem do mesmo fix.",
		accent: "from-violet-500/15 to-transparent",
	},
	user_journey: {
		name: "Jornada do usuário",
		description:
			"O caminho que o comprador percorre, da primeira página até o checkout. Onde o funnel quebra fica visível.",
		accent: "from-sky-500/15 to-transparent",
	},
};

function summarizeMap(mapDef: MapDefinition): {
	nodeCount: number;
	edgeCount: number;
	topType: MapNodeType | null;
} {
	const counts = new Map<MapNodeType, number>();
	for (const n of mapDef.nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
	let topType: MapNodeType | null = null;
	let topCount = 0;
	for (const [type, count] of counts) {
		if (count > topCount) {
			topCount = count;
			topType = type;
		}
	}
	return { nodeCount: mapDef.nodes.length, edgeCount: mapDef.edges.length, topType };
}

const RELATION_TYPE_LABEL_PT: Record<string, string> = {
	anchor: "Links âncora",
	form_action: "Formulários",
	iframe_src: "iFrames",
	script_src: "Scripts",
	stylesheet_src: "Stylesheets",
	redirect: "Redirects",
	canonical_external: "Canonical externo",
	intent_target: "Intent targets",
	runtime_navigation: "Navegação runtime",
};

function trimUrl(url: string, max = 50): string {
	const stripped = url.replace(/^https?:\/\//, "");
	if (stripped.length <= max) return stripped;
	return `${stripped.slice(0, max - 1)}…`;
}

export default function MapsRich({ maps, month: _month }: Props) {
	const [defs, setDefs] = useState<MapDefinition[]>([]);
	const [loadingMaps, setLoadingMaps] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoadingMaps(true);
		(async () => {
			// Fetch all 4 standard maps in parallel.
			const types = ["revenue_leakage", "chargeback_risk", "root_cause", "user_journey"];
			const results = await Promise.all(
				types.map(async (t) => {
					try {
						const endpoint =
							t === "user_journey" ? "/api/maps/user-journey" : `/api/maps/${t}`;
						const res = await fetch(endpoint);
						if (!res.ok) return null;
						const body = await res.json();
						return (body?.map as MapDefinition) ?? null;
					} catch {
						return null;
					}
				}),
			);
			if (cancelled) return;
			setDefs(results.filter((m): m is MapDefinition => !!m));
			setLoadingMaps(false);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const hasGraph = !!maps && maps.relationsThisCycle > 0;
	const maxRelationCount = maps?.relationsByType[0]?.count ?? 0;

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
		>
			{/* Purpose statement — what this page IS. */}
			<div className="mb-8 max-w-2xl">
				<p className="text-[14.5px] leading-relaxed text-content-secondary">
					Os mapas mostram o desenho que Vestigio enxerga do seu site neste ciclo. Cada lente abaixo abre uma visão diferente do mesmo grafo. Clique pra navegar.
				</p>
			</div>

			{/* Map preview cards — the headline. */}
			<div className="mb-10">
				<div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-content-faint">
					Lentes disponíveis
				</div>
				{loadingMaps ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<div
								key={i}
								className="aspect-[3/4] animate-pulse rounded-2xl bg-surface-card"
							/>
						))}
					</div>
				) : defs.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-edge bg-surface-card/60 p-8 text-center">
						<p className="text-[13px] text-content-muted">
							Os mapas precisam de pelo menos um ciclo concluído. Volte assim que a próxima análise terminar.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{defs.map((m) => {
							const meta = MAP_META[m.type] ?? {
								name: m.name,
								description: "",
								accent: "from-surface-inset to-transparent",
							};
							const stats = summarizeMap(m);
							return (
								<Link
									key={m.id}
									href={`/app/maps/${encodeURIComponent(m.id)}`}
									className="group flex flex-col overflow-hidden rounded-2xl border border-edge bg-surface-card transition-all hover:-translate-y-0.5 hover:border-edge-focus hover:shadow-lg hover:shadow-black/5"
								>
									<div
										className={`aspect-[16/10] w-full overflow-hidden bg-gradient-to-b ${meta.accent} bg-surface-inset/60`}
									>
										<MapThumb mapDef={m} />
									</div>
									<div className="flex flex-1 flex-col gap-2 p-4">
										<div className="text-[13.5px] font-semibold text-content">
											{meta.name}
										</div>
										<p className="line-clamp-3 text-[12px] leading-relaxed text-content-muted">
											{meta.description}
										</p>
										<div className="mt-auto flex items-center justify-between pt-2 text-[10.5px] text-content-faint">
											<span>
												{stats.nodeCount} nós · {stats.edgeCount} conexões
											</span>
											<span className="inline-flex items-center gap-1 text-content-secondary transition-colors group-hover:text-content">
												Abrir
												<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
											</span>
										</div>
									</div>
								</Link>
							);
						})}
					</div>
				)}
			</div>

			{/* Cycle stats — supporting strip below the cards. Compact. */}
			{maps && (
				<div className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
					<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
						<h2 className="font-serif text-[16px] font-medium tracking-tight text-content">
							Números do grafo neste ciclo
						</h2>
						<div className="text-[10.5px] text-content-faint">
							o que Vestigio leu sobre a topologia do seu site
						</div>
					</div>

					<div className="mb-5 grid grid-cols-2 gap-3 border-b border-edge/40 pb-5 sm:grid-cols-4">
						<StatTile
							label="Conexões"
							value={maps.relationsThisCycle}
							subline={hasGraph ? "entre páginas" : "ainda sem grafo"}
						/>
						<StatTile label="Surfaces conectadas" value={maps.distinctHostCount} />
						<StatTile
							label="Cross-domain"
							value={maps.crossDomainCount}
							subline={maps.crossDomainCount > 0 ? "saem do domínio" : "tudo same-domain"}
						/>
						<StatTile
							label="Mapas customizados"
							value={maps.customMapsCount}
							subline={maps.customMapsCount === 0 ? "do seu org" : ""}
						/>
					</div>

					{hasGraph && (
						<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
							{maps.topHubs.length > 0 && (
								<div>
									<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
										Páginas com mais conexões
									</div>
									<ul className="space-y-1.5">
										{maps.topHubs.map((h) => (
											<li
												key={h.url}
												className="flex items-baseline justify-between gap-2"
											>
												<span
													className="truncate font-mono text-[11.5px] text-content-secondary"
													title={h.url}
												>
													{trimUrl(h.url)}
												</span>
												<span className="font-mono text-[11.5px] tabular-nums text-content-muted">
													{h.outboundCount}
												</span>
											</li>
										))}
									</ul>
								</div>
							)}

							{maps.relationsByType.length > 0 && (
								<div>
									<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
										Tipos de conexão
									</div>
									<ul className="space-y-1.5">
										{maps.relationsByType.map((rt) => {
											const widthPct =
												maxRelationCount > 0
													? Math.max(3, Math.round((rt.count / maxRelationCount) * 100))
													: 3;
											const label =
												RELATION_TYPE_LABEL_PT[rt.relationType] ?? rt.relationType;
											return (
												<li key={rt.relationType} className="space-y-0.5">
													<div className="flex items-baseline justify-between gap-2 text-[11.5px]">
														<span className="text-content-secondary">{label}</span>
														<span className="font-mono tabular-nums text-content-muted">
															{rt.count}
														</span>
													</div>
													<div className="h-1 w-full overflow-hidden rounded bg-surface-inset/60">
														<div
															className="h-full bg-content/40"
															style={{ width: `${widthPct}%` }}
															aria-hidden
														/>
													</div>
												</li>
											);
										})}
									</ul>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</motion.div>
	);
}

function StatTile({ label, value, subline }: { label: string; value: number; subline?: string }) {
	return (
		<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
			<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
				{label}
			</div>
			<div className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-content">
				{value}
			</div>
			{subline && <div className="mt-0.5 text-[10.5px] text-content-muted">{subline}</div>}
		</div>
	);
}
