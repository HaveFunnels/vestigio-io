"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightIcon, SparkleIcon, CheckIcon, XIcon } from "@phosphor-icons/react/dist/ssr";
import toast from "react-hot-toast";
import { fmtCurrencyUnits } from "@/lib/format-currency";
import SeverityBadge from "@/components/console/SeverityBadge";

// ──────────────────────────────────────────────
// FirstFindingMoment — guided onboarding for low-awareness buyer
//
// Fires once when the first audit cycle completes. Replaces the
// numbers-only FirstAuditCelebration ("47 findings, 12 pages") with a
// concrete moment of "you're losing R$X here — here's what to do".
//
// Two-phase ritual:
//   Phase 1 (hook):   "Encontramos R$X saindo aqui" + the single
//                     highest-impact finding. Single CTA forward.
//   Phase 2 (guide):  Same finding expanded with methodology inline
//                     (not hidden behind a popover) + "Marcar como em
//                     progresso" which creates the UserAction in
//                     in_progress state via POST /onboarding/start-
//                     first-action. This is the activation event.
//
// Mobile-first: vertical stack, max-w-md, generous touch targets.
// Gracefully degrades to the legacy celebration when no negative
// findings exist (rare — first audits usually surface something).
//
// Dismiss option (X top-right) so the user is never trapped. Dismiss
// stamps localStorage so we don't re-show on refresh.
// ──────────────────────────────────────────────

interface FirstFinding {
	id: string;
	title: string;
	surface: string;
	severity: string;
	pack: string;
	impactMin: number;
	impactMax: number;
	impactMidpoint: number;
	rootCause: string | null;
	cause: string | null;
	effect: string | null;
	basisType: string | null;
}

interface FirstFindingResponse {
	finding: FirstFinding | null;
	totalLossMid: number;
	totalFindingCount: number;
	currency: string;
	isFirstSession: boolean;
}

interface Props {
	/** Fired when the moment resolves. `reason` lets the parent decide
	 *  whether to fall back to the legacy celebration (no_finding) or
	 *  not (engaged/dismissed). */
	onResolve: (reason: "engaged" | "dismissed" | "no_finding") => void;
}

const DISMISS_KEY = "vestigio.onboarding.firstFindingMomentDismissed";

