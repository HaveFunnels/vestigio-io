"use server";

import { getIp } from "./get-ip";

const trackers: Record<string, { count: number; expiresAt: number }> = {};

// Clean up expired entries periodically to prevent memory leaks
function cleanup() {
	const now = Date.now();
	for (const key of Object.keys(trackers)) {
		if (trackers[key].expiresAt < now) {
			delete trackers[key];
		}
	}
}

// Run cleanup every 60 seconds
if (typeof setInterval !== "undefined") {
	setInterval(cleanup, 60_000);
}

export async function rateLimitByIp(limit = 5, windowMs = 60000) {
	const ip = await getIp();

	if (!ip) {
		throw new Error("IP address not found");
	}

	const tracker = trackers[ip] || { count: 0, expiresAt: 0 };

	if (!trackers[ip]) {
		trackers[ip] = tracker;
	}

	if (tracker.expiresAt < Date.now()) {
		tracker.count = 0;
		tracker.expiresAt = Date.now() + windowMs;
	}

	tracker.count++;

	if (tracker.count > limit) {
		throw new Error("Rate limit exceeded");
	}
}

/**
 * Composable rate limit check for use in API route handlers.
 * Returns a NextResponse if rate limited, null otherwise.
 */
export async function checkRateLimit(limit = 5, windowMs = 60000) {
	try {
		await rateLimitByIp(limit, windowMs);
		return null; // not rate limited
	} catch {
		const { NextResponse } = await import("next/server");
		return NextResponse.json(
			{ message: "Too many requests. Please try again later." },
			{ status: 429 }
		);
	}
}
