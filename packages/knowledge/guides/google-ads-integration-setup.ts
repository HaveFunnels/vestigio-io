/**
 * Guide: How to Connect Google Ads to Vestigio
 * ─────────────────────────────────────────────────────────────────
 *
 * Walks a customer through the Google Ads OAuth flow (default) and
 * the manual credentials path (OAuth Playground + own developer
 * token) for technical users.
 *
 * Surfaced at slug `google-ads-integration-setup`. Linked from the
 * Google Ads card in Settings → Data Sources.
 */

import type { GuideArticle } from '../foundation-articles';

let _k = 0;
function k(): string {
	return `gg${(++_k).toString(36)}`;
}

function h2(text: string) {
	return {
		_type: 'block' as const,
		_key: k(),
		style: 'h2' as const,
		children: [{ _type: 'span' as const, _key: k(), text, marks: [] as string[] }],
	};
}

function h3(text: string) {
	return {
		_type: 'block' as const,
		_key: k(),
		style: 'h3' as const,
		children: [{ _type: 'span' as const, _key: k(), text, marks: [] as string[] }],
	};
}

function p(text: string) {
	return {
		_type: 'block' as const,
		_key: k(),
		style: 'normal' as const,
		children: [{ _type: 'span' as const, _key: k(), text, marks: [] as string[] }],
	};
}

function bold(text: string) {
	return {
		_type: 'block' as const,
		_key: k(),
		style: 'normal' as const,
		children: [{ _type: 'span' as const, _key: k(), text, marks: ['strong'] }],
	};
}

