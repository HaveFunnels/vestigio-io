"use client";

// ──────────────────────────────────────────────
// FirstAuditCard  (Wave 22 Fase B)
//
// Replaces FirstAuditProgress. The prior component derived stages
// heuristically from pagesDiscovered + findingsCount; this one
// consumes the rich SSE stream that Camada 3 added:
//
//   event: phase     → real engine phase + Vestigio narrative
//   event: identity  → DomainFingerprint (industry/platform/locale)
//   event: finding   → individual Finding row as it lands
//   event: healing   → "we are auto-recovering this cycle"
//   event: status    → aggregate counts (pages, findings, duration)
//   event: complete  → terminal — calls onComplete
//
// Visual: one large bento card at the top of the dashboard.
// Composition:
//   ┌────────────────────────────────────────────────────────┐
//   │ HEADER: domain + Vestigio narrative + spinner          │
//   ├──────────────┬──────────────────┬──────────────────────┤
//   │ STATS        │ IDENTITY (when   │ FINDINGS (rolling,   │
//   │ pages/finds  │ DomainFingerprint│ top 5, severity tone)│
//   │ duration     │ emits)           │                      │
//   ├──────────────┴──────────────────┴──────────────────────┤
//   │ PHASE TIMELINE (9 dots) · HEALING BANNER (conditional) │
//   └────────────────────────────────────────────────────────┘
//
// On complete: dispatches `onComplete` with final counts (same
// payload shape as FirstAuditProgress) so the existing celebration
// overlay still fires.
// ──────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
	WarningCircleIcon as WarningCircle,
	LockKeyIcon as LockKey,
} from "@phosphor-icons/react/dist/ssr";
import { motion, AnimatePresence } from "framer-motion";
import SeverityBadge from "@/components/console/SeverityBadge";

// ── Types ──

export interface FirstAuditCompletePayload {
	findingsCount: number;
	pagesDiscovered: number;
}

interface CycleSnapshot {
	status: string;
	cycleType: string;
	pagesDiscovered: number;
	findingsCount: number;
	durationMs: number;
	currentPhase: string | null;
	phaseUpdatedAt: string | null;
	healing: { reason: string; sinceMs: number } | null;
}

interface IdentityPayload {
	industry: string | null;
	industryConfidence: number | null;
	primaryLocale: string | null;
	detectedPlatforms: string[];
	aiBotPolicy: unknown;
}

interface FindingPreview {
	id: string;
	inferenceKey: string;
	title: string;
	severity: string;
	surface: string;
	impactMidpoint: number;
}

interface PhaseEvent {
	phase: string;
	at: string | null;
}

interface HealingPayload {
	reason: string;
	sinceMs: number;
}

interface FirstAuditCardProps {
	onComplete?: (payload: FirstAuditCompletePayload) => void;
}

// All 14 phases the audit emits, in order. Five from the staged
// pipeline (bootstrap → enrichment, ~14min) + nine from the engine
// recompute (~30-60s). Powering both the dot timeline AND the
// completion-percentage heuristic for the in-flight state.
const PIPELINE_PHASES = [
	"pipeline_bootstrap",
	"pipeline_first_value",
	"pipeline_crawl",
	"pipeline_headless",
	"pipeline_enrichment",
];
const ENGINE_PHASES = [
	"evidence_quality_and_integration",
	"graph_and_signals",
	"core_inferences",
	"per_pack_decisions",
	"behavioral_packs",
	"cross_domain_compound_inferences",
	"suppression_penalties",
	"intelligence_layer",
	"final_assembly",
];

function fmtCurrencyShort(n: number, currency: string): string {
	const symbol = currency === "BRL" ? "R$" : currency === "EUR" ? "€" : "$";
	if (n >= 1_000_000) return `${symbol} ${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${symbol} ${Math.round(n / 1000)}k`;
	return `${symbol} ${Math.round(n)}`;
}

// Skeleton bar — a single shimmering pill with controlled height/width.
function SkeletonBar({
	className = "",
	height = "h-4",
	width = "w-full",
}: { className?: string; height?: string; width?: string }) {
	return (
		<div
			className={`skeleton-shimmer rounded-md ${height} ${width} ${className}`}
		/>
	);
}

// ──────────────────────────────────────────────
// Cycle discovery
//
// Show the card whenever ANY active cycle (running/pending) exists
// for the user's active env. The card auto-hides on `complete` and
// the dashboard's celebration overlay takes over. We don't try to
// classify "is this truly the first audit?" client-side anymore —
// the SSE stream gives us all the runtime info we need, and the
// active_env cookie scopes everything to the right env.
// ──────────────────────────────────────────────

interface DiscoveredCycle {
	id: string;
	status: string;
	domain: string | null;
}

