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
};

/**
 * Look up remediation + verification metadata for a finding.
 * Returns null when the inference_key hasn't been authored yet —
 * callers are expected to degrade gracefully (leave the projection
 * fields null and let the MCP fall back to its generic response).
 */
export function lookupRemediation(
	inferenceKey: string,
): CatalogEntry | null {
	return REMEDIATION_CATALOG[inferenceKey] ?? null;
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
