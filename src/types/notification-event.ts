// Shared type to break the import cycle
//   notifications.ts ←→ whatsapp-meta.ts ←→ whatsapp-templates.ts
//
// `whatsapp-templates.ts` only needs the *type* — keeping it here
// lets the templates module import from a pure type module instead
// of pulling notifications' runtime graph.

export type NotificationEvent =
	| "page_down"
	| "incident"
	| "regression"
	| "improvement"
	| "newsletter"
	| "magic_link"
	| "activation_link"
	| "password_reset"
	| "support_reply"
	| "billing"
	| "system"
	// Fired by the post-cycle attribution job when a UserAction the
	// operator marked as done is confirmed resolved by a subsequent
	// cycle. Celebration moment — delivers the "since you fixed X,
	// you recovered $Y/mo" payoff.
	| "verified_resolved"
	| "digest"
	| "mini_audit_complete"
	// Wave 22.8 #10 Move 2 — followup email 24h pos mini-audit para
	// leads que nao converteram. Disparado pelo cron lead-followup-24h
	// em instrumentation-node.ts.
	| "mini_audit_followup_24h"
	// Wave 22.8 reta-final — pre-expiry warning (D+10). Segundo (e
	// ultimo) touchpoint do funnel mini-audit. Council-of-4-lenses
	// preferiu este sobre D+7 porque a urgencia eh real (TTL=14d).
	| "mini_audit_pre_expiry"
	// Product updates email channel — wired so the productUpdates toggle
	// in settings actually gates anything. Fired when product release
	// notes / changelog updates ship.
	| "product_updates"
	// PIX dunning lifecycle for MP recurring renewals. All five are
	// transactional/critical (always sent regardless of prefs) — see
	// isEventEnabled. Driven by apps/audit-runner/dunning-pix.ts.
	| "pix_reminder_5d"
	| "pix_reminder_2d"
	| "pix_reminder_today"
	| "pix_confirmed"
	| "pix_suspended"
	// Wave 21.5 — monthly "Vestigio caught $X this month" report
	// sent on the first ~7 days of each new month. Idempotent via
	// the tag value-caught:{envId}:{YYYYMM}.
	| "value_caught_monthly"
	// Wave-22.6 onboarding — fired on env activation (first audit
	// kicked off) and when the user marks their first UserAction as
	// in_progress. Dedupe-per-user via tag welcome:{userId} and
	// activation_celebrated:{userId}.
	| "welcome"
	| "activation_celebrated"
	// Post-paywall activation (C23c) — fired by the MP webhook when a
	// paywall payment is approved and the user's org+membership are
	// materialized. Lands a transactional "you're in" email so the
	// buyer has a deliverable they can forward or reference.
	| "paywall_activated"
	// Wave 22.6 Step 7 — Monthly Strategy Plan ready notification.
	// Fired when MonthlyStrategyPlan.status flips from 'generating'
	// to 'ready' (either via day-1 cron OR first-cycle trigger).
	// Idempotent via tag strategy-plan:{envId}:{YYYYMM}. Two variants
	// via the same union member: subject line + intro change based
	// on isFirstPlan (resolved inside the trigger).
	| "strategy_plan_ready";
