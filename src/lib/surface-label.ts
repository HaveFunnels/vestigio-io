// ──────────────────────────────────────────────
// Surface label humanizer — Wave 23.2
//
// Surface vem cru de packages/projections/engine.ts INFERENCE_SURFACES
// em formato "developer-facing":
//   "/ (sitewide security headers)"
//   "/checkout, /pricing"
//   "/checkout → /policy → abandonment (behavioral)"
//   "/cart → /checkout"
//
// Customer-facing pt-BR (output dessa lib):
//   "Site inteiro · cabeçalhos de segurança"
//   "Checkout + Página de preços"
//   "Checkout → Políticas → abandono"
//   "Carrinho → Checkout"
//
// Estratégia:
//   1. Strip parenthetical (parse + opcionalmente traduz pra subtítulo)
//   2. Split arrows "→" — vira "→" no display também
//   3. Split commas — vira "+" (lista de páginas)
//   4. Cada path resolved via dicionário SURFACE_LABEL_PT_BR
//   5. Path desconhecido — mostra path cru (fallback)
//
// Parenthetical: descartado SE não traduzível (jargão técnico tipo
// "behavioral", "JS-discovered variant"). Quando traduzível, anexa via
// ` · subtitle`.
//
// Customer report: "/ (sitewide security headers)" aparecia literal +
// em inglês em vários surfaces (Por página view, finding cards,
// drawers). Esta lib é a single source of truth pra resolução de
// labels — call sites importam de aqui.
// ──────────────────────────────────────────────

const SURFACE_LABEL_PT_BR: Record<string, string> = {
	"/": "Site inteiro",
	"/pricing": "Página de preços",
	"/checkout": "Checkout",
	"/cart": "Carrinho",
	"/signup": "Cadastro",
	"/login": "Login",
	"/dashboard": "Dashboard",
	"/app": "App autenticado",
	"/about": "Página sobre",
	"/contact": "Página de contato",
	"/blog": "Blog",
	"/faq": "FAQ",
	"/policies": "Políticas",
	"/policy": "Políticas",
	"/product": "Página de produto",
	"/products": "Página de produtos",
	"/item": "Página de produto",
	"/p": "Página de produto",
	"/plans": "Página de planos",
	"/thank-you": "Pós-compra",
	"/billing": "Cobrança",
	"/account": "Conta",
	"/help": "Ajuda",
	"/support": "Suporte",
	"/api": "API",
	"/order": "Pedido",
	"/invoice": "Fatura",
	"/discount": "Desconto",
	"/refund": "Reembolso",
	"/coupon": "Cupom",
	"/promo": "Promoção",
	"/payment": "Pagamento",
	external: "Domínio externo",
	abandonment: "abandono",
	backtrack: "volta",
};

