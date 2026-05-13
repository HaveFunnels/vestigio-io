"use client";

/**
 * SpofMap — Preflight workspace single-point-of-failure visualizer
 * (Wave 11.3b).
 *
 * Reads the user's detected tech stack from `GET /api/workspace/tech-stack`
 * (which queries `TechnologyDetected` evidence rows produced at crawl
 * time by `workers/ingestion/pipeline.ts`) and renders one row per
 * critical category showing:
 *
 *  - detected service(s) as chips
 *  - status (SPOF if 1 service in a redundancy-relevant category;
 *    "Has redundancy" if 2+; "Not detected" if 0)
 *  - severity tier (critical/high/medium/low)
 *  - business impact if that category goes down
 *
 * Pure 🟢 — no integration; the detection pipeline is already wired.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type {
	TechnologyCategory,
	TechnologyStackProjection,
} from "../../../../packages/technology-registry/types";

interface CategorySpec {
	id: TechnologyCategory;
	severity: "critical" | "high" | "medium" | "low";
}

// Order matters — critical categories surface first so the user reads
// the highest-stakes SPOFs before the long tail.
const CATEGORIES: CategorySpec[] = [
	{ id: "payment_provider", severity: "critical" },
	{ id: "platform", severity: "critical" },
	{ id: "cdn", severity: "high" },
	{ id: "email_marketing", severity: "high" },
	{ id: "error_tracking", severity: "medium" },
	{ id: "tag_manager", severity: "medium" },
	{ id: "consent_manager", severity: "medium" },
	{ id: "analytics", severity: "low" },
	{ id: "ab_testing", severity: "low" },
	{ id: "support_widget", severity: "low" },
];

const SEVERITY_DOT: Record<CategorySpec["severity"], string> = {
	critical: "bg-red-500",
	high: "bg-orange-500",
	medium: "bg-amber-500",
	low: "bg-zinc-400 dark:bg-zinc-500",
};

const SEVERITY_TEXT: Record<CategorySpec["severity"], string> = {
	critical: "text-red-500 dark:text-red-400",
	high: "text-orange-500 dark:text-orange-400",
	medium: "text-amber-500 dark:text-amber-400",
	low: "text-zinc-500",
};

export default function SpofMap() {
	const t = useTranslations("console.workspaces.detail.spof_map");
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

	if (!stack || stack.total_detected === 0) {
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
			<div className="space-y-3">
				{CATEGORIES.map((spec) => {
					const detected = stack.by_category[spec.id] || [];
					const count = detected.length;
					const isSpof = count === 1;
					const isResilient = count >= 2;

					// Status pill copy + color
					const statusLabel = isSpof
						? t("status_spof")
						: isResilient
							? t("status_resilient")
							: t("status_undetected");
					const statusClass = isSpof
						? `${SEVERITY_TEXT[spec.severity]} bg-current/10`
						: isResilient
							? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
							: "text-content-faint bg-surface-inset";

					return (
						<div
							key={spec.id}
							className="rounded-xl border border-edge bg-surface-card/60 p-3"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[spec.severity]}`} aria-hidden />
										<span className="text-[13px] font-medium text-content">
											{t(`categories.${spec.id}`)}
										</span>
										<span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${SEVERITY_TEXT[spec.severity]}`}>
											{t(`severity_${spec.severity}`)}
										</span>
									</div>
									{count > 0 ? (
										<div className="mt-2 flex flex-wrap gap-1.5">
											{detected.map((tech) => (
												<span
													key={tech.key}
													className="inline-flex items-center gap-1 rounded-md border border-edge bg-surface-inset/60 px-2 py-0.5 text-[11px] text-content-secondary"
												>
													{tech.display_name}
													{tech.detected_on.length > 1 && (
														<span className="text-content-faint">
															·{" "}
															{t(tech.detected_on.length === 1 ? "detected_on" : "detected_on_plural", {
																count: tech.detected_on.length,
															})}
														</span>
													)}
												</span>
											))}
										</div>
									) : (
										<p className="mt-2 text-[11px] text-content-faint italic">
											{t("status_undetected")}
										</p>
									)}
									{(isSpof || isResilient) && (
										<p className="mt-2 text-[11px] leading-snug text-content-muted">
											<span className="font-semibold">{t("impact_label")}</span>{" "}
											{t(`impacts.${spec.id}`)}
										</p>
									)}
								</div>
								<span
									className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}
								>
									{statusLabel}
								</span>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
