import {
	Evidence,
	EvidenceType,
	SourceKind,
	CollectionMethod,
	FreshnessState,
	IdGenerator,
	Scoping,
	Freshness,
	BusinessModel,
} from '../../packages/domain';

// ──────────────────────────────────────────────
// Authenticated Post-Login Crawler
//
// After a successful login, this crawler navigates a small set of
// high-value authenticated URLs (dashboard, settings, onboarding,
// billing, etc.) and emits the 5 evidence types that the SaaS
// signal extractor in packages/signals/saas-signals.ts consumes:
//
//   - AuthenticatedPageView      (one per crawled page)
//   - ActivationStepObserved     (when a page looks like an
//                                  onboarding/checklist step)
//   - EmptyStateObserved         (when a page renders an empty state)
//   - UpgradeSurfaceObserved     (when an upgrade CTA is visible)
//   - NavigationStructureObserved (one per session, structural)
//
// Without this layer the SaaS Growth Readiness pack stays dormant
// forever — its signal extractors would always see an empty filter.
//
// Design rules:
//   - Same-host only. Never crawl off-domain.
//   - Cap at MAX_PAGES so a misconfigured nav can't run wild.
//   - Per-page timeout so a slow page can't tank the whole cycle.
//   - DOM-only heuristics (no LLM). Best-effort, opinionated.
//
// SECURITY NOTE — `page.evaluate()` / `page.$$eval()` usage:
//   These are Playwright's standard DOM extraction API. They serialize
//   the static function defined HERE (not user input) and run it inside
//   the Chromium sandbox bound to the target site's origin. This is NOT
//   JavaScript `eval()` on untrusted input — the callbacks are compiled
//   at build time and have no access to Node globals. Pattern is the
//   same as authenticated-runtime.ts:282 + every Playwright integration
//   in the codebase. No user-supplied code is executed.
// ──────────────────────────────────────────────

export interface CrawlOptions {
	max_pages: number;
	per_page_timeout_ms: number;
	business_model: BusinessModel | null;
}

const DEFAULT_OPTIONS: CrawlOptions = {
	max_pages: 10,
	per_page_timeout_ms: 8000,
	business_model: null,
};

// Seed paths per business model. The crawler also discovers paths from
// the post-login page's nav (handled in pickCrawlTargets). Seeds act as
// a baseline so we always probe the universally meaningful URLs even
// when the nav is hidden behind a JS shell.
const SEED_PATHS_BY_MODEL: Record<BusinessModel | 'default', string[]> = {
	saas: ['/dashboard', '/onboarding', '/settings', '/billing', '/integrations', '/team', '/account'],
	lead_gen: ['/dashboard', '/leads', '/settings', '/integrations'],
	ecommerce: ['/admin', '/orders', '/products', '/customers', '/settings'],
	hybrid: ['/dashboard', '/settings', '/billing', '/integrations', '/admin'],
	default: ['/dashboard', '/settings', '/onboarding', '/billing'],
};

export interface CrawlResult {
	pages_visited: number;
	pages_failed: number;
	total_duration_ms: number;
	evidence: Evidence[];
}

/**
 * Crawl an authenticated session post-login. The `page` argument must
 * be a Playwright `Page` instance that's already navigated past login.
 *
 * Never throws. On any per-page failure, increments `pages_failed`
 * and continues.
 */
