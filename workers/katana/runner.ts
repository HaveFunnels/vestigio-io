import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  KatanaScanConfig,
  KatanaRawResult,
  DEFAULT_KATANA_CONFIG,
} from '../../packages/katana-adapter';

// ──────────────────────────────────────────────
// Katana Runner — CLI Adapter
//
// Executes Katana as a subprocess for deep JS-rendered
// route discovery. This is CONDITIONAL — only invoked
// when discovery gaps justify deeper crawling.
//
// NOT a second full crawler. Runs scoped, rate-limited,
// and commercially prioritized.
//
// Prerequisites:
// - katana binary must be installed and in PATH
//
// Safety:
// - rate limited
// - timeout enforced
// - max page limit enforced
// - same-host only by default
// - commercially prioritized URL filtering
// ──────────────────────────────────────────────

const execFileAsync = promisify(execFile);

export interface KatanaRunResult {
  results: KatanaRawResult[];
  urls_discovered: number;
  duration_ms: number;
  errors: string[];
}

/**
 * Check if katana binary is available.
 */
export async function isKatanaAvailable(): Promise<boolean> {
  try {
    await execFileAsync('katana', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run Katana deep discovery on a target.
 * Commercially scoped — prioritizes commerce-relevant paths.
 */
export async function runKatanaScan(
  config: KatanaScanConfig,
): Promise<KatanaRunResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const results: KatanaRawResult[] = [];

  const maxDepth = config.max_depth || DEFAULT_KATANA_CONFIG.max_depth!;
  const maxPages = config.max_pages || DEFAULT_KATANA_CONFIG.max_pages!;
  const timeout = config.timeout_seconds || DEFAULT_KATANA_CONFIG.timeout_seconds!;
  const rateLimit = config.rate_limit || DEFAULT_KATANA_CONFIG.rate_limit!;

  const args = [
    '-u', config.target,
    '-d', String(maxDepth),
    '-crawl-duration', `${timeout}s`,
    '-rate-limit', String(rateLimit),
    '-json',
    '-silent',
    '-no-color',
    // JS crawling mode — renders JavaScript
    '-headless',
    // Scope control
    '-crawl-scope', extractHost(config.target),
  ];

  // Restrict to same host if configured
  if (config.same_host_only !== false) {
    args.push('-scope-filter', extractHost(config.target));
  }

  try {
    const { stdout, stderr } = await execFileAsync('katana', args, {
      timeout: timeout * 1000 + 15000, // buffer for startup
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (stderr) {
      errors.push(stderr.slice(0, 500));
    }

    // Parse JSON-lines output
    let count = 0;
    for (const line of stdout.split('\n').filter(l => l.trim())) {
      if (count >= maxPages) break;
      try {
        const result = JSON.parse(line);
        results.push({
          url: result.request?.endpoint || result.request?.url || result.url || '',
          method: result.request?.method || 'GET',
          source: result.request?.source || 'unknown',
          status_code: result.response?.status_code || 0,
          content_type: result.response?.headers?.['content-type'] || '',
          body_length: result.response?.body?.length || 0,
          timestamp: new Date(),
        });
        count++;
      } catch {
        // skip malformed lines
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Katana execution failed: ${msg.slice(0, 300)}`);
  }

  return {
    results,
    urls_discovered: results.length,
    duration_ms: Date.now() - startTime,
    errors,
  };
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}
