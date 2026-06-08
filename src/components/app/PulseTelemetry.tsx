"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTrack } from "@/hooks/useProductTrack";

// ──────────────────────────────────────────────
// PulseTelemetry — Phase 3.5
//
// Internal-analytics-only (no PostHog) instrumentation to inform
// the Pulse vs Plan home decision. Two events:
//
//   - pulse.visit
//     Fires on mount. Carries is_first_surface_this_session so
//     the admin dashboard can split sessions that started in
//     Pulse from those that bounced over from the Plan.
//
//   - pulse.plan_strip_click
//     Fires when the visitor clicks the Strategy Plan strip at
//     the top of /app/pulse. Tells us whether the strip is doing
//     the round-trip job, or whether users park in Pulse.
//
// The "first surface" attribution uses sessionStorage with a
// single-key sentinel so the first surface visited wins.
// ──────────────────────────────────────────────

const FIRST_SURFACE_KEY = "vestigio.first_surface_this_session";

function consumeFirstSurfaceFlag(surface: string): boolean {
	try {
		const prior = window.sessionStorage.getItem(FIRST_SURFACE_KEY);
		if (prior) return false;
		window.sessionStorage.setItem(FIRST_SURFACE_KEY, surface);
		return true;
	} catch {
		return false;
	}
}

export function PulseVisitMarker() {
	const { track } = useTrack();
	const fired = useRef(false);
	useEffect(() => {
		// React strict-mode runs effects twice in dev; the ref guards
		// against the second fire so we don't double-count visits.
		if (fired.current) return;
		fired.current = true;
		track("pulse.visit", {
			is_first_surface_this_session: consumeFirstSurfaceFlag("pulse"),
		});
	}, [track]);
	return null;
}

interface PlanStripLinkProps {
	href: string;
	children: React.ReactNode;
	className?: string;
}

export function PlanStripLink({ href, children, className }: PlanStripLinkProps) {
	const { track } = useTrack();
	return (
		<Link
			href={href}
			className={className}
			onClick={() => {
				track("pulse.plan_strip_click", { href });
			}}
		>
			{children}
		</Link>
	);
}
