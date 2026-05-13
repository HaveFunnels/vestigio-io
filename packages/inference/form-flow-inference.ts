// ──────────────────────────────────────────────
// Form Flow Inference (Fase A — static)
//
// Reads Form evidence + Link/form_action surface relations and builds
// a flow graph: page → form action → next page. Multi-step flows
// (sequences of 2+ pages, each carrying a form) surface as findings:
//
//   1. checkout_multi_step_friction
//      4+ steps from a commercial page to the payment step. Each
//      extra step typically drops ~15% conversion.
//
//   2. checkout_external_handoff
//      Final step (payment) lives on a different host than the
//      origin. Trust drop + double-billing concerns.
//
//   3. form_field_overload
//      A single form has >7 visible input fields. Form-CRO research
//      pegs the inflection point at 4-6 fields; >7 reliably depresses
//      completion rate.
//
// Fase A does NOT submit forms. See docs/FORM_FLOW_PHASE_B.md for the
// design of dynamic submission (gated, opt-in, test-mode-only).
// ──────────────────────────────────────────────

import type { Inference, Signal, Evidence, Scoping } from '../domain';

export interface FormFlowInput {
  // Evidence rows of EvidenceType=Form. We pull payload off these.
  formEvidence: Array<{
    page_url: string;
    action: string;
    method: string;
    target_host: string | null;
    is_external: boolean;
    field_names: string[];
    has_payment_fields: boolean;
  }>;
  // Surface relations of type form_action — the "this form posts to that page" graph.
  formActionRelations: Array<{
    sourceUrl: string;
    targetUrl: string;
    sourceHost: string;
    targetHost: string;
    isSameDomain: boolean;
  }>;
  // Anchor relations — used to infer "after this form, the user follows
  // a high-weight link to the next step". Limited to first-party links.
  ctaRelations: Array<{
    sourceUrl: string;
    targetUrl: string;
  }>;
  // Page urls with their classified types — used to anchor flow start (commercial pages)
  // and to detect "checkout" / "payment" as final steps.
  pages: Array<{
    url: string;
    path: string;
    classifiedPageType: string | null;
  }>;
  // Root domain of the customer's environment. Used to flag external handoffs.
  rootDomain: string;
  scoping: Scoping;
  cycleRef: string;
}

const FIELD_TYPE_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'email', pattern: /\b(email|e[-_ ]?mail)\b/i },
  { type: 'password', pattern: /\b(password|senha|passwd)\b/i },
  { type: 'card', pattern: /\b(card|cc|cvv|cvc|number|numero[-_ ]?(do[-_ ]?)?cartao|cardholder)\b/i },
  { type: 'address', pattern: /\b(address|endereco|street|rua|cep|zip|postal|city|cidade|state|estado)\b/i },
  { type: 'name', pattern: /\b(name|nome|first[-_ ]?name|last[-_ ]?name|sobrenome)\b/i },
  { type: 'phone', pattern: /\b(phone|tel|telefone|celular|mobile|whatsapp)\b/i },
  { type: 'company', pattern: /\b(company|empresa|organization|cnpj)\b/i },
  { type: 'document', pattern: /\b(cpf|ssn|tax[-_ ]?id|document|documento|rg)\b/i },
];

const COMMERCIAL_TYPES = new Set([
  'checkout', 'cart', 'pricing', 'product', 'category', 'lead_form', 'contact',
]);

const PAYMENT_TYPES = new Set(['checkout', 'cart', 'payment']);

const FIELD_OVERLOAD_THRESHOLD = 7;
const MULTI_STEP_FRICTION_THRESHOLD = 4;

function inferFieldTypes(fieldNames: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of fieldNames) {
    const name = raw.toLowerCase();
    for (const { type, pattern } of FIELD_TYPE_PATTERNS) {
      if (pattern.test(name)) {
        counts[type] = (counts[type] ?? 0) + 1;
        break;
      }
    }
  }
  return counts;
}

function isPaymentStep(page: { classifiedPageType: string | null; path: string }, hasPaymentFields: boolean): boolean {
  if (hasPaymentFields) return true;
  if (page.classifiedPageType && PAYMENT_TYPES.has(page.classifiedPageType)) return true;
  return /\/(checkout|payment|pagamento|pay\b|finalizar)/i.test(page.path);
}

