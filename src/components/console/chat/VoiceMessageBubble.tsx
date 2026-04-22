"use client";

/**
 * VoiceMessageBubble — Audio playback bubble for voice messages.
 *
 * Features:
 * - Play/pause with waveform visualization
 * - Click-to-seek on waveform
 * - Elapsed / total time display
 * - Optional transcript expandable
 * - Vestigio design tokens (works in dark theme)
 */

import { useEffect, useMemo, useRef, useState } from "react";

interface VoiceMessageBubbleProps {
	audioSrc: string;
	duration: number;
	transcript?: string;
	/** "user" renders right-aligned emerald, "assistant" renders left-aligned surface */
	variant?: "user" | "assistant";
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceMessageBubble({
	audioSrc,
	duration,
	transcript,
	variant = "user",
}: VoiceMessageBubbleProps) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [progress, setProgress] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [showTranscript, setShowTranscript] = useState(false);
	const waveformRef = useRef<HTMLDivElement>(null);

	// Stable pseudo-random waveform bar heights (seeded by duration)
	const barHeights = useMemo(() => {
		const bars: number[] = [];
		let seed = Math.round(duration * 100);
		for (let i = 0; i < 32; i++) {
			seed = (seed * 16807 + 7) % 2147483647;
			bars.push(4 + (seed % 16));
		}
		return bars;
	}, [duration]);

	useEffect(() => {
		const audio = new Audio(audioSrc);
		audioRef.current = audio;

		const onTimeUpdate = () => {
			if (audio.duration) {
				setProgress((audio.currentTime / audio.duration) * 100);
				setCurrentTime(audio.currentTime);
			}
		};
		const onEnded = () => {
			setIsPlaying(false);
			setProgress(0);
			setCurrentTime(0);
		};

		audio.addEventListener("timeupdate", onTimeUpdate);
		audio.addEventListener("ended", onEnded);

		return () => {
			audio.removeEventListener("timeupdate", onTimeUpdate);
			audio.removeEventListener("ended", onEnded);
			audio.pause();
		};
	}, [audioSrc]);

	function togglePlay() {
		const audio = audioRef.current;
		if (!audio) return;
		if (isPlaying) {
			audio.pause();
		} else {
			audio.play();
		}
		setIsPlaying(!isPlaying);
	}

	function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
		const audio = audioRef.current;
		const el = waveformRef.current;
		if (!audio || !el) return;
		const rect = el.getBoundingClientRect();
		const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
		audio.currentTime = ratio * (audio.duration || duration);
	}

	const isUser = variant === "user";

	return (
		<div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
			<div
				className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
					isUser
						? "rounded-br-sm bg-emerald-600/15 border border-emerald-500/20"
						: "rounded-bl-sm bg-surface-inset border border-edge/50"
				}`}
				style={{ minWidth: 200, maxWidth: 320 }}
			>
				{/* Play / Pause */}
				<button
					onClick={togglePlay}
					className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
						isUser
							? "bg-emerald-600 text-white hover:bg-emerald-500"
							: "bg-surface-card border border-edge text-content-secondary hover:bg-surface-card-hover"
					}`}
					aria-label={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? (
						<svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
							<rect x="4" y="3" width="3" height="10" rx="0.5" />
							<rect x="9" y="3" width="3" height="10" rx="0.5" />
						</svg>
					) : (
						<svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
							<path d="M5 3.5v9l7-4.5-7-4.5z" />
						</svg>
					)}
				</button>

				{/* Waveform */}
				<div
					ref={waveformRef}
					className="relative flex flex-1 cursor-pointer items-center justify-between gap-px h-6"
					onClick={handleSeek}
				>
					{barHeights.map((h, i) => {
						const barProgress = (i / barHeights.length) * 100;
						const isActive = barProgress < progress;
						return (
							<div
								key={i}
								className={`rounded-full transition-colors duration-150 ${
									isActive
										? isUser
											? "bg-emerald-400"
											: "bg-content-secondary"
										: isUser
											? "bg-emerald-600/30"
											: "bg-content-faint/30"
								}`}
								style={{ width: 2, height: h, flexShrink: 0 }}
							/>
						);
					})}
				</div>

				{/* Time */}
				<span className={`shrink-0 font-mono text-[11px] ${isUser ? "text-emerald-400" : "text-content-muted"}`}>
					{isPlaying || currentTime > 0
						? formatTime(currentTime)
						: formatTime(duration)}
				</span>
			</div>

			{/* Transcript toggle */}
			{transcript && (
				<button
					onClick={() => setShowTranscript(!showTranscript)}
					className="px-1 text-[10px] text-content-faint hover:text-content-muted transition-colors"
				>
					{showTranscript ? "Hide transcript" : "Show transcript"}
				</button>
			)}
			{showTranscript && transcript && (
				<p className={`max-w-[320px] rounded-lg bg-surface-inset/50 px-3 py-2 text-xs text-content-muted ${isUser ? "text-right" : "text-left"}`}>
					{transcript}
				</p>
			)}
		</div>
	);
}
