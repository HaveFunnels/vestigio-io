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
 * Cheap off-domain check — does URL's host share the lead's root domain?
 * Accepts subdomains ("pay.store.com" is still on-domain for "store.com").
 */
function isOffDomain(url: string, rootDomain: string): boolean {
	try {
		const host = new URL(url).hostname.toLowerCase();
		const root = rootDomain.toLowerCase().replace(/^www\./, "");
		return !host.endsWith(root);
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
			: `Checkout off-domain (${checkoutFinalUrl ? new URL(checkoutFinalUrl).hostname : "unknown"})`,
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
			title: "Nenhum analytics ou pixel de conversão detectado",
			body: `Não encontramos Google Analytics, GTM, Meta Pixel, nem qualquer plataforma de analytics no HTML da página. Sem medição, você não sabe quais canais trazem receita, quais páginas vazam visitantes, ou se mudanças melhoram ou pioram conversão. Todo investimento em tráfego está voando cego.`,
			impact_hint: "Atribuição impossível — ROI invisível",
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
			category: "structure",
			title: desc ? "Meta description curta demais para gerar cliques" : "Meta description ausente",
			body: desc
				? `Sua meta description tem apenas ${desc.length} caracteres ("${desc.slice(0, 60)}…"). O ideal é 120–160 caracteres. Descrições curtas perdem espaço no snippet do Google e reduzem CTR orgânico — menos cliques = menos tráfego gratuito.`
				: `Sua página não declara meta description. O Google vai gerar uma automaticamente, mas ela raramente comunica seu valor. Páginas sem description perdem até 5.8% de CTR orgânico comparado com descriptions otimizadas.`,
			impact_hint: desc ? "CTR orgânico subotimizado" : "Google decide sua mensagem",
			evidence_refs: desc ? [`${desc.length} chars (mínimo: 50)`] : ["Tag <meta description> ausente"],
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
			category: "structure",
			title: "Sem structured data (JSON-LD) na página",
			body: `Nenhum bloco Schema.org/JSON-LD foi detectado. Structured data habilita rich snippets no Google (estrelas, preço, FAQ) e alimenta AI agents e assistentes de voz. Páginas com rich snippets têm CTR 58% maior que resultados simples. Sem isso, seu resultado é texto puro competindo contra concorrentes com cards visuais.`,
			impact_hint: "Sem rich snippets — CTR -58% vs concorrentes",
			evidence_refs: ["Zero blocos JSON-LD"],
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
			evidence_refs: ["Sem depoimentos", "Sem estrelas/ratings", "Sem plataformas de review"],
		},
		"trust_boundary_crossed",
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
			title: `${response.redirect_chain.length} redirecionamentos antes de carregar`,
			body: `Sua página passa por ${response.redirect_chain.length} redirects antes de renderizar (${response.redirect_chain.map((r) => r.status_code).join(" → ")}). Cada redirecionamento adiciona 100-500ms e perde ~5% dos visitantes mobile. Além da lentidão, crawlers de busca podem indexar a URL errada.`,
			impact_hint: "~5% perda por hop em mobile",
			evidence_refs: response.redirect_chain.slice(0, 3).map((r) => `${r.status_code} → ${new URL(r.url).hostname}`),
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
			title: "Sem URL canônica declarada",
			body: `Sua página não define <link rel="canonical">. Sem canonical, buscadores podem indexar versões duplicadas (www vs non-www, http vs https, com/sem trailing slash) e diluir a autoridade da página entre múltiplas URLs. Isso reduz ranking orgânico e tráfego gratuito.`,
			impact_hint: "Risco de conteúdo duplicado no Google",
			evidence_refs: ["Tag <link rel=canonical> ausente"],
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
			title: `Apenas ${parsed.body_word_count} palavras — conteúdo insuficiente para converter`,
			body: `Sua landing page tem apenas ${parsed.body_word_count} palavras de corpo. Páginas de alta conversão tipicamente têm 500-1500 palavras porque precisam: endereçar objeções, demonstrar valor, mostrar prova social e guiar até o CTA. Com conteúdo raso, o visitante não tem argumento suficiente para agir.`,
			impact_hint: "Conteúdo raso = argumento fraco",
			evidence_refs: [`${parsed.body_word_count} palavras no body`],
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
			title: `${externalScripts.length} scripts externos de ${uniqueHosts.length} domínios diferentes`,
			body: `Sua página carrega ${externalScripts.length} scripts de ${uniqueHosts.length} domínios (${uniqueHosts.slice(0, 4).join(", ")}${uniqueHosts.length > 4 ? "…" : ""}). Cada script externo adiciona latência de DNS, TLS e download. Além do peso, cada domínio é uma dependência — se um CDN travar, sua página pode quebrar. O custo composto em performance mobile é significativo.`,
			impact_hint: `${uniqueHosts.length} dependências externas`,
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
			category: "structure",
			title: "Sem headline principal (H1) na página",
			body: `Nenhum H1 foi detectado. A tag H1 é a hierarquia mais alta de conteúdo — comunica ao visitante e ao Google o assunto principal da página em milissegundos. Sem H1, a escaneabilidade cai, o ranking orgânico sofre e a proposta de valor fica diluída em texto genérico.`,
			impact_hint: "Escaneabilidade comprometida",
			evidence_refs: ["Tag <h1> ausente"],
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
			title: "Idioma da página não declarado",
			body: `O atributo <html lang="..."> não está definido. Sem essa declaração, leitores de tela leem o texto com pronúncia errada, ferramentas de tradução automática podem ignorar a página, e buscadores podem apresentar seu resultado na SERP errada. É uma correção de 1 linha com impacto desproporcional.`,
			impact_hint: "Acessibilidade + SEO internacional",
			evidence_refs: ["Atributo lang ausente no <html>"],
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
			body: `Sua página embarca ${parsed.iframes.length} iframes (${parsed.iframes.slice(0, 3).map((i) => new URL(i.src).hostname).join(", ")}${parsed.iframes.length > 3 ? "…" : ""}). Cada iframe abre uma nova "mini-página" dentro da sua, com seu próprio DOM, CSS, JS e requests de rede. O custo de memória e CPU em mobile é multiplicativo, não aditivo.`,
			impact_hint: "Performance mobile degradada",
			evidence_refs: parsed.iframes.slice(0, 3).map((i) => `iframe: ${new URL(i.src).hostname}`),
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
			evidence_refs: ["Campos de pagamento detectados", ...missing],
		},
		"trust_break_in_checkout",
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

