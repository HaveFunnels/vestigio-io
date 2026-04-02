import { cookies } from "next/headers";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";
import { integrations } from "../../integrations.config";
import type { EngineTranslations } from "../../packages/projections/types";

/**
 * Loads the engine translations for the current request locale.
 * Returns undefined if i18n is disabled or locale is English (no translation needed).
 */
export async function loadEngineTranslations(): Promise<EngineTranslations | undefined> {
  if (!integrations.isI18nEnabled) return undefined;

  const cookieStore = await cookies();
  const locale = cookieStore.get("locale")?.value || "";

  if (!locale || locale === "en" || !SUPPORTED_LOCALES.includes(locale)) {
    return undefined;
  }

  try {
    const path = await import("node:path");
    const fs = await import("node:fs");
    const filePath = path.join(process.cwd(), "dictionary", `${locale}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    const dict = JSON.parse(raw);
    return dict.engine as EngineTranslations | undefined;
  } catch {
    return undefined;
  }
}
