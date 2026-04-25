"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
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

declare global {
	interface Window {
		Paddle: any;
	}
}

// ──────────────────────────────────────────────
// /lp/audit/result/[leadId] — Mini-Audit Result
//
// Public, shareable result page. Polls /api/lead/[id] every 3s while
// the audit is in progress, then renders:
//   - Sticky preview card at the top (the "this is your real site"
//     proof — favicon + title + description + response time)
//   - 5 visible findings, staggered reveal animation on first paint
//   - 10 blurred findings in a grid, lock icon, hover hint
//   - "Unlock the full audit" CTA → opens Paddle checkout directly
//     with custom_data.leadId so the webhook can promote the lead
//
// Aesthetic: dark zinc base with emerald accents, max-w 720px center.
// Animation budget concentrated in the first 4 seconds: hero card
// slides up + fades in, findings stagger 200ms, blurred grid fades
// in last. After that, no idle motion (per the no-AI-slop rule).
//
// SEO: noindex (page-level meta in the layout). Shareable via
// dynamic OG image (Sprint 3.8 next).
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // 2 min cap

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
	emailMasked: string | null;
	createdAt: string;
	result: MiniAuditApiResult | null;
}

interface PricingPlan {
	key: string;
	label: string;
	monthlyPriceCents: number;
	paddlePriceId: string;
	maxMcpCalls: number;
	continuousAudits: boolean;
	maxEnvironments: number;
	maxMembers: number;
}

// Fallback price used only when /api/pricing is unreachable or the
// plan catalog hasn't been populated. Displayed CTA falls back to the
// single-tier button instead of the 3-card layout in that path.
const LP_FALLBACK_PRICE_ID =
	process.env.NEXT_PUBLIC_PADDLE_LP_PRICE_ID ||
	process.env.NEXT_PUBLIC_PADDLE_VESTIGIO_PRICE_ID ||
	"";

