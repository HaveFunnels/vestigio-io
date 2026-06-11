# Silent Failures Audit — 2026-06-09

> Terceira passada de investigação focada em skips silenciosos, ramos
> mortos, erros engolidos e gates por env var não cobertos pelas duas
> investigações anteriores (`docs/surface-audit-investigation.md` +
> `AUDIT_ARCHITECTURE.md`). Escopo: pipeline crítico de audit
> (`workers/`, `apps/audit-runner/`, `packages/workspace`,
> `packages/signals`, `packages/inference`, `packages/projections`,
> `packages/evidence`).

## Summary

10 achados reais + 4 falsos alarmes descartados (URL parsers de
fallback benignos, etc.). Os três de maior impacto:

1. **Gate de `cycle-modes.resolveCriticalSurfaces` engole DB-error e
   retorna `Set` vazio** → ciclo `hot` rodaria sem nenhum alvo,
   parecendo completar com zero findings em vez de marcar falha
   (`apps/audit-runner/cycle-modes.ts:182,225`).
2. **`DKIM` check em `static-checks.ts:145` engole o `dns.resolveTxt`
   completo sem emitir sinal `unknown`** — divergindo de SPF/DMARC
   (que emitem confidence=50). Cliente com TODOS os 7 seletores DKIM
   fora dos comuns + DNS lento perde o achado inteiro.
3. **`STUCK_RUNNING_HEARTBEAT_MS`, `STUCK_RUNNING_PHASE_MS`,
   `EVIDENCE_HARD_CAP`, `ORG_CYCLE_CAP`, `RECOMPUTE_POOL_SIZE`,
   `AUDIT_WORKER_CONCURRENCY`, `META_APP_ID/_SECRET` (legacy alias),
   `ALLOW_IN_PROCESS_AUDIT_FALLBACK`** — 8 env vars que tunam segurança
   operacional do pipeline e **não estão em `.env.example`**. Mesmo
   padrão do `BRAVE_SEARCH_API_KEY` antes da resolução: novo deploy
   nunca sabe que pode ajustar.

---

## A. Silent catch swallows

### A1. `mini-audit-findings.ts:1763-1769` — detector loop swallows ALL throws

```ts
const detected: MiniFinding[] = [];
for (const fn of detectors) {
    try {
        const result = fn(input);
        if (result) detected.push(result);
    } catch {
        // Per-detector failure is non-fatal — keep going.
    }
}
```

**O que esconde**: 40+ detectores (vertical detectors, enterprise
B2B detectors, services detectors, app conversion detectors) — um
único `TypeError` num detector novo (ex: `input.business?.foo.bar`
quando `foo` chega `null`) some sem trace nenhum. Reduz silenciosamente
o conjunto de findings que o landing page mostra ao prospect, sem
`console.warn`. Mesma estrutura em `:1777-1783` para os positivos.

**Veredicto**: **suspicious**. Mini-audit é a primeira impressão paga
pelo customer. Detector que silenciosamente para de emitir é
exatamente o caso onde queremos logar (sem rethrow) — `console.warn`
com `fn.name` + `err.message` daria observabilidade sem cair.

### A2. `apps/audit-runner/cycle-modes.ts:182` — `resolveCriticalSurfaces` engole DB error

```ts
} catch {
    // best-effort — returning an empty set means hot becomes a no-op
    // which is safer than crashing the scheduler
}
```

**O que esconde**: `prisma.pageInventoryItem.findMany` falhando (pool
exausto, statement_timeout, connection drop). O comentário diz
"safer than crashing" — mas o efeito real é: ciclo `hot` é
despachado, `url_filter` fica `[]`, pipeline staged retorna
`candidates.length === 0`, `recompute` roda com evidence zerada,
ciclo completa com `status='complete'` e zero findings.

**Veredicto**: **dangerous**. Já temos o `stampCycleError` em
`run-cycle.ts:69`. Aqui o catch deveria pelo menos `console.warn` +
re-throw (heal-cron pega) OU stampar `lastError` para o dashboard
acusar. Mesma classe que a `Surpresa Wave 18g` que o autor já corrigiu
em `run-cycle.ts:604` ("Wave 18g — evidence persistence is now FATAL").

### A3. `static-checks.ts:145` — DKIM check engole `resolveTxt` falha total

```ts
} catch {
    // Silently skip on complete DNS failure
}
```

**O que esconde**: Se a query DNS de TODOS os 7 seletores DKIM falhar
(DNS server timeout, rate-limit), **nenhum signal é emitido** — nem o
"unknown confidence=50" que SPF (linha 97-110) e DMARC (linha 169-181)
emitem em caso paralelo. Inconsistência: cliente vê SPF=unknown e
DMARC=unknown mas DKIM totalmente ausente do report.

