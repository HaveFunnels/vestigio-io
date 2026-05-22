"use client";

import Script from "next/script";

declare global {
	interface Window {
		MercadoPago?: any;
		__mp?: any;
	}
}

// ──────────────────────────────────────────────
// Mercado Pago SDK loader
//
// Loads MP's v2 JS bundle and stashes the initialized client on
// `window.__mp` so any Bricks-using component can grab it without
// re-init. Mirrors PaddleLoader's shape so the billing page can
// render whichever loader matches the active provider.
//
// Public key comes from NEXT_PUBLIC_MP_PUBLIC_KEY (TEST-… in dev,
// production key on prod). Locale defaults to pt-BR since MP is
// BRL-only for us today.
// ──────────────────────────────────────────────

export function MpLoader() {
	const onLoad = () => {
		if (typeof window === "undefined") return;
		if (window.__mp) return; // already initialized
		const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
		if (!publicKey) {
			console.error("[MpLoader] NEXT_PUBLIC_MP_PUBLIC_KEY not set");
			return;
		}
		try {
			window.__mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
		} catch (err) {
			console.error("[MpLoader] init failed:", err);
		}
	};

	return <Script src='https://sdk.mercadopago.com/js/v2' onLoad={onLoad} />;
}
