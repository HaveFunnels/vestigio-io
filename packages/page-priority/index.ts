// ──────────────────────────────────────────────
// Page Priority — Wave 18b
//
// Single source of truth for "which pages does an audit want to look
// at" decisions. Consumed by two surfaces:
//
//   - workers/ingestion/staged-pipeline.ts → speculative critical_paths
//     seeded into discovery + isHighValue() regex applied to homepage
//     links during shallow_plus.
//   - apps/audit-runner/cycle-modes.ts → CRITICAL_SURFACE_PATTERNS used
//     to compute the hot/warm allow-list from existing inventory.
//
// Both used to maintain their own anglo-only lists which silently
// excluded paths like `/precos`, `/sobre`, `/contato`. Now they share
// a business-model-aware, multi-locale source.
//
// Languages supported: en, pt (pt-BR), es. German skipped — every
// German B2B SaaS we've seen still uses /pricing in English.
// ──────────────────────────────────────────────

export type BusinessModelHint =
	| "saas"
	| "ecommerce"
	| "lead_gen"
	| "services"
	| "hybrid";

/**
 * Speculative critical paths to seed into Stage C discovery. The crawler
 * tries each one even if it isn't linked from the homepage — so
 * /pricing on a SaaS or /carrinho on an e-commerce always gets a
 * chance to be discovered, even when the homepage doesn't expose the
 * link (common on JS-heavy hero designs).
 *
 * Ordered by funnel-impact: highest-conversion paths first. The
 * pipeline applies a 50-candidate cap (full mode) / 20 (shallow_plus),
 * so head-of-list paths are the ones that survive truncation.
 */
export function getCriticalPaths(businessModel?: string | null): string[] {
	const model = normalizeBusinessModel(businessModel);
	const universal = UNIVERSAL_PATHS;
	switch (model) {
		case "saas":
			return [...SAAS_PATHS, ...universal];
		case "ecommerce":
			return [...ECOMMERCE_PATHS, ...universal];
		case "lead_gen":
			return [...LEAD_GEN_PATHS, ...universal];
		case "services":
			// Services share most critical paths with lead_gen (they
			// capture leads + close offline), but the contact-form path
			// is more important than the pricing path. Bias accordingly.
			return [...LEAD_GEN_PATHS, ...universal];
		case "hybrid":
		default:
			// Hybrid + unknown gets the union of high-impact SaaS + ecom.
			// We bias toward conversion (pricing + cart + checkout + signup)
			// so the engine still sees real funnel friction even when the
			// business profile is fuzzy.
			return [...HYBRID_PATHS, ...universal];
	}
}

/**
 * Does the URL path + host + link text look like a high-value
 * commercial surface? Used by Stage C discovery on homepage `<a>`
 * links in shallow_plus mode (where we can't afford to crawl every
 * internal link, so we filter to commerce/funnel/trust links).
 *
 * The host is included so subdomain-based checkouts (the dominant
 * pattern in pt-BR — Hotmart / Kiwify / Eduzz host on
 * seguro.dominio.com or pay.dominio.com) survive the filter even when
 * the link text is generic ("clique aqui") and the path is just "/".
 */
export function isHighValuePath(
	path: string,
	linkText?: string | null,
	host?: string | null,
): boolean {
	const haystack = `${host || ""} ${path} ${linkText || ""}`.toLowerCase();
	return HIGH_VALUE_REGEX.test(haystack);
}

/**
 * Subdomain hint for checkout / payment hosting. Brazilian SaaS &
 * info-product platforms (Hotmart, Kiwify, Eduzz, Monetizze, Hubla)
 * almost always host the checkout on a dedicated subdomain rather
 * than a path: `seguro.X`, `pay.X`, `pagamento.X`, `compra.X`. We use
 * this as a first-class signal for critical-surface classification,
 * page-type assignment, and depth-2 crawl gating — none of which used
 * to look at the host before Wave 18b.
 *
 * Matches at the START of the hostname only (anchored). `myseguro.com`
 * doesn't match; `seguro.havefunnels.com` does.
 */
export const CHECKOUT_SUBDOMAIN_REGEX =
	/^(seguro|secure|pay|payment|checkout|compra|comprar|carrinho|carro|cart|finalizar|cobranca|cobrança|billing|gateway|order|comprar-agora)\./i;

/**
 * Does this URL live on a checkout / payment subdomain? Used by
 * `isCommercialCriticalUrl` + `classifyPageTypeFromUrl` (staged-
 * pipeline.ts) so a URL like `seguro.havefunnels.com/produto/123` is
 * recognized as checkout/decision-stage even though its path looks
 * like a product page.
 */
export function isCheckoutSubdomainUrl(url: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase();
		return CHECKOUT_SUBDOMAIN_REGEX.test(host);
	} catch {
		return false;
	}
}

