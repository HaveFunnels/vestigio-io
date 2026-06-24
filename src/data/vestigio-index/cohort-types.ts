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

export interface SiteSignals {
	url: string;
	status: "ok" | "fetch_error" | "timeout";
	statusCode?: number;
	fetchError?: string;
	hasCountdownTimer: boolean;
	hasFakeScarcity: boolean;
	hasViewingCounter: boolean;
	hasCookieBanner: boolean;
	hasChatWidget: boolean;
	hasAutoplayVideo: boolean;
	hasH1: boolean;
	hasPixMention: boolean;
	hasWhatsappContact: boolean;
	aboveFoldCtaCount: number;
	totalFormFields: number;
}

export interface CohortAggregate {
	vertical: string;
	period: string;
	scannedAt: string;
	urlsTotal: number;
	urlsScanned: number;
	urlsSucceeded: number;
	urlsFailed: number;
	prevalence: {
		countdownTimer: number;
		fakeScarcity: number;
		viewingCounter: number;
		cookieBanner: number;
		chatWidget: number;
		autoplayVideo: number;
		visibleH1: number;
		pixMention: number;
		whatsappContact: number;
	};
	averages: {
		aboveFoldCtaCount: number;
		totalFormFields: number;
	};
	sites: SiteSignals[];
}
