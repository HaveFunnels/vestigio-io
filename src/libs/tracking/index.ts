// ──────────────────────────────────────────────
// Ad-tracking fan-out entry point
//
// Client callers use trackConversion(event, data) to fire the same
// event across every configured platform (Meta / Google Ads /
// TikTok). Missing platform config = silent skip.
//
// Server callers use sendServerConversion(event, data) which
// currently only dispatches to Meta CAPI — TikTok Events API and
// Google Enhanced Conversions are room to grow when the buyer wants
// tighter iOS attribution.
//
// eventId semantics: callers should pass a stable ID (leadId,
// transaction ref) so Meta CAPI + client Pixel dedupe when both
// fire for the same conversion. Purchase events are the most
// important dedup case.
// ──────────────────────────────────────────────

import { trackMetaEvent } from "./meta-pixel";
import { trackGoogleAdsEvent } from "./google-ads";
import { trackTikTokEvent } from "./tiktok-pixel";
import type { TrackingEvent, TrackingEventData } from "./types";

export type { TrackingEvent, TrackingEventData };

/** Client-side dispatch — fans out to all initialized pixels. Safe
 *  to call from any component; adapters are no-op when their pixel
 *  isn't loaded, so unconfigured platforms are silent. */
export function trackConversion(event: TrackingEvent, data: TrackingEventData = {}): void {
	trackMetaEvent(event, data);
	trackGoogleAdsEvent(event, data);
	trackTikTokEvent(event, data);
}

/** Server-side dispatch — currently Meta CAPI only. Extend to
 *  TikTok Events API + Google Enhanced Conversions when those
 *  buyers ship. */
export async function sendServerConversion(
	event: TrackingEvent,
	data: TrackingEventData & { ip?: string; userAgent?: string; sourceUrl?: string } = {},
): Promise<void> {
	try {
		const { sendMetaCapiEvent } = await import("./meta-capi");
		await sendMetaCapiEvent(event, data);
	} catch (err) {
		console.warn("[tracking] server dispatch failed:", err instanceof Error ? err.message : err);
	}
}
