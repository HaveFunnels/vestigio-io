"use client";

/**
 * PhishingSurface — typo-squat / brand-impersonation monitor for
 * the Security workspace (Wave 11.4d).
 *
 * Reads /api/workspace/phishing-surface which:
 *   1. Pulls the env domain
 *   2. Generates ~30 typo-squat variants
 *   3. DNS-resolves each variant in parallel
 *   4. Returns the ones that resolve (with IPs + classification)
 *
 * Pure 🟢 — only public DNS resolution, no external paid API needed.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

interface VariantHit {
	domain: string;
	ipv4: string[];
	pattern: "typo" | "visual_swap" | "brand_appendage" | "tld_swap";
}

interface Response {
	apex: string | null;
	hits: VariantHit[];
	variantsChecked: number;
}

const PATTERN_DOT: Record<VariantHit["pattern"], string> = {
	typo: "bg-red-500",
	visual_swap: "bg-orange-500",
	brand_appendage: "bg-amber-500",
	tld_swap: "bg-zinc-400 dark:bg-zinc-500",
};

const PATTERN_TEXT: Record<VariantHit["pattern"], string> = {
	typo: "text-red-500 dark:text-red-400",
	visual_swap: "text-orange-500 dark:text-orange-400",
	brand_appendage: "text-amber-500 dark:text-amber-400",
	tld_swap: "text-zinc-500",
};

export default function PhishingSurface() {
	const t = useTranslations("console.workspaces.detail.phishing_surface");
	const [data, setData] = useState<Response | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/workspace/phishing-surface")
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
				<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="text-[12px] text-content-muted">{t("loading")}</p>
			</section>
		);
	}

	if (!data || !data.apex) {
		return null;
	}

	if (data.hits.length === 0) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
					{t("empty_title")}
				</p>
				<p className="mt-1 text-[12px] text-content-muted">
					{t("empty_description", { checked: data.variantsChecked })}
				</p>
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
				<p className="mt-1 text-[11px] text-content-faint">
					{t("hits_label", { count: data.hits.length, total: data.variantsChecked })}
				</p>
			</div>
			<div className="space-y-2">
				{data.hits.map((h) => (
					<div
						key={h.domain}
						className="flex items-center justify-between gap-3 rounded-xl border border-edge bg-surface-card/60 px-3 py-2.5"
					>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PATTERN_DOT[h.pattern]}`} aria-hidden />
								<span className="truncate font-mono text-[13px] font-medium text-content">
									{h.domain}
								</span>
								<span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${PATTERN_TEXT[h.pattern]}`}>
									{t(`patterns.${h.pattern}`)}
								</span>
							</div>
							<div className="mt-1 font-mono text-[11px] text-content-faint">
								<span className="font-semibold">{t("ipv4_label")}</span>{" "}
								{h.ipv4.join(", ")}
							</div>
						</div>
						<a
							href={`https://www.whois.com/whois/${h.domain}`}
							target="_blank"
							rel="noopener noreferrer"
							className="shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-content-secondary transition-colors hover:border-content-faint hover:bg-surface-card-hover"
						>
							{t("check_whois")}
						</a>
					</div>
				))}
			</div>
			<p className="mt-3 text-[11px] italic text-content-faint">{t("caveat")}</p>
		</section>
	);
}
