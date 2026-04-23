"use client";

// ──────────────────────────────────────────────
// CopilotFab — Floating action button for Vestigio AI (3.14)
//
// Bottom-right, z-[45]. Labeled "Vestigio AI".
// Features a spinning color orb (emerald tones) + label.
// Animated entrance/exit via framer-motion (no opacity ghost).
// Hidden when panel is fully open.
// ──────────────────────────────────────────────

import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { useCopilot } from "./CopilotProvider";

// ── Color Orb (adapted from template, emerald tones) ──

function ColorOrb({ size = 24 }: { size?: number }) {
	const dim = `${size}px`;
	return (
		<div
			className="color-orb shrink-0"
			style={{
				width: dim,
				height: dim,
				"--base": "oklch(22% 0.02 160)",
				"--accent1": "oklch(75% 0.18 160)",
				"--accent2": "oklch(70% 0.14 170)",
				"--accent3": "oklch(80% 0.12 140)",
				"--spin-duration": "14s",
				"--blur": `${Math.max(size * 0.015, 1)}px`,
				"--contrast": size < 50 ? 1.3 : 1.5,
				"--dot": `${Math.max(size * 0.005, 0.05)}px`,
				"--shadow": `${Math.max(size * 0.008, 0.5)}px`,
			} as React.CSSProperties}
		>
			<style jsx>{`
				@property --angle {
					syntax: "<angle>";
					inherits: false;
					initial-value: 0deg;
				}
				.color-orb {
					display: grid;
					grid-template-areas: "stack";
					overflow: hidden;
					border-radius: 50%;
					position: relative;
					transform: scale(1.1);
				}
				.color-orb::before,
				.color-orb::after {
					content: "";
					display: block;
					grid-area: stack;
					width: 100%;
					height: 100%;
					border-radius: 50%;
					transform: translateZ(0);
				}
				.color-orb::before {
					background:
						conic-gradient(from calc(var(--angle) * 2) at 25% 70%, var(--accent3), transparent 20% 80%, var(--accent3)),
						conic-gradient(from calc(var(--angle) * 2) at 45% 75%, var(--accent2), transparent 30% 60%, var(--accent2)),
						conic-gradient(from calc(var(--angle) * -3) at 80% 20%, var(--accent1), transparent 40% 60%, var(--accent1)),
						conic-gradient(from calc(var(--angle) * 2) at 15% 5%, var(--accent2), transparent 10% 90%, var(--accent2)),
						conic-gradient(from calc(var(--angle) * 1) at 20% 80%, var(--accent1), transparent 10% 90%, var(--accent1)),
						conic-gradient(from calc(var(--angle) * -2) at 85% 10%, var(--accent3), transparent 20% 80%, var(--accent3));
					box-shadow: inset var(--base) 0 0 var(--shadow) calc(var(--shadow) * 0.2);
					filter: blur(var(--blur)) contrast(var(--contrast));
					animation: orb-spin var(--spin-duration) linear infinite;
				}
				.color-orb::after {
					background-image: radial-gradient(circle at center, var(--base) var(--dot), transparent var(--dot));
					background-size: calc(var(--dot) * 2) calc(var(--dot) * 2);
					backdrop-filter: blur(calc(var(--blur) * 2)) contrast(calc(var(--contrast) * 2));
					mix-blend-mode: overlay;
					mask-image: radial-gradient(black 15%, transparent 75%);
				}
				@keyframes orb-spin {
					to { --angle: 360deg; }
				}
				@media (prefers-reduced-motion: reduce) {
					.color-orb::before { animation: none; }
				}
			`}</style>
		</div>
	);
}

// ── FAB ──

export default function CopilotFab() {
	const t = useTranslations("console.copilot");
	const { isOpen, isMinimized, open, restore } = useCopilot();

	const visible = !(isOpen && !isMinimized);

	return (
		<AnimatePresence>
			{visible && (
				<motion.button
					key="copilot-fab"
					onClick={() => {
						if (isMinimized) {
							restore();
						} else {
							open();
						}
					}}
					className="
						fixed bottom-4 right-4 z-[45]
						flex items-center gap-2.5
						rounded-full pl-3 pr-4 py-2.5
						text-sm font-medium cursor-pointer
						bg-black/80 text-white backdrop-blur-sm
						border border-white/10
						shadow-[0_0_12px_-2px_rgba(255,255,255,0.2),0_0_4px_0px_rgba(255,255,255,0.08)]
						hover:border-white/20 hover:shadow-[0_0_18px_-2px_rgba(255,255,255,0.3),0_0_6px_0px_rgba(255,255,255,0.1)]
					"
					style={{ cursor: "pointer" }}
					aria-label={t("fab_aria")}
					initial={{ y: 80, scale: 0.8 }}
					animate={{ y: 0, scale: 1 }}
					exit={{ y: 80, scale: 0.8 }}
					transition={{
						type: "spring",
						stiffness: 400,
						damping: 30,
						mass: 0.8,
					}}
					whileHover={{ scale: 1.06 }}
					whileTap={{ scale: 0.93 }}
				>
					<ColorOrb size={24} />
					<span>{t("fab_label")}</span>
					{/* Unread indicator when minimized */}
					{isMinimized && (
						<span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-75" />
							<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
						</span>
					)}
				</motion.button>
			)}
		</AnimatePresence>
	);
}
