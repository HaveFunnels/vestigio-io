"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import Image from "next/image";
import { Trophy, ShieldCheck, ShieldX, Lock, Sparkles, CheckCircle2, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

declare global {
	interface Window {
		Paddle: any;
	}
}
import type { LandingPreview } from "../../../../../../../workers/ingestion/landing-preview";
import type {
	MiniFinding,
	BlurredFinding,
	MiniFindingSeverity,
} from "../../../../../../../workers/ingestion/mini-audit-findings";
import {
	formatBRL,
	summarizeMiniImpact,
} from "../../../../../../../packages/impact/mini-impact";
import logoDark from "@/../public/images/logo/logo.png";

// ──────────────────────────────────────────────
// /lp/audit/result/[leadId] — Mini-Audit Result
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
}

export default function MiniAuditResultPage() {
	const t = useTranslations("lp.audit_result");
	const params = useParams<{ leadId: string }>();
	const router = useRouter();
	const leadId = params?.leadId;

	const [lead, setLead] = useState<LeadResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [revealed, setRevealed] = useState(false);
	const [shareCopied, setShareCopied] = useState(false);
	const [showResults, setShowResults] = useState(false);
	const [timedOut, setTimedOut] = useState(false);
	const [paddleReady, setPaddleReady] = useState(false);
	const [checkoutEmail, setCheckoutEmail] = useState<string | null>(null);
	const [launching, setLaunching] = useState(false);
	const pollAttemptsRef = useRef(0);

	// ── Paddle initialization ──
	const initPaddle = useCallback(() => {
		if (typeof window === "undefined" || !window.Paddle) return;
		try {
			window.Paddle.Environment.set(
				process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
			);
			window.Paddle.Initialize({
				token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
				eventCallback: (event: any) => {
					if (event.name === "checkout.completed" && event.data?.status === "completed") {
						router.push(`/lp/audit/thank-you/${leadId}`);
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

	// ── Open Paddle checkout ──
	function openCheckout() {
		if (!leadId || !window.Paddle || !paddleReady) {
			setError(t("error_payment_loading"));
			return;
		}
		if (!LP_PRICE_ID) {
			setError(t("error_prices_missing"));
			return;
		}
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
				successUrl: `${window.location.origin}/lp/audit/thank-you/${leadId}`,
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
		link.href = `${window.location.origin}/lp/audit/result/${leadId}`;
		document.head.appendChild(link);
		return () => { document.head.removeChild(link); };
	}, [leadId]);

	// ── Polling loop ──
	const fetchLead = useCallback(async () => {
		if (!leadId) return;
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
		if (!lead) return;
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
	}, [lead, fetchLead]);

	// ── Share handling ──
	function copyShareLink() {
		if (typeof window === "undefined") return;
		const url = window.location.href;
		navigator.clipboard
			.writeText(url)
			.then(() => {
				setShareCopied(true);
				setTimeout(() => setShareCopied(false), 2000);
			})
			.catch(() => {
				setError(t("error_copy_failed"));
			});
	}

	// ── Render branches ──

	if (error) {
		return (
			<ErrorState message={error} onRetry={() => { setError(null); fetchLead(); }} />
		);
	}

	if (!lead) {
		return <LoadingState message={t("loading")} />;
	}

	if (lead.status === "expired") {
		return (
			<>
				<Script src="https://cdn.paddle.com/paddle/v2/paddle.js" onLoad={initPaddle} strategy="afterInteractive" />
				<ExpiredState lead={lead} onCheckout={openCheckout} launching={launching} />
			</>
		);
	}

	const isAuditComplete = lead.status === "audit_complete" && lead.result;

	// Still auditing — show progress
	if (!isAuditComplete) {
		return <AuditingState lead={lead} timedOut={timedOut} />;
	}

	// Audit done but user hasn't clicked to see results yet
	if (!showResults) {
		return (
			<AuditingState
				lead={lead}
				timedOut={timedOut}
				completed
				onViewResults={() => {
					setShowResults(true);
					setTimeout(() => setRevealed(true), 80);
				}}
			/>
		);
	}

	// ── Results view ──
	const { preview, visibleFindings, blurredFindings, computedAt } = lead.result!;

	// Separate negative vs positive — both shown, but only negatives count toward limit
	const negativeFindings = visibleFindings.filter((f) => f.severity !== "positive");
	const positiveFindings = visibleFindings.filter((f) => f.severity === "positive");
	const totalFindings = negativeFindings.length + blurredFindings.length;

	return (
		<>
			{/* Paddle script */}
			<Script src="https://cdn.paddle.com/paddle/v2/paddle.js" onLoad={initPaddle} strategy="afterInteractive" />

			<div className="relative min-h-screen bg-[#fafafa]">
				{/* Brand strip — light theme, sticky CTA */}
				<header className="sticky top-0 z-30 border-b border-zinc-200 bg-[#fafafa]/85 backdrop-blur-md px-4 py-3">
					<div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
						<Link href="/lp" className="flex items-center">
							<Image src={logoDark} alt="Vestigio" height={22} />
						</Link>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={copyShareLink}
								className="hidden items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 sm:flex"
							>
								{shareCopied ? (
									<>
										<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
										<span>{t("share_copied")}</span>
									</>
								) : (
									<>
										<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
										</svg>
										<span>{t("share")}</span>
									</>
								)}
							</button>
							<button
								type="button"
								onClick={openCheckout}
								disabled={launching}
								className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-4 py-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:bg-emerald-200 disabled:opacity-60"
							>
								{t("cta_create_account")}
								<svg className="h-3 w-3 text-emerald-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
									<path d="M3 8h10M9 4l4 4-4 4" />
								</svg>
							</button>
						</div>
					</div>
				</header>

				<main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
					{/* Result header — favicon + Fraunces title + counts strip */}
					<ResultHeader
						preview={preview}
						domain={lead.domain || ""}
						negativeCount={negativeFindings.length}
						blurredCount={blurredFindings.length}
						revealed={revealed}
					/>

					{/* Plan of Strategy preview — Wave-22.6 spec: lives at the
					    top, lays out the destination product. Personalized
					    by JTBD answers when available. */}
					<PlanPreviewSection
						domain={lead.domain || ""}
						organizationName={lead.organizationName || lead.domain || ""}
						primaryConcern={lead.primaryConcern ?? null}
						whyNow={lead.whyNow ?? null}
						negativeCount={negativeFindings.length}
						blurredCount={blurredFindings.length}
						revealed={revealed}
						onCheckout={openCheckout}
						launching={launching}
					/>

					{/* Negative findings */}
					<section className={`mt-10 transition-opacity duration-700 sm:mt-12 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="mb-3 flex items-end justify-between">
							<div>
								<span className="mb-2 inline-block rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
									{t("badge_free")}
								</span>
								<h2 className="font-[family-name:var(--font-fraunces)] text-[20px] font-medium leading-tight text-zinc-900 sm:text-[22px]">
									{negativeFindings.length === 1 ? t("findings_unlocked_one", { count: negativeFindings.length }) : t("findings_unlocked_other", { count: negativeFindings.length })}
								</h2>
							</div>
						</header>

						<ul className="space-y-1.5">
							{negativeFindings.map((f, i) => (
								<FindingCard key={f.id} finding={f} index={i} revealed={revealed} />
							))}
						</ul>
					</section>

					{/* Positive findings */}
					{positiveFindings.length > 0 && (
						<section className={`mt-6 transition-opacity duration-700 sm:mt-8 ${revealed ? "opacity-100" : "opacity-0"}`}>
							<ul className="space-y-1.5">
								{positiveFindings.map((f, i) => (
									<FindingCard key={f.id} finding={f} index={i} revealed={revealed} />
								))}
							</ul>
						</section>
					)}

					{/* Cost summary banner */}
					<CostSummaryBanner findings={negativeFindings} hiddenCount={blurredFindings.length} revealed={revealed} />

					{/* Locked findings grid */}
					<section className={`mt-10 transition-opacity duration-1000 delay-700 sm:mt-12 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="mb-4">
							<span
								className="mb-2 inline-block rounded-full border border-emerald-500/30 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700"
							>
								<Sparkles className="mr-1 inline h-3 w-3" />
								{t("badge_premium")}
							</span>
							<h2 className="font-[family-name:var(--font-fraunces)] text-[20px] font-medium leading-tight text-zinc-900 sm:text-[22px]">
								{t("findings_to_unlock", { count: blurredFindings.length })}
							</h2>
						</header>

						<ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
							{blurredFindings.map((b) => (
								<LockedFindingCard key={b.id} blurred={b} onCheckout={openCheckout} />
							))}
						</ul>

						{/* Unlock section — horizontal CTA card → Paddle checkout */}
						<UnlockSection negativeFindings={negativeFindings} blurredCount={blurredFindings.length} onCheckout={openCheckout} launching={launching} />
					</section>

					{/* Footer */}
					<footer className="mt-12 border-t border-zinc-200 pt-6 text-center text-xs text-zinc-500">
						{t("footer", { visible: negativeFindings.length, total: totalFindings })}
					</footer>
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
	negativeCount,
	blurredCount,
	revealed,
}: {
	preview: LandingPreview;
	domain: string;
	negativeCount: number;
	blurredCount: number;
	revealed: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const googleFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.host)}&sz=64`;
	const [faviconSrc, setFaviconSrc] = useState(preview.favicon_url || googleFavicon);
	const totalCount = negativeCount + blurredCount;
	// Critical count from server-side cuts + visible critical findings.
	// The mini-audit knows roughly how many criticals exist; blurred
	// teasers seed the "X critical that you haven't seen" curiosity.
	// Heuristic: ~1/4 of blurred are critical-grade (cross-signal
	// compound findings often are).
	const criticalEstimate = Math.max(
		1,
		Math.ceil(blurredCount * 0.25) + Math.floor(negativeCount * 0.3),
	);

	return (
		<div
			className={`mb-8 flex flex-col items-start gap-4 transition-opacity duration-700 sm:flex-row sm:items-center sm:gap-5 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			<span className="inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={faviconSrc}
					alt=""
					className="h-full w-full object-contain"
					onError={() => {
						if (faviconSrc !== googleFavicon) setFaviconSrc(googleFavicon);
					}}
				/>
			</span>
			<div className="min-w-0 flex-1">
				<h1 className="font-[family-name:var(--font-fraunces)] text-[26px] font-medium leading-tight text-zinc-900 sm:text-[30px]">
					{t("header.title", { domain })}
				</h1>
				<div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-[family-name:var(--font-jetbrains-mono)] text-[12px] tabular-nums">
					<span className="font-semibold text-zinc-900">
						{totalCount}
					</span>
					<span className="text-zinc-500">{t("header.findings_label")}</span>
					<span className="text-zinc-300">·</span>
					<span className="font-semibold text-rose-600">{criticalEstimate}</span>
					<span className="text-zinc-500">{t("header.critical_label")}</span>
					<span className="text-zinc-300">·</span>
					<span className="font-semibold text-zinc-900">{totalCount}</span>
					<span className="text-zinc-500">{t("header.actions_label")}</span>
				</div>
			</div>
		</div>
	);
}

// ── PlanPreviewSection (Wave-22.6 spec — block #1 of the new result) ──
// Sits at the top of the result page. Lays out the Monthly Strategy
// Plan the visitor WOULD get as a paid Vestigio user, with strategic
// content cuts (NOT blur — DevTools-immune) so they see the shape
// and feel the want without us giving away the value.
function PlanPreviewSection({
	domain,
	organizationName,
	primaryConcern,
	whyNow,
	negativeCount,
	blurredCount,
	revealed,
	onCheckout,
	launching,
}: {
	domain: string;
	organizationName: string;
	primaryConcern: string | null;
	whyNow: string | null;
	negativeCount: number;
	blurredCount: number;
	revealed: boolean;
	onCheckout: () => void;
	launching: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const nextStepCount = Math.max(5, Math.ceil((negativeCount + blurredCount) / 2));
	// Concern-driven narrative spark — first 1-2 sentences personalized.
	// The visitor's chosen concern shapes the opening line. JTBD-pull
	// (whyNow) optional, used at the close. Everything after the
	// SECOND sentence is server-side cut.
	const concernKey = primaryConcern || "unknown_leak";
	const narrativeOpening = t(`plan_preview.concern_openings.${concernKey}` as never, { org: organizationName });
	const monthLabel = (() => {
		const now = new Date();
		const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
		return `${months[now.getMonth()]} ${now.getFullYear()}`;
	})();

	return (
		<section
			className={`relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 transition-opacity duration-700 sm:p-8 ${revealed ? "opacity-100" : "opacity-0"}`}
		>
			{/* Header */}
			<div className="mb-5 flex items-baseline justify-between gap-3">
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
					{t("plan_preview.eyebrow")}
				</div>
				<div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
					<Sparkles className="h-2.5 w-2.5" />
					{t("plan_preview.preview_badge")}
				</div>
			</div>

			{/* Plan title + month */}
			<div className="mb-6">
				<h2 className="font-[family-name:var(--font-fraunces)] text-[26px] font-medium leading-tight text-zinc-900 sm:text-[30px]">
					{t("plan_preview.title", { month: monthLabel, org: organizationName })}
				</h2>
			</div>

			{/* Hero metric stub — skeleton shimmer for the real numbers */}
			<div className="mb-6 grid grid-cols-3 gap-3">
				{[0, 1, 2].map((i) => (
					<div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
						<div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
							{t(`plan_preview.hero.label_${i}` as never)}
						</div>
						<div className="mt-2 h-6 w-3/4 overflow-hidden rounded-md">
							<div className="skeleton-shimmer h-full w-full" />
						</div>
					</div>
				))}
			</div>

			{/* Narrative — 2 sentences visible, rest server-cut */}
			<div className="mb-6">
				<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
					{t("plan_preview.narrative_label")}
				</div>
				<p className="mt-2 font-[family-name:var(--font-fraunces)] text-[16px] leading-relaxed text-zinc-800">
					{narrativeOpening}
				</p>
				<p className="mt-2 text-[12px] text-zinc-400">
					{t("plan_preview.narrative_continues")}
				</p>
			</div>

			{/* Next steps — first 2 titles visible, rest cut */}
			<div className="mb-6">
				<div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
					{t("plan_preview.next_steps_label", { count: nextStepCount })}
				</div>
				<ol className="space-y-2.5">
					{[1, 2].map((order) => (
						<li
							key={order}
							className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
						>
							<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 font-[family-name:var(--font-fraunces)] text-[13px] font-semibold text-emerald-700">
								{order}
							</span>
							<div className="min-w-0 flex-1">
								<div className="text-[13px] font-medium text-zinc-900">
									{t(`plan_preview.next_step_${order}` as never)}
								</div>
								<div className="mt-0.5 text-[11px] text-zinc-500">
									{t(`plan_preview.next_step_${order}_hint` as never)}
								</div>
							</div>
						</li>
					))}
					{/* Server-cut: rest of steps are not in the DOM. We show
					    skeleton-shimmer placeholders for them. */}
					{Array.from({ length: Math.max(0, nextStepCount - 2) }).map((_, i) => (
						<li
							key={`shim-${i}`}
							className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
						>
							<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-[family-name:var(--font-fraunces)] text-[13px] font-semibold text-zinc-400">
								{i + 3}
							</span>
							<div className="min-w-0 flex-1 space-y-1.5">
								<div className="skeleton-shimmer h-3 w-3/4 rounded-md" />
								<div className="skeleton-shimmer h-2.5 w-1/2 rounded-md" />
							</div>
							<svg className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
							</svg>
						</li>
					))}
				</ol>
			</div>

			{/* Inline CTA */}
			<button
				type="button"
				onClick={onCheckout}
				disabled={launching}
				className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-[14px] font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-600 disabled:opacity-60"
			>
				{t("plan_preview.unlock_cta")}
				<svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
					<path d="M3 8h10M9 4l4 4-4 4" />
				</svg>
			</button>
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

function FindingCard({
	finding,
	index,
	revealed,
}: {
	finding: MiniFinding;
	index: number;
	revealed: boolean;
}) {
	const t = useTranslations("lp.audit_result");
	const [expanded, setExpanded] = useState(false);
	const severityClass = severityClasses(finding.severity);
	const severityLabel = useSeverityLabel(finding.severity);
	const impact = finding.impact;
	const isPositive = finding.severity === "positive";

	// Strip baseline corpus text from body
	const cleanBody = finding.body.replace(/\s*Baseline:.*$/s, "").trim();

	return (
		<li
			className={`overflow-hidden rounded-2xl border transition-colors ${
				isPositive ? "border-emerald-500/15 bg-emerald-500/[0.03]" : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
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
						<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
							{finding.category}
						</span>
					</div>
					<h3 className="mt-1 text-[13px] font-semibold leading-snug text-zinc-100 sm:text-sm">
						{finding.title}
					</h3>
					{impact && !isPositive && (
						<p className="mt-1 font-mono text-[11px] tabular-nums text-red-400/90">
							{t("impact_estimated")}: ↓ {formatBRL(impact.min_brl_cents)}–{formatBRL(impact.max_brl_cents)}/mês
						</p>
					)}
					{expanded && (
						<div className="mt-3 space-y-3 border-t border-zinc-800/50 pt-3">
							<p className="text-[13px] leading-relaxed text-zinc-400 sm:text-sm">
								{cleanBody}
							</p>
							{finding.evidence_refs && finding.evidence_refs.length > 0 && (
								<ul className="flex flex-wrap gap-1.5">
									{finding.evidence_refs.map((ref, i) => (
										<li
											key={i}
											className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-400"
										>
											<span className="text-zinc-600">›</span>
											<span>{ref}</span>
										</li>
									))}
								</ul>
							)}
							{/* Impact hint */}
							{!isPositive && finding.impact_hint && (
								<p className="inline-flex items-center gap-1.5 text-xs text-red-400/80">
									<span>↳</span>
									<span>{finding.impact_hint}</span>
								</p>
							)}
							{/* Como corrigir */}
							{!isPositive && finding.suggestion && (
								<div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-4 py-3">
									<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">{t("how_to_fix")}</p>
									<p className="mt-1 text-[13px] leading-relaxed text-zinc-300">{finding.suggestion}</p>
								</div>
							)}
						</div>
					)}
				</div>
				<ChevronDown
					className={`mt-1 h-4 w-4 shrink-0 text-zinc-600 transition-transform ${expanded ? "rotate-180" : ""}`}
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

	return (
		<div
			className={`relative mt-6 overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/30 via-zinc-950 to-zinc-950 px-5 py-5 transition-opacity duration-1000 delay-500 sm:mt-8 sm:px-6 sm:py-6 ${
				revealed ? "opacity-100" : "opacity-0"
			}`}
		>
			<div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-red-500/10 blur-[80px]" />
			<div className="relative">
				<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-400/80">
					{t("exposure_label")}
				</p>
				<h3 className="mt-2 font-mono text-lg font-semibold leading-tight tabular-nums text-zinc-100 sm:text-2xl">
					{t("exposure_text", { count: findings.length + hiddenCount, min: formatBRL(summary.min_brl_cents), max: formatBRL(summary.max_brl_cents) })}
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
		: "R$ 22.000";

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

function LockedFindingCard({ blurred, onCheckout }: { blurred: BlurredFinding; onCheckout: () => void }) {
	return (
		<li>
			<button
				type="button"
				onClick={onCheckout}
				className="group flex w-full items-start gap-2.5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-left transition-all hover:border-amber-400/30 hover:bg-amber-500/[0.03] sm:gap-3 sm:px-4 sm:py-4"
			>
				<Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-amber-400 sm:h-4 sm:w-4" />
				<div className="min-w-0 flex-1">
					<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
						{blurred.category}
					</div>
					<div className="mt-0.5 truncate text-xs font-medium text-zinc-300 sm:text-sm">
						{blurred.teaser_title}
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
							href="/lp/audit"
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
		<div className="relative flex min-h-screen items-start justify-center bg-[#fafafa] px-5 py-10 sm:py-14">
			<div className="relative mx-auto w-full max-w-[560px]">
				{/* Hero */}
				<div className="mb-7 flex flex-col items-center text-center">
					<Image
						src={logoDark}
						alt="Vestigio"
						height={22}
						className="mb-6"
					/>
					{faviconUrl && (
						<span className="mb-4 inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm">
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={faviconUrl}
								alt=""
								className="h-full w-full object-contain"
								onError={(e) => { if (googleFavicon && e.currentTarget.src !== googleFavicon) e.currentTarget.src = googleFavicon; }}
							/>
						</span>
					)}
					<h1 className="font-[family-name:var(--font-fraunces)] text-[24px] font-medium leading-tight text-zinc-900 sm:text-[28px]">
						{showButton
							? t("loading.headline_complete", { domain: lead.domain || t("your_site") })
							: t("loading.headline", { domain: lead.domain || t("your_site") })}
					</h1>
					<p className="mt-2 text-[13px] text-zinc-500">
						{showButton ? t("loading.subtitle_complete") : t("loading.subtitle")}
					</p>
				</div>

				{/* Active phases (5) — the análise rápida happening now */}
				<div className="rounded-2xl border border-zinc-200 bg-white p-5">
					<div className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
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
										<span className="h-5 w-5 shrink-0 rounded-full border border-zinc-200" />
									)}
									<span
										className={
											isDone
												? "text-zinc-700"
												: isActive
													? "text-zinc-900"
													: "text-zinc-400"
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
				<div className="mt-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-5">
					<div className="mb-3 flex items-baseline justify-between">
						<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
							{t("loading.teaser_label")}
						</div>
						<div className="text-[10px] font-medium text-emerald-700">
							{t("loading.teaser_locked")}
						</div>
					</div>
					<ul className="space-y-2.5">
						{teaserPhases.map((label) => (
							<li
								key={label}
								className="flex items-center gap-3 text-[13px] text-zinc-500"
							>
								<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-400">
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
				<div className="mt-4 text-center text-[11px] text-zinc-500">
					{t("loading.unlock_hint")}
				</div>

				{/* View results CTA — only when ALL three conditions met */}
				{showButton && (
					<button
						type="button"
						onClick={onViewResults}
						className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-100 px-6 py-4 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-emerald-200"
					>
						{t("auditing_view")}
						<svg className="h-4 w-4 text-emerald-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
			return { dot: "bg-red-400", label: "border-red-500/20 bg-red-500/10 text-red-400" };
		case "high":
			return { dot: "bg-orange-400", label: "border-orange-500/20 bg-orange-500/10 text-orange-400" };
		case "medium":
			return { dot: "bg-amber-400", label: "border-amber-500/20 bg-amber-500/10 text-amber-400" };
		case "positive":
			return { dot: "bg-emerald-400", label: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" };
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
