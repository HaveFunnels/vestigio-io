"use client";

import { useMemo } from "react";

// ──────────────────────────────────────────────
// Surface filter pills — Wave 22.5 Tier 3
//
// Lets the operator filter a list (findings, actions) to a specific
// surface (public / authenticated / mixed) without saving a SavedView.
// Renders only when the underlying item set actually contains >=2
// surface kinds — for a single-surface env (the default for new envs)
// the pills would be noise.
//
// Each pill shows the count of items on that surface so the operator
// can immediately see "12 on the marketing site vs 4 in the app"
// instead of having to click each to find out.
// ──────────────────────────────────────────────

export type SurfaceFilterValue = "all" | "public" | "authenticated" | "mixed";

const LABELS: Record<SurfaceFilterValue, string> = {
	all: "Tudo",
	public: "Público",
	authenticated: "Autenticado",
	mixed: "Misto",
};

// Each item just needs to expose a surface_kind getter. Both
// FindingProjection and ActionProjection satisfy this shape (their
// surface_kind: 'public' | 'authenticated' | 'mixed' | 'unknown' | null).
interface SurfaceAware {
	surface_kind?: string | null;
}

interface Props<T extends SurfaceAware> {
	items: T[];
	value: SurfaceFilterValue;
	onChange: (next: SurfaceFilterValue) => void;
}

export default function SurfaceFilterPills<T extends SurfaceAware>({
	items,
	value,
	onChange,
}: Props<T>) {
	const counts = useMemo(() => {
		const c: Record<SurfaceFilterValue, number> = {
			all: items.length,
			public: 0,
			authenticated: 0,
			mixed: 0,
		};
		for (const f of items) {
			// Legacy (pre-Wave-22.5) items carry surface_kind=null. Treat
			// them as Public so they show up under the Public pill,
			// matching the historical default behavior of the engine.
			const k = (f.surface_kind ?? "public") as
				| "public"
				| "authenticated"
				| "mixed";
			if (k in c) c[k]++;
		}
		return c;
	}, [items]);

	// Suppress when only one non-empty surface is present.
	const nonEmpty = (["public", "authenticated", "mixed"] as const).filter(
		(k) => counts[k] > 0,
	);
	if (nonEmpty.length < 2) return null;

	const kinds: SurfaceFilterValue[] = ["all", ...nonEmpty];

	return (
		<div className="mb-4 flex items-center gap-2 flex-wrap" role="tablist">
			{kinds.map((k) => {
				const active = value === k;
				return (
					<button
						key={k}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(k)}
						className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
							active
								? "border-fg-primary bg-fg-primary text-bg-primary"
								: "border-edge bg-surface-card text-fg-secondary hover:bg-surface-card-hover"
						}`}
					>
						<span>{LABELS[k]}</span>
						<span
							className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
								active ? "bg-bg-primary/20" : "bg-bg-elevated text-fg-muted"
							}`}
						>
							{counts[k]}
						</span>
					</button>
				);
			})}
		</div>
	);
}
