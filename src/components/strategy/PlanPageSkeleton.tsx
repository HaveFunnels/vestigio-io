"use client";

/*
 * Layout-true skeleton for the Strategy Plan page (and the standalone
 * Copy Lens / Maps pages). Each shape mirrors the real component the
 * page will render — same container width, same paddings, same
 * stacking rhythm. The customer's eye lands in the right place before
 * the real content paints, so the swap reads as "filling in", not
 * "screen jumped".
 *
 * Three variants:
 *   - "plan"       — full plan page (default). Mirrors PlanHeader
 *                    breadcrumb + huge serif title + meta line +
 *                    MonthlyThesis pull-quote + HeroMetrics 4-tile +
 *                    BuyerSegments 3-card + NextSteps main+supporting
 *                    sequence + footer fade.
 *   - "copy-lens"  — frameworks chip row + active framework card
 *                    (name + intro + useCase chip + "Quando usar"
 *                    line + page selector + criteria list).
 *   - "maps"       — purpose paragraph + 4-card thumbnail grid +
 *                    cycle stats card.
 *
 * The caption + subCaption text is the only explicit "loading"
 * affordance; the shimmer + structure already communicate progress.
 */

interface Props {
	caption?: string;
	subCaption?: string;
	variant?: "plan" | "copy-lens" | "maps";
}

function Bar({ className = "" }: { className?: string }) {
	return (
		<div
			className={`animate-pulse rounded-md bg-surface-card ${className}`}
			aria-hidden
		/>
	);
}

function Captions({ caption, subCaption }: { caption?: string; subCaption?: string }) {
	if (!caption && !subCaption) return null;
	return (
		<div className="mt-10 text-center">
			{caption && <p className="text-[13px] text-content-muted">{caption}</p>}
			{subCaption && (
				<p className="mt-1 text-[12px] text-content-faint">{subCaption}</p>
			)}
		</div>
	);
}

// ──────────────────────────────────────────────
// Plan page — mirrors StrategyPlanPanel layout in completo mode
// ──────────────────────────────────────────────

