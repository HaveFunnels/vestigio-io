"use client";

// ──────────────────────────────────────────────
// FirstAuditProgress  (Wave 3.18A + 3.18B)
//
// Rich narrative progress feed shown on the dashboard during the
// user's very first audit cycle. Replaces the minimal page-count
// banner with a multi-stage timeline that conveys value while the
// crawl runs, plus a heuristic preview briefing based on the
// business type collected during onboarding.
//
// Detection: the component fetches /api/cycles/latest to find a
// running/pending cycle, then checks how many completed cycles exist
// for this environment. If completedCount === 0 AND there's an
// active cycle, the full first-audit experience renders.
//
// SSE: subscribes to /api/cycles/[id]/stream for live progress data
// (same stream as CycleProgressBanner).
//
// On completion it calls `onComplete` so the parent (DashboardShell)
// can trigger the celebration overlay + transition.
// ──────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
	GlobeIcon as Globe,
	TagIcon as Tag,
	ShieldCheckIcon as ShieldCheck,
	SparkleIcon as Sparkle,
	ChartLineUpIcon as ChartLineUp,
} from "@phosphor-icons/react/dist/ssr";

// ── Types ──

interface CycleSnapshot {
	status: string;
	cycleType: string;
	pagesDiscovered: number;
	findingsCount: number;
	durationMs: number;
}

export interface FirstAuditCompletePayload {
	findingsCount: number;
	pagesDiscovered: number;
}

interface FirstAuditProgressProps {
	onComplete?: (payload: FirstAuditCompletePayload) => void;
}

// ── Stage definitions ──

type StageId = "discover" | "classify" | "analyze" | "enrich" | "compute";

interface Stage {
	id: StageId;
	icon: React.ComponentType<{ size?: number; weight?: string; className?: string }>;
}

const STAGES: Stage[] = [
	{ id: "discover", icon: Globe },
	{ id: "classify", icon: Tag },
	{ id: "analyze", icon: ShieldCheck },
	{ id: "enrich", icon: Sparkle },
	{ id: "compute", icon: ChartLineUp },
];

// Map stage → rough heuristic for progression based on pages/findings.
// We advance stages based on a combination of page count and finding count
// to give the illusion of meaningful phases even though the underlying
// crawl doesn't emit phase tags.
function deriveActiveStage(snap: CycleSnapshot | null): number {
	if (!snap) return 0;
	const { pagesDiscovered, findingsCount, status } = snap;
	if (status === "complete" || status === "failed") return STAGES.length;
	if (findingsCount > 5) return 4; // compute
	if (findingsCount > 0) return 3; // enrich
	if (pagesDiscovered > 5) return 2; // analyze
	if (pagesDiscovered > 0) return 1; // classify
	return 0; // discover
}

// ── Heuristic preview bullets by business model ──

const BUSINESS_MODEL_KEYS: Record<string, string[]> = {
	ecommerce: [
		"checkout_trust",
		"payment_security",
		"product_page_quality",
		"cart_abandonment",
		"mobile_checkout",
	],
	saas: [
		"pricing_framing",
		"trial_barriers",
		"trust_signals",
		"onboarding_friction",
		"security_posture",
	],
	lead_gen: [
		"form_friction",
		"cta_clarity",
		"social_proof",
		"mobile_responsiveness",
		"trust_indicators",
	],
	hybrid: [
		"checkout_trust",
		"pricing_framing",
		"trust_signals",
		"mobile_responsiveness",
		"security_posture",
	],
};

// ── Component ──

