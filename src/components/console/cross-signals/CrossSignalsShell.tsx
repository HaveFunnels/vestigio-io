"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { usePlan } from "@/hooks/usePlan";
import { useTrack } from "@/hooks/useProductTrack";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import PageHeader from "@/components/console/PageHeader";
import UpgradeNudge from "@/components/console/UpgradeNudge";
import CrossSignalChainCard from "./CrossSignalChainCard";
import type { CrossSignalChain } from "@/lib/dashboard/types";

// ──────────────────────────────────────────────
// CrossSignalsShell — Client shell for the dedicated page
// ──────────────────────────────────────────────

interface Props {
	chains: CrossSignalChain[];
}

function formatCurrency(cents: number): string {
	const d = Math.abs(cents) / 100;
	if (d >= 1_000_000) return `$${(d / 1_000_000).toFixed(1)}M`;
	if (d >= 1_000) return `$${(d / 1_000).toFixed(1)}k`;
	return `$${Math.round(d)}`;
}

export default function CrossSignalsShell({ chains }: Props) {
	const t = useTranslations("console.cross_signals");
	const { isStarter } = usePlan();
	const { track } = useTrack();

	// Filters
	const [severityFilter, setSeverityFilter] = useState("all");
	const [temporalFilter, setTemporalFilter] = useState("all");
	const [search, setSearch] = useState("");

	// Summary stats
	const totalImpact = chains.reduce((sum, c) => sum + c.totalImpactCents, 0);
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

	// Plan gating: Starter sees 2 chains
	const visibleChains = isStarter ? filtered.slice(0, 2) : filtered;
	const hiddenCount = filtered.length - visibleChains.length;

	// Track page view
	useMemo(() => {
		track("cross_signals_page_view", { chain_count: chains.length });
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const summaryCards: SummaryCard[] = [
		{
			label: t("hero_chains"),
			value: String(chains.length),
			color: "indigo",
		},
		{
			label: t("hero_at_risk"),
			value: formatCurrency(totalImpact) + "/mo",
			color: "red",
		},
		{
			label: t("hero_sequential"),
			value: String(sequentialCount),
			color: "amber",
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
			<PageHeader title={t("title")} subtitle={t("subtitle")} />

			{/* Hero stats */}
			<SummaryCards cards={summaryCards} />

			{/* Filter bar */}
			<div className="flex flex-wrap items-center gap-3">
				<select
					value={severityFilter}
					onChange={(e) => setSeverityFilter(e.target.value)}
					className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-xs text-content-secondary"
				>
					<option value="all">{t("filter_severity")}: All</option>
					<option value="critical">Critical</option>
					<option value="high">High</option>
					<option value="medium">Medium</option>
					<option value="low">Low</option>
				</select>

				<select
					value={temporalFilter}
					onChange={(e) => setTemporalFilter(e.target.value)}
					className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-xs text-content-secondary"
				>
					<option value="all">{t("filter_temporal_all")}</option>
					<option value="sequential">{t("filter_temporal_sequential")}</option>
					<option value="simultaneous">{t("filter_temporal_simultaneous")}</option>
				</select>

				<input
					type="text"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search surface URL..."
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
						narrative={chain.narrative}
						firstDetectedAt={chain.firstDetectedAt}
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
				{filtered.length} of {chains.length} patterns
			</p>
		</div>
	);
}
