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
	GlobeHemisphereWestIcon as Globe,
	StorefrontIcon as Storefront,
	TranslateIcon as Translate,
	SparkleIcon as Sparkle,
	WarningCircleIcon as WarningCircle,
	CircleNotchIcon as Spinner,
	CheckCircleIcon as CheckCircle,
} from "@phosphor-icons/react/dist/ssr";

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
const PHASES_IN_ORDER = [...PIPELINE_PHASES, ...ENGINE_PHASES];

function severityDot(severity: string): string {
	switch (severity) {
		case "critical":
			return "bg-red-500";
		case "high":
			return "bg-orange-500";
		case "medium":
			return "bg-amber-500";
		case "low":
			return "bg-blue-500";
		default:
			return "bg-content-faint";
	}
}

function formatDuration(ms: number): string {
	if (ms <= 0) return "0s";
	const totalSec = Math.floor(ms / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return `${min}m ${sec}s`;
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

	const currentPhaseName = phase?.phase || snap?.currentPhase || null;
	const currentPhaseIdx = currentPhaseName
		? PHASES_IN_ORDER.indexOf(currentPhaseName)
		: -1;

	// Wave 22 Fase B+ — phase narrative is now i18n-resolved client-side.
	// The SSE event ships just the phase KEY; the dictionary owns the
	// localized phrase. Missing keys fall back to the raw key string so
	// a new phase added on the server but not yet in the dictionary still
	// renders something (instead of empty header).
	const phaseNarrative = (key: string | null): string => {
		if (!key) return t("starting");
		const i18nKey = `phase_narrative.${key}`;
		try {
			if (t.has(i18nKey)) return t(i18nKey);
		} catch {}
		return key;
	};
	const headerLabel = phaseNarrative(currentPhaseName);

	return (
		<section className="mb-6 rounded-2xl border border-edge bg-surface-card p-5 shadow-sm">
			{/* Header */}
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15">
						{snap?.status === "failed" ? (
							<WarningCircle size={18} weight="duotone" className="text-red-500" />
						) : snap?.status === "complete" ? (
							<CheckCircle size={18} weight="duotone" className="text-accent-text" />
						) : (
							<Spinner size={18} weight="bold" className="animate-spin text-accent-text" />
						)}
					</div>
					<div className="min-w-0">
						<h2 className="truncate text-base font-semibold text-content">
							{cycle.domain ? t("analyzing", { domain: cycle.domain }) : t("analyzing_generic")}
						</h2>
						<p className="truncate text-xs text-content-muted">{headerLabel}</p>
					</div>
				</div>
				<button
					type="button"
					onClick={handleDismiss}
					className="rounded-md px-2 py-1 text-[11px] text-content-muted transition-colors hover:bg-surface-card-hover hover:text-content"
				>
					{t("dismiss")}
				</button>
			</div>

			{/* Body grid */}
			<div className="mt-5 grid gap-4 md:grid-cols-3">
				{/* Stats */}
				<div className="rounded-xl border border-edge bg-surface-inset px-4 py-3">
					<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						{t("progress")}
					</p>
					<dl className="mt-2 space-y-1.5">
						<div className="flex items-center justify-between text-sm">
							<dt className="text-content-muted">{t("pages")}</dt>
							<dd className="font-mono tabular-nums text-content">{snap?.pagesDiscovered ?? 0}</dd>
						</div>
						<div className="flex items-center justify-between text-sm">
							<dt className="text-content-muted">{t("findings")}</dt>
							<dd className="font-mono tabular-nums text-content">{snap?.findingsCount ?? 0}</dd>
						</div>
						<div className="flex items-center justify-between text-sm">
							<dt className="text-content-muted">{t("elapsed_label")}</dt>
							<dd className="font-mono tabular-nums text-content">
								{formatDuration(snap?.durationMs ?? 0)}
							</dd>
						</div>
					</dl>
				</div>

				{/* Identity */}
				<div className="rounded-xl border border-edge bg-surface-inset px-4 py-3">
					<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						{t("identity")}
					</p>
					{identity ? (
						<dl className="mt-2 space-y-1.5 text-sm">
							{identity.industry && (
								<div className="flex items-start gap-2">
									<Storefront size={14} weight="duotone" className="mt-0.5 shrink-0 text-content-muted" />
									<div className="min-w-0">
										<p className="truncate text-content">{identity.industry}</p>
										{identity.industryConfidence != null && (
											<p className="text-[10px] text-content-faint">
												{t("conf", { value: identity.industryConfidence })}
											</p>
										)}
									</div>
								</div>
							)}
							{identity.detectedPlatforms.length > 0 && (
								<div className="flex items-start gap-2">
									<Sparkle size={14} weight="duotone" className="mt-0.5 shrink-0 text-content-muted" />
									<p className="min-w-0 truncate text-content-secondary">
										{identity.detectedPlatforms.slice(0, 3).join(" · ")}
									</p>
								</div>
							)}
							{identity.primaryLocale && (
								<div className="flex items-center gap-2">
									<Translate size={14} weight="duotone" className="shrink-0 text-content-muted" />
									<p className="text-content-secondary">{identity.primaryLocale}</p>
								</div>
							)}
						</dl>
					) : (
						<p className="mt-2 text-sm text-content-faint">{t("identity_pending")}</p>
					)}
				</div>

				{/* Findings rolling */}
				<div className="rounded-xl border border-edge bg-surface-inset px-4 py-3">
					<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						{t("findings_live")}
					</p>
					{findings.length === 0 ? (
						<p className="mt-2 text-sm text-content-faint">{t("findings_pending")}</p>
					) : (
						<ul className="mt-2 space-y-1.5">
							{findings.slice(0, 5).map((f) => (
								<li key={f.id} className="flex items-start gap-2">
									<span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityDot(f.severity)}`} />
									<span className="min-w-0 flex-1 truncate text-xs text-content-secondary">
										{f.title}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			{/* Phase timeline */}
			<div className="mt-5">
				<div className="flex items-center gap-1.5">
					{PHASES_IN_ORDER.map((p, idx) => {
						const passed = currentPhaseIdx >= 0 && idx < currentPhaseIdx;
						const active = currentPhaseIdx === idx;
						return (
							<div
								key={p}
								className={`h-1.5 flex-1 rounded-full transition-colors ${
									passed
										? "bg-accent"
										: active
											? "bg-accent/40 animate-pulse"
											: "bg-edge/60"
								}`}
								title={p}
							/>
						);
					})}
				</div>
			</div>

			{/* Healing banner */}
			{healing && (
				<div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
					<WarningCircle size={14} weight="duotone" className="shrink-0 text-amber-500" />
					<p className="text-xs text-amber-700 dark:text-amber-300">
						{healing.reason === "stuck_in_phase"
							? t("healing_stuck", { phase: phaseNarrative(currentPhaseName) })
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
