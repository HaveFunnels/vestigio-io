# Vestigio Lexicon

Frozen vocabulary for **customer-facing surfaces** (marketing site + authenticated product + emails + exports + JSON-LD). Internal code names, admin/dev tooling, and DB column names are out of scope.

This file is the single source of truth. When in doubt, grep this file.

---

## ✅ YES — use these

| Term | Use when | Notes |
|---|---|---|
| **Plano de Estratégia** | Formal product name in pricing, JSON-LD, emails, plan exports, contracts | The deliverable. Singular noun. Capitalize both words. |
| **O Plano** / **seu Plano** | Conversational short form in hero copy, CTAs, body text | Lowercase when not a proper noun. "Receber seu Plano", "Ler um Plano de exemplo". |
| **Tese** | The central observation that opens every Plano | Singular per cycle. "A Tese deste mês foi:" |
| **Tese do mês** | Marketing surface label for the editorial pull-quote pattern | Used on hero banner + Counter card today. |
| **Próximos passos** | The action list in a Plano | Capital P only on "Próximos" if sentence-initial. |
| **Findings** | Granular observations inside a Plano | Loanword, kept English. Lowercase as common noun. Plural form is the default. |
| **Ciclo** | One monthly Plano generation window | "Ciclo #007", "no ciclo passado". |
| **Análise** | What Vestigio produces | Use as deliverable verb-noun. "Sua análise está pronta." |
| **Assinado por Vestigio** | Plano signature, editorial frame | Brand-level signature for the homepage. |
| **Edição #N — [Mês] [Ano]** | Masthead dateline format | Reserved for Ship A (`/exemplo` masthead). Don't use until /exemplo ships. |
| **Recuperado** | Money won back, in R$ | HeroMetrics tile label. |
| **Vazando** | Money currently bleeding, in R$ | HeroMetrics tile label. |
| **Em monitoramento** | Findings being tracked | HeroMetrics tile label. |
| **Diagnóstico** | ⚠️ Conditional — allowed for the **top-of-funnel free-tool CTA only** ("Rodar diagnóstico gratuito"). User explicitly chose this over council-recommended "Receber sua análise" because the free-action framing converts (see okara.ai as category reference). Never use as the product noun — the deliverable is "Plano de Estratégia" / "análise", not "diagnóstico". | Use *only* in hero/CTA verb-pair. Body copy uses Análise. |

## ❌ NO — never use customer-facing

| Term | Why forbidden | Use instead |
|---|---|---|
| **Auditoria** | Memory rule: "customer-facing copy uses Análise/Analysis, never Auditoria/Audit" | Análise |
| **Auditing** / **Audit** | EN equivalent of Auditoria | Analysis |
| **Vestigio Pulse** | Killed product feature (Wave 22.8). Dead-product-in-marketing = credibility leak. | Tese do mês (in marketing context) |
| **Pulse** (standalone) | Same | Drop the noun; use Plano/Tese as the anchor |
| **Vestigio Pulse AI** | Pricing copy still uses this in tiers (4561-4563). Schedule for D8 (Ship B) cleanup. | TBD in Ship B — likely "Análise agêntica" or "Análise do ciclo" |
| **Descobertas** | Lexicon drift vs `Findings`. Inconsistent within site reads as typo. | Findings |
| **Fila de ações** / **Action Queue** | Implies always-on triage product Vestigio no longer is | Próximos passos / Plano |
| **Investigation** / **Investigação** | Investigation chat is a ProductTour mockup, not the real product | Análise / Vestigio (without modifier) |
| **Vestigio AI** (as product name) | Implies conversational dashboard | Vestigio (no modifier) |
| **Dashboard** | "Não é dashboard" was the OLD positioning vs current "Plano editorial" | (avoid framing, name the artifact instead) |
| **Rodar análise** | Wrong verb — you don't "rodar" a Plano. Acceptable in CTA context (see Diagnóstico note above). | "Receber sua análise" / "Começar sua análise" — OR keep "Rodar diagnóstico" per user preference for top-of-funnel CTA |

## ⚠️ TRANSITIONAL — known violations, scheduled for cleanup

