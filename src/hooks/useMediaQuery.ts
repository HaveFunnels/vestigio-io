"use client";

import { useEffect, useState } from "react";

// ──────────────────────────────────────────────
// useMediaQuery — single shared hook
//
// Returns true when the given CSS media query matches the current
// viewport. Safe on SSR (defaults to `false` until the effect runs).
//
// Prefer Tailwind responsive classes (`md:hidden`, `lg:flex`) where
// possible — they don't pay a hydration cost. Use this hook only
// when behavior, not just visibility, has to branch on viewport
// (e.g., rendering a totally different component, or wiring a
// drag/touch handler that's expensive enough to skip on mobile).
// ──────────────────────────────────────────────

export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);
	useEffect(() => {
		if (typeof window === "undefined") return;
		const mql = window.matchMedia(query);
		setMatches(mql.matches);
		const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, [query]);
	return matches;
}

export function useIsMobile(): boolean {
	return useMediaQuery("(max-width: 767px)");
}
