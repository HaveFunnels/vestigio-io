"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import Image from "next/image";

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
	emailMasked: string | null;
	createdAt: string;
	result: MiniAuditApiResult | null;
}

export default function MiniAuditResultPage() {
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
			setError("Sistema de pagamento carregando. Aguarde um momento.");
			return;
		}
		if (!LP_PRICE_ID) {
			setError("Preços ainda não configurados. Entre em contato com o suporte.");
			return;
		}
		setLaunching(true);
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
			setError("Não foi possível abrir o checkout. Tente novamente.");
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
			setError("Erro de conexão. Atualize a página.");
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
	const { preview, visibleFindings, blurredFindings } = lead.result!;

	// Only show negative findings — positives dilute urgency
	const negativeFindings = visibleFindings.filter((f) => f.severity !== "positive");
	const totalFindings = negativeFindings.length + blurredFindings.length;

	return (
		<>
			{/* Paddle script */}
			<Script src="https://cdn.paddle.com/paddle/v2/paddle.js" onLoad={initPaddle} strategy="afterInteractive" />

			<div className="relative min-h-screen overflow-hidden bg-[#070710]">
				{/* Canvas dot-grid background */}
				<DotGrid />
				{/* Ambient gradient background */}
				<div className="pointer-events-none absolute inset-x-0 top-0 -z-1 h-[600px] bg-gradient-to-b from-emerald-900/15 via-emerald-900/5 to-transparent" />
				<div className="pointer-events-none absolute left-1/2 top-0 -z-1 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-700/10 blur-[120px]" />

				{/* Brand strip */}
				<header className="border-b border-zinc-900 px-4 py-4">
					<div className="mx-auto flex max-w-3xl items-center justify-between">
						<Link href="/lp" className="flex items-center">
							<Image src={logoDark} alt="Vestigio" height={22} className="brightness-0 invert" />
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

				<main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
					{/* Preview card — the proof */}
					<PreviewCard
						preview={preview}
						totalFindings={totalFindings}
						negativeFindings={negativeFindings}
						revealed={revealed}
					/>

					{/* Urgency note */}
					<div className={`mt-4 flex items-center justify-center gap-2 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<svg className="h-3.5 w-3.5 text-amber-400/70" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span className="text-xs text-zinc-500">Seus resultados ficam disponíveis por 30 minutos</span>
					</div>

					{/* Findings */}
					<section className={`mt-6 transition-opacity duration-700 sm:mt-8 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="mb-3 flex items-end justify-between">
							<div>
								<span className="mb-2 inline-block rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
									Gratuito
								</span>
								<h2 className="text-base font-semibold text-zinc-100 sm:text-lg">
									{negativeFindings.length} vazamentos encontrados
								</h2>
							</div>
						</header>

						<ul className="space-y-1.5">
							{negativeFindings.map((f, i) => (
								<FindingCard key={f.id} finding={f} index={i} revealed={revealed} />
							))}
						</ul>
					</section>

					{/* Cost summary banner */}
					<CostSummaryBanner findings={negativeFindings} hiddenCount={blurredFindings.length} revealed={revealed} />

					{/* Blurred grid */}
					<section className={`mt-10 transition-opacity duration-1000 delay-1000 sm:mt-12 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="flex items-end justify-between border-b border-zinc-900 pb-3">
							<h2 className="text-base font-semibold text-zinc-100 sm:text-lg">
								{blurredFindings.length} findings bloqueados
							</h2>
							<span className="text-xs text-emerald-400/80">Premium</span>
						</header>

						<ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
							{blurredFindings.map((b) => (
								<BlurredCard key={b.id} blurred={b} />
							))}
						</ul>

						{/* Unlock section — horizontal CTA card → Paddle checkout */}
						<UnlockSection negativeFindings={negativeFindings} blurredCount={blurredFindings.length} onCheckout={openCheckout} launching={launching} />
					</section>

					{/* Footer */}
					<footer className="mt-12 border-t border-zinc-900 pt-6 text-center text-xs text-zinc-700">
						Diagnóstico realizado pela Vestigio · Amostra de {negativeFindings.length} de {totalFindings}+ findings · Válido por 30 minutos
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
	totalFindings,
	negativeFindings,
	revealed,
}: {
	preview: LandingPreview;
	totalFindings: number;
	negativeFindings: MiniFinding[];
	revealed: boolean;
}) {
	const googleFavicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(preview.host)}&sz=64`;
	const [faviconSrc, setFaviconSrc] = useState(preview.favicon_url || googleFavicon);

	const summary = summarizeMiniImpact(negativeFindings.map((f) => f.impact));
	const impactLabel = summary && summary.count > 0
		? `${formatBRL(summary.min_brl_cents)}–${formatBRL(summary.max_brl_cents)}/mês`
		: null;

	// Response time quality badge
	const rtMs = preview.response_time_ms;
	const rtBadge = rtMs < 300 ? { text: "Ótimo", color: "text-emerald-400 bg-emerald-500/10" }
		: rtMs < 800 ? { text: "Bom", color: "text-emerald-400 bg-emerald-500/10" }
		: rtMs < 2000 ? { text: "Lento", color: "text-amber-400 bg-amber-500/10" }
		: { text: "Crítico", color: "text-red-400 bg-red-500/10" };

	const httpBadge = preview.http_status === 200
		? { text: "Sucesso", color: "text-emerald-400 bg-emerald-500/10" }
		: { text: "Erro", color: "text-red-400 bg-red-500/10" };

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
						<span className="text-xs font-medium uppercase tracking-wider text-emerald-400">Diagnosticado</span>
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

			{/* Stats strip with icons + badges */}
			<div className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-4">
				<div>
					<div className="flex items-center gap-1.5">
						<svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
						</svg>
						<span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Resposta</span>
					</div>
					<div className="mt-0.5 font-mono text-sm text-zinc-300">{preview.response_time_ms}ms</div>
					<span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${rtBadge.color}`}>{rtBadge.text}</span>
				</div>
				<div>
					<div className="flex items-center gap-1.5">
						<svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
						</svg>
						<span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">HTTP</span>
					</div>
					<div className="mt-0.5 font-mono text-sm text-zinc-300">{preview.http_status}</div>
					<span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${httpBadge.color}`}>{httpBadge.text}</span>
				</div>
				<div>
					<div className="flex items-center gap-1.5">
						<svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">Vazamentos</span>
					</div>
					<div className="mt-0.5 font-mono text-sm text-red-300">{totalFindings}</div>
					{impactLabel && (
						<span className="mt-1 inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-400">
							↓ {impactLabel}
						</span>
					)}
				</div>
			</div>

			{/* Score strip */}
			<div className="mt-5 flex items-center gap-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
				{/* Circular score */}
				<div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
					<svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
						<circle cx="32" cy="32" r="28" fill="none" stroke="rgba(39,39,42,0.5)" strokeWidth="5" />
						<circle
							cx="32" cy="32" r="28" fill="none"
							stroke={scoreStroke} strokeWidth="5"
							strokeLinecap="round"
							strokeDasharray={`${(score / 100) * 175.9} 175.9`}
						/>
					</svg>
					<div className="absolute inset-0 flex flex-col items-center justify-center">
						<span className={`text-lg font-bold leading-none ${scoreColor}`}>{score}</span>
						<span className="text-[9px] text-zinc-600">/100</span>
					</div>
				</div>
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold text-zinc-100">
						{score >= 50 ? "Oportunidades de conversão detectadas" : score >= 30 ? "Problemas significativos encontrados" : "Vazamentos críticos detectados"}
					</h3>
					<p className="mt-1 text-xs leading-relaxed text-zinc-400">
						{score >= 50
							? "Sua landing funciona, mas está vazando receita em pontos específicos."
							: "Sua landing tem problemas que estão custando dinheiro todos os dias."
						}
					</p>
				</div>
			</div>
		</div>
	);
}

