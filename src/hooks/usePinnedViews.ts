"use client";

import { useState, useEffect, useCallback } from "react";

// ──────────────────────────────────────────────
// usePinnedViews — fetches pinned views for sidebar injection
//
// Returns pinned views (max 5) from GET /api/views?pinned=true.
// Provides a toggle function to pin/unpin a view.
// ──────────────────────────────────────────────

export interface PinnedView {
	id: string;
	name: string;
	color: string | null;
	icon: string | null;
	isPinned: boolean;
}

export function usePinnedViews() {
	const [pinnedViews, setPinnedViews] = useState<PinnedView[]>([]);
	const [loading, setLoading] = useState(true);

	const fetchPinned = useCallback(async () => {
		try {
			const res = await fetch("/api/views?pinned=true");
			if (res.ok) {
				const data = await res.json();
				setPinnedViews(data.views || []);
			}
		} catch {
			// silently ignore
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchPinned();
	}, [fetchPinned]);

	const togglePin = useCallback(
		async (viewId: string, pin: boolean): Promise<boolean> => {
			// Enforce max 5 limit
			if (pin && pinnedViews.length >= 5) {
				return false;
			}

			try {
				const res = await fetch(`/api/views/${viewId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ isPinned: pin }),
				});
				if (res.ok) {
					await fetchPinned();
					return true;
				}
			} catch {
				// silently ignore
			}
			return false;
		},
		[pinnedViews.length, fetchPinned],
	);

	return { pinnedViews, loading, togglePin, refetch: fetchPinned };
}