**Veredicto**: **dangerous + inconsistency**. Emitir o
`dkim_record_missing` value=`unknown` com `confidence: 50` para
matching com os outros dois checks. Hoje DKIM falha silenciosamente.

### A4. `run-cycle.ts:1247-1249` — translations swallow

```ts
} catch {
    translations = undefined;
}
```

**O que esconde**: Falha em carregar `loadEngineTranslationsForLocale`
silenciosamente força engine a usar fallback pt-BR padrão. Customer
locale=es-MX pode receber findings em português sem indicação de que
o owner.locale lookup quebrou.

**Veredicto**: **suspicious**. Locale-mismatch silencioso é
observavelmente o tipo de bug que customer reporta sem reproduzir.
Loggar `console.warn` aqui custa nada.

### A5. `run-cycle.ts:1719` — funnel pathname stamping swallow

```ts
try { byPath.set(new URL(page.normalizedUrl).pathname, mult); } catch {}
```

E `:1726-1728`:
```ts
} catch {
    // Non-fatal — proceed without funnel multipliers
}
```

**O que esconde**: Se `funnelModel.stageDefinitions` for JSON
malformado (escrita parcial / migration ruim), `funnelMultipliers` fica
`undefined` e Impact Engine usa `default: 1.0` para tudo — ou seja, **o
peso por estágio de funil silenciosamente some**. O cliente pagante
de Funnel Lens vê findings com impacto homogêneo.

**Veredicto**: **dangerous**. Impacto direto no produto pago. Mínimo:
`console.warn` quando o catch dispara — operador correlaciona com
"customer reclamou que valores ficaram estranhos".

---

## B. Early-return drop paths

### B1. `recompute-pool.ts:265-270` — `RECOMPUTE_USE_WORKER_THREADS` flag stuck off

```ts
if (process.env.RECOMPUTE_USE_WORKER_THREADS !== "1") {
    const { recomputeAllAsync } = await import("../../packages/workspace");
    return await recomputeAllAsync(input, onPhase);
}
```

Já catalogado em `AUDIT_ARCHITECTURE.md` que o worker_threads path
dropa `onPhase`. Mas o ponto **adicional** que vale registrar: a env
var **não está em `.env.example`** e o default produção é "in-process",
ou seja, todo o esforço de codificar o pool (`spawnWorker`,
`onMessage`, `getOrBuildWorkerBundle`) **está parado para todos os
deploys** desde que foi escrita. Próximo wave de scaling não vai
encontrar o knob para ligar.

**Veredicto**: dead-code-ish. Documentar a env var ou remover o pool.

### B2. `process-behavioral.ts:104` — empty rows returns silently

```ts
if (rows.length === 0) {
    return { evidence: [], sessionCount: 0, eventCount: 0 };
}
```

Sozinho é benigno. **Combinado com** `run-cycle.ts:1294` (que checa
`behavioral.evidence.length > 0` para fazer `addMany`), produz
silêncio total quando o pixel não está fluindo eventos. Sem nenhum log
indicando "raw_behavioral_event vazio para `env={id}` na janela de
30d" — ops não sabe se é "cliente novo sem tráfego" ou "snippet do
pixel quebrou na home". Já vimos esse padrão morder em produção (vide
comentário Wave 5 Fase 3 fix #1 sobre `WINDOW_DAYS` swallow).

**Veredicto**: **suspicious** — emitir um `console.log` informativo
("no behavioral events in window for env X") seria o mínimo para
diagnosticar customer com pixel quebrado.

---

## C. Undocumented env-var gates

Variáveis encontradas no código mas **ausentes** de `.env.example` e
sem doc dedicado em `docs/`. Padrão idêntico ao `BRAVE_SEARCH_API_KEY`
que já foi resolvido — operador acaba descobrindo por leitura de
código apenas.

