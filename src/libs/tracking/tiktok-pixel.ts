// ──────────────────────────────────────────────
// TikTok Pixel — client-side event tracker
//
// Loaded by <PixelTracker> when NEXT_PUBLIC_TIKTOK_PIXEL_ID is set.
// TikTok's ttq loader auto-fires PageView on init; explicit event
// dispatch below covers the DR action events.
//
// Purchase events should ALSO fire server-side via TikTok's Events
// API (not implemented in this scaffolding) for ATT-safe attribution
// on iOS 14.5+. Client-only Purchase still counts, just with weaker
// signal fidelity.
// ──────────────────────────────────────────────

import type { TrackingEvent, TrackingEventData } from "./types";

declare global {
	interface Window {
		ttq?: {
			track: (event: string, data?: Record<string, unknown>, opts?: Record<string, unknown>) => void;
			page?: () => void;
			[key: string]: unknown;
		};
		TiktokAnalyticsObject?: string;
	}
}

const TIKTOK_EVENT_NAMES: Record<TrackingEvent, string> = {
	lead: "SubmitForm",
	initiate_checkout: "InitiateCheckout",
	purchase: "CompletePayment",
};

export function isTikTokPixelConfigured(): boolean {
	return !!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
}

/** Standard TikTok Pixel loader — includes init + auto-PageView.
 *
 * pixelId is interpolated into an inline <script>; validate strict
 * alphanumeric shape so this helper stays XSS-safe even if a caller
 * ever passes a value that didn't come from a trusted env var.
 * Non-matching input → empty string, script won't render. */
export function tikTokPixelInitScript(pixelId: string): string {
	if (!/^[A-Za-z0-9]{10,40}$/.test(pixelId)) return "";
	return `!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};

  ttq.load('${pixelId}');
  ttq.page();
}(window, document, 'ttq');`;
}

export function trackTikTokEvent(event: TrackingEvent, data: TrackingEventData = {}): void {
	if (typeof window === "undefined" || !window.ttq) return;
	const name = TIKTOK_EVENT_NAMES[event];
	const payload: Record<string, unknown> = {};
	if (data.valueCents !== undefined) {
		payload.value = data.valueCents / 100;
		payload.currency = data.currency ?? "BRL";
	}
	if (data.contentId) payload.contents = [{ content_id: data.contentId, content_name: data.contentName }];
	const opts: Record<string, unknown> = {};
	if (data.eventId) opts.event_id = data.eventId;
	try {
		window.ttq.track(name, payload, opts);
	} catch (err) {
		console.warn("[tiktok-pixel] track failed:", err);
	}
}
