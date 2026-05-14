// ──────────────────────────────────────────────
// Playwright Renderer (ingestion-side)
//
// Single-shot "go to URL, run JS, return rendered HTML" helper for the
// crawl pipeline. Shares the chromium concurrency pool with the
// verification runtime so a burst of SPA renders can't OOM the worker.
//
// Why a separate module from workers/verification/playwright-runtime.ts:
//   - Verification is multi-step (click, type, assert). Render-for-ingest
//     is one navigate + getContent. Forcing it through the scenario
//     interface adds dead branches.
//   - This file has no dependency on the VerificationScenario types,
//     so the inventory layer doesn't drag verification concepts into
//     the parser.
//
// All renders go through the same chromium-pool semaphore as verification
// scenarios, capped by env `CHROMIUM_POOL_SIZE`.
// ──────────────────────────────────────────────

import { withBrowserContext } from '../verification/chromium-pool';

export interface IngestionRenderOptions {
  // Total time budget for navigate + content extraction. Hard cap —
  // exceeded calls return success=false instead of hanging.
  timeoutMs: number;
  // Which load milestone to wait for. `networkidle` gives the JS the
  // best chance to finish, but is also the slowest. `domcontentloaded`
  // is faster but may miss late JS hydration.
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  // Optional viewport override. Defaults to desktop.
  viewport?: { width: number; height: number };
}

export interface IngestionRenderResult {
  success: boolean;
  // Final URL after any client-side redirects (window.location, history API).
  finalUrl: string;
  // Page.content() — the post-render serialized HTML.
  html: string;
  // Status code of the main document response. -1 if we couldn't capture it.
  statusCode: number;
  // Content-type of the main document. null if not captured.
  contentType: string | null;
  // Console.error count emitted during the render. Useful as a quality signal.
  consoleErrorCount: number;
  // First few console error messages (capped to keep payload small).
  consoleErrorSamples: string[];
  // How long the entire render took (wall-clock).
  durationMs: number;
  // When success=false, this carries the failure reason.
  error?: string;
}

const DEFAULTS: Required<Pick<IngestionRenderOptions, 'waitUntil' | 'viewport'>> = {
  waitUntil: 'networkidle',
  viewport: { width: 1280, height: 720 },
};

const MAX_CONSOLE_ERROR_SAMPLES = 5;

/**
 * Render a single URL with a headless browser and return the post-render
 * HTML. Safe to call concurrently — the chromium pool serializes
 * launches so we never exceed CHROMIUM_POOL_SIZE in flight.
 */
export async function renderForIngestion(
  url: string,
  options: IngestionRenderOptions,
): Promise<IngestionRenderResult> {
  const startedAt = Date.now();
  const waitUntil = options.waitUntil || DEFAULTS.waitUntil;
  const viewport = options.viewport || DEFAULTS.viewport;

  const consoleErrors: string[] = [];
  try {
    return await withBrowserContext(
      {
        viewport,
        userAgent: 'Vestigio-Ingestion/1.0',
        ignoreHTTPSErrors: true,
      },
      async (context) => {
        const page = await context.newPage();
        let mainStatus = -1;
        let mainContentType: string | null = null;

        page.on('console', (msg) => {
          if (msg.type() === 'error' && consoleErrors.length < MAX_CONSOLE_ERROR_SAMPLES) {
            consoleErrors.push(msg.text());
          }
        });

        page.on('response', (response) => {
          if (mainStatus !== -1) return;
          try {
            const reqUrl = response.url();
            if (reqUrl === url || reqUrl === response.request().url()) {
              mainStatus = response.status();
              mainContentType = response.headers()['content-type'] || null;
            }
          } catch { /* ignore */ }
        });

        const navResponse = await page.goto(url, {
          waitUntil,
          timeout: options.timeoutMs,
        });

        if (mainStatus === -1 && navResponse) {
          mainStatus = navResponse.status();
          mainContentType = navResponse.headers()['content-type'] || mainContentType;
        }

        const finalUrl = page.url();
        const html = await page.content();

        return {
          success: true,
          finalUrl,
          html,
          statusCode: mainStatus,
          contentType: mainContentType,
          consoleErrorCount: consoleErrors.length,
          consoleErrorSamples: consoleErrors,
          durationMs: Date.now() - startedAt,
        };
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      finalUrl: url,
      html: '',
      statusCode: -1,
      contentType: null,
      consoleErrorCount: consoleErrors.length,
      consoleErrorSamples: consoleErrors,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }
}
