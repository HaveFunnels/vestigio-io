// ──────────────────────────────────────────────
// Default dashboard layout
//
// The curated layout every user starts with. When the user has no
// `DashboardLayout` row in the database (Phase 2 onwards), the API
// returns this constant. Phase 1 ships with a static page that
// reads directly from this constant.
//
// **Editing this file is the way to update the default for new
// users.** Existing users with their own saved layouts are NOT
// affected — that's the whole point of per-user persistence.
//
// **Layout coordinate system:**
//   - x, y: position in the 12-column grid (0-indexed)
//   - w, h: width/height in grid units
//   - rowHeight is set on the grid container (80px in Phase 1)
//
// The layout is intentionally compact — 5 widgets that cover the
// hero content. More widgets get added in Phase 4 / from the
// catalog.
// ──────────────────────────────────────────────

export interface WidgetInstance {
	/** Unique per-instance id (different from the widget definition id
	 *  so the same widget could be added twice in the future). */
	instanceId: string;
	/** The widget definition id from the registry */
	defId: string;
	/** Grid position + size */
	x: number;
	y: number;
	w: number;
	h: number;
}

export const DEFAULT_LAYOUT: WidgetInstance[] = [
	// Row 1: hero financial pair (the two big $ numbers)
	{ instanceId: "default-money", defId: "money_recovered_ticker", x: 0, y: 0, w: 8, h: 2 },
	{ instanceId: "default-exposure", defId: "exposure_kpi", x: 8, y: 0, w: 4, h: 2 },

	// Row 2: temporal pair — health trend (wide) + activity heatmap (narrow)
	{ instanceId: "default-health", defId: "health_trend", x: 0, y: 2, w: 8, h: 3 },
	{ instanceId: "default-heatmap", defId: "activity_heatmap", x: 8, y: 2, w: 4, h: 3 },

	// Row 3: narrative — what changed since the last cycle (full width)
	{ instanceId: "default-changed", defId: "what_changed", x: 0, y: 5, w: 12, h: 3 },
];
