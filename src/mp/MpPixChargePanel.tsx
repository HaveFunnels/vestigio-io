"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

// ──────────────────────────────────────────────
// MpPixChargePanel — renders a pending PIX renewal at the top of the
// billing page. Distinct from MpCheckoutModal (which is the modal for
// brand-new subscriptions) because:
//   - The charge already exists (came from /api/billing).
//   - The QR + copy-paste are already issued — we just display them.
//   - User may have closed the modal and come back days later.
//
// We poll check-pix-status every 8s while the panel is visible so the
// admin sees the success state without manual refresh once the bank
// clears the PIX.
// ──────────────────────────────────────────────

export interface PixChargeData {
	id: string;
	status: string;
	amountCents: number;
	qrCode: string | null;
	qrCodeBase64: string | null;
	ticketUrl: string | null;
	dueAt: string | Date;
	expiresAt: string | Date | null;
	paidAt: string | Date | null;
	planKey: string;
	cycle: string;
}

interface Props {
	charge: PixChargeData;
	onPaid: () => void;
}

function formatBrl(cents: number) {
	return (cents / 100).toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function daysUntil(dateStr: string | Date) {
	const due = new Date(dateStr).getTime();
	const now = Date.now();
	const ms = due - now;
	return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function MpPixChargePanel({ charge, onPaid }: Props) {
	const [status, setStatus] = useState(charge.status);
	const [polling, setPolling] = useState(true);

	useEffect(() => {
		setStatus(charge.status);
	}, [charge.status]);

	// Polling loop while pending
	useEffect(() => {
		if (status !== "pending" || !polling) return;
		let stopped = false;
		const tick = async () => {
			if (stopped) return;
			try {
				const res = await fetch("/api/mercadopago/check-pix-status", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ chargeId: charge.id }),
				});
				if (res.ok) {
					const data = await res.json();
					if (data.status === "approved") {
						setStatus("approved");
						toast.success("PIX confirmado!");
						setPolling(false);
						onPaid();
						return;
					}
				}
			} catch {
				// transient
			}
			if (!stopped) setTimeout(tick, 8000);
		};
		const t = setTimeout(tick, 8000);
		return () => {
			stopped = true;
			clearTimeout(t);
		};
	}, [charge.id, status, polling, onPaid]);

	const copy = useCallback(() => {
		if (!charge.qrCode) return;
		navigator.clipboard
			.writeText(charge.qrCode)
			.then(() => toast.success("Código copiado"))
			.catch(() => toast.error("Não foi possível copiar"));
	}, [charge.qrCode]);

	if (status !== "pending") return null;
	if (!charge.qrCode || !charge.qrCodeBase64) return null;

	const days = daysUntil(charge.dueAt);
	const urgency = days <= 0 ? "red" : days <= 2 ? "orange" : "amber";
	const urgencyColor = {
		amber: "border-amber-500/40 bg-amber-500/5 text-amber-100",
		orange: "border-orange-500/40 bg-orange-500/5 text-orange-100",
		red: "border-red-500/50 bg-red-500/10 text-red-100",
	}[urgency];

	const dueLabel = days < 0
		? `Vencido há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`
		: days === 0
			? "Vence hoje"
			: `Vence em ${days} dia${days === 1 ? "" : "s"}`;

	return (
		<section
			id='pix-renewal'
			className={`mb-6 rounded-lg border p-5 ${urgencyColor}`}
		>
			<div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
				<div>
					<h2 className='text-sm font-semibold uppercase tracking-wider'>
						PIX pendente — renovação
					</h2>
					<p className='mt-1 text-sm opacity-90'>
						{formatBrl(charge.amountCents)} ·{" "}
						{charge.cycle === "annually" ? "Anual" : "Mensal"} · {dueLabel}
					</p>
				</div>
			</div>
			<div className='grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center'>
				<img
					src={`data:image/png;base64,${charge.qrCodeBase64}`}
					alt='QR Code PIX'
					className='h-48 w-48 rounded-md border border-white/20 bg-white p-2'
				/>
				<div className='space-y-3'>
					<div>
						<label className='text-xs uppercase tracking-wider opacity-70'>
							Código copia-cola
						</label>
						<div className='mt-1 flex gap-2'>
							<code className='flex-1 truncate rounded border border-white/20 bg-black/30 px-2 py-1.5 text-xs'>
								{charge.qrCode}
							</code>
							<button
								onClick={copy}
								className='rounded border border-white/20 px-3 py-1.5 text-xs transition-colors hover:bg-white/10'
							>
								Copiar
							</button>
						</div>
					</div>
					<p className='text-xs opacity-80'>
						Pague pelo app do seu banco. Estamos verificando — a confirmação
						aparece aqui em alguns segundos.{" "}
						{charge.ticketUrl && (
							<>
								Também disponível em{" "}
								<a
									href={charge.ticketUrl}
									target='_blank'
									rel='noopener noreferrer'
									className='underline'
								>
									página do MP
								</a>
								.
							</>
						)}
					</p>
				</div>
			</div>
		</section>
	);
}
