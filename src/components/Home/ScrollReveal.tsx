"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

export default function ScrollReveal({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [mounted, setMounted] = useState(false);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setVisible(true);
			setMounted(true);
			return;
		}

		const el = ref.current;
		if (!el) {
			setMounted(true);
			return;
		}

		const obs = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setVisible(true);
					obs.disconnect();
				}
			},
			{ rootMargin: "0px 0px 120px 0px", threshold: 0 },
		);

		obs.observe(el);
		setMounted(true);
		return () => obs.disconnect();
	}, []);

	const isHidden = mounted && !visible;

	return (
		<div
			ref={ref}
			className={`transition-[opacity,transform] duration-700 ease-out ${
				isHidden ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
			} ${className}`}
		>
			{children}
		</div>
	);
}
