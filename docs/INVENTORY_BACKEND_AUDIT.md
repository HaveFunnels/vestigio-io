# Inventory Backend/Pipeline — Deep Audit

**Generated:** 2026-05-11
**Overall Score:** 4.7/10 — Funciona em sites pequenos, quebra sob complexidade real

## Scores por dimensão

| Dimensão | Score | Severidade |
|---|---|---|
| 1. URL Normalization & Dedup | 4/10 | 🔴 CRITICAL |
| 2. Discovery Coverage | 5/10 | 🔴 HIGH |
| 3. Crawl Budget | 7/10 | ⚠️ MEDIUM-HIGH |
| 4. Classification Accuracy | 6/10 | ⚠️ MEDIUM |
| 5. Evidence → Inventory | 5/10 | 🔴 CRITICAL |
| 6. Freshness Logic | 3/10 | 🔴 CRITICAL |
| 7. Pipeline Resilience | 4/10 | 🔴 CRITICAL |
| 8. Data Integrity | 5/10 | 🔴 HIGH |
| 9. Performance | 5/10 | ⚠️ MEDIUM-HIGH |
| 10. Observability | 3/10 | 🔴 CRITICAL |

## Top Issues

### 1. Três normalizadores de URL inconsistentes
- `crawl-constraints.ts:177` `normalizeForDedup` — strip UTM
- `staged-pipeline.ts:954` `normalizeUrlForDedup` — strip NOTHING (mantém query)
- `cycle-modes.ts:110` `canonicalizeUrl` — strip query + fragment

Resultado: `/checkout?utm_source=google` ≠ `/checkout?utm_source=fb` no dedup do crawler → silent double-fetch. Allow-list de hot/warm com canonicalização que não bate com inventory persistido (com trailing slash) → silent skip.

### 2. Freshness é cargo-culted
- `freshnessAge` no schema, **nunca populado**
- `freshnessState` setado mas nunca lido pra decidir re-crawl
- 404 marcado "stale" pra sempre, sem distinção de "consistently 404"

### 3. Non-HTML cria orphan inventory
PDF, JSON, ZIP fetched com 200 → entram no inventory como "validated" sem PageContent evidence. Engine acha que é uma página normal.

### 4. Classification sobre-pondera regex
`/api/checkout/webhooks` classifica como "checkout" porque path tem `/checkout`. Agreement ratio floor de 0.5 deixa votos conflitantes produzirem confidence ~37%.

### 5. Pipeline resilience: orphan evidence
Evidence persistida + classification falha (line 574 catch) → cycle continua → pages 1-249 classified, 250+ unclassified.

### 6. Observability mínima
- Nenhum log de quais URLs foram skipped
- HTTP fetch errors silenciosamente coletados em array nunca logado
- Cloudflare blocking: evento emitido mas cycle continua sem flag

### 7. N+1 evidence lookup
`run-cycle.ts:445-460` loops todas evidências por página. 500 pages × 100 evidence = O(N²) scan.

### 8. Sitemap index não suportado
`parseSitemapUrls` falha em multi-file sitemaps. Sites grandes (com `/sitemap-index.xml` apontando para 10 sitemaps) crawl só o primeiro.

### 9. Robots.txt fetched mas nunca parsed
`tryFetchMeta` baixa `/robots.txt` e ignora. Disallow rules não respeitadas.

### 10. Race condition em evidence_key
`nextId()` usa `Date.now() + counter`. Dois workers paralelos podem gerar mesmo key → unique violation.

## Anti-patterns

1. **Regex-first classification** — regex é o único signal sempre disponível, virou primário em vez de tiebreaker
2. **State scattered** — pageType (regex), classifiedPageType (multi-signal), Evidence.freshnessState — 3 fontes da verdade
3. **Carry-forward sem verification** — clona evidence sem checar hash de origem
4. **JSON-as-Text payload** — re-parsing JSON em cada lookup, fragile e lento

## Features faltando (vs Screaming Frog/Sitebulb)

- JavaScript execution (SPAs vistas como blank)
- Form submission (multi-step checkouts não descobertos)
- A/B test variant awareness
- Multi-language/geo variants
- Custom exclusion patterns
- Pagination strategies ("load more", numbered)

## Plano de fixes neste ciclo

✅ Unificar URL normalization (single source of truth)
✅ Populate freshnessAge em todo upsert
✅ Non-HTML detection (mark PDFs/assets como `pageType: "asset"`)
✅ Classification: regex pattern boundary fix
✅ N+1 evidence lookup → indexar por URL uma vez
✅ Pre-compile parser regex (module scope)
✅ Hash check antes de carry-forward
✅ Per-cycle telemetry logs
✅ Robots.txt parsing (Disallow + Sitemap directives)
✅ Sitemap index support

## Diferido (próximos sprints, requer design)

- Transactions cross-step (evidence + classification + findings)
- Orphan cleanup cross-cycle
- JS execution via Playwright integration
- Form submission flows
- Custom exclusion patterns
