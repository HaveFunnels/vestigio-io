"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BuyerSegment } from "../types";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import { useMcpData } from "@/components/app/McpDataProvider";
import PlanSideDrawer from "../PlanSideDrawer";
import { FindingListBody } from "../drawer-bodies";
import {
	buildPlanHash,
	parsePlanHash,
	type DrawerCtx,
} from "../plan-url";

/*
 * Buyer Segments — "O que sua audit revelou este mês"
 *
 * Decomposed by who-owns-the-fix (copy / eng / leadership). Each
 * card shows count + impact midpoint + 1-2 sample finding titles.
 * This is the section where the operator decides who in their team
 * to brief; the segments come from a deterministic mapping of
 * inference key → ownership (see PLAN_MONTHLY_STRATEGY.md §3).
 */

interface Props {
	segments: BuyerSegment[];
	/** YYYY-MM. Used to build the back URL the finding-detail breadcrumb
	 *  navigates to (so the customer returns to the same plan with the
	 *  drawer reopened in the right state) AND the deep links from the
	 *  Copy / Liderança cards into their standalone pages. */
	month: string;
	/** Wave 22.8 review move 2 — Copy card footer links into the
	 *  standalone Copy Lens page when the cycle has framework audits. */
	hasCopyLensData?: boolean;
	/** Wave 22.8 review move 3 — Liderança card footer links into the
	 *  standalone Maps page when the cycle has graph data. */
	hasMapsData?: boolean;
}

const BUYER_LABEL_FALLBACK: Record<string, string> = {
	copy: "Copy",
	eng: "Engenharia",
	leadership: "Liderança",
};

const BUYER_ACCENT: Record<string, { dot: string; bg: string; chip: string }> = {
	copy: {
		dot: "bg-amber-400",
		bg: "from-amber-500/[0.06] to-transparent",
		chip: "bg-amber-500/10 text-amber-200/90 ring-amber-500/20",
	},
	eng: {
		dot: "bg-sky-400",
		bg: "from-sky-500/[0.06] to-transparent",
		chip: "bg-sky-500/10 text-sky-200/90 ring-sky-500/20",
	},
	leadership: {
		dot: "bg-violet-400",
		bg: "from-violet-500/[0.06] to-transparent",
		chip: "bg-violet-500/10 text-violet-200/90 ring-violet-500/20",
	},
};

