"use client";

/**
 * CopyFrameworkLens — Wave 11.5g.
 *
 * Always-on copy audit widget for the Copy workspace. User picks a
 * page (home / pricing / features / about) and a copywriting
 * framework (AIDA, PAS, 4P's, BAB, SPIN, FAB, DOS, Pixar, QUEST,
 * 4Cs) and sees the page audited against the framework's criteria.
 *
 * Three-layer architecture:
 *
 *   1. On mount + on page change, fires N parallel audit calls (one
 *      per framework) for the currently-selected page. Each call
 *      goes to /api/workspace/copy-framework-audit which is cached
 *      per (env, cycle, framework, page, locale).
 *   2. The dropdown shows the score % alongside each framework name
 *      so the user can spot the biggest gap before even clicking.
 *   3. When a criterion fails or warns, the inline fix CTA opens
 *      the existing Copilot (Wave 3.14) with a pre-filled prompt
 *      that includes the criterion, the current copy, and the
 *      suggested rewrite.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCopilot } from "@/components/app/CopilotProvider";
import { renderRichText } from "@/lib/rich-text";
import {
	COPY_FRAMEWORKS,
	pickText,
	type CopyFramework,
} from "@/lib/copy-frameworks";

type Status = "pass" | "warn" | "fail" | "not_evaluated";

interface CriterionVerdict {
	id: string;
	status: Status;
	evidence: string;
	fix: string | null;
}

interface AuditResult {
	criteria: CriterionVerdict[];
	score_pct: number;
}

interface CopyPage {
	url: string;
	title: string | null;
	h1: string | null;
	meta_description: string | null;
}

type PageSlot = "home" | "pricing" | "features" | "about";

const STATUS_DOT: Record<Status, string> = {
	pass: "bg-emerald-500",
	warn: "bg-amber-500",
	fail: "bg-red-500",
	not_evaluated: "bg-zinc-400 dark:bg-zinc-600",
};

const STATUS_TEXT: Record<Status, string> = {
	pass: "text-emerald-600 dark:text-emerald-400",
	warn: "text-amber-600 dark:text-amber-400",
	fail: "text-red-500 dark:text-red-400",
	not_evaluated: "text-content-faint",
};

const STATUS_ICON: Record<Status, string> = {
	pass: "✓",
	warn: "⚠",
	fail: "✗",
	not_evaluated: "—",
};

// Heuristic mapping of crawled URLs to page slots. The keyword must
// occupy a complete path segment — `/blog/pricing-guide` and
// `/enterprise-features-comparison` must NOT match (would happen with
// substring regex that has no anchor after the keyword).
function detectPageSlot(url: string): PageSlot | null {
	try {
		const path = new URL(url).pathname.toLowerCase();
		if (path === "/" || path === "" || path === "/home") return "home";
		if (/\/(pricing|price|plans|plano|precos|preco)(\/|$)/.test(path)) return "pricing";
		if (/\/(features|product|recursos|produto|funcionalidades)(\/|$)/.test(path)) return "features";
		if (/\/(about|company|sobre|empresa|quem-somos)(\/|$)/.test(path)) return "about";
		return null;
	} catch {
		return null;
	}
}

function pickPageForSlot(slot: PageSlot, pages: CopyPage[]): CopyPage | null {
	// Score each page by exact match strength
	let best: CopyPage | null = null;
	let bestPathLength = Infinity;
	for (const p of pages) {
		const matched = detectPageSlot(p.url);
		if (matched === slot) {
			try {
				const len = new URL(p.url).pathname.length;
				if (len < bestPathLength) {
					bestPathLength = len;
					best = p;
				}
			} catch {
				// skip
			}
		}
	}
	// Fallback: when asking for "home" and no URL path-segment matched,
	// use the shortest-path page from the crawl set. This keeps the
	// framework lens populated even on sites whose homepage isn't at "/"
	// or whose top-4 slugs use non-standard names.
	if (slot === "home" && !best && pages.length > 0) {
		for (const p of pages) {
			try {
				const len = new URL(p.url).pathname.length;
				if (len < bestPathLength) {
					bestPathLength = len;
					best = p;
				}
			} catch {
				// skip
			}
		}
	}
	return best;
}

export default function CopyFrameworkLens() {
	const t = useTranslations("console.workspaces.detail.framework_lens");
	const locale = useLocale();
	const copilot = useCopilot();

	const fwLocale = locale === "pt-BR" || locale === "pt" ? "pt" : "en";

	const [pages, setPages] = useState<CopyPage[]>([]);
	const [pagesLoading, setPagesLoading] = useState(true);
	const [selectedSlot, setSelectedSlot] = useState<PageSlot>("home");
	const [selectedFramework, setSelectedFramework] = useState<string>(COPY_FRAMEWORKS[0].id);
	// Map<frameworkId, AuditResult | "loading" | "error">
	const [audits, setAudits] = useState<Map<string, AuditResult | "loading" | "error">>(new Map());

	// Load the page list once.
	useEffect(() => {
		let cancelled = false;
		fetch("/api/workspace/copy-content")
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (cancelled) return;
				setPages(Array.isArray(d?.pages) ? d.pages : []);
				setPagesLoading(false);
			})
			.catch(() => {
				if (!cancelled) setPagesLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const selectedPage = useMemo(
		() => pickPageForSlot(selectedSlot, pages),
		[selectedSlot, pages],
	);

	// Available page slots: those with a matching crawl, plus "home"
	// whenever any page exists at all (pickPageForSlot falls back to the
	// shortest-path page so the user can always inspect ≥1 page).
	const availableSlots = useMemo<PageSlot[]>(() => {
		const slots: Set<PageSlot> = new Set();
		for (const p of pages) {
			const s = detectPageSlot(p.url);
			if (s) slots.add(s);
		}
		if (pages.length > 0) slots.add("home");
		const ordered: PageSlot[] = ["home", "pricing", "features", "about"];
		return ordered.filter((s) => slots.has(s));
	}, [pages]);

	// Whenever the selected page changes, do ONE batch read against
	// /copy-framework-audits to hydrate every framework that's already
	// in the DB cache. For any framework missing from that response
	// (cold cycle just landed, new framework just shipped in code), fire
	// the per-framework generation route to fill the gap — Haiku runs,
	// the result lands in the DB, next page open picks it up from the
	// batch read in <50ms.
	//
	// Pre-fix this useEffect fanned out 10 parallel /copy-framework-audit
	// calls, and the in-memory cache evaporated on every Railway deploy,
	// so each first page open after a deploy paid 10× Haiku ≈ 10s of
	// loading. With the DB cache now in place, the batch path returns in
	// one query for most visits.
	useEffect(() => {
		if (!selectedPage) return;
		const controller = new AbortController();

		// Mark all frameworks as loading for this page up front so
		// the chips render skeletons instead of the previous page's
		// scores while we hydrate.
		setAudits((prev) => {
			const next = new Map(prev);
			for (const fw of COPY_FRAMEWORKS) {
				next.set(`${fw.id}::${selectedPage.url}`, "loading");
			}
			return next;
		});

		const pageUrl = selectedPage.url;

		async function hydrate() {
			// L1 — batch read from DB cache. Resolves instantly for any
			// (env, cycle, pageUrl, locale) bucket that has cached rows.
			let cached: Record<string, { criteria: CriterionVerdict[]; score_pct: number }> = {};
			try {
				const r = await fetch(
					`/api/workspace/copy-framework-audits?pageUrl=${encodeURIComponent(pageUrl)}&locale=${encodeURIComponent(locale)}`,
					{ signal: controller.signal },
				);
				if (r.ok) {
					const data = await r.json();
					if (data && typeof data === "object" && data.frameworks) {
						cached = data.frameworks as typeof cached;
					}
				}
			} catch {
				// network / abort — fall through to per-framework path
				if (controller.signal.aborted) return;
			}
			if (controller.signal.aborted) return;

			// Apply cached results immediately so the user sees something
			// the instant the DB query returns, before any LLM call.
			setAudits((prev) => {
				const next = new Map(prev);
				for (const [id, audit] of Object.entries(cached)) {
					next.set(`${id}::${pageUrl}`, audit);
				}
				return next;
			});

			// L2 — fire individual generation requests for frameworks not
			// in the batch. Each one triggers Haiku server-side and
			// persists the result; subsequent visits skip this step.
			const missing = COPY_FRAMEWORKS.filter((fw) => !(fw.id in cached));
			if (missing.length === 0) return;

			const results = await Promise.allSettled(
				missing.map((fw) =>
					fetch(
						`/api/workspace/copy-framework-audit?framework=${encodeURIComponent(fw.id)}&pageUrl=${encodeURIComponent(pageUrl)}&locale=${encodeURIComponent(locale)}`,
						{ signal: controller.signal },
					)
						.then((r) => (r.ok ? r.json() : null))
						.then((data) => ({ id: fw.id, data })),
				),
			);
			if (controller.signal.aborted) return;
			setAudits((prev) => {
				const next = new Map(prev);
				for (const r of results) {
					if (r.status !== "fulfilled") continue;
					const { id, data } = r.value;
					// Wave 18g — when the API returns { criteria: [],
					// score_pct: 0, fallback: true }, the previous code
					// treated it as a valid result and showed 0% with an
					// empty checklist. That looked like "the framework
					// failed every criterion" when in fact the audit
					// could not run (no LLM, no body, no env, etc.).
					const isFallback =
						data && (data.fallback === true || (Array.isArray(data.criteria) && data.criteria.length === 0));
					if (data && Array.isArray(data.criteria) && typeof data.score_pct === "number" && !isFallback) {
						next.set(`${id}::${pageUrl}`, {
							criteria: data.criteria,
							score_pct: data.score_pct,
						});
					} else {
						next.set(`${id}::${pageUrl}`, "error");
					}
				}
				return next;
			});
		}

		hydrate();
		return () => {
			controller.abort();
		};
	}, [selectedPage?.url, locale]); // eslint-disable-line react-hooks/exhaustive-deps

	const framework = COPY_FRAMEWORKS.find((f) => f.id === selectedFramework) as CopyFramework;

	const currentAudit = selectedPage
		? audits.get(`${selectedFramework}::${selectedPage.url}`)
		: undefined;

	function handleFixWithCopilot(criterionId: string, fix: string, evidence: string) {
		if (!selectedPage || !framework) return;
		const criterion = framework.criteria.find((c) => c.id === criterionId);
		if (!criterion) return;
		const pageLabel = t(`copilot_page_${selectedSlot}`);
		const prompt = t("copilot_prompt", {
			pageLabel,
			framework: pickText(framework.name, fwLocale),
			url: selectedPage.url,
			h1: selectedPage.h1 ?? "(none)",
			meta: selectedPage.meta_description ?? "(none)",
			criterion: pickText(criterion.label, fwLocale),
			hint: pickText(criterion.hint, fwLocale),
			evidence,
			fix,
		});
		copilot.open({ prompt });
	}

	if (pagesLoading) {
		return (
			<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
				<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
					{t("label")}
				</h2>
				<p className="text-[12px] text-content-muted">{t("loading_scores")}</p>
			</section>
		);
	}

	// When zero pages exist yet, we still render the framework structure
	// (all criteria as `not_evaluated`) so the user can browse the 38
	// checklist items per framework. Wires up after the next audit cycle
	// adds page_content evidence rows.
	const hasNoPages = pages.length === 0;
	const effectiveSlot: PageSlot = availableSlots.includes(selectedSlot)
		? selectedSlot
		: (availableSlots[0] ?? "home");

	const auditPassed =
		!hasNoPages && currentAudit && currentAudit !== "loading" && currentAudit !== "error"
			? currentAudit.criteria.filter((c) => c.status === "pass").length
			: null;
	const auditScore =
		!hasNoPages && currentAudit && currentAudit !== "loading" && currentAudit !== "error"
			? currentAudit.score_pct
			: null;
	const scoreClass = (s: number | null) =>
		s === null
			? "text-content-faint"
			: s >= 75
				? "text-emerald-600 dark:text-emerald-400"
				: s >= 40
					? "text-amber-600 dark:text-amber-400"
					: "text-red-500 dark:text-red-400";

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			{/* Top header — title + subtitle on the left, page selector on the right. */}
			<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
						{t("label")}
					</h2>
					<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
				</div>
				{!hasNoPages && (
					<label className="flex shrink-0 items-center gap-2 text-[11px]">
						<span className="text-content-faint">{t("page_dropdown")}</span>
						<select
							value={effectiveSlot}
							onChange={(e) => setSelectedSlot(e.target.value as PageSlot)}
							className="rounded-md border border-edge bg-surface-card px-2 py-1 font-mono text-[11px] text-content focus:outline-none focus:ring-1 focus:ring-emerald-500"
						>
							{availableSlots.map((s) => (
								<option key={s} value={s}>
									{t(`page_${s}`)}
								</option>
							))}
						</select>
					</label>
				)}
			</div>

			{/* Pre-data banner — only when crawler hasn't produced any
			    page_content evidence yet. The checklist below still shows
			    every criterion so the user can study the framework. */}
			{hasNoPages && (
				<div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-500/[0.04] dark:text-amber-300/90">
					{t("awaiting_pages")}
				</div>
			)}

			{/* Chip switcher — 10 frameworks as a horizontal row. Each
			    chip = name + per-criterion status dots + score, with a
			    tooltip on hover explaining use case + when to reach for
			    it. The dot row gives at-a-glance scanning across all 10
			    frameworks so the user can spot the worst-scoring one
			    before clicking. */}
			<div className="mb-5 flex flex-wrap gap-2">
				{COPY_FRAMEWORKS.map((fw) => {
					const a = selectedPage ? audits.get(`${fw.id}::${selectedPage.url}`) : undefined;
					const ready = a && a !== "loading" && a !== "error";
					const score = ready ? a.score_pct : null;
					const isActive = selectedFramework === fw.id;
					return (
						<div key={fw.id} className="group relative">
							<button
								type="button"
								onClick={() => setSelectedFramework(fw.id)}
								aria-pressed={isActive}
								className={`flex min-w-[72px] md:min-w-[110px] lg:min-w-[128px] flex-col items-center gap-1.5 rounded-xl border px-3 md:px-4 py-2 transition-all duration-200 ${
									isActive
										? "border-emerald-500/60 bg-emerald-500/[0.08] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]"
										: "border-edge bg-surface-card/40 hover:-translate-y-px hover:border-edge-strong hover:bg-surface-card-hover"
								}`}
							>
								<span
									className={`font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-semibold uppercase tracking-[0.06em] ${
										isActive
											? "text-emerald-700 dark:text-emerald-300"
											: "text-content"
									}`}
								>
									{pickText(fw.name, fwLocale)}
								</span>
								<div className="flex items-center gap-[3px]">
									{fw.criteria.map((crit) => {
										const verdict = ready
											? a.criteria.find((c) => c.id === crit.id)
											: undefined;
										const st: Status = verdict?.status ?? "not_evaluated";
										return (
											<span
												key={crit.id}
												className={`h-1 w-1 rounded-full ${STATUS_DOT[st]}`}
												aria-hidden="true"
											/>
										);
									})}
								</div>
								<span
									className={`font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium tabular-nums ${scoreClass(score)}`}
								>
									{score !== null ? `${score}%` : "—"}
								</span>
							</button>
							{/* Tooltip — appears above the chip on hover/focus.
							    Explains the framework's strategic positioning. */}
							<div
								role="tooltip"
								className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-xl border border-edge bg-surface-card p-3 opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
							>
								<div className="flex items-baseline justify-between gap-2">
									<div className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-bold uppercase tracking-[0.06em] text-content">
										{pickText(fw.name, fwLocale)}
									</div>
									<span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-600 dark:text-emerald-400">
										{pickText(fw.useCase, fwLocale)}
									</span>
								</div>
								<p className="mt-2 text-[11px] leading-snug text-content-muted">
									{pickText(fw.whenToUse, fwLocale)}
								</p>
								{/* Arrow */}
								<div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-edge bg-surface-card" />
							</div>
						</div>
					);
				})}
			</div>

			{/* Active framework header — name + intro + big score. */}
			{framework && (
				<div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-edge/60 pb-4">
					<div className="min-w-0 max-w-xl">
						<div className="flex items-baseline gap-2">
							<h3 className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] font-bold uppercase tracking-[0.08em] text-content">
								{pickText(framework.name, fwLocale)}
							</h3>
							<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-600 dark:text-emerald-400">
								{pickText(framework.useCase, fwLocale)}
							</span>
						</div>
						<p className="mt-1.5 text-[12px] leading-snug text-content-muted">
							{pickText(framework.intro, fwLocale)}
						</p>
					</div>
					{auditScore !== null && auditPassed !== null && (
						<div className="shrink-0 text-right">
							<div
								className={`font-[family-name:var(--font-jetbrains-mono)] text-3xl font-medium tabular-nums leading-none ${scoreClass(auditScore)}`}
							>
								{auditScore}%
							</div>
							<div className="mt-1.5 text-[10px] uppercase tracking-[0.08em] text-content-faint">
								{t("score_summary", {
									passed: auditPassed,
									total: framework.criteria.length,
								})}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Audit content */}
			{!hasNoPages && (!selectedPage || currentAudit === "loading" || currentAudit === undefined) ? (
				<p className="text-[12px] text-content-muted">{t("loading")}</p>
			) : !hasNoPages && currentAudit === "error" ? (
				<p className="text-[12px] text-amber-600 dark:text-amber-400">{t("loading")}</p>
			) : (
				<>
					{/* Criteria list */}
					<div className="space-y-2">
						{framework?.criteria.map((crit) => {
							const verdict =
								!hasNoPages && currentAudit && currentAudit !== "loading" && currentAudit !== "error"
									? currentAudit.criteria.find((c) => c.id === crit.id)
									: undefined;
							// Distinguish "not evaluated" (LLM omission OR no page data
							// yet) from "warn" to avoid double-penalty visual.
							const status: Status = verdict?.status ?? "not_evaluated";
							return (
								<div
									key={crit.id}
									className="rounded-xl border border-edge bg-surface-card/60 p-3"
								>
									<div className="flex items-start gap-2.5">
										<span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${STATUS_DOT[status]} text-[11px] font-bold text-white`}>
											{STATUS_ICON[status]}
										</span>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="text-[13px] font-semibold text-content">
													{pickText(crit.label, fwLocale)}
												</span>
												<span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${STATUS_TEXT[status]}`}>
													{t(`status_${status}`)}
												</span>
											</div>
											{verdict?.evidence && (
												<p className="mt-1.5 text-[11px] leading-snug text-content-muted">
													<span className="font-semibold">{t("evidence_label")}</span> {renderRichText(verdict.evidence)}
												</p>
											)}
											{verdict?.fix && status !== "pass" && (
												<div className="mt-2 rounded-md border border-edge/60 bg-surface-inset/40 p-2">
													<div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-content-faint">
														{t("fix_label")}
													</div>
													<div className="mt-0.5 text-[12px] text-content-secondary">{verdict.fix}</div>
													<button
														type="button"
														onClick={() =>
															handleFixWithCopilot(crit.id, verdict.fix!, verdict.evidence)
														}
														className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
													>
														<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
															<path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
														</svg>
														{t("fix_with_copilot")}
													</button>
												</div>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</>
			)}
		</section>
	);
}