export async function crawlAuthenticated(
	page: any,
	postLoginUrl: string,
	scoping: Scoping,
	cycleRef: string,
	options: Partial<CrawlOptions> = {},
): Promise<CrawlResult> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const ids = new IdGenerator('auth_crawl');
	const startTime = Date.now();
	const evidence: Evidence[] = [];

	let pagesVisited = 0;
	let pagesFailed = 0;

	// Pick targets — seed list per business model + same-host nav links
	const targets = await pickCrawlTargets(page, postLoginUrl, opts);

	// Always emit a nav structure evidence first (one-shot per session).
	try {
		const navEv = await extractNavStructure(ids, page, scoping, cycleRef);
		if (navEv) evidence.push(navEv);
	} catch {
		/* nav extraction is best-effort */
	}

	// Crawl each target with a per-page timeout. The first iteration is
	// the post-login URL itself — re-extracting evidence from where the
	// session landed.
	for (const url of targets.slice(0, opts.max_pages)) {
		try {
			// Navigate (or stay if already on the URL).
			if (page.url() !== url) {
				await page.goto(url, {
					waitUntil: 'domcontentloaded',
					timeout: opts.per_page_timeout_ms,
				});
			}

			// Quick post-nav wait so any client-side render settles.
			await page.waitForTimeout(700).catch(() => {});

			const pageEvidence = await extractPageEvidence(
				ids,
				page,
				url,
				scoping,
				cycleRef,
			);
			evidence.push(...pageEvidence);
			pagesVisited++;
		} catch {
			pagesFailed++;
			continue;
		}
	}

	return {
		pages_visited: pagesVisited,
		pages_failed: pagesFailed,
		total_duration_ms: Date.now() - startTime,
		evidence,
	};
}

// ──────────────────────────────────────────────
// Target selection
// ──────────────────────────────────────────────

async function pickCrawlTargets(
	page: any,
	postLoginUrl: string,
	opts: CrawlOptions,
): Promise<string[]> {
	const targets = new Set<string>();
	targets.add(postLoginUrl); // start with where we landed

	// Same-host base for URL composition
	let base: URL;
	try {
		base = new URL(postLoginUrl);
	} catch {
		return Array.from(targets);
	}
	const host = base.host;

	// Same-host links discovered from the post-login page's nav. Limited
	// to the first 30 anchors to avoid pulling in the entire DOM.
	try {
		const navHrefs: string[] = await page
			.$$eval('a[href]', (anchors: any[]) =>
				anchors
					.slice(0, 30)
					.map((a: any) => a.getAttribute('href'))
					.filter(Boolean),
			)
			.catch(() => [] as string[]);

		for (const href of navHrefs) {
			try {
				const abs = new URL(href, base).toString();
				const u = new URL(abs);
				// Same-host + not asset + not the login page
				if (
					u.host === host &&
					!u.pathname.match(/\.(png|jpg|svg|css|js|woff2?)$/i) &&
					!u.pathname.match(/\/(login|signin|signout|logout)/i)
				) {
					// Strip query + fragment to dedupe variants
					u.search = '';
					u.hash = '';
					targets.add(u.toString());
				}
			} catch {
				/* skip malformed href */
			}
		}
	} catch {
		/* nav harvest is best-effort */
	}

	// Seed paths by business model. Adds canonical SaaS surfaces
	// regardless of whether they appeared in nav (single-page apps often
	// hide them).
	const model = opts.business_model ?? 'default';
	const seeds = SEED_PATHS_BY_MODEL[model as keyof typeof SEED_PATHS_BY_MODEL] ?? SEED_PATHS_BY_MODEL.default;
	for (const path of seeds) {
		try {
			const u = new URL(path, `${base.protocol}//${host}`);
			targets.add(u.toString());
		} catch {
			/* skip */
		}
	}

	return Array.from(targets);
}

// ──────────────────────────────────────────────
// Per-page evidence extraction
// ──────────────────────────────────────────────

