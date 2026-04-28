"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

// ──────────────────────────────────────────────
// Cancel Flow — 3-step exit survey + save offer
//
// Step 1: Exit survey (reason selection)
// Step 2: Dynamic save offer based on reason
// Step 3: Final confirmation with feature loss list
// ──────────────────────────────────────────────

const REASONS = [
	"too_expensive",
	"not_using",
	"missing_feature",
	"switching",
	"technical",
	"temporary",
	"other",
] as const;

type Reason = (typeof REASONS)[number];

interface SaveOffer {
	primary: string;
	fallback: string;
}

export default function CancelFlowPage() {
	const t = useTranslations("console.cancel_flow");
	const router = useRouter();

	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [reason, setReason] = useState<Reason | null>(null);
	const [freeText, setFreeText] = useState("");
	const [surveyId, setSurveyId] = useState<string | null>(null);
	const [offer, setOffer] = useState<SaveOffer | null>(null);
	const [pauseMonths, setPauseMonths] = useState(1);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [cancelled, setCancelled] = useState(false);

	// ── Step 1: Submit survey ──
	async function handleSubmitSurvey() {
		if (!reason) return;
		setLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/billing/cancel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "survey",
					reason,
					freeText: freeText || undefined,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || "Failed to submit survey");
			}

			const data = await res.json();
			setSurveyId(data.surveyId);
			setOffer(data.offer);
			setStep(2);
		} catch (err: any) {
			setError(err.message || "Something went wrong");
		} finally {
			setLoading(false);
		}
	}

	// ── Step 2: Accept offer ──
	async function handleAcceptOffer(offerType: string) {
		if (!surveyId) return;
		setLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/billing/cancel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "accept-offer",
					surveyId,
					offerType,
					pauseMonths: offerType === "pause" ? pauseMonths : undefined,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || "Failed to accept offer");
			}

			// Offer accepted — redirect back to settings
			router.push("/app/settings");
		} catch (err: any) {
			setError(err.message || "Something went wrong");
		} finally {
			setLoading(false);
		}
	}

	// ── Step 3: Confirm cancel ──
	async function handleConfirmCancel() {
		if (!surveyId) return;
		setLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/billing/cancel", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					action: "confirm",
					surveyId,
				}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.message || "Failed to cancel subscription");
			}

			setCancelled(true);
		} catch (err: any) {
			setError(err.message || "Something went wrong");
		} finally {
			setLoading(false);
		}
	}

	// ── Post-cancel state ──
	if (cancelled) {
		return (
			<div className="mx-auto max-w-lg px-6 py-16 text-center">
				<div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
					<svg
						className="h-8 w-8 text-zinc-400"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={1.5}
						stroke="currentColor"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
						/>
					</svg>
				</div>
				<h1 className="mb-3 text-xl font-semibold text-content">
					{t("cancelled_title")}
				</h1>
				<p className="mb-8 text-sm text-content-muted">
					{t("cancelled_description")}
				</p>
				<button
					onClick={() => router.push("/app/settings")}
					className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
				>
					{t("back_to_settings")}
				</button>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-lg px-6 py-10">
			{/* Progress indicator */}
			<div className="mb-8 flex items-center justify-center gap-2">
				{[1, 2, 3].map((s) => (
					<div
						key={s}
						className={`h-1.5 w-12 rounded-full transition-colors ${
							s <= step ? "bg-emerald-500" : "bg-zinc-700"
						}`}
					/>
				))}
			</div>

			{error && (
				<div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
					{error}
				</div>
			)}

			{/* ── Step 1: Exit Survey ── */}
			{step === 1 && (
				<div>
					<h1 className="mb-2 text-xl font-semibold text-content">
						{t("survey_title")}
					</h1>
					<p className="mb-6 text-sm text-content-muted">
						{t("survey_subtitle")}
					</p>

					<div className="space-y-2">
						{REASONS.map((r) => (
							<button
								key={r}
								type="button"
								onClick={() => setReason(r)}
								className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
									reason === r
										? "border-emerald-500/50 bg-emerald-500/10 text-content"
										: "border-edge bg-surface-card text-content-muted hover:border-zinc-600"
								}`}
							>
								<div
									className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
										reason === r
											? "border-emerald-500 bg-emerald-500"
											: "border-zinc-600"
									}`}
								>
									{reason === r && (
										<div className="h-1.5 w-1.5 rounded-full bg-white" />
									)}
								</div>
								{t(`reasons.${r}`)}
							</button>
						))}
					</div>

					{/* Free text */}
					<div className="mt-4">
						<textarea
							value={freeText}
							onChange={(e) => setFreeText(e.target.value)}
							placeholder={t("free_text_placeholder")}
							rows={3}
							className="w-full rounded-lg border border-edge bg-surface-input px-4 py-3 text-sm text-content outline-none placeholder:text-content-faint focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
						/>
					</div>

					{/* Actions */}
					<div className="mt-6 flex items-center justify-between">
						<button
							onClick={() => router.push("/app/settings")}
							className="text-sm text-emerald-500 transition-colors hover:text-emerald-400"
						>
							{t("keep_subscription")}
						</button>
						<button
							onClick={handleSubmitSurvey}
							disabled={!reason || loading}
							className="rounded-lg bg-zinc-700 px-6 py-2.5 text-sm font-medium text-content transition-colors hover:bg-zinc-600 disabled:opacity-50"
						>
							{loading ? t("loading") : t("continue")}
						</button>
					</div>
				</div>
			)}

			{/* ── Step 2: Save Offer ── */}
			{step === 2 && offer && (
				<div>
					<h1 className="mb-2 text-xl font-semibold text-content">
						{t("offer_title")}
					</h1>
					<p className="mb-6 text-sm text-content-muted">
						{t("offer_subtitle")}
					</p>

					{/* Dynamic offer card */}
					<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
						<div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
							<OfferIcon type={offer.primary} />
						</div>
						<h2 className="mb-2 text-lg font-semibold text-content">
							{t(`offers.${offer.primary}.title`)}
						</h2>
						<p className="mb-4 text-sm text-content-muted">
							{t(`offers.${offer.primary}.description`)}
						</p>

						{/* Pause duration selector */}
						{offer.primary === "pause" && (
							<div className="mb-4 flex gap-2">
								{[1, 2, 3].map((m) => (
									<button
										key={m}
										onClick={() => setPauseMonths(m)}
										className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
											pauseMonths === m
												? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
												: "border-edge bg-surface-card text-content-muted hover:border-zinc-600"
										}`}
									>
										{m} {t(m === 1 ? "month" : "months")}
									</button>
								))}
							</div>
						)}

						<button
							onClick={() => handleAcceptOffer(offer.primary)}
							disabled={loading}
							className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
						>
							{loading ? t("loading") : t(`offers.${offer.primary}.cta`)}
						</button>
					</div>

					{/* Fallback offer (if different from primary) */}
					{offer.fallback !== "none" &&
						offer.fallback !== offer.primary && (
							<div className="mt-4 rounded-xl border border-edge bg-surface-card p-5">
								<h3 className="mb-1 text-sm font-medium text-content">
									{t(`offers.${offer.fallback}.title`)}
								</h3>
								<p className="mb-3 text-xs text-content-muted">
									{t(`offers.${offer.fallback}.description`)}
								</p>
								<button
									onClick={() => handleAcceptOffer(offer.fallback)}
									disabled={loading}
									className="rounded-lg border border-edge bg-zinc-800 px-4 py-2 text-sm font-medium text-content transition-colors hover:bg-zinc-700 disabled:opacity-50"
								>
									{t(`offers.${offer.fallback}.cta`)}
								</button>
							</div>
						)}

					{/* Continue cancelling */}
					<div className="mt-6 text-center">
						<button
							onClick={() => setStep(3)}
							className="text-sm text-zinc-500 transition-colors hover:text-zinc-400"
						>
							{t("no_thanks")}
						</button>
					</div>
				</div>
			)}

			{/* ── Step 3: Confirmation ── */}
			{step === 3 && (
				<div>
					<h1 className="mb-2 text-xl font-semibold text-content">
						{t("confirm_title")}
					</h1>
					<p className="mb-6 text-sm text-content-muted">
						{t("confirm_subtitle")}
					</p>

					{/* What you'll lose */}
					<div className="mb-6 rounded-xl border border-edge bg-surface-card p-5">
						<h3 className="mb-3 text-sm font-semibold text-content">
							{t("lose_title")}
						</h3>
						<ul className="space-y-2">
							{(
								[
									"continuous_audits",
									"ai_chat",
									"revenue_maps",
									"priority_support",
									"integrations",
									"team_access",
								] as const
							).map((feature) => (
								<li
									key={feature}
									className="flex items-center gap-2 text-sm text-content-muted"
								>
									<svg
										className="h-4 w-4 shrink-0 text-red-400"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2}
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M6 18L18 6M6 6l12 12"
										/>
									</svg>
									{t(`lose_features.${feature}`)}
								</li>
							))}
						</ul>
					</div>

					{/* Data retention notice */}
					<p className="mb-6 text-xs text-content-faint">
						{t("data_retention")}
					</p>

					{/* Actions */}
					<div className="flex flex-col gap-3">
						<button
							onClick={handleConfirmCancel}
							disabled={loading}
							className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
						>
							{loading ? t("loading") : t("confirm_cancel")}
						</button>
						<button
							onClick={() => router.push("/app/settings")}
							className="w-full rounded-lg border border-edge bg-surface-card py-2.5 text-sm font-medium text-content transition-colors hover:bg-surface-card-hover"
						>
							{t("changed_mind")}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

// ── Offer type icons ──

function OfferIcon({ type }: { type: string }) {
	const cls = "h-5 w-5 text-emerald-400";

	switch (type) {
		case "discount":
			return (
				<svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
					<path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
				</svg>
			);
		case "pause":
			return (
				<svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
				</svg>
			);
		case "downgrade":
			return (
				<svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
				</svg>
			);
		case "support":
			return (
				<svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
				</svg>
			);
		case "roadmap":
			return (
				<svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
				</svg>
			);
		default:
			return (
				<svg className={cls} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
				</svg>
			);
	}
}
