"use client";

/**
 * ComplianceGap — LGPD/GDPR/PCI-DSS/SOC 2 readiness scorecard
 * (Wave 11.4a).
 *
 * For each framework, evaluates 5-7 requirements against existing
 * cybersecurity findings + tech-stack detection and reports the
 * passed/total + readiness % + the list of gaps as actionable items.
 *
 * Explicit caveat at the bottom: this is mechanical analysis, not a
 * legal audit. Full compliance still needs specialist review.
 *
 * Pure 🟢 — reads workspace findings + /api/workspace/tech-stack.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
	COMPLIANCE_FRAMEWORKS,
	evaluateFramework,
	type FrameworkResult,
} from "@/lib/compliance-frameworks";
import type { FindingProjection } from "../../../../packages/projections/types";
import type { TechnologyStackProjection } from "../../../../packages/technology-registry/types";

interface Props {
	findings: FindingProjection[];
}

function readinessColor(pct: number): { text: string; bg: string } {
	if (pct >= 80) return { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500" };
	if (pct >= 50) return { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500" };
	return { text: "text-red-500 dark:text-red-400", bg: "bg-red-500" };
}

export default function ComplianceGap({ findings }: Props) {
	const t = useTranslations("console.workspaces.detail.compliance");
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

	const results = useMemo<FrameworkResult[]>(() => {
		return COMPLIANCE_FRAMEWORKS.map((f) => evaluateFramework(f, findings, stack));
	}, [findings, stack]);

	if (loading) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="text-[12px] text-content-muted">{t("loading")}</p>
			</section>
		);
	}

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<div className="mb-4">
				<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{results.map((r) => {
					const color = readinessColor(r.readinessPct);
					const fails = r.requirements.filter((req) => req.outcome === "fail");
					const notEvaluated = r.requirements.filter((req) => req.outcome === "not_evaluated");
					const denominator = r.passed + r.failed;
					return (
						<div
							key={r.id}
							className="rounded-xl border border-edge bg-surface-card/60 p-4"
						>
							<div className="flex items-baseline justify-between gap-3">
								<span className="text-[13px] font-semibold text-content">
									{t(`frameworks.${r.id}`)}
								</span>
								<span className={`font-mono text-xl font-medium tabular-nums leading-none ${color.text}`}>
									{denominator === 0 ? "—" : `${r.readinessPct}%`}
								</span>
							</div>
							<div className="mt-1.5 text-[10px] text-content-faint">
								{t("passed_label", { passed: r.passed, total: denominator })}
								{r.notEvaluated > 0 && (
									<span className="ml-1.5">· {t("not_evaluated_label", { count: r.notEvaluated })}</span>
								)}
							</div>
							<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-inset/60">
								<div
									className={`h-full ${color.bg} transition-all`}
									style={{ width: `${r.readinessPct}%` }}
								/>
							</div>
							{(fails.length > 0 || notEvaluated.length > 0) && (
								<ul className="mt-3 space-y-1">
									{fails.map((req) => (
										<li
											key={req.id}
											className="flex items-start gap-2 text-[11px] text-content-secondary"
										>
											<span className="mt-0.5 text-red-400">✗</span>
											<span>{t(`requirements.${req.id}`)}</span>
										</li>
									))}
									{notEvaluated.map((req) => (
										<li
											key={req.id}
											className="flex items-start gap-2 text-[11px] text-content-faint italic"
										>
											<span className="mt-0.5">—</span>
											<span>{t(`requirements.${req.id}`)}</span>
										</li>
									))}
								</ul>
							)}
						</div>
					);
				})}
			</div>
			<p className="mt-3 text-[11px] italic text-content-faint">{t("caveat")}</p>
		</section>
	);
}