async function extractPageEvidence(
	ids: IdGenerator,
	page: any,
	url: string,
	scoping: Scoping,
	cycleRef: string,
): Promise<Evidence[]> {
	const ev: Evidence[] = [];

	// Pull DOM signals in a single $eval pass so we don't pay round-trip
	// per check. All heuristics are best-effort regex / selector counts.
	const probe = await page
		.evaluate(() => {
			const text = (document.body?.innerText || '').toLowerCase();
			const titleText = (document.title || '').toLowerCase();

			// Empty state heuristics — common phrasing + low content density
			const emptyPhrases = [
				'nothing here yet',
				'no results',
				'no data',
				'get started',
				'create your first',
				'add your first',
				'you don’t have',
				'you have no',
				'nada por aqui',
				'sem resultados',
				'comece criando',
				'crie sua primeira',
				'agregue tu primer',
				'no hay resultados',
				'noch nichts hier',
				'keine ergebnisse',
			];
			const hasEmptyPhrase = emptyPhrases.some((p) => text.includes(p));
			const lowContentDensity =
				document.body && document.body.innerText.length < 600;
			const hasEmptyState = hasEmptyPhrase || (lowContentDensity && /(get started|create|add)/i.test(text));

			// Empty state context — try to find what's empty (heading near it)
			const firstHeading = document.querySelector('h1, h2, h3')?.textContent?.trim().slice(0, 60) || '';

			// CTA in empty state? Any primary button visible
			const hasCta = !!document.querySelector(
				'button, a[role="button"], a.btn, a.button',
			);
			const hasGuidance = /step|guia|guide|how to|como|cómo|wie man/i.test(text);
			const hasSampleDataOption = /sample|example|demo|exemplo|ejemplo|beispiel/i.test(text);

			// Upgrade CTA heuristics
			const upgradePhrases = [
				'upgrade',
				'unlock',
				'upgrade plan',
				'try pro',
				'try premium',
				'desbloquear',
				'upgrade do plano',
				'mejora tu plan',
				'plan upgraden',
			];
			const upgradeAnchors = Array.from(
				document.querySelectorAll('a, button'),
			).filter((el) => {
				const t = (el.textContent || '').toLowerCase();
				return upgradePhrases.some((p) => t.includes(p));
			});
			const hasUpgradeCta = upgradeAnchors.length > 0;
			// Visibility heuristic: prominent if in header/banner/sidebar with
			// high z-index, hidden if not in viewport, subtle if just present
			let upgradeVisibility: 'prominent' | 'subtle' | 'hidden' = 'subtle';
			if (upgradeAnchors.length > 0) {
				const el = upgradeAnchors[0] as HTMLElement;
				const rect = el.getBoundingClientRect();
				if (rect.top < 200 && rect.width > 80) upgradeVisibility = 'prominent';
				else if (rect.top > window.innerHeight) upgradeVisibility = 'hidden';
			}
			const hasUpgradePricing = upgradeAnchors.some((el) => /\$|€|R\$|R \$|£|\d+\s*\/(mo|month|mês|mes|monat)/i.test(el.textContent || ''));
			const hasUpgradeValue = upgradeAnchors.some((el) =>
				/unlimited|premium|advanced|pro|ilimitado|avançado|premium|profesional|professionell/i.test(el.textContent || ''),
			);

			// Onboarding prompt heuristics — checklist / step indicators / welcome
			const onboardingPhrases = [
				'getting started',
				'welcome',
				'checklist',
				'complete your setup',
				'step',
				'bem-vindo',
				'começar',
				'primeiros passos',
				'bienvenido',
				'comienza',
				'willkommen',
				'erste schritte',
			];
			const hasOnboardingPrompt = onboardingPhrases.some((p) => text.includes(p)) ||
				!!document.querySelector('[class*="onboarding"], [class*="checklist"], [data-onboarding]');

			// Step indicator (step X of Y, progress)
			const stepMatch = text.match(/step\s+(\d+)\s+(?:of|de|von)\s+(\d+)/i);
			const hasProgressIndicator = !!document.querySelector(
				'[role="progressbar"], [class*="progress"], [class*="stepper"]',
			) || !!stepMatch;
			const stepIndex = stepMatch ? parseInt(stepMatch[1], 10) : 0;

			// Activation CTA — primary visible button with verb-led text
			const hasClearActivationCta = Array.from(
				document.querySelectorAll('button, a[role="button"]'),
			).slice(0, 20).some((el) => {
				const t = (el.textContent || '').toLowerCase().trim();
				return /^(start|begin|create|add|connect|invite|set up|continue|next|comece|comecar|criar|conectar|empezar|crear|conectar|starten|erstellen|verbinden)/i.test(t);
			});

			// Nav count for this page (used in AuthenticatedPageView payload)
			const navItemsCount = document.querySelectorAll('nav a, nav button, [role="navigation"] a').length;

			return {
				titleText,
				hasEmptyState,
				emptyContext: firstHeading || 'unknown context',
				hasGuidance,
				hasCta,
				hasSampleDataOption,
				hasUpgradeCta,
				upgradeVisibility,
				hasUpgradePricing,
				hasUpgradeValue,
				hasOnboardingPrompt,
				hasProgressIndicator,
				stepIndex,
				hasClearActivationCta,
				navItemsCount,
			};
		})
		.catch(() => null);

	if (!probe) return ev;

	const title = await page.title().catch(() => null);
	const pageType = classifyPageType(url, probe.titleText);

	// AuthenticatedPageView — always emit one per crawled page
	ev.push({
		id: ids.next(),
		evidence_key: `auth_page_${ids.current()}`,
		evidence_type: EvidenceType.AuthenticatedPageView,
		subject_ref: url,
		scoping,
		cycle_ref: cycleRef,
		freshness: buildFreshness(),
		source_kind: SourceKind.BrowserVerification,
		collection_method: CollectionMethod.DynamicRender,
		payload: {
			type: 'authenticated_page_view',
			url,
			title,
			page_type: pageType,
			has_empty_state: probe.hasEmptyState,
			has_upgrade_cta: probe.hasUpgradeCta,
			has_onboarding_prompt: probe.hasOnboardingPrompt,
			nav_items_count: probe.navItemsCount,
		} as any,
		quality_score: 75,
		created_at: new Date(),
		updated_at: new Date(),
	});

	// EmptyStateObserved
	if (probe.hasEmptyState) {
		ev.push({
			id: ids.next(),
			evidence_key: `empty_state_${ids.current()}`,
			evidence_type: EvidenceType.EmptyStateObserved,
			subject_ref: url,
			scoping,
			cycle_ref: cycleRef,
			freshness: buildFreshness(),
			source_kind: SourceKind.BrowserVerification,
			collection_method: CollectionMethod.DynamicRender,
			payload: {
				type: 'empty_state_observed',
				url,
				has_guidance: probe.hasGuidance,
				has_cta: probe.hasCta,
				has_sample_data_option: probe.hasSampleDataOption,
				context: probe.emptyContext,
			} as any,
			quality_score: 70,
			created_at: new Date(),
			updated_at: new Date(),
		});
	}

	// UpgradeSurfaceObserved
	if (probe.hasUpgradeCta) {
		ev.push({
			id: ids.next(),
			evidence_key: `upgrade_${ids.current()}`,
			evidence_type: EvidenceType.UpgradeSurfaceObserved,
			subject_ref: url,
			scoping,
			cycle_ref: cycleRef,
			freshness: buildFreshness(),
			source_kind: SourceKind.BrowserVerification,
			collection_method: CollectionMethod.DynamicRender,
			payload: {
				type: 'upgrade_surface_observed',
				url,
				visibility: probe.upgradeVisibility,
				context: pageType,
				has_pricing_info: probe.hasUpgradePricing,
				has_value_proposition: probe.hasUpgradeValue,
			} as any,
			quality_score: 70,
			created_at: new Date(),
			updated_at: new Date(),
		});
	}

	// ActivationStepObserved — emit only when this page looks like an
	// onboarding step (avoid spurious activation evidence on settings
	// pages with an unrelated "step" word in copy).
	const looksLikeStep =
		probe.hasOnboardingPrompt &&
		(pageType === 'onboarding' || probe.stepIndex > 0 || probe.hasProgressIndicator);
	if (looksLikeStep) {
		ev.push({
			id: ids.next(),
			evidence_key: `activation_step_${ids.current()}`,
			evidence_type: EvidenceType.ActivationStepObserved,
			subject_ref: url,
			scoping,
			cycle_ref: cycleRef,
			freshness: buildFreshness(),
			source_kind: SourceKind.BrowserVerification,
			collection_method: CollectionMethod.DynamicRender,
			payload: {
				type: 'activation_step_observed',
				step_url: url,
				step_name: title || pageType,
				step_index: probe.stepIndex,
				has_clear_cta: probe.hasClearActivationCta,
				has_progress_indicator: probe.hasProgressIndicator,
				estimated_complexity: estimateComplexity(probe.hasClearActivationCta, probe.hasProgressIndicator, probe.navItemsCount),
			} as any,
			quality_score: 70,
			created_at: new Date(),
			updated_at: new Date(),
		});
	}

	return ev;
}

