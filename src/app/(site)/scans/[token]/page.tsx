"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ──────────────────────────────────────────────
// /scans/[token] — Public Prospect Scan Result
//
// Public, shareable result page for admin-initiated prospect scans.
// Visited by people who got a cold email or LinkedIn DM with the
// share link. Different from /lp/audit/result/[leadId] in that:
//
//   - No "Unlock the full audit" CTA (this is outreach, not closing)
//   - Soft CTA at the bottom: "Want this for your own site?" → /lp/audit
//   - Token is 32 hex chars, not guessable
//   - Reads from ProspectScan via /api/scans/[token]
//
// Goal: visitor sees the audit, recognizes their site, gets curious,
// clicks through to /lp/audit to run their own.
// ──────────────────────────────────────────────

interface ScanData {
	domain: string;
	label: string | null;
	status: "pending" | "running" | "complete" | "failed";
	pagesScanned: number;
	durationMs: number | null;
	createdAt: string;
	completedAt: string | null;
	preview: {
		title: string | null;
		description: string | null;
		og_image_url: string | null;
		favicon_url: string | null;
		host: string;
		http_status: number;
		response_time_ms: number;
	} | null;
	visibleFindings: Array<{
		id: string;
		severity: "critical" | "high" | "medium" | "positive";
		category: string;
		title: string;
		body: string;
		impact_hint: string;
	}>;
	blurredFindings: Array<{
		id: string;
		category: string;
		teaser_title: string;
	}>;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40;

export default function PublicScanPage() {
	const params = useParams<{ token: string }>();
	const token = params?.token;

	const [scan, setScan] = useState<ScanData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pollCount, setPollCount] = useState(0);
	const [revealed, setRevealed] = useState(false);

