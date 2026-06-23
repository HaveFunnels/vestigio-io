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
//     placeholder — A próxima fase do Vestigio.2 resolves at render time.
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
 * Language hint so A próxima fase do Vestigio.2 localization can pick the right
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
			'Garanta HTTPS e certificado válido em ambos os domínios. Verifique em navegadores em modo anônimo.',
			'Adicione copy no botão do checkout explicando que o próximo passo é uma página segura do processador de pagamento.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos disparar o checkout em um navegador automatizado, seguir os redirects até a página de pagamento, e conferir se a URL fica no seu domínio ou se há logotipo + selo na página externa.',
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
			'Vamos reabrir o footer, o checkout, e as URLs /privacidade /termos /reembolso (e variantes) pra confirmar a presença das três políticas + densidade mínima de conteúdo.',
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
			'Vamos executar o checkout automaticamente, rastrear redirects, medir latência, e revalidar presença das políticas + selos de trust.',
		verification_eta_seconds: 60,
	},

	revenue_path_fragile: {
		remediation_steps: [
			'Identifique os 3 endpoints mais críticos do caminho de compra (produto → carrinho → checkout) e configure health checks de 1 minuto.',
			'Remova dependências de third-party scripts que bloqueiam o render do checkout. Mova pra async / defer.',
			'Implemente fallback para o checkout quando o gateway primário falhar (retry automático + mensagem ao usuário).',
			'Adicione logging de erros client-side no checkout pra ter visibilidade de quais requests falham em produção.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o caminho completo (home → produto → carrinho → checkout) automaticamente, medir tempos por request, identificar third-parties bloqueantes e retornar um relatório atualizado.',
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
			'Vamos abrir a loja em navegador automatizado, disparar eventos simulados, e conferir se GA4 / GTM / Pixel / CAPI recebem. Relatamos quais estão presentes e quais ainda faltam.',
		verification_eta_seconds: 40,
	},

	critical_path_broken: {
		remediation_steps: [
			'Investigue o status code retornado por /checkout, /cart e páginas de produto. Priorize as URLs com 4xx/5xx.',
			'Restore URLs quebradas imediatamente (via revert de deploy recente ou hotfix no roteamento).',
			'Configure alerta no Sentry / Datadog / UptimeRobot pra disparar quando status code não for 2xx em qualquer URL crítica.',
			'Revise o release pipeline pra bloquear deploy se smoke-test do checkout falhar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as URLs críticas (/checkout, /cart, páginas de produto representativas) e confirmar se o status code voltou a ser 2xx.',
		verification_eta_seconds: 10,
	},

	form_data_leaves_domain: {
		remediation_steps: [
			'Audite o atributo `action` de todos os forms. Liste quais apontam pra domínios externos.',
			'Whitelist forms legítimos (OAuth, processador de pagamento hosted) com documentação de por quê saem do domínio.',
			'Forms não-essenciais que saem do domínio: migre pra endpoints internos que proxyficam pro serviço externo.',
			'Adicione aria-label em todos os forms descrevendo o propósito (signup, checkout, support, search) pra facilitar a análise.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar o HTML das páginas relevantes, listar todos os forms com action cross-domain, e conferir se os não-whitelisted foram migrados.',
		verification_eta_seconds: 8,
	},

	untrusted_embeds_near_purchase: {
		remediation_steps: [
			'Audite embeds (iframes, scripts de terceiros) presentes nas páginas de produto, carrinho e checkout.',
			'Remova embeds não-essenciais do caminho de compra. Trust badges decorativos, widgets de chat genéricos.',
			'Para embeds essenciais (gateway de pagamento, chat oficial), valide que vêm de domínios reconhecidos com certificado válido.',
			'Configure Content-Security-Policy restritivo no checkout permitindo apenas os domínios necessários.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar o HTML do caminho de compra pra listar todos os iframes/scripts externos e classificar essenciais vs não-essenciais.',
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
			'Vamos reavaliar o finding após sua próxima análise. Sem dado novo, é um assessment estrutural do risco de dependência de plataforma.',
		verification_eta_seconds: 2,
	},

	revenue_path_regressed: {
		remediation_steps: [
			'Compare a análise atual com a anterior. Identifique quais findings pioraram (severidade ou confidence subiu).',
			'Isole o deploy ou mudança de produto que coincide com a janela da regressão.',
			'Se a regressão veio de deploy: considere rollback enquanto investiga. Se veio de mudança operacional: revise o processo que causou.',
			'Adicione teste de smoke no caminho de receita pra prevenir esse tipo específico de regressão no próximo deploy.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos reavaliar sobre a evidência atual pra confirmar se a regressão ainda está presente ou foi resolvida depois do seu fix.',
		verification_eta_seconds: 3,
	},

	trust_surface_too_thin: {
		remediation_steps: [
			'Adicione no mínimo 3 trust markers visíveis na home: selo SSL, selos de pagamento (bandeiras aceitas), depoimentos / avaliações.',
			'Na página de produto, inclua: avaliações de clientes, política de reembolso, informações de contato, prazo de entrega.',
			'No checkout, reforce: selo SSL explícito, política de reembolso linkada, canal de suporte visível, logos de gateway.',
			'Evite trust markers genéricos sem contexto (badges sem certificação real por trás). Podem enfraquecer mais do que ajudar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir home + produto + checkout pra contar trust markers presentes e comparar com o baseline das lojas auditadas.',
		verification_eta_seconds: 12,
	},

	tracking_stack_gaps: {
		remediation_steps: [
			'Liste todos os canais de tráfego ativos (orgânico, pago, social, email) e qual tag cada um precisa pra atribuição.',
			'Instale e valide: GA4, GTM, Meta Pixel (se Meta Ads), Google Ads tag (se Google Ads), TikTok Pixel (se TikTok).',
			'Implemente CAPI / server-side para Meta e Google. Mitigação crítica da perda de cookies no Safari/iOS.',
			'Documente qual evento (purchase, add_to_cart, initiate_checkout) cada tag deve capturar e teste em Tag Assistant.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos disparar um checkout simulado automaticamente e conferir quais tags disparam. Retorna lista de tags presentes vs esperadas.',
		verification_eta_seconds: 50,
	},

	mobile_commercial_path_blocked: {
		remediation_steps: [
			'Execute o checkout completo em um iPhone e um Android. Anote cada ponto onde o fluxo trava (viewport, teclado, botão).',
			'Corrija viewport meta tag (`width=device-width, initial-scale=1`) e garanta que o checkout não exige scroll horizontal.',
			'Teste botões: devem ter no mínimo 44x44px de área clicável e espaçamento ≥8px de outros elementos.',
			'Elimine overlays / modals que quebram em mobile (scroll trapped, close button fora da viewport).',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o checkout em um navegador automatizado com viewport mobile (375x667) e relatar cada ponto onde o fluxo quebra.',
		verification_eta_seconds: 55,
	},

	mobile_trust_weaker_than_desktop: {
		remediation_steps: [
			'Compare home + produto + checkout em desktop vs mobile. Trust markers que aparecem em desktop devem aparecer em mobile também.',
			'Mobile geralmente esconde trust markers em favor de espaço. Priorize selo SSL, política de reembolso, e contato como sempre visíveis.',
			'Use acordeões / drawers pra expor trust markers sob demanda em vez de escondê-los completamente.',
			'Teste em viewport de 375px de largura que as informações de segurança do checkout não ficam truncadas.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar automatizado em viewport mobile e desktop e comparar quantos trust markers cada layout expõe.',
		verification_eta_seconds: 60,
	},

	secondary_flows_bypass_trust_path: {
		remediation_steps: [
			'Identifique os fluxos secundários: compra via WhatsApp, formulário de orçamento, deep link de ads, app externo.',
			'Para cada fluxo secundário, valide que o buyer cruza os mesmos trust markers (política, selo SSL, contato) antes da compra.',
			'Se um fluxo secundário pula o checkout oficial, adicione página intermediária com os trust markers essenciais.',
			'Meça conversão de cada fluxo secundário separadamente no GA4. Compare com o caminho oficial pra isolar onde trust está erodindo.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'A próxima fase do Vestigio introduz probes nos fluxos secundários (WhatsApp, form). Hoje a verificação é reavaliar sobre evidência existente.',
		verification_eta_seconds: 3,
	},

	runtime_errors_interrupt_purchase: {
		remediation_steps: [
			'Configure error tracking (Sentry, Rollbar, Datadog RUM) no frontend do checkout e cart. Não em todas as páginas ainda, foco no caminho de receita.',
			'Reveja os últimos 50 erros de JS capturados. Priorize os que disparam em páginas de produto, cart, checkout.',
			'Adicione try/catch em calls externos do checkout (gateway, CAPI, anti-fraude) com fallback que não bloqueia o usuário.',
			'Configure source maps no build para que os stack traces em produção sejam legíveis.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o checkout automaticamente coletando erros JS de console. Retorna lista de erros encontrados vs baseline anterior.',
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
			'Vamos disparar um checkout simulado automaticamente, capturar network requests, e confirmar quais tags enviam dados válidos.',
		verification_eta_seconds: 50,
	},

	high_intent_surfaces_blind: {
		remediation_steps: [
			'Identifique as páginas de maior intent comercial (produto, pricing, comparação) e valide que todas têm GA4 + Pixel tagged.',
			'Configure scroll tracking e time-on-page especificamente nessas surfaces. Intent precisa ser medido além de pageview.',
			'Adicione eventos customizados de engagement: view_item, add_to_cart, scroll_75, time_on_page_60s.',
			'Crie dashboard de funil apenas pra essas surfaces pra visualizar drop-off por etapa de intent.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar automaticamente pelas páginas de alto intent e confirmar quais eventos disparam vs esperados.',
		verification_eta_seconds: 45,
	},

	// ─────────────────────────────────────────────
	// Revenue Integrity pack
	// ─────────────────────────────────────────────

	conversion_flow_fragmented: {
		remediation_steps: [
			'Mapeie o funil atual: home → produto → carrinho → checkout → confirmação. Identifique onde há mais de um caminho possível.',
			'Consolide CTAs duplicados na home e produto. Um CTA primário claro por página.',
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
			'Conte quantos campos de formulário existem entre "ver produto" e "pagar". Reduza pra ≤ 8 obrigatórios.',
			'Elimine logins forçados antes do checkout. Ofereça checkout como convidado com opção de criar conta depois.',
			'Remova modais, popups e overlays no caminho de compra. Apenas o necessário pra efetivar o pagamento.',
			'Se há múltiplos steps no checkout, garanta que volta e edita cada step sem perder dados já preenchidos.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar o caminho crítico automaticamente e contar fricções: campos, modais, redirects, logins forçados.',
		verification_eta_seconds: 50,
	},

	revenue_leakage: {
		remediation_steps: [
			'Revise a lista de findings de maior impacto. Priorize os que têm confidence ≥ 70% e severity ≥ high.',
			'Para cada finding prioritário, marque o owner responsável e a janela de implementação.',
			'Bloqueie deploys que impactem o caminho de receita até que os findings críticos sejam resolvidos.',
			'Crie um dashboard semanal com sum of monthly_range.mid dos findings abertos pra rastrear leakage acumulado.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Reavaliar sobre a evidência atual pra recalcular o leakage agregado. Sem novo data, apenas a soma atual.',
		verification_eta_seconds: 3,
	},

	trust_break_in_checkout: {
		remediation_steps: [
			'Abra o checkout e identifique cada momento onde o buyer poderia hesitar (mudança de domínio, selo faltando, política escondida).',
			'Adicione selo SSL explícito ("Conexão segura") próximo ao campo de cartão de crédito.',
			'Exiba política de reembolso em 1 clique a partir do checkout. Não esconda em footer genérico.',
			'Mostre logos das bandeiras de cartão aceitas + logo do gateway (Stripe, Mercado Pago, etc.) para reforçar credibilidade.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar até o checkout automaticamente e contar trust markers visíveis no viewport do pagamento.',
		verification_eta_seconds: 40,
	},

	measurement_blindspot: {
		remediation_steps: [
			'Identifique surfaces comerciais sem tag analítica. Páginas de produto órfãs, URLs legadas, landing pages de campanha.',
			'Adicione GA4 + Pixel nessas surfaces específicas. Pode ser via GTM ou tag direta.',
			'Configure eventos customizados pro contexto daquela surface (view_item em produto, generate_lead em landing).',
			'Valide em GA4 DebugView que eventos chegam com o contexto correto (product_id, value, etc.).',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar as surfaces identificadas automaticamente e confirmar presença de tags + disparos de eventos.',
		verification_eta_seconds: 35,
	},

	unclear_conversion_intent: {
		remediation_steps: [
			'Identifique o CTA primário de cada página comercial. Deve ser explícito e único no viewport.',
			'Reescreva textos de CTA vagos ("Saiba mais", "Clique aqui") pra verbos de ação claros ("Comprar agora", "Ver preços", "Agendar demo").',
			'Teste se o CTA comunica a próxima etapa: "Adicionar ao carrinho" vs "Prosseguir pra pagamento" têm intents diferentes.',
			'Use cor de destaque contrastante apenas no CTA primário. CTAs secundários em estilo outline / ghost.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar o HTML das páginas comerciais e conferir o texto e o estilo dos CTAs contra lista de padrões vagos.',
		verification_eta_seconds: 8,
	},

	redirect_chain_erodes_checkout_trust: {
		remediation_steps: [
			'Audite a cadeia de redirects do /checkout. Use curl -L -I ou DevTools Network pra listar cada hop.',
			'Elimine redirects desnecessários (http→https→www→subdomain). Idealmente um único redirect ou zero.',
			'Se o gateway requer saída de domínio, garanta que o redirect final é direto e não passa por intermediários.',
			'Configure HSTS no domínio raiz pra forçar HTTPS sem round-trip de redirect.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir /checkout seguindo redirects e contar hops. Relatório inclui cada URL intermediária.',
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
			'Vamos reanalisar o HTML das surfaces comerciais e extrair atributo lang + amostra de copy pra detectar mix de idiomas.',
		verification_eta_seconds: 8,
	},

	commercial_pages_disconnected: {
		remediation_steps: [
			'Audite a navegação: a partir da home, quantos cliques são necessários pra chegar numa página de produto?',
			'Garanta que categorias / produtos principais estão linkados da home em até 2 cliques.',
			'Revise o footer. Links pra produtos-chave e políticas devem aparecer em toda página comercial.',
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
			'Configure retry + fallback no envio do email. Não dependa de um único provider sem backup.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar a URL de confirmação automaticamente e verificar presença dos elementos essenciais (order ID, resumo, prazo).',
		verification_eta_seconds: 35,
	},

	refund_process_unclear: {
		remediation_steps: [
			'Reescreva a página de política de reembolso com estrutura: prazo → processo → canal de contato → exceções.',
			'Inclua exemplos concretos ("Se você recebeu produto errado, envie email X com foto"). Não deixe só regras abstratas.',
			'Adicione FAQ de refund no checkout ou próximo ao botão de pagar, com link pra política completa.',
			'Meça tempo médio até primeiro contato do cliente via canal de refund. Menos que 2h úteis é benchmark bom.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página de política de reembolso e analisar estrutura + densidade de conteúdo.',
		verification_eta_seconds: 5,
	},

	post_purchase_proof_too_weak: {
		remediation_steps: [
			'Configure email de confirmação profissional (template branded, não texto plano) disparado em <1min após compra.',
			'Inclua nota fiscal eletrônica / recibo PDF anexado ou linkado pra download.',
			'Adicione código de rastreio assim que disponível (webhook do transportador → email automático).',
			'Envie email de follow-up pós-entrega pedindo avaliação. Reforça o fechamento do ciclo de trust.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'not_verifiable_explain',
		verification_notes:
			'Post-purchase proof acontece via email/SMS externo ao site. Não dá pra verificar via crawl. A próxima fase do Vestigio explora integração com ESP pra validar templates de transacional.',
		verification_eta_seconds: null,
	},

	support_reassurance_too_late: {
		remediation_steps: [
			'Posicione canal de suporte visível antes do checkout. Footer com WhatsApp/chat em toda página comercial.',
			'Adicione microcopy próximo ao botão de pagamento: "Dúvidas? Fale com nosso time via WhatsApp".',
			'Se você tem chat widget, garanta que ele carrega rápido (sem bloquear o render do checkout) e responde em <5min úteis.',
			'Inclua FAQ de compra direto na página de produto e checkout. Responda as 5 dúvidas mais comuns antes que o buyer precise perguntar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar home + produto + checkout e detectar canais de suporte visíveis em cada surface.',
		verification_eta_seconds: 8,
	},

	reassurance_routes_disconnected: {
		remediation_steps: [
			'Teste cada rota de reassurance: clicar "Política de reembolso" do checkout abre em nova aba ou leva pra footer genérico?',
			'Garanta que cada trust marker (política, contato, depoimentos) abre CONTEXTUAL. Modal ou página dedicada com link de volta.',
			'Evite políticas em URLs soltas do footer. Ancore-as no contexto da compra (link direto do checkout pra política de reembolso).',
			'Meça a taxa de retorno pós-clique nesses links. Se >50% dos cliques não voltam, o link está desviando o buyer.',
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
			'Para cada fluxo, garanta que o evento de conversão é capturado (mesmo que manualmente. Registrar no CRM + evento customizado no GA4).',
			'Configure UTMs + custom source/medium pra separar conversões desses fluxos das do site principal.',
			'Crie dashboard no GA4 que consolide todas as fontes de conversão pra você enxergar o funil completo.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Fluxos alternativos acontecem fora do site. Verificação é reavaliar depois que você marca os eventos.',
		verification_eta_seconds: 3,
	},

	runtime_breaking_reassurance: {
		remediation_steps: [
			'Audite se componentes de reassurance (política, chat widget, trust badges) disparam erro JS que quebra a página.',
			'Garanta que chat widgets carregam de forma async/defer. Não bloqueiam o render do conteúdo principal.',
			'Se um trust badge falha ao carregar (imagem 404, script externo timeout), tenha fallback que não mostra espaço quebrado.',
			'Configure alerta de erro JS no checkout pra detectar regressões antes do buyer chegar.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos abrir o checkout automaticamente com console capture e conferir se componentes de trust renderizam sem erros.',
		verification_eta_seconds: 45,
	},

	checkout_provider_path_weak: {
		remediation_steps: [
			'Se você usa um único provedor de checkout, tenha contingência: gateway backup configurado + processo manual documentado.',
			'Revise o contrato com o provedor pra entender SLA e compensação em downtime.',
			'Configure monitoring externo (UptimeRobot) especificamente contra a URL do checkout. Não confie apenas no status page do provedor.',
			'Tenha checklist escrito pra quando o provedor ficar fora: comunicar time, ativar backup, atender buyers por WhatsApp temporariamente.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Risco estrutural de provider único. Verificação é reavaliar após você diversificar ou documentar contingência.',
		verification_eta_seconds: 3,
	},

	trust_and_measurement_both_absent: {
		remediation_steps: [
			'Resolva primeiro o trust. É barato e tem impacto imediato (políticas publicadas + selos visíveis em ≤1 dia).',
			'Em paralelo, configure GA4 + Pixel básicos na home + checkout pra ter pelo menos 1 camada de medição.',
			'Não deploy nenhuma campanha paga enquanto esses dois gaps estão abertos. Você paga ads sem medir e sem fechar vendas.',
			'Crie checkpoint semanal com o time revisando progresso em ambas frentes. Trust + measurement não devem divergir.',
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
			'Configure Google Consent Mode v2. Permite medição com dados agregados mesmo sem consent total.',
			'No Meta, ative Conversions API server-side como fallback quando o Pixel no browser é bloqueado.',
			'Valide em ambientes opt-in e opt-out: em ambos casos, alguma medição deve chegar (mesmo que limitada em opt-out).',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar automaticamente com consent rejeitado e consent aceito, conferindo quais tags disparam em cada cenário.',
		verification_eta_seconds: 60,
	},

	checkout_provider_fragmented: {
		remediation_steps: [
			'Liste quantos gateways / checkouts diferentes seus fluxos usam (site, mobile app, marketplace, WhatsApp).',
			'Consolide: idealmente 1-2 gateways cobrindo 95% do volume. Fragmentação aumenta custo + complexidade.',
			'Para fluxos remanescentes que precisam de gateway dedicado, documente o motivo (regulatório, geográfico) pra justificar.',
			'Padronize a experiência visual do checkout mesmo quando o backend varia. Consumidor não deveria perceber a fragmentação.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir os checkouts dos fluxos conhecidos e identificar quantos gateways distintos aparecem.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Chargeback Resilience pack
	// ─────────────────────────────────────────────

	refund_policy_gap: {
		remediation_steps: [
			'Publique política de reembolso com prazo (7 dias CDC), processo, e email de contato explícito.',
			'Vincule a política no footer do checkout e no email de confirmação pós-compra.',
			'Mencione a política na página do produto próxima ao botão de compra. Reduz dispute rate.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o footer + URLs /reembolso /reembolsos /politica-devolucao pra confirmar presença e densidade mínima.',
		verification_eta_seconds: 5,
	},

	support_unreachable: {
		remediation_steps: [
			'Exponha pelo menos 2 canais de suporte no footer de toda página: email + WhatsApp (ou telefone).',
			'Configure resposta automática em <5min úteis nos canais principais. Buyer não deve esperar mais que isso pra primeiro contato.',
			'Publique horário de atendimento ("seg-sex 9h-18h") pra setar expectativa clara.',
			'Meça tempo médio até primeira resposta e first-contact-resolution. Use como KPI de suporte.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar footer + páginas de contato pra detectar canais disponíveis (email, WhatsApp, telefone, chat).',
		verification_eta_seconds: 8,
	},

	expectation_misalignment: {
		remediation_steps: [
			'Revise prazos de entrega declarados no produto vs prazos reais. Desalinhamento gera chargeback.',
			'Se o prazo varia por região (frete), exiba calculadora de CEP na página do produto antes do checkout.',
			'Comunique delays proativamente por email quando descobertos. Não deixe buyer perceber sozinho e reclamar.',
			'Inclua "prazo de entrega estimado" na página de confirmação pós-compra com base real de logística.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto buscando claims de prazo/garantia vs comparar com dados reais de logística.',
		verification_eta_seconds: 10,
	},

	dispute_risk_elevated: {
		remediation_steps: [
			'Priorize fix em TODAS as frentes simultaneamente: refund_policy + support_unreachable + expectation_misalignment não podem ficar abertas juntas.',
			'Monitore chargeback rate semanalmente. Alert se exceder 0.9% do volume (limiar de atenção do gateway).',
			'Implemente pre-dispute: antes do cliente abrir chargeback, emita uma comunicação proativa "teve algum problema? Nós resolvemos".',
			'Se o gateway suspender processamento por chargeback alto, tenha plano B (outro gateway) já implementado.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Risco composto. A verificação é reavaliar sobre a evidência após você fechar as frentes individuais (refund, support, expectations).',
		verification_eta_seconds: 3,
	},

	refund_terms_too_thin: {
		remediation_steps: [
			'Expanda a política de reembolso pra incluir: prazo exato, processo passo-a-passo, exceções explícitas, canal de contato.',
			'Evite linguagem legalesa. Escreva como você explicaria pra um amigo o que fazer em caso de problema.',
			'Adicione exemplos concretos ("Se o produto chegou quebrado, envie email X com foto").',
			'Vincule a FAQ com as 5 dúvidas mais comuns sobre reembolso direto no checkout.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a política de reembolso e medir densidade de conteúdo + presença de elementos estruturais chave.',
		verification_eta_seconds: 5,
	},

	support_hidden_at_purchase: {
		remediation_steps: [
			'No checkout, adicione microcopy ou banner: "Dúvidas? Fale com nosso time: WhatsApp XXXX-XXXX".',
			'Chat widget (se houver) deve estar visível no canto sem bloquear os campos de pagamento.',
			'Botão de suporte deve abrir o canal PRIMÁRIO, não uma página de FAQ genérica.',
			'Configure handover automático pra humano quando o buyer está no checkout. Intent de compra > intent de auto-serviço.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar até o checkout automaticamente e detectar presença de canal de suporte visível acima da dobra.',
		verification_eta_seconds: 35,
	},

	// ─────────────────────────────────────────────
	// SaaS Growth Readiness pack
	// ─────────────────────────────────────────────

	activation_blocked: {
		remediation_steps: [
			'Mapeie o fluxo de ativação: signup → primeiro login → primeiro valor entregue. Cronometre cada etapa.',
			'Elimine bloqueadores técnicos: email verification obrigatório que pode ser deferido, setup wizard com steps opcionais demais.',
			'Garanta que o primeiro login entrega valor imediato. Dashboard com sample data, tour guiado, ou wizard curto.',
			'Meça taxa de ativação (% usuários que chegam ao "aha moment") e configure alerta se cair abaixo de baseline.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar signup + primeiro login simulados automaticamente e medir tempo até primeiro valor percebido.',
		verification_eta_seconds: 90,
	},

	activation_friction_high: {
		remediation_steps: [
			'Reduza campos obrigatórios no signup. Idealmente apenas email + senha ou OAuth.',
			'Dados adicionais (empresa, cargo, tamanho) peça progressivamente depois que o usuário já experimentou o produto.',
			'Permita signup via OAuth (Google, GitHub) pra reduzir barreira de entrada.',
			'Se setup wizard é necessário, mostre progresso e permita "pular por enquanto" em steps opcionais.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar signup automaticamente e contar campos obrigatórios + steps até primeiro acesso ao produto.',
		verification_eta_seconds: 45,
	},

	unclear_next_step: {
		remediation_steps: [
			'Audite a primeira tela pós-login: há um CTA primário claro indicando o próximo passo?',
			'Implemente onboarding checklist visível (ex: "Complete seu perfil", "Adicione seu primeiro item") com progresso.',
			'Empty states (listas vazias, dashboard sem dados) devem ter CTA específico para preencher aquele contexto.',
			'Evite dashboards densos na primeira sessão. Apresente o produto em camadas conforme o usuário demonstra intent.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos logar como novo usuário automaticamente e identificar se há CTA primário claro nos primeiros 3 segundos.',
		verification_eta_seconds: 40,
	},

	empty_state_without_guidance: {
		remediation_steps: [
			'Para cada lista/dashboard que pode ficar vazio, desenhe empty state com: ilustração, copy explicativo, CTA específico.',
			'Empty states devem guiar para a ação certa ("Adicionar primeiro item", "Convidar time", "Conectar integração").',
			'Se o empty state é comum (ex: novo usuário), considere pre-popular com sample data removível.',
			'Teste em sessão simulada: o novo usuário consegue sair do empty state em <30s?',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar surfaces principais como usuário sem dados e verificar se cada empty state tem CTA funcional.',
		verification_eta_seconds: 50,
	},

	navigation_overcomplex: {
		remediation_steps: [
			'Conte quantos itens top-level sua navegação tem. Se >7, simplifique agrupando sob categorias.',
			'Organize navegação por frequência de uso. Itens mais usados acima, raramente usados atrás de "Mais" ou settings.',
			'Implemente busca global (Cmd+K) pra compensar navegação profunda. Atalho reduz clicks para features escondidas.',
			'Remova itens órfãos: analytics mostra features nunca acessadas? Esconda ou remova.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar a estrutura de navegação e contar profundidade + número de itens top-level.',
		verification_eta_seconds: 8,
	},

	feature_discovery_poor: {
		remediation_steps: [
			'Liste features premium/avançadas e verifique se cada uma tem um entry point descobrível na UI.',
			'Adicione hints contextuais: quando o usuário faz X, tooltip sugere feature Y que complementa.',
			'Configure product tours (Appcues, Intro.js) para features introduzidas recentemente.',
			'Meça via analytics % de usuários que usam cada feature em 30 dias. Features com <5% podem precisar de reposicionamento.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos logar como usuário simulado e explorar cada menu pra ver se features premium aparecem em entry points descobríveis.',
		verification_eta_seconds: 60,
	},

	upgrade_invisible: {
		remediation_steps: [
			'Adicione CTA de upgrade visível em pontos de contato com features gated (ex: badge "Premium" no item bloqueado).',
			'Na settings/pricing page, exiba comparação de planos com feature-by-feature matrix clara.',
			'Configure prompts contextuais: quando o usuário atinge limite do plano, modal oferece upgrade direto daquela ação.',
			'Evite paywalls agressivos no primeiro contato. Dá valor primeiro, upgrade depois.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir settings + pricing + features gated pra confirmar presença e clareza dos CTAs de upgrade.',
		verification_eta_seconds: 10,
	},

	upgrade_timing_wrong: {
		remediation_steps: [
			'Revise quando os prompts de upgrade aparecem. Não devem interromper task crítica (ex: durante fluxo de criação).',
			'Timing ideal: após o usuário ter experimentado valor, estar próximo ao limite do plano atual, ou ter tentado feature premium.',
			'Evite upgrade popups aleatórios. Use triggers comportamentais (limite atingido, feature acessada, 30 dias ativos).',
			'Meça taxa de conversão de cada trigger de upgrade. Desative os com <1% de CR.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Timing de upgrade é signal comportamental + produto. Reavaliar sobre evidência após você ajustar triggers.',
		verification_eta_seconds: 3,
	},

	no_expansion_path: {
		remediation_steps: [
			'Para cada plano atual, defina o próximo degrau natural: "Pro: 10 users → Business: 50 users" é um exemplo de expansion clara.',
			'Configure signal de expansion readiness: uso próximo ao limite, novos users adicionados, features avançadas adotadas.',
			'Implemente self-service upgrade (não exigir sales call) pra expansion automática.',
			'Meça Net Revenue Retention mensal. Healthy SaaS tem NRR >110%.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Expansion é uma estratégia de produto. Verificação é reavaliar após você definir caminho claro e instrumentar.',
		verification_eta_seconds: 3,
	},

	landing_app_mismatch: {
		remediation_steps: [
			'Compare a landing page com o produto real: prometem a mesma coisa? Tom, layout, e value prop devem se alinhar.',
			'Se a landing promete "simples e rápido", o primeiro login do app deve entregar essa sensação. Não uma wizard de 15 steps.',
			'Faça teste com 5 novos usuários: peça feedback específico sobre "o que a landing prometeu vs o que o app entregou".',
			'Revise mensalmente. Landing evolui rápido em SaaS, app às vezes não acompanha.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar da landing até primeiro login automaticamente, comparando elementos visuais e copy principais.',
		verification_eta_seconds: 55,
	},

	// ─────────────────────────────────────────────
	// Copy Analysis (Tier 1)
	// ─────────────────────────────────────────────

	checkout_trust_language_absent: {
		remediation_steps: [
			'Adicione copy próximo ao botão de pagar reforçando segurança: "Pagamento criptografado", "Certificado SSL", "Seus dados não são compartilhados".',
			'Inclua microcopy explicando próximos passos: "Após o pagamento você receberá email com nota fiscal e rastreio".',
			'Evite copy genérico ("Seguro e rápido"). Use frases específicas ao contexto da compra.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o checkout e procurar por keywords de trust language próximo aos campos de pagamento.',
		verification_eta_seconds: 5,
	},

	cta_clarity_weak_on_commercial: {
		remediation_steps: [
			'Substitua CTAs vagos ("Saiba mais", "Clique aqui") por verbos de ação específicos ("Comprar", "Ver preços", "Agendar demo").',
			'Cada página comercial deve ter 1 CTA primário dominante. Secundários em estilo outline/link.',
			'O texto do CTA deve comunicar o que acontece no próximo clique: "Adicionar ao carrinho" ≠ "Ir pro pagamento".',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar o HTML e conferir o texto de cada CTA contra lista de padrões vagos.',
		verification_eta_seconds: 6,
	},

	product_page_copy_generic: {
		remediation_steps: [
			'Reescreva descrição de produto focando em benefícios específicos, não features genéricas.',
			'Substitua copy de templates ("Produto de alta qualidade") por claims verificáveis ("Algodão 100% orgânico certificado GOTS").',
			'Inclua contexto de uso: quem é o comprador ideal, quando usa, qual problema resolve.',
			'Teste A/B headlines. Copy genérico geralmente perde 10-20% de conversão vs copy específico.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto e rodar análise de densidade semântica + comparação com templates genéricos conhecidos.',
		verification_eta_seconds: 10,
	},

	pricing_page_framing_unclear: {
		remediation_steps: [
			'Clarifique o que diferencia cada plano. Features específicas, não apenas limites numéricos.',
			'Destaque visualmente o plano recomendado (badge "Mais popular", cor diferente).',
			'Responda as 5 dúvidas mais comuns direto na pricing: "Posso trocar de plano?", "Tem fidelidade?", "Tem período de teste?".',
			'Remova pricing com "Entre em contato" se possível. Preços transparentes convertem melhor em SMB.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página de pricing e auditar estrutura: planos distinguíveis, plano recomendado marcado, FAQ presente.',
		verification_eta_seconds: 8,
	},

	// ─────────────────────────────────────────────
	// Wave 3.1 Tier 2 — LLM Enrichment (dormant findings)
	// ─────────────────────────────────────────────

	social_proof_generic: {
		remediation_steps: [
			'Substitua depoimentos genéricos por depoimentos com nome completo, foto, empresa/contexto.',
			'Adicione números concretos: "12.000 clientes", "4.8 estrelas em 3.200 avaliações", "reduzimos X em Y%".',
			'Inclua logos de clientes conhecidos (com permissão). Social proof visual impacta mais que texto.',
			'Evite badges genéricos sem fundamento ("Nº 1 em qualidade") que enfraquecem em vez de fortalecer.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'A próxima fase ativa uma camada de IA pra avaliar qualidade de social proof. Hoje a verificação é estrutural: conta quantos depoimentos têm atributos concretos.',
		verification_eta_seconds: 10,
	},

	form_error_messages_unhelpful: {
		remediation_steps: [
			'Audite mensagens de erro de cada form crítico (signup, checkout). Devem explicar o problema específico, não só "Erro".',
			'Erros devem indicar como corrigir: "Email já cadastrado. Fazer login?" em vez de "Email inválido".',
			'Destaque visualmente o campo com erro (borda vermelha, ícone) e foca automaticamente pro usuário corrigir.',
			'Valide client-side em real-time. Não espere submit pra mostrar que o email tá com typo.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'A próxima fase do Vestigio ativa uma camada de IA pra avaliar isso. Hoje vamos navegar automatizado submetendo forms com dados inválidos e capturar as mensagens de erro.',
		verification_eta_seconds: 45,
	},

	onboarding_no_quick_win: {
		remediation_steps: [
			'Defina o "aha moment" do produto. Qual é a menor demonstração de valor que o novo usuário pode experimentar em <5min?',
			'Redesign o primeiro login pra entregar esse aha moment na primeira sessão. Não na terceira.',
			'Se for necessário setup (importação, integração), mostre preview com sample data primeiro.',
			'Meça taxa de "aha moment completion" e otimize pra subir essa métrica. É o melhor preditor de retenção.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'A próxima fase do Vestigio ativa uma camada de IA pra avaliar isso. Hoje vamos executar signup+primeiro uso automaticamente e cronometrar até primeiro valor.',
		verification_eta_seconds: 90,
	},

	// ─────────────────────────────────────────────
	// Wave 3.10 Copy Analysis Pack
	// ─────────────────────────────────────────────

	value_proposition_buried: {
		remediation_steps: [
			'Reescreva o headline do hero para comunicar O QUE o produto faz, PARA QUEM, e POR QUE importa. Tudo em uma frase.',
			'Mova a proposta de valor para acima da dobra: o visitante precisa entender em 5 segundos sem rolar.',
			'Reduza elementos competindo no hero. 1 headline, 1 sub-headline, 1 CTA. Remova banners, sliders e widgets secundários.',
			'Teste A/B headlines usando fórmulas comprovadas: "Resultado [desejado] sem [objeção principal]" ou "[Número] [tipo de cliente] já [resultado]".',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a homepage e analisar o conteúdo above-the-fold: presença de proposta de valor, densidade de elementos, e especificidade do headline.',
		verification_eta_seconds: 8,
	},

	trust_copy_absent_at_decision: {
		remediation_steps: [
			'Adicione copy de segurança próximo ao botão de pagamento: "Pagamento criptografado SSL", "Garantia de 30 dias", "Seus dados protegidos".',
			'Inclua microcopy explicando o que acontece após a compra: "Você receberá confirmação por email em até 2 minutos".',
			'Posicione selos de trust (SSL, Reclame Aqui, Google Reviews) visíveis sem scroll na página de checkout.',
			'Remova qualquer urgência artificial (timers falsos, estoque fabricado). Substitua por urgência autêntica baseada em dados reais.',
			'Adicione garantia de satisfação ou política de devolução resumida diretamente na página de preços.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir checkout, pricing e product pages, procurando keywords de trust language, selos de segurança e ausência de dark patterns.',
		verification_eta_seconds: 8,
	},

	social_proof_ineffective: {
		remediation_steps: [
			'Substitua depoimentos genéricos por depoimentos com nome completo, cargo, empresa e resultado mensurável.',
			'Posicione social proof próximo aos CTAs de decisão (botão de compra, formulário de trial, página de pricing).',
			'Adicione números concretos: "12.000 clientes", "4.8 estrelas em 3.200 avaliações", "reduziu X em Y%".',
			'Inclua logos de clientes reais com permissão. Social proof visual impacta mais que texto genérico.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas comerciais e avaliar qualidade de social proof: especificidade de depoimentos, proximidade de CTAs, e presença de dados concretos.',
		verification_eta_seconds: 10,
	},

	cta_competing_or_unclear: {
		remediation_steps: [
			'Defina hierarquia de CTAs: 1 primário (cor forte), 1 secundário (outline), links terciários. Nunca 2+ botões dominantes competindo.',
			'Substitua labels vagos ("Saiba mais", "Clique aqui") por verbos de ação específicos com resultado: "Começar teste grátis", "Ver preços", "Agendar demo".',
			'Revise labels de navegação: substitua jargão interno por linguagem que o comprador usa ("Dashboard" → "Painel de resultados").',
			'Teste heat maps para confirmar que o CTA primário recebe a maioria dos cliques. Se não, ajuste posição e contraste.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar o HTML de páginas comerciais e conferir a hierarquia de CTAs, labels de botões e navegação contra padrões de clareza.',
		verification_eta_seconds: 8,
	},

	objection_unaddressed: {
		remediation_steps: [
			'Liste as 5 objeções mais comuns do comprador (pesquisa, suporte, reviews negativos) e responda cada uma na página de decisão.',
			'Adicione FAQ na página de pricing respondendo: "Posso cancelar?", "Tem garantia?", "O que acontece se não gostar?".',
			'Inclua comparação com alternativas na página de produto. O comprador vai comparar de qualquer forma, melhor que faça no seu site.',
			'Adicione risk reversal explícito próximo ao CTA: "Garantia de 30 dias. Se não servir, devolvemos 100%".',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir pricing e product pages, verificando presença de FAQ, garantias, comparações e risk reversal elements.',
		verification_eta_seconds: 8,
	},

	copy_cross_page_inconsistent: {
		remediation_steps: [
			'Crie um brand voice guide definindo tom, vocabulário e promessas. Distribua para todos que escrevem copy.',
			'Audite homepage, pricing, produto e checkout lado a lado. Identifique contradições de tom e promessa.',
			'Unifique terminologia: se homepage diz "simples", pricing não pode listar 47 features em tabela complexa.',
			'Implemente revisão cross-page antes de publicar. Cada página deve reforçar, não contradizer, as outras.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir múltiplas páginas e comparar tom, terminologia e promessas cross-page para detectar contradições.',
		verification_eta_seconds: 15,
	},

	copy_funnel_misalignment: {
		remediation_steps: [
			'Mapeie cada página ao estágio do funil (awareness, consideração, decisão) e ajuste copy para responder a pergunta daquele estágio.',
			'Reescreva descrições de produto focando em benefícios e resultado. Não features genéricas do fornecedor.',
			'Redesign onboarding copy para prometer e entregar um quick win em <5 minutos. "Em 2 minutos você vai ver X".',
			'Substitua mensagens de erro técnicas por linguagem humana que explica o problema E como resolver.',
			'Teste copy com 5 usuários reais: pergunte "O que essa página quer que você faça?". Se não souberem, reescreva.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir product pages, onboarding e forms, avaliando especificidade de copy, presença de quick wins e qualidade de mensagens de erro.',
		verification_eta_seconds: 12,
	},

	// ─────────────────────────────────────────────
	// Wave 3.10 Fase 4 — Polish Enrichments
	// ─────────────────────────────────────────────

	localization_persuasion_lost: {
		remediation_steps: [
			'Compare versões primária e traduzida lado a lado. Identifique onde urgência, prova social e CTA foram "achatados" para texto genérico.',
			'Use transcriação (não tradução literal) para CTAs, headlines e social proof. Contrate copywriters nativos que entendam persuasão.',
			'Mantenha elementos de urgência e escassez nas versões traduzidas. Adapte culturalmente em vez de remover.',
			'Implemente review process para copy localizado: tradutor + revisor nativo + aprovação de marketing antes de publicar.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir ambas versões (primária e traduzida) e comparar estrutura persuasiva: presença de urgência, especificidade de prova social, poder do CTA.',
		verification_eta_seconds: 15,
	},

	micro_copy_friction_high: {
		remediation_steps: [
			'Substitua botões genéricos ("Submit", "Send", "OK") por texto específico orientado a ação ("Começar trial grátis", "Enviar minha proposta").',
			'Revise labels de formulário: cada label deve explicar O QUE preencher e POR QUE. Ex: "Email corporativo (para receber seu acesso)" em vez de apenas "Email".',
			'Adicione texto helper inline nos campos que mais causam abandono. Placeholder com exemplo real, não repetição do label.',
			'Reescreva mensagens de erro em linguagem humana: "O email precisa ter @. Verifique e tente de novo" em vez de "Invalid input".',
			'Teste micro-copy com 3 usuários: peça para preencherem o formulário em voz alta. Onde pausam ou perguntam é onde o copy falha.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas com formulários e avaliar qualidade de labels, botões, placeholders e mensagens de erro.',
		verification_eta_seconds: 10,
	},

	seo_conversion_conflict: {
		remediation_steps: [
			'Reescreva H1s keyword-stuffed para comunicar valor ao comprador. Use a keyword no title tag e meta, mas o H1 deve vender.',
			'Separe SEO content blocks do conversion path: mova parágrafos keyword-rich para abaixo do fold ou para subpáginas dedicadas.',
			'Unifique title tag e H1: se o title diz "Best CRM Software 2026", o H1 deve dizer algo como "O CRM que [resultado específico]".',
			'Revise alt text de imagens: deve descrever a imagem para acessibilidade E incluir keyword naturalmente. Não keyword-spam.',
			'Avalie se large SEO content blocks abaixo do fold estão diluindo a mensagem de conversão. Considere mover para /blog ou /resources.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-analisar H1, title tags e copy das páginas comerciais para detectar se tensão SEO-conversão foi resolvida.',
		verification_eta_seconds: 10,
	},

	copy_stale_references: {
		remediation_steps: [
			'Atualize o ano de copyright no footer para o ano vigente. Configure auto-update se possível.',
			'Busque e remova referências a datas passadas, promoções expiradas e métricas desatualizadas em todas as páginas comerciais.',
			'Implemente review trimestral de copy: agende audit de conteúdo a cada 3 meses para detectar referências que envelheceram.',
			'Substitua métricas de prova social por números atualizados. Se o homepage dizia "1000+ clientes" em 2024, atualize para o número real.',
			'Configure alertas automáticos para detectar copy com datas hard-coded que ficarão obsoletas.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas e verificar: copyright atualizado, ausência de datas passadas, promoções expiradas e métricas de prova social atualizadas.',
		verification_eta_seconds: 8,
	},

	// ─────────────────────────────────────────────
	// Wave 8.3: Content Freshness & Decay
	// ─────────────────────────────────────────────

	commercial_page_stale: {
		remediation_steps: [
			'Audite todas as páginas comerciais (checkout, pricing, produto, home) procurando referências desatualizadas. Datas, promoções, métricas de prova social.',
			'Atualize ou remova datas hard-coded, ofertas expiradas e claims competitivos defasados.',
			'Crie um calendário trimestral de review de conteúdo focado nas páginas de maior conversão.',
			'Implemente copyright ano dinâmico e timestamp "última atualização" que se atualiza sozinho.',
			'Crie um checklist de freshness por tipo de página com critérios específicos de review.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes: 'Vamos reabrir e checar se datas foram atualizadas, referências defasadas removidas, e indicadores de conteúdo fresco nas páginas comerciais.',
		verification_eta_seconds: 10,
	},
	pricing_page_outdated: {
		remediation_steps: [
			'Revise toda a pricing page. Comparações com concorrente, lista de features, ofertas promocionais. E atualize pro estado atual do produto.',
			'Remova ou atualize qualquer linguagem "tempo limitado" que já expirou.',
			'Confirme que nomes de plano, tiers de preço e comparação de features batem com o produto atual.',
			'Atualize ROI calculators, case studies ou métricas citadas na pricing page.',
			'Coloque um lembrete mensal pra revisar pricing page (é a página que envelhece mais rápido).',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes: 'Vamos reabrir a pricing page e confirmar que o conteúdo está atualizado. Sem datas defasadas, ofertas expiradas ou claims competitivos antigos.',
		verification_eta_seconds: 8,
	},
	social_proof_expired: {
		remediation_steps: [
			'Atualize datas de todos os depoimentos pra recentes. Ou remova as datas se os depoimentos forem evergreen.',
			'Atualize contagem de clientes, números de receita e métricas de uso pros valores correntes.',
			'Substitua logo walls antigos pelos clientes atuais e adicione qualificadores "atualizado em [data]" nas métricas.',
			'Implemente social proof dinâmico (contadores em tempo real, score de reviews recentes) quando possível.',
			'Crie um refresh trimestral. Peça depoimentos novos, atualize números dos cases.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes: 'Vamos reabrir e checar social proof atualizado. Sem datas defasadas em depoimentos, métricas correntes, referências de clientes recentes.',
		verification_eta_seconds: 8,
	},
	content_decay_progression: {
		remediation_steps: [
			'Faça uma análise completa de conteúdo em todas as páginas comerciais. Sinalize tudo com data > 6 meses.',
			'Priorize as atualizações por tráfego e impacto em conversão. Comece pelas páginas de checkout e pricing.',
			'Implemente monitoramento contínuo de freshness (este finding do Vestigio vai re-checar a cada ciclo).',
			'Atribua dono por página comercial. Cada uma precisa de um responsável nomeado pelo review trimestral.',
			'Considere ferramentas de refresh assistido por IA pra acelerar updates em várias páginas em paralelo.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes: 'Monitoramento multi-ciclo. Este finding vai rastrear se os scores de staleness melhoram nos próximos ciclos de análise.',
		verification_eta_seconds: 10,
	},

	// ─────────────────────────────────────────────
	// Security Posture (Wave 3.3)
	// ─────────────────────────────────────────────

	security_header_weakness: {
		remediation_steps: [
			'Implemente HSTS: header `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.',
			'Configure CSP restritivo no checkout: apenas domínios whitelisted (seu site, gateway, GA/Pixel oficiais).',
			'Adicione X-Content-Type-Options: nosniff, X-Frame-Options: DENY (ou SAMEORIGIN se legítimo), Referrer-Policy: strict-origin.',
			'Valide em securityheaders.com. Target é score A ou A+ em domínios de commerce.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir os headers das URLs críticas e comparar com baseline de segurança esperado.',
		verification_eta_seconds: 5,
	},

	mixed_content_exposure: {
		remediation_steps: [
			'Liste recursos HTTP carregados em páginas HTTPS. Use DevTools Console que reporta mixed content warnings.',
			'Migre todos os recursos pra HTTPS: imagens, scripts, CSS, fonts, iframes.',
			'Configure Content-Security-Policy com `upgrade-insecure-requests` pra forçar browser a tentar HTTPS automaticamente.',
			'Corrija links internos hardcoded com http://. Migre pra protocol-relative (//) ou https://.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar URLs críticas automaticamente e capturar mixed content warnings do console.',
		verification_eta_seconds: 40,
	},

	sensitive_endpoint_exposed: {
		remediation_steps: [
			'Remova URLs administrativas de paths previsíveis (/admin, /wp-admin, /.env, /api/debug). 404 ou redirect pra home.',
			'Adicione autenticação em todos endpoints administrativos. Não confie em obscuridade.',
			'Configure robots.txt pra disallow rotas sensíveis (mas saiba que robots.txt não é mecanismo de segurança).',
			'Rode scanner regular (varredura do Vestigio, varredura do Vestigio) pra detectar endpoints expostos em produção.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos disparar o scanner a varredura completa do Vestigio na infraestrutura pública pra confirmar se endpoints sensíveis seguem expostos.',
		verification_eta_seconds: 180,
	},

	checkout_script_hijack_risk: {
		remediation_steps: [
			'Audite todos scripts carregados no checkout. Elimine third-parties não-essenciais.',
			'Para third-parties essenciais, implemente Subresource Integrity (SRI): `<script integrity="sha384-...">` previne injeção se o CDN for comprometido.',
			'Configure CSP restritivo no checkout: apenas hashes/nonces de scripts conhecidos.',
			'Monitore mudanças no script inventário. Alerta se script novo aparecer em produção sem deploy.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar o checkout automaticamente, extrair lista de scripts, e comparar com whitelist conhecido.',
		verification_eta_seconds: 50,
	},

	buyer_session_theft_risk: {
		remediation_steps: [
			'Cookies de sessão: configure `HttpOnly`, `Secure`, `SameSite=Lax` ou `Strict`.',
			'Tokens CSRF em todos os forms sensíveis. Signup, checkout, password change.',
			'Implemente rotação de session ID após login pra prevenir session fixation.',
			'Configure session timeout razoável (30-60min de inatividade) e renovação em ação do usuário.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar automaticamente e inspecionar atributos de cookies de sessão + presença de CSRF tokens em forms.',
		verification_eta_seconds: 45,
	},

	checkout_clickjack_risk: {
		remediation_steps: [
			'Configure X-Frame-Options: DENY (ou SAMEORIGIN se você embute o checkout em legítimo iframe próprio).',
			'Ou use CSP `frame-ancestors \'none\'` pra bloquear qualquer site externo de colocar seu checkout em iframe.',
			'Teste em clickjack testers (como /teste-clickjacking tools) pra confirmar que o checkout não renderiza em iframe externo.',
			'Revise páginas de ação sensível (mudança de senha, delete account). Apliquem mesma proteção.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir headers da URL do checkout e validar presença de X-Frame-Options ou CSP frame-ancestors.',
		verification_eta_seconds: 4,
	},

	error_page_information_leak: {
		remediation_steps: [
			'Customize páginas 404 e 500. Não expor stack traces, versões de framework, ou paths do servidor.',
			'Configure error handler genérico em produção que loga detalhes server-side mas retorna mensagem amigável.',
			'Audite respostas JSON de APIs. Não incluir detalhes de exception em produção.',
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
			'Verifique se forms de pagamento enviam dados via HTTPS. Target do form deve ser https://.',
			'Nunca receba PAN (número do cartão) direto em seu backend. Use tokenização do gateway.',
			'Se necessário mostrar mask do cartão (últimos 4 dígitos), armazene apenas token + mask, nunca PAN completo.',
			'Configure PCI-DSS SAQ A ou A-EP conforme integração com gateway. Documente o escopo.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos submeter dados teste automaticamente e inspecionar tráfego de rede pra confirmar criptografia + tokenização.',
		verification_eta_seconds: 60,
	},

	email_deliverability_risk: {
		remediation_steps: [
			'Configure SPF, DKIM, e DMARC corretos no DNS do domínio de envio.',
			'Use subdomínio dedicado pra transacional (ex: mail.dominio.com) separado de marketing.',
			'Monitore bounce rate + spam complaint rate. Target é <5% bounce e <0.1% complaint.',
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
			'Audite Access-Control-Allow-Origin em APIs. Nunca usar `*` em endpoints com cookies/auth.',
			'Whitelist explícita de origens permitidas. Use lista ao invés de wildcard em produção.',
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
			'Use WAF (Cloudflare, AWS WAF) como primeira camada. Rate limit + bot protection.',
			'Configure alertas para picos anômalos: 100 tentativas/min em login = ataque de credential stuffing.',
			'Retorne HTTP 429 com Retry-After header. Clientes legítimos entendem, bots desistem.',
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
			'Valide authorization em toda request. Usuário só pode ver pedidos próprios, não por conhecer URL.',
			'Rote audit logs de acesso a pedidos. Detecta enumeração / IDOR attacks.',
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
			'Rote todas as credenciais de gateway + API keys expostas. Comprometimento de payment surface vaza dados de buyers.',
			'Desative temporariamente o checkout até forensics completo. Fraude em andamento compounds rápido.',
			'Notifique o gateway + autoridades (se LGPD breach) + buyers afetados. Requerido por lei.',
		],
		estimated_effort_hours: 40,
		verification_strategy: 'external_scan',
		verification_notes:
			'Incidente crítico. Dispara a varredura completa do Vestigio full scan + análise de scripts + diff com baseline conhecido limpo.',
		verification_eta_seconds: 300,
	},

	channel_traffic_divertible: {
		remediation_steps: [
			'Audite links externos na home e páginas de produto. Cada link externo é oportunidade de diversão de tráfego.',
			'Se você tem afiliados, use link shorteners oficiais (não redirects genéricos que podem ser sequestrados).',
			'Configure CSP restritivo pra prevenir injeção de links externos via scripts comprometidos.',
			'Monitore outbound traffic analytics. Picos anormais podem indicar redirect malicioso injetado.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar o site automaticamente coletando todos outbound links e comparar com allowlist esperado.',
		verification_eta_seconds: 60,
	},

	commerce_operations_exposed: {
		remediation_steps: [
			'Identifique endpoints de operação comercial expostos publicamente: painéis, APIs internas, webhooks.',
			'Implemente autenticação + IP allowlist em todos endpoints administrativos.',
			'Remova referências a endpoints internos de HTML/JS públicos. Operators não devem aparecer em robots.txt nem em source.',
			'Segmente rede: endpoints operacionais em VPC privada, não no mesmo cluster do site público.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos disparar a varredura completa do Vestigio na infraestrutura pública pra detectar endpoints operacionais expostos.',
		verification_eta_seconds: 180,
	},

	traffic_landing_low_trust_posture: {
		remediation_steps: [
			'Landing pages de campanha devem herdar trust markers do site principal. Políticas, contato, selos visíveis.',
			'Evite landing pages em subdomínios ou domínios separados sem trust markers. Buyer não sabe que é você.',
			'Se necessário usar domínio separado (ex: campanha Black Friday), replique visual identity + trust markers do principal.',
			'Audite landings ativas trimestralmente. Algumas ficam órfãs sem manutenção e regridem em trust.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir landings conhecidas e medir presença de trust markers em cada.',
		verification_eta_seconds: 20,
	},

	channel_compromise_visible: {
		remediation_steps: [
			'Incidente ativo. Escale pra time de security + resposta imediata.',
			'Identifique vetor: script injetado, DNS hijack, certificado comprometido, ou credencial vazada.',
			'Isole o vetor (remova script, rote credencial, revogue cert) e documente timeline do incidente.',
			'Comunique buyers afetados com transparência. Silêncio durante incidente piora reputação mais que o incidente em si.',
		],
		estimated_effort_hours: 40,
		verification_strategy: 'external_scan',
		verification_notes:
			'Crítico. Dispara scan completo (a varredura completa do Vestigio + brand-intel) pra mapear extensão do comprometimento.',
		verification_eta_seconds: 300,
	},

	commercial_path_abuse_friendly: {
		remediation_steps: [
			'Audite endpoints de compra/promoção pra padrões abusáveis: IDs sequenciais, promos sem validação, price override aceito.',
			'Implemente validação server-side em todos pricing. Nunca confie no preço vindo do cliente.',
			'Rate limit agressivo em endpoints críticos: checkout, apply_coupon, add_to_cart.',
			'Configure fraud detection: padrões suspeitos (mesmo card, mesmo IP, múltiplos emails) bloqueiam com review manual.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos disparar varredura do Vestigio deep discovery pra mapear endpoints abusáveis + revalidar após seus fixes.',
		verification_eta_seconds: 240,
	},

	economic_exploitation_active: {
		remediation_steps: [
			'Incidente financeiro ativo. Investigue immediatamente quais compras/promos foram exploradas.',
			'Bloqueie o vetor específico (cupom abusado, preço manipulado, checkout bypass).',
			'Calcule perda acumulada e decida se rollback de transações fraudulentas é viável ou se chargeback é mais barato.',
			'Audite todas promoções ativas com a mesma lógica. Exploit tipicamente funciona em múltiplas campanhas.',
		],
		estimated_effort_hours: 30,
		verification_strategy: 'external_scan',
		verification_notes:
			'Revarredura do Vestigio contra os endpoints comprometidos pra confirmar patch + monitorar padrões de abuso.',
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
	// Deep Discovery (Phase 3B — varredura do Vestigio)
	// ─────────────────────────────────────────────

	promotion_logic_exposed: {
		remediation_steps: [
			'Migre lógica de desconto pro backend. Cliente nunca deve calcular promoções.',
			'Valide server-side: coupon code existe, não expirou, aplica a esses produtos, não excedeu limite.',
			'Logue cada aplicação de cupom com user_id + IP pra detectar padrões de abuso.',
			'Revise cupons ativos trimestralmente. Remova os que não geram receita mas ainda podem ser abusados.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos dispatch varredura do Vestigio em endpoints de cart/coupon pra revalidar superfície abusável.',
		verification_eta_seconds: 180,
	},

	cart_variant_weak_control: {
		remediation_steps: [
			'Toda validação de estoque + preço deve ocorrer server-side no checkout. Nunca confie no cart do cliente.',
			'Implemente token de segurança por sessão de cart. Invalida se detectar manipulação.',
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
			'Audite URLs /refund, /discount, /coupon, /comp. São acessíveis publicamente? Devem exigir autenticação.',
			'Rotas administrativas de reembolso/desconto devem estar atrás de staff auth + audit log.',
			'Remove query strings que aceitam override de preço (?discount=50, ?price=1). Vulnerabilidade comum.',
			'Monitore logs pra padrões de exploração. Picos em /refund sem transação correspondente = abuso.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Varredura do Vestigio contra paths de discount/refund pra confirmar ocultação + autenticação.',
		verification_eta_seconds: 150,
	},

	guessable_business_endpoint: {
		remediation_steps: [
			'Substitua IDs sequenciais em endpoints críticos por UUIDs opacos: /api/order/abc-123-def em vez de /api/order/1.',
			'Implemente authorization por endpoint. User só acessa seus próprios recursos (IDOR protection).',
			'Audite APIs públicas: quais expõem enumeração de recursos? Adicione rate limit + auth.',
			'Rode scanner de IDOR regular. Test if changing ID returns other user data.',
		],
		estimated_effort_hours: 18,
		verification_strategy: 'external_scan',
		verification_notes:
			'Varredura do Vestigio com foco em endpoints numericamente enumeráveis + tentativa de IDOR.',
		verification_eta_seconds: 180,
	},

	alternate_pricing_safeguard_bypass: {
		remediation_steps: [
			'Identifique variantes de pricing (BRL, USD, promo region, B2B) e consolidar validação server-side única.',
			'Elimine rotas de pricing alternativas sem controle. Buyer não deve escolher qual preço paga.',
			'Configure feature flag com lista de clientes autorizados pra pricing especial. Não via URL exposta.',
			'Logue transações fora do pricing padrão. Alert pra review manual.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Probe paths de pricing alternativo + comparar preço final com esperado pelo pricing público.',
		verification_eta_seconds: 150,
	},

	js_discovered_purchase_variant: {
		remediation_steps: [
			'Revise bundles JS públicos. Removem paths/endpoints sensíveis que podem ser descobertos via crawl.',
			'Use source maps em dev, desabilite em produção.',
			'Obfusque (não security, mas raise bar) código crítico de pricing/checkout no build de produção.',
			'Audite trimestralmente: quais endpoints estão referenciados em JS público?',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Varredura do Vestigio em JS bundles pra mapear endpoints referenciados + comparar com surfaces autorizadas.',
		verification_eta_seconds: 150,
	},

	dynamic_route_weak_control: {
		remediation_steps: [
			'Audite rotas dinâmicas (regex routes, wildcard routes). Fácil introduzir ACL gap.',
			'Use framework de autorização centralizado (policies/guards) em vez de checks inline por route.',
			'Rode test automatizado de autorização: cada route protegida com lista de quem pode acessar.',
			'Revise após cada deploy que adiciona ou modifica rotas dinâmicas.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'external_scan',
		verification_notes:
			'Varredura do Vestigio de rotas dinâmicas com tentativas de auth bypass.',
		verification_eta_seconds: 180,
	},

	hidden_support_burden: {
		remediation_steps: [
			'Meça tempo médio de resolução de suporte separado por categoria. Identifique qual tipo de ticket consome mais recursos.',
			'Resolva root cause dos tickets recorrentes. Cada ticket evitado é redução de custo + buyer satisfaction.',
			'Automatize respostas para dúvidas frequentes via FAQ + chatbot. Escale suporte sem aumentar headcount.',
			'Revise mensalmente: quais produtos/features geram mais suporte? Priorize UX aí.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Suporte é métrica operacional externa ao site. Reavaliar após você documentar tickets + tempo de resolução.',
		verification_eta_seconds: 3,
	},

	alternate_variant_control_breakdown: {
		remediation_steps: [
			'Audite lógica de variantes (tamanho, cor, região) no checkout. Garante que cada variante tem preço + estoque distintos validados.',
			'Implemente validação consistente server-side: qty, variant, price devem bater com catalog real.',
			'Teste edge cases: comprar variante sem estoque, variante inexistente, variante de produto arquivado.',
			'Logue divergências. Tentativa de comprar variante inválida é signal de probe automatizado.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'varredura do Vestigio + probe de variant manipulation (IDs inexistentes, mix de produto + variante órfã).',
		verification_eta_seconds: 180,
	},

	deep_commerce_exploitation_risk: {
		remediation_steps: [
			'Incidente composto. Múltiplos vetores de exploração ativos simultaneamente. Escale pra security team.',
			'Rode full scan (a varredura completa do Vestigio) pra mapear extensão do problema.',
			'Priorize patch pelos vetores de maior impacto financeiro (preço, cupom, checkout) primeiro.',
			'Configure monitoramento contínuo pós-remediação. Exploração composta geralmente tem tentativas de re-entrada.',
		],
		estimated_effort_hours: 40,
		verification_strategy: 'external_scan',
		verification_notes:
			'Full scan a varredura completa do Vestigio + revalidação de cada vetor identificado.',
		verification_eta_seconds: 300,
	},

	// ─────────────────────────────────────────────
	// Performance & Network (Phase 2D)
	// ─────────────────────────────────────────────

	checkout_api_latency_degraded: {
		remediation_steps: [
			'Meça latência dos endpoints críticos do checkout em produção. Identifique P95 e P99.',
			'Otimize queries do backend do checkout: indexes, caching, n+1 query removal.',
			'Configure CDN pra assets estáticos do checkout (CSS, JS, imagens). Reduz TTFB.',
			'Implemente timeout graceful: se API demora >5s, mostre mensagem ao usuário em vez de travar.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar checkout automaticamente capturando timing de cada request + retornar P50/P95.',
		verification_eta_seconds: 50,
	},

	commercial_pages_slow: {
		remediation_steps: [
			'Rode análise de performance em páginas de produto e categoria. Target LCP <2.5s, TTFB <600ms.',
			'Otimize imagens: formato WebP/AVIF, lazy loading, responsive sizes.',
			'Remova scripts third-party não-essenciais ou mova pra async/defer.',
			'Configure cache agressivo de assets estáticos (1 ano via Cache-Control) + ETag pra HTML.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar análise de performance automaticamente contra páginas comerciais e comparar com baseline anterior.',
		verification_eta_seconds: 60,
	},

	paid_landing_overloaded: {
		remediation_steps: [
			'Landing pages de campanha devem ser minimalistas. Remova widgets, chats, analytics não-essenciais.',
			'Mantenha apenas 1 CTA primário acima da dobra + seção de benefícios + prova social.',
			'Teste com PageSpeed Insights. Landing de ads deve ter LCP <2s pra maximizar quality score.',
			'Hospede landings em infra otimizada (Vercel, Netlify) em vez do mesmo stack do app principal.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'análise de performance + análise de peso de recursos carregados nas landings de paid.',
		verification_eta_seconds: 50,
	},

	third_party_weight_delays_trust: {
		remediation_steps: [
			'Liste third-party scripts no checkout: analytics, chat, pixel, A/B testing. Peso total?',
			'Elimine não-essenciais (A/B testing no checkout é risco, chat pode carregar depois).',
			'Para essenciais (GA, Pixel), carregue async + depois do main content render.',
			'Configure timeout. Se third-party não responde em 3s, desiste e não bloqueia render.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Capturar network trace do checkout + classificar requests por origem (próprio vs third-party).',
		verification_eta_seconds: 45,
	},

	checkout_brittle_third_party: {
		remediation_steps: [
			'Identifique dependências críticas do checkout em third-parties. Gateway, anti-fraude, tax calc.',
			'Configure fallback: se anti-fraude não responde, permita compra com flag de review manual pós-facto.',
			'Para gateway, tenha backup configurado (Stripe + Mercado Pago) e switchover automático via feature flag.',
			'Monitore status pages dos providers + configure alerta no seu lado se detectar degradation.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Navegar checkout automatizado + simular falha de third-party pra ver se graceful degradation funciona.',
		verification_eta_seconds: 60,
	},

	purchase_blocked_failing_requests: {
		remediation_steps: [
			'Capture os 10 últimos erros de network no checkout. Dê priority pelos que afetam pagamento.',
			'Configure retry automático em requests não-idempotentes com backoff exponential.',
			'Para requests críticos (payment_intent), garanta idempotency key pra evitar duplicação em retry.',
			'Logue taxa de sucesso por endpoint no checkout. Alert se cair abaixo de 98%.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Navegar checkout múltiplas vezes automaticamente + coletar requests failed + estatística de sucesso.',
		verification_eta_seconds: 60,
	},

	measurement_breaks_revenue_path: {
		remediation_steps: [
			'Se tag analítica bloqueia ou atrasa o checkout, reconfigure pra load async/defer.',
			'Se GA/Pixel quebra a página quando bloqueado por adblocker, envolva em try/catch + fallback silencioso.',
			'Configure tags com performance budget. Se ultrapassar X ms de exec, aborta.',
			'Use Tag Manager com triggers condicionais pra medir sem bloquear interação.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Carregar checkout automatizado com/sem adblocker + medir impacto no tempo de render.',
		verification_eta_seconds: 50,
	},

	purchase_before_deps_ready: {
		remediation_steps: [
			'Audite ordem de carregamento: botão de pagamento não deve estar clicável antes de scripts críticos (anti-fraude, tokenizer) carregarem.',
			'Desabilite botão de submit até scripts essenciais estarem prontos. Mostre loading state.',
			'Configure eventos `DOMContentLoaded` + check de deps antes de ativar o fluxo de compra.',
			'Teste em conexão slow 3G. Deps devem carregar dentro de 5s ou o fluxo falha graciosamente.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Carregar checkout em throttle 3G + testar clique em submit antes de completar load.',
		verification_eta_seconds: 55,
	},

	trust_assets_late_load: {
		remediation_steps: [
			'Trust markers (selos SSL, logos de pagamento, política) devem estar no HTML inicial. Não carregados via JS.',
			'Evite carregar logos via CDN externo que pode ser lento ou bloquear. Hospede internally.',
			'Priorize LCP. Selos de trust acima da dobra devem aparecer em <2.5s.',
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
			'Mobile tem CPU/network mais limitado. Agressivamente reduza JS executado no primeiro paint.',
			'Use code splitting: carregue apenas código necessário pra rota atual, lazy-load o resto.',
			'Remova polyfills desnecessários. Modern browsers em mobile não precisam de suporte IE.',
			'Meça JS main thread blocking em mobile simulation. Target <200ms de long tasks.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'análise de performance mobile + análise de JS bundle size + long tasks no main thread.',
		verification_eta_seconds: 60,
	},

	mobile_trust_payment_deps_failing: {
		remediation_steps: [
			'Teste payment deps (gateway scripts, tokenizer) especificamente em mobile. Deps web às vezes falham em WebView.',
			'Configure fallback de payment method quando script primário falha (ex: fallback de Stripe Elements pra redirect flow).',
			'Monitore erros JS específicos de mobile. Alertar quando divergem do desktop.',
			'Teste em iOS Safari + Chrome Android reais, não só emulator. Cada tem quirks diferentes.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Em navegador automatizado mobile viewport + capturar falhas de payment scripts + taxa de sucesso por browser.',
		verification_eta_seconds: 60,
	},

	trust_surfaces_unstable_deps: {
		remediation_steps: [
			'Mapeie quais trust surfaces dependem de third-parties (selos dinâmicos, reviews widgets).',
			'Para cada dep third-party, mensure uptime + configure fallback estático se falhar.',
			'Prefira trust markers servidos do seu próprio domínio. Selos self-hosted não dependem de provider externo.',
			'Configure monitoring específico pra trust surfaces. Queda de provider = queda de conversão imediata.',
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
			'Garanta que title e H1 da página estão alinhados mas não idênticos. Title otimizado pra search, H1 pra humano.',
			'Audite trimestralmente quais títulos rankam e quais não aparecem no top 10. Ajuste copy do que underperforma.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Reanalisar HTML + extrair title/meta/H1 das páginas comerciais e comparar com best-practice.',
		verification_eta_seconds: 10,
	},

	social_previews_fail_commercial_value: {
		remediation_steps: [
			'Configure Open Graph tags: og:title, og:description, og:image (1200x630), og:url em todas páginas comerciais.',
			'Twitter Card: summary_large_image com imagem otimizada pra compartilhamento.',
			'Teste previews em debuggers oficiais: developers.facebook.com/tools/debug + cards-dev.twitter.com.',
			'Customize preview image por categoria de produto. Genérico de logo é desperdício de share.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Reanalisar HTML + extrair og/twitter meta tags + validar URLs de imagem retornam 200.',
		verification_eta_seconds: 10,
	},

	brand_inconsistent_across_surfaces: {
		remediation_steps: [
			'Defina brand guide curto: logo, paleta, tipografia, tom de voz. Publique internamente.',
			'Audite surfaces existentes (home, app, email, landing, redes sociais). Elemina divergências de logo/cor/copy.',
			'Centralize assets de marca em CDN próprio. Evita versões antigas circulando.',
			'Configure checklist pré-deploy pra revisar mudanças visuais contra brand guide.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Reabrir surfaces principais + extrair logo + paleta + comparar com baseline brand assets.',
		verification_eta_seconds: 20,
	},

	commercial_pages_unlikely_indexed: {
		remediation_steps: [
			'Verifique robots.txt + meta robots das páginas comerciais. Não devem ter noindex acidental.',
			'Configure canonical tags corretos. Aponte pra versão preferida da página (sem query params ruido).',
			'Envie sitemap.xml atualizado pro Google Search Console + Bing Webmaster Tools.',
			'Gere links internos pra páginas comerciais da home/blog. Pages sem backlinks internos raramente rankam.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Reanalisar HTML + robots.txt + sitemap.xml + validar presença/ausência de noindex.',
		verification_eta_seconds: 12,
	},

	weak_semantic_intent_signals: {
		remediation_steps: [
			'Adicione JSON-LD Schema em páginas comerciais: Product (preço, estoque), Offer, Organization, BreadcrumbList.',
			'Use schema.org vocab correto. Product em páginas de produto, Article em blog, Review em depoimentos.',
			'Valide com Rich Results Test do Google. Schema inválido não ajuda SEO.',
			'Monitore rich results no Search Console. Tickets pra schema errors aparecem lá.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Reanalisar HTML + extrair JSON-LD + validar schema vs expectativa (Product em produto, etc.).',
		verification_eta_seconds: 10,
	},

	previews_disconnected_from_conversion: {
		remediation_steps: [
			'Social preview images devem enfatizar produto + benefício, não só logo.',
			'Title do preview deve comunicar valor comercial. "50% OFF" ou "Frete grátis" funciona melhor que título genérico.',
			'Teste A/B images diferentes pra mesma URL. Mede qual gera mais CTR de compartilhamento.',
			'Cada campanha de ads/social deve ter preview otimizado pro contexto. Não usa o default da página.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'http_static',
		verification_notes:
			'Reabrir + analisar relevância de og:title + og:image vs copy comercial da página.',
		verification_eta_seconds: 10,
	},

	commercial_pages_not_exposed_for_discovery: {
		remediation_steps: [
			'Adicione páginas comerciais ao sitemap.xml. Priorize produto e categoria com priority > 0.8.',
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
			'Configure redirect 301 dos domínios defensivos pra domínio principal. Recupera tráfego de erro de digitação.',
			'Para lookalikes ativamente competindo: registre trademark e envie takedown notice via registrar.',
			'Monitore SERPs regularmente. Detecta lookalikes novos e age antes que ganhem tração.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Re-disparar brand intelligence scan pra listar domínios similares ainda ativos.',
		verification_eta_seconds: 240,
	},

	external_sites_mimicking_brand: {
		remediation_steps: [
			'Identifique sites que copiam visual/copy. Capture screenshots como evidência.',
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
			'Audite ads pagos usando sua marca. Competidores podem estar fazendo branded search em cima do seu nome.',
			'Registre trademark pra protegê-lo em Google Ads + Facebook Ads.',
			'Configure bid defensivo em branded keywords. Não deixe competidor roubar tráfego barato.',
			'Monitore search suggestions no Google. "marca X reclamação" ou "marca X golpe" indica problema reputacional.',
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
			'Reporte phishing pages a Google Safe Browsing + Microsoft Defender SmartScreen. Removem do browsing.',
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
			'Unifique o branding em todas as surfaces ativas. Inconsistência confunde buyer.',
			'Defina domínio master único para ads, emails, social. Evita dispersão de tráfego.',
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
			'Priorize replenishment dos produtos mais promovidos. Estoque perdido durante campanha é receita perdida.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify + cross-reference com campanhas ativas.',
		verification_eta_seconds: 30,
	},

	high_refund_rate_eroding_revenue: {
		remediation_steps: [
			'Audite top 10 razões de refund no Shopify. Identifique padrões por produto / SKU.',
			'Melhore fotos + descrições dos produtos mais reembolsados. Misalinhamento de expectativa é causa comum.',
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
			'Negocie contratos com SLA. Gateway sem garantia de uptime é aposta.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify payment config + validar presença de gateways alternativos ativos.',
		verification_eta_seconds: 20,
	},

	discount_abuse_pattern: {
		remediation_steps: [
			'Audite cupons ativos. Limite uso por customer (1x), por email, por IP.',
			'Configure fraud detection: mesmo CPF comprando 10x com cupom = abuso.',
			'Expire cupons regularmente. Cupons permanentes são convite pra compartilhamento em sites tipo Cuponeria.',
			'Meça margem pós-desconto por campanha. Alguns cupons podem estar negativos.',
		],
		estimated_effort_hours: 14,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify discount analytics + cross-reference com padrões de uso suspeitos.',
		verification_eta_seconds: 30,
	},

	ad_spend_platform_concentration_risk: {
		remediation_steps: [
			'Identifique a segunda melhor plataforma pro seu ICP. Testar não precisa esperar a primeira quebrar.',
			'Desloque 15-25% do budget pra segunda plataforma em campanhas espelho (mesmo creative, mesma audiência).',
			'Documente a posta-em-pé de um novo ad account: credenciais, tags, pixel, aprovação. Tempo esperado pra standup é 1-3 semanas.',
			'Configure alertas de account health em ambas plataformas (disable, policy warning, spend anomaly).',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull ad platform snapshots pra confirmar que spend distribui em >= 2 plataformas sem queda de ROAS.',
		verification_eta_seconds: 40,
	},

	ads_without_conversion_visibility: {
		remediation_steps: [
			'Conecte sua plataforma de commerce (Shopify, Nuvemshop ou Stripe) em Settings → Data Sources. O wizard faz OAuth e reconcilia histórico em minutos.',
			'Valide que orders dos últimos 30 dias estão sendo importadas. ROAS calculável vai aparecer no dashboard imediatamente.',
			'Configure UTM tagging nas campanhas (utm_source, utm_campaign) pra attribution por criativo, não só por plataforma.',
			'Depois de 30 dias com conversion tracking ativo, revise criativos: pause os bottom 20% ROAS, dobre budget no top 10%.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull commerce integration pra confirmar que orders estão flowing; checar total_ad_spend_monthly vs revenue attribuída.',
		verification_eta_seconds: 20,
	},

	ad_creative_dead_destination: {
		remediation_steps: [
			'Identifique o criativo no Ads Manager que aponta pra URL morta. O finding carrega o nome do criativo + plataforma.',
			'Atualize a destination URL do criativo pra uma página viva e relevante pro mesmo público.',
			'Se a página foi removida intencionalmente, pause o criativo imediatamente. Cada hora ligado é gasto perdido.',
			'Configure redirect 301 da URL antiga pra nova se outras fontes também linkam (SEO, email, etc.).',
		],
		estimated_effort_hours: 1,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-fetch a destination URL pra confirmar HTTP 200 sem redirect chain excessiva.',
		verification_eta_seconds: 10,
	},

	ad_creative_landing_trust_gap: {
		remediation_steps: [
			'Adicione trust badge (SSL seal, reviews widget, logo de segurança) na landing page que o anúncio direciona.',
			'Coloque depoimentos/reviews próximo ao formulário de dados sensíveis. Proximity é o que importa.',
			'Garanta que a política de privacidade esteja linkada no mesmo viewport do campo de dados.',
			'Se possível, adicione structured data tipo Organization/LocalBusiness pra confiança via rich snippets.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-crawl a landing page pra confirmar presença de >= 2 trust signals co-locados com campos sensíveis.',
		verification_eta_seconds: 15,
	},

	ad_creative_form_friction_waste: {
		remediation_steps: [
			'Reduza o formulário da landing page pra 6 campos ou menos. Remova tudo que não é essencial pra primeira conversão.',
			'Se precisa de mais dados, divida em steps (guest checkout → coleta pós-conversão) em vez de um form monolítico.',
			'Remova campos como "confirme o email" ou "telefone fixo" que geram atrito sem valor real pra conversão.',
			'A/B test: versão curta vs versão atual. Meça conversion rate por variante durante 14 dias.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Re-crawl a landing page pra confirmar que o form principal tem <= 8 campos.',
		verification_eta_seconds: 15,
	},

	ad_creative_mobile_checkout_degraded: {
		remediation_steps: [
			'Teste a landing page no mobile real (Chrome DevTools mobile viewport não substitui device real).',
			'Identifique scripts que bloqueiam render. Lazy-load tudo que não é above-the-fold.',
			'Garanta que CTA principal ("Comprar", "Assinar") seja visible sem scroll no mobile viewport.',
			'Se possível, use AMP ou otimize critical rendering path pra < 3s first meaningful paint.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Re-run mobile verification pra confirmar que commercial path completa sem step failures e em < 8s.',
		verification_eta_seconds: 30,
	},

	ad_creative_message_mismatch: {
		remediation_steps: [
			'Abra o criativo no Gerenciador de Anúncios e leia headline + corpo do anúncio lado a lado com a landing page.',
			'Atualize o H1 da landing page pra ecoar a promessa principal do anúncio. Match exato de palavras aumenta relevância percebida e reduz CPL.',
			'Garanta que a CTA da landing combina com a ação prometida no anúncio (ex: anúncio diz "Teste grátis" mas LP diz "Fale com vendas" é mismatch).',
			'Se o anúncio menciona uma oferta específica (desconto, trial, feature), confirme que ela aparece acima da dobra na LP.',
			'Alternativa: atualize o anúncio pra refletir o que a LP entrega de fato, em vez de prometer algo que a página não cumpre.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'reuse_only' as const,
		verification_notes:
			'Vamos reabrir a landing page e re-rodar a análise de message-match pra confirmar que o score de alinhamento subiu acima de 60.',
		verification_eta_seconds: 15,
	},

	low_repeat_purchase_rate: {
		remediation_steps: [
			'Configure email de re-engagement 30/60/90 dias pós-compra com recomendações personalizadas.',
			'Implemente programa de loyalty/pontos. Reduz atrito pra segunda compra.',
			'Analise LTV por cohort. Qual canal de aquisição traz customers que recompram?',
			'Crie subscription option pra produtos consumíveis. Recurring revenue é o maior leverage.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify pra confirmar repeat purchase rate trend + cohort analysis.',
		verification_eta_seconds: 40,
	},

	dead_weight_products: {
		remediation_steps: [
			'Liste produtos com zero venda em 30 dias. Delista ou reposicione.',
			'Mova SKUs dead-weight pra categoria "clearance" com desconto real pra girar estoque.',
			'Analise se dead weight é por preço, posicionamento, ou demanda. Ação varia.',
			'Mensalmente, faça purge de SKUs sem venda em 90 dias. Polui busca e dilui inventário.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Shopify + cross-check de venda por SKU nos últimos 30d.',
		verification_eta_seconds: 30,
	},

	// Wave 7.11: SaaS/Stripe metric findings
	subscriber_churn_elevated: {
		remediation_steps: [
			'Implemente pesquisa de cancelamento (1-2 perguntas) pra mapear os motivos reais de churn.',
			'Configure dunning automation com 3-5 retentativas + email avisando o cliente que o pagamento falhou.',
			'Crie oferta de retenção (pause, downgrade, extensão) antes do cancelamento definitivo.',
			'Monitore churn rate semanal com alerta quando ultrapassar 5% mensal.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Stripe pra verificar se churn rate caiu abaixo de 5% no próximo período de 30d.',
		verification_eta_seconds: 30,
	},

	failed_payment_rate_high: {
		remediation_steps: [
			'Ative card updater no Stripe (automático pra cartões expirados).',
			'Configure smart retry com backoff progressivo (Stripe Billing já suporta).',
			'Envie email ao cliente no primeiro failure com link pra atualizar método de pagamento.',
			'Implemente grace period de 3-7 dias antes de suspender acesso após failure.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Stripe pra verificar se failed_payment_rate caiu abaixo de 3% no próximo período de 30d.',
		verification_eta_seconds: 30,
	},

	// ─────────────────────────────────────────────
	// Wave 8.1: Payment Health & Involuntary Churn
	// ──────────────────────────────────────���──────

	failed_payment_revenue_drain: {
		remediation_steps: [
			'Ative card updater automático no Stripe pra renovar cartões expirados sem intervenção do cliente.',
			'Configure smart retry (Stripe Billing) com backoff progressivo. 3 a 5 tentativas antes de cancelar.',
			'Envie email ao cliente no primeiro failure com link direto pra atualizar método de pagamento.',
			'Implemente grace period de 5-7 dias antes de suspender acesso após falha de pagamento.',
			'Monitore failed_payment_rate semanal com alerta quando ultrapassar 5%.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Stripe pra verificar se failed_payment_rate caiu abaixo de 5% no próximo ciclo de 30d.',
		verification_eta_seconds: 30,
	},

	subscriber_churn_unsustainable: {
		remediation_steps: [
			'Implemente pesquisa de cancelamento (1-2 perguntas obrigatórias) pra mapear motivos reais de churn.',
			'Crie ofertas de retenção escalonadas: pause → downgrade → extensão → desconto temporário.',
			'Configure dunning automation com emails personalizados pra recuperar involuntary churn.',
			'Analise cohorts de churn por tenure. Identifique em qual mês os subscribers mais cancelam.',
			'Implemente health score de subscriber baseado em uso do produto pra intervir antes do cancelamento.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull Stripe pra verificar se subscriber_churn_rate caiu abaixo de 7% no próximo ciclo de 30d.',
		verification_eta_seconds: 30,
	},

	payment_diversity_insufficient: {
		remediation_steps: [
			'Integre gateway secundário (ex: Stripe + Adyen, ou Stripe + PayPal) pra redundância.',
			'Configure roteamento inteligente: PIX/boleto pra BR, cartão internacional via gateway secundário.',
			'Implemente failover automático. Se o gateway primário retorna erro, tenta no secundário.',
			'Monitore uptime e taxa de sucesso por gateway pra detectar degradação antes que vire outage.',
		],
		estimated_effort_hours: 40,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Re-pull dados de pagamento pra verificar se há mais de um gateway ativo processando transações.',
		verification_eta_seconds: 30,
	},

	mrr_contraction_detected: {
		remediation_steps: [
			'Identifique se a contração vem de pagamentos falhos (involuntary churn) ou cancelamentos (voluntary churn) via cohort no Stripe.',
			'Para involuntary: ative Card Updater + Smart Retries + dunning emails na primeira falha. Recupera 30-50% dos casos.',
			'Para voluntary: implemente cancellation survey + retention offers (pausa, downgrade, extensão) antes do cancel final.',
			'Configure alerta semanal de MRR delta para detectar contração antes que compõe 3+ ciclos.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Vamos re-puxar dados Stripe no próximo ciclo e confirmar se MRR voltou a crescer ou estabilizou.',
		verification_eta_seconds: 30,
	},

	// ─────────────────────────────────────────────
	// Wave 6.1: Revenue Attribution Integrity
	// Detecta overattribution: ad platforms reportam mais receita
	// atribuída do que as transações realmente confirmam (Stripe/Shopify).
	// Quase sempre é artefato de last-click attribution — Meta/Google
	// contam toques como conversões mesmo quando a compra teria acontecido.
	// ─────────────────────────────────────────────

	revenue_attribution_mismatch: {
		remediation_steps: [
			'Reconcilie a receita total do mês somando TODOS os canais de cobrança. Stripe, boleto, PIX, MercadoPago, transferência bancária, pagamento presencial, PayPal e quaisquer outros gateways. Compare o total com o que Meta + Google estão reportando como atribuído.',
			'Se a soma de TODOS os canais bate com o atribuído pelas plataformas: a divergência era só Stripe não enxergando os outros canais. Não há overattribution. Próximo passo é puxar essa receita off-Stripe pro Vestigio (Wave 6.x: integrar MercadoPago, gateway de boleto, etc.) pra a comparação ficar honesta nos próximos ciclos.',
			'Se a soma de TODOS os canais ainda for substancialmente menor que o atribuído: aí sim é overattribution real. Rode um holdout test (pause 20-30% dos campaigns por 14 dias) e meça a queda real de receita total vs a perda projetada pela plataforma. A diferença é o lift incremental verdadeiro.',
			'Configure multi-touch attribution (data-driven no GA4 ou Triple Whale/Northbeam) e compare ROAS por modelo data-driven vs last-click. Re-tier o ad spend pelo modelo mais conservador APENAS depois da reconciliação total.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'integration_pull',
		verification_notes:
			'Vamos re-puxar Meta + Google + Stripe no próximo ciclo. O finding some quando o gap entre attributed e Stripe MRR cai abaixo de 2x (limite após o qual canais off-Stripe deixam de ser explicação plausível).',
		verification_eta_seconds: 30,
	},

	// Wave 7.11M — pixel coverage gap (measurement integrity)
	pixel_coverage_gap: {
		remediation_steps: [
			'Identifique quais páginas críticas (checkout, thank_you, cart) estão sem o snippet do pixel. Inspecione o HTML em modo anônimo procurando o <script src="/snippet/vestigio.js">.',
			'Instale o snippet no <head> dessas páginas. Se sua plataforma usa template comum (Shopify, Nuvemshop, etc), basta uma edição global no theme.',
			'Confirme que o evento page_view dispara em cada página instalada via DevTools > Network filtrando "vestigio.js".',
			'Rode um audit cycle novo: o sinal pixel_coverage_gap deve sumir e os findings de checkout abandono / conversion rate vão aparecer com dados reais.',
		],
		estimated_effort_hours: 1,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos rodar um navegador automatizado em cada página apontada como missing e verificar se o snippet do pixel está presente + dispara o evento de page_view.',
		verification_eta_seconds: 45,
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
			'Revise a copy das políticas (refund, privacidade, termos). Leitura deve reforçar confiança, não criar dúvida.',
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
			'Detecte páginas visitadas por high-intent buyers antes do abandono. Geralmente FAQ, comparação, reviews.',
			'Identifique objeção específica nessas pages e resolva direto no fluxo principal.',
			'Teste redirecionar parte do tráfego direto pro fluxo principal sem detour. Vê se conversão sobe.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra re-medir padrão de detour. Atual: {current}/{required} sessões.',
		verification_eta_seconds: null,
	},

	support_discovered_too_late_to_convert: {
		remediation_steps: [
			'Mova canal de suporte pra posição proeminente no fluxo de compra. Footer persistente ou chat visível.',
			'Proativamente ofereça chat quando buyer passa >60s no checkout sem progredir.',
			'Meça First Response Time. <5min úteis no chat reduz friction significativamente.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando tráfego pós-ajuste pra medir se support discovery subiu. Sessões: {current}/{required}.',
		verification_eta_seconds: null,
	},

	cta_visible_but_behaviorally_dead: {
		remediation_steps: [
			'CTA aparece no viewport mas ninguém clica. Revise copy, contraste, e proximity com value prop.',
			'Teste variantes (A/B) de cor, tamanho, e copy do CTA. Pequenas mudanças geram grandes swings.',
			'Garanta que CTA está acima da dobra em desktop E mobile. Mobile tende a enterrar o CTA.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir CTR do CTA ajustado. {current}/{required} sessões.',
		verification_eta_seconds: null,
	},

	purchase_hesitation_with_backtrack: {
		remediation_steps: [
			'Buyers voltam pro carrinho múltiplas vezes. Objeção tá nos dados mostrados ali (preço? frete? entrega?).',
			'Exponha TODOS custos (frete + impostos) antes do checkout. Surpresa no total é causa top de abandono.',
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
			'Identifique qual step retry mais antes do abandono. Geralmente é cartão rejeitado ou CEP sem entrega.',
			'Melhore mensagens de erro nesses steps. Explique CAUSA + PRÓXIMO PASSO.',
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
			'Primeira ação comercial em mobile (add-to-cart, inicia checkout) falha mais que desktop. Teste em iOS + Android reais.',
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
			'Step tem atividade (clicks, form fills) mas não avança. Há bloqueador técnico ou UX silencioso.',
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
			'Buyer hesita perto do botão de pagar. Trust markers não estão onde precisa.',
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
			'Buyer revisita pricing multiple times. Indicador de que value prop não tá clara.',
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
			'Buyer visita política antes de converter. Preocupação tá na mente. Endereça proativamente.',
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
			'CTA aparece mas engagement é baixo. Copy não compele ação.',
			'Use verbos específicos: "Comprar agora" > "Saiba mais". Urgência real: "Restam 3 em estoque".',
			'Teste variantes diferentes. Small copy changes geram 5-20% swings em CTR.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra re-medir CTA engagement rate. {current}/{required}.',
		verification_eta_seconds: null,
	},

	sensitive_input_abandonment: {
		remediation_steps: [
			'Buyer abandona ao ver campo sensível (CPF, cartão, endereço). Trust deficit naquele campo específico.',
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
			'Form tem >8 campos obrigatórios antes da conversão. Cada campo extra reduz completion em ~5%.',
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
			'Form retorna erro e buyer retenta múltiplas vezes. Validação não tá clara ou UX trava.',
			'Valide em real-time (inline) em vez de só no submit. Buyer sabe na hora o que tá errado.',
			'Quando submit falha, preserve TODOS os dados preenchidos. Não force retyping.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra re-medir retry rate pós-fix. {current}/{required}.',
		verification_eta_seconds: null,
	},

	surface_oscillation_before_dropoff: {
		remediation_steps: [
			'Buyer oscila entre surfaces (home ↔ produto ↔ cart) antes de abandonar. Decision paralysis.',
			'Reduza paths alternativos no fluxo comercial. One clear path from product to purchase.',
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
			'Último step (submit pagamento) retry frequente. Cartão rejeita ou anti-fraude bloqueia.',
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
			'CTA aparece depois de render completo. Scripts atrasam interatividade.',
			'Pré-renderize CTAs críticos no HTML inicial, sem depender de JS.',
			'Meça Time To Interactive especificamente pra botão de conversão. Deve ser <2s.',
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
			'Adicione exit-intent modal perguntando "o que faltou?" com campo livre. Captura objections.',
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
			'Campos sensíveis causam drop direto. Perceção de risco é mais forte que benefício percebido.',
			'Adicione trust signals CONTÍGUOS ao campo: selo SSL, explicação de uso, política de privacidade link.',
			'Teste reordenar: peça dados sensíveis DEPOIS de criar conta ou adicionar ao carrinho. Drops menos.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir drop rate pós-ajustes. {current}/{required}.',
		verification_eta_seconds: null,
	},

	first_session_milestone_stall: {
		remediation_steps: [
			'Primeira sessão empaca antes de atingir marco de valor. Reduza fricção nos primeiros 60s.',
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
			'Novos visitantes encontram trust barrier. Exponha social proof + credenciais mais proeminentemente.',
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
			'CTA aparece tarde demais na primeira sessão. Visitante sai antes de ver a oferta.',
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
			'Revise CTAs em páginas de tráfego. Muitos levam pra conteúdo ao invés de conversão.',
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
			'Ações de alto valor (compra, upgrade) não recebem exposure suficiente. Posicione em surfaces de alto tráfego.',
			'Home deve ter CTA principal apontando pra ação de maior valor comercial.',
			'Evite esconder features premium atrás de múltiplos cliques. Expõe direto com paywall contextual.',
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
			'Audite top 10 páginas de tráfego por conversion rate. Priorize fix nas de 0% CR.',
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
			'Tráfego pago encontra mais friction que orgânico. Landing pages de ads precisam ser dedicadas.',
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
			'Tráfego pago tem trust menor que orgânico. Reforce credenciais nas landings de ads.',
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
			'Conversion rate em mobile significativamente abaixo de desktop. UX mobile precisa de attention dedicada.',
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
			'Forms em mobile têm abandonment rate mais alto. Campos + teclado causam friction.',
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
			'CTA em mobile demora a ficar interativo. Scripts pesados bloqueiam main thread.',
			'Priorize TTI (Time To Interactive) em mobile. Target <3s em 4G simulado.',
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
			'Cada step do funnel tem custo de conversão. Conte os steps atuais e elimine redundantes.',
			'Consolide "step 1: adicionar endereço" + "step 2: confirmar endereço" em um único step.',
			'Teste one-page checkout vs multi-step. Pra carrinhos simples, one-page converte melhor.',
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
			'Destaque default recomendado pra reduzir carga cognitiva. "escolha mais popular" funciona bem.',
			'Limite opções. 3 planos é sweet spot pra SaaS, 2-3 variantes por produto pra e-commerce.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir oscillation pattern. {current}/{required}.',
		verification_eta_seconds: null,
	},

	checkout_entry_friction: {
		remediation_steps: [
			'Entrada no checkout já tem friction. Botão escondido, modal interrompendo, login forçado.',
			'Garanta CTA de "Finalizar compra" visível no carrinho e em todas as páginas de produto.',
			'Guest checkout como default. Opção de criar conta pós-compra.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir entry rate no checkout. {current}/{required}.',
		verification_eta_seconds: null,
	},

	trust_deficit_conversion_drag: {
		remediation_steps: [
			'Trust deficit generalizado está puxando conversion geral pra baixo. Não é fix pontual, é reforço sistêmico.',
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
			'Buyers procuram reassurance (FAQ, reviews, contato) antes de decidir. Atenda essa necessidade proativamente.',
			'Coloque FAQ relevante direto nas páginas de produto. Não force buyer a navegar pra achar.',
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
			'Trust gap específico em campos sensíveis. Perceção de risco supera trust genérico do site.',
			'Adicione microcopy explicando coleta + link pra política de privacidade próximo ao campo.',
			'Use ícones de cadeado + selo SSL CONTÍGUOS ao campo. Trust precisa ser percebido onde o risk é sentido.',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir completion rate em sensitive fields. {current}/{required}.',
		verification_eta_seconds: null,
	},

	path_length_exceeds_efficient: {
		remediation_steps: [
			'Path médio do buyer até conversão é longo demais. Cada página extra dilui intent.',
			'Identifique atalhos: produto destacado na home, CTA direto sem categoria intermediária, quick-add na categoria.',
			'Minimize pageviews necessários pra compra. Ideal <5 pageviews do ponto de entrada ao pagamento.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões pra medir path length médio pós-otimização. {current}/{required}.',
		verification_eta_seconds: null,
	},

	intent_absorber_detected: {
		remediation_steps: [
			'Alguma surface está absorvendo intent sem converter. Blog post, FAQ genérico, categoria rica.',
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
			'Intent decay muito rápido. Buyer esfria se sessão passa de X minutos sem conversão.',
			'Use urgency/scarcity real (estoque baixo, promo com timer) pra acelerar decisão.',
			'Se buyer retorna em nova sessão, re-engage com email lembrando onde parou + incentivo pequeno.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Aguardando sessões novas pra medir intent decay curve. {current}/{required}.',
		verification_eta_seconds: null,
	},

	// ─────────────────────────────────────────────
	// Wave 4.1: Cybersecurity Phase 2
	// ─────────────────────────────────────────────

	information_disclosure: {
		remediation_steps: [
			'Configure error handler genérico em produção. Logue detalhes server-side, retorne mensagem amigável ao cliente.',
			'Remova header Server com versão (Apache/nginx): use ServerTokens Prod ou server_tokens off.',
			'Audite respostas 4xx/5xx. Nenhuma deve conter stack trace, path interno, ou versão de framework.',
			'Configure framework para modo produção (DEBUG=false, RAILS_ENV=production, NODE_ENV=production).',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos requisitar URLs de erro + checar header Server em respostas pra confirmar remoção de info sensível.',
		verification_eta_seconds: 10,
	},

	script_supply_chain_risk: {
		remediation_steps: [
			'Adicione atributo integrity= (SRI hash) em todo <script> externo no checkout e páginas comerciais.',
			'Gere hash SHA-384 ou SHA-512 do script versionado: openssl dgst -sha384 -binary file | base64.',
			'Configure CSP require-sri-for pra bloquear scripts sem integrity automaticamente.',
			'Monitore CDN provider pra alertas de comprometimento. Troque hash quando versão muda.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas comerciais e verificar presença do atributo integrity em scripts externos.',
		verification_eta_seconds: 12,
	},

	auth_surface_insecure: {
		remediation_steps: [
			'Corrija campos de senha pra type="password". Nunca use type="text" pra senhas.',
			'Garanta que form action do login/signup use HTTPS (nunca HTTP).',
			'Adicione autocomplete="current-password" nos inputs de login e "new-password" nos de signup.',
			'Implemente HSTS pra garantir que mesmo links HTTP sejam redirecionados pra HTTPS antes do submit.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de login e verificar tipo do campo de senha + protocolo do form action.',
		verification_eta_seconds: 8,
	},

	// ─────────────────────────────────────────────
	// Wave 4.2: LLM Enrichment
	// ─────────────────────────────────────────────

	pricing_offer_unclear: {
		remediation_steps: [
			'Adicione comparação clara entre tiers: tabela feature-por-feature com checkmarks explícitos.',
			'Destaque um plano recomendado (badge "Mais Popular" ou "Melhor Valor") pra reduzir decision paralysis.',
			'Inclua descrição de 1 linha por tier explicando pra quem é (freelancer, startup, enterprise).',
			'Se pricing model não é determinável, simplifique. Menos opções convertem mais.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-analisar a página de pricing com LLM pra validar clareza dos tiers e presença de recomendação.',
		verification_eta_seconds: 15,
	},

	page_purpose_mismatch: {
		remediation_steps: [
			'Alinhe título e H1 com o propósito real da página. Pricing page deve conter "planos/preços".',
			'Se conteúdo migrou, reclassifique a página e atualize navegação + sitemap.',
			'Revise meta description pra refletir conteúdo atual. Desalinhamento prejudica CTR orgânico.',
			'Audite funnel analytics. Se buyers chegam esperando X e encontram Y, bounce rate sobe.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-classificar a página e comparar keywords do H1/título com o page type detectado.',
		verification_eta_seconds: 10,
	},

	structured_data_mismatch: {
		remediation_steps: [
			'Audite JSON-LD vs conteúdo visível: preço no schema deve ser idêntico ao preço na página.',
			'Use Google Rich Results Test pra validar que schema data reflete realidade.',
			'Automatize geração de JSON-LD a partir do CMS/database. Evite valores hardcoded que ficam stale.',
			'Monitore mudanças de preço/nome. Atualize schema junto quando produto muda.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos extrair JSON-LD e comparar claims (preço, nome, rating) contra conteúdo visível da página.',
		verification_eta_seconds: 12,
	},

	// ─────────────────────────────────────────────
	// Wave 4.6: Neglected Findings
	// ─────────────────────────────────────────────

	payment_handoff_dropoff: {
		remediation_steps: [
			'Monitore a taxa de retorno pós-handoff de pagamento. Identifique em qual gateway a queda é maior.',
			'Substitua redirect externo por checkout embedded (Stripe Elements, PayPal Smart Buttons) quando possível.',
			'Se o redirect for inevitável, adicione logotipo da loja + selo de segurança na página do gateway.',
			'Implemente callback/webhook para detectar sessões que nunca retornam e acione recuperação por email.',
			'Teste o fluxo em mobile e desktop. Gateways com pop-up podem bloquear no Safari/iOS.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar o checkout completo automaticamente, seguir o handoff até o gateway, e validar se a sessão retorna ao domínio da loja com confirmação.',
		verification_eta_seconds: 60,
	},

	saas_activation_gap_heuristic: {
		remediation_steps: [
			'Mapeie a primeira ação de valor (first meaningful action) e meça quantos trial users a completam.',
			'Reduza o onboarding pra no máximo 3 steps antes da primeira vitória.',
			'Elimine campos opcionais no signup. Peça apenas email e senha, complete perfil depois.',
			'Adicione empty states com CTAs claros que guiem pra primeira ação de valor.',
			'Implemente progress indicator mostrando quanto falta pra ativar o produto.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos simular signup + primeira ação no navegador automatizado e medir se o fluxo completa sem erro ou abandono.',
		verification_eta_seconds: 45,
	},

	oscillation_clustering: {
		remediation_steps: [
			'Identifique o par de páginas com maior oscilação e analise o que falta em cada uma pra resolver a dúvida.',
			'Adicione comparativo ou resumo inline na página de origem (ex: tabela de preços na página de features).',
			'Implemente breadcrumb ou progress indicator que mostre onde o usuário está no fluxo de decisão.',
			'Teste sticky CTA ou sidebar com resumo das opções pra reduzir necessidade de navegar de volta.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Vamos monitorar o par de páginas após a mudança e verificar se a taxa de oscilação caiu abaixo do threshold.',
		verification_eta_seconds: null,
	},

	network_error_weighted: {
		remediation_steps: [
			'Priorize correção por peso: payment failures (x3) > measurement failures (x2) > trust/third-party (x1).',
			'Configure retry automático com backoff exponencial pra scripts de pagamento e analytics.',
			'Implemente fallback visual quando trust badges falham (ex: texto estático ao invés de widget dinâmico).',
			'Monitore uptime dos provedores críticos com alerta sub-5-min e failover automático.',
			'Reduza dependências third-party no checkout. Inline o que puder.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos re-executar a captura de rede nas páginas comerciais e validar se o score ponderado caiu abaixo de 5.',
		verification_eta_seconds: 30,
	},

	mobile_trust_gap: {
		remediation_steps: [
			'Audite mobile vs desktop lado a lado. Liste todos os trust signals visíveis apenas no desktop.',
			'Garanta que selos de segurança, avaliações, e garantias estejam visíveis above-the-fold no mobile.',
			'Evite trust badges em carousels ou abas. No mobile eles precisam estar inline e visíveis sem scroll.',
			'Teste carregamento de widgets de review no 3G throttled. Substitua por estático se falharem.',
			'Adicione microdata de segurança visível no header mobile (SSL lock icon + texto "Compra Segura").',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos verificar mobile vs desktop automaticamente e confirmar que trust signals estão presentes e carregando dentro de 3s no mobile.',
		verification_eta_seconds: 45,
	},

	behavioral_micro_pattern_cascade: {
		remediation_steps: [
			'Não trate cada sintoma isolado. O padrão composto indica que o fluxo de decisão inteiro precisa reestruturação.',
			'Simplifique a página de decisão: reduza opções, elimine dead clicks, e centralize informação de preço + valor.',
			'Adicione reassurance progressiva ao longo do funil ao invés de concentrar no checkout.',
			'Implemente form validation inline com mensagens claras. Elimine retries por erro de UX.',
			'Monitore o cascade score após cada mudança pra validar que o padrão está se dissolvendo.',
		],
		estimated_effort_hours: 20,
		verification_strategy: 'pixel_accumulation',
		verification_notes:
			'Vamos monitorar os 5 indicadores comportamentais em conjunto e verificar se menos de 2 estão acima do threshold.',
		verification_eta_seconds: null,
	},

	// ─────────────────────────────────────────────
	// Vertical-Specific: Fashion/E-commerce
	// ─────────────────────────────────────────────

	booking_absent_or_phone_only: {
		remediation_steps: [
			'Adicione um caminho de agendamento online claro (Calendly, Acuity, SimplyBook ou o do seu sistema) com botão "Agendar" visível no topo de toda página.',
			'Mostre os horários disponíveis em tempo real; não force o cliente a pedir e esperar resposta.',
			'Mantenha telefone/WhatsApp como alternativa, nunca como único caminho.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site e verificar se existe um caminho de agendamento online (widget ou página) acessível a partir da home.',
		verification_eta_seconds: 20,
	},

	contact_friction_high: {
		remediation_steps: [
			'Coloque telefone clicável (tel:) e botão de WhatsApp fixos no topo e no rodapé de toda página.',
			'Use um botão flutuante de WhatsApp no mobile.',
			'Mostre o horário de atendimento ao lado do contato pra alinhar a expectativa de resposta.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site e verificar a presença de telefone clicável ou WhatsApp acessível a partir da home.',
		verification_eta_seconds: 15,
	},

	booking_intake_excessive: {
		remediation_steps: [
			'Reduza o formulário de agendamento ao mínimo: nome + telefone (ou horário desejado).',
			'Mova campos secundários (motivo, convênio, observações) pra depois do agendamento confirmado.',
			'Cada campo removido antes da conversão aumenta a taxa de conclusão.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o formulário de agendamento e contar os campos obrigatórios antes da conversão.',
		verification_eta_seconds: 20,
	},

	service_pricing_opaque: {
		remediation_steps: [
			'Adicione ao menos uma âncora de preço: "a partir de R$X", uma faixa, ou "primeira avaliação gratuita".',
			'Se o valor varia, explique o que define o preço e dê um ponto de partida.',
			'Um sinal de preço reduz o atrito de "quanto custa?" e qualifica o lead antes do contato.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site e verificar a presença de algum sinal de preço ou faixa de valor.',
		verification_eta_seconds: 15,
	},

	credentials_not_visible: {
		remediation_steps: [
			'Mostre o registro profissional (OAB, CRC, CREA, CRM…) e especializações no topo da home e na página "Sobre".',
			'Adicione foto, nome e formação de cada profissional responsável.',
			'Inclua selos de associações/conselhos e certificações relevantes.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site e verificar a presença de registro profissional ou credencial visível.',
		verification_eta_seconds: 15,
	},

	no_consultation_cta: {
		remediation_steps: [
			'Adicione um CTA único e claro ("Agende uma consulta", "Solicite uma proposta") visível no topo de toda página.',
			'Leve esse CTA pra um caminho curto (formulário mínimo ou WhatsApp), não pra um e-mail genérico.',
			'Repita o CTA ao final de cada página de serviço.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site e verificar a presença de um CTA claro de consulta/proposta acessível a partir da home.',
		verification_eta_seconds: 15,
	},

	team_expertise_invisible: {
		remediation_steps: [
			'Crie uma página de equipe com foto, nome, formação e experiência de cada profissional.',
			'Destaque casos ou áreas de atuação concretas por pessoa.',
			'Linke a página de equipe no menu principal.',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site e verificar a presença de uma página de equipe com profissionais identificados.',
		verification_eta_seconds: 20,
	},

	no_proof_of_result: {
		remediation_steps: [
			'Adicione depoimentos de alunos com resultado concreto e número ("faturou R$X", "passou no concurso", "perdeu X kg").',
			'Mostre antes-e-depois ou casos de sucesso reais, com nome/foto quando possível.',
			'Coloque a prova mais forte acima da dobra, antes do preço.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página de vendas e verificar a presença de prova de resultado (depoimento com número, antes-e-depois, case).',
		verification_eta_seconds: 20,
	},

	guarantee_invisible: {
		remediation_steps: [
			'Ofereça e exiba uma garantia clara (7 ou 30 dias, satisfação ou dinheiro de volta) perto do botão de compra.',
			'Explique como pedir o reembolso em uma frase simples.',
			'Use um selo de garantia visível no checkout.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página e verificar a presença de garantia/reembolso próximo ao CTA de compra.',
		verification_eta_seconds: 15,
	},

	no_payment_options: {
		remediation_steps: [
			'Mostre o parcelamento ("em até 12x de R$X") junto do preço, não só o valor cheio.',
			'Exiba os meios aceitos (cartão, Pix, boleto) antes do checkout.',
			'Destaque a parcela em vez do valor total na chamada principal.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página e verificar a presença de parcelamento ou meios de pagamento visíveis.',
		verification_eta_seconds: 15,
	},

	no_curriculum_visible: {
		remediation_steps: [
			'Liste os módulos/aulas do curso com o que o aluno aprende em cada um.',
			'Conecte cada módulo a uma transformação concreta ("ao fim do módulo X, você consegue Y").',
			'Coloque a grade antes do preço, pra justificar o valor.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página e verificar a presença do conteúdo/grade do curso.',
		verification_eta_seconds: 20,
	},

	size_guide_missing: {
		remediation_steps: [
			'Crie uma tabela de medidas com busto, cintura, quadril e comprimento para cada categoria de produto.',
			'Adicione um botão "Guia de Tamanhos" visível ao lado do seletor de tamanho na página do produto.',
			'Inclua instruções de como se medir com fita métrica dentro do modal do guia.',
			'Considere adicionar um widget de recomendação de tamanho baseado em altura e peso.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas de produto e verificar a presença de guia de tamanhos linkado próximo ao seletor de tamanho.',
		verification_eta_seconds: 20,
	},

	product_images_insufficient: {
		remediation_steps: [
			'Fotografe cada produto em no mínimo 5 ângulos: frontal, lateral, costas, detalhe, e vestido/em uso.',
			'Adicione zoom habilitado por hover ou toque em cada imagem na página do produto.',
			'Inclua pelo menos uma foto lifestyle mostrando o produto em contexto real de uso.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas de produto e contar o número de imagens por produto. Mínimo 4 para passar.',
		verification_eta_seconds: 25,
	},

	no_urgency_indicators: {
		remediation_steps: [
			'Exiba o nível de estoque quando restarem menos de 10 unidades (ex: "Últimas 3 unidades").',
			'Adicione um contador de compradores recentes (ex: "12 pessoas compraram hoje").',
			'Implemente badges de "Oferta por tempo limitado" quando houver promoções ativas.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas de produto e verificar presença de indicadores de urgência ou escassez.',
		verification_eta_seconds: 20,
	},

	cross_sell_absent: {
		remediation_steps: [
			'Adicione uma seção "Completa o Look" ou "Compre Junto" na página do produto abaixo da descrição.',
			'Configure recomendações automáticas baseadas em produtos frequentemente comprados juntos.',
			'Adicione sugestões de cross-sell também na página do carrinho antes do checkout.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto e carrinho e verificar presença de seções de produtos relacionados ou complementares.',
		verification_eta_seconds: 20,
	},

	return_policy_not_on_product: {
		remediation_steps: [
			'Adicione um resumo da política de devolução diretamente na página do produto, abaixo do botão de compra.',
			'Inclua prazo de devolução, condições aceitas, e quem paga o frete de retorno.',
			'Linke para a política completa mas mantenha os pontos essenciais inline e visíveis.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas de produto e verificar presença de informação de devolução próxima ao CTA de compra.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Vertical-Specific: SaaS
	// ─────────────────────────────────────────────

	no_free_trial_offered: {
		remediation_steps: [
			'Implemente um trial gratuito de 7-14 dias sem necessidade de cartão de crédito.',
			'Exiba o CTA de trial de forma proeminente na homepage e página de preços.',
			'Crie um fluxo de onboarding que entregue valor na primeira sessão do trial.',
			'Adicione email de follow-up automático mostrando o que o usuário pode experimentar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir homepage e pricing page e verificar presença de CTA de free trial ou freemium.',
		verification_eta_seconds: 20,
	},

	integration_ecosystem_invisible: {
		remediation_steps: [
			'Crie uma seção "Integrações" na homepage com logos das ferramentas mais populares do seu público.',
			'Adicione uma página dedicada /integrações com descrições e status de cada integração.',
			'Mencione integrações-chave na página de preços próximo aos planos que as incluem.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir homepage e pricing e verificar presença de seção de integrações com pelo menos 3 logos.',
		verification_eta_seconds: 20,
	},

	changelog_stale_or_missing: {
		remediation_steps: [
			'Crie uma página /changelog ou /atualizações com as últimas mudanças do produto.',
			'Publique pelo menos uma atualização por mês com data, título e descrição.',
			'Linke o changelog no footer e considere um badge "Atualizado recentemente" na homepage.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe página de changelog acessível e se a última entrada tem menos de 60 dias.',
		verification_eta_seconds: 20,
	},

	annual_discount_not_highlighted: {
		remediation_steps: [
			'Adicione um toggle "Mensal / Anual" na página de preços com o desconto percentual visível.',
			'Exiba a economia anual em valor absoluto (ex: "Economize R$240/ano").',
			'Pré-selecione o plano anual como default na página de preços.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página de preços e verificar se existe opção anual com desconto visível e calculado.',
		verification_eta_seconds: 20,
	},

	no_product_screenshot_visible: {
		remediation_steps: [
			'Adicione pelo menos 3 screenshots do produto em uso na homepage acima do fold.',
			'Inclua screenshots em contexto mostrando fluxos reais (não mockups genéricos).',
			'Considere adicionar um vídeo demo de 60 segundos mostrando o produto em ação.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir homepage e landing pages e verificar presença de imagens do produto (screenshots ou vídeo).',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Vertical-Specific: Food/Restaurant
	// ─────────────────────────────────────────────

	menu_requires_signup: {
		remediation_steps: [
			'Remova o gate de login/cadastro para visualização do cardápio. Permita acesso público completo.',
			'Mova o requisito de cadastro para o momento do pedido, não da navegação.',
			'Garanta que o cardápio completo seja indexável por buscadores (HTML, não apenas PDF).',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos acessar a URL do cardápio sem autenticação e verificar se o conteúdo é visível sem login.',
		verification_eta_seconds: 20,
	},

	no_food_photos: {
		remediation_steps: [
			'Fotografe profissionalmente pelo menos os 10 pratos mais vendidos.',
			'Adicione a foto ao lado de cada item no cardápio digital.',
			'Use imagens reais (não banco de imagens) com boa iluminação e apresentação fiel ao prato servido.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o cardápio e verificar se pelo menos 50% dos itens têm imagem associada.',
		verification_eta_seconds: 20,
	},

	delivery_area_unclear: {
		remediation_steps: [
			'Adicione um mapa interativo ou lista de bairros/CEPs atendidos na página principal.',
			'Permita que o cliente consulte cobertura por CEP antes de montar o pedido.',
			'Exiba a área de entrega no header ou banner do site de forma permanente.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe informação de área de cobertura visível na página principal ou cardápio.',
		verification_eta_seconds: 20,
	},

	delivery_time_not_shown: {
		remediation_steps: [
			'Exiba o tempo estimado de entrega na página do cardápio (ex: "30-45 min").',
			'Atualize o tempo estimado em tempo real com base na demanda e distância.',
			'Mostre o tempo também no carrinho antes da confirmação do pedido.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir cardápio e carrinho e verificar presença de estimativa de tempo de entrega.',
		verification_eta_seconds: 20,
	},

	allergen_info_missing: {
		remediation_steps: [
			'Adicione ícones de alérgenos (glúten, lactose, amendoim, etc.) em cada item do cardápio.',
			'Inclua uma legenda explicativa dos ícones no topo ou rodapé do cardápio.',
			'Adicione filtro por restrição alimentar para facilitar a navegação.',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o cardápio e verificar presença de informação de alérgenos ou restrições alimentares nos itens.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Vertical-Specific: Health/Beauty
	// ─────────────────────────────────────────────

	ingredients_not_listed: {
		remediation_steps: [
			'Liste a composição completa (INCI) na página de cada produto.',
			'Destaque os ingredientes-chave e seus benefícios em linguagem acessível.',
			'Adicione um accordion ou tab "Ingredientes" visível sem necessidade de scroll excessivo.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto e verificar presença de lista de ingredientes ou composição.',
		verification_eta_seconds: 20,
	},

	no_clinical_endorsement: {
		remediation_steps: [
			'Obtenha e exiba endosso dermatológico ou de profissional de saúde relevante.',
			'Publique resultados de testes clínicos ou estudos com amostra e percentuais de eficácia.',
			'Adicione selo "Dermatologicamente Testado" ou equivalente com referência ao estudo.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto e verificar presença de selos clínicos, menções a profissionais de saúde, ou resultados de testes.',
		verification_eta_seconds: 20,
	},

	usage_instructions_absent: {
		remediation_steps: [
			'Adicione instruções de uso passo-a-passo na página do produto (frequência, quantidade, modo de aplicação).',
			'Inclua dicas de quando e como usar para melhores resultados.',
			'Considere um vídeo curto demonstrando a aplicação correta do produto.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto e verificar presença de seção de modo de uso ou instruções.',
		verification_eta_seconds: 20,
	},

	subscription_not_offered: {
		remediation_steps: [
			'Implemente opção "Assine e Economize" com desconto de 10-15% na página do produto.',
			'Ofereça frequências flexíveis (mensal, bimestral, trimestral) baseadas no consumo médio.',
			'Destaque a economia acumulada e a conveniência de não precisar lembrar de recomprar.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto e verificar presença de opção de assinatura ou compra recorrente.',
		verification_eta_seconds: 20,
	},

	no_results_evidence: {
		remediation_steps: [
			'Adicione fotos antes/depois com consentimento de clientes reais.',
			'Publique resultados de testes com percentuais (ex: "89% notaram melhora em 4 semanas").',
			'Inclua reviews com fotos de clientes mostrando resultados na página do produto.',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de produto e verificar presença de evidência visual de resultados ou dados de eficácia.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Vertical-Specific: Education
	// ─────────────────────────────────────────────

	curriculum_not_visible: {
		remediation_steps: [
			'Publique a ementa completa do curso com módulos, aulas e duração de cada seção.',
			'Adicione a ementa na página de vendas do curso em formato expandível (accordion).',
			'Inclua objetivos de aprendizado claros para cada módulo.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página do curso e verificar presença de ementa ou grade curricular detalhada.',
		verification_eta_seconds: 20,
	},

	instructor_credentials_missing: {
		remediation_steps: [
			'Adicione bio completa do instrutor com formação, experiência e resultados relevantes.',
			'Inclua foto profissional e links para LinkedIn ou portfólio.',
			'Destaque conquistas específicas que comprovem autoridade no tema do curso.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página do curso e verificar presença de seção de instrutor com credenciais.',
		verification_eta_seconds: 20,
	},

	completion_certificate_absent: {
		remediation_steps: [
			'Implemente geração automática de certificado de conclusão ao finalizar o curso.',
			'Exiba um exemplo do certificado na página de vendas do curso.',
			'Mencione o certificado no hero ou benefícios da página de vendas.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página do curso e verificar menção a certificado de conclusão.',
		verification_eta_seconds: 20,
	},

	time_commitment_unclear: {
		remediation_steps: [
			'Exiba carga horária total do curso de forma proeminente na página de vendas.',
			'Adicione duração estimada por módulo/aula na ementa.',
			'Inclua sugestão de ritmo de estudo (ex: "2h por semana durante 8 semanas").',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página do curso e verificar presença de informação de carga horária ou duração.',
		verification_eta_seconds: 20,
	},

	no_sample_content: {
		remediation_steps: [
			'Libere 1-2 aulas do curso gratuitamente como preview na página de vendas.',
			'Adicione um vídeo trailer de 2-3 minutos mostrando estilo de ensino e qualidade.',
			'Permita acesso ao primeiro módulo sem cadastro para reduzir barreira de avaliação.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página do curso e verificar presença de conteúdo de amostra gratuito (vídeo ou aula aberta).',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Vertical-Specific: B2B Services
	// ─────────────────────────────────────────────

	no_case_study_with_metrics: {
		remediation_steps: [
			'Publique pelo menos 3 cases com problema, solução, e resultados mensuráveis (%, R$, tempo).',
			'Inclua logo e nome do cliente (com permissão) para credibilidade.',
			'Linke cases relevantes na homepage e nas páginas de serviço relacionadas.',
			'Formate cada case com resultado em destaque (headline) antes do contexto.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site e verificar presença de cases com métricas numéricas em páginas comerciais.',
		verification_eta_seconds: 25,
	},

	methodology_not_explained: {
		remediation_steps: [
			'Crie uma seção "Como Funciona" com 3-5 etapas visuais do seu processo.',
			'Explique cada etapa com entregáveis concretos e prazos esperados.',
			'Adicione esta seção na homepage e nas páginas de cada serviço.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir páginas de serviço e homepage e verificar presença de seção de metodologia ou processo.',
		verification_eta_seconds: 20,
	},

	enterprise_signals_missing: {
		remediation_steps: [
			'Adicione logos de clientes enterprise na homepage (com permissão).',
			'Exiba certificações relevantes (ISO, SOC2, LGPD compliance) no footer ou página de segurança.',
			'Crie uma página /seguranca ou /compliance com detalhes das suas práticas.',
			'Adicione número de clientes atendidos e volume processado como social proof.',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir homepage e footer e verificar presença de logos de clientes, certificações, ou sinais enterprise.',
		verification_eta_seconds: 20,
	},

	contact_form_excessive_fields: {
		remediation_steps: [
			'Reduza o formulário de contato para máximo 4-5 campos essenciais (nome, email, empresa, mensagem).',
			'Mova campos de qualificação (orçamento, segmento, cargo) para após o primeiro contato.',
			'Adicione opção de agendar reunião diretamente (Calendly/Cal.com) como alternativa ao formulário.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página de contato e contar o número de campos obrigatórios. Máximo 5 para passar.',
		verification_eta_seconds: 20,
	},

	response_time_not_promised: {
		remediation_steps: [
			'Adicione um compromisso de tempo de resposta no formulário (ex: "Respondemos em até 24h úteis").',
			'Configure autoresponder confirmando recebimento e informando prazo de retorno.',
			'Exiba o SLA de resposta próximo ao botão de envio do formulário.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página de contato e verificar presença de compromisso de tempo de resposta próximo ao formulário.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Cross-Domain: Static + LLM Correlation
	// ─────────────────────────────────────────────

	meta_promise_content_mismatch: {
		remediation_steps: [
			'Reescreva a meta description de cada página pra refletir exatamente o que o visitante encontra no H1 e primeiro parágrafo.',
			'Garanta que o benefício principal mencionado na meta description aparece acima da dobra na página.',
			'Revise as meta descriptions das 10 páginas com maior tráfego orgânico. Comece pelas comerciais.',
			'Configure alerta no Search Console pra monitorar taxa de rejeição por página e identificar novas divergências.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas afetadas, extrair meta description e H1/primeiro parágrafo, e comparar alinhamento semântico entre os dois.',
		verification_eta_seconds: 15,
	},

	pricing_terms_contradictory: {
		remediation_steps: [
			'Audite todas as páginas que mencionam preço. Produto, pricing, landing pages, FAQ. E unifique os valores.',
			'Centralize a tabela de preços em um componente reutilizável pra evitar divergências futuras.',
			'Remova preços hardcoded de textos livres. Referência sempre deve vir de uma fonte única.',
			'Configure teste automatizado que compara preços exibidos entre as páginas comerciais.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir todas as páginas com menção a preço e verificar consistência entre os valores encontrados.',
		verification_eta_seconds: 20,
	},

	urgency_claim_unverifiable: {
		remediation_steps: [
			'Remova toda linguagem de urgência que não tem data de expiração real ("últimas vagas" permanente, "oferta limitada" que nunca acaba).',
			'Se a oferta for genuinamente limitada, vincule a um countdown real com data de término.',
			'Substitua urgência artificial por prova social real ("127 pessoas compraram esta semana").',
			'Se usar escassez, conecte ao estoque real. "3 unidades restantes" com backend de inventário.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas e verificar se a linguagem de urgência foi removida ou vinculada a mecanismo temporal real (countdown, data de expiração).',
		verification_eta_seconds: 15,
	},

	value_prop_diluted_by_navigation: {
		remediation_steps: [
			'Escolha UMA proposta de valor principal e posicione como H1 + subtítulo acima da dobra.',
			'Mova propostas secundárias para seções abaixo da dobra, cada uma com sua CTA específica.',
			'Crie hierarquia visual clara: a proposta principal deve ter 3x o destaque das secundárias.',
			'Teste com 5 pessoas: peça pra descrever o que você faz em uma frase após 5 segundos na homepage. Se não conseguem, simplifique.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a homepage e contar H2s/propostas de valor acima do link de pricing. Passa se ≤3 propostas com hierarquia clara.',
		verification_eta_seconds: 15,
	},

	checkout_copy_creates_anxiety: {
		remediation_steps: [
			'Remova ou reescreva toda frase no checkout que usa negativa ("não garantimos", "não reembolsável").',
			'Substitua por copy positiva: "Entrega garantida em X dias" em vez de "Prazo não garantido".',
			'Adicione micro-copy de reassurance próximo a cada campo de pagamento ("Seus dados estão protegidos", "Satisfação garantida").',
			'Exiba selos de segurança + política de reembolso resumida no checkout, não apenas no footer.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o checkout e buscar padrões de linguagem ansiogênica. Passa quando nenhuma frase negativa sobre pagamento/entrega for encontrada.',
		verification_eta_seconds: 15,
	},

	faq_answers_wrong_questions: {
		remediation_steps: [
			'Adicione ao FAQ as 5 objeções de compra mais comuns: preço, reembolso, garantia, prazo, e "funciona pra mim?".',
			'Coloque as perguntas sobre compra no topo do FAQ. Antes das perguntas técnicas.',
			'Cada resposta deve eliminar a objeção e terminar com link pra CTA ("Pronto pra começar? Comece aqui").',
			'Revise o FAQ mensalmente com os tickets de suporte mais frequentes.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o FAQ e verificar presença de perguntas sobre preço, reembolso, garantia e prazo. Passa quando pelo menos 3 dessas objeções estão cobertas.',
		verification_eta_seconds: 15,
	},

	testimonials_feel_fabricated: {
		remediation_steps: [
			'Substitua depoimentos genéricos por depoimentos com resultado específico ("Aumentei 32% em 60 dias").',
			'Varie o comprimento e formato dos depoimentos. Alguns curtos, alguns longos, alguns em vídeo.',
			'Adicione foto real, nome completo e empresa/cargo ao lado de cada depoimento.',
			'Inclua pelo menos um depoimento com número concreto de resultado por seção de social proof.',
			'Se possível, vincule ao perfil LinkedIn ou review verificado (Google, G2, Trustpilot).',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas com depoimentos e avaliar diversidade de comprimento, presença de resultados concretos e identificação verificável dos autores.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Triple-Source Cross-Domain Findings
	// ─────────────────────────────────────────────

	brand_trust_cliff_at_payment: {
		remediation_steps: [
			'Mova o checkout para o mesmo domínio da loja ou use checkout embedded que mantém a URL do seu site.',
			'Se a mudança de domínio for inevitável, adicione logotipo, cores da marca e selo de segurança na página externa.',
			'Adicione copy no botão de checkout explicando para onde o comprador será levado ("Pagamento seguro via [gateway]").',
			'Garanta que o certificado SSL esteja válido e o cadeado verde visível em ambas as URLs.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos executar o fluxo de checkout automaticamente, seguir os redirects e verificar se a marca permanece visível na página de pagamento.',
		verification_eta_seconds: 45,
	},
	ad_landing_experience_disconnect: {
		remediation_steps: [
			'Revise as meta descriptions e OG tags para que reflitam exatamente o conteúdo acima da dobra.',
			'Garanta que o H1 da página contenha as mesmas palavras-chave prometidas na meta description.',
			'Crie variações de landing page para cada meta tag/campanha com mensagem consistente.',
			'Teste o preview do Google (Search Console) e redes sociais (Facebook Debugger) para confirmar alinhamento.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas e comparar keywords da meta description/OG com o H1 e conteúdo above-fold para confirmar alinhamento.',
		verification_eta_seconds: 15,
	},
	checkout_form_mobile_hostile: {
		remediation_steps: [
			'Adicione atributo autocomplete correto em cada campo (name, email, tel, address, cc-number).',
			'Use input type="email" para email, type="tel" para telefone e inputmode="numeric" para números.',
			'Reduza campos ao mínimo necessário. Elimine campos opcionais ou mova para pós-compra.',
			'Aumente o tamanho dos campos para tap target mínimo de 44px no mobile.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos reabrir o formulário de checkout e verificar presença de autocomplete, input types especializados e contagem de campos.',
		verification_eta_seconds: 30,
	},
	pricing_page_complexity_paralysis: {
		remediation_steps: [
			'Reduza para no máximo 3 planos visíveis. Oculte o 4o atrás de "ver todos os planos".',
			'Destaque um plano como "Mais Popular" ou "Recomendado" com badge visual e borda diferenciada.',
			'Simplifique a tabela de funcionalidades. Mostre apenas as 5-7 diferenças mais relevantes.',
			'Adicione um CTA claro em cada plano que indique o próximo passo imediato.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir a página de pricing e verificar se há indicação de plano recomendado e se a contagem de planos/funcionalidades está dentro do ideal.',
		verification_eta_seconds: 15,
	},
	support_promise_impossible_to_fulfill: {
		remediation_steps: [
			'Remova promessas de SLA que não pode cumprir. Substitua por expectativas realistas ("Respondemos em até 24h úteis").',
			'Instale um chat widget funcional se promete "chat ao vivo" ou "tempo real".',
			'Configure autoresponder no formulário de contato confirmando recebimento e informando prazo real.',
			'Se promete 24/7, garanta cobertura real ou substitua por horário comercial honesto.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos verificar se o chat widget carrega e responde, se promessas de SLA foram atualizadas e se o autoresponder do formulário está ativo.',
		verification_eta_seconds: 30,
	},
	trust_journey_inconsistency: {
		remediation_steps: [
			'Adicione pelo menos 2 selos de confiança (SSL, avaliações, garantia) nas páginas de checkout e produto.',
			'Replique os depoimentos/avaliações mais relevantes na página de checkout próximo ao botão de compra.',
			'Inclua garantia de satisfação ou badge de devolução visível em todas as páginas comerciais.',
			'Padronize um footer de confiança com selos e políticas em TODAS as páginas do funil.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir homepage, checkout e páginas de produto para conferir presença consistente de elementos de confiança em cada tier.',
		verification_eta_seconds: 15,
	},
	multilingual_conversion_leak: {
		remediation_steps: [
			'Garanta que o atributo lang do HTML seja consistente em todas as páginas do mesmo funil.',
			'Implemente detecção automática de idioma por sessão. Uma vez escolhido, mantenha em todo o fluxo.',
			'Traduza completamente as páginas de checkout e produto. Não misture idiomas na mesma página.',
			'Adicione seletor de idioma visível no header com flag para que o usuário controle a escolha.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos navegar pelo funil automaticamente e verificar se o lang attribute e o idioma do conteúdo se mantêm consistentes entre páginas.',
		verification_eta_seconds: 40,
	},

	// ─────────────────────────────────────────────
	// Wave 9: Subdomain Discovery Findings
	// ─────────────────────────────────────────────

	staging_environment_publicly_accessible: {
		remediation_steps: [
			'Restrinja o acesso ao subdomínio staging/dev com autenticação básica (HTTP Basic Auth) ou VPN.',
			'Configure regras de firewall ou Cloudflare Access para permitir apenas IPs internos.',
			'Remova dados reais de clientes do ambiente de staging. Use dados simulados.',
			'Adicione o subdomínio ao robots.txt com Disallow: / para evitar indexação.',
			'Configure monitoramento para alertar se o ambiente ficar público novamente.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-probar o subdomínio de staging e verificar se retorna 401/403 ou se está inacessível publicamente.',
		verification_eta_seconds: 15,
	},

	admin_panel_exposed_to_internet: {
		remediation_steps: [
			'Restrinja o acesso ao painel admin com VPN, IP whitelist ou Cloudflare Access.',
			'Implemente autenticação de dois fatores (2FA/MFA) obrigatória para todos os acessos admin.',
			'Mova o painel para um subdomínio não-adivinhável ou caminho interno não-público.',
			'Configure rate limiting agressivo (max 5 tentativas/minuto) nas rotas de login.',
			'Monitore tentativas de acesso e configure alertas para tentativas de brute force.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-probar o subdomínio admin e verificar se retorna 401/403 ou redirecionamento para VPN/login protegido.',
		verification_eta_seconds: 15,
	},

	subdomain_brand_visual_fragmentation: {
		remediation_steps: [
			'Crie um design system compartilhado (header, footer, cores, logo) entre todos os subdomínios.',
			'Implemente um header global consistente via iframe, web component ou CDN compartilhado.',
			'Garanta que navegação entre subdomínios mantém sessão e identidade visual contínua.',
			'Documente as diretrizes de marca para equipes que mantêm subdomínios diferentes.',
		],
		estimated_effort_hours: 24,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos visitar cada subdomínio ativo automaticamente e comparar presença de elementos de marca (logo, cores, header) entre as superfícies.',
		verification_eta_seconds: 60,
	},

	app_subdomain_disconnected_from_site: {
		remediation_steps: [
			'Adicione link visível "Entrar" ou "Minha Conta" no header do site principal apontando para o app.',
			'Inclua o link do app no footer de todas as páginas comerciais.',
			'Crie uma página /login ou /acesso no domínio principal que redirecione para o app.',
			'Adicione o subdomínio do app no menu mobile de forma proeminente.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir o site principal e verificar presença de link para o subdomínio do app no header, footer ou navegação.',
		verification_eta_seconds: 15,
	},

	whatsapp_channel_disconnected: {
		remediation_steps: [
			'Adicione botão de WhatsApp flutuante ou link no header/footer das páginas comerciais.',
			'Inclua CTA de WhatsApp na página de produto e na página de preços.',
			'Configure deep link direto (wa.me/numero) em vez de depender do subdomínio.',
			'Teste se o link de WhatsApp funciona em desktop e mobile.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas comerciais e verificar presença de link para WhatsApp (wa.me, whatsapp.com ou subdomínio) no conteúdo visível.',
		verification_eta_seconds: 15,
	},

	multiple_payment_subdomains_fragmenting_trust: {
		remediation_steps: [
			'Consolide o checkout no mesmo domínio usando checkout embedded do gateway (Stripe Elements, MercadoPago Bricks).',
			'Se a mudança de domínio for inevitável, adicione logotipo da loja e selo de segurança na página de pagamento.',
			'Implemente um loading state entre domínios explicando "Você está sendo direcionado para pagamento seguro".',
			'Garanta HTTPS e certificado válido no subdomínio de pagamento. Visível ao comprador.',
			'Adicione breadcrumb visual mostrando progresso (Carrinho → Dados → Pagamento → Confirmação).',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos simular o fluxo de checkout automaticamente, seguir redirects e verificar se pagamento fica no domínio principal ou se há sinais de confiança no domínio externo.',
		verification_eta_seconds: 45,
	},

	// ─────────────────────────────────────────────
	// Static + Playwright Cross-Domain Findings
	// ─────────────────────────────────────────────

	form_submit_unreachable_mobile: {
		remediation_steps: [
			'Adicione position:sticky ou position:fixed ao botão de submit em formulários com mais de 5 campos.',
			'Reduza o número de campos obrigatórios. Mova campos opcionais para depois do primeiro envio.',
			'Teste o formulário em viewport de 375px de largura e verifique se o botão fica sempre visível.',
			'Considere dividir o formulário em etapas (wizard) com botão de próximo visível em cada passo.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos abrir o formulário em viewport mobile (375×667) e verificar se o botão de submit está visível sem scroll ou fixo na tela.',
		verification_eta_seconds: 30,
	},

	trust_badges_invisible_at_checkout: {
		remediation_steps: [
			'Mova selos de confiança (SSL, gateway, garantia) para próximo ao botão de pagamento. Não no rodapé.',
			'Adicione selo de "Compra Segura" ou "Pagamento Protegido" imediatamente acima ou ao lado do formulário de cartão.',
			'Garanta que os selos estejam visíveis sem scroll na resolução mais comum do checkout (mobile e desktop).',
			'Teste com heatmap para confirmar que a área de confiança recebe atenção visual antes do clique de compra.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos abrir o checkout e verificar se elementos de confiança (selo, badge, garantia) estão visíveis acima do fold sem necessidade de scroll.',
		verification_eta_seconds: 30,
	},

	navigation_traps_commercial_flow: {
		remediation_steps: [
			'Adicione CTA de conversão (link para /pricing, /produto, ou /checkout) em todas as páginas de blog e about.',
			'Insira banner lateral ou barra inferior fixa com link comercial em páginas de conteúdo.',
			'Garanta que a navegação principal inclua link direto para página de preços ou produto em todas as páginas.',
			'Revise páginas mais acessadas via Google Analytics e priorize as que não têm CTA de conversão.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reabrir as páginas de conteúdo e verificar se existem links para URLs comerciais (/pricing, /checkout, /product).',
		verification_eta_seconds: 25,
	},

	social_proof_loads_too_late: {
		remediation_steps: [
			'Remova lazy-load dos primeiros 2-3 depoimentos. Carregue-os inline no HTML estático.',
			'Mova pelo menos um bloco de social proof para acima do fold na página principal e de produto.',
			'Se usar widget externo (Trustpilot, Google Reviews), configure server-side rendering ou cache estático.',
			'Adicione contagem de avaliações (ex: "4.8/5. 127 avaliações") como texto estático, sem dependência de JS.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se elementos de social proof estão presentes no HTML estático inicial (sem lazy-load) e acima do fold.',
		verification_eta_seconds: 20,
	},

	consent_banner_obscures_first_action: {
		remediation_steps: [
			'Configure o banner de consentimento para não sobrepor o CTA principal. Posicione-o no rodapé ou como barra fina no topo.',
			'Reduza a altura do banner de cookies para no máximo 80px em mobile.',
			'Implemente dismiss automático após interação com qualquer elemento da página (não apenas o botão "Aceitar").',
			'Teste A/B o posicionamento do banner. Bottom-bar vs overlay. E meça impacto na taxa de clique do CTA.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'browser_runtime',
		verification_notes:
			'Vamos carregar a página automaticamente e verificar se o CTA primário está clicável sem interagir com o banner de consentimento primeiro.',
		verification_eta_seconds: 30,
	},

	price_hidden_behind_interaction: {
		remediation_steps: [
			'Renderize pelo menos o preço base de cada plano no HTML estático da página de pricing (server-side).',
			'Se o preço depende de configuração, mostre um "a partir de R$ X/mês" visível sem JavaScript.',
			'Adicione schema markup de preço (PriceSpecification) para que buscadores e AI também vejam o preço.',
			'Teste a página com JavaScript desabilitado. Se nenhum preço aparece, o problema está confirmado.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos fazer request HTTP GET na página de pricing e buscar padrões de preço (R$, $, €, /mês) no HTML retornado. Sem executar JavaScript.',
		verification_eta_seconds: 15,
	},

	// ─────────────────────────────────────────────
	// Funnel Journey — Moment 1: First Impression
	// ─────────────────────────────────────────────

	hero_outcome_absent: {
		remediation_steps: [
			'Reescreva o título principal da homepage pra responder "o que o comprador ganha" em vez de "o que você faz".',
			'Adicione um subtítulo com resultado concreto (número, prazo, benefício tangível) logo abaixo do headline.',
			'Teste A/B o novo headline contra o atual e meça taxa de scroll e clique no CTA.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos buscar o HTML da homepage e verificar se o h1 ou hero section contém linguagem orientada a resultado do comprador.',
		verification_eta_seconds: 20,
	},

	cognitive_load_first_screen: {
		remediation_steps: [
			'Reduza o número de mensagens acima da dobra pra no máximo 1 proposta de valor + 1 CTA.',
			'Remova sliders, carrosséis e banners competidores da primeira tela.',
			'Priorize hierarquia visual: headline > subtítulo > CTA. Nada mais deve competir por atenção.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos analisar o HTML acima da dobra e contar quantos elementos de texto e CTAs competem por atenção no primeiro viewport.',
		verification_eta_seconds: 20,
	},

	primary_cta_delayed: {
		remediation_steps: [
			'Mova o CTA principal pra acima da dobra. O visitante deve ver a primeira ação sem rolar.',
			'Adicione um CTA fixo (sticky) no header ou bottom bar pra mobile.',
			'Reduza o conteúdo entre o hero e o primeiro botão de ação pra no máximo 2 blocos.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe um elemento de CTA (link ou botão com texto de ação) nos primeiros 600px do HTML da homepage.',
		verification_eta_seconds: 20,
	},

	specificity_deficit: {
		remediation_steps: [
			'Substitua adjetivos genéricos (melhor, inovador, líder) por números e resultados concretos.',
			'Inclua pelo menos 1 dado quantitativo no hero (ex: "usado por 2.000 empresas", "entrega em 24h").',
			'Revise todo texto comercial e substitua linguagem de fornecedor por linguagem de comprador.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos re-analisar o copy da homepage buscando presença de números concretos e ausência de adjetivos genéricos no hero.',
		verification_eta_seconds: 25,
	},

	// ─────────────────────────────────────────────
	// Funnel Journey — Moment 2: Consideration
	// ─────────────────────────────────────────────

	proof_of_work_missing: {
		remediation_steps: [
			'Publique pelo menos 3 depoimentos de clientes reais com nome, empresa e resultado mensurável.',
			'Crie uma página dedicada de cases/resultados com métricas antes e depois.',
			'Adicione logos de clientes ou "Usado por X empresas" na homepage e páginas de produto.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos crawlar a homepage e páginas comerciais buscando padrões de depoimento (nome + resultado) e logos de clientes.',
		verification_eta_seconds: 25,
	},

	navigation_dead_ends: {
		remediation_steps: [
			'Adicione CTA de retorno à jornada de compra em todas as páginas de suporte, FAQ e help.',
			'Inclua sidebar ou banner lateral com link pro produto/pricing nas páginas de conteúdo.',
			'Revise o breadcrumb e footer pra garantir que toda página tenha caminho de volta pro fluxo comercial.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se páginas de suporte e help contêm links que levam de volta a páginas comerciais (pricing, produto, checkout).',
		verification_eta_seconds: 20,
	},

	page_depth_before_conversion: {
		remediation_steps: [
			'Mapeie o caminho mais comum entre landing e checkout. Reduza pra no máximo 3 cliques.',
			'Adicione atalho direto pro checkout/pricing no hero da homepage e páginas de produto.',
			'Remova etapas intermediárias obrigatórias que não agregam valor na decisão de compra.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos navegar os links da homepage até o checkout e contar quantos cliques são necessários pra chegar na página de conversão.',
		verification_eta_seconds: 25,
	},

	feature_benefit_disconnect: {
		remediation_steps: [
			'Reescreva cada feature listada no formato "Feature → O que isso significa pra você".',
			'Adicione exemplos de uso real ou mini-cases ao lado de cada funcionalidade principal.',
			'Priorize benefícios de negócio (economia de tempo, aumento de receita) sobre especificações técnicas.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos re-analisar as páginas de features e produto buscando linguagem orientada a benefício em vez de especificação técnica.',
		verification_eta_seconds: 25,
	},

	comparison_absent: {
		remediation_steps: [
			'Crie uma página de comparação posicionando seu produto contra as 2-3 principais alternativas.',
			'Adicione tabela comparativa na página de pricing com diferenciais claros.',
			'Use linguagem de "por que somos diferentes" em vez de "por que somos melhores" pra parecer genuíno.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe página de comparação (vs, compare, alternativas) ou tabela comparativa na página de pricing.',
		verification_eta_seconds: 20,
	},

	objection_echo_chamber: {
		remediation_steps: [
			'Reescreva o FAQ com as 5-7 principais objeções de compra (preço, prazo, garantia, suporte, segurança).',
			'Posicione o FAQ perto do CTA principal ou na página de pricing. Não em página separada.',
			'Cada resposta deve desarmar a objeção e terminar com reforço de confiança (dado, garantia, depoimento).',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos analisar o conteúdo do FAQ buscando linguagem de objeção de compra (preço, reembolso, garantia) vs perguntas técnicas.',
		verification_eta_seconds: 20,
	},

	social_channels_decorative: {
		remediation_steps: [
			'Remova links pra redes sociais inativas ou com menos de 1 post nos últimos 30 dias.',
			'Se manter os links, garanta que os perfis tenham conteúdo recente e profissional.',
			'Substitua links decorativos por prova social real (número de seguidores, avaliações, menções).',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se os links de redes sociais no footer e header apontam pra perfis com conteúdo recente.',
		verification_eta_seconds: 25,
	},

	// ─────────────────────────────────────────────
	// Funnel Journey — Moment 3: Decision
	// ─────────────────────────────────────────────

	pricing_without_context: {
		remediation_steps: [
			'Adicione contexto de ROI ao lado do preço (ex: "equivale a R$ X por lead" ou "economia de Y horas/mês").',
			'Inclua comparação de valor: o que o comprador gasta hoje vs o que gasta com seu produto.',
			'Posicione depoimento de cliente com resultado mensurável perto da tabela de preços.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar a página de pricing buscando linguagem de ROI, economia ou valor comparativo próximo aos preços.',
		verification_eta_seconds: 20,
	},

	checkout_identity_break: {
		remediation_steps: [
			'Aplique logo, cores e tipografia da marca na página de checkout/pagamento.',
			'Se usa checkout externo (Stripe, PayPal), personalize com sua marca ou use checkout embedded.',
			'Adicione barra de progresso com identidade visual consistente no fluxo de pagamento.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos comparar os elementos visuais da homepage com os do checkout pra verificar continuidade de marca.',
		verification_eta_seconds: 25,
	},

	payment_options_invisible: {
		remediation_steps: [
			'Mostre os logos dos meios de pagamento aceitos na página de pricing e no footer.',
			'Adicione ícones de bandeiras de cartão, Pix, boleto (se aplicável) perto do botão de compra.',
			'Mencione opções de parcelamento antes do checkout. Não espere o comprador descobrir sozinho.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existem imagens ou texto de meios de pagamento visíveis nas páginas de pricing e produto.',
		verification_eta_seconds: 20,
	},

	guarantee_invisible_at_decision: {
		remediation_steps: [
			'Mova a menção à garantia pra perto do botão de compra na página de pricing e checkout.',
			'Crie badge visual de "Garantia de X dias" e posicione próximo ao CTA principal.',
			'Repita a garantia em pelo menos 3 pontos do funil: produto, pricing e checkout.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe menção a garantia ou reembolso nas páginas de pricing e checkout, próximo aos CTAs.',
		verification_eta_seconds: 20,
	},

	urgency_mechanics_absent: {
		remediation_steps: [
			'Implemente pelo menos 1 mecanismo legítimo de urgência (vagas limitadas, preço por tempo, bônus temporário).',
			'Evite urgência falsa (contadores permanentes). Use mecanismos verificáveis e limitados no tempo.',
			'Comunique escassez real quando existir: "restam X vagas" ou "oferta válida até DD/MM".',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe linguagem temporal ou de escassez nas páginas de pricing e produto.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Funnel Journey — Moment 4: Post-purchase
	// ─────────────────────────────────────────────

	first_value_path_unclear: {
		remediation_steps: [
			'Crie um onboarding com 3 passos claros que leve o novo usuário ao primeiro resultado em menos de 5 minutos.',
			'Envie email pós-compra com guia visual do "primeiro resultado". Não apenas confirmação de pagamento.',
			'Adicione checklist de progresso no dashboard mostrando o caminho até o primeiro valor.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe conteúdo de onboarding ou guia de primeiro uso nas páginas pós-login e emails transacionais.',
		verification_eta_seconds: 25,
	},

	support_response_expectation_gap: {
		remediation_steps: [
			'Publique SLA de resposta na página de suporte (ex: "respondemos em até 4 horas úteis").',
			'Adicione estimativa de tempo de resposta no formulário de contato e no chat.',
			'Se não consegue prometer resposta rápida, ofereça base de conhecimento ou FAQ como alternativa imediata.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se a página de suporte/contato contém menção a tempo de resposta ou SLA.',
		verification_eta_seconds: 20,
	},

	billing_transparency_absent: {
		remediation_steps: [
			'Crie página dedicada explicando ciclo de cobrança, como cancelar e o que acontece com os dados.',
			'Adicione link pra essa página no footer e no checkout, próximo ao botão de pagamento.',
			'Inclua informação de cancelamento no email de boas-vindas e na área do cliente.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe página explicando billing, cancelamento e retenção de dados, linkada no footer e checkout.',
		verification_eta_seconds: 20,
	},

	// ─────────────────────────────────────────────
	// Funnel Journey — Moment 5: Expansion
	// ─────────────────────────────────────────────

	upgrade_value_gap: {
		remediation_steps: [
			'Reescreva a comparação de planos mostrando o valor de negócio de cada feature premium (não apenas o nome).',
			'Adicione calculadora de ROI ou exemplo de uso real pra justificar o upgrade.',
			'Mostre depoimento de cliente que fez upgrade e o resultado que obteve.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se a página de pricing/planos contém linguagem de valor de negócio nas features dos planos superiores.',
		verification_eta_seconds: 20,
	},

	referral_path_nonexistent: {
		remediation_steps: [
			'Implemente programa simples de indicação com link compartilhável e benefício claro pros dois lados.',
			'Adicione botão "Indique e ganhe" na área do cliente e no email pós-compra.',
			'Ofereça incentivo relevante (desconto, crédito, feature extra) que motive a indicação.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existe página ou link de referral/indicação acessível na área logada ou nas páginas do site.',
		verification_eta_seconds: 20,
	},

	success_story_feedback_loop_broken: {
		remediation_steps: [
			'Crie processo automático pra coletar depoimentos após marcos de sucesso do cliente (ex: 30 dias, primeiro resultado).',
			'Publique os depoimentos coletados nas páginas comerciais, pricing e homepage.',
			'Integre reviews de Google, Trustpilot ou Reclame Aqui diretamente nas páginas de produto.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos verificar se existem depoimentos recentes com nome e resultado nas páginas comerciais principais.',
		verification_eta_seconds: 25,
	},

	// ─────────────────────────────────────────────
	// Funnel Journey — Cross-journey
	// ─────────────────────────────────────────────

	tone_shift_across_journey: {
		remediation_steps: [
			'Documente tom de voz da marca com exemplos de "sim" e "não" pra cada tipo de página.',
			'Revise homepage, pricing, checkout e suporte garantindo consistência de tom e vocabulário.',
			'Use o mesmo nível de formalidade e personalidade em todas as páginas comerciais.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos re-analisar o tom e vocabulário das páginas principais buscando inconsistências de voz entre elas.',
		verification_eta_seconds: 30,
	},

	mobile_journey_friction_compound: {
		remediation_steps: [
			'Audite o funil completo no celular: homepage → produto → pricing → checkout. Anote cada ponto de fricção.',
			'Corrija botões pequenos demais, formulários que não cabem na tela e elementos que travam o scroll.',
			'Priorize mobile-first: se funciona bem no celular, funciona em tudo.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos re-analisar a jornada mobile completa buscando fricções acumulativas que impactam a experiência de compra.',
		verification_eta_seconds: 30,
	},

	trust_gradient_inverted: {
		remediation_steps: [
			'Mapeie onde estão seus sinais de confiança (selos, garantias, depoimentos) e onde estão ausentes.',
			'Mova sinais de confiança pra perto dos pontos de decisão: pricing, checkout e formulários de pagamento.',
			'Reduza sinais de confiança redundantes na homepage e redistribua pras páginas de conversão.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'Vamos comparar a densidade de sinais de confiança entre homepage e páginas de decisão (pricing, checkout).',
		verification_eta_seconds: 30,
	},

	// ── Funnel integrity (User Journey Intelligence Layer) ──

	funnel_dead_end_page: {
		remediation_steps: [
			'Identifique a página comercial sem CTA para o próximo estágio do funil.',
			'Adicione um botão ou link CTA claro direcionando ao próximo passo (ex: "Ver Preços", "Começar Agora").',
			'Posicione o CTA acima da dobra ou em local de alta visibilidade.',
			'Verifique que o texto do CTA comunica o valor do próximo passo, não apenas a ação.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'heuristic_recompute',
		verification_notes: 'Vamos re-analisar os links da página para confirmar que um CTA para o próximo estágio do funil foi adicionado.',
		verification_eta_seconds: 30,
	},

	// ─────────────────────────────────────────────
	// Wave 13/14 — Discoverability pack decision keys
	// (Brand Echo + AI Visibility)
	// ─────────────────────────────────────────────

	discoverability_critically_weak: {
		remediation_steps: [
			'Audite quais crawlers de IA estão bloqueados no /robots.txt e libere GPTBot, ClaudeBot, PerplexityBot, Google-Extended.',
			'Publique /llms.txt na raiz com um resumo de uma página do que o produto faz e links pra pricing + docs.',
			'Adicione JSON-LD (Organization na home + Product/Offer no /pricing + FAQPage onde houver Q&A). IAs preferem schema-rico.',
			'Reivindique perfis em diretórios da sua categoria (G2/Capterra pra SaaS, listicles independentes pra ecommerce).',
			'Construa páginas "<sua marca> vs <concorrente top>" no seu próprio domínio antes que concorrentes ownem essa narrativa.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo (DDG SERP + robots.txt + JSON-LD parse) e confirmar que AI Visibility Score subiu acima de 60.',
		verification_eta_seconds: 90,
	},
	discoverability_gaps_significant: {
		remediation_steps: [
			'Comece pelos quick-wins: /llms.txt + Product schema no /pricing (30 minutos cada).',
			'Reivindique listings em terceiros (G2 / Capterra / Product Hunt). IAs citam mais marcas que aparecem em fontes terceiras.',
			'Resolva o ponto mais visível: se a marca não aparece na busca branded, fix título + canonical + schema da home.',
			'Publique uma página "best <categoria>" no seu domínio mirando queries de comparação que você não cobre hoje.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo em 30-60 dias e medir o lift no AI Visibility Score (meta: +10 pontos).',
		verification_eta_seconds: 90,
	},
	discoverability_improvable: {
		remediation_steps: [
			'Core de discoverability já está OK. Refine pra busca por IA pra compor visibilidade.',
			'Considere /llms.txt + /pricing.md se ainda não tiver, pra destravar AI agent parsing.',
			'Audite schema markup: adicione FAQPage onde houver Q&A relevante, HowTo nos docs.',
			'Monitore o AI Visibility Score trimestralmente e investigue qualquer queda.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo trimestralmente pra acompanhar trajetória do AI Visibility Score.',
		verification_eta_seconds: 90,
	},
	discoverability_adequate: {
		remediation_steps: [
			'Discoverability saudável. Continue alimentando conteúdo fresco + estrutura.',
			'Agende recon externo trimestral pra pegar regressões cedo (perda de citação, schema removido).',
			'Mantenha presença em terceiros: responda reviews novas, atualize listings, monitore mentions.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo pra confirmar que sua visibilidade em IA continua sólida.',
		verification_eta_seconds: 90,
	},

	// ─────────────────────────────────────────────
	// Wave 12/13 — Brand Integrity pack decision keys
	// ─────────────────────────────────────────────

	brand_integrity_critical: {
		remediation_steps: [
			'Resolva reclamações públicas pendentes em Trustpilot / Reclame Aqui. Comprador BR/EU verifica antes de comprar.',
			'Configure alerta de review nova e mire taxa de resposta sub-48h acima de 70%.',
			'Conteste páginas de concorrente rodando ads pagos no seu trademark via Google Ads Trademark Complaints.',
			'Abra UDRP ou compre domínios lookalike capturando tráfego branded.',
			'Submeta takedown requests pra sites mimicando a marca (Google Safe Browsing + Microsoft Defender).',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo (Trustpilot + Reclame Aqui + brand monitoring) e confirmar resposta a reviews + reputation labels melhoraram.',
		verification_eta_seconds: 90,
	},
	brand_integrity_elevated: {
		remediation_steps: [
			'Responda reviews negativas pendentes em Trustpilot/RA com acknowledgment empático + próximo passo concreto.',
			'Negocie deals diretos com top afiliados ganhando comissão no seu tráfego branded. Margem melhor que rede.',
			'Publique press kit + about page que owna brand authority nos SERPs.',
			'Monitore lookalike domains semanalmente; faça takedown nos confirmados.',
		],
		estimated_effort_hours: 10,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo em 60 dias pra confirmar que sinais de reputação + SERP melhoraram.',
		verification_eta_seconds: 90,
	},
	brand_integrity_weak: {
		remediation_steps: [
			'Mantenha cadência de resposta em plataformas de review (Trustpilot, G2, Reclame Aqui).',
			'Adicione varredura mensal de brand monitoring (DDG search "<marca>" + queries de domínios lookalike).',
			'Atualize press kit + about page com fatos recentes pra Wikipedia editors usarem como fonte.',
		],
		estimated_effort_hours: 5,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo mensalmente pra detectar novas ameaças de lookalike ou degradação de reputação.',
		verification_eta_seconds: 90,
	},
	brand_integrity_strong: {
		remediation_steps: [
			'Integridade da marca está forte. Continue monitorando plataformas de review e lookalike domains.',
			'Mantenha cadência de resposta sub-48h pra qualquer review nova.',
			'Agende recon externo trimestral pra pegar regressões.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-rodar o recon externo trimestral pra confirmar que integridade da marca continua sólida.',
		verification_eta_seconds: 90,
	},

	// ─────────────────────────────────────────────
	// Wave 12/13 — High-impact inference-level entries
	// (used by FindingProjection lookups; complement the
	// pack-level decision entries above)
	// ─────────────────────────────────────────────

	ai_bots_blocked: {
		remediation_steps: [
			'Abra o robots.txt na raiz do site (ex: https://seudominio.com/robots.txt).',
			'Remova qualquer Disallow: / aplicado aos User-agents GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, Bingbot, Applebot-Extended.',
			'Se houver bloqueio wildcard ("User-agent: * → Disallow: /"), adicione stanzas explícitas permissivas pra cada bot de IA.',
			'Confirme deploy + teste cada bot bloqueado num validador online de robots.txt.',
		],
		estimated_effort_hours: 1,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos re-buscar /robots.txt e parsear pra confirmar que cada AI crawler tem acesso.',
		verification_eta_seconds: 10,
	},
	no_llms_txt: {
		remediation_steps: [
			'Crie /llms.txt na raiz do site com markdown: linha 1 = "# <Nome do Produto>", linhas seguintes = resumo de 1-2 parágrafos do que faz + pra quem é.',
			'Inclua links pra páginas chave: /pricing, /docs, /about, /contact.',
			'Mantenha o arquivo abaixo de 2KB pra agentes parsearem rápido.',
			'Spec completo: https://llmstxt.org',
		],
		estimated_effort_hours: 1,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos buscar /llms.txt e confirmar que tem conteúdo substantivo (>100 chars).',
		verification_eta_seconds: 10,
	},
	no_machine_readable_pricing: {
		remediation_steps: [
			'Crie /pricing.md na raiz refletindo seus planos.',
			'Pra cada plano: nome, preço mensal + anual, limites principais (assentos, requests, etc), e bullet list do que está incluso.',
			'Adicione data de "last updated" no topo do arquivo.',
			'Mantenha sincronizado quando alterar pricing público.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos buscar /pricing.md (ou /pricing.txt) e confirmar que tem conteúdo substantivo parseável.',
		verification_eta_seconds: 10,
	},
	schema_markup_missing_for_product: {
		remediation_steps: [
			'Adicione JSON-LD do tipo Product (ou SoftwareApplication pra SaaS) na /pricing como primeira prioridade.',
			'Inclua nested Offer com price + priceCurrency + availability.',
			'Adicione Organization schema na homepage com logo + sameAs (perfis sociais).',
			'Valide com Google Rich Results Test antes de promover.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos reanalisar o JSON-LD da homepage + /pricing pra confirmar que Product/Offer schemas estão presentes.',
		verification_eta_seconds: 15,
	},
	branded_serp_invisible: {
		remediation_steps: [
			'Confirme que o <title> da homepage começa com o nome da marca.',
			'Adicione H1 visível com o nome da marca verbatim.',
			'Configure canonical apontando pra raiz do domínio na home.',
			'Submeta o domínio ao Google Search Console e force re-indexação.',
			'Adicione Organization schema com sameAs apontando pra todos os perfis sociais.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'http_static',
		verification_notes:
			'Vamos refazer a query DDG pelo nome da marca e confirmar que seu domínio aparece no top 3.',
		verification_eta_seconds: 30,
	},
	trustpilot_complaint_cluster: {
		remediation_steps: [
			'Liste todas reviews 1-2★ sem resposta no painel do Trustpilot.',
			'Responda cada uma em até 48h com acknowledgment + próximo passo concreto.',
			'Pra reviews antigas (>3 meses), responda mesmo assim. Credibilidade ainda volta.',
			'Configure alerta de notificação pra qualquer review nova.',
			'Documente padrões nas reclamações e ajuste produto/UX pra reduzir reincidência.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos reabrir seu perfil Trustpilot e confirmar que reviews negativas têm resposta do owner.',
		verification_eta_seconds: 60,
	},
	reclame_aqui_reputation_critical: {
		remediation_steps: [
			'Acesse o painel da empresa no Reclame Aqui e liste reclamações pendentes.',
			'Resolva cada reclamação publicamente. Marque como Resolvido após acordo com cliente.',
			'Configure tempo de resposta sub-5 dias úteis pra novas reclamações.',
			'Trabalhe pra subir o "Índice de Solução" acima de 7/10 em 90 dias.',
			'Comprador BR confere RA antes de pagar. Esse é um dos sinais de confiança mais críticos pro mercado BR.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-buscar seu perfil no Reclame Aqui via SERP e confirmar que reputation label saiu de Ruim/Não Recomendada.',
		verification_eta_seconds: 60,
	},
	competitor_brand_hijack_serp: {
		remediation_steps: [
			'Liste os domínios de concorrente que rankeiam acima do seu no SERP do nome da marca.',
			'Pra concorrentes rodando Google Ads no seu trademark: abra Google Ads Trademark Complaint.',
			'Pra páginas de review/afiliado enganosas: notifique via DMCA ou contato direto.',
			'Reforce sinais de autoridade: Wikipedia article, Organization schema, press releases recentes.',
			'Publique página comparativa "marca vs concorrente" no seu domínio pra ownar a narrativa.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-buscar o nome da marca via DDG e confirmar que seu domínio voltou ao top 3.',
		verification_eta_seconds: 30,
	},
	category_intent_invisible: {
		remediation_steps: [
			'Publique listicle "best <categoria> [ano]" no seu domínio cobrindo 5-7 ferramentas (inclusive a sua, justa).',
			'Mire keywords de alternativa: "<categoria> alternatives", "best <categoria> for <use case>".',
			'Faça outreach pra 3-5 autores independentes de listicles "best of" oferecendo inclusão.',
			'Considere ads pagos no curto prazo enquanto SEO orgânico amadurece.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos refazer a query SERP da categoria via DDG e confirmar que seu domínio aparece no top 10.',
		verification_eta_seconds: 30,
	},
	g2_listing_void: {
		remediation_steps: [
			'Acesse g2.com/sellers/contact e reivindique seu perfil de produto (grátis).',
			'Adicione descrição completa, 5+ screenshots, integrações listadas, e categorias relevantes.',
			'Convide 10-15 clientes felizes a deixar review honesto nos primeiros 30 dias.',
			'Configure alerta de review nova e responda dentro de 48h.',
			'Meta: chegar a 50+ reviews em 90 dias. IAs preferem marcas com volume de social proof verificado.',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-tentar a URL G2 do seu produto e confirmar que tem perfil ativo com reviews.',
		verification_eta_seconds: 30,
	},
	capterra_listing_void: {
		remediation_steps: [
			'Reivindique perfis em Capterra + GetApp + SoftwareAdvice (todos da Gartner, um único onboarding).',
			'Adicione descrição, features, integrations, e screenshots.',
			'Configure cadência de coleta de reviews mensal com clientes ativos.',
			'Submeta a categorias relevantes. Gartner curated, leva 1-2 semanas pra aprovar.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-tentar a busca Capterra pela sua marca e confirmar perfil listado.',
		verification_eta_seconds: 30,
	},
	wikipedia_article_thin_or_outdated: {
		remediation_steps: [
			'Liste fontes independentes existentes sobre a marca: imprensa, blogs editoriais, papers, awards.',
			'Recrute editores Wikipedia independentes (NÃO escreva você mesmo. Viola NPOV).',
			'Forneça material fonte: press kit + factsheet com datas, equipe, milestones, customer logos.',
			'Edição incrementa autoridade da marca em respostas de IA. Wikipedia é ~7.8% das citações ChatGPT.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'external_scan',
		verification_notes:
			'Vamos re-checar o artigo Wikipedia da marca e confirmar que extract length > 800 chars e última edição < 18 meses.',
		verification_eta_seconds: 30,
	},
	// ── Wave 23.1 — email_deliverability ──
	dmarc_record_absent: {
		remediation_steps: [
			'Publique um registro TXT em `_dmarc.<seu-dominio>` começando com `v=DMARC1; p=none; rua=mailto:dmarc@<seu-dominio>` (modo monitoramento. Não bloqueia nada ainda, mas coleta relatórios).',
			'Configure uma caixa que receba os relatórios `rua=` (Postmark DMARC, EasyDMARC, dmarcian. Todos têm tier free).',
			'Após 2-4 semanas de relatórios, identifique todos os ESPs legítimos e suba pra `p=quarantine; pct=10`, crescendo `pct` semana a semana.',
			'Quando confiante, mude pra `p=reject`. Receivers passam a bloquear emails se passando pelo seu domínio.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'dns_recheck',
		verification_notes:
			'Re-consultamos `_dmarc.<seu-dominio>` via DNS TXT e confirmamos presença de um registro `v=DMARC1`.',
		verification_eta_seconds: 8,
	},
	dmarc_policy_weak: {
		remediation_steps: [
			'Confirme que você já recebe relatórios `rua=` há pelo menos 2 semanas. Sem dados é arriscado subir política.',
			'Audite os relatórios pra identificar fontes legítimas (Workspace, M365, Mailgun, SendGrid, etc.) que ainda não passam por SPF+DKIM alinhados.',
			'Configure SPF e DKIM em cada ESP legítimo até 100% dos volumes legítimos alinharem.',
			'Suba pra `p=quarantine; pct=10` e cresça `pct` semanal (10→25→50→100) monitorando relatórios.',
			'Mude pra `p=reject` quando ≥4 semanas em `quarantine; pct=100` sem regressão.',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'dns_recheck',
		verification_notes:
			'Re-consultamos `_dmarc.<seu-dominio>` e confirmamos `p=reject` (ou pelo menos `p=quarantine; pct=100`).',
		verification_eta_seconds: 8,
	},
	spf_record_absent: {
		remediation_steps: [
			'Identifique todos os ESPs que enviam email pelo seu domínio (Workspace, M365, Mailgun, SendGrid, transactional do app).',
			'Construa o registro `v=spf1` incluindo cada provedor: ex. `v=spf1 include:_spf.google.com include:spf.protection.outlook.com -all`.',
			'Publique como TXT no apex (sem subdomínio). Mantenha apenas UM registro SPF. Múltiplos invalidam.',
			'Termine com `-all` (hardfail) ou `~all` (softfail). Nunca `+all`.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'dns_recheck',
		verification_notes:
			'Re-consultamos TXT do apex `<seu-dominio>` e confirmamos um registro `v=spf1` válido.',
		verification_eta_seconds: 6,
	},
	spf_includes_too_broad: {
		remediation_steps: [
			'Se a terminação está em `+all`: troque imediatamente. `+all` é open relay efetivo. Use `-all` ou `~all` após validar ESPs.',
			'Se include_count > 10: liste cada `include:` e identifique includes redundantes (ex. dois CRMs cobrindo o mesmo caso de uso).',
			'Consolide envios: ESPs marginais podem mover pra um subdomínio dedicado (`mail.<dominio>`) com SPF próprio.',
			'Use SPF flattening (EasyDMARC, spf-flatten, dmarcian) pra trazer includes pra dentro do registro. Recalcula a cada mês quando ESPs mudam IPs.',
		],
		estimated_effort_hours: 3,
		verification_strategy: 'dns_recheck',
		verification_notes:
			'Re-consultamos TXT do apex e confirmamos `include_count` ≤ 10 e terminação `-all` ou `~all`.',
		verification_eta_seconds: 6,
	},
	dkim_selector_missing: {
		remediation_steps: [
			'Identifique o(s) ESP(s) que envia(m) email transacional pelo seu domínio.',
			'Para cada ESP, ative DKIM no console (Workspace → Apps → Workspace → Gmail → Authenticate email; SendGrid → Settings → Sender Authentication; etc).',
			'Cada ESP gera 1-2 registros TXT com formato `<selector>._domainkey.<seu-dominio>` → `v=DKIM1; k=rsa; p=<chave-publica>`.',
			'Publique todos os registros no DNS e aguarde a propagação (até 24h).',
			'Volte ao console do ESP e clique em "Verify DKIM". Eles confirmam a chave e habilitam a assinatura.',
		],
		estimated_effort_hours: 2,
		verification_strategy: 'dns_recheck',
		verification_notes:
			'Re-probemos os selectors comuns (default, google, k1, selector1, etc) em `<selector>._domainkey.<seu-dominio>` e confirmamos pelo menos um retornando `v=DKIM1`.',
		verification_eta_seconds: 12,
	},
	bimi_unconfigured: {
		remediation_steps: [
			'Pré-requisito obrigatório: DMARC com `p=quarantine` ou `p=reject` (NÃO funciona com `p=none`).',
			'Prepare seu logo em SVG no formato BIMI (SVG Tiny 1.2, square viewBox, ≤32KB). Use o validador da bimigroup.org pra confirmar.',
			'Publique o SVG em uma URL HTTPS pública (ex. `https://<seu-dominio>/bimi-logo.svg`).',
			'Opcional (necessário pra Gmail mostrar logo): adquira um VMC (Verified Mark Certificate) via Entrust ou DigiCert. ~$1k/ano, requer marca registrada.',
			'Publique TXT em `default._bimi.<seu-dominio>` com `v=BIMI1; l=<url-do-svg>; a=<url-do-vmc>` (omita `a=` se não tiver VMC).',
		],
		estimated_effort_hours: 4,
		verification_strategy: 'dns_recheck',
		verification_notes:
			'Re-consultamos `default._bimi.<seu-dominio>` via DNS TXT e confirmamos um registro `v=BIMI1` com `l=` apontando pra um SVG público.',
		verification_eta_seconds: 8,
	},
	// ── Wave 24 — competitive_lens ──
	copy_mirror_detected: {
		remediation_steps: [
			'Liste no detalhe do finding as frases compartilhadas com cada competidor. São suas, deles, ou commodity de categoria?',
			'Se 1 competidor copia: documente caso de uso de defesa (proof, case study, depoimento específico) que só você pode mostrar.',
			'Se 2-3 competidores convergem: substitua a hero por um pilar único. Um benefício, um caso, ou uma promessa de prazo que nenhum dos outros entrega.',
			'Se 4+: o vocabulário virou commodity. Reescreva o ângulo principal apoiado em diferencial concreto de produto (não promessa de marketing).',
			'A/B teste o novo ângulo por 2-4 semanas comparando conversão de homepage / signup.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'No próximo cycle, re-comparamos as frases de hero / heading / CTA dos competidores ativos com as suas pra confirmar que o overlap caiu.',
		verification_eta_seconds: 60,
	},
	trust_posture_lag: {
		remediation_steps: [
			'Veja o sub-eixo mais penalizado (security headers, DMARC, SPF, HSTS) no detalhe do finding. Atacar primeiro normalmente fecha 60-70% do gap.',
			'Security headers: configure HSTS + CSP + X-Frame-Options + X-Content-Type-Options + Referrer-Policy + Permissions-Policy no servidor / CDN. Cada um é 1-2 linhas de config.',
			'DMARC ausente / fraco: siga o caminho `p=none` + `rua` → `p=quarantine; pct` crescente → `p=reject` (ver finding email_deliverability se existente).',
			'SPF ausente: publique `v=spf1 include:<seu-ESP> -all` no apex.',
			'HSTS: header `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` (preload requer submit em hstspreload.org).',
		],
		estimated_effort_hours: 6,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'No próximo cycle, re-medimos seu composite trust score (4 sub-eixos) e re-calculamos o delta vs a mediana do peer set.',
		verification_eta_seconds: 60,
	},
	// ── Wave 25 — competitive_lens offensive radar ──
	brand_serp_encroachment: {
		remediation_steps: [
			'Audite quem está no top-5 e classifique cada concorrente: (a) competidor direto, (b) afiliado seu, (c) marketplace listando você, (d) site editorial com review/comparativo.',
			'Pra (a): produza páginas próprias que ranqueiem pelas top-related queries da sua marca ("vs", "preço", "alternativas a", "como funciona"). Defesa de marca via conteúdo.',
			'Pra (b/c): negocie acordo de cláusula de marca registrada (eles param de bidding em SEO/Ads na sua brand, você dá comissão extra ou exclusividade).',
			'Pra (d): contato proativo com o site editorial pra atualizar dados / corrigir comparativos desatualizados. Reviews que aparecem em busca de marca movem agulha.',
			'Cadastre sua marca no Google Trademark Complaint pra bloquear ads pagos usando seu nome (efeito imediato em Ads, não em SEO).',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'No próximo cycle, re-rodamos a busca pela sua marca e re-medimos quantos concorrentes ocupam o top-5 orgânico.',
		verification_eta_seconds: 60,
	},
	serp_overlap_detected: {
		remediation_steps: [
			'Abra a Lente Competitiva e revise os candidatos "Auto-descobertos". Pinar os que importam (3-5) ativa monitoramento de copy mirror + trust posture comparativo.',
			'Pros pinados que ranqueiem ACIMA de você em queries de alta intenção: produza landing pages dedicadas pra essas queries específicas, com diferencial concreto na hero.',
			'Pros pinados que ranqueiem ABAIXO: monitore. Se subirem nos próximos ciclos, você vê o drift e age antes da perda de posição se materializar.',
			'Pra categorias muito saturadas (5+ overlaps): pare de competir em queries genéricas. Mude pro ângulo "qualidade de prospect". Ranqueie em long-tail específico de seu ICP em vez de top-of-funnel.',
		],
		estimated_effort_hours: 8,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'No próximo cycle, re-rodamos as buscas de categoria e re-medimos quantos concorrentes ocupam ≥2 SERPs com você.',
		verification_eta_seconds: 60,
	},
	// ── Wave 27 — competitive_lens customer voice ──
	customer_voice_delta: {
		remediation_steps: [
			'Abra sua conta empresa no Reclame Aqui e baixe lista de reclamações abertas dos últimos 90 dias.',
			'Classifique cada uma por tópico (suporte, prazo, produto, cobrança, atendimento). 20% dos tópicos costumam cobrir 80% do volume.',
			'Atue nos top 3 tópicos: para cada reclamação aberta, responda publicamente + resolva o caso no canal interno + atualize status no RA.',
			'Para o tópico mais frequente, audite o processo upstream (suporte → ticket interno, prazo → operação logística, produto → quality control). Bug operacional precisa ser fixado, não só patched.',
			'Configure alerta interno: toda reclamação RA nova → notificação no Slack/email com SLA de resposta de 24h. Índice de Solução depende de % de respondidas.',
			'Re-meça no próximo audit cycle. RA recalcula reputação em 30 dias rolling, então mudanças aparecem rápido.',
		],
		estimated_effort_hours: 16,
		verification_strategy: 'external_scan',
		verification_notes:
			'No próximo audit cycle, re-rodamos o Reclame Aqui scrape (você + peers) e recomputamos a reputação + índice de solução pra confirmar que o delta diminuiu.',
		verification_eta_seconds: 120,
	},
	// ── Wave 26 — competitive_lens surface delta ──
	surface_gap_detected: {
		remediation_steps: [
			'Abra o detalhe do finding e leia as categorias listadas. Cada uma vem com (a) quantos peers mostram, (b) onde você está hoje, (c) exemplo do texto que peers usam.',
			'Comece pela primeira categoria da lista (maior peso × maior gap). Pra cada uma, decida: você tem o elemento e só não comunica? Ou genuinamente não tem ainda?',
			'Se tem mas não comunica: prioriza adicionar à hero (acima da dobra) com texto inspirado nos exemplos dos peers. Mas adaptado pro seu posicionamento. Não copie.',
			'Se não tem ainda: avalie esforço de produto × impacto. Categorias de peso ≥0.8 (frete grátis, transformation_promise, address_visibility, core_features) geralmente justificam priorização imediata.',
			'Não tente fechar todas as categorias de uma vez. 2-3 por cycle mantém foco e permite medir impacto no próximo audit.',
		],
		estimated_effort_hours: 12,
		verification_strategy: 'heuristic_recompute',
		verification_notes:
			'No próximo cycle, re-rodamos o LLM enricher sobre sua homepage atual e re-comparamos com o peer set pra confirmar quais gaps foram fechados.',
		verification_eta_seconds: 90,
	},
};

/**
 * Dynamic remediation resolver for funnel-gap keys with variable suffixes.
 * Called by the projection layer when a key isn't found in REMEDIATION_CATALOG.
 */
export function getDynamicRemediation(key: string): typeof REMEDIATION_CATALOG[string] | null {
	if (key.startsWith('funnel_missing_stage_')) {
		return {
			remediation_steps: [
				'Identifique qual estágio do funil está ausente (ex: página de features, pricing, ou signup).',
				'Crie uma página dedicada para esse estágio com conteúdo que guie o visitante adiante.',
				'Adicione links de navegação e CTAs que conectem os estágios anterior e posterior.',
				'Certifique-se de que o menu principal inclui acesso a essa nova página.',
			],
			estimated_effort_hours: 8,
			verification_strategy: 'heuristic_recompute' as const,
			verification_notes: 'Vamos re-crawlear o site e verificar se uma página para o estágio ausente foi criada e está linkada.',
			verification_eta_seconds: 60,
		};
	}
	if (key.startsWith('funnel_broken_path_')) {
		return {
			remediation_steps: [
				'Acesse a página do estágio anterior e verifique que não há CTA visível para o próximo estágio.',
				'Adicione um botão CTA primário claro (ex: "Ver Preços →", "Começar Teste Grátis").',
				'Posicione o CTA no corpo principal da página (não apenas no menu de navegação).',
				'Teste a experiência completa: o visitante consegue chegar ao próximo estágio em 1 clique?',
			],
			estimated_effort_hours: 3,
			verification_strategy: 'heuristic_recompute' as const,
			verification_notes: 'Vamos verificar se um link CTA (não apenas navegação) foi adicionado entre os dois estágios.',
			verification_eta_seconds: 30,
		};
	}
	if (key.startsWith('funnel_weak_connection_')) {
		return {
			remediation_steps: [
				'A conexão entre esses estágios existe apenas via menu de navegação. Não há CTA no corpo da página.',
				'Adicione um CTA contextual no conteúdo principal que guie o visitante ao próximo passo.',
				'Use texto que comunique benefício (ex: "Descubra nossos planos" em vez de apenas "Pricing").',
				'Considere adicionar prova social ou urgência ao CTA para aumentar conversão.',
			],
			estimated_effort_hours: 2,
			verification_strategy: 'heuristic_recompute' as const,
			verification_notes: 'Vamos verificar se um link com peso alto (CTA no corpo) foi adicionado entre os estágios.',
			verification_eta_seconds: 30,
		};
	}
	return null;
}

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
	const entry = REMEDIATION_CATALOG[inferenceKey] ?? getDynamicRemediation(inferenceKey);
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