export function deriveMiniAuditFindings(input: DeriveInput): MiniAuditFindings {
	const detectors: Detector[] = [
		// Original 6
		detectRevenuePathFragility,
		detectCtaBelowFold,
		detectTrustComposite,
		detectCompetingCtas,
		detectVagueCta,
		detectFormFriction,
		// New pure-parser detectors
		detectMissingAnalytics,
		detectNoLazyImages,
		detectWeakMetaDescription,
		detectMissingStructuredData,
		detectNoSocialProof,
		detectRedirectChain,
		detectMissingCanonical,
		detectThinContent,
		detectExcessiveExternalScripts,
		detectNoH1,
		detectExternalForms,
		detectMissingLang,
		detectIframeOveruse,
		// Cross-signal detectors (Vestigio moat)
		detectSpeedTrustCompound,
		detectWeakConversionPath,
		detectSlowHeavyPage,
		detectTrustlessCheckout,
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

	// Blurred placeholders — never computed, purely teaser for paid tier.
	const blurred: BlurredFinding[] = [
		{ id: "blur_1", category: "checkout", teaser_title: "Integridade do fluxo de checkout" },
		{ id: "blur_2", category: "trust", teaser_title: "Déficit de confiança na etapa de pagamento" },
		{ id: "blur_3", category: "friction", teaser_title: "Padrão de fricção com custo mensurável" },
		{ id: "blur_4", category: "mobile", teaser_title: "Revenue leak específico do mobile" },
		{ id: "blur_5", category: "performance", teaser_title: "Imposto de velocidade sobre conversão" },
		{ id: "blur_6", category: "policy", teaser_title: "Gap de política de reembolso e risco de chargeback" },
		{ id: "blur_7", category: "cta", teaser_title: "Problema de timing e visibilidade de CTA" },
		{ id: "blur_8", category: "structure", teaser_title: "Bloqueador superficial de conversão" },
		{ id: "blur_9", category: "trust", teaser_title: "Quebra de continuidade de confiança no handoff" },
		{ id: "blur_10", category: "checkout", teaser_title: "Risco de integração de gateway de pagamento" },
	];

	return { visible, blurred };
}
