"use client";

import { useEffect, useState } from "react";
import { SlotText } from "slot-text/react";
import "slot-text/style.css";

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
	const [mounted, setMounted] = useState(false);
	const [index, setIndex] = useState(0);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (!mounted || items.length <= 1) return;
		const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced) return;
		const id = window.setInterval(() => {
			setIndex((i) => (i + 1) % items.length);
		}, intervalMs);
		return () => window.clearInterval(id);
	}, [mounted, items.length, intervalMs]);

	if (!items || items.length === 0) return null;

	if (!mounted) {
		return <span className={className}>{items[0]}</span>;
	}

	return (
		<SlotText
			className={className}
			text={items[index]}
			options={{ stagger: 35, duration: 320, bounce: 0.55, skipUnchanged: false }}
		/>
	);
}
