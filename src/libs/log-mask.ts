// ──────────────────────────────────────────────
// Log-line PII masking helpers.
//
// Distinct from src/libs/error-tracker.ts sanitizeBody, which
// operates on structured request/response bodies. These helpers
// operate on inline string values that show up in console.log /
// console.warn / console.error calls scattered across the workers,
// where the log message itself carries the identifier.
//
// Rules:
//   maskEmail("luis@vestigio.io") = "l***@vestigio.io"
//   maskEmail(null | "" | "not-an-email") = "[invalid]"
//
// The first char + domain is enough to correlate two log lines
// from the same operator during an incident (typical LGPD
// pseudonymization pattern) without carrying the full PII
// identifier into every Railway log or Cloudflare access log the
// message passes through.
// ──────────────────────────────────────────────

export function maskEmail(email: string | null | undefined): string {
	if (!email || typeof email !== "string") return "[invalid]";
	const at = email.indexOf("@");
	if (at <= 0 || at === email.length - 1) return "[invalid]";
	const local = email.slice(0, at);
	const domain = email.slice(at);
	if (local.length === 1) return `*${domain}`;
	return `${local[0]}***${domain}`;
}
