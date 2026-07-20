// ──────────────────────────────────────────────
// Meta Pixel — client-side event tracker
//
// Loaded by <PixelTracker> in the site root layout when
// NEXT_PUBLIC_META_PIXEL_ID is set. Renders nothing otherwise.
//
// The pixel's own init() call auto-fires PageView on every route
// change (Meta's fbq lib listens to pushState). trackEvent() below
// dispatches the standard DR action events (Lead, InitiateCheckout,
// Purchase) with the shared TrackingEventData payload.
//
// Purchase is normally fired SERVER-SIDE via CAPI (see meta-capi.ts)
// to guarantee delivery even when browser blockers strip fbq. If
// you fire both, use the same eventId to let Meta dedupe.
// ──────────────────────────────────────────────

import type { TrackingEvent, TrackingEventData } from "./types";

declare global {
	interface Window {
		fbq?: (...args: unknown[]) => void;
		_fbq?: unknown;
	}
}

/** Map of shared event names → Meta Pixel standard events. */
const META_EVENT_NAMES: Record<TrackingEvent, string> = {
	lead: "Lead",
	initiate_checkout: "InitiateCheckout",
	purchase: "Purchase",
};

/** True when NEXT_PUBLIC_META_PIXEL_ID is present at build time. */
export function isMetaPixelConfigured(): boolean {
	return !!process.env.NEXT_PUBLIC_META_PIXEL_ID;
}

/** Emits the loader <script> tag content. Called by <PixelTracker>.
 *
 * pixelId is interpolated into a script literal — validate it fits the
 * Meta ID shape (numeric, up to 20 digits) before interpolation so
 * this helper stays XSS-safe even if a caller ever passes a value
 * that didn't come from a trusted env var. Non-matching input →
 * empty string, no <script> tag renders. */
export function metaPixelInitScript(pixelId: string): string {
	if (!/^[0-9]{5,20}$/.test(pixelId)) return "";
	// Standard Meta loader — installs the fbq shim + init + first
	// PageView. Route-change PageViews are picked up automatically by
	// the shim once Next.js pushState fires.
	return `!function(f,b,e,v,n,t,s)
	{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
	n.callMethod.apply(n,arguments):n.queue.push(arguments)};
	if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
	n.queue=[];t=b.createElement(e);t.async=!0;
	t.src=v;s=b.getElementsByTagName(e)[0];
	s.parentNode.insertBefore(t,s)}(window, document,'script',
	'https://connect.facebook.net/en_US/fbevents.js');
	fbq('init', '${pixelId}');
	fbq('track', 'PageView');`;
}

/** Fires a tracked event via fbq. No-op when pixel isn't loaded. */
export function trackMetaEvent(event: TrackingEvent, data: TrackingEventData = {}): void {
	if (typeof window === "undefined" || !window.fbq) return;
	const name = META_EVENT_NAMES[event];
	const payload: Record<string, unknown> = {};
	if (data.valueCents !== undefined) {
		payload.value = data.valueCents / 100;
		payload.currency = data.currency ?? "BRL";
	}
	if (data.contentId) payload.content_ids = [data.contentId];
	if (data.contentName) payload.content_name = data.contentName;
	const opts: Record<string, unknown> = {};
	if (data.eventId) opts.eventID = data.eventId;
	try {
		window.fbq("track", name, payload, opts);
	} catch (err) {
		console.warn("[meta-pixel] track failed:", err);
	}
}
