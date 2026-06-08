import type { ParsedPage } from "./parser";
import type { HttpResponse } from "./http-client";
import {
	estimateMiniImpact,
	type MiniImpact,
	type MiniBusinessInputs,
} from "../../packages/impact/mini-impact";

// ──────────────────────────────────────────────
// Mini-Audit Findings Deriver
//
// Converts a single-page Stage A crawl + optional checkout HEAD probe
// into up to 5 negative findings + positive findings + 10 blurred
// placeholders for the /lp/audit result page.
//
// Vestigio-flavor rules (different from generic site-scan tools):
//   - Every negative finding CORRELATES ≥ 2 pieces of evidence. A
//     single regex match is not a finding — it's a signal. Findings
//     say "we see X AND Y, which predicts Z%".
//   - Every negative finding carries a BRL impact range derived from
//     the lead's self-declared revenue + AOV. No generic percentages
//     dressed up as money.
//   - Baseline language references "21.000+ lojas auditadas e quanto
//     faturam" — the internal Vestigio corpus. This copy is locked in
//     until we revisit the actual sample size.
//   - No SEO findings. Never mention meta descriptions, alt tags,
//     page titles as SEO. Even when the underlying signal is
//     SEO-adjacent, frame it as conversion / trust / UX cost.
//   - 5 findings ALWAYS returned, deterministically. If the heuristics
//     don't detect a problem, positive fallbacks fill the rest so the
//     page is never thin.
//   - Confidence is NOT exposed in the output. Severity stays coarse:
//     critical / high / medium / positive.
//
// Ordered by detected severity (critical first) before slice to 5.
// ──────────────────────────────────────────────

export type MiniFindingSeverity = "critical" | "high" | "medium" | "positive";

/**
 * Shared baseline copy fragment — every negative finding quotes this
 * to signal "we compare you to a real corpus, not made-up stats".
 * If the corpus size materially changes, update this one string; all
 * finding bodies already reference it by interpolation.
 */
const BASELINE_CORPUS_PT = "Baseline: 21.000+ lojas auditadas pela Vestigio";

export interface MiniFinding {
	id: string;
	severity: MiniFindingSeverity;
	category: MiniFindingCategory;
	title: string;
	body: string; // shown when expanded
	impact_hint: string; // short phrase like "~25% drop"
	/**
	 * Actionable remediation suggestion shown in the "Como corrigir"
	 * section of the result page. Null for positive findings.
	 */
	suggestion?: string | null;
	/**
	 * BRL impact range derived from the lead's declared revenue+AOV.
	 * Null for positive findings (nothing lost), and for rare legacy
	 * detectors without a mapped inference_key.
	 */
	impact?: MiniImpact | null;
	/**
	 * Which evidence each finding correlated. The result page can
	 * optionally surface this to sell the "we looked at X + Y" angle.
	 * Keep ≤ 3 items, each <40 chars.
	 */
	evidence_refs?: string[];
}

export interface BlurredFinding {
	id: string;
	category: MiniFindingCategory;
	teaser_title: string; // shown blurred behind the lock icon
}

export type MiniFindingCategory =
	| "trust"
	| "cta"
	| "friction"
	| "checkout"
	| "performance"
	| "structure"
	| "mobile"
	| "policy";

export interface MiniAuditFindings {
	visible: MiniFinding[]; // exactly 5
	blurred: BlurredFinding[]; // exactly 10
}

/**
 * Optional extra evidence gathered outside the initial fetch. Populated
 * by run-mini-audit.ts when the lead's conversionModel warrants an
 * extra probe (e.g. checkout on-path).
 */
export interface MiniAuditProbes {
	/** HTTP status of /checkout or /cart, null if we didn't probe. */
	checkout_status?: number | null;
	/** Final URL after probe redirects (for off-domain detection). */
	checkout_final_url?: string | null;
}

interface DeriveInput {
	parsed: ParsedPage;
	response: HttpResponse;
	rawHtml: string;
	/** Self-declared from the /lp form. Drives BRL impact calc. */
	business: MiniBusinessInputs;
	/** Optional extra checks. */
	probes?: MiniAuditProbes;
	/** The lead's domain root, e.g. "store.com" — used for off-domain check. */
	domain: string;
}

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

function severityToImpactSeverity(
	s: MiniFindingSeverity,
): "high" | "medium" | "low" {
	if (s === "critical" || s === "high") return "high";
	if (s === "medium") return "medium";
	return "low"; // positive shouldn't call this but map safely
}

/**
 * Attach a BRL impact range to a negative finding. Lookup by
 * inference_key against the real IMPACT_BASELINES corpus so the
 * numbers are derived from the same percentages the full engine uses.
 */
function withImpact(
	finding: Omit<MiniFinding, "impact">,
	inferenceKey: string,
	business: MiniBusinessInputs,
): MiniFinding {
	if (finding.severity === "positive") {
		return { ...finding, impact: null };
	}
	const impact = estimateMiniImpact(
		inferenceKey,
		severityToImpactSeverity(finding.severity),
		business,
	);
	return { ...finding, impact };
}

/**
 * Safe hostname extraction. Returns the URL's hostname or a sane
 * fallback when the input isn't a valid absolute URL. Used by
 * detectors that interpolate the host into evidence/body copy —
 * a thrown TypeError there would silently lose the whole finding
 * via the per-detector try/catch.
 */
function safeHostname(url: string | null | undefined, fallback = "unknown"): string {
	if (!url) return fallback;
	try {
		return new URL(url).hostname;
	} catch {
		return fallback;
	}
}

/**
 * Cheap off-domain check — does URL's host share the lead's root domain?
 * Accepts subdomains ("pay.store.com" is still on-domain for "store.com").
 *
 * Important: uses `host === root || host.endsWith("." + root)` rather
 * than the naive `host.endsWith(root)`, because the naive form would
 * false-match `mystore.com` as on-domain for `store.com` — and worse,
 * `paystore.com.br` as on-domain for `store.com.br`. The dot prefix
 * is what distinguishes a subdomain from a partial-suffix collision.
 */
function isOffDomain(url: string, rootDomain: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase();
		const root = rootDomain.toLowerCase().replace(/^www\./, "");
		return !(host === root || host.endsWith("." + root));
	} catch {
		return false;
	}
}

// ──────────────────────────────────────────────
// Heuristic detectors (inferential — ≥2 evidences each)
//
// Each detector returns a MiniFinding when its correlation fires, or
// null otherwise. Pipeline collects non-nulls, sorts by severity,
// slices to 5.
// ──────────────────────────────────────────────

type Detector = (input: DeriveInput) => MiniFinding | null;

// ── 1. Revenue path fragility ─────────────────
// Correlates: (a) checkout hop is off-domain OR (b) checkout path
// returns 4xx/5xx when probed. Either, combined with no trust badge
// text above the fold, flags a fragile commercial path.
const detectRevenuePathFragility: Detector = ({
	parsed,
	probes,
	domain,
	business,
}) => {
	const checkoutStatus = probes?.checkout_status ?? null;
	const checkoutFinalUrl = probes?.checkout_final_url ?? null;

	const checkoutBroken = checkoutStatus != null && checkoutStatus >= 400;
	const checkoutOffDomain =
		checkoutFinalUrl != null && isOffDomain(checkoutFinalUrl, domain);

	if (!checkoutBroken && !checkoutOffDomain) return null;

	// Trust continuity — if the page has no payment/secure-badge terms
	// near the CTAs, the off-domain hop hits a user who has no reason
	// to trust the next screen.
	const bodyLower = (parsed.body_text_snippet || "").toLowerCase();
	const hasTrustBadge =
		/ssl|secure payment|pagamento seguro|compra segura|ssl ativo|site seguro/i.test(
			bodyLower,
		);

	const severity: MiniFindingSeverity = checkoutBroken ? "critical" : "high";
	const evidence_refs = [
		checkoutBroken
			? `Checkout HTTP ${checkoutStatus}`
			: `Checkout off-domain (${safeHostname(checkoutFinalUrl)})`,
		hasTrustBadge
			? "Trust badge presente no topo"
			: "Sem trust badge visível no topo",
	];

	const title = checkoutBroken
		? `Rota de checkout está quebrada (HTTP ${checkoutStatus})`
		: `Checkout sai do seu domínio sem continuidade de confiança`;

	const body = checkoutBroken
		? `Quando probamos a rota de checkout, ela retornou HTTP ${checkoutStatus}. Em 100% das tentativas, o cliente não chega no gateway — é revenue bloqueado na última etapa. ${BASELINE_CORPUS_PT} mostra esse padrão associado a queda imediata de conclusão de compra.`
		: `Seu checkout roda em domínio externo e sua landing não tem reforço de confiança ("pagamento seguro", "SSL ativo") no topo. ${BASELINE_CORPUS_PT}: essa combinação reduz em 10% a 25% a conclusão de compra em lojas com AOV entre R$100 e R$500 — o visitante pausa na transição para revalidar se está no lugar certo.`;

	return withImpact(
		{
			id: "mini_revenue_path_fragile",
			severity,
			category: "checkout",
			title,
			body,
			impact_hint: checkoutBroken
				? "Checkout inacessível — perda direta"
				: "10-25% de queda no momento de pagamento",
			suggestion: checkoutBroken
				? "Verifique se a rota /checkout ou /cart do seu site está acessível. Teste em modo anônimo. Se usa plataforma terceira, confirme que a integração está ativa e as credenciais válidas."
				: "Adicione selos de segurança ('Pagamento Seguro', 'SSL Ativo') visíveis acima do fold na sua landing. Se o checkout é externo, mantenha consistência visual (logo, cores) na página de destino.",
			evidence_refs,
		},
		checkoutBroken ? "critical_path_broken" : "trust_boundary_crossed",
		business,
	);
};

// ── 2. Trust composite weakness ─────────────────
// Correlates: (a) no LGPD/privacy mention + (b) no refund/return
// mention + (c) no contact surface. Each alone is weak; together
// they predict trust-driven abandonment in carts >R$300.
const detectTrustComposite: Detector = ({ parsed, rawHtml, business }) => {
	const lower = rawHtml.toLowerCase();

	// Signal 1: privacy/LGPD
	const hasPrivacy = /(política\s+de\s+privacidade|privacy\s+policy|lgpd|gdpr)/i.test(
		lower,
	);

	// Signal 2: refund/return mention
	const hasRefund = /(política\s+de\s+(trocas?|reembolso|devolu)|refund\s+policy|return\s+policy|garantia)/i.test(
		lower,
	);

	// Signal 3: contact surface (phone, email, contact page, WhatsApp)
	const hasContact =
		/(whatsapp|wa\.me|fale\s+conosco|contato|contact\s+us|support@|atendimento)/i.test(
			lower,
		) ||
		parsed.links.some((l) => {
			const href = (l.href || "").toLowerCase();
			return (
				href.startsWith("mailto:") ||
				href.startsWith("tel:") ||
				href.includes("/contato") ||
				href.includes("/contact")
			);
		});

	const missingCount = [hasPrivacy, hasRefund, hasContact].filter(
		(v) => !v,
	).length;

	// Fire only when at least 2 of 3 trust markers are missing. One
	// missing is recoverable noise; two is a pattern.
	if (missingCount < 2) return null;

	const missing: string[] = [];
	if (!hasPrivacy) missing.push("política de privacidade/LGPD");
	if (!hasRefund) missing.push("política de trocas/devolução");
	if (!hasContact) missing.push("canal de contato direto");

	const severity: MiniFindingSeverity = missingCount === 3 ? "high" : "medium";
	const aov = business.average_ticket;
	const aovLine =
		aov != null && aov >= 300
			? ` Seu AOV declarado (R$ ${aov.toFixed(0)}) está na faixa em que o efeito se intensifica — quanto maior o ticket, mais peso a confiança tem no momento de decidir pagar.`
			: "";

	return withImpact(
		{
			id: "mini_trust_composite",
			severity,
			category: "trust",
			title: `Confiança composta fraca: ${missing.length} sinais ausentes`,
			body: `Seu site não expõe ${missing.join(", ")}. Isoladamente, cada um desses é ignorável — a combinação é o sinal. ${BASELINE_CORPUS_PT}: lojas com 2+ desses marcadores ausentes têm taxa de abandono consistentemente maior no momento da decisão de compra.${aovLine}`,
			impact_hint: "Combinação sinaliza abandono em fase de decisão",
			suggestion: "Crie páginas dedicadas de Política de Privacidade, Política de Trocas/Devolução e uma página de Contato com email, telefone ou WhatsApp. Linke no footer de todas as páginas. O rodapé é onde o visitante busca essas informações antes de comprar.",
			evidence_refs: missing.slice(0, 3),
		},
		"policy_gap",
		business,
	);
};

