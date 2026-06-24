// ──────────────────────────────────────────────
// Vestigio Index — cohort dataset shape
//
// One-shot scan results from scripts/seed-vestigio-index-cohort-*.ts
// land in src/data/vestigio-index/cohorts/<vertical>-<period>.ts
// using this shape. The same type is imported by:
//
//   - The essay route, if/when essays cite the cohort numerically.
//   - A future benchmark surface inside the authenticated Plano,
//     where each finding can cite "your vertical's prevalence" of
//     the same heuristic pattern (e.g. "73% of BR D2C sites have a
//     countdown timer — your store doesn't, +1 vs the cohort").
//
// Schema is intentionally flat — no normalization, no joins. The
// dataset is small (~25 sites × ~12 signals) and lives in code,
// not in a DB.
// ──────────────────────────────────────────────

/** Base shape required of every site result in a cohort scan.
 *  Beyond these 4 fields, each per-vertical scan adds its own
 *  signals via index-signature extension — ecommerce tracks
 *  countdown/scarcity/pix/whatsapp, saas-b2b tracks pricing/trial/
 *  integration patterns, infoprodutos tracks Hotmart/Eduzz/VSL/
 *  garantia/lote/bonus. Keeping the base loose lets the cohort
 *  registry hold all three without per-vertical types. */
export interface SiteSignals {
	url: string;
	status: "ok" | "fetch_error" | "timeout";
	statusCode?: number;
	fetchError?: string;
	// Per-vertical signal flags + counts. Boolean for presence checks,
	// number for counts/sizes, string optionally for the rare textual
	// extracted snippet.
	[signal: string]: boolean | number | string | undefined;
}

export interface CohortAggregate {
	vertical: string;
	period: string;
	scannedAt: string;
	urlsTotal: number;
	urlsScanned: number;
	urlsSucceeded: number;
	urlsFailed: number;
	/** Prevalence keys are vertical-specific — ecommerce/D2C tracks
	 *  countdownTimer/fakeScarcity/pix/whatsapp; saas-b2b tracks
	 *  pricingPageLink/freeTrialOffered/customerLogos/etc. Typed as
	 *  Record<string, number> at the cohort-aggregate level so the
	 *  peer-prevalence gate can read any registered cohort by key
	 *  without per-vertical type plumbing. The seeding scripts know
	 *  their own keyset; the gate doesn't care which subset is
	 *  registered for which vertical. */
	prevalence: Record<string, number>;
	/** Numeric averages tracked by the scan — same loose typing
	 *  rationale as prevalence. Optional (saas-b2b cohort doesn't
	 *  publish averages today). */
	averages?: Record<string, number>;
	sites: SiteSignals[];
}
