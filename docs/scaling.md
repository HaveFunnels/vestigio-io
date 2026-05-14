# Scaling Playbook

A living document for how Vestigio scales from 1 customer to 10k. Every strategy in here is documented with **what it solves**, **what it costs**, **where the gain lives**, and **when to pull the trigger**. The order in §1 is what we recommend tackling next from today's position; ROADMAP.md Wave 17 is the catalog without prioritization.

This document is for the developer making the next "what should I build next?" call. If you're reading it because something is on fire, jump to §3.

---

## TL;DR — which strategy gives the biggest gain right now?

**C3 — OpenTelemetry observability.** Counter-intuitive given it's labeled "Tier C" in the original plan, but here's why it dominates today's leverage curve:

1. We have 1 paying customer. A/B-tier infra optimizations are guessed-against-theory until we measure.
2. Every future scaling decision (B1, B3, anything) is informed by real numbers (queue depth, p95 cycle time, DB pool wait, RAM trajectory). Without those, we're pattern-matching on the audit report.
3. The gap to next visibility tool (currently raw Railway logs + grep) is huge. After OTel: dashboards + alerts + traces. Force multiplier.
4. Recovery time when something does break drops 10x. That's the kind of compound improvement you want EARLY.

After observability is live, the next-best by absolute capacity gain is **B1 (S3 evidence tiering)** because it removes the hardest-to-undo cliff (data migration becomes painful at scale).

---

## §1 Current capacity & what's been done

**Today's setup** (post Wave 5 Fase 2 + Wave 17 partial):

```
Web (vestigio-io, 1 replica)   ──┐
                                  ├──► PgBouncer (transaction pool, 1000 client / 20 backend) ──► Postgres
Worker (audit-worker, 3 replicas)─┘                                    ▲
                                                                      │
                                  Each worker replica:                │
                                   - AUDIT_WORKER_CONCURRENCY=2       │
                                   - RECOMPUTE_USE_WORKER_THREADS=1   │
                                   - 2 V8 isolates for engine recompute
                                                                      │
                                  Redis queue (hot/warm/cold tiers, env-locks, org cap=3)
```

**Already shipped from the 10k plan**:

- **A1** PgBouncer in transaction-pool mode (live, `pgbouncer.railway.internal:6432`)
- **A3** Worker static scaling to 3 replicas (vs. native Railway autoscaling — see "Why static" below)
- **B2** Worker-threads pool for `recomputeAllAsync` (esbuild bundles the worker entry at first spawn; threads reused across cycles)
- Plus all of Wave 5 Fase 2: AuditCycle indices, scheduler cursor pagination, per-org concurrency cap, evidence cap tuning, MCP cross-tenant guards.

**Capacity ceiling** (best estimate, untested at upper end):

| Customer count | State | Confidence |
|---|---|---|
| 0–200 active | Comfortable as-is | High |
| 200–1k | Comfortable with monitoring | Medium |
| 1k–5k | Need **C3 → B1 → B3** | Medium |
| 5k–10k | Need all of Tier A/B/C done | Low (untested) |
| 10k+ | Multi-region considerations open up | Speculation |

Why "Why static" for A3: Railway native autoscaling is CPU-based with a 30-60s reaction time. For our workload (cycles take 1-3 min each, queue arrives in bursts hourly), static 3-replica is more predictable. Eliminates cold-start latency. When sustained 50+ concurrent cycles becomes the norm, revisit and switch to autoscaling.

---

## §2 Strategy detail — every lever, sorted by ROI from today's position

### 🥇 C3. OpenTelemetry observability

**What it solves**
We are scaling on theory, not data. Every Wave 17 item is justified by the original audit report ("this breaks at N customers"), but we have no way to spot the actual bottleneck before it cascades.

**What it costs**
2-3 days for a baseline setup (audit-runner + web tier instrumentation, span propagation, exporter to Grafana Cloud free tier or Datadog $0/host trial). Additional 1-2 days for custom metrics (queue depth, recompute duration, pool utilization).

