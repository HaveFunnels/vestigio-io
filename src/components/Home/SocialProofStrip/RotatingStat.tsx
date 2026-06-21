"use client";

import { useEffect, useState } from "react";
import { SlotText } from "slot-text/react";
import "slot-text/style.css";

// RotatingStat — rotates between N inline stats in a sentence with a
// per-character slot-roll animation. Used in SocialProofStrip to cycle
// angles of the same loss claim.
//
// Implementation note: slot-text/style.css positions char cells but
// does NOT force a font (verified — only display/overflow/flex rules).
// The pill className wraps SlotText, so the rolling characters inherit
// the parent font (Satoshi here) instead of slot-text default.
//
// `skipUnchanged: true` lets sequential strings that happen to share
// chars not re-animate every cell — useful for strings like "9 findings"
// → "10 findings" but mostly a no-op when strings are unrelated.

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
		<span className={className} aria-label={items[index]}>
			<SlotText
				text={items[index]}
				options={{
					direction: "up",
					stagger: 25,
					duration: 320,
					bounce: 0.2,
					skipUnchanged: true,
				}}
			/>
		</span>
	);
}
