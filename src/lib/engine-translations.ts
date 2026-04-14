import { cookies } from "next/headers";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";
import { integrations } from "../../integrations.config";
import type { EngineTranslations } from "../../packages/projections/types";

/**
 * Loads engine translations for an explicit locale string. Use this from
 * worker / background contexts where there's no request cookie to read.
 *
 * Why this exists: the audit-runner persists Finding rows with the title
 * and description text already resolved to a single language. If the
 * worker can't see the org owner's locale it falls back to English and
 * that English text gets written to the database — defeating i18n
 * everywhere downstream. Pass the owner's `User.locale` here so the
 * findings land in the right language at write-time.
 */
export function loadEngineTranslationsForLocale(locale: string | null | undefined): EngineTranslations | undefined {
  if (!integrations.isI18nEnabled) return undefined;
  if (!locale || locale === "en" || !SUPPORTED_LOCALES.includes(locale)) {
    return undefined;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs");
    const filePath = path.join(process.cwd(), "dictionary", `${locale}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    const dict = JSON.parse(raw);
    return dict.engine as EngineTranslations | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Loads the engine translations for the current request locale.
 * Returns undefined if i18n is disabled or locale is English (no translation needed).
 */
export async function loadEngineTranslations(): Promise<EngineTranslations | undefined> {
  if (!integrations.isI18nEnabled) return undefined;

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value || "";
  return loadEngineTranslationsForLocale(locale);
}
