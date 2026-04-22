"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

// ──────────────────────────────────────────────
// Product telemetry client hook (3.16)
//
// Mounted once at app layout level via ProductTrackProvider.
// Auto-tracks page_view on pathname change.
// Exposes track() for manual event instrumentation.
//
// All sends are fire-and-forget — never blocks UI, never throws.
// ──────────────────────────────────────────────

type TrackFn = (event: string, properties?: Record<string, unknown>) => void;

const ProductTrackContext = createContext<{ track: TrackFn }>({
	track: () => {},
});

/** Per-tab session ID — separate from marketing tracker's _vtg_sid */
function getOrCreateSessionId(): string {
	if (typeof window === "undefined") return "";
	let sid = sessionStorage.getItem("_vtg_product_sid");
	if (!sid) {
		sid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		sessionStorage.setItem("_vtg_product_sid", sid);
	}
	return sid;
}

/** Fire-and-forget POST — never throws, never awaited */
function sendEvent(
	event: string,
	properties?: Record<string, unknown>,
	pathname?: string,
): void {
	try {
		const sessionId = getOrCreateSessionId();
		fetch("/api/product-events", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				event,
				properties: properties || undefined,
				pathname: pathname || window.location.pathname,
				sessionId,
			}),
			keepalive: true,
		}).catch(() => {}); // swallow — never break UI
	} catch {
		// never crash
	}
}

function useProductTrackInternal() {
	const pathname = usePathname();
	const prevPathRef = useRef<string | null>(null);
	const enteredAtRef = useRef<number>(Date.now());

	// Auto-track page_view on pathname change
	useEffect(() => {
		if (!pathname) return;
		// Skip admin pages — admin activity shouldn't pollute product metrics
		if (pathname.startsWith("/app/admin")) return;

		const now = Date.now();
		const from = prevPathRef.current;
		const timeOnPrevious = from ? now - enteredAtRef.current : undefined;

		sendEvent(
			"page_view",
			{
				from: from || null,
				to: pathname,
				time_on_previous_ms: timeOnPrevious ?? null,
			},
			pathname,
		);

		prevPathRef.current = pathname;
		enteredAtRef.current = now;
	}, [pathname]);

	const track = useCallback(
		(event: string, properties?: Record<string, unknown>) => {
			sendEvent(event, properties, pathname || undefined);
		},
		[pathname],
	);

	return { track };
}

export function ProductTrackProvider({ children }: { children: ReactNode }) {
	const { track } = useProductTrackInternal();
	return (
		<ProductTrackContext.Provider value={{ track }}>
			{children}
		</ProductTrackContext.Provider>
	);
}

/**
 * Access the product telemetry tracker from any client component.
 * Returns { track(event, properties?) } — fire-and-forget, never throws.
 */
export function useTrack() {
	return useContext(ProductTrackContext);
}
