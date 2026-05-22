"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

// ──────────────────────────────────────────────
// MpCheckoutModal — recurring-subscription checkout in MP
//
// Two payment paths in a single modal:
//   (a) Cartão  → Bricks CardPayment tokenizes the card client-side,
//       we POST {planKey, cycle, cardTokenId} to create-preapproval.
//       MP charges immediately; on success the modal flips to the
//       success state and we call onSuccess.
//   (b) PIX    → POST create-pix-charge, get QR + copy-paste back,
//       render them in the modal. The modal stays open and polls
//       check-pix-status every 5s until status becomes 'approved'.
//       Closing the modal early is fine — the dunning emails carry
//       the same QR to the user's inbox.
//
// We never call /preapproval for PIX because PIX has no native auto-
// recurrence on MP. The PixCharge row + dunning cron handles renewals
// instead.
// ──────────────────────────────────────────────

type Cycle = "monthly" | "annually";
type Tab = "card" | "pix";

interface MpCheckoutModalProps {
	open: boolean;
	onClose: () => void;
	onSuccess: () => void;
	/** Three paid tiers. `free` is the lapsed sentinel, not a checkout target. */
	planKey: "vestigio" | "pro" | "max";
	planLabel: string;
	cycle: Cycle;
	amountCentsBrl: number;
	/** "subscribe" creates new sub; "change" cancels + creates. */
	mode: "subscribe" | "change";
}

declare global {
	interface Window {
		__mp?: any;
		__mpBrickController?: any;
	}
}

