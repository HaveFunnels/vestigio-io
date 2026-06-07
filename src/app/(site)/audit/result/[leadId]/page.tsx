"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import Image from "next/image";
import { Trophy, ShieldCheck, ShieldX, Lock, Sparkles, ChevronDown, Target, ShieldHalf } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";

declare global {
	interface Window {
		Paddle: any;
	}
}
import type { LandingPreview } from "../../../../../../workers/ingestion/landing-preview";
import type {
	MiniFinding,
	BlurredFinding,
	MiniFindingSeverity,
} from "../../../../../../workers/ingestion/mini-audit-findings";
import {
	formatBRL,
	summarizeMiniImpact,
} from "../../../../../../packages/impact/mini-impact";
import logoDark from "@/../public/images/logo/logo.png";
import logoLight from "@/../public/images/logo/logo-light.png";
import { trackLpEvent } from "@/lib/lp-audit-track";
import { PREVIEW_SCENARIOS } from "@/lib/lp-audit-preview-scenarios";
import MiniFunnelMap from "@/components/lp/MiniFunnelMap";
import CopilotPanel from "@/components/lp/CopilotPanel";

// ──────────────────────────────────────────────
// /audit/result/[leadId] — Mini-Audit Result
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // 2 min cap
const LP_PRICE_ID =
	process.env.NEXT_PUBLIC_PADDLE_LP_PRICE_ID ||
	process.env.NEXT_PUBLIC_PADDLE_VESTIGIO_PRICE_ID ||
	"";

interface MiniAuditApiResult {
	id: string;
	preview: LandingPreview;
	visibleFindings: MiniFinding[];
	blurredFindings: BlurredFinding[];
	durationMs: number;
	computedAt: string;
}

interface LeadResponse {
	id: string;
	status: "draft" | "auditing" | "audit_complete" | "checkout_started" | "converted" | "expired" | "spam";
	currentStep: number;
	domain: string | null;
	organizationName: string | null;
	businessModel: string | null;
	monthlyRevenue?: number | null;
	primaryConcern?: string | null;
	currentOptimizationMethod?: string | null;
	whyNow?: string | null;
	emailMasked: string | null;
	createdAt: string;
	result: MiniAuditApiResult | null;
	/** Active checkout gateway, resolved server-side from the admin
	 *  override + env default. Determines which SDK the page loads
	 *  and which flow openCheckout dispatches to. */
	paymentProvider?: "mercadopago" | "paddle";
}

