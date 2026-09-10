"use client";

import { useRef, useState } from "react";

/*
 * ONDA 4.3 — the figure that points.
 *
 * A flat screenshot proves nothing ("banner do topo, não indica nada
 * em específico" — founder). This one draws on the customer's page:
 * the primary CTA / form regions located at capture time get a ring
 * and, when the page has measured friction, the counted note pinned
 * to the region ("78 hesitações medidas aqui").
 *
 * Scaling contract: annotations are in captured-image pixels; the
 * overlay only renders in the EXPANDED state, where the image is
 * w-full h-auto (uniform scale = rendered/natural width). In the
 * collapsed crop, a badge advertises the marked regions instead of
 * mis-placing rings over an object-cover crop.
 */

export interface ShotAnnotation {
	kind: string;
	x: number;
	y: number;
	w: number;
	h: number;
	label?: string;
}

export interface ShotMeta {
	width: number | null;
	height: number | null;
	annotations: ShotAnnotation[] | null;
}

interface Props {
	url: string;
	alt: string;
	caption: string;
	meta?: ShotMeta | null;
	/** Measured-friction note pinned to the primary region, pre-written. */
	measuredNote?: string | null;
	collapsedMaxH?: number;
	className?: string;
}

export default function AnnotatedScreenshot({
	url,
	alt,
	caption,
	meta,
	measuredNote,
	collapsedMaxH = 260,
	className = "",
}: Props) {
	const [failed, setFailed] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [renderedW, setRenderedW] = useState<number | null>(null);
	const imgRef = useRef<HTMLImageElement | null>(null);

	if (failed) return null;
	const annotations = meta?.annotations ?? [];
	const naturalW = meta?.width ?? null;
	const scale = expanded && renderedW && naturalW ? renderedW / naturalW : null;

	return (
		<figure className={`overflow-hidden rounded-xl border border-edge bg-surface-inset ${className}`}>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="relative block w-full cursor-zoom-in text-left"
				aria-expanded={expanded}
			>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					ref={imgRef}
					src={url}
					alt={alt}
					loading="lazy"
					onError={() => setFailed(true)}
					onLoad={() => setRenderedW(imgRef.current?.clientWidth ?? null)}
					className={`block w-full object-cover object-top ${expanded ? "max-h-none" : ""}`}
					style={expanded ? undefined : { maxHeight: collapsedMaxH }}
				/>
				{/* Expanded: draw the located regions, scaled. */}
				{scale !== null &&
					annotations.map((a, i) => {
						const isCta = a.kind === "primary_cta";
						return (
							<div key={i} aria-hidden>
								<div
									className={`absolute rounded-md border-2 ${
										isCta ? "border-rose-400/90" : "border-sky-400/80"
									} shadow-[0_0_0_4px_rgba(0,0,0,0.25)]`}
									style={{
										left: a.x * scale - 4,
										top: a.y * scale - 4,
										width: a.w * scale + 8,
										height: a.h * scale + 8,
									}}
								/>
								{(measuredNote || a.label) && isCta && (
									<div
										className="absolute max-w-[240px] rounded-md border border-edge bg-surface-card/95 px-2 py-1 text-[10.5px] font-medium leading-snug text-content shadow-lg"
										style={{
											left: Math.max(4, a.x * scale - 4),
											top: (a.y + a.h) * scale + 8,
										}}
									>
										{measuredNote ?? `Botão principal: "${a.label}"`}
									</div>
								)}
							</div>
						);
					})}
				{/* Collapsed: advertise that the figure points somewhere. */}
				{!expanded && annotations.length > 0 && (
					<div className="absolute bottom-2 right-2 rounded-full border border-rose-400/40 bg-surface-card/90 px-2 py-0.5 text-[10px] font-semibold text-rose-300 shadow">
						{annotations.length === 1
							? "1 região marcada"
							: `${annotations.length} regiões marcadas`}{" "}
						· ver a página inteira
					</div>
				)}
			</button>
			<figcaption className="flex items-baseline justify-between gap-3 border-t border-edge px-3 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-content-faint">
				<span>{caption}</span>
				<span className="normal-case tracking-normal" data-vsgp-print-hide>
					{expanded ? "recolher" : "ver a página inteira"}
				</span>
			</figcaption>
		</figure>
	);
}
