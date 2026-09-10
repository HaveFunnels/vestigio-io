// ──────────────────────────────────────────────
// Page label — the ENTITY a path represents, in the customer's words.
// (ONDA 4.1 — "a loja como protagonista", vertical-agnostic)
//
// "Uninspired" diagnosis: the plan spoke in paths
// (/products/vedaplus-kit-potes-hermeticos) — machine coordinates.
// The customer thinks in THINGS: a product, a plan, a landing page, a
// contact form. Every site has crawled <title>s; this turns them into
// clean entity names. No e-commerce assumption: a SaaS pricing page,
// an infoproduct sales page and a bedding kit all resolve the same
// way.
// ──────────────────────────────────────────────

function normalizeForBrand(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]/g, "");
}

/** Cleans a crawled <title> into an entity name:
 *  "VedaPlus® Kit Potes | Casa Montelle" → "VedaPlus® Kit Potes".
 *  `brandHint` (usually the env domain) identifies which side of the
 *  separator is the brand — length alone picks the brand on short
 *  titles ("Checkout | Casa Montelle"). */
export function cleanPageTitle(
	title: string | null | undefined,
	brandHint?: string | null,
): string | null {
	if (!title) return null;
	const parts = title.split(/\s*[|·]\s*|\s+[–—-]\s+/).map((p) => p.trim()).filter(Boolean);
	if (parts.length === 0) return null;
	const brand = brandHint
		? normalizeForBrand(brandHint.replace(/\.[a-z.]+$/i, "")) // drop TLD
		: null;
	const isBrand = (p: string): boolean => {
		if (!brand || brand.length < 3) return false;
		const n = normalizeForBrand(p);
		return n.length >= 3 && (brand.includes(n) || n.includes(brand));
	};
	const nonBrand = parts.filter((p) => !isBrand(p));
	const pool = nonBrand.length > 0 ? nonBrand : parts;
	// Among non-brand parts, the longest is the most specific; when the
	// brand is unknown, the longest overall is still the best guess.
	const best = pool.reduce((a, b) => (b.length > a.length ? b : a));
	const cleaned = best.replace(/\s+/g, " ").trim();
	if (cleaned.length < 3) return null;
	return cleaned.length > 70 ? `${cleaned.slice(0, 69).trimEnd()}…` : cleaned;
}

/** Human default when no title exists — the path's last segment,
 *  de-slugged: "/products/limpamax-robo" → "limpamax robo". */
export function labelFromPath(path: string): string {
	if (!path || path === "/") return "página inicial";
	const seg = path.replace(/\/+$/, "").split("/").filter(Boolean).pop() ?? path;
	const deslugged = decodeURIComponent(seg).replace(/[-_]+/g, " ").trim();
	return deslugged || path;
}

/** Entity label with graceful fallback. */
export function pageEntityLabel(
	title: string | null | undefined,
	path: string,
	brandHint?: string | null,
): string {
	return cleanPageTitle(title, brandHint) ?? labelFromPath(path);
}
