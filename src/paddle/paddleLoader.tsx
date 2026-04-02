"use client";
import Script from "next/script";
import { signIn } from "next-auth/react";
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

export function PaddleLoader() {
	const loadPaddle = () => {
		if (typeof window !== "undefined") {
			window?.Paddle?.Environment.set("sandbox");
			window.Paddle.Initialize({
				token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
				checkout: {
					settings: {
						locale: detectPaddleLocale(),
					},
				},
				eventCallback: function (event: any) {
					if (
						event.name === "checkout.completed" &&
						event.data.status === "completed"
					) {
						signIn("fetchSession", {
							email: event.data.customer?.email,
							redirect: false,
						}).then((callback) => {
							if (callback?.error) {
								toast.error(callback.error);
							}

							if (callback?.ok && !callback?.error) {
								toast.success("Subcription created successfully");
							}
						});
					}
				},
			});
		}
	};

	return (
		<Script
			src='https://cdn.paddle.com/paddle/v2/paddle.js'
			onLoad={() => {
				loadPaddle();
			}}
		/>
	);
}
