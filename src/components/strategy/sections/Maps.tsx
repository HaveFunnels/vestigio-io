"use client";

import type { MapsSection } from "../types";

/*
 * Wave 22.8 — Maps section (STUB)
 *
 * Will surface this cycle's auto-generated maps + custom map count.
 * For now self-hides because the generator returns null until we ship
 * the full implementation (next sprint).
 */

interface Props {
	maps: MapsSection | null | undefined;
}

export default function Maps({ maps }: Props) {
	if (!maps) return null;
	// TODO Wave 22.8.4 — render full Maps card.
	return null;
}