// Parentheticals traduzíveis. Os ausentes são descartados (jargão técnico).
const PARENTHETICAL_LABEL_PT_BR: Record<string, string> = {
	sitewide: "site inteiro",
	"sitewide security headers": "cabeçalhos de segurança",
	"sitewide measurement": "rastreamento de mensuração",
	"sitewide brand consistency": "consistência de marca",
	"sitewide regression": "regressão recente",
	"sitewide email infrastructure": "infraestrutura de email",
	"external brand domains": "domínios externos imitando a marca",
	"external impersonation": "domínios externos imitando",
	"typosquat domains": "domínios com erros de digitação",
	"impostor storefronts": "lojas falsas",
	"phishing domains": "domínios de phishing",
	"domain variant fragmentation": "fragmentação de domínio",
	"language switch": "mudança de idioma",
	"language break": "quebra de idioma",
	"redirect chain": "cadeia de redirects",
	orphaned: "páginas órfãs",
	"embedded content": "conteúdo embutido",
	"platform-specific": "plataforma",
	"measurement gap": "lacuna de mensuração",
	refund: "reembolso",
	"refund process": "processo de reembolso",
	"trust surface": "superfície de confiança",
	"consent × analytics": "consentimento × analytics",
	mobile: "mobile",
	"mobile trust": "confiança no mobile",
	runtime: "execução",
	"runtime measurement": "mensuração em execução",
	"alternate flow": "fluxo alternativo",
	confirmation: "confirmação",
	"support gap": "lacuna de suporte",
	"widget failure": "falha de widget",
	"compound trust+measurement": "confiança + mensuração",
	"script exposure": "exposição de scripts",
	"channel diversion": "desvio de canal",
	"operational exposure": "exposição operacional",
	"trust posture": "postura de confiança",
	"brittle infrastructure": "infraestrutura frágil",
	"alternate variants": "variantes alternativas",
	"hidden routes": "rotas escondidas",
	"deep discovery": "descoberta profunda",
	guessable: "URLs adivinháveis",
	"api latency": "latência de API",
	"third-party weight": "peso de terceiros",
	"dependency reliability": "confiabilidade de dependências",
	"request failures": "falhas em requests",
	"dependency sequencing": "ordem de dependências",
	"trust timing": "timing de confiança",
	"mobile runtime": "execução no mobile",
	"mobile dependencies": "dependências no mobile",
	"trust dependency reliability": "dependências de confiança",
	"search snippets": "snippets de busca",
	"social sharing": "compartilhamento social",
	indexing: "indexação",
	"structured data": "dados estruturados",
	"preview content mismatch": "preview vs conteúdo",
	"internal linking": "linkagem interna",
	onboarding: "ativação",
	"in-product": "in-product",
	navigation: "navegação",
	billing: "billing",
	"cross-surface": "entre páginas",
	abandonment: "abandono",
	behavioral: "comportamental",
	"cta hesitation, behavioral": "hesitação no CTA",
	"backtrack, behavioral": "volta antes da conversão",
	"form friction, behavioral": "fricção em formulário",
	"form retry, behavioral": "tentativa de reenvio",
	"input abandonment, behavioral": "abandono de campo sensível",
	"sensitive field dropoff, behavioral": "abandono em campo sensível",
	"final step retry, behavioral": "tentativa no último passo",
	"immediate abandon, behavioral": "abandono imediato",
	"retries, behavioral": "tentativas repetidas",
	"oscillation between surfaces, behavioral": "indecisão entre páginas",
	"cta render timing, behavioral": "timing do CTA",
	"cta visibility vs engagement, behavioral": "CTA visível mas sem ação",
	"funnel bottleneck, behavioral": "gargalo do funil",
	"mobile entry, behavioral": "entrada no mobile",
	"cta engagement, behavioral": "engajamento com CTA",
	"alternate pricing path": "preço alternativo",
	"js-discovered variant": "variante via JavaScript",
	"compound control failure": "falha de controle composta",
	"deep exploitation": "exploração profunda",
	"sequential urls": "URLs sequenciais",
	"cors headers": "cabeçalhos CORS",
	"rate limiting": "rate limit",
	"clickjack protection": "proteção contra clickjacking",
	"form targets": "destino do formulário",
	"error responses": "respostas de erro",
	"cookie security": "segurança de cookies",
	"external scripts": "scripts externos",
	"trust language": "linguagem de confiança",
	"cta clarity": "clareza do CTA",
	"product copy": "copy de produto",
	"plan framing": "framing dos planos",
	inventory: "estoque",
	refunds: "reembolsos",
	"testimonials, reviews": "depoimentos e reviews",
	"form errors": "erros de formulário",
	"dynamic routes, weak governance": "rotas dinâmicas",
	"disconnected from journey": "desconectado da jornada",
	"untracked alternate": "fluxo não rastreado",
	provider: "provedor",
	"untrusted embeds": "embeds não confiáveis",
	"landing page runtime": "execução da landing",
	"context mismatch": "contexto inconsistente",
	"multi-exposure pattern": "exposição múltipla",
	"abuse conditions": "condições de abuso",
	"business-logic abuse": "abuso de lógica de negócio",
};

function translateParenthetical(raw: string): string | null {
	const lower = raw.trim().toLowerCase();
	if (PARENTHETICAL_LABEL_PT_BR[lower]) return PARENTHETICAL_LABEL_PT_BR[lower];
	// Fallback: split por vírgula + traduz cada
	if (lower.includes(",")) {
		const parts = lower
			.split(",")
			.map((p) => translateParenthetical(p.trim()))
			.filter(Boolean);
		if (parts.length > 0) return parts.join(", ");
	}
	return null;
}

function renderPath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed) return "";

	// Arrows "→" first — fluxo entre páginas
	if (trimmed.includes("→")) {
		return trimmed
			.split("→")
			.map((s) => renderPath(s.trim()))
			.join(" → ");
	}
	// Commas — lista de páginas (não é fluxo entre elas)
	if (trimmed.includes(",")) {
		return trimmed
			.split(",")
			.map((s) => renderPath(s.trim()))
			.join(" + ");
	}
	// Lookup direto
	if (SURFACE_LABEL_PT_BR[trimmed]) return SURFACE_LABEL_PT_BR[trimmed];
	// Lookup case-insensitive (alguns surfaces vêm com casing inconsistente)
	const lower = trimmed.toLowerCase();
	if (SURFACE_LABEL_PT_BR[lower]) return SURFACE_LABEL_PT_BR[lower];
	// Fallback: path cru
	return trimmed;
}

/**
 * Humaniza um surface raw vindo de packages/projections/engine.ts
 * pra display customer-facing em pt-BR. Single source of truth — todos
 * os call sites (NextSteps "Por página" view, finding cards, drawers,
 * detail panels) devem importar daqui em vez de renderizar o surface
 * raw.
 */
export function humanizeSurfaceLabel(surface: string): string {
	const trimmed = surface.trim();
	if (!trimmed) return "";

	// 1. Extract parenthetical (se houver)
	const parenMatch = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
	const corePath = parenMatch ? parenMatch[1].trim() : trimmed;
	const parenRaw = parenMatch ? parenMatch[2].trim() : null;
	const parenTranslated = parenRaw ? translateParenthetical(parenRaw) : null;

	// 2. Process the core path
	let coreLabel = renderPath(corePath);

	// 3. Anexa parenthetical traduzido como subtítulo natural
	if (parenTranslated) {
		coreLabel = `${coreLabel} · ${parenTranslated}`;
	}
	return coreLabel;
}
