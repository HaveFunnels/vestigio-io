"use client";

// ──────────────────────────────────────────────
// DashboardHeader — page title + edit-mode controls
//
// Three states:
//
//   - View mode: title + "Customize" button
//   - Edit mode (idle): title + "[+ Add Widget]" + "Done"
//   - Edit mode (saving / saved / error): also shows a small status
//     pip next to Done so users know their work persisted
//
// Save status pip is intentionally subtle (10px text, faint colors)
// — the save itself is debounced + optimistic so the user almost
// never sees anything but `idle`. The pip exists for the case where
// the network is bad and silent failures would be terrifying.
// ──────────────────────────────────────────────

import {
	PlusIcon as Plus,
	SlidersIcon as Sliders,
	CheckCircleIcon as CheckCircle,
	WarningIcon as Warning,
	CircleNotchIcon as CircleNotch,
} from "@phosphor-icons/react/dist/ssr";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface DashboardHeaderProps {
	editing?: boolean;
	onToggleEdit?: () => void;
	onOpenCatalog?: () => void;
	saveStatus?: SaveStatus;
}

export function DashboardHeader({
	editing = false,
	onToggleEdit,
	onOpenCatalog,
	saveStatus = "idle",
}: DashboardHeaderProps) {
	return (
		<div className='mb-6 flex items-center justify-between'>
			<div className='flex flex-col gap-1'>
				<h1 className='text-2xl font-semibold tracking-tight text-content'>
					Dashboard
				</h1>
				<p className='text-xs text-content-muted'>
					{editing
						? "Drag widgets to rearrange. Resize from the corner. Add or remove from the catalog."
						: "Your overview of revenue health, exposure, and recent activity."}
				</p>
			</div>

			<div className='flex items-center gap-2'>
				{editing && <SaveStatusPip status={saveStatus} />}
				{editing && onOpenCatalog && (
					<button
						type='button'
						onClick={onOpenCatalog}
						className='flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:border-emerald-500 hover:bg-emerald-500/15 dark:text-emerald-300'
					>
						<Plus size={14} weight='bold' />
						<span>Add widget</span>
					</button>
				)}
				<button
					type='button'
					onClick={onToggleEdit}
					disabled={!onToggleEdit}
					className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
						editing
							? "border-emerald-500 bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 dark:text-emerald-950 dark:hover:bg-emerald-400"
							: "border-edge text-content-muted hover:border-emerald-500/60 hover:bg-emerald-500/5 hover:text-emerald-600 dark:hover:text-emerald-400"
					}`}
				>
					<Sliders size={14} weight='bold' />
					<span>{editing ? "Done" : "Customize"}</span>
				</button>
			</div>
		</div>
	);
}

function SaveStatusPip({ status }: { status: SaveStatus }) {
	if (status === "idle") return null;
	if (status === "saving") {
		return (
			<span className='flex items-center gap-1.5 text-[10px] text-content-faint'>
				<CircleNotch size={11} className='animate-spin' />
				Saving…
			</span>
		);
	}
	if (status === "saved") {
		return (
			<span className='flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400'>
				<CheckCircle size={11} weight='fill' />
				Saved
			</span>
		);
	}
	return (
		<span className='flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400'>
			<Warning size={11} weight='fill' />
			Save failed
		</span>
	);
}
