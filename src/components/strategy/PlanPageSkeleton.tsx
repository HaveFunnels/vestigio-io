"use client";

/*
 * Shimmer skeleton for the Strategy Plan page (and its standalone
 * cousins — Copy Lens, Maps). Replaces the spinning circle loader per
 * the user's standing preference: skeleton always, never spinners.
 *
 * The skeleton mirrors the real page's reading rhythm:
 *   - eyebrow + title + meta block at top
 *   - hero metrics grid (4 tiles)
 *   - section cards (3, descending)
 *
 * On the standalone Copy Lens / Maps pages we render a slimmer variant
 * with `variant="standalone"` — same shimmer palette, fewer rows.
 *
 * A single `caption` prop appears beneath the skeleton (e.g.
 * "Gerando o plano de Junho…" or "Atualiza automaticamente quando
 * estiver pronto"). The caption is the ONLY explicit "we're loading"
 * affordance; the skeleton itself communicates progress visually.
 */

interface Props {
	caption?: string;
	subCaption?: string;
	variant?: "plan" | "standalone";
}

function Bar({ className = "" }: { className?: string }) {
	return (
		<div
			className={`animate-pulse rounded-md bg-surface-card ${className}`}
			aria-hidden
		/>
	);
}

export default function PlanPageSkeleton({
	caption,
	subCaption,
	variant = "plan",
}: Props) {
	if (variant === "standalone") {
		return (
			<div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-14">
				<Bar className="mb-3 h-3 w-24" />
				<Bar className="mb-2 h-7 w-72" />
				<Bar className="mb-8 h-3 w-48" />

				<div className="space-y-4">
					<Bar className="h-16 w-full" />
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<Bar key={i} className="h-32 w-full" />
						))}
					</div>
					<Bar className="h-40 w-full" />
				</div>

				{(caption || subCaption) && (
					<div className="mt-10 text-center">
						{caption && (
							<p className="text-[13px] text-content-muted">{caption}</p>
						)}
						{subCaption && (
							<p className="mt-1 text-[12px] text-content-faint">{subCaption}</p>
						)}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-14">
			{/* Top eyebrow + title + meta — mirrors PlanHeader rhythm */}
			<Bar className="mb-3 h-3 w-32" />
			<Bar className="mb-3 h-9 w-3/4" />
			<Bar className="mb-2 h-3 w-1/2" />
			<Bar className="mb-10 h-3 w-2/5" />

			{/* Hero metrics — 4 tiles, like HeroMetrics */}
			<div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div
						key={i}
						className="rounded-2xl border border-edge bg-surface-card/40 p-5"
					>
						<Bar className="mb-2 h-3 w-20" />
						<Bar className="mb-3 h-7 w-28" />
						<Bar className="h-2 w-16" />
					</div>
				))}
			</div>

			{/* Narrative / section cards — varied heights to feel less robotic */}
			<div className="space-y-6">
				<div className="rounded-2xl border border-edge bg-surface-card/40 p-6">
					<Bar className="mb-4 h-4 w-44" />
					<Bar className="mb-2 h-3 w-full" />
					<Bar className="mb-2 h-3 w-[92%]" />
					<Bar className="h-3 w-[80%]" />
				</div>
				<div className="rounded-2xl border border-edge bg-surface-card/40 p-6">
					<Bar className="mb-4 h-4 w-56" />
					<div className="space-y-2">
						<Bar className="h-3 w-full" />
						<Bar className="h-3 w-[88%]" />
						<Bar className="h-3 w-[70%]" />
					</div>
				</div>
				<div className="rounded-2xl border border-edge bg-surface-card/40 p-6">
					<Bar className="mb-4 h-4 w-48" />
					<Bar className="h-3 w-[60%]" />
				</div>
			</div>

			{(caption || subCaption) && (
				<div className="mt-10 text-center">
					{caption && (
						<p className="text-[13px] text-content-muted">{caption}</p>
					)}
					{subCaption && (
						<p className="mt-1 text-[12px] text-content-faint">{subCaption}</p>
					)}
				</div>
			)}
		</div>
	);
}