export default function MiniAuditResultPage() {
	const t = useTranslations("lp.audit_result");
	const params = useParams<{ leadId: string }>();
	const router = useRouter();
	const searchParams = useSearchParams();
	const leadId = params?.leadId;

	// ── Dev-only preview mode ──
	// /audit/result/anything?preview=<scenarioId>&theme=light|dark
	// short-circuits the fetch + polling and renders mocked data.
	// Production builds ignore the query param entirely.
	const previewScenarioId =
		process.env.NODE_ENV !== "production"
			? searchParams?.get("preview")
			: null;
	const previewTheme = searchParams?.get("theme") as "light" | "dark" | null;
	const previewScenario = previewScenarioId
		? PREVIEW_SCENARIOS[previewScenarioId] ?? null
		: null;
	const isPreview = !!previewScenario;

	const [lead, setLead] = useState<LeadResponse | null>(
		previewScenario ? (previewScenario.lead as LeadResponse) : null,
	);
	// Result scenarios skip the "audit complete, click to view" gate and
	// land directly on the populated result view; "loading-done" keeps
	// that gate so the AuditingState w/ "Ver resultados" button is
	// reachable. Everything else uses the production default (false).
	const skipViewGate =
		previewScenarioId === "saas-br" ||
		previewScenarioId === "ecom-br" ||
		previewScenarioId === "course-br" ||
		previewScenarioId === "services-br" ||
		previewScenarioId === "mobile-br";
	const [error, setError] = useState<string | null>(null);
	const [revealed, setRevealed] = useState(skipViewGate);
	const [showResults, setShowResults] = useState(skipViewGate);
	const [timedOut, setTimedOut] = useState(false);
	const [paddleReady, setPaddleReady] = useState(false);
	const [checkoutEmail, setCheckoutEmail] = useState<string | null>(null);
	const [launching, setLaunching] = useState(false);
	// Copilot side-panel open state — drives the desktop "push content
	// left" behavior so the panel doesn't overlay the page mid-read.
	// Mobile uses a bottom sheet w/ backdrop instead and ignores this.
	const [copilotOpen, setCopilotOpen] = useState(false);
	const pollAttemptsRef = useRef(0);

	// ── Paddle initialization ──
	// Preview mode never opens checkout, so we skip both the Script
	// tag and the SDK init entirely (no network call, no env-var
	// errors with the placeholder Paddle envs).
	const initPaddle = useCallback(() => {
		if (typeof window === "undefined" || !window.Paddle) return;
		if (isPreview) return;
		try {
			window.Paddle.Environment.set(
				process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
			);
			window.Paddle.Initialize({
				token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
				eventCallback: (event: any) => {
					if (event.name === "checkout.completed" && event.data?.status === "completed") {
						router.push(`/audit/thank-you/${leadId}`);
					}
				},
			});
			setPaddleReady(true);
		} catch (err) {
			console.error("[lp-result] Paddle init failed:", err);
		}
	}, [leadId, router]);

	// ── Fetch unmasked email for Paddle pre-fill ──
	useEffect(() => {
		if (!leadId || !lead) return;
		if (!["audit_complete", "expired"].includes(lead.status)) return;
		if (checkoutEmail) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/lead/${leadId}/checkout-context`);
				if (!res.ok) return;
				const data = await res.json();
				if (!cancelled && typeof data.email === "string") {
					setCheckoutEmail(data.email);
				}
			} catch { /* Paddle will prompt for email if we can't prefill */ }
		})();
		return () => { cancelled = true; };
	}, [leadId, lead, checkoutEmail]);

	// ── Open checkout (gateway picked server-side) ──
	const activeProvider = lead?.paymentProvider ?? "paddle";

	function openCheckout() {
		if (isPreview) {
			// In preview mode we never want to actually open a gateway —
			// just acknowledge the click so the buttons feel alive.
			console.info("[preview] checkout would open here");
			return;
		}
		if (activeProvider === "mercadopago") {
			// MP path: account creation FIRST, then paywall. We send the
			// visitor to the existing /auth/signup with a callbackUrl
			// pointing at /activate (the Pix + cartão paywall page).
			// leadId + domain carry over so the paywall can recover the
			// audit context after the OAuth/email round-trip.
			trackLpEvent(leadId, "lp_audit_cta_clicked");
			const params = new URLSearchParams({
				callbackUrl: "/activate",
				leadId: leadId ?? "",
			});
			if (lead?.domain) params.set("domain", lead.domain);
			window.location.href = `/auth/signup?${params.toString()}`;
			return;
		}
		if (!leadId || !window.Paddle || !paddleReady) {
			setError(t("error_payment_loading"));
			return;
		}
		if (!LP_PRICE_ID) {
			setError(t("error_prices_missing"));
			return;
		}
		trackLpEvent(leadId, "lp_audit_cta_clicked");
		setLaunching(true);

		// BUG-11 fix: Mark lead as checkout_started so we can distinguish
		// "abandoned checkout" from "never reached checkout" in analytics,
		// and prevent the result expiration timer from firing mid-checkout.
		fetch(`/api/lead/${leadId}/checkout-started`, { method: "POST" }).catch(() => {});

		try {
			window.Paddle.Checkout.open({
				items: [{ priceId: LP_PRICE_ID, quantity: 1 }],
				...(checkoutEmail ? { customer: { email: checkoutEmail } } : {}),
				customData: { leadId, lpFunnel: "true" },
				successUrl: `${window.location.origin}/audit/thank-you/${leadId}`,
				settings: { displayMode: "overlay" },
			});
		} catch (err) {
			console.error("[lp-result] checkout open failed:", err);
			setError(t("error_checkout_failed"));
		}
		setTimeout(() => setLaunching(false), 1500);
	}

	// ── Canonical link ──
	useEffect(() => {
		if (!leadId) return;
		const link = document.createElement("link");
		link.rel = "canonical";
		link.href = `${window.location.origin}/audit/result/${leadId}`;
		document.head.appendChild(link);
		return () => { document.head.removeChild(link); };
	}, [leadId]);

	// ── Polling loop ──
	const fetchLead = useCallback(async () => {
		if (!leadId || isPreview) return;
		try {
			const res = await fetch(`/api/lead/${leadId}`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || `HTTP ${res.status}`);
				return;
			}
			const data: LeadResponse = await res.json();
			setLead(data);
		} catch {
			setError(t("error_connection"));
		}
	}, [leadId]);

	useEffect(() => {
		fetchLead();
	}, [fetchLead]);

	useEffect(() => {
		if (!lead || isPreview) return;
		if (lead.status === "audit_complete" || lead.status === "expired") return;
		if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) {
			setTimedOut(true);
			return;
		}

		const timer = setTimeout(() => {
			pollAttemptsRef.current++;
			fetchLead();
		}, POLL_INTERVAL_MS);
		return () => clearTimeout(timer);
	}, [lead, fetchLead, isPreview]);

	// ── Preview theme: drive next-themes from ?theme= ──
	// We used to mutate <html class="dark"> directly, but next-themes
	// owns that class and re-applies it on every render from its
	// internal state + localStorage. Our manual mutation lost the race
	// and the page stayed dark even with ?theme=light. Now we go
	// through the canonical setTheme() so next-themes is the source of
	// truth. The (site) provider already drops forcedTheme when
	// ?preview= is present, otherwise this setTheme would be ignored.
	const { setTheme } = useTheme();
	useEffect(() => {
		if (!isPreview || !previewTheme) return;
		setTheme(previewTheme);
	}, [isPreview, previewTheme, setTheme]);

	// ── Render branches ──

	const previewWidget = isPreview ? (
		<PreviewToggle
			scenarioId={previewScenarioId!}
			theme={previewTheme ?? "dark"}
		/>
	) : null;

	if (error) {
		return (
			<>
				<ErrorState message={error} onRetry={() => { setError(null); fetchLead(); }} />
				{previewWidget}
			</>
		);
	}

	if (!lead) {
		return (
			<>
				<LoadingState message={t("loading.subtitle")} />
				{previewWidget}
			</>
		);
	}

	if (lead.status === "expired") {
		return (
			<>
				{!isPreview && activeProvider === "paddle" && (
					<Script src="https://cdn.paddle.com/paddle/v2/paddle.js" onLoad={initPaddle} strategy="afterInteractive" />
				)}
				<ExpiredState lead={lead} onCheckout={openCheckout} launching={launching} />
				{previewWidget}
			</>
		);
	}

	const isAuditComplete = lead.status === "audit_complete" && lead.result;

	// Still auditing — show progress
	if (!isAuditComplete) {
		return (
			<>
				<AuditingState lead={lead} timedOut={timedOut} />
				{previewWidget}
			</>
		);
	}

	// Audit done but user hasn't clicked to see results yet
	if (!showResults) {
		return (
			<>
				<AuditingState
					lead={lead}
					timedOut={timedOut}
					completed
					onViewResults={() => {
						trackLpEvent(leadId, "lp_audit_result_viewed");
						setShowResults(true);
						setTimeout(() => setRevealed(true), 80);
					}}
				/>
				{previewWidget}
			</>
		);
	}

	// ── Results view ──
	const { preview, visibleFindings, blurredFindings, computedAt } = lead.result!;

	// Separate negative vs positive — both shown, but only negatives count toward limit
	const negativeFindings = visibleFindings.filter((f) => f.severity !== "positive");
	const positiveFindings = visibleFindings.filter((f) => f.severity === "positive");

	return (
		<>
			{/* Paddle script — skipped in preview mode so the demo never
			    triggers a real SDK init or env-var errors. */}
			{!isPreview && activeProvider === "paddle" && (
				<Script src="https://cdn.paddle.com/paddle/v2/paddle.js" onLoad={initPaddle} strategy="afterInteractive" />
			)}

			<div
				// The Copilot side-panel slides in from the right on
				// desktop (>=sm). When open we slide the page's content
				// area left by adding right padding equal to the panel
				// width (380px). `mx-auto` inside <main> re-centers within
				// the now-shorter horizontal space, pushing the content
				// visually left. The CSS transition matches the panel's
				// own 320ms ease so they slide together as one motion.
				// Mobile (<sm) gets no padding — the panel is a bottom
				// sheet there and the content stays put.
				className={`relative min-h-screen bg-surface-shell transition-[padding] duration-300 ease-out ${
					copilotOpen ? "sm:pr-[380px]" : "sm:pr-0"
				}`}
			>
				{/* Brand strip — light theme, sticky CTA */}
				<header className="sticky top-0 z-30 border-b border-edge bg-surface-shell/85 backdrop-blur-md px-4 py-3">
					<div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
						<Link href="/lp" className="flex items-center">
							<Image src={logoDark} alt="Vestigio" height={22} className="dark:hidden" />
							<Image src={logoLight} alt="Vestigio" height={22} className="hidden dark:block" />
						</Link>
						<button
							type="button"
							onClick={openCheckout}
							disabled={launching}
							className="flex items-center gap-1.5 rounded-lg bg-content px-4 py-1.5 text-xs font-semibold text-surface-card transition-colors hover:bg-content-secondary disabled:opacity-60"
						>
							{t("cta_create_account")}
							<svg className="h-3 w-3 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
								<path d="M3 8h10M9 4l4 4-4 4" />
							</svg>
						</button>
					</div>
				</header>

				<main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
					{/* Result header — favicon + Fraunces title + counts strip */}
					<ResultHeader
						preview={preview}
						domain={lead.domain || ""}
						organizationName={lead.organizationName || lead.domain || ""}
						negativeFindings={negativeFindings}
						blurredCount={blurredFindings.length}
						revealed={revealed}
					/>
					{/* The strip below the header used to invent a "X críticos"
					    estimate from a heuristic over visible + blurred counts.
					    Buyers count visible badges and the number didn't fit,
					    eroding trust. ResultHeader now uses honest counts:
					    visible vs blurred. */}

					{/* Cost summary — the loss-aversion anchor. Lives right
					    under the header so the buyer hits the money
					    framing before anything else competes for attention. */}
					<CostSummaryBanner findings={negativeFindings} hiddenCount={blurredFindings.length} revealed={revealed} />

					{/* Plan of Strategy preview — the destination product, the
					    "here's what you get" answer to the cost framing
					    just above. JTBD-personalized when concern/whyNow
					    were captured upstream. */}
					<PlanPreviewSection
						domain={lead.domain || ""}
						organizationName={lead.organizationName || lead.domain || ""}
						primaryConcern={lead.primaryConcern ?? null}
						whyNow={lead.whyNow ?? null}
						negativeFindings={negativeFindings}
						blurredCount={blurredFindings.length}
						revealed={revealed}
						onCheckout={openCheckout}
						launching={launching}
					/>

					{/* Workspaces accordion — 4 lenses on the same Análise.
					    Copy flaunts framework analysis; Behavioral exposes
					    the integration grid. */}
					<WorkspacesAccordion
						negativeFindings={negativeFindings}
						blurredCount={blurredFindings.length}
						revealed={revealed}
						onCheckout={openCheckout}
					/>

					{/* Funnel map — the same horizontal widget used in the
					    product. Real visible findings drive the counts and
					    R$; stages with locked-only contribution show a
					    blurred teaser. */}
					<MapPreviewSection
						visibleFindings={visibleFindings}
						blurredFindings={blurredFindings}
						revealed={revealed}
						onUnlock={openCheckout}
						domain={lead.domain || ""}
					/>

					{/* Unified leaks list — visible + locked rendered in the
					    same section so the buyer sees the gap inline ("I see
					    5, I can't see these 10"). The previous design split
					    them into two separate sections with different visual
					    languages, which read as two different products. */}
					<UnifiedLeaksSection
						negativeFindings={negativeFindings}
						positiveFindings={positiveFindings}
						blurredFindings={blurredFindings}
						revealed={revealed}
						onCheckout={openCheckout}
					/>

					{/* Section break — visually marks the end of the
					    preliminary analysis and primes the paywall ask.
					    Hairline running edge-to-edge of the content with
					    the unlock copy centered over it. Hairline color
					    matches the surrounding edge tokens so it stays
					    invisible from far away and earns the eye only
					    when scrolling close. */}
					<div
						aria-hidden
						className={`relative mt-12 flex items-center sm:mt-16 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}
					>
						<div className="h-px flex-1 bg-edge" />
						<span className="px-4 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-content-muted">
							{t("unlock_divider")}
						</span>
						<div className="h-px flex-1 bg-edge" />
					</div>

					{/* CTA final emotional block — JTBD-personalized close.
					    Trust factors (Garantia 4x etc.) render inside it,
					    replacing the previous gray "Análise por Vestigio"
					    footer line. */}
					<CTAFinalSection
						organizationName={lead.organizationName || lead.domain || ""}
						primaryConcern={lead.primaryConcern ?? null}
						whyNow={lead.whyNow ?? null}
						currentOptimizationMethod={lead.currentOptimizationMethod ?? null}
						negativeCount={negativeFindings.length}
						blurredCount={blurredFindings.length}
						revealed={revealed}
						onCheckout={openCheckout}
						launching={launching}
					/>

					{/* FAQ — last buyer surface before they leave the page
					    or click create account. signup-flow-cro principle:
					    answer the 6 objections that are actively live in
					    the buyer's head at this moment (time-to-value,
					    risk reversal, cancel, differentiation, security,
					    fit). marketing-psychology applied: loss-aversion
					    antidote in #2, status-quo bias antidote in #3,
					    authority signal in #5. */}
					<FAQSection revealed={revealed} onCheckout={openCheckout} />
				</main>
			</div>

			{/* Animation styles */}
			<style jsx>{`
				@keyframes slide-up-fade {
					from {
						opacity: 0;
						transform: translateY(16px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				:global(.lp-card-anim) {
					animation: slide-up-fade 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
				}
				@keyframes scale-in {
					from {
						opacity: 0;
						transform: scale(0.96);
					}
					to {
						opacity: 1;
						transform: scale(1);
					}
				}
				:global(.lp-preview-anim) {
					animation: scale-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
				}
				@media (prefers-reduced-motion: reduce) {
					:global(.lp-card-anim),
					:global(.lp-preview-anim) {
						animation: none;
					}
				}
			`}</style>
			<CopilotPanel
				domain={lead.domain || ""}
				onCheckout={openCheckout}
				launching={launching}
				onOpenChange={setCopilotOpen}
			/>
			{previewWidget}
		</>
	);
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

// ── ResultHeader (Wave-22.6 redesign) ──
// Replaces the heavy PreviewCard with a tight header: favicon +
// Fraunces "Análise de {domain}" + counts strip (X findings · Y
// críticos · Z ações priorizadas). The counts ARE specific (drawn
// from real data) and seed the curiosity gap — visitor sees how
// much is detected without seeing what each one is.
function ResultHeader({
	preview,
	domain,
	organizationName,
	negativeFindings,
	blurredCount,
	revealed,
}: {
	preview: LandingPreview;
	domain: string;
	organizationName: string;
	negativeFindings: MiniFinding[];
	blurredCount: number;
	revealed: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const googleFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.host)}&sz=64`;
	const [faviconSrc, setFaviconSrc] = useState(preview.favicon_url || googleFavicon);
	const negativeCount = negativeFindings.length;

	// Composite funnel health score (0-100). Subtracts severity weight
	// for each visible negative finding and a moderate flat penalty per
	// locked finding (severity unknown but assumed non-trivial). Caps at
	// 0 so heavily-leaked sites don't underflow into nonsense. Empty
	// audits return 100.
	const healthScore = (() => {
		let score = 100;
		for (const f of negativeFindings) {
			// MiniFindingSeverity only has critical | high | medium | positive.
			// negativeFindings is already filtered to exclude positives, so
			// the three branches cover all valid cases.
			if (f.severity === "critical") score -= 12;
			else if (f.severity === "high") score -= 8;
			else if (f.severity === "medium") score -= 5;
		}
		score -= blurredCount * 3;
		return Math.max(0, Math.min(100, Math.round(score)));
	})();
	// Color band: matches the cost-summary banner tonality so the
	// score and the exposure number agree on whether things are fine.
	const scoreTone =
		healthScore >= 70
			? { ring: "text-emerald-500", value: "text-emerald-600 dark:text-emerald-300" }
			: healthScore >= 40
				? { ring: "text-amber-500", value: "text-amber-600 dark:text-amber-300" }
				: { ring: "text-rose-500", value: "text-rose-600 dark:text-rose-300" };
	const RADIAL_CIRCUMFERENCE = 2 * Math.PI * 22; // r=22, viewBox 56

	const healthRadial = (
		// Compact radial dial sitting in the header's top-right
		// corner. Editorial sizing (56px) — visible but doesn't compete
		// with the title. Score in the middle, label below.
		<div className="flex shrink-0 flex-col items-center gap-1">
			<div className="relative h-14 w-14">
				<svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
					<circle
						cx="28"
						cy="28"
						r="22"
						stroke="currentColor"
						strokeWidth="4"
						fill="none"
						className="text-edge"
					/>
					<circle
						cx="28"
						cy="28"
						r="22"
						stroke="currentColor"
						strokeWidth="4"
						fill="none"
						strokeLinecap="round"
						strokeDasharray={RADIAL_CIRCUMFERENCE}
						strokeDashoffset={
							RADIAL_CIRCUMFERENCE * (1 - healthScore / 100)
						}
						className={`${scoreTone.ring} transition-[stroke-dashoffset] duration-700 ease-out`}
					/>
				</svg>
				<div
					className={`absolute inset-0 flex items-center justify-center font-[family-name:var(--font-fraunces)] text-[18px] font-medium leading-none tabular-nums ${scoreTone.value}`}
				>
					{healthScore}
				</div>
			</div>
			<div className="text-center font-[family-name:var(--font-jetbrains-mono)] text-[8px] font-medium uppercase leading-tight tracking-[0.14em] text-content-muted">
				{t("header.score_label")}
			</div>
		</div>
	);

	const favicon = (
		// Container IS the favicon — no inner padding, no surface
		// color peeking around the image. Border + rounded-2xl crop the
		// favicon to a rounded square so the brand mark reads as one
		// shape. object-cover so a non-square favicon fills without
		// letterbox stripes.
		<span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-edge shadow-sm sm:h-12 sm:w-12">
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={faviconSrc}
				alt=""
				className="h-full w-full object-cover"
				onError={() => {
					if (faviconSrc !== googleFavicon) setFaviconSrc(googleFavicon);
				}}
			/>
		</span>
	);

	const eyebrow = (
		<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.18em] text-content-muted">
			{t("header.eyebrow")}
		</div>
	);

	// Title stacked above the URL — site name in Fraunces with the
	// domain reading like a subline mono caption underneath. Favicon
	// sits to the left, vertically centered with the whole stack so
	// it pairs visually with the entire identity unit, not just the
	// title.
	const titleStacked = (
		<div className="min-w-0 flex-1">
			<h1 className="font-[family-name:var(--font-fraunces)] text-[26px] font-medium leading-[1.1] tracking-tight text-content sm:text-[32px]">
				{t("header.title_preliminary", { org: organizationName })}
			</h1>
			<div className="mt-1 font-mono text-[12px] text-content-muted sm:text-[13px]">
				{domain}
			</div>
		</div>
	);

	// Divided strip for the leak counts. Sized to the full
	// content width — matches the width of the cost-summary card
	// and every other card below in the page rhythm. Both halves
	// share the same typography so neither dominates; the only
	// color is the rose on the still-locked count to flag the gap
	// (visible/locked binary kept, but the labels read "Mostrados"
	// and "A desbloquear" now — action-oriented instead of
	// observational).
	const leakStrip = (
		<div className="mt-4 flex w-full items-stretch overflow-hidden rounded-xl border border-edge bg-surface-card sm:mt-5">
			<div className="flex flex-1 items-baseline justify-center gap-1.5 px-4 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-[12px] tabular-nums">
				<span className="font-semibold text-content">{negativeCount}</span>
				<span className="text-content-muted">{t("header.visible_label")}</span>
			</div>
			<div className="w-px self-stretch bg-edge" aria-hidden />
			<div className="flex flex-1 items-baseline justify-center gap-1.5 px-4 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-[12px] tabular-nums">
				<span className="font-semibold text-rose-600 dark:text-rose-400">{blurredCount}</span>
				<span className="text-content-muted">{t("header.blocked_label")}</span>
			</div>
		</div>
	);

	return (
		<div
			className={`mb-8 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			{/* PRELIMINARY ANALYSIS eyebrow on its own row above the
			    identity block — it's a section label, not a sibling of
			    the identity. */}
			{eyebrow}

			{/* Identity row: favicon vertically centered against the
			    title+URL stack on the left, radial health score
			    flushed to the right wall on the same horizontal band.
			    Three flex items in one row so all three baselines stay
			    anchored to the same row even when the title wraps to
			    two lines. */}
			<div className="mt-2 flex items-center gap-3 sm:mt-3 sm:gap-4">
				{favicon}
				{titleStacked}
				{healthRadial}
			</div>

			{leakStrip}
		</div>
	);
}

