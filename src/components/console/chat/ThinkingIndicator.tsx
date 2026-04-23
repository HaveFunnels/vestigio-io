"use client";

/**
 * ThinkingIndicator — Pack-aware animated indicator while the LLM processes.
 *
 * Cycles through pack names with colored dots, giving the impression
 * that each domain pack is being consulted before the response arrives.
 * Falls back to a generic "Analyzing..." when no stage is provided.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ThinkingIndicatorProps {
	stage?: string;
}

interface PackStep {
	label: string;
	color: string; // tailwind bg class for the dot
	textColor: string; // tailwind text class for the label
}

const PACK_STEPS: PackStep[] = [
	{ label: "Revenue", color: "bg-red-500", textColor: "text-red-400" },
	{ label: "Security", color: "bg-blue-500", textColor: "text-blue-400" },
	{ label: "Chargeback", color: "bg-amber-500", textColor: "text-amber-400" },
	{ label: "Trust", color: "bg-indigo-500", textColor: "text-indigo-400" },
	{ label: "Performance", color: "bg-emerald-500", textColor: "text-emerald-400" },
	{ label: "Friction", color: "bg-rose-500", textColor: "text-rose-400" },
];

export function ThinkingIndicator({ stage }: ThinkingIndicatorProps) {
	const [stepIndex, setStepIndex] = useState(0);

	useEffect(() => {
		if (stage) return; // Don't cycle when a specific stage is provided
		const interval = setInterval(() => {
			setStepIndex((prev) => (prev + 1) % PACK_STEPS.length);
		}, 1800);
		return () => clearInterval(interval);
	}, [stage]);

	const currentPack = PACK_STEPS[stepIndex];

	return (
		<div className="flex justify-start">
			<div className="flex items-center gap-3 rounded-xl bg-surface-card/60 px-4 py-3">
				{/* Spinning orb (mini version) */}
				<div className="relative flex h-6 w-6 items-center justify-center">
					<div className="absolute inset-0 rounded-full opacity-20" style={{ background: "conic-gradient(from 0deg, #34d399, #10b981, #059669, #34d399)" }}>
						<div className="h-full w-full animate-spin rounded-full" style={{ animationDuration: "3s" }} />
					</div>
					<AnimatePresence mode="wait">
						<motion.div
							key={stage || stepIndex}
							className={`h-2.5 w-2.5 rounded-full ${stage ? "bg-emerald-500" : currentPack.color}`}
							initial={{ scale: 0.5, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.5, opacity: 0 }}
							transition={{ duration: 0.2 }}
						/>
					</AnimatePresence>
				</div>

				{/* Label */}
				<div className="flex items-center gap-1.5">
					<AnimatePresence mode="wait">
						<motion.span
							key={stage || stepIndex}
							className={`text-xs font-medium ${stage ? "text-content-muted" : currentPack.textColor}`}
							initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
							animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
							exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
							transition={{ duration: 0.25 }}
						>
							{stage || `${currentPack.label} analyzing`}
						</motion.span>
					</AnimatePresence>
					{/* Animated ellipsis */}
					<span className="flex gap-0.5">
						<span className="h-1 w-1 rounded-full bg-content-faint animate-pulse" style={{ animationDelay: "0ms" }} />
						<span className="h-1 w-1 rounded-full bg-content-faint animate-pulse" style={{ animationDelay: "300ms" }} />
						<span className="h-1 w-1 rounded-full bg-content-faint animate-pulse" style={{ animationDelay: "600ms" }} />
					</span>
				</div>
			</div>
		</div>
	);
}
