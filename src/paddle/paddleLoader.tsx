"use client";
import Script from "next/script";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

declare global {
	interface Window {
		Paddle: any;
	}
}

const PADDLE_SUPPORTED_LOCALES = [
	"ar", "cs", "da", "de", "en", "es", "fi", "fr", "hi",
	"hu", "it", "ja", "ko", "nb", "nl", "pl", "pt", "pt-BR",
	"ro", "ru", "sk", "sv", "th", "tr", "uk", "vi", "zh-Hans", "zh-Hant",
];

function detectPaddleLocale(): string {
	const lang = navigator.language || "en";
	// Exact match first (e.g. "pt-BR")
	if (PADDLE_SUPPORTED_LOCALES.includes(lang)) return lang;
	// Base language match (e.g. "es-AR" → "es")
	const base = lang.split("-")[0];
	if (PADDLE_SUPPORTED_LOCALES.includes(base)) return base;
	return "en";
}

// Paddle environment is driven by NEXT_PUBLIC_PADDLE_ENV so that dev/staging
// can stay in sandbox while production flips to live without a code change.
// Defaulting to "sandbox" when unset keeps local-dev safe — the live env is
// opt-in, not accidental.
function detectPaddleEnvironment(): "production" | "sandbox" {
	return process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
		? "production"
		: "sandbox";
}

export function PaddleLoader() {
	// `update()` triggers NextAuth to re-run the jwt callback and re-read the
	// user's plan/status from the database. After a successful checkout the
	// Paddle webhook updates `Organization.plan` asynchronously — we wait a
	// short beat for that to land, then refresh the session so the UI picks
	// up the new entitlements without requiring a full logout/login round-trip.
	const { update } = useSession();
	const router = useRouter();

	const loadPaddle = () => {
		if (typeof window === "undefined") return;
		if (!window?.Paddle) return;

		try {
			window.Paddle.Environment.set(detectPaddleEnvironment());
			window.Paddle.Initialize({
				token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
				checkout: {
					settings: {
						locale: detectPaddleLocale(),
					},
				},
				eventCallback: async (event: any) => {
					if (
						event?.name !== "checkout.completed" ||
						event?.data?.status !== "completed"
					) {
						return;
					}

					// Webhook is responsible for user/org/plan writes — we just
					// need the client session to catch up. Brief pause so the
					// webhook has time to commit before we re-pull the JWT.
					// Post-checkout we optimistically toast + refresh; if the
					// webhook hasn't landed yet, the next page interaction will
					// pick it up via `update()` chaining with `router.refresh()`.
					toast.success("Subscription created. Refreshing your account…");
					try {
						await new Promise((r) => setTimeout(r, 800));
						await update();
						router.refresh();
					} catch (err) {
						// Non-fatal — a full page reload is the robust fallback.
						console.error("[PaddleLoader] session refresh failed:", err);
						window.location.reload();
					}
				},
			});
		} catch (err) {
			console.error("[PaddleLoader] initialization failed:", err);
		}
	};

	return (
		<Script
			src='https://cdn.paddle.com/paddle/v2/paddle.js'
			onLoad={loadPaddle}
		/>
	);
}