**What it unlocks**
- p95/p99 cycle duration **per pack** (do `payment_health` cycles really take longer than `revenue_integrity`?)
- Queue depth time series — see saturation forming hours before it hurts
- DB pool wait time on PgBouncer (`wait_us` is already in pgbouncer logs but unparsed)
- Recompute duration broken into the 8 phase yields we instrumented in `recomputeAllGen`
- Per-org cost attribution (which customer's audits cost the most CPU?)
- Trace traversal: layout request → MCP lookup → finding render. Where does the 500ms go?

**Where it bites first today**
Already biting. Every issue we've debugged in the last 2 weeks involved grepping raw logs.

**How it ships**
1. `@opentelemetry/sdk-node` in audit-runner + Next.js. Auto-instruments HTTP, Prisma (via `@prisma/instrumentation`), Redis.
2. Custom spans around `recomputeWithPool`, `loadLatestCycle`, the 8 phases of recompute.
3. Custom metrics: `vestigio.queue.depth{tier}`, `vestigio.cycle.duration{pack,phase}`, `vestigio.recompute.threads.busy`.
4. Exporter: Grafana Cloud (free tier, 50GB metrics) or Honeycomb (free tier, 20M events).
5. Dashboards live on the web admin route once we have the data flowing.

**Recommended even before more customers**: yes. Stop guessing.

---

### 🥈 B1. S3 tiering for evidence payloads

**What it solves**
Evidence rows can hit 100KB each (ContentEnrichment payloads, off-site recon HTML extracts). At 1000+ cycles/week on heavy sites, the Evidence table grows past 10GB quickly, `loadLatestCycle` consumes 1GB+ of RAM, and Postgres queries on JSONB payloads slow down.

**What it costs**
3-4 days. Largest item before this gets dramatically harder (data migration of existing rows).

**What it unlocks**
- Postgres rows stay ~1KB (metadata only) regardless of payload size
- `loadLatestCycle` reads only metadata, then lazily fetches S3 for inferences that actually use the body
- 80%+ reduction in Postgres storage cost
- Evidence cap can be raised from 20k to ~100k rows without RAM impact

**Where it bites first**
First customer with a 10k-page site that produces 15k+ evidence rows. The 20k cap will trim oldest rows (off-site recon), which is usually safe but not always.

**How it ships**
1. Add `evidencePayloadUrl: String?` column to Evidence table. Existing rows keep `payload`.
2. New write path: if payload >8KB, upload to S3 (R2 / Cloudflare R2 is cheapest for us, already in use for assets), store URL in `evidencePayloadUrl`, leave `payload` empty.
3. New read path: if `evidencePayloadUrl` is set, lazy-fetch S3 only when accessed.
4. Background migration: trickle existing heavy payloads to S3, drop from PG. Optional.
5. Update Wave 16 projections cache so it doesn't include heavy payloads (already mostly true).

**Why it ranks here**: hard to do later because existing data needs migration. The longer we wait, the more rows to move. Strategic timing now.

---

### 🥉 A2. Per-request MCP context (real fix for singleton)

**What it solves**
The MCP server is a `globalThis` singleton. Wave 5 Fase 2 added a serialization mutex (`_ensureContextChain`) as a tactical fix. Real fix: replace the singleton with a per-request factory keyed by envRef. Eliminates cross-tenant contamination entirely.

**What it costs**
2-3 days. Touches every MCP read site (mcp-client wrappers) and the layout's `ensureContext` flow.

**What it unlocks**
- Multiple orgs render their dashboards in parallel without serializing on the mutex
- Verification orchestrator state per-env (currently shared)
- Cache hit rate goes way up because each env has its own context vs. clobbering

**Where it bites first**
When the cache fast-path miss rate increases. Today it's near 0% because every completed cycle writes a fresh `projectionsCache`. If that ever breaks (LLM enrichment failure leaves cache null), the legacy fallback fires for every request and the singleton becomes hot.

**How it ships**
1. Change `MCPServer.context: EngineContext | null` to `contextByEnv: Map<string, EngineContext>`.
2. Add LRU eviction at ~50 entries (~10GB RAM at worst case).
3. `getContext(envRef)` instead of `getContext()`. Update all callers (mcp-client wrappers + tools).
4. Remove `_ensureContextChain` mutex once verified.

---

### B3. Postgres read replica

**What it solves**
Web tier's `loadProjectionsCacheForEnv` is the dominant read pattern (every page load). Today it hits primary Postgres. Routing this to a read replica halves primary load and unblocks scaling primary writes.

**What it costs**
1 day. Railway has Postgres replica feature (Pro plan). Then route Prisma reads via the `directUrl` mechanism for the cache load path.

**What it unlocks**
- Primary Postgres handles only writes + transactions
- Read query latency drops (replica is local to web service)
- p95 page load drops by 100-300ms

**Where it bites first**
At ~50 page renders/sec sustained. Today we serve ~1/sec.

**How it ships**
1. Railway dashboard: clone the Postgres service as a read replica.
2. Add `DATABASE_REPLICA_URL` env on web.
3. In `loadProjectionsCacheForEnv`, swap the Prisma instance for a replica-bound one. Other queries stay on primary.
4. Lag monitoring: alert if replica lag > 5s (mostly cache reads can tolerate this).

---

### B2-bis. Worker-threads pool — extension

**What we have**: 1 thread per cycle, up to `AUDIT_WORKER_CONCURRENCY=2` threads per worker process.

**What we could do next**: increase `AUDIT_WORKER_CONCURRENCY` (currently 2) and `RECOMPUTE_POOL_SIZE` (defaults to same). Each thread is ~150MB warm. Railway worker has 24 GB plan limit, so we could go to 6-8 concurrent cycles per worker without RAM pressure — but we'd saturate Chromium pool (3 browsers) and Prisma backend pool (20 conns).

**Recommendation**: don't bump until Chromium pool also grows. They're coupled.

---

### C1. Queue priority aging

**What it solves**
A backlog in the `hot` tier can starve `warm` and `cold` indefinitely. When 50+ customers all have hourly hot cycles, the `cold` tier (weekly baselines) never runs.

**What it costs**
1 day.

**What it unlocks**
Long-tail customers' cold baselines actually complete. Maintenance audits don't silently disappear.

**Where it bites first**
When `hot+warm` sustained queue depth > 50 for hours. Today we max out at 2-3 items in queue total.

**How it ships**
Every 10 minutes, scan the head of `cold` and `warm`. If a cycle has been queued > N hours, promote one tier up. Simple Redis `LRANGE` + `RPOPLPUSH` script.

---

### C2. Per-org daily cycle quota

**What it solves**
We have a per-org concurrency cap (`ORG_CYCLE_CAP=3`). Doesn't stop a buggy integration from triggering 100 sequential cycles in a day, blowing the customer's plan budget.

**What it costs**
1 day. Add a Redis counter with daily TTL, check on cycle enqueue.

**What it unlocks**
- Bug-driven cycle storms can't burn 10x plan budget
- Cleaner billing story
- Defense against compromised customer accounts spinning up cycles

**Where it bites first**
First time a customer's webhook integration loops and enqueues constantly. Probably never for us, but it's a 1-day insurance policy.

---

### D1. RawBehavioralEvent matview

**What it solves**
Every cycle ends with a `SELECT url, COUNT(DISTINCT sessionId) FROM RawBehavioralEvent WHERE envId=? AND occurredAt >= now()-30d GROUP BY url`. As behavioral events grow, this scan dominates cycle duration.

**What it costs**
1 day.

**What it unlocks**
Cycle duration drops by ~10-30% on envs with heavy behavioral data.

**How it ships**
- Create a materialized view `mv_behavioral_session_counts_30d (envId, url, session_count)` refreshed every 10 minutes via cron.
- Cycle reads the matview (indexed, instant).

**Where it bites first**
When a single env has 10M+ raw events.

---

### D2. EnvLock TTL reduction

**What it solves**
EnvLock TTL is 15 minutes. If a worker crashes mid-cycle, the env stays locked for 15min before another worker can pick it up. That's a long stall.

**What it costs**
0.5 day. Reduce TTL to 5min, add graceful-shutdown handler to release locks on SIGTERM (already partially there).

**What it unlocks**
Faster recovery from worker crashes. Customer impact: cycle delay drops from 15min to 5min worst case.

---

### D3. Scheduler partitioning

**What it solves**
At 50k envs, the scheduler tick has to enumerate all 50k every hour to find which are due. Even with cursor pagination, that's a lot of DB I/O.

**What it costs**
1 day. Add hash-based partitioning: each tick handles `org_id % N == hour % N`. Reduces per-tick scan size by N.

**Where it bites first**
At 10k+ active envs. Today we have ~5.

---

### D4. Notification dispatcher queue

**What it solves**
Brevo API can be slow. The notification dispatcher cron blocks on slow Brevo responses, potentially delaying the next tick.

**What it costs**
1 day.

**Where it bites first**
First time Brevo has a 5-min outage and 100+ notifications back up.

---

## §3 If something is on fire right now

### "Cycles are stuck in `pending`"
1. Check worker logs: `railway logs --service audit-worker | grep "worker-loop starting"` → confirm 3 replicas are alive.
2. Check Redis queue depth: should be > 0 if cycles are enqueued. If 0, check the scheduler ran (`audit-scheduler` log lines).
3. Check env-locks: if a worker crashed, lock is held for 15min. Manual release: `DEL vestigio:auditq:envlock:{envId}` in Redis.

### "Database connection refused / pool exhausted"
1. Check PgBouncer logs for backend errors.
2. PgBouncer pool size is 20 backend. Bump `DEFAULT_POOL_SIZE` if sustained > 80% utilization in pgbouncer stats.
3. If PgBouncer itself is down (replica crashed), set `DATABASE_URL` back to direct Postgres temporarily.

### "Worker process OOM"
1. Bump replica memory limit on Railway (we have 24 GB plan limit).
2. Reduce `AUDIT_WORKER_CONCURRENCY` from 2 → 1.
3. Reduce `EVIDENCE_HARD_CAP` (default 20k) by 5k.

### "Cross-tenant data leak (HYPOTHETICAL)"
1. Check `mcp-server` logs for "cross-tenant context swap detected" warnings.
2. Layout already guards this — renders loading state instead of wrong data.
3. Real fix: implement A2 (per-request MCP context).

---

## §4 Anti-patterns to avoid

- **Don't shard Postgres prematurely.** Single Postgres + PgBouncer + read replica gets to ~5k customers. Sharding is a one-way door.
- **Don't move to SQS/Kafka yet.** Redis lists + env-lock handle this scale. The migration cost would be ~2 weeks of work with zero capacity gain at our current size.
- **Don't replace Prisma.** PgBouncer + role-aware pool sizing covers the connection issue without changing the ORM.
- **Don't run engine workers in Lambda/Vercel functions.** Cycles take 1-3min and are stateful. Long-running containers (Railway / Render / Fly) is correct.
- **Don't run a cycle in-process on the web tier.** The dispatch guardrail blocks this in prod; respect it. If you find yourself disabling `ALLOW_IN_PROCESS_AUDIT_FALLBACK`, fix the worker instead.
- **Don't add observability and then ignore it.** If you ship OTel, set up at least one alert (queue depth > 100 sustained 10min) on day one. Dashboards-only is decoration.

---

## §5 Decision log

When we picked a path here that contradicts the obvious, the reasoning is below.

**Static 3-replica worker vs. native autoscaling**: Native autoscaling reacts in 30-60s on CPU thresholds. Our cycles take 1-3min and arrive in hourly bursts. By the time autoscaling reacts, the burst is half-done. Static 3 replicas have hot V8 isolates ready for the next batch with zero spawn cost.

**worker_threads bundle via esbuild at runtime vs. pre-build step**: Pre-build would have meant changes to the Dockerfile + adding a build step to the worker service. Runtime bundling on first spawn is ~150ms one-time cost, gets cached for process lifetime. We chose simpler operationally over slightly faster startup.

**PgBouncer transaction mode vs. session mode**: Session mode breaks Prisma's connection multiplexing (each Prisma client gets a sticky connection). Transaction mode requires `?pgbouncer=true` flag (disables prepared statements) but actually multiplexes properly. Trade-off: ~5% per-query overhead for no prepared statements, ~10x effective backend pool reuse.

---

Last updated: 2026-05-14. Update this doc when shipping any Tier A/B/C/D item or when the customer count crosses a tier boundary (200, 1k, 5k, 10k).
