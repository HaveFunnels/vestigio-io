"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ──────────────────────────────────────────────
// /lp/audit/thank-you/[leadId] — Post-checkout Bridge
//
// Visitor lands here after Paddle Checkout returns successUrl. The
// Paddle webhook is processing the lead → User+Org+Env promotion in
// the background; here we:
//
//   1. Confirm payment landed
//   2. Tell the user to check their email for the magic link
//   3. Poll /api/lead/[id] until status flips to 'converted', so we
//      can show "you can now log in" instead of "wait a moment"
//   4. Offer a manual "open my email" hint when conversion is slow
//
// This is intentionally calm — no extra CTAs, no upsells. The visitor
// just paid; we want them to feel taken care of and to know the next
// step is "click the magic link in your inbox".
//
// Note: we DO NOT trigger the magic link from here. The webhook does
// that server-side as part of handleLeadConversion (Sprint 3.11).
// We only poll to surface status to the user.
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30; // 90s cap

export default function LeadThankYouPage() {
	const params = useParams<{ leadId: string }>();
	const leadId = params?.leadId;

	const [converted, setConverted] = useState(false);
	const [emailMasked, setEmailMasked] = useState<string | null>(null);
	const [pollAttempts, setPollAttempts] = useState(0);

	useEffect(() => {
		if (!leadId) return;
		let cancelled = false;

		async function poll() {
			try {
				const res = await fetch(`/api/lead/${leadId}`);
				if (!res.ok) return;
				const data = await res.json();
				if (cancelled) return;
				if (data.emailMasked) setEmailMasked(data.emailMasked);
				if (data.status === "converted") {
					setConverted(true);
				}
			} catch {
				// Network failure — keep polling silently
			}
		}

		poll();
		const interval = setInterval(() => {
			setPollAttempts((n) => {
				if (n >= POLL_MAX_ATTEMPTS) {
					clearInterval(interval);
					return n;
				}
				poll();
				return n + 1;
			});
		}, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [leadId]);

	return (
		<div className="relative min-h-screen overflow-hidden bg-[#070710]">
			{/* Ambient glow */}
			<div className="pointer-events-none absolute left-1/2 top-0 -z-1 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-emerald-700/15 blur-[120px]" />

			<header className="border-b border-zinc-900 px-4 py-4">
				<div className="mx-auto max-w-3xl">
					<Link href="/lp" className="text-sm font-bold tracking-wide text-white">
						VESTIGIO
					</Link>
				</div>
			</header>

			<main className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-16">
				<div className="w-full max-w-md text-center">
					{/* Celebration mark */}
					<div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center">
						<span className="relative flex h-20 w-20">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-20" />
							<span className="relative inline-flex h-20 w-20 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
								<svg
									className="h-10 w-10 text-emerald-400"
									fill="none"
									viewBox="0 0 24 24"
									strokeWidth={2.25}
									stroke="currentColor"
								>
									<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
								</svg>
							</span>
						</span>
					</div>

					<h1 className="text-3xl font-semibold text-zinc-100 sm:text-4xl">
						You&rsquo;re in.
					</h1>
					<p className="mt-3 text-base text-zinc-400">
						Payment received. We&rsquo;re setting up your workspace right now.
					</p>

					{/* Email block */}
					<div className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6 text-left">
						<div className="flex items-start gap-4">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
								<svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
								</svg>
							</div>
							<div className="min-w-0 flex-1">
								<div className="text-sm font-semibold text-zinc-100">
									Check your inbox
								</div>
								<div className="mt-1 text-sm text-zinc-400">
									We sent a magic link to{" "}
									{emailMasked ? (
										<span className="font-mono text-zinc-200">{emailMasked}</span>
									) : (
										<span className="text-zinc-500">your email</span>
									)}
									. Click it to sign in — no password to remember.
								</div>
							</div>
						</div>
					</div>

					{/* Status row */}
					<div className="mt-6 flex items-center justify-center gap-2 text-xs">
						{converted ? (
							<>
								<svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
								</svg>
								<span className="text-emerald-400">Workspace ready · magic link sent</span>
							</>
						) : (
							<>
								<span className="relative flex h-2 w-2">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
									<span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
								</span>
								<span className="text-zinc-500">
									Setting up your workspace…
								</span>
							</>
						)}
					</div>

					{/* Slow-path manual help */}
					{pollAttempts >= POLL_MAX_ATTEMPTS && !converted && (
						<div className="mt-6 rounded-md border border-amber-800/50 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-300">
							This is taking longer than usual. The magic link should still
							arrive — check your spam folder if you don&rsquo;t see it
							within a minute. If nothing comes,{" "}
							<a
								href="mailto:support@vestigio.io"
								className="font-semibold underline underline-offset-2 hover:text-amber-200"
							>
								contact support
							</a>
							.
						</div>
					)}

					<p className="mt-10 text-xs text-zinc-700">
						You can close this tab once you receive the email.
					</p>
				</div>
			</main>
		</div>
	);
}
