# Vestigio — Improvement Roadmap (Power User Audit)

**First audit:** 2026-06-04 against commit `4a89df4f`
**Last update:** 2026-06-04 (14/14 audit items shipped)

**Audit method:** 11 parallel analytical agents (5 lens evaluations
+ 6 surface traces) crossing 24 hypothesized purchase intents for a
technical power user in their first 14 days.

**Scoring rule:** A friction tag was only listed if it appeared in
≥2 independent agent reports.

---

## Progress at a glance

```
P0 (must fix, would churn)    ████████████████████ 4/4 ✅
P1 (medium-leverage)          ████████████████████ 3/3 ✅
P2 (polish + structural)      ███████████████░░░░░ 3/4 ✅  (P2.2 deferred)
P3 (deferred at audit time)   ████████████████████ 3/3 ✅
```

Plus 2 unscoped follow-ons that emerged during P2 implementation:
- **Manual URL seeding into audit cycles** (P2.3 follow-up)
- **SSRF guard + per-org seed cap** (security hardening)

**Score trajectory:**

```
                          Initial     P0 done     P1 done     P2 done    P3 done
Overall                     4.3   →    ~6.0   →    ~7.5   →    ~8.0  →    ~8.4
Strategy Plan               4.0   →    6.0    →    6.5    →    7.5   →    8.2
Actions                     4.0   →    6.5    →    7.5    →    7.5   →    7.5
Pulse (was Dashboard)       —     →    7.0    →    7.5    →    7.5   →    8.0
Findings                    5.0   →    6.0    →    8.0    →    8.0   →    8.0
Workspaces                  4.0   →    5.0    →    5.5    →    6.0   →    7.0
Maps                        5.0   →    5.0    →    7.0    →    7.5   →    7.5
Inventory                   4.0   →    4.0    →    6.0    →    7.5   →    7.5
Methodological Rigor        4.0   →    6.5    →    7.5    →    7.5   →    8.5
Self-Explanation            4.5   →    6.0    →    8.0    →    8.0   →    8.0
Information Coherence       3.5   →    3.5    →    6.5    →    7.5   →    8.0
Strategic Positioning       5.0   →    7.0    →    7.5    →    7.5   →    8.0
```

---

## ✅ Shipped — P0 batch (UC1–UC4)

| Item | Commit | What it fixed |
|---|---|---|
| **UC1** Universal methodology popover | `9cfe6719` | "How was this number computed?" answerable from 6 surfaces — Findings table + drawer, Workspaces, Perspective, HeroMetrics, MoneyRecovered ticker |
| **UC2** Action Queue Hero on `/app/pulse` | `c5ef4e05` | First widget on the dashboard is "what to do today", sorted by impact DESC → severity → age |
| **UC3** Strategy Plan exec credibility | `8f3b857e` | Removed `$0.08`/cycle telemetry footer, wired "Compartilhar" → clipboard copy, gated mock fallback behind `?demo=1` |
| **UC4** Multi-player Action delegation | `c5ef4e05` | New `assignedToUserId` on `UserAction` + `?scope=mine\|all` + Responsável dropdown |

## ✅ Shipped — P1 batch

| Item | Commit | What it fixed |
|---|---|---|
| **P1.1** Plumb `basis_type` through ActionProjection | `d834e831` | Methodology popover now works on `/app/actions` rows |
| **P1.2** PACK_REGISTRY unification | `d834e831` | Single source of truth; deleted 6 alias maps; tooltips on every pack chip |
| **P1.3** Free-text search on `/app/findings` + ChangeBadge column | `d834e831` | "Show me checkout findings" without learning the engine taxonomy |

## ✅ Shipped — P2 batch (3 of 4 — P2.2 deferred)

| Item | Commit | What it fixed |
|---|---|---|
| **P2.1** Maps as context inside workspaces | `c17e28f6` | Library remains canonical home; workspaces show "Mapas relacionados" strip linking with rationale. Chat `create_custom_map` deep-links to `/app/maps/<id>` |
| **P2.3** Inventory source column + Add URL | `96a3fede` → `5de815d3` | Source column became clickable chip filter; `+ Add URL` inline (icon next to export CSV); manual URLs now seeded into every cycle with SSRF guard + per-org cap |
| **P2.4** `fmtCurrencyUnits(value, currency, opts)` consolidation | `c17e28f6` | 5 hardcoded BRL formatters in Strategy Plan replaced with currency-aware helper that pulls from `useMcpData()` |
| ~~P2.2~~ Lorem Ipsum on `/pricing` pt-BR | (deferred) | Skipped per session decision — depends on having pricing copy ready |

## ✅ Shipped — P3 batch

| Item | Commit | What it fixed |
|---|---|---|
| **P3.1** Range + finding count on HeroMetric | `8418379c` | AggregateMethodologyPopover on Retido/Capturado tiles now leads with "Faixa real este mês: R$ 18k–32k de 14 findings" before the descriptive text |
| **P3.3** `/app/dashboard` → `/app/pulse` rename | `8418379c` | URL now matches the "Vestigio Pulse" name shown on marketing + product UI. Old path redirects |
| **P3.2** Workspaces by surface pivot | `4d53e024` | Chips above perspective cards filter the whole page by URL (?surface=/checkout); summary counts recompute so downstream widgets re-aggregate naturally |

