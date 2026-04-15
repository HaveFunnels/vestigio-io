"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

// ──────────────────────────────────────────────
// /lp/audit/thank-you/[leadId] — Post-checkout Bridge
//
// Visitor lands here after Paddle Checkout returns successUrl. Purpose
// is twofold:
//
//   1. Celebrate + reassure — they just paid, acknowledge it warmly and
//      tell them exactly what happens next (activation email arrives,
//      workspace being provisioned in the background).
//   2. Recap the mini-audit they just bought — the preview card, the
//      aggregate BRL exposure, the 5 visible findings condensed. This
//      reinforces the value they just committed to and anchors the
//      "full audit is worth it" feeling while they wait for the email.
//
// NOT a re-sell surface. No upgrade CTAs, no "oh and also…" — the
// visitor already paid. The only interactive element besides the
// activation notice is a small "open report" link back to the full
// result page if they want to re-review.
//
// The activation email is dispatched server-side by promoteLeadToOrg
// (via the Paddle webhook). We only poll /api/lead/[id] to surface
// workspace status and the masked email.
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30; // 90s cap

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
	status:
		| "draft"
		| "auditing"
		| "audit_complete"
		| "checkout_started"
		| "converted"
		| "expired"
		| "spam";
	currentStep: number;
	domain: string | null;
	organizationName: string | null;
	businessModel: string | null;
	emailMasked: string | null;
	createdAt: string;
	result: MiniAuditApiResult | null;
}

