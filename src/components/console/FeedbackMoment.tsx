"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useTrack } from "@/hooks/useProductTrack";
import { useFeedbackMoment } from "@/hooks/useFeedbackMoment";
import { motion, AnimatePresence } from "framer-motion";

// ──────────────────────────────────────────────
// FeedbackMoment — Compact inline micro-feedback prompt
//
// Two variants:
//   rating — 5-star + optional note (triggers 1-4)
//   nps    — 0-10 scale + note (trigger 5, 14-day pulse)
//
// Posts to existing /api/feedback. Fires telemetry events.
// Respects cooldowns via useFeedbackMoment hook.
// ──────────────────────────────────────────────

interface FeedbackMomentProps {
	trigger: string;
	variant?: "rating" | "nps";
	questionKey: string;
}

export default function FeedbackMoment({
	trigger,
	variant = "rating",
	questionKey,
}: FeedbackMomentProps) {
	const t = useTranslations("console.feedback_moments");
	const { track } = useTrack();
	const pathname = usePathname();
	const { shouldShow, markShown, markDismissed, markSubmitted } =
		useFeedbackMoment(trigger);

	const [visible, setVisible] = useState(false);
	const [rating, setRating] = useState<number | null>(null);
	const [hoveredStar, setHoveredStar] = useState<number | null>(null);
	const [note, setNote] = useState("");
	const [submitted, setSubmitted] = useState(false);

	useEffect(() => {
		if (shouldShow) {
			setVisible(true);
			markShown();
			track("feedback_moment_impression", { trigger });
		}
	}, [shouldShow, markShown, trigger, track]);

	const handleSubmit = useCallback(async () => {
		if (!rating) return;

		setSubmitted(true);
		markSubmitted();
		track("feedback_moment_submit", { trigger, rating });

		try {
			await fetch("/api/feedback", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: variant === "nps" ? "nps" : "contextual",
					rating: variant === "nps" ? rating : Math.min(5, rating),
					content: note || t(questionKey),
					page: pathname,
					title: `[${trigger}] ${variant === "nps" ? "NPS" : "Contextual"} feedback`,
				}),
			});
		} catch {
			// Non-fatal — feedback is best-effort
		}

		setTimeout(() => setVisible(false), 2000);
	}, [rating, note, trigger, variant, pathname, questionKey, t, markSubmitted, track]);

	const handleDismiss = useCallback(() => {
		setVisible(false);
		markDismissed();
		track("feedback_moment_dismiss", { trigger });
	}, [markDismissed, trigger, track]);

	if (!visible) return null;

	return (
		<AnimatePresence>
			{visible && (
				<>
					{/* ── Desktop: bottom card ── */}
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 8 }}
						transition={{ duration: 0.2 }}
						className="hidden rounded-lg border border-edge bg-surface-card p-3 sm:block"
					>
						{submitted ? (
							<p className="text-center text-xs font-medium text-emerald-400">
								{t("thanks")}
							</p>
						) : (
							<>
								{/* Close button */}
								<div className="mb-1 flex items-center justify-between">
									<p className="text-xs font-medium text-content-secondary">
										{t(questionKey)}
									</p>
									<button
										type="button"
										onClick={handleDismiss}
										className="flex h-5 w-5 items-center justify-center rounded text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content-muted"
									>
										<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
											<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>

								{/* Rating row */}
								<div className="mb-2 flex items-center gap-1">
									{variant === "nps" ? (
										Array.from({ length: 11 }, (_, i) => (
											<button
												key={i}
												type="button"
												onClick={() => setRating(i)}
												className={`h-6 w-6 rounded text-[10px] font-mono transition-colors ${
													rating === i
														? "bg-emerald-500 text-white"
														: "bg-surface-inset text-content-faint hover:bg-surface-card-hover"
												}`}
											>
												{i}
											</button>
										))
									) : (
										Array.from({ length: 5 }, (_, i) => {
											const starValue = i + 1;
											const active = starValue <= (hoveredStar ?? rating ?? 0);
											return (
												<button
													key={i}
													type="button"
													onClick={() => setRating(starValue)}
													onMouseEnter={() => setHoveredStar(starValue)}
													onMouseLeave={() => setHoveredStar(null)}
													className="transition-transform hover:scale-110"
												>
													<svg
														className={`h-5 w-5 ${active ? "text-amber-400" : "text-content-faint/30"}`}
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
													</svg>
												</button>
											);
										})
									)}
								</div>

								{rating !== null && (
									<input
										type="text"
										value={note}
										onChange={(e) => setNote(e.target.value)}
										placeholder={t("optional_note")}
										className="mb-2 w-full rounded border border-edge bg-surface-inset px-2 py-1 text-[11px] text-content placeholder:text-content-faint/50 focus:border-emerald-500/50 focus:outline-none"
										maxLength={200}
									/>
								)}

								{rating !== null && (
									<div className="flex justify-end">
										<button
											type="button"
											onClick={handleSubmit}
											className="rounded bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
										>
											{t("submit")}
										</button>
									</div>
								)}
							</>
						)}
					</motion.div>

					{/* ── Mobile: top notification banner ── */}
					<motion.div
						initial={{ opacity: 0, y: -40 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -40 }}
						transition={{ type: "spring", stiffness: 400, damping: 30 }}
						className="fixed inset-x-3 top-3 z-[60] rounded-2xl border border-edge bg-surface-card p-4 shadow-2xl shadow-black/30 sm:hidden"
					>
						{submitted ? (
							<p className="text-center text-sm font-medium text-emerald-400">
								{t("thanks")}
							</p>
						) : (
							<>
								<p className="mb-3 text-sm font-medium text-content">
									{t(questionKey)}
								</p>

								<div className="mb-3 flex items-center justify-center gap-1.5">
									{variant === "nps" ? (
										Array.from({ length: 11 }, (_, i) => (
											<button
												key={i}
												type="button"
												onClick={() => setRating(i)}
												className={`h-7 w-7 rounded-lg text-xs font-mono transition-colors ${
													rating === i
														? "bg-emerald-500 text-white"
														: "bg-surface-inset text-content-faint"
												}`}
											>
												{i}
											</button>
										))
									) : (
										Array.from({ length: 5 }, (_, i) => {
											const starValue = i + 1;
											const active = starValue <= (rating ?? 0);
											return (
												<button
													key={i}
													type="button"
													onClick={() => setRating(starValue)}
													className="p-0.5"
												>
													<svg
														className={`h-7 w-7 ${active ? "text-amber-400" : "text-content-faint/30"}`}
														fill="currentColor"
														viewBox="0 0 20 20"
													>
														<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
													</svg>
												</button>
											);
										})
									)}
								</div>

								{rating !== null && (
									<input
										type="text"
										value={note}
										onChange={(e) => setNote(e.target.value)}
										placeholder={t("optional_note")}
										className="mb-3 w-full rounded-lg border border-edge bg-surface-inset px-3 py-2 text-xs text-content placeholder:text-content-faint/50 focus:border-emerald-500/50 focus:outline-none"
										maxLength={200}
									/>
								)}

								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={handleDismiss}
										className="flex-1 rounded-lg border border-edge py-2 text-xs font-medium text-content-muted transition-colors hover:bg-surface-card-hover"
									>
										{t("later")}
									</button>
									{rating !== null && (
										<button
											type="button"
											onClick={handleSubmit}
											className="flex-1 rounded-lg bg-emerald-500/10 py-2 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
										>
											{t("submit")}
										</button>
									)}
								</div>
							</>
						)}
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}
