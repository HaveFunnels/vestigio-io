"use client";

import type { CompetitorSection } from "../types";

/*
 * Wave 22.8 — Competitor Radar section (STUB)
 *
 * Will surface this cycle's competitor monitoring results. For now
 * self-hides because the generator returns null until we ship the
 * full implementation (next sprint).
 */

interface Props {
	competitor: CompetitorSection | null | undefined;
}

export default function Competitor({ competitor }: Props) {
	if (!competitor || competitor.entries.length === 0) return null;
	// TODO Wave 22.8.2 — render full Competitor Radar card.
	return null;
}
