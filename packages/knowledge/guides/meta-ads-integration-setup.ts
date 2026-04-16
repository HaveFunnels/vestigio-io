/**
 * Guide: How to Connect Meta Ads to Vestigio
 * ─────────────────────────────────────────────────────────────────
 *
 * Walks a customer through the Meta Ads OAuth flow (the default
 * "Conectar com Meta" path) and the manual System User token path
 * for technical users.
 *
 * Surfaced at slug `meta-ads-integration-setup`. Linked from the
 * Meta Ads card in Settings → Data Sources.
 */

import type { GuideArticle } from '../foundation-articles';

let _k = 0;
function k(): string {
	return `mg${(++_k).toString(36)}`;
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

export const metaAdsIntegrationSetup: GuideArticle = {
	_id: 'guide:meta-ads-integration-setup',
	title: 'Como Conectar Meta Ads à Vestigio',
	slug: { current: 'meta-ads-integration-setup' },
	locale: 'pt-BR',
	category: 'guide',
	excerpt:
		'Guia passo a passo para conectar sua conta Meta Ads (Facebook / Instagram) à Vestigio — caminho OAuth padrão (um clique) e caminho manual com System User token pra usuários técnicos.',
	body: [
		// ── Section 1: Por que conectar? ───────────────────────────
		h2('Por que conectar Meta Ads?'),
		p(
			'Sem a integração, a Vestigio não tem visibilidade do seu spend em mídia. Com Meta Ads conectado, nós medimos quanto dinheiro entra em aquisição por plataforma e cruzamos com conversões reais da sua loja.',
		),
		p('Uma vez conectada, você desbloqueia:'),
		p(
			'- Findings de concentração de spend — se >70% do orçamento de ads vive numa única plataforma, você tem risco de interrupção total caso a conta seja desabilitada ou uma política mude.',
		),
		p(
			'- Findings de ROAS cego — se você está gastando em ads mas ainda não conectou Shopify/Nuvemshop, a Vestigio alerta que você não consegue medir o retorno real.',
		),
		p(
			'- Catálogo de criativos — títulos, descrições, CTAs e destination URLs ficam disponíveis pra inferências de qualidade de anúncio.',
		),
		p(
			'- Cruzamento com checkout — quando Meta Ads + Shopify estão ambos conectados, findings como "checkout abandonment + ad spend alto" combinam os dois lados pra quantificar leak de budget.',
		),

		// ── Section 2: O que a gente lê ────────────────────────────
		h2('Que dados a Vestigio lê?'),
		p(
			'A integração Meta Ads usa um escopo focado e read-only. Exatamente o que acessamos:',
		),
		p(
			'- Insights do Ad Account (últimos 30 dias): total de spend + currency. Alimenta as métricas de concentração de plataforma e ROAS.',
		),
		p(
			'- Ads ativos (top 20 por spend): headline, body, CTA, destination URL, status, spend individual. Usado pra análise de criativos + detecção de URLs suspeitos.',
		),
		p(
			'- User ID da sua conta Meta: usado apenas pra processar webhooks de remoção de app (LGPD). Nunca associado com dados do seu ad account além desse propósito.',
		),
		bold(
			'Importante: a Vestigio requisita acesso read-only (ads_read + business_management). Nunca modificamos campanhas, nunca pausamos anúncios, nunca criamos cobrança. Tudo que fazemos é leitura pra análise.',
		),

		// ── Section 3: Dois caminhos ───────────────────────────────
		h2('Dois caminhos de conexão'),
		p(
			'A Vestigio oferece duas formas de conectar Meta Ads. O recomendado é o OAuth (um clique). O manual existe pra quem prefere controle total ou tem restrições internas de IT.',
		),
		h3('Caminho 1 — OAuth (recomendado)'),
		p(
			'Você clica "Conectar com Meta", é redirecionado pro Facebook, autoriza a Vestigio, volta conectado. Sem copy-paste de token, sem criar app próprio. Setup em menos de 1 minuto.',
		),
		h3('Caminho 2 — System User token manual (avançado)'),
		p(
			'Pra clientes enterprise que preferem gerar o próprio token num Meta App deles ou que estão em ambiente de sandbox. Exige criar um System User no Business Manager + gerar token + colar na Vestigio.',
		),

		// ── Section 4: Caminho OAuth ───────────────────────────────
		h2('Caminho OAuth — passo a passo'),

		h3('Passo 1 — Abrir Data Sources na Vestigio'),
		p(
			'Na Vestigio, vá em Settings → Data Sources. Encontre o card Meta Ads e clique pra expandir.',
		),

		h3('Passo 2 — Clicar "Conectar com Meta"'),
		p(
			'O botão azul Facebook é o default. Ao clicar, você será redirecionado pra tela de consent do Facebook.',
		),
		p('[SCREENSHOT: card Meta Ads expandido com botão "Conectar com Meta" azul]'),

		h3('Passo 3 — Autorizar no Facebook'),
		p(
			'O Facebook vai pedir que você autorize a Vestigio a acessar: "Read your ads" e "Manage your business" (ambos read-only apesar dos nomes). Clique Continuar.',
		),
		p(
			'Se você tem múltiplos Business Managers ou Ad Accounts, o Facebook pode pedir pra escolher qual queira conceder acesso. Selecione o que quer que a Vestigio audite.',
		),
		p('[SCREENSHOT: tela de consent do Facebook mostrando as permissões "ads_read" e "business_management"]'),

		h3('Passo 4 — Volta pra Vestigio conectado'),
		p(
			'Você será redirecionado pra Data Sources com o card Meta Ads agora verde ("Connected"). O primeiro sync de dados acontece automaticamente no próximo ciclo de auditoria.',
		),

		// ── Section 5: Caminho manual ──────────────────────────────
		h2('Caminho manual — System User token'),
		p(
			'Se você prefere gerar o próprio token (por exemplo, porque já tem um Meta App interno e quer controle total sobre as credenciais), siga este caminho. O System User token pra business assets é permanente — diferente de user tokens públicos que expiram em 60 dias.',
		),

		h3('Passo 1 — Abrir Meta Business Settings'),
		p(
			'Acesse business.facebook.com/settings. Você precisa ter permissão de Admin no Business Manager que dono do seu Ad Account.',
		),

		h3('Passo 2 — Criar um System User'),
		p(
			'No menu esquerdo: Users → System Users → Add. Dê um nome descritivo (por exemplo, "Vestigio Integration") e defina role como Admin.',
		),
		p('[SCREENSHOT: tela Business Settings → System Users com botão "Add" visível]'),

		h3('Passo 3 — Atribuir o Ad Account ao System User'),
		p(
			'Depois de criar o System User, clique nele. Na aba "Assigned Assets", clique "Add Assets" → "Ad Account". Selecione seu Ad Account e marque a permissão "View Performance" (ads_read). Salve.',
		),
		p('[SCREENSHOT: tela de atribuição de Ad Account com checkbox "View Performance" marcado]'),

		h3('Passo 4 — Gerar o System User Access Token'),
		p(
			'Ainda no System User, clique "Generate New Token". Selecione seu Meta App (ou crie um novo em developers.facebook.com se não tiver). Marque apenas o scope "ads_read". Deixe a opção "Never" selecionada no dropdown de expiração. Clique Generate Token.',
		),
		bold(
			'Importante: copie o token AGORA. O Facebook só mostra uma vez. Se fechar sem copiar, você precisa gerar outro.',
		),
		p('[SCREENSHOT: tela Generate Token com scope ads_read selecionado e expiração "Never"]'),

		h3('Passo 5 — Pegar o Ad Account ID'),
		p(
			'Em Ads Manager (ads.facebook.com), clique no nome do seu account no canto superior-direito. O Ad Account ID aparece no formato act_XXXXXXXXXXXXX — copie o número completo.',
		),

		h3('Passo 6 — Colar na Vestigio'),
		p(
			'Em Data Sources → Meta Ads card, clique "Advanced: colar System User token manualmente". Cole o Ad Account ID e o token. Clique "Conectar Meta Ads".',
		),

		// ── Section 6: Troubleshooting ─────────────────────────────
		h2('Troubleshooting'),

		h3('"Invalid OAuth 2.0 Access Token"'),
		p(
			'O token expirou ou foi revogado. No caminho OAuth, clique "Disconnect" e "Conectar com Meta" de novo. No manual, gere um novo System User token seguindo os passos acima.',
		),

		h3('"No ad accounts accessible"'),
		p(
			'Sua conta Meta autenticou mas não tem nenhum Ad Account associado, ou o token não tem permissão. Confirme que você é Admin no Business Manager que dono do Ad Account e que o token foi gerado com scope ads_read.',
		),

		h3('"account_status != 1"'),
		p(
			'Seu Ad Account está desabilitado no Facebook (policy violation, pagamento pendente, etc.). A Vestigio pula accounts desabilitados. Resolva o issue no Meta Business Manager e tente reconectar.',
		),

		h3('Não consigo ver o botão "Generate New Token"'),
		p(
			'Você não tem permissão de Admin no Business Manager, ou não tem um Meta App criado. Admins do BM devem te dar a permissão, ou crie um app em developers.facebook.com (grátis, 5 min) pra ser selecionado na tela de Generate Token.',
		),

		// ── Section 7: O que acontece depois ───────────────────────
		h2('O que acontece depois de conectar?'),
		p(
			'Uma vez conectado, a Vestigio sincroniza dados do Meta Ads em cada ciclo de auditoria (normalmente a cada 24-48 horas). Você verá:',
		),
		p(
			'- Spend total dos últimos 30 dias + currency no dashboard, no slot Revenue Recovery.',
		),
		p(
			'- Finding "Ad spend platform concentration risk" ativado se Meta for >70% do seu spend de mídia total.',
		),
		p(
			'- Finding "Ads without conversion visibility" ativado se você estiver rodando ads mas sem commerce integration (Shopify/Nuvemshop/Stripe).',
		),
		p(
			'- Criativos top-spending disponíveis pra análise de qualidade de anúncio em futuras findings.',
		),
		p(
			'Se preferir desconectar a qualquer momento, o botão "Disconnect" no card Meta Ads remove as credenciais imediatamente. Você também pode remover o app no lado do Facebook — nosso webhook de deauthorize detecta e desconecta automaticamente.',
		),

		// ── Section 8: Privacidade ─────────────────────────────────
		h2('Privacidade e LGPD'),
		p(
			'A Vestigio é compliant com o App Review da Meta, que exige endpoints de "Data Deletion" e "Deauthorize Callback" — ambos estão implementados. Se você remover o app Vestigio do seu Business Manager, nossas credenciais do seu account são deletadas automaticamente.',
		),
		p(
			'Caso queira solicitar deleção manual dos dados que temos sobre sua conta Meta, envie email pra privacy@vestigio.io. Responderemos em até 15 dias úteis conforme LGPD.',
		),
	],
	publishedAt: null,
	is_foundation: true,
};
