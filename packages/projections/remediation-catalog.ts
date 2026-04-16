import type { VerificationStrategy } from '../domain/actions';

// ──────────────────────────────────────────────
// Remediation & Verification Catalog
//
// Single source of truth for the remediation_steps / verification_*
// fields populated on every FindingProjection + ActionProjection.
// Keyed by inference_key so it's trivial to look up when projecting
// findings (FindingProjection already carries inference_key).
//
// Format contract lives in docs/REMEDIATION_FORMAT.md. In short:
//   - remediation_steps: 2-7 verb-led sentences, ≤160 chars, no
//     sequencing words (array order IS the sequence).
//   - estimated_effort_hours: median dev-hours. Null when honestly
//     uncalibrated.
//   - verification_strategy: one of 7 values matching the taxonomy
//     in packages/domain/actions.ts.
//   - verification_notes: human-readable copy the MCP / UI shows
//     when user asks "how does verify work for this finding?" For
//     pixel_accumulation entries include "current/required sessions"
//     placeholder — Phase 3.2 resolves at render time.
//   - verification_eta_seconds: approx wall-clock of the verify
//     dispatch. Null for pixel_accumulation (there's no dispatch).
//
// Entries with remediation_steps=null leave the projection fields
// null (same as pre-Phase-2). Entries present here light up the
// finding card and the MCP verification surface.
//
// Populated incrementally by category (scale_readiness, revenue_
// integrity, chargeback, saas, channel_integrity, deep_discovery,
// performance, discoverability, brand_integrity, shopify_commerce,
// behavioral). Every inference_key emitted by the engine has a
// catalog entry — the Phase 2 coverage goal is 100%.
// ──────────────────────────────────────────────

export interface CatalogEntry {
	/** Ordered remediation steps — see docs/REMEDIATION_FORMAT.md. */
	remediation_steps: string[];
	/** Median dev-hours for the fix. Null when uncalibrated. */
	estimated_effort_hours: number | null;
	/** How this finding is re-verified. */
	verification_strategy: VerificationStrategy;
	/** User-facing copy describing the verify dispatch. */
	verification_notes: string;
	/** Wall-clock ETA for the verify in seconds. Null for pixel_accumulation. */
	verification_eta_seconds: number | null;
}

/**
 * Language hint so Phase 3.2 localization can pick the right
 * dictionary. Every entry in this file is pt-BR; if we ever ship
 * en variants the catalog becomes `Record<locale, Record<key, Entry>>`.
 */
export const CATALOG_LOCALE = 'pt-BR';