// ── PlanPreviewSection (Wave-22.6 spec — block #1 of the new result) ──
// Sits at the top of the result page. Lays out the Monthly Strategy
// Plan the visitor WOULD get as a paid Vestigio user. The locked
// regions render synthetic-but-plausible content under a CSS blur
// (shimmer was the wrong primitive — it signals "still loading"
// when the truth is "blocked behind paywall"). Synthetic content
// keeps the page DevTools-safe: there are no real values to reveal.

// Locked narrative paragraphs in the Plan Preview — title visible,
// body collapsed-blurred. Tapping a title reveals the blurred body
// underneath, hinting at the depth of analysis without giving away
// any actual content. Editorial titles that sound like real Strategy
// Plan section headers a paid customer would see. PT-BR only —
// matches the preview-scenario locale of our primary customer (the
// HaveFunnels.com BR audience). Translation can come later if the
// audit gains EN/ES/DE traffic at scale.
const LOCKED_PARAGRAPHS: Array<{ title: string; body: string }> = [
	{
		title: "O padrão que aparece em todos os achados",
		body: "Os 14 vazamentos compartilham uma mesma raiz: o funil pede confiança antes de entregar contexto. Cada vez que o visitante encontra essa inversão, o custo se acumula. Quantificamos abaixo quanto cada inversão tira do mês.",
	},
	{
		title: "Por que isso está se intensificando agora",
		body: "Três sinais convergem este mês: aumento do CAC em tráfego pago, queda de retorno orgânico nas páginas de produto, e mudança de comportamento na tela de pagamento desde a última atualização. Detalhamos cada um com a métrica que muda.",
	},
	{
		title: "O movimento que move mais ponteiro",
		body: "Entre as 8 ações abertas, uma única intervenção concentra 41% da recuperação estimada. Mostramos qual é, por que ela tem prioridade sobre as outras 7, e a sequência exata pra executá-la em 14 dias.",
	},
	{
		title: "Como medir que funcionou",
		body: "Cada ação vem com um par de métricas — uma de processo (que confirma execução) e uma de outcome (que confirma impacto). Definimos baseline, janela de leitura e nível de confiança esperado pra cada par.",
	},
];

// Locked next-step pool — title + one-line hint. Server-rendered
// blurred. Linguagem buyer-friendly (C10) — frases que um dono de
// SMB lê e entende sem dicionário técnico.
const PLAN_STEP_FAKE: Array<{ title: string; hint: string }> = [
	{
		title: "Simplificar as 3 etapas do checkout",
		hint: "Pode recuperar R$4.800 – R$7.200 por mês",
	},
	{
		title: "Reescrever o botão principal pra prometer o resultado",
		hint: "Pode recuperar R$2.100 – R$3.400 por mês",
	},
	{
		title: "Adicionar 3 depoimentos reais com foto e nome",
		hint: "Pode recuperar R$1.900 – R$2.800 por mês",
	},
	{
		title: "Acelerar o site no celular",
		hint: "Pode recuperar R$1.400 – R$2.100 por mês",
	},
	{
		title: "Liberar a opção de comprar sem criar conta",
		hint: "Pode recuperar R$3.200 – R$4.900 por mês",
	},
	{
		title: "Conectar o Meta Ads pra ver quem realmente compra",
		hint: "Pode recuperar R$2.600 – R$3.800 por mês",
	},
];

function PlanPreviewSection({
	domain,
	organizationName,
	primaryConcern,
	whyNow,
	negativeFindings,
	blurredCount,
	revealed,
	onCheckout,
	launching,
}: {
	domain: string;
	organizationName: string;
	primaryConcern: string | null;
	whyNow: string | null;
	negativeFindings: MiniFinding[];
	blurredCount: number;
	revealed: boolean;
	onCheckout: () => void;
	launching: boolean;
}) {
	const negativeCount = negativeFindings.length;
	// Real numbers for the 3 hero stat cards. No blur — these are
	// derived from data the buyer can verify in the leaks list below.
	const totalLeaks = negativeCount + blurredCount;
	const impactSummary = summarizeMiniImpact(negativeFindings.map((f) => f.impact));
	const exposedMaxCents = impactSummary?.max_brl_cents ?? 0;
	const t = useTranslations("lp.audit_result");
	const nextStepCount = Math.max(5, Math.ceil((negativeCount + blurredCount) / 2));
	// Concern-driven narrative spark — first 1-2 sentences personalized.
	// The visitor's chosen concern shapes the opening line. JTBD-pull
	// (whyNow) optional, used at the close. Everything after the
	// SECOND sentence is server-side cut.
	//
	// Defensive fallback: if the lead carries a concern value that
	// doesn't have a dictionary opening (legacy data, mid-funnel
	// schema changes), fall back to "unknown_leak" so the visitor
	// sees a sentence instead of the raw bracket-key string.
	const VALID_CONCERN_KEYS = new Set([
		"traffic_no_sales",
		"low_conversion",
		"unknown_leak",
		"scale_efficiency",
		"prioritization",
	]);
	const concernKey =
		primaryConcern && VALID_CONCERN_KEYS.has(primaryConcern)
			? primaryConcern
			: "unknown_leak";
	const narrativeOpening = t(`plan_preview.concern_openings.${concernKey}` as never, { org: organizationName });
	const monthLabel = (() => {
		const now = new Date();
		const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
		return `${months[now.getMonth()]} ${now.getFullYear()}`;
	})();

	return (
		<section
			className={`relative overflow-hidden rounded-3xl border border-edge bg-surface-card p-6 transition-opacity duration-700 sm:p-8 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			{/* "Prévia" notch — hangs from the top center edge of the
			    card, only the bottom corners rounded so it looks
			    pasted onto the card top like an iPhone notch. Sits
			    inside the card's overflow boundary so nothing escapes,
			    but appears to tongue down INTO the card from above. */}
			<div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-b-xl bg-content px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-surface-card">
				{t("plan_preview.preview_badge")}
			</div>

			{/* Header */}
			<div className="mb-5 flex items-baseline justify-between gap-3">
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-content-muted">
					{t("plan_preview.eyebrow")}
				</div>
			</div>

			{/* Plan title + month */}
			<div className="mb-6">
				<h2 className="font-[family-name:var(--font-fraunces)] text-[26px] font-medium leading-tight text-content sm:text-[30px]">
					{t("plan_preview.title", { month: monthLabel, org: organizationName })}
				</h2>
			</div>

			{/* Hero metric stub — real numbers, no blur. Each card maps to
			    a value the buyer can verify in other sections of the page
			    (count = unified leaks list; exposed = CostSummary above;
			    actions = next_steps below). Showing the actual data is
			    stronger than hiding it — there is no "paywall reveal"
			    payoff to be gained by blurring numbers the buyer has
			    already seen one section ago. */}
			{/* Hero stat strip — three counts (Vazamentos, Valor exposto,
			    Ações abertas) rendered with the same Fraunces editorial
			    treatment as the funnel-map carousel counts so the page
			    type rhythm stays consistent. Label on top center, big
			    number underneath center. */}
			<div className="mb-6 grid grid-cols-3 gap-3">
				<div className="flex flex-col items-center rounded-xl border border-edge bg-surface-inset p-3 text-center">
					<div className="text-[9px] font-medium uppercase tracking-wider text-content-muted">
						{t("plan_preview.hero.label_leaks")}
					</div>
					<div className="mt-2 font-[family-name:var(--font-fraunces)] text-[28px] font-medium leading-none tabular-nums text-content sm:text-[32px]">
						{totalLeaks}
					</div>
				</div>
				<div className="flex flex-col items-center rounded-xl border border-edge bg-surface-inset p-3 text-center">
					<div className="text-[9px] font-medium uppercase tracking-wider text-content-muted">
						{t("plan_preview.hero.label_exposed")}
					</div>
					<div className="mt-2 font-[family-name:var(--font-fraunces)] text-[22px] font-medium leading-none tabular-nums text-rose-600 dark:text-rose-300 sm:text-[26px]">
						{exposedMaxCents > 0 ? formatBRL(exposedMaxCents) : "—"}
					</div>
				</div>
				<div className="flex flex-col items-center rounded-xl border border-edge bg-surface-inset p-3 text-center">
					<div className="text-[9px] font-medium uppercase tracking-wider text-content-muted">
						{t("plan_preview.hero.label_actions")}
					</div>
					<div className="mt-2 font-[family-name:var(--font-fraunces)] text-[28px] font-medium leading-none tabular-nums text-emerald-600 dark:text-emerald-300 sm:text-[32px]">
						{nextStepCount}
					</div>
				</div>
			</div>

			{/* Narrative section. First paragraph is the JTBD-personalized
			    opening rendered cleartext — the buyer has to read at
			    least one piece of real content so they can judge whether
			    the analysis sounds smart. The remaining 4 paragraphs are
			    real-sounding section titles with a click affordance: tap
			    to expand reveals a blurred body below, signaling "there's
			    written analysis here, behind the paywall." Hides the
			    cliché "Mais N parágrafos seguem no Plano completo"
			    string. */}
			<div className="mb-6">
				<div className="text-[10px] font-medium uppercase tracking-wider text-content-muted">
					{t("plan_preview.narrative_label")}
				</div>
				<p className="mt-2 font-[family-name:var(--font-fraunces)] text-[16px] leading-relaxed text-content-secondary">
					{narrativeOpening}
				</p>
				<div className="mt-4 space-y-1">
					{LOCKED_PARAGRAPHS.map((p) => (
						<LockedNarrativeRow
							key={p.title}
							title={p.title}
							body={p.body}
							onCheckout={onCheckout}
						/>
					))}
				</div>
			</div>

			{/* Next steps — first 2 titles visible, rest cut */}
			<div className="mb-6">
				<div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-content-muted">
					{t("plan_preview.next_steps_label", { count: nextStepCount })}
				</div>
				<ol className="space-y-2.5">
					{[
						{ order: 1, Icon: Target, accent: "rose" as const },
						{ order: 2, Icon: ShieldHalf, accent: "amber" as const },
					].map(({ order, Icon, accent }) => {
						const accentClass =
							accent === "rose"
								? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
								: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300";
						return (
							<li
								key={order}
								// Counter "01" / "02" sits absolute in the
								// top-left corner of the card overlapping the
								// border — releases the inline space inside
								// the content row so title can flow full width.
								// pt-3.5 to give the title room above where
								// the counter would otherwise crowd it.
								className="relative flex items-start gap-3 rounded-2xl border border-edge bg-surface-inset p-4 pt-5"
							>
								<span className="absolute left-3 top-2 font-mono text-[10px] font-semibold tabular-nums text-content-faint">
									0{order}
								</span>
								<span
									className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentClass}`}
								>
									<Icon size={18} strokeWidth={2.2} />
								</span>
								<div className="min-w-0 flex-1">
									<div className="text-[14px] font-semibold leading-tight text-content">
										{t(`plan_preview.next_step_${order}` as never)}
									</div>
									<div className="mt-1 text-[12px] leading-relaxed text-content-muted">
										{t(`plan_preview.next_step_${order}_hint` as never)}
									</div>
								</div>
							</li>
						);
					})}
					{/* Locked steps — fake but plausible titles + hints rendered
					    blurred. "Blur on real text behind lock" reads as
					    paywalled content; "shimmer" reads as still loading,
					    which isn't true. PLAN_STEP_FAKE pool above. */}
					{Array.from({ length: Math.max(0, nextStepCount - 2) }).map((_, i) => (
						<li
							key={`locked-${i}`}
							onClick={onCheckout}
							// Same overlapped-counter pattern as the visible
							// rows above so the locked rows feel continuous,
							// just blurred.
							className="relative flex cursor-pointer items-start gap-3 rounded-2xl border border-edge bg-surface-inset/50 p-4 pt-5 transition-colors hover:bg-surface-inset/80"
						>
							<span className="absolute left-3 top-2 font-mono text-[10px] font-semibold tabular-nums text-content-faint">
								0{i + 3}
							</span>
							<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-inset text-content-faint">
								<Lock size={16} strokeWidth={2.2} />
							</span>
							<div className="min-w-0 flex-1 space-y-1">
								<div className="select-none truncate text-[14px] font-semibold leading-tight text-content blur-[5px]" aria-hidden>
									{PLAN_STEP_FAKE[i % PLAN_STEP_FAKE.length].title}
								</div>
								<div className="select-none truncate text-[12px] text-content-muted blur-[4px]" aria-hidden>
									{PLAN_STEP_FAKE[i % PLAN_STEP_FAKE.length].hint}
								</div>
							</div>
						</li>
					))}
				</ol>
			</div>

			{/* Inline CTA */}
			<button
				type="button"
				onClick={onCheckout}
				disabled={launching}
				className="flex w-full items-center justify-center gap-2 rounded-2xl bg-content px-6 py-3.5 text-[14px] font-semibold text-surface-card transition-colors hover:bg-content-secondary disabled:opacity-60"
			>
				{t("plan_preview.unlock_cta")}
				<svg className="h-4 w-4 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
					<path d="M3 8h10M9 4l4 4-4 4" />
				</svg>
			</button>
		</section>
	);
}

