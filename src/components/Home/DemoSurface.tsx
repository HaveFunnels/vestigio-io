"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import ProductTour from "./ProductTour";

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
		const id = setTimeout(() => setShowSkip(true), 5000);
		return () => clearTimeout(id);
	}, [phase]);

	useEffect(() => {
		if (phase !== "video") return;
		const el = sectionRef.current;
		const v = videoRef.current;
		if (!el) return;

		const obs = new IntersectionObserver(([e]) => {
			if (e.isIntersecting) {
				if (v && v.paused && v.muted) v.play().catch(() => {});
			} else if (e.boundingClientRect.top < 0) {
				transitionToTour();
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
		<div ref={sectionRef}>
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
					<div className="relative z-1 px-4 py-4 sm:px-8 sm:py-6 xl:px-0">
						<div className="mx-auto max-w-[960px]">
							<div
								className="relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900"
								style={{ aspectRatio: "16 / 9" }}
								onClick={handleVideoClick}
							>
								<video
									ref={videoRef}
									className="absolute inset-0 h-full w-full object-cover"
									preload="metadata"
									playsInline
									autoPlay
									muted
									onTimeUpdate={handleTimeUpdate}
									onEnded={handleEnded}
									onCanPlay={(e) => {
										const v = e.currentTarget;
										if (v.paused && v.muted) v.play().catch(() => {});
									}}
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
									className="mx-auto mt-3 block text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
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
