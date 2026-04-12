"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ──────────────────────────────────────────────
// Onboarding Thank-You / Bridge Page
//
// Shown immediately after successful checkout. Its job is to:
//   1. Confirm payment landed
//   2. Set expectations ("we're scanning your site right now")
//   3. Hand the user off to /app/inventory where the live banner-row
//      shows the audit progress in real time
//
// Total dwell time: ~4 seconds. The redirect happens automatically.
// No data fetching here — the heavy lifting is in /app/inventory.
// ──────────────────────────────────────────────

const REDIRECT_AFTER_MS = 4000;

const STAGES = [
	"Payment confirmed",
	"Spinning up your workspace",
	"Queueing your first audit",
	"Opening your inventory",
] as const;

export default function OnboardThankYouPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const orgId = searchParams.get("org");
	const [activeStage, setActiveStage] = useState(0);
	const [countdown, setCountdown] = useState(Math.ceil(REDIRECT_AFTER_MS / 1000));
	const [progress, setProgress] = useState(0);

	// Redirect after a short dwell.
	useEffect(() => {
		const timer = setTimeout(() => {
			router.replace("/app/inventory");
		}, REDIRECT_AFTER_MS);
		return () => clearTimeout(timer);
	}, [router]);

	// Sequentially light up each stage so the screen feels alive.
	useEffect(() => {
		const interval = setInterval(() => {
			setActiveStage((s) => (s < STAGES.length - 1 ? s + 1 : s));
		}, REDIRECT_AFTER_MS / STAGES.length);
		return () => clearInterval(interval);
	}, []);

	// Countdown timer + progress bar
	useEffect(() => {
		const startTime = Date.now();
		const tick = setInterval(() => {
			const elapsed = Date.now() - startTime;
			const remaining = Math.max(0, Math.ceil((REDIRECT_AFTER_MS - elapsed) / 1000));
			setCountdown(remaining);
			setProgress(Math.min(100, (elapsed / REDIRECT_AFTER_MS) * 100));
		}, 100);
		return () => clearInterval(tick);
	}, []);

	return (
		<div className="flex min-h-full items-center justify-center px-4 py-20">
			<div className="w-full max-w-md text-center">
				{/* Success mark */}
				<div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
					<svg
						className="h-7 w-7 text-emerald-400"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={2.25}
						stroke="currentColor"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
					</svg>
				</div>

				<h1 className="text-2xl font-semibold text-zinc-100">
					You&rsquo;re in.
				</h1>
				<p className="mt-2 text-sm text-zinc-400">
					Vestigio is already scanning your site. You&rsquo;ll see pages appear
					as they&rsquo;re discovered &mdash; no need to refresh.
				</p>

				{/* Progress bar + countdown */}
				<div className="mt-6 overflow-hidden rounded-full bg-zinc-800">
					<div
						className="h-1.5 rounded-full bg-emerald-500 transition-all duration-100 ease-linear"
						style={{ width: `${progress}%` }}
					/>
				</div>
				<p className="mt-2 text-xs text-zinc-500">
					Redirecting in {countdown}s&hellip;
				</p>

				{/* Stage progression */}
				<ul className="mt-6 space-y-2.5 text-left">
					{STAGES.map((label, idx) => {
						const isDone = idx < activeStage;
						const isActive = idx === activeStage;
						return (
							<li
								key={label}
								className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-sm transition-colors ${
									isDone
										? "border-emerald-500/20 bg-emerald-500/5 text-zinc-300"
										: isActive
											? "border-zinc-600 bg-zinc-900 text-zinc-200"
											: "border-zinc-800 bg-zinc-900/50 text-zinc-600"
								}`}
							>
								{isDone ? (
									<svg
										className="h-4 w-4 text-emerald-400"
										fill="none"
										viewBox="0 0 24 24"
										strokeWidth={2.5}
										stroke="currentColor"
									>
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
								) : isActive ? (
									<span className="relative flex h-3.5 w-3.5">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
										<span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-emerald-400" />
									</span>
								) : (
									<span className="h-3.5 w-3.5 rounded-full border border-zinc-700" />
								)}
								<span>{label}</span>
							</li>
						);
					})}
				</ul>

				{/* Manual fallback */}
				<button
					type="button"
					onClick={() => router.replace("/app/inventory")}
					className="mt-8 text-xs text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300 hover:underline"
				>
					Skip and go to inventory now
				</button>

				{orgId && (
					<p className="mt-4 text-[10px] text-zinc-700 font-mono">
						org · {orgId}
					</p>
				)}
			</div>
		</div>
	);
}