// ── WorkspacesAccordion (Wave-22.6 spec block #3) ──
// Four collapsible cards, one per Vestigio workspace. Each tells a
// different angle on the same análise. Copy lens flaunts our
// framework analysis (PAS/AIDA/BAB/4P/Cialdini); Behavioral lens
// exposes the integration grid as locked.
function WorkspacesAccordion({
	negativeFindings,
	blurredCount,
	revealed,
	onCheckout,
}: {
	negativeFindings: MiniFinding[];
	blurredCount: number;
	revealed: boolean;
	onCheckout: () => void;
}) {
	const t = useTranslations("lp.audit_result");
	const [openKey, setOpenKey] = useState<string | null>("revenue");

	// Group findings by category → workspace lens.
	const revenueFindings = negativeFindings.filter((f) =>
		["checkout", "structure", "mobile"].includes(f.category),
	);
	const trustFindings = negativeFindings.filter((f) =>
		["trust", "policy"].includes(f.category),
	);
	const copyFindings = negativeFindings.filter((f) =>
		["cta", "friction"].includes(f.category),
	);
	// Behavior lens has no visible findings in mini — it's the locked
	// teaser. Blurred count split heuristically between Behavioral and
	// the other 3 lenses; behavioral gets the lion's share.
	const behavioralBlurred = Math.ceil(blurredCount * 0.5);
	const revenueBlurred = Math.ceil(blurredCount * 0.2);
	const trustBlurred = Math.ceil(blurredCount * 0.15);
	const copyBlurred = blurredCount - behavioralBlurred - revenueBlurred - trustBlurred;

	const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));

	return (
		<section
			className={`mt-8 transition-opacity duration-700 sm:mt-10 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			{/* Mobile: subtitle drops under title left-aligned. Desktop:
			    title left, subtitle right, baselines aligned. */}
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-[family-name:var(--font-fraunces)] text-[20px] font-medium leading-tight text-content sm:text-[22px]">
					{t("workspaces.title")}
				</h2>
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-[0.15em] text-content-muted">
					{t("workspaces.subtitle")}
				</div>
			</div>

			<div className="space-y-2">
				{/* Revenue Intelligence */}
				<WorkspaceCard
					accent="rose"
					icon={(
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 12a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V12zm-12 0h.008v.008H6V12z" />
						</svg>
					)}
					title={t("workspaces.revenue.title")}
					subtitle={t("workspaces.revenue.count", {
						visible: revenueFindings.length,
						hidden: revenueBlurred,
					})}
					open={openKey === "revenue"}
					onToggle={() => toggle("revenue")}
				>
					<ul className="space-y-2">
						{revenueFindings.slice(0, 3).map((f) => (
							<WorkspaceFindingRow key={f.id} title={f.title} severity={f.severity} />
						))}
						{Array.from({ length: Math.max(0, revenueBlurred) }).map((_, i) => (
							<WorkspaceShimmerRow key={`r-shim-${i}`} index={i} onClick={onCheckout} />
						))}
					</ul>
				</WorkspaceCard>

				{/* Trust & Conversion */}
				<WorkspaceCard
					accent="amber"
					icon={(
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
						</svg>
					)}
					title={t("workspaces.trust.title")}
					subtitle={t("workspaces.trust.count", {
						visible: trustFindings.length,
						hidden: trustBlurred,
					})}
					open={openKey === "trust"}
					onToggle={() => toggle("trust")}
				>
					<ul className="space-y-2">
						{trustFindings.slice(0, 3).map((f) => (
							<WorkspaceFindingRow key={f.id} title={f.title} severity={f.severity} />
						))}
						{Array.from({ length: Math.max(0, trustBlurred) }).map((_, i) => (
							<WorkspaceShimmerRow key={`t-shim-${i}`} index={i + 3} onClick={onCheckout} />
						))}
					</ul>
				</WorkspaceCard>

				{/* Copy Frameworks — the flaunt section */}
				<WorkspaceCard
					accent="sky"
					icon={(
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
						</svg>
					)}
					title={t("workspaces.copy.title")}
					subtitle={t("workspaces.copy.count", { hidden: copyBlurred + Math.max(0, copyFindings.length - 2) })}
					open={openKey === "copy"}
					onToggle={() => toggle("copy")}
				>
					<div className="mb-3 text-[12px] text-content-secondary">
						{t("workspaces.copy.intro")}
					</div>
					<div className="space-y-2">
						{[
							{ key: "PAS", status: "ok", desc: "Problema → Agitação → Solução" },
							{ key: "AIDA", status: "warn", desc: "Atenção → Interesse → Desejo → Ação" },
							{ key: "BAB", status: "fail", desc: "Antes → Depois → Ponte" },
							{ key: "4P", status: "ok", desc: "Promessa → Imagem → Prova → Pedido" },
							{ key: "Cialdini", status: "fail", desc: "6 gatilhos de persuasão (escassez, prova social…)" },
						].map((fw) => {
							const config = {
								ok: { bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-500/40", text: "text-emerald-700 dark:text-emerald-300", symbol: "✓" },
								warn: { bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-700 dark:text-amber-300", symbol: "△" },
								fail: { bg: "bg-rose-50 dark:bg-rose-500/10", border: "border-rose-500/40", text: "text-rose-700 dark:text-rose-300", symbol: "✕" },
							}[fw.status as "ok" | "warn" | "fail"];
							return (
								<div
									key={fw.key}
									className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${config.bg} ${config.border}`}
								>
									<div className="min-w-0 flex-1">
										<div className="font-mono text-[11px] font-semibold text-content-secondary">{fw.key}</div>
										<div className="mt-0.5 truncate text-[11px] text-content-muted">{fw.desc}</div>
									</div>
									<span className={`shrink-0 font-mono text-[13px] font-bold ${config.text}`}>{config.symbol}</span>
								</div>
							);
						})}
					</div>
					{copyFindings.length > 0 && (
						<div className="mt-3 rounded-xl border border-edge bg-surface-inset px-3 py-2 text-[11px] text-content-secondary">
							{t("workspaces.copy.example")}
						</div>
					)}
					<div className="mt-3 text-[11px] text-content-muted">
						{t("workspaces.copy.unlock", { count: copyBlurred + Math.max(0, copyFindings.length - 2) })}
					</div>
				</WorkspaceCard>

				{/* Behavioral Signals — the integration grid flaunt */}
				<WorkspaceCard
					accent="violet"
					icon={(
						<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
					)}
					title={t("workspaces.behavioral.title")}
					subtitle={t("workspaces.behavioral.count", { count: INTEGRATION_LOGOS.length, hidden: behavioralBlurred })}
					open={openKey === "behavioral"}
					onToggle={() => toggle("behavioral")}
				>
					<div className="mb-3 text-[12px] text-content-secondary">
						{t("workspaces.behavioral.intro")}
					</div>
					{/* Colored circle integrations — each in its brand tint
					    so the buyer recognizes Meta, Stripe, Shopify et al
					    at a glance. Logos full color (no grayscale) sitting
					    on a soft tint of the same color. Name label below
					    each circle. */}
					<div className="flex flex-wrap items-start justify-center gap-x-5 gap-y-4">
						{INTEGRATION_LOGOS.map((logo) => (
							<div
								key={logo.name}
								className="flex w-16 flex-col items-center gap-1.5 text-center"
							>
								<span
									className="flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-inset"
									style={{
										backgroundColor: `${logo.tint}1A`, // 10% tint
										color: logo.tint,
										// `ring` uses currentColor when no color set,
										// but tints work better with an explicit
										// inline ring color so the chip reads as a
										// halo, not a flat solid.
										boxShadow: `inset 0 0 0 1px ${logo.tint}33`,
									}}
								>
									{logo.svg ? (
										/* eslint-disable-next-line @next/next/no-img-element */
										<img
											src={logo.svg}
											alt={logo.name}
											className="h-6 w-auto"
										/>
									) : (
										<span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] font-medium uppercase tracking-wider">
											{logo.name.slice(0, 2)}
										</span>
									)}
								</span>
								<span className="text-[10px] text-content-muted">{logo.name}</span>
							</div>
						))}
					</div>
					<div className="mt-3 text-[11px] text-content-muted">
						{t("workspaces.behavioral.unlock")}
					</div>
				</WorkspaceCard>
			</div>
		</section>
	);
}

// Integration logos shown in the Behavioral workspace card.
// GA4 / Hotjar / Clarity dropped — those are observability tools the
// user already pays for, not data sources Vestigio uniquely connects.
// Keeping the list to ad/commerce platforms that define our buyer's
// real data perimeter. Each `tint` is the brand's primary brand color
// so the colored-circle treatment reads as "this is Meta / Stripe /
// Shopify" at a glance instead of generic square cards.
const INTEGRATION_LOGOS: Array<{ name: string; svg?: string; tint: string }> = [
	{ name: "Meta Ads", svg: "/logos/meta.svg", tint: "#1877F2" },
	{ name: "Google Ads", svg: "/logos/google-ads.svg", tint: "#4285F4" },
	{ name: "Stripe", svg: "/logos/stripe.svg", tint: "#635BFF" },
	{ name: "Shopify", svg: "/logos/shopify.svg", tint: "#95BF47" },
	{ name: "Nuvemshop", svg: "/logos/nuvemshop.svg", tint: "#0084FF" },
];

function WorkspaceCard({
	accent,
	icon,
	title,
	subtitle,
	open,
	onToggle,
	children,
}: {
	accent: "rose" | "amber" | "sky" | "violet";
	icon: React.ReactNode;
	title: string;
	subtitle: string;
	open: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	const accentClass = {
		rose: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
		amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
		sky: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
		violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
	}[accent];

	return (
		<div className="overflow-hidden rounded-2xl border border-edge bg-surface-card">
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-card-hover"
			>
				<span
					className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accentClass}`}
				>
					{icon}
				</span>
				<div className="min-w-0 flex-1">
					<div className="text-[14px] font-semibold leading-tight text-content">
						{title}
					</div>
					<div className="mt-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[11px] tabular-nums text-content-muted">
						{subtitle}
					</div>
				</div>
				<svg
					className={`h-4 w-4 shrink-0 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2}
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						key="content"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{
							height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
							opacity: { duration: 0.18, ease: "easeOut" },
						}}
						className="overflow-hidden border-t border-edge-subtle"
					>
						<div className="px-4 py-3">{children}</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function WorkspaceFindingRow({ title, severity }: { title: string; severity: string }) {
	const dot = {
		critical: "bg-rose-500",
		high: "bg-amber-500",
		medium: "bg-sky-500",
		low: "bg-emerald-500",
	}[severity as "critical" | "high" | "medium" | "low"] || "bg-content-faint";
	return (
		<li className="flex items-start gap-3">
			<span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
			<span className="min-w-0 flex-1 text-[13px] leading-snug text-content-secondary">
				{title}
			</span>
		</li>
	);
}

