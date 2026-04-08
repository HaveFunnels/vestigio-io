"use client";

// ──────────────────────────────────────────────
// DashboardHeader — page title row + (future) Customize button
//
// Phase 1 ships a minimal header: just the page title and a
// disabled `Customize` button as a placeholder so the user can
// see where customization will land. Phase 3 wires the button up
// to toggle edit mode.
// ──────────────────────────────────────────────

import { Sliders } from "@phosphor-icons/react/dist/ssr";

interface DashboardHeaderProps {
	editing?: boolean;
	onToggleEdit?: () => void;
}

export function DashboardHeader({ editing = false, onToggleEdit }: DashboardHeaderProps) {
	return (
		<div className="mb-6 flex items-center justify-between">
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-semibold tracking-tight text-content">
					Dashboard
				</h1>
				<p className="text-xs text-content-muted">
					Your overview of revenue health, exposure, and recent activity.
				</p>
			</div>
			<button
				type="button"
				onClick={onToggleEdit}
				disabled={!onToggleEdit}
				className="flex items-center gap-2 rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:border-emerald-600/50 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<Sliders size={14} weight="bold" />
				<span>{editing ? "Done" : "Customize"}</span>
			</button>
		</div>
	);
}
