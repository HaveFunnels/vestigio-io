"use client";

// ──────────────────────────────────────────────
// CrossSignalHero — Vestigio's unique differentiator widget
//
// Shows causal chains where findings from different packs
// affect the same surface. Renders as a horizontal flow:
//   [Security] CSP missing → [Trust] Hesitation ↑ → [Revenue] -$2.4k
//
// Phase 3.2: Redesigned to match the dashboard visual language —
// gradient overlay, Phosphor icon eyebrow, hero number, mono type,
// no card-in-card nesting.
// ──────────────────────────────────────────────

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { GitForkIcon as GitFork } from "@phosphor-icons/react/dist/ssr";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";
import type { CrossSignalChain } from "@/lib/dashboard/types";

const PACK_STYLES: Record<string, { text: string; dot: string; label: string }> = {
	revenue: { text: "text-red-400", dot: "bg-red-500", label: "Revenue" },
	revenue_integrity: { text: "text-red-400", dot: "bg-red-500", label: "Revenue" },
	chargeback: { text: "text-amber-400", dot: "bg-amber-500", label: "Chargeback" },
	chargeback_resilience: { text: "text-amber-400", dot: "bg-amber-500", label: "Chargeback" },
	security_posture: { text: "text-blue-400", dot: "bg-blue-500", label: "Security" },
	scale_readiness: { text: "text-emerald-400", dot: "bg-emerald-500", label: "Scale" },
	behavioral: { text: "text-violet-400", dot: "bg-violet-500", label: "Behavioral" },
	first_impression: { text: "text-violet-400", dot: "bg-violet-500", label: "First Impression" },
	friction_tax: { text: "text-rose-400", dot: "bg-rose-500", label: "Friction" },
	trust_gap: { text: "text-indigo-400", dot: "bg-indigo-500", label: "Trust" },
};

const FALLBACK_STYLE = { text: "text-content-muted", dot: "bg-content-faint", label: "Analysis" };

function formatCurrency(cents: number): string {
	const d = Math.abs(cents) / 100;
	if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
	if (d >= 1_000) return `$${(d / 1_000).toFixed(1)}k`;
	return `$${Math.round(d)}`;
}

function ChainRow({ chain, editing }: { chain: CrossSignalChain; editing?: boolean }) {
	const router = useRouter();
	const surface = chain.surface.length > 35
		? "..." + chain.surface.slice(-32)
		: chain.surface;

	return (
		<li className="group flex items-start gap-3 py-1.5">
			{/* Surface + impact */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-mono text-[10px] text-content-faint">{surface}</span>
					<span className="shrink-0 font-mono text-[10px] tabular-nums text-red-400">
						−{formatCurrency(chain.totalImpactCents)}/mo
					</span>
				</div>

				{/* Chain links — inline flow */}
				<div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
					{chain.links.map((link, i) => {
						const style = PACK_STYLES[link.pack] || FALLBACK_STYLE;
						return (
							<span key={link.findingId} className="flex items-center gap-1">
								{i > 0 && (
									<svg className="h-2.5 w-2.5 shrink-0 text-content-faint/40" viewBox="0 0 10 10" fill="none">
										<path d="M3 5h4M5.5 3.5l1.5 1.5-1.5 1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								)}
								<button
									type="button"
									disabled={editing}
									onClick={() => !editing && router.push(`/app/analysis?finding=${link.findingId}`)}
									className="inline-flex items-center gap-1 text-[11px] transition-colors hover:opacity-80 disabled:cursor-default"
								>
									<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
									<span className={`font-semibold ${style.text}`}>{style.label}</span>
									<span className="max-w-[140px] truncate text-content-secondary lg:max-w-[240px] xl:max-w-[320px]">
										{link.title}
									</span>
								</button>
							</span>
						);
					})}
				</div>
			</div>
		</li>
	);
}

function CrossSignalHero({ data, editing }: WidgetProps) {
	const t = useTranslations("console.dashboard.widgets.cross_signal_card");
	const { crossSignal } = data;

	if (!crossSignal || crossSignal.chains.length === 0) {
		return (
			<div className="relative flex h-full flex-col items-center justify-center p-5 text-center">
				<div
					className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/[0.04] via-transparent to-transparent"
					aria-hidden
				/>
				<p className="text-xs text-content-faint">
					{t("empty_title")}
				</p>
				<p className="mt-1 text-[10px] text-content-faint">
					{t("empty_subtitle")}
				</p>
			</div>
		);
	}

	const chainCount = crossSignal.chains.length;

	return (
		<div className="relative flex h-full flex-col p-5">
			{/* Gradient overlay — matches dashboard visual language */}
			<div
				className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-transparent"
				aria-hidden
			/>
			<div
				className="pointer-events-none absolute inset-0 rounded-2xl border border-white/[0.06]"
				aria-hidden
			/>

			{/* Eyebrow — Phosphor icon + label */}
			<div className="relative flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
				<GitFork size={11} weight="bold" className="text-indigo-400" />
				<span>{t("eyebrow")}</span>
			</div>

			{/* Hero number + caption */}
			<div className="relative mt-2 flex items-baseline gap-3">
				<span className="font-mono text-4xl font-medium tabular-nums leading-none tracking-tight text-indigo-400">
					{chainCount}
				</span>
				<span className="text-[11px] text-content-secondary">
					{chainCount === 1 ? t("pattern_singular") : t("pattern_plural")} · {formatCurrency(crossSignal.totalImpactCents)}/mo
				</span>
			</div>

			{/* Caption */}
			{crossSignal.caption && (
				<p className="relative mt-1 text-[10px] text-content-faint">
					{crossSignal.caption}
				</p>
			)}

			{/* Chain list — flat rows, no nested cards */}
			<ul className="relative mt-3 flex-1 space-y-0 overflow-y-auto">
				{crossSignal.chains.map((chain, i) => (
					<ChainRow key={i} chain={chain} editing={editing} />
				))}
			</ul>
		</div>
	);
}

registerWidget({
	id: "cross_signal_hero",
	version: 2,
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
