// ──────────────────────────────────────────────
// Finding Embeddings — Semantic Search (TF-IDF)
//
// In-memory tokenized index over the org's findings + actions.
// Used by the MCP `search_findings` tool so the chat agent can
// retrieve relevant findings by query string.
//
// Note: the OpenAI text-embedding-3-small vector path was deleted
// in Wave 19b — it was never wired to a caller and would have
// spent OpenAI credits without TokenCostLedger telemetry. If we
// later want true semantic search, the right move is a Postgres
// pgvector column on the Finding table (kept warm by the audit
// pipeline) rather than an in-memory index that needs rebuilding
// every deploy.
//
// Current limitation: nothing calls buildEmbeddingIndexSync yet,
// so searchFindingsSync returns [] in production. That's a
// known-broken MCP tool tracked separately — it doesn't leak
// money, just returns empty results. Don't restore vector mode
// without wiring telemetry first.
// ──────────────────────────────────────────────

export interface EmbeddedItem {
  id: string;
  type: 'finding' | 'action';
  text: string;
  tokens: string[];
  metadata: {
    title: string;
    severity: string;
    impact_mid: number;
    pack: string;
    confidence: number;
  };
}

// ── State ───────────────────────────────────

const embeddingCache = new Map<string, EmbeddedItem[]>();

// ── Build Index (TF-IDF only) ───────────────

export function buildEmbeddingIndexSync(
  orgId: string,
  findings: Array<{ id: string; title: string; severity: string; impact: any; pack: string; confidence: number; root_cause: string | null; reasoning?: string }>,
  actions: Array<{ id: string; title: string; severity: string; impact: any; priority_score: number; cross_pack: boolean; description?: string; root_cause?: string | null }>,
): void {
  const items: EmbeddedItem[] = [];

  for (const f of findings) {
    const text = [
      f.title, f.severity, f.pack?.replace(/_/g, ' '), f.root_cause, f.reasoning,
      `$${f.impact?.midpoint || 0} per month`,
    ].filter(Boolean).join(' ').toLowerCase();

    items.push({
      id: f.id, type: 'finding', text, tokens: tokenize(text),
      metadata: { title: f.title, severity: f.severity, impact_mid: f.impact?.midpoint || 0, pack: f.pack, confidence: f.confidence },
    });
  }

  for (const a of actions) {
    const text = [
      a.title, a.severity, a.description, a.root_cause, a.cross_pack ? 'cross pack' : '',
      `$${a.impact?.midpoint || 0} savings`,
    ].filter(Boolean).join(' ').toLowerCase();

    items.push({
      id: a.id, type: 'action', text, tokens: tokenize(text),
      metadata: { title: a.title, severity: a.severity, impact_mid: a.impact?.midpoint || 0, pack: '', confidence: 0 },
    });
  }

  embeddingCache.set(orgId, items);
}

// ── Search (TF-IDF) ─────────────────────────

export function searchFindingsSync(
  orgId: string,
  query: string,
  topK: number = 5,
  type?: 'finding' | 'action',
): EmbeddedItem[] {
  const items = embeddingCache.get(orgId);
  if (!items || items.length === 0) return [];
  const filtered = type ? items.filter((i) => i.type === type) : items;
  return tfidfSearch(filtered, query, topK);
}

function tfidfSearch(items: EmbeddedItem[], query: string, topK: number): EmbeddedItem[] {
  const queryTokens = tokenize(query.toLowerCase());

  const scored = items.map((item) => {
    let score = 0;
    for (const qt of queryTokens) {
      for (const it of item.tokens) {
        if (it === qt) score += 3;
        else if (it.includes(qt)) score += 1;
        else if (qt.includes(it)) score += 0.5;
      }
    }
    score += Math.log10(Math.max(item.metadata.impact_mid, 1)) * 0.5;
    if (item.metadata.severity === 'critical') score += 2;
    else if (item.metadata.severity === 'high') score += 1;
    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter((s) => s.score > 0).map((s) => s.item);
}

// ── Cache Management ────────────────────────

export function hasEmbeddings(orgId: string): boolean {
  return embeddingCache.has(orgId) && (embeddingCache.get(orgId)?.length || 0) > 0;
}

export function clearEmbeddings(orgId: string): void {
  embeddingCache.delete(orgId);
}

// ── Tokenizer ───────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither',
  'this', 'that', 'these', 'those', 'it', 'its',
]);

function tokenize(text: string): string[] {
  return text
    .replace(/[^\w\s$]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}