// ──────────────────────────────────────────────
// Nav structure (one-shot per session)
// ──────────────────────────────────────────────

async function extractNavStructure(
	ids: IdGenerator,
	page: any,
	scoping: Scoping,
	cycleRef: string,
): Promise<Evidence | null> {
	const navProbe = await page
		.evaluate(() => {
			const navRoot = document.querySelector('nav, [role="navigation"], aside[class*="sidebar"]');
			if (!navRoot) return null;
			const allAnchors = Array.from(navRoot.querySelectorAll('a, button'));
			const totalNavItems = allAnchors.length;

			// Depth: count nested <ul> levels under nav root
			const depthOfNode = (n: Element): number => {
				let depth = 1;
				const children = Array.from(n.children);
				let maxChild = 0;
				for (const c of children) {
					if (c.tagName === 'UL' || c.tagName === 'OL' || c.querySelector('ul, ol')) {
						maxChild = Math.max(maxChild, depthOfNode(c));
					}
				}
				return depth + maxChild;
			};
			const depthLevels = depthOfNode(navRoot);

			const hasSearch =
				!!document.querySelector('input[type="search"]') ||
				!!document.querySelector('[aria-label*="search" i], [placeholder*="search" i], [placeholder*="buscar" i], [placeholder*="suchen" i]');
			const hasHelp = Array.from(document.querySelectorAll('a, button')).some(
				(el) => /help|ajuda|ayuda|hilfe|support/i.test(el.textContent || '') || /help|ajuda|ayuda|hilfe/i.test((el as any).getAttribute?.('aria-label') || ''),
			);

			// Primary section labels — top-level anchor text only
			const primarySections = allAnchors
				.slice(0, 8)
				.map((a) => (a.textContent || '').trim().slice(0, 30))
				.filter((s) => s.length > 0);

			return {
				totalNavItems,
				depthLevels,
				hasSearch,
				hasHelp,
				primarySections,
			};
		})
		.catch(() => null);

	if (!navProbe) return null;

	return {
		id: ids.next(),
		evidence_key: `nav_struct_${ids.current()}`,
		evidence_type: EvidenceType.NavigationStructureObserved,
		subject_ref: page.url(),
		scoping,
		cycle_ref: cycleRef,
		freshness: buildFreshness(),
		source_kind: SourceKind.BrowserVerification,
		collection_method: CollectionMethod.DynamicRender,
		payload: {
			type: 'navigation_structure_observed',
			total_nav_items: navProbe.totalNavItems,
			depth_levels: navProbe.depthLevels,
			has_search: navProbe.hasSearch,
			has_help: navProbe.hasHelp,
			primary_sections: navProbe.primarySections,
		} as any,
		quality_score: 75,
		created_at: new Date(),
		updated_at: new Date(),
	};
}

