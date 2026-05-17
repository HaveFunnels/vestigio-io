"use client";

/**
 * VendorAdvisories — Wave 11.4f.
 *
 * Since the existing detection pipeline doesn't capture vendor
 * VERSIONS yet, we deliberately don't try to match CVEs to specific
 * versions — that produces noise. Instead:
 *
 *   - Surface the canonical security feed for each detected vendor
 *     (consolidated jump list — one click to the right page).
 *   - Highlight a small curated set of high-impact recent alerts
 *     worth verifying against (from src/lib/vendor-advisories.ts).
 *   - Explicit caveat that this is feed surfacing, not version
 *     matching — the user owns the version check.
 *
 * If/when version detection lands, this widget can grow into a real
 * CVE matcher — the existing UI already accommodates a per-row alert
 * list, just with curated entries today.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
	getVendorAdvisory,
	type NotableAdvisory,
	type VendorAdvisoryEntry,
} from "@/lib/vendor-advisories";
import type {
	DetectedTechnology,
	TechnologyStackProjection,
} from "../../../../packages/technology-registry/types";

interface Row {
	tech: DetectedTechnology;
	advisory: VendorAdvisoryEntry;
}

const SEVERITY_DOT: Record<NotableAdvisory["severity"], string> = {
	critical: "bg-red-500",
	high: "bg-orange-500",
	medium: "bg-amber-500",
};

const SEVERITY_TEXT: Record<NotableAdvisory["severity"], string> = {
	critical: "text-red-500 dark:text-red-400",
	high: "text-orange-500 dark:text-orange-400",
	medium: "text-amber-500 dark:text-amber-400",
};

export default function VendorAdvisories() {
	const t = useTranslations("console.workspaces.detail.vendor_advisories");
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
			const advisory = getVendorAdvisory(tech.key);
			if (advisory) out.push({ tech, advisory });
		}
		// Vendors with notable advisories first, then alphabetical.
		out.sort((a, b) => {
			const diff = b.advisory.notable.length - a.advisory.notable.length;
			if (diff !== 0) return diff;
			return a.tech.display_name.localeCompare(b.tech.display_name);
		});
		return out;
	}, [stack]);

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

	if (rows.length === 0) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
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
				<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
			</div>
			<div className="space-y-3">
				{rows.map(({ tech, advisory }) => (
					<div
						key={tech.key}
						className="rounded-xl border border-edge bg-surface-card/60 p-3"
					>
						<div className="flex items-center justify-between gap-3">
							<span className="text-[13px] font-semibold text-content">
								{tech.display_name}
							</span>
							<a
								href={advisory.advisoryUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] font-medium text-content-secondary transition-colors hover:border-content-faint hover:bg-surface-card-hover"
							>
								{t("view_feed")} →
							</a>
						</div>
						{advisory.notable.length > 0 ? (
							<div className="mt-3">
								<div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
									{t("notable_label", { count: advisory.notable.length })}
								</div>
								<ul className="space-y-2">
									{advisory.notable.map((n) => (
										<li
											key={n.id}
											className="rounded-lg border border-edge/60 bg-surface-inset/40 p-2.5"
										>
											<div className="flex items-center gap-2">
												<span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[n.severity]}`} aria-hidden />
												<span className="font-mono text-[10px] text-content-faint">
													{n.id} · {n.publishedAt}
												</span>
												<span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${SEVERITY_TEXT[n.severity]}`}>
													{t(`severity_${n.severity}`)}
												</span>
											</div>
											<p className="mt-1 text-[12px] text-content-secondary">{n.summary}</p>
											<p className="mt-1.5 text-[11px] text-content-muted">
												<span className="font-semibold">{t("mitigation_label")}</span>{" "}
												{n.mitigation}
											</p>
										</li>
									))}
								</ul>
							</div>
						) : (
							<p className="mt-2 text-[11px] italic text-content-faint">{t("no_notable")}</p>
						)}
					</div>
				))}
			</div>
			<p className="mt-3 text-[11px] italic text-content-faint">{t("caveat")}</p>
		</section>
	);
}
