"use client";

/**
 * MiniFunnelMap — LP-safe variant of the product's FunnelIntegrityMap.
 *
 * Same visual identity as
 *   src/components/console/workspace/FunnelIntegrityMap.tsx
 * (stage card row, stage colors, arrows, expand-on-click), but takes
 * plain props instead of `useMcpData` + `next-intl(console.*)` so it
 * renders on the pre-auth funnel without dragging the McpDataProvider
 * tree along.
 *
 * Category-to-stage mapping is a deliberate simplification: the mini-
 * audit's MiniFinding doesn't carry a `surface` URL the way the full
 * engine does (it's typically single-page), so we infer funnel stage
 * from the finding category. This is illustrative, not authoritative —
 * the real product map uses surface-classifier for actual URLs.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
	Eye,
	Compass,
	Target,
	ShoppingBag,
	Repeat,
	type LucideIcon,
} from "lucide-react";
import type {
	MiniFinding,
	BlurredFinding,
	MiniFindingCategory,
} from "../../../workers/ingestion/mini-audit-findings";
import { formatBRL } from "../../../packages/impact/mini-impact";

// Per-stage icon — visual anchor so the buyer reads the funnel
// stage at a glance on the mobile carousel where there are no
// chevrons to imply flow. Each icon is a metaphor for the buyer's
// state at that point in the journey:
//   awareness → Eye (just landed, eyeing the offer)
//   consideration → Compass (exploring, comparing)
//   decision → Target (zeroing in on the choice)
//   conversion → ShoppingBag (the transaction moment)
//   post_conversion → Repeat (retention / return / renew)
const STAGE_ICONS: Record<
	"awareness" | "consideration" | "decision" | "conversion" | "post_conversion",
	LucideIcon
> = {
	awareness: Eye,
	consideration: Compass,
	decision: Target,
	conversion: ShoppingBag,
	post_conversion: Repeat,
};

type StageId =
	| "awareness"
	| "consideration"
	| "decision"
	| "conversion"
	| "post_conversion";

const STAGE_IDS: readonly StageId[] = [
	"awareness",
	"consideration",
	"decision",
	"conversion",
	"post_conversion",
] as const;

// Two states only — clean and issue. Single accent (rose) for any
// stage with at least one leak, neutral surface for everything else.
// The original rainbow palette read as "AI generated" (per customer
// feedback "ainda parece AI slop"); editorial direction wants
// restraint. The per-stage hue can come back later as a secondary
// signal if needed — for now, color earns its place ONLY by
// communicating loss.
const CLEAN_CLASSES = {
	container: "border-edge bg-surface-inset",
	expandedContainer:
		"border-edge bg-surface-inset ring-1 ring-inset ring-content/5",
	stageLabel: "text-content-muted",
	stageValue: "text-content",
} as const;

const ISSUE_CLASSES = {
	container: "border-rose-500/40 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/[0.08]",
	expandedContainer:
		"border-rose-500/60 bg-rose-100 ring-1 ring-inset ring-rose-500/10 dark:border-rose-500/40 dark:bg-rose-500/[0.12]",
	stageLabel: "text-rose-700/80 dark:text-rose-300/80",
	stageValue: "text-rose-700 dark:text-rose-200",
} as const;

// Mini-audit categories → funnel stage. The mapping is conservative:
// CTA/structure read as consideration; trust/friction as the decision
// moment; checkout as conversion; performance hits awareness (slow
// load = bounce before they consider anything); policy lands in
// post-conversion (refund / data / TOS surface).
const CATEGORY_TO_STAGE: Record<MiniFindingCategory, StageId> = {
	performance: "awareness",
	structure: "consideration",
	mobile: "consideration",
	cta: "consideration",
	trust: "decision",
	friction: "decision",
	checkout: "conversion",
	policy: "post_conversion",
};

interface StageData {
	count: number;
	impactCents: number;
	hasLockedOnly: boolean;
}

interface Props {
	visibleFindings: MiniFinding[];
	blurredFindings: BlurredFinding[];
	onUnlock: () => void;
}

export default function MiniFunnelMap({
	visibleFindings,
	blurredFindings,
	onUnlock,
}: Props) {
	const t = useTranslations("lp.audit_result.funnel_map");
	const [expandedStage, setExpandedStage] = useState<StageId | null>(null);
	// Mobile carousel state: tracks which card is most-in-view so the
	// dot indicator below can highlight it. Desktop ignores this.
	const [snappedIndex, setSnappedIndex] = useState(0);
	const carouselRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const root = carouselRef.current;
		if (!root) return;
		const cards = root.querySelectorAll<HTMLElement>("[data-stage-card]");
		const obs = new IntersectionObserver(
			(entries) => {
				let bestRatio = 0;
				let bestIdx = snappedIndex;
				for (const e of entries) {
					if (e.intersectionRatio > bestRatio) {
						bestRatio = e.intersectionRatio;
						bestIdx = Number((e.target as HTMLElement).dataset.index);
					}
				}
				if (!Number.isNaN(bestIdx)) setSnappedIndex(bestIdx);
			},
			{ root, threshold: [0.4, 0.6, 0.8, 1] },
		);
		cards.forEach((c) => obs.observe(c));
		return () => obs.disconnect();
		// snappedIndex intentionally excluded — observer keeps its own
		// notion of which card is most visible and updates state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Bucket findings into stages
	const stageData: Record<StageId, StageData> = {
		awareness: { count: 0, impactCents: 0, hasLockedOnly: false },
		consideration: { count: 0, impactCents: 0, hasLockedOnly: false },
		decision: { count: 0, impactCents: 0, hasLockedOnly: false },
		conversion: { count: 0, impactCents: 0, hasLockedOnly: false },
		post_conversion: { count: 0, impactCents: 0, hasLockedOnly: false },
	};
	const stageVisible: Record<StageId, MiniFinding[]> = {
		awareness: [],
		consideration: [],
		decision: [],
		conversion: [],
		post_conversion: [],
	};

	for (const f of visibleFindings) {
		if (f.severity === "positive") continue;
		const stage = CATEGORY_TO_STAGE[f.category];
		stageData[stage].count += 1;
		stageData[stage].impactCents += f.impact?.max_brl_cents ?? 0;
		stageVisible[stage].push(f);
	}
	for (const b of blurredFindings) {
		const stage = CATEGORY_TO_STAGE[b.category];
		stageData[stage].count += 1;
		// No impact data on blurred — flag for the blurred-R$display
		if (stageData[stage].impactCents === 0) {
			stageData[stage].hasLockedOnly = true;
		}
	}

	const expandedItems = expandedStage ? stageVisible[expandedStage] : [];
	const expandedHasIssues = expandedStage
		? stageData[expandedStage].count > 0
		: false;
	const expandedHasLocked =
		expandedStage && stageData[expandedStage].hasLockedOnly;
	const expandedLockedCount = expandedStage
		? stageData[expandedStage].count - expandedItems.length
		: 0;
	const expandedClasses = expandedHasIssues ? ISSUE_CLASSES : CLEAN_CLASSES;

	return (
		<div>
			{/* Section subtitle — anchors what the buyer is looking at
			    before they read the chart. Single sentence, neutral,
			    typographic. */}
			<p className="mb-4 max-w-md text-[13px] leading-relaxed text-content-muted sm:text-[14px]">
				{t("subtitle")}
			</p>

			{/* ─────────────── Desktop layout: chevron-divided flex row ───────────── */}
			{/* The funnel metaphor reads left-to-right with chevrons
			    between stages — flow visible at a glance. Sized down
			    to fit 5 stages within the section width. Hidden on
			    mobile (gets the carousel below instead). */}
			<div className="hidden items-stretch gap-1.5 sm:flex">
				{STAGE_IDS.map((id, i) => {
					const data = stageData[id];
					const isExpanded = expandedStage === id;
					const isClickable = data.count > 0;
					const hasIssues = data.count > 0;
					const Icon = STAGE_ICONS[id];

					return (
						<div key={id} className="flex min-w-0 flex-1 items-center">
							{i > 0 && (
								<svg
									className="mx-0.5 h-3 w-3 shrink-0 text-content-faint"
									viewBox="0 0 8 8"
									fill="none"
									aria-hidden
								>
									<path
										d="M2 1l4 3-4 3"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}

							<button
								type="button"
								disabled={!isClickable}
								onClick={() =>
									setExpandedStage(isExpanded ? null : id)
								}
								// Neutral editorial surface, identical tonal
								// language to the mobile carousel cards. The
								// leak signal lives in the icon-chip tint and
								// the impact number; the card chrome stays
								// calm so five issue stages don't stack as five
								// panic boxes.
								className={`min-w-0 w-full rounded-xl border border-edge bg-surface-card px-2 py-3 text-center transition-all ${
									isExpanded ? "ring-1 ring-inset ring-content/10" : ""
								} ${
									isClickable
										? "cursor-pointer hover:bg-surface-card-hover"
										: "cursor-default"
								}`}
							>
								<span
									className={`mx-auto mb-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${
										hasIssues
											? "bg-rose-500/12 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
											: "bg-surface-inset text-content-muted"
									}`}
								>
									<Icon className="h-3.5 w-3.5" strokeWidth={2} />
								</span>
								<div className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-content-muted">
									{t(`stages.${id}`)}
								</div>
								{hasIssues ? (
									<>
										<div className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl font-medium leading-none tabular-nums text-content">
											{data.count}
										</div>
										{data.impactCents > 0 ? (
											<div className="mt-1 truncate font-mono text-[10px] tabular-nums text-rose-600 dark:text-rose-300">
												{formatBRL(data.impactCents)}
											</div>
										) : (
											<div
												className="mt-1 select-none truncate font-mono text-[10px] tabular-nums text-rose-600 blur-[3px] dark:text-rose-300"
												aria-hidden
											>
												R$2.400
											</div>
										)}
									</>
								) : (
									<div className="mt-1.5 text-[11px] font-medium text-content-muted">
										{t("ok")}
									</div>
								)}
							</button>
						</div>
					);
				})}
			</div>

			{/* ─────────────── Mobile layout: showcase carousel ────────────────── */}
			{/* 5 funnel stages presented as a snap-scrolling gallery
			    of "showcase cards". Each card claims ~78% of viewport
			    width so the next one peeks at the edge as an
			    affordance for swipe, and snap-x snap-mandatory locks
			    each card to center after release. Bleeds out of the
			    section's px-4 via -mx-4 + matching px so the peek
			    runs to the actual viewport edge rather than dying
			    behind padding. Inside each card we get real room
			    to use the editorial type system: full label, big
			    Fraunces count, full BRL impact — none of the
			    truncation pain from the desktop-shrunk version. */}
			<div className="sm:hidden">
				<div
					ref={carouselRef}
					className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					{STAGE_IDS.map((id, i) => {
						const data = stageData[id];
						const isExpanded = expandedStage === id;
						const isClickable = data.count > 0;
						const hasIssues = data.count > 0;
						const Icon = STAGE_ICONS[id];

						// Wrapper holds the "N/5" position counter ABOVE
						// the card (not inside it — inside it stacked with
						// the icon + label, it read like a credit card) and
						// the card itself. The wrapper is the snap target
						// so the counter + card travel as one unit.
						return (
							<div
								key={id}
								className="flex w-[78%] shrink-0 snap-center flex-col gap-2"
							>
								{/* Out-of-card position counter — small tag
								    sitting just above the top edge of its
								    card. Right-aligned to mirror the place
								    it used to occupy inside. */}
								<span className="self-end pr-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] tabular-nums text-content-faint">
									{i + 1}/{STAGE_IDS.length}
								</span>

								<button
									type="button"
									disabled={!isClickable}
									data-stage-card
									data-index={i}
									onClick={() =>
										setExpandedStage(isExpanded ? null : id)
									}
									// Neutral editorial surface; leak signal
									// only in the icon chip + impact mono.
									className={`relative flex w-full flex-col gap-4 rounded-2xl border-2 border-black bg-surface-card px-5 py-5 text-left shadow-sm transition-all ${
										isExpanded ? "ring-1 ring-inset ring-content/10" : ""
									} ${
										isClickable
											? "cursor-pointer active:scale-[0.985]"
											: "cursor-default"
									}`}
								>
									{/* Top row: icon chip + label inline.
									    Reads as one identity instead of
									    two stacked pieces. */}
									<div className="flex items-center gap-3">
										<span
											className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
												hasIssues
													? "bg-rose-500/12 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
													: "bg-surface-inset text-content-muted"
											}`}
										>
											<Icon className="h-4 w-4" strokeWidth={2} />
										</span>
										<span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-content-muted">
											{t(`stages.${id}`)}
										</span>
									</div>

									{hasIssues ? (
										<div className="flex w-full items-baseline justify-between gap-3">
											<div className="font-[family-name:var(--font-fraunces)] text-[44px] font-medium leading-none tabular-nums text-content">
												{data.count}
											</div>
											{data.impactCents > 0 ? (
												<div className="font-mono text-[13px] tabular-nums text-rose-600 dark:text-rose-300">
													{formatBRL(data.impactCents)}
												</div>
											) : (
												<div
													className="select-none font-mono text-[13px] tabular-nums text-rose-600 blur-[3px] dark:text-rose-300"
													aria-hidden
												>
													R$2.400
												</div>
											)}
										</div>
									) : (
										<div className="text-[14px] font-medium text-content-muted">
											{t("ok")}
										</div>
									)}
								</button>
							</div>
						);
					})}
				</div>

				{/* Dot indicators — drift with the snapped card so the
				    visitor always knows their position in the 5-stage
				    sequence even when the swipe momentum hides peek
				    cards momentarily. */}
				<div className="mt-2 flex items-center justify-center gap-1.5">
					{STAGE_IDS.map((id, i) => (
						<span
							key={id}
							className={`h-1 rounded-full transition-all ${
								i === snappedIndex
									? "w-6 bg-content"
									: "w-1 bg-content-faint/60"
							}`}
							aria-hidden
						/>
					))}
				</div>
			</div>

			{/* Description strip — anchored to the selected stage, swaps
			    when the buyer clicks a different one. When no stage is
			    selected, prompts a tap. Animates a tiny y-translate +
			    fade so the swap feels like the same surface rotating. */}
			<div className="mt-3 min-h-[36px]">
				<AnimatePresence mode="wait">
					<motion.div
						key={expandedStage ?? "default"}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
						className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] leading-relaxed"
					>
						{expandedStage ? (
							<>
								<span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-content">
									{t(`stages.${expandedStage}`)}
								</span>
								<span className="text-content-muted">
									{t(`stages_desc.${expandedStage}`)}
								</span>
							</>
						) : (
							<span className="text-content-muted">
								{t("hint_default")}
							</span>
						)}
					</motion.div>
				</AnimatePresence>
			</div>

			{/* Expanded stage detail */}
			{expandedStage && (expandedItems.length > 0 || expandedHasLocked) && (
				<div
					className={`mt-3 rounded-xl border p-4 ${expandedClasses.container}`}
				>
					{/* Stage label moved to the description strip above; the
					    detail header now just shows the counts so it doesn't
					    repeat the eyebrow. */}
					<div className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-muted">
						{t("findings_count", {
							visible: expandedItems.length,
							locked: expandedLockedCount,
						})}
					</div>
					<div className="space-y-1.5">
						{expandedItems.map((f) => (
							<div
								key={f.id}
								className="flex items-center gap-3 rounded-lg border border-edge bg-surface-card px-3 py-2 text-left"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-xs text-content">
										{f.title}
									</div>
								</div>
								{f.impact?.max_brl_cents ? (
									<span className="shrink-0 font-mono text-[10px] tabular-nums text-rose-600 dark:text-rose-300">
										{formatBRL(f.impact.max_brl_cents)}
									</span>
								) : null}
							</div>
						))}
						{expandedHasLocked && (
							<button
								type="button"
								onClick={onUnlock}
								className="flex w-full items-center gap-3 rounded-lg border border-edge bg-surface-card px-3 py-2 text-left transition-colors hover:border-content/30"
							>
								<div
									className="min-w-0 flex-1 select-none truncate text-xs text-content blur-[5px]"
									aria-hidden
								>
									Vazamento bloqueado neste estágio
								</div>
								<span
									className="shrink-0 select-none font-mono text-[10px] tabular-nums text-content-muted blur-[4px]"
									aria-hidden
								>
									R$3.400
								</span>
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
