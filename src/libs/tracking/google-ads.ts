// ──────────────────────────────────────────────
// Google Ads — client-side conversion tracker
//
// Loaded by <PixelTracker> when NEXT_PUBLIC_GOOGLE_ADS_ID is set.
// Loads gtag.js + configures the conversion account. Per-event
// conversion actions require a separate label per event, set via
// NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_{LEAD,INITIATE_CHECKOUT,PURCHASE}.
// A missing label for an event = no-op on that event only.
//
// Google Ads doesn't have a "PageView" conversion event (that's GA4
// territory). The gtag('config') call installs the base pixel; the
// event-level sends fire the specific conversion actions the buyer
// configured in the Google Ads UI.
// ──────────────────────────────────────────────

import type { TrackingEvent, TrackingEventData } from "./types";

declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void;
		dataLayer?: unknown[];
	}
}

/** Env var name per event — resolved at trackGoogleAdsEvent call. */
const CONVERSION_LABEL_ENV: Record<TrackingEvent, string> = {
	lead: "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LEAD",
	initiate_checkout: "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_INITIATE_CHECKOUT",
	purchase: "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_PURCHASE",
};

export function isGoogleAdsConfigured(): boolean {
	return !!process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
}

/** URL for the async gtag loader script; consumer of this string
 *  passes it to <Script src=...>. */
export function googleAdsScriptSrc(adsId: string): string {
	return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
}

/** adsId is interpolated into an inline <script>; validate strict
 *  format (AW- prefix + digits) so this helper stays XSS-safe even
 *  if a caller ever passes a value that didn't come from a trusted
 *  env var. Non-matching input → empty string, script won't render. */
export function googleAdsInitScript(adsId: string): string {
	if (!/^AW-[0-9]{5,15}$/.test(adsId)) return "";
	return `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${adsId}');`;
}

function conversionLabelForEvent(event: TrackingEvent): string | undefined {
	const envName = CONVERSION_LABEL_ENV[event];
	// Direct process.env access — Next.js only inlines NEXT_PUBLIC_*
	// vars at build time when referenced by static literal, so this
	// dynamic access falls back to undefined in the browser bundle
	// unless the caller uses one of the static literals. Pattern:
	// consumer emits per-event constants when configuring.
	if (envName === "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LEAD") return process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LEAD;
	if (envName === "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_INITIATE_CHECKOUT") return process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_INITIATE_CHECKOUT;
	if (envName === "NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_PURCHASE") return process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_PURCHASE;
	return undefined;
}

export function trackGoogleAdsEvent(event: TrackingEvent, data: TrackingEventData = {}): void {
	if (typeof window === "undefined" || !window.gtag) return;
	const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
	if (!adsId) return;
	const label = conversionLabelForEvent(event);
	if (!label) return; // No conversion action configured for this event yet.
	const payload: Record<string, unknown> = {
		send_to: `${adsId}/${label}`,
	};
	if (data.valueCents !== undefined) {
		payload.value = data.valueCents / 100;
		payload.currency = data.currency ?? "BRL";
	}
	if (data.eventId) payload.transaction_id = data.eventId;
	try {
		window.gtag("event", "conversion", payload);
	} catch (err) {
		console.warn("[google-ads] track failed:", err);
	}
}