export default function LeadThankYouPage() {
	const params = useParams<{ leadId: string }>();
	const leadId = params?.leadId;

	const [lead, setLead] = useState<LeadResponse | null>(null);
	const [pollAttempts, setPollAttempts] = useState(0);

	useEffect(() => {
		if (!leadId) return;
		let cancelled = false;

		async function poll() {
			try {
				const res = await fetch(`/api/lead/${leadId}`);
				if (!res.ok) return;
				const data: LeadResponse = await res.json();
				if (cancelled) return;
				setLead(data);
			} catch {
				// Network blip — let the interval retry
			}
		}

		poll();
		const interval = setInterval(() => {
			setPollAttempts((n) => {
				if (n >= POLL_MAX_ATTEMPTS) {
					clearInterval(interval);
					return n;
				}
				poll();
				return n + 1;
			});
		}, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [leadId]);

	const converted = lead?.status === "converted";
	const orgName = lead?.organizationName?.trim() || "";
	const preview = lead?.result?.preview;
	const visibleFindings = lead?.result?.visibleFindings || [];
	const blurredFindings = lead?.result?.blurredFindings || [];
	const impactSummary = summarizeMiniImpact(
		visibleFindings.map((f) => f.impact),
	);

	return (
		<div className="relative min-h-screen overflow-hidden bg-[#070710]">
			{/* Ambient gradient */}
			<div className="pointer-events-none absolute inset-x-0 top-0 -z-1 h-[800px] bg-gradient-to-b from-emerald-900/15 via-emerald-900/5 to-transparent" />
			<div className="pointer-events-none absolute left-1/2 top-0 -z-1 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-700/12 blur-[120px]" />

			<header className="border-b border-zinc-900 px-4 py-4">
				<div className="mx-auto max-w-3xl">
					<Link
						href="/lp"
						className="text-sm font-bold tracking-wide text-white"
					>
						VESTIGIO
					</Link>
				</div>
			</header>

			<main className="mx-auto max-w-2xl px-4 py-14 sm:py-20">
				{/* ─── Celebration ─── */}
				<section className="text-center">
					<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
						<span className="relative flex h-16 w-16">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-20" />
							<span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
								<svg
									className="h-8 w-8 text-emerald-400"
									fill="none"
									viewBox="0 0 24 24"
									strokeWidth={2.25}
									stroke="currentColor"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M4.5 12.75l6 6 9-13.5"
									/>
								</svg>
							</span>
						</span>
					</div>
					<h1 className="text-3xl font-semibold text-zinc-100 sm:text-4xl">
						{orgName ? `Obrigado, ${orgName}!` : "Obrigado!"}
					</h1>
					<p className="mx-auto mt-3 max-w-md text-base text-zinc-400">
						Pagamento confirmado. O diagnóstico completo de{" "}
						{lead?.domain ? (
							<span className="font-mono text-zinc-200">{lead.domain}</span>
						) : (
							<span className="text-zinc-500">sua loja</span>
						)}{" "}
						já está rodando em segundo plano.
					</p>
				</section>

				{/* ─── Activation email block ─── */}
				<section className="mt-10 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 p-6">
					<div className="flex items-start gap-4">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15">
							<svg
								className="h-5 w-5 text-emerald-400"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth={2}
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
								/>
							</svg>
						</div>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-semibold text-zinc-100">
								Próximo passo: ative sua conta
							</div>
							<div className="mt-1.5 text-sm leading-relaxed text-zinc-400">
								Acabamos de enviar um link de ativação para{" "}
								{lead?.emailMasked ? (
									<span className="font-mono text-zinc-200">
										{lead.emailMasked}
									</span>
								) : (
									<span className="text-zinc-500">seu email</span>
								)}
								. Clique nele e escolha como quer fazer login — Google, GitHub
								ou uma senha. O link expira em 24 horas.
							</div>
							<div className="mt-3 flex items-center gap-2 text-[11px]">
								{converted ? (
									<>
										<svg
											className="h-3 w-3 text-emerald-400"
											fill="none"
											viewBox="0 0 24 24"
											strokeWidth={2.5}
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M4.5 12.75l6 6 9-13.5"
											/>
										</svg>
										<span className="text-emerald-400">
											Workspace pronto · email enviado
										</span>
									</>
								) : (
									<>
										<span className="relative flex h-2 w-2">
											<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
											<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
										</span>
										<span className="text-zinc-500">
											Preparando seu workspace…
										</span>
									</>
								)}
							</div>
						</div>
					</div>
				</section>

				{/* ─── Mini-audit recap ─── */}
				{preview && (
					<section className="mt-14">
						<div className="mb-4 flex items-end justify-between border-b border-zinc-900 pb-3">
							<h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
								Recap do diagnóstico
							</h2>
							<Link
								href={`/lp/audit/result/${leadId}`}
								className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
							>
								Abrir report completo →
							</Link>
						</div>

						<PreviewChip preview={preview} />

						{impactSummary && impactSummary.count > 0 && (
							<div className="mt-4 rounded-xl border border-red-500/20 bg-red-950/15 px-5 py-4">
								<div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400/80">
									Exposição mensal estimada
								</div>
								<div className="mt-1 text-lg font-semibold text-zinc-100">
									<span className="text-red-300">
										{formatBRL(impactSummary.min_brl_cents)}
									</span>{" "}
									–{" "}
									<span className="text-red-300">
										{formatBRL(impactSummary.max_brl_cents)}
									</span>
									<span className="ml-2 text-xs font-normal text-zinc-500">
										/ mês
									</span>
								</div>
								<p className="mt-2 text-xs text-zinc-500">
									Baseline: 21.000+ lojas auditadas pela Vestigio e quanto cada
									uma fatura.
								</p>
							</div>
						)}

						{visibleFindings.length > 0 && (
							<ul className="mt-4 space-y-1.5">
								{visibleFindings.map((f) => (
									<FindingChip key={f.id} finding={f} />
								))}
							</ul>
						)}

						{blurredFindings.length > 0 && (
							<p className="mt-4 text-xs text-zinc-500">
								+{blurredFindings.length} findings adicionais esperando no seu
								dashboard depois da ativação.
							</p>
						)}
					</section>
				)}

				{/* Slow-path manual help */}
				{pollAttempts >= POLL_MAX_ATTEMPTS && !converted && (
					<div className="mt-10 rounded-md border border-amber-800/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
						Seu workspace está demorando mais que o normal. O email de ativação
						ainda deve chegar — cheque a caixa de spam se nada aparecer em um
						minuto. Se nada vier,{" "}
						<a
							href="mailto:suporte@vestigio.io"
							className="font-semibold underline underline-offset-2 hover:text-amber-200"
						>
							fale com o suporte
						</a>
						.
					</div>
				)}

				<footer className="mt-16 border-t border-zinc-900 pt-6 text-center text-xs text-zinc-600">
					Você pode fechar essa aba. O email vai chegar em segundos.
				</footer>
			</main>
		</div>
	);
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function PreviewChip({ preview }: { preview: LandingPreview }) {
	return (
		<div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
			<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
				{preview.favicon_url ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={preview.favicon_url}
						alt=""
						className="h-6 w-6 object-contain"
						onError={(e) => {
							(e.currentTarget as HTMLImageElement).style.display = "none";
						}}
					/>
				) : (
					<svg
						className="h-4 w-4 text-zinc-700"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
						/>
					</svg>
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div
					className="truncate text-sm font-semibold text-zinc-100"
					title={preview.title || preview.host}
				>
					{preview.title || preview.host}
				</div>
				<div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
					<span className="font-mono">{preview.host}</span>
					<span>·</span>
					<span>{preview.response_time_ms}ms</span>
					<span>·</span>
					<span>HTTP {preview.http_status}</span>
				</div>
			</div>
		</div>
	);
}

const SEVERITY_DOT: Record<MiniFindingSeverity, string> = {
	critical: "bg-red-500",
	high: "bg-orange-500",
	medium: "bg-amber-500",
	positive: "bg-emerald-500",
};

function FindingChip({ finding }: { finding: MiniFinding }) {
	const dot = SEVERITY_DOT[finding.severity] || "bg-zinc-600";
	const impact = finding.impact;

	return (
		<li className="flex items-start gap-3 rounded-lg border border-zinc-900 bg-zinc-950/40 px-4 py-3">
			<span className={`mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full ${dot}`} />
			<div className="min-w-0 flex-1">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 flex-1 text-sm text-zinc-200">
						{finding.title}
					</div>
					{impact && (
						<span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-emerald-400/90">
							↓ {formatBRL(impact.min_brl_cents)}–
							{formatBRL(impact.max_brl_cents)}/mês
						</span>
					)}
				</div>
			</div>
		</li>
	);
}