async function discoverActiveCycle(): Promise<DiscoveredCycle | null> {
	try {
		const [cycleRes, usageRes] = await Promise.all([
			fetch("/api/cycles/latest?status=running,pending"),
			fetch("/api/usage").catch(() => null),
		]);
		if (!cycleRes.ok) return null;
		const cycleData = await cycleRes.json();
		if (!cycleData?.cycle?.id) return null;
		let domain: string | null = null;
		if (usageRes?.ok) {
			try {
				const usage = await usageRes.json();
				domain = usage?.domain ?? null;
			} catch {}
		}
		return {
			id: cycleData.cycle.id,
			status: cycleData.cycle.status,
			domain,
		};
	} catch {
		return null;
	}
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function FirstAuditCard({ onComplete }: FirstAuditCardProps) {
	const t = useTranslations("console.first_audit");
	const [cycle, setCycle] = useState<DiscoveredCycle | null>(null);
	const [snap, setSnap] = useState<CycleSnapshot | null>(null);
	const [phase, setPhase] = useState<PhaseEvent | null>(null);
	const [identity, setIdentity] = useState<IdentityPayload | null>(null);
	const [findings, setFindings] = useState<FindingPreview[]>([]);
	const [healing, setHealing] = useState<HealingPayload | null>(null);
	const [hidden, setHidden] = useState(false);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	// Mount: discover the cycle.
	useEffect(() => {
		let cancelled = false;
		discoverActiveCycle().then((c) => {
			if (!cancelled) setCycle(c);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	// Subscribe to SSE once we know the cycle.
	useEffect(() => {
		if (!cycle?.id) return;
		const url = `/api/cycles/${cycle.id}/stream`;
		const source = new EventSource(url);

		source.addEventListener("status", (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data) as CycleSnapshot;
				setSnap(data);
			} catch {}
		});
		source.addEventListener("phase", (ev: MessageEvent) => {
			try {
				setPhase(JSON.parse(ev.data) as PhaseEvent);
			} catch {}
		});
		source.addEventListener("identity", (ev: MessageEvent) => {
			try {
				setIdentity(JSON.parse(ev.data) as IdentityPayload);
			} catch {}
		});
		source.addEventListener("finding", (ev: MessageEvent) => {
			try {
				const f = JSON.parse(ev.data) as FindingPreview;
				setFindings((prev) => {
					// Newest first, keep last 6 (we render 5).
					const next = [f, ...prev.filter((p) => p.id !== f.id)];
					return next.slice(0, 6);
				});
			} catch {}
		});
		source.addEventListener("healing", (ev: MessageEvent) => {
			try {
				setHealing(JSON.parse(ev.data) as HealingPayload);
			} catch {}
		});
		source.addEventListener("healing_clear", () => setHealing(null));
		source.addEventListener("complete", (ev: MessageEvent) => {
			try {
				const data = JSON.parse(ev.data) as { status: string };
				// Best-effort tally from the last snapshot.
				const payload: FirstAuditCompletePayload = {
					findingsCount: snap?.findingsCount ?? 0,
					pagesDiscovered: snap?.pagesDiscovered ?? 0,
				};
				if (data.status === "complete") {
					onCompleteRef.current?.(payload);
				}
			} catch {}
			source.close();
		});
		source.addEventListener("error", () => {
			// Browser will auto-retry on its own; we don't crash the UI.
		});

		return () => {
			try {
				source.close();
			} catch {}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [cycle?.id]);

	const handleDismiss = useCallback(() => {
		setHidden(true);
	}, []);

	// Bail conditions
	if (hidden) return null;
	if (!cycle) return null;
	if (snap?.status === "complete") return null;

	// Derived skeleton state. Each block has a `ready` flag — when
	// true the real content fades in over the skeleton; when false the
	// shimmer block is shown. We never show spinners or progress bars.
	const topFinding = findings.length > 0
		? [...findings].sort(
				(a, b) => (b.impactMidpoint ?? 0) - (a.impactMidpoint ?? 0),
			)[0]
		: null;
	const totalAtRisk = findings.reduce(
		(sum, f) => sum + (f.impactMidpoint ?? 0),
		0,
	);
	const totalReady = findings.length > 0 && totalAtRisk > 0;
	const topReady = !!topFinding;
	const pagesCount = snap?.pagesDiscovered ?? 0;
	const inventoryReady = pagesCount > 0;
	// How many skeleton inventory rows to render before any URL is
	// discovered. Once `pagesCount` > 0, we mirror the count (capped).
	const inventoryRowCount = Math.max(Math.min(pagesCount, 6), 6);
	const currency = "BRL"; // best-effort default; the FirstFindingMoment
	                       // post-complete uses the org's actual currency.

	return (
		<section className="mb-6">
			{/* Hero header — wordmark feel + domain + tiny trust line.
			    No spinner; the shimmering blocks below carry the "we're
			    working" signal. */}
			<div className="mb-6 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="font-[family-name:var(--font-fraunces)] text-[22px] font-medium leading-tight text-content sm:text-[26px]">
						{cycle.domain
							? t("analyzing", { domain: cycle.domain })
							: t("analyzing_generic")}
					</h2>
					<p className="mt-1 text-[13px] text-content-muted">
						{t("subtitle_eta")}
					</p>
				</div>
				<button
					type="button"
					onClick={handleDismiss}
					className="shrink-0 rounded-md px-2 py-1 text-[11px] text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content"
				>
					{t("dismiss")}
				</button>
			</div>

			<div className="grid gap-4 md:grid-cols-12">
				{/* ── Total at risk (4 cols) ── */}
				<div className="md:col-span-4 rounded-2xl border border-edge bg-surface-card p-5">
					<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						{t("blocks.total_at_risk")}
					</p>
					<div className="mt-3 h-9">
						<AnimatePresence mode="wait">
							{totalReady ? (
								<motion.div
									key="ready"
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.35 }}
									className="font-mono text-[28px] font-semibold tabular-nums leading-none text-rose-500"
								>
									−{fmtCurrencyShort(totalAtRisk, currency)}
									<span className="ml-1 text-[12px] font-normal text-content-faint">
										{t("per_month_short")}
									</span>
								</motion.div>
							) : (
								<motion.div
									key="shimmer"
									exit={{ opacity: 0 }}
									className="flex h-full items-center"
								>
									<SkeletonBar height="h-7" width="w-32" />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				{/* ── Top finding (8 cols) ── */}
				<div className="md:col-span-8 rounded-2xl border border-edge bg-surface-card p-5">
					<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						{t("blocks.top_finding")}
					</p>
					<div className="mt-3 min-h-[72px]">
						<AnimatePresence mode="wait">
							{topReady && topFinding ? (
								<motion.div
									key="ready"
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.35 }}
									className="space-y-2"
								>
									<div className="flex items-center gap-2">
										<SeverityBadge value={topFinding.severity} />
										<span className="font-mono text-[11px] text-content-faint">
											{topFinding.surface}
										</span>
									</div>
									<div className="text-[15px] font-medium leading-snug text-content">
										{topFinding.title}
									</div>
									{topFinding.impactMidpoint > 0 && (
										<div className="font-mono text-[13px] font-semibold tabular-nums text-rose-500">
											−{fmtCurrencyShort(topFinding.impactMidpoint, currency)}
											<span className="ml-1 text-[10px] font-normal text-content-faint">
												{t("per_month_short")}
											</span>
										</div>
									)}
								</motion.div>
							) : (
								<motion.div
									key="shimmer"
									exit={{ opacity: 0 }}
									className="space-y-2.5"
								>
									<SkeletonBar height="h-3" width="w-24" />
									<SkeletonBar height="h-4" width="w-3/4" />
									<SkeletonBar height="h-3" width="w-20" />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				{/* ── Inventory rows (full width) ── */}
				<div className="md:col-span-12 rounded-2xl border border-edge bg-surface-card p-5">
					<div className="flex items-baseline justify-between">
						<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
							{t("blocks.inventory")}
						</p>
						{inventoryReady && (
							<motion.span
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								className="font-mono text-[11px] tabular-nums text-content-muted"
							>
								{t("blocks.inventory_count", { count: pagesCount })}
							</motion.span>
						)}
					</div>
					<ul className="mt-3 space-y-2">
						{Array.from({ length: inventoryRowCount }).map((_, i) => {
							const filled = i < pagesCount;
							return (
								<li
									key={i}
									className="flex items-center gap-3"
								>
									<AnimatePresence mode="wait">
										{filled ? (
											<motion.div
												key={`ready-${i}`}
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ duration: 0.3 }}
												className="flex w-full items-center gap-3"
											>
												<span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
												<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-content-secondary">
													{/* Placeholder — we don't get URL strings from the
													    SSE stream, only counts. The real list is on the
													    Inventory page once the audit completes. */}
													{t("blocks.inventory_row_filled")}
												</span>
											</motion.div>
										) : (
											<motion.div
												key={`shimmer-${i}`}
												exit={{ opacity: 0 }}
												className="flex w-full items-center gap-3"
											>
												<span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
												<SkeletonBar
													height="h-3"
													width={
														i % 3 === 0
															? "w-2/3"
															: i % 3 === 1
																? "w-4/5"
																: "w-1/2"
													}
												/>
											</motion.div>
										)}
									</AnimatePresence>
								</li>
							);
						})}
					</ul>
				</div>
			</div>

			{/* Discrete trust line */}
			<div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-content-faint">
				<LockKey size={11} weight="duotone" />
				{t("trust_line")}
			</div>

			{/* Healing banner (kept — covers the rare "stuck" case) */}
			{healing && (
				<div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
					<WarningCircle size={14} weight="duotone" className="shrink-0 text-amber-500" />
					<p className="text-xs text-amber-700 dark:text-amber-300">
						{healing.reason === "stuck_in_phase"
							? t("healing_stuck_generic")
							: t("healing_heartbeat")}
					</p>
				</div>
			)}

			{/* Failure terminal state */}
			{snap?.status === "failed" && (
				<div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2">
					<WarningCircle size={14} weight="duotone" className="shrink-0 text-red-500" />
					<p className="text-xs text-red-700 dark:text-red-300">{t("failed")}</p>
				</div>
			)}
		</section>
	);
}
