// ──────────────────────────────────────────────
// Finding Embeddings — Semantic Search
//
// Two-tier implementation:
//   1. Vector mode (OPENAI_API_KEY set): Uses text-embedding-3-small
//      for high-quality semantic search via cosine similarity.
//      Cost: ~$0.00002 per 1000 tokens. Works well at any scale.
//
//   2. TF-IDF fallback (no API key): Token overlap + impact boost.
//      Works well for <100 findings. Zero external calls.
//
// The mode is auto-detected from env on first call.
// ──────────────────────────────────────────────

export interface EmbeddedItem {
  id: string;
  type: 'finding' | 'action';
  text: string;          // searchable text representation
  tokens: string[];      // tokenized for TF-IDF fallback
  vector: number[] | null; // embedding vector (null if TF-IDF mode)
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
let vectorMode: boolean | null = null; // null = not yet detected

function isVectorMode(): boolean {
  if (vectorMode === null) {
    vectorMode = !!process.env.OPENAI_API_KEY;
  }
  return vectorMode;
}

// ── OpenAI Client (lazy singleton) ──────────

let openaiClient: any = null;

async function getOpenAI(): Promise<any> {
  if (!openaiClient) {
    const { default: OpenAI } = await import('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// ── Embedding Generation ────────────────────

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 512; // Reduced from 1536 for cost/speed. Still excellent quality.
const MAX_BATCH_SIZE = 96;        // OpenAI batch limit

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = await getOpenAI();
  const vectors: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    for (const item of response.data) {
      vectors.push(item.embedding);
    }
  }

  return vectors;
}

async function generateSingleEmbedding(text: string): Promise<number[]> {
  const openai = await getOpenAI();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

// ── Cosine Similarity ───────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Build Index ─────────────────────────────

export async function buildEmbeddingIndex(
  orgId: string,
  findings: Array<{ id: string; title: string; severity: string; impact: any; pack: string; confidence: number; root_cause: string | null; reasoning?: string }>,
  actions: Array<{ id: string; title: string; severity: string; impact: any; priority_score: number; cross_pack: boolean; description?: string; root_cause?: string | null }>,
): Promise<void> {
  const items: EmbeddedItem[] = [];
  const texts: string[] = [];

  for (const f of findings) {
    const text = [
      f.title,
      f.severity,
      f.pack?.replace(/_/g, ' '),
      f.root_cause,
      f.reasoning,
      `$${f.impact?.midpoint || 0} per month`,
    ].filter(Boolean).join(' ').toLowerCase();

    items.push({
      id: f.id,
      type: 'finding',
      text,
      tokens: tokenize(text),
      vector: null,
      metadata: {
        title: f.title,
        severity: f.severity,
        impact_mid: f.impact?.midpoint || 0,
        pack: f.pack,
        confidence: f.confidence,
      },
    });
    texts.push(text);
  }

  for (const a of actions) {
    const text = [
      a.title,
      a.severity,
      a.description,
      a.root_cause,
      a.cross_pack ? 'cross pack' : '',
      `$${a.impact?.midpoint || 0} savings`,
    ].filter(Boolean).join(' ').toLowerCase();

    items.push({
      id: a.id,
      type: 'action',
      text,
      tokens: tokenize(text),
      vector: null,
      metadata: {
        title: a.title,
        severity: a.severity,
        impact_mid: a.impact?.midpoint || 0,
        pack: '',
        confidence: 0,
      },
    });
    texts.push(text);
  }

  // Generate vector embeddings if OpenAI is available
  if (isVectorMode() && texts.length > 0) {
    try {
      const vectors = await generateEmbeddings(texts);
      for (let i = 0; i < items.length; i++) {
        items[i].vector = vectors[i] || null;
      }
    } catch (err) {
      // Fall back to TF-IDF silently
      console.warn('[embeddings] Vector generation failed, using TF-IDF fallback:', err instanceof Error ? err.message : err);
    }
  }

  embeddingCache.set(orgId, items);
}

/** Synchronous version for backwards compatibility (TF-IDF only) */
export function buildEmbeddingIndexSync(
  orgId: string,
  findings: Array<{ id: string; title: string; severity: string; impact: any; pack: string; confidence: number; root_cause: string | null; reasoning?: string }>,
  actions: Array<{ id: string; title: string; severity: string; impact: any; priority_score: number; cross_pack: boolean; description?: string; root_cause?: string | null }>,
): void {
  // This only builds TF-IDF tokens — vector embeddings won't be generated
  const items: EmbeddedItem[] = [];

  for (const f of findings) {
    const text = [
      f.title, f.severity, f.pack?.replace(/_/g, ' '), f.root_cause, f.reasoning,
      `$${f.impact?.midpoint || 0} per month`,
    ].filter(Boolean).join(' ').toLowerCase();

    items.push({
      id: f.id, type: 'finding', text, tokens: tokenize(text), vector: null,
      metadata: { title: f.title, severity: f.severity, impact_mid: f.impact?.midpoint || 0, pack: f.pack, confidence: f.confidence },
    });
  }

  for (const a of actions) {
    const text = [
      a.title, a.severity, a.description, a.root_cause, a.cross_pack ? 'cross pack' : '',
      `$${a.impact?.midpoint || 0} savings`,
    ].filter(Boolean).join(' ').toLowerCase();

    items.push({
      id: a.id, type: 'action', text, tokens: tokenize(text), vector: null,
      metadata: { title: a.title, severity: a.severity, impact_mid: a.impact?.midpoint || 0, pack: '', confidence: 0 },
    });
  }

  embeddingCache.set(orgId, items);
}

// ── Search ──────────────────────────────────

export async function searchFindings(
  orgId: string,
  query: string,
  topK: number = 5,
  type?: 'finding' | 'action',
): Promise<EmbeddedItem[]> {
  const items = embeddingCache.get(orgId);
  if (!items || items.length === 0) return [];

  const filtered = type ? items.filter((i) => i.type === type) : items;

  // Use vector search if embeddings are available
  const hasVectors = filtered.some((i) => i.vector !== null);

  if (hasVectors && isVectorMode()) {
    return vectorSearch(filtered, query, topK);
  }

  // Fallback to TF-IDF
  return tfidfSearch(filtered, query, topK);
}

/** Synchronous search (TF-IDF only, for backwards compatibility) */
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

// ── Vector Search ───────────────────────────

async function vectorSearch(items: EmbeddedItem[], query: string, topK: number): Promise<EmbeddedItem[]> {
  try {
    const queryVector = await generateSingleEmbedding(query.toLowerCase());

    const scored = items
      .filter((i) => i.vector !== null)
      .map((item) => {
        const similarity = cosineSimilarity(queryVector, item.vector!);
        // Boost by impact and severity (same as TF-IDF)
        const impactBoost = Math.log10(Math.max(item.metadata.impact_mid, 1)) * 0.02;
        const severityBoost = item.metadata.severity === 'critical' ? 0.05 : item.metadata.severity === 'high' ? 0.02 : 0;
        return { item, score: similarity + impactBoost + severityBoost };
      });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).filter((s) => s.score > 0.2).map((s) => s.item);
  } catch {
    // Fall back to TF-IDF on any error
    return tfidfSearch(items, query, topK);
  }
}

// ── TF-IDF Search (fallback) ────────────────

function tfidfSearch(items: EmbeddedItem[], query: string, topK: number): EmbeddedItem[] {
  const queryTokens = tokenize(query.toLowerCase());

  const scored = items.map((item) => {
    let score = 0;
    for (const qt of queryTokens) {
      for (const it of item.tokens) {
        if (it === qt) score += 3;              // exact match
        else if (it.includes(qt)) score += 1;   // partial match
        else if (qt.includes(it)) score += 0.5; // reverse partial
      }
    }
    // Boost by impact (higher impact = more relevant)
    score += Math.log10(Math.max(item.metadata.impact_mid, 1)) * 0.5;
    // Boost by severity
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

export function hasVectorEmbeddings(orgId: string): boolean {
  const items = embeddingCache.get(orgId);
  return !!items && items.some((i) => i.vector !== null);
}

export function clearEmbeddings(orgId: string): void {
  embeddingCache.delete(orgId);
}

export function getEmbeddingMode(): 'vector' | 'tfidf' {
  return isVectorMode() ? 'vector' : 'tfidf';
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
