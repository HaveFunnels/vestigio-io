"use client";

/**
 * TestRecommendations — 3 LLM-generated A/B test specs grounded in
 * the workspace's copy findings (Wave 11.5c).
 *
 * Reads /api/workspace/copy-test-recommendations which feeds the top
 * negative copy_alignment/scale_readiness/revenue_integrity findings
 * to Haiku and returns a structured JSON list.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

interface TestSpec {
	id: string;
	page_hint: string;
	hypothesis: string;
	variant: string;
	expected_lift: string;
	priority: "high" | "medium" | "low";
}

const PRIORITY_DOT: Record<TestSpec["priority"], string> = {
	high: "bg-red-500",
	medium: "bg-amber-500",
	low: "bg-zinc-400 dark:bg-zinc-500",
};

const PRIORITY_TEXT: Record<TestSpec["priority"], string> = {
	high: "text-red-500 dark:text-red-400",
	medium: "text-amber-500 dark:text-amber-400",
	low: "text-zinc-500",
};

export default function TestRecommendations() {
	const t = useTranslations("console.workspaces.detail.test_recommendations");
	const locale = useLocale();
	const [tests, setTests] = useState<TestSpec[] | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/workspace/copy-test-recommendations?locale=${encodeURIComponent(locale)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (cancelled) return;
				setTests(Array.isArray(d?.tests) ? d.tests : []);
				setLoading(false);
			})
			.catch(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [locale]);

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

	if (!tests || tests.length === 0) {
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
				{tests.map((test) => (
					<div
						key={test.id}
						className="rounded-xl border border-edge bg-surface-card/60 p-3"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="flex items-center gap-2">
								<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[test.priority]}`} aria-hidden />
								<span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${PRIORITY_TEXT[test.priority]}`}>
									{t(`priority_${test.priority}`)}
								</span>
							</div>
							{test.expected_lift && (
								<span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400">
									{t("expected_lift_label")} {test.expected_lift}
								</span>
							)}
						</div>
						<div className="mt-2 space-y-2 text-[12px] leading-snug">
							{test.page_hint && (
								<div className="text-content-muted">
									<span className="font-semibold">{t("page_hint_label")}</span> {test.page_hint}
								</div>
							)}
							<div className="text-content-secondary">
								<span className="font-semibold">{t("hypothesis_label")}</span> {test.hypothesis}
							</div>
							<div className="rounded-md border border-edge/60 bg-surface-inset/40 p-2 text-content">
								<span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
									{t("variant_label")}
								</span>
								<div className="mt-0.5">{test.variant}</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
