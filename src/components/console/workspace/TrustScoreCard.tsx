"use client";

/**
 * TrustScoreCard — Renders the TrustSurfaceScore composite as a grade card.
 *
 * Grade (A-F), score (0-10), passing/failing checks as compact lists.
 * The score is derived from findings: positive = passing, negative = failing.
 * Pure frontend derivation — no new engine data needed.
 */

import type { FindingProjection } from "../../../../packages/projections/types";

interface Props {
	findings: FindingProjection[];
	/** Optional: only show findings matching these packs */
	filterPacks?: string[];
}

function scoreToGrade(score: number): { letter: string; color: string } {
	if (score >= 9) return { letter: "A", color: "text-emerald-400" };
	if (score >= 7) return { letter: "B", color: "text-emerald-400" };
	if (score >= 5) return { letter: "C", color: "text-amber-400" };
	if (score >= 3) return { letter: "D", color: "text-orange-400" };
	return { letter: "F", color: "text-red-400" };
}

export default function TrustScoreCard({ findings, filterPacks }: Props) {
	const relevant = filterPacks
		? findings.filter((f) => filterPacks.includes(f.pack))
		: findings;

	const passing = relevant.filter((f) => f.polarity === "positive");
	const failing = relevant.filter((f) => f.polarity === "negative");
	const total = passing.length + failing.length;
	if (total === 0) return null;

	const score = Math.round((passing.length / total) * 10);
	const { letter, color } = scoreToGrade(score);
	const barWidth = (score / 10) * 100;

	return (
		<div className="rounded-lg border border-edge bg-surface-card/40 p-3">
			{/* Grade + score */}
			<div className="flex items-center gap-3 mb-3">
				<div className={`text-2xl font-bold ${color}`}>{letter}</div>
				<div className="flex-1">
					<div className="flex items-baseline gap-1">
						<span className="text-sm font-semibold text-content">{score}</span>
						<span className="text-[10px] text-content-faint">/10</span>
					</div>
					<div className="mt-1 h-1.5 w-full rounded-full bg-surface-inset">
						<div
							className={`h-full rounded-full transition-all ${score >= 7 ? "bg-emerald-500" : score >= 5 ? "bg-amber-500" : "bg-red-500"}`}
							style={{ width: `${barWidth}%` }}
						/>
					</div>
				</div>
			</div>

			{/* Passing checks */}
			{passing.length > 0 && (
				<div className="mb-2">
					<span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
						Passing ({passing.length})
					</span>
					<ul className="mt-1 space-y-0.5">
						{passing.slice(0, 5).map((f) => (
							<li key={f.id} className="flex items-center gap-1.5 text-[11px] text-content-muted">
								<svg className="h-2.5 w-2.5 text-emerald-500" viewBox="0 0 16 16" fill="none">
									<path d="M13.25 4.75L6 12 2.75 8.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
								<span className="truncate">{f.title}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Failing checks */}
			{failing.length > 0 && (
				<div>
					<span className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
						Failing ({failing.length})
					</span>
					<ul className="mt-1 space-y-0.5">
						{failing.slice(0, 5).map((f) => (
							<li key={f.id} className="flex items-center gap-1.5 text-[11px] text-content-muted">
								<svg className="h-2.5 w-2.5 text-red-500" viewBox="0 0 16 16" fill="none">
									<path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
								</svg>
								<span className="truncate">{f.title}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
