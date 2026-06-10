"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { ShieldCheck, Check } from "lucide-react";
import logoLight from "@/../public/images/logo/logo-light.png";

declare global {
	interface Window {
		MercadoPago?: any;
		__mp?: any;
	}
}

interface Plan {
	key: string;
	label: string;
	monthlyPriceCents: number;
	annualPriceCents: number;
}

interface Props {
	plans: Plan[];
	userEmail: string;
	userName: string;
}

type Cycle = "monthly" | "annually";
type Tab = "pix" | "card";
type PaymentState =
	| { kind: "idle" }
	| { kind: "creating" }
	| { kind: "pix_waiting"; qrBase64: string; copyPaste: string; expiresAt: number; paymentId: string }
	| { kind: "card_processing" }
	| { kind: "success" }
	| { kind: "error"; message: string };

function formatBRL(cents: number): string {
	const reais = cents / 100;
	return reais.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
		minimumFractionDigits: 0,
	});
}

export function ActivatePaywall({ plans, userEmail, userName }: Props) {
	// LP-funnel context recovered from localStorage. Pricing → Signup
	// stashed plan + cycle; audit → Signup stashed leadId + domain.
	const [stashedPlan, setStashedPlan] = useState<string | null>(null);
	const [stashedCycle, setStashedCycle] = useState<string | null>(null);
	const [leadId, setLeadId] = useState<string | null>(null);
	const [auditedDomain, setAuditedDomain] = useState<string | null>(null);

	useEffect(() => {
		try {
			setStashedPlan(localStorage.getItem("vestigio_lp_plan"));
			setStashedCycle(localStorage.getItem("vestigio_lp_cycle"));
			setLeadId(localStorage.getItem("vestigio_lp_leadId"));
			setAuditedDomain(localStorage.getItem("vestigio_onboard_domain"));
		} catch {}
	}, []);

	// Default selection — stash if present, else first plan + monthly.
	const defaultPlanKey =
		(stashedPlan && plans.find((p) => p.key === stashedPlan)?.key) ||
		plans[0]?.key ||
		"";
	const [selectedPlanKey, setSelectedPlanKey] = useState(defaultPlanKey);
	const [cycle, setCycle] = useState<Cycle>(
		stashedCycle === "annually" ? "annually" : "monthly",
	);

	// Keep state in sync once localStorage is read on mount.
	useEffect(() => {
		if (stashedPlan && plans.find((p) => p.key === stashedPlan)) {
			setSelectedPlanKey(stashedPlan);
		}
		if (stashedCycle === "annually" || stashedCycle === "monthly") {
			setCycle(stashedCycle);
		}
	}, [stashedPlan, stashedCycle, plans]);

	const selectedPlan =
		plans.find((p) => p.key === selectedPlanKey) ?? plans[0];

	const [tab, setTab] = useState<Tab>("pix");
	const [payment, setPayment] = useState<PaymentState>({ kind: "idle" });

	// Poll Pix status while waiting. Hits MP via our /status endpoint
	// every 4s; flips to success when MP returns "approved". Stops at
	// expiry too — if the Pix QR's TTL passes without payment, we
	// switch the UI to an error/regenerate state.
	useEffect(() => {
		if (payment.kind !== "pix_waiting") return;
		let cancelled = false;
		const id = window.setInterval(async () => {
			if (cancelled) return;
			if (Date.now() > payment.expiresAt) {
				setPayment({
					kind: "error",
					message: "O Pix expirou. Gere um novo pra continuar.",
				});
				window.clearInterval(id);
				return;
			}
			try {
				const res = await fetch(
					`/api/mercadopago/paywall/status/${payment.paymentId}`,
					{ cache: "no-store" },
				);
				if (!res.ok) return;
				const data = await res.json();
				if (data.status === "approved") {
					setPayment({ kind: "success" });
					window.clearInterval(id);
					// Land the user on /app — the webhook will have already
					// activated their org by the time they arrive (or it
					// arrives soon after; the app gates on subscription
					// status).
					setTimeout(() => {
						window.location.href = "/app";
					}, 1200);
				} else if (
					data.status === "rejected" ||
					data.status === "cancelled"
				) {
					setPayment({
						kind: "error",
						message: "O pagamento foi recusado. Tente novamente ou troque de método.",
					});
					window.clearInterval(id);
				}
			} catch {
				// Network blips — keep polling, the next tick will retry.
			}
		}, 4000);
		return () => {
			cancelled = true;
			window.clearInterval(id);
		};
	}, [payment]);

	const priceCents =
		cycle === "monthly"
			? selectedPlan?.monthlyPriceCents ?? 0
			: selectedPlan?.annualPriceCents ?? 0;
	const annualSavings =
		(selectedPlan?.monthlyPriceCents ?? 0) * 12 -
		(selectedPlan?.annualPriceCents ?? 0);

	// ── Payment actions ──
	const startPix = async () => {
		setPayment({ kind: "creating" });
		try {
			const deviceSessionId = (window as any).MP_DEVICE_SESSION_ID as
				| string
				| undefined;
			const res = await fetch("/api/mercadopago/paywall/pix", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					planKey: selectedPlan?.key ?? "vestigio",
					cycle,
					leadId: leadId ?? undefined,
					deviceSessionId,
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				setPayment({
					kind: "error",
					message: err.message ?? "Não foi possível gerar o Pix. Tente novamente.",
				});
				return;
			}
			const data = await res.json();
			const expiresAt =
				typeof data.expiresAt === "string"
					? new Date(data.expiresAt).getTime()
					: Date.now() + 30 * 60 * 1000;
			setPayment({
				kind: "pix_waiting",
				qrBase64: data.qrCodeBase64 ?? "",
				copyPaste: data.qrCode ?? "",
				expiresAt,
				paymentId: data.paymentId,
			});
		} catch {
			setPayment({
				kind: "error",
				message: "Erro de rede. Tente novamente em alguns segundos.",
			});
		}
	};

	// Card flow — MP SDK tokenizes the raw card data client-side so we
	// never touch PAN on our server. Two-step network: (1) MP's
	// /v1/payment_methods/search to resolve paymentMethodId from the
	// BIN, (2) mp.createCardToken to mint the single-use token, then
	// POST { cardTokenId, paymentMethodId, ... } to our endpoint.
	const submitCard = async (form: {
		number: string;
		expiry: string;
		cvv: string;
		name: string;
		cpf: string;
	}) => {
		if (!mpReady || !window.__mp) {
			setPayment({
				kind: "error",
				message: "Aguarde um momento — sistema de pagamento carregando.",
			});
			return;
		}
		setPayment({ kind: "card_processing" });
		try {
			// Resolve payment method (visa / master / elo / amex) from BIN
			const bin = form.number.replace(/\D/g, "").slice(0, 8);
			const pmRes = await window.__mp.getPaymentMethods({ bin });
			const pm = pmRes?.results?.[0];
			if (!pm?.id) {
				setPayment({
					kind: "error",
					message: "Cartão não reconhecido. Verifique o número.",
				});
				return;
			}

			// Tokenize
			const [mm, yy] = form.expiry.split("/").map((s) => s.trim());
			const token = await window.__mp.createCardToken({
				cardNumber: form.number.replace(/\D/g, ""),
				cardholderName: form.name.trim(),
				cardExpirationMonth: mm,
				cardExpirationYear: yy?.length === 2 ? `20${yy}` : yy,
				securityCode: form.cvv.replace(/\D/g, ""),
				identificationType: "CPF",
				identificationNumber: form.cpf.replace(/\D/g, ""),
			});
			if (!token?.id) {
				setPayment({
					kind: "error",
					message: "Não foi possível validar o cartão. Confira os dados.",
				});
				return;
			}

			// Device fingerprint — MP.js drops MP_DEVICE_SESSION_ID on the
			// global as a side effect of `new MercadoPago(...)`. Forwarding
			// it on every request raises the antifraud signal materially
			// (MP recommends explicitly and tracks approval-rate uplift).
			// Falls back to undefined if SDK didn't populate (e.g. blocker
			// extension) — the backend still posts, just with degraded
			// signal, same behavior as before this commit.
			const deviceSessionId = (window as any).MP_DEVICE_SESSION_ID as
				| string
				| undefined;

			// Submit to backend
			const res = await fetch("/api/mercadopago/paywall/card", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					planKey: selectedPlan?.key ?? "vestigio",
					cycle,
					leadId: leadId ?? undefined,
					cardTokenId: token.id,
					paymentMethodId: pm.id,
					installments: 1,
					deviceSessionId,
				}),
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				setPayment({
					kind: "error",
					message: err.message ?? "Pagamento falhou. Tente outro cartão.",
				});
				return;
			}
			const data = await res.json();
			// Preapproval response statuses:
			//   "authorized" → card accepted, subscription live, first
			//                  charge already taken by MP
			//   "pending"    → MP couldn't activate synchronously; the
			//                  webhook will confirm later
			//   "cancelled"  → declined / cancelled
			if (data.status === "authorized") {
				setPayment({ kind: "success" });
				setTimeout(() => {
					window.location.href = "/app";
				}, 1200);
			} else if (data.status === "cancelled" || data.status === "rejected") {
				setPayment({
					kind: "error",
					message:
						"O cartão foi recusado. Verifique com o banco ou tente outro cartão.",
				});
			} else {
				// pending — MP usually clears card subscriptions
				// synchronously, but if it doesn't, the webhook will
				// activate the user. We surface a friendly message
				// pointing to the inbox in case the email lands first.
				setPayment({
					kind: "error",
					message:
						"Estamos confirmando sua assinatura. Você receberá um email assim que estiver ativa.",
				});
			}
		} catch (err) {
			setPayment({
				kind: "error",
				message: "Erro ao processar o cartão. Tente novamente.",
			});
			console.error("[activate.card]", err);
		}
	};

	// MP SDK loader — required for card tokenization (createCardToken
	// + getPaymentMethods). Initialized once on window.__mp; mounted
	// here at the page level so it's ready by the time the buyer
	// switches to the Cartão tab.
	const [mpReady, setMpReady] = useState(false);
	const initMp = () => {
		if (typeof window === "undefined") return;
		if (window.__mp) {
			setMpReady(true);
			return;
		}
		const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
		if (!publicKey || !window.MercadoPago) return;
		try {
			window.__mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
			setMpReady(true);
		} catch (err) {
			console.error("[activate] MP init failed:", err);
		}
	};

	return (
		<div className="relative min-h-screen bg-surface-shell px-4 py-8 sm:py-12">
			<Script
				src="https://sdk.mercadopago.com/js/v2"
				onLoad={initMp}
				strategy="afterInteractive"
			/>
			{/* Top brand strip */}
			<div className="mx-auto mb-8 flex max-w-3xl items-center justify-between">
				<Link href="/" className="flex items-center">
					<Image src={logoLight} alt="Vestigio" height={24} className="dark:block hidden" />
					<Image src={logoLight} alt="Vestigio" height={24} className="dark:hidden invert" />
				</Link>
				<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-[0.18em] text-content-muted">
					Passo 2 de 2
				</div>
			</div>

			{/* Progress bar */}
			<div className="mx-auto mb-8 flex max-w-3xl items-center gap-2">
				<div className="h-1 flex-1 rounded-full bg-emerald-500" />
				<div className="h-1 flex-1 rounded-full bg-content/80" />
			</div>

			<div className="mx-auto grid max-w-3xl gap-6 lg:grid-cols-[1fr_360px]">
				{/* Left: payment surface */}
				<div className="space-y-6">
					{/* Audit context banner (Path B only) */}
					{auditedDomain && leadId && (
						<div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50 p-4 dark:bg-emerald-500/[0.08]">
							<Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
							<div className="text-[13px] leading-relaxed text-content">
								Sua Análise de{" "}
								<span className="font-mono font-semibold">{auditedDomain}</span>{" "}
								libera assim que o pagamento for confirmado.
							</div>
						</div>
					)}

					{/* Headline */}
					<div>
						<h1 className="font-[family-name:var(--font-fraunces)] text-3xl font-medium leading-tight text-content sm:text-4xl">
							Ativar sua conta
						</h1>
						<p className="mt-2 text-[14px] text-content-muted">
							Olá, {userName || userEmail}. Escolha como pagar pra liberar a Análise completa.
						</p>
					</div>

					{/* Cycle toggle */}
					<div className="inline-flex rounded-xl border border-edge bg-surface-card p-1">
						{(["monthly", "annually"] as Cycle[]).map((c) => (
							<button
								key={c}
								type="button"
								onClick={() => setCycle(c)}
								className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
									cycle === c
										? "bg-content text-surface-card"
										: "text-content-muted hover:text-content"
								}`}
							>
								{c === "monthly" ? "Mensal" : "Anual"}
								{c === "annually" && annualSavings > 0 && (
									<span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
										−{formatBRL(annualSavings)}
									</span>
								)}
							</button>
						))}
					</div>

					{/* Payment method tabs */}
					<div>
						<div className="flex border-b border-edge">
							{(
								[
									{ id: "pix" as const, label: "Pix" },
									{ id: "card" as const, label: "Cartão" },
								]
							).map((t) => (
								<button
									key={t.id}
									type="button"
									onClick={() => {
										setTab(t.id);
										setPayment({ kind: "idle" });
									}}
									className={`relative -mb-px px-5 py-3 text-[14px] font-semibold transition-colors ${
										tab === t.id
											? "border-b-2 border-content text-content"
											: "text-content-muted hover:text-content"
									}`}
								>
									{t.label}
								</button>
							))}
						</div>

						{/* Tab body */}
						<div className="pt-5">
							{tab === "pix" && (
								<PixTab
									payment={payment}
									onStart={startPix}
									priceCents={priceCents}
								/>
							)}
							{tab === "card" && (
								<CardTab
									payment={payment}
									onSubmit={submitCard}
									priceCents={priceCents}
									userEmail={userEmail}
									userName={userName}
								/>
							)}
						</div>
					</div>
				</div>

				{/* Right: order summary + trust */}
				<aside className="space-y-4">
					<div className="rounded-2xl border border-edge bg-surface-card p-5">
						<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-semibold uppercase tracking-[0.18em] text-content-muted">
							Seu plano
						</div>

						{/* Plan selector (when more than 1 plan exists) */}
						{plans.length > 1 ? (
							<select
								value={selectedPlanKey}
								onChange={(e) => setSelectedPlanKey(e.target.value)}
								className="mt-2 w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-[15px] font-semibold text-content focus:border-content/40 focus:outline-none"
							>
								{plans.map((p) => (
									<option key={p.key} value={p.key}>
										{p.label}
									</option>
								))}
							</select>
						) : (
							<div className="mt-2 text-[16px] font-semibold text-content">
								{selectedPlan?.label}
							</div>
						)}

						<div className="mt-4 flex items-baseline gap-1">
							<span className="font-mono text-3xl font-bold tabular-nums text-content">
								{formatBRL(priceCents)}
							</span>
							<span className="text-[12px] text-content-muted">
								/{cycle === "monthly" ? "mês" : "ano"}
							</span>
						</div>

						{cycle === "annually" && annualSavings > 0 && (
							<div className="mt-2 text-[12px] text-emerald-700 dark:text-emerald-300">
								Você economiza {formatBRL(annualSavings)} no ano.
							</div>
						)}

						<div className="mt-4 border-t border-edge-subtle pt-4 text-[12px] text-content-muted">
							{tab === "pix"
								? cycle === "monthly"
									? "Pagamento via Pix. Renovação manual por email todo mês."
									: "Pagamento via Pix. Renovação anual."
								: cycle === "monthly"
									? "Assinatura recorrente no cartão. Cancele a qualquer momento."
									: "Assinatura anual no cartão. Cancele a qualquer momento."}
						</div>
					</div>

					{/* Trust: Garantia 4x */}
					<div className="flex items-start gap-3 rounded-2xl border border-edge bg-surface-inset p-4">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
							<ShieldCheck size={18} strokeWidth={2.2} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="font-[family-name:var(--font-fraunces)] text-[14px] font-medium text-content">
								Garantia 4x
							</div>
							<p className="mt-0.5 text-[12px] leading-relaxed text-content-muted">
								Recupere ao menos 4× em 90 dias ou devolvemos todo o valor.
							</p>
						</div>
					</div>

					{/* MP security tag */}
					<div className="flex items-center justify-center gap-1.5 text-[11px] text-content-faint">
						<span className="h-1 w-1 rounded-full bg-content-faint" />
						<span>Pagamento seguro via Mercado Pago</span>
					</div>
				</aside>
			</div>

			{/* Already-have-account */}
			<div className="mx-auto mt-12 max-w-3xl text-center text-[12px] text-content-muted">
				Já tem conta?{" "}
				<Link href="/auth/signin" className="font-semibold text-content underline-offset-2 hover:underline">
					Entrar
				</Link>
			</div>
		</div>
	);
}

// ── Pix tab ──
function PixTab({
	payment,
	onStart,
	priceCents,
}: {
	payment: PaymentState;
	onStart: () => void;
	priceCents: number;
}) {
	if (payment.kind === "idle" || payment.kind === "error") {
		return (
			<div className="space-y-4">
				<p className="text-[13px] leading-relaxed text-content-muted">
					Gere um QR Pix válido por 10 minutos. Pague pelo app do seu banco e
					sua conta ativa em segundos.
				</p>
				{payment.kind === "error" && (
					<div className="rounded-lg border border-rose-500/30 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
						{payment.message}
					</div>
				)}
				<button
					type="button"
					onClick={onStart}
					className="flex w-full items-center justify-center gap-2 rounded-2xl bg-content px-6 py-4 font-[family-name:var(--font-fraunces)] text-[16px] font-medium text-surface-card transition-colors hover:bg-content-secondary"
				>
					Gerar Pix de {formatBRL(priceCents)}
					<svg className="h-4 w-4 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
						<path d="M3 8h10M9 4l4 4-4 4" />
					</svg>
				</button>
			</div>
		);
	}

	if (payment.kind === "creating") {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-content-muted">
				<span className="inline-flex items-center gap-1.5">
					<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
					<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
					<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
				</span>
				<div className="text-[13px]">Gerando seu Pix…</div>
			</div>
		);
	}

	if (payment.kind === "pix_waiting") {
		const remaining = Math.max(0, payment.expiresAt - Date.now());
		const mins = Math.floor(remaining / 60000);
		const secs = Math.floor((remaining % 60000) / 1000);
		return (
			<div className="space-y-4">
				{/* QR — base64 PNG returned by MP. Inline data: URL so the
				    image renders without an extra network hop. */}
				<div className="flex flex-col items-center gap-3 rounded-2xl border border-edge bg-surface-inset p-6">
					{payment.qrBase64 ? (
						/* eslint-disable-next-line @next/next/no-img-element */
						<img
							src={`data:image/png;base64,${payment.qrBase64}`}
							alt="QR Pix"
							className="h-48 w-48 rounded-lg border border-edge bg-white p-2"
						/>
					) : (
						<div className="grid h-48 w-48 place-items-center rounded-lg border border-edge bg-content text-[10px] font-mono text-surface-card">
							QR indisponível — use o código abaixo
						</div>
					)}
					<div className="text-center text-[11px] text-content-muted">
						Aponte o app do seu banco pro QR — ou copie o código abaixo.
					</div>
				</div>

				{/* Copy/paste */}
				<div>
					<div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
						Pix copia e cola
					</div>
					<div className="flex gap-2">
						<input
							readOnly
							value={payment.copyPaste}
							className="flex-1 rounded-lg border border-edge bg-surface-card px-3 py-2 font-mono text-[11px] text-content"
						/>
						<button
							type="button"
							onClick={() => navigator.clipboard?.writeText(payment.copyPaste)}
							className="rounded-lg bg-content px-3 py-2 text-[12px] font-semibold text-surface-card hover:bg-content-secondary"
						>
							Copiar
						</button>
					</div>
				</div>

				{/* Waiting state */}
				<div className="flex items-center justify-between rounded-lg border border-edge bg-surface-inset px-4 py-3 text-[13px]">
					<div className="flex items-center gap-2 text-content">
						<span className="inline-flex items-center gap-[3px]">
					<span className="h-1 w-1 animate-bounce rounded-full bg-current" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
					<span className="h-1 w-1 animate-bounce rounded-full bg-current" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
					<span className="h-1 w-1 animate-bounce rounded-full bg-current" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
				</span>
						Aguardando pagamento…
					</div>
					<div className="font-mono tabular-nums text-content-muted">
						{mins}:{secs.toString().padStart(2, "0")}
					</div>
				</div>
			</div>
		);
	}

	if (payment.kind === "success") {
		return (
			<div className="flex flex-col items-center gap-3 py-8">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
					<Check className="h-6 w-6" strokeWidth={3} />
				</div>
				<div className="text-[14px] font-semibold text-content">
					Pagamento confirmado!
				</div>
				<div className="text-[12px] text-content-muted">Redirecionando…</div>
			</div>
		);
	}

	return null;
}

// ── Cartão tab ──
function CardTab({
	payment,
	onSubmit,
	priceCents,
	userEmail,
	userName,
}: {
	payment: PaymentState;
	onSubmit: (form: {
		number: string;
		expiry: string;
		cvv: string;
		name: string;
		cpf: string;
	}) => void;
	priceCents: number;
	userEmail: string;
	userName: string;
}) {
	const [form, setForm] = useState({
		number: "",
		expiry: "",
		cvv: "",
		name: userName,
		cpf: "",
	});

	const onChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
		setForm((f) => ({ ...f, [field]: e.target.value }));
	};

	if (payment.kind === "card_processing") {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-content-muted">
				<span className="inline-flex items-center gap-1.5">
					<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
					<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "150ms", animationDuration: "1s" }} />
					<span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: "300ms", animationDuration: "1s" }} />
				</span>
				<div className="text-[13px]">Processando pagamento…</div>
			</div>
		);
	}

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit(form);
			}}
			className="space-y-3"
		>
			<input
				name="card-email"
				type="email"
				placeholder="Email de cobrança"
				autoComplete="email"
				defaultValue={userEmail}
				readOnly
				className="w-full rounded-lg border border-edge bg-surface-inset px-3 py-2.5 text-[14px] text-content-muted"
			/>
			<input
				name="card-number"
				type="text"
				inputMode="numeric"
				autoComplete="cc-number"
				placeholder="Número do cartão"
				value={form.number}
				onChange={onChange("number")}
				className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2.5 text-[14px] text-content focus:border-content/40 focus:outline-none"
			/>
			<div className="grid grid-cols-2 gap-3">
				<input
					name="card-expiry"
					type="text"
					inputMode="numeric"
					autoComplete="cc-exp"
					placeholder="MM/AA"
					value={form.expiry}
					onChange={onChange("expiry")}
					className="rounded-lg border border-edge bg-surface-card px-3 py-2.5 text-[14px] text-content focus:border-content/40 focus:outline-none"
				/>
				<input
					name="card-cvv"
					type="text"
					inputMode="numeric"
					autoComplete="cc-csc"
					placeholder="CVV"
					value={form.cvv}
					onChange={onChange("cvv")}
					className="rounded-lg border border-edge bg-surface-card px-3 py-2.5 text-[14px] text-content focus:border-content/40 focus:outline-none"
				/>
			</div>
			<input
				name="card-name"
				type="text"
				autoComplete="cc-name"
				placeholder="Nome impresso no cartão"
				value={form.name}
				onChange={onChange("name")}
				className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2.5 text-[14px] text-content focus:border-content/40 focus:outline-none"
			/>
			<input
				name="cpf"
				type="text"
				inputMode="numeric"
				placeholder="CPF do titular"
				value={form.cpf}
				onChange={onChange("cpf")}
				className="w-full rounded-lg border border-edge bg-surface-card px-3 py-2.5 text-[14px] text-content focus:border-content/40 focus:outline-none"
			/>

			{payment.kind === "error" && (
				<div className="rounded-lg border border-rose-500/30 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
					{payment.message}
				</div>
			)}

			<button
				type="submit"
				className="flex w-full items-center justify-center gap-2 rounded-2xl bg-content px-6 py-4 font-[family-name:var(--font-fraunces)] text-[16px] font-medium text-surface-card transition-colors hover:bg-content-secondary"
			>
				Pagar {formatBRL(priceCents)}
				<svg className="h-4 w-4 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
					<path d="M3 8h10M9 4l4 4-4 4" />
				</svg>
			</button>
		</form>
	);
}