export default function MiniAuditResultPage() {
	const params = useParams<{ leadId: string }>();
	const router = useRouter();
	const leadId = params?.leadId;

	const [lead, setLead] = useState<LeadResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [paddleReady, setPaddleReady] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [shareCopied, setShareCopied] = useState(false);
	const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
	const [checkoutEmail, setCheckoutEmail] = useState<string | null>(null);
	const [launchingPlan, setLaunchingPlan] = useState<string | null>(null);
	const [timedOut, setTimedOut] = useState(false);
	const pollAttemptsRef = useRef(0);

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
			if (data.status === "audit_complete" && data.result) {
				// Trigger reveal animation a beat after data lands
				setTimeout(() => setRevealed(true), 80);
			}
		} catch {
			setError("Erro de conexão. Atualize a página.");
		}
	}, [leadId]);

	useEffect(() => {
		fetchLead();
	}, [fetchLead]);

	// Fetch 3-tier pricing catalog once. PlatformConfig.plan_configs is
	// the source of truth — /api/pricing returns it. If the endpoint
	// fails or returns empty, we fall back to the single-CTA layout
	// using LP_FALLBACK_PRICE_ID.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/pricing");
				if (!res.ok) return;
				const data = await res.json();
				if (!cancelled && Array.isArray(data.plans)) {
					// Filter out plans missing paddlePriceId — we can't open
					// checkout for a plan without a real Paddle price.
					setPricingPlans(
						data.plans.filter((p: PricingPlan) => p.paddlePriceId),
					);
				}
			} catch {
				// Silent — fallback button will render
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// Fetch unmasked email for Paddle checkout pre-fill, once the audit
	// is complete (endpoint returns 404 before that). Separate from the
	// public GET /api/lead/[id] which keeps the email masked for share
	// links.
	useEffect(() => {
		if (!leadId) return;
		if (!lead || !["audit_complete", "checkout_started", "converted"].includes(lead.status)) return;
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
			} catch {
				// Non-fatal — Paddle will prompt for email if we can't prefill
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [leadId, lead, checkoutEmail]);

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

	// ── Paddle initialization ──
	const initPaddle = useCallback(() => {
		if (typeof window === "undefined") return;
		if (!window.Paddle) return;
		try {
			window.Paddle.Environment.set(
				process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
			);
			window.Paddle.Initialize({
				token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
				eventCallback: (event: any) => {
					// On checkout completion, the Paddle webhook handles all
					// the heavy lifting (User+Org+Env creation, magic link).
					// We just send the visitor to the thank-you bridge.
					if (
						event.name === "checkout.completed" &&
						event.data?.status === "completed"
					) {
						router.push(`/lp/audit/thank-you/${leadId}`);
					}
				},
			});
			setPaddleReady(true);
		} catch (err) {
			console.error("[lp-result] Paddle init failed:", err);
		}
	}, [leadId, router]);

	// ── CTA: open Paddle checkout for a specific plan ──
	// `planKey` is used to route which Paddle price is loaded; null
	// falls back to LP_FALLBACK_PRICE_ID for the single-button path
	// when the 3-tier catalog didn't load.
	function openCheckout(planKey: string | null) {
		if (!leadId || !lead?.result) return;
		if (!window.Paddle || !paddleReady) {
			setError("Sistema de pagamento carregando. Aguarde um momento.");
			return;
		}

		let priceId: string = LP_FALLBACK_PRICE_ID;
		if (planKey) {
			const plan = pricingPlans.find((p) => p.key === planKey);
			if (!plan?.paddlePriceId) {
				setError("Esse plano ainda não está disponível. Tente outro ou fale com o suporte.");
				return;
			}
			priceId = plan.paddlePriceId;
		}
		if (!priceId) {
			setError("Preços ainda não configurados. Entre em contato com o suporte.");
			return;
		}

		setLaunchingPlan(planKey || "default");
		try {
			window.Paddle.Checkout.open({
				items: [{ priceId, quantity: 1 }],
				...(checkoutEmail ? { customer: { email: checkoutEmail } } : {}),
				customData: {
					leadId,
					lpFunnel: "true",
					...(planKey ? { planKey } : {}),
				},
				successUrl: `${window.location.origin}/lp/audit/thank-you/${leadId}`,
				settings: {
					displayMode: "overlay",
				},
			});
		} catch (err) {
			console.error("[lp-result] checkout open failed:", err);
			setError("Não foi possível abrir o checkout. Tente novamente.");
			setLaunchingPlan(null);
			return;
		}
		// Paddle's overlay dismisses itself; reset the loading flag a beat
		// later so the card becomes responsive again if the user cancels.
		setTimeout(() => setLaunchingPlan(null), 1500);
	}

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
				setError("Não foi possível copiar o link. Tente selecionar a barra de URL manualmente.");
			});
	}

	// ── Render branches ──

	if (error) {
		return (
			<ErrorState message={error} onRetry={() => { setError(null); fetchLead(); }} />
		);
	}

	if (!lead) {
		return <LoadingState message="Carregando seu diagnóstico…" />;
	}

	if (lead.status === "expired") {
		return (
			<ErrorState
				message="Este link expirou. Faça um novo diagnóstico — é gratuito."
				onRetry={() => router.push("/lp/audit")}
				retryLabel="Fazer novo diagnóstico"
			/>
		);
	}

	if (lead.status === "draft" || lead.status === "auditing" || !lead.result) {
		return <AuditingState lead={lead} timedOut={timedOut} />;
	}

	const { preview, visibleFindings, blurredFindings, durationMs } = lead.result;

	return (
		<>
			{/* Paddle script — local to this page (not in app layout) */}
			<Script
				src="https://cdn.paddle.com/paddle/v2/paddle.js"
				onLoad={initPaddle}
				strategy="afterInteractive"
			/>

			<div className="relative min-h-screen overflow-hidden bg-[#070710]">
				{/* Canvas dot-grid background */}
				<DotGrid />
				{/* Ambient gradient background */}
				<div className="pointer-events-none absolute inset-x-0 top-0 -z-1 h-[600px] bg-gradient-to-b from-emerald-900/15 via-emerald-900/5 to-transparent" />
				<div className="pointer-events-none absolute left-1/2 top-0 -z-1 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-700/10 blur-[120px]" />

				{/* Brand strip */}
				<header className="border-b border-zinc-900 px-4 py-4">
					<div className="mx-auto flex max-w-3xl items-center justify-between">
						<Link href="/lp" className="text-sm font-bold tracking-wide text-white">
							VESTIGIO
						</Link>
						<button
							type="button"
							onClick={copyShareLink}
							className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
						>
							{shareCopied ? (
								<>
									<svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
									<span>Link copiado</span>
								</>
							) : (
								<>
									<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
									</svg>
									<span>Compartilhar</span>
								</>
							)}
						</button>
					</div>
				</header>

				<main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
					{/* Preview card — the proof */}
					<PreviewCard preview={preview} durationMs={durationMs} revealed={revealed} />

					{/* Findings */}
					<section className={`mt-10 space-y-3 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="flex items-end justify-between border-b border-zinc-900 pb-3">
							<h2 className="text-lg font-semibold text-zinc-100">
								{visibleFindings.length} findings na sua landing
							</h2>
							<span className="text-xs text-zinc-600">Visíveis · Grátis</span>
						</header>

						<ul className="space-y-2.5">
							{visibleFindings.map((f, i) => (
								<FindingCard key={f.id} finding={f} index={i} revealed={revealed} />
							))}
						</ul>
					</section>

					{/* Cost summary banner — aggregated monthly exposure across
					    the 5 visible findings. Renders only when at least one
					    finding carries a BRL impact (positive-only result pages
					    don't have a meaningful total). */}
					<CostSummaryBanner findings={visibleFindings} hiddenCount={blurredFindings.length} revealed={revealed} />

					{/* Blurred grid */}
					<section className={`mt-12 transition-opacity duration-1000 delay-1000 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="flex items-end justify-between border-b border-zinc-900 pb-3">
							<h2 className="text-lg font-semibold text-zinc-100">
								{blurredFindings.length} findings bloqueados
							</h2>
							<span className="text-xs text-emerald-400/80">Premium</span>
						</header>

						<ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
							{blurredFindings.map((b) => (
								<BlurredCard key={b.id} blurred={b} />
							))}
						</ul>

						{/* CTA — 3 tier pricing or single fallback */}
						<PricingCTA
							plans={pricingPlans}
							paddleReady={paddleReady}
							launchingPlan={launchingPlan}
							onSelect={openCheckout}
						/>
					</section>

					{/* Footer */}
					<footer className="mt-12 border-t border-zinc-900 pt-6 text-center text-xs text-zinc-700">
						Diagnóstico realizado pela Vestigio · Amostra de 5 de 15+ findings · Válido por 14 dias
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

function PreviewCard({
	preview,
	durationMs,
	revealed,
}: {
	preview: LandingPreview;
	durationMs: number;
	revealed: boolean;
}) {
	return (
		<div
			className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900/80 to-zinc-950 p-6 ${revealed ? "lp-preview-anim" : "opacity-0"}`}
		>
			<div className="flex items-start gap-4">
				{/* Favicon */}
				<div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
					{preview.favicon_url ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={preview.favicon_url}
							alt=""
							className="h-8 w-8 object-contain"
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<svg className="h-6 w-6 text-zinc-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
						</svg>
					)}
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium uppercase tracking-wider text-emerald-400">Audited</span>
						<span className="h-1 w-1 rounded-full bg-zinc-700" />
						<span className="font-mono text-xs text-zinc-500">{preview.host}</span>
					</div>
					<h1 className="mt-1 truncate text-xl font-semibold text-zinc-100" title={preview.title || preview.host}>
						{preview.title || preview.host}
					</h1>
					{preview.description && (
						<p className="mt-1 line-clamp-2 text-sm text-zinc-400">{preview.description}</p>
					)}
				</div>
			</div>

			{/* Stats strip */}
			<div className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-4">
				<Stat label="Response time" value={`${preview.response_time_ms}ms`} />
				<Stat label="HTTP" value={String(preview.http_status)} />
				<Stat label="Audit took" value={`${(durationMs / 1000).toFixed(1)}s`} />
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</div>
			<div className="mt-0.5 font-mono text-sm text-zinc-300">{value}</div>
		</div>
	);
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
	const [expanded, setExpanded] = useState(false);
	const severityClass = severityClasses(finding.severity);
	const impact = finding.impact;

	return (
		<li
			className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 transition-colors hover:border-zinc-700 ${
				revealed ? "lp-card-anim" : "opacity-0"
			}`}
			style={{ animationDelay: revealed ? `${index * 200}ms` : undefined }}
		>
			<button
				type="button"
				onClick={() => setExpanded((e) => !e)}
				className="flex w-full items-start gap-4 px-5 py-4 text-left"
			>
				<span className={`mt-1 inline-flex h-2 w-2 shrink-0 rounded-full ${severityClass.dot}`} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className={`text-[10px] font-semibold uppercase tracking-wider ${severityClass.label}`}>
							{finding.severity}
						</span>
						<span className="text-[10px] uppercase tracking-wider text-zinc-600">
							· {finding.category}
						</span>
						{impact && (
							<span className="ml-auto text-xs font-mono text-emerald-400/90">
								↓ {formatBRL(impact.min_brl_cents)}–{formatBRL(impact.max_brl_cents)}/mês
							</span>
						)}
					</div>
					<h3 className="mt-1 text-sm font-semibold text-zinc-100">
						{finding.title}
					</h3>
					{expanded && (
						<>
							<p className="mt-2 text-sm leading-relaxed text-zinc-400">
								{finding.body}
							</p>
							{finding.evidence_refs && finding.evidence_refs.length > 0 && (
								<ul className="mt-3 flex flex-wrap gap-2">
									{finding.evidence_refs.map((ref, i) => (
										<li
											key={i}
											className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-400"
										>
											<span className="text-zinc-600">›</span>
											<span>{ref}</span>
										</li>
									))}
								</ul>
							)}
							<p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400">
								<span>↳</span>
								<span>{finding.impact_hint}</span>
							</p>
						</>
					)}
				</div>
				<svg
					className={`mt-1 h-4 w-4 shrink-0 text-zinc-600 transition-transform ${expanded ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2}
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
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
	// Sum impact ranges across all visible findings. The blurred grid
	// (10 more findings) implies additional unseen exposure — we reflect
	// that in the copy by stating the visible sum is a lower bound.
	const summary = summarizeMiniImpact(findings.map((f) => f.impact));
	if (!summary || summary.count === 0) return null;

	const negativeCount = findings.filter(
		(f) => f.severity !== "positive",
	).length;

	return (
		<div
			className={`relative mt-8 overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/30 via-zinc-950 to-zinc-950 px-6 py-6 transition-opacity duration-1000 delay-500 ${
				revealed ? "opacity-100" : "opacity-0"
			}`}
		>
			<div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-red-500/10 blur-[80px]" />
			<div className="relative">
				<p className="text-xs uppercase tracking-[0.2em] text-red-400/80">
					Exposição mensal estimada
				</p>
				<h3 className="mt-2 text-xl font-semibold leading-tight text-zinc-100 sm:text-2xl">
					{negativeCount + hiddenCount} problemas custando entre{" "}
					<span className="text-red-300">{formatBRL(summary.min_brl_cents)}</span>{" "}
					e{" "}
					<span className="text-red-300">{formatBRL(summary.max_brl_cents)}</span>{" "}
					por mês
				</h3>
				<p className="mt-2 text-sm leading-relaxed text-zinc-400">
					Baseline: 21.000+ lojas auditadas pela Vestigio e quanto cada uma
					fatura. Consultores cobram R$ 6.500+ por mês pelo mesmo diagnóstico —
					sem continuidade, sem monitoramento, sem impacto quantificado.
				</p>
			</div>
		</div>
	);
}

function PricingCTA({
	plans,
	paddleReady,
	launchingPlan,
	onSelect,
}: {
	plans: PricingPlan[];
	paddleReady: boolean;
	launchingPlan: string | null;
	onSelect: (planKey: string | null) => void;
}) {
	// Fallback single-button mode when the pricing catalog didn't load
	// or hasn't been seeded yet. Keeps the page functional against an
	// empty PlatformConfig + an env-var-only deploy.
	if (plans.length === 0) {
		return (
			<div className="relative mt-10 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 px-6 py-8 sm:px-10 sm:py-10">
				<div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-[80px]" />
				<div className="relative">
					<p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">
						Audit completo
					</p>
					<h3 className="mt-2 text-2xl font-semibold leading-tight text-zinc-100 sm:text-3xl">
						Desbloqueie o diagnóstico completo e comece a corrigir
					</h3>
					<p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
						Todos os findings, o impacto financeiro de cada um, a correção
						recomendada e monitoramento contínuo enquanto você implementa.
					</p>
					<div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
						<button
							type="button"
							onClick={() => onSelect(null)}
							disabled={!paddleReady || launchingPlan != null}
							className="rounded-xl bg-emerald-500 px-7 py-3 text-sm font-semibold text-emerald-950 shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
						>
							{launchingPlan ? "Abrindo checkout…" : "Desbloquear diagnóstico completo"}
						</button>
						<span className="text-xs text-zinc-600 sm:ml-2">
							Cancele quando quiser. Cartão armazenado pela Paddle, não pela Vestigio.
						</span>
					</div>
				</div>
			</div>
		);
	}

	// Sort by price ascending so Starter sits first, Max last. The
	// middle tier ("Pro") gets the "recomendado" pill to anchor the
	// decision.
	const sorted = [...plans].sort(
		(a, b) => a.monthlyPriceCents - b.monthlyPriceCents,
	);
	const middleKey = sorted[Math.floor(sorted.length / 2)]?.key;

	return (
		<div className="mt-10 space-y-4">
			<div className="text-center">
				<p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">
					Desbloqueie a auditoria completa
				</p>
				<h3 className="mt-2 text-2xl font-semibold leading-tight text-zinc-100 sm:text-3xl">
					Escolha seu plano
				</h3>
				<p className="mt-2 text-sm text-zinc-500">
					Todos os findings, impacto financeiro, correções e monitoramento contínuo.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				{sorted.map((plan) => {
					const isRecommended = plan.key === middleKey && sorted.length >= 3;
					return (
						<button
							key={plan.key}
							type="button"
							onClick={() => onSelect(plan.key)}
							disabled={!paddleReady || launchingPlan != null}
							className={`relative flex flex-col gap-3 rounded-xl border p-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
								isRecommended
									? "border-emerald-500/60 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 shadow-[0_0_25px_rgba(16,185,129,0.15)] hover:border-emerald-400/80"
									: "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
							}`}
						>
							{isRecommended && (
								<span className="absolute -top-2.5 right-4 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-950">
									Recomendado
								</span>
							)}
							<div>
								<div className="text-[10px] uppercase tracking-wider text-zinc-500">
									{plan.label}
								</div>
								<div className="mt-1 flex items-baseline gap-1">
									<span className="text-2xl font-semibold text-zinc-100">
										R$ {(plan.monthlyPriceCents / 100).toLocaleString("pt-BR", {
											minimumFractionDigits: 0,
											maximumFractionDigits: 0,
										})}
									</span>
									<span className="text-xs text-zinc-500">/mês</span>
								</div>
							</div>
							<ul className="space-y-1.5 text-xs text-zinc-400">
								<li>• {plan.maxEnvironments} {plan.maxEnvironments === 1 ? "domínio" : "domínios"}</li>
								<li>• {plan.maxMembers} {plan.maxMembers === 1 ? "membro" : "membros"}</li>
								<li>• {plan.continuousAudits ? "Auditorias contínuas" : "Auditoria semanal"}</li>
								<li>• {plan.maxMcpCalls} consultas com agente AI/mês</li>
							</ul>
							<div
								className={`mt-auto rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors ${
									isRecommended
										? "bg-emerald-500 text-emerald-950"
										: "bg-zinc-800 text-zinc-200"
								}`}
							>
								{launchingPlan === plan.key ? "Abrindo checkout…" : "Escolher plano"}
							</div>
						</button>
					);
				})}
			</div>
			<p className="text-center text-xs text-zinc-600">
				Cancele quando quiser. Cartão armazenado pela Paddle, não pela Vestigio.
			</p>
		</div>
	);
}

function BlurredCard({ blurred }: { blurred: BlurredFinding }) {
	return (
		<li className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-4 transition-colors hover:border-zinc-700">
			<div className="flex items-start gap-3">
				<svg className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<div className="min-w-0 flex-1">
					<div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
						{blurred.category}
					</div>
					<div className="mt-0.5 truncate text-sm font-medium text-zinc-300 blur-[3px] transition-all group-hover:blur-[2px]">
						{blurred.teaser_title}
					</div>
				</div>
			</div>
		</li>
	);
}

// ──────────────────────────────────────────────
// State branches
// ──────────────────────────────────────────────

function AuditingState({ lead, timedOut }: { lead: LeadResponse; timedOut?: boolean }) {
	const [stageIdx, setStageIdx] = useState(0);
	const stages = [
		"Buscando sua landing page",
		"Analisando o HTML",
		"Verificando sinais de confiança",
		"Analisando CTAs",
		"Avaliando fricção de formulários",
		"Compilando seu diagnóstico",
	];

	useEffect(() => {
		const interval = setInterval(() => {
			setStageIdx((i) => Math.min(stages.length - 1, i + 1));
		}, 1500);
		return () => clearInterval(interval);
	}, [stages.length]);

	// Build favicon URL from domain
	const faviconUrl = lead.domain
		? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=64`
		: null;

	if (timedOut) {
		return (
			<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
				<DotGrid />
				<div className="relative w-full max-w-md text-center">
					{faviconUrl && (
						<img src={faviconUrl} alt="" className="mx-auto mb-4 h-10 w-10 rounded-lg" />
					)}
					<h1 className="text-2xl font-semibold text-zinc-100">
						O diagnóstico está demorando mais que o esperado
					</h1>
					<p className="mt-3 text-sm text-zinc-500">
						Isso pode acontecer se o site estiver lento ou temporariamente indisponível. Verifique se o domínio está correto e tente novamente.
					</p>
					<div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2 font-mono text-sm text-zinc-300">
						{lead.domain}
					</div>
					<div className="mt-6 flex flex-col items-center gap-3">
						<a
							href="/lp/audit"
							className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(16,185,129,0.5)] transition-colors hover:bg-emerald-500"
						>
							Tentar novamente
						</a>
						<a href="mailto:support@vestigio.io" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
							Precisa de ajuda? Fale com o suporte
						</a>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<DotGrid />
			<div className="relative w-full max-w-md text-center">
				{/* Favicon + animated ping */}
				<div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center">
					<span className="relative flex h-12 w-12">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-30" />
						{faviconUrl ? (
							<img
								src={faviconUrl}
								alt=""
								className="relative inline-flex h-12 w-12 rounded-full border-2 border-emerald-400 bg-zinc-900 object-cover p-1.5"
							/>
						) : (
							<span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-500/10 text-emerald-300">
								<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
								</svg>
							</span>
						)}
					</span>
				</div>

				<h1 className="text-2xl font-semibold text-zinc-100">
					Diagnosticando {lead.domain || "seu site"}…
				</h1>
				<p className="mt-2 text-sm text-zinc-500">
					Isso geralmente leva 5–10 segundos. Não feche esta aba.
				</p>

				{/* Domain confirmation */}
				<div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
					{faviconUrl && <img src={faviconUrl} alt="" className="h-4 w-4 rounded" />}
					<span className="font-mono text-xs text-zinc-400">{lead.domain}</span>
				</div>

				<ul className="mt-8 space-y-2 text-left">
					{stages.map((label, idx) => {
						const isDone = idx < stageIdx;
						const isActive = idx === stageIdx;
						return (
							<li
								key={label}
								className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-sm transition-colors ${
									isDone
										? "border-emerald-500/20 bg-emerald-500/5 text-zinc-300"
										: isActive
											? "border-zinc-700 bg-zinc-900 text-zinc-200"
											: "border-zinc-800 bg-zinc-950 text-zinc-700"
								}`}
							>
								{isDone ? (
									<svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
								) : isActive ? (
									<span className="relative flex h-3.5 w-3.5">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
										<span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-emerald-400" />
									</span>
								) : (
									<span className="h-3.5 w-3.5 rounded-full border border-zinc-800" />
								)}
								<span>{label}</span>
							</li>
						);
					})}
				</ul>
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
	retryLabel = "Tentar novamente",
}: {
	message: string;
	onRetry: () => void;
	retryLabel?: string;
}) {
	return (
		<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<DotGrid />
			<div className="relative max-w-md text-center">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
					<svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
				</div>
				<h1 className="text-xl font-semibold text-zinc-100">Algo deu errado</h1>
				<p className="mt-2 text-sm text-zinc-500">{message}</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-6 rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
				>
					{retryLabel}
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
			return { dot: "bg-red-400", label: "text-red-400" };
		case "high":
			return { dot: "bg-amber-400", label: "text-amber-400" };
		case "medium":
			return { dot: "bg-yellow-400", label: "text-yellow-400" };
		case "positive":
			return { dot: "bg-emerald-400", label: "text-emerald-400" };
	}
}
