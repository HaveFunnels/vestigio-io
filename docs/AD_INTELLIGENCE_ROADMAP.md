# Ad Intelligence — Roadmap (Wave 23 P3)

**Status**: not started. Documented here so the next engineer to pick this
up doesn't need to re-derive the design from scratch.

**Why**: customer feedback (havefunnels.com) — competitor analysis hoje
captura homepage + DMARC + pricing + blog cadence. Não captura o que o
concorrente está fazendo em **paid media** — onde mora a maior parte do
investimento de growth. "Concorrente lançou 12 campanhas no Meta esse
mês" é o sinal mais pedido.

**Escopo**: integrar Meta Ad Library + Google Ads Transparency Center.
Detectar ads ativos, contar criativas, extrair landing URLs, comparar
creative tone via LLM contra a copy do próprio cliente.

---

## Por que está fora do escopo desta wave

Implementação requer:

1. **Headless browser automation** (Playwright) — Meta Ad Library e
   Google Ads Transparency Center não têm API pública aberta. Os public
   sites são JS-heavy, scrape com regex é frágil.
2. **CAPTCHA + bot detection handling** — ambos os sites bloqueiam
   user-agents óbvios. Precisa rotation de IP + user-agent + delay.
3. **Async worker queue** — cada query é 5-15s de browser time. Não cabe
   no enrichment pipeline síncrono. Precisa nova fila tipo Redis-backed
   com timeout/retry próprio.
4. **LLM creative analysis** — pra valer a pena, precisa comparar
   creative tone vs cliente. Custo de tokens por análise é ~$0.05.
   Cycle típico de 10 concorrentes × 12 ads/cada = 120 LLM calls = ~$6/
   cycle/cliente. Precisa cost gating + caching agressivo.
5. **Storage** — ad creative images têm que ser persistidas em R2/S3
   pra LLM extrair texto via vision API. Novo bucket + lifecycle policy.

**Estimativa**: 2-3 semanas de engineering full-time.

---

## Phased plan (quando for executar)

### Phase 1 — Meta Ad Library (1 semana)
**API**: https://developers.facebook.com/docs/marketing-api/reference/ads_archive

- [ ] Auth: criar Meta App + token de acesso (precisa de Meta business
      verification — 2-3 dias de ida e volta com a Meta)
- [ ] Endpoint: `GET /ads_archive?search_terms=<brand>&ad_active_status=ACTIVE`
- [ ] Schema novo: `CompetitorAdSnapshot` evidence type com:
      - `ad_id` (Meta's identifier)
      - `creative_url` (R2-stored copy)
      - `ad_creative_body` (text)
      - `start_date`, `end_date`
      - `delivery_status`
      - `total_impressions_range` (Meta returns bucket: 1-1000, 1k-5k, etc)
      - `currency_spend_range`
- [ ] Worker: `workers/ad-intel/meta-scanner.ts` rodando como queue job
      (não inline no enrichment pipeline — async)
- [ ] Cache: 6h por (brand, country) tuple. Meta refresh cycles são
      diários, não precisa hot.

### Phase 2 — Google Ads Transparency Center (1 semana)
**Site**: https://adstransparency.google.com/

Não tem API. Plano:

- [ ] Playwright pool dedicado pra esse scraper (CAPTCHA-friendly,
      stealth plugin)
- [ ] URL pattern: `/?region=BR&domain=<brand-domain>&hl=pt`
- [ ] Extract: ad creative thumbnails + landing URL + advertiser
- [ ] Rate limit: max 1 query / 30s por IP. Precisa de IP rotation
      via residential proxy (cost ~$0.50/GB)
- [ ] Worker: `workers/ad-intel/google-scanner.ts`
- [ ] Storage: creative images em R2 (~50KB cada)

### Phase 3 — LLM Creative Analysis (1 semana)
**Cost gating**: feature flag `vestigio_ad_creative_llm_analysis`, default off.

- [ ] Vision API call (Claude Sonnet) por creative: extrai headline,
      CTA, tom, dor abordada, target persona
- [ ] Comparison signal: "concorrente X usa angle 'medo de perder
      vendas', você usa 'crescimento agressivo' — gap"
- [ ] New inference key: `paid_media_angle_overlap`
- [ ] Cache: hash do creative URL → reusa LLM output cross-cycle

### Phase 4 — UI surface (3-4 dias)
- [ ] Nova aba no Carteira: "Ads ativos" (entre Clonadores e Concorrentes)
- [ ] Strip mostra: "X ads ativos em N concorrentes este ciclo"
- [ ] Expanded: tabela com creative thumbnail + concorrente + creative
      body excerpt + landing URL
- [ ] Filter chips: por concorrente, por angle (extraído pelo LLM),
      por gasto estimado

---

## Risco/Mitigação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Meta API verification negada (precisa Business + revisão Meta) | Média | Backup: scrape do Meta Ad Library público via Playwright (FB pública sem API) |
| Google AdsTC scraper quebra a cada redesign (mensal) | Alta | Adicionar smoke test rodando 1x/dia + alert; fallback selector strategies |
| CAPTCHA quebra Playwright em prod (Railway IP suspeito) | Alta | Rotation de residential proxies + stealth plugin |
| LLM cost overflow | Baixa-Média | Hard cap por org/mês + feature flag default off pra trials |
| Storage bloat (creatives) | Baixa | R2 lifecycle: delete depois de 90d. Hash dedup. |

---

## O que está pronto (Wave 23 P0-P2)

Já entregue nesta wave:

- ✅ **P0.1**: Cap de concorrentes 10 → 25 (`competitor-fetch.ts`)
- ✅ **P0.2**: Pricing page detection + scrape de tiers + free tier
      detection (`competitor-deep-fetch.ts`)
- ✅ **P1.1**: Favicon byte-hash (SHA256) match pra Clonadores
      (`brand-intel/scanner.ts` + `similarity-scorer.ts`)
- ✅ **P1.2**: Blog content velocity — post count + última data
      (`competitor-deep-fetch.ts` mesmo pass)
- ✅ **P2.1**: Brand tokens estendidos via `Organization.name`
      (`brand-intel-scan.ts`)
- ✅ **P2.2**: Google Safe Browsing cross-check pra clones medium+
      (`brand-intel/safe-browsing.ts`)

P3 (este doc) é o gap restante. Estimar próximo ciclo de planning.
