"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

// ──────────────────────────────────────────────
// TurnstileWidget — invisible Cloudflare Turnstile challenge.
//
// Renders a hidden widget that auto-executes on mount and calls
// onToken(t) with the resolved token. The parent form then includes
// the token in the POST body to any Turnstile-verified endpoint
// (/api/lead/[id]/run-audit today).
//
// Degrade-safe: when NEXT_PUBLIC_TURNSTILE_SITE_KEY is absent (dev),
// the component renders nothing and parent never receives a token —
// the server-verify helper stays fail-open in that env, so the
// pipeline still works. Once the site key is set in prod AND the
// TURNSTILE_SECRET_KEY server env is also set, the server flips to
// fail-CLOSED and this widget's token becomes required.
//
// Uses `size: invisible` so the widget adds no visual to the form.
// Cloudflare only shows an interactive challenge when its own signals
// think the visitor is suspicious — the invisible mode covers the
// common-case bot / abuse traffic silently.
// ──────────────────────────────────────────────

interface TurnstileGlobal {
	render: (
		el: HTMLElement,
		opts: {
			sitekey: string;
			callback: (token: string) => void;
			"error-callback"?: (err: unknown) => void;
			"expired-callback"?: () => void;
			size?: "normal" | "flexible" | "compact" | "invisible";
			appearance?: "always" | "execute" | "interaction-only";
		},
	) => string;
	reset: (widgetId?: string) => void;
	remove: (widgetId?: string) => void;
}

declare global {
	interface Window {
		turnstile?: TurnstileGlobal;
	}
}

interface Props {
	/** Called with a fresh Turnstile token each time the widget
	 *  successfully solves the challenge. Also called when a stale
	 *  token gets refreshed after expiry (~5 min TTL per Cloudflare). */
	onToken: (token: string) => void;
}

export function TurnstileWidget({ onToken }: Props) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const widgetIdRef = useRef<string | null>(null);
	const [scriptReady, setScriptReady] = useState(false);
	const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

	useEffect(() => {
		if (!siteKey || !scriptReady) return;
		if (!containerRef.current || widgetIdRef.current) return;
		if (typeof window === "undefined" || !window.turnstile) return;
		try {
			widgetIdRef.current = window.turnstile.render(containerRef.current, {
				sitekey: siteKey,
				callback: (token) => onToken(token),
				"expired-callback": () => {
					// Widget auto-refreshes and fires callback again with a
					// new token. Nothing to do here.
				},
				"error-callback": (err) => {
					// Cloudflare errored (rare — network, misconfig). Log
					// but don't crash the form; server-verify will 400 if
					// token ends up empty and the customer sees a normal
					// "Please retry" state.
					console.warn("[turnstile] widget error:", err);
				},
				size: "invisible",
			});
		} catch (err) {
			console.warn("[turnstile] render failed:", err);
		}
		return () => {
			if (widgetIdRef.current && window.turnstile?.remove) {
				try {
					window.turnstile.remove(widgetIdRef.current);
				} catch {
					/* best-effort */
				}
				widgetIdRef.current = null;
			}
		};
	}, [siteKey, scriptReady, onToken]);

	if (!siteKey) return null;

	return (
		<>
			<Script
				src="https://challenges.cloudflare.com/turnstile/v0/api.js"
				strategy="afterInteractive"
				onLoad={() => setScriptReady(true)}
			/>
			<div ref={containerRef} aria-hidden="true" />
		</>
	);
}

export default TurnstileWidget;
