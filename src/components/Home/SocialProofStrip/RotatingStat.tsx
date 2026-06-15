"use client";

import { useEffect, useState } from "react";

// RotatingStat — alterna entre N stats inline numa frase, com fade+blur
// curtinho a cada troca. Usado no SocialProofStrip pra rotar ângulos da
// mesma claim de perda. NÃO usa slot-text porque, em prosa, o roll
// char-by-char vira ruído visual e o font-mono que ele força colide
// com a fonte do parágrafo. SlotText permanece pra números curtos
// (findingCounter, total impact da MiniCalc).

interface RotatingStatProps {
	items: string[];
	intervalMs?: number;
	className?: string;
}

export default function RotatingStat({
	items,
	intervalMs = 4500,
	className,
}: RotatingStatProps) {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (items.length <= 1) return;
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced) return;
		const id = window.setInterval(() => {
			setIndex((i) => (i + 1) % items.length);
		}, intervalMs);
		return () => window.clearInterval(id);
	}, [items.length, intervalMs]);

	if (!items || items.length === 0) return null;

	return (
		<>
			<style>{`
				@keyframes rotating-stat-in {
					0%   { opacity: 0; filter: blur(3px); transform: translateY(-3px); }
					60%  { opacity: 1; filter: blur(0); transform: translateY(0); }
					100% { opacity: 1; filter: blur(0); transform: translateY(0); }
				}
				@media (prefers-reduced-motion: reduce) {
					.rotating-stat-anim { animation: none !important; }
				}
			`}</style>
			<span
				key={index}
				className={`rotating-stat-anim ${className || ""}`}
				style={{ animation: "rotating-stat-in 360ms cubic-bezier(0.22, 1, 0.36, 1)" }}
				aria-label={items[index]}
			>
				{items[index]}
			</span>
		</>
	);
}