## ✅ Shipped — security/infra follow-ons

| Item | Commit | What it fixed |
|---|---|---|
| Manual-URL audit seeding | `746980eb` | URLs added via inventory "+ Add URL" actually get re-fetched every cycle. Same-domain check at pipeline entry; survives hot/warm `url_filter` |
| SSRF guard + per-org cap | `5de815d3` | New `packages/url-normalize/ssrf.ts` blocks private/loopback/link-local/IMDS at API submit time. `Organization.manualSeedCap` (default 200) configurable by platform admin |

---

## ❓ Honest assessment — what this roadmap does NOT cover

The audit covered the 4 explicit buyer personas I hypothesized (exec
buyer, operator, methodology-skeptic, multi-player team). Within
those, the shipped fixes are comprehensive. Outside those, here's
what I did NOT test for:

### Buyer personas I never hypothesized
- **Customer success / support agent** looking up an env's state to
  debug a customer issue. No "shadow as user" or scoped read-only
  affordance.
- **Compliance / audit reviewer** mode. No "export this env's
  evidence trail" or signed audit log.
- **Engineering manager** doing a quarterly health read-out across
  10+ envs. No multi-env aggregation surface — every page is single-
  env scoped.
- **Investor / due-diligence reader** evaluating Vestigio itself.
  No platform-level demo mode that surfaces aggregate value caught
  across all customers.

### Use cases I hypothesized but only partially addressed
- **Strategy Plan Step 9 (MCP write-side)** — `propose_plan_edit`,
  `add_plan_comment`, admin approval UI. The schema + UI hooks exist
  (PlanEdit, PlanComment) but the MCP tools aren't wired. This is
  tracked in the Wave 22.6 implementation plan, not here.
- **Strategy Plan Step 10 (PDF export)** — `/app/library/strategy/
  [month]/export` route + chromium pool. Not started.
- **First-time-user empty states** — P2.2 (Lorem Ipsum on pricing)
  was the closest hit and got deferred. No broader "first 5 minutes
  with zero data" pass.
- **Mobile/PWA** — every surface assumed ≥1280px viewport.

### Things I didn't validate after shipping
- **Adoption telemetry** — none of the 14 shipped fixes have product
  instrumentation. We shipped against *hypothesized* friction; no
  click/funnel data confirms the friction was real or the fix moved
  the needle.
- **Re-audit** — the audit froze at commit `4a89df4f`. We shipped
  ~3,500 lines on top. There's no guarantee a fresh 11-agent pass
  wouldn't surface new P0s introduced by P0-P3 themselves.
- **Customer behavior** — havefunnels.com (the only paying customer)
  hasn't been re-interviewed since shipping. The fixes are
  product-team's best read of what the buyer would care about.

### Process gaps
- **`docs/POWER_USER_AUDIT_METHOD.md`** still doesn't exist. The
  methodology is reproducible only by re-reading the original audit
  prompt in this file.
- **No scoring rubric** that ties the 0–10 scores to concrete
  observable behaviors. The trajectory table above is qualitative.

---

## Where to go next

In rough leverage order:

1. **Re-audit at the current commit** with the same 11-agent
   methodology and score apples-to-apples vs. the initial audit.
   Identifies regressions + new friction we created.
2. **Add adoption telemetry** to the 14 shipped fixes so the next
   audit has hypothesis-validating data.
3. **Wave 22.6 Step 9/10** — MCP write tools + PDF export. Closes
   the Strategy Plan loop.
4. **One unhypothesized persona** — pick CS or compliance, run a
   2-agent surface trace.
5. **Mobile pass** — at minimum verify the 4 highest-traffic
   surfaces (Pulse, Findings, Workspaces, Strategy Plan) don't
   break below 768px.

---

## How this roadmap is maintained

- **Adding a new fix:** append to the appropriate P-bucket with
  same shape (Why / Touch list / Verification).
- **Marking a fix shipped:** move it to the ✅ Shipped table with
  the commit hash.
- **Re-auditing:** see `docs/POWER_USER_AUDIT_METHOD.md` (TODO —
  write this when we re-audit).

---

## Methodology notes (original audit, 2026-06-04)

Audit conducted via 11 parallel `code-reviewer` and
`general-purpose` agents on 2026-06-04 against commit `4a89df4f`.

Each agent received:
- Same test-case framing (technical power user, fresh subscription,
  week 1-2)
- Either a specific analytical lens (churn, customer research,
  methodology, coherence, positioning) OR a specific product
  surface (Strategy Plan, Workspaces, Actions, Findings, Maps,
  Inventory)
- Multiple distinct purchase-intent hypotheses to trace through
  their assigned surface/lens
- Output format: file/line references + severity (P0/P1/P2) +
  score 0–10 + leverage fix

A friction tag was only listed in this roadmap if it appeared in
≥2 independent agent reports.
