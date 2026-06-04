"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import {
	MapTrifoldIcon as MapIcon,
	ArrowRightIcon as ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { getRelatedMaps } from "@/lib/workspace-map-mapping";

// ──────────────────────────────────────────────
// WorkspaceRelatedMaps — Wave-22.6 review fix P2.1
//
// Renders a compact strip of "Mapas relacionados" at the top of a
// workspace detail page. Each row links into /app/maps/<mapId> with
// a one-line rationale explaining WHY that map matters from this
// workspace's perspective. Maps stay primarily in Library (per
// product decision — no new sidebar entry); this surfaces the bridge
// inside the workspace where the user is already investigating.
//
// Renders nothing when the workspace type has no canonical maps
// associated yet — silent degradation, not an empty card.
// ──────────────────────────────────────────────

interface Props {
	workspaceType: string;
}

const MAP_LABEL_PT: Record<string, string> = {
	revenue_leakage: "Vazamento de receita",
	chargeback_risk: "Risco de chargeback",
	root_cause: "Causas raiz",
	user_journey: "Jornada do comprador",
};
const MAP_LABEL_EN: Record<string, string> = {
	revenue_leakage: "Revenue leakage",
	chargeback_risk: "Chargeback risk",
	root_cause: "Root causes",
	user_journey: "User journey",
};

export default function WorkspaceRelatedMaps({ workspaceType }: Props) {
	const locale = useLocale();
	const isPt = locale.startsWith("pt");
	const hints = getRelatedMaps(workspaceType);
	if (hints.length === 0) return null;

	return (
		<section className="mb-5 rounded-2xl border border-edge bg-surface-card/60 p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<MapIcon size={14} weight="bold" className="text-accent-text" />
					<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
						{isPt ? "Mapas relacionados" : "Related maps"}
					</h2>
				</div>
				<Link
					href="/app/library?section=maps"
					className="text-[11px] text-content-faint hover:text-content"
				>
					{isPt ? "Ver todos →" : "View all →"}
				</Link>
			</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{hints.map((h) => {
					const label = (isPt ? MAP_LABEL_PT : MAP_LABEL_EN)[h.mapId] ?? h.mapId;
					const rationale = isPt ? h.rationale_pt : h.rationale_en;
					return (
						<Link
							key={h.mapId}
							href={`/app/maps/${h.mapId}`}
							className="group flex items-start gap-3 rounded-lg border border-edge bg-surface-card px-3 py-2.5 transition-colors hover:border-edge-focus hover:bg-surface-card-hover"
						>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5 text-[13px] font-medium text-content group-hover:text-content">
									{label}
									<ArrowRight
										size={12}
										className="opacity-0 transition-opacity group-hover:opacity-100"
									/>
								</div>
								<div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-content-muted">
									{rationale}
								</div>
							</div>
						</Link>
					);
				})}
			</div>
		</section>
	);
}
