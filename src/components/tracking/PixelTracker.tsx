"use client";

import Script from "next/script";
import {
	isMetaPixelConfigured,
	metaPixelInitScript,
} from "@/libs/tracking/meta-pixel";
import {
	isGoogleAdsConfigured,
	googleAdsInitScript,
	googleAdsScriptSrc,
} from "@/libs/tracking/google-ads";
import {
	isTikTokPixelConfigured,
	tikTokPixelInitScript,
} from "@/libs/tracking/tiktok-pixel";

// ──────────────────────────────────────────────
// PixelTracker — mounts every ad-tracking pixel that has an env var
// present. Rendered once, high up in the (site) layout so PageView
// fires on every route change. Zero visual output.
//
// Per-platform gating:
//   Meta       → NEXT_PUBLIC_META_PIXEL_ID
//   Google Ads → NEXT_PUBLIC_GOOGLE_ADS_ID
//   TikTok     → NEXT_PUBLIC_TIKTOK_PIXEL_ID
//
// Missing var = pixel not loaded = adapters no-op at trackConversion
// call sites. Safe to ship this component before any keys exist.
//
// Action events (Lead / InitiateCheckout / Purchase) are fired from
// the funnel via trackConversion() in src/libs/tracking/index.ts —
// this component only handles LOADER + PageView.
// ──────────────────────────────────────────────

export function PixelTracker() {
	const metaId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
	const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
	const tikTokId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;

	return (
		<>
			{isMetaPixelConfigured() && metaId && (
				<Script
					id="meta-pixel-init"
					strategy="afterInteractive"
					dangerouslySetInnerHTML={{ __html: metaPixelInitScript(metaId) }}
				/>
			)}

			{isGoogleAdsConfigured() && googleAdsId && (
				<>
					<Script
						id="google-ads-loader"
						strategy="afterInteractive"
						src={googleAdsScriptSrc(googleAdsId)}
					/>
					<Script
						id="google-ads-init"
						strategy="afterInteractive"
						dangerouslySetInnerHTML={{ __html: googleAdsInitScript(googleAdsId) }}
					/>
				</>
			)}

			{isTikTokPixelConfigured() && tikTokId && (
				<Script
					id="tiktok-pixel-init"
					strategy="afterInteractive"
					dangerouslySetInnerHTML={{ __html: tikTokPixelInitScript(tikTokId) }}
				/>
			)}
		</>
	);
}

export default PixelTracker;
