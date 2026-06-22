import {
  resolveEffectiveVertical,
  isPerceivedVertical,
  isSurfacePurpose,
  PERCEPTION_OVERRIDE_THRESHOLD,
} from '../vertical';

describe('resolveEffectiveVertical', () => {
  it('uses perceived when confidence >= threshold', () => {
    expect(
      resolveEffectiveVertical({
        onboarding: 'ecommerce',
        perceived: 'local_service',
        perceivedConfidence: 0.85,
      }),
    ).toEqual({ vertical: 'local_service', source: 'perceived' });
  });

  it('falls back to onboarding when perceived confidence is below threshold', () => {
    expect(
      resolveEffectiveVertical({
        onboarding: 'ecommerce',
        perceived: 'local_service',
        perceivedConfidence: 0.5,
      }),
    ).toEqual({ vertical: 'ecommerce', source: 'onboarding' });
  });

  it('falls back to onboarding when perceived is null (the state until PV.2 ships)', () => {
    expect(
      resolveEffectiveVertical({
        onboarding: 'saas',
        perceived: null,
        perceivedConfidence: null,
      }),
    ).toEqual({ vertical: 'saas', source: 'onboarding' });
  });

  it('treats the threshold boundary as an override (>=)', () => {
    expect(
      resolveEffectiveVertical({
        onboarding: 'ecommerce',
        perceived: 'food',
        perceivedConfidence: PERCEPTION_OVERRIDE_THRESHOLD,
      }).source,
    ).toBe('perceived');
  });

  it('returns none when both sides are absent', () => {
    expect(
      resolveEffectiveVertical({ onboarding: null, perceived: null, perceivedConfidence: null }),
    ).toEqual({ vertical: null, source: 'none' });
  });

  it('ignores empty-string onboarding and perceived', () => {
    expect(
      resolveEffectiveVertical({ onboarding: '', perceived: '', perceivedConfidence: 0.9 }),
    ).toEqual({ vertical: null, source: 'none' });
  });

  it('does not override on perceived present but null confidence', () => {
    expect(
      resolveEffectiveVertical({
        onboarding: 'ecommerce',
        perceived: 'professional',
        perceivedConfidence: null,
      }),
    ).toEqual({ vertical: 'ecommerce', source: 'onboarding' });
  });
});

describe('taxonomy guards', () => {
  it('isPerceivedVertical accepts members, rejects others', () => {
    expect(isPerceivedVertical('local_service')).toBe(true);
    expect(isPerceivedVertical('professional')).toBe(true);
    expect(isPerceivedVertical('crypto_casino')).toBe(false);
    expect(isPerceivedVertical(null)).toBe(false);
    expect(isPerceivedVertical(undefined)).toBe(false);
  });

  it('isSurfacePurpose accepts members, rejects others', () => {
    expect(isSurfacePurpose('booking')).toBe(true);
    expect(isSurfacePurpose('service_listing')).toBe(true);
    expect(isSurfacePurpose('checkout')).toBe(true);
    expect(isSurfacePurpose('nonsense')).toBe(false);
    expect(isSurfacePurpose(null)).toBe(false);
  });
});
