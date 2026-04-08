"use client";

// ──────────────────────────────────────────────
// DashboardShell — Phase 3 client wrapper
//
// Owns the editable state of the dashboard:
//
//   - `instances`: the live WidgetInstance[] (drag/resize/add/remove
//     all mutate this; the grid renders directly from it).
//   - `editing`: whether the user is in edit mode.
//   - `catalogOpen`: whether the [+ Add Widget] drawer is visible.
//   - `saveStatus`: idle | saving | saved | error — used for the
//     little status pip near the Done button so users know their
//     work is persisted.
//
// **Why a client wrapper:** the dashboard page is a Server Component
// that fetches the initial data + layout once. Edit mode requires
// React state, debounced server saves, and DOM event handlers — all
// client concerns. Keeping the shell separate lets the page stay
// fast (no JS until the user clicks Customize).
//
// **Save flow:** every mutation (drag, resize, add, remove) sets
// `instances` immediately and schedules a debounced PUT. We never
// block the UI on the network — if the save fails the indicator
// flips to error and the user can retry by toggling the Customize
// button. The saved layout on the server is always slightly behind
// the visible layout, never ahead, so a refresh during save just
// shows the most recently persisted state (worst case: a few
// seconds of work lost). This is the right trade-off for a layout
// editor where every drop is a tiny commit.
// ──────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardGrid } from "./DashboardGrid";
import { DashboardHeader, type SaveStatus } from "./DashboardHeader";
import { CatalogDrawer } from "./CatalogDrawer";
import {
	DEFAULT_LAYOUT,
	type WidgetInstance,
} from "@/lib/dashboard/default-layout";
import type { DashboardData } from "@/lib/dashboard/types";

interface DashboardShellProps {
	initialInstances: WidgetInstance[];
	data: DashboardData;
	/** When true, save attempts hit the API. Demo orgs may want to
	 *  disable this if we ever decide their layout shouldn't persist. */
	persistEnabled?: boolean;
}

const SAVE_DEBOUNCE_MS = 800;

export function DashboardShell({
	initialInstances,
	data,
	persistEnabled = true,
}: DashboardShellProps) {
	const [instances, setInstances] =
		useState<WidgetInstance[]>(initialInstances);
	const [editing, setEditing] = useState(false);
	const [catalogOpen, setCatalogOpen] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

	// Debounce timer + abort controller so rapid drags don't create
	// a queue of in-flight requests.
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inFlight = useRef<AbortController | null>(null);

	// ── Save side-effect ──
	const persistLayout = useCallback(
		(next: WidgetInstance[]) => {
			if (!persistEnabled) return;
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(async () => {
				if (inFlight.current) inFlight.current.abort();
				const controller = new AbortController();
				inFlight.current = controller;
				setSaveStatus("saving");
				try {
					const res = await fetch("/api/dashboard/layout", {
						method: "PUT",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ layout: next }),
						signal: controller.signal,
					});
					if (!res.ok) throw new Error(`save failed: ${res.status}`);
					setSaveStatus("saved");
					// Clear the "saved" pip after a moment so it doesn't stick.
					setTimeout(
						() => setSaveStatus((s) => (s === "saved" ? "idle" : s)),
						1500
					);
				} catch (err) {
					if ((err as Error).name === "AbortError") return;
					console.warn("[dashboard/shell] save failed", err);
					setSaveStatus("error");
				}
			}, SAVE_DEBOUNCE_MS);
		},
		[persistEnabled]
	);

	// Cleanup on unmount so we don't fire after navigation.
	useEffect(() => {
		return () => {
			if (saveTimer.current) clearTimeout(saveTimer.current);
			if (inFlight.current) inFlight.current.abort();
		};
	}, []);

	// ── Mutations ──
	// Each mutation produces the next instances array, then commits
	// it to state and schedules a save. Wrapped so the children can
	// stay dumb about persistence.
	const handleLayoutChange = useCallback(
		(next: WidgetInstance[]) => {
			setInstances(next);
			persistLayout(next);
		},
		[persistLayout]
	);

	const handleRemove = useCallback(
		(instanceId: string) => {
			setInstances((prev) => {
				const next = prev.filter((inst) => inst.instanceId !== instanceId);
				persistLayout(next);
				return next;
			});
		},
		[persistLayout]
	);

	const handleAdd = useCallback(
		(defId: string, defaultSize: { w: number; h: number }) => {
			setInstances((prev) => {
				// Place new widget at the bottom of the grid by setting y to
				// max(y + h) + 1. react-grid-layout's vertical compactor will
				// then snap it up to the first empty slot at the next compaction.
				const maxY = prev.reduce((acc, i) => Math.max(acc, i.y + i.h), 0);
				const newInst: WidgetInstance = {
					instanceId: `inst-${defId}-${Date.now().toString(36)}`,
					defId,
					x: 0,
					y: maxY,
					w: defaultSize.w,
					h: defaultSize.h,
				};
				const next = [...prev, newInst];
				persistLayout(next);
				return next;
			});
		},
		[persistLayout]
	);

	const handleToggleEdit = useCallback(() => {
		setEditing((prev) => {
			const next = !prev;
			// Closing edit mode also closes the catalog so the user
			// returns to the clean view-only dashboard.
			if (!next) setCatalogOpen(false);
			return next;
		});
	}, []);

	const handleReset = useCallback(() => {
		// Confirm before discarding the user's customization. The
		// browser confirm is intentionally low-effort here — Phase 5
		// can replace it with a styled modal if the friction matters.
		if (
			typeof window !== "undefined" &&
			!window.confirm("Reset dashboard to default layout?")
		) {
			return;
		}
		setInstances(DEFAULT_LAYOUT);
		persistLayout(DEFAULT_LAYOUT);
		setCatalogOpen(false);
	}, [persistLayout]);

	return (
		<>
			<DashboardHeader
				editing={editing}
				onToggleEdit={handleToggleEdit}
				onOpenCatalog={editing ? () => setCatalogOpen(true) : undefined}
				saveStatus={saveStatus}
			/>
			<DashboardGrid
				instances={instances}
				data={data}
				editing={editing}
				onLayoutChange={handleLayoutChange}
				onRemove={handleRemove}
			/>
			<CatalogDrawer
				open={catalogOpen}
				onClose={() => setCatalogOpen(false)}
				onAdd={handleAdd}
				existingDefIds={new Set(instances.map((i) => i.defId))}
				onReset={handleReset}
			/>
		</>
	);
}
