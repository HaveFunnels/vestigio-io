"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";

// ──────────────────────────────────────────────
// CrossSignalChainCard — Expandable card for a single chain
// ──────────────────────────────────────────────

const PACK_STYLES: Record<string, { text: string; dot: string }> = {
	revenue: { text: "text-red-400", dot: "bg-red-500" },
	revenue_integrity: { text: "text-red-400", dot: "bg-red-500" },
	chargeback: { text: "text-amber-400", dot: "bg-amber-500" },
	chargeback_resilience: { text: "text-amber-400", dot: "bg-amber-500" },
	security_posture: { text: "text-blue-400", dot: "bg-blue-500" },
	scale_readiness: { text: "text-emerald-400", dot: "bg-emerald-500" },
	behavioral: { text: "text-violet-400", dot: "bg-violet-500" },
	first_impression: { text: "text-violet-400", dot: "bg-violet-500" },
	friction_tax: { text: "text-rose-400", dot: "bg-rose-500" },
	trust_gap: { text: "text-indigo-400", dot: "bg-indigo-500" },
};
const FALLBACK_STYLE = { text: "text-content-muted", dot: "bg-content-faint" };

interface Link {
	pack: string;
	title: string;
	severity: string;
	impactCents: number;
	findingId: string;
	firstSeenAt: string | null;
}

interface Props {
	surface: string;
	links: Link[];
	totalImpactCents: number;
	temporalPattern: "sequential" | "simultaneous" | null;
	narrative: string;
	firstDetectedAt: string | null;
}

function formatCurrency(cents: number): string {
	const d = Math.abs(cents) / 100;
	if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
	if (d >= 1_000) return `$${(d / 1_000).toFixed(1)}k`;
	return `$${Math.round(d)}`;
}

export default function CrossSignalChainCard({
	surface,
	links,
	totalImpactCents,
	temporalPattern,
	narrative,
}: Props) {
	const t = useTranslations("console.cross_signals");
	const tc = useTranslations("console.common");
	const tp = useTranslations("console.workspaces.detail.enrichment.packs");
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="rounded-xl border border-edge bg-surface-card/60 transition-colors hover:border-edge-strong">
			{/* Header */}
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-start gap-3 p-4 text-left"
			>
				<div className="min-w-0 flex-1">
					{/* Surface URL */}
					<div className="flex items-center gap-2">
						<span className="truncate font-mono text-xs text-content-secondary">
							{surface}
						</span>
						<span className="shrink-0 font-mono text-xs tabular-nums text-red-400">
							−{formatCurrency(totalImpactCents)}{tc("per_month_short")}
						</span>
					</div>

					{/* Pack flow */}
					<div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1">
						{links.map((link, i) => {
							const style = PACK_STYLES[link.pack] || FALLBACK_STYLE;
							return (
								<span key={link.findingId} className="flex items-center gap-1">
									{i > 0 && (
										<svg className="h-2.5 w-2.5 text-content-faint/40" viewBox="0 0 10 10" fill="none">
											<path d="M3 5h4M5.5 3.5l1.5 1.5-1.5 1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
									)}
									<span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
									<span className={`text-[11px] font-semibold ${style.text}`}>
										{tp.has(link.pack.replace(/_integrity|_resilience|_posture|_readiness|_tax|_gap|_impression/, ""))
											? tp(link.pack.replace(/_integrity|_resilience|_posture|_readiness|_tax|_gap|_impression/, ""))
											: link.pack.replace(/_/g, " ")}
									</span>
									<span className="max-w-[200px] truncate text-[11px] text-content-secondary lg:max-w-[300px]">
										{link.title}
									</span>
								</span>
							);
						})}
					</div>

					{/* Badges */}
					<div className="mt-2 flex items-center gap-2">
						{temporalPattern && (
							<span
								className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
									temporalPattern === "sequential"
										? "bg-amber-500/10 text-amber-400"
										: "bg-indigo-500/10 text-indigo-400"
								}`}
							>
								{t(`temporal_${temporalPattern}`)}
							</span>
						)}
						<span className="text-[10px] text-content-faint">
							{links.length} {links.length === 1 ? t("finding_singular") : t("finding_plural")}
						</span>
					</div>
				</div>

				{/* Expand chevron */}
				<svg
					className={`mt-1 h-4 w-4 shrink-0 text-content-faint transition-transform ${expanded ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{/* Expanded details */}
			{expanded && (
				<div className="border-t border-edge px-4 pb-4 pt-3">
					{/* Narrative */}
					<p className="mb-3 text-xs leading-relaxed text-content-muted">
						{narrative}
					</p>

					{/* Finding details */}
					<div className="space-y-2">
						{links.map((link) => (
							<Link
								key={link.findingId}
								href={`/app/findings?finding=${link.findingId}`}
								className="flex items-center justify-between rounded-lg border border-edge/50 bg-surface-inset/50 px-3 py-2 transition-colors hover:bg-surface-card-hover"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs text-content-secondary">
										{link.title}
									</p>
									{link.firstSeenAt && (
										<p className="mt-0.5 text-[10px] text-content-faint">
											{new Date(link.firstSeenAt).toLocaleDateString()}
										</p>
									)}
								</div>
								<div className="flex items-center gap-2">
									<span className="font-mono text-[10px] text-red-400">
										−{formatCurrency(link.impactCents)}{tc("per_month_short")}
									</span>
									<SeverityBadge value={link.severity} />
								</div>
							</Link>
						))}
					</div>

					{/* CTA */}
					<Link
						href={`/app/findings?chain=${encodeURIComponent(surface)}`}
						className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-edge bg-surface-card px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:border-edge-strong hover:bg-surface-card-hover"
					>
						<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
						</svg>
						{t("chain_card_view_analysis")}
					</Link>
				</div>
			)}
		</div>
	);
}
