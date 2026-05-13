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
	const [showAbout, setShowAbout] = useState(false);

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

	// Available page slots: only those that actually have a matching crawl.
	const availableSlots = useMemo<PageSlot[]>(() => {
		const slots: Set<PageSlot> = new Set();
		for (const p of pages) {
			const s = detectPageSlot(p.url);
			if (s) slots.add(s);
		}
		const ordered: PageSlot[] = ["home", "pricing", "features", "about"];
		return ordered.filter((s) => slots.has(s));
	}, [pages]);

	// Whenever the selected slot has a matching page, fire 10 parallel audit
	// requests (one per framework). Each cell is cached server-side per
	// (framework, pageUrl) so re-selecting a previously-visited slot is
	// instant. An AbortController is used so rapid slot-switching cancels
	// in-flight requests instead of accumulating Haiku calls for pages the
	// user already navigated away from.
	useEffect(() => {
		if (!selectedPage) return;
		const controller = new AbortController();

		// Mark all frameworks as loading for this page
		setAudits((prev) => {
			const next = new Map(prev);
			for (const fw of COPY_FRAMEWORKS) {
				next.set(`${fw.id}::${selectedPage.url}`, "loading");
			}
			return next;
		});

		const pageUrl = selectedPage.url;
		Promise.allSettled(
			COPY_FRAMEWORKS.map((fw) =>
				fetch(
					`/api/workspace/copy-framework-audit?framework=${encodeURIComponent(fw.id)}&pageUrl=${encodeURIComponent(pageUrl)}&locale=${encodeURIComponent(locale)}`,
					{ signal: controller.signal },
				)
					.then((r) => (r.ok ? r.json() : null))
					.then((data) => ({ id: fw.id, data })),
			),
		).then((results) => {
			if (controller.signal.aborted) return;
			setAudits((prev) => {
				const next = new Map(prev);
				for (const r of results) {
					if (r.status === "fulfilled") {
						const { id, data } = r.value;
						if (data && Array.isArray(data.criteria) && typeof data.score_pct === "number") {
							next.set(`${id}::${pageUrl}`, {
								criteria: data.criteria,
								score_pct: data.score_pct,
							});
						} else {
							next.set(`${id}::${pageUrl}`, "error");
						}
					}
				}
				return next;
			});
		});

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
				<h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
					{t("label")}
				</h2>
				<p className="text-[12px] text-content-muted">{t("loading_scores")}</p>
			</section>
		);
	}

	if (availableSlots.length === 0) {
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

	// Make sure the currently selected slot is available — fall back to first available.
	const effectiveSlot = availableSlots.includes(selectedSlot) ? selectedSlot : availableSlots[0];

	return (
		<section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
			<div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
				<div>
					<h2 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
						{t("label")}
					</h2>
					<p className="mt-1 text-[12px] text-content-muted">{t("subtitle")}</p>
				</div>
			</div>

			{/* Dropdowns */}
			<div className="mb-4 flex flex-wrap items-center gap-3">
				<label className="flex items-center gap-2 text-[12px]">
					<span className="text-content-muted">{t("framework_dropdown")}:</span>
					<select
						value={selectedFramework}
						onChange={(e) => setSelectedFramework(e.target.value)}
						className="rounded-md border border-edge bg-surface-card px-2 py-1 font-mono text-[12px] text-content focus:outline-none focus:ring-1 focus:ring-emerald-500"
					>
						{COPY_FRAMEWORKS.map((fw) => {
							const a = selectedPage ? audits.get(`${fw.id}::${selectedPage.url}`) : undefined;
							const score = a && a !== "loading" && a !== "error" ? a.score_pct : null;
							return (
								<option key={fw.id} value={fw.id}>
									{pickText(fw.name, fwLocale)}
									{score !== null ? ` — ${score}%` : ""}
								</option>
							);
						})}
					</select>
				</label>
				<label className="flex items-center gap-2 text-[12px]">
					<span className="text-content-muted">{t("page_dropdown")}:</span>
					<select
						value={effectiveSlot}
						onChange={(e) => setSelectedSlot(e.target.value as PageSlot)}
						className="rounded-md border border-edge bg-surface-card px-2 py-1 font-mono text-[12px] text-content focus:outline-none focus:ring-1 focus:ring-emerald-500"
					>
						{availableSlots.map((s) => (
							<option key={s} value={s}>
								{t(`page_${s}`)}
							</option>
						))}
					</select>
				</label>
				<button
					type="button"
					onClick={() => setShowAbout(!showAbout)}
					className="text-[11px] text-content-faint underline transition-colors hover:text-content-muted"
				>
					{t("about_framework")}
				</button>
			</div>

			{/* About blurb */}
			{showAbout && framework && (
				<div className="mb-4 rounded-xl border border-edge bg-surface-inset/40 p-3 text-[12px] leading-snug text-content-muted">
					<div className="font-semibold text-content">{pickText(framework.name, fwLocale)}</div>
					<p className="mt-1">{pickText(framework.intro, fwLocale)}</p>
				</div>
			)}

			{/* Audit content */}
			{!selectedPage || currentAudit === "loading" || currentAudit === undefined ? (
				<p className="text-[12px] text-content-muted">{t("loading")}</p>
			) : currentAudit === "error" ? (
				<p className="text-[12px] text-amber-600 dark:text-amber-400">{t("loading")}</p>
			) : (
				<>
					{/* Score summary */}
					<div className="mb-3 flex items-baseline gap-3">
						<span className={`font-mono text-2xl font-medium tabular-nums ${
							currentAudit.score_pct >= 75
								? "text-emerald-600 dark:text-emerald-400"
								: currentAudit.score_pct >= 40
									? "text-amber-600 dark:text-amber-400"
									: "text-red-500 dark:text-red-400"
						}`}>
							{currentAudit.score_pct}%
						</span>
						<span className="text-[12px] text-content-muted">
							{t("score_summary", {
								passed: currentAudit.criteria.filter((c) => c.status === "pass").length,
								total: framework?.criteria.length ?? 0,
							})}
						</span>
					</div>

					{/* Criteria list */}
					<div className="space-y-2">
						{framework?.criteria.map((crit) => {
							const verdict = currentAudit.criteria.find((c) => c.id === crit.id);
							// Distinguish "not evaluated" (LLM omission) from "warn"
							// to avoid double-penalty visual when status missing.
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
													<span className="font-semibold">{t("evidence_label")}</span> {verdict.evidence}
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
