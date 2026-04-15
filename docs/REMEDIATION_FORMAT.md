# Remediation Format Spec

Reference for authors of Phase 2 backfill content into `Action.remediation_steps`. The field is consumed by:

- `Finding.remediation_steps` (workspace pass-through)
- `FindingProjection.remediation_steps` (UI renders step list in expanded card)
- `ActionProjection.remediation_steps` (global action dashboard)
- MCP `discuss_finding` / `analyze_findings` tools (LLM uses steps as the answer skeleton when a user asks "how do I fix this?")

Every step eventually lands in a customer-facing surface. Write for the operator who will implement it, not for an engineer reviewing the ticket.

---

## Field contract

```ts
Action.remediation_steps: string[] | null
Action.estimated_effort_hours: number | null
```

- `null` — no remediation recipe for this `action_key` yet. UI hides the steps section on the card and MCP falls back to the legacy `title` summary.
- `string[]` — ordered list of concrete steps. The array order **is** the sequence — do not write "First, …" / "Then, …" / "Finally, …" into the strings themselves.
- `estimated_effort_hours` — median case dev-hours. Use null when you cannot calibrate honestly; never guess wildly.

Actions sharing an `action_key` must converge on identical `remediation_steps`. `prioritizeActions` merges across the group by picking the first non-null `remediation_steps`; if two actions with the same key disagree, the merge is non-deterministic and users will see drifting content cycle-to-cycle.

---

## Writing rules

**1. Verb-led, one sentence per step.**

✅ `Add a 200-word refund policy covering the return window, process, and contact email.`

❌ `First, you should think about adding a refund policy. Consider what it needs to cover and then write it up when you have time.`

**2. Concrete target, not generic advice.**

✅ `Link the refund policy from the checkout footer next to the trust badges.`

❌ `Improve your checkout trust.`

**3. Testable outcome.**

Each step should finish in a state someone else can verify by looking at the site. If a step is "keep an eye on X" or "make sure Y is aligned with Z", rewrite it.

**4. No sequencing words.**

Array order carries the sequence. Steps that say "first", "then", "finally", "next", "afterwards" duplicate information and break if the UI ever reorders or filters steps.

**5. Length ceiling: ~160 chars per step.**

Short enough to render on a single line in most card layouts. If you need more, split into two steps.

**6. Minimum 2 steps, maximum 7.**

A single-step recipe should just be the Action `title`; don't promote it to `remediation_steps`. More than 7 steps is a project, not a remediation — split into sub-actions or link to a playbook.

**7. Same language as the rest of the finding.**

If `Action.title` is pt-BR, the steps are pt-BR. If it's English, steps are English. Don't mix. The engine doesn't translate `remediation_steps` — use the locale the finding was originally authored in.

**8. Avoid vestigio self-reference.**

✅ `Add a visible HTTPS lock indicator on the checkout page header.`

❌ `Use Vestigio's trust surface checker to audit the checkout.`

The steps render to a buyer's team; they don't need to know Vestigio's internal taxonomy.

---

## Effort calibration

`estimated_effort_hours` is the **median** scenario. Not best-case, not worst-case.

Anchors:

| Hours | Scale |
|-------|-------|
| 1–2   | copy tweak, toggle a setting, add a tag |
| 4–8   | one-page policy write, new trust badge, wiring an existing script |
| 16–24 | new page / flow, adding a payment gateway, migrating forms |
| 40+   | architecture change, platform migration, auth rework |

Use `null` when:
- the fix ranges from "10 minutes" to "2 weeks" depending on the store's codebase, AND
- you don't have enough context to narrow it.

Users tolerate `null` far better than a 4h estimate that turns out to be a 40h project.

---

## Examples

### `refund_policy_gap` (pt-BR)

```ts
{
  remediation_steps: [
    "Publique uma página de política de reembolso cobrindo prazo (7 dias CDC), processo, e email de contato.",
    "Vincule a política no footer do checkout ao lado dos selos de segurança.",
    "Adicione link da política nos emails de confirmação de compra e de envio.",
    "Mencione explicitamente a política na página do produto (seção FAQ ou próxima ao botão de compra).",
  ],
  estimated_effort_hours: 4,
}
```

### `measurement_coverage` (en)

```ts
{
  remediation_steps: [
    "Install GA4 via GTM on every page including the checkout success URL.",
    "Configure purchase event with transaction_id, value, and currency parameters.",
    "Add a server-side conversion API endpoint for Meta/Google Ads to survive cookie loss.",
    "Verify all 4 tags (GA4, GTM, Meta Pixel, Conversions API) fire in Tag Assistant on a live purchase.",
  ],
  estimated_effort_hours: 12,
}
```

### `trust_boundary_crossed` (pt-BR)

```ts
{
  remediation_steps: [
    "Mova o formulário de pagamento para o mesmo domínio da loja ou use o checkout embedded do gateway.",
    "Se a mudança de domínio for inevitável, adicione logotipo da loja e selo de segurança na página externa.",
    "Garanta HTTPS e certificado válido em ambos os domínios — verifique em navegadores em modo anônimo.",
  ],
  estimated_effort_hours: 16,
}
```

---

## Validation checklist (author use before PR)

- [ ] Every step starts with a verb in imperative.
- [ ] No step contains "first", "then", "finally", "next".
- [ ] Every step's outcome is something a reviewer can look at and confirm.
- [ ] Character count per step ≤ 160.
- [ ] Step count between 2 and 7.
- [ ] Same language as `Action.title`.
- [ ] `estimated_effort_hours` is null OR matches the anchors above (not a wild guess).
- [ ] No Vestigio self-reference.
- [ ] Two actions sharing this `action_key` would get identical steps.
