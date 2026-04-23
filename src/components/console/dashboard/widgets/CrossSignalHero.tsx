"use client";

// ──────────────────────────────────────────────
// CrossSignalHero — Vestigio's unique differentiator widget
//
// Shows causal chains where findings from different packs
// affect the same surface. Renders as a horizontal flow:
//   [Security] CSP missing → [Trust] Hesitation ↑ → [Revenue] -$2.4k
//
// This is the hero widget — the thing no competitor can do.
// Hidden automatically when no cross-signal chains exist.
// ──────────────────────────────────────────────

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";
import type { CrossSignalChain } from "@/lib/dashboard/types";

const PACK_STYLES: Record<string, { bg: string; text: string; label: string }> = {
	revenue: { bg: "bg-red-500/10", text: "text-red-400", label: "Revenue" },
	revenue_integrity: { bg: "bg-red-500/10", text: "text-red-400", label: "Revenue" },
	chargeback: { bg: "bg-amber-500/10", text: "text-amber-400", label: "Chargeback" },
	chargeback_resilience: { bg: "bg-amber-500/10", text: "text-amber-400", label: "Chargeback" },
	security_posture: { bg: "bg-blue-500/10", text: "text-blue-400", label: "Security" },
	scale_readiness: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Scale" },
	behavioral: { bg: "bg-violet-500/10", text: "text-violet-400", label: "Behavioral" },
	first_impression: { bg: "bg-violet-500/10", text: "text-violet-400", label: "First Impression" },
	friction_tax: { bg: "bg-rose-500/10", text: "text-rose-400", label: "Friction" },
	trust_gap: { bg: "bg-indigo-500/10", text: "text-indigo-400", label: "Trust" },
};

const FALLBACK_STYLE = { bg: "bg-surface-inset", text: "text-content-muted", label: "Analysis" };

function formatDollars(cents: number): string {
	const d = cents / 100;
	if (d >= 1000) return `$${(d / 1000).toFixed(1)}k`;
	return `$${d.toFixed(0)}`;
}

function ChainRow({ chain }: { chain: CrossSignalChain }) {
	const router = useRouter();
	const surface = chain.surface.length > 30
		? "..." + chain.surface.slice(-27)
		: chain.surface;

	return (
		<div className="rounded-lg border border-edge/50 bg-surface-card/30 px-3 py-2.5">
			{/* Surface label */}
			<div className="mb-2 flex items-center justify-between">
				<span className="text-[10px] font-mono text-content-faint">{surface}</span>
				<span className="text-xs font-semibold text-content-secondary">
					{formatDollars(chain.totalImpactCents)}/mo
				</span>
			</div>

			{/* Chain flow: [Pack] title → [Pack] title → ... */}
			<div className="flex flex-wrap items-center gap-1.5">
				{chain.links.map((link, i) => {
					const style = PACK_STYLES[link.pack] || FALLBACK_STYLE;
					return (
						<div key={link.findingId} className="flex items-center gap-1.5">
							{i > 0 && (
								<svg className="h-3 w-3 shrink-0 text-content-faint" viewBox="0 0 12 12" fill="none">
									<path d="M4 6h4M6.5 4l2 2-2 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							)}
							<button
								onClick={() => router.push(`/app/analysis?finding=${link.findingId}`)}
								className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:opacity-80 ${style.bg}`}
							>
								<span className={`font-semibold ${style.text}`}>{style.label}</span>
								<span className="max-w-[120px] truncate text-content-muted">
									{link.title}
								</span>
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function CrossSignalHero({ data }: WidgetProps) {
	const { crossSignal } = data;

	// Hide entirely when no chains
	if (!crossSignal || crossSignal.chains.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center text-center">
				<p className="text-xs text-content-faint">
					No cross-domain patterns detected yet
				</p>
				<p className="mt-1 text-[10px] text-content-faint">
					Patterns appear when findings from different packs affect the same page
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="mb-3 flex items-center justify-between">
				<div>
					<h3 className="text-xs font-semibold uppercase tracking-wider text-content-muted">
						Cross-Signal Insights
					</h3>
					<p className="mt-0.5 text-[10px] text-content-faint">
						{crossSignal.caption}
					</p>
				</div>
				{crossSignal.totalImpactCents > 0 && (
					<div className="text-right">
						<span className="text-lg font-bold text-content">
							{formatDollars(crossSignal.totalImpactCents)}
						</span>
						<span className="block text-[10px] text-content-faint">combined/mo</span>
					</div>
				)}
			</div>

			{/* Chains list */}
			<div className="flex-1 space-y-2 overflow-y-auto">
				{crossSignal.chains.map((chain, i) => (
					<ChainRow key={i} chain={chain} />
				))}
			</div>
		</div>
	);
}

registerWidget({
	id: "cross_signal_hero",
	version: 1,
	nameKey: "cross_signal_hero",
	descriptionKey: "cross_signal_hero_desc",
	category: "kpi",
	icon: "graph",
	defaultSize: { w: 12, h: 4 },
	minSize: { w: 6, h: 3 },
	maxSize: { w: 12, h: 6 },
	resizable: true,
	removable: false,
	inCatalog: true,
	dataKeys: ["crossSignal"],
	Component: CrossSignalHero,
});
