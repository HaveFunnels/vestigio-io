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
import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
	MiniFinding,
	BlurredFinding,
	MiniFindingCategory,
} from "../../../workers/ingestion/mini-audit-findings";
import { formatBRL } from "../../../packages/impact/mini-impact";

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

// Same palette as console FunnelIntegrityMap. Conversion stays cyan
// when clean and flips red when issues land there.
const STAGE_COLORS: Record<
	StageId,
	{
		bg: string;
		text: string;
		border: string;
		activeBg: string;
		negativeText: string;
		negativeBg: string;
		negativeBorder: string;
	}
> = {
	awareness: {
		bg: "bg-blue-500/10",
		text: "text-blue-400",
		border: "border-blue-500/30",
		activeBg: "bg-blue-500/15",
		negativeText: "text-blue-300",
		negativeBg: "bg-blue-500/15",
		negativeBorder: "border-blue-500/40",
	},
	consideration: {
		bg: "bg-violet-500/10",
		text: "text-violet-400",
		border: "border-violet-500/30",
		activeBg: "bg-violet-500/15",
		negativeText: "text-violet-300",
		negativeBg: "bg-violet-500/15",
		negativeBorder: "border-violet-500/40",
	},
	decision: {
		bg: "bg-amber-500/10",
		text: "text-amber-400",
		border: "border-amber-500/30",
		activeBg: "bg-amber-500/15",
		negativeText: "text-amber-300",
		negativeBg: "bg-amber-500/15",
		negativeBorder: "border-amber-500/40",
	},
	conversion: {
		bg: "bg-cyan-500/10",
		text: "text-cyan-400",
		border: "border-cyan-500/30",
		activeBg: "bg-cyan-500/15",
		negativeText: "text-red-400",
		negativeBg: "bg-red-500/10",
		negativeBorder: "border-red-500/30",
	},
	post_conversion: {
		bg: "bg-emerald-500/10",
		text: "text-emerald-400",
		border: "border-emerald-500/30",
		activeBg: "bg-emerald-500/15",
		negativeText: "text-emerald-300",
		negativeBg: "bg-emerald-500/15",
		negativeBorder: "border-emerald-500/40",
	},
};

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
		// No impact data on blurred — flag for the blurred-R$ display
		if (stageData[stage].impactCents === 0) {
			stageData[stage].hasLockedOnly = true;
		}
	}

	const expandedItems = expandedStage ? stageVisible[expandedStage] : [];
	const expandedColors = expandedStage ? STAGE_COLORS[expandedStage] : null;
	const expandedHasLocked =
		expandedStage && stageData[expandedStage].hasLockedOnly;
	const expandedLockedCount = expandedStage
		? stageData[expandedStage].count - expandedItems.length
		: 0;

	return (
		<div>
			{/* Stage card row — horizontal funnel */}
			<div className="flex items-stretch gap-1">
				{STAGE_IDS.map((id, i) => {
					const data = stageData[id];
					const colors = STAGE_COLORS[id];
					const isExpanded = expandedStage === id;
					const isClickable = data.count > 0;
					const hasIssues = data.count > 0;

					return (
						<div key={id} className="flex flex-1 items-center">
							{i > 0 && (
								<svg
									className="mx-0.5 h-3 w-3 shrink-0 text-content-faint/50"
									viewBox="0 0 8 8"
									fill="none"
									aria-hidden
								>
									<path
										d="M2 1l4 3-4 3"
										stroke="currentColor"
										strokeWidth="1"
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
								className={`w-full rounded-lg border px-2 py-3 text-center transition-all ${
									isExpanded
										? `${
												hasIssues
													? colors.negativeBg
													: colors.activeBg
											} ${
												hasIssues
													? colors.negativeBorder
													: colors.border
											} ring-1 ring-inset ring-white/5`
										: `${
												hasIssues
													? colors.negativeBg
													: colors.bg
											} ${
												hasIssues
													? colors.negativeBorder
													: "border-edge/30"
											}`
								} ${
									isClickable
										? "cursor-pointer hover:border-white/10"
										: "cursor-default"
								}`}
							>
								<div className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
									{t(`stages.${id}`)}
								</div>
								{hasIssues ? (
									<>
										<div
											className={`mt-1.5 text-base font-bold ${colors.negativeText}`}
										>
											{data.count}
										</div>
										{data.impactCents > 0 ? (
											<div className="font-mono text-[10px] text-content-muted">
												↓ {formatBRL(data.impactCents)}/mês
											</div>
										) : (
											<div
												className="select-none font-mono text-[10px] text-content-muted blur-[3px]"
												aria-hidden
											>
												↓ R$ 2.400/mês
											</div>
										)}
									</>
								) : (
									<div className="mt-1.5 text-xs font-medium text-emerald-400">
										{t("ok")}
									</div>
								)}
							</button>
						</div>
					);
				})}
			</div>

			{/* Expanded stage detail */}
			{expandedStage && (expandedItems.length > 0 || expandedHasLocked) && expandedColors && (
				<div
					className={`mt-3 rounded-lg border ${expandedColors.negativeBorder} ${expandedColors.negativeBg} p-3`}
				>
					<div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-content-muted">
						{t(`stages.${expandedStage}`)} —{" "}
						{t("findings_count", {
							visible: expandedItems.length,
							locked: expandedLockedCount,
						})}
					</div>
					<div className="space-y-1.5">
						{expandedItems.map((f) => (
							<div
								key={f.id}
								className="flex items-center gap-3 rounded-md bg-surface-card/60 px-3 py-2 text-left"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-xs text-content-secondary">
										{f.title}
									</div>
								</div>
								{f.impact?.max_brl_cents ? (
									<span className="shrink-0 font-mono text-[10px] text-content-muted">
										↓ {formatBRL(f.impact.max_brl_cents)}/mês
									</span>
								) : null}
							</div>
						))}
						{expandedHasLocked && (
							<button
								type="button"
								onClick={onUnlock}
								className="flex w-full items-center gap-3 rounded-md bg-surface-card/40 px-3 py-2 text-left transition-colors hover:bg-surface-card/70"
							>
								<div
									className="min-w-0 flex-1 select-none truncate text-xs text-content-secondary blur-[5px]"
									aria-hidden
								>
									Vazamento bloqueado neste estágio
								</div>
								<span
									className="shrink-0 select-none font-mono text-[10px] text-content-muted blur-[4px]"
									aria-hidden
								>
									↓ R$ 3.400/mês
								</span>
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