| VAR | Code (file:line) | `.env.example`? | Doc? |
| --- | --- | --- | --- |
| `AUDIT_WORKER_CONCURRENCY` | `worker-loop.ts:72`, `recompute-pool.ts:57` | ❌ | ❌ |
| `WORKER_HEARTBEAT_MS` | `run-cycle.ts:258` | ❌ | ❌ |
| `WORKER_SHUTDOWN_GRACE_MS` | `worker-loop.ts:81` | ❌ | ❌ |
| `WORKER_HEALTH_PORT` | `worker-loop.ts:430` | ❌ | ❌ |
| `STUCK_RUNNING_HEARTBEAT_MS` | `run-cycle.ts:2695` | ❌ | comentado inline |
| `STUCK_RUNNING_PHASE_MS` | `run-cycle.ts:2707` | ❌ | comentado inline |
| `RECOMPUTE_POOL_SIZE` | `recompute-pool.ts:56` | ❌ | ❌ |
| `RECOMPUTE_USE_WORKER_THREADS` | `recompute-pool.ts:265` | ❌ | comentado inline |
| `SURFACE_GATE_MODE` | `packages/workspace/recompute.ts:967` | ❌ | em `surface-audit-investigation.md` |
| `EVIDENCE_HARD_CAP` | `packages/evidence/prisma-store.ts:322` | ❌ | comentado inline |
| `EVIDENCE_WARN_THRESHOLD` | `packages/evidence/prisma-store.ts:324` | ❌ | comentado inline |
| `ORG_CYCLE_CAP` | `apps/platform/audit-cycle-queue.ts:57` | ❌ | ❌ |
| `SCHEDULER_BATCH_SIZE` | `scheduler.ts:150` | ❌ | comentado inline |
| `SCHEDULER_MAX_ENVS_PER_TICK` | `scheduler.ts:151` | ❌ | comentado inline |
| `CHROMIUM_POOL_SIZE` | `verification/chromium-pool.ts:26` | ❌ | ❌ |
| `CHROMIUM_MAX_USES` | `verification/chromium-pool.ts:71` | ❌ | ❌ |
| `META_APP_ID` (legacy alias) | `meta-ads/poller.ts:168` | ❌ | ❌ |
| `META_APP_SECRET` (legacy alias) | `meta-ads/poller.ts:169` | ❌ | ❌ |
| `ALLOW_IN_PROCESS_AUDIT_FALLBACK` | `src/libs/audit-dispatch.ts:32` | ❌ | inline |

**Risk**: 8 destas são **safety knobs operacionais**
(`STUCK_RUNNING_*`, `EVIDENCE_HARD_CAP`, `ORG_CYCLE_CAP`,
`SCHEDULER_MAX_*`). Quando customer paga `Max` plan e tem 60min de
audit legítimo, o sysadmin precisa saber que `STUCK_RUNNING_PHASE_MS`
existe para esticar o cutoff. Hoje só descobre cavando código.

**Recommendation**: adicionar bloco `# ── Audit Runner Tunables
[OPTIONAL] ──` ao `.env.example` com os 16 vars críticos + comentário
do default.

---

## D. TODO/FIXME/HACK em código crítico

