/**
 * Article Translations
 * ─────────────────────────────────────────────────────────────────
 *
 * Extracts the engine translation sections (inference_titles,
 * root_cause_titles, root_cause_descriptions) from each dictionary
 * file and exposes locale-aware lookup functions for the foundation
 * article generator.
 *
 * Only the `engine` section of each dictionary is used — the rest
 * of the dictionary is not loaded into the article system.
 *
 * Supported locales: en, pt-BR, es, de.
 * English is the canonical source (INFERENCE_TITLES / ROOT_CAUSE_*)
 * and is never read from the dictionary here — the existing engine
 * constants remain the single source of truth for English.
 */

import enDict from '../../dictionary/en.json';
import ptBRDict from '../../dictionary/pt-BR.json';
import esDict from '../../dictionary/es.json';
import deDict from '../../dictionary/de.json';

// ── Types ──────────────────────────────────────────────────────

export interface LocaleTranslations {
  inference_titles: Record<string, string>;
  root_cause_titles: Record<string, string>;
  root_cause_descriptions: Record<string, string>;
}

// ── Extract engine sections from each dictionary ───────────────

const LOCALE_MAP: Record<string, LocaleTranslations> = {
  'pt-BR': {
    inference_titles: (ptBRDict as any).engine?.inference_titles ?? {},
    root_cause_titles: (ptBRDict as any).engine?.root_cause_titles ?? {},
    root_cause_descriptions: (ptBRDict as any).engine?.root_cause_descriptions ?? {},
  },
  es: {
    inference_titles: (esDict as any).engine?.inference_titles ?? {},
    root_cause_titles: (esDict as any).engine?.root_cause_titles ?? {},
    root_cause_descriptions: (esDict as any).engine?.root_cause_descriptions ?? {},
  },
  de: {
    inference_titles: (deDict as any).engine?.inference_titles ?? {},
    root_cause_titles: (deDict as any).engine?.root_cause_titles ?? {},
    root_cause_descriptions: (deDict as any).engine?.root_cause_descriptions ?? {},
  },
  en: {
    inference_titles: (enDict as any).engine?.inference_titles ?? {},
    root_cause_titles: (enDict as any).engine?.root_cause_titles ?? {},
    root_cause_descriptions: (enDict as any).engine?.root_cause_descriptions ?? {},
  },
};

// ── Public API ─────────────────────────────────────────────────

/** Supported non-English locales for foundation articles. */
export const SUPPORTED_LOCALES = ['en', 'pt-BR', 'es', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Get the full translation map for a locale.
 * Returns `null` for unsupported locales — caller should fall back to English.
 */
export function getTranslationsForLocale(locale: string): LocaleTranslations | null {
  return LOCALE_MAP[locale] ?? null;
}

/**
 * Look up a translated inference title.
 * Returns `undefined` if no translation exists for the key in the given locale.
 */
export function getTranslatedInferenceTitle(locale: string, key: string): string | undefined {
  return LOCALE_MAP[locale]?.inference_titles[key];
}

/**
 * Look up a translated root cause title.
 * Returns `undefined` if no translation exists for the key in the given locale.
 */
export function getTranslatedRootCauseTitle(locale: string, key: string): string | undefined {
  return LOCALE_MAP[locale]?.root_cause_titles[key];
}

/**
 * Look up a translated root cause description.
 * Returns `undefined` if no translation exists for the key in the given locale.
 */
export function getTranslatedRootCauseDescription(locale: string, key: string): string | undefined {
  return LOCALE_MAP[locale]?.root_cause_descriptions[key];
}
