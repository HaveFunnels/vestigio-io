"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ShinyButton } from "@/components/ui/shiny-button";

type State = "input" | "loading" | "results";

const STATUS_MESSAGES = [
	{ message: "Discovering your website structure...", threshold: 0 },
	{ message: "Analyzing checkout flow...", threshold: 15 },
	{ message: "Checking payment integrity...", threshold: 30 },
	{ message: "Evaluating trust indicators...", threshold: 45 },
	{ message: "Measuring conversion friction...", threshold: 60 },
	{ message: "Calculating revenue impact...", threshold: 75 },
	{ message: "Preparing your report...", threshold: 90 },
];

const FINDINGS = [
	{
		severity: "CRITICAL" as const,
		title: "Checkout trust indicators missing",
		impact: "$8k–$22k/mo potential loss",
	},
	{
		severity: "HIGH" as const,
		title: "No refund or return policy detected",
		impact: "$3k–$9k/mo chargeback risk",
	},
	{
		severity: "HIGH" as const,
		title: "Analytics gap on conversion pages",
		impact: "$5k–$15k/mo in wasted ad spend",
	},
	{
		severity: "MEDIUM" as const,
		title: "Third-party scripts slowing checkout",
		impact: "$2k–$8k/mo conversion loss",
	},
	{
		severity: "MEDIUM" as const,
		title: "Mobile checkout friction detected",
		impact: "$4k–$12k/mo mobile revenue at risk",
	},
];

const severityStyles: Record<string, string> = {
	CRITICAL: "bg-red-500/15 text-red-400 border border-red-500/30",
	HIGH: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
	MEDIUM: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
};

function getStatusMessage(progress: number): string {
	let current = STATUS_MESSAGES[0].message;
	for (const entry of STATUS_MESSAGES) {
		if (progress >= entry.threshold) {
			current = entry.message;
		}
	}
	return current;
}