/**
 * Speculative checkout-subdomain probes to seed into discovery when the
 * homepage doesn't link them directly. Common pattern: customers buy a
 * Hotmart / Kiwify product → land on `seguro.dominio.com` via the ad
 * campaign, never via a homepage link, so depth-1 crawl never sees it.
 * These probes catch the case at low cost: DNS fails fast for non-
 * existent subdomains, and existing ones produce a real candidate.
 *
 * We keep the list short (most common 4 in pt-BR / es) so the extra
 * latency is bounded — even if every probe DNS-fails it's <1s total.
 * Returns full URLs with rootDomain substituted in.
 */
export function getCheckoutSubdomainProbes(rootDomain: string): string[] {
	if (!rootDomain || rootDomain.includes("/")) return [];
	const subdomains = ["seguro", "pay", "checkout", "compra"];
	return subdomains.map((sd) => `https://${sd}.${rootDomain}/`);
}

/**
 * Pattern set used by `resolveCriticalSurfaces` in audit-runner to
 * decide which already-inventoried URLs belong in the hot allow-list.
 * Multi-locale + multi-business-model — anything that matches ANY of
 * these is "critical".
 *
 * The patterns are intentionally broader than `getCriticalPaths()`
 * because they're matched against inventory URLs (which already exist
 * in the customer's site) rather than guessed paths. Once a URL is in
 * inventory, we want to KEEP refreshing it across hot/warm cycles.
 */
export const CRITICAL_SURFACE_REGEX_LIST: Array<{ pattern: RegExp; label: string }> = [
	// Conversion-critical (any business model)
	{ pattern: /\/(checkout|cart|carrinho|carro|carrito|finalizar|finalizar-compra|pagamento|payment|pay|comprar|billing)/i, label: "checkout" },
	{ pattern: /\/(pricing|preco|precos|preço|preços|planos|plans|precios|planes|assinatura|assine)/i, label: "pricing" },
	{ pattern: /\/(product|produto|productos|produit|item|p\/)/i, label: "product" },
	// SaaS signup / conversion entry points
	{ pattern: /\/(signup|sign-up|register|cadastro|registro|registrar|get-started|comece|empezar|comeca|start-trial|teste-gratis|prueba-gratis)/i, label: "signup" },
	{ pattern: /\/(demo|trial|teste|prueba)/i, label: "trial_demo" },
	// Lead-gen conversion paths
	{ pattern: /\/(contact|contato|contacto|fale-conosco|agendar|schedule|book-call|book-a-call|orcamento|cotacao|cotizacion|quote)/i, label: "contact_lead" },
];

/**
 * Returns true when the URL points to a high-value commercial surface
 * (pricing, checkout, signup, etc.) — used by depth-2 crawl in
 * staged-pipeline.ts to decide whether to explore the page's outgoing
 * internal links. A pricing page that links to /signup → /demo is a
 * funnel chain we want to traverse; a generic blog post is not.
 *
 * Subdomain hint takes precedence over path. `seguro.havefunnels.com/`
 * is checkout even though pathname is "/"; without the subdomain
 * branch this URL would be silently classified as a homepage and
 * skipped by depth-2 expansion.
 */
export function isCommercialCriticalUrl(url: string): boolean {
	let host: string;
	let path: string;
	try {
		const u = new URL(url);
		host = u.hostname.toLowerCase();
		path = u.pathname || "/";
	} catch {
		return false;
	}
	if (CHECKOUT_SUBDOMAIN_REGEX.test(host)) return true;
	if (path === "/" || path === "") return false; // homepage handled separately
	return CRITICAL_SURFACE_REGEX_LIST.some((p) => p.pattern.test(path));
}

/**
 * Returns true when the URL path looks like an error/system page that
 * should NEVER be in the crawl candidate list. We were emitting
 * copy_elements + page_content + findings for /404 pages, producing
 * noisy "missing h1" / "low word count" findings that were the error
 * page itself, not real customer copy.
 */
export function isErrorOrSystemPath(url: string): boolean {
	let path: string;
	try {
		path = new URL(url).pathname.toLowerCase();
	} catch {
		path = url.toLowerCase();
	}
	return ERROR_PATH_REGEX.test(path);
}

// ──────────────────────────────────────────────
// Internal — path catalogs
// ──────────────────────────────────────────────

/** Always relevant regardless of model — trust / policy / company. */
const UNIVERSAL_PATHS = [
	"/about", "/sobre", "/quem-somos", "/sobre-nos", "/sobre-nosotros", "/about-us",
	"/contact", "/contato", "/contacto", "/fale-conosco",
	"/privacy", "/privacy-policy", "/politica-de-privacidade", "/privacidade", "/privacidad",
	"/terms", "/terms-of-service", "/termos", "/termos-de-uso", "/terminos",
];

