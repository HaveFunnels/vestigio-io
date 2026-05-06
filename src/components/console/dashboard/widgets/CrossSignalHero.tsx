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
import { usePlan } from "@/hooks/usePlan";
import {
	registerWidget,
	type WidgetProps,
} from "@/lib/dashboard/widget-registry";
import type { CrossSignalChain } from "@/lib/dashboard/types";
import { getPackStyle } from "@/lib/pack-colors";

// Locale hint for Intl.NumberFormat — ensures R$ for BRL, $ for USD, etc.
const CURRENCY_LOCALE: Record<string, string> = {
	BRL: "pt-BR",
	EUR: "de-DE",
	USD: "en-US",
};

function formatCurrency(cents: number, currency: string = "USD"): string {
	const locale = CURRENCY_LOCALE[currency] || "en-US";
	const dollars = Math.abs(cents) / 100;
	if (dollars >= 1_000_000) {
		return (
			new Intl.NumberFormat(locale, {
				style: "currency",
				currency,
				maximumFractionDigits: 1,
			}).format(dollars / 1_000_000) + "M"
		);
	}
	if (dollars >= 1_000) {
		return (
			new Intl.NumberFormat(locale, {
				style: "currency",
				currency,
				maximumFractionDigits: 1,
			}).format(dollars / 1_000) + "k"
		);
	}
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(dollars);
}

function ChainRow({ chain, editing, currency }: { chain: CrossSignalChain; editing?: boolean; currency: string }) {
	const router = useRouter();
	const tp = useTranslations("console.common.pack_labels");
	const surface = chain.surface.length > 35
		? "..." + chain.surface.slice(-32)
		: chain.surface;

	return (
		<li className="group flex items-start gap-3 py-1.5">
			{/* Surface + impact */}
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<button
						type="button"
						disabled={editing}
						onClick={() => !editing && router.push(`/app/findings?chain=${encodeURIComponent(chain.surface)}`)}
						className="truncate font-mono text-[10px] text-content-faint transition-colors hover:text-content-secondary disabled:cursor-default"
					>
						{surface}
					</button>
					<span className="shrink-0 font-mono text-[10px] tabular-nums text-red-400">
						−{formatCurrency(chain.totalImpactCents, currency)}/mo
					</span>
				</div>

				{/* Chain links — inline flow */}
				<div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
					{chain.links.map((link, i) => {
						const style = getPackStyle(link.pack);
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
									onClick={() => !editing && router.push(`/app/findings?finding=${link.findingId}`)}
									className="inline-flex items-center gap-1 text-[11px] transition-colors hover:opacity-80 disabled:cursor-default"
								>
									<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
									<span className={`font-semibold ${style.text}`}>{tp.has(link.pack) ? tp(link.pack) : link.pack.replace(/_/g, " ")}</span>
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
	const tu = useTranslations("console.upgrade_moments");
	const { isStarter } = usePlan();
	const { crossSignal } = data;
	// Use the org's currency from the exposure data (always present in DashboardData)
	const currency = data.exposure?.currency || "USD";

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
					{chainCount === 1 ? t("pattern_singular") : t("pattern_plural")} · {formatCurrency(crossSignal.totalImpactCents, currency)}/mo
				</span>
			</div>

			{/* Caption */}
			{crossSignal.caption && (
				<p className="relative mt-1 text-[10px] text-content-faint">
					{crossSignal.caption}
				</p>
			)}

			{/* Chain list — flat rows, no nested cards */}
			{(() => {
				const visibleChains = isStarter ? crossSignal.chains.slice(0, 1) : crossSignal.chains;
				const hiddenCount = crossSignal.chains.length - visibleChains.length;
				return (
					<>
						<ul className="relative mt-3 flex-1 space-y-0 overflow-y-auto">
							{visibleChains.map((chain, i) => (
								<ChainRow key={i} chain={chain} editing={editing} currency={currency} />
							))}
						</ul>
						{hiddenCount > 0 && isStarter && (
							<p className="relative mt-2 border-t border-edge/40 pt-2 text-[10px] text-content-faint">
								{tu("more_patterns", { count: hiddenCount })}{" "}
								<a href="/app/billing" className="text-emerald-400 transition-colors hover:text-emerald-300 hover:underline">
									{tu("see_all_upgrade")} {tu("upgrade_cta")}
								</a>
							</p>
						)}
						{crossSignal.totalChains > visibleChains.length && !isStarter && (
							<a
								href="/app/cross-signals"
								className="relative mt-2 flex items-center justify-center gap-1 border-t border-edge/40 pt-2 text-[10px] font-medium text-indigo-400 transition-colors hover:text-indigo-300"
							>
								{t("view_all")} {crossSignal.totalChains} {t("pattern_plural")} →
							</a>
						)}
					</>
				);
			})()}
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
