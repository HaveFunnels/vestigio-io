"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

// Browser-shell-ish skeleton that fills ProductTour's spot during the
// dynamic-import fetch. Without it, when phase flips to "tour" before
// the chunk arrives, the page renders nothing in this slot — exactly
// the "pop-in / things not loaded correctly" failure mode we want to
// avoid. Shimmer animation via Tailwind's animate-pulse.
function ProductTourSkeleton() {
	return (
		<div className="min-h-[600px] w-full px-4 sm:px-8 xl:px-0" aria-hidden="true">
			<div className="mx-auto max-w-[960px] overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900/40">
				{/* Browser chrome bar */}
				<div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-3">
					<div className="h-2.5 w-2.5 rounded-full bg-white/[0.06]" />
					<div className="h-2.5 w-2.5 rounded-full bg-white/[0.06]" />
					<div className="h-2.5 w-2.5 rounded-full bg-white/[0.06]" />
					<div className="ml-4 h-4 w-48 animate-pulse rounded bg-white/[0.04]" />
				</div>
				{/* Sidebar + main */}
				<div className="flex gap-4 p-4 sm:p-6">
					<div className="hidden w-48 shrink-0 flex-col gap-3 sm:flex">
						<div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.04]" />
						<div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
						<div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.04]" />
						<div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.04]" />
					</div>
					<div className="flex-1 space-y-3">
						<div className="h-5 w-1/2 animate-pulse rounded bg-white/[0.06]" />
						<div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
						<div className="h-3 w-5/6 animate-pulse rounded bg-white/[0.04]" />
						<div className="mt-6 h-32 animate-pulse rounded-xl bg-white/[0.03]" />
						<div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.04]" />
						<div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.04]" />
					</div>
				</div>
			</div>
		</div>
	);
}

// ProductTour is a 780-line client component (state machine + lucide
// icons + typewriter effects) that only renders after the video ends
// (~12-20s into the visit). Static import would bundle it into the
// first JS chunk for zero immediate benefit. dynamic() defers the
// fetch until phase === "tour" is set — mobile cold-load saves
// roughly the size of the ProductTour module + its lucide icon
// subset. ssr:false keeps it out of the initial HTML payload too.
//
// loading: ProductTourSkeleton fills the slot during chunk fetch so
// the phase transition never paints empty.
const ProductTour = dynamic(() => import("./ProductTour"), {
	ssr: false,
	loading: () => <ProductTourSkeleton />,
});

const VIDEO_MP4 = "https://cdn.vestigio.io/vestigio-hero.mp4";
const VIDEO_WEBM = "https://cdn.vestigio.io/vestigio-hero.webm";

function UnmuteIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
			<path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
		</svg>
	);
}

function VolumeIcon({ className }: { className?: string }) {
	return (
		<svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
			<path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" />
		</svg>
	);
}

