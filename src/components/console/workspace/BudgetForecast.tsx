"use client";

/**
 * BudgetForecast — Preflight infrastructure budget projection
 * (Wave 11.3c).
 *
 * For each detected vendor with curated public pricing
 * (src/lib/vendor-pricing.ts), shows the estimated monthly cost at
 * three growth scenarios: today, 5x, 10x. Totals at the bottom give
 * the founder a back-of-envelope answer to "what is my infra burn
 * going to look like as I grow?"
 *
 * Numbers are conservative midpoints from public pricing — they are
 * not a forecast tool, just a sanity-check budget. Transactional fees
 * (Stripe %, processing) are intentionally omitted because they scale
 * with revenue rather than with vendor tier.
 *
 * Pure 🟢 — reads /api/workspace/tech-stack + uses the curated catalog.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getVendorPricing, type VendorPricing } from "@/lib/vendor-pricing";
import type {
	DetectedTechnology,
	TechnologyStackProjection,
} from "../../../../packages/technology-registry/types";

interface Row {
	tech: DetectedTechnology;
	pricing: VendorPricing;
}

// Always render in USD regardless of the org currency — the underlying
// vendor pricing catalog is sampled from US-priced plans. Use
// Intl.NumberFormat with explicit currency=USD so the symbol disambiguates
// (e.g. "US$ 1.2k" in pt-BR vs "$1.2k" in en-US) and a customer in BRL
// can't mistake the figure for local currency.
function formatUsd(value: number, locale: string): string {
	const fmt = (v: number, frac: number) =>
		new Intl.NumberFormat(locale, {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: frac,
			minimumFractionDigits: 0,
		}).format(v);
	if (value >= 1_000_000) return `${fmt(value / 1_000_000, 1)}M`;
	if (value >= 1_000) return `${fmt(value / 1_000, 1)}k`;
	return fmt(Math.round(value), 0);
}

export default function BudgetForecast() {
	const t = useTranslations("console.workspaces.detail.budget_forecast");
	const locale = useLocale();
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

	const rows = useMemo<Row[]>(() => {
		if (!stack) return [];
		const out: Row[] = [];
		for (const tech of stack.technologies) {
			const pricing = getVendorPricing(tech.key);
			if (pricing) out.push({ tech, pricing });
		}
		// Highest 10x cost first — most impactful for budget planning.
		out.sort((a, b) => b.pricing.at10xUsd - a.pricing.at10xUsd);
		return out;
	}, [stack]);

	const totals = useMemo(() => {
		return rows.reduce(
			(acc, r) => ({
				now: acc.now + r.pricing.nowUsd,
				at5x: acc.at5x + r.pricing.at5xUsd,
				at10x: acc.at10x + r.pricing.at10xUsd,
			}),
			{ now: 0, at5x: 0, at10x: 0 },
		);
	}, [rows]);

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

			<div className="overflow-hidden rounded-xl border border-edge">
				<table className="w-full text-left">
					<thead>
						<tr className="bg-surface-inset/60 text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
							<th className="px-3 py-2">{t("vendor_column")}</th>
							<th className="px-3 py-2 text-right">{t("scenario_now")}</th>
							<th className="px-3 py-2 text-right">{t("scenario_5x")}</th>
							<th className="px-3 py-2 text-right">{t("scenario_10x")}</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={r.tech.key}
								className="border-t border-edge text-[12px] text-content-secondary"
							>
								<td className="px-3 py-2">
									<div className="font-medium text-content">{r.tech.display_name}</div>
									<div className="mt-0.5 text-[10px] text-content-faint">
										{r.pricing.tierLabelNow}
									</div>
								</td>
								<td className="px-3 py-2 text-right font-mono tabular-nums">
									{formatUsd(r.pricing.nowUsd, locale)}
								</td>
								<td className="px-3 py-2 text-right font-mono tabular-nums">
									{formatUsd(r.pricing.at5xUsd, locale)}
								</td>
								<td className="px-3 py-2 text-right font-mono tabular-nums">
									{formatUsd(r.pricing.at10xUsd, locale)}
								</td>
							</tr>
						))}
						<tr className="border-t-2 border-edge bg-surface-inset/40 text-[12px]">
							<td className="px-3 py-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-[0.08em] text-content">
								{t("total_label")}
							</td>
							<td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-content">
								{formatUsd(totals.now, locale)}
							</td>
							<td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
								{formatUsd(totals.at5x, locale)}
							</td>
							<td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-red-500 dark:text-red-400">
								{formatUsd(totals.at10x, locale)}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p className="mt-3 text-[11px] italic text-content-faint">{t("caveat")}</p>
		</section>
	);
}