export default function FirstAuditProgress({ onComplete }: FirstAuditProgressProps) {
	const t = useTranslations("console.first_audit");

	const [cycleId, setCycleId] = useState<string | null>(null);
	const [snap, setSnap] = useState<CycleSnapshot | null>(null);
	const [businessModel, setBusinessModel] = useState<string | null>(null);
	const [isFirstAudit, setIsFirstAudit] = useState<boolean | null>(null);
	const [completed, setCompleted] = useState(false);

	const completeCalled = useRef(false);

	// ── Step 1: Discover if there's a running cycle + check if first audit ──
	useEffect(() => {
		let cancelled = false;

		async function discover() {
			try {
				// Fetch latest running/pending cycle
				const cycleRes = await fetch("/api/cycles/latest?status=running,pending");
				if (!cycleRes.ok) {
					setIsFirstAudit(false);
					return;
				}
				const cycleData = await cycleRes.json();
				if (!cycleData?.cycle?.id) {
					setIsFirstAudit(false);
					return;
				}

				if (cancelled) return;
				setCycleId(cycleData.cycle.id);

				// Check completed cycle count to determine if this is the first audit.
				// If there are no completed cycles, this is the first audit.
				const completedRes = await fetch("/api/cycles/latest?status=complete");
				if (cancelled) return;

				if (completedRes.ok) {
					const completedData = await completedRes.json();
					// If there's no completed cycle, this is the first audit
					setIsFirstAudit(!completedData?.cycle?.id);
				} else {
					setIsFirstAudit(true);
				}

				// Fetch business model for preview section
				const orgRes = await fetch("/api/organization");
				if (cancelled) return;
				if (orgRes.ok) {
					const orgData = await orgRes.json();
					setBusinessModel(orgData?.businessProfile?.businessModel || null);
				}
			} catch {
				setIsFirstAudit(false);
			}
		}

		discover();
		return () => { cancelled = true; };
	}, []);

	// ── Step 2: SSE subscription ──
	useEffect(() => {
		if (!cycleId || isFirstAudit !== true) return;

		const source = new EventSource(`/api/cycles/${cycleId}/stream`);

		source.addEventListener("status", (e: MessageEvent) => {
			try {
				setSnap(JSON.parse(e.data));
			} catch {
				// swallow — next event replaces
			}
		});

		source.addEventListener("complete", (e: MessageEvent) => {
			try {
				const parsed = JSON.parse(e.data);
				// Set final snap with complete status
				setSnap((prev) => prev ? { ...prev, status: parsed.status || "complete" } : null);
			} catch {
				// use existing snap
			}
			setCompleted(true);
			source.close();
		});

		source.addEventListener("error", () => {
			source.close();
		});

		return () => {
			source.close();
		};
	}, [cycleId, isFirstAudit]);

	// ── Step 3: Fire onComplete when done ──
	const handleComplete = useCallback(() => {
		if (completeCalled.current || !snap) return;
		completeCalled.current = true;
		onComplete?.({
			findingsCount: snap.findingsCount,
			pagesDiscovered: snap.pagesDiscovered,
		});
	}, [snap, onComplete]);

	useEffect(() => {
		if (completed && snap) {
			handleComplete();
		}
	}, [completed, snap, handleComplete]);

	// ── Guard: don't render if not first audit or no active cycle ──
	if (isFirstAudit !== true || !cycleId) return null;

	const activeStageIdx = completed ? STAGES.length : deriveActiveStage(snap);
	const previewKeys = BUSINESS_MODEL_KEYS[businessModel || "ecommerce"] || BUSINESS_MODEL_KEYS.ecommerce;
	const businessLabel = businessModel
		? t(`preview.business_types.${businessModel}`)
		: t("preview.business_types.ecommerce");

	return (
		<div className="mx-auto w-full max-w-2xl space-y-6">
			{/* ── Progress Timeline ── */}
			<div className="rounded-xl border border-emerald-500/20 bg-zinc-900/80 p-6 shadow-lg backdrop-blur-sm dark:bg-zinc-900/80">
				<h2 className="mb-1 text-base font-semibold text-white">
					{completed ? t("title_complete") : t("title")}
				</h2>
				{snap && (
					<p className="mb-5 text-sm text-zinc-400">
						{snap.pagesDiscovered === 1
							? t("pages_one")
							: t("pages_other", { count: snap.pagesDiscovered })}
						{" · "}
						{snap.findingsCount === 1
							? t("findings_one")
							: t("findings_other", { count: snap.findingsCount })}
						{" · "}
						{t("elapsed", { seconds: Math.round(snap.durationMs / 1000) })}
					</p>
				)}

				{/* Timeline */}
				<div className="relative space-y-0">
					{STAGES.map((stage, idx) => {
						const isDone = idx < activeStageIdx;
						const isActive = idx === activeStageIdx && !completed;
						const Icon = stage.icon;

						return (
							<div key={stage.id} className="relative flex items-start gap-4">
								{/* Vertical line connector */}
								{idx < STAGES.length - 1 && (
									<div
										className={`absolute left-[15px] top-[32px] h-[calc(100%-8px)] w-px ${
											isDone
												? "bg-emerald-500/60"
												: "bg-zinc-700"
										}`}
									/>
								)}

								{/* Dot / icon */}
								<div
									className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500 ${
										isDone
											? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
											: isActive
												? "border-emerald-500 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
												: "border-zinc-700 bg-zinc-800 text-zinc-500"
									}`}
								>
									<Icon
										size={16}
										weight={isDone || isActive ? "fill" : "regular"}
										className={isActive ? "animate-pulse" : ""}
									/>
								</div>

								{/* Label */}
								<div className="min-h-[48px] flex flex-col justify-center pb-2">
									<p
										className={`text-sm font-medium transition-colors duration-300 ${
											isDone
												? "text-emerald-400"
												: isActive
													? "text-white"
													: "text-zinc-500"
										}`}
									>
										{t(`stages.${stage.id}`)}
									</p>
									{isActive && (
										<p className="mt-0.5 text-xs text-zinc-500">
											{t("in_progress")}
										</p>
									)}
									{isDone && (
										<p className="mt-0.5 text-xs text-emerald-600">
											{t("done")}
										</p>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			{/* ── 3.18B: Heuristic Preview Briefing ── */}
			{!completed && (
				<div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-6">
					<p className="mb-3 text-sm font-medium text-zinc-400">
						{t("preview.heading", { businessType: businessLabel })}
					</p>
					<ul className="space-y-2">
						{previewKeys.map((key) => (
							<li key={key} className="flex items-start gap-2 text-sm text-zinc-500">
								<span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
								{t(`preview.bullets.${key}`)}
							</li>
						))}
					</ul>
					<p className="mt-4 text-xs italic text-zinc-600">
						{t("preview.disclaimer")}
					</p>
				</div>
			)}
		</div>
	);
}
