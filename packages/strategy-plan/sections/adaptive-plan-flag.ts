/**
 * Off unless explicitly enabled.
 *
 * The adaptive plan renders ABOVE the existing document rather than
 * replacing it, so turning this on is additive: the reader gets a
 * prioritised summary first and every current section still follows.
 * That makes the switch observable side by side instead of a swap
 * nobody can compare.
 */
export function adaptivePlanEnabled(): boolean {
	return process.env.ADAPTIVE_PLAN_ENABLED === "true";
}
