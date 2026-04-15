"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import toast from "react-hot-toast";

// ──────────────────────────────────────────────
// BuyCreditsModal — Max-plan top-up UI
//
// Opens Paddle.Checkout for a one-time credit pack transaction. The
// Paddle webhook (transaction.completed) detects the pack priceId and
// calls addPurchasedCredits(orgId, pack.credits).
//
// Props:
//   open           — controls visibility
//   onClose        — parent-owned close handler
//   planKey        — current org plan; we hide the CTA for non-Max but
//                    still render the modal (so Pro users can see the
//                    "upgrade to Max" nudge with the same i18n flow).
//   orgId          — passed to Paddle.Checkout.open.customData so the
//                    webhook can credit the right org (the logged-in
//                    user is the buyer; but an admin could be buying
//                    on behalf of their org — customData pins it).
//
// Gotchas:
//   - Paddle.js must be loaded by the parent (billing page does this
//     via <PaddleLoader />). If it isn't ready when the user clicks,
//     we toast an error instead of crashing.
//   - We don't optimistically credit. The UI shows "processing" until
//     checkout.completed fires in PaddleLoader's eventCallback, which
//     triggers a session refresh + router.refresh. The billing page
//     then re-fetches /api/credits/balance.
// ──────────────────────────────────────────────

interface CreditPack {
	key: string;
	label: string;
	credits: number;
	priceId: string;
	usdCents: number;
	brlCents: number;
}

interface BuyCreditsModalProps {
	open: boolean;
	onClose: () => void;
	planKey: string;
	orgId: string | null;
}

export function BuyCreditsModal({
	open,
	onClose,
	planKey,
	orgId,
}: BuyCreditsModalProps) {
	const t = useTranslations("console.billing.credits");
	const tErr = useTranslations("console.billing.errors");
	const locale = useLocale();
	const { data: session } = useSession();

	const [packs, setPacks] = useState<CreditPack[] | null>(null);
	const [launching, setLaunching] = useState<string | null>(null); // pack key being opened

	// Fetch packs once when modal first becomes visible. No cache
	// invalidation — packs change rarely and the /api/credit-packs route
	// reads from PlatformConfig with its own 60s cache.
	useEffect(() => {
		if (!open || packs !== null) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch("/api/credit-packs");
				if (!res.ok) throw new Error(`status=${res.status}`);
				const data = await res.json();
				if (!cancelled) setPacks(data.packs || []);
			} catch {
				if (!cancelled) setPacks([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, packs]);

	const formatPrice = useCallback(
		(pack: CreditPack) => {
			// Show the BRL price to pt-BR visitors, USD to everyone else.
			// Paddle itself decides the actual charge at checkout based on
			// the buyer's billing address — this is just display, so aligning
			// on the locale default is the safest psychological anchor.
			const isBR = locale === "pt-BR";
			const cents = isBR ? pack.brlCents : pack.usdCents;
			const currency = isBR ? "BRL" : "USD";
			return new Intl.NumberFormat(isBR ? "pt-BR" : "en-US", {
				style: "currency",
				currency,
				maximumFractionDigits: 0,
			}).format(cents / 100);
		},
		[locale],
	);

	const packDescKey = (packKey: string): string => {
		if (packKey === "pack-50") return "pack_small_desc";
		if (packKey === "pack-200") return "pack_medium_desc";
		if (packKey === "pack-500") return "pack_large_desc";
		// Fallback for future packs without a dedicated desc — the small desc
		// is a reasonable generic (won't render wildly off if someone adds
		// a pack-1000 before we wire a string for it).
		return "pack_small_desc";
	};

	const handleBuy = useCallback(
		(pack: CreditPack) => {
			if (typeof window === "undefined" || !window.Paddle) {
				toast.error(tErr("payment_loading"));
				return;
			}
			if (!orgId) {
				// Without orgId the webhook can't credit. This should only
				// happen for demo contexts; we gate the modal on orgId in
				// the parent but double-check here.
				toast.error(tErr("plan_unavailable"));
				return;
			}
			setLaunching(pack.key);
			try {
				window.Paddle.Checkout.open({
					items: [{ priceId: pack.priceId, quantity: 1 }],
					customData: {
						organizationId: orgId,
						userId: (session?.user as any)?.id || "",
						type: "credit_pack",
						packKey: pack.key,
					},
					settings: {
						displayMode: "overlay",
					},
				});
			} catch (err) {
				console.error("[BuyCreditsModal] checkout open failed:", err);
				toast.error(tErr("network_error"));
			} finally {
				// Paddle's overlay handles its own dismissal; reset the "opening…"
				// state so the buttons are responsive if the user cancels.
				setTimeout(() => setLaunching(null), 1500);
			}
		},
		[orgId, session, tErr],
	);

	if (!open) return null;

	const isMax = planKey === "max";

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			onClick={onClose}
		>
			<div
				className="w-full max-w-2xl rounded-lg border border-edge bg-surface-card p-6 shadow-xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="mb-4 flex items-start justify-between gap-4">
					<div>
						<h3 className="text-lg font-semibold text-content">
							{t("pack_heading")}
						</h3>
						<p className="mt-1 text-sm text-content-muted">
							{t("pack_subheading")}
						</p>
					</div>
					<button
						onClick={onClose}
						className="rounded-md border border-edge px-3 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-card-hover"
					>
						{t("close")}
					</button>
				</div>

				{!isMax ? (
					<div className="rounded-md border border-edge bg-surface-card-hover p-4 text-sm text-content-muted">
						{t("only_max")}
					</div>
				) : packs === null ? (
					<div className="py-8 text-center text-sm text-content-muted">
						{t("processing")}
					</div>
				) : packs.length === 0 ? (
					<div className="rounded-md border border-edge bg-surface-card-hover p-4 text-sm text-content-muted">
						{tErr("packs_unavailable")}
					</div>
				) : (
					<>
						<div className="grid gap-3 sm:grid-cols-3">
							{packs.map((pack) => (
								<button
									key={pack.key}
									onClick={() => handleBuy(pack)}
									disabled={launching !== null}
									className="flex flex-col items-start gap-2 rounded-md border border-edge bg-surface-card p-4 text-left transition-colors hover:border-emerald-500/60 hover:bg-surface-card-hover disabled:opacity-50"
								>
									<div className="text-base font-semibold text-content">
										{t("pack_credits", { credits: pack.credits })}
									</div>
									<div className="text-xs text-content-muted">
										{t(packDescKey(pack.key) as any)}
									</div>
									<div className="mt-auto text-sm font-medium text-emerald-400">
										{launching === pack.key
											? t("processing")
											: t("pack_cta", { price: formatPrice(pack) })}
									</div>
								</button>
							))}
						</div>
						<p className="mt-4 text-xs text-content-faint">
							{t("pricing_note")}
						</p>
					</>
				)}
			</div>
		</div>
	);
}
