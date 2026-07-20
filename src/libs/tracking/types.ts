// ──────────────────────────────────────────────
// Ad-tracking event types
//
// Standard DR-funnel events shared across Meta / Google Ads /
// TikTok. Each platform receives the same event name + payload from
// the trackConversion() fan-out; each pixel's own adapter maps to
// the platform-native event name.
//
// PageView is auto-fired by every pixel's init call — no explicit
// event needed. The list here covers the ACTION events (lead,
// initiate_checkout, purchase) that drive campaign optimization.
// ──────────────────────────────────────────────

export type TrackingEvent =
	| "lead" // Free /audit form completed — buyer intent signal.
	| "initiate_checkout" // "Ativar meu plano" clicked — Paddle overlay opens.
	| "purchase"; // Paddle transaction.completed — fires server-side via CAPI.

export interface TrackingEventData {
	/** Order/lead identifier for dedup between client + server events.
	 *  Meta CAPI uses this in event_id, gtag in transaction_id, TikTok
	 *  in event_id. Prevents double-counting when both client pixel and
	 *  server CAPI fire the same event. */
	eventId?: string;
	/** Revenue in the currency's smallest unit (BRL cents, USD cents).
	 *  Optional for lead events, required for purchase. */
	valueCents?: number;
	/** ISO 4217 currency code. Defaults per-platform if omitted. */
	currency?: string;
	/** Free-form content identifier (plan key, price ID, product SKU). */
	contentId?: string;
	/** Free-form content name (plan label, product name). */
	contentName?: string;
	/** User email (raw — hashed before send by adapters that need it). */
	email?: string;
	/** User phone in E.164 (raw — hashed before send). */
	phone?: string;
	/** Meta CAPI + Google Enhanced Conversions want first/last name for
	 *  match quality. Optional. Raw — adapters hash. */
	firstName?: string;
	lastName?: string;
}