Grep por `TODO|FIXME|HACK|XXX` em `workers/`, `apps/audit-runner/`,
`packages/{workspace,signals,inference,projections,evidence}/`
retornou **zero** matches em comentários de código (matches encontrados
são apenas strings em `remediation-catalog.ts` no sentido de "todos os
canais" em pt-BR ou "TODOS custos").

**Veredicto**: ótimo sinal de higiene — a equipe não está deixando
TODOs no caminho crítico. O custo de não ter TODOs é que algumas
ambiguidades viram silent-catches (vide Seção A).

---

## E. Dead branches

### E1. `RECOMPUTE_USE_WORKER_THREADS` worker-threads path (vide B1)
Existe, mas o env-var nunca está set em produção → todo o pool é
código morto silencioso.

### E2. `setAuthPlaywrightMode` / `setPlaywrightMode` modo `'simulated'`
`workers/verification/executors.ts:292`,
`workers/verification/browser-worker.ts:50` — modo "simulated" para
testes. Em produção sempre 'auto'. Não é dead-branch perigoso, é test
hook legítimo. **Veredicto**: ok.

### E3. `STUCK_RUNNING_AFTER_MS = 25 * 60 * 1000` (run-cycle.ts:2687)
Comentário explícito: "LEGACY-ONLY cutoff. It only catches cycles that
have `lastHeartbeatAt IS NULL`". Após Wave 18z todos os ciclos novos
têm heartbeat → este cutoff só catch um subconjunto vazio em prática.
**Veredicto**: dead-branch documentado. Remover quando o autor tiver
confiança que zero ciclos pré-Wave-18z restam.

---

## F. Field-never-populated branches

Nada novo a registrar nesta passada — as duas investigações anteriores
já cobriram os enums mortos (`PlaywrightRender`, `BehavioralEvent`,
`IntegrationSnapshot`, `SurfaceVitality`).

**Observação adjacente** que vale registrar:
`f.surface` em `cycle-modes.ts:213` é tratado opcional (`if (!f.surface)
continue`) — apesar do schema Prisma marcar a coluna como NOT NULL
para `Finding`. Provavelmente legacy rows pré-Wave 20.4. Defensivo,
mas vale auditar e ou (a) garantir backfill, ou (b) remover o
defensive check.

---

## G. External API calls sem error handling

### G1. `meta-ads/poller.ts:199` — `graphGet` sem try/catch no caller

```ts
const insightsRes = await graphGet<InsightsResponse>(
    `/${accountId}/insights?fields=spend,...`,
    activeToken,
);
```

Não há try/catch ao redor da chamada — depende do `graphGet`
internamente capturar. Se `graphGet` jogar (network error, 5xx do
Facebook), o poller toda crasha. O caller em `run-cycle.ts:1418` ESTÁ
em try/catch, então o ciclo não morre. Aceitável apenas porque
caller-side wrapper existe.

**Veredicto**: aceitável mas frágil — se alguém chamar `pollMetaAdsData`
em contexto sem try/catch (ex: futuro test runner, MCP tool), a
chamada quebra. Considerar wrap-and-return-`{ ok, data, error }`
padrão dos outros pollers (vide `google-ads/poller.ts:81`).

### G2. `brand-intel/scanner.ts:147` — fetch com timeout só via AbortController

```ts
const response = await fetch(`https://${rootDomain}`, {
    signal: controller.signal,
    headers: { 'User-Agent': 'Vestigio-BrandIntel/1.0' },
});
```

Caller-side `try/catch` na linha 161 captura — ok. Sem retry. Domínio
de cliente que retorna 500 esporadicamente no primeiro hit nunca tem
o `fetchRootMeta` populado e o score cai para domain-only signals.
Não dangerous (degrada graceful) mas vale documentar.

---

## H. Nullable-treated-as-required

### H1. `apps/audit-runner/run-cycle.ts:535` — `manualSeedCap` cast unsafe

```ts
const manualSeedCap =
    (cycle.organization as { manualSeedCap?: number }).manualSeedCap ?? 200;
```

`as { manualSeedCap?: number }` confia que campo existe no schema
mesmo quando o tipo Prisma gerado provavelmente não o expõe (legacy
migration). Se Prisma rename ou drop, `manualSeedCap` vira `undefined`
silenciosamente → defaults para 200. Não vai NPE mas hide schema drift.

**Veredicto**: minor. Vale tipar o select explicitly.

### H2. `engine.ts:3864` — `p.cta_viewed_count > 0 && p.cta_clicked_count >= 0`

```ts
if (p.cta_viewed_count > 0 && p.cta_clicked_count >= 0) {
```

`p.cta_clicked_count` tipado como `number` mas se vier `undefined`
do `BehavioralSessionPayload` (locale de payload velho sem o campo),
`undefined >= 0` é `false` — o branch nunca dispara. Não NPE mas
silently dropa o sinal `cta_viewed_no_engagement` para payloads
parciais.

**Veredicto**: borderline ok. Schema do payload deveria garantir
default 0 no producer, não no consumer. Tracking issue se reportes
de "CTA tracking sumiu" pintarem.

---

## I. Patterns observed

1. **Cycle de hardening em ondas (Wave 18g, 18m, 18z)** já corrigiu
   silent-catches **dentro** do pipeline persistente (evidence persist
   é fatal, behavioral re-persist é fatal). Mas a mesma disciplina não
   atravessou para **upstream** do pipeline (DKIM check engole
   completamente, `resolveCriticalSurfaces` falha silenciosa, mini-audit
   detector loop sem log) nem para **side-channels** (Shopify integration
   secundário logs OK, mas `.catch(() => {})` em cache writes nas seis
   enrichment passes silenciam falhas de I/O do cache).

2. **`process.env` lookups inline + sem `.env.example`** é o padrão
   recorrente. Cada nova safety knob (`STUCK_RUNNING_PHASE_MS` veio na
   Wave 22.6, `EVIDENCE_HARD_CAP` veio depois de OOMs) é adicionada
   onde é consumida mas nunca propagada para `.env.example`. Recommendation
   sistêmica: code review checklist com "se `process.env.X` é novo,
   adicione X em `.env.example`".

3. **URL `try { new URL(...) } catch { return null }` é universal e
   benigno** — encontrado em 30+ lugares com mesmo padrão de fallback.
   Pad-eliminado desta investigação para não saturar o report.

---

(Total: 10 findings reais distribuídos em A, B, C, E, G, H.
Total de descobertas com inclusão de meta-pattern observations: 12.)