const SEVERITY_PT: Record<string, string> = {
	critical: "Crítico",
	high: "Alto",
	medium: "Médio",
	low: "Baixo",
	positive: "Positivo",
};

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
			className={`overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60 transition-colors hover:border-zinc-700 ${
				revealed ? "lp-card-anim" : "opacity-0"
			}`}
			style={{ animationDelay: revealed ? `${index * 200}ms` : undefined }}
		>
			<button
				type="button"
				onClick={() => setExpanded((e) => !e)}
				className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left sm:gap-3 sm:px-4 sm:py-3"
			>
				<span className={`mt-1 inline-flex h-2 w-2 shrink-0 rounded-full ${severityClass.dot}`} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className={`text-[10px] font-semibold uppercase tracking-wider ${severityClass.label}`}>
							{SEVERITY_PT[finding.severity] || finding.severity}
						</span>
						<span className="text-[10px] uppercase tracking-wider text-zinc-600">
							· {finding.category}
						</span>
					</div>
					<h3 className="mt-0.5 text-[13px] font-semibold leading-snug text-zinc-100 sm:text-sm">
						{finding.title}
					</h3>
					{impact && (
						<p className="mt-1 font-mono text-[11px] text-red-400/90">
							Impacto estimado: ↓ {formatBRL(impact.min_brl_cents)}–{formatBRL(impact.max_brl_cents)}/mês
						</p>
					)}
					{expanded && (
						<>
							<p className="mt-2 text-[13px] leading-relaxed text-zinc-400 sm:text-sm">
								{finding.body}
							</p>
							{finding.evidence_refs && finding.evidence_refs.length > 0 && (
								<ul className="mt-2 flex flex-wrap gap-1.5">
									{finding.evidence_refs.map((ref, i) => (
										<li
											key={i}
											className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-400"
										>
											<span className="text-zinc-600">›</span>
											<span>{ref}</span>
										</li>
									))}
								</ul>
							)}
							<p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-400">
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
				<p className="text-[10px] uppercase tracking-[0.2em] text-red-400/80 sm:text-xs">
					Exposição mensal estimada
				</p>
				<h3 className="mt-2 text-lg font-semibold leading-tight text-zinc-100 sm:text-2xl">
					{findings.length + hiddenCount} problemas custando entre{" "}
					<span className="text-red-300">{formatBRL(summary.min_brl_cents)}</span>{" "}
					e{" "}
					<span className="text-red-300">{formatBRL(summary.max_brl_cents)}</span>{" "}
					por mês
				</h3>
				<p className="mt-2 text-xs leading-relaxed text-zinc-400 sm:text-sm">
					Baseline: 21.000+ lojas auditadas pela Vestigio e quanto cada uma
					fatura. Consultores cobram R$ 6.500+ por mês pelo mesmo diagnóstico —
					sem continuidade, sem monitoramento, sem impacto quantificado.
				</p>
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
	const summary = summarizeMiniImpact(negativeFindings.map((f) => f.impact));
	const totalImpact = summary && summary.count > 0
		? formatBRL(summary.max_brl_cents)
		: "R$ 22.000";

	return (
		<button
			type="button"
			onClick={onCheckout}
			disabled={launching}
			className="group relative mt-8 flex w-full items-center gap-5 overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-zinc-950 to-zinc-950 p-5 text-left transition-all hover:border-emerald-500/50 hover:shadow-[0_0_40px_rgba(16,185,129,0.15)] disabled:opacity-60 sm:p-6"
		>
			{/* Trophy icon */}
			<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
				<svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-2.27.782m0 0a6.004 6.004 0 01-2.27-.782" />
				</svg>
			</div>

			{/* Content */}
			<div className="min-w-0 flex-1">
				<h3 className="text-sm font-bold text-zinc-100 sm:text-base">
					{launching ? "Abrindo checkout…" : "Desbloquear diagnóstico completo"}
				</h3>
				<p className="mt-1 text-xs leading-relaxed text-zinc-400 sm:text-sm">
					O diagnóstico completo analisa 15.000+ sinais incluindo navegação automatizada, análise de copy e monitoramento contínuo. Recupere até <span className="font-semibold text-emerald-400">{totalImpact}/mês</span>.
				</p>
			</div>

			{/* Arrow */}
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 transition-transform group-hover:scale-110">
				<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
				</svg>
			</div>
		</button>
	);
}

function BlurredCard({ blurred }: { blurred: BlurredFinding }) {
	return (
		<li className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-3 transition-colors hover:border-zinc-700 sm:px-4 sm:py-4">
			<div className="flex items-start gap-2.5 sm:gap-3">
				<svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<div className="min-w-0 flex-1">
					<div className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600 sm:text-[10px]">
						{blurred.category}
					</div>
					<div className="mt-0.5 truncate text-xs font-medium text-zinc-300 blur-[3px] transition-all group-hover:blur-[2px] sm:text-sm">
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
	const [stageIdx, setStageIdx] = useState(0);
	const stages = [
		"Buscando sua landing page",
		"Analisando o HTML",
		"Verificando sinais de confiança",
		"Analisando CTAs",
		"Avaliando fricção de formulários",
		"Compilando seu diagnóstico",
	];

	const allStagesDone = completed || stageIdx >= stages.length - 1;

	useEffect(() => {
		if (completed) {
			// Jump to all done
			setStageIdx(stages.length - 1);
			return;
		}
		const interval = setInterval(() => {
			setStageIdx((i) => Math.min(stages.length - 1, i + 1));
		}, 2200);
		return () => clearInterval(interval);
	}, [stages.length, completed]);

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
						<a href="mailto:support@vestigio.io" className="text-xs text-zinc-600 transition-colors hover:text-zinc-400">
							Precisa de ajuda? Fale com o suporte
						</a>
					</div>
				</div>
			</div>
		);
	}

	// Show the "view results" button when all stages are done AND data is ready
	const showButton = allStagesDone && completed && onViewResults;

	return (
		<div className="relative flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<DotGrid />
			<div className="relative w-full max-w-md text-center">
				{/* Favicon + animated ping */}
				<div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center">
					<span className="relative flex h-12 w-12">
						{!showButton && (
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-30" />
						)}
						{faviconUrl ? (
							<img
								src={faviconUrl}
								alt=""
								className={`relative inline-flex h-12 w-12 rounded-full border-2 bg-zinc-900 object-cover p-1.5 ${showButton ? "border-emerald-400" : "border-emerald-400"}`}
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
					{showButton
						? `Diagnóstico de ${lead.domain || "seu site"} concluído`
						: `Diagnosticando ${lead.domain || "seu site"}…`
					}
				</h1>
				<p className="mt-2 text-sm text-zinc-500">
					{showButton
						? "Encontramos findings no seu site. Clique abaixo para ver o resultado."
						: "Isso geralmente leva 5–10 segundos. Não feche esta aba."
					}
				</p>

				{/* Domain confirmation */}
				{!showButton && (
					<div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5">
						{faviconUrl && <img src={faviconUrl} alt="" className="h-4 w-4 rounded" />}
						<span className="font-mono text-xs text-zinc-400">{lead.domain}</span>
					</div>
				)}

				<ul className="mt-8 space-y-2 text-left">
					{stages.map((label, idx) => {
						const isDone = completed ? true : idx < stageIdx;
						const isActive = !completed && idx === stageIdx;
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

				{/* CTA button — appears only when audit is done */}
				{showButton && (
					<button
						type="button"
						onClick={onViewResults}
						className="mt-8 w-full rounded-xl bg-emerald-500 px-7 py-3.5 text-sm font-semibold text-emerald-950 shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]"
					>
						Ver meu diagnóstico
					</button>
				)}
			</div>
		</div>
	);
}

function ExpiredState({ lead, onCheckout, launching }: { lead: LeadResponse; onCheckout: () => void; launching: boolean }) {
	const domain = lead.domain || "seu site";
	const faviconUrl = lead.domain
		? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(lead.domain)}&sz=64`
		: null;

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
						<img src={faviconUrl} alt="" className="h-8 w-8 rounded object-contain" />
					</div>
				)}

				{/* Headline */}
				<h1 className="text-2xl font-semibold text-zinc-100 sm:text-3xl">
					Que pena, seu diagnóstico expirou
				</h1>

				{/* Impact reminder — re-triggers loss aversion */}
				{totalFindings && summary && summary.count > 0 ? (
					<div className="mt-5 rounded-xl border border-red-500/20 bg-red-950/20 px-5 py-4">
						<p className="text-sm leading-relaxed text-zinc-300">
							Encontramos{" "}
							<span className="font-semibold text-red-300">{totalFindings} problemas</span>{" "}
							em <span className="font-mono text-zinc-200">{domain}</span> custando entre{" "}
							<span className="font-semibold text-red-300">{formatBRL(summary.min_brl_cents)}</span>{" "}
							e{" "}
							<span className="font-semibold text-red-300">{formatBRL(summary.max_brl_cents)}</span>{" "}
							por mês
						</p>
						{hiddenCount && hiddenCount > 0 && (
							<p className="mt-2 text-xs text-zinc-500">
								Incluindo {hiddenCount} findings que você ainda não viu.
							</p>
						)}
					</div>
				) : (
					<p className="mt-4 text-sm text-zinc-500">
						Encontramos problemas em <span className="font-mono text-zinc-300">{domain}</span> que estavam custando dinheiro.
						O link expirou, mas você pode recuperar o diagnóstico.
					</p>
				)}

				{/* What you get — bullet points */}
				<ul className="mt-6 space-y-2.5 text-left">
					{[
						"15.000+ sinais analisados por auditoria estática",
						"Navegação automatizada completa via browser real",
						"Análise de copy, CTAs e fricção de formulários",
						"Detecção de regressão ciclo a ciclo",
						"Impacto financeiro quantificado em cada finding",
					].map((text) => (
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
					{launching ? "Abrindo checkout…" : `Recuperar meu diagnóstico em ${domain}`}
				</button>

				<p className="mt-3 text-xs text-zinc-600">
					O diagnóstico completo analisa 15.000+ sinais.
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
