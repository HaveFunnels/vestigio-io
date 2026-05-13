"use client";

/**
 * DependencyHealth — Preflight workspace live status panel
 * (Wave 11.3e).
 *
 * Reads `/api/workspace/dependency-health` which cross-references the
 * detected `TechnologyDetected` evidence with our curated status-page
 * mapping (src/lib/status-pages.ts) and fetches each vendor's Atlassian
 * Statuspage v2 JSON server-side with a 5-min cache.
 *
 * Pure 🟢 widget — third-party status pages are public.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

interface StatusEntry {
	technologyKey: string;
	displayName: string;
	publicUrl: string;
	indicator: "none" | "minor" | "major" | "critical" | "unknown";
	description: string;
	checkedAt: number;
}

interface Response {
	services: StatusEntry[];
	coveredCount: number;
	totalDetected: number;
}

const INDICATOR_DOT: Record<StatusEntry["indicator"], string> = {
	none: "bg-emerald-500",
	minor: "bg-amber-500",
	major: "bg-orange-500",
	critical: "bg-red-500",
	unknown: "bg-zinc-400 dark:bg-zinc-500",
};

const INDICATOR_TEXT: Record<StatusEntry["indicator"], string> = {
	none: "text-emerald-600 dark:text-emerald-400",
	minor: "text-amber-600 dark:text-amber-400",
	major: "text-orange-600 dark:text-orange-400",
	critical: "text-red-600 dark:text-red-400",
	unknown: "text-content-faint",
};

// Severity rank for sorting — most urgent first.
const INDICATOR_RANK: Record<StatusEntry["indicator"], number> = {
	critical: 4,
	major: 3,
	minor: 2,
	unknown: 1,
	none: 0,
};

export default function DependencyHealth() {
	const t = useTranslations("console.workspaces.detail.dependency_health");
	const locale = useLocale();
	const [data, setData] = useState<Response | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/workspace/dependency-health")
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (cancelled) return;
				setData(d ?? null);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (loading) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("label")}
				</h2>
				<p className="text-[12px] text-content-muted">{t("loading")}</p>
			</section>
		);
	}

	if (!data || data.services.length === 0) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("label")}
				</h2>
				<p className="text-[13px] font-medium text-content">{t("empty_title")}</p>
				<p className="mt-1 text-[12px] text-content-muted">{t("empty_description")}</p>
			</section>
		);
	}

	const sorted = [...data.services].sort(
		(a, b) => INDICATOR_RANK[b.indicator] - INDICATOR_RANK[a.indicator],
	);
	const lastCheck = sorted.length > 0 ? new Date(sorted[0].checkedAt) : null;
	const coverageMessage =
		data.coveredCount === data.totalDetected
			? t("coverage_full", { total: data.totalDetected })
			: t("coverage_partial", { covered: data.coveredCount, total: data.totalDetected });

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<div className="mb-4 flex items-start justify-between gap-3">
				<div>
					<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
						{t("label")}
					</h2>
					<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
				</div>
				{lastCheck && (
					<span className="shrink-0 font-mono text-[10px] tabular-nums text-content-faint">
						{t("checked_at", {
							time: lastCheck.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
						})}
					</span>
				)}
			</div>
			<p className="mb-3 text-[11px] text-content-faint">{coverageMessage}</p>
			<div className="space-y-2">
				{sorted.map((s) => (
					<a
						key={s.technologyKey}
						href={s.publicUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center justify-between rounded-xl border border-edge bg-surface-card/60 px-3 py-2.5 transition-colors hover:border-content-faint hover:bg-surface-card-hover"
					>
						<div className="flex min-w-0 items-center gap-3">
							<span className={`h-2 w-2 shrink-0 rounded-full ${INDICATOR_DOT[s.indicator]}`} aria-hidden />
							<div className="min-w-0">
								<div className="truncate text-[13px] font-medium text-content">
									{s.displayName}
								</div>
								<div className={`truncate text-[11px] ${INDICATOR_TEXT[s.indicator]}`}>
									{t(`indicator.${s.indicator}`)} · {s.description}
								</div>
							</div>
						</div>
						<svg
							className="ml-3 h-3.5 w-3.5 shrink-0 text-content-faint"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M14 5l7 7m0 0l-7 7m7-7H3"
							/>
						</svg>
					</a>
				))}
			</div>
		</section>
	);
}
