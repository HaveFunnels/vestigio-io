/**
 * Fire-and-forget telemetry helper for the LP audit funnel. Routes
 * every event through /api/lead/{id}/track which lands them in the
 * shared ProductEvent table with leadId set + userId/orgId null.
 *
 * Designed to be called freely from anywhere in /lp/audit — never
 * throws, never blocks, never serialises tracking work.
 */

export type LpFunnelEvent =
	| "lp_audit_landing"
	| "lp_audit_form_step"
	| "lp_audit_audit_started"
	| "lp_audit_result_viewed"
	| "lp_audit_cta_clicked"
	| "lp_audit_checkout_complete";

const SESSION_KEY = "vestigio_lp_session";

function getSessionId(): string {
	if (typeof window === "undefined") return "ssr";
	try {
		const existing = window.sessionStorage.getItem(SESSION_KEY);
		if (existing) return existing;
		const fresh = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		window.sessionStorage.setItem(SESSION_KEY, fresh);
		return fresh;
	} catch {
		return "unavailable";
	}
}

export function trackLpEvent(
	leadId: string | null,
	event: LpFunnelEvent,
	properties?: Record<string, unknown>,
): void {
	if (!leadId) return;
	if (typeof window === "undefined") return;
	const pathname = window.location.pathname;
	const sessionId = getSessionId();
	try {
		// Use sendBeacon when available so the event survives a fast
		// navigation (e.g., when the visitor clicks the CTA and the
		// fetch is otherwise interrupted by the next page load).
		const body = JSON.stringify({
			event,
			properties: properties ?? null,
			pathname,
			sessionId,
		});
		if (navigator.sendBeacon) {
			const blob = new Blob([body], { type: "application/json" });
			navigator.sendBeacon(`/api/lead/${leadId}/track`, blob);
			return;
		}
		fetch(`/api/lead/${leadId}/track`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
			keepalive: true,
		}).catch(() => {
			/* best effort */
		});
	} catch {
		/* swallow */
	}
}
