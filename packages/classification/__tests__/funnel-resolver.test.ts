import { resolveFunnelModel, buildStageOrderMap, getStageForPageType } from '../funnel-resolver';

describe('Funnel Resolver', () => {
  it('resolves SaaS model from declared business model', () => {
    const model = resolveFunnelModel('saas', null);
    expect(model.modelType).toBe('saas');
    expect(model.stages.length).toBeGreaterThan(0);
    expect(model.stages.some(s => s.key === 'evaluation')).toBe(true);
  });

  it('resolves ecommerce model from declared model', () => {
    const model = resolveFunnelModel('ecommerce', null);
    expect(model.modelType).toBe('ecommerce');
    expect(model.stages.some(s => s.key === 'browse')).toBe(true);
  });

  it('falls back to inferred when declared is null', () => {
    const model = resolveFunnelModel(null, 'saas');
    expect(model.modelType).toBe('saas');
  });

  it('defaults to ecommerce when nothing provided', () => {
    const model = resolveFunnelModel(null, null);
    expect(model.modelType).toBe('ecommerce');
  });

  it('does NOT override declared model even with mismatched pages', () => {
    // SaaS declared but pages look like ecommerce
    const pages = new Set(['product', 'cart', 'checkout']) as any;
    const model = resolveFunnelModel('saas', null, pages);
    expect(model.modelType).toBe('saas'); // declared is trusted
  });

  it('DOES override inferred model when pages dont match', () => {
    // Inferred ecommerce but only saas-like pages exist
    const pages = new Set(['features', 'pricing', 'signup']) as any;
    const model = resolveFunnelModel(null, 'ecommerce', pages);
    expect(model.modelType).toBe('saas'); // reclassified based on pages
  });

  it('normalizes aliases correctly', () => {
    expect(resolveFunnelModel('SaaS', null).modelType).toBe('saas');
    expect(resolveFunnelModel('e-commerce', null).modelType).toBe('ecommerce');
    expect(resolveFunnelModel('lead generation', null).modelType).toBe('lead_gen');
    expect(resolveFunnelModel('agency', null).modelType).toBe('services');
  });

  it('buildStageOrderMap produces numeric order per page type', () => {
    const model = resolveFunnelModel('saas', null);
    const map = buildStageOrderMap(model);
    expect(map['pricing']).toBeDefined();
    expect(map['homepage']).toBe(0);
    expect(map['pricing']).toBeGreaterThan(map['homepage']);
  });

  it('getStageForPageType finds the correct stage', () => {
    const model = resolveFunnelModel('saas', null);
    const stage = getStageForPageType('pricing', model);
    expect(stage).not.toBeNull();
    expect(stage!.key).toBe('evaluation');
  });

  it('getStageForPageType returns null for unmatched types', () => {
    const model = resolveFunnelModel('saas', null);
    const stage = getStageForPageType('other' as any, model);
    expect(stage).toBeNull();
  });
});
