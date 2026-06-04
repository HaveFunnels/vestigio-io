"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { XIcon } from "@phosphor-icons/react/dist/ssr";
import type { WorkspaceProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// SurfaceFilterStrip — Wave-22.6 review fix P3.2
//
// Sits above the perspective cards on /app/workspaces and lets the
// operator pivot from "fix-by-discipline" to "fix-this-surface".
// Counts come from the workspaces' finding lists. URL state lives on
// the parent (?surface=…) so the chip is shareable.
//
// Hidden when there are < 2 distinct surfaces — no value in a filter
// that only has one option.
// ──────────────────────────────────────────────

interface Props {
	workspaces: WorkspaceProjection[];
	value: string | null;
	onChange: (next: string | null) => void;
}

const MAX_VISIBLE = 6;

export default function SurfaceFilterStrip({ workspaces, value, onChange }: Props) {
	const locale = useLocale();
	const isPt = locale.startsWith("pt");

	const surfaces = useMemo(() => {
		const counts = new Map<string, number>();
		for (const ws of workspaces) {
			for (const f of ws.findings) {
				const list = (f.surface ?? "")
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
				const seenInThisFinding = new Set<string>();
				for (const s of list) {
					if (seenInThisFinding.has(s)) continue;
					seenInThisFinding.add(s);
					counts.set(s, (counts.get(s) ?? 0) + 1);
				}
			}
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, MAX_VISIBLE);
	}, [workspaces]);

	if (surfaces.length < 2) return null;

	return (
		<section className="mb-5 flex flex-wrap items-center gap-2">
			<div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
				{isPt ? "Foco em" : "Focus on"}
			</div>
			{surfaces.map(([s, n]) => {
				const isActive = value === s;
				return (
					<button
						key={s}
						onClick={() => onChange(isActive ? null : s)}
						className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
							isActive
								? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
								: "border-edge bg-surface-card text-content-muted hover:border-edge-focus hover:text-content"
						}`}
					>
						<span className="max-w-[180px] truncate">{s}</span>
						<span className="tabular-nums text-content-faint">{n}</span>
					</button>
				);
			})}
			{value && (
				<button
					onClick={() => onChange(null)}
					aria-label={isPt ? "Limpar filtro" : "Clear filter"}
					title={isPt ? "Limpar filtro" : "Clear filter"}
					className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-edge text-content-faint transition-colors hover:border-edge-focus hover:text-content"
				>
					<XIcon size={11} weight="bold" />
				</button>
			)}
		</section>
	);
}