// ──────────────────────────────────────────────
// Heuristics
// ──────────────────────────────────────────────

function classifyPageType(url: string, titleText: string): string {
	const path = (() => {
		try {
			return new URL(url).pathname.toLowerCase();
		} catch {
			return url.toLowerCase();
		}
	})();
	const t = titleText.toLowerCase();

	if (/onboarding|getting-started|welcome|setup/.test(path) || /onboarding|welcome|getting started/.test(t))
		return 'onboarding';
	if (/billing|subscription|invoice|payment/.test(path) || /billing|subscription/.test(t))
		return 'billing';
	if (/settings|account|profile|preferences/.test(path) || /settings|account/.test(t))
		return 'settings';
	if (/dashboard|home|overview/.test(path) || /dashboard|overview/.test(t))
		return 'dashboard';
	if (/upgrade|pricing|plans/.test(path)) return 'upgrade';
	return 'feature';
}

function estimateComplexity(
	hasClearCta: boolean,
	hasProgress: boolean,
	navItems: number,
): 'low' | 'medium' | 'high' {
	// Low complexity = single clear CTA + progress bar + minimal nav
	if (hasClearCta && hasProgress && navItems < 8) return 'low';
	// High complexity = no CTA AND no progress (or very dense nav)
	if ((!hasClearCta && !hasProgress) || navItems > 20) return 'high';
	return 'medium';
}

function buildFreshness(): Freshness {
	const now = new Date();
	return {
		observed_at: now,
		fresh_until: new Date(now.getTime() + 86400000),
		freshness_state: FreshnessState.Fresh,
		staleness_reason: null,
	};
}
