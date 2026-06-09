"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ExternalLink, Network } from "lucide-react";
import type { MapsSection } from "../types";

/*
 * Wave 22.8.4 — Maps section
 *
 * Surfaces the surface-graph the engine captured this cycle plus the
 * always-available auto-maps. The Plan does not render the maps
 * themselves (those live in /app/maps and are computed in runtime by
 * packages/maps/engine.ts). It surfaces the metadata: how many
 * connections, how many surfaces, where the heavy hubs are, and which
 * map types Vestigio offers.
 *
 * Self-hides when both relationsThisCycle and customMapsCount are 0
 * (handled in the generator; UI just checks for the prop).
 */

interface Props {
	maps: MapsSection | null | undefined;
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

function StatTile({
	label,
	value,
	subline,
}: {
	label: string;
	value: number;
	subline?: string;
}) {
	return (
		<div className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3">
			<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
				{label}
			</div>
			<div className="mt-1 font-mono text-[20px] font-semibold tabular-nums text-content">
				{value}
			</div>
			{subline && (
				<div className="mt-0.5 text-[10.5px] text-content-muted">{subline}</div>
			)}
		</div>
	);
}

function trimUrl(url: string, max = 50): string {
	const stripped = url.replace(/^https?:\/\//, "");
	if (stripped.length <= max) return stripped;
	return `${stripped.slice(0, max - 1)}…`;
}

export default function Maps({ maps }: Props) {
	if (!maps) return null;
	const hasGraph = maps.relationsThisCycle > 0;
	// Highest count drives the bar widths in the relationsByType breakdown.
	const maxRelationCount = maps.relationsByType[0]?.count ?? 0;

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.26 }}
			className="mb-12"
		>
			<div className="mb-4 flex items-baseline justify-between">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					Mapa do mês
				</h2>
				<div className="text-[11px] text-content-faint">
					grafo de surfaces · {maps.autoMapTypes.length} mapas auto
				</div>
			</div>

			<div data-vsgp-card className="rounded-2xl border border-edge bg-surface-card p-6">
				{/* Top stats: relations + hosts + cross-domain + custom maps. */}
				<div className="mb-5 grid grid-cols-2 gap-3 border-b border-edge/40 pb-5 sm:grid-cols-4">
					<StatTile
						label="Conexões este ciclo"
						value={maps.relationsThisCycle}
						subline={hasGraph ? "entre surfaces" : "nenhum grafo ainda"}
					/>
					<StatTile
						label="Surfaces conectadas"
						value={maps.distinctHostCount}
					/>
					<StatTile
						label="Cross-domain"
						value={maps.crossDomainCount}
						subline={
							maps.crossDomainCount > 0
								? "links pra fora do domínio"
								: "tudo same-domain"
						}
					/>
					<StatTile
						label="Mapas customizados"
						value={maps.customMapsCount}
						subline={maps.customMapsCount === 0 ? "do seu org" : ""}
					/>
				</div>

				{hasGraph && (
					<div className="mb-5 grid grid-cols-1 gap-5 border-b border-edge/40 pb-5 md:grid-cols-2">
						{/* Top hubs — URLs producing the most outbound relations. */}
						{maps.topHubs.length > 0 && (
							<div>
								<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									Top hubs
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

						{/* relationsByType breakdown with proportional bars. */}
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

				{/* Available auto-maps. Always shown — gives the customer a
				    sense of what's behind /app/maps even when their cycle
				    hasn't produced rich graph data yet. */}
				<div className="mb-1">
					<div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
						Mapas disponíveis em /app/maps
					</div>
					<div className="flex flex-wrap gap-1.5">
						{maps.autoMapTypes.map((t) => (
							<span
								key={t}
								className="inline-flex items-center gap-1 rounded-md bg-surface-inset/40 px-2 py-0.5 text-[11px] text-content-secondary ring-1 ring-inset ring-edge"
							>
								<Network className="h-3 w-3 text-content-faint" /> {t}
							</span>
						))}
					</div>
				</div>

				<div className="mt-5 border-t border-edge/40 pt-3 text-right">
					<Link
						href="/app/maps"
						className="inline-flex items-center gap-1.5 text-[12px] font-medium text-content-secondary underline-offset-4 transition-colors hover:text-content hover:underline"
					>
						Abrir mapas em /app/maps
						<ExternalLink className="h-3 w-3" />
					</Link>
				</div>
			</div>
		</motion.section>
	);
}
