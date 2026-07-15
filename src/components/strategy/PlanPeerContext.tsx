"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

// ──────────────────────────────────────────────
// PlanPeerContext — resolves the peer-prevalence contrast line for
// any finding surfaced inside the Monthly Strategy Plan.
//
// Data flows in from /api/library/strategy/[month] as
// plan.peerLineByInferenceKey (server-resolved from Vestigio Index
// cohorts based on the org's businessModel + locale). Client only
// needs the pre-resolved map — no cohort bundle ships to /app.
//
// Consumers (FindingCard today) call usePeerLineForInference(key) and
// receive a small structured object with the raw prevalence + labels
// they need to compose the sentence. Copy is composed at the render
// site so we can adjust tone/framing without touching this context.
// ──────────────────────────────────────────────

export interface PeerLine {
	prevalence: number;
	cohortSampleSize: number;
	cohortPeriod: string;
	vertical: string;
	patternLabel: string;
	direction: string;
}

const PlanPeerContext = createContext<Record<string, PeerLine>>({});

export function PlanPeerProvider({
	lineByInferenceKey,
	children,
}: {
	lineByInferenceKey?: Record<string, PeerLine>;
	children: ReactNode;
}) {
	const value = useMemo(() => lineByInferenceKey ?? {}, [lineByInferenceKey]);
	return (
		<PlanPeerContext.Provider value={value}>
			{children}
		</PlanPeerContext.Provider>
	);
}

/** Returns the peer contrast line for a finding's inference_key, or
 *  null when no cohort match exists (org outside covered verticals,
 *  inference not whitelisted, or prevalence below the copy threshold). */
export function usePeerLineForInference(inferenceKey: string | null | undefined): PeerLine | null {
	const map = useContext(PlanPeerContext);
	if (!inferenceKey) return null;
	return map[inferenceKey] ?? null;
}
