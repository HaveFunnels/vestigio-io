"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { usePlan } from "@/hooks/usePlan";
import { useTrack } from "@/hooks/useProductTrack";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import PageHeader from "@/components/console/PageHeader";
import UpgradeNudge from "@/components/console/UpgradeNudge";
import CustomSelect from "@/components/console/CustomSelect";
import CrossSignalChainCard from "./CrossSignalChainCard";
import type { CrossSignalChain } from "@/lib/dashboard/types";

// ──────────────────────────────────────────────
// CrossSignalsShell — Client shell for the dedicated page
// ──────────────────────────────────────────────

interface Props {
	chains: CrossSignalChain[];
	currency?: string;
}

// Locale hint for Intl.NumberFormat — ensures R$ for BRL, $ for USD, etc.
const CURRENCY_LOCALE: Record<string, string> = {
	BRL: "pt-BR",
	EUR: "de-DE",
	USD: "en-US",
};

// Wave 18g — pack ordering for cross-signal grouping. Chains and
// links sort by these ranks so the panorama doesn't look like a
// random shuffle of packs. Lower number = earlier in the list. We
// front-load the conversion-critical packs (revenue, copy) and let
// trust / security come after. Unknown packs land at the end.
const PACK_RANK: Record<string, number> = {
	revenue_integrity: 0,
	copy_alignment: 1,
	funnel_journey: 2,
	chargeback_resilience: 3,
	money_moment_exposure: 4,
	saas_growth_readiness: 5,
	scale_readiness: 6,
	channel_integrity: 7,
	security_posture: 8,
	discoverability: 9,
	content_freshness: 10,
	brand_integrity: 11,
	vertical_specific: 12,
	cross_signal: 13,
};

function packSortKey(pack: string | null | undefined): number {
	if (!pack) return 99;
	const r = PACK_RANK[pack];
	return typeof r === "number" ? r : 99;
}

/** Most-represented pack in a chain's links, ties broken by first link. */
function pickPrimaryPack(links: Array<{ pack: string }>): string {
	if (links.length === 0) return "";
	const counts = new Map<string, number>();
	for (const l of links) counts.set(l.pack, (counts.get(l.pack) ?? 0) + 1);
	let best = links[0].pack;
	let bestCount = -1;
	for (const [pack, count] of counts) {
		if (count > bestCount) {
			best = pack;
			bestCount = count;
		}
	}
	return best;
}

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