const SAAS_PATHS = [
	"/pricing", "/precos", "/preco", "/preços", "/planos", "/plans", "/precios", "/planes",
	"/signup", "/sign-up", "/register", "/cadastro", "/registro",
	"/login", "/sign-in", "/signin", "/entrar",
	"/get-started", "/comece", "/comece-agora", "/empezar",
	"/demo", "/request-demo", "/agendar-demo", "/solicitar-demo",
	"/trial", "/teste-gratis", "/teste-gratuito", "/prueba-gratis",
	"/features", "/recursos", "/funcionalidades", "/caracteristicas",
	"/docs", "/documentation", "/help", "/help-center", "/ajuda", "/central-de-ajuda", "/ayuda",
	"/integrations", "/integracoes", "/integraciones",
	"/api",
	"/changelog",
	"/customers", "/clientes",
	"/case-studies", "/cases",
];

const ECOMMERCE_PATHS = [
	"/cart", "/carrinho", "/carro", "/carrito", "/basket",
	"/checkout", "/finalizar-compra", "/finalizar", "/pagamento", "/payment",
	"/account", "/minha-conta", "/conta", "/mi-cuenta",
	"/login", "/entrar",
	"/shop", "/loja", "/tienda", "/store",
	"/sale", "/promocao", "/ofertas", "/promociones",
	"/shipping", "/frete", "/envio", "/entrega",
	"/returns", "/devolucoes", "/trocas", "/devoluciones",
	"/refund-policy", "/politica-de-troca", "/politica-de-devolucao",
	"/track-order", "/rastrear-pedido", "/rastreio",
];

const LEAD_GEN_PATHS = [
	"/contact", "/contato", "/contacto", "/fale-conosco",
	"/schedule", "/book", "/book-a-call", "/agendar", "/agendar-reuniao", "/agendar-consulta",
	"/quote", "/orcamento", "/cotacao", "/solicitar-orcamento", "/cotizacion",
	"/services", "/servicos", "/serviços", "/servicios", "/solutions", "/solucoes", "/soluciones",
	"/case-studies", "/cases", "/portfolio", "/projetos", "/projects", "/clientes",
	"/team", "/equipe", "/equipo", "/nossa-equipe",
	"/blog", "/insights", "/recursos", "/resources",
];

const HYBRID_PATHS = [
	"/pricing", "/precos", "/planos",
	"/checkout", "/cart", "/carrinho",
	"/signup", "/cadastro",
	"/login", "/entrar",
	"/contact", "/contato",
	"/features", "/recursos",
	"/about", "/sobre",
];

/**
 * Used by the shallow_plus homepage-link filter. Single regex with
 * alternations across en/pt/es. Word fragments must be substring
 * matches (no anchors) because the haystack is `path + link_text` and
 * link text often embeds the keyword as a verb (e.g. "Comprar agora").
 */
const HIGH_VALUE_REGEX = new RegExp(
	[
		// Conversion
		"checkout", "finalizar-compra", "finalizar", "pagamento",
		"cart", "carrinho", "carro", "carrito",
		"pricing", "preco", "precos", "preço", "planos", "plans", "precios", "planes",
		"compra", "comprar", "buy", "shop", "loja", "tienda",
		"signup", "sign-up", "register", "cadastro", "registro",
		"login", "signin", "sign-in", "entrar",
		"demo", "trial", "teste-gratis", "prueba",
		"contact", "contato", "contacto", "agendar", "schedule", "book",
		"quote", "orcamento", "cotacao",
		// Subdomain-only hints — common for pt-BR info-product / SaaS
		// platforms (Hotmart, Kiwify, Eduzz, Monetizze, Hubla) that
		// host checkout on `seguro.X`, `pay.X`, `cobranca.X`. These
		// tokens never show up in nav-link path components but DO show
		// up in the hostname when we concat host into the haystack.
		"seguro", "secure", "pay\\.", "cobranca", "cobrança", "gateway", "billing", "order\\.",
		// Trust + company
		"privacy", "privacidade", "privacidad",
		"terms", "termos", "terminos",
		"refund", "shipping", "frete", "envio", "devolucao", "trocas",
		"about", "sobre", "company", "empresa",
		"support", "suporte", "ajuda", "ayuda", "help",
		"faq", "perguntas-frequentes", "preguntas",
	].join("|"),
	"i",
);

/**
 * Pages we never want to crawl as content. Error pages, system endpoints,
 * RSS feeds, search result pages (infinite combinations), and other
 * meta surfaces. These show up via internal links and produce noisy
 * findings if treated as real customer copy.
 */
const ERROR_PATH_REGEX = new RegExp(
	[
		"^/404", "^/500", "^/error", "^/not-found", "^/page-not-found",
		"^/erro", "^/nao-encontrado",
		"^/sitemap", "^/robots\\.txt", "^/feed", "^/rss",
		"^/search", "^/busca", "^/buscar",
		"^/wp-admin", "^/wp-login", "^/admin",
		"^/cdn-cgi/", "^/__/",
	].join("|"),
	"i",
);

function normalizeBusinessModel(model?: string | null): BusinessModelHint | null {
	if (!model) return null;
	const m = model.toLowerCase().trim();
	if (
		m === "saas" ||
		m === "ecommerce" ||
		m === "lead_gen" ||
		m === "services" ||
		m === "hybrid"
	) {
		return m as BusinessModelHint;
	}
	return null;
}
