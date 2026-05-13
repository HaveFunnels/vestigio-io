"use client";

/**
 * PersonaRewrite — 3 LLM-generated rewrites of the homepage H1 +
 * meta description for distinct ICP personas (Wave 11.5d).
 *
 * Reads /api/workspace/copy-persona-rewrite which feeds the
 * homepage's stored copy + BusinessProfile.icpDescription to Haiku.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

interface PersonaVariant {
	persona: string;
	headline: string;
	subhead: string;
}

interface Response {
	variants: PersonaVariant[];
	source?: { h1: string; meta: string };
	fallback?: boolean;
}

export default function PersonaRewrite() {
	const t = useTranslations("console.workspaces.detail.persona_rewrite");
	const locale = useLocale();
	const [data, setData] = useState<Response | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/workspace/copy-persona-rewrite?locale=${encodeURIComponent(locale)}`)
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

	if (!data || data.variants.length === 0) {
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

			{data.source && (
				<div className="mb-3 rounded-xl border border-edge bg-surface-inset/40 p-3 text-[12px]">
					<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
						{t("current_label")}
					</div>
					{data.source.h1 && (
						<div>
							<span className="font-semibold">{t("current_headline")}:</span> {data.source.h1}
						</div>
					)}
					{data.source.meta && (
						<div className="mt-1 text-content-muted">
							<span className="font-semibold">{t("current_meta")}:</span> {data.source.meta}
						</div>
					)}
				</div>
			)}

			<div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
				{data.variants.map((v, i) => (
					<div
						key={`${v.persona}-${i}`}
						className="rounded-xl border border-edge bg-surface-card/60 p-3"
					>
						<div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
							{t("persona_label")}
						</div>
						<div className="mt-1 text-[12px] font-semibold text-content">
							{v.persona}
						</div>
						<div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
							{t("headline_label")}
						</div>
						<div className="mt-0.5 text-[13px] font-medium text-content">
							{v.headline}
						</div>
						<div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
							{t("subhead_label")}
						</div>
						<div className="mt-0.5 text-[11px] leading-snug text-content-muted">
							{v.subhead}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}
