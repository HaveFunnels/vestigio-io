import { buildBusinessContext, coerceSurfaces, coerceContentFlags } from '../business-context';

describe('buildBusinessContext', () => {
  it('returns onboarding when perception is absent', () => {
    const ctx = buildBusinessContext({
      onboardingModel: 'ecommerce',
      perceivedVertical: null,
      perceivedVerticalConfidence: null,
      perceivedSurfaces: null,
    });
    expect(ctx.vertical).toBe('ecommerce');
    expect(ctx.vertical_source).toBe('onboarding');
    expect(ctx.vertical_confidence).toBeNull();
    expect(ctx.surfaces).toEqual([]);
  });

  it('lets a confident perception override onboarding', () => {
    const ctx = buildBusinessContext({
      onboardingModel: 'ecommerce',
      perceivedVertical: 'local_service',
      perceivedVerticalConfidence: 0.85,
      perceivedSurfaces: [
        { url: 'https://x/agendar', purpose: 'booking', confidence: 0.9 },
      ],
    });
    expect(ctx.vertical).toBe('local_service');
    expect(ctx.vertical_source).toBe('perceived');
    expect(ctx.vertical_confidence).toBeCloseTo(0.85);
    expect(ctx.surfaces).toHaveLength(1);
  });

  it('keeps onboarding when perception is below the override threshold', () => {
    const ctx = buildBusinessContext({
      onboardingModel: 'saas',
      perceivedVertical: 'local_service',
      perceivedVerticalConfidence: 0.5,
      perceivedSurfaces: null,
    });
    expect(ctx.vertical).toBe('saas');
    expect(ctx.vertical_source).toBe('onboarding');
    expect(ctx.vertical_confidence).toBeNull();
  });

  it('is none when nothing is known', () => {
    const ctx = buildBusinessContext({
      onboardingModel: null,
      perceivedVertical: null,
      perceivedVerticalConfidence: null,
      perceivedSurfaces: null,
    });
    expect(ctx.vertical).toBeNull();
    expect(ctx.vertical_source).toBe('none');
  });

  it('coerces and exposes content flags (PV.8)', () => {
    const ctx = buildBusinessContext({
      onboardingModel: 'infoproduct',
      perceivedVertical: null,
      perceivedVerticalConfidence: null,
      perceivedSurfaces: null,
      perceivedContentFlags: [{ flag: 'has_guarantee', present: true, confidence: 0.9 }],
    });
    expect(ctx.contentFlags).toEqual([{ flag: 'has_guarantee', present: true, confidence: 0.9 }]);
  });

  it('defaults content flags to [] when omitted', () => {
    const ctx = buildBusinessContext({
      onboardingModel: 'saas',
      perceivedVertical: null,
      perceivedVerticalConfidence: null,
      perceivedSurfaces: null,
    });
    expect(ctx.contentFlags).toEqual([]);
  });
});

describe('coerceSurfaces', () => {
  it('keeps in-ontology surfaces, drops the rest, dedups by url', () => {
    const surfaces = coerceSurfaces([
      { url: 'https://x/agendar', purpose: 'booking', confidence: 0.9 },
      { url: 'https://x/bad', purpose: 'not_a_purpose', confidence: 0.9 },
      { url: 'https://x/agendar', purpose: 'service_listing', confidence: 0.5 }, // dup url
      'garbage',
      { purpose: 'menu' }, // no url
    ]);
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]).toEqual({ url: 'https://x/agendar', purpose: 'booking', confidence: 0.9 });
  });

  it('returns [] for non-array input', () => {
    expect(coerceSurfaces(null)).toEqual([]);
    expect(coerceSurfaces({})).toEqual([]);
    expect(coerceSurfaces('x')).toEqual([]);
  });

  it('clamps surface confidence', () => {
    const surfaces = coerceSurfaces([{ url: 'https://x/', purpose: 'homepage', confidence: 9 }]);
    expect(surfaces[0].confidence).toBe(1);
  });
});

describe('coerceContentFlags', () => {
  it('keeps in-ontology flags, drops the rest, dedups by flag', () => {
    const flags = coerceContentFlags([
      { flag: 'has_guarantee', present: true, confidence: 0.9 },
      { flag: 'bogus_flag', present: true, confidence: 0.9 }, // out of ontology
      { flag: 'has_guarantee', present: false, confidence: 0.2 }, // dup flag
      { flag: 'has_immediate_contact', present: false, confidence: 0.8 },
      'garbage',
    ]);
    expect(flags).toHaveLength(2);
    expect(flags[0]).toEqual({ flag: 'has_guarantee', present: true, confidence: 0.9 });
    expect(flags[1].present).toBe(false);
  });

  it('returns [] for non-array input', () => {
    expect(coerceContentFlags(null)).toEqual([]);
    expect(coerceContentFlags('x')).toEqual([]);
  });

  it('clamps flag confidence and defaults present to false', () => {
    const flags = coerceContentFlags([{ flag: 'has_guarantee', confidence: 9 }]);
    expect(flags[0].confidence).toBe(1);
    expect(flags[0].present).toBe(false);
  });
});
