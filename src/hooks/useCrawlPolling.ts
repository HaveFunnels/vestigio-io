"use client";

import { useEffect, useRef, useState } from "react";
import type { CrawlProgress } from "@/types/crawl-progress";

// ──────────────────────────────────────────────
// useCrawlPolling — polls /api/lead/[id] for early-crawl progress
//
// Used by the /audit form to drive the CrawlStatusWidget (sticky banner
// up top) and the finding-teaser interstitial (Sprint 3).
//
// Polling cadence: 2.5s while status is "fetching". Stops on "ready" or
// "error". The polled endpoint is the same GET /api/lead/[id] the result
// page uses — no new endpoint, and the response already carries lead
// state we'd need anyway.
//
// Disabled by default — caller passes `enabled=true` only after step 1
// (domain submitted + early-crawl dispatched) so we don't poll uselessly
// during step 0.
// ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 24; // 60s ceiling — early-crawl finishes in <15s normally

export function useCrawlPolling(
	leadId: string | null,
	enabled: boolean,
): CrawlProgress | null {
	const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
	const attemptsRef = useRef(0);

	useEffect(() => {
		if (!leadId || !enabled) return;

		let cancelled = false;
		let timerId: ReturnType<typeof setTimeout> | null = null;

		const tick = async () => {
			if (cancelled) return;
			if (attemptsRef.current >= POLL_MAX_ATTEMPTS) return;
			attemptsRef.current += 1;

			try {
				const res = await fetch(`/api/lead/${leadId}`, {
					method: "GET",
					credentials: "same-origin",
				});
				if (!res.ok) {
					// 404 / 410 / spam path returns auditing — just give up
					return;
				}
				const data = await res.json();
				if (cancelled) return;
				const cp: CrawlProgress | null = data?.crawlProgress ?? null;
				setCrawlProgress(cp);
				// Stop polling on terminal states
				if (cp?.status === "ready" || cp?.status === "error") return;
				timerId = setTimeout(tick, POLL_INTERVAL_MS);
			} catch {
				// Network blip — keep trying within the attempt budget
				if (!cancelled) timerId = setTimeout(tick, POLL_INTERVAL_MS);
			}
		};

		// Kick off first poll right away
		tick();

		return () => {
			cancelled = true;
			if (timerId) clearTimeout(timerId);
		};
	}, [leadId, enabled]);

	return crawlProgress;
}
