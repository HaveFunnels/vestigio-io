// ──────────────────────────────────────────────
// humanize-path — shared route → natural language helper
//
// Wave 22.9 · Onda 1. Consolidates the two prior humanizers that had
// drifted apart:
//   - packages/strategy-plan/sections/narrative.ts::humanizeSurfaceCustomerFacing
//     (used for narrative prose)
//   - JourneyReplays timeline labels (previously just showed literal
//     "Entrou em /" which read as engineer-speak)
//
// Ordering: static exact-match first (fastest + safest), pattern
// regex second for parameterised routes (`/produto/abc123` → "página
// de produto"). Never lies about which page — unknown paths fall
// through to the literal path so the customer can spot-check.
// ──────────────────────────────────────────────

const STATIC_MAP: Record<string, string> = {
	"/": "home",
	"/checkout": "checkout",
	"/cart": "carrinho",
	"/carrinho": "carrinho",
	"/pricing": "página de preços",
	"/precos": "página de preços",
	"/planos": "página de preços",
};

// Pattern rules run in order. First match wins.
const PATTERNS: Array<{ re: RegExp; label: string }> = [
	{ re: /^\/produtos?\/[^/]+/i, label: "página de produto" },
	{ re: /^\/product\/[^/]+/i, label: "página de produto" },
	{ re: /^\/colecao(?:es)?\/[^/]+/i, label: "coleção" },
	{ re: /^\/collections?\/[^/]+/i, label: "coleção" },
	{ re: /^\/categoria\/[^/]+/i, label: "categoria" },
	{ re: /^\/categor(?:y|ies)\/[^/]+/i, label: "categoria" },
	{ re: /^\/blog\/[^/]+/i, label: "post do blog" },
	{ re: /^\/checkout\/frete/i, label: "etapa de frete no checkout" },
	{ re: /^\/checkout\/pay(?:ment)?/i, label: "etapa de pagamento no checkout" },
	{ re: /^\/checkout\/[^/]+/i, label: "etapa do checkout" },
	{ re: /^\/(?:politica|politicas)/i, label: "página de políticas" },
	{ re: /^\/troca(?:s)?/i, label: "página de trocas" },
	{ re: /^\/devolucao(?:es)?/i, label: "página de devolução" },
	{ re: /^\/privacidade/i, label: "política de privacidade" },
	{ re: /^\/(?:signin|login|entrar)/i, label: "tela de login" },
	{ re: /^\/(?:cadastro|register|registro)/i, label: "tela de cadastro" },
	{ re: /^\/(?:conta|account)/i, label: "área da conta" },
	{ re: /^\/(?:thank|obrigado|thanks|success|sucesso|order-confirmed|pedido-confirmado|compra-realizada)/i, label: "página de confirmação" },
	{ re: /^\/faq/i, label: "FAQ" },
	{ re: /^\/sobre/i, label: "página institucional" },
	{ re: /^\/contato/i, label: "página de contato" },
];

/**
 * Turn a URL path into a customer-facing description.
 *
 * Examples:
 *   "/"              → "home"
 *   "/checkout"      → "checkout"
 *   "/produto/abc"   → "página de produto"
 *   "/politica-dev"  → "página de políticas"
 *   "/foo/bar"       → "/foo/bar" (unknown — passes through literal)
 *
 * @param path Raw pathname (no query, no host)
 * @param fallback What to return if `path` is empty/null.
 *                 Default "esta página" reads naturally when composed
 *                 inline; pass empty string when you need a raw fallback.
 */
export function humanizePath(
	path: string | null | undefined,
	fallback: string = "esta página",
): string {
	if (!path) return fallback;
	const p = path.trim();
	if (STATIC_MAP[p]) return STATIC_MAP[p];
	for (const { re, label } of PATTERNS) {
		if (re.test(p)) return label;
	}
	// Comma-separated fallback for multi-surface strings the narrative
	// pipeline occasionally passes ("/cart,/checkout"). Recursively
	// humanize each half and join with "e".
	if (p.includes(",")) {
		return p
			.split(",")
			.map((s) => humanizePath(s.trim(), fallback))
			.join(" e ");
	}
	return p;
}

/**
 * Same as humanizePath but reserved for slot-friendly composition —
 * e.g. "em [X]" or "no [X]". Adds the preposition when the mapped
 * label reads naturally with "em"/"no". For "home" and "checkout"
 * the caller is expected to compose directly ("na home", "no checkout")
 * so this helper stays minimal.
 */
export function humanizePathSlot(path: string | null | undefined): string {
	const label = humanizePath(path, "esta página");
	if (label === "home") return "na home";
	if (label === "checkout") return "no checkout";
	if (label === "carrinho") return "no carrinho";
	if (label === "página de produto") return "na página de produto";
	if (label === "coleção") return "na coleção";
	if (label === "categoria") return "na categoria";
	if (label.startsWith("etapa")) return `na ${label}`;
	if (label === "página de confirmação") return "na página de confirmação";
	return `em ${label}`;
}
