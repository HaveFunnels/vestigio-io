"use client";

/**
 * ToneConsistency — Per-page tone classification + consistency score
 * (Wave 11.5f).
 *
 * Reads /api/workspace/copy-tone which uses Haiku to classify each
 * page's tone into one of 8 categorical tags, then computes the
 * percentage of pages on the dominant tone. Drops in consistency
 * are the friction signal (homepage casual → checkout corporate).
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type ToneTag =
	| "playful"
	| "casual"
	| "confident"
	| "professional"
	| "corporate"
	| "technical"
	| "urgent"
	| "salesy";

interface PageTone {
	url: string;
	tone: ToneTag;
}

interface Response {
	pages: PageTone[];
	consistency: number;
	dominant: ToneTag | null;
	fallback?: boolean;
}

const TONE_COLOR: Record<ToneTag, string> = {
	playful: "bg-pink-500",
	casual: "bg-sky-500",
	confident: "bg-violet-500",
	professional: "bg-blue-500",
	corporate: "bg-zinc-500",
	technical: "bg-emerald-500",
	urgent: "bg-orange-500",
	salesy: "bg-amber-500",
};

function shortenUrl(url: string): string {
	try {
		const u = new URL(url);
		return u.pathname === "/" ? u.host : u.pathname;
	} catch {
		return url;
	}
}

export default function ToneConsistency() {
	const t = useTranslations("console.workspaces.detail.tone_consistency");
	const [data, setData] = useState<Response | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/workspace/copy-tone")
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

	const grouped = useMemo(() => {
		if (!data) return [];
		const map = new Map<ToneTag, PageTone[]>();
		for (const p of data.pages) {
			const arr = map.get(p.tone) ?? [];
			arr.push(p);
			map.set(p.tone, arr);
		}
		return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
	}, [data]);

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

	if (!data || data.pages.length === 0) {
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

	const dominantLabel = data.dominant ? t(`tones.${data.dominant}`) : "—";
	const isLowConsistency = data.consistency < 70;

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<div className="mb-4">
				<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
			</div>

			<div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<div>
					<span
						className={`font-mono text-2xl font-medium tabular-nums ${
							isLowConsistency
								? "text-amber-600 dark:text-amber-400"
								: "text-emerald-600 dark:text-emerald-400"
						}`}
					>
						{data.consistency}%
					</span>
					<span className="ml-2 text-[11px] text-content-muted">
						{t("consistency_score", { pct: data.consistency })}
					</span>
				</div>
				<div className="text-[11px] text-content-muted">
					{t("dominant_tone", { tone: dominantLabel })}
				</div>
			</div>

			{/* Stacked bar showing tone distribution */}
			<div className="mb-4 flex h-3 w-full overflow-hidden rounded-full border border-edge">
				{grouped.map(([tone, pages]) => {
					const pct = (pages.length / data.pages.length) * 100;
					return (
						<div
							key={tone}
							className={TONE_COLOR[tone]}
							style={{ width: `${pct}%` }}
							title={`${t(`tones.${tone}`)} · ${pages.length} pages`}
						/>
					);
				})}
			</div>

			{/* Per-tone breakdown */}
			<div className="space-y-2">
				{grouped.map(([tone, pages]) => (
					<div key={tone} className="rounded-xl border border-edge bg-surface-card/60 p-3">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<span className={`h-2 w-2 rounded-full ${TONE_COLOR[tone]}`} />
								<span className="text-[13px] font-medium text-content">
									{t(`tones.${tone}`)}
								</span>
							</div>
							<span className="font-mono text-[11px] tabular-nums text-content-muted">
								{pages.length} · {Math.round((pages.length / data.pages.length) * 100)}%
							</span>
						</div>
						<div className="mt-1.5 flex flex-wrap gap-1.5">
							{pages.slice(0, 8).map((p) => (
								<span
									key={p.url}
									className="inline-flex items-center rounded-md border border-edge bg-surface-inset/60 px-1.5 py-0.5 font-mono text-[10px] text-content-secondary"
								>
									{shortenUrl(p.url)}
								</span>
							))}
							{pages.length > 8 && (
								<span className="text-[10px] text-content-faint">+{pages.length - 8}</span>
							)}
						</div>
					</div>
				))}
			</div>

			{isLowConsistency && (
				<p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400">
					{t("low_consistency_note")}
				</p>
			)}
		</section>
	);
}
