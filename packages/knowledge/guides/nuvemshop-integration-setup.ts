/**
 * Guide: How to Connect Nuvemshop to Vestigio
 * ─────────────────────────────────────────────────────────────────
 *
 * Static guide article for the Knowledge Base.
 * Surfaced at slug `nuvemshop-integration-setup` and linked from
 * the Data Sources settings page.
 */

import type { GuideArticle } from '../foundation-articles';

// ── Block helpers ────────────────────────────────────────────────

let _k = 0;
function k(): string {
  return `ng${(++_k).toString(36)}`;
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

function ol(items: string[]) {
  return {
    _type: 'block' as const,
    _key: k(),
    style: 'normal' as const,
    listItem: 'number' as const,
    level: 1,
    children: items.map(text => ({
      _type: 'span' as const,
      _key: k(),
      text: text + '\n',
      marks: [] as string[],
    })),
  };
}

function screenshot(alt: string) {
  return p(`[SCREENSHOT: ${alt}]`);
}

// ── Guide ────────────────────────────────────────────────────────

export const nuvemshopIntegrationSetupGuide: GuideArticle = {
  // GuideArticle extends FoundationArticle — requires _id, slug-as-object,
  // locale, excerpt (not description), publishedAt, is_foundation. Shape
  // matched against shopify-integration-setup.ts so the registry accepts
  // both entries uniformly.
  _id: 'guide:nuvemshop-integration-setup',
  title: 'Como Conectar a Nuvemshop à Vestigio',
  slug: { current: 'nuvemshop-integration-setup' },
  locale: 'pt-BR',
  category: 'guide',
  excerpt:
    'Guia passo a passo para conectar sua loja Nuvemshop à Vestigio e importar dados reais de faturamento, pedidos, clientes e produtos.',
  body: [
    h2('Visão Geral'),
    p(
      'A integração com a Nuvemshop permite que a Vestigio substitua estimativas heurísticas por dados reais da sua loja. ' +
      'Isso inclui faturamento, pedidos, clientes e produtos — tornando as análises de impacto significativamente mais precisas.',
    ),
    p(
      'A Vestigio solicita apenas permissões de leitura. Nunca modificamos dados da sua loja.',
    ),

    h2('O que você precisa'),
    p(
      'Para conectar sua loja Nuvemshop à Vestigio, você precisará autorizar o app Vestigio na sua loja. ' +
      'O processo de autorização OAuth retorna um access_token e um store_id (user_id) que são utilizados para conexão.',
    ),

    h2('Passo 1: Instalar o App Vestigio'),
    p(
      'Acesse o link de instalação do app Vestigio fornecido pela equipe. ' +
      'Você será redirecionado para a página de autorização da Nuvemshop.',
    ),
    screenshot('Link de instalação do app Vestigio na Nuvemshop'),

    h2('Passo 2: Autorizar Permissões'),
    p(
      'A Nuvemshop solicitará que você autorize as permissões que o app Vestigio precisa. ' +
      'As permissões necessárias são somente leitura:',
    ),
    ol([
      'read_orders — Ler pedidos e transações',
      'read_customers — Ler dados de clientes',
      'read_products — Ler produtos e variantes',
    ]),
    p('Clique em "Autorizar" para conceder as permissões.'),
    screenshot('Tela de autorização de permissões da Nuvemshop'),

    h2('Passo 3: Obter Store ID e Access Token'),
    p(
      'Após autorizar, você receberá um Store ID (user_id) e um Access Token. ' +
      'Esses valores são retornados no processo de OAuth.',
    ),
    p(
      'O Store ID é um número (ex: 7556429). O Access Token é uma string alfanumérica longa.',
    ),
    screenshot('Store ID e Access Token após autorização'),

    h2('Passo 4: Conectar na Vestigio'),
    p(
      'Na Vestigio, vá em Configurações → Data Sources e expanda o card "Nuvemshop".',
    ),
    ol([
      'Cole o Store ID no campo "Store ID"',
      'Cole o Access Token no campo "Access Token"',
      'Clique em "Conectar Nuvemshop"',
    ]),
    screenshot('Formulário de conexão Nuvemshop na Vestigio'),
    p(
      'A Vestigio verificará a conexão automaticamente. Se tudo estiver correto, ' +
      'o status mudará para "Conectado" e seus dados começarão a ser importados na próxima auditoria.',
    ),

    h2('Passo 5: Verificar a Sincronização'),
    p(
      'Após a conexão, clique em "Sincronizar" para executar um sync manual. ' +
      'Isso buscará informações da loja, contagem de pedidos e produtos para confirmar que a integração está funcionando.',
    ),
    screenshot('Status de conexão e botão de sincronização'),

    h3('Dados Importados'),
    p(
      'A Vestigio importa os seguintes dados da sua loja Nuvemshop:',
    ),
    ol([
      'Pedidos — faturamento, status de pagamento, gateway, descontos',
      'Clientes — total gasto, taxa de recompra',
      'Produtos — catálogo ativo, variantes, estoque',
    ]),
    p(
      'Nota: A Nuvemshop não possui uma API de checkouts abandonados, então esse dado não estará disponível ' +
      '(diferente da integração Shopify). O restante dos dados tem cobertura equivalente.',
    ),

    h2('Segurança'),
    p(
      'Suas credenciais são criptografadas em repouso utilizando AES-256-GCM. ' +
      'Apenas leitura — a Vestigio nunca escreve ou modifica dados na sua loja. ' +
      'Tokens da Nuvemshop não expiram, mas podem ser revogados desinstalando o app.',
    ),

    h2('Solução de Problemas'),
    h3('Erro: "Token de acesso inválido"'),
    p(
      'Verifique se o Store ID e o Access Token estão corretos. ' +
      'Se o app foi desinstalado e reinstalado, um novo token é gerado — o anterior é invalidado.',
    ),
    h3('Erro: "Rate limit"'),
    p(
      'A API da Nuvemshop permite 2 requisições por segundo com burst de 40. ' +
      'A Vestigio respeita esses limites automaticamente. Se você vir esse erro, ' +
      'pode ser que outro app esteja consumindo a cota. Tente sincronizar novamente em alguns minutos.',
    ),
  ],
  publishedAt: null,
  is_foundation: true,
};
