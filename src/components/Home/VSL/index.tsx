"use client";

import { useRef, useState, useCallback } from "react";

// ──────────────────────────────────────────────
// VSL — Video Sales Letter between Social Proof
// Strip and Product Tour.
//
// Single video player, no title, no description.
// The social proof strip above provides context;
// the video provides depth.
//
// Performance: preload="none", poster loads
// immediately, video fetches only on play.
// ──────────────────────────────────────────────

export default function VSL() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [playing, setPlaying] = useState(false);

	const toggle = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		if (v.paused) {
			v.play();
			setPlaying(true);
		} else {
			v.pause();
			setPlaying(false);
		}
	}, []);

	return (
		<div className="relative z-1 px-4 py-4 sm:px-8 sm:py-6 xl:px-0">
			<div className="mx-auto max-w-[960px]">
				<div
					className="relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-900"
					style={{ aspectRatio: "16 / 9" }}
					onClick={toggle}
				>
					<video
						ref={videoRef}
						className="absolute inset-0 h-full w-full object-cover"
						src="/videos/vsl.mp4"
						poster="/videos/vsl-poster.webp"
						preload="none"
						playsInline
						onEnded={() => setPlaying(false)}
					/>

					{/* Play / Pause overlay */}
					<div
						className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
							playing ? "opacity-0 hover:opacity-100" : "opacity-100"
						}`}
					>
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/[0.08] sm:h-20 sm:w-20">
							{playing ? (
								<svg className="h-7 w-7 text-white sm:h-8 sm:w-8" fill="currentColor" viewBox="0 0 24 24">
									<rect x="6" y="4" width="4" height="16" rx="1" />
									<rect x="14" y="4" width="4" height="16" rx="1" />
								</svg>
							) : (
								<svg className="ml-1 h-7 w-7 text-white sm:ml-1.5 sm:h-8 sm:w-8" fill="currentColor" viewBox="0 0 24 24">
									<path d="M8 5.14v14l11-7-11-7z" />
								</svg>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