export default function CrossSignalsShell({ chains, currency = "USD" }: Props) {
	const t = useTranslations("console.cross_signals");
	const tc = useTranslations("console.common");
	const { isStarter } = usePlan();
	const { track } = useTrack();

	// Filters
	const [severityFilter, setSeverityFilter] = useState("all");
	const [temporalFilter, setTemporalFilter] = useState("all");
	const [search, setSearch] = useState("");

	// Summary stats — deduplicate by findingId so that the same finding
	// appearing in multiple chains isn't double-counted in the aggregate total.
	const totalImpact = useMemo(() => {
		const seen = new Set<string>();
		let total = 0;
		for (const chain of chains) {
			for (const link of chain.links) {
				if (!seen.has(link.findingId)) {
					seen.add(link.findingId);
					total += link.impactCents;
				}
			}
		}
		return total;
	}, [chains]);
	const sequentialCount = chains.filter((c) => c.temporalPattern === "sequential").length;

	// Filtered chains
	const filtered = useMemo(() => {
		return chains.filter((c) => {
			if (severityFilter !== "all") {
				if (!c.links.some((l) => l.severity === severityFilter)) return false;
			}
			if (temporalFilter !== "all") {
				if (temporalFilter === "sequential" && c.temporalPattern !== "sequential") return false;
				if (temporalFilter === "simultaneous" && c.temporalPattern !== "simultaneous") return false;
			}
			if (search) {
				const q = search.toLowerCase();
				if (!c.surface.toLowerCase().includes(q) && !c.links.some((l) => l.title.toLowerCase().includes(q))) return false;
			}
			return true;
		});
	}, [chains, severityFilter, temporalFilter, search]);

	// Wave 18g — group chains by their primary pack so the panorama
	// view stops looking random. The "primary pack" is the most-
	// represented pack within the chain's links (ties broken by the
	// first link). All chains that share the same primary pack render
	// consecutively. Within each chain, links also sort by pack so
	// "Jornada → Jornada → Copy" reads cleaner than "Jornada → Copy
	// → Jornada".
	const groupedChains = useMemo(() => {
		return [...filtered]
			.map((c) => ({
				...c,
				links: [...c.links].sort((a, b) => packSortKey(a.pack) - packSortKey(b.pack)),
			}))
			.sort((a, b) => packSortKey(pickPrimaryPack(a.links)) - packSortKey(pickPrimaryPack(b.links)));
	}, [filtered]);

	// Plan gating: Starter sees 2 chains
	const visibleChains = isStarter ? groupedChains.slice(0, 2) : groupedChains;
	const hiddenCount = groupedChains.length - visibleChains.length;

	// Track page view
	useMemo(() => {
		track("cross_signals_page_view", { chain_count: chains.length });
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const summaryCards: SummaryCard[] = [
		{
			label: t("hero_chains"),
			value: String(chains.length),
			variant: "info",
		},
		{
			label: t("hero_at_risk"),
			value: formatCurrency(totalImpact, currency) + tc("per_month_short"),
			variant: "danger",
		},
		{
			label: t("hero_sequential"),
			value: String(sequentialCount),
			variant: "warning",
		},
	];

	if (chains.length === 0) {
		return (
			<div className="px-6 py-16 text-center">
				<svg className="mx-auto mb-3 h-12 w-12 text-content-faint/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
				</svg>
				<h3 className="text-sm font-medium text-content-faint">{t("empty_title")}</h3>
				<p className="mt-1 text-xs text-content-faint">{t("empty_subtitle")}</p>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6">
			<PageHeader title={t("title")} tooltip={tc("page_tooltips.cross_signals")} />

			{/* Hero stats */}
			<SummaryCards cards={summaryCards} />

			{/* Filter bar */}
			<div className="flex flex-wrap items-center gap-3">
				<CustomSelect
					size="sm"
					value={severityFilter}
					onChange={setSeverityFilter}
					options={[
						{ value: "all", label: `${t("filter_severity")}: ${t("filter_severity_all")}` },
						{ value: "critical", label: t("severity_critical") },
						{ value: "high", label: t("severity_high") },
						{ value: "medium", label: t("severity_medium") },
						{ value: "low", label: t("severity_low") },
					]}
				/>

				<CustomSelect
					size="sm"
					value={temporalFilter}
					onChange={setTemporalFilter}
					options={[
						{ value: "all", label: t("filter_temporal_all") },
						{ value: "sequential", label: t("filter_temporal_sequential") },
						{ value: "simultaneous", label: t("filter_temporal_simultaneous") },
					]}
				/>

				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={t("search_placeholder")}
					className="flex-1 rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-xs text-content placeholder:text-content-faint/50 focus:border-indigo-500/50 focus:outline-none"
				/>
			</div>

			{/* Chain cards */}
			<div className="space-y-3">
				{visibleChains.map((chain, i) => (
					<CrossSignalChainCard
						key={`${chain.surface}-${i}`}
						surface={chain.surface}
						links={chain.links}
						totalImpactCents={chain.totalImpactCents}
						temporalPattern={chain.temporalPattern}
						firstDetectedAt={chain.firstDetectedAt}
						currency={currency}
					/>
				))}
			</div>

			{/* Upgrade nudge for hidden chains */}
			{hiddenCount > 0 && isStarter && (
				<UpgradeNudge
					variant="inline"
					messageKey="more_patterns"
					messageValues={{ count: hiddenCount }}
					trackContext="cross_signals_page"
				/>
			)}

			{/* Result count */}
			<p className="text-center text-[10px] text-content-faint">
				{t("result_count", { filtered: filtered.length, total: chains.length })}
			</p>
		</div>
	);
}