function formatBrl(cents: number) {
	return (cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

export function MpCheckoutModal({
	open,
	onClose,
	onSuccess,
	planKey,
	planLabel,
	cycle,
	amountCentsBrl,
	mode,
}: MpCheckoutModalProps) {
	const [tab, setTab] = useState<Tab>("card");
	const [submitting, setSubmitting] = useState(false);
	const [pixState, setPixState] = useState<
		| { kind: "idle" }
		| {
				kind: "ready";
				chargeId: string;
				qrCode: string;
				qrCodeBase64: string;
				ticketUrl?: string;
				expiresAt?: string | null;
		  }
		| { kind: "approved" }
	>({ kind: "idle" });
	const containerRef = useRef<HTMLDivElement | null>(null);

	// Reset state when modal opens
	useEffect(() => {
		if (!open) return;
		setTab("card");
		setPixState({ kind: "idle" });
		setSubmitting(false);
	}, [open]);

	// ── Bricks Card init ──
	// We mount the CardPayment brick when the modal is open AND the
	// card tab is active. Brick controller is unmounted on tab switch
	// to avoid duplicate iframes / stale state.
	useEffect(() => {
		if (!open || tab !== "card") return;
		if (typeof window === "undefined" || !window.__mp) {
			console.warn("[MpCheckoutModal] MP SDK not loaded yet");
			return;
		}

		const containerId = "mp-card-brick";
		const node = document.getElementById(containerId);
		if (!node) return;

		let mounted = true;
		(async () => {
			try {
				const bricks = window.__mp.bricks();
				// Tear down any prior instance — happens on remount during
				// hot reload or tab toggle.
				if (window.__mpBrickController) {
					try {
						await window.__mpBrickController.unmount();
					} catch {
						/* ignore */
					}
					window.__mpBrickController = null;
				}
				const controller = await bricks.create("cardPayment", containerId, {
					initialization: {
						amount: amountCentsBrl / 100,
					},
					customization: {
						visual: { style: { theme: "dark" } },
						paymentMethods: {
							maxInstallments: 1, // recurring = single-charge per cycle
						},
					},
					callbacks: {
						onReady: () => {
							// Brick rendered
						},
						onSubmit: async ({ formData }: any) => {
							setSubmitting(true);
							try {
								const url =
									mode === "subscribe"
										? "/api/mercadopago/create-preapproval"
										: "/api/mercadopago/change-plan";
								const res = await fetch(url, {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({
										planKey,
										cycle,
										cardTokenId: formData.token,
									}),
								});
								if (!res.ok) {
									const data = await res.json().catch(() => ({}));
									throw new Error(data?.message || "Falha ao criar assinatura");
								}
								toast.success(
									mode === "subscribe"
										? "Assinatura ativada!"
										: "Plano alterado!",
								);
								onSuccess();
							} catch (err: any) {
								toast.error(err.message || "Erro ao processar pagamento");
								throw err; // tells Bricks to keep the form open
							} finally {
								setSubmitting(false);
							}
						},
						onError: (err: any) => {
							console.error("[MpCheckoutModal] Brick error:", err);
						},
					},
				});
				if (!mounted) {
					await controller.unmount();
					return;
				}
				window.__mpBrickController = controller;
			} catch (err) {
				console.error("[MpCheckoutModal] brick mount failed:", err);
			}
		})();

		return () => {
			mounted = false;
			if (window.__mpBrickController) {
				window.__mpBrickController.unmount().catch(() => {});
				window.__mpBrickController = null;
			}
		};
	}, [open, tab, amountCentsBrl, planKey, cycle, mode, onSuccess]);

	// ── PIX flow ──
	const startPix = useCallback(async () => {
		setSubmitting(true);
		try {
			const res = await fetch("/api/mercadopago/create-pix-charge", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ planKey, cycle }),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.message || "Falha ao gerar PIX");
			}
			const data = await res.json();
			if (!data.qrCode || !data.qrCodeBase64) {
				throw new Error("Resposta sem QR code");
			}
			setPixState({
				kind: "ready",
				chargeId: data.chargeId,
				qrCode: data.qrCode,
				qrCodeBase64: data.qrCodeBase64,
				ticketUrl: data.ticketUrl,
				expiresAt: data.expiresAt,
			});
		} catch (err: any) {
			toast.error(err.message || "Erro ao gerar PIX");
		} finally {
			setSubmitting(false);
		}
	}, [planKey, cycle]);

	// Poll PIX status while the QR is shown
	useEffect(() => {
		if (pixState.kind !== "ready") return;
		const chargeId = pixState.chargeId;
		let stopped = false;
		const tick = async () => {
			if (stopped) return;
			try {
				const res = await fetch("/api/mercadopago/check-pix-status", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ chargeId }),
				});
				if (res.ok) {
					const data = await res.json();
					if (data.status === "approved") {
						setPixState({ kind: "approved" });
						toast.success("PIX confirmado! Atualizando sua conta…");
						onSuccess();
						return;
					}
				}
			} catch {
				// transient — keep polling
			}
			if (!stopped) setTimeout(tick, 5000);
		};
		const t = setTimeout(tick, 5000);
		return () => {
			stopped = true;
			clearTimeout(t);
		};
	}, [pixState, onSuccess]);

	const copyPix = useCallback(() => {
		if (pixState.kind !== "ready") return;
		navigator.clipboard
			.writeText(pixState.qrCode)
			.then(() => toast.success("Código copiado"))
			.catch(() => toast.error("Não foi possível copiar"));
	}, [pixState]);

	if (!open) return null;

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4'>
			<div className='w-full max-w-lg rounded-lg border border-edge bg-surface-card p-6 shadow-xl'>
				<div className='mb-4 flex items-start justify-between'>
					<div>
						<h3 className='text-lg font-semibold text-content'>
							{mode === "subscribe" ? "Assinar" : "Trocar plano"} — {planLabel}
						</h3>
						<p className='mt-1 text-sm text-content-muted'>
							{cycle === "annually" ? "Anual" : "Mensal"} ·{" "}
							{formatBrl(amountCentsBrl)}
						</p>
					</div>
					<button
						onClick={onClose}
						className='text-content-muted transition-colors hover:text-content'
						aria-label='Fechar'
					>
						✕
					</button>
				</div>

				{/* Tabs */}
				<div className='mb-4 flex gap-2 border-b border-edge'>
					<button
						onClick={() => setTab("card")}
						className={`px-3 py-2 text-sm font-medium transition-colors ${
							tab === "card"
								? "border-b-2 border-emerald-500 text-content"
								: "text-content-muted hover:text-content"
						}`}
					>
						Cartão
					</button>
					<button
						onClick={() => setTab("pix")}
						className={`px-3 py-2 text-sm font-medium transition-colors ${
							tab === "pix"
								? "border-b-2 border-emerald-500 text-content"
								: "text-content-muted hover:text-content"
						}`}
					>
						PIX
					</button>
				</div>

				{tab === "card" && (
					<div>
						<div id='mp-card-brick' ref={containerRef} />
						{submitting && (
							<p className='mt-2 text-xs text-content-muted'>Processando…</p>
						)}
					</div>
				)}

				{tab === "pix" && pixState.kind === "idle" && (
					<div className='space-y-4'>
						<p className='text-sm text-content-muted'>
							PIX é cobrado uma vez por ciclo. Você receberá lembretes por
							email 5 dias, 2 dias e no dia da renovação. Sem pagamento, a conta
							fica suspensa após 14 dias (dados preservados).
						</p>
						<button
							onClick={startPix}
							disabled={submitting}
							className='w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50'
						>
							{submitting ? "Gerando PIX…" : "Gerar PIX"}
						</button>
					</div>
				)}

				{tab === "pix" && pixState.kind === "ready" && (
					<div className='space-y-4'>
						<div className='flex justify-center'>
							<img
								src={`data:image/png;base64,${pixState.qrCodeBase64}`}
								alt='QR Code PIX'
								className='h-56 w-56 rounded-md border border-edge bg-white p-2'
							/>
						</div>
						<div>
							<label className='text-xs uppercase tracking-wider text-content-muted'>
								Código copia-cola
							</label>
							<div className='mt-1 flex gap-2'>
								<code className='flex-1 truncate rounded border border-edge bg-surface px-2 py-1.5 text-xs text-content-secondary'>
									{pixState.qrCode}
								</code>
								<button
									onClick={copyPix}
									className='rounded border border-edge px-3 py-1.5 text-xs text-content-secondary transition-colors hover:bg-surface-card-hover'
								>
									Copiar
								</button>
							</div>
						</div>
						<p className='text-xs text-content-muted'>
							Estamos verificando o pagamento. Você pode fechar essa janela —
							a confirmação cai por email assim que o PIX for compensado.
						</p>
					</div>
				)}

				{tab === "pix" && pixState.kind === "approved" && (
					<div className='space-y-4 py-8 text-center'>
						<div className='text-3xl text-emerald-400'>✓</div>
						<p className='text-content'>Pagamento confirmado!</p>
						<p className='text-sm text-content-muted'>
							Sua conta foi atualizada. Já pode fechar essa janela.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