export default function BuyerSegments({
	segments,
	month,
	hasCopyLensData = false,
	hasMapsData = false,
}: Props) {
	const { currency } = useMcpData();
	// One drawer instance covers two trigger paths:
	//   - sample finding title click → single inferenceKey
	//   - "X findings" count badge click → segment's full id list
	// Both write into the same state holder so the drawer always
	// reflects the latest interaction.
	const [drawerState, setDrawerState] = useState<
		| { kind: "single"; findingKey: string }
		| { kind: "segment"; segment: BuyerSegment }
		| null
	>(null);
	// Hash-driven default expansion for the segment drawer. When the
	// customer lands here from a finding-detail breadcrumb, the URL
	// carries `#drawer=segment.<buyer>&expand=<inferenceKey>` and we
	// open the matching drawer + pre-expand the right card.
	const [defaultExpandedKey, setDefaultExpandedKey] = useState<string | null>(null);

	// On mount + on popstate, reconcile hash → drawer state. Only handle
	// segment/single ctxs here; step.* ctxs belong to NextSteps.
	useEffect(() => {
		function syncFromHash() {
			if (typeof window === "undefined") return;
			const parsed = parsePlanHash(window.location.hash);
			if (!parsed.ctx) {
				setDrawerState(null);
				setDefaultExpandedKey(null);
				return;
			}
			if (parsed.ctx.kind === "segment") {
				const buyerKind = parsed.ctx.buyer;
				const match = segments.find((s) => s.buyer === buyerKind);
				if (match) {
					setDrawerState({ kind: "segment", segment: match });
					setDefaultExpandedKey(parsed.expand);
				}
			} else if (parsed.ctx.kind === "single") {
				setDrawerState({ kind: "single", findingKey: parsed.ctx.inferenceKey });
				setDefaultExpandedKey(parsed.ctx.inferenceKey);
			}
		}
		syncFromHash();
		window.addEventListener("popstate", syncFromHash);
		window.addEventListener("hashchange", syncFromHash);
		return () => {
			window.removeEventListener("popstate", syncFromHash);
			window.removeEventListener("hashchange", syncFromHash);
		};
	}, [segments]);

	// Write hash when drawer opens or expansion changes. We use
	// replaceState (not pushState) so back-button still navigates
	// away from the plan instead of cycling through drawer states.
	function writeHash(ctx: DrawerCtx | null, expand: string | null) {
		if (typeof window === "undefined") return;
		const newHash = buildPlanHash(ctx, expand);
		const url = `${window.location.pathname}${window.location.search}${newHash}`;
		window.history.replaceState(null, "", url);
	}

	function openSegment(segment: BuyerSegment) {
		setDrawerState({ kind: "segment", segment });
		setDefaultExpandedKey(null);
		writeHash({ kind: "segment", buyer: segment.buyer }, null);
	}

	function openSingle(findingKey: string) {
		setDrawerState({ kind: "single", findingKey });
		setDefaultExpandedKey(findingKey);
		writeHash({ kind: "single", inferenceKey: findingKey }, null);
	}

	function closeDrawer() {
		setDrawerState(null);
		setDefaultExpandedKey(null);
		writeHash(null, null);
	}

	// Build the back URL the FindingListBody hands to its cards. The
	// expand slot is the card's own inferenceKey (closure inside the
	// card), so we hand the parent context here and the card fills in.
	function returnCtx(): DrawerCtx | null {
		if (drawerState?.kind === "segment") {
			return { kind: "segment", buyer: drawerState.segment.buyer };
		}
		if (drawerState?.kind === "single") {
			return { kind: "single", inferenceKey: drawerState.findingKey };
		}
		return null;
	}

	const ctx = returnCtx();
	const returnLabel =
		drawerState?.kind === "segment"
			? `Plano · ${BUYER_LABEL_FALLBACK[drawerState.segment.buyer] ?? drawerState.segment.buyer}`
			: drawerState?.kind === "single"
				? "Plano · problema em destaque"
				: "Plano";

	return (
		<motion.section
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-10%" }}
			transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
			className="mb-12"
		>
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-serif text-[20px] font-medium tracking-tight text-content">
					O que sua audit revelou este mês
				</h2>
				<div className="text-[11px] text-content-faint">
					Agrupado por quem precisa atuar
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				{segments.map((s, idx) => {
					const accent = BUYER_ACCENT[s.buyer] ?? BUYER_ACCENT.eng;
					return (
						<motion.div
							key={s.buyer}
							data-vsgp-card
							initial={{ opacity: 0, y: 12 }}
							whileInView={{ opacity: 1, y: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.45, delay: 0.1 + idx * 0.06, ease: [0.22, 1, 0.36, 1] }}
							whileHover={{ y: -2 }}
							className={`group relative flex min-h-[200px] flex-col overflow-hidden rounded-2xl border border-edge bg-gradient-to-b ${accent.bg} bg-surface-card p-5 transition-colors hover:border-edge-focus sm:p-6`}
						>
							<div className="mb-1 flex items-center gap-2">
								<span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
								<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									{s.buyer === "copy" ? "Copy" : s.buyer === "eng" ? "Engenharia" : "Liderança"}
								</div>
							</div>

							<div className="text-[15px] font-semibold text-content">
								{s.buyerLabel}
							</div>
							{/* The count is clickable when the segment carries
							    its full id list — opens the drawer with every
							    finding in that segment so the buyer can review
							    "everything for the copy team", etc. Pre-Phase-2
							    plans without allFindingIds fall back to plain
							    text so legacy plans still render. */}
							{s.allFindingIds && s.allFindingIds.length > 0 ? (
								<button
									type="button"
									onClick={() => openSegment(s)}
									className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-content-muted underline-offset-2 transition-colors hover:text-content hover:underline"
									title="Ver todos os problemas desse segmento"
								>
									{s.count} {s.count === 1 ? "problema" : "problemas"} →
								</button>
							) : (
								<div className="mt-0.5 text-[12px] text-content-muted">
									{s.count} {s.count === 1 ? "problema" : "problemas"}
								</div>
							)}

							<div className="mt-4 font-mono text-[22px] font-semibold tabular-nums text-content">
								{fmtCurrencyUnits(s.impactMidpoint, currency)}
								<span className="ml-1 text-[12px] font-normal text-content-faint">
									/ mês
								</span>
							</div>
							<div className="mt-0.5 font-mono text-[10px] tabular-nums text-content-faint">
								faixa {fmtCurrencyUnits(s.impactMin, currency)} — {fmtCurrencyUnits(s.impactMax, currency)}
							</div>

							<div className="mt-4 flex-1 space-y-1.5 border-t border-edge/40 pt-3">
								<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
									Onde aparece
								</div>
								{s.sampleFindingTitles.slice(0, 2).map((title, i) => {
									const findingKey = s.sampleFindingIds[i];
									// Without a key we can't open the drawer, so
									// render as plain text (legacy plans + edge
									// cases where the engine didn't bind a key).
									if (!findingKey) {
										return (
											<div
												key={i}
												className="text-[13px] leading-snug text-content-secondary"
											>
												· {title}
											</div>
										);
									}
									return (
										<button
											key={i}
											type="button"
											onClick={() => openSingle(findingKey)}
											className="-mx-1.5 block w-full rounded-md px-1.5 py-1 text-left text-[13px] leading-snug text-content-secondary transition-colors hover:bg-surface-card-hover hover:text-content"
											title="Ver detalhes do problema"
										>
											· {title}
										</button>
									);
								})}
							</div>

							{/* Wave 22.8 review — per-segment footer deep
							    link into the cross-feature standalone page
							    that matches who owns it. Copy team gets
							    Copy Lens framework analysis. Liderança
							    team gets the surface graph view. Only
							    renders when the underlying data exists
							    this cycle so we never deep-link into an
							    empty page. */}
							{s.buyer === "copy" && hasCopyLensData && (
								<Link
									href={`/app/library/strategy/${encodeURIComponent(month)}/copy-lens`}
									className="mt-3 inline-flex items-center gap-1 self-start border-t border-edge/40 pt-3 text-[11.5px] font-medium text-content-secondary underline-offset-2 transition-colors hover:text-content hover:underline"
								>
									Ver lente de framework de copy
									<ArrowRight className="h-3 w-3" />
								</Link>
							)}
							{s.buyer === "leadership" && hasMapsData && (
								<Link
									href={`/app/library/strategy/${encodeURIComponent(month)}/maps`}
									className="mt-3 inline-flex items-center gap-1 self-start border-t border-edge/40 pt-3 text-[11.5px] font-medium text-content-secondary underline-offset-2 transition-colors hover:text-content hover:underline"
								>
									Ver mapa do mês
									<ArrowRight className="h-3 w-3" />
								</Link>
							)}
						</motion.div>
					);
				})}
			</div>

			{/* Shared drawer — handles both single-sample and full-
			    segment drill-downs. The header copy changes per mode so
			    the buyer knows whether they're reading 1 finding or
			    every finding in the team's queue. */}
			<PlanSideDrawer
				open={drawerState !== null}
				onOpenChange={(open) => { if (!open) closeDrawer(); }}
				eyebrow={
					drawerState?.kind === "segment"
						? `Problemas ${drawerState.segment.buyerLabel}`
						: "Problema em destaque"
				}
				title={
					drawerState?.kind === "segment"
						? `${drawerState.segment.count} ${drawerState.segment.count === 1 ? "problema" : "problemas"} para o time`
						: "Detalhe do problema"
				}
				description={
					drawerState?.kind === "segment"
						? "Encontrados no ciclo atual, agrupados pelo time que tipicamente resolve."
						: "Encontrado no ciclo atual"
				}
			>
				{drawerState?.kind === "single" && (
					<FindingListBody
						findingIds={[drawerState.findingKey]}
						month={month}
						parentCtx={ctx}
						returnLabel={returnLabel}
						defaultExpandedKey={defaultExpandedKey}
						onExpandedChange={(key) => {
							setDefaultExpandedKey(key);
							writeHash(ctx, key);
						}}
					/>
				)}
				{drawerState?.kind === "segment" && (
					<FindingListBody
						findingIds={drawerState.segment.allFindingIds ?? []}
						month={month}
						parentCtx={ctx}
						returnLabel={returnLabel}
						defaultExpandedKey={defaultExpandedKey}
						onExpandedChange={(key) => {
							setDefaultExpandedKey(key);
							writeHash(ctx, key);
						}}
					/>
				)}
			</PlanSideDrawer>
		</motion.section>
	);
}
