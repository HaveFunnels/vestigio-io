"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Script from "next/script";
import Link from "next/link";
import type { LandingPreview } from "../../../../../../../workers/ingestion/landing-preview";
import type {
	MiniFinding,
	BlurredFinding,
	MiniFindingSeverity,
} from "../../../../../../../workers/ingestion/mini-audit-findings";

declare global {
	interface Window {
		Paddle: any;
	}
}

// ──────────────────────────────────────────────
// /lp/audit/result/[leadId] — Mini-Audit Result
//
// Public, shareable result page. Polls /api/lead/[id] every 3s while
// the audit is in progress, then renders:
//   - Sticky preview card at the top (the "this is your real site"
//     proof — favicon + title + description + response time)
//   - 5 visible findings, staggered reveal animation on first paint
//   - 10 blurred findings in a grid, lock icon, hover hint
//   - "Unlock the full audit" CTA → opens Paddle checkout directly
//     with custom_data.leadId so the webhook can promote the lead
//
// Aesthetic: dark zinc base with emerald accents, max-w 720px center.
// Animation budget concentrated in the first 4 seconds: hero card
// slides up + fades in, findings stagger 200ms, blurred grid fades
// in last. After that, no idle motion (per the no-AI-slop rule).
//
// SEO: noindex (page-level meta in the layout). Shareable via
// dynamic OG image (Sprint 3.8 next).
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 40; // 2 min cap

interface MiniAuditApiResult {
	id: string;
	preview: LandingPreview;
	visibleFindings: MiniFinding[];
	blurredFindings: BlurredFinding[];
	durationMs: number;
	computedAt: string;
}

interface LeadResponse {
	id: string;
	status: "draft" | "auditing" | "audit_complete" | "checkout_started" | "converted" | "expired" | "spam";
	currentStep: number;
	domain: string | null;
	organizationName: string | null;
	businessModel: string | null;
	emailMasked: string | null;
	createdAt: string;
	result: MiniAuditApiResult | null;
}

// Default plan offered on the /lp funnel — base Vestigio at $99/mo.
// Can be overridden later if A/B testing different price points.
const DEFAULT_LP_PRICE_ID =
	process.env.NEXT_PUBLIC_PADDLE_LP_PRICE_ID ||
	process.env.NEXT_PUBLIC_PADDLE_VESTIGIO_PRICE_ID ||
	"";

