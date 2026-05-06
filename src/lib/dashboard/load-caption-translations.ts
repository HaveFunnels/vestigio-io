import type { CaptionTranslations } from "./captions";
import { SUPPORTED_LOCALES } from "@/i18n/supported-locales";
import { integrations } from "../../../integrations.config";

/**
 * Loads caption translations for the given locale from the dictionary
 * file. Returns undefined for English or when i18n is disabled (which
 * causes all caption functions to use their English defaults).
 *
 * This runs server-side in the API route context. The result is passed
 * to the aggregator so all pre-computed captions land in the user's
 * language at response time.
 */
export function loadCaptionTranslations(locale: string | null | undefined): CaptionTranslations | undefined {
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

    const captions = dict?.console?.dashboard?.captions;
    const packLabels = dict?.console?.common?.pack_labels;

    if (!captions && !packLabels) return undefined;

    return {
      pack_labels: packLabels,
      money_recovered: captions?.money_recovered,
      health_score: captions?.health_score,
      exposure: captions?.exposure,
      change_report: captions?.change_report,
      activity_heatmap: captions?.activity_heatmap,
      cross_signal: captions?.cross_signal,
    };
  } catch {
    return undefined;
  }
}
