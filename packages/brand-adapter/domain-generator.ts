// ──────────────────────────────────────────────
// Domain Variation Generator
//
// Generates controlled list of candidate lookalike
// domains for brand impersonation detection.
//
// Covers: typosquatting, commercial keywords,
// phishing patterns, payment clones, account capture,
// TLD variations, structural combinations.
//
// Multilingual: EN, PT-BR, ES.
// Max ~300 candidates with aggressive deduplication.
// ──────────────────────────────────────────────

// ── Token categories ──────────────────────────

// Commercial intent suffixes
const COMMERCIAL_TOKENS = [
  // PT-BR
  'atacado', 'atacados', 'distribuidora', 'distribuidor', 'loja', 'lojas',
  'compras', 'comprar', 'venda', 'vendas', 'promocao', 'ofertas', 'desconto',
  'liquida', 'brasil', 'br',
  // ES
  'tienda', 'ventas', 'descuento', 'promocion',
  // EN
  'store', 'shop', 'outlet', 'oficial', 'official', 'original',
  'online', 'ecommerce', 'promo', 'vip', 'premium', 'deals', 'buy',
];

// Security / Account / Phishing-oriented tokens
const PHISHING_TOKENS = [
  // EN
  'login', 'signin', 'account', 'secure', 'security', 'verify',
  'verification', 'update', 'auth', 'authentication', 'portal',
  'dashboard', 'validation',
  // PT-BR
  'conta', 'entrar', 'acesso', 'atualizar', 'confirmar', 'validar',
  'painel', 'suporte', 'ajuda',
  // ES
  'soporte', 'ayuda', 'acceso', 'verificar',
  // EN support
  'support', 'help',
];

// Payment-oriented tokens (CRITICAL for phishing detection)
const PAYMENT_TOKENS = [
  // PT-BR
  'pagamento', 'pagar', 'fatura', 'cobranca', 'carteira',
  // ES
  'pago', 'factura', 'cobro',
  // EN
  'payment', 'pay', 'checkout', 'billing', 'invoice', 'wallet',
];

const TLD_VARIATIONS = ['.com', '.com.br', '.net', '.org', '.co', '.store', '.shop', '.io', '.app'];

/**
 * Generate domain candidates for brand impersonation detection.
 * Returns a controlled list (max ~300 domains).
 * Covers typosquatting, commercial, phishing, and payment patterns.
 */
export function generateDomainCandidates(
  rootDomain: string,
  brandTokens: string[],
  maxCandidates: number = 300,
): string[] {
  const candidates = new Set<string>();
  const brand = brandTokens[0] || extractBrandFromDomain(rootDomain);

  // 1. Typosquatting (edit distance 1) — highest threat
  for (const typo of generateTypos(brand)) {
    candidates.add(`${typo}.com`);
    candidates.add(`${typo}.com.br`);
  }

  // 2. Commercial suffix/prefix combinations
  for (const token of COMMERCIAL_TOKENS) {
    candidates.add(`${brand}${token}.com`);
    candidates.add(`${brand}-${token}.com`);
    candidates.add(`${token}${brand}.com`);
    candidates.add(`${brand}${token}.com.br`);
  }

  // 3. Phishing suffix/prefix combinations (security/account patterns)
  for (const token of PHISHING_TOKENS) {
    candidates.add(`${token}${brand}.com`);
    candidates.add(`${brand}${token}.com`);
    candidates.add(`${token}-${brand}.com`);
    candidates.add(`${brand}-${token}.com`);
  }

  // 4. Payment suffix/prefix combinations (CRITICAL)
  for (const token of PAYMENT_TOKENS) {
    candidates.add(`${brand}${token}.com`);
    candidates.add(`${brand}-${token}.com`);
    candidates.add(`${token}${brand}.com`);
    candidates.add(`${brand}${token}.com.br`);
  }

  // 5. TLD variations
  for (const tld of TLD_VARIATIONS) {
    if (!rootDomain.endsWith(tld)) {
      candidates.add(`${brand}${tld}`);
    }
  }

  // 6. Structural variations for each brand token
  for (const token of brandTokens) {
    candidates.add(`${token}oficial.com`);
    candidates.add(`${token}oficial.com.br`);
    candidates.add(`${token}online.com`);
    candidates.add(`${token}store.com`);
    candidates.add(`loja${token}.com`);
    candidates.add(`loja${token}.com.br`);
  }

  // 7. Hybrid: payment + region (high-risk phishing patterns)
  for (const payToken of ['payment', 'pagamento', 'pay', 'checkout']) {
    for (const regionToken of ['br', 'brasil', 'online']) {
      candidates.add(`${brand}${payToken}${regionToken}.com`);
    }
  }

  // Remove self and exact brand domain under all TLDs
  candidates.delete(rootDomain);
  for (const tld of TLD_VARIATIONS) {
    candidates.delete(`${brand}${tld}`);
  }

  // Limit to max candidates
  return Array.from(candidates).slice(0, maxCandidates);
}

/**
 * Generate typo variations (edit distance 1).
 */
function generateTypos(brand: string): string[] {
  const typos: string[] = [];

  // Missing letter
  for (let i = 0; i < brand.length; i++) {
    typos.push(brand.slice(0, i) + brand.slice(i + 1));
  }

  // Swapped adjacent letters
  for (let i = 0; i < brand.length - 1; i++) {
    const arr = brand.split('');
    [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    typos.push(arr.join(''));
  }

  // Duplicated letter
  for (let i = 0; i < brand.length; i++) {
    typos.push(brand.slice(0, i) + brand[i] + brand.slice(i));
  }

  // Substituted letter (common visual confusions)
  const confusions: Record<string, string[]> = {
    'o': ['0'], '0': ['o'], 'l': ['1', 'i'], '1': ['l', 'i'],
    'i': ['1', 'l'], 's': ['5'], '5': ['s'], 'a': ['@', 'e'],
    'e': ['3'], '3': ['e'], 'g': ['q'], 'q': ['g'],
    'n': ['m'], 'm': ['n', 'rn'], 'u': ['v'], 'v': ['u'],
    'd': ['cl'], 'w': ['vv'],
  };
  for (let i = 0; i < brand.length; i++) {
    const subs = confusions[brand[i]];
    if (subs) {
      for (const sub of subs) {
        typos.push(brand.slice(0, i) + sub + brand.slice(i + 1));
      }
    }
  }

  return [...new Set(typos)].filter(t => t !== brand);
}

function extractBrandFromDomain(domain: string): string {
  return domain.replace(/\.(com|com\.br|net|org|co|io|app|store|shop)$/i, '').replace(/[^a-z0-9]/gi, '');
}

/**
 * Check if a domain contains phishing-oriented tokens.
 */
export function hasSensitiveTokens(domain: string): boolean {
  const name = domain.replace(/\.[^.]+(\.[^.]+)?$/, '').toLowerCase();
  return PHISHING_TOKENS.some(t => name.includes(t)) || PAYMENT_TOKENS.some(t => name.includes(t));
}

/**
 * Check if a domain contains payment-specific tokens.
 */
export function hasPaymentTokens(domain: string): boolean {
  const name = domain.replace(/\.[^.]+(\.[^.]+)?$/, '').toLowerCase();
  return PAYMENT_TOKENS.some(t => name.includes(t));
}
