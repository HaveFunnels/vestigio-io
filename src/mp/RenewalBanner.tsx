"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ──────────────────────────────────────────────
// RenewalBanner — top-of-app reminder when an MP user's PIX renewal
// is within 5 days of dueAt and not yet paid. Shown across every app
// page (not just /billing) so the admin can't miss it.
//
// Color escalates as the date approaches:
//   D-5 .. D-3  amber
//   D-2 .. D-1  orange
//   D-0 onward  red
//
// We render NOTHING on the server (banner depends on user-scoped data)
// and fetch /api/billing once on mount. Subsequent app navigation
// re-mounts the banner via the layout, so the fetch repeats — cheap
// enough to skip caching for now.
// ──────────────────────────────────────────────

interface BillingSnapshot {
	pixCharge: {
		id: string;
		status: string;
		dueAt: string | Date;
		amountCents: number;
		cycle: string;
		planKey: string;
	} | null;
	userProvider: "mercadopago" | "paddle" | null;
	currentPeriodEnd: string | null;
}

function daysUntil(dateStr: string | Date) {
	const due = new Date(dateStr).getTime();
	return Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
}

export function RenewalBanner() {
	const [snap, setSnap] = useState<BillingSnapshot | null>(null);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch("/api/billing")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (cancelled || !data) return;
				setSnap({
					pixCharge: data.pixCharge,
					userProvider: data.userProvider,
					currentPeriodEnd: data.currentPeriodEnd,
				});
			})
			.catch(() => {
				/* silent — banner just stays hidden */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!snap || dismissed) return null;
	if (snap.userProvider !== "mercadopago") return null;

	// The trigger is the upcoming period end OR a pending PIX charge,
	// whichever is sooner / more critical. We never show when the most
	// recent PIX is `approved` — that's the post-payment quiet state.
	const pix = snap.pixCharge;
	if (pix?.status === "approved") return null;

	// Use pixCharge.dueAt if present, else fall back to
	// currentPeriodEnd. Without either, no banner.
	const dueIso = pix?.dueAt ?? snap.currentPeriodEnd;
	if (!dueIso) return null;

	const days = daysUntil(dueIso);
	if (days > 5) return null; // outside the reminder window

	const urgency = days <= 0 ? "red" : days <= 2 ? "orange" : "amber";
	const colors = {
		amber: "border-amber-500/40 bg-amber-500/10 text-amber-100",
		orange: "border-orange-500/40 bg-orange-500/10 text-orange-100",
		red: "border-red-500/50 bg-red-500/15 text-red-100",
	}[urgency];

	const headline = days < 0
		? `Sua assinatura venceu há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`
		: days === 0
			? "Sua assinatura vence hoje"
			: `Sua assinatura vence em ${days} dia${days === 1 ? "" : "s"}`;

	const detail = pix
		? "Você tem um PIX pendente — pague para manter sua conta ativa."
		: "Renove para evitar suspensão da conta.";

	return (
		<div className={`border-b px-4 py-2.5 ${colors}`}>
			<div className='mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3'>
				<div className='text-sm'>
					<strong className='font-semibold'>{headline}.</strong>{" "}
					<span className='opacity-90'>{detail}</span>
				</div>
				<div className='flex items-center gap-2'>
					<Link
						href='/app/billing#pix-renewal'
						className='rounded-md border border-white/20 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/10'
					>
						Ir para billing
					</Link>
					{urgency === "amber" && (
						<button
							onClick={() => setDismissed(true)}
							className='text-xs opacity-70 transition-colors hover:opacity-100'
							aria-label='Fechar lembrete'
						>
							✕
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