function extractDomain(input: string): string {
	let cleaned = input.trim();
	// Remove protocol
	cleaned = cleaned.replace(/^https?:\/\//, "");
	// Remove trailing slash and path
	cleaned = cleaned.split("/")[0];
	return cleaned || input.trim();
}

const MiniCalculator = () => {
	const [state, setState] = useState<State>("input");
	const [url, setUrl] = useState("");
	const [domain, setDomain] = useState("");
	const [progress, setProgress] = useState(0);
	const [currentMessage, setCurrentMessage] = useState(STATUS_MESSAGES[0].message);
	const [prevMessage, setPrevMessage] = useState("");
	const [isFading, setIsFading] = useState(false);

	const handleSubmit = useCallback(() => {
		if (!url.trim()) return;
		setDomain(extractDomain(url));
		setProgress(0);
		setCurrentMessage(STATUS_MESSAGES[0].message);
		setPrevMessage("");
		setIsFading(false);
		setState("loading");
	}, [url]);

	// Loading progress animation
	useEffect(() => {
		if (state !== "loading") return;

		const duration = 10000; // 10 seconds
		const startTime = performance.now();

		let rafId: number;
		const tick = (now: number) => {
			const elapsed = now - startTime;
			const pct = Math.min((elapsed / duration) * 100, 100);
			setProgress(pct);

			const newMessage = getStatusMessage(pct);
			setCurrentMessage((prev) => {
				if (prev !== newMessage) {
					setPrevMessage(prev);
					setIsFading(true);
					setTimeout(() => setIsFading(false), 400);
					return newMessage;
				}
				return prev;
			});

			if (pct < 100) {
				rafId = requestAnimationFrame(tick);
			} else {
				// Wait 500ms after reaching 100% then show results
				setTimeout(() => setState("results"), 500);
			}
		};

		rafId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafId);
	}, [state]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleSubmit();
	};

	const handleReset = () => {
		setState("input");
		setUrl("");
		setDomain("");
		setProgress(0);
	};

	return (
		<section className="relative z-1 overflow-hidden bg-[#090911] border-t border-zinc-800 py-20 lg:py-28">
			<div className="mx-auto w-full max-w-[800px] px-4 sm:px-8 xl:px-0">
				{/* ===================== STATE 1: INPUT ===================== */}
				{state === "input" && (
					<div className="text-center">
						<h2 className="mb-4 text-3xl font-bold tracking-tight text-white lg:text-4xl xl:text-5xl">
							See what you&rsquo;re leaving on the table
						</h2>
						<p className="mb-10 text-base text-gray-400 max-w-[540px] mx-auto">
							Enter your website URL to get a free snapshot of potential revenue leaks.
						</p>

						<div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-[540px] mx-auto">
							<input
								type="text"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="Enter your website URL..."
								className="w-full rounded-xl border border-zinc-700 bg-zinc-900/50 px-5 py-3.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500/30"
							/>
							<ShinyButton
								onClick={handleSubmit}
								className="shrink-0 w-full sm:w-auto"
								disabled={!url.trim()}
							>
								Run Free Audit
							</ShinyButton>
						</div>
					</div>
				)}

				{/* ===================== STATE 2: LOADING ===================== */}
				{state === "loading" && (
					<div className="text-center">
						<h2 className="mb-2 text-2xl font-bold tracking-tight text-white lg:text-3xl">
							Analyzing {domain}
						</h2>
						<p className="mb-10 text-sm text-zinc-500">
							This usually takes a few seconds&hellip;
						</p>

						{/* Progress bar */}
						<div className="mx-auto max-w-[480px] mb-8">
							<div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
								<div
									className="h-full rounded-full bg-emerald-500 transition-[width] duration-100 ease-linear"
									style={{
										width: `${progress}%`,
										boxShadow: "0 0 12px rgba(16,185,129,0.45)",
									}}
								/>
							</div>
							<p className="mt-3 text-right text-xs font-mono text-zinc-500">
								{Math.round(progress)}%
							</p>
						</div>

						{/* Rotating status message */}
						<div className="relative h-6 overflow-hidden">
							{/* Fading out previous message */}
							{isFading && prevMessage && (
								<p className="absolute inset-x-0 text-sm text-zinc-400 animate-fadeOut">
									{prevMessage}
								</p>
							)}
							{/* Fading in current message */}
							<p
								className={`text-sm text-zinc-400 transition-opacity duration-400 ${
									isFading ? "opacity-0" : "opacity-100"
								}`}
							>
								{currentMessage}
							</p>
						</div>
					</div>
				)}

				{/* ===================== STATE 3: RESULTS ===================== */}
				{state === "results" && (
					<div>
						{/* Header */}
						<div className="text-center mb-10">
							<p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">
								Scan complete
							</p>
							<h2 className="text-2xl font-bold tracking-tight text-white lg:text-3xl">
								Results for{" "}
								<span className="text-emerald-400">{domain}</span>
							</h2>
						</div>

						{/* Findings table */}
						<div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden mb-8">
							{/* Table header */}
							<div className="hidden sm:grid grid-cols-[100px_1fr_200px] gap-4 px-5 py-3 border-b border-zinc-800 text-xs font-mono uppercase tracking-wider text-zinc-500">
								<span>Severity</span>
								<span>Finding</span>
								<span className="text-right">Est. Impact</span>
							</div>

							{/* Rows */}
							{FINDINGS.map((finding, i) => (
								<div
									key={i}
									className={`sm:grid sm:grid-cols-[100px_1fr_200px] gap-4 px-5 py-4 items-center ${
										i < FINDINGS.length - 1 ? "border-b border-zinc-800/60" : ""
									}`}
								>
									{/* Severity badge */}
									<div className="mb-2 sm:mb-0">
										<span
											className={`inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${severityStyles[finding.severity]}`}
										>
											{finding.severity}
										</span>
									</div>

									{/* Title */}
									<p className="text-sm text-zinc-200 mb-1 sm:mb-0">
										{finding.title}
									</p>

									{/* Impact */}
									<p className="text-sm font-mono text-emerald-400 sm:text-right">
										{finding.impact}
									</p>
								</div>
							))}
						</div>

						{/* Total impact */}
						<div className="text-center mb-12">
							<p className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-2">
								Estimated Monthly Impact
							</p>
							<p className="text-4xl font-bold text-white lg:text-5xl">
								<span className="text-emerald-400">$22k–$66k</span>
								<span className="text-zinc-500 text-2xl lg:text-3xl">/mo</span>
							</p>
						</div>

						{/* CTA */}
						<div className="text-center">
							<p className="mb-6 text-base text-zinc-300">
								Want the full analysis with evidence and action plans?
							</p>
							<div className="flex items-center justify-center gap-4 mb-6">
								<Link
									href="/auth/signup"
									className="rounded-[1rem] bg-white px-7 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-100"
								>
									Create Free Account
								</Link>
								<Link
									href="/pricing"
									className="rounded-[1rem] border border-white/20 px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/5"
								>
									See Pricing
								</Link>
							</div>
							<p className="text-xs text-zinc-600 max-w-[500px] mx-auto">
								This is a preliminary estimate. Full analysis includes verification, root cause analysis, and prioritized action plans.
							</p>

							{/* Reset link */}
							<button
								onClick={handleReset}
								className="mt-6 text-xs text-zinc-600 hover:text-zinc-400 transition-colors underline underline-offset-2"
							>
								Scan another site
							</button>
						</div>
					</div>
				)}
			</div>
		</section>
	);
};

export default MiniCalculator;
