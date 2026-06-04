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
// Wave-22.6 review fix UC2 restructure — constraints driving this shape:
//
//   1. The TOP ROW is now the Action Queue Hero. The landing literally
//      promises "Não é um dashboard. É uma fila de decisões" — pre-fix
//      the top widget was Cross-Signal Hero (chains viz) which fails
//      that promise structurally. Action Queue Hero shows the top 5
//      prioritized open actions inline; Cross-Signal Hero moves below
//      as a supporting visualization.
//   2. The KPI strip (Money / Exposure / Critical) is preserved in the
//      same shape so the "did I make money / am I losing money / is
//      anything on fire" reflex stays unchanged.
//   3. ActivityHeatmap is half-width (w=6) — denser, less wasted
//      vertical space.
//   4. TopPack stays as a small w=2 tile in the bottom KPI row.
//
//   ┌─────────────────────────────────┐
//   │ Action Queue Hero (NEW)        │   row 0-3 (h=4) ← UC2 fix
//   │ w=12                           │
//   ├─────────────────────────────────┤
//   │ Cross-Signal Hero              │   row 4-6 (h=3)
//   │ w=12                           │
//   ├────────┬──────────────┬────────┤
//   │ Money  │  Exposure    │Critical│   row 7-9 (h=3)
//   │ w=4    │  w=5         │ w=3    │
//   ├────────┴──────┬───────┴────────┤
//   │ Health        │ WhatChanged    │   row 10-13 (h=4)
//   │ w=6           │ w=6            │
//   ├───────────────┼─────┬────┬────┤
//   │ Heatmap       │Strk │Verf│Top │   row 14-16 (h=3)
//   │ w=6           │w=2  │w=2 │w=2 │
//   ├───────────────┴─────┴────┴────┤
//   │ Trend         │ Recovery       │   row 17-20 (h=4)
//   │ w=6           │ w=6            │
//   └───────────────┴────────────────┘
//
// Total: 20 row units. ~1680px at rowHeight=80.
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
	// ── Row 0-3 (h=4): Action Queue Hero — Wave-22.6 review fix UC2 ──
	{
		instanceId: "default-actionqueue",
		defId: "action_queue_hero",
		x: 0,
		y: 0,
		w: 12,
		h: 4,
	},

	// ── Row 4-6 (h=3): Cross-Signal Hero — Vestigio's moat ──
	{
		instanceId: "default-crosssignal",
		defId: "cross_signal_hero",
		x: 0,
		y: 4,
		w: 12,
		h: 3,
	},

	// ── Row 7-9 (h=3): KPI strip ──
	{
		instanceId: "default-money",
		defId: "money_recovered_ticker",
		x: 0,
		y: 7,
		w: 4,
		h: 3,
	},
	{
		instanceId: "default-exposure",
		defId: "exposure_kpi",
		x: 4,
		y: 7,
		w: 5,
		h: 3,
	},
	{
		instanceId: "default-critical",
		defId: "open_critical_kpi",
		x: 9,
		y: 7,
		w: 3,
		h: 3,
	},

	// ── Row 10-13 (h=4): trends + change report ──
	{
		instanceId: "default-health",
		defId: "health_trend",
		x: 0,
		y: 10,
		w: 6,
		h: 4,
	},
	{
		instanceId: "default-changed",
		defId: "what_changed",
		x: 6,
		y: 10,
		w: 6,
		h: 4,
	},

	// ── Row 14-16 (h=3): heatmap + compact KPI tiles ──
	{
		instanceId: "default-heatmap",
		defId: "activity_heatmap",
		x: 0,
		y: 14,
		w: 6,
		h: 3,
	},
	{
		instanceId: "default-streak",
		defId: "streak_kpi",
		x: 6,
		y: 14,
		w: 2,
		h: 3,
	},
	{
		instanceId: "default-verification",
		defId: "verification_rate_kpi",
		x: 8,
		y: 14,
		w: 2,
		h: 3,
	},
	{
		instanceId: "default-toppack",
		defId: "top_pack_kpi",
		x: 10,
		y: 14,
		w: 2,
		h: 3,
	},

	// ── Row 17-20 (h=4): Trend analysis + Recovery breakdown ──
	{
		instanceId: "default-trend-analysis",
		defId: "trend_analysis",
		x: 0,
		y: 17,
		w: 6,
		h: 4,
	},
	{
		instanceId: "default-recovery-breakdown",
		defId: "recovery_breakdown",
		x: 6,
		y: 17,
		w: 6,
		h: 4,
	},
];
