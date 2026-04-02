import {
  Evidence,
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
  SignalCategory,
  Signal,
  Inference,
  InferenceCategory,
  Scoping,
  Freshness,
  HttpResponsePayload,
  PageContentPayload,
  RedirectPayload,
  ScriptPayload,
  FormPayload,
  CheckoutIndicatorPayload,
  ProviderIndicatorPayload,
  PolicyPagePayload,
  PlatformIndicatorPayload,
  IdGenerator,
  makeRef,
} from '../packages/domain';

// ──────────────────────────────────────────────
// Test Helpers — factories for valid domain objects
// ──────────────────────────────────────────────

const ids = new IdGenerator('test');

export function testScoping(overrides: Partial<Scoping> = {}): Scoping {
  return {
    workspace_ref: 'workspace:ws_1',
    environment_ref: 'environment:env_1',
    subject_ref: 'website:web_1',
    path_scope: null,
    ...overrides,
  };
}

export function testFreshness(overrides: Partial<Freshness> = {}): Freshness {
  const now = new Date();
  return {
    observed_at: now,
    fresh_until: new Date(now.getTime() + 86400000),
    freshness_state: FreshnessState.Fresh,
    staleness_reason: null,
    ...overrides,
  };
}

export function testEvidence(
  type: EvidenceType,
  payload: any,
  overrides: Partial<Evidence> = {},
): Evidence {
  const now = new Date();
  const id = ids.next();
  return {
    id,
    evidence_key: `${type}_${id}`,
    evidence_type: type,
    subject_ref: 'https://example.com',
    scoping: testScoping(),
    cycle_ref: 'audit_cycle:cycle_1',
    freshness: testFreshness(),
    source_kind: SourceKind.HttpFetch,
    collection_method: CollectionMethod.StaticFetch,
    payload,
    quality_score: 70,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function httpResponseEvidence(
  url: string,
  statusCode: number = 200,
  responseTimeMs: number = 500,
): Evidence {
  return testEvidence(EvidenceType.HttpResponse, {
    type: 'http_response',
    url,
    status_code: statusCode,
    headers: { 'content-type': 'text/html' },
    response_time_ms: responseTimeMs,
    content_type: 'text/html',
    content_length: 1000,
  } as HttpResponsePayload);
}

export function pageContentEvidence(url: string, title: string = 'Test'): Evidence {
  return testEvidence(EvidenceType.PageContent, {
    type: 'page_content',
    url,
    title,
    meta_description: null,
    h1: title,
    canonical_url: null,
    lang: 'en',
    has_forms: false,
    form_count: 0,
    script_count: 0,
    external_script_count: 0,
    internal_link_count: 5,
    external_link_count: 0,
  } as PageContentPayload);
}

export function redirectEvidence(from: string, to: string, hops: number = 1): Evidence {
  return testEvidence(EvidenceType.Redirect, {
    type: 'redirect',
    source_url: from,
    target_url: to,
    status_code: 301,
    hop_count: hops,
    chain: [{ url: from, status_code: 301, host: new URL(from).hostname }],
  } as RedirectPayload);
}

export function scriptEvidence(pageUrl: string, src: string, isExternal: boolean): Evidence {
  const host = (() => { try { return new URL(src).hostname; } catch { return ''; } })();
  return testEvidence(EvidenceType.Script, {
    type: 'script',
    page_url: pageUrl,
    src,
    host,
    is_external: isExternal,
    known_provider: null,
  } as ScriptPayload);
}

export function checkoutIndicatorEvidence(
  pageUrl: string,
  targetUrl: string,
  isExternal: boolean,
  mode: string | null = null,
): Evidence {
  const host = (() => { try { return new URL(targetUrl).hostname; } catch { return ''; } })();
  return testEvidence(EvidenceType.CheckoutIndicator, {
    type: 'checkout_indicator',
    page_url: pageUrl,
    indicator_source: 'link',
    target_url: targetUrl,
    target_host: host,
    is_external: isExternal,
    checkout_mode: mode,
    confidence: isExternal ? 70 : 50,
    tokens_matched: ['checkout'],
  } as CheckoutIndicatorPayload);
}

export function providerEvidence(pageUrl: string, provider: string): Evidence {
  return testEvidence(EvidenceType.ProviderIndicator, {
    type: 'provider_indicator',
    page_url: pageUrl,
    provider_name: provider,
    detection_source: 'script',
    confidence: 75,
    domain_match: `${provider}.com`,
  } as ProviderIndicatorPayload);
}

export function policyEvidence(
  pageUrl: string,
  url: string,
  policyType: string,
): Evidence {
  return testEvidence(EvidenceType.PolicyPage, {
    type: 'policy_page',
    url,
    policy_type: policyType,
    detected: true,
    confidence: 65,
    word_count: 500,
  } as PolicyPagePayload);
}

export function platformEvidence(platform: string): Evidence {
  return testEvidence(EvidenceType.PlatformIndicator, {
    type: 'platform_indicator',
    platform_name: platform,
    detection_source: 'script',
    confidence: 60,
    matched_pattern: 'test',
  } as PlatformIndicatorPayload);
}

export function formEvidence(
  pageUrl: string,
  action: string,
  isExternal: boolean,
  hasPaymentFields: boolean = false,
): Evidence {
  const host = (() => { try { return new URL(action).hostname; } catch { return ''; } })();
  return testEvidence(EvidenceType.Form, {
    type: 'form',
    page_url: pageUrl,
    action,
    method: 'POST',
    target_host: host,
    is_external: isExternal,
    field_names: hasPaymentFields ? ['card_number', 'cvv'] : ['email'],
    has_payment_fields: hasPaymentFields,
  } as FormPayload);
}

export function testSignal(overrides: Partial<Signal> = {}): Signal {
  const now = new Date();
  return {
    id: ids.next(),
    signal_key: 'test_signal',
    category: SignalCategory.Checkout,
    scoping: testScoping(),
    cycle_ref: 'audit_cycle:cycle_1',
    freshness: testFreshness(),
    attribute: 'test.attribute',
    value: 'test_value',
    numeric_value: null,
    confidence: 70,
    evidence_refs: [],
    subject_label: null,
    description: 'Test signal',
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function testInference(overrides: Partial<Inference> = {}): Inference {
  const now = new Date();
  return {
    id: ids.next(),
    inference_key: 'test_inference',
    category: InferenceCategory.CommerceContext,
    scoping: testScoping(),
    cycle_ref: 'audit_cycle:cycle_1',
    freshness: testFreshness(),
    conclusion: 'test_conclusion',
    conclusion_value: 'true',
    severity_hint: null,
    confidence: 70,
    signal_refs: [],
    evidence_refs: [],
    reasoning: 'Test reasoning',
    description: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// Simple test runner
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

export function test(name: string, fn: () => void): void {
  totalTests++;
  try {
    fn();
    passedTests++;
  } catch (err) {
    failedTests++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`  FAIL: ${name}\n    ${msg}`);
  }
}

export async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  totalTests++;
  try {
    await fn();
    passedTests++;
  } catch (err) {
    failedTests++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`  FAIL: ${name}\n    ${msg}`);
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertEqual<T>(actual: T, expected: T, label: string = ''): void {
  if (actual !== expected) {
    throw new Error(`${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertGreater(actual: number, expected: number, label: string = ''): void {
  if (actual <= expected) {
    throw new Error(`${label ? label + ': ' : ''}expected > ${expected}, got ${actual}`);
  }
}

export function assertThrows(fn: () => void, expectedMessage?: string): void {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    if (expectedMessage && err instanceof Error && !err.message.includes(expectedMessage)) {
      throw new Error(`Expected error containing "${expectedMessage}", got: "${err.message}"`);
    }
  }
  if (!threw) throw new Error('Expected function to throw, but it did not');
}

export function printResults(suiteName: string): void {
  console.log(`\n${suiteName}`);
  console.log(`  ${passedTests}/${totalTests} passed`);
  if (failures.length > 0) {
    for (const f of failures) console.log(f);
  }
}

export function resetCounters(): void {
  totalTests = 0;
  passedTests = 0;
  failedTests = 0;
  failures.length = 0;
}

export function getResults(): { total: number; passed: number; failed: number } {
  return { total: totalTests, passed: passedTests, failed: failedTests };
}