function PlanSkeleton() {
	return (
		<div className="relative">
			{/* StickyHeader strip — same height + border-bottom as the
			    real one so there's no header-shift when content paints. */}
			<div className="sticky top-0 z-30 border-b border-edge bg-surface/85 backdrop-blur-md">
				<div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 sm:px-6 sm:py-3">
					<Bar className="h-3 w-44" />
					<div className="flex items-center gap-2">
						<Bar className="h-8 w-32 rounded" />
						<Bar className="h-8 w-8 rounded" />
						<Bar className="h-8 w-8 rounded" />
					</div>
				</div>
			</div>

			<div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-14">
				{/* PlanHeader — eyebrow row + serif title + meta */}
				<div className="mb-14 border-b border-edge pb-10">
					<div className="mb-4 flex items-center gap-2">
						<Bar className="h-3 w-14" />
						<span className="text-edge">/</span>
						<Bar className="h-3 w-32" />
						<span className="text-edge">/</span>
						<Bar className="h-3 w-16" />
					</div>
					<Bar className="mb-3 h-12 w-[80%] sm:h-16" />
					<Bar className="mb-6 h-12 w-[55%] sm:h-16" />
					<div className="flex flex-wrap items-center gap-3">
						<Bar className="h-6 w-28" />
						<span className="text-edge">·</span>
						<Bar className="h-4 w-40" />
						<span className="text-edge">·</span>
						<Bar className="h-4 w-32" />
					</div>
				</div>

				{/* MonthlyThesis — pull-quote card */}
				<div className="mb-12">
					<Bar className="mx-auto mb-4 h-3 w-20" />
					<div className="rounded-2xl border border-edge bg-surface-card p-7 sm:p-9">
						<Bar className="mx-auto mb-4 h-7 w-[90%] sm:h-9" />
						<Bar className="mx-auto mb-3 h-7 w-[75%] sm:h-9" />
						<Bar className="mx-auto h-7 w-[60%] sm:h-9" />
					</div>
				</div>

				{/* HeroMetrics — eyebrow + 4-tile grid */}
				<div className="mb-12">
					<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between">
						<Bar className="h-6 w-64" />
						<Bar className="h-3 w-44" />
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{Array.from({ length: 4 }).map((_, i) => (
							<div
								key={i}
								className="rounded-2xl border border-edge bg-surface-card/50 p-5"
							>
								<Bar className="mb-2 h-2.5 w-20" />
								<Bar className="mb-3 h-8 w-28" />
								<Bar className="h-2 w-16" />
							</div>
						))}
					</div>
				</div>

				{/* Narrative — header + pack distribution bar + 4 paragraphs */}
				<div className="mx-auto mb-12 max-w-[680px]">
					<div className="mb-3 flex items-center gap-3">
						<div className="h-px flex-1 bg-edge/60" />
						<Bar className="h-3 w-40" />
						<div className="h-px flex-1 bg-edge/60" />
					</div>
					<Bar className="mx-auto mb-6 h-9 w-[70%]" />
					{/* Pack distribution bar */}
					<div className="mb-7">
						<div className="mb-2 flex items-baseline justify-between">
							<Bar className="h-3 w-44" />
							<Bar className="h-3 w-36" />
						</div>
						<Bar className="h-2 w-full" />
						<div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
							{Array.from({ length: 4 }).map((_, i) => (
								<Bar key={i} className="h-3 w-24" />
							))}
						</div>
					</div>
					{/* Paragraphs */}
					<div className="space-y-4">
						<Bar className="h-4 w-full" />
						<Bar className="h-4 w-[95%]" />
						<Bar className="h-4 w-[88%]" />
						<Bar className="h-4 w-[70%]" />
						<div className="h-4" />
						<Bar className="h-4 w-full" />
						<Bar className="h-4 w-[92%]" />
						<Bar className="h-4 w-[80%]" />
					</div>
				</div>

				{/* BuyerSegments — eyebrow + 3 buyer cards */}
				<div className="mb-12">
					<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between">
						<Bar className="h-6 w-72" />
						<Bar className="h-3 w-40" />
					</div>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div
								key={i}
								className="flex min-h-[200px] flex-col rounded-2xl border border-edge bg-surface-card p-5 sm:p-6"
							>
								<div className="mb-2 flex items-center gap-2">
									<span className="h-1.5 w-1.5 rounded-full bg-content-faint/40" />
									<Bar className="h-2.5 w-16" />
								</div>
								<Bar className="mb-3 h-8 w-28" />
								<Bar className="mb-2 h-3 w-full" />
								<Bar className="mb-2 h-3 w-[80%]" />
								<Bar className="mt-auto h-3 w-24" />
							</div>
						))}
					</div>
				</div>

				{/* NextSteps — 1 main + 2 supporting cards in sequence */}
				<div className="mb-12">
					<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between">
						<Bar className="h-7 w-52" />
						<Bar className="h-3 w-44" />
					</div>
					<div className="space-y-5">
						{[0, 1, 2].map((i) => (
							<div key={i} className="relative flex gap-4 sm:gap-6">
								{/* Numbered rail (desktop only) */}
								<Bar className="hidden h-11 w-11 shrink-0 rounded-full sm:block" />
								{/* Card body */}
								<div className="flex-1 rounded-2xl border border-edge bg-surface-card p-5 sm:p-7">
									<div className="mb-4 flex items-start justify-between gap-4">
										<div className="flex-1">
											<div className="mb-2 flex items-center gap-2 sm:hidden">
												<Bar className="h-6 w-6 rounded-full" />
												<Bar className="h-2.5 w-16" />
											</div>
											<Bar className="mb-2 h-6 w-[88%]" />
											<Bar className="h-6 w-[60%]" />
										</div>
										<Bar className="h-14 w-24 rounded-lg" />
									</div>
									<Bar className="mb-2 h-2.5 w-32" />
									<Bar className="mb-2 h-4 w-full" />
									<Bar className="mb-2 h-4 w-[92%]" />
									<Bar className="mb-5 h-4 w-[70%]" />
									{/* Procedure */}
									<Bar className="mb-2 h-2.5 w-28" />
									<div className="mb-5 space-y-2">
										<Bar className="h-3.5 w-full" />
										<Bar className="h-3.5 w-[85%]" />
										<Bar className="h-3.5 w-[70%]" />
									</div>
									{/* Chat CTA banner */}
									<Bar className="mb-5 h-14 w-full rounded-xl" />
									{/* Effort + owner row */}
									<div className="mb-4 flex items-center gap-2">
										<Bar className="h-3 w-20" />
										<span className="text-content-faint">·</span>
										<Bar className="h-3 w-24" />
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Copy Lens standalone — mirrors CopyLensRich layout
// ──────────────────────────────────────────────

function CopyLensSkeleton() {
	return (
		<div className="space-y-6">
			{/* Framework chips row */}
			<section>
				<Bar className="mb-3 h-3 w-56" />
				<div className="flex flex-wrap gap-2">
					{Array.from({ length: 5 }).map((_, i) => (
						<div
							key={i}
							className="flex min-w-[120px] flex-col items-center gap-1.5 rounded-xl border border-edge bg-surface-card/50 px-4 py-2.5"
						>
							<Bar className="h-3 w-12" />
							<div className="flex items-center gap-[3px]">
								{Array.from({ length: 4 }).map((__, j) => (
									<span
										key={j}
										className="h-1.5 w-1.5 animate-pulse rounded-full bg-content-faint/40"
									/>
								))}
							</div>
							<Bar className="h-2.5 w-10" />
							<Bar className="h-2 w-14" />
						</div>
					))}
				</div>
			</section>

			{/* Active framework header card */}
			<section className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
				<div className="border-b border-edge/40 pb-4">
					<div className="mb-2 flex items-baseline gap-2">
						<Bar className="h-6 w-32" />
						<Bar className="h-5 w-20 rounded-full" />
					</div>
					<Bar className="mb-2 h-3.5 w-full" />
					<Bar className="mb-3 h-3.5 w-[85%]" />
					<Bar className="h-3 w-[70%]" />
				</div>

				{/* Page selector chips */}
				<div className="mt-4">
					<Bar className="mb-2 h-2.5 w-36" />
					<div className="flex flex-wrap gap-1.5">
						{Array.from({ length: 4 }).map((_, i) => (
							<Bar key={i} className="h-7 w-32 rounded-md" />
						))}
					</div>
				</div>

				{/* Criteria list */}
				<div className="mt-5 space-y-3">
					<div className="flex items-baseline justify-between">
						<Bar className="h-2.5 w-32" />
						<Bar className="h-4 w-14" />
					</div>
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="rounded-xl border border-edge/60 bg-surface-inset/30 p-4"
						>
							<div className="flex items-start gap-3">
								<Bar className="h-5 w-5 shrink-0 rounded-full" />
								<div className="flex-1 space-y-2">
									<div className="flex items-baseline gap-2">
										<Bar className="h-4 w-32" />
										<Bar className="h-3 w-12" />
									</div>
									<Bar className="h-3 w-full" />
									<Bar className="h-3 w-[80%]" />
									<Bar className="mt-2 h-12 w-full rounded-md" />
								</div>
							</div>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}

// ──────────────────────────────────────────────
// Maps standalone — mirrors MapsRich layout
// ──────────────────────────────────────────────

function MapsSkeleton() {
	return (
		<div>
			{/* Purpose statement */}
			<div className="mb-8 max-w-2xl space-y-2">
				<Bar className="h-4 w-full" />
				<Bar className="h-4 w-[88%]" />
			</div>

			{/* Map preview cards */}
			<div className="mb-10">
				<Bar className="mb-3 h-3 w-44" />
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="flex flex-col overflow-hidden rounded-2xl border border-edge bg-surface-card"
						>
							<Bar className="aspect-[16/10] w-full rounded-none rounded-t-2xl" />
							<div className="flex flex-1 flex-col gap-2 p-4">
								<Bar className="h-4 w-36" />
								<Bar className="h-3 w-full" />
								<Bar className="h-3 w-[80%]" />
								<div className="mt-auto flex items-center justify-between pt-2">
									<Bar className="h-3 w-24" />
									<Bar className="h-3 w-12" />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Cycle stats card */}
			<div className="rounded-2xl border border-edge bg-surface-card p-5 sm:p-6">
				<div className="mb-4 flex flex-col items-start gap-1 sm:flex-row sm:items-baseline sm:justify-between">
					<Bar className="h-5 w-56" />
					<Bar className="h-3 w-48" />
				</div>
				<div className="mb-5 grid grid-cols-2 gap-3 border-b border-edge/40 pb-5 sm:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						<div
							key={i}
							className="rounded-xl border border-edge/40 bg-surface-inset/30 p-3"
						>
							<Bar className="mb-1 h-2.5 w-20" />
							<Bar className="mb-1 h-6 w-16" />
							<Bar className="h-2 w-24" />
						</div>
					))}
				</div>
				<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
					<div className="space-y-2">
						<Bar className="mb-1 h-2.5 w-40" />
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i} className="flex justify-between gap-2">
								<Bar className="h-3 w-full" />
								<Bar className="h-3 w-8 shrink-0" />
							</div>
						))}
					</div>
					<div className="space-y-2">
						<Bar className="mb-1 h-2.5 w-32" />
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i}>
								<div className="mb-1 flex justify-between gap-2">
									<Bar className="h-3 w-24" />
									<Bar className="h-3 w-8" />
								</div>
								<Bar className="h-1 w-full" />
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

// ──────────────────────────────────────────────
// Export — single entry that picks the variant
// ──────────────────────────────────────────────

export default function PlanPageSkeleton({
	caption,
	subCaption,
	variant = "plan",
}: Props) {
	if (variant === "copy-lens") {
		return (
			<>
				<CopyLensSkeleton />
				<Captions caption={caption} subCaption={subCaption} />
			</>
		);
	}
	if (variant === "maps") {
		return (
			<>
				<MapsSkeleton />
				<Captions caption={caption} subCaption={subCaption} />
			</>
		);
	}
	return (
		<>
			<PlanSkeleton />
			<Captions caption={caption} subCaption={subCaption} />
		</>
	);
}