export default function MiniAuditResultPage() {
	const params = useParams<{ leadId: string }>();
	const router = useRouter();
	const leadId = params?.leadId;

	const [lead, setLead] = useState<LeadResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [paddleReady, setPaddleReady] = useState(false);
	const [revealed, setRevealed] = useState(false);
	const [shareCopied, setShareCopied] = useState(false);
	const pollAttemptsRef = useRef(0);

	// ── Polling loop ──
	const fetchLead = useCallback(async () => {
		if (!leadId) return;
		try {
			const res = await fetch(`/api/lead/${leadId}`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.message || `HTTP ${res.status}`);
				return;
			}
			const data: LeadResponse = await res.json();
			setLead(data);
			if (data.status === "audit_complete" && data.result) {
				// Trigger reveal animation a beat after data lands
				setTimeout(() => setRevealed(true), 80);
			}
		} catch {
			setError("Network error. Please refresh.");
		}
	}, [leadId]);

	useEffect(() => {
		fetchLead();
	}, [fetchLead]);

	useEffect(() => {
		if (!lead) return;
		if (lead.status === "audit_complete" || lead.status === "expired") return;
		if (pollAttemptsRef.current >= POLL_MAX_ATTEMPTS) return;

		const timer = setTimeout(() => {
			pollAttemptsRef.current++;
			fetchLead();
		}, POLL_INTERVAL_MS);
		return () => clearTimeout(timer);
	}, [lead, fetchLead]);

	// ── Paddle initialization ──
	const initPaddle = useCallback(() => {
		if (typeof window === "undefined") return;
		if (!window.Paddle) return;
		try {
			window.Paddle.Environment.set(
				process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
			);
			window.Paddle.Initialize({
				token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
				eventCallback: (event: any) => {
					// On checkout completion, the Paddle webhook handles all
					// the heavy lifting (User+Org+Env creation, magic link).
					// We just send the visitor to the thank-you bridge.
					if (
						event.name === "checkout.completed" &&
						event.data?.status === "completed"
					) {
						router.push(`/lp/audit/thank-you/${leadId}`);
					}
				},
			});
			setPaddleReady(true);
		} catch (err) {
			console.error("[lp-result] Paddle init failed:", err);
		}
	}, [leadId, router]);

	// ── CTA: open Paddle checkout ──
	function openCheckout() {
		if (!leadId || !lead?.result) return;
		if (!window.Paddle || !paddleReady) {
			setError("Payment system still loading. Please wait a moment.");
			return;
		}
		if (!DEFAULT_LP_PRICE_ID) {
			setError("Pricing isn't configured yet. Please contact support.");
			return;
		}
		try {
			window.Paddle.Checkout.open({
				items: [{ priceId: DEFAULT_LP_PRICE_ID, quantity: 1 }],
				customData: {
					leadId,
					lpFunnel: "true",
				},
				successUrl: `${window.location.origin}/lp/audit/thank-you/${leadId}`,
				settings: {
					displayMode: "overlay",
				},
			});
		} catch (err) {
			console.error("[lp-result] checkout open failed:", err);
			setError("Couldn't open checkout. Please try again.");
		}
	}

	// ── Share handling ──
	function copyShareLink() {
		if (typeof window === "undefined") return;
		const url = window.location.href;
		navigator.clipboard
			.writeText(url)
			.then(() => {
				setShareCopied(true);
				setTimeout(() => setShareCopied(false), 2000);
			})
			.catch(() => {
				setError("Couldn't copy link. Try selecting the URL bar manually.");
			});
	}

	// ── Render branches ──

	if (error) {
		return (
			<ErrorState message={error} onRetry={() => { setError(null); fetchLead(); }} />
		);
	}

	if (!lead) {
		return <LoadingState message="Loading your audit…" />;
	}

	if (lead.status === "expired") {
		return (
			<ErrorState
				message="This audit link has expired. Run a fresh one — it's free."
				onRetry={() => router.push("/lp/audit")}
				retryLabel="Start a new audit"
			/>
		);
	}

	if (lead.status === "draft" || lead.status === "auditing" || !lead.result) {
		return <AuditingState lead={lead} />;
	}

	const { preview, visibleFindings, blurredFindings, durationMs } = lead.result;

	return (
		<>
			{/* Paddle script — local to this page (not in app layout) */}
			<Script
				src="https://cdn.paddle.com/paddle/v2/paddle.js"
				onLoad={initPaddle}
				strategy="afterInteractive"
			/>

			<div className="relative min-h-screen overflow-hidden bg-[#070710]">
				{/* Ambient gradient background */}
				<div className="pointer-events-none absolute inset-x-0 top-0 -z-1 h-[600px] bg-gradient-to-b from-emerald-900/15 via-emerald-900/5 to-transparent" />
				<div className="pointer-events-none absolute left-1/2 top-0 -z-1 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-700/10 blur-[120px]" />

				{/* Brand strip */}
				<header className="border-b border-zinc-900 px-4 py-4">
					<div className="mx-auto flex max-w-3xl items-center justify-between">
						<Link href="/lp" className="text-sm font-bold tracking-wide text-white">
							VESTIGIO
						</Link>
						<button
							type="button"
							onClick={copyShareLink}
							className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
						>
							{shareCopied ? (
								<>
									<svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
									<span>Link copied</span>
								</>
							) : (
								<>
									<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
									</svg>
									<span>Share</span>
								</>
							)}
						</button>
					</div>
				</header>

				<main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
					{/* Preview card — the proof */}
					<PreviewCard preview={preview} durationMs={durationMs} revealed={revealed} />

					{/* Findings */}
					<section className={`mt-10 space-y-3 transition-opacity duration-700 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="flex items-end justify-between border-b border-zinc-900 pb-3">
							<h2 className="text-lg font-semibold text-zinc-100">
								{visibleFindings.length} findings on your landing
							</h2>
							<span className="text-xs text-zinc-600">Visible · Free</span>
						</header>

						<ul className="space-y-2.5">
							{visibleFindings.map((f, i) => (
								<FindingCard key={f.id} finding={f} index={i} revealed={revealed} />
							))}
						</ul>
					</section>

					{/* Blurred grid */}
					<section className={`mt-12 transition-opacity duration-1000 delay-1000 ${revealed ? "opacity-100" : "opacity-0"}`}>
						<header className="flex items-end justify-between border-b border-zinc-900 pb-3">
							<h2 className="text-lg font-semibold text-zinc-100">
								{blurredFindings.length} more findings, locked
							</h2>
							<span className="text-xs text-emerald-400/80">Premium</span>
						</header>

						<ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
							{blurredFindings.map((b) => (
								<BlurredCard key={b.id} blurred={b} />
							))}
						</ul>

						{/* CTA */}
						<div className="relative mt-10 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-zinc-950 to-zinc-950 px-6 py-8 sm:px-10 sm:py-10">
							<div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-[80px]" />
							<div className="relative">
								<p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80">Premium audit</p>
								<h3 className="mt-2 text-2xl font-semibold leading-tight text-zinc-100 sm:text-3xl">
									Unlock the full audit and start fixing
								</h3>
								<p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
									Get all 15+ findings, the financial impact for each one, the
									recommended fix, and continuous monitoring as you ship changes.
								</p>
								<div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
									<button
										type="button"
										onClick={openCheckout}
										disabled={!paddleReady}
										className="rounded-xl bg-emerald-500 px-7 py-3 text-sm font-semibold text-emerald-950 shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
									>
										{paddleReady ? "Unlock the full audit — $99/mo" : "Loading checkout…"}
									</button>
									<span className="text-xs text-zinc-600 sm:ml-2">
										No credit card stored on Vestigio. Cancel anytime.
									</span>
								</div>
							</div>
						</div>
					</section>

					{/* Footer */}
					<footer className="mt-12 border-t border-zinc-900 pt-6 text-center text-xs text-zinc-700">
						Audit performed by Vestigio · Sample of 5 of 15+ findings · Cached for 14 days
					</footer>
				</main>
			</div>

			{/* Animation styles */}
			<style jsx>{`
				@keyframes slide-up-fade {
					from {
						opacity: 0;
						transform: translateY(16px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
				:global(.lp-card-anim) {
					animation: slide-up-fade 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
				}
				@keyframes scale-in {
					from {
						opacity: 0;
						transform: scale(0.96);
					}
					to {
						opacity: 1;
						transform: scale(1);
					}
				}
				:global(.lp-preview-anim) {
					animation: scale-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
				}
				@media (prefers-reduced-motion: reduce) {
					:global(.lp-card-anim),
					:global(.lp-preview-anim) {
						animation: none;
					}
				}
			`}</style>
		</>
	);
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function PreviewCard({
	preview,
	durationMs,
	revealed,
}: {
	preview: LandingPreview;
	durationMs: number;
	revealed: boolean;
}) {
	return (
		<div
			className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900/80 to-zinc-950 p-6 ${revealed ? "lp-preview-anim" : "opacity-0"}`}
		>
			<div className="flex items-start gap-4">
				{/* Favicon */}
				<div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
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
					) : (
						<svg className="h-6 w-6 text-zinc-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
						</svg>
					)}
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium uppercase tracking-wider text-emerald-400">Audited</span>
						<span className="h-1 w-1 rounded-full bg-zinc-700" />
						<span className="font-mono text-xs text-zinc-500">{preview.host}</span>
					</div>
					<h1 className="mt-1 truncate text-xl font-semibold text-zinc-100" title={preview.title || preview.host}>
						{preview.title || preview.host}
					</h1>
					{preview.description && (
						<p className="mt-1 line-clamp-2 text-sm text-zinc-400">{preview.description}</p>
					)}
				</div>
			</div>

			{/* Stats strip */}
			<div className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-800 pt-4">
				<Stat label="Response time" value={`${preview.response_time_ms}ms`} />
				<Stat label="HTTP" value={String(preview.http_status)} />
				<Stat label="Audit took" value={`${(durationMs / 1000).toFixed(1)}s`} />
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</div>
			<div className="mt-0.5 font-mono text-sm text-zinc-300">{value}</div>
		</div>
	);
}

