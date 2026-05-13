# Inventory Module — Transversal Audit

**Generated:** 2026-05-11
**Overall Score:** 5.5/10 — Functional but immature

---

## Scores por Dimensão

| Dimensão | Score | Status |
|---|---|---|
| Data Accuracy | 6/10 | ⚠️ Sem warnings de stale data |
| Performance | 5/10 | 🔴 Sem paginação, O(N×M) matching |
| UX / Info Density | 7/10 | ✓ Bom, falta sort + export |
| i18n Completeness | 6/10 | ⚠️ Banner audit hardcoded |
| Error Handling | 5/10 | ⚠️ Falhas silenciosas em lookups |
| Data Freshness | 4/10 | 🔴 Deltas mockados, treated como real |
| Type Safety | 7/10 | ✓ Bom, 1 unsafe cast |
| Sales Demo Value | 5/10 | ⚠️ Falta journey context |
| Accessibility | 4/10 | 🔴 Sem ARIA, sem keyboard nav |
| Integration | 6/10 | ⚠️ Bom com findings, fraco no resto |

---

## Top 3 Bugs Críticos

### 1. Pagination Missing + O(N×M) Matching = Performance Cliff
- **Impact:** Sites com >1000 páginas: API timeout, browser freeze, OOM
- **File:** `src/app/api/inventory/route.ts:133-156`
- **Fix:** Paginated API + surface_matcher index ou trie lookup

### 2. Silent Failure de Finding/Session Lookups
- **Impact:** Se tables falham, colunas somem silenciosamente. User pensa que não tem dados.
- **File:** `src/app/api/inventory/route.ts:145-181`
- **Fix:** `Promise.allSettled`, warning banner no UI quando falha

### 3. Mocked Period-over-Period Deltas
- **Impact:** Demo mostra "+3 páginas" fake. Prospect pode salvar/gravar e ter métricas falsas.
- **File:** `src/app/app/inventory/page.tsx:619-656`
- **Fix:** Calcular delta real de previous cycle snapshot ou esconder se não tem dados

---

## Top 5 High-Priority Improvements

1. **Sorting** — clicáveis nas colunas (findings, response time, page type)
2. **Pagination + virtual scrolling** — react-window para >500 rows
3. **Response time real** — populate de Evidence.observedAt / HttpResponse latency
4. **Page classification + confidence** — usar `classifiedPageType` que já existe no schema mas não é populado
5. **Real period-over-period** — calcular deltas reais entre cycle snapshots

---

## Schema Fields Não Utilizados

Campos definidos no Prisma mas nunca populados/retornados:
- `freshnessAge` (segundos desde último check)
- `classifiedPageType`
- `classificationConfidence`
- `classificationSignals`

Tech debt — confunde devs e adiciona burden de migration futuro.

---

## Hardcoded i18n Strings

`src/app/app/inventory/page.tsx`:
- L1032-1038: banner de audit ("Audit queued", "Audit in progress")
- L907-911: HTTP status codes (2xx, 3xx, 4xx, 5xx)
- L150-152: `titleCase()` em vez de `t()` para page types
- L367-376: discovery sources

---

## Gaps vs. Competidores

| Feature | Sentry | Datadog | Hotjar | Vestigio |
|---|---|---|---|---|
| Performance Metrics (LCP/FID/CLS) | ✓ | ✓ | - | ✗ |
| Session Count / Heatmap | - | ✓ | ✓ | Null (planejado) |
| Page Dependency Graph | - | ✓ | - | ✗ (maps existem mas separados) |
| Page Template Grouping | - | - | ✓ | ✗ |
| Alert Rules per Page | ✓ | ✓ | - | ✗ |
| Compare Across Environments | ✓ | ✓ | - | ✗ |

---

## Anti-Patterns Identificados

1. **String matching O(N×M)** — `surface.includes(path)` para cada finding/session
2. **Lógica de negócio duplicada** — `COMMERCIAL_PAGE_TYPES` (route.ts) + `getPageTypeStyle` (lib) — sem source of truth
3. **API coupling com UI** — retorna 7 campos null/unused (title, description, response_time_ms, etc.)
4. **Demo mode espalhado** — `isDemoMode()` em 3+ files
5. **Polling em component** — useEffect 3s timer, deveria ser hook ou SSE

---

## Próximas Sprints Sugeridas

### Sprint 1 (1 semana) — Hardening crítico
- [ ] Paginação na API (take/skip, default 100)
- [ ] `Promise.allSettled` para finding/session lookups + UI warning
- [ ] Remover mocked deltas (esconder card até ter dados reais)
- [ ] Mover audit banner strings para i18n

### Sprint 2 (1 semana) — UX & a11y
- [ ] Sort por coluna
- [ ] Export CSV
- [ ] ARIA labels + keyboard nav (dropdowns, drawer, checkboxes)
- [ ] Color contrast fix nos badges
- [ ] Drawer responsive no mobile (90vw)

### Sprint 3 (1-2 semanas) — Diferenciação
- [ ] Populate `classifiedPageType` + confidence
- [ ] Response time real
- [ ] Period-over-period deltas reais
- [ ] Integração com maps ("View Journey" do drawer)
- [ ] Page hierarchy / funnel view
