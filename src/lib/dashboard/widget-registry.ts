// ──────────────────────────────────────────────
// Widget Registry — single source of truth for dashboard widgets
//
// **The architectural commitment:** every widget that can ever
// appear on the Vestigio overview dashboard is registered here as a
// `WidgetDefinition`. The dashboard page knows nothing about
// individual widgets — it reads the user's saved layout, looks up
// each widget by id in this registry, and renders the matching
// component with the matching data slice.
//
// **Adding a new widget in the future:**
//   1. Create a component in `src/components/console/dashboard/widgets/`
//      that accepts `WidgetProps` and renders something interesting.
//   2. Add a `WidgetDefinition` entry to `WIDGET_REGISTRY` below.
//   3. (If it needs new data) extend `DashboardData` in
//      `src/lib/dashboard/types.ts` and add the source to the
//      backend `/api/dashboard/overview` aggregator.
//
// That's it. Zero changes to the page, the grid engine, the
// catalog, the persistence layer, or the layout serialization
// format. The widget appears in `[+ Add widget]` automatically.
//
// **Why a flat array instead of a Map:** the registry is read-only
// at runtime, lookups are infrequent (only on layout load + on
// catalog open), and the array form is friendlier to inspect in
// devtools and to filter by category for the catalog UI.
// ──────────────────────────────────────────────

import type { ComponentType } from "react";
import type { DashboardData, DashboardDataKey } from "./types";

/** Widget grid size in (col, row) units of the bento layout. */
export interface WidgetSize {
	/** Columns in the 12-col grid */
	w: number;
	/** Rows of `rowHeight` (set on the grid container, default 80px) */
	h: number;
}

/** Catalog grouping — drives the section headers in the Add Widget drawer. */
export type WidgetCategory =
	| "kpi"
	| "trends"
	| "activity"
	| "milestones"
	| "workspaces"
	| "actions";

/**
 * Props every widget receives. The `data` field is the FULL
 * DashboardData payload — widgets are expected to destructure only
 * the slice they care about. The page guarantees that every key
 * declared in `dataKeys` will be present (or in a documented
 * loading/empty state).
 */
export interface WidgetProps {
	data: DashboardData;
	/** Whether the dashboard is currently in edit mode (Phase 3) */
	editing: boolean;
	/** Per-instance id — different from the definition id when the
	 *  same widget definition appears twice in the layout (e.g. two
	 *  exposure cards filtered to different packs in the future). */
	instanceId: string;
}

export interface WidgetDefinition {
	/** Stable identifier — NEVER change after a widget ships. Saved layouts reference this. */
	id: string;
	/** Internal version — bump when the data shape consumed by this widget changes,
	 *  so layout migrations can detect older saved layouts and adapt. */
	version: number;
	/** i18n key under console.dashboard.widgets — resolves to the display name */
	nameKey: string;
	/** i18n key for the one-line catalog description */
	descriptionKey: string;
	/** Catalog grouping */
	category: WidgetCategory;
	/** Phosphor icon name (kebab-case) used in the catalog tile */
	icon: string;
	/** Default size when the widget is added to the dashboard */
	defaultSize: WidgetSize;
	/** Minimum allowed size when the user resizes (Phase 3) */
	minSize: WidgetSize;
	/** Maximum allowed size when the user resizes (Phase 3) */
	maxSize: WidgetSize;
	/** Whether the user can resize this widget at all */
	resizable: boolean;
	/** Whether the user can remove this widget from their dashboard.
	 *  Set to false for hero elements that always exist (Money Recovered). */
	removable: boolean;
	/** Whether to surface this widget in the [+ Add Widget] catalog.
	 *  Set to false for special hidden widgets (e.g. one-time onboarding cards). */
	inCatalog: boolean;
	/** Which slices of `DashboardData` this widget reads. The grid
	 *  engine collects these across active widgets to build the
	 *  batched server query. */
	dataKeys: ReadonlyArray<DashboardDataKey>;
	/** The component itself. Must be a "use client" component. */
	Component: ComponentType<WidgetProps>;
}

// ── The registry ──
//
// Populated below by importing each widget file and pushing its
// definition. Phase 1 starts with 5 widgets; Phase 2/3/etc add more.
// Order in this array doesn't matter — layouts reference widgets by
// `id`, not by index.

const widgetDefinitions: WidgetDefinition[] = [];

export function registerWidget(def: WidgetDefinition): void {
	const existing = widgetDefinitions.find((w) => w.id === def.id);
	if (existing) {
		console.warn(`[widget-registry] duplicate registration for "${def.id}" — ignoring second copy`);
		return;
	}
	widgetDefinitions.push(def);
}

export function getWidgetDef(id: string): WidgetDefinition | undefined {
	return widgetDefinitions.find((w) => w.id === id);
}

export function listWidgets(): ReadonlyArray<WidgetDefinition> {
	return widgetDefinitions;
}

export function listWidgetsByCategory(category: WidgetCategory): ReadonlyArray<WidgetDefinition> {
	return widgetDefinitions.filter((w) => w.category === category);
}

export function listCatalogWidgets(): ReadonlyArray<WidgetDefinition> {
	return widgetDefinitions.filter((w) => w.inCatalog);
}

// NOTE: this module is intentionally kept pure — it does NOT import
// the widget components. Initialization (registering each widget)
// is done by importing `@/lib/dashboard/init` from any consumer
// (the page, the catalog, an API route). That avoids a circular
// import between registry and widget modules.