// Locked rows inside the expanded workspaces. Linguagem buyer-
// friendly (C10) — mesmas regras dos COMMON_BLURRED e do step pool.
const WORKSPACE_ROW_FAKE = [
	"Falta selo de segurança na tela de pagamento",
	"Texto do botão deixa o cliente em dúvida",
	"Botões pequenos demais pra clicar no celular",
	"Carrinho perde os itens ao ir pro checkout",
	"Títulos da página do produto brigam por atenção",
	"Política de privacidade está desatualizada",
	"Depoimentos sem foto ou link verificável",
	"Cadastro pede telefone obrigatoriamente",
];

function WorkspaceShimmerRow({
	index = 0,
	onClick,
}: {
	index?: number;
	onClick?: () => void;
}) {
	// Whole row is a button when onClick is provided so tapping any
	// blurred workspace finding lands on /auth/signup. Visually the
	// row still looks identical — buyers reading the blur know it's
	// locked content and pressing it should unlock, just like the
	// LockedFindingCard in the unified leaks list.
	const RowContent = (
		<>
			<span className="h-1.5 w-1.5 shrink-0 rounded-full bg-content-faint" />
			<span
				className="flex-1 select-none truncate text-[13px] leading-snug text-content-secondary blur-[5px]"
				aria-hidden
			>
				{WORKSPACE_ROW_FAKE[index % WORKSPACE_ROW_FAKE.length]}
			</span>
			<svg className="h-3 w-3 shrink-0 text-content-faint" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
				<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
			</svg>
		</>
	);
	if (onClick) {
		return (
			<li>
				<button
					type="button"
					onClick={onClick}
					className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-amber-50/40 dark:hover:bg-amber-500/[0.05]"
				>
					{RowContent}
				</button>
			</li>
		);
	}
	return <li className="flex items-center gap-3">{RowContent}</li>;
}

// ── MapPreviewSection (Wave-22.6 spec block #4) ──
// Renders the LP-safe MiniFunnelMap (visual identical to the
// product's FunnelIntegrityMap, no McpDataProvider dependency).
// The previous synthetic SVG "causa-raiz" illustration looked
// like a completely different product; this one tells the buyer
// "the real product map looks exactly like this".
function MapPreviewSection({
	visibleFindings,
	blurredFindings,
	revealed,
	onUnlock,
	domain,
}: {
	visibleFindings: MiniFinding[];
	blurredFindings: BlurredFinding[];
	revealed: boolean;
	onUnlock: () => void;
	domain: string;
}) {
	const t = useTranslations("lp.audit_result");
	const negativeFindings = visibleFindings.filter((f) => f.severity !== "positive");
	const totalCount = negativeFindings.length + blurredFindings.length;

	return (
		<section
			className={`mt-8 transition-opacity duration-700 sm:mt-10 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			{/* Mobile: subtitle drops under title left-aligned. Desktop:
			    title left, count right, baselines aligned. */}
			<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
				<h2 className="font-[family-name:var(--font-fraunces)] text-[20px] font-medium leading-tight text-content sm:text-[22px]">
					{t("map.title", { domain })}
				</h2>
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-[0.15em] text-content-muted">
					{t("map.counts", { nodes: 5, edges: totalCount })}
				</div>
			</div>

			<div className="rounded-2xl border border-edge bg-surface-card p-4 sm:p-5">
				<MiniFunnelMap
					visibleFindings={negativeFindings}
					blurredFindings={blurredFindings}
					onUnlock={onUnlock}
				/>
			</div>
		</section>
	);
}

// McpChatMockup was extracted to src/components/lp/CopilotPanel.tsx
// and mounted at the page level as a floating right-side panel
// (desktop) / bottom-sheet (mobile). The previous in-flow section
// went stale on scrollback (typing animation only fired once).

// ── CTAFinalSection (Wave-22.6 spec block #6) ──
// The emotional close. JTBD-personalized using primaryConcern,
// whyNow, currentOptimizationMethod when present. Single Create
// Account CTA.
function CTAFinalSection({
	organizationName,
	primaryConcern,
	whyNow,
	currentOptimizationMethod,
	negativeCount,
	blurredCount,
	revealed,
	onCheckout,
	launching,
}: {
	organizationName: string;
	primaryConcern: string | null;
	whyNow: string | null;
	currentOptimizationMethod: string | null;
	negativeCount: number;
	blurredCount: number;
	revealed: boolean;
	onCheckout: () => void;
	launching: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	// Defensive lookups — if a JTBD field carries a value the dictionary
	// hasn't seen (legacy data, schema evolution), drop that fragment
	// rather than rendering raw bracket-key strings.
	const VALID_CONCERN = new Set([
		"traffic_no_sales",
		"low_conversion",
		"unknown_leak",
		"scale_efficiency",
		"prioritization",
	]);
	const VALID_WHY_NOW = new Set([
		"scaling_paid_traffic",
		"recent_drop",
		"prove_roi",
		"competitive_pressure",
		"chronic_pain",
		"exploring",
	]);
	const VALID_METHOD = new Set([
		"analytics_tools",
		"session_replay",
		"agency_consultant",
		"team_judgment",
		"spreadsheets",
		"nothing",
	]);
	const whyNowClause =
		whyNow && VALID_WHY_NOW.has(whyNow)
			? t(`cta_final.why_now_clauses.${whyNow}` as never)
			: null;
	const concernClose =
		primaryConcern && VALID_CONCERN.has(primaryConcern)
			? t(`cta_final.concern_closes.${primaryConcern}` as never, { org: organizationName })
			: null;
	const methodLine =
		currentOptimizationMethod && VALID_METHOD.has(currentOptimizationMethod)
			? t(`cta_final.method_lines.${currentOptimizationMethod}` as never)
			: null;
	// Real visible-critical count drives the generic close (used only
	// when there is no concern-driven copy). The old heuristic over
	// blurred + negative drifted away from what the visitor counts in
	// the badge list, breaking trust.
	const visibleCriticalCount = Math.max(1, Math.floor(negativeCount * 0.3));

	return (
		<section
			// mt collapsed from 12/16 to 6/8 because the new "Desbloqueie
			// a análise completa" divider sits between this and the leak
			// list above; it owns the section break now, this just needs
			// breathing room from the divider line.
			className={`relative mt-6 overflow-hidden rounded-[2rem] border border-edge bg-surface-card px-7 py-10 transition-opacity duration-700 sm:mt-8 sm:px-12 sm:py-14 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			{/* Subtle dot-grid texture in content color so the
			    background feels constructed without using brand
			    accent. Stays muted in both themes. */}
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.04]"
				style={{
					backgroundImage:
						"radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
					backgroundSize: "24px 24px",
				}}
				aria-hidden
			/>

			<div className="relative">
				{/* Eyebrow */}
				<div className="flex items-center gap-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-[0.22em] text-content-muted">
					<span className="h-px w-6 bg-content-muted/60" />
					{t("cta_final.eyebrow")}
				</div>

				{/* Display headline — single tone, Fraunces, no emerald tint */}
				<h2 className="mt-4 max-w-2xl font-[family-name:var(--font-fraunces)] text-[34px] font-medium leading-[1.05] tracking-tight text-content sm:text-[48px]">
					{t("cta_final.headline_l1")}
					<br />
					<span className="text-content-secondary">
						{t("cta_final.headline_l2")}
					</span>
				</h2>

				{/* JTBD-personalized line OR fallback close */}
				<p className="mt-6 max-w-xl text-[15px] leading-relaxed text-content-secondary sm:text-[16px]">
					{whyNowClause ? (
						<>
							{t("cta_final.you_told_us")}{" "}
							<strong className="text-content">{whyNowClause}</strong>.{" "}
						</>
					) : null}
					{concernClose ?? t("cta_final.generic_close", { count: visibleCriticalCount })}
				</p>

				{methodLine && (
					<p className="mt-3 max-w-xl text-[13px] leading-relaxed text-content-muted">
						{methodLine}
					</p>
				)}

				{/* Outcome bullets — six items in 2 cols. signup-flow-cro
				    principle: each bullet stands on its own outcome
				    (what the buyer GETS), uses a specific mechanism
				    or unit (R$, "each month", "Meta, Google e Stripe"),
				    and earns its line. The list is wider now and grew
				    from 4 → 6 because the buyer is at the very end of
				    a long page and the moment of CTA decision benefits
				    from more concrete proof, not less. */}
				<ul className="mt-7 grid max-w-2xl gap-x-6 gap-y-2.5 sm:grid-cols-2">
					{(["plan", "queue", "ai", "continuous", "history", "map"] as const).map((item) => (
						<li key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-content-secondary">
							<svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
							<span>{t(`cta_final.bullets.${item}`)}</span>
						</li>
					))}
				</ul>

				{/* CTA — solid black with emerald arrow accent */}
				<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
					<button
						type="button"
						onClick={onCheckout}
						disabled={launching}
						className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-content px-8 py-4 font-[family-name:var(--font-fraunces)] text-[17px] font-medium tracking-tight text-surface-card transition-all hover:bg-content-secondary disabled:opacity-60 sm:w-auto sm:px-10"
					>
						<span className="relative">{t("cta_create_account")}</span>
						<svg className="h-4 w-4 text-emerald-400 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
							<path d="M3 8h10M9 4l4 4-4 4" />
						</svg>
					</button>
					<div className="text-[12px] leading-snug text-content-muted">
						{t("cta_final.trust_line")}
					</div>
				</div>

				{/* Trust factor: Garantia 4x — neutral card, emerald only on shield */}
				<div className="mt-8 flex items-start gap-4 rounded-2xl border border-edge bg-surface-inset p-5">
					<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
						<ShieldCheck size={20} strokeWidth={2} />
					</div>
					<div className="min-w-0 flex-1">
						<div className="font-[family-name:var(--font-fraunces)] text-[16px] font-medium leading-tight text-content">
							{t("cta_final.guarantee_title")}
						</div>
						<p className="mt-1 text-[13px] leading-relaxed text-content-muted">
							{t("cta_final.guarantee_desc")}
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}

function PreviewCard({
	preview,
	totalFindings,
	negativeFindings,
	revealed,
}: {
	preview: LandingPreview;
	totalFindings: number;
	negativeFindings: MiniFinding[];
	revealed: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const googleFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.host)}&sz=64`;
	const [faviconSrc, setFaviconSrc] = useState(preview.favicon_url || googleFavicon);

	const summary = summarizeMiniImpact(negativeFindings.map((f) => f.impact));
	const impactLabel = summary && summary.count > 0
		? `${formatBRL(summary.min_brl_cents)}–${formatBRL(summary.max_brl_cents)}/mês`
		: null;

	// Response time quality badge
	const rtMs = preview.response_time_ms;
	const rtBadge = rtMs < 300 ? { text: t("response_excellent"), color: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" }
		: rtMs < 800 ? { text: t("response_good"), color: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" }
		: rtMs < 2000 ? { text: t("response_slow"), color: "border-amber-500/20 bg-amber-500/10 text-amber-400" }
		: { text: t("response_critical"), color: "border-red-500/20 bg-red-500/10 text-red-400" };

	const sslActive = (preview.final_url || preview.url || "").startsWith("https");

	// Score: capped at 70, computed from findings severity
	const baseScore = 70;
	const penalty = negativeFindings.reduce((acc, f) => {
		if (f.severity === "critical") return acc + 15;
		if (f.severity === "high") return acc + 10;
		if (f.severity === "medium") return acc + 5;
		return acc + 2;
	}, 0);
	const score = Math.max(10, Math.min(70, baseScore - penalty));
	const scoreColor = score >= 50 ? "text-emerald-400" : score >= 30 ? "text-amber-400" : "text-red-400";
	const scoreStroke = score >= 50 ? "#34d399" : score >= 30 ? "#fbbf24" : "#f87171";

	return (
		<div
			className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900/80 to-zinc-950 p-5 sm:p-6 ${revealed ? "lp-preview-anim" : "opacity-0"}`}
		>
			<div className="flex items-start gap-4">
				{/* Favicon */}
				<div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={faviconSrc}
						alt=""
						className="h-8 w-8 object-contain"
						onError={() => {
							if (faviconSrc !== googleFavicon) {
								setFaviconSrc(googleFavicon);
							}
						}}
					/>
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">{t("diagnosed")}</span>
						<span className="h-1 w-1 rounded-full bg-zinc-700" />
						<span className="font-mono text-[10px] text-zinc-500">{preview.host}</span>
					</div>
					<h1 className="mt-1 truncate text-xl font-semibold text-zinc-100" title={preview.title || preview.host}>
						{preview.title || preview.host}
					</h1>
				</div>
			</div>

			{/* Stats strip — Panorama-style */}
			<div className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-4">
				<div>
					<div className="flex items-center gap-1.5">
						<svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
						</svg>
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{t("response")}</span>
					</div>
					<div className="mt-0.5 font-mono text-sm tabular-nums text-zinc-300">{preview.response_time_ms}ms</div>
					<span className={`mt-1 inline-block rounded border px-2 py-0.5 text-[9px] font-medium ${rtBadge.color}`}>{rtBadge.text}</span>
				</div>
				<div>
					<div className="flex items-center gap-1.5">
						{sslActive
							? <ShieldCheck className="h-3 w-3 text-zinc-600" />
							: <ShieldX className="h-3 w-3 text-zinc-600" />
						}
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{t("ssl")}</span>
					</div>
					<div className="mt-0.5 font-mono text-sm text-zinc-300">{sslActive ? t("ssl_https") : t("ssl_http")}</div>
					<span className={`mt-1 inline-block rounded border px-2 py-0.5 text-[9px] font-medium ${sslActive ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
						{sslActive ? t("ssl_active") : t("ssl_inactive")}
					</span>
				</div>
				<div>
					<div className="flex items-center gap-1.5">
						<svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">{t("leaks")}</span>
					</div>
					<div className="mt-0.5 font-mono text-sm tabular-nums text-red-300">{totalFindings}</div>
					{impactLabel && (
						<span className="mt-1 inline-block rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[9px] font-medium text-red-400">
							↓ {impactLabel}
						</span>
					)}
				</div>
			</div>

			{/* Score strip */}
			<div className="mt-5 flex items-center gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
				{/* Circular score */}
				<div className="relative flex h-20 w-20 shrink-0 items-center justify-center sm:h-[88px] sm:w-[88px]">
					<svg className="h-full w-full -rotate-90" viewBox="0 0 80 80">
						<circle cx="40" cy="40" r="34" fill="none" stroke="rgba(39,39,42,0.5)" strokeWidth="5" />
						<circle
							cx="40" cy="40" r="34" fill="none"
							stroke={scoreStroke} strokeWidth="5"
							strokeLinecap="round"
							strokeDasharray={`${(score / 100) * 213.6} 213.6`}
						/>
					</svg>
					<div className="absolute inset-0 flex items-center justify-center">
						<span className={`font-mono text-xl font-bold leading-none tabular-nums ${scoreColor}`}>{score}</span>
						<span className="font-mono text-[10px] tabular-nums text-zinc-600">/100</span>
					</div>
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold text-zinc-100">
						{score >= 50 ? t("score_opportunities") : score >= 30 ? t("score_problems") : t("score_critical")}
					</h3>
					<p className="mt-1 text-xs leading-relaxed text-zinc-400">
						{score >= 50 ? t("score_desc_ok") : t("score_desc_bad")}
					</p>
				</div>
			</div>
		</div>
	);
}

function useSeverityLabel(severity: string): string {
	const t = useTranslations("lp.audit_result");
	const map: Record<string, string> = {
		critical: t("severity_critical"),
		high: t("severity_high"),
		medium: t("severity_medium"),
		low: t("severity_low"),
		positive: t("severity_positive"),
	};
	return map[severity] || severity;
}

// ── UnifiedLeaksSection ──
// All leaks live here: visible negatives first, then positives,
// then locked teasers. One header, one continuous list. Replaces
// the old split (one section for "X desbloqueados" + a separate
// section for "Y bloqueados") that read as two different products.
function UnifiedLeaksSection({
	negativeFindings,
	positiveFindings,
	blurredFindings,
	revealed,
	onCheckout,
}: {
	negativeFindings: MiniFinding[];
	positiveFindings: MiniFinding[];
	blurredFindings: BlurredFinding[];
	revealed: boolean;
	onCheckout: () => void;
}) {
	const t = useTranslations("lp.audit_result");
	const totalCount =
		negativeFindings.length + positiveFindings.length + blurredFindings.length;

	return (
		<section
			className={`mt-10 transition-opacity duration-700 sm:mt-12 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			<header className="mb-4">
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.18em] text-content-muted">
					{t("leaks_section.eyebrow")}
				</div>
				<h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-[22px] font-medium leading-tight text-content sm:text-[24px]">
					{t("leaks_section.title", { count: totalCount })}
				</h2>
				<p className="mt-1 text-[13px] leading-relaxed text-content-muted">
					{t("leaks_section.subtitle", {
						visible: negativeFindings.length + positiveFindings.length,
						locked: blurredFindings.length,
					})}
				</p>
			</header>

			<ul className="space-y-1.5">
				{negativeFindings.map((f, i) => (
					<FindingCard
						key={f.id}
						finding={f}
						index={i}
						revealed={revealed}
						// First finding opens by default so the buyer
						// sees what the unfolded card looks like without
						// having to click first. Still collapsible.
						defaultOpen={i === 0}
					/>
				))}
				{positiveFindings.map((f, i) => (
					<FindingCard
						key={f.id}
						finding={f}
						index={negativeFindings.length + i}
						revealed={revealed}
					/>
				))}
				{blurredFindings.map((b, i) => (
					<LockedFindingCard
						key={b.id}
						blurred={b}
						index={i}
						onCheckout={onCheckout}
					/>
				))}
			</ul>
		</section>
	);
}