These exist today but are scheduled for removal. Not bugs — backlog items.

| Location | Term | Scheduled for | Notes |
|---|---|---|---|
| `dictionary/*.json` — `product_tour.chat_panel.header` (464) | "Vestigio Pulse" | Ship A | ProductTour replaced by guided sections of a real Plano (see `[[product-tour-guided-plan-sections]]`); these copy keys get rewritten with the new step content |
| `dictionary/*.json` — `product_tour.overlay_ai.eyebrow` (566) | "Vestigio Pulse" | Ship A | Same — ProductTour rebuild |
| `src/app/(site)/audit/*` | "auditoria"-adjacent copy (NOT "diagnóstico" — see exception above) | Ship A | Sweep against this lexicon; preserve "Rodar diagnóstico gratuito" hero CTA |
| `/audit` URL | URL itself | Indefinite | User decision: keep route alive — no rename, no redirect. CTA framing stays as today. Avoids breaking inbound links + preserves the free-tool conversion engine. Revisit only if instrumentation shows the CTA is the funnel bottleneck. |

---

## /audit URL decision

**Decision (locked):** Keep `/audit` route alive. Keep the current CTA framing ("Rodar diagnóstico gratuito"). No redirects, no rename.

**Rationale:**
- User overrode the council's CTA-swap recommendation. The free-action-CTA + free-tool entry path is the homepage's conversion engine and shouldn't be replaced with a passive content-preview CTA
- okara.ai (same product category, SEO vertical) validates the free-action pattern — that's the user's chosen calibration reference
- "Diagnóstico" gets a conditional pass in the lexicon: allowed only in the top-of-funnel CTA verb-pair, never as the product noun

**Ship A action:** Add `/exemplo` as a NEW route alongside `/audit`. Both stay. `/exemplo` becomes the secondary "Ler um plano de exemplo" destination in a dual-CTA hero, NOT a replacement for the primary free-diagnostic path.

---

## Conventions

- **Locales**: pt-BR is the canonical surface. en/de/es follow. When this lexicon updates, all 4 dictionaries update together.
- **Capitalization**: title-case product nouns (`Plano de Estratégia`, `Tese do mês`). Lowercase common nouns (`findings`, `próximos passos`).
- **Tone**: editorial register. Calm, dated, signed. No urgency/triage language. No "AI working" theatre.
- **When in doubt**: re-read the active Plano in `/app/library/strategy/current` — the product is the spec.

---

## Change log

- **2026-06-20** — File created. Ship 0 of homepage cohesion rewrite. Pulse killed on hero banners + Counter card across 4 locales. Remaining Pulse refs scheduled for Ship A/B (see Transitional table).
- **2026-06-20** — User override on diagnóstico CTA: keep "Rodar diagnóstico gratuito" as the top-of-funnel free-action CTA per user preference (okara.ai cited as same-category reference). "Diagnóstico" moves from ❌ NO → ⚠️ Conditional. /audit URL decision locked: keep route + CTA, no rename. Memory rule re: Auditoria/Audit still fully in force.
- **2026-06-20** — Visual cohesion pass: stripped violet from 5 marketing surfaces, killed Counter Pulse-radar metaphor (Tese card redesigned with serif quote glyph + dashed rings), applied Fraunces selectively (AnnouncementBanner label + Counter Tese card body).
- **2026-06-20** — Palette rebalance: emerald reserved for action/identity (CTAs, gradient, identity moments). Decorations go sky (secondary) or neutral. Avoid emerald monoculture.
- **2026-06-20** — Pricing copy cleanup: "Vestigio Pulse AI" → "Análise agêntica" / "Agentic analysis" / "Agentische Analyse" / "Análisis agéntico" across 4 locales (~14 strings). Pulse name now absent from the pricing surface. Remaining Pulse refs are limited to ProductTour internals (dies Ship A) and authenticated product nav/onboarding (out of marketing scope).
- **2026-06-20** — Vestigio trails (4 vertical hero rails, descending emerald pulses, 16-22s loops) removed entirely from Hero. Plano has zero infinite loops; trails were the largest remaining ambient-loop attention magnet. Halos + gradient carry ambient depth alone.
