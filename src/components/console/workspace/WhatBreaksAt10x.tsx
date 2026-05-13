"use client";

/**
 * WhatBreaksAt10x — "What breaks at 10x" simulator (Wave 11.3a).
 *
 * For each detected technology in the customer's stack, surfaces
 * known scaling pain points (free-tier caps, rate limits, plan
 * thresholds) from a curated knowledge base in
 * src/lib/scaling-pain-points.ts.
 *
 * We deliberately do NOT pretend to simulate real load — we don't
 * have a reliable traffic baseline. Instead we surface the explicit
 * thresholds vendor docs publish, so the user knows what to plan for
 * as they grow. This is heuristic mode; pixel-driven projection
 * would replace this with concrete forecasts.
 *
 * Pure 🟢 — reads /api/workspace/tech-stack + uses the curated catalog.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
	getPainPoints,
	type PainSeverity,
	type ScalingPainPoint,
} from "@/lib/scaling-pain-points";
import type {
	DetectedTechnology,
	TechnologyStackProjection,
} from "../../../../packages/technology-registry/types";

interface ConcernRow {
	tech: DetectedTechnology;
	point: ScalingPainPoint;
}

const SEVERITY_RANK: Record<PainSeverity, number> = {
	critical: 4,
	high: 3,
	medium: 2,
	low: 1,
};

const SEVERITY_DOT: Record<PainSeverity, string> = {
	critical: "bg-red-500",
	high: "bg-orange-500",
	medium: "bg-amber-500",
	low: "bg-zinc-400 dark:bg-zinc-500",
};

const SEVERITY_TEXT: Record<PainSeverity, string> = {
	critical: "text-red-500 dark:text-red-400",
	high: "text-orange-500 dark:text-orange-400",
	medium: "text-amber-500 dark:text-amber-400",
	low: "text-zinc-500",
};

export default function WhatBreaksAt10x() {
	const t = useTranslations("console.workspaces.detail.what_breaks_at_10x");
	const [stack, setStack] = useState<TechnologyStackProjection | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/workspace/tech-stack")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (cancelled) return;
				setStack(data?.stack ?? null);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const rows = useMemo<ConcernRow[]>(() => {
		if (!stack) return [];
		const out: ConcernRow[] = [];
		for (const tech of stack.technologies) {
			const points = getPainPoints(tech.key);
			for (const point of points) {
				out.push({ tech, point });
			}
		}
		// Critical first; ties broken by display_name for stable order.
		out.sort((a, b) => {
			const diff = SEVERITY_RANK[b.point.severity] - SEVERITY_RANK[a.point.severity];
			if (diff !== 0) return diff;
			return a.tech.display_name.localeCompare(b.tech.display_name);
		});
		return out;
	}, [stack]);

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

	if (rows.length === 0) {
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

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<div className="mb-4">
				<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("label")}
				</h2>
				<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
			</div>
			<div className="space-y-2">
				{rows.map((row) => (
					<div
						key={`${row.tech.key}::${row.point.id}`}
						className="rounded-xl border border-edge bg-surface-card/60 px-3 py-2.5"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="flex min-w-0 flex-1 items-start gap-2.5">
								<span
									className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[row.point.severity]}`}
									aria-hidden
								/>
								<div className="min-w-0 flex-1">
									<div className="flex items-baseline gap-2">
										<span className="text-[13px] font-medium text-content">
											{row.tech.display_name}
										</span>
										<span
											className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${SEVERITY_TEXT[row.point.severity]}`}
										>
											{t(`severity.${row.point.severity}`)}
										</span>
									</div>
									<p className="mt-1 text-[12px] leading-snug text-content-muted">
										{t(`points.${row.point.i18nKey}`)}
									</p>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
