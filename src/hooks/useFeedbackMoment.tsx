"use client";

import { useCallback, useRef } from "react";

// ──────────────────────────────────────────────
// Feedback Moment — Cooldown & Eligibility Hook
//
// All state in localStorage. Three layers of frequency capping:
//   1. 48h per-trigger cooldown
//   2. 1 prompt per session (global)
//   3. 3 consecutive dismissals → 30 day suppression
//
// Pure client-side — no server calls for eligibility.
// ──────────────────────────────────────────────

const COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours
const SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_DISMISSALS = 3;
const NPS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/** Session-scoped global flag — one feedback prompt per tab */
let sessionPromptShown = false;

function getStorageInt(key: string): number {
	try {
		return parseInt(localStorage.getItem(key) || "0", 10) || 0;
	} catch {
		return 0;
	}
}

function setStorage(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Private browsing or storage full — degrade gracefully
	}
}

export function useFeedbackMoment(trigger: string): {
	shouldShow: boolean;
	markShown: () => void;
	markDismissed: () => void;
	markSubmitted: () => void;
} {
	const checkedRef = useRef<boolean | null>(null);

	const computeEligibility = useCallback(() => {
		if (typeof window === "undefined") return false;
		if (sessionPromptShown) return false;

		const now = Date.now();
		const isNps = trigger === "nps_14d";
		const cooldown = isNps ? NPS_COOLDOWN_MS : COOLDOWN_MS;

		// Per-trigger cooldown
		const lastShown = getStorageInt(`vtg_fb_last_${trigger}`);
		if (lastShown > 0 && now - lastShown < cooldown) return false;

		// Dismissal suppression
		const dismissCount = getStorageInt(`vtg_fb_dismiss_${trigger}`);
		if (dismissCount >= MAX_DISMISSALS) {
			const suppressedAt = getStorageInt(`vtg_fb_suppressed_${trigger}`);
			if (suppressedAt > 0 && now - suppressedAt < SUPPRESS_MS) return false;
			// Suppression expired — reset
			setStorage(`vtg_fb_dismiss_${trigger}`, "0");
			setStorage(`vtg_fb_suppressed_${trigger}`, "0");
		}

		return true;
	}, [trigger]);

	// Lazy evaluation — only compute once per render cycle
	if (checkedRef.current === null) {
		checkedRef.current = computeEligibility();
	}

	return {
		shouldShow: checkedRef.current,

		markShown: useCallback(() => {
			sessionPromptShown = true;
			setStorage(`vtg_fb_last_${trigger}`, String(Date.now()));
		}, [trigger]),

		markDismissed: useCallback(() => {
			sessionPromptShown = true;
			setStorage(`vtg_fb_last_${trigger}`, String(Date.now()));
			const current = getStorageInt(`vtg_fb_dismiss_${trigger}`);
			const next = current + 1;
			setStorage(`vtg_fb_dismiss_${trigger}`, String(next));
			if (next >= MAX_DISMISSALS) {
				setStorage(`vtg_fb_suppressed_${trigger}`, String(Date.now()));
			}
		}, [trigger]),

		markSubmitted: useCallback(() => {
			sessionPromptShown = true;
			setStorage(`vtg_fb_last_${trigger}`, String(Date.now()));
			// Reset dismissal count on submit — user is engaged
			setStorage(`vtg_fb_dismiss_${trigger}`, "0");
		}, [trigger]),
	};
}
