import { scoreEdge, scoreEdges, type SurfaceRelationForScoring } from '../edge-scorer';

describe('Edge Scorer', () => {
  it('classifies CTA text in main as cta_primary', () => {
    const score = scoreEdge({
      sourceUrl: 'https://example.com/',
      targetUrl: 'https://example.com/signup',
      relationType: 'anchor',
      linkText: 'Start Free Trial',
      position: 'main',
    });
    expect(score.linkIntent).toBe('cta_primary');
    expect(score.linkWeight).toBe(1.0);
  });

  it('classifies footer links as footer', () => {
    const score = scoreEdge({
      sourceUrl: 'https://example.com/',
      targetUrl: 'https://example.com/privacy',
      relationType: 'anchor',
      linkText: 'Privacy Policy',
      position: 'footer',
    });
    expect(score.linkIntent).toBe('footer');
    expect(score.linkWeight).toBe(0.1);
  });

  it('classifies nav links without CTA text as navigation', () => {
    const score = scoreEdge({
      sourceUrl: 'https://example.com/',
      targetUrl: 'https://example.com/features',
      relationType: 'anchor',
      linkText: 'Features',
      position: 'nav',
    });
    expect(score.linkIntent).toBe('navigation');
    expect(score.linkWeight).toBe(0.2);
  });

  it('classifies nav links WITH CTA text as cta_secondary', () => {
    const score = scoreEdge({
      sourceUrl: 'https://example.com/',
      targetUrl: 'https://example.com/signup',
      relationType: 'anchor',
      linkText: 'Sign Up Free',
      position: 'nav',
    });
    expect(score.linkIntent).toBe('cta_secondary');
    expect(score.linkWeight).toBe(0.7);
  });

  it('classifies form_action as cta_primary', () => {
    const score = scoreEdge({
      sourceUrl: 'https://example.com/contact',
      targetUrl: 'https://example.com/api/contact',
      relationType: 'form_action',
      linkText: null,
      position: 'main',
    });
    expect(score.linkIntent).toBe('cta_primary');
    expect(score.linkWeight).toBe(1.0);
  });

  it('boosts links to high-value targets', () => {
    const score = scoreEdge({
      sourceUrl: 'https://example.com/features',
      targetUrl: 'https://example.com/checkout',
      relationType: 'anchor',
      linkText: null, // no text, but target is checkout
      position: 'unknown',
      targetPageType: 'checkout',
    });
    expect(score.linkWeight).toBeGreaterThanOrEqual(0.7);
  });

  it('detects repeated links as navigation via scoreEdges batch', () => {
    // Same link appears on all 10 source pages
    const relations: SurfaceRelationForScoring[] = [];
    for (let i = 0; i < 10; i++) {
      relations.push({
        sourceUrl: `https://example.com/page-${i}`,
        targetUrl: 'https://example.com/about',
        relationType: 'anchor',
        linkText: 'About Us',
        position: 'unknown',
      });
    }

    const scores = scoreEdges(relations, 10);
    // Check any of the scored edges — they should all be navigation
    for (const [, score] of scores) {
      expect(score.linkIntent).toBe('navigation');
      expect(score.linkWeight).toBeLessThanOrEqual(0.2);
    }
  });

  it('utility patterns get weight 0', () => {
    const score = scoreEdge({
      sourceUrl: 'https://example.com/blog',
      targetUrl: 'https://example.com/blog?page=2',
      relationType: 'anchor',
      linkText: '2',
      position: 'main',
    });
    expect(score.linkIntent).toBe('utility');
    expect(score.linkWeight).toBe(0.0);
  });
});
