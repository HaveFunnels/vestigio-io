"use client";

// ──────────────────────────────────────────────
// DashboardGrid — the bento layout engine
//
// Wraps `react-grid-layout` v2 and renders each widget instance
// from the user's saved layout. Phase 1 ships with `isDraggable`
// and `isResizable` set to false so the page is read-only — Phase 3
// flips those flags into edit mode.
//
// **Why react-grid-layout v2:** purpose-built for dashboard layouts,
// has native drag/resize/snap, JSON serialization, and responsive
// breakpoints. v2 replaced the v1 `WidthProvider` HOC with a
// `useContainerWidth` hook — slightly different API but the same
// idea: measure the container, pass the width to the grid.
//
// The grid uses 12 columns at desktop (`lg`), collapses to 8 at
// tablet, and to 1 at mobile so widgets stack vertically and stay
// fully usable on phones (where users only view, never customize).
// ──────────────────────────────────────────────

import {
	Responsive,
	useContainerWidth,
	verticalCompactor,
	type Layout,
	type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { getWidgetDef } from "@/lib/dashboard/init";
import type { DashboardData } from "@/lib/dashboard/types";
import type { WidgetInstance } from "@/lib/dashboard/default-layout";

interface DashboardGridProps {
	instances: WidgetInstance[];
	data: DashboardData;
	editing?: boolean;
}

export function DashboardGrid({ instances, data, editing = false }: DashboardGridProps) {
	// `useContainerWidth` measures the wrapper div via ResizeObserver
	// and re-renders the grid whenever the width changes. The
	// `mounted` flag suppresses the initial render until the real
	// width is known so the grid never paints with the default 1280px
	// before snapping to the actual container.
	const { width, containerRef, mounted } = useContainerWidth();

	// Convert WidgetInstance[] → react-grid-layout's `Layout` (which
	// is just `readonly LayoutItem[]`). Static + drag/resize toggles
	// live per-item so we can lock the page in Phase 1 and unlock
	// individual widgets in Phase 3 based on the registry's
	// `resizable` / `removable` flags.
	const lgLayout: Layout = instances.map((inst): LayoutItem => {
		const def = getWidgetDef(inst.defId);
		return {
			i: inst.instanceId,
			x: inst.x,
			y: inst.y,
			w: inst.w,
			h: inst.h,
			minW: def?.minSize.w ?? 1,
			minH: def?.minSize.h ?? 1,
			maxW: def?.maxSize.w,
			maxH: def?.maxSize.h,
			static: !editing,
			isResizable: editing && (def?.resizable ?? false),
			isDraggable: editing,
		};
	});

	// Mobile/tablet layouts — flatten so widgets stack vertically.
	// Same `i` keys across all breakpoints so react-grid-layout can
	// reflow correctly when the user resizes the window.
	const mdLayout: Layout = instances.map((inst, idx): LayoutItem => ({
		i: inst.instanceId,
		x: 0,
		y: idx * 3,
		w: 8,
		h: inst.h,
		static: true,
		isResizable: false,
		isDraggable: false,
	}));

	const smLayout: Layout = instances.map((inst, idx): LayoutItem => ({
		i: inst.instanceId,
		x: 0,
		y: idx * 3,
		w: 1,
		h: inst.h,
		static: true,
		isResizable: false,
		isDraggable: false,
	}));

	return (
		<div ref={containerRef} className="w-full">
			{mounted && (
				<Responsive
					className="dashboard-grid"
					width={width}
					layouts={{ lg: lgLayout, md: mdLayout, sm: smLayout }}
					breakpoints={{ lg: 1200, md: 996, sm: 0 }}
					cols={{ lg: 12, md: 8, sm: 1 }}
					rowHeight={80}
					margin={[16, 16]}
					containerPadding={[0, 0]}
					compactor={verticalCompactor}
					dragConfig={{
						enabled: editing,
						bounded: false,
						handle: ".widget-drag-handle",
						threshold: 3,
					}}
					resizeConfig={{
						enabled: editing,
						handles: ["se"],
					}}
				>
					{instances.map((inst) => {
						const def = getWidgetDef(inst.defId);
						if (!def) {
							// Defensive — saved layout references a widget id
							// that no longer exists in the registry (e.g.
							// user upgraded across a deprecation). Render a
							// placeholder so the grid doesn't crash and the
							// user notices.
							return (
								<div key={inst.instanceId}>
									<div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-edge bg-surface-card/30 p-4 text-xs text-content-faint">
										Widget &quot;{inst.defId}&quot; no longer available
									</div>
								</div>
							);
						}
						const Widget = def.Component;
						return (
							<div
								key={inst.instanceId}
								className="dashboard-widget overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-[0_20px_40px_-15px_rgba(0,0,0,0.35)]"
							>
								<Widget data={data} editing={editing} instanceId={inst.instanceId} />
							</div>
						);
					})}
				</Responsive>
			)}
		</div>
	);
}
