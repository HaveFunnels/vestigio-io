// ──────────────────────────────────────────────
// Dashboard registry initialization
//
// Importing this module triggers the side-effect imports of every
// dashboard widget, which in turn call `registerWidget()` on the
// (otherwise empty) registry. Any consumer that needs the registry
// populated must import this file at least once before reading from
// it — typically the dashboard page does so at the top.
//
// **Why a separate init file:** keeps `widget-registry.ts` pure
// (no React component imports), avoids the circular dependency
// between registry and widget modules, and gives a single
// well-known entry point for cold-start ordering.
// ──────────────────────────────────────────────

import "@/components/console/dashboard/widgets";

// Re-export the registry helpers so callers can do
//   `import { listCatalogWidgets, getWidgetDef } from "@/lib/dashboard/init"`
// and be sure the registry is populated before they read from it.
export {
	getWidgetDef,
	listWidgets,
	listWidgetsByCategory,
	listCatalogWidgets,
} from "./widget-registry";

export type {
	WidgetDefinition,
	WidgetProps,
	WidgetSize,
	WidgetCategory,
} from "./widget-registry";
