"use client";

import type { ImpersonatorsSection } from "../types";

/*
 * Wave 22.8 — Brand Impersonators section (STUB)
 *
 * Will surface this cycle's lookalike-domain detections. For now
 * self-hides because the generator returns null until we ship the
 * full implementation (next sprint).
 */

interface Props {
	impersonators: ImpersonatorsSection | null | undefined;
}

export default function Impersonators({ impersonators }: Props) {
	if (!impersonators || impersonators.topEntries.length === 0) return null;
	// TODO Wave 22.8.3 — render full Brand Impersonators card.
	return null;
}
