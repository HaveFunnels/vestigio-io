"use client";

import { useState } from "react";

// ──────────────────────────────────────────────
// How a number is counted, where the number is.
//
// This replaces a "Como contamos" section, which the market research
// found has no equivalent in any shipped product. Search Console puts
// methodology in documentation outside the app; GA4 explicitly refuses
// to explain how it decides something is an anomaly; Ahrefs explains
// Domain Rating in a tooltip inside the report where it appears rather
// than linking to an article.
//
// A page with a chapter of notes at the end is a document. A number
// with its definition attached is a dashboard. The information is the
// same; what changes is that nobody has to go and get it.
//
// Hover and click both open it, because the operator reads this on a
// phone and hover does not exist there.
// ──────────────────────────────────────────────

interface Props {
	/** One or two sentences. If it needs three, the metric is wrong. */
	children: React.ReactNode;
	/** Where the bubble opens, so it never leaves the card. */
	align?: "left" | "right";
	label?: string;
}

export default function MetricInfo({ children, align = "left", label }: Props) {
	const [open, setOpen] = useState(false);
	return (
		<span className="relative inline-flex align-middle">
			<button
				type="button"
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
				onClick={() => setOpen((v) => !v)}
				aria-label={label ?? "Como este número é contado"}
				aria-expanded={open}
				className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-edge text-[9px] font-semibold text-content-faint transition-colors hover:border-edge-focus hover:text-content-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
			>
				?
			</button>
			{open && (
				<span
					role="note"
					className={`absolute top-5 z-50 w-64 rounded-mid border border-edge bg-surface-card px-3 py-2.5 text-[11.5px] font-normal leading-relaxed text-content-secondary shadow-xl ${
						align === "right" ? "right-0" : "left-0"
					}`}
				>
					{children}
				</span>
			)}
		</span>
	);
}