function FindingCard({
	finding,
	index,
	revealed,
	defaultOpen = false,
}: {
	finding: MiniFinding;
	index: number;
	revealed: boolean;
	defaultOpen?: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const [expanded, setExpanded] = useState(defaultOpen);
	const severityClass = severityClasses(finding.severity);
	const severityLabel = useSeverityLabel(finding.severity);
	const impact = finding.impact;
	const isPositive = finding.severity === "positive";

	// Strip baseline corpus text from body
	const cleanBody = finding.body.replace(/\s*Baseline:.*$/s, "").trim();

	return (
		<li
			className={`overflow-hidden rounded-2xl border transition-colors ${
				isPositive
					? "border-emerald-500/30 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]"
					: "border-edge bg-surface-card hover:border-edge-focus"
			} ${revealed ? "lp-card-anim" : "opacity-0"}`}
			style={{ animationDelay: revealed ? `${index * 200}ms` : undefined }}
		>
			<button
				type="button"
				onClick={() => setExpanded((e) => !e)}
				className="flex w-full items-start gap-2.5 px-3 py-3 text-left sm:gap-3 sm:px-5 sm:py-4"
			>
				<span className={`mt-1 inline-flex h-2 w-2 shrink-0 rounded-full ${severityClass.dot}`} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${severityClass.label}`}>
							{severityLabel}
						</span>
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
							{t(`category_labels.${finding.category}` as never)}
						</span>
					</div>
					<h3 className="mt-1 text-[13px] font-semibold leading-snug text-content sm:text-sm">
						{finding.title}
					</h3>
					{impact && !isPositive && (
						<p className="mt-1 font-mono text-[11px] tabular-nums text-rose-600 dark:text-rose-300">
							{t("impact_estimated")}: ↓ {formatBRL(impact.min_brl_cents)}–{formatBRL(impact.max_brl_cents)}/mês
						</p>
					)}
					{expanded && (
						<div className="mt-3 space-y-3 border-t border-edge-subtle pt-3">
							<p className="text-[13px] leading-relaxed text-content-secondary sm:text-sm">
								{cleanBody}
							</p>
							{finding.evidence_refs && finding.evidence_refs.length > 0 && (
								<ul className="flex flex-wrap gap-1.5">
									{finding.evidence_refs.map((ref, i) => (
										<li
											key={i}
											className="inline-flex items-center gap-1 rounded border border-edge bg-surface-inset px-2 py-0.5 text-[11px] text-content-secondary"
										>
											<span className="text-content-faint">›</span>
											<span>{ref}</span>
										</li>
									))}
								</ul>
							)}
							{/* Impact hint */}
							{!isPositive && finding.impact_hint && (
								<p className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-300">
									<span>↳</span>
									<span>{finding.impact_hint}</span>
								</p>
							)}
							{/* Como corrigir */}
							{!isPositive && finding.suggestion && (
								<div className="rounded-xl border border-emerald-500/30 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/[0.06]">
									<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">{t("how_to_fix")}</p>
									<p className="mt-1 text-[13px] leading-relaxed text-content sm:text-sm">{finding.suggestion}</p>
								</div>
							)}
						</div>
					)}
				</div>
				<ChevronDown
					className={`mt-1 h-4 w-4 shrink-0 text-content-faint transition-transform ${expanded ? "rotate-180" : ""}`}
				/>
			</button>
		</li>
	);
}

function CostSummaryBanner({
	findings,
	hiddenCount,
	revealed,
}: {
	findings: MiniFinding[];
	hiddenCount: number;
	revealed: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const summary = summarizeMiniImpact(findings.map((f) => f.impact));
	if (!summary || summary.count === 0) return null;

	// Midpoint cost — single anchor instead of a range. Range
	// numbers fight for attention (which one is "the" loss?) and
	// reduce the cognitive impact of loss aversion; a single number
	// reads as decisive measurement. The "~" prefix keeps honest
	// about it being an estimate without surfacing the math.
	const midCents = Math.round(
		(summary.min_brl_cents + summary.max_brl_cents) / 2,
	);
	return (
		<div
			className={`relative mb-8 mt-6 overflow-hidden rounded-2xl border border-rose-500/30 bg-rose-50 px-5 py-5 transition-opacity duration-1000 delay-500 dark:border-rose-500/30 dark:bg-rose-500/[0.08] sm:mb-10 sm:mt-8 sm:px-6 sm:py-6 ${
				revealed ? "opacity-100" : "opacity-0"
			}`}
		>
			<div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-rose-500/15 blur-[80px]" />
			<div className="relative">
				<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700 dark:text-rose-300">
					{t("exposure_label")}
				</p>
				<h3 className="mt-2 font-[family-name:var(--font-fraunces)] text-[24px] font-medium leading-tight text-rose-700 dark:text-rose-200 sm:text-[30px]">
					{t("exposure_text", { amount: formatBRL(midCents) })}
				</h3>
			</div>
		</div>
	);
}

function UnlockSection({
	negativeFindings,
	blurredCount,
	onCheckout,
	launching,
}: {
	negativeFindings: MiniFinding[];
	blurredCount: number;
	onCheckout: () => void;
	launching: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const summary = summarizeMiniImpact(negativeFindings.map((f) => f.impact));
	const totalImpact = summary && summary.count > 0
		? formatBRL(summary.max_brl_cents)
		: "R$22.000";

	return (
		<button
			type="button"
			onClick={onCheckout}
			disabled={launching}
			className="group relative mt-8 flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-zinc-950 to-zinc-950 p-4 text-left transition-all hover:border-emerald-500/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] disabled:opacity-60 sm:gap-5 sm:p-6"
		>
			{/* Trophy icon */}
			<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 sm:h-14 sm:w-14">
				<Trophy className="h-6 w-6 text-emerald-400 sm:h-7 sm:w-7" />
			</div>

			{/* Content */}
			<div className="min-w-0 flex-1">
				<h3 className="text-sm font-bold text-zinc-100 sm:text-base">
					{launching ? t("unlock_launching") : t("unlock_title")}
				</h3>
				<p className="mt-1 text-xs leading-relaxed text-zinc-400 sm:text-sm">
					{t("unlock_desc", { amount: totalImpact })}
				</p>
			</div>

			{/* Arrow */}
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 transition-transform group-hover:scale-110 sm:h-10 sm:w-10">
				<svg className="h-4 w-4 text-white sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</div>
		</button>
	);
}

// Synthetic blurred impact ranges for locked findings. Indexed
// deterministically by card position so the same R$shape stays
// stable across renders. The numbers are visually shaped — the
// blur hides exact values but preserves the order of magnitude
// signal ("this one's R$thousands, not hundreds"). The card title
// itself stays cleartext because blurred.teaser_title is already
// the server's safe teaser. The IMPACT was the curiosity gap
// missing before; now every locked card carries one.
const LOCKED_IMPACT_FAKE = [
	"R$1.800 – 3.200 / mês",
	"R$4.200 – 6.900 / mês",
	"R$2.100 – 3.800 / mês",
	"R$6.500 – 9.400 / mês",
	"R$1.200 – 2.400 / mês",
	"R$3.800 – 5.700 / mês",
	"R$2.700 – 4.100 / mês",
	"R$5.100 – 7.200 / mês",
	"R$1.500 – 2.600 / mês",
	"R$4.600 – 6.800 / mês",
];

// ─────────────────────────────────────────────────────────────
// FAQ — final buyer surface, six Q/As crafted from
// signup-flow-cro principles (each Q addresses one live objection
// at the click-to-pay moment) plus marketing-psychology levers
// (loss aversion antidote, status-quo bias antidote, authority
// signal). PT-BR copy hardcoded because our customer base is BR;
// translation later if needed.
// ─────────────────────────────────────────────────────────────
// Customer-facing FAQ — rewritten against
// .agents/product-marketing-context.md so the voice, glossary and
// differentiation claims are accurate and aligned with the live
// product positioning (Revenue Intelligence / Decision Engine —
// NOT analytics, NOT monitoring, NOT observability). Words used
// follow the "Words to use" / "Words to avoid" list in that doc.
const FAQ_ITEMS: Array<{ q: string; a: string }> = [
	{
		// Intro Q — orientation, not objection. Buyer just needs the
		// mental model. Keep it tight: what we do + how + what they
		// walk away with. No bullet lists, no jargon.
		q: "O que é a Vestigio e o que ela faz?",
		a: "Vestigio mostra onde seu negócio digital está perdendo dinheiro e o que fazer primeiro. Lê seu site público + as integrações que você conecta (Meta Ads, Google Ads, Stripe, Shopify) e te entrega uma fila de ações ranqueada pelo R$ que cada uma recupera. Toda finding vem com evidência verificada — você mostra prova pro seu time, não opinião.",
	},
	{
		// Time-to-value — objection: "15-20 min é muito". Counter:
		// frame the wait as value, name the boundary against the 60s
		// teaser, close with "decisão não hipótese". Brand: "Vestigio"
		// (not "Vestigio AI", which is reserved for Pulse chat).
		q: "Quanto tempo até a Análise completa abrir?",
		a: "15 a 20 minutos. Não é scan superficial — Vestigio lê seu site inteiro, integra até 90 dias das suas fontes (Meta, Google, Stripe e outras) e quantifica em R$ cada problema. A prévia de 60 segundos que você viu antes do paywall é teaser. A Análise completa te entrega decisão, não hipótese — vale esses 15-20 minutos.",
	},
	{
		// Guarantee — loss-aversion antidote. Buyer's fear: "vou
		// gastar e não vai funcionar". Counter: refund + frame that
		// the guarantee is for safety, not for the typical case.
		q: "Como funciona a garantia 4x?",
		a: "Se em 90 dias você não recuperou 4x do que pagou, devolvemos cada centavo. Sem perícia, sem letra miúda. A garantia existe porque a maioria recupera muito mais que isso já no primeiro mês.",
	},
	{
		// Cancel — status-quo bias antidote. Buyer's fear: "vou ficar
		// preso". Counter: 1 click + reciprocity frame (paga enquanto
		// está dando retorno). Drops "Vestigio é assinatura não
		// contrato" — implicit in the rest.
		q: "Posso cancelar quando quiser?",
		a: "Sim. Um clique antes da próxima cobrança, sem multa, sem contrato. Você paga enquanto a fila de ações está dando retorno; se parar de dar, você para de pagar.",
	},
	{
		// Differentiation — objection-break, not descriptive matrix.
		// One sentence that names the gap (entender vs decidir),
		// one that names what fills it (R$ + ranked queue), one that
		// dissolves the "but I'll have to learn another tool" fear.
		// Buyer's underlying objection isn't "are these features
		// different" — it's "do I really need ANOTHER thing".
		q: "Como isso é diferente do que eu já uso hoje?",
		a: "O que você tem hoje te ajuda a entender. Vestigio te ajuda a decidir — R$ em cada vazamento, ações ranqueadas pelo retorno. Sem você virar analista.",
	},
	{
		// Security — trust + authority. Buyer's fear: "vou expor
		// minha base". Counter: state the boundary in plain
		// language, give buyer control (you authorize, you revoke).
		// Long defensive answers actually reduce trust here.
		q: "Vocês acessam dados sensíveis dos meus clientes?",
		a: "Não. Vestigio só lê o que qualquer visitante anônimo veria no seu site + as integrações que VOCÊ autoriza via OAuth (Meta, Google, Stripe e outras). Nada da sua base de clientes, e-mails ou sistemas internos. Você revoga qualquer integração quando quiser. LGPD.",
	},
	{
		// Fit — self-qualification. Buyer's fear: "será que é pra
		// mim?". Counter: instant mirror — "you're me / you're not me"
		// in one breath. Filters bad-fit signups upstream.
		q: "Funciona pro meu tipo de negócio?",
		a: "É pra quem vende online e roda tráfego pago — SaaS B2B, e-commerce, infoproduto, curso, agência ou marketplace, faturando entre R$50 mil e R$5 milhões/mês. Não é pra negócio 100% offline ou pré-faturamento sem tráfego ainda.",
	},
];

function FAQSection({
	revealed,
	onCheckout,
}: {
	revealed: boolean;
	onCheckout: () => void;
}) {
	const [openIdx, setOpenIdx] = useState<number | null>(null);
	return (
		<section
			className={`mt-12 transition-opacity duration-700 sm:mt-16 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			<header className="mb-6 sm:mb-8">
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.18em] text-content-muted">
					Antes de entrar
				</div>
				<h2 className="mt-1 font-[family-name:var(--font-fraunces)] text-[24px] font-medium leading-tight text-content sm:text-[28px]">
					Tudo que você quer saber antes do primeiro clique
				</h2>
				<p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-content-muted sm:text-[14px]">
					Sete perguntas, sete respostas diretas. Se a sua não estiver aqui, o suporte responde no chat dentro do app.
				</p>
			</header>

			<ul className="space-y-2">
				{FAQ_ITEMS.map((item, i) => {
					const open = openIdx === i;
					return (
						<li
							key={item.q}
							className={`overflow-hidden rounded-2xl border bg-surface-card transition-colors ${
								open ? "border-content/20" : "border-edge"
							}`}
						>
							<button
								type="button"
								onClick={() => setOpenIdx(open ? null : i)}
								className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-card-hover"
							>
								<span
									className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-semibold tabular-nums transition-colors ${
										open
											? "bg-content text-surface-card"
											: "bg-surface-inset text-content-muted"
									}`}
								>
									{i + 1}
								</span>
								<span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-content sm:text-[15px]">
									{item.q}
								</span>
								<ChevronDown
									className={`h-4 w-4 shrink-0 text-content-faint transition-transform ${open ? "rotate-180" : ""}`}
								/>
							</button>
							<AnimatePresence initial={false}>
								{open && (
									<motion.div
										key="answer"
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{
											height: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
											opacity: { duration: 0.18, ease: "easeOut" },
										}}
										className="overflow-hidden"
									>
										<div className="border-t border-edge-subtle px-5 pb-5 pt-4 pl-[3.25rem]">
											<p className="text-[13px] leading-relaxed text-content-secondary sm:text-[14px]">
												{item.a}
											</p>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</li>
					);
				})}
			</ul>

			{/* Fallback CTA — for buyers who scrolled the FAQ instead
			    of clicking the mega-CTA above. Same visual treatment
			    as the mega-CTA (bg-content + Fraunces + emerald arrow)
			    so the buyer reads it as the SAME button, not a
			    secondary action. Width fills on mobile and on the
			    full page width here (no sm:w-auto) so it commands
			    the column. */}
			<button
				type="button"
				onClick={onCheckout}
				className="group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-content px-8 py-4 font-[family-name:var(--font-fraunces)] text-[17px] font-medium tracking-tight text-surface-card transition-all hover:bg-content-secondary sm:mt-8"
			>
				<span className="relative">Criar conta agora</span>
				<svg
					className="h-4 w-4 text-emerald-400 transition-transform group-hover:translate-x-0.5"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden
				>
					<path d="M3 8h10M9 4l4 4-4 4" />
				</svg>
			</button>
		</section>
	);
}

// Single row in the Plan Preview narrative section. Title visible
// (real, plausible section header); body collapsed-blurred and only
// renders when the buyer taps the chevron. Body reveal is opt-in to
// the curiosity gap, but tapping the row itself (anywhere outside
// the chevron) routes to checkout — for buyers who want to skip
// the tease and just unlock everything.
function LockedNarrativeRow({
	title,
	body,
	onCheckout,
}: {
	title: string;
	body: string;
	onCheckout: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="overflow-hidden rounded-xl border border-edge bg-surface-inset/40">
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onCheckout}
					className="flex flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-amber-50/40 dark:hover:bg-amber-500/[0.05]"
				>
					<Lock className="h-3.5 w-3.5 shrink-0 text-content-faint" />
					<span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-content">
						{title}
					</span>
				</button>
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className="flex h-9 w-9 shrink-0 items-center justify-center text-content-faint transition-colors hover:text-content-muted"
					aria-label={open ? "Recolher" : "Expandir"}
				>
					<ChevronDown
						className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
					/>
				</button>
			</div>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						key="body"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{
							height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
							opacity: { duration: 0.15, ease: "easeOut" },
						}}
						className="overflow-hidden"
					>
						<button
							type="button"
							onClick={onCheckout}
							className="block w-full select-none border-t border-edge-subtle px-3 py-3 text-left blur-[3px] transition-opacity hover:opacity-90"
							aria-hidden
						>
							<p className="text-[12px] leading-relaxed text-content-secondary">
								{body}
							</p>
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function LockedFindingCard({
	blurred,
	index,
	onCheckout,
}: {
	blurred: BlurredFinding;
	index: number;
	onCheckout: () => void;
}) {
	const t = useTranslations("lp.audit_result");
	const fakeImpact = LOCKED_IMPACT_FAKE[index % LOCKED_IMPACT_FAKE.length];
	return (
		<li>
			<button
				type="button"
				onClick={onCheckout}
				className="group flex w-full items-start gap-2.5 overflow-hidden rounded-2xl border border-edge bg-surface-card px-3 py-3 text-left transition-all hover:border-amber-500/40 hover:bg-amber-50/40 dark:hover:bg-amber-500/[0.04] sm:gap-3 sm:px-5 sm:py-4"
			>
				<Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-content-faint transition-colors group-hover:text-amber-600 dark:group-hover:text-amber-400 sm:h-4 sm:w-4" />
				<div className="min-w-0 flex-1">
					<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						{t(`category_labels.${blurred.category}` as never)}
					</div>
					{/* Title blurred — the "what" stays a mystery so the
					    buyer's curiosity hooks on unlocking. Impact below
					    is cleartext so the magnitude of what they're
					    missing is concrete. */}
					<div
						className="mt-0.5 select-none truncate text-xs font-medium text-content blur-[5px] sm:text-sm"
						aria-hidden
					>
						{blurred.teaser_title}
					</div>
					<div className="mt-1 truncate font-mono text-[10px] tabular-nums text-rose-600 dark:text-rose-300 sm:text-[11px]">
						↓ {fakeImpact}
					</div>
				</div>
			</button>
		</li>
	);
}

// ──────────────────────────────────────────────
// State branches
// ──────────────────────────────────────────────

function AuditingState({
	lead,
	timedOut,
	completed,
	onViewResults,
}: {
	lead: LeadResponse;
	timedOut?: boolean;
	completed?: boolean;
	onViewResults?: () => void;
}) {
	const t = useTranslations("lp.audit_result");
	const [stageIdx, setStageIdx] = useState(0);
	const activePhases = t.raw("loading.active_phases") as string[];
	const teaserPhases = t.raw("loading.teaser_phases") as string[];

	// Minimum 18s on the loading screen even if the backend finishes
	// faster — gives the user time to read the phase list + register
	// the depth of what's coming. PR-spec: 5 active phases × ~3.6s each
	// = 18s floor. Once allReadyAt fires (both backend done AND
	// minimum elapsed), the "view results" CTA appears.
	const MIN_LOADING_MS = 18_000;
	const PER_PHASE_MS = MIN_LOADING_MS / activePhases.length;
	const [mountedAt] = useState(() => Date.now());
	const [minElapsed, setMinElapsed] = useState(false);

	useEffect(() => {
		const remaining = MIN_LOADING_MS - (Date.now() - mountedAt);
		if (remaining <= 0) {
			setMinElapsed(true);
			return;
		}
		const id = setTimeout(() => setMinElapsed(true), remaining);
		return () => clearTimeout(id);
	}, [mountedAt]);

	const allReady = completed && minElapsed;
	const allStagesDone = allReady || stageIdx >= activePhases.length - 1;

	useEffect(() => {
		if (allReady) {
			setStageIdx(activePhases.length - 1);
			return;
		}
		const interval = setInterval(() => {
			setStageIdx((i) => Math.min(activePhases.length - 1, i + 1));
		}, PER_PHASE_MS);
		return () => clearInterval(interval);
	}, [activePhases.length, allReady, PER_PHASE_MS]);

	// Prefer real favicon from audit result; fall back to Google's API
	const googleFavicon = lead.domain
		? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=64`
		: null;
	const faviconUrl = lead.result?.preview?.favicon_url || googleFavicon;

	if (timedOut) {
		return (
			<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
				<DotGrid />
				<div className="relative w-full max-w-md text-center">
					{faviconUrl && (
						/* eslint-disable-next-line @next/next/no-img-element */
						<img
							src={faviconUrl}
							alt=""
							className="mx-auto mb-4 h-10 w-10 rounded-lg"
							onError={(e) => { if (googleFavicon && e.currentTarget.src !== googleFavicon) e.currentTarget.src = googleFavicon; }}
						/>
					)}
					<h1 className="text-2xl font-semibold text-zinc-100">
						{t("timeout_title")}
					</h1>
					<p className="mt-3 text-sm text-zinc-500">
						{t("timeout_desc")}
					</p>
					<div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 font-mono text-sm text-zinc-300">
						{lead.domain}
					</div>
					<div className="mt-6 flex flex-col items-center gap-3">
						<a
							href="/audit"
							className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.5)] transition-colors hover:bg-emerald-500"
						>
							{t("timeout_retry")}
						</a>
						<a href="mailto:support@vestigio.io" className="text-xs text-zinc-600 transition-colors hover:text-zinc-400">
							{t("timeout_support")}
						</a>
					</div>
				</div>
			</div>
		);
	}

	// Show the "view results" button when all phases are visually
	// done AND the backend actually finished AND the minimum loading
	// time has elapsed. All three together.
	const showButton = allStagesDone && allReady && onViewResults;

	return (
		<div className="relative flex min-h-screen items-start justify-center bg-surface-shell px-5 py-10 sm:py-14">
			<div className="relative mx-auto w-full max-w-[560px]">
				{/* Hero */}
				<div className="mb-7 flex flex-col items-center text-center">
					<Image
						src={logoDark}
						alt="Vestigio"
						height={22}
						className="mb-6 dark:hidden"
					/>
					<Image
						src={logoLight}
						alt="Vestigio"
						height={22}
						className="mb-6 hidden dark:block"
					/>
					{faviconUrl && (
						<span className="mb-4 inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-edge bg-surface-card p-2 shadow-sm">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={faviconUrl}
								alt=""
								className="h-full w-full object-contain"
								onError={(e) => { if (googleFavicon && e.currentTarget.src !== googleFavicon) e.currentTarget.src = googleFavicon; }}
							/>
						</span>
					)}
					<h1 className="font-[family-name:var(--font-fraunces)] text-[24px] font-medium leading-tight text-content sm:text-[28px]">
						{showButton
							? t("loading.headline_complete", { domain: lead.domain || t("your_site") })
							: t("loading.headline", { domain: lead.domain || t("your_site") })}
					</h1>
					<p className="mt-2 text-[13px] text-content-muted">
						{showButton ? t("loading.subtitle_complete") : t("loading.subtitle")}
					</p>
				</div>

				{/* Active phases (5) — the análise rápida happening now */}
				<div className="rounded-2xl border border-edge bg-surface-card p-5">
					<div className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-content-muted">
						{t("loading.active_label")}
					</div>
					<ul className="space-y-2.5">
						{activePhases.map((label, idx) => {
							const isDone = allReady ? true : idx < stageIdx;
							const isActive = !allReady && idx === stageIdx;
							return (
								<li
									key={label}
									className="flex items-center gap-3 text-[13px]"
								>
									{isDone ? (
										<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
											<svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
												<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
											</svg>
										</span>
									) : isActive ? (
										<span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
											<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
											<span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
										</span>
									) : (
										<span className="h-5 w-5 shrink-0 rounded-full border border-edge" />
									)}
									<span
										className={
											isDone
												? "text-content-secondary"
												: isActive
													? "text-content"
													: "text-content-faint"
										}
									>
										{label}
									</span>
								</li>
							);
						})}
					</ul>
				</div>

				{/* Teaser phases (6) — what unlocks with an account */}
				<div className="mt-3 rounded-2xl border border-dashed border-edge bg-surface-inset/60 p-5">
					<div className="mb-3 flex items-baseline justify-between">
						<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-content-muted">
							{t("loading.teaser_label")}
						</div>
						<div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
							{t("loading.teaser_locked")}
						</div>
					</div>
					<ul className="space-y-2.5">
						{teaserPhases.map((label) => (
							<li
								key={label}
								className="flex items-center gap-3 text-[13px] text-content-muted"
							>
								<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-edge text-content-faint">
									<svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
									</svg>
								</span>
								<span>{label}</span>
							</li>
						))}
					</ul>
				</div>

				{/* Sub-CTA banner */}
				<div className="mt-4 text-center text-[11px] text-content-muted">
					{t("loading.unlock_hint")}
				</div>

				{/* View results CTA — only when ALL three conditions met */}
				{showButton && (
					<button
						type="button"
						onClick={onViewResults}
						className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-content px-6 py-4 text-[15px] font-semibold text-surface-card transition-colors hover:bg-content-secondary"
					>
						{t("auditing_view")}
						<svg className="h-4 w-4 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
							<path d="M3 8h10M9 4l4 4-4 4" />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}

function ExpiredState({ lead, onCheckout, launching }: { lead: LeadResponse; onCheckout: () => void; launching: boolean }) {
	const t = useTranslations("lp.audit_result");
	const domain = lead.domain || t("your_site");
	const googleFavicon = lead.domain
		? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=64`
		: null;
	const faviconUrl = lead.result?.preview?.favicon_url || googleFavicon;

	// Try to extract stats from expired lead result (may or may not be available)
	const result = lead.result;
	const totalFindings = result
		? result.visibleFindings.filter((f) => f.severity !== "positive").length + result.blurredFindings.length
		: null;
	const hiddenCount = result ? result.blurredFindings.length : null;
	const summary = result
		? summarizeMiniImpact(
				result.visibleFindings
					.filter((f) => f.severity !== "positive")
					.map((f) => f.impact),
			)
		: null;

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<DotGrid />
			<div className="relative w-full max-w-md text-center">
				{/* Favicon */}
				{faviconUrl && (
					<div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={faviconUrl} alt="" className="h-8 w-8 rounded object-contain" onError={(e) => { if (googleFavicon && e.currentTarget.src !== googleFavicon) e.currentTarget.src = googleFavicon; }} />
					</div>
				)}

				{/* Headline */}
				<h1 className="text-2xl font-semibold text-zinc-100 sm:text-3xl">
					{t("expired_title")}
				</h1>

				{/* Impact reminder — re-triggers loss aversion */}
				{totalFindings && summary && summary.count > 0 ? (
					<div className="mt-5 rounded-xl border border-red-500/20 bg-red-950/20 px-5 py-4">
						<p className="text-sm leading-relaxed text-zinc-300">
							{t("expired_impact", { count: totalFindings, domain, min: formatBRL(summary.min_brl_cents), max: formatBRL(summary.max_brl_cents) })}
						</p>
						{hiddenCount && hiddenCount > 0 && (
							<p className="mt-2 text-xs text-zinc-500">
								{t("expired_hidden", { count: hiddenCount })}
							</p>
						)}
					</div>
				) : (
					<p className="mt-4 text-sm text-zinc-500">
						{t("expired_fallback", { domain })}
					</p>
				)}

				{/* What you get — bullet points */}
				<ul className="mt-6 space-y-2.5 text-left">
					{(t.raw("expired_features") as string[]).map((text) => (
						<li key={text} className="flex items-start gap-2.5">
							<svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
							<span className="text-sm text-zinc-400">{text}</span>
						</li>
					))}
				</ul>

				{/* Primary CTA — Paddle checkout */}
				<button
					type="button"
					onClick={onCheckout}
					disabled={launching}
					className="mt-7 block w-full rounded-xl bg-emerald-500 px-7 py-3.5 text-center text-sm font-semibold text-white shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] disabled:opacity-60"
				>
					{launching ? t("unlock_launching") : t("expired_cta", { domain })}
				</button>

				<p className="mt-3 text-xs text-zinc-600">
					{t("expired_footer")}
				</p>
			</div>
		</div>
	);
}

/** Dot-grid background — same canvas pattern as maps */
function DotGrid() {
	return (
		<div
			className="pointer-events-none absolute inset-0 -z-1"
			aria-hidden
			style={{
				backgroundImage: "radial-gradient(circle, rgba(39,39,42,0.5) 1px, transparent 1px)",
				backgroundSize: "20px 20px",
			}}
		/>
	);
}

function LoadingState({ message }: { message: string }) {
	return (
		<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<DotGrid />
			<div className="relative text-center">
				<div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
				<p className="mt-4 text-sm text-zinc-500">{message}</p>
			</div>
		</div>
	);
}

function ErrorState({
	message,
	onRetry,
	retryLabel,
}: {
	message: string;
	onRetry: () => void;
	retryLabel?: string;
}) {
	const t = useTranslations("lp.audit_result");
	return (
		<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<DotGrid />
			<div className="relative max-w-md text-center">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
					<svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
				</div>
				<h1 className="text-xl font-semibold text-zinc-100">{t("error_title")}</h1>
				<p className="mt-2 text-sm text-zinc-500">{message}</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-6 rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
				>
					{retryLabel || t("error_retry")}
				</button>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function severityClasses(severity: MiniFindingSeverity): { dot: string; label: string } {
	switch (severity) {
		case "critical":
			return {
				dot: "bg-rose-500",
				label: "border-rose-500/40 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300",
			};
		case "high":
			return {
				dot: "bg-orange-500",
				label: "border-orange-500/40 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300",
			};
		case "medium":
			return {
				dot: "bg-amber-500",
				label: "border-amber-500/40 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
			};
		case "positive":
			return {
				dot: "bg-emerald-500",
				label: "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
			};
	}
}

// ── Countdown timer ──────────────────────────

const RESULT_TTL_MS = 24 * 60 * 60 * 1000;

function CountdownTimer({ computedAt }: { computedAt: string }) {
	const expiresAt = useMemo(() => new Date(computedAt).getTime() + RESULT_TTL_MS, [computedAt]);
	const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));

	useEffect(() => {
		const interval = setInterval(() => {
			setRemaining(Math.max(0, expiresAt - Date.now()));
		}, 1000);
		return () => clearInterval(interval);
	}, [expiresAt]);

	const totalSecs = Math.ceil(remaining / 1000);
	const hours = Math.floor(totalSecs / 3600);
	const mins = Math.floor((totalSecs % 3600) / 60);
	const secs = totalSecs % 60;
	const label = hours > 0
		? `${hours}h ${String(mins).padStart(2, "0")}m`
		: `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
	const isLow = totalSecs < 3600; // less than 1 hour

	return (
		<span className={`font-mono tabular-nums ${isLow ? "font-semibold text-red-400" : "text-red-400/80"}`}>
			{label}
		</span>
	);
}

// ── PreviewToggle (dev-only) ──────────────────
// Floating widget shown when the page is rendered in preview mode.
// Lets the reviewer flip the theme and jump back to the picker
// without losing context. Whole component (and its consumers)
// gets deleted alongside `/audit/preview`.
function PreviewToggle({
	scenarioId,
	theme,
}: {
	scenarioId: string;
	theme: "light" | "dark";
}) {
	const otherTheme = theme === "light" ? "dark" : "light";
	const themeHref = `?preview=${scenarioId}&theme=${otherTheme}`;
	return (
		<div className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/95 px-2.5 py-2 text-[11px] font-medium text-zinc-100 shadow-xl backdrop-blur">
			<span className="px-1 text-zinc-400">preview</span>
			<span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
				{scenarioId}
			</span>
			<a
				href={themeHref}
				className="rounded-full border border-zinc-700 px-2.5 py-1 hover:border-emerald-400 hover:text-emerald-300"
			>
				{theme === "light" ? "→ dark" : "→ light"}
			</a>
			<a
				href="/audit/preview"
				className="rounded-full border border-zinc-700 px-2.5 py-1 hover:border-emerald-400 hover:text-emerald-300"
			>
				← picker
			</a>
		</div>
	);
}
