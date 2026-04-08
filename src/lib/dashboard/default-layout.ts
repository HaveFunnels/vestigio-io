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
//   - rowHeight is set on the grid container (80px)
//
// Phase 4 user-feedback restructure — constraints driving this shape:
//
//   1. The TOP ROW must always be Money / Exposure / Critical, in
//      that order. These are the user's "did I make money / am I
//      losing money / is anything on fire" hero stats.
//   2. Cards must justify their size — no card should leave large
//      empty whitespace just for visual balance. The widget content
//      itself was tightened (smaller padding, no caption strips on
//      compact tiles) so widgets can shrink to their natural size.
//   3. ActivityHeatmap is half-width (w=6) instead of the previous
//      full-width strip — denser, less wasted vertical space.
//   4. Drop TopPack from the top of the grid; the per-pack drill
//      down is now INSIDE ExposureKpiCard so the segmented bar's
//      color → pack mapping is finally explicit. TopPack stays as
//      a small w=2 tile in the bottom KPI row.
//
//   ┌────────┬──────────────┬────────┐
//   │ Money  │  Exposure    │Critical│   row 0-2 (h=3)
//   │ w=4    │  w=5         │ w=3    │
//   ├────────┴──────┬───────┴────────┤
//   │ Health        │ WhatChanged    │   row 3-6 (h=4)
//   │ w=6           │ w=6            │
//   ├───────────────┼─────┬────┬────┤
//   │ Heatmap       │Strk │Verf│Top │   row 7-9 (h=3)
//   │ w=6           │w=2  │w=2 │w=2 │
//   └───────────────┴─────┴────┴────┘
//
// Total: 10 row units. With rowHeight=80 and margin=14, the dashboard
// renders in ~944px — close to a single screen on a standard 1080p
// laptop without scrolling.
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
	// ── Row 0-2 (h=3): hero strip — mandatory order ──
	{
		instanceId: "default-money",
		defId: "money_recovered_ticker",
		x: 0,
		y: 0,
		w: 4,
		h: 3,
	},
	{
		instanceId: "default-exposure",
		defId: "exposure_kpi",
		x: 4,
		y: 0,
		w: 5,
		h: 3,
	},
	{
		instanceId: "default-critical",
		defId: "open_critical_kpi",
		x: 9,
		y: 0,
		w: 3,
		h: 3,
	},

	// ── Row 3-6 (h=4): trends + change report ──
	{
		instanceId: "default-health",
		defId: "health_trend",
		x: 0,
		y: 3,
		w: 6,
		h: 4,
	},
	{
		instanceId: "default-changed",
		defId: "what_changed",
		x: 6,
		y: 3,
		w: 6,
		h: 4,
	},

	// ── Row 7-9 (h=3): heatmap + compact KPI tiles ──
	{
		instanceId: "default-heatmap",
		defId: "activity_heatmap",
		x: 0,
		y: 7,
		w: 6,
		h: 3,
	},
	{
		instanceId: "default-streak",
		defId: "streak_kpi",
		x: 6,
		y: 7,
		w: 2,
		h: 3,
	},
	{
		instanceId: "default-verification",
		defId: "verification_rate_kpi",
		x: 8,
		y: 7,
		w: 2,
		h: 3,
	},
	{
		instanceId: "default-toppack",
		defId: "top_pack_kpi",
		x: 10,
		y: 7,
		w: 2,
		h: 3,
	},
];