function FindingCard({
	finding,
	index,
	revealed,
}: {
	finding: MiniFinding;
	index: number;
	revealed: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const severityClass = severityClasses(finding.severity);

	return (
		<li
			className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 transition-colors hover:border-zinc-700 ${
				revealed ? "lp-card-anim" : "opacity-0"
			}`}
			style={{ animationDelay: revealed ? `${index * 200}ms` : undefined }}
		>
			<button
				type="button"
				onClick={() => setExpanded((e) => !e)}
				className="flex w-full items-start gap-4 px-5 py-4 text-left"
			>
				<span className={`mt-1 inline-flex h-2 w-2 shrink-0 rounded-full ${severityClass.dot}`} />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className={`text-[10px] font-semibold uppercase tracking-wider ${severityClass.label}`}>
							{finding.severity}
						</span>
						<span className="text-[10px] uppercase tracking-wider text-zinc-600">
							· {finding.category}
						</span>
					</div>
					<h3 className="mt-1 text-sm font-semibold text-zinc-100">
						{finding.title}
					</h3>
					{expanded && (
						<>
							<p className="mt-2 text-sm leading-relaxed text-zinc-400">
								{finding.body}
							</p>
							<p className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-400">
								<span>↳</span>
								<span>{finding.impact_hint}</span>
							</p>
						</>
					)}
				</div>
				<svg
					className={`mt-1 h-4 w-4 shrink-0 text-zinc-600 transition-transform ${expanded ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					strokeWidth={2}
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>
		</li>
	);
}

function BlurredCard({ blurred }: { blurred: BlurredFinding }) {
	return (
		<li className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-4 transition-colors hover:border-zinc-700">
			<div className="flex items-start gap-3">
				<svg className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
					<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
				</svg>
				<div className="min-w-0 flex-1">
					<div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
						{blurred.category}
					</div>
					<div className="mt-0.5 truncate text-sm font-medium text-zinc-300 blur-[3px] transition-all group-hover:blur-[2px]">
						{blurred.teaser_title}
					</div>
				</div>
			</div>
		</li>
	);
}

// ──────────────────────────────────────────────
// State branches
// ──────────────────────────────────────────────

function AuditingState({ lead }: { lead: LeadResponse }) {
	const [stageIdx, setStageIdx] = useState(0);
	const stages = [
		"Fetching your landing page",
		"Parsing the HTML",
		"Checking trust signals",
		"Analyzing CTAs",
		"Evaluating form friction",
		"Compiling your audit",
	];

	useEffect(() => {
		const interval = setInterval(() => {
			setStageIdx((i) => Math.min(stages.length - 1, i + 1));
		}, 1500);
		return () => clearInterval(interval);
	}, [stages.length]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<div className="w-full max-w-md text-center">
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
				<h1 className="text-2xl font-semibold text-zinc-100">
					Auditing {lead.domain || "your site"}…
				</h1>
				<p className="mt-2 text-sm text-zinc-500">
					This usually takes 5–10 seconds. Don&rsquo;t close this tab.
				</p>

				<ul className="mt-8 space-y-2 text-left">
					{stages.map((label, idx) => {
						const isDone = idx < stageIdx;
						const isActive = idx === stageIdx;
						return (
							<li
								key={label}
								className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 text-sm transition-colors ${
									isDone
										? "border-emerald-500/20 bg-emerald-500/5 text-zinc-300"
										: isActive
											? "border-zinc-700 bg-zinc-900 text-zinc-200"
											: "border-zinc-800 bg-zinc-950 text-zinc-700"
								}`}
							>
								{isDone ? (
									<svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
									</svg>
								) : isActive ? (
									<span className="relative flex h-3.5 w-3.5">
										<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
										<span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-emerald-400" />
									</span>
								) : (
									<span className="h-3.5 w-3.5 rounded-full border border-zinc-800" />
								)}
								<span>{label}</span>
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}

function LoadingState({ message }: { message: string }) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<div className="text-center">
				<div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
				<p className="mt-4 text-sm text-zinc-500">{message}</p>
			</div>
		</div>
	);
}

function ErrorState({
	message,
	onRetry,
	retryLabel = "Try again",
}: {
	message: string;
	onRetry: () => void;
	retryLabel?: string;
}) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-[#070710] px-4">
			<div className="max-w-md text-center">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
					<svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
					</svg>
				</div>
				<h1 className="text-xl font-semibold text-zinc-100">Something went wrong</h1>
				<p className="mt-2 text-sm text-zinc-500">{message}</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-6 rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
				>
					{retryLabel}
				</button>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function severityClasses(severity: MiniFindingSeverity): { dot: string; label: string } {
	switch (severity) {
		case "critical":
			return { dot: "bg-red-400", label: "text-red-400" };
		case "high":
			return { dot: "bg-amber-400", label: "text-amber-400" };
		case "medium":
			return { dot: "bg-yellow-400", label: "text-yellow-400" };
		case "positive":
			return { dot: "bg-emerald-400", label: "text-emerald-400" };
	}
}