export default function FirstFindingMoment({ onResolve }: Props) {
	const router = useRouter();
	const t = useTranslations("console.onboarding.first_finding");
	const locale = useLocale();
	const isPt = locale.startsWith("pt");
	const [data, setData] = useState<FirstFindingResponse | null>(null);
	const [phase, setPhase] = useState<"loading" | "hook" | "guide" | "submitting" | "done">("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1") {
			onResolve("dismissed");
			return;
		}
		(async () => {
			try {
				const res = await fetch("/api/onboarding/first-finding", { cache: "no-store" });
				if (!res.ok) {
					setError("fetch_failed");
					onResolve("no_finding");
					return;
				}
				const json = (await res.json()) as FirstFindingResponse;
				if (!json.finding || !json.isFirstSession) {
					onResolve("no_finding");
					return;
				}
				setData(json);
				setPhase("hook");
			} catch {
				setError("fetch_failed");
				onResolve("no_finding");
			}
		})();
	}, [onResolve]);

	function handleDismiss() {
		if (typeof window !== "undefined") {
			localStorage.setItem(DISMISS_KEY, "1");
		}
		onResolve("dismissed");
	}

	async function handleStartAction() {
		if (!data?.finding || phase === "submitting") return;
		setPhase("submitting");
		try {
			const res = await fetch("/api/onboarding/start-first-action", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ findingId: data.finding.id }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.message ?? (isPt ? "Falha ao iniciar ação" : "Failed to start action"));
				setPhase("guide");
				return;
			}
			const json = await res.json();
			if (typeof window !== "undefined") {
				localStorage.setItem(DISMISS_KEY, "1");
			}
			setPhase("done");
			// Delay before redirect so the success state is readable.
			setTimeout(() => {
				router.push(`/app/actions?highlight=${encodeURIComponent(json.id)}&welcome=1`);
				onResolve("engaged");
			}, 800);
		} catch {
			toast.error(isPt ? "Falha ao iniciar ação" : "Failed to start action");
			setPhase("guide");
		}
	}

	if (error) {
		return null;
	}
	if (phase === "loading" || !data || !data.finding) {
		return null;
	}

	const f = data.finding;

	return (
		<div className="fixed inset-0 z-[70] flex items-end justify-center bg-zinc-950/85 backdrop-blur-sm sm:items-center">
			<motion.div
				initial={{ y: 60, opacity: 0 }}
				animate={{ y: 0, opacity: 1 }}
				exit={{ y: 60, opacity: 0 }}
				transition={{ type: "spring", damping: 24, stiffness: 280 }}
				className="relative w-full max-w-md rounded-t-3xl border border-edge bg-surface-card p-6 shadow-2xl sm:rounded-3xl sm:p-8"
			>
				<button
					onClick={handleDismiss}
					aria-label={isPt ? "Pular" : "Skip"}
					className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-content-faint transition-colors hover:bg-surface-card-hover hover:text-content"
				>
					<XIcon size={16} weight="bold" />
				</button>

				<AnimatePresence mode="wait">
					{phase === "hook" && (
						<motion.div
							key="hook"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="space-y-5"
						>
							<div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-400">
								<SparkleIcon size={14} weight="fill" />
								{t("hook.eyebrow")}
							</div>
							<div>
								<div className="font-[family-name:var(--font-fraunces)] text-[28px] font-medium leading-[1.15] text-content sm:text-[32px]">
									{t("hook.headline", {
										total: fmtCurrencyUnits(data.totalLossMid, data.currency),
									})}
								</div>
								<div className="mt-2 text-[13px] leading-relaxed text-content-muted">
									{t("hook.subhead", { count: data.totalFindingCount })}
								</div>
							</div>

							<div className="rounded-2xl border border-edge bg-surface-inset/60 p-4">
								<div className="mb-2 flex items-center gap-2">
									<SeverityBadge value={f.severity} />
									<span className="font-mono text-[10px] uppercase tracking-[0.1em] text-content-faint">
										{f.surface}
									</span>
								</div>
								<div className="text-[15px] font-medium leading-snug text-content">
									{f.title}
								</div>
								<div className="mt-2 font-mono text-[14px] font-semibold tabular-nums text-rose-400">
									−{fmtCurrencyUnits(f.impactMidpoint, data.currency)}
									<span className="ml-1 text-[11px] font-normal text-content-faint">
										{t("per_month")}
									</span>
								</div>
							</div>

							<button
								onClick={() => setPhase("guide")}
								className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-[14px] font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-600"
							>
								{t("hook.cta")}
								<ArrowRightIcon size={14} weight="bold" />
							</button>
						</motion.div>
					)}

					{(phase === "guide" || phase === "submitting") && (
						<motion.div
							key="guide"
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -20 }}
							className="space-y-4"
						>
							<div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-content-faint">
								{t("guide.eyebrow")}
							</div>
							<div className="font-[family-name:var(--font-fraunces)] text-[22px] font-medium leading-snug text-content">
								{f.title}
							</div>

							{f.cause && f.effect && (
								<div className="space-y-2 rounded-xl border border-edge bg-surface-inset/40 p-4 text-[13px] leading-relaxed">
									<div>
										<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
											{t("guide.cause")}
										</div>
										<div className="text-content-secondary">{f.cause}</div>
									</div>
									<div>
										<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
											{t("guide.effect")}
										</div>
										<div className="text-content-secondary">{f.effect}</div>
									</div>
								</div>
							)}

							<div className="flex items-baseline justify-between rounded-xl border border-edge bg-surface-inset/40 px-4 py-3">
								<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-content-faint">
									{t("guide.range")}
								</div>
								<div className="font-mono text-[13px] font-semibold tabular-nums text-rose-400">
									−{fmtCurrencyUnits(f.impactMin, data.currency)} a{" "}
									−{fmtCurrencyUnits(f.impactMax, data.currency)}
									<span className="ml-1 text-[11px] font-normal text-content-faint">
										{t("per_month")}
									</span>
								</div>
							</div>

							<button
								onClick={handleStartAction}
								disabled={phase === "submitting"}
								className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-[14px] font-semibold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-600 disabled:opacity-60"
							>
								{phase === "submitting" ? t("guide.submitting") : t("guide.cta")}
								{phase !== "submitting" && <ArrowRightIcon size={14} weight="bold" />}
							</button>
							<button
								onClick={handleDismiss}
								className="block w-full text-center text-[12px] text-content-faint hover:text-content-muted"
							>
								{t("guide.skip")}
							</button>
						</motion.div>
					)}

					{phase === "done" && (
						<motion.div
							key="done"
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							className="flex flex-col items-center gap-3 py-6 text-center"
						>
							<div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
								<CheckIcon size={28} weight="bold" />
							</div>
							<div className="font-[family-name:var(--font-fraunces)] text-[20px] font-medium text-content">
								{t("done.headline")}
							</div>
							<div className="text-[12px] text-content-muted">{t("done.body")}</div>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</div>
	);
}