export const googleAdsIntegrationSetup: GuideArticle = {
	_id: 'guide:google-ads-integration-setup',
	title: 'Como Conectar Google Ads à Vestigio',
	slug: { current: 'google-ads-integration-setup' },
	locale: 'pt-BR',
	category: 'guide',
	excerpt:
		'Guia passo a passo para conectar sua conta Google Ads à Vestigio — caminho OAuth padrão (um clique, developer token Vestigio-side) e caminho manual com próprio developer token pra usuários técnicos.',
	body: [
		// ── Section 1: Por que conectar? ───────────────────────────
		h2('Por que conectar Google Ads?'),
		p(
			'Sem a integração, a Vestigio não tem visibilidade do seu spend em Google Ads. Com o Google Ads conectado, nós medimos quanto vai pra search, shopping, YouTube, e cruzamos com conversões reais da sua loja.',
		),
		p('Conectar desbloqueia:'),
		p(
			'- Ad spend real — valor de cost de cada campanha ativa nos últimos 30 dias.',
		),
		p(
			'- Detecção de concentração de plataforma — se Google Ads for dominante (>70% do seu spend total considerando também Meta Ads), você tem risco de outage.',
		),
		p(
			'- Creative text de Responsive Search Ads — headlines, descrições, final URLs. Material pra findings de qualidade de anúncio e URLs suspeitos.',
		),
		p(
			'- Cruzamento com commerce — quando ambos Google Ads e Shopify/Nuvemshop estão conectados, ROAS real é medível em toda finding de leak.',
		),

		// ── Section 2: O que lemos ─────────────────────────────────
		h2('Que dados a Vestigio lê?'),
		p(
			'Escopo read-only focado: apenas o necessário pra análises financeiras e de qualidade. Detalhes exatos:',
		),
		p(
			'- Campanhas (últimos 30 dias): id, nome, currency, cost em micros (convertido pra units). Top 50 por cost.',
		),
		p(
			'- Responsive Search Ads: array de headlines + descriptions + final URL. Pega só campo text, nunca performance breakdown por segmento sensível.',
		),
		p(
			'- Customer ID e currency code: pra identificar sua conta Google Ads e normalizar valores.',
		),
		bold(
			'Importante: a Vestigio requisita apenas o scope https://www.googleapis.com/auth/adwords (read-only). Nunca modificamos campanhas, nunca pausamos anúncios, nunca mudamos lances. Zero write access.',
		),

		// ── Section 3: Dois caminhos ───────────────────────────────
		h2('Dois caminhos de conexão'),
		h3('Caminho 1 — OAuth (recomendado)'),
		p(
			'Você clica "Conectar com Google", autoriza no Google Accounts, volta conectado. O developer token é Vestigio-side (aprovado uma vez pelo Google), então você não precisa aplicar pelo seu. Setup em 1-2 minutos.',
		),
		h3('Caminho 2 — Credenciais manuais (avançado)'),
		p(
			'Pra clientes enterprise que querem usar o próprio developer token e OAuth client (por razões de governança ou isolamento), ou pra ambientes de sandbox. Exige aplicar pelo próprio developer token (1-5 dias Google-side), criar OAuth client em Google Cloud, gerar refresh token via OAuth Playground, e colar tudo.',
		),

		// ── Section 4: Caminho OAuth ───────────────────────────────
		h2('Caminho OAuth — passo a passo'),

		h3('Passo 1 — Abrir Data Sources na Vestigio'),
		p(
			'Em Settings → Data Sources, encontre o card Google Ads e expanda.',
		),

		h3('Passo 2 — Clicar "Conectar com Google"'),
		p(
			'Botão azul Google é o default. Ao clicar, você será redirecionado pra tela de consent do Google.',
		),
		p('[SCREENSHOT: card Google Ads expandido com botão "Conectar com Google" azul]'),

		h3('Passo 3 — Escolher a conta Google'),
		p(
			'Se você tem múltiplas contas Google logadas, o Google pede pra escolher qual usar. Selecione a conta que tem acesso ao Google Ads que você quer conectar.',
		),

		h3('Passo 4 — Autorizar'),
		p(
			'O Google mostra as permissões: "Manage your AdWords campaigns" (apesar do nome, a Vestigio só usa esse scope pra leitura — garantido pelo nosso developer token que é read-only certified). Clique Continue.',
		),
		p('[SCREENSHOT: tela de consent do Google Ads com scope "adwords" visível]'),

		h3('Passo 5 — Volta pra Vestigio conectado'),
		p(
			'Você será redirecionado pra Data Sources com Google Ads agora verde ("Connected"). O customer_id da sua primeira conta Google Ads acessível é selecionado automaticamente. Se você usa múltiplas contas ou MCC, pode precisar usar o caminho manual pra escolher uma específica.',
		),

		// ── Section 5: Caminho manual ──────────────────────────────
		h2('Caminho manual — credenciais completas'),
		p(
			'Este caminho é pra quem precisa controle total. São 5 campos obrigatórios: developer_token (próprio), OAuth client_id + client_secret (seus), refresh_token (gerado via OAuth Playground), customer_id (sem hífens). Opcional: login_customer_id se você usa MCC.',
		),

		h3('Passo 1 — Aplicar pelo Developer Token'),
		p(
			'Acesse ads.google.com/aw/apicenter (precisa estar logado numa conta Google Ads com MCC ou direct). Apply pra Basic Access (15k ops/dia). Preencha: nome da aplicação (pode ser "Vestigio Integration"), tool type (Reporting), volume esperado, URL do que você faz. Google aprova tipicamente em 1-5 business days.',
		),
		p('[SCREENSHOT: tela de API Center com link "Apply for basic access"]'),
		bold(
			'Nota: se você só vai usar OAuth padrão da Vestigio, PULE este passo. Nosso developer token é shared e aprovado.',
		),

		h3('Passo 2 — Criar OAuth Client no Google Cloud'),
		p(
			'Acesse console.cloud.google.com/apis/credentials. Se ainda não tem projeto, crie um (pode ser "vestigio-ads-integration"). Em APIs & Services → Library, habilite a Google Ads API.',
		),
		p(
			'Depois: Credentials → Create Credentials → OAuth 2.0 Client ID. Type: Desktop App. Nome: "Vestigio Integration". Clique Create. Copie o Client ID + Client Secret.',
		),
		p('[SCREENSHOT: tela Credentials do Google Cloud Console com Desktop App type selecionado]'),

		h3('Passo 3 — Gerar Refresh Token via OAuth Playground'),
		p(
			'Acesse developers.google.com/oauthplayground. No ícone de engrenagem (top-right), marque "Use your own OAuth credentials" e cole o Client ID + Client Secret do passo anterior.',
		),
		p(
			'No painel esquerdo, cole o scope: https://www.googleapis.com/auth/adwords. Clique "Authorize APIs". Google vai pedir pra você logar na conta Google Ads. Autorize.',
		),
		p(
			'Depois de autorizar, você volta pro Playground. Clique "Exchange authorization code for tokens". Copie o Refresh Token que aparece.',
		),
		p('[SCREENSHOT: OAuth Playground mostrando o Refresh Token gerado após authorization]'),
		bold(
			'Importante: o Refresh Token é permanente até você revogar manualmente. Guarde bem — se perder, precisa refazer todo este passo.',
		),

		h3('Passo 4 — Pegar o Customer ID'),
		p(
			'Em ads.google.com, no topo direito, você vê o Customer ID no formato 123-456-7890. Na Vestigio, cole SEM os hífens: 1234567890.',
		),

		h3('Passo 5 — Login Customer ID (só se MCC)'),
		p(
			'Se você acessa o Google Ads via uma conta MCC (manager), também precisa do ID da MCC. Pegue em ads.google.com quando logado como MCC, formato XXX-XXX-XXXX sem hífens. Se você tem só uma conta Ads direta, deixe em branco.',
		),

		h3('Passo 6 — Colar na Vestigio'),
		p(
			'Em Data Sources → Google Ads card, clique "Advanced: colar credenciais manualmente". Preencha os 5 (ou 6) campos. Clique "Conectar Google Ads". A Vestigio vai validar as credenciais imediatamente.',
		),

		// ── Section 6: Troubleshooting ─────────────────────────────
		h2('Troubleshooting'),

		h3('"invalid_grant: Token has been expired or revoked"'),
		p(
			'Refresh token foi revogado (pode acontecer se você mudou senha Google, removeu apps conectados na conta, ou ficou sem uso 6 meses). OAuth path: Disconnect + Conectar com Google de novo. Manual path: gere novo refresh token no OAuth Playground.',
		),

		h3('"Customer is not allowed to access this endpoint"'),
		p(
			'O developer_token não tem standard access OU a conta Google Ads não está ativa OU o OAuth não foi feito com a conta certa. No OAuth path, tente reconectar. No manual, confirme que o developer token está aprovado em basic access pelo menos.',
		),

		h3('"developer-token is invalid"'),
		p(
			'Só acontece no manual path. Confirme que copiou o developer token exato do Google API Center, sem espaços. Token começa com algo tipo XXXXXXXXXXXXXXXXXXXXXX (22+ chars).',
		),

		h3('"No accessible customers"'),
		p(
			'Sua conta Google autenticou mas não tem permissão em nenhum Google Ads account. Confirme que você é admin numa conta Google Ads ativa ou tem acesso via MCC.',
		),

		h3('OAuth redirect failing com "redirect_uri_mismatch"'),
		p(
			'Só acontece no manual path se você tá criando OAuth client Desktop incorretamente. Use o OAuth Playground — ele cuida do redirect. No caminho OAuth padrão da Vestigio, isso nunca acontece.',
		),

		// ── Section 7: O que acontece depois ───────────────────────
		h2('O que acontece depois de conectar?'),
		p(
			'A Vestigio sincroniza o Google Ads em cada ciclo de auditoria (tipicamente 24-48h). Resultados:',
		),
		p(
			'- Total de ad spend 30d + currency visível no dashboard.',
		),
		p(
			'- Lista das top 50 campanhas por cost, com creative text de Responsive Search Ads.',
		),
		p(
			'- Finding "Ad spend platform concentration risk" ativado se Google for dominante no mix.',
		),
		p(
			'- Finding "Ads without conversion visibility" ativado se rodando Google Ads sem commerce integration.',
		),
		p(
			'Pra desconectar: botão "Disconnect" no card remove as credenciais. Pra revogar o acesso do lado Google também, acesse myaccount.google.com/permissions e remova a Vestigio.',
		),

		// ── Section 8: Privacidade ─────────────────────────────────
		h2('Privacidade e LGPD'),
		p(
			'Diferente da Meta, o Google Ads não fornece webhook de data deletion — a revogação é feita do lado do usuário em myaccount.google.com/permissions. Quando você revoga, nosso próximo poll falha com refresh_token inválido, e marcamos automaticamente a integração como "error" status.',
		),
		p(
			'Pra solicitação manual de deletion dos dados que temos da sua conta Google Ads, envie email pra privacy@vestigio.io. Responderemos em até 15 dias úteis conforme LGPD.',
		),
		p(
			'Nossa Vestigio-side infrastructure é compliant com Google Cloud OAuth verification: privacy policy pública em vestigio.io/privacy, terms em vestigio.io/terms, demo video da experiência de conexão submetido no OAuth consent screen, scope justification aprovada.',
		),
	],
	publishedAt: null,
	is_foundation: true,
};
