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

## ❌ NO — never use customer-facing

| Term | Why forbidden | Use instead |
|---|---|---|
| **Auditoria** | Memory rule: "customer-facing copy uses Análise/Analysis, never Auditoria/Audit" | Análise |
| **Diagnóstico** | Same family as Auditoria. Triage/medical register fights the editorial frame. | Análise |
| **Auditing** / **Audit** | EN equivalent of Auditoria | Analysis |
| **Vestigio Pulse** | Killed product feature (Wave 22.8). Dead-product-in-marketing = credibility leak. | Tese do mês (in marketing context) |
| **Pulse** (standalone) | Same | Drop the noun; use Plano/Tese as the anchor |
| **Vestigio Pulse AI** | Pricing copy still uses this in tiers (4561-4563). Schedule for D8 (Ship B) cleanup. | TBD in Ship B — likely "Análise agêntica" or "Análise do ciclo" |
| **Descobertas** | Lexicon drift vs `Findings`. Inconsistent within site reads as typo. | Findings |
| **Fila de ações** / **Action Queue** | Implies always-on triage product Vestigio no longer is | Próximos passos / Plano |
| **Investigation** / **Investigação** | Investigation chat is a ProductTour mockup, not the real product | Análise / Vestigio (without modifier) |
| **Vestigio AI** (as product name) | Implies conversational dashboard | Vestigio (no modifier) |
| **Dashboard** | "Não é dashboard" was the OLD positioning vs current "Plano editorial" | (avoid framing, name the artifact instead) |
| **Rodar diagnóstico** | Violates two rules in one CTA | "Receber sua análise gratuita" |
| **Rodar análise** | Wrong verb — you don't "rodar" a Plano | "Receber sua análise" / "Começar sua análise" |

## ⚠️ TRANSITIONAL — known violations, scheduled for cleanup

These exist today but are scheduled for removal. Not bugs — backlog items.

| Location | Term | Scheduled for | Notes |
|---|---|---|---|
| `dictionary/*.json` — `product_tour.chat_panel.header` (464) | "Vestigio Pulse" | Ship A | ProductTour entire component dies; D1 replaces with static Plano preview |
| `dictionary/*.json` — `product_tour.overlay_ai.eyebrow` (566) | "Vestigio Pulse" | Ship A | Same — ProductTour deletion |
| `dictionary/*.json` — `billing.agentic_insights` (3573) | "Vestigio Pulse AI" | Ship B | D8 pricing rewrite |
| `dictionary/*.json` — `pricing.tiers.features.agentic_insights*` (4561-4563) | "Vestigio Pulse AI" | Ship B | D8 pricing rewrite |
| `dictionary/*.json` — `product_tour.cta_primary` (157) | "Rodar diagnóstico gratuito" | Ship A | D2 hero rewrite — paired with dual-CTA |
| `dictionary/*.json` — `hero_*.cta_primary` (97, 145) | "Rodar diagnóstico gratuito" | Ship A | D2 hero rewrite |
| `/audit` URL | URL itself | Ship A | Decision: keep route alive (no 301), rename CTAs to "análise", consider rename to `/comecar` in Ship A. Avoids breaking inbound links. |
| `src/app/(site)/audit/*` | "auditoria"-adjacent copy | Ship A | Sweep against this lexicon |

---

## /audit URL decision

**Decision (Ship 0):** Keep the `/audit` route alive — no redirect yet.

**Rationale:**
- CTA copy violation ("Rodar diagnóstico") is the user-visible bug, not the URL itself
- Inbound links (memory of customers, ads, social, browser bookmarks) cost real money to break
- A redirect now would cascade into all CTA components and SEO entry points before we know whether Ship A's dual-CTA architecture works

**Ship A action:** Decide between:
1. Rename route to `/comecar` + 301 from `/audit`
2. Keep `/audit` route, just rename CTAs visible to user
3. Add new `/exemplo` route alongside `/audit`, keep both

Default recommendation per council: **option 3** (additive, no redirects, no SEO risk).

---

## Conventions

- **Locales**: pt-BR is the canonical surface. en/de/es follow. When this lexicon updates, all 4 dictionaries update together.
- **Capitalization**: title-case product nouns (`Plano de Estratégia`, `Tese do mês`). Lowercase common nouns (`findings`, `próximos passos`).
- **Tone**: editorial register. Calm, dated, signed. No urgency/triage language. No "AI working" theatre.
- **When in doubt**: re-read the active Plano in `/app/library/strategy/current` — the product is the spec.

---

## Change log

- **2026-06-20** — File created. Ship 0 of homepage cohesion rewrite. Pulse killed on hero banners + Counter card across 4 locales. Remaining Pulse refs scheduled for Ship A/B (see Transitional table).
