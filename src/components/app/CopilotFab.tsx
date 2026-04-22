"use client";

// ──────────────────────────────────────────────
// CopilotFab — Floating action button for Vestigio AI (3.14)
//
// Bottom-right, z-[45]. Labeled "Vestigio AI".
// Toggles the copilot panel open/close.
// Hidden when panel is fully open (panel has its own close button).
// ──────────────────────────────────────────────

import { useCopilot } from "./CopilotProvider";

export default function CopilotFab() {
	const { isOpen, isMinimized, open, restore, usage } = useCopilot();

	// Hide FAB when panel is fully open
	if (isOpen && !isMinimized) return null;

	// Plan gate — lock when budget is exhausted (plan gating handled by input bar)
	const isLocked = usage ? usage.remaining <= 0 : false;

	return (
		<button
			onClick={() => {
				if (isLocked) return; // TODO: show upgrade tooltip
				if (isMinimized) {
					restore();
				} else {
					open();
				}
			}}
			className={`
				fixed bottom-4 right-4 z-[45]
				flex items-center gap-2
				rounded-full px-4 py-3
				text-sm font-medium
				shadow-lg shadow-emerald-500/20
				transition-all duration-200
				${
					isLocked
						? "bg-zinc-800 text-zinc-400 cursor-not-allowed"
						: "bg-emerald-600 text-white hover:bg-emerald-500 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-95"
				}
			`}
			aria-label="Open Vestigio AI"
		>
			{/* Sparkle icon */}
			<svg
				className="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				strokeWidth={1.5}
				stroke="currentColor"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
				/>
			</svg>
			<span>Vestigio AI</span>
			{isLocked && (
				<span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
					0
				</span>
			)}
			{/* Unread indicator when minimized */}
			{isMinimized && (
				<span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
					<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
				</span>
			)}
		</button>
	);
}
