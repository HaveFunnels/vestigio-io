# Form Flow Inference — Fase B (Dynamic Submission)

**Status:** Not implemented. Design only.
**Owner:** Backend
**Last updated:** 2026-05-12

---

## What Fase A delivers

Static form-graph analysis. Reads Form evidence + form_action surface
relations and surfaces three findings:

1. `checkout_multi_step_friction` — 4+ pages with forms chained until payment.
2. `checkout_external_handoff` — final form action targets a different host.
3. `form_field_overload` — any single form with 7+ visible fields.

No form is submitted. The inference walks the graph and reports.

## Why Fase B exists

Static analysis can't detect failures that only show up *during* submission:

- Validation rules that silently reject valid inputs ("CEP inválido" but
  the input matches the regex).
- Hidden required fields revealed only after partial form completion.
- Multi-step forms that lose state on browser back (broken state machine).
- Async failures (Stripe Elements that load slowly, payment intent
  errors hidden behind a generic toast).
- Submit buttons disabled by JS until a non-obvious condition is met.
- Redirect chains after submit that drop trust (e.g. http → https → external).

These all show up only when a real user attempts the form. Detecting them
proactively is the Fase B value proposition.

## The hard part: safety

Submitting forms in an automated way is **dangerous by default**. Without
strict guardrails, an audit cycle could:

- Trigger real payments. (`<form action="/api/checkout/create-session">`
  with our test data ends up as a charge on the customer's Stripe.)
- Trigger real signups, polluting the customer's user database.
- Send real notifications (welcome emails, SMS) to invented test addresses.
- Submit lead forms that hit the customer's CRM / sales team with fake
  data.
- Trigger rate limits or fraud detection (Cloudflare, reCAPTCHA, datadome)
  that lock the customer out of their own checkout.
- Violate the customer's TOS with their payment processor (Stripe explicitly
  prohibits programmatic submission of card data outside test mode).

Any Fase B design must make these failure modes structurally impossible,
not merely "we'll be careful."

---

## Proposed design

### 1. Opt-in per environment

A new field on `Environment`:

```prisma
formSubmissionEnabled        Boolean  @default(false)
formSubmissionWhitelist      String[] @default([])   // form action URLs allowed for submission
formSubmissionTestModeOnly   Boolean  @default(true) // refuse if test mode markers missing
```

Default state: **disabled**. Customer must explicitly enable it per
environment, after a UI flow that surfaces the risks. The whitelist
caps which form actions we can post to — empty whitelist = no
submissions even if `formSubmissionEnabled=true`.

### 2. Test-mode detection (gate to refuse submission)

Before submitting, the renderer must confirm the page is in a test
environment. Heuristics:

- **Stripe**: presence of `pk_test_*` publishable keys in scripts/inline
  JS. Absence = production. Refuse.
- **Mercado Pago**: presence of `TEST-*` token prefixes.
- **Paddle**: `paddle_environment: "sandbox"` in JS.
- **Custom**: `data-test-mode="true"` attribute on the form, or
  `<meta name="x-test-mode" content="true">` in the head, set by the
  customer to mark a flow as safe.

If `formSubmissionTestModeOnly=true` (default) and we can't detect a
test mode marker, **refuse to submit** regardless of whitelist state.

### 3. Synthetic test data registry

Per field-type heuristic (already in Fase A), use known-safe synthetic
values:

| Field type | Value used |
|---|---|
| email | `audit+<cycleId>@vestigio.io` |
| name | "Vestigio Audit" |
| phone | "+15555555555" (Twilio test number) |
| card | Stripe test card `4242 4242 4242 4242` (rejected outside test mode) |
| address | Standard test address known to all CRMs |
| document (CPF/SSN) | Synthetic test value, never a real one |

**Hard rule:** never use real payment data. The card number is *only*
the Stripe test card; in non-Stripe environments where test mode can't
be confirmed, refuse the form.

### 4. Execution path (Playwright)

Extend the existing `PlaywrightRuntime.executeScenario` to support
a new step type `form_submit`:

```ts
{ type: 'form_submit', selector: '#checkout-form', testData: 'auto' }
```

The runtime:

1. Fills each detected field from the synthetic registry.
2. Clicks the submit button.
3. Captures: next URL, console errors during submit, network response
   for the form action, page state after submit.
4. Emits `FormSubmissionResult` evidence with success/failure, error
   classification, and post-submit state.

Per-cycle budget: cap at 5 form submissions, shared with the existing
`playwright_budget`. Per-domain cap: 1 (we only need a single sample
per form).

### 5. New findings unlocked by Fase B

| Inference key | Trigger |
|---|---|
| `form_submit_silent_failure` | Submit click did nothing observable (no nav, no error toast) |
| `form_submit_state_lost_on_back` | Multi-step form clears prior input on browser back |
| `form_validation_overly_strict` | Synthetic-but-valid input rejected |
| `form_submit_external_redirect_chain` | Submit → 2+ external hops before destination |
| `form_submit_slow_response` | Response > 5s |
| `form_submit_cta_disabled` | Submit button never enables despite all fields filled |

These complement Fase A's structural findings with empirical evidence.

---

## Rollout plan

1. **Phase B1**: ship the schema + opt-in UI, no execution yet. Customers
   can enable + whitelist but nothing happens. We collect signal on how
   many enable it.
2. **Phase B2**: ship test-mode detection only. Customer enables, we
   detect, we log what we *would* submit (without actually submitting).
   Customer reviews the logs in a "Pending Form Tests" UI.
3. **Phase B3**: enable real submission for customers who explicitly
   confirmed the logs in B2 look safe. Behind a feature flag per
   environment.
4. **Phase B4**: GA, with the safety layers above as defaults-on.

## Open questions for product

1. Does the value justify the risk? Fase A surfaces ~80% of the value
   (structural friction) without any submission. Is B4 worth the
   complexity?
2. Should we require the customer to provide their own test environment
   (separate domain, e.g. `staging.example.com`) instead of detecting
   test mode on production? Cleaner separation but higher onboarding
   cost.
3. How do we handle customers who never use Stripe-style test modes —
   e.g. small ecommerce on WooCommerce without a staging environment?
   Likely answer: they're not eligible for Fase B until they set one up.
4. Liability: if a Vestigio submission triggers a real charge despite
   our checks, who owns the cost? Needs legal review.

---

## Recommendation

Ship Phase B1 + B2 if there's strong customer signal. Defer B3 + B4
until at least three customers have explicitly asked for "test my
checkout" as a feature. The static analysis from Fase A is enough for
the first wave of form-friction findings; we should validate that those
land before investing further.
