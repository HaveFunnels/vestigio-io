"use client";

// ──────────────────────────────────────────────
// FirstAuditCelebration  (Wave 3.18C)
//
// Brief (1.5s) celebration overlay that appears when the first audit
// completes. Shows the finding count + page count, then fades out to
// reveal the real dashboard data underneath.
//
// Renders as a fixed overlay with emerald glow dots that drift upward.
// The parent is responsible for rendering this conditionally and
// removing it after fadeout.
// ──────────────────────────────────────────────

import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
	ConfettiIcon as Confetti,
} from "@phosphor-icons/react/dist/ssr";

interface FirstAuditCelebrationProps {
	findingsCount: number;
	pagesDiscovered: number;
	onDone: () => void;
}

// Generate stable random positions for emerald dots
function generateDots(count: number) {
	const dots: { x: number; y: number; delay: number; size: number }[] = [];
	// Use deterministic seed-like approach
	for (let i = 0; i < count; i++) {
		dots.push({
			x: ((i * 37 + 13) % 100),
			y: ((i * 53 + 29) % 100),
			delay: (i * 0.08) % 1.2,
			size: 3 + ((i * 17) % 6),
		});
	}
	return dots;
}

export default function FirstAuditCelebration({
	findingsCount,
	pagesDiscovered,
	onDone,
}: FirstAuditCelebrationProps) {
	const t = useTranslations("console.first_audit.celebration");
	const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

	const dots = useMemo(() => generateDots(24), []);

	useEffect(() => {
		// Enter → visible (instant)
		const t1 = setTimeout(() => setPhase("visible"), 50);
		// visible → exit
		const t2 = setTimeout(() => setPhase("exit"), 1500);
		// exit → done (remove from DOM)
		const t3 = setTimeout(() => onDone(), 2100);

		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
			clearTimeout(t3);
		};
	}, [onDone]);

	const opacity = phase === "enter" ? 0 : phase === "visible" ? 1 : 0;

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-500 ease-out"
			style={{ opacity }}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />

			{/* Emerald glow dots */}
			{dots.map((dot, i) => (
				<div
					key={i}
					className="absolute rounded-full bg-emerald-400/40 animate-celebration-dot"
					style={{
						left: `${dot.x}%`,
						top: `${dot.y}%`,
						width: `${dot.size}px`,
						height: `${dot.size}px`,
						animationDelay: `${dot.delay}s`,
						animationDuration: "1.8s",
					}}
				/>
			))}

			{/* Content card */}
			<div className="relative z-10 mx-4 max-w-md rounded-2xl border border-emerald-500/30 bg-zinc-900/90 px-8 py-8 text-center shadow-2xl shadow-emerald-500/10">
				{/* Glow ring */}
				<div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-emerald-500/20 via-transparent to-emerald-500/10 blur-sm" />

				<div className="relative">
					<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
						<Confetti size={28} weight="fill" />
					</div>
					<h2 className="text-xl font-bold text-white">
						{t("title")}
					</h2>
					<p className="mt-2 text-sm text-zinc-300">
						{t("body", {
							findings: findingsCount,
							pages: pagesDiscovered,
						})}
					</p>
				</div>
			</div>
		</div>
	);
}
