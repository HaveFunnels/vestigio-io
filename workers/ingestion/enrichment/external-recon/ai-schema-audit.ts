import { reconFetch, unreachable, type ReconResult } from "./types";

// ──────────────────────────────────────────────
// AI Schema Audit probe — Wave 13 AI Visibility
//
// Fetches the homepage + /pricing on the customer's own domain and
// extracts JSON-LD blocks. AI assistants weight schema heavily —
// content with proper Organization + Product + FAQ markup gets ~30-40%
// more AI citations than equivalent content without (Princeton GEO
// study + Anthropic citation patterns).
//
// Schema types we care about for AI visibility:
//   - Organization / WebSite — entity recognition
//   - Product / SoftwareApplication — what is this thing
//   - Offer — pricing parseable by AI agents
//   - FAQPage — extracts Q&A for AI summaries
//   - HowTo — extracts steps for "how to" queries
//   - Article / BlogPosting — author + date for authority
//   - BreadcrumbList — site structure hint
//
// We parse all <script type="application/ld+json"> blocks. Loose JSON
// parsing — broken schema is common, we don't want to crash on it.
//
// Zero cost. Two HTTP fetches (homepage + /pricing if reachable).
// ──────────────────────────────────────────────

const SCHEMA_TYPES_AI_RELEVANT = [
	"Organization",
	"WebSite",
	"Product",
	"SoftwareApplication",
	"Offer",
	"FAQPage",
	"HowTo",
	"Article",
	"BlogPosting",
	"BreadcrumbList",
	"AggregateRating",
	"Review",
] as const;

type SchemaTypeKey = (typeof SCHEMA_TYPES_AI_RELEVANT)[number];

function extractJsonLdBlocks(html: string): unknown[] {
	const blocks: unknown[] = [];
	const re =
		/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	for (const m of html.matchAll(re)) {
		const raw = m[1].trim();
		if (!raw) continue;
		try {
			blocks.push(JSON.parse(raw));
		} catch {
			// Some sites embed multiple objects without an array wrapper.
			// Try to wrap as array.
			try {
				blocks.push(JSON.parse(`[${raw}]`));
			} catch {
				// give up on this block
			}
		}
	}
	return blocks;
}

function collectTypes(node: unknown, found: Set<string>): void {
	if (!node) return;
	if (Array.isArray(node)) {
		for (const child of node) collectTypes(child, found);
		return;
	}
	if (typeof node !== "object") return;
	const obj = node as Record<string, unknown>;
	const t = obj["@type"];
	if (typeof t === "string") found.add(t);
	else if (Array.isArray(t)) for (const ti of t) if (typeof ti === "string") found.add(ti);
	// recurse into @graph + nested properties
	if (Array.isArray(obj["@graph"])) collectTypes(obj["@graph"], found);
	for (const v of Object.values(obj)) {
		if (typeof v === "object") collectTypes(v, found);
	}
}

async function fetchPageHtml(url: string): Promise<string | null> {
	const res = await reconFetch(url);
	if (!res || !res.ok) return null;
	return await res.text();
}

export async function probeAiSchemaAudit(rootDomain: string): Promise<ReconResult> {
	const baseUrl = `https://${rootDomain.replace(/^www\./, "")}`;
	const homepageUrl = `${baseUrl}/`;
	const pricingUrl = `${baseUrl}/pricing`;

	const [homepage, pricing] = await Promise.allSettled([
		fetchPageHtml(homepageUrl),
		fetchPageHtml(pricingUrl),
	]);

	const homepageHtml = homepage.status === "fulfilled" ? homepage.value : null;
	const pricingHtml = pricing.status === "fulfilled" ? pricing.value : null;

	if (!homepageHtml) return unreachable(homepageUrl, "http_error");

	const allBlocks: unknown[] = [
		...extractJsonLdBlocks(homepageHtml),
		...(pricingHtml ? extractJsonLdBlocks(pricingHtml) : []),
	];

	const typesFound = new Set<string>();
	for (const block of allBlocks) collectTypes(block, typesFound);

	const aiRelevantTypes: SchemaTypeKey[] = [];
	for (const t of SCHEMA_TYPES_AI_RELEVANT) {
		if (typesFound.has(t)) aiRelevantTypes.push(t);
	}

	// What "comprehensive" means for an AI Visibility score:
	//   - has Organization OR WebSite (entity)
	//   - has Product OR SoftwareApplication (what is it)
	//   - has FAQPage OR HowTo (extractable Q&A or process)
	const hasEntity = typesFound.has("Organization") || typesFound.has("WebSite");
	const hasProduct = typesFound.has("Product") || typesFound.has("SoftwareApplication");
	const hasExtractable = typesFound.has("FAQPage") || typesFound.has("HowTo");
	const isComprehensive = hasEntity && hasProduct && hasExtractable;

	// Critical gap: Product schema on a B2B SaaS pricing page is the
	// single highest-leverage schema for AI agent comparison shopping.
	const pricingHasProduct = pricingHtml
		? extractJsonLdBlocks(pricingHtml).some((b) => {
				const types = new Set<string>();
				collectTypes(b, types);
				return types.has("Product") || types.has("SoftwareApplication") || types.has("Offer");
		})
		: false;

	return {
		reachable: true,
		fetched_url: homepageUrl,
		data: {
			block_count: allBlocks.length,
			types_found: Array.from(typesFound).slice(0, 30),
			ai_relevant_types_present: aiRelevantTypes,
			has_entity_schema: hasEntity,
			has_product_schema: hasProduct,
			has_extractable_schema: hasExtractable,
			schema_comprehensive: isComprehensive,
			pricing_has_product_schema: pricingHasProduct,
			pricing_reachable: pricingHtml !== null,
			missing_ai_priorities: [
				!hasEntity && "Organization/WebSite",
				!hasProduct && "Product/SoftwareApplication",
				!hasExtractable && "FAQPage/HowTo",
				!pricingHasProduct && pricingHtml && "Product schema on /pricing",
			].filter(Boolean),
		},
	};
}
