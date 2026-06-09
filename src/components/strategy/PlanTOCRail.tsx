"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/*
 * PlanTOCRail — Right-rail section navigator
 *
 * Premium plan grew past a single viewport; without a way to jump
 * between sections, the customer has to scroll-hunt. Generic top-tab
 * TOCs eat vertical space and pull focus; we want the navigator to
 * disappear when you're reading and surface when you're navigating.
 *
 * Design lens (frontend-design): distinctive but restrained. Right rail
 * of dots, label appears on hover/focus, current section highlighted
 * with a horizontal dash + filled dot. Desktop only — mobile relies on
 * natural vertical scroll. Hidden in print.
 *
 * Activation: IntersectionObserver against the section nodes; the
 * section whose center is closest to the viewport center wins as
 * "active". Click on any dot → smooth scroll to that section.
 */

export interface TocItem {
	id: string;
	label: string;
	/** When false, item is hidden from the rail (e.g. self-hiding
	 *  sections like Continuity on first-month plans). */
	visible: boolean;
}

interface Props {
	items: TocItem[];
}

export default function PlanTOCRail({ items }: Props) {
	const visibleItems = items.filter((i) => i.visible);
	const [activeId, setActiveId] = useState<string | null>(
		visibleItems[0]?.id ?? null,
	);
	const [hovered, setHovered] = useState(false);
	const railRef = useRef<HTMLElement>(null);

	useEffect(() => {
		if (visibleItems.length === 0) return;
		// Per-section IntersectionObserver. We use a custom rootMargin so
		// the active section is the one currently filling the center band
		// of the viewport, not the one whose top happens to be visible.
		const observer = new IntersectionObserver(
			(entries) => {
				// Among currently-intersecting entries, pick the one with
				// the highest intersection ratio. Stable enough that fast
				// scrolls don't flicker the active item.
				const visible = entries
					.filter((e) => e.isIntersecting)
					.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
				const top = visible[0];
				if (top) {
					const id = (top.target as HTMLElement).dataset.tocId;
					if (id) setActiveId(id);
				}
			},
			{
				// Trim 40% off the top + bottom so an "active" section means
				// "occupies the middle band of the viewport".
				rootMargin: "-40% 0px -40% 0px",
				threshold: [0, 0.25, 0.5, 0.75, 1],
			},
		);

		for (const item of visibleItems) {
			const el = document.querySelector(`[data-toc-id="${item.id}"]`);
			if (el) observer.observe(el);
		}

		return () => observer.disconnect();
	}, [visibleItems]);

	function handleJump(id: string) {
		const el = document.querySelector(`[data-toc-id="${id}"]`);
		if (!el) return;
		el.scrollIntoView({ behavior: "smooth", block: "start" });
		setActiveId(id);
	}

	if (visibleItems.length === 0) return null;

	return (
		<aside
			ref={railRef}
			data-vsgp-print-hide
			className="pointer-events-none fixed right-6 top-1/2 z-30 hidden -translate-y-1/2 lg:block print:hidden"
			aria-label="Navegação do plano"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<nav className="pointer-events-auto flex flex-col gap-1">
				{visibleItems.map((item) => {
					const isActive = item.id === activeId;
					return (
						<button
							key={item.id}
							type="button"
							onClick={() => handleJump(item.id)}
							className="group relative flex items-center gap-2 outline-none"
							aria-label={item.label}
							aria-current={isActive ? "true" : undefined}
						>
							{/* Label — slides in when rail is hovered OR this
							    item is currently active. Active label stays
							    visible so the reader always knows where they
							    are without hovering. */}
							<motion.span
								initial={false}
								animate={{
									opacity: hovered || isActive ? 1 : 0,
									x: hovered || isActive ? 0 : 6,
								}}
								transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
								className={`select-none whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.14em] ${
									isActive
										? "text-content"
										: "text-content-muted group-hover:text-content"
								}`}
							>
								{item.label}
							</motion.span>
							{/* Horizontal dash before the dot when active. */}
							<motion.span
								initial={false}
								animate={{ width: isActive ? 14 : 0, opacity: isActive ? 1 : 0 }}
								transition={{ duration: 0.18 }}
								className="h-px bg-content"
								aria-hidden
							/>
							{/* Dot — bigger + brighter when active. */}
							<motion.span
								initial={false}
								animate={{
									scale: isActive ? 1.4 : 1,
									backgroundColor: isActive
										? "rgb(var(--content))"
										: "rgb(var(--content-faint))",
								}}
								transition={{ duration: 0.18 }}
								className="block h-1.5 w-1.5 rounded-full"
								aria-hidden
							/>
						</button>
					);
				})}
			</nav>
		</aside>
	);
}
