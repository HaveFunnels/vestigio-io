"use client";

import { useRef, useState, useEffect, useCallback } from "react";

const VSL_VIDEO = process.env.NEXT_PUBLIC_VSL_VIDEO_URL || "";
const VSL_WEBM = process.env.NEXT_PUBLIC_VSL_WEBM_URL || "";
const VSL_POSTER = process.env.NEXT_PUBLIC_VSL_POSTER_URL || "";

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

export default function VSL() {
	if (!VSL_VIDEO) return null;

	const videoRef = useRef<HTMLVideoElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<"muted" | "playing" | "paused">("muted");

	const unmute = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		v.currentTime = 0;
		v.muted = false;
		v.loop = false;
		v.play();
		setState("playing");
	}, []);

	const pause = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		v.pause();
		setState("paused");
	}, []);

	const resume = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		v.play();
		setState("playing");
	}, []);

	const returnToMuted = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		v.muted = true;
		v.loop = true;
		v.currentTime = 0;
		v.play();
		setState("muted");
	}, []);

	const handleClick = useCallback(() => {
		if (state === "muted") unmute();
		else if (state === "playing") pause();
		else if (state === "paused") resume();
	}, [state, unmute, pause, resume]);

	useEffect(() => {
		const container = containerRef.current;
		const video = videoRef.current;
		if (!container || !video) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					if (video.paused && video.muted) {
						video.play().catch(() => {});
					}
				} else if (!video.muted) {
					video.muted = true;
					video.loop = true;
					video.currentTime = 0;
					video.play().catch(() => {});
					setState("muted");
				}
			},
			{ threshold: 0.1 },
		);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	return (
		<div className="relative z-1 px-4 py-4 sm:px-8 sm:py-6 xl:px-0">
			<div className="mx-auto max-w-[960px]">
				<div
					ref={containerRef}
					className="relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900"
					style={{ aspectRatio: "16 / 9" }}
					onClick={handleClick}
				>
					<video
						ref={videoRef}
						className="absolute inset-0 h-full w-full object-cover"
						poster={VSL_POSTER || undefined}
						preload="metadata"
						playsInline
						autoPlay
						muted
						loop
						{...({ "webkit-playsinline": "true" } as Record<string, string>)}
						onEnded={() => returnToMuted()}
						onCanPlay={(e) => {
							const v = e.currentTarget;
							if (v.paused && v.muted) v.play().catch(() => {});
						}}
					>
						{VSL_WEBM && <source src={VSL_WEBM} type="video/webm" />}
						<source src={VSL_VIDEO} type="video/mp4" />
					</video>

					{state === "muted" && (
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-5 py-2.5 backdrop-blur-md transition-transform duration-200 hover:scale-105">
								<UnmuteIcon className="h-5 w-5 text-white" />
								<span className="text-sm font-medium text-white">Ouvir</span>
							</div>
						</div>
					)}

					{state === "paused" && (
						<div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm">
							<div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-5 py-2.5 backdrop-blur-md">
								<VolumeIcon className="h-5 w-5 text-white" />
								<span className="text-sm font-medium text-white">Ouvir</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