export const REMEDIATION_CATALOG: Record<string, CatalogEntry> = {
	// ─────────────────────────────────────────────
	// Scale Readiness pack
	// ─────────────────────────────────────────────

	trust_boundary_crossed: {
		remediation_steps: [
			'Mova o formulário de pagamento para o mesmo domínio da loja ou use o checkout embedded do gateway.',
			'Se a mudança de domínio for inevitável, adicione logotipo da loja e selo de segurança na página externa.',
			'Garanta HTTPS e certificado válido em ambos os domínios — verifique em navegadores em modo anônimo.',
			'Adicione copy no botão do checkout explicando que o próximo passo é uma página segura do processador de pagamento.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos disparar o checkout em um navegador headless, seguir os redirects até a página de pagamento, e conferir se a URL fica no seu domínio ou se há logotipo + selo na página externa.',
		verification_eta_seconds: 45,
	},

	policy_gap: {
		remediation_steps: [
			'Publique páginas separadas para política de privacidade, termos de uso, e política de reembolso.',
			'Vincule as três políticas no footer e também no checkout próximo aos campos de pagamento.',
			'Inclua no mínimo: prazo de reembolso, processo de devolução, LGPD compliance, e canal de contato.',
			'Mencione explicitamente a política de reembolso na página do produto próxima ao botão de compra.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar o footer, o checkout, e as URLs /privacidade /termos /reembolso (e variantes) pra confirmar a presença das três políticas + densidade mínima de conteúdo.',
		verification_eta_seconds: 8,
	},

	checkout_integrity: {
		remediation_steps: [
			'Execute o checkout end-to-end em pelo menos 3 navegadores (Chrome, Safari, mobile) e anote cada erro / redirect inesperado.',
			'Corrija os redirects off-domain e os erros de HTTP antes de qualquer otimização de conversão.',
			'Adicione selo de segurança SSL + 2 selos de trust (Reclame Aqui, Google Reviews, etc.) visíveis no checkout.',
			'Publique as políticas obrigatórias (privacidade, termos, reembolso) e vincule no footer do checkout.',
			'Configure monitoramento de uptime nas URLs /checkout e /cart com alertas sub-5-min.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar o checkout em headless browser, rastrear redirects, medir latência, e revalidar presença das políticas + selos de trust.',
		verification_eta_seconds: 60,
	},

	revenue_path_fragile: {
		remediation_steps: [
			'Identifique os 3 endpoints mais críticos do caminho de compra (produto → carrinho → checkout) e configure health checks de 1 minuto.',
			'Remova dependências de third-party scripts que bloqueiam o render do checkout — mova pra async / defer.',
			'Implemente fallback para o checkout quando o gateway primário falhar (retry automático + mensagem ao usuário).',
			'Adicione logging de erros client-side no checkout pra ter visibilidade de quais requests falham em produção.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o caminho completo (home → produto → carrinho → checkout) em headless, medir tempos por request, identificar third-parties bloqueantes e retornar um relatório atualizado.',
		verification_eta_seconds: 50,
	},

	measurement_coverage: {
		remediation_steps: [
			'Instale GA4 via GTM em todas as páginas incluindo a URL de confirmação (/obrigado, /success).',
			'Configure o evento `purchase` com transaction_id, value, currency, e items.',
			'Adicione Meta Pixel + Conversions API server-side pra sobreviver à perda de cookies.',
			'Valide em Tag Assistant / Meta Events Manager que os 4 tags (GA4, GTM, Pixel, CAPI) disparam em uma compra real.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos abrir a loja em navegador headless, disparar eventos sintéticos, e conferir se GA4 / GTM / Pixel / CAPI recebem. Relatamos quais estão presentes e quais ainda faltam.',
		verification_eta_seconds: 40,
	},

	critical_path_broken: {
		remediation_steps: [
			'Investigue o status code retornado por /checkout, /cart e páginas de produto — priorize as URLs com 4xx/5xx.',
			'Restore URLs quebradas imediatamente (via revert de deploy recente ou hotfix no roteamento).',
			'Configure alerta no Sentry / Datadog / UptimeRobot pra disparar quando status code não for 2xx em qualquer URL crítica.',
			'Revise o release pipeline pra bloquear deploy se smoke-test do checkout falhar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar as URLs críticas (/checkout, /cart, páginas de produto representativas) e confirmar se o status code voltou a ser 2xx.',
		verification_eta_seconds: 10,
	},

	form_data_leaves_domain: {
		remediation_steps: [
			'Audite o atributo `action` de todos os forms — liste quais apontam pra domínios externos.',
			'Whitelist forms legítimos (OAuth, processador de pagamento hosted) com documentação de por quê saem do domínio.',
			'Forms não-essenciais que saem do domínio: migre pra endpoints internos que proxyficam pro serviço externo.',
			'Adicione aria-label em todos os forms descrevendo o propósito (signup, checkout, support, search) pra facilitar a auditoria.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear o HTML das páginas relevantes, listar todos os forms com action cross-domain, e conferir se os não-whitelisted foram migrados.',
		verification_eta_seconds: 8,
	},

	untrusted_embeds_near_purchase: {
		remediation_steps: [
			'Audite embeds (iframes, scripts de terceiros) presentes nas páginas de produto, carrinho e checkout.',
			'Remova embeds não-essenciais do caminho de compra — trust badges decorativos, widgets de chat genéricos.',
			'Para embeds essenciais (gateway de pagamento, chat oficial), valide que vêm de domínios reconhecidos com certificado válido.',
			'Configure Content-Security-Policy restritivo no checkout permitindo apenas os domínios necessários.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear HTML do caminho de compra pra listar todos os iframes/scripts externos e classificar essenciais vs não-essenciais.',
		verification_eta_seconds: 10,
	},

	platform_checkout_risk_unaddressed: {
		remediation_steps: [
			'Documente explicitamente qual plataforma de checkout você usa (Shopify, Nuvem, hosted gateway) e a versão / plano.',
			'Configure um endpoint de health check contra a plataforma e monitore uptime via UptimeRobot ou similar.',
			'Tenha um plano de contingência escrito: se a plataforma ficar fora por >15min, como você processa pedidos manualmente.',
			'Verifique se seu plano da plataforma inclui SLA e compensação em caso de downtime.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos re-projetar o finding após sua próxima auditoria — sem dado novo, é um assessment estrutural do risco de dependência de plataforma.',
		verification_eta_seconds: 2,
	},

	revenue_path_regressed: {
		remediation_steps: [
			'Compare a auditoria atual com a anterior — identifique quais findings pioraram (severidade ou confidence subiu).',
			'Isole o deploy ou mudança de produto que coincide com a janela da regressão.',
			'Se a regressão veio de deploy: considere rollback enquanto investiga. Se veio de mudança operacional: revise o processo que causou.',
			'Adicione teste de smoke no caminho de receita pra prevenir esse tipo específico de regressão no próximo deploy.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos re-projetar sobre a evidência atual pra confirmar se a regressão ainda está presente ou foi resolvida depois do seu fix.',
		verification_eta_seconds: 3,
	},

	trust_surface_too_thin: {
		remediation_steps: [
			'Adicione no mínimo 3 trust markers visíveis na home: selo SSL, selos de pagamento (bandeiras aceitas), depoimentos / avaliações.',
			'Na página de produto, inclua: avaliações de clientes, política de reembolso, informações de contato, prazo de entrega.',
			'No checkout, reforce: selo SSL explícito, política de reembolso linkada, canal de suporte visível, logos de gateway.',
			'Evite trust markers genéricos sem contexto (badges sem certificação real por trás) — podem enfraquecer mais do que ajudar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar home + produto + checkout pra contar trust markers presentes e comparar com o baseline das lojas auditadas.',
		verification_eta_seconds: 12,
	},

	tracking_stack_gaps: {
		remediation_steps: [
			'Liste todos os canais de tráfego ativos (orgânico, pago, social, email) e qual tag cada um precisa pra atribuição.',
			'Instale e valide: GA4, GTM, Meta Pixel (se Meta Ads), Google Ads tag (se Google Ads), TikTok Pixel (se TikTok).',
			'Implemente CAPI / server-side para Meta e Google — mitigação crítica da perda de cookies no Safari/iOS.',
			'Documente qual evento (purchase, add_to_cart, initiate_checkout) cada tag deve capturar e teste em Tag Assistant.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos disparar um checkout sintético em headless browser e conferir quais tags disparam — retorna lista de tags presentes vs esperadas.',
		verification_eta_seconds: 50,
	},

	mobile_commercial_path_blocked: {
		remediation_steps: [
			'Execute o checkout completo em um iPhone e um Android — anote cada ponto onde o fluxo trava (viewport, teclado, botão).',
			'Corrija viewport meta tag (`width=device-width, initial-scale=1`) e garanta que o checkout não exige scroll horizontal.',
			'Teste botões: devem ter no mínimo 44x44px de área clicável e espaçamento ≥8px de outros elementos.',
			'Elimine overlays / modals que quebram em mobile (scroll trapped, close button fora da viewport).',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o checkout em um headless browser com viewport mobile (375x667) e relatar cada ponto onde o fluxo quebra.',
		verification_eta_seconds: 55,
	},

	mobile_trust_weaker_than_desktop: {
		remediation_steps: [
			'Compare home + produto + checkout em desktop vs mobile — trust markers que aparecem em desktop devem aparecer em mobile também.',
			'Mobile geralmente esconde trust markers em favor de espaço — priorize selo SSL, política de reembolso, e contato como sempre visíveis.',
			'Use acordeões / drawers pra expor trust markers sob demanda em vez de escondê-los completamente.',
			'Teste em viewport de 375px de largura que as informações de segurança do checkout não ficam truncadas.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar headless em viewport mobile e desktop e comparar quantos trust markers cada layout expõe.',
		verification_eta_seconds: 60,
	},

	secondary_flows_bypass_trust_path: {
		remediation_steps: [
			'Identifique os fluxos secundários: compra via WhatsApp, formulário de orçamento, deep link de ads, app externo.',
			'Para cada fluxo secundário, valide que o buyer cruza os mesmos trust markers (política, selo SSL, contato) antes da compra.',
			'Se um fluxo secundário pula o checkout oficial, adicione página intermediária com os trust markers essenciais.',
			'Meça conversão de cada fluxo secundário separadamente no GA4 — compare com o caminho oficial pra isolar onde trust está erodindo.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Phase 3 introduzirá probes nos fluxos secundários (WhatsApp, form) — hoje a verificação é re-projetar sobre evidência existente.',
		verification_eta_seconds: 3,
	},

	runtime_errors_interrupt_purchase: {
		remediation_steps: [
			'Configure error tracking (Sentry, Rollbar, Datadog RUM) no frontend do checkout e cart — não em todas as páginas ainda, foco no caminho de receita.',
			'Reveja os últimos 50 erros de JS capturados — priorize os que disparam em páginas de produto, cart, checkout.',
			'Adicione try/catch em calls externos do checkout (gateway, CAPI, anti-fraude) com fallback que não bloqueia o usuário.',
			'Configure source maps no build para que os stack traces em produção sejam legíveis.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o checkout em headless browser coletando erros JS de console — retorna lista de erros encontrados vs baseline anterior.',
		verification_eta_seconds: 45,
	},

	runtime_measurement_broken: {
		remediation_steps: [
			'Abra o checkout em Chrome DevTools e veja no Network tab: os requests pro GA4 / Pixel / CAPI estão chegando (status 200)?',
			'Adicione debug logging nas tags analíticas em ambiente de staging pra confirmar payload enviado.',
			'Valide com ferramentas oficiais: Tag Assistant (Google), Pixel Helper (Meta), GA4 DebugView.',
			'Se o problema for consent (LGPD): revise a lógica do banner pra garantir que tags disparam depois do consent, não antes nem nunca.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos disparar um checkout sintético em headless, capturar network requests, e confirmar quais tags enviam dados válidos.',
		verification_eta_seconds: 50,
	},

	high_intent_surfaces_blind: {
		remediation_steps: [
			'Identifique as páginas de maior intent comercial (produto, pricing, comparação) e valide que todas têm GA4 + Pixel tagged.',
			'Configure scroll tracking e time-on-page especificamente nessas surfaces — intent precisa ser medido além de pageview.',
			'Adicione eventos customizados de engagement: view_item, add_to_cart, scroll_75, time_on_page_60s.',
			'Crie dashboard de funil apenas pra essas surfaces pra visualizar drop-off por etapa de intent.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar em headless pelas páginas de alto intent e confirmar quais eventos disparam vs esperados.',
		verification_eta_seconds: 45,
	},

	// ─────────────────────────────────────────────
	// Revenue Integrity pack
	// ─────────────────────────────────────────────

	conversion_flow_fragmented: {
		remediation_steps: [
			'Mapeie o funil atual: home → produto → carrinho → checkout → confirmação. Identifique onde há mais de um caminho possível.',
			'Consolide CTAs duplicados na home e produto — um CTA primário claro por página.',
			'Remova etapas opcionais que quebram o momentum (newsletter popup antes do checkout, survey pós-add-to-cart).',
			'Padronize o layout do checkout: uma coluna em mobile, campos agrupados logicamente, indicador de progresso se multi-step.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o funil completo e contar paths alternativos + CTAs competindo por atenção.',
		verification_eta_seconds: 50,
	},

	friction_on_critical_path: {
		remediation_steps: [
			'Conte quantos campos de formulário existem entre "ver produto" e "pagar" — reduza pra ≤ 8 obrigatórios.',
			'Elimine logins forçados antes do checkout — ofereça checkout como convidado com opção de criar conta depois.',
			'Remova modais, popups e overlays no caminho de compra — apenas o necessário pra efetivar o pagamento.',
			'Se há múltiplos steps no checkout, garanta que volta e edita cada step sem perder dados já preenchidos.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar o caminho crítico em headless e contar fricções: campos, modais, redirects, logins forçados.',
		verification_eta_seconds: 50,
	},

	revenue_leakage: {
		remediation_steps: [
			'Revise a lista de findings de maior impacto — priorize os que têm confidence ≥ 70% e severity ≥ high.',
			'Para cada finding prioritário, marque o owner responsável e a janela de implementação.',
			'Bloqueie deploys que impactem o caminho de receita até que os findings críticos sejam resolvidos.',
			'Crie um dashboard semanal com sum of monthly_range.mid dos findings abertos pra rastrear leakage acumulado.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Re-projetar sobre a evidência atual pra recalcular o leakage agregado — sem novo data, apenas a soma atual.',
		verification_eta_seconds: 3,
	},

	trust_break_in_checkout: {
		remediation_steps: [
			'Abra o checkout e identifique cada momento onde o buyer poderia hesitar (mudança de domínio, selo faltando, política escondida).',
			'Adicione selo SSL explícito ("Conexão segura") próximo ao campo de cartão de crédito.',
			'Exiba política de reembolso em 1 clique a partir do checkout — não esconda em footer genérico.',
			'Mostre logos das bandeiras de cartão aceitas + logo do gateway (Stripe, Mercado Pago, etc.) para reforçar credibilidade.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar até o checkout em headless e contar trust markers visíveis no viewport do pagamento.',
		verification_eta_seconds: 40,
	},

	measurement_blindspot: {
		remediation_steps: [
			'Identifique surfaces comerciais sem tag analítica — páginas de produto órfãs, URLs legadas, landing pages de campanha.',
			'Adicione GA4 + Pixel nessas surfaces específicas — pode ser via GTM ou tag direta.',
			'Configure eventos customizados pro contexto daquela surface (view_item em produto, generate_lead em landing).',
			'Valide em GA4 DebugView que eventos chegam com o contexto correto (product_id, value, etc.).',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar as surfaces identificadas em headless e confirmar presença de tags + disparos de eventos.',
		verification_eta_seconds: 35,
	},

	unclear_conversion_intent: {
		remediation_steps: [
			'Identifique o CTA primário de cada página comercial — deve ser explícito e único no viewport.',
			'Reescreva textos de CTA vagos ("Saiba mais", "Clique aqui") pra verbos de ação claros ("Comprar agora", "Ver preços", "Agendar demo").',
			'Teste se o CTA comunica a próxima etapa: "Adicionar ao carrinho" vs "Prosseguir pra pagamento" têm intents diferentes.',
			'Use cor de destaque contrastante apenas no CTA primário — CTAs secundários em estilo outline / ghost.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear HTML das páginas comerciais e auditar text + styling dos CTAs contra lista de padrões vagos.',
		verification_eta_seconds: 8,
	},

	redirect_chain_erodes_checkout_trust: {
		remediation_steps: [
			'Audite a cadeia de redirects do /checkout — use curl -L -I ou DevTools Network pra listar cada hop.',
			'Elimine redirects desnecessários (http→https→www→subdomain) — idealmente um único redirect ou zero.',
			'Se o gateway requer saída de domínio, garanta que o redirect final é direto e não passa por intermediários.',
			'Configure HSTS no domínio raiz pra forçar HTTPS sem round-trip de redirect.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar /checkout seguindo redirects e contar hops — relatório inclui cada URL intermediária.',
		verification_eta_seconds: 10,
	},

	commercial_journey_language_break: {
		remediation_steps: [
			'Audite se todas as surfaces comerciais (home, produto, checkout, confirmação) estão no mesmo idioma.',
			'Resolva mixes: produto em pt-BR mas checkout em inglês é um trust-break imediato pro buyer brasileiro.',
			'Configure `<html lang="pt-BR">` em todas as páginas comerciais pra sinalizar aos buscadores e leitores de tela.',
			'Se você tem versão multi-idioma, implemente hreflang pra evitar que o Google indexe a versão errada por região.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear HTML das surfaces comerciais e extrair atributo lang + amostra de copy pra detectar mix de idiomas.',
		verification_eta_seconds: 8,
	},

	commercial_pages_disconnected: {
		remediation_steps: [
			'Audite a navegação: a partir da home, quantos cliques são necessários pra chegar numa página de produto?',
			'Garanta que categorias / produtos principais estão linkados da home em até 2 cliques.',
			'Revise o footer — links pra produtos-chave e políticas devem aparecer em toda página comercial.',
			'Adicione breadcrumbs nas páginas de produto e categoria pra melhorar navegação e SEO.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos crawlar a home e mapear a profundidade de links até cada página de produto.',
		verification_eta_seconds: 15,
	},

	post_purchase_confirmation_absent: {
		remediation_steps: [
			'Audite a página de confirmação pós-compra: deve ter número do pedido, resumo do que foi comprado, e prazo estimado de entrega.',
			'Configure email transacional de confirmação disparado imediatamente após o purchase event.',
			'Inclua no email: nota fiscal (ou prazo de envio dela), canal de suporte, e link de rastreio quando disponível.',
			'Configure retry + fallback no envio do email — não dependa de um único provider sem backup.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar a URL de confirmação em headless e verificar presença dos elementos essenciais (order ID, resumo, prazo).',
		verification_eta_seconds: 35,
	},

	refund_process_unclear: {
		remediation_steps: [
			'Reescreva a página de política de reembolso com estrutura: prazo → processo → canal de contato → exceções.',
			'Inclua exemplos concretos ("Se você recebeu produto errado, envie email X com foto") — não deixe só regras abstratas.',
			'Adicione FAQ de refund no checkout ou próximo ao botão de pagar, com link pra política completa.',
			'Meça tempo médio até primeiro contato do cliente via canal de refund — menos que 2h úteis é benchmark bom.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar a página de política de reembolso e analisar estrutura + densidade de conteúdo.',
		verification_eta_seconds: 5,
	},

	post_purchase_proof_too_weak: {
		remediation_steps: [
			'Configure email de confirmação profissional (template branded, não texto plano) disparado em <1min após compra.',
			'Inclua nota fiscal eletrônica / recibo PDF anexado ou linkado pra download.',
			'Adicione código de rastreio assim que disponível (webhook do transportador → email automático).',
			'Envie email de follow-up pós-entrega pedindo avaliação — reforça o fechamento do ciclo de trust.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'not_verifiable_explain',
		verification_notes:
			'Post-purchase proof acontece via email/SMS externo ao site — não dá pra verificar via crawl. Phase 3 explora integração com ESP pra validar templates de transacional.',
		verification_eta_seconds: null,
	},

	support_reassurance_too_late: {
		remediation_steps: [
			'Posicione canal de suporte visível antes do checkout — footer com WhatsApp/chat em toda página comercial.',
			'Adicione microcopy próximo ao botão de pagamento: "Dúvidas? Fale com nosso time via WhatsApp".',
			'Se você tem chat widget, garanta que ele carrega rápido (sem bloquear o render do checkout) e responde em <5min úteis.',
			'Inclua FAQ de compra direto na página de produto e checkout — responda as 5 dúvidas mais comuns antes que o buyer precise perguntar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear home + produto + checkout e detectar canais de suporte visíveis em cada surface.',
		verification_eta_seconds: 8,
	},

	reassurance_routes_disconnected: {
		remediation_steps: [
			'Teste cada rota de reassurance: clicar "Política de reembolso" do checkout abre em nova aba ou leva pra footer genérico?',
			'Garanta que cada trust marker (política, contato, depoimentos) abre CONTEXTUAL — modal ou página dedicada com link de volta.',
			'Evite políticas em URLs soltas do footer — ancore-as no contexto da compra (link direto do checkout pra política de reembolso).',
			'Meça a taxa de retorno pós-clique nesses links — se >50% dos cliques não voltam, o link está desviando o buyer.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar a partir do checkout clicando em cada link de reassurance e conferir destino + comportamento.',
		verification_eta_seconds: 40,
	},

	alternate_flows_unmeasured: {
		remediation_steps: [
			'Liste todos os fluxos alternativos de compra: WhatsApp, email, ligação, formulário de orçamento, marketplace.',
			'Para cada fluxo, garanta que o evento de conversão é capturado (mesmo que manualmente — registrar no CRM + evento customizado no GA4).',
			'Configure UTMs + custom source/medium pra separar conversões desses fluxos das do site principal.',
			'Crie dashboard no GA4 que consolide todas as fontes de conversão pra você enxergar o funil completo.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Fluxos alternativos acontecem fora do site — verificação é re-projetar depois que você marca os eventos.',
		verification_eta_seconds: 3,
	},

	runtime_breaking_reassurance: {
		remediation_steps: [
			'Audite se componentes de reassurance (política, chat widget, trust badges) disparam erro JS que quebra a página.',
			'Garanta que chat widgets carregam de forma async/defer — não bloqueiam o render do conteúdo principal.',
			'Se um trust badge falha ao carregar (imagem 404, script externo timeout), tenha fallback que não mostra espaço quebrado.',
			'Configure alerta de erro JS no checkout pra detectar regressões antes do buyer chegar.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos abrir o checkout em headless com console capture e conferir se componentes de trust renderizam sem erros.',
		verification_eta_seconds: 45,
	},

	checkout_provider_path_weak: {
		remediation_steps: [
			'Se você usa um único provedor de checkout, tenha contingência: gateway backup configurado + processo manual documentado.',
			'Revise o contrato com o provedor pra entender SLA e compensação em downtime.',
			'Configure monitoring externo (UptimeRobot) especificamente contra a URL do checkout — não confie apenas no status page do provedor.',
			'Tenha checklist escrito pra quando o provedor ficar fora: comunicar time, ativar backup, atender buyers por WhatsApp temporariamente.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Risco estrutural de provider único — verificação é re-projetar após você diversificar ou documentar contingência.',
		verification_eta_seconds: 3,
	},

	trust_and_measurement_both_absent: {
		remediation_steps: [
			'Resolva primeiro o trust — é barato e tem impacto imediato (políticas publicadas + selos visíveis em ≤1 dia).',
			'Em paralelo, configure GA4 + Pixel básicos na home + checkout pra ter pelo menos 1 camada de medição.',
			'Não deploy nenhuma campanha paga enquanto esses dois gaps estão abertos — você paga ads sem medir e sem fechar vendas.',
			'Crie checkpoint semanal com o time revisando progresso em ambas frentes — trust + measurement não devem divergir.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-verificar presença de políticas, selos, tags de medição em paralelo e retornar progresso conjunto.',
		verification_eta_seconds: 15,
	},

	consent_undermining_measurement: {
		remediation_steps: [
			'Revise seu banner de consent: está bloqueando GA4 / Pixel ANTES mesmo do buyer responder? Troque pra bloqueio condicional.',
			'Configure Google Consent Mode v2 — permite medição com dados agregados mesmo sem consent total.',
			'No Meta, ative Conversions API server-side como fallback quando o Pixel no browser é bloqueado.',
			'Valide em ambientes opt-in e opt-out: em ambos casos, alguma medição deve chegar (mesmo que limitada em opt-out).',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar em headless com consent rejeitado e consent aceito, conferindo quais tags disparam em cada cenário.',
		verification_eta_seconds: 60,
	},

	checkout_provider_fragmented: {
		remediation_steps: [
			'Liste quantos gateways / checkouts diferentes seus fluxos usam (site, mobile app, marketplace, WhatsApp).',
			'Consolide: idealmente 1-2 gateways cobrindo 95% do volume — fragmentação aumenta custo + complexidade.',
			'Para fluxos remanescentes que precisam de gateway dedicado, documente o motivo (regulatório, geográfico) pra justificar.',
			'Padronize a experiência visual do checkout mesmo quando o backend varia — consumidor não deveria perceber a fragmentação.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar os checkouts dos fluxos conhecidos e identificar quantos gateways distintos aparecem.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Chargeback Resilience pack
	// ─────────────────────────────────────────────

	refund_policy_gap: {
		remediation_steps: [
			'Publique política de reembolso com prazo (7 dias CDC), processo, e email de contato explícito.',
			'Vincule a política no footer do checkout e no email de confirmação pós-compra.',
			'Mencione a política na página do produto próxima ao botão de compra — reduz dispute rate.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar o footer + URLs /reembolso /reembolsos /politica-devolucao pra confirmar presença e densidade mínima.',
		verification_eta_seconds: 5,
	},

	support_unreachable: {
		remediation_steps: [
			'Exponha pelo menos 2 canais de suporte no footer de toda página: email + WhatsApp (ou telefone).',
			'Configure resposta automática em <5min úteis nos canais principais — buyer não deve esperar mais que isso pra primeiro contato.',
			'Publique horário de atendimento ("seg-sex 9h-18h") pra setar expectativa clara.',
			'Meça tempo médio até primeira resposta e first-contact-resolution — use como KPI de suporte.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear footer + páginas de contato pra detectar canais disponíveis (email, WhatsApp, telefone, chat).',
		verification_eta_seconds: 8,
	},

	expectation_misalignment: {
		remediation_steps: [
			'Revise prazos de entrega declarados no produto vs prazos reais — desalinhamento gera chargeback.',
			'Se o prazo varia por região (frete), exiba calculadora de CEP na página do produto antes do checkout.',
			'Comunique delays proativamente por email quando descobertos — não deixe buyer perceber sozinho e reclamar.',
			'Inclua "prazo de entrega estimado" na página de confirmação pós-compra com base real de logística.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar páginas de produto buscando claims de prazo/garantia vs comparar com dados reais de logística.',
		verification_eta_seconds: 10,
	},

	dispute_risk_elevated: {
		remediation_steps: [
			'Priorize fix em TODAS as frentes simultaneamente: refund_policy + support_unreachable + expectation_misalignment não podem ficar abertas juntas.',
			'Monitore chargeback rate semanalmente — alert se exceder 0.9% do volume (limiar de atenção do gateway).',
			'Implemente pre-dispute: antes do cliente abrir chargeback, emita uma comunicação proativa "teve algum problema? Nós resolvemos".',
			'Se o gateway suspender processamento por chargeback alto, tenha plano B (outro gateway) já implementado.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Risco composto — a verificação é re-projetar sobre a evidência após você fechar as frentes individuais (refund, support, expectations).',
		verification_eta_seconds: 3,
	},

	refund_terms_too_thin: {
		remediation_steps: [
			'Expanda a política de reembolso pra incluir: prazo exato, processo passo-a-passo, exceções explícitas, canal de contato.',
			'Evite linguagem legalesa — escreva como você explicaria pra um amigo o que fazer em caso de problema.',
			'Adicione exemplos concretos ("Se o produto chegou quebrado, envie email X com foto").',
			'Vincule a FAQ com as 5 dúvidas mais comuns sobre reembolso direto no checkout.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar a política de reembolso e medir densidade de conteúdo + presença de elementos estruturais chave.',
		verification_eta_seconds: 5,
	},

	support_hidden_at_purchase: {
		remediation_steps: [
			'No checkout, adicione microcopy ou banner: "Dúvidas? Fale com nosso time: WhatsApp XXXX-XXXX".',
			'Chat widget (se houver) deve estar visível no canto sem bloquear os campos de pagamento.',
			'Botão de suporte deve abrir o canal PRIMÁRIO, não uma página de FAQ genérica.',
			'Configure handover automático pra humano quando o buyer está no checkout — intent de compra > intent de auto-serviço.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar até o checkout em headless e detectar presença de canal de suporte visível acima da dobra.',
		verification_eta_seconds: 35,
	},

	// ─────────────────────────────────────────────
	// SaaS Growth Readiness pack
	// ─────────────────────────────────────────────

	activation_blocked: {
		remediation_steps: [
			'Mapeie o fluxo de ativação: signup → primeiro login → primeiro valor entregue. Cronometre cada etapa.',
			'Elimine bloqueadores técnicos: email verification obrigatório que pode ser deferido, setup wizard com steps opcionais demais.',
			'Garanta que o primeiro login entrega valor imediato — dashboard com sample data, tour guiado, ou wizard curto.',
			'Meça taxa de ativação (% usuários que chegam ao "aha moment") e configure alerta se cair abaixo de baseline.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar signup + primeiro login sintéticos em headless e medir tempo até primeiro valor percebido.',
		verification_eta_seconds: 90,
	},

	activation_friction_high: {
		remediation_steps: [
			'Reduza campos obrigatórios no signup — idealmente apenas email + senha ou OAuth.',
			'Dados adicionais (empresa, cargo, tamanho) peça progressivamente depois que o usuário já experimentou o produto.',
			'Permita signup via OAuth (Google, GitHub) pra reduzir barreira de entrada.',
			'Se setup wizard é necessário, mostre progresso e permita "pular por enquanto" em steps opcionais.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar signup em headless e contar campos obrigatórios + steps até primeiro acesso ao produto.',
		verification_eta_seconds: 45,
	},

	unclear_next_step: {
		remediation_steps: [
			'Audite a primeira tela pós-login: há um CTA primário claro indicando o próximo passo?',
			'Implemente onboarding checklist visível (ex: "Complete seu perfil", "Adicione seu primeiro item") com progresso.',
			'Empty states (listas vazias, dashboard sem dados) devem ter CTA específico para preencher aquele contexto.',
			'Evite dashboards densos na primeira sessão — apresente o produto em camadas conforme o usuário demonstra intent.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos logar como novo usuário em headless e identificar se há CTA primário claro nos primeiros 3 segundos.',
		verification_eta_seconds: 40,
	},

	empty_state_without_guidance: {
		remediation_steps: [
			'Para cada lista/dashboard que pode ficar vazio, desenhe empty state com: ilustração, copy explicativo, CTA específico.',
			'Empty states devem guiar para a ação certa ("Adicionar primeiro item", "Convidar time", "Conectar integração").',
			'Se o empty state é comum (ex: novo usuário), considere pre-popular com sample data removível.',
			'Teste em sessão sintética: o novo usuário consegue sair do empty state em <30s?',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar surfaces principais como usuário sem dados e verificar se cada empty state tem CTA funcional.',
		verification_eta_seconds: 50,
	},

	navigation_overcomplex: {
		remediation_steps: [
			'Conte quantos itens top-level sua navegação tem — se >7, simplifique agrupando sob categorias.',
			'Organize navegação por frequência de uso — itens mais usados acima, raramente usados atrás de "Mais" ou settings.',
			'Implemente busca global (Cmd+K) pra compensar navegação profunda — atalho reduz clicks para features escondidas.',
			'Remova itens órfãos: analytics mostra features nunca acessadas? Esconda ou remova.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear a estrutura de navegação e contar profundidade + número de itens top-level.',
		verification_eta_seconds: 8,
	},

	feature_discovery_poor: {
		remediation_steps: [
			'Liste features premium/avançadas e verifique se cada uma tem um entry point descobrível na UI.',
			'Adicione hints contextuais: quando o usuário faz X, tooltip sugere feature Y que complementa.',
			'Configure product tours (Appcues, Intro.js) para features introduzidas recentemente.',
			'Meça via analytics % de usuários que usam cada feature em 30 dias — features com <5% podem precisar de reposicionamento.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos logar como usuário sintético e explorar cada menu pra ver se features premium aparecem em entry points descobríveis.',
		verification_eta_seconds: 60,
	},

	upgrade_invisible: {
		remediation_steps: [
			'Adicione CTA de upgrade visível em pontos de contato com features gated (ex: badge "Premium" no item bloqueado).',
			'Na settings/pricing page, exiba comparação de planos com feature-by-feature matrix clara.',
			'Configure prompts contextuais: quando o usuário atinge limite do plano, modal oferece upgrade direto daquela ação.',
			'Evite paywalls agressivos no primeiro contato — dá valor primeiro, upgrade depois.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar settings + pricing + features gated pra confirmar presença e clareza dos CTAs de upgrade.',
		verification_eta_seconds: 10,
	},

	upgrade_timing_wrong: {
		remediation_steps: [
			'Revise quando os prompts de upgrade aparecem — não devem interromper task crítica (ex: durante fluxo de criação).',
			'Timing ideal: após o usuário ter experimentado valor, estar próximo ao limite do plano atual, ou ter tentado feature premium.',
			'Evite upgrade popups aleatórios — use triggers comportamentais (limite atingido, feature acessada, 30 dias ativos).',
			'Meça taxa de conversão de cada trigger de upgrade — desative os com <1% de CR.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Timing de upgrade é signal comportamental + produto — re-projetar sobre evidência após você ajustar triggers.',
		verification_eta_seconds: 3,
	},

	no_expansion_path: {
		remediation_steps: [
			'Para cada plano atual, defina o próximo degrau natural: "Pro: 10 users → Business: 50 users" é um exemplo de expansion clara.',
			'Configure signal de expansion readiness: uso próximo ao limite, novos users adicionados, features avançadas adotadas.',
			'Implemente self-service upgrade (não exigir sales call) pra expansion automática.',
			'Meça Net Revenue Retention mensal — healthy SaaS tem NRR >110%.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Expansion é uma estratégia de produto — verificação é re-projetar após você definir caminho claro e instrumentar.',
		verification_eta_seconds: 3,
	},

	landing_app_mismatch: {
		remediation_steps: [
			'Compare a landing page com o produto real: prometem a mesma coisa? Tom, layout, e value prop devem se alinhar.',
			'Se a landing promete "simples e rápido", o primeiro login do app deve entregar essa sensação — não uma wizard de 15 steps.',
			'Faça teste com 5 novos usuários: peça feedback específico sobre "o que a landing prometeu vs o que o app entregou".',
			'Revise mensalmente — landing evolui rápido em SaaS, app às vezes não acompanha.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar da landing até primeiro login em headless, comparando elementos visuais e copy principais.',
		verification_eta_seconds: 55,
	},

	// ─────────────────────────────────────────────
	// Copy Analysis (Tier 1)
	// ─────────────────────────────────────────────

	checkout_trust_language_absent: {
		remediation_steps: [
			'Adicione copy próximo ao botão de pagar reforçando segurança: "Pagamento criptografado", "Certificado SSL", "Seus dados não são compartilhados".',
			'Inclua microcopy explicando próximos passos: "Após o pagamento você receberá email com nota fiscal e rastreio".',
			'Evite copy genérico ("Seguro e rápido") — use frases específicas ao contexto da compra.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar o checkout e procurar por keywords de trust language próximo aos campos de pagamento.',
		verification_eta_seconds: 5,
	},

	cta_clarity_weak_on_commercial: {
		remediation_steps: [
			'Substitua CTAs vagos ("Saiba mais", "Clique aqui") por verbos de ação específicos ("Comprar", "Ver preços", "Agendar demo").',
			'Cada página comercial deve ter 1 CTA primário dominante — secundários em estilo outline/link.',
			'O texto do CTA deve comunicar o que acontece no próximo clique: "Adicionar ao carrinho" ≠ "Ir pro pagamento".',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-parsear HTML e auditar texto de cada CTA contra lista de padrões vagos.',
		verification_eta_seconds: 6,
	},

	product_page_copy_generic: {
		remediation_steps: [
			'Reescreva descrição de produto focando em benefícios específicos, não features genéricas.',
			'Substitua copy de templates ("Produto de alta qualidade") por claims verificáveis ("Algodão 100% orgânico certificado GOTS").',
			'Inclua contexto de uso: quem é o comprador ideal, quando usa, qual problema resolve.',
			'Teste A/B headlines — copy genérico geralmente perde 10-20% de conversão vs copy específico.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar páginas de produto e rodar análise de densidade semântica + comparação com templates genéricos conhecidos.',
		verification_eta_seconds: 10,
	},

	pricing_page_framing_unclear: {
		remediation_steps: [
			'Clarifique o que diferencia cada plano — features específicas, não apenas limites numéricos.',
			'Destaque visualmente o plano recomendado (badge "Mais popular", cor diferente).',
			'Responda as 5 dúvidas mais comuns direto na pricing: "Posso trocar de plano?", "Tem fidelidade?", "Tem período de teste?".',
			'Remova pricing com "Entre em contato" se possível — preços transparentes convertem melhor em SMB.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar a página de pricing e auditar estrutura: planos distinguíveis, plano recomendado marcado, FAQ presente.',
		verification_eta_seconds: 8,
	},

	// ─────────────────────────────────────────────
	// Wave 3.1 Tier 2 — LLM Enrichment (dormant findings)
	// ─────────────────────────────────────────────

	social_proof_generic: {
		remediation_steps: [
			'Substitua depoimentos genéricos por depoimentos com nome completo, foto, empresa/contexto.',
			'Adicione números concretos: "12.000 clientes", "4.8 estrelas em 3.200 avaliações", "reduzimos X em Y%".',
			'Inclua logos de clientes conhecidos (com permissão) — social proof visual impacta mais que texto.',
			'Evite badges genéricos sem fundamento ("Nº 1 em qualidade") que enfraquecem em vez de fortalecer.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Phase 3 ativa LLM enrichment pra avaliar qualidade de social proof. Hoje a verificação é estrutural: conta quantos depoimentos têm atributos concretos.',
		verification_eta_seconds: 10,
	},

	form_error_messages_unhelpful: {
		remediation_steps: [
			'Audite mensagens de erro de cada form crítico (signup, checkout) — devem explicar o problema específico, não só "Erro".',
			'Erros devem indicar como corrigir: "Email já cadastrado — fazer login?" em vez de "Email inválido".',
			'Destaque visualmente o campo com erro (borda vermelha, ícone) e foca automaticamente pro usuário corrigir.',
			'Valide client-side em real-time — não espere submit pra mostrar que o email tá com typo.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Phase 3 ativa LLM enrichment. Hoje vamos navegar headless submetendo forms com dados inválidos e capturar as mensagens de erro.',
		verification_eta_seconds: 45,
	},

	onboarding_no_quick_win: {
		remediation_steps: [
			'Defina o "aha moment" do produto — qual é a menor demonstração de valor que o novo usuário pode experimentar em <5min?',
			'Redesign o primeiro login pra entregar esse aha moment na primeira sessão — não na terceira.',
			'Se for necessário setup (importação, integração), mostre preview com sample data primeiro.',
			'Meça taxa de "aha moment completion" e otimize pra subir essa métrica — é o melhor preditor de retenção.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Phase 3 ativa LLM enrichment. Hoje vamos executar signup+primeiro uso em headless e cronometrar até primeiro valor.',
		verification_eta_seconds: 90,
	},

	// ─────────────────────────────────────────────
	// Security Posture (Wave 3.3)
	// ─────────────────────────────────────────────

	security_header_weakness: {
		remediation_steps: [
			'Implemente HSTS: header `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.',
			'Configure CSP restritivo no checkout: apenas domínios whitelisted (seu site, gateway, GA/Pixel oficiais).',
			'Adicione X-Content-Type-Options: nosniff, X-Frame-Options: DENY (ou SAMEORIGIN se legítimo), Referrer-Policy: strict-origin.',
			'Valide em securityheaders.com — target é score A ou A+ em domínios de commerce.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar os headers das URLs críticas e comparar com baseline de segurança esperado.',
		verification_eta_seconds: 5,
	},

	mixed_content_exposure: {
		remediation_steps: [
			'Liste recursos HTTP carregados em páginas HTTPS — use DevTools Console que reporta mixed content warnings.',
			'Migre todos os recursos pra HTTPS: imagens, scripts, CSS, fonts, iframes.',
			'Configure Content-Security-Policy com `upgrade-insecure-requests` pra forçar browser a tentar HTTPS automaticamente.',
			'Corrija links internos hardcoded com http:// — migre pra protocol-relative (//) ou https://.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar URLs críticas em headless e capturar mixed content warnings do console.',
		verification_eta_seconds: 40,
	},

	sensitive_endpoint_exposed: {
		remediation_steps: [
			'Remova URLs administrativas de paths previsíveis (/admin, /wp-admin, /.env, /api/debug) — 404 ou redirect pra home.',
			'Adicione autenticação em todos endpoints administrativos — não confie em obscuridade.',
			'Configure robots.txt pra disallow rotas sensíveis (mas saiba que robots.txt não é mecanismo de segurança).',
			'Rode scanner regular (Nuclei, Katana) pra detectar endpoints expostos em produção.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos disparar o scanner Nuclei + Katana na infraestrutura pública pra confirmar se endpoints sensíveis seguem expostos.',
		verification_eta_seconds: 180,
	},

	checkout_script_hijack_risk: {
		remediation_steps: [
			'Audite todos scripts carregados no checkout — elimine third-parties não-essenciais.',
			'Para third-parties essenciais, implemente Subresource Integrity (SRI): `<script integrity="sha384-...">` previne injeção se o CDN for comprometido.',
			'Configure CSP restritivo no checkout: apenas hashes/nonces de scripts conhecidos.',
			'Monitore mudanças no script inventário — alerta se script novo aparecer em produção sem deploy.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar o checkout em headless, extrair lista de scripts, e comparar com whitelist conhecido.',
		verification_eta_seconds: 50,
	},

	buyer_session_theft_risk: {
		remediation_steps: [
			'Cookies de sessão: configure `HttpOnly`, `Secure`, `SameSite=Lax` ou `Strict`.',
			'Tokens CSRF em todos os forms sensíveis — signup, checkout, password change.',
			'Implemente rotação de session ID após login pra prevenir session fixation.',
			'Configure session timeout razoável (30-60min de inatividade) e renovação em ação do usuário.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar em headless e inspecionar atributos de cookies de sessão + presença de CSRF tokens em forms.',
		verification_eta_seconds: 45,
	},

	checkout_clickjack_risk: {
		remediation_steps: [
			'Configure X-Frame-Options: DENY (ou SAMEORIGIN se você embute o checkout em legítimo iframe próprio).',
			'Ou use CSP `frame-ancestors \'none\'` pra bloquear qualquer site externo de colocar seu checkout em iframe.',
			'Teste em clickjack testers (como /teste-clickjacking tools) pra confirmar que o checkout não renderiza em iframe externo.',
			'Revise páginas de ação sensível (mudança de senha, delete account) — apliquem mesma proteção.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-fetchar headers da URL do checkout e validar presença de X-Frame-Options ou CSP frame-ancestors.',
		verification_eta_seconds: 4,
	},

	error_page_information_leak: {
		remediation_steps: [
			'Customize páginas 404 e 500 — não expor stack traces, versões de framework, ou paths do servidor.',
			'Configure error handler genérico em produção que loga detalhes server-side mas retorna mensagem amigável.',
			'Audite respostas JSON de APIs — não incluir detalhes de exception em produção.',
			'Remova comentários HTML com informações sensíveis (versões, paths internos) do output.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos requisitar URLs de erro conhecidas (404, 500) e analisar conteúdo retornado pra vazamentos.',
		verification_eta_seconds: 8,
	},

	payment_data_unencrypted: {
		remediation_steps: [
			'Verifique se forms de pagamento enviam dados via HTTPS — target do form deve ser https://.',
			'Nunca receba PAN (número do cartão) direto em seu backend — use tokenização do gateway.',
			'Se necessário mostrar mask do cartão (últimos 4 dígitos), armazene apenas token + mask, nunca PAN completo.',
			'Configure PCI-DSS SAQ A ou A-EP conforme integração com gateway — documente o escopo.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos submeter dados teste em headless e inspecionar tráfego de rede pra confirmar criptografia + tokenização.',
		verification_eta_seconds: 60,
	},

	email_deliverability_risk: {
		remediation_steps: [
			'Configure SPF, DKIM, e DMARC corretos no DNS do domínio de envio.',
			'Use subdomínio dedicado pra transacional (ex: mail.dominio.com) separado de marketing.',
			'Monitore bounce rate + spam complaint rate — target é <5% bounce e <0.1% complaint.',
			'Use provedor reputado (SendGrid, AWS SES, Postmark) em vez de SMTP próprio pra melhor deliverability.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos consultar DNS do domínio (SPF/DKIM/DMARC) + análise de reputação via MX Toolbox.',
		verification_eta_seconds: 30,
	},

	cors_misconfiguration_risk: {
		remediation_steps: [
			'Audite Access-Control-Allow-Origin em APIs — nunca usar `*` em endpoints com cookies/auth.',
			'Whitelist explícita de origens permitidas — use lista ao invés de wildcard em produção.',
			'Configure Access-Control-Allow-Credentials apenas quando necessário + origem específica.',
			'Nunca exponha endpoints sensíveis (mudança de senha, payment) via CORS pra origem externa.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos fazer requests OPTIONS/GET contra APIs críticas e analisar headers CORS retornados.',
		verification_eta_seconds: 10,
	},

	rate_limiting_absent_on_commerce: {
		remediation_steps: [
			'Implemente rate limit nas APIs críticas: login (5/min), signup (3/hora), checkout (10/min por IP).',
			'Use WAF (Cloudflare, AWS WAF) como primeira camada — rate limit + bot protection.',
			'Configure alertas para picos anômalos: 100 tentativas/min em login = ataque de credential stuffing.',
			'Retorne HTTP 429 com Retry-After header — clientes legítimos entendem, bots desistem.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos disparar bursts controlados contra endpoints de login/signup pra validar presença de rate limiting.',
		verification_eta_seconds: 30,
	},

	predictable_order_urls: {
		remediation_steps: [
			'Substitua IDs sequenciais em URLs de pedido (/order/123) por UUIDs ou tokens opacos (/order/a7f3...).',
			'Valide authorization em toda request — usuário só pode ver pedidos próprios, não por conhecer URL.',
			'Rote audit logs de acesso a pedidos — detecta enumeração / IDOR attacks.',
			'Configure tokens temporários pra links públicos (rastreio, confirmação) com expiração curta.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos analisar estrutura de URLs de pedido e testar se mudar ID retorna dados de outro usuário.',
		verification_eta_seconds: 15,
	},

	// ─────────────────────────────────────────────
	// Channel Integrity (Phase 3A)
	// ─────────────────────────────────────────────

	payment_surface_compromised: {
		remediation_steps: [
			'Investigue imediatamente: revise commits recentes, scripts carregados, e logs de acesso no checkout.',
			'Rote todas as credenciais de gateway + API keys expostas — comprometimento de payment surface vaza dados de buyers.',
			'Desative temporariamente o checkout até forensics completo — fraude em andamento compounds rápido.',
			'Notifique o gateway + autoridades (se LGPD breach) + buyers afetados — requerido por lei.',
		],
		estimated_effort_hours: 40,
		verification_strategy: 'external_scan',
		verification_notes:
			'Incidente crítico — dispara Nuclei + Katana full scan + análise de scripts + diff com baseline conhecido limpo.',
		verification_eta_seconds: 300,
	},

	channel_traffic_divertible: {
		remediation_steps: [
			'Audite links externos na home e páginas de produto — cada link externo é oportunidade de diversão de tráfego.',
			'Se você tem afiliados, use link shorteners oficiais (não redirects genéricos que podem ser sequestrados).',
			'Configure CSP restritivo pra prevenir injeção de links externos via scripts comprometidos.',
			'Monitore outbound traffic analytics — picos anormais podem indicar redirect malicioso injetado.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o site em headless coletando todos outbound links e comparar com allowlist esperado.',
		verification_eta_seconds: 60,
	},

	commerce_operations_exposed: {
		remediation_steps: [
			'Identifique endpoints de operação comercial expostos publicamente: painéis, APIs internas, webhooks.',
			'Implemente autenticação + IP allowlist em todos endpoints administrativos.',
			'Remova referências a endpoints internos de HTML/JS públicos — operators não devem aparecer em robots.txt nem em source.',
			'Segmente rede: endpoints operacionais em VPC privada, não no mesmo cluster do site público.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos disparar Katana + Nuclei na infraestrutura pública pra detectar endpoints operacionais expostos.',
		verification_eta_seconds: 180,
	},

	traffic_landing_low_trust_posture: {
		remediation_steps: [
			'Landing pages de campanha devem herdar trust markers do site principal — políticas, contato, selos visíveis.',
			'Evite landing pages em subdomínios ou domínios separados sem trust markers — buyer não sabe que é você.',
			'Se necessário usar domínio separado (ex: campanha Black Friday), replique visual identity + trust markers do principal.',
			'Audite landings ativas trimestralmente — algumas ficam órfãs sem manutenção e regridem em trust.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-crawlar landings conhecidas e medir presença de trust markers em cada.',
		verification_eta_seconds: 20,
	},

	channel_compromise_visible: {
		remediation_steps: [
			'Incidente ativo — escale pra time de security + resposta imediata.',
			'Identifique vetor: script injetado, DNS hijack, certificado comprometido, ou credencial vazada.',
			'Isole o vetor (remova script, rote credencial, revogue cert) e documente timeline do incidente.',
			'Comunique buyers afetados com transparência — silêncio durante incidente piora reputação mais que o incidente em si.',
		],
		estimated_effort_hours: 40,
		verification_strategy: 'external_scan',
		verification_notes:
			'Crítico — dispara scan completo (Nuclei + Katana + brand-intel) pra mapear extensão do comprometimento.',
		verification_eta_seconds: 300,
	},

	commercial_path_abuse_friendly: {
		remediation_steps: [
			'Audite endpoints de compra/promoção pra padrões abusáveis: IDs sequenciais, promos sem validação, price override aceito.',
			'Implemente validação server-side em todos pricing — nunca confie no preço vindo do cliente.',
			'Rate limit agressivo em endpoints críticos: checkout, apply_coupon, add_to_cart.',
			'Configure fraud detection: padrões suspeitos (mesmo card, mesmo IP, múltiplos emails) bloqueiam com review manual.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos disparar Katana deep discovery pra mapear endpoints abusáveis + revalidar após seus fixes.',
		verification_eta_seconds: 240,
	},

	economic_exploitation_active: {
		remediation_steps: [
			'Incidente financeiro ativo — investigue immediatamente quais compras/promos foram exploradas.',
			'Bloqueie o vetor específico (cupom abusado, preço manipulado, checkout bypass).',
			'Calcule perda acumulada e decida se rollback de transações fraudulentas é viável ou se chargeback é mais barato.',
			'Audite todas promoções ativas com a mesma lógica — exploit tipicamente funciona em múltiplas campanhas.',
		],
		estimated_effort_hours: 30,
		verification_strategy: 'external_scan',
		verification_notes:
			'Re-disparar Katana contra os endpoints comprometidos pra confirmar patch + monitorar padrões de abuso.',
		verification_eta_seconds: 240,
	},

	checkout_trust_brittle_infrastructure: {
		remediation_steps: [
			'Audite certificados SSL: expiração, autoridade, algoritmo. Renove antes de 30 dias da expiração.',
			'Configure auto-renovação (Let\'s Encrypt, AWS ACM) pra evitar cert expirado em produção.',
			'Monitore chain de confiança: certs intermediários + root trust.',
			'Configure HSTS preload pra mitigar downgrade attacks.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos validar cert + cadeia do checkout via scan SSL (openssl s_client / Qualys SSL Labs).',
		verification_eta_seconds: 15,
	},

	// ─────────────────────────────────────────────
	// Deep Discovery (Phase 3B — Katana)
	// ─────────────────────────────────────────────

	promotion_logic_exposed: {
		remediation_steps: [
			'Migre lógica de desconto pro backend — cliente nunca deve calcular promoções.',
			'Valide server-side: coupon code existe, não expirou, aplica a esses produtos, não excedeu limite.',
			'Logue cada aplicação de cupom com user_id + IP pra detectar padrões de abuso.',
			'Revise cupons ativos trimestralmente — remova os que não geram receita mas ainda podem ser abusados.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos dispatch Katana em endpoints de cart/coupon pra revalidar superfície abusável.',
		verification_eta_seconds: 180,
	},

	cart_variant_weak_control: {
		remediation_steps: [
			'Toda validação de estoque + preço deve ocorrer server-side no checkout — nunca confie no cart do cliente.',
			'Implemente token de segurança por sessão de cart — invalida se detectar manipulação.',
			'Revise endpoints PATCH/PUT de cart: devem autenticar user e validar ownership antes de mudar.',
			'Logue divergências entre cart client e server pra detectar tentativas de manipulação.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos probe endpoints de cart manipulation (alterar preço/qty via request direto) e confirmar rejeição.',
		verification_eta_seconds: 120,
	},

	hidden_discount_refund_route: {
		remediation_steps: [
			'Audite URLs /refund, /discount, /coupon, /comp — são acessíveis publicamente? Devem exigir autenticação.',
			'Rotas administrativas de reembolso/desconto devem estar atrás de staff auth + audit log.',
			'Remove query strings que aceitam override de preço (?discount=50, ?price=1) — vulnerabilidade comum.',
			'Monitore logs pra padrões de exploração — picos em /refund sem transação correspondente = abuso.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Dispatch Katana contra paths de discount/refund pra confirmar ocultação + autenticação.',
		verification_eta_seconds: 150,
	},

	guessable_business_endpoint: {
		remediation_steps: [
			'Substitua IDs sequenciais em endpoints críticos por UUIDs opacos: /api/order/abc-123-def em vez de /api/order/1.',
			'Implemente authorization por endpoint — user só acessa seus próprios recursos (IDOR protection).',
			'Audite APIs públicas: quais expõem enumeração de recursos? Adicione rate limit + auth.',
			'Rode scanner de IDOR regular — test if changing ID returns other user data.',
		],
		estimated_effort_hours: 18,
		verification_strategy: 'external_scan',
		verification_notes:
			'Katana dispatch com foco em endpoints numericamente enumeráveis + tentativa de IDOR.',
		verification_eta_seconds: 180,
	},

	alternate_pricing_safeguard_bypass: {
		remediation_steps: [
			'Identifique variantes de pricing (BRL, USD, promo region, B2B) e consolidar validação server-side única.',
			'Elimine rotas de pricing alternativas sem controle — buyer não deve escolher qual preço paga.',
			'Configure feature flag com lista de clientes autorizados pra pricing especial — não via URL exposta.',
			'Logue transações fora do pricing padrão — alert pra review manual.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Probe paths de pricing alternativo + comparar preço final com esperado pelo pricing público.',
		verification_eta_seconds: 150,
	},

	js_discovered_purchase_variant: {
		remediation_steps: [
			'Revise bundles JS públicos — removem paths/endpoints sensíveis que podem ser descobertos via crawl.',
			'Use source maps em dev, desabilite em produção.',
			'Obfusque (não security, mas raise bar) código crítico de pricing/checkout no build de produção.',
			'Audite trimestralmente: quais endpoints estão referenciados em JS público?',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Katana discovery em JS bundles pra mapear endpoints referenciados + comparar com surfaces autorizadas.',
		verification_eta_seconds: 150,
	},

	dynamic_route_weak_control: {
		remediation_steps: [
			'Audite rotas dinâmicas (regex routes, wildcard routes) — fácil introduzir ACL gap.',
			'Use framework de autorização centralizado (policies/guards) em vez de checks inline por route.',
			'Rode test automatizado de autorização: cada route protegida com lista de quem pode acessar.',
			'Revise após cada deploy que adiciona ou modifica rotas dinâmicas.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'external_scan',
		verification_notes:
			'Katana exploration de rotas dinâmicas com tentativas de auth bypass.',
		verification_eta_seconds: 180,
	},

	hidden_support_burden: {
		remediation_steps: [
			'Meça tempo médio de resolução de suporte separado por categoria — identifique qual tipo de ticket consome mais recursos.',
			'Resolva root cause dos tickets recorrentes — cada ticket evitado é redução de custo + buyer satisfaction.',
			'Automatize respostas para dúvidas frequentes via FAQ + chatbot — escale suporte sem aumentar headcount.',
			'Revise mensalmente: quais produtos/features geram mais suporte? Priorize UX aí.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Suporte é métrica operacional externa ao site — re-projetar após você documentar tickets + tempo de resolução.',
		verification_eta_seconds: 3,
	},

	alternate_variant_control_breakdown: {
		remediation_steps: [
			'Audite lógica de variantes (tamanho, cor, região) no checkout — garante que cada variante tem preço + estoque distintos validados.',
			'Implemente validação consistente server-side: qty, variant, price devem bater com catalog real.',
			'Teste edge cases: comprar variante sem estoque, variante inexistente, variante de produto arquivado.',
			'Logue divergências — tentativa de comprar variante inválida é signal de probe automatizado.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Katana + probe de variant manipulation (IDs inexistentes, mix de produto + variante órfã).',
		verification_eta_seconds: 180,
	},

	deep_commerce_exploitation_risk: {
		remediation_steps: [
			'Incidente composto — múltiplos vetores de exploração ativos simultaneamente. Escale pra security team.',
			'Rode full scan (Katana + Nuclei) pra mapear extensão do problema.',
			'Priorize patch pelos vetores de maior impacto financeiro (preço, cupom, checkout) primeiro.',
			'Configure monitoramento contínuo pós-remediação — exploração composta geralmente tem tentativas de re-entrada.',
		],
		estimated_effort_hours: 40,
		verification_strategy: 'external_scan',
		verification_notes:
			'Full scan Katana + Nuclei + revalidação de cada vetor identificado.',
		verification_eta_seconds: 300,
	},

	// ─────────────────────────────────────────────
	// Performance & Network (Phase 2D)
	// ─────────────────────────────────────────────

	checkout_api_latency_degraded: {
		remediation_steps: [
			'Meça latência dos endpoints críticos do checkout em produção — identifique P95 e P99.',
			'Otimize queries do backend do checkout: indexes, caching, n+1 query removal.',
			'Configure CDN pra assets estáticos do checkout (CSS, JS, imagens) — reduz TTFB.',
			'Implemente timeout graceful: se API demora >5s, mostre mensagem ao usuário em vez de travar.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar checkout em headless capturando timing de cada request + retornar P50/P95.',
		verification_eta_seconds: 50,
	},

	commercial_pages_slow: {
		remediation_steps: [
			'Rode Lighthouse em páginas de produto e categoria — target LCP <2.5s, TTFB <600ms.',
			'Otimize imagens: formato WebP/AVIF, lazy loading, responsive sizes.',
			'Remova scripts third-party não-essenciais ou mova pra async/defer.',
			'Configure cache agressivo de assets estáticos (1 ano via Cache-Control) + ETag pra HTML.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar Lighthouse em headless contra páginas comerciais e comparar com baseline anterior.',
		verification_eta_seconds: 60,
	},

	paid_landing_overloaded: {
		remediation_steps: [
			'Landing pages de campanha devem ser minimalistas — remova widgets, chats, analytics não-essenciais.',
			'Mantenha apenas 1 CTA primário acima da dobra + seção de benefícios + prova social.',
			'Teste com PageSpeed Insights — landing de ads deve ter LCP <2s pra maximizar quality score.',
			'Hospede landings em infra otimizada (Vercel, Netlify) em vez do mesmo stack do app principal.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Lighthouse + análise de peso de recursos carregados nas landings de paid.',
		verification_eta_seconds: 50,
	},

	third_party_weight_delays_trust: {
		remediation_steps: [
			'Liste third-party scripts no checkout: analytics, chat, pixel, A/B testing. Peso total?',
			'Elimine não-essenciais (A/B testing no checkout é risco, chat pode carregar depois).',
			'Para essenciais (GA, Pixel), carregue async + depois do main content render.',
			'Configure timeout — se third-party não responde em 3s, desiste e não bloqueia render.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Capturar network trace do checkout + classificar requests por origem (próprio vs third-party).',
		verification_eta_seconds: 45,
	},

	checkout_brittle_third_party: {
		remediation_steps: [
			'Identifique dependências críticas do checkout em third-parties — gateway, anti-fraude, tax calc.',
			'Configure fallback: se anti-fraude não responde, permita compra com flag de review manual pós-facto.',
			'Para gateway, tenha backup configurado (Stripe + Mercado Pago) e switchover automático via feature flag.',
			'Monitore status pages dos providers + configure alerta no seu lado se detectar degradation.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Navegar checkout headless + simular falha de third-party pra ver se graceful degradation funciona.',
		verification_eta_seconds: 60,
	},

	purchase_blocked_failing_requests: {
		remediation_steps: [
			'Capture os 10 últimos erros de network no checkout — dê priority pelos que afetam pagamento.',
			'Configure retry automático em requests não-idempotentes com backoff exponential.',
			'Para requests críticos (payment_intent), garanta idempotency key pra evitar duplicação em retry.',
			'Logue taxa de sucesso por endpoint no checkout — alert se cair abaixo de 98%.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Navegar checkout múltiplas vezes em headless + coletar requests failed + estatística de sucesso.',
		verification_eta_seconds: 60,
	},

	measurement_breaks_revenue_path: {
		remediation_steps: [
			'Se tag analítica bloqueia ou atrasa o checkout, reconfigure pra load async/defer.',
			'Se GA/Pixel quebra a página quando bloqueado por adblocker, envolva em try/catch + fallback silencioso.',
			'Configure tags com performance budget — se ultrapassar X ms de exec, aborta.',
			'Use Tag Manager com triggers condicionais pra medir sem bloquear interação.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Carregar checkout headless com/sem adblocker + medir impacto no tempo de render.',
		verification_eta_seconds: 50,
	},

	purchase_before_deps_ready: {
		remediation_steps: [
			'Audite ordem de carregamento: botão de pagamento não deve estar clicável antes de scripts críticos (anti-fraude, tokenizer) carregarem.',
			'Desabilite botão de submit até scripts essenciais estarem prontos — mostre loading state.',
			'Configure eventos `DOMContentLoaded` + check de deps antes de ativar o fluxo de compra.',
			'Teste em conexão slow 3G — deps devem carregar dentro de 5s ou o fluxo falha graciosamente.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Carregar checkout em throttle 3G + testar clique em submit antes de completar load.',
		verification_eta_seconds: 55,
	},

	trust_assets_late_load: {
		remediation_steps: [
			'Trust markers (selos SSL, logos de pagamento, política) devem estar no HTML inicial — não carregados via JS.',
			'Evite carregar logos via CDN externo que pode ser lento ou bloquear — hospede internally.',
			'Priorize LCP — selos de trust acima da dobra devem aparecer em <2.5s.',
			'Use preload hints pra imagens críticas de trust: `<link rel="preload" as="image">`.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Capturar timing de load de trust markers no checkout + compare com LCP target.',
		verification_eta_seconds: 45,
	},

	mobile_heavy_runtime_chain: {
		remediation_steps: [
			'Mobile tem CPU/network mais limitado — agressivamente reduza JS executado no primeiro paint.',
			'Use code splitting: carregue apenas código necessário pra rota atual, lazy-load o resto.',
			'Remova polyfills desnecessários — modern browsers em mobile não precisam de suporte IE.',
			'Meça JS main thread blocking em mobile simulation — target <200ms de long tasks.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Lighthouse mobile + análise de JS bundle size + long tasks no main thread.',
		verification_eta_seconds: 60,
	},

	mobile_trust_payment_deps_failing: {
		remediation_steps: [
			'Teste payment deps (gateway scripts, tokenizer) especificamente em mobile — deps web às vezes falham em WebView.',
			'Configure fallback de payment method quando script primário falha (ex: fallback de Stripe Elements pra redirect flow).',
			'Monitore erros JS específicos de mobile — alertar quando divergem do desktop.',
			'Teste em iOS Safari + Chrome Android reais, não só emulator — cada tem quirks diferentes.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Headless mobile viewport + capturar falhas de payment scripts + taxa de sucesso por browser.',
		verification_eta_seconds: 60,
	},

	trust_surfaces_unstable_deps: {
		remediation_steps: [
			'Mapeie quais trust surfaces dependem de third-parties (selos dinâmicos, reviews widgets).',
			'Para cada dep third-party, mensure uptime + configure fallback estático se falhar.',
			'Prefira trust markers servidos do seu próprio domínio — selos self-hosted não dependem de provider externo.',
			'Configure monitoring específico pra trust surfaces — queda de provider = queda de conversão imediata.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Carregar home + produto + checkout + medir % de trust markers que renderizam sem falha.',
		verification_eta_seconds: 50,
	},

	// ─────────────────────────────────────────────
	// Discoverability (Phase 3E)
	// ─────────────────────────────────────────────

	commercial_pages_weak_search_representation: {
		remediation_steps: [
			'Reescreva title tags das páginas comerciais: 50-60 chars, incluindo marca + produto + benefício.',
			'Meta description: 140-160 chars descrevendo produto + call-to-action. Evite duplicatas entre páginas.',
			'Garanta que title e H1 da página estão alinhados mas não idênticos — title otimizado pra search, H1 pra humano.',
			'Audite trimestralmente quais títulos rankam e quais não aparecem no top 10 — ajuste copy do que underperforma.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-parsear HTML + extrair title/meta/H1 das páginas comerciais e comparar com best-practice.',
		verification_eta_seconds: 10,
	},

	social_previews_fail_commercial_value: {
		remediation_steps: [
			'Configure Open Graph tags: og:title, og:description, og:image (1200x630), og:url em todas páginas comerciais.',
			'Twitter Card: summary_large_image com imagem otimizada pra compartilhamento.',
			'Teste previews em debuggers oficiais: developers.facebook.com/tools/debug + cards-dev.twitter.com.',
			'Customize preview image por categoria de produto — genérico de logo é desperdício de share.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-parsear HTML + extrair og/twitter meta tags + validar URLs de imagem retornam 200.',
		verification_eta_seconds: 10,
	},

	brand_inconsistent_across_surfaces: {
		remediation_steps: [
			'Defina brand guide curto: logo, paleta, tipografia, tom de voz. Publique internamente.',
			'Audite surfaces existentes (home, app, email, landing, redes sociais) — elemina divergências de logo/cor/copy.',
			'Centralize assets de marca em CDN próprio — evita versões antigas circulando.',
			'Configure checklist pré-deploy pra revisar mudanças visuais contra brand guide.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-crawlar surfaces principais + extrair logo + paleta + comparar com baseline brand assets.',
		verification_eta_seconds: 20,
	},

	commercial_pages_unlikely_indexed: {
		remediation_steps: [
			'Verifique robots.txt + meta robots das páginas comerciais — não devem ter noindex acidental.',
			'Configure canonical tags corretos — aponte pra versão preferida da página (sem query params ruido).',
			'Envie sitemap.xml atualizado pro Google Search Console + Bing Webmaster Tools.',
			'Gere links internos pra páginas comerciais da home/blog — pages sem backlinks internos raramente rankam.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-parsear HTML + robots.txt + sitemap.xml + validar presença/ausência de noindex.',
		verification_eta_seconds: 12,
	},

	weak_semantic_intent_signals: {
		remediation_steps: [
			'Adicione JSON-LD Schema em páginas comerciais: Product (preço, estoque), Offer, Organization, BreadcrumbList.',
			'Use schema.org vocab correto — Product em páginas de produto, Article em blog, Review em depoimentos.',
			'Valide com Rich Results Test do Google — schema inválido não ajuda SEO.',
			'Monitore rich results no Search Console — tickets pra schema errors aparecem lá.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-parsear HTML + extrair JSON-LD + validar schema vs expectativa (Product em produto, etc.).',
		verification_eta_seconds: 10,
	},

	previews_disconnected_from_conversion: {
		remediation_steps: [
			'Social preview images devem enfatizar produto + benefício, não só logo.',
			'Title do preview deve comunicar valor comercial — "50% OFF" ou "Frete grátis" funciona melhor que título genérico.',
			'Teste A/B images diferentes pra mesma URL — mede qual gera mais CTR de compartilhamento.',
			'Cada campanha de ads/social deve ter preview otimizado pro contexto — não usa o default da página.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-crawlar + analisar relevância de og:title + og:image vs copy comercial da página.',
		verification_eta_seconds: 10,
	},

	commercial_pages_not_exposed_for_discovery: {
		remediation_steps: [
			'Adicione páginas comerciais ao sitemap.xml — priorize produto e categoria com priority > 0.8.',
			'Gere internal linking: home → categorias → produtos (3 cliques máx).',
			'Se você tem filtros (cor, tamanho), use canonical pra variantes e evita duplicação.',
			'Solicite reindexing no Search Console após mudanças significativas de estrutura.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Crawlar internal links a partir da home + validar sitemap.xml + comparar cobertura vs pages críticas.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Brand Integrity (Phase 3E)
	// ─────────────────────────────────────────────

	lookalike_domain_competing_for_traffic: {
		remediation_steps: [
			'Registre domínios defensivos comuns: typos (.com.br, .net, .shop), variantes (com hífen, sem hífen).',
			'Configure redirect 301 dos domínios defensivos pra domínio principal — recupera tráfego de erro de digitação.',
			'Para lookalikes ativamente competindo: registre trademark e envie takedown notice via registrar.',
			'Monitore SERPs regularmente — detecta lookalikes novos e age antes que ganhem tração.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Re-disparar brand intelligence scan pra listar domínios similares ainda ativos.',
		verification_eta_seconds: 240,
	},

	external_sites_mimicking_brand: {
		remediation_steps: [
			'Identifique sites que copiam visual/copy — capture screenshots como evidência.',
			'Envie DMCA takedown (EUA) ou notificação LGPD/CDC (BR) ao host do site clonado.',
			'Se clone vende produto falsificado, acione Polícia Federal / Procon + plataforma onde vende (ML, Shopee).',
			'Configure Google Alerts pra menções não-autorizadas da marca.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'external_scan',
		verification_notes:
			'Brand intelligence scan revalidando sites clones conhecidos + busca ativa de novos.',
		verification_eta_seconds: 240,
	},

	brand_traffic_exposed_to_deceptive_surfaces: {
		remediation_steps: [
			'Audite ads pagos usando sua marca — competidores podem estar fazendo branded search em cima do seu nome.',
			'Registre trademark pra protegê-lo em Google Ads + Facebook Ads.',
			'Configure bid defensivo em branded keywords — não deixe competidor roubar tráfego barato.',
			'Monitore search suggestions no Google — "marca X reclamação" ou "marca X golpe" indica problema reputacional.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'external_scan',
		verification_notes:
			'Brand intel scan em SERPs + análise de bids em branded keywords + search suggestions.',
		verification_eta_seconds: 180,
	},

	suspicious_domains_capturing_purchase_intent: {
		remediation_steps: [
			'Identifique domínios suspeitos que aparecem em search results quando user busca sua marca + "comprar".',
			'Envie takedown aos registrars + hosts de cada domínio suspeito identificado.',
			'Se domínio rank organicamente acima do seu, invista em SEO pra recuperar posição.',
			'Configure Google Ads bidding em branded + "buy" queries pra dominar SERP legitimamente.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'external_scan',
		verification_notes:
			'Brand intel re-scan de branded purchase queries + ranking check vs domínio oficial.',
		verification_eta_seconds: 240,
	},

	customers_exposed_to_phishing_surfaces: {
		remediation_steps: [
			'Alerte buyers via email / redes sociais sobre sites phishing identificados.',
			'Configure DMARC strict (p=reject) no domínio pra prevenir spoofing de emails.',
			'Reporte phishing pages a Google Safe Browsing + Microsoft Defender SmartScreen — removem do browsing.',
			'Crie página /seguranca ou /phishing no site oficial documentando golpes conhecidos e como identificar.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Brand intel scan + phishing URL reporter (Google/Microsoft APIs) pra confirmar remoção.',
		verification_eta_seconds: 180,
	},

	brand_presence_diluted_across_variants: {
		remediation_steps: [
			'Consolide domínios e subdomínios: elimina variantes desnecessárias ou configure canonical + redirect.',
			'Unifique o branding em todas as surfaces ativas — inconsistência confunde buyer.',
			'Defina domínio master único para ads, emails, social — evita dispersão de tráfego.',
			'Audite trimestralmente quais variantes de domínio estão ativas e por quê.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Brand intel mapeando variantes de domínio/subdomínio e reconciliando com master.',
		verification_eta_seconds: 120,
	},

	// ─────────────────────────────────────────────
	// Shopify Commerce (Phase 4A — integration-driven)
	// ─────────────────────────────────────────────

	checkout_abandonment_revenue_leak: {
		remediation_steps: [
			'Configure recovery email sequence pra carrinho abandonado: 1h, 24h, 72h após abandono.',
			'Simplifique checkout: reduza campos, ofereça guest checkout, mostre progresso.',
			'Adicione urgency/scarcity quando apropriado (estoque limitado real, não fake).',
			'Oferecer desconto pequeno (5-10%) no último email de recovery recupera 5-15% dos abandonos.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify metrics pra confirmar mudança em abandonment rate + recovery rate.',
		verification_eta_seconds: 30,
	},

	promoted_product_out_of_stock: {
		remediation_steps: [
			'Configure sync real-time de estoque entre Shopify e canais de promoção (ads, email, afiliados).',
			'Pause automaticamente campanhas de ads quando produto fica out-of-stock.',
			'Adicione "Notify when available" nos produtos esgotados pra capturar demanda.',
			'Priorize replenishment dos produtos mais promovidos — estoque perdido durante campanha é receita perdida.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify + cross-reference com campanhas ativas.',
		verification_eta_seconds: 30,
	},

	high_refund_rate_eroding_revenue: {
		remediation_steps: [
			'Audite top 10 razões de refund no Shopify — identifique padrões por produto / SKU.',
			'Melhore fotos + descrições dos produtos mais reembolsados — misalinhamento de expectativa é causa comum.',
			'Se produto específico tem >15% refund rate, considere delistar ou renegociar com fornecedor.',
			'Configure pré-sale checklist: FAQs visíveis, sizing guide, política de reembolso clara.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify pra confirmar refund rate trend + breakdown por produto.',
		verification_eta_seconds: 30,
	},

	single_payment_gateway_risk: {
		remediation_steps: [
			'Integre gateway secundário (Stripe + Mercado Pago, por exemplo) pra ter redundância.',
			'Configure roteamento inteligente: PIX pra BR (mais barato), cartão pra internacional.',
			'Tenha plano de contingência documentado: se gateway primário cai, como switchar em <15min.',
			'Negocie contratos com SLA — gateway sem garantia de uptime é aposta.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify payment config + validar presença de gateways alternativos ativos.',
		verification_eta_seconds: 20,
	},

	discount_abuse_pattern: {
		remediation_steps: [
			'Audite cupons ativos — limite uso por customer (1x), por email, por IP.',
			'Configure fraud detection: mesmo CPF comprando 10x com cupom = abuso.',
			'Expire cupons regularmente — cupons permanentes são convite pra compartilhamento em sites tipo Cuponeria.',
			'Meça margem pós-desconto por campanha — alguns cupons podem estar negativos.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify discount analytics + cross-reference com padrões de uso suspeitos.',
		verification_eta_seconds: 30,
	},

	low_repeat_purchase_rate: {
		remediation_steps: [
			'Configure email de re-engagement 30/60/90 dias pós-compra com recomendações personalizadas.',
			'Implemente programa de loyalty/pontos — reduz atrito pra segunda compra.',
			'Analise LTV por cohort — qual canal de aquisição traz customers que recompram?',
			'Crie subscription option pra produtos consumíveis — recurring revenue é o maior leverage.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify pra confirmar repeat purchase rate trend + cohort analysis.',
		verification_eta_seconds: 40,
	},

	dead_weight_products: {
		remediation_steps: [
			'Liste produtos com zero venda em 30 dias — delista ou reposicione.',
			'Mova SKUs dead-weight pra categoria "clearance" com desconto real pra girar estoque.',
			'Analise se dead weight é por preço, posicionamento, ou demanda — ação varia.',
			'Mensalmente, faça purge de SKUs sem venda em 90 dias — polui busca e dilui inventário.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify + cross-check de venda por SKU nos últimos 30d.',
		verification_eta_seconds: 30,
	},

	// ─────────────────────────────────────────────
	// Behavioral (Phase 4B — pixel-dependent)
	// ─────────────────────────────────────────────
	// All entries use pixel_accumulation strategy — verification
	// reports current vs required session count rather than triggering
	// a point-in-time re-check. eta_seconds is null because there is
	// no dispatch — the re-check happens naturally as traffic accumulates.

	policy_view_then_abandonment: {
		remediation_steps: [
			'Revise a copy das políticas (refund, privacidade, termos) — leitura deve reforçar confiança, não criar dúvida.',
			'Adicione CTA sutil na política de refund: "Qualquer dúvida? Fale com nosso time" com link pra suporte.',
			'Se buyers visitam política e abandonam, inclua reassurance pós-política (modal ou banner) sugerindo que a política é favorável.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando acúmulo de sessões pós-ajuste pra re-avaliar. Sessões atuais na janela: {current}/{required}.',
		verification_eta_seconds: null,
	},

	high_intent_detour_before_abandonment: {
		remediation_steps: [
			'Detecte páginas visitadas por high-intent buyers antes do abandono — geralmente FAQ, comparação, reviews.',
			'Identifique objeção específica nessas pages e resolva direto no fluxo principal.',
			'Teste redirecionar parte do tráfego direto pro fluxo principal sem detour — vê se conversão sobe.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra re-medir padrão de detour. Atual: {current}/{required} sessões.',
		verification_eta_seconds: null,
	},

	support_discovered_too_late_to_convert: {
		remediation_steps: [
			'Mova canal de suporte pra posição proeminente no fluxo de compra — footer persistente ou chat visível.',
			'Proativamente ofereça chat quando buyer passa >60s no checkout sem progredir.',
			'Meça First Response Time — <5min úteis no chat reduz friction significativamente.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando tráfego pós-ajuste pra medir se support discovery subiu. Sessões: {current}/{required}.',
		verification_eta_seconds: null,
	},

	cta_visible_but_behaviorally_dead: {
		remediation_steps: [
			'CTA aparece no viewport mas ninguém clica — revise copy, contraste, e proximity com value prop.',
			'Teste variantes (A/B) de cor, tamanho, e copy do CTA — pequenas mudanças geram grandes swings.',
			'Garanta que CTA está acima da dobra em desktop E mobile — mobile tende a enterrar o CTA.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir CTR do CTA ajustado. {current}/{required} sessões.',
		verification_eta_seconds: null,
	},

	purchase_hesitation_with_backtrack: {
		remediation_steps: [
			'Buyers voltam pro carrinho múltiplas vezes — objeção tá nos dados mostrados ali (preço? frete? entrega?).',
			'Exponha TODOS custos (frete + impostos) antes do checkout — surpresa no total é causa top de abandono.',
			'Adicione "por que escolher" recap próximo ao botão de pagar pra reforçar decisão.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-mudança pra validar redução de backtracks. {current}/{required}.',
		verification_eta_seconds: null,
	},

	critical_step_retries_before_abandonment: {
		remediation_steps: [
			'Identifique qual step retry mais antes do abandono — geralmente é cartão rejeitado ou CEP sem entrega.',
			'Melhore mensagens de erro nesses steps — explique CAUSA + PRÓXIMO PASSO.',
			'Ofereça caminhos alternativos: cartão rejeitado → oferece PIX; CEP sem entrega → oferece retirada.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-fix pra medir retry rate por step. {current}/{required}.',
		verification_eta_seconds: null,
	},

	mobile_fails_first_commercial_action: {
		remediation_steps: [
			'Primeira ação comercial em mobile (add-to-cart, inicia checkout) falha mais que desktop — teste em iOS + Android reais.',
			'Valide tamanho de botões (≥44px), viewport, teclado não cobrindo input ativo.',
			'Elimine modais/overlays que em mobile ficam scroll-trapped ou sem close button visível.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões mobile novas pra validar fix. {current}/{required} sessões mobile.',
		verification_eta_seconds: null,
	},

	funnel_step_alive_but_not_advancing: {
		remediation_steps: [
			'Step tem atividade (clicks, form fills) mas não avança — há bloqueador técnico ou UX silencioso.',
			'Revise validações: mensagens de erro escondidas, submit button desabilitado sem feedback claro.',
			'Adicione analytics de form validation failures pra ver qual campo mais bloqueia.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir taxa de avanço por step. {current}/{required}.',
		verification_eta_seconds: null,
	},

	hesitation_before_conversion_missing_trust: {
		remediation_steps: [
			'Buyer hesita perto do botão de pagar — trust markers não estão onde precisa.',
			'Adicione selos (SSL, bandeiras, gateway) VISÍVEIS no viewport do pagamento.',
			'Inclua microcopy de reassurance próximo ao botão: "Pagamento seguro via [gateway]".',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-trust markers pra medir redução de hesitação. {current}/{required}.',
		verification_eta_seconds: null,
	},

	pricing_hesitation_unclear_value: {
		remediation_steps: [
			'Buyer revisita pricing multiple times — indicador de que value prop não tá clara.',
			'Re-escreva cada plano em termos de OUTCOME ("economize X horas/semana"), não features.',
			'Adicione comparativo visual pros-cons ou ROI calculator ajudando buyer decidir.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-pricing rewrite pra medir tempo de decisão. {current}/{required}.',
		verification_eta_seconds: null,
	},

	policy_detour_before_conversion: {
		remediation_steps: [
			'Buyer visita política antes de converter — preocupação tá na mente. Endereça proativamente.',
			'Destaque a política de reembolso favorável DIRETO no checkout (não escondida no footer).',
			'Use linguagem positiva: "30 dias pra trocar de ideia" em vez de "política de reembolso".',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir se detour rate caiu. {current}/{required}.',
		verification_eta_seconds: null,
	},

	cta_viewed_not_engaged: {
		remediation_steps: [
			'CTA aparece mas engagement é baixo — copy não compele ação.',
			'Use verbos específicos: "Comprar agora" > "Saiba mais". Urgência real: "Restam 3 em estoque".',
			'Teste variantes diferentes — small copy changes geram 5-20% swings em CTR.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra re-medir CTA engagement rate. {current}/{required}.',
		verification_eta_seconds: null,
	},

	sensitive_input_abandonment: {
		remediation_steps: [
			'Buyer abandona ao ver campo sensível (CPF, cartão, endereço) — trust deficit naquele campo específico.',
			'Adicione microcopy explicando POR QUE precisa do dado: "CPF usado apenas pra nota fiscal".',
			'Mostre ícone de cadeado + selo SSL próximo ao campo sensível pra reforçar segurança.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir abandonment rate nesses campos. {current}/{required}.',
		verification_eta_seconds: null,
	},

	form_excessive_fields_before_conversion: {
		remediation_steps: [
			'Form tem >8 campos obrigatórios antes da conversão — cada campo extra reduz completion em ~5%.',
			'Elimine campos opcionais que podem ser pedidos depois (ex: NPS, pesquisa de perfil).',
			'Use auto-preenchimento agressivo: ViaCEP pra endereço, mask pra CPF/telefone.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir form completion rate. {current}/{required}.',
		verification_eta_seconds: null,
	},

	form_submission_retry_friction: {
		remediation_steps: [
			'Form retorna erro e buyer retenta múltiplas vezes — validação não tá clara ou UX trava.',
			'Valide em real-time (inline) em vez de só no submit — buyer sabe na hora o que tá errado.',
			'Quando submit falha, preserve TODOS os dados preenchidos — não force retyping.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir retry rate pós-fix. {current}/{required}.',
		verification_eta_seconds: null,
	},

	surface_oscillation_before_dropoff: {
		remediation_steps: [
			'Buyer oscila entre surfaces (home ↔ produto ↔ cart) antes de abandonar — decision paralysis.',
			'Reduza paths alternativos no fluxo comercial — one clear path from product to purchase.',
			'Adicione comparativo direto no produto pra reduzir necessidade de voltar pra categoria.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir oscillation pattern. {current}/{required}.',
		verification_eta_seconds: null,
	},

	conversion_final_step_retry: {
		remediation_steps: [
			'Último step (submit pagamento) retry frequente — cartão rejeita ou anti-fraude bloqueia.',
			'Melhore mensagem pós-rejeição: explique causa provável + sugira ação (novo cartão, PIX).',
			'Adicione fallback automático pra outros métodos quando primário falha.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir taxa de retry no último step. {current}/{required}.',
		verification_eta_seconds: null,
	},

	cta_late_availability_delays_action: {
		remediation_steps: [
			'CTA aparece depois de render completo — scripts atrasam interatividade.',
			'Pré-renderize CTAs críticos no HTML inicial, sem depender de JS.',
			'Meça Time To Interactive especificamente pra botão de conversão — deve ser <2s.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-fix pra medir timing do primeiro clique no CTA. {current}/{required}.',
		verification_eta_seconds: null,
	},

	checkout_abandon_no_feedback: {
		remediation_steps: [
			'Buyer abandona checkout sem deixar sinal (não preencheu nada, saiu silencioso).',
			'Adicione exit-intent modal perguntando "o que faltou?" com campo livre — captura objections.',
			'Configure recovery email pra quem iniciou checkout mas não finalizou, com link direto pro carrinho.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir taxa de feedback capturado. {current}/{required}.',
		verification_eta_seconds: null,
	},

	sensitive_input_perceived_risk_dropoff: {
		remediation_steps: [
			'Campos sensíveis causam drop direto — perceção de risco é mais forte que benefício percebido.',
			'Adicione trust signals CONTÍGUOS ao campo: selo SSL, explicação de uso, política de privacidade link.',
			'Teste reordenar: peça dados sensíveis DEPOIS de criar conta ou adicionar ao carrinho — drops menos.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir drop rate pós-ajustes. {current}/{required}.',
		verification_eta_seconds: null,
	},

	first_session_milestone_stall: {
		remediation_steps: [
			'Primeira sessão empaca antes de atingir marco de valor — reduza fricção nos primeiros 60s.',
			'Defina o "aha moment" do primeiro uso e otimize o caminho direto pra ele.',
			'Ofereça tour guiado opcional que demonstra valor em <2min.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir milestone completion rate. {current}/{required}.',
		verification_eta_seconds: null,
	},

	first_session_trust_barrier: {
		remediation_steps: [
			'Novos visitantes encontram trust barrier — exponha social proof + credenciais mais proeminentemente.',
			'Logos de clientes, depoimentos com foto, awards visíveis na home above-the-fold.',
			'Para produto novo, inclua "como funciona" explicativo + garantia explícita pra reduzir risk percebido.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra re-medir bounce rate de novos visitantes. {current}/{required}.',
		verification_eta_seconds: null,
	},

	first_session_cta_timing_gap: {
		remediation_steps: [
			'CTA aparece tarde demais na primeira sessão — visitante sai antes de ver a oferta.',
			'Mostre CTA primário visível no primeiro paint, sem depender de scroll.',
			'Configure exit-intent modal pra capturar visitante saindo sem ter tomado ação.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir CTA exposure timing. {current}/{required}.',
		verification_eta_seconds: null,
	},

	low_value_action_dominates: {
		remediation_steps: [
			'Ações de baixo valor (scroll, leitura de blog) dominam vs ações de alto valor (add-to-cart, signup).',
			'Revise CTAs em páginas de tráfego — muitos levam pra conteúdo ao invés de conversão.',
			'Adicione CTA de conversão em páginas de conteúdo populares (blog, ajuda).',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir ratio de high-value vs low-value actions. {current}/{required}.',
		verification_eta_seconds: null,
	},

	high_value_action_underexposed: {
		remediation_steps: [
			'Ações de alto valor (compra, upgrade) não recebem exposure suficiente — posicione em surfaces de alto tráfego.',
			'Home deve ter CTA principal apontando pra ação de maior valor comercial.',
			'Evite esconder features premium atrás de múltiplos cliques — expõe direto com paywall contextual.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir exposure rate das high-value actions. {current}/{required}.',
		verification_eta_seconds: null,
	},

	dead_weight_surface_traffic: {
		remediation_steps: [
			'Páginas com tráfego mas zero conversão drenam budget de ads e dividem análise.',
			'Audite top 10 páginas de tráfego por conversion rate — priorize fix nas de 0% CR.',
			'Se página não converte estruturalmente (ex: post de blog genérico), reduz paid spend direcionado a ela.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir conversion rate por surface. {current}/{required}.',
		verification_eta_seconds: null,
	},

	paid_traffic_friction_elevated: {
		remediation_steps: [
			'Tráfego pago encontra mais friction que orgânico — landing pages de ads precisam ser dedicadas.',
			'Crie landing pages específicas por campanha, sem navegação que distrai do CTA.',
			'Valide message match: ad promete X, landing entrega X (não a home genérica).',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões de paid traffic pra re-medir friction. {current}/{required}.',
		verification_eta_seconds: null,
	},

	paid_traffic_trust_gap: {
		remediation_steps: [
			'Tráfego pago tem trust menor que orgânico — reforce credenciais nas landings de ads.',
			'Social proof (reviews, número de clientes, mídia) visível no primeiro viewport.',
			'Garantia forte e explícita ("30 dias pra devolver sem perguntas") reduz risk percebido.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões paid pra medir trust-related bounce rate. {current}/{required}.',
		verification_eta_seconds: null,
	},

	paid_mobile_compounding_waste: {
		remediation_steps: [
			'Paid + mobile = waste composto. Fricção mobile + cold traffic compram 2x menos.',
			'Separe campaign mobile vs desktop e otimize landings separadamente pra cada canal.',
			'Mobile landing deve ter ≤3 elementos above-the-fold: headline + benefício + CTA.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões paid-mobile pra re-medir conversion rate. {current}/{required}.',
		verification_eta_seconds: null,
	},

	mobile_conversion_gap: {
		remediation_steps: [
			'Conversion rate em mobile significativamente abaixo de desktop — UX mobile precisa de attention dedicada.',
			'Audite form completion em mobile: campos muito pequenos, teclado cobrindo input, submit inacessível.',
			'Simplifique fluxo em mobile: uma única coluna, steps numerados, salve progresso.',
		],
		estimated_effort_hours: 18,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões mobile pra re-medir conversion gap. {current}/{required}.',
		verification_eta_seconds: null,
	},

	mobile_form_friction_elevated: {
		remediation_steps: [
			'Forms em mobile têm abandonment rate mais alto — campos + teclado causam friction.',
			'Use input types corretos (tel, email, number) pra ativar teclados otimizados.',
			'Auto-avance entre campos quando possível (ex: CEP preenche cidade/UF automaticamente).',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões mobile com form interaction. {current}/{required}.',
		verification_eta_seconds: null,
	},

	mobile_cta_timing_degraded: {
		remediation_steps: [
			'CTA em mobile demora a ficar interativo — scripts pesados bloqueiam main thread.',
			'Priorize TTI (Time To Interactive) em mobile — target <3s em 4G simulado.',
			'Reduza JS bundle inicial, lazy-load o resto.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões mobile pós-otimização pra medir timing real. {current}/{required}.',
		verification_eta_seconds: null,
	},

	funnel_step_friction_cost: {
		remediation_steps: [
			'Cada step do funnel tem custo de conversão — conte os steps atuais e elimine redundantes.',
			'Consolide "step 1: adicionar endereço" + "step 2: confirmar endereço" em um único step.',
			'Teste one-page checkout vs multi-step — pra carrinhos simples, one-page converte melhor.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-consolidação pra medir step completion. {current}/{required}.',
		verification_eta_seconds: null,
	},

	oscillation_decision_cost: {
		remediation_steps: [
			'Buyer oscila entre opções (planos, variantes, métodos de pagamento) = decision fatigue.',
			'Destaque default recomendado pra reduzir carga cognitiva — "escolha mais popular" funciona bem.',
			'Limite opções — 3 planos é sweet spot pra SaaS, 2-3 variantes por produto pra e-commerce.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir oscillation pattern. {current}/{required}.',
		verification_eta_seconds: null,
	},

	checkout_entry_friction: {
		remediation_steps: [
			'Entrada no checkout já tem friction — botão escondido, modal interrompendo, login forçado.',
			'Garanta CTA de "Finalizar compra" visível no carrinho e em todas as páginas de produto.',
			'Guest checkout como default — opção de criar conta pós-compra.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir entry rate no checkout. {current}/{required}.',
		verification_eta_seconds: null,
	},

	trust_deficit_conversion_drag: {
		remediation_steps: [
			'Trust deficit generalizado está puxando conversion geral pra baixo — não é fix pontual, é reforço sistêmico.',
			'Adicione trust markers em TODAS surfaces comerciais: home, produto, carrinho, checkout, confirmação.',
			'Social proof concreto (números, nomes, logos) reduz trust deficit mais que badges genéricos.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-trust-reinforcement pra medir conversion uplift. {current}/{required}.',
		verification_eta_seconds: null,
	},

	reassurance_seeking_elevated: {
		remediation_steps: [
			'Buyers procuram reassurance (FAQ, reviews, contato) antes de decidir — atenda essa necessidade proativamente.',
			'Coloque FAQ relevante direto nas páginas de produto — não force buyer a navegar pra achar.',
			'Adicione badges de "quantidade vendida" ou "avaliação média" pra social proof explícito.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir reassurance visits pré-conversão. {current}/{required}.',
		verification_eta_seconds: null,
	},

	sensitive_input_trust_gap: {
		remediation_steps: [
			'Trust gap específico em campos sensíveis — perceção de risco supera trust genérico do site.',
			'Adicione microcopy explicando coleta + link pra política de privacidade próximo ao campo.',
			'Use ícones de cadeado + selo SSL CONTÍGUOS ao campo — trust precisa ser percebido onde o risk é sentido.',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir completion rate em sensitive fields. {current}/{required}.',
		verification_eta_seconds: null,
	},

	path_length_exceeds_efficient: {
		remediation_steps: [
			'Path médio do buyer até conversão é longo demais — cada página extra dilui intent.',
			'Identifique atalhos: produto destacado na home, CTA direto sem categoria intermediária, quick-add na categoria.',
			'Minimize pageviews necessários pra compra — ideal <5 pageviews do ponto de entrada ao pagamento.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir path length médio pós-otimização. {current}/{required}.',
		verification_eta_seconds: null,
	},

	intent_absorber_detected: {
		remediation_steps: [
			'Alguma surface está absorvendo intent sem converter — blog post, FAQ genérico, categoria rica.',
			'Identifique as intent absorbers via analytics e adicione CTAs de conversão relevantes naquelas pages.',
			'Ou: reduza exposure dessas pages em navegação principal se não são conversível.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pós-adição de CTAs nas absorbers. {current}/{required}.',
		verification_eta_seconds: null,
	},

	intent_decay_time_excessive: {
		remediation_steps: [
			'Intent decay muito rápido — buyer esfria se sessão passa de X minutos sem conversão.',
			'Use urgency/scarcity real (estoque baixo, promo com timer) pra acelerar decisão.',
			'Se buyer retorna em nova sessão, re-engage com email lembrando onde parou + incentivo pequeno.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir intent decay curve. {current}/{required}.',
		verification_eta_seconds: null,
	},
};

/**
 * Default floor for the session-accumulation threshold the behavioral
 * signal extractor uses (see packages/signals/engine.ts MIN_SESSIONS).
 * Surfaced in the fallback copy when the projection layer can't supply
 * live counts — so users get "~20 sessões na janela" instead of the
 * raw placeholder literal.
 */
const DEFAULT_SESSION_FLOOR = 20;

/**
 * Resolve `{current}/{required}` placeholders in a verification_notes
 * string. Called by the projection layer and MCP answer composer so
 * consumers never see raw template syntax.
 *
 *   - When both `current` and `required` are provided, interpolate
 *     real counts (e.g. "7/20 sessões").
 *   - When neither is provided (the common case today — the signal
 *     layer doesn't yet expose per-finding session counts), strip
 *     the placeholder entirely and substitute a truthful generic
 *     phrase that makes the copy readable without lying about
 *     having live data.
 *
 * Future: once the signal extractor populates verification_session_*
 * on FindingProjection, callers pass them in and the user sees the
 * actual progress in the drawer / MCP response.
 */
export function resolveVerificationNotes(
	notes: string | null,
	opts?: { current?: number | null; required?: number | null },
): string | null {
	if (!notes) return null;
	if (!notes.includes("{current}") && !notes.includes("{required}")) {
		return notes;
	}
	const current = opts?.current;
	const required = opts?.required;
	if (current != null && required != null) {
		return notes
			.replace(/\{current\}/g, String(current))
			.replace(/\{required\}/g, String(required));
	}
	// Fallback: collapse any "Sessões atuais na janela: {current}/{required}"
	// style phrase to a clean generic, and strip the bare "{current}/{required}"
	// token to the session floor.
	return notes
		.replace(
			/\.?\s*Sessões atuais na janela:\s*\{current\}\/\{required\}\.?/g,
			".",
		)
		.replace(
			/\.?\s*Atual:\s*\{current\}\/\{required\}\s*sessões?\.?/g,
			".",
		)
		.replace(
			/\s*\{current\}\/\{required\}\s*sessões\s*mobile/g,
			` ~${DEFAULT_SESSION_FLOOR} sessões mobile`,
		)
		.replace(
			/\s*\{current\}\/\{required\}\s*sessões/g,
			` ~${DEFAULT_SESSION_FLOOR} sessões`,
		)
		.replace(
			/\s*\{current\}\/\{required\}\.?/g,
			` ~${DEFAULT_SESSION_FLOOR} sessões na janela comportamental.`,
		)
		.replace(/\s{2,}/g, " ")
		.replace(/\s+\./g, ".")
		.trim();
}

/**
 * Look up remediation + verification metadata for a finding.
 * Returns null when the inference_key hasn't been authored yet —
 * callers are expected to degrade gracefully (leave the projection
 * fields null and let the MCP fall back to its generic response).
 *
 * verification_notes are passed through `resolveVerificationNotes`
 * so `{current}/{required}` placeholders never leak into downstream
 * consumers (MCP answers, projection JSON, UI).
 */
export function lookupRemediation(
	inferenceKey: string,
): CatalogEntry | null {
	const entry = REMEDIATION_CATALOG[inferenceKey];
	if (!entry) return null;
	return {
		...entry,
		verification_notes: resolveVerificationNotes(entry.verification_notes) ?? entry.verification_notes,
	};
}

/**
 * Resolve an action_key back to its canonical inference_key by
 * stripping the Action deriver's suffix pattern. deriver.ts creates
 * action_keys as `${decision_key}_primary`, `_secondary_N`, or
 * `_verify_N`. The base (before the suffix) is the decision_key,
 * which for most packs IS the inference_key it was built from.
 *
 * Returns null if the pattern doesn't match (e.g. hand-crafted
 * action keys that don't follow the deriver convention).
 */
export function actionKeyToInferenceKey(actionKey: string): string | null {
	const match = actionKey.match(/^(.+?)_(primary|secondary_\d+|verify_\d+)$/);
	return match ? match[1] : null;
}

/**
 * Look up remediation + verification metadata for a GlobalAction /
 * Action / ActionProjection by its action_key. Falls back to null
 * when the key can't be traced to an inference_key or the catalog
 * hasn't got that entry yet.
 */
export function lookupRemediationForAction(
	actionKey: string,
): CatalogEntry | null {
	const inferenceKey = actionKeyToInferenceKey(actionKey);
	if (!inferenceKey) return null;
	return lookupRemediation(inferenceKey);
}
