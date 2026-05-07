import { classifyPage, type PageClassificationResult } from '../page-classifier';

function makeCtx(overrides: Partial<Parameters<typeof classifyPage>[0]> = {}) {
  return {
    url: 'https://example.com/pricing',
    path: '/pricing',
    title: 'Pricing Plans',
    h1: 'Choose your plan',
    metaDescription: null,
    hasForms: false,
    formCount: 0,
    bodyWordCount: 500,
    existingPageType: 'pricing',
    businessModel: null,
    ...overrides,
  };
}

describe('Page Classifier', () => {
  it('classifies /pricing with matching title as pricing with high confidence', () => {
    const result = classifyPage(makeCtx(), []);
    expect(result.classifiedPageType).toBe('pricing');
    expect(result.classificationConfidence).toBeGreaterThanOrEqual(50);
  });

  it('classifies / as homepage', () => {
    const result = classifyPage(makeCtx({
      url: 'https://example.com/',
      path: '/',
      title: 'Welcome to Example',
      h1: 'Build faster',
      existingPageType: 'landing',
    }), []);
    expect(result.classifiedPageType).toBe('homepage');
  });

  it('classifies form-heavy short page as signup', () => {
    const result = classifyPage(makeCtx({
      url: 'https://example.com/start',
      path: '/start',
      title: 'Get Started',
      h1: 'Create your account',
      hasForms: true,
      formCount: 1,
      bodyWordCount: 200,
      existingPageType: 'other',
    }), []);
    expect(['signup', 'demo']).toContain(result.classifiedPageType);
  });

  it('never returns confidence below 20 when votes exist', () => {
    // Force a scenario with disagreeing signals
    const result = classifyPage(makeCtx({
      url: 'https://example.com/xyz',
      path: '/xyz',
      title: 'Blog Post Title',
      h1: 'Pricing Page',
      existingPageType: 'other',
    }), []);
    expect(result.classificationConfidence).toBeGreaterThanOrEqual(20);
  });

  it('falls back to existingPageType with low confidence when no signals match', () => {
    const result = classifyPage(makeCtx({
      url: 'https://example.com/abc123',
      path: '/abc123',
      title: null,
      h1: null,
      existingPageType: 'other',
    }), []);
    expect(result.classifiedPageType).toBe('other');
    expect(result.classificationConfidence).toBeLessThanOrEqual(40);
  });

  it('uses LLM enrichment when available', () => {
    const evidence = [{
      evidence_type: 'content_enrichment',
      payload: {
        source_url: 'https://example.com/features',
        enrichment_type: 'page_purpose_validation',
        results: { detected_page_type: 'features' },
      },
    }] as any[];

    const result = classifyPage(makeCtx({
      url: 'https://example.com/features',
      path: '/features',
      title: 'Our Features',
      h1: 'What we offer',
      existingPageType: 'other',
    }), evidence);
    expect(result.classifiedPageType).toBe('features');
    expect(result.classificationConfidence).toBeGreaterThanOrEqual(50);
  });

  it('business model context boosts SaaS-specific classification', () => {
    const result = classifyPage(makeCtx({
      url: 'https://example.com/trial',
      path: '/trial',
      title: 'Start Free Trial',
      h1: 'Try it free',
      hasForms: true,
      formCount: 1,
      bodyWordCount: 300,
      existingPageType: 'other',
      businessModel: 'saas',
    }), []);
    expect(result.classifiedPageType).toBe('signup');
  });

  it('long content pages classify as blog', () => {
    const result = classifyPage(makeCtx({
      url: 'https://example.com/how-to-do-x',
      path: '/how-to-do-x',
      title: 'How to do X: Complete Guide',
      h1: 'How to do X',
      bodyWordCount: 3000,
      existingPageType: 'other',
    }), []);
    expect(result.classifiedPageType).toBe('blog');
  });
});