	const fetchScan = useCallback(async () => {
		if (!token) return;
		try {
			const res = await fetch(`/api/scans/${token}`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || `HTTP ${res.status}`);
				return;
			}
			const data = await res.json();
			setScan(data);
			if (data.status === "complete" && data.preview) {
				setTimeout(() => setRevealed(true), 80);
			}
		} catch {
			setError("Network error. Please refresh.");
		}
	}, [token]);

	useEffect(() => {
		fetchScan();
	}, [fetchScan]);

	useEffect(() => {
		if (!scan) return;
		if (scan.status === "complete" || scan.status === "failed") return;
		if (pollCount >= POLL_MAX_ATTEMPTS) return;
		const t = setTimeout(() => {
			setPollCount((n) => n + 1);
			fetchScan();
		}, POLL_INTERVAL_MS);
		return () => clearTimeout(t);
	}, [scan, pollCount, fetchScan]);

	if (error) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-[#070710] px-4">
				<div className="max-w-md text-center">
					<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900">
						<svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
						</svg>
					</div>
					<h1 className="text-xl font-semibold text-zinc-100">{error}</h1>
					<Link
						href="/lp/audit"
						className="mt-6 inline-block rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
					>
						Run a free audit on your site
					</Link>
				</div>
			</div>
		);
	}

	if (!scan) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-[#070710]">
				<div className="text-center">
					<div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
					<p className="mt-4 text-sm text-zinc-500">Loading audit…</p>
				</div>
			</div>
		);
	}

	if (scan.status !== "complete" || !scan.preview) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-[#070710] px-4">
				<div className="text-center">
					<div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center">
						<span className="relative flex h-12 w-12">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-30" />
							<span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-500/10 text-emerald-300">
								<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
								</svg>
							</span>
						</span>
					</div>
					<h1 className="text-xl font-semibold text-zinc-100">
						Auditing {scan.domain}…
					</h1>
					<p className="mt-2 text-sm text-zinc-500">
						This usually takes 10–15 seconds.
					</p>
				</div>
			</div>
		);
	}

	const { preview, visibleFindings } = scan;

	return (
		<div className="relative min-h-screen overflow-hidden bg-[#070710]">
			{/* Ambient gradient */}
			<div className="pointer-events-none absolute inset-x-0 top-0 -z-1 h-[600px] bg-gradient-to-b from-emerald-900/15 via-emerald-900/5 to-transparent" />
			<div className="pointer-events-none absolute left-1/2 top-0 -z-1 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-700/10 blur-[120px]" />

			<header className="border-b border-zinc-900 px-4 py-4">
				<div className="mx-auto max-w-3xl">
					<Link href="/" className="text-sm font-bold tracking-wide text-white">
						VESTIGIO
					</Link>
				</div>
			</header>

			<main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
				{/* Preview card */}
				<div
					className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900/80 to-zinc-950 p-6 transition-all duration-700 ${
						revealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
					}`}
				>
					<div className="flex items-start gap-4">
						<div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
							{preview.favicon_url ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img
									src={preview.favicon_url}
									alt=""
									className="h-8 w-8 object-contain"
									onError={(e) => {
										(e.currentTarget as HTMLImageElement).style.display = "none";
									}}
								/>
							) : null}
						</div>

						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium uppercase tracking-wider text-emerald-400">
									Audited for you
								</span>
								<span className="h-1 w-1 rounded-full bg-zinc-700" />
								<span className="font-mono text-xs text-zinc-500">{preview.host}</span>
							</div>
							<h1 className="mt-1 truncate text-xl font-semibold text-zinc-100">
								{preview.title || preview.host}
							</h1>
							{preview.description && (
								<p className="mt-1 line-clamp-2 text-sm text-zinc-400">
									{preview.description}
								</p>
							)}
						</div>
					</div>

					<div className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-4">
						<div>
							<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
								Pages scanned
							</div>
							<div className="mt-0.5 font-mono text-sm text-zinc-300">
								{scan.pagesScanned}
							</div>
						</div>
						<div>
							<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
								Response
							</div>
							<div className="mt-0.5 font-mono text-sm text-zinc-300">
								{preview.response_time_ms}ms
							</div>
						</div>
						<div>
							<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">
								Audit took
							</div>
							<div className="mt-0.5 font-mono text-sm text-zinc-300">
								{scan.durationMs ? `${(scan.durationMs / 1000).toFixed(1)}s` : "—"}
							</div>
						</div>
					</div>
				</div>

				{/* Findings */}
				<section
					className={`mt-10 space-y-3 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}
				>
					<header className="flex items-end justify-between border-b border-zinc-900 pb-3">
						<h2 className="text-lg font-semibold text-zinc-100">
							{visibleFindings.length} findings on your site
						</h2>
					</header>

					<ul className="space-y-2.5">
						{visibleFindings.map((f, i) => (
							<li
								key={f.id}
								className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 transition-colors hover:border-zinc-700"
								style={{
									animation: revealed
										? `lp-slide-up 600ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 200}ms both`
										: undefined,
								}}
							>
								<div className="flex items-start gap-4 px-5 py-4">
									<span className={`mt-1 inline-flex h-2 w-2 shrink-0 rounded-full ${severityDot(f.severity)}`} />
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className={`text-[10px] font-semibold uppercase tracking-wider ${severityText(f.severity)}`}>
												{f.severity}
											</span>
											<span className="text-[10px] uppercase tracking-wider text-zinc-600">
												· {f.category}
											</span>
										</div>
										<h3 className="mt-1 text-sm font-semibold text-zinc-100">
											{f.title}
										</h3>
										<p className="mt-2 text-sm leading-relaxed text-zinc-400">
											{f.body}
										</p>
										<p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400">
											<span>↳</span>
											<span>{f.impact_hint}</span>
										</p>
									</div>
								</div>
							</li>
						))}
					</ul>
				</section>

				{/* Soft CTA — outreach, not closing */}
				<section className={`mt-12 transition-opacity duration-1000 delay-700 ${revealed ? "opacity-100" : "opacity-0"}`}>
					<div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-zinc-950 to-zinc-950 px-6 py-8 sm:px-10 sm:py-10">
						<div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-[80px]" />
						<div className="relative">
							<p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">
								Want this for your own site?
							</p>
							<h3 className="mt-2 text-2xl font-semibold leading-tight text-zinc-100 sm:text-3xl">
								Run a free audit in 20 seconds
							</h3>
							<p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
								Vestigio is the conversion intelligence layer for SaaS &
								ecommerce. Drop your domain, get 5 actionable findings + the
								financial impact of each one.
							</p>
							<div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
								<Link
									href="/lp/audit"
									className="rounded-xl bg-emerald-500 px-7 py-3 text-center text-sm font-semibold text-emerald-950 shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]"
								>
									Start my free audit →
								</Link>
								<span className="text-xs text-zinc-600 sm:ml-2">
									No credit card. No signup before results.
								</span>
							</div>
						</div>
					</div>
				</section>

				<footer className="mt-12 border-t border-zinc-900 pt-6 text-center text-xs text-zinc-700">
					Audit performed by Vestigio · Sample findings only · {new Date(scan.createdAt).toLocaleDateString()}
				</footer>
			</main>

			<style jsx>{`
				@keyframes lp-slide-up {
					from {
						opacity: 0;
						transform: translateY(16px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
			`}</style>
		</div>
	);
}

function severityDot(severity: string): string {
	switch (severity) {
		case "critical":
			return "bg-red-400";
		case "high":
			return "bg-amber-400";
		case "medium":
			return "bg-yellow-400";
		case "positive":
			return "bg-emerald-400";
		default:
			return "bg-zinc-400";
	}
}

function severityText(severity: string): string {
	switch (severity) {
		case "critical":
			return "text-red-400";
		case "high":
			return "text-amber-400";
		case "medium":
			return "text-yellow-400";
		case "positive":
			return "text-emerald-400";
		default:
			return "text-zinc-400";
	}
}
