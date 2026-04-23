"use client";

// ──────────────────────────────────────────────
// DashboardGrid — the bento layout engine
//
// Wraps `react-grid-layout` v2 and renders each widget instance from
// the user's saved layout. Phase 1 was view-only; Phase 3 wires
// drag/resize/remove via callbacks back to the parent shell:
//
//   - `onLayoutChange(next)` fires when react-grid-layout reports a
//     drag or resize complete. We translate the v2 `Layout` back into
//     `WidgetInstance[]` so the parent doesn't have to know about
//     the grid library's internal types.
//   - `onRemove(instanceId)` fires when the user clicks the X on a
//     removable widget while editing.
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

import {
	DotsSixVerticalIcon as DotsSixVertical,
	XIcon as X,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { getWidgetDef } from "@/lib/dashboard/init";
import type { DashboardData } from "@/lib/dashboard/types";
import type { WidgetInstance } from "@/lib/dashboard/default-layout";

interface DashboardGridProps {
	instances: WidgetInstance[];
	data: DashboardData;
	editing?: boolean;
	onLayoutChange?: (next: WidgetInstance[]) => void;
	onRemove?: (instanceId: string) => void;
}

export function DashboardGrid({
	instances,
	data,
	editing = false,
	onLayoutChange,
	onRemove,
}: DashboardGridProps) {
	const t = useTranslations("console.dashboard");
	// `useContainerWidth` measures the wrapper div via ResizeObserver
	// and re-renders the grid whenever the width changes. The
	// `mounted` flag suppresses the initial render until the real
	// width is known so the grid never paints with the default 1280px
	// before snapping to the actual container.
	const { width, containerRef, mounted } = useContainerWidth();

	// Convert WidgetInstance[] → react-grid-layout's `Layout` (which
	// is just `readonly LayoutItem[]`). Static + drag/resize toggles
	// live per-item so we can lock the page in view mode and unlock
	// individual widgets in edit mode based on the registry's
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
	const mdLayout: Layout = instances.map(
		(inst, idx): LayoutItem => ({
			i: inst.instanceId,
			x: 0,
			y: idx * 3,
			w: 8,
			h: inst.h,
			static: true,
			isResizable: false,
			isDraggable: false,
		})
	);

	const mobileOrder = [
		"default-money",
		"default-exposure",
		"default-critical",
		"default-changed",
		"default-health",
		"default-heatmap",
		"default-streak",
		"default-verification",
		"default-toppack",
	];
	const sortedForMobile = [...instances].sort((a, b) => {
		const ai = mobileOrder.indexOf(a.instanceId);
		const bi = mobileOrder.indexOf(b.instanceId);
		return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
	});
	const mobileHeightOverrides: Record<string, number> = {
		"default-changed": 8,
		"default-streak": 2,
		"default-verification": 2,
		"default-toppack": 2,
	};
	let cumulativeY = 0;
	const smLayout: Layout = sortedForMobile.map(
		(inst): LayoutItem => {
			const h = mobileHeightOverrides[inst.instanceId] ?? inst.h;
			const item: LayoutItem = {
				i: inst.instanceId,
				x: 0,
				y: cumulativeY,
				w: 1,
				h,
				static: true,
				isResizable: false,
				isDraggable: false,
			};
			cumulativeY += h;
			return item;
		}
	);

	// Translate the grid's Layout back into WidgetInstance[] so the
	// parent shell can persist + re-render. We MUST preserve the
	// original `defId` (the grid only knows about `i` = instanceId).
	const handleLayoutChange = (next: Layout) => {
		if (!onLayoutChange) return;
		const byId = new Map(instances.map((inst) => [inst.instanceId, inst]));
		const updated: WidgetInstance[] = next
			.map((item): WidgetInstance | null => {
				const original = byId.get(item.i);
				if (!original) return null;
				return {
					instanceId: original.instanceId,
					defId: original.defId,
					x: item.x,
					y: item.y,
					w: item.w,
					h: item.h,
				};
			})
			.filter((x): x is WidgetInstance => x !== null);

		// Skip the noop callbacks that react-grid-layout fires on mount
		// before any user interaction (would otherwise trigger a save).
		const sameAsCurrent =
			updated.length === instances.length &&
			updated.every((u, i) => {
				const a = instances[i];
				return (
					a &&
					a.instanceId === u.instanceId &&
					a.x === u.x &&
					a.y === u.y &&
					a.w === u.w &&
					a.h === u.h
				);
			});
		if (sameAsCurrent) return;

		onLayoutChange(updated);
	};

	return (
		<div ref={containerRef} className='w-full'>
			{mounted && (
				<Responsive
					className='dashboard-grid'
					width={width}
					layouts={{ lg: lgLayout, md: mdLayout, sm: smLayout }}
					breakpoints={{ lg: 1200, md: 996, sm: 0 }}
					cols={{ lg: 12, md: 8, sm: 1 }}
					rowHeight={80}
					margin={[14, 14]}
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
					onLayoutChange={handleLayoutChange}
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
									<div className='flex h-full items-center justify-center rounded-2xl border border-dashed border-edge bg-surface-card/30 p-4 text-xs text-content-faint'>
										{t("widget_unavailable", { id: inst.defId })}
									</div>
								</div>
							);
						}
						const Widget = def.Component;
						const showRemove = editing && def.removable && onRemove;
						return (
							<div
								key={inst.instanceId}
								className={`dashboard-widget group relative overflow-hidden rounded-2xl border bg-surface-card shadow-lg transition-all ${
									editing
										? "editing-mode border-emerald-500/50 ring-1 ring-emerald-500/10 hover:border-emerald-500/80 hover:ring-emerald-500/20"
										: "border-edge"
								}`}
							>
								{/* Edit-mode chrome: drag handle bar + remove button.
								    Both only render when `editing` so the view-mode
								    card stays clean. The drag handle uses the class
								    `widget-drag-handle` which matches dragConfig.handle
								    above — clicking anywhere else on the widget does
								    NOT initiate a drag, so widgets remain interactive.

								    Tints use emerald-500 with low opacity so they read
								    correctly in BOTH light and dark themes (vs the
								    older emerald-950 variants which only worked dark). */}
								{editing && (
									<>
										<div
											className='widget-drag-handle absolute inset-x-0 top-0 z-10 flex cursor-grab items-center justify-center gap-1 border-b border-emerald-500/20 bg-emerald-500/[0.08] py-1 text-[10px] text-emerald-600 backdrop-blur-sm active:cursor-grabbing dark:text-emerald-300'
											title={t("drag_to_rearrange")}
										>
											<DotsSixVertical size={12} weight='bold' />
											<span className='font-medium uppercase tracking-wider'>
												{def.id.replaceAll("_", " ")}
											</span>
										</div>
										{showRemove && (
											<button
												type='button'
												onClick={() => onRemove(inst.instanceId)}
												className='absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-500 opacity-0 backdrop-blur-sm transition-opacity hover:bg-red-500/25 hover:text-red-600 group-hover:opacity-100 dark:text-red-300 dark:hover:text-red-100'
												title={t("remove_widget")}
												aria-label={t("remove_widget")}
											>
												<X size={12} weight='bold' />
											</button>
										)}
									</>
								)}

								{/* Push real widget content down when the drag handle
								    bar is visible so it doesn't overlap headlines. */}
								<div className={editing ? "h-full pt-5" : "h-full"}>
									<Widget
										data={data}
										editing={editing}
										instanceId={inst.instanceId}
									/>
								</div>
							</div>
						);
					})}
				</Responsive>
			)}
		</div>
	);
}