// ── 3. CTA below the fold (inferential) ─────────
// Correlates: (a) no commercial verb in first 8KB of body HTML + (b)
// page has ≥5 outbound links (so it's not a coming-soon stub).
const detectCtaBelowFold: Detector = ({ rawHtml, parsed, business }) => {
	const bodyStart = rawHtml.search(/<body[^>]*>/i);
	if (bodyStart === -1) return null;
	const aboveFold = rawHtml.slice(bodyStart, bodyStart + 8000).toLowerCase();

	const aboveFoldCtas = [
		"buy", "comprar", "sign up", "signup", "cadastr",
		"get started", "começar", "start free", "trial", "demo",
		"add to cart", "adicionar ao carrinho", "assinar", "reservar",
	];
	const ctaPresent = aboveFoldCtas.some((c) => aboveFold.includes(c));
	const linkCount = parsed.links.length;

	if (ctaPresent || linkCount < 5) return null;

	return withImpact(
		{
			id: "mini_cta_below_fold",
			severity: "critical",
			category: "mobile",
			title: "CTA principal abaixo da dobra no mobile",
			body: `Nos primeiros 8KB do HTML da sua página (aproximadamente o que cabe na dobra mobile de 375px) não encontramos nenhum verbo comercial forte. A página tem ${linkCount} links, então não é uma "em construção" — é que o CTA de compra está posicionado mais abaixo. ${BASELINE_CORPUS_PT}: ~60% dos visitantes mobile nunca rolam. Se o CTA não está visível no primeiro render, essa fração simplesmente não sabe o que você vende.`,
			impact_hint: "~60% do tráfego mobile nunca vê abaixo da dobra",
			suggestion: "Mova seu CTA principal (botão de compra, WhatsApp ou formulário) para acima da dobra — visível sem scroll. Use um verbo de ação direto no botão. Teste em celular: o botão precisa aparecer na primeira tela.",
			evidence_refs: [
				"Sem verbo comercial nos primeiros 8KB",
				`${linkCount} links na página (não é stub)`,
			],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 4. Competing primary CTAs ─────────────────
const detectCompetingCtas: Detector = ({ parsed, business }) => {
	const ctaVerbs = [
		"buy now", "comprar", "add to cart", "adicionar ao carrinho",
		"sign up", "signup", "cadastrar", "get started", "começar",
		"start free", "free trial", "trial", "book a demo", "agendar",
		"book now", "reserve", "reservar", "join now",
	];
	const ctaLinkCount = parsed.links.filter((link) => {
		const text = (link.text || "").toLowerCase();
		return ctaVerbs.some((v) => text.includes(v));
	}).length;

	if (ctaLinkCount < 3) return null;

	// Correlate with form count — if page has multiple forms AND
	// multiple CTAs, the fragmentation is worse (user has 2 axes of
	// confusion). Bump severity to critical in that case.
	const formCount = parsed.forms.length;
	const severity: MiniFindingSeverity =
		ctaLinkCount >= 4 && formCount >= 2 ? "critical" : "high";

	return withImpact(
		{
			id: "mini_competing_ctas",
			severity,
			category: "cta",
			title: `${ctaLinkCount} CTAs primários competindo na mesma página`,
			body: `Detectamos ${ctaLinkCount} CTAs com verbos de ação comercial forte ("comprar", "cadastrar", "começar") no mesmo layout${formCount >= 2 ? `, com ${formCount} formulários ativos` : ""}. ${BASELINE_CORPUS_PT}: páginas com mais de 1 CTA primário reduzem conversão em cerca de 25% — o visitante pausa para escolher e muitos saem sem clicar em nenhum.`,
			impact_hint: "~25% de queda na conversão por competição de CTAs",
			suggestion: "Defina UM CTA primário por seção da página. Reduza os CTAs secundários em tamanho e destaque visual. O visitante deve saber exatamente qual botão clicar sem pensar.",
			evidence_refs: [
				`${ctaLinkCount} CTAs comerciais detectados`,
				formCount >= 2 ? `${formCount} formulários ativos` : "1 formulário primário",
			],
		},
		"friction_on_critical_path",
		business,
	);
};

// ── 5. Vague CTA copy ─────────────────
const detectVagueCta: Detector = ({ parsed, business }) => {
	const vaguePhrases = [
		"learn more", "saiba mais", "click here", "clique aqui",
		"read more", "leia mais", "more info", "mais informa",
		"submit", "enviar", "continue", "continuar",
	];
	const vagueLinks = parsed.links.filter((link) => {
		const text = (link.text || "").toLowerCase().trim();
		return vaguePhrases.some((p) => text === p || text === p + " →" || text === p + ">");
	});

	if (vagueLinks.length < 1) return null;

	const example = vagueLinks[0].text || "Saiba mais";

	return withImpact(
		{
			id: "mini_vague_cta",
			severity: "medium",
			category: "cta",
			title: `Seu CTA diz "${example}" — verbo que não vende`,
			body: `Verbos como "saiba mais" e "clique aqui" estão entre os CTAs de pior performance já medidos. Verbos específicos ("Ver meu plano", "Começar teste de 14 dias") convertem cerca de 90% mais porque dizem ao visitante exatamente o que ele vai receber e o que acontece depois. ${BASELINE_CORPUS_PT}: trocar 1 CTA vago por 1 específico é uma das mudanças de maior retorno-sobre-esforço que a gente vê.`,
			impact_hint: "~90% de lift ao trocar por verbo específico",
			suggestion: "Substitua textos genéricos como 'Saiba mais' e 'Clique aqui' por verbos de ação específicos: 'Comprar agora', 'Agendar demonstração', 'Começar teste grátis'. O botão deve dizer exatamente o que acontece ao clicar.",
			evidence_refs: [
				`CTA detectado: "${example}"`,
				`${vagueLinks.length} CTA(s) vago(s) total`,
			],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 6. Form friction overload ─────────────────
const detectFormFriction: Detector = ({ parsed, business }) => {
	const formCount = parsed.forms.length;
	if (formCount < 3) return null;

	return withImpact(
		{
			id: "mini_form_friction",
			severity: "high",
			category: "friction",
			title: `${formCount} formulários competindo numa única página`,
			body: `Sua landing tem ${formCount} formulários ativos (newsletter, contato, busca, login, etc.). Múltiplos formulários na mesma página geram fadiga de decisão — o visitante não sabe qual importa e a maioria sai sem preencher nenhum. ${BASELINE_CORPUS_PT}: landings de alta conversão têm um único formulário primário por scroll view.`,
			impact_hint: "Fricção composta reduz conversão em ~40%",
			suggestion: "Reduza para 1 formulário principal por página. Mova formulários secundários (newsletter, busca) para o footer ou páginas dedicadas. O formulário que resta deve ter o menor número de campos possível.",
			evidence_refs: [`${formCount} formulários detectados`],
		},
		"friction_on_critical_path",
		business,
	);
};

// ── 7. Missing analytics/tracking ─────────────
const detectMissingAnalytics: Detector = ({ rawHtml, parsed, business }) => {
	const lower = rawHtml.toLowerCase();
	const hasGA = /gtag|google-analytics|googletagmanager|ga\.js|analytics\.js/i.test(lower);
	const hasGTM = /gtm\.js|gtm\.start/i.test(lower);
	const hasPixel = /fbq\(|facebook\.net\/|connect\.facebook/i.test(lower);
	const hasAnalyticsScript = parsed.scripts.some(
		(s) => /google-analytics|googletagmanager|facebook\.net|hotjar|clarity\.ms|segment\.com|mixpanel|amplitude/i.test(s.src),
	);

	if (hasGA || hasGTM || hasPixel || hasAnalyticsScript) return null;

	return withImpact(
		{
			id: "mini_missing_analytics",
			severity: "high",
			category: "structure",
			title: "Você pode estar escalando o canal que mais te faz perder",
			body: `Sem pixel nem analytics no HTML, cada real investido em mídia paga vai pro mesmo balde: você não consegue separar o canal que vende do canal que só queima orçamento. O risco real não é "atribuição imperfeita" — é multiplicar o investimento exatamente no canal que tá perdendo dinheiro, porque ele parece estar trazendo tráfego.`,
			impact_hint: "Mídia paga rolando sem como medir qual canal dá retorno",
			suggestion: "Instale Google Tag Manager + GA4 com eventos de compra/lead/clique no WhatsApp. Se roda Meta ou Google Ads, adicione o pixel correspondente. Setup leva ~30 min; o ROI desbloqueia a primeira decisão real de realocar verba.",
			evidence_refs: ["Sem GA/GTM no HTML", "Sem Meta Pixel", "Sem scripts de analytics"],
		},
		"measurement_coverage",
		business,
	);
};

// ── 8. Images without lazy loading ────────────
const detectNoLazyImages: Detector = ({ rawHtml, business }) => {
	const imgTags = rawHtml.match(/<img\b[^>]*>/gi) || [];
	if (imgTags.length < 5) return null;

	const lazyCount = imgTags.filter((tag) => /loading\s*=\s*["']lazy["']/i.test(tag)).length;
	const nonLazyCount = imgTags.length - lazyCount;

	if (nonLazyCount < 4) return null;

	return withImpact(
		{
			id: "mini_no_lazy_images",
			severity: "medium",
			category: "performance",
			title: `${nonLazyCount} de ${imgTags.length} imagens carregam de uma vez`,
			body: `Sua página tem ${imgTags.length} imagens e apenas ${lazyCount} usam lazy loading. Todas as imagens são baixadas imediatamente, mesmo as que estão fora da tela, travando o carregamento e aumentando o tempo de interação. Cada segundo adicional de load time reduz conversão em ~7%.`,
			impact_hint: "Lentidão percebida ↑ abandono mobile",
			suggestion: "Adicione loading='lazy' em todas as <img> abaixo da dobra. Mantenha apenas as imagens visíveis no primeiro viewport com carregamento imediato. Em WordPress, ative lazy loading nativo. Em Shopify, o tema já suporta — verifique se está habilitado.",
			evidence_refs: [`${imgTags.length} <img> tags`, `${lazyCount} com lazy loading`],
		},
		"friction_on_critical_path",
		business,
	);
};

// ── 9. Weak meta description ──────────────────
const detectWeakMetaDescription: Detector = ({ parsed, business }) => {
	const desc = parsed.meta_description;
	if (desc && desc.length >= 50) return null;

	return withImpact(
		{
			id: "mini_weak_meta_desc",
			severity: "medium",
			category: "cta",
			title: desc ? "Seu snippet no Google não está vendendo" : "Google decide como apresentar sua página",
			body: desc
				? `Sua meta description tem apenas ${desc.length} caracteres ("${desc.slice(0, 60)}…"). Esse é o texto que aparece no Google quando alguém busca seu produto. Com uma descrição rasa, o clique vai pro concorrente que comunica valor em 160 caracteres. Cada clique perdido no orgânico é tráfego gratuito desperdiçado — receita que você não paga pra adquirir mas também não captura.`
				: `Sua página não declara meta description. O Google gera uma automaticamente cortando trechos aleatórios do HTML — raramente comunica seu diferencial. O resultado: seu concorrente com description otimizada captura o clique. Você perde tráfego gratuito que não custa nada adquirir.`,
			impact_hint: desc ? "Tráfego gratuito perdido pro concorrente" : "Você não controla sua vitrine no Google",
			suggestion: desc
				? "Reescreva a meta description com 120-160 caracteres. Inclua seu diferencial principal, uma prova (número de clientes, anos de mercado) e um CTA implícito. Pense nela como o anúncio gratuito da sua página no Google."
				: "Adicione uma tag <meta name='description'> com 120-160 caracteres no <head>. Descreva o que o visitante ganha ao clicar — não o que você faz, mas o que ele resolve. É seu anúncio gratuito no Google.",
			evidence_refs: desc ? [`${desc.length} chars — concorrentes usam 120-160`] : ["Google está escolhendo seu pitch de vendas"],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 10. Missing structured data ───────────────
const detectMissingStructuredData: Detector = ({ parsed, business }) => {
	if (parsed.structured_data.length > 0) return null;

	return withImpact(
		{
			id: "mini_no_structured_data",
			severity: "medium",
			category: "cta",
			title: "Invisível para rich snippets e AI agents",
			body: `Sua página não declara dados estruturados (JSON-LD). Enquanto concorrentes aparecem no Google com estrelas, preço e imagem no resultado de busca, o seu é texto puro. Rich snippets capturam 58% mais cliques — cada busca onde seu concorrente tem card visual e você não é receita perdida. Além disso, AI agents (ChatGPT, Gemini, Perplexity) priorizam páginas com Schema.org na hora de recomendar produtos.`,
			impact_hint: "Concorrentes com cards visuais roubam seus cliques",
			suggestion: "Adicione JSON-LD no <head> da página. Para e-commerce: use Schema Product (com preço e avaliação). Para serviços: use Schema LocalBusiness ou Organization. Para conteúdo: use FAQPage. Ferramentas como schema.org ou o Schema Markup Generator do Merkle geram o código automaticamente.",
			evidence_refs: ["Sem Schema.org", "Sem estrelas/preço no Google", "Invisível pra AI agents"],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 11. No social proof ───────────────────────
const detectNoSocialProof: Detector = ({ rawHtml, business }) => {
	const lower = rawHtml.toLowerCase();
	const proofPatterns = [
		/depoimento|testemunho|testimonial/,
		/avalia[çc][ãa]o|review|rating/,
		/cliente[s]?\s+(diz|fala|conta|recomend)/,
		/estrela[s]?\b/,
		/\b(4|5)\s*\/\s*5\b/,
		/trustpilot|reclame\s*aqui|google\s*reviews?/,
	];

	const hasProof = proofPatterns.some((p) => p.test(lower));
	if (hasProof) return null;

	return withImpact(
		{
			id: "mini_no_social_proof",
			severity: "high",
			category: "trust",
			title: "Nenhum sinal de prova social detectado",
			body: `Não encontramos depoimentos, avaliações, estrelas, ou menções a Trustpilot/Reclame Aqui na página. 92% dos consumidores leem avaliações antes de comprar. Sem prova social visível, cada visitante precisa confiar apenas na sua promessa — e a maioria não vai.`,
			impact_hint: "92% decidem baseado em reviews",
			suggestion: "Adicione pelo menos 3 depoimentos reais na landing page — com nome, foto e resultado concreto ('Aumentei 40% em 2 meses'). Se tiver avaliações em Google ou Reclame Aqui, mostre a nota com link. Depoimentos em vídeo convertem 2x mais que texto.",
			evidence_refs: ["Sem depoimentos", "Sem estrelas/ratings", "Sem plataformas de review"],
		},
		"no_social_proof",
		business,
	);
};

// ── 12. Redirect chain ────────────────────────
const detectRedirectChain: Detector = ({ response, business }) => {
	if (response.redirect_chain.length < 2) return null;

	return withImpact(
		{
			id: "mini_redirect_chain",
			severity: "medium",
			category: "performance",
			title: `Cada visitante mobile passa por ${response.redirect_chain.length} saltos antes de chegar`,
			body: `Pra abrir sua página, o navegador faz ${response.redirect_chain.length} pulos seguidos (${response.redirect_chain.map((r) => r.status_code).join(" → ")}). No desktop, ninguém percebe. No 3G/4G é diferente: a tela fica em branco por 1-2 segundos a mais, e cada salto é uma oportunidade nova pro visitante fechar a aba. Em campanhas de mídia paga, esse é o gap silencioso entre "tráfego pago" e "tráfego que de fato chega".`,
			impact_hint: "Aba mobile fecha antes de carregar",
			suggestion: "Resolva tudo em 1 salto direto. www→non-www ou HTTP→HTTPS faz no CDN/servidor sem rota intermediária. Em mobile, 1 salto a menos costuma valer 3-5% de visitantes a mais entrando.",
			evidence_refs: response.redirect_chain.slice(0, 3).map((r) => `${r.status_code} → ${safeHostname(r.url, r.url)}`),
		},
		"friction_on_critical_path",
		business,
	);
};

// ── 13. Missing canonical ─────────────────────
const detectMissingCanonical: Detector = ({ parsed, business }) => {
	if (parsed.canonical_url) return null;

	return withImpact(
		{
			id: "mini_missing_canonical",
			severity: "medium",
			category: "structure",
			title: "Autoridade da página diluída entre URLs duplicadas",
			body: `Sem <link rel="canonical">, o Google pode estar indexando 2, 3 ou mais versões da mesma página (www vs sem www, http vs https, com/sem barra final). Cada versão compete consigo mesma no ranking — em vez de uma página forte, você tem várias fracas. O tráfego orgânico que deveria chegar concentrado se dispersa, e cada variante duplicada é receita orgânica que você está dividindo com... você mesmo.`,
			impact_hint: "Suas páginas competem entre si no Google",
			suggestion: "Adicione <link rel='canonical' href='URL_PRINCIPAL'> no <head> de cada página. Use a versão HTTPS, sem www (ou com www — escolha uma e mantenha). A maioria dos CMSs (WordPress, Shopify) tem configuração nativa para isso.",
			evidence_refs: ["Canonical ausente — URLs podem estar duplicadas"],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 14. Thin content ──────────────────────────
const detectThinContent: Detector = ({ parsed, business }) => {
	if (parsed.body_word_count >= 300) return null;

	return withImpact(
		{
			id: "mini_thin_content",
			severity: "medium",
			category: "cta",
			title: `Página não tem argumento suficiente para fechar a venda`,
			body: `Sua landing tem apenas ${parsed.body_word_count} palavras. Para converter, uma página precisa endereçar objeções ("será que funciona?"), demonstrar valor ("o que ganho?"), provar com evidência ("quem mais usa?") e criar urgência ("por que agora?"). Com ${parsed.body_word_count} palavras, não há espaço para esse argumento. O visitante chega, não encontra razão pra agir, e sai — levando a receita potencial.`,
			impact_hint: "Sem argumento = sem conversão",
			suggestion: "Expanda o conteúdo para pelo menos 500 palavras cobrindo: (1) qual problema você resolve, (2) como funciona, (3) prova social/depoimentos, (4) objeções comuns respondidas, (5) CTA claro. Não encha com texto — cada parágrafo deve avançar o argumento de venda.",
			evidence_refs: [`${parsed.body_word_count} palavras — insuficiente para persuadir`],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 15. Excessive external scripts ────────────
const detectExcessiveExternalScripts: Detector = ({ parsed, business }) => {
	const externalScripts = parsed.scripts.filter((s) => s.is_external);
	if (externalScripts.length < 8) return null;

	const uniqueHosts = [...new Set(externalScripts.map((s) => s.host))];

	return withImpact(
		{
			id: "mini_excessive_scripts",
			severity: "medium",
			category: "performance",
			title: `${externalScripts.length} integrações terceirizadas competindo pelo seu mobile`,
			body: `Sua página depende de ${externalScripts.length} scripts vindos de ${uniqueHosts.length} domínios diferentes (${uniqueHosts.slice(0, 4).join(", ")}${uniqueHosts.length > 4 ? "…" : ""}). Cada um normalmente é um chat widget esquecido, pixel de campanha antiga, ferramenta que ninguém usa mais. No 3G mobile, essa pilha vira tempo de tela branca e bateria queimando — exatamente o momento em que o usuário decide se vai esperar ou fechar. O custo não é "perf score" — é gente fechando aba antes do seu produto aparecer.`,
			impact_hint: `${uniqueHosts.length} dependências externas pesando no mobile`,
			suggestion: "Liste as 3 mais antigas: chat widget que o suporte trocou, pixel de campanha de 6 meses atrás, ferramenta que o time não usa. Remova-as. Pra qualquer que precise ficar, async/defer. Trocar Google Fonts por self-host é ganho fácil. Cada script removido = velocidade de carregamento de volta.",
			evidence_refs: uniqueHosts.slice(0, 3).map((h) => `Scripts de ${h}`),
		},
		"friction_on_critical_path",
		business,
	);
};

// ── 16. No H1 ─────────────────────────────────
const detectNoH1: Detector = ({ parsed, business }) => {
	if (parsed.h1) return null;

	return withImpact(
		{
			id: "mini_no_h1",
			severity: "medium",
			category: "cta",
			title: "Proposta de valor invisível nos primeiros 3 segundos",
			body: `Sua página não tem headline principal (H1). O visitante decide em 3 segundos se fica ou sai — e escaneia a página de cima pra baixo buscando a resposta para "o que isso faz por mim?". Sem H1, essa resposta não existe na hierarquia visual. O olho não encontra âncora, o cérebro interpreta como "nada relevante aqui", e o bounce acontece antes de qualquer scroll.`,
			impact_hint: "Visitante não encontra sua proposta de valor",
			suggestion: "Adicione um H1 claro no topo da página que responda 'o que isso faz por mim?' em uma frase. Evite H1 genéricos como 'Bem-vindo'. Use o formato: '[Resultado desejado] para [público-alvo]'. Exemplo: 'Recupere receita que está vazando da sua loja'.",
			evidence_refs: ["Sem headline (H1) — proposta de valor sem âncora visual"],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 17. External forms ────────────────────────
const detectExternalForms: Detector = ({ parsed, business }) => {
	const externalForms = parsed.forms.filter((f) => f.is_external);
	if (externalForms.length === 0) return null;

	return withImpact(
		{
			id: "mini_external_forms",
			severity: "high",
			category: "trust",
			title: `${externalForms.length} ${externalForms.length === 1 ? "formulário envia" : "formulários enviam"} dados para domínio externo`,
			body: `${externalForms.length} ${externalForms.length === 1 ? "formulário" : "formulários"} na página ${externalForms.length === 1 ? "submete" : "submetem"} dados para ${externalForms.map((f) => f.target_host).filter(Boolean).join(", ") || "domínio externo"}. Quando um visitante preenche um formulário e é redirecionado para outro site, a quebra de contexto reduz drasticamente a taxa de conclusão — especialmente em mobile.`,
			impact_hint: "Quebra de contexto na submissão",
			suggestion: "Configure o form action para seu próprio domínio. Se usa ferramenta terceira (Mailchimp, HubSpot), integre via API no backend ao invés de submeter direto para o domínio deles. O visitante não deve sair da sua página ao preencher um formulário.",
			evidence_refs: externalForms.slice(0, 2).map((f) => `Form → ${f.target_host || "externo"}`),
		},
		"trust_boundary_crossed",
		business,
	);
};

// ── 18. Missing lang attribute ────────────────
const detectMissingLang: Detector = ({ parsed, business }) => {
	if (parsed.lang) return null;

	return withImpact(
		{
			id: "mini_missing_lang",
			severity: "medium",
			category: "structure",
			title: "Público errado pode estar vendo sua página",
			body: `Sem o atributo lang no HTML, o Google pode servir sua página para audiências no idioma errado. Ferramentas de tradução automática (que ~40% dos visitantes internacionais usam) podem ignorar o conteúdo. E quando um visitante que não lê português chega na sua página via busca — é tráfego desperdiçado: custo de servidor sem chance de conversão.`,
			impact_hint: "Tráfego irrelevante desperdiçando recursos",
			suggestion: "Adicione lang='pt-BR' (ou o idioma correto) na tag <html>. É uma mudança de 1 linha no template principal. Se atende múltiplos idiomas, use hreflang para indicar versões alternativas ao Google.",
			evidence_refs: ["Sem lang — Google pode servir pra audiência errada"],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 19. Iframe overuse ────────────────────────
const detectIframeOveruse: Detector = ({ parsed, business }) => {
	if (parsed.iframes.length < 3) return null;

	return withImpact(
		{
			id: "mini_iframe_overuse",
			severity: "medium",
			category: "performance",
			title: `${parsed.iframes.length} iframes carregando simultaneamente`,
			body: `Sua página embarca ${parsed.iframes.length} iframes (${parsed.iframes.slice(0, 3).map((i) => safeHostname(i.src, i.src || "?")).join(", ")}${parsed.iframes.length > 3 ? "…" : ""}). Cada iframe abre uma nova "mini-página" dentro da sua, com seu próprio DOM, CSS, JS e requests de rede. O custo de memória e CPU em mobile é multiplicativo, não aditivo.`,
			impact_hint: "Performance mobile degradada",
			suggestion: "Carregue iframes com lazy loading (loading='lazy') e considere substituir embeds pesados por imagens placeholder que só carregam o iframe ao clicar. Mapas do Google e vídeos do YouTube são os maiores vilões — use thumbnail + play button.",
			evidence_refs: parsed.iframes.slice(0, 3).map((i) => `iframe: ${safeHostname(i.src, i.src || "?")}`),
		},
		"friction_on_critical_path",
		business,
	);
};

// ──────────────────────────────────────────────
// Cross-signal detectors — Vestigio's moat
// These correlate 2+ signals that compound each other's impact
// ──────────────────────────────────────────────

// ── 20. Speed × Trust compound ────────────────
const detectSpeedTrustCompound: Detector = ({ response, rawHtml, business }) => {
	if (response.response_time_ms < 1500) return null;

	const lower = rawHtml.toLowerCase();
	const hasTrust = /(política\s+de\s+privacidade|privacy\s+policy|lgpd|gdpr|pagamento\s+seguro|compra\s+segura)/i.test(lower);
	const hasRefund = /(política\s+de\s+(trocas?|reembolso|devolu)|refund|return\s+policy|garantia)/i.test(lower);

	// Need both: slow AND trust-weak
	if (hasTrust && hasRefund) return null;

	const missingSignals = [];
	if (!hasTrust) missingSignals.push("sem política de privacidade");
	if (!hasRefund) missingSignals.push("sem política de reembolso");

	return withImpact(
		{
			id: "mini_speed_trust_compound",
			severity: "high",
			category: "trust",
			title: "Página lenta + sinais de confiança fracos — efeito composto",
			body: `Sua página levou ${(response.response_time_ms / 1000).toFixed(1)}s para responder E não apresenta sinais claros de confiança (${missingSignals.join(", ")}). Isolados, cada problema reduz conversão em ~10%. Juntos, o efeito é multiplicativo: o visitante espera, chega numa página sem reforço de segurança, e o cérebro interpreta como risco. A taxa de abandono combinada pode atingir 30-40%.`,
			impact_hint: "Efeito multiplicativo: lentidão × desconfiança",
			suggestion: "Ataque os dois lados: (1) Otimize velocidade — comprima imagens, ative cache, reduza scripts. (2) Adicione sinais de confiança visíveis acima da dobra — selo de segurança, política de privacidade, depoimento. Corrigir só um não resolve — o efeito composto exige atacar ambos.",
			evidence_refs: [`${(response.response_time_ms / 1000).toFixed(1)}s de resposta`, ...missingSignals],
		},
		"trust_break_in_checkout",
		business,
	);
};

// ── 21. Weak conversion path ──────────────────
const detectWeakConversionPath: Detector = ({ parsed, rawHtml, business }) => {
	const lower = rawHtml.toLowerCase();

	// Signal 1: Vague or absent CTAs
	const commercialVerbs = /\b(compra|compre|buy|add.to.cart|adicionar|carrinho|assine|sign.?up|cadastr|comece|start|agendar|schedule)\b/i;
	const hasStrongCta = parsed.links.some((l) => l.text && commercialVerbs.test(l.text));

	// Signal 2: No social proof
	const hasSocialProof = /(depoimento|testemunho|testimonial|avalia[çc][ãa]o|review|rating|estrela)/i.test(lower);

	// Signal 3: No urgency
	const hasUrgency = /(últ[iu]m|últim|limited|ofertal|promo[çc]|desconto|grátis|free|hoje|today|agora|now|expir|acabando|vagas? limit)/i.test(lower);

	// Need at least 2 of 3 weak signals
	const weakCount = [!hasStrongCta, !hasSocialProof, !hasUrgency].filter(Boolean).length;
	if (weakCount < 2) return null;

	const missing = [];
	if (!hasStrongCta) missing.push("sem CTA comercial claro");
	if (!hasSocialProof) missing.push("sem prova social");
	if (!hasUrgency) missing.push("sem urgência/escassez");

	return withImpact(
		{
			id: "mini_weak_conversion_path",
			severity: "high",
			category: "cta",
			title: "Caminho de conversão sem incentivo — 3 sinais ausentes",
			body: `Detectamos ${weakCount} lacunas simultâneas no caminho de conversão: ${missing.join(", ")}. Cada ausência isolada reduz conversão em 5-15%. Mas quando o visitante encontra uma página sem CTA claro, sem prova de que outros compraram, e sem razão para agir agora — a conversão cai para perto de zero. O caminho de compra não existe funcionalmente.`,
			impact_hint: `${weakCount}/3 pilares de conversão ausentes`,
			suggestion: "Implemente os 3 pilares: (1) CTA direto com verbo de ação ('Comprar agora', 'Agendar'). (2) Prova social (depoimentos, número de clientes, avaliações). (3) Urgência real (estoque limitado, oferta com prazo, vagas restantes). A combinação dos 3 é o que converte — isolados, nenhum funciona tão bem.",
			evidence_refs: missing,
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── 22. Slow + heavy + thin page ──────────────
const detectSlowHeavyPage: Detector = ({ response, parsed, business }) => {
	if (response.response_time_ms < 1000) return null;
	if (parsed.scripts.length < 6) return null;
	if (parsed.body_word_count >= 500) return null;

	return withImpact(
		{
			id: "mini_slow_heavy_thin",
			severity: "high",
			category: "performance",
			title: "Página lenta e pesada, mas com pouco conteúdo útil",
			body: `Sua página leva ${(response.response_time_ms / 1000).toFixed(1)}s para carregar, usa ${parsed.scripts.length} scripts, mas tem apenas ${parsed.body_word_count} palavras de conteúdo. Todo o peso é overhead técnico, não valor para o visitante. O mobile sofre mais: baixa memória + scripts pesados = página travando em dispositivos populares no Brasil.`,
			impact_hint: "Overhead técnico > conteúdo útil",
			suggestion: "Audite os scripts: remova tracking inativo, widgets não usados, e bibliotecas carregadas mas não chamadas. Depois, expanda o conteúdo — adicione seções de benefícios, prova social e FAQ. O peso da página deve vir de argumento de venda, não de código morto.",
			evidence_refs: [
				`${(response.response_time_ms / 1000).toFixed(1)}s de resposta`,
				`${parsed.scripts.length} scripts`,
				`${parsed.body_word_count} palavras`,
			],
		},
		"friction_on_critical_path",
		business,
	);
};

// ── 23. Trustless payment collection ──────────
const detectTrustlessCheckout: Detector = ({ parsed, rawHtml, business }) => {
	const hasPaymentForms = parsed.forms.some((f) => f.has_payment_fields);
	if (!hasPaymentForms) return null;

	const lower = rawHtml.toLowerCase();
	const hasPrivacy = /(política\s+de\s+privacidade|privacy\s+policy|lgpd|gdpr)/i.test(lower);
	const hasSslBadge = /(ssl|pagamento\s+seguro|compra\s+segura|site\s+seguro|cadeado|secure\s+checkout)/i.test(lower);

	if (hasPrivacy && hasSslBadge) return null;

	const missing = [];
	if (!hasPrivacy) missing.push("sem política de privacidade");
	if (!hasSslBadge) missing.push("sem selo de segurança");

	return withImpact(
		{
			id: "mini_trustless_checkout",
			severity: "critical",
			category: "checkout",
			title: "Formulário coleta pagamento sem sinais de segurança",
			body: `Detectamos campos de pagamento (cartão, CPF, dados financeiros) sem sinais visíveis de segurança na página (${missing.join(", ")}). Quando um visitante está prestes a inserir dados do cartão e não vê nenhuma menção a SSL, privacidade ou segurança, a taxa de abandono no campo de pagamento ultrapassa 67%.`,
			impact_hint: "67%+ abandonam sem sinal de segurança",
			suggestion: "Antes de qualquer campo de pagamento, exiba: (1) selo de SSL/Pagamento Seguro, (2) link para Política de Privacidade, (3) ícones de bandeiras aceitas (Visa, Mastercard, Pix). Use texto como 'Seus dados estão protegidos por criptografia SSL de 256 bits'. Coloque esses sinais imediatamente acima do formulário de pagamento.",
			evidence_refs: ["Campos de pagamento detectados", ...missing],
		},
		"trust_break_in_checkout",
		business,
	);
};

// ──────────────────────────────────────────────
// Services-vertical detectors. Fire only when the visitor self-
// identified as "services" on form step 2. Copy is plain-language
// (the audience is dentista / advogado / contador / dono de software
// house — not tech buyers); each finding states a buyer behavior +
// money consequence in everyday Portuguese, no jargon.
//
// Every detector here gates on `business.business_model === "services"`
// and returns null otherwise, so the existing 4 verticals stay
// unaffected.
// ──────────────────────────────────────────────

const isServicesLead = (business: MiniBusinessInputs): boolean =>
	business.business_model === "services";

// ── S1. WhatsApp / contato direto fora do primeiro scroll ─────
// BR services market is WhatsApp-first — dentista, advogado e
// contador esperam contato direto, não compra no botão.
const detectServicesWhatsappBuried: Detector = ({ parsed, rawHtml, business }) => {
	if (!isServicesLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasWhatsappAnchor = /wa\.me\/|api\.whatsapp\.com|whatsapp\.com\/send/.test(lower);
	const hasWhatsappWord = /whats?app/.test(lower);
	// Naive "above the fold" approximation: appears in the first 8000
	// chars of body OR there's an anchor link with wa.me/.
	const firstChunk = rawHtml.slice(0, 8000).toLowerCase();
	const whatsappAboveFold = hasWhatsappAnchor && /wa\.me\/|whats?app/.test(firstChunk);
	if (whatsappAboveFold) return null;
	if (!hasWhatsappWord && !hasWhatsappAnchor) {
		// No WhatsApp at all anywhere on the page.
		return withImpact(
			{
				id: "mini_services_no_whatsapp",
				severity: "critical",
				category: "cta",
				title: "Sem WhatsApp na página — você está deixando dinheiro na mesa",
				body: "No Brasil, quem procura um serviço (dentista, advogado, contador) abre o WhatsApp antes de qualquer formulário. Sua página não tem botão de WhatsApp visível em nenhum lugar. Cada visitante que poderia ter chamado vai pro concorrente que tem.",
				impact_hint: "30-50% dos contatos viram concorrente",
				suggestion: "Coloque um botão flutuante de WhatsApp visível em todas as páginas (canto inferior direito, verde, com ícone). Inclua o número também no topo do site e na seção 'Fale conosco'. O link deve abrir direto a conversa: https://wa.me/55SEUDDDSEUNUMERO.",
				evidence_refs: ["Nenhuma menção a WhatsApp detectada na página"],
			},
			"missing_contact_channel",
			business,
		);
	}
	// WhatsApp existe mas está enterrado.
	return withImpact(
		{
			id: "mini_services_whatsapp_buried",
			severity: "high",
			category: "cta",
			title: "Seu WhatsApp está escondido — o cliente desiste antes de achar",
			body: "Encontramos menção a WhatsApp na sua página, mas ele não aparece nos primeiros segundos de scroll. Quem procura um serviço quer um contato direto antes de ler o resto — se precisa rolar pra achar, abre o Google e vai pra próxima opção.",
			impact_hint: "Cada scroll a mais derruba 10-15% do interesse",
			suggestion: "Coloque um botão de WhatsApp flutuante (canto inferior direito) que aparece em todas as páginas, e adicione o número também na primeira dobra (header ou hero). Botão verde, com ícone do WhatsApp, sem precisar pensar.",
			evidence_refs: ["WhatsApp detectado, mas não aparece na primeira dobra"],
		},
		"weak_cta_above_fold",
		business,
	);
};

// ── S2. Registro profissional ausente ─────────────────────────
// Cliente que contrata serviço (saúde, jurídico, contábil) procura
// validação: CRM, OAB, CRC, ANVISA. Sem isso, o site parece amador.
const detectServicesProfessionalRegistry: Detector = ({ rawHtml, business }) => {
	if (!isServicesLead(business)) return null;
	const category = business.service_category;
	// Only fire for segments where a registry is expected.
	const expectsRegistry = ["health", "legal", "accounting", "security"].includes(
		category || "",
	);
	if (!expectsRegistry) return null;
	const lower = rawHtml.toLowerCase();
	const registries = [
		/cro[\s/-]?\d/, // dentista
		/crm[\s/-]?\d/, // médico
		/crp[\s/-]?\d/, // psicólogo
		/crefito[\s/-]?\d/, // fisio
		/oab[\s/-]?\w{2}[\s/-]?\d/, // advogado
		/crc[\s/-]?\w{2}[\s/-]?\d/, // contador
		/cnpj[\s/-]?\d/, // razão social pelo menos
		/registro\s+(profissional|na\s+anvisa|no\s+conselho)/,
	];
	const hasAny = registries.some((re) => re.test(lower));
	if (hasAny) return null;
	const segmentName: Record<string, string> = {
		health: "saúde (CRM, CRO, CRP, CREFITO etc.)",
		legal: "advocacia (OAB)",
		accounting: "contabilidade (CRC)",
		security: "segurança patrimonial (Polícia Federal / autorização)",
	};
	const expectedRegistry = segmentName[category!] || "do conselho profissional";
	return withImpact(
		{
			id: "mini_services_no_registry",
			severity: "high",
			category: "trust",
			title: `Falta o registro ${expectedRegistry} na página`,
			body: "Quem contrata serviço regulamentado checa antes se você está com o registro em dia. Se o número do conselho não aparece em lugar nenhum no site (footer, página 'Quem somos', página de cada profissional), o cliente desconfia e vai pra concorrência que mostra.",
			impact_hint: "Falta de registro reduz confiança em 40%+",
			suggestion: "Adicione o número do registro profissional no rodapé do site (ex: 'CRO/SP 12345' ou 'OAB/SP 123.456'). Se você tem equipe, mostre o registro de cada profissional na página dele. Esse é o sinal nº 1 que cliente de serviço regulamentado procura antes de fechar.",
			evidence_refs: ["Nenhum registro profissional detectado no HTML da página"],
		},
		"trust_break_in_checkout",
		business,
	);
};

// ── S3. Endereço, horário e área de atuação ausentes ─────────
const detectServicesAddressHoursMissing: Detector = ({ rawHtml, business }) => {
	if (!isServicesLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	// Tested against `lower` rather than `rawHtml` because the
	// `[a-z]` character class doesn't expand under the /i flag —
	// addresses rendered ALL-CAPS on legacy themes would miss the
	// match on rawHtml. \S after the keyword is enough to confirm
	// a non-empty token follows the address word.
	const hasAddress = /(rua|avenida|alameda|travessa|praça|av\.|r\.\s)\s+\S/i.test(lower);
	const hasHours = /(segunda|seg\.|seg\s+a\s+sex|horário\s+de\s+atendimento|horário\s+de\s+funcionamento|aberto\s+das)/i.test(lower);
	const hasServiceArea = /(atendemos\s+em|área\s+de\s+atuação|cidades\s+atendidas|região\s+de\s+atuação)/i.test(lower);
	const missing = [];
	if (!hasAddress) missing.push("endereço físico");
	if (!hasHours) missing.push("horário de atendimento");
	if (!hasServiceArea) missing.push("área de atuação");
	if (missing.length < 2) return null;
	return withImpact(
		{
			id: "mini_services_address_hours_missing",
			severity: "medium",
			category: "trust",
			title: "Falta informação básica que todo cliente quer ver",
			body: `Quem chega no site procura logo o básico: ${missing.join(", ")}. Se essas informações não aparecem em até 2 cliques, o cliente assume que você é amador ou que não atende ele e fecha a aba.`,
			impact_hint: "Cliente sem essas infos abandona em 6-8 segundos",
			suggestion: "Crie uma seção 'Onde estamos' visível no menu principal e no footer, com: endereço completo, horário de atendimento (incluindo finais de semana se for o caso), cidades / bairros que você atende, telefone e WhatsApp. Use um mapa do Google embutido pra dar ainda mais confiança.",
			evidence_refs: missing.map((m) => `Não encontrei ${m} na página`),
		},
		"missing_contact_channel",
		business,
	);
};

// ── S4. Depoimentos sem prova ──────────────────────────────────
const detectServicesUnverifiableTestimonials: Detector = ({ rawHtml, business }) => {
	if (!isServicesLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasTestimonialKeyword = /(depoimento|cliente|paciente)s?\s*[:.]/i.test(lower) ||
		/o\s+que\s+(nossos|os)\s+(clientes|pacientes)\s+dizem/i.test(lower) ||
		/avalia[çc][aã]o(\s+do\s+google)?/i.test(lower);
	if (!hasTestimonialKeyword) return null;
	// Recognized BR review platforms — Doctoralia (health), Reclame
	// Aqui (e-commerce / services trust), Trustpilot, plus the two
	// Google flavors. The previous "seekraj" token was a typo that
	// never matched anything.
	const hasGoogleReviewsLink = /google\.com\/maps|google\.com\/search\?.*reviews|doctoralia\.com\.br|reclameaqui\.com\.br|trustpilot\.com|search\?q.*reviews/i.test(lower);
	const hasNamedCities = /([A-ZÁÉÍÓÚ][a-záéíóú]+(\s+das?\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)?\s*[-–]\s*[A-Z]{2})/.test(rawHtml);
	// Heuristic: has testimonial section but no verifiable proof
	// (no city/state tag, no Google reviews link).
	if (hasGoogleReviewsLink || hasNamedCities) return null;
	return withImpact(
		{
			id: "mini_services_testimonials_unverifiable",
			severity: "medium",
			category: "trust",
			title: "Seus depoimentos não dão pra checar — soa fake",
			body: "Você tem uma seção de depoimentos, mas eles não trazem nome completo + cidade ou link pra avaliação real (Google Reviews, Doctoralia, ReclameAqui). Cliente que está pesquisando contratar serviço sabe disso e desconta depoimento sem prova como 'invenção do site'.",
			impact_hint: "Depoimento sem prova quase não move a agulha",
			suggestion: "Pra cada depoimento, inclua: nome real + foto (com autorização), cidade-estado, e um link pro perfil dele ou pra avaliação no Google. Mostre também a nota geral do Google Reviews em destaque ('4.8 ⭐ no Google, 127 avaliações') — esse número faz mais efeito que 10 depoimentos genéricos.",
			evidence_refs: ["Seção de depoimentos detectada", "Sem nomes verificáveis ou link pra reviews públicas"],
		},
		"no_social_proof",
		business,
	);
};

// ── S5. CTA com tom errado (compra em vez de agenda) ──────────
const detectServicesWrongCtaTone: Detector = ({ parsed, rawHtml, business }) => {
	if (!isServicesLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const buyTerms = /(comprar\s+agora|adicionar\s+ao\s+carrinho|finalizar\s+compra|comprar\s+já|garantir\s+o\s+meu|adquirir)/;
	const serviceTerms = /(agendar|marcar\s+consulta|solicitar\s+or[çc]amento|falar\s+com\s+(um\s+)?especialista|tirar\s+d[uú]vida|atendimento)/;
	const hasBuyTone = buyTerms.test(lower);
	const hasServiceTone = serviceTerms.test(lower);
	if (hasServiceTone) return null;
	if (!hasBuyTone) {
		// Neither — also bad, but lower-severity (covered by other CTA detectors).
		return null;
	}
	return withImpact(
		{
			id: "mini_services_wrong_cta_tone",
			severity: "medium",
			category: "cta",
			title: "Botões falam 'comprar', mas seu cliente quer 'agendar'",
			body: "Detectamos botões com tom de venda direta ('Comprar', 'Garantir o meu', 'Adicionar ao carrinho'). Quem procura serviço espera 'Agendar consulta', 'Solicitar orçamento', 'Falar com especialista'. Botão com tom errado faz o cliente pensar 'isso aqui não é pra mim' e fechar.",
			impact_hint: "CTA errado afasta 20-30% dos visitantes certos",
			suggestion: "Troque os botões pra linguagem de serviço: 'Agendar primeira consulta', 'Solicitar orçamento sem compromisso', 'Falar com um especialista', 'Tirar dúvida no WhatsApp'. Mantenha a mesma cor e formato, só ajuste o texto. Funciona mesmo se você cobra valor fixo — o tom é o que importa.",
			evidence_refs: ["Botões com termos de venda direta detectados", "Sem botões com tom de serviço"],
		},
		"weak_cta_above_fold",
		business,
	);
};

// ── S6. Google Business Profile não linkado ────────────────────
const detectServicesNoGbpLink: Detector = ({ rawHtml, business }) => {
	if (!isServicesLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasGbpLink = /google\.com\/maps\/place|maps\.app\.goo\.gl|share\.google\/|g\.page\//.test(lower);
	if (hasGbpLink) return null;
	return withImpact(
		{
			id: "mini_services_no_gbp_link",
			severity: "medium",
			category: "trust",
			title: "Sem link pro seu Google Business Profile",
			body: "Cliente que procura serviço quase sempre passa pelo Google Maps antes de te chamar (pra ver foto da fachada, horário, avaliação). Seu site não linka pro seu perfil no Google — isso significa que quem chega no site e quer conferir antes vai pra busca, e pode acabar caindo num concorrente que aparece logo abaixo de você.",
			impact_hint: "Tráfego que perdeu pro concorrente nas reviews",
			suggestion: "Crie ou reivindique seu perfil em business.google.com e adicione o link no site (rodapé + página 'Onde estamos' + sidebar de contato). Coloque também o badge 'Veja avaliações no Google' com a nota — isso transfere a credibilidade do Google pra você direto na primeira dobra.",
			evidence_refs: ["Nenhum link pro Google Maps ou Google Business detectado"],
		},
		"no_social_proof",
		business,
	);
};

// ── S7. Lista de serviços enterrada ────────────────────────────
const detectServicesCategoriesBuried: Detector = ({ parsed, rawHtml, business }) => {
	if (!isServicesLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	// Look for service-listing signals in the first 12000 chars
	// (rough "above the fold + hero section").
	const heroChunk = rawHtml.slice(0, 12000).toLowerCase();
	const hasServiceList = /(nossos\s+servi[çc]os|servi[çc]os\s+oferecidos|especialidades|áreas\s+de\s+atua[çc][aã]o|o\s+que\s+fazemos)/i.test(heroChunk);
	if (hasServiceList) return null;
	// Check if there's any service listing later in the page — if yes,
	// they buried it; if no, that's a different problem (thin content).
	const hasAnywhere = /(nossos\s+servi[çc]os|especialidades|áreas\s+de\s+atua[çc][aã]o)/i.test(lower);
	if (!hasAnywhere) return null;
	return withImpact(
		{
			id: "mini_services_categories_buried",
			severity: "medium",
			category: "structure",
			title: "Sua lista de serviços está enterrada — cliente não sabe se você atende ele",
			body: "Quando o cliente cai na sua página, ele precisa entender em 5 segundos: 'Esse profissional atende o que eu preciso?'. Sua lista de serviços / especialidades existe, mas não aparece na primeira dobra. Quem rola até achar é minoria — a maioria sai antes.",
			impact_hint: "Lista enterrada perde 25-40% do interesse inicial",
			suggestion: "Mostre na primeira dobra (acima do scroll) os 3 a 6 serviços principais que você oferece, cada um com 1 frase do que cobre. Pode ser em cards, lista com ícones, ou texto curto. O cliente precisa se reconhecer ali — 'sim, é isso que eu preciso' — antes de descer.",
			evidence_refs: ["Lista de serviços detectada", "Mas não aparece na primeira dobra"],
		},
		"weak_conversion_path",
		business,
	);
};

// ──────────────────────────────────────────────
// Mobile-app conversion detectors. Fire only when the visitor self-
// identified as "app_conversion" on form step 2. Copy is buyer-natural
// (the audience is dono / fundador / growth lead de app, não engenheiro
// iOS/Android), every finding states the user behavior + lost install
// consequence in plain Portuguese. Avoid jargon: "Smart App Banner"
// gets called "barra do iPhone que abre o app", "App Links" gets called
// "link que abre direto no seu app".
//
// Each detector gates on `business.business_model === "app_conversion"`
// (and sometimes on `business.app_platform`) and returns null otherwise.
// ──────────────────────────────────────────────

const isAppConversionLead = (business: MiniBusinessInputs): boolean =>
	business.business_model === "app_conversion";

// ── A1. Sem badges de loja na home ────────────────────────────
// Cliente que chega no site procura instantaneamente o botão pra
// baixar o app. Sem badges visíveis (Play / App Store), o visitante
// fica perdido e abre o Google.
const detectAppNoStoreBadges: Detector = ({ rawHtml, business }) => {
	if (!isAppConversionLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasAppStoreLink = /apps\.apple\.com\/(\w{2}\/)?app|itunes\.apple\.com/.test(lower);
	const hasPlayStoreLink = /play\.google\.com\/store\/apps/.test(lower);
	const platform = business.app_platform;
	const expectsIos = platform === "ios_only" || platform === "both" || !platform;
	const expectsAndroid = platform === "android_only" || platform === "both" || !platform;
	const missing: string[] = [];
	if (expectsIos && !hasAppStoreLink) missing.push("App Store (iPhone)");
	if (expectsAndroid && !hasPlayStoreLink) missing.push("Play Store (Android)");
	if (missing.length === 0) return null;
	return withImpact(
		{
			id: "mini_app_no_store_badges",
			severity: missing.length === (expectsIos && expectsAndroid ? 2 : 1) ? "critical" : "high",
			category: "cta",
			title: `Sem botão de download pra ${missing.join(" + ")}`,
			body: `Visitante que chega no site quer baixar o app — não ler mais sobre ele. Sua página não mostra o botão oficial da ${missing.join(" e da ")} em nenhum lugar. Cada visitante que veio com intenção de instalar e não encontrou o botão volta pro Google e pode acabar baixando um concorrente.`,
			impact_hint: "30-50% dos visitantes com intenção saem sem instalar",
			suggestion: `Coloque o badge oficial de cada loja (${missing.join(" e ")}) na primeira dobra do site, com link direto pra sua página na loja. Use as imagens oficiais (developer.apple.com/app-store/marketing/guidelines/ e play.google.com/intl/en_us/badges/) — o cliente reconhece em meio segundo.`,
			evidence_refs: missing.map((m) => `Nenhum link pra ${m} detectado na página`),
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── A2. Sem Smart App Banner (iOS) ────────────────────────────
// iPhone tem uma barra automática no Safari que abre direto o app
// se estiver instalado, ou puxa pra App Store. Sem isso, usuário
// iOS tem que sair do navegador, ir na loja e procurar manualmente.
const detectAppNoSmartBanner: Detector = ({ parsed, rawHtml, business }) => {
	if (!isAppConversionLead(business)) return null;
	const platform = business.app_platform;
	if (platform === "android_only") return null;
	// ParsedPage.meta_tags is Record<string, string>, key = name attr.
	// Smart App Banner uses <meta name="apple-itunes-app" content="...">.
	const hasMetaAppBanner =
		!!parsed.meta_tags?.["apple-itunes-app"] ||
		/<meta[^>]+name=["']apple-itunes-app["']/i.test(rawHtml);
	if (hasMetaAppBanner) return null;
	return withImpact(
		{
			id: "mini_app_no_smart_banner",
			severity: "high",
			category: "cta",
			title: "Falta a barra do iPhone que abre o app direto do site",
			body: "Quando alguém abre seu site no Safari do iPhone, existe uma faixa que aparece no topo dizendo 'Abrir no app' ou 'Baixar na App Store'. Sem isso, o usuário iOS precisa sair do navegador, abrir a App Store e procurar pelo nome — é quando você perde a maior parte deles.",
			impact_hint: "Usuário iOS sem essa faixa raramente instala depois",
			suggestion: "Adicione a meta tag <meta name=\"apple-itunes-app\" content=\"app-id=SEU_APP_ID\"> no <head> de todas as páginas. Coloque o ID do seu app na App Store. A faixa aparece automaticamente no Safari — sem código adicional, sem custo de banda.",
			evidence_refs: ["Meta tag apple-itunes-app não encontrada"],
		},
		"weak_cta_above_fold",
		business,
	);
};

// ── A3. Avaliação da loja não aparece no site ─────────────────
const detectAppNoStoreRating: Detector = ({ rawHtml, business }) => {
	if (!isAppConversionLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasRatingMention = /(\d[\.,]\d)\s*(★|⭐|estrela|stars?)\s*(na\s+)?(app\s+store|play\s+store|google\s+play|apple\s+store)/i.test(rawHtml) ||
		/(nota\s+\d[\.,]\d|rating\s+\d[\.,]\d|\d[\.,]\d\s+(de\s+5|out\s+of\s+5))/i.test(lower);
	if (hasRatingMention) return null;
	return withImpact(
		{
			id: "mini_app_no_store_rating",
			severity: "medium",
			category: "trust",
			title: "Você não mostra a nota do seu app na loja",
			body: "Quem está pensando em baixar um app vai checar a nota na loja antes — todo mundo faz isso. Se você tem 4.5+ estrelas e milhares de avaliações, é a sua maior carta de vendas e ela não aparece no site. Visitante que poderia ter clicado direto vai abrir a loja, ver outros apps na lista de busca, e talvez nem voltar pro seu.",
			impact_hint: "Nota visível aumenta clique pro botão em 15-25%",
			suggestion: "Coloque na primeira dobra: nota geral ('4.7 ⭐ na App Store · 4.8 ⭐ na Play Store · 12 mil avaliações'). Pode usar widget oficial do AppFollow ou Storefly, ou só renderizar como texto + ícone. Cliente desconfia menos de texto + número específico do que de claim genérico.",
			evidence_refs: ["Nenhuma menção a nota / rating / estrelas detectada"],
		},
		"no_social_proof",
		business,
	);
};

// ── A4. Mensagem confusa entre web e app ──────────────────────
const detectAppWebMessageConflict: Detector = ({ rawHtml, business }) => {
	if (!isAppConversionLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const offersWebVersion = /(use\s+no\s+navegador|vers[ãa]o\s+web|fa[çc]a\s+login\s+aqui|acesse\s+sua\s+conta|web\s+app)/i.test(lower);
	const offersAppDownload = /(baixe\s+o\s+app|baixar\s+(o\s+)?aplicativo|app\s+gratuito|download\s+da?\s+app)/i.test(lower);
	if (!(offersWebVersion && offersAppDownload)) return null;
	return withImpact(
		{
			id: "mini_app_web_message_conflict",
			severity: "medium",
			category: "structure",
			title: "Seu site não decide se é app ou web — visitante também não decide",
			body: "Sua página oferece versão web ('acesse sua conta') E pede pra baixar o app na mesma dobra. Visitante na dúvida costuma escolher o caminho de menor fricção (web) e nunca instala o app. Você perde o engajamento de longo prazo que o app entrega.",
			impact_hint: "Caminho duplo derruba install em 20-30%",
			suggestion: "Decida o objetivo principal da landing. Se o app é o produto, faça login web entrar pela porta dos fundos ('Já tem conta? Acesse pelo app' linkando pra loja, com 'Continuar no navegador' bem pequeno). Se a web é equivalente, escolha qual contexto pede app (mobile?) e mostra a opção certa por device.",
			evidence_refs: ["Convite pra usar versão web detectado", "Convite pra baixar o app detectado", "Sem hierarquia clara entre as duas opções"],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── A5. Sem prévia visual do app ──────────────────────────────
const detectAppNoScreenshots: Detector = ({ rawHtml, business }) => {
	if (!isAppConversionLead(business)) return null;
	// ParsedPage doesn't surface <img> structured. Parse rawHtml for
	// img tags whose alt OR src contains screenshot / mockup / preview
	// keywords — same signal the structured form would carry.
	const imgMatches = rawHtml.match(/<img[^>]+>/gi) || [];
	const hasScreenshotImage = imgMatches.some((tag) => {
		const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] || "";
		const src = tag.match(/src=["']([^"']*)["']/i)?.[1] || "";
		return (
			/screenshot|tela\s+do\s+app|preview\s+do\s+app|app\s+screen/i.test(alt) ||
			/screenshot|mockup|app-preview|phone-mockup/i.test(src)
		);
	});
	if (hasScreenshotImage) return null;
	return withImpact(
		{
			id: "mini_app_no_screenshots",
			severity: "medium",
			category: "structure",
			title: "Sem prévia visual de como o app funciona",
			body: "Visitante que está decidindo se baixa o app quer ver as telas antes — 80% do tempo no celular é em apps, e ninguém instala sem ter uma ideia do que vai ver dentro. Sua landing não mostra screenshots do app. Quem visita só com texto não consegue imaginar o produto e desiste.",
			impact_hint: "Sem prévia visual, install cai 25-40%",
			suggestion: "Adicione 3 a 5 screenshots da tela principal do app na primeira dobra (carousel ou grid), com legenda curta em cada uma explicando o que o usuário consegue fazer ali. Use mockup de iPhone/Android pra ficar profissional. Cliente vê o produto, se imagina usando, e baixa.",
			evidence_refs: ["Nenhuma imagem detectada com alt/filename indicando screenshot do app"],
		},
		"no_social_proof",
		business,
	);
};

// ── A6. Permissões assustadoras sem contexto ──────────────────
const detectAppPermissionsScary: Detector = ({ rawHtml, business }) => {
	if (!isAppConversionLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const mentionsPermissions = /(localiza[çc][aã]o|c[âa]mera|microfone|notifica[çc][oõ]es|contatos|acesso\s+a\s+seus)/i.test(lower);
	if (!mentionsPermissions) return null;
	const explainsWhy = /(porque|por\s+que|usamos|servimos\s+pra|necess[áa]ria\s+pra|garantimos\s+que)/i.test(lower);
	if (explainsWhy) return null;
	return withImpact(
		{
			id: "mini_app_permissions_scary",
			severity: "medium",
			category: "trust",
			title: "Você pede permissões sem explicar o porquê — assusta",
			body: "Seu site menciona que o app precisa de permissões (localização, câmera, notificações, etc.) mas não explica pra que cada uma serve. Usuário lê só 'precisa acessar sua localização' e pensa 'vão me espionar', desinstala antes mesmo de abrir.",
			impact_hint: "Permissão sem contexto reduz install em 15-20%",
			suggestion: "Pra cada permissão que você pede, escreva 1 frase curta que diga o que ela libera no app. Ex: 'Localização: pra te mostrar opções perto de você. Notificação: pra avisar quando seu pedido sair pra entrega.' Coloque essa lista visível na landing — você reduz a ansiedade antes da loja pedir.",
			evidence_refs: ["Menção a permissões sensíveis detectada", "Sem explicação do propósito de cada permissão"],
		},
		"trust_break_in_checkout",
		business,
	);
};

// ──────────────────────────────────────────────
// Enterprise B2B detectors. Fire only when the visitor self-identified
// as "enterprise" on form step 2. The audience here is CTO / Head of
// Growth / CISO / Revenue Ops — technical copy is appropriate and
// expected. Each finding states the procurement-stage friction +
// pipeline consequence, using the language a buyer in that role
// actually uses.
//
// Each detector gates on `business.business_model === "enterprise"`
// (and sometimes on `business.enterprise_segment`) and returns null
// otherwise.
// ──────────────────────────────────────────────

const isEnterpriseLead = (business: MiniBusinessInputs): boolean =>
	business.business_model === "enterprise";

// ── E1. Compliance/certificações ausentes ─────────────────────
// Enterprise buyer's first procurement check: SOC2, ISO 27001, LGPD
// certification, PCI DSS (for fintech). Without these surfaced, the
// security review team kicks the deal out before sales gets a meeting.
const detectEnterpriseNoCompliance: Detector = ({ rawHtml, business }) => {
	if (!isEnterpriseLead(business)) return null;
	const segment = business.enterprise_segment;
	const lower = rawHtml.toLowerCase();
	const has_soc2 = /soc\s*2|soc-?2|soc\s*ii/i.test(lower);
	const has_iso27001 = /iso\s*27001|iso-?27001/i.test(lower);
	const has_lgpd = /lgpd|conformidade\s+lgpd|lgpd-?ready/i.test(lower);
	const has_pci = /pci\s*dss|pci-?dss|pci\s*compliant/i.test(lower);
	const has_gdpr = /gdpr|conformidade\s+gdpr/i.test(lower);
	const certCount = [has_soc2, has_iso27001, has_lgpd, has_pci, has_gdpr].filter(Boolean).length;
	if (certCount >= 2) return null;
	// Fintech segment expects PCI DSS at minimum.
	const fintechMissingPci = segment === "fintech" && !has_pci;
	const severity = certCount === 0 ? "critical" : "high";
	return withImpact(
		{
			id: "mini_enterprise_no_compliance",
			severity,
			category: "trust",
			title: "Certificações de compliance ausentes no security review",
			body: `Procurement enterprise roda um security questionnaire antes de fechar contrato. Detectadas ${certCount} de 5 atestações esperadas no site (SOC 2, ISO 27001, LGPD, PCI DSS${fintechMissingPci ? " — exigido para fintech" : ""}, GDPR). Sem isso visível na página /security ou no rodapé, o deal trava em security review por semanas enquanto sales engineering corre atrás de evidências.`,
			impact_hint: "Gap de compliance bloqueia ~30% dos deals mid-market no security review",
			suggestion: "Exiba as certificações em uma página dedicada /security ou /trust linkada no header + rodapé. Liste a atestação, a firma auditora, a data e um link inline para o fluxo de request do relatório SOC 2. Para startups pré-SOC 2: declare o cronograma + o framework de controles que você opera (SOC 2 Type I em andamento, mapeamento ISO concluído, etc.) — ser explícito vence o silêncio.",
			evidence_refs: [`${certCount} atestações de compliance detectadas no HTML`, ...(fintechMissingPci ? ["PCI DSS ausente para segmento fintech"] : [])],
		},
		"trust_break_in_checkout",
		business,
	);
};

// ── E2. Case studies sem números ──────────────────────────────
const detectEnterpriseNoCaseStudyMetrics: Detector = ({ rawHtml, business }) => {
	if (!isEnterpriseLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasCaseStudyKeyword = /(case\s+stud|customer\s+stor|cliente?s?\s+como|histórias?\s+de\s+sucesso|caso\s+de\s+sucesso)/i.test(lower);
	if (!hasCaseStudyKeyword) return null;
	// Look for quantified metrics: percentages, dollar amounts, time savings.
	const hasQuantifiedMetric = /\b\d{1,3}(\.\d+)?%\b|R\$\s*\d|US\$\s*\d|\bx\s*\d+\b|\b\d+x\b/i.test(rawHtml);
	if (hasQuantifiedMetric) return null;
	return withImpact(
		{
			id: "mini_enterprise_unquantified_case_studies",
			severity: "high",
			category: "trust",
			title: "Cases sem números — não passam no teste de buy-in do CFO",
			body: "Cases / customer stories detectados no site, mas sem resultados quantificados (% de lift em receita, tempo economizado, R$ recuperados, delta de NPS, etc.). Champions enterprise precisam de números para levar o business case ao comitê de compra. Depoimentos qualitativos não sobrevivem ao procurement review — o CFO pergunta 'qual é o ROI' e o champion não tem resposta.",
			impact_hint: "Champion não consegue vender pra cima sem métricas — 40% dos deals travam aqui",
			suggestion: "Para cada case, comece pela métrica: 'reduziu perdas com fraude em 38% em 90 dias' / 'cortou chargebacks de 1.8% para 0.4%' / 'aumentou trial-to-paid em 22%'. Três resultados quantificados por case batem cinco qualitativos. Se você não tem métricas duras, escreva implicações duras: 'cliente recuperou estimados R$ X/mês antes perdidos em abandono no checkout'.",
			evidence_refs: ["Seção de cases detectada", "Nenhum resultado quantificado encontrado na copy dos cases"],
		},
		"no_social_proof",
		business,
	);
};

// ── E3. Sem pricing visible ────────────────────────────────────
const detectEnterpriseNoPricingDisclosure: Detector = ({ rawHtml, business }) => {
	if (!isEnterpriseLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasPricingPage = /(\/pricing|pre[çc]o|planos|tabela\s+de\s+pre[çc]o)/i.test(lower);
	const hasContactSalesOnly = /(contact\s+sales|fale\s+com\s+vendas|solicite\s+(uma\s+)?proposta|sob\s+consulta)/i.test(lower);
	// "Hidden pricing" pattern: only "contact sales" exists, no price ranges, no tier names.
	if (hasPricingPage && !hasContactSalesOnly) return null;
	const hasAnyPriceSignal = /R\$\s*\d{2,}|US\$\s*\d{2,}|starting\s+at|a\s+partir\s+de/i.test(rawHtml);
	if (hasAnyPriceSignal) return null;
	return withImpact(
		{
			id: "mini_enterprise_no_pricing_disclosure",
			severity: "medium",
			category: "structure",
			title: "Zero transparência de preço — comprador sai antes de agendar a call",
			body: "Nenhuma faixa de preço, âncora 'a partir de', ou comparativo de tier detectado. 'Fale com vendas' é o único caminho. Compradores enterprise modernos pesquisam antes de engajar — se o seu concorrente publica 'a partir de R$ 250k ACV' e você não publica nada, sua taxa de discovery call cai porque o comprador não consegue te shortlist sem um sinal de orçamento.",
			impact_hint: "Preço escondido corta qualificação de pipeline em 25%+",
			suggestion: "Publique no mínimo um preço 'a partir de' por tier (Self-serve / Team / Enterprise) — pricing completo pode continuar gated atrás de 'fale com vendas', mas a âncora importa. Adicione 1 frase de posicionamento por tier pra que o comprador se auto-qualifique antes da call. Contra-exemplo para os preocupados com segurança: Stripe, Snowflake, Datadog publicam preços iniciais e ainda fecham contratos enterprise.",
			evidence_refs: ["Nenhuma página de preço ou âncora 'a partir de' detectada", "Apenas 'fale com vendas' / 'sob consulta' presente"],
		},
		"unclear_conversion_intent",
		business,
	);
};

// ── E4. Demo CTA buried / weak ────────────────────────────────
const detectEnterpriseWeakDemoCta: Detector = ({ rawHtml, business }) => {
	if (!isEnterpriseLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasBookDemo = /(book\s+a?\s+demo|schedule\s+a?\s+demo|agendar\s+(uma\s+)?demo|request\s+a?\s+demo)/i.test(lower);
	if (hasBookDemo) {
		// Check whether the demo CTA appears in the first scroll.
		const heroChunk = rawHtml.slice(0, 10000).toLowerCase();
		const demoAboveFold = /(book\s+a?\s+demo|schedule\s+a?\s+demo|agendar\s+(uma\s+)?demo|request\s+a?\s+demo)/i.test(heroChunk);
		if (demoAboveFold) return null;
	}
	return withImpact(
		{
			id: "mini_enterprise_weak_demo_cta",
			severity: "high",
			category: "cta",
			title: "CTA de demo ausente ou enterrado — caminho primário de conversão quebrado",
			body: "Sites enterprise convertem por um mecanismo: o formulário de request de demo. Nenhum CTA de demo apareceu no primeiro scroll (ou nenhum CTA de demo). Visitantes chegando de outbound, pago ou LinkedIn não têm um próximo passo óbvio — eles vão pro concorrente cujo botão 'Agendar demo' é a primeira coisa que veem.",
			impact_hint: "CTA de demo enterrado derruba pipeline em 30-40%",
			suggestion: "Coloque o CTA 'Agendar demo' / 'Fale com vendas' como ação primária acima da dobra no hero — peso visual distinto dos CTAs secundários ('Veja como funciona'). Use Chili Piper / Calendly inline pra que o comprador agende em 2 cliques sem preencher form antes; ou use um form de 3 campos (nome + email corporativo + empresa) e pule todo o resto.",
			evidence_refs: ["Nenhum CTA de demo detectado nos primeiros 10k chars do HTML"],
		},
		"weak_cta_above_fold",
		business,
	);
};

// ── E5. Customer logo bar without recognizable names ──────────
const detectEnterpriseNoRecognizableLogos: Detector = ({ rawHtml, business }) => {
	if (!isEnterpriseLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasLogoSection = /(trusted\s+by|customers?\s+include|nossos?\s+clientes|empresas?\s+que\s+confiam|powered\s+by|usado\s+por)/i.test(lower);
	if (!hasLogoSection) return null;
	// Heuristic: count <img> tags with alt containing common enterprise
	// patterns (capitalized brand names, ".com", "Inc", "S.A.", etc).
	const imgMatches = rawHtml.match(/<img[^>]+>/gi) || [];
	const enterpriseAltCount = imgMatches.filter((tag) => {
		const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] || "";
		return /^[A-Z][a-zA-Z]+(\s+[A-Z][a-zA-Z]+)*$|\.com$|Inc\.?$|S\.A\.|Corp\./i.test(alt);
	}).length;
	if (enterpriseAltCount >= 4) return null;
	return withImpact(
		{
			id: "mini_enterprise_no_recognizable_logos",
			severity: "medium",
			category: "trust",
			title: "Logo bar existe mas sem marcas enterprise reconhecíveis",
			body: "Uma seção 'usado por' ou 'nossos clientes' foi encontrada, mas os logos exibidos não parecem ser marcas enterprise reconhecíveis (com base na inspeção de alt-text). Procurement enterprise usa peer-validation pesadamente — se o CTO do comprador não reconhece 3+ logos na sua barra de clientes, o social proof falha e você cai no bucket de 'risco de startup' independente da qualidade real do produto.",
			impact_hint: "Peer validation fraca estende o ciclo de venda em 4-6 semanas",
			suggestion: "Curadoria do logo bar em torno de 6-8 logos marquee do segmento / vertical do comprador (fintech vê fintech, varejo vê varejo). Se você ainda não tem logos marquee enterprise, use líderes de categoria de verticais adjacentes + reconhecimento de analyst (Gartner Cool Vendor, Forrester Wave) como sinal substituto de peer.",
			evidence_refs: ["Seção 'usado por' detectada", `Apenas ${enterpriseAltCount} alt-tags batem com padrão de marca enterprise`],
		},
		"no_social_proof",
		business,
	);
};

// ── E6. Security / trust page missing from main nav ───────────
const detectEnterpriseNoSecurityPage: Detector = ({ parsed, business }) => {
	if (!isEnterpriseLead(business)) return null;
	const hasSecurityLink = parsed.links?.some((l) =>
		// The href variant matches both unaccented ("/seguranca")
		// and accented ("/segurança") slugs via the [çc] character
		// class — the previous form had `seguranca` listed twice,
		// missing the accented form entirely.
		/\/(security|trust|seguran[çc]a|conformidade)\b/i.test(l.href || "") ||
		/security|trust\s+center|trust\s+&|conformidade|seguran[çc]a/i.test(l.text || ""),
	);
	if (hasSecurityLink) return null;
	return withImpact(
		{
			id: "mini_enterprise_no_security_page",
			severity: "medium",
			category: "trust",
			title: "Nenhuma página /security ou /trust acessível pela nav principal",
			body: "Procurement enterprise abre /security ou /trust antes mesmo de ler uma página de feature. Nenhuma página dessas acessível pela nav principal ou rodapé. Mesmo que você tenha atestações de compliance, uma postura de segurança publicada (visão geral de arquitetura, residência de dados, postura de criptografia, política de resposta a incidentes, lista de sub-processadores) é o que reduz o security review de 4 semanas para 4 dias.",
			impact_hint: "Página de trust ausente estende procurement em 2-4 semanas",
			suggestion: "Construa uma página /security cobrindo: escopo SOC 2 / ISO, classificação de dados + criptografia em repouso / em trânsito, disponibilidade multi-região, opções de residência de dados, SLA de resposta a incidentes, lista de sub-processadores com link para o compliance de cada provider. Linke do rodapé e da página de thank-you do request de demo. SafeBase ou produtos similares de Trust Center empacotam isso se você não quer construir do zero.",
			evidence_refs: ["Nenhum link de security/trust detectado na navegação ou nos links"],
		},
		"trust_break_in_checkout",
		business,
	);
};

// ── E7. Comparison page targeting old enterprise vendors ──────
const detectEnterpriseNoComparison: Detector = ({ rawHtml, business }) => {
	if (!isEnterpriseLead(business)) return null;
	const lower = rawHtml.toLowerCase();
	const hasComparison = /(\/vs\/|alternative\s+to|comparison|comparativo|migrate\s+from|migrating\s+from|migra[çc][aã]o\s+de)/i.test(lower);
	if (hasComparison) return null;
	return withImpact(
		{
			id: "mini_enterprise_no_comparison_content",
			severity: "medium",
			category: "structure",
			title: "Nenhum comparativo de concorrente ou conteúdo de migração presente",
			body: "Compradores enterprise fazem shortlist por comparação — eles buscam 'X vs Y', 'alternativa ao vendor legado', 'migrando do incumbente'. Nenhuma página comparativa ou conteúdo de migração detectado no seu site. Você perde tráfego top-of-funnel com intenção alta para concorrentes que publicam páginas '/vs/legado', mesmo quando seu produto vence no mérito.",
			impact_hint: "Sem conteúdo vs/migração corta pipeline inbound enterprise em 20%+",
			suggestion: "Publique pelo menos 2-3 páginas /vs/ mirando no legado ou líder de categoria que seus compradores estão deixando. Cubra tradeoffs honestos (onde o incumbente vence, onde você vence), transparência de preço e caminho de migração. Evite o marketing 'a gente vence em tudo' — compradores detectam e saem. Ferramentas como Mutiny / Default geram páginas vs dinamicamente por traffic source.",
			evidence_refs: ["Nenhuma URL /vs/ ou alternative-to detectada na copy ou nav"],
		},
		"weak_conversion_path",
		business,
	);
};

// ──────────────────────────────────────────────
// Positive fallbacks — only kick in when fewer than 5 negatives hit.
// ──────────────────────────────────────────────

const fallbackPositives: Detector[] = [
	({ response }) =>
		response.response_time_ms < 1500
			? {
					id: "mini_pos_speed",
					severity: "positive",
					category: "performance",
					title: `Página carrega em ${(response.response_time_ms / 1000).toFixed(1)}s — tempo saudável`,
					body: `Sua homepage respondeu em ${response.response_time_ms}ms. Páginas abaixo de 1.5s retêm ~74% dos visitantes mobile vs. 41% para páginas acima de 3s. Você já está acima do limiar onde bounce rates disparam.`,
					impact_hint: "Acima do limiar de abandono",
					impact: null,
				}
			: null,
	({ parsed }) =>
		parsed.structured_data.length > 0
			? {
					id: "mini_pos_schema",
					severity: "positive",
					category: "structure",
					title: `${parsed.structured_data.length} blocos de structured data detectados`,
					body: `Seu site declara ${parsed.structured_data.length} ${parsed.structured_data.length === 1 ? "bloco" : "blocos"} JSON-LD (${parsed.structured_data
						.slice(0, 3)
						.map((sd) => sd.type)
						.join(", ")}${parsed.structured_data.length > 3 ? "..." : ""}). Isso sinaliza a buscadores e agents AI que seu site é bem-estruturado e extraível — uma vantagem que a maioria não tem.`,
					impact_hint: "Melhor descobribilidade + ingestão por AI",
					impact: null,
				}
			: null,
	({ parsed }) =>
		parsed.h1
			? {
					id: "mini_pos_h1",
					severity: "positive",
					category: "structure",
					title: "Headline principal clara detectada",
					body: `Sua página declara um único H1 ("${parsed.h1.slice(0, 80)}${parsed.h1.length > 80 ? "..." : ""}"). Páginas com uma headline forte e escaneável convertem melhor do que páginas com múltiplos headings competindo no topo.`,
					impact_hint: "Hierarquia visual clara",
					impact: null,
				}
			: null,
	({ parsed }) =>
		parsed.lang
			? {
					id: "mini_pos_lang",
					severity: "positive",
					category: "structure",
					title: "Idioma declarado explicitamente",
					body: `Seu atributo <html lang="${parsed.lang}"> está definido, o que ajuda leitores de tela, ferramentas de tradução e buscadores a renderizarem sua página corretamente para audiências internacionais.`,
					impact_hint: "Acessibilidade + i18n pronto",
					impact: null,
				}
			: null,
];

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

const SEVERITY_ORDER: Record<MiniFindingSeverity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	positive: 3,
};

// ──────────────────────────────────────────────
// Business type inference from crawl signals
// ──────────────────────────────────────────────

export type InferredBusinessType =
	| "ecommerce"
	| "lead_gen"
	| "saas"
	| "services"
	| "app_conversion"
	| "enterprise"
	| "hybrid";

export interface BusinessTypeInference {
	type: InferredBusinessType;
	confidence: number; // 0–1
	signals: string[];
}

export function inferBusinessType(parsed: ParsedPage, rawHtml: string): BusinessTypeInference {
	const scores = { ecommerce: 0, lead_gen: 0, saas: 0 };
	const signals: string[] = [];
	const lower = rawHtml.toLowerCase();
	const linkHrefs = parsed.links.map((l) => l.href.toLowerCase()).join(" ");
	const linkTexts = parsed.links.map((l) => l.text?.toLowerCase() || "").join(" ");

	// ── Ecommerce signals ──
	if (/\/cart|\/carrinho|\/checkout|\/product|\/produto/i.test(linkHrefs)) {
		scores.ecommerce += 3; signals.push("cart/checkout/product paths");
	}
	if (parsed.forms.some((f) => f.has_payment_fields)) {
		scores.ecommerce += 3; signals.push("payment form fields");
	}
	if (/shopify|nuvemshop|woocommerce|magento|vtex|tray\.com/i.test(lower)) {
		scores.ecommerce += 4; signals.push("ecommerce platform detected");
	}
	if (parsed.structured_data.some((sd) => /Product|Offer/i.test(sd.type))) {
		scores.ecommerce += 3; signals.push("Product/Offer schema");
	}
	if (/add.to.cart|adicionar.ao.carrinho|comprar|buy.now/i.test(lower)) {
		scores.ecommerce += 2; signals.push("buy/add-to-cart CTA");
	}
	if (/R\$\s*\d|US\$\s*\d|\$\s*\d{1,3}[.,]\d{2}/i.test(lower)) {
		scores.ecommerce += 1; signals.push("price patterns");
	}

	// ── Lead Gen signals ──
	if (parsed.forms.some((f) => !f.has_payment_fields && f.field_names.length >= 2)) {
		scores.lead_gen += 3; signals.push("lead capture form");
	}
	if (/wa\.me|api\.whatsapp\.com|whatsapp/i.test(lower)) {
		scores.lead_gen += 3; signals.push("WhatsApp link");
	}
	if (/calendly\.com|tidycal|cal\.com/i.test(lower)) {
		scores.lead_gen += 3; signals.push("booking embed");
	}
	if (/fale.conosco|entre.em.contato|contact.us|agende|schedule/i.test(lower)) {
		scores.lead_gen += 2; signals.push("contact CTA");
	}
	if (/tel:\+?\d|href="tel:/i.test(lower)) {
		scores.lead_gen += 1; signals.push("phone CTA");
	}

	// ── SaaS signals ──
	if (/\/login|\/signin|\/signup|\/register|\/dashboard/i.test(linkHrefs)) {
		scores.saas += 3; signals.push("login/signup paths");
	}
	if (/\/pricing|\/planos|\/plans/i.test(linkHrefs)) {
		scores.saas += 3; signals.push("pricing page link");
	}
	if (/free.trial|teste.gr[aá]tis|start.free|comece.gr[aá]tis/i.test(lower)) {
		scores.saas += 2; signals.push("free trial CTA");
	}
	if (/app\.\w+\.\w+/i.test(lower)) {
		scores.saas += 1; signals.push("app subdomain reference");
	}
	if (/\/mo|\/m[eê]s|per.month|por.m[eê]s/i.test(linkTexts + " " + lower.slice(0, 5000))) {
		scores.saas += 2; signals.push("recurring pricing language");
	}

	// Determine winner
	const entries = Object.entries(scores) as [keyof typeof scores, number][];
	entries.sort((a, b) => b[1] - a[1]);
	const [topType, topScore] = entries[0];
	const [, secondScore] = entries[1];
	const totalScore = entries.reduce((sum, [, s]) => sum + s, 0);

	// Hybrid if top two are close
	if (topScore > 0 && secondScore > 0 && secondScore >= topScore * 0.6) {
		return { type: "hybrid", confidence: totalScore > 8 ? 0.7 : 0.5, signals };
	}

	if (topScore === 0) {
		return { type: "ecommerce", confidence: 0, signals: ["no signals — default"] };
	}

	const confidence = Math.min(1, topScore / 10);
	return { type: topType, confidence, signals };
}

export function deriveMiniAuditFindings(input: DeriveInput): MiniAuditFindings {
	const detectors: Detector[] = [
		// Original 6
		detectRevenuePathFragility,
		detectCtaBelowFold,
		detectTrustComposite,
		detectCompetingCtas,
		detectVagueCta,
		detectFormFriction,
		// New pure-parser detectors. Wave-22.6 STEP 0 — slop detectors
		// removed (NoLazyImages, WeakMetaDescription, MissingStructuredData,
		// MissingCanonical, MissingLang, IframeOveruse). Survived
		// detectors carry buyer-behavior + money narratives, not SEO
		// hygiene. Reframes applied to Analytics, RedirectChain,
		// ExcessiveExternalScripts — see each function for the new copy.
		detectMissingAnalytics,
		detectNoSocialProof,
		detectRedirectChain,
		detectThinContent,
		detectExcessiveExternalScripts,
		detectNoH1,
		detectExternalForms,
		// Cross-signal detectors (Vestigio moat)
		detectSpeedTrustCompound,
		detectWeakConversionPath,
		detectSlowHeavyPage,
		detectTrustlessCheckout,
		// Wave-22.7 — Services vertical. Each gates internally on
		// businessModel === "services" so non-services leads pay
		// zero cost (null return, no impact computation).
		detectServicesWhatsappBuried,
		detectServicesProfessionalRegistry,
		detectServicesAddressHoursMissing,
		detectServicesUnverifiableTestimonials,
		detectServicesWrongCtaTone,
		detectServicesNoGbpLink,
		detectServicesCategoriesBuried,
		// Wave-22.7 — Mobile-app conversion vertical. Each gates
		// internally on businessModel === "app_conversion".
		detectAppNoStoreBadges,
		detectAppNoSmartBanner,
		detectAppNoStoreRating,
		detectAppWebMessageConflict,
		detectAppNoScreenshots,
		detectAppPermissionsScary,
		// Wave-22.7 — Enterprise B2B vertical. Each gates internally
		// on businessModel === "enterprise". Audience is technical
		// (CTO/CISO/Head of Growth) so the copy can use industry
		// jargon (SOC 2, procurement, ACV, security review, etc.).
		detectEnterpriseNoCompliance,
		detectEnterpriseNoCaseStudyMetrics,
		detectEnterpriseNoPricingDisclosure,
		detectEnterpriseWeakDemoCta,
		detectEnterpriseNoRecognizableLogos,
		detectEnterpriseNoSecurityPage,
		detectEnterpriseNoComparison,
	];

	const detected: MiniFinding[] = [];
	for (const fn of detectors) {
		try {
			const result = fn(input);
			if (result) detected.push(result);
		} catch {
			// Per-detector failure is non-fatal — keep going.
		}
	}

	// Separate negatives from positives
	const negatives = detected.filter((f) => f.severity !== "positive");
	const positives: MiniFinding[] = [];

	// Always collect positive fallbacks
	for (const fn of fallbackPositives) {
		try {
			const result = fn(input);
			if (result) positives.push(result);
		} catch {
			// ignore
		}
	}

	// Sort negatives by severity (critical first)
	negatives.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

	// Cap at 5 negative findings + all positives
	const cappedNegatives = negatives.slice(0, 5);
	const visible = [...cappedNegatives, ...positives];

	// Blurred placeholders — these never get computed in the mini path;
	// they preview the kinds of findings the full produto entrega (cross-
	// signal compound inferences, behavioral patterns from pixel/ad
	// integrations, copy framework deep analysis). Each title here
	// describes a category the engine produces, not the specific finding.
	// The result page renders these as "+N descobertas a desbloquear"
	// teasers with counts derived from what the engine WOULD see if it
	// ran the full pipeline.
	const blurred: BlurredFinding[] = [
		{ id: "blur_1", category: "trust", teaser_title: "Domínios competindo pela sua marca no Google (você não cadastrou nenhum)" },
		{ id: "blur_2", category: "checkout", teaser_title: "Quanto seu checkout perde entre 22h e 8h (sem monitoramento noturno)" },
		{ id: "blur_3", category: "cta", teaser_title: "Suas 5 campanhas pagas vs o que sua landing entrega (gap quantificado)" },
		{ id: "blur_4", category: "structure", teaser_title: "3 vazamentos que se reforçam — por que esse leak te custa o dobro" },
		{ id: "blur_5", category: "cta", teaser_title: "Sua copy quebra no estágio de 'desejo' — 2 elementos AIDA faltando" },
		{ id: "blur_6", category: "structure", teaser_title: "Seus 3 maiores concorrentes lado a lado: copy, preço, CTA" },
		{ id: "blur_7", category: "trust", teaser_title: "Onde seus visitantes hesitam 2.4s antes de fechar a aba" },
		{ id: "blur_8", category: "structure", teaser_title: "Sua página de preço usa charm pricing — só que sem âncora" },
		{ id: "blur_9", category: "checkout", teaser_title: "4 vetores de risco de chargeback antes do gateway processar" },
		{ id: "blur_10", category: "performance", teaser_title: "40% das suas conversões mobile não estão sendo medidas" },
	];

	return { visible, blurred };
}
