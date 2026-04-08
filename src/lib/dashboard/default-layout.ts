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

// Layout shape — 3 vertical columns with asymmetric widths and
// vertically-stacked widgets of varying heights inside each column,
// plus a full-width activity heatmap as the bottom strip.
//
//   Col A (w=4) — narrative          [MoneyRecovered hero, HealthTrend]
//   Col B (w=5) — analytic detail    [WhatChanged, Exposure]
//   Col C (w=3) — compact KPI strip  [4 liquid-glass tiles]
//   Bottom (w=12) — wide heatmap strip
//
// react-grid-layout's vertical compactor packs each column
// independently, so the masonry feel comes from setting distinct
// heights — not from forcing y-alignment. Each column targets
// ~11 row units of height; the heatmap then takes 4 more rows
// underneath, giving a ~15-row total dashboard.
//
// **Why this shape and not 4+4+4:** the central detail column
// (WhatChanged + Exposure) carries the most information density
// per unit width, so it earns the widest slot. The narrative
// column carries the hero and trend, both of which look better
// tall+narrow than wide+short. The KPI strip stays compact so the
// liquid-glass tiles can stack tightly without dominating.
export const DEFAULT_LAYOUT: WidgetInstance[] = [
	// ── Column A — narrative (w=4) ──
	{
		instanceId: "default-money",
		defId: "money_recovered_ticker",
		x: 0,
		y: 0,
		w: 4,
		h: 5,
	},
	{
		instanceId: "default-health",
		defId: "health_trend",
		x: 0,
		y: 5,
		w: 4,
		h: 6,
	},

	// ── Column B — analytic detail (w=5) ──
	{
		instanceId: "default-changed",
		defId: "what_changed",
		x: 4,
		y: 0,
		w: 5,
		h: 6,
	},
	{
		instanceId: "default-exposure",
		defId: "exposure_kpi",
		x: 4,
		y: 6,
		w: 5,
		h: 5,
	},

	// ── Column C — compact KPI strip (w=3) ──
	// Three h=3 tiles + one h=2 tile = 11 rows, matching cols A/B.
	{
		instanceId: "default-critical",
		defId: "open_critical_kpi",
		x: 9,
		y: 0,
		w: 3,
		h: 3,
	},
	{ instanceId: "default-streak", defId: "streak_kpi", x: 9, y: 3, w: 3, h: 3 },
	{
		instanceId: "default-verification",
		defId: "verification_rate_kpi",
		x: 9,
		y: 6,
		w: 3,
		h: 3,
	},
	{
		instanceId: "default-toppack",
		defId: "top_pack_kpi",
		x: 9,
		y: 9,
		w: 3,
		h: 2,
	},

	// ── Bottom strip — full-width activity heatmap ──
	{
		instanceId: "default-heatmap",
		defId: "activity_heatmap",
		x: 0,
		y: 11,
		w: 12,
		h: 4,
	},
];