export default function DemoSurface() {
	const t = useTranslations("homepage.demo_surface");
	const videoRef = useRef<HTMLVideoElement>(null);
	const sectionRef = useRef<HTMLDivElement>(null);
	const didTransition = useRef(false);

	const [phase, setPhase] = useState<"video" | "dissolve" | "tour">("video");
	const [progress, setProgress] = useState(0);
	const [showSkip, setShowSkip] = useState(false);
	const [audio, setAudio] = useState<"muted" | "playing" | "paused">("muted");

	const transitionToTour = useCallback(() => {
		if (didTransition.current) return;
		didTransition.current = true;
		const v = videoRef.current;
		if (v) { v.pause(); v.muted = true; }
		setPhase("dissolve");
		setTimeout(() => setPhase("tour"), 600);
	}, []);

	const handleEnded = useCallback(() => {
		setTimeout(transitionToTour, 1200);
	}, [transitionToTour]);

	const handleTimeUpdate = useCallback(() => {
		const v = videoRef.current;
		if (v?.duration) setProgress(v.currentTime / v.duration);
	}, []);

	useEffect(() => {
		if (phase !== "video") return;
		const id = setTimeout(() => setShowSkip(true), 3000);
		return () => clearTimeout(id);
	}, [phase]);

	// Warm the ProductTour chunk while the hero video plays — by the
	// time the user scrolls/clicks/the video ends, the dynamic import
	// resolves instantly from cache and the skeleton barely blinks.
	// requestIdleCallback so we don't compete with the video fetch and
	// initial render work. Falls back to a short setTimeout in browsers
	// without rIC (Safari < 16.4).
	useEffect(() => {
		if (phase !== "video") return;
		const ric =
			typeof window !== "undefined" && "requestIdleCallback" in window
				? (window as any).requestIdleCallback
				: (cb: () => void) => setTimeout(cb, 1500);
		const handle = ric(() => {
			// Fire-and-forget — just warm the module graph.
			import("./ProductTour").catch(() => {});
		});
		return () => {
			const cic =
				typeof window !== "undefined" && "cancelIdleCallback" in window
					? (window as any).cancelIdleCallback
					: clearTimeout;
			cic(handle);
		};
	}, [phase]);

	useEffect(() => {
		if (phase !== "video") return;
		const el = sectionRef.current;
		const v = videoRef.current;
		if (!el) return;

		const obs = new IntersectionObserver(([e]) => {
			if (e.isIntersecting) {
				if (v && v.paused && v.muted) v.play().catch(() => {});
			}
		}, { threshold: 0 });
		obs.observe(el);
		return () => obs.disconnect();
	}, [phase, transitionToTour]);

	const unmute = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		v.currentTime = 0;
		v.muted = false;
		v.play().then(() => {
			setAudio("playing");
		}).catch(() => {
			v.muted = true;
			setAudio("muted");
		});
	}, []);

	const handleVideoClick = useCallback(() => {
		if (audio === "muted") unmute();
		else if (audio === "playing") { videoRef.current?.pause(); setAudio("paused"); }
		else { videoRef.current?.play(); setAudio("playing"); }
	}, [audio, unmute]);

	return (
		// scroll-mt-28: when something like the Pulse banner does
		// scrollIntoView({ block: "start" }), the page header is fixed at
		// z-999 — without this margin the video's top edge lands hidden
		// under the header (~64-88px clipped). Matches ProductTour's
		// scroll-mt-24 pattern.
		<div id="demo-video" ref={sectionRef} className="scroll-mt-28">
			<style>{`
				@keyframes ds-rise {
					from { opacity: 0; transform: translateY(24px); }
					to   { opacity: 1; transform: translateY(0); }
				}
				@keyframes ds-fade-in {
					from { opacity: 0; }
					to   { opacity: 1; }
				}
				@media (prefers-reduced-motion: reduce) {
					.ds-dissolve { transition: none !important; }
					.ds-rise { animation-duration: 0.01ms !important; }
				}
			`}</style>

			{phase !== "tour" && (
				<div className={`ds-dissolve transition-all duration-500 ease-out ${
					phase === "dissolve" ? "pointer-events-none opacity-0 scale-[0.97]" : ""
				}`}>
					<div className="relative z-1 px-4 pt-2 pb-4 sm:px-8 sm:pt-3 sm:pb-6 xl:px-0">
						<div className="mx-auto max-w-[960px]">
							<div
								className="relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900"
								style={{ aspectRatio: "16 / 9" }}
								onClick={handleVideoClick}
							>
								<video
									ref={videoRef}
									className="absolute inset-0 h-full w-full object-cover"
									poster="/images/hero/vsl-poster.jpg"
									// preload="none" — don't fetch video headers on cold
									// load. The IntersectionObserver below triggers play()
									// when the section enters viewport, which kicks off the
									// fetch then. Trade-off: ~500ms-1s delay before the
									// muted preview starts vs ~500KB saved on first byte.
									// Mobile cold load wins.
									preload="none"
									playsInline
									autoPlay
									muted
									onTimeUpdate={handleTimeUpdate}
									onEnded={handleEnded}
									{...({ "webkit-playsinline": "true" } as Record<string, string>)}
								>
									<source src={VIDEO_WEBM} type="video/webm" />
									<source src={VIDEO_MP4} type="video/mp4" />
								</video>

								{audio === "muted" && (
									<div className="absolute inset-0 flex items-center justify-center">
										<div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-5 py-2.5 backdrop-blur-md transition-transform duration-200 hover:scale-105">
											<UnmuteIcon className="h-5 w-5 text-white" />
											<span className="text-sm font-medium text-white">{t("listen")}</span>
										</div>
									</div>
								)}

								{audio === "paused" && (
									<div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
										<div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-5 py-2.5 backdrop-blur-md">
											<VolumeIcon className="h-5 w-5 text-white" />
											<span className="text-sm font-medium text-white">{t("listen")}</span>
										</div>
									</div>
								)}

								<div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.08]">
									<div
										className="h-full bg-white/40"
										style={{ width: `${progress * 100}%`, transition: "width 250ms linear" }}
									/>
								</div>
							</div>

							{showSkip && (
								<button
									onClick={transitionToTour}
									className="mx-auto mt-4 block rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-300"
									style={{ animation: "ds-fade-in 0.4s ease-out" }}
								>
									{t("skip")}
								</button>
							)}
						</div>
					</div>
				</div>
			)}

			{phase === "tour" && (
				<div className="ds-rise" style={{ animation: "ds-rise 0.6s ease-out both" }}>
					<ProductTour />
				</div>
			)}
		</div>
	);
}