interface FlowChain {
  steps: string[]; // page URLs in order
  hasPaymentEnd: boolean;
  externalHandoff: boolean;
  finalHost: string | null;
}

export function computeFormFlowInferences(input: FormFlowInput): { signals: Signal[]; inferences: Inference[] } {
  const signals: Signal[] = [];
  const inferences: Inference[] = [];

  if (input.formEvidence.length === 0) {
    return { signals, inferences };
  }

  const pageByUrl = new Map<string, FormFlowInput['pages'][number]>();
  for (const p of input.pages) pageByUrl.set(p.url, p);

  // Build forward graph: page_url → set of next page urls reached via form_action
  // OR a CTA link that leaves a page that itself has a form.
  const pagesWithForm = new Set<string>(input.formEvidence.map(f => f.page_url));
  const next = new Map<string, Set<string>>();
  for (const rel of input.formActionRelations) {
    if (!rel.isSameDomain) continue;
    if (!pagesWithForm.has(rel.sourceUrl)) continue;
    let s = next.get(rel.sourceUrl);
    if (!s) { s = new Set(); next.set(rel.sourceUrl, s); }
    s.add(rel.targetUrl);
  }
  for (const rel of input.ctaRelations) {
    if (!pagesWithForm.has(rel.sourceUrl)) continue;
    if (!pagesWithForm.has(rel.targetUrl)) continue; // only chain when target also has a form
    let s = next.get(rel.sourceUrl);
    if (!s) { s = new Set(); next.set(rel.sourceUrl, s); }
    s.add(rel.targetUrl);
  }

  // Map page → form evidence (assume one form per page is the dominant one;
  // if multiple, take the one with the most fields).
  const formByPage = new Map<string, FormFlowInput['formEvidence'][number]>();
  for (const f of input.formEvidence) {
    const existing = formByPage.get(f.page_url);
    if (!existing || f.field_names.length > existing.field_names.length) {
      formByPage.set(f.page_url, f);
    }
  }

  // 1. Field overload — single-form check, independent of chain.
  for (const [pageUrl, form] of formByPage) {
    if (form.field_names.length >= FIELD_OVERLOAD_THRESHOLD) {
      const types = inferFieldTypes(form.field_names);
      signals.push({
        id: `form_field_overload_${pageUrl}`,
        signal_type: 'form_flow',
        source: 'classification',
        payload: {
          observation: 'form_field_overload',
          page_url: pageUrl,
          field_count: form.field_names.length,
          field_types: types,
        },
        scoping: input.scoping,
        cycle_ref: input.cycleRef,
        confidence: 80,
      } as any);

      inferences.push({
        id: `inf_form_field_overload_${pageUrl}`,
        inference_key: `form_field_overload_${pageUrl}`,
        category: 'form_friction',
        scoping: input.scoping,
        cycle_ref: input.cycleRef,
        freshness: { state: 'fresh', age_seconds: 0 },
        conclusion: 'form_field_overload',
        conclusion_value: 'true',
        severity_hint: form.field_names.length >= 10 ? 'high' : 'medium',
        confidence: 80,
        signal_refs: [`signal:form_field_overload_${pageUrl}`],
        reasoning: `The form on ${pageUrl} asks for ${form.field_names.length} fields (${Object.keys(types).join(', ')}). Forms with >7 fields lose ~10-15% completion per extra field. Cut every field that doesn't gate a real downstream decision.`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any);
    }
  }

  // 2. Chain walk — DFS up to depth 8 from each commercial-page entry.
  // Cycles are short-circuited by a visited set per walk.
  const chains: FlowChain[] = [];
  function walk(current: string, path: string[], visited: Set<string>) {
    if (path.length > 8) return;
    const successors = next.get(current);
    const isEnd = !successors || successors.size === 0;
    const page = pageByUrl.get(current);
    const form = formByPage.get(current);
    const paymentEnd = page && form ? isPaymentStep(page, form.has_payment_fields) : false;

    if (isEnd || paymentEnd) {
      // Record this chain. External handoff = final form action targets a different host.
      const rel = input.formActionRelations.find(r => r.sourceUrl === current);
      const finalHost = rel ? rel.targetHost : (form?.target_host ?? null);
      const externalHandoff = !!(finalHost && finalHost !== input.rootDomain && !finalHost.endsWith('.' + input.rootDomain));
      chains.push({ steps: [...path, current], hasPaymentEnd: paymentEnd, externalHandoff, finalHost });
      if (!isEnd) return; // payment short-circuits further walk
    }
    if (successors) {
      for (const target of successors) {
        if (visited.has(target)) continue;
        const v = new Set(visited);
        v.add(target);
        walk(target, [...path, current], v);
      }
    }
  }

  // Start walks at commercial pages that carry a form.
  const starts = Array.from(pagesWithForm).filter(url => {
    const p = pageByUrl.get(url);
    return p?.classifiedPageType ? COMMERCIAL_TYPES.has(p.classifiedPageType) : false;
  });
  // If no commercial-page starts, fall back to any page with a form whose action is in-domain.
  const walkSeeds = starts.length > 0 ? starts : Array.from(pagesWithForm);
  for (const seed of walkSeeds) {
    const initial = new Set<string>(); initial.add(seed);
    walk(seed, [], initial);
  }

  // 3. Multi-step friction
  const reportedFlows = new Set<string>();
  for (const chain of chains) {
    if (chain.steps.length < MULTI_STEP_FRICTION_THRESHOLD) continue;
    if (!chain.hasPaymentEnd) continue;
    const key = chain.steps.join('->');
    if (reportedFlows.has(key)) continue;
    reportedFlows.add(key);

    signals.push({
      id: `checkout_multi_step_friction_${chain.steps[0]}`,
      signal_type: 'form_flow',
      source: 'classification',
      payload: {
        observation: 'checkout_multi_step_friction',
        steps: chain.steps,
        step_count: chain.steps.length,
        external_handoff: chain.externalHandoff,
      },
      scoping: input.scoping,
      cycle_ref: input.cycleRef,
      confidence: 75,
    } as any);

    inferences.push({
      id: `inf_checkout_multi_step_friction_${chain.steps[0]}`,
      inference_key: `checkout_multi_step_friction_${chain.steps[0]}`,
      category: 'checkout_friction',
      scoping: input.scoping,
      cycle_ref: input.cycleRef,
      freshness: { state: 'fresh', age_seconds: 0 },
      conclusion: 'checkout_multi_step',
      conclusion_value: String(chain.steps.length),
      severity_hint: chain.steps.length >= 6 ? 'high' : 'medium',
      confidence: 75,
      signal_refs: [`signal:checkout_multi_step_friction_${chain.steps[0]}`],
      reasoning: `Visitors going from ${chain.steps[0]} to payment traverse ${chain.steps.length} pages with form interactions. Each extra step typically drops 10-15% completion. Combine non-essential steps (e.g. shipping + billing) into a single form to reduce friction.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
  }

  // 4. External handoff at the final step — independent of chain length.
  const seenExternalSources = new Set<string>();
  for (const chain of chains) {
    if (!chain.externalHandoff || !chain.finalHost) continue;
    const lastStep = chain.steps[chain.steps.length - 1];
    if (seenExternalSources.has(lastStep)) continue;
    seenExternalSources.add(lastStep);

    signals.push({
      id: `checkout_external_handoff_${lastStep}`,
      signal_type: 'form_flow',
      source: 'classification',
      payload: {
        observation: 'checkout_external_handoff',
        last_step: lastStep,
        external_host: chain.finalHost,
        root_domain: input.rootDomain,
      },
      scoping: input.scoping,
      cycle_ref: input.cycleRef,
      confidence: 85,
    } as any);

    inferences.push({
      id: `inf_checkout_external_handoff_${lastStep}`,
      inference_key: `checkout_external_handoff_${lastStep}`,
      category: 'trust_boundary',
      scoping: input.scoping,
      cycle_ref: input.cycleRef,
      freshness: { state: 'fresh', age_seconds: 0 },
      conclusion: 'checkout_external_handoff',
      conclusion_value: chain.finalHost,
      severity_hint: 'high',
      confidence: 85,
      signal_refs: [`signal:checkout_external_handoff_${lastStep}`],
      reasoning: `The final checkout step on ${lastStep} hands the buyer off to ${chain.finalHost} (different domain than ${input.rootDomain}). Trust drops at the handoff — buyers can't tell if it's a phishing redirect. Either move checkout to a subdomain (checkout.${input.rootDomain}) or surface the partner's brand explicitly before redirect.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
  }

  return { signals, inferences };
}
