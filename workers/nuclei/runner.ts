import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  NucleiScanConfig,
  NucleiRawMatch,
  DEFAULT_SCAN_CONFIG,
  CuratedNucleiCheck,
  CommercialDownsideFamily,
} from '../../packages/nuclei-adapter';
import { CURATED_CHECKS } from '../../packages/nuclei-adapter/curated-checks';

// ──────────────────────────────────────────────
// Nuclei Runner — CLI Adapter
//
// Executes Nuclei as a subprocess with curated templates.
// NOT a generic scanner — runs only the curated check suite.
//
// Prerequisites:
// - nuclei binary must be installed and in PATH
// - templates must be available at the configured path
//
// Safety:
// - rate limited
// - timeout enforced
// - only curated templates executed
// - scoped to target domains only
// ──────────────────────────────────────────────

const execFileAsync = promisify(execFile);

export interface NucleiRunResult {
  matches: NucleiRawMatch[];
  templates_executed: number;
  duration_ms: number;
  errors: string[];
  skipped_targets: string[];
}

/**
 * Check if nuclei binary is available.
 */
export async function isNucleiAvailable(): Promise<boolean> {
  try {
    await execFileAsync('nuclei', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run curated Nuclei scan against target domains.
 * Returns only matches from curated template suite.
 */
export async function runNucleiScan(
  config: NucleiScanConfig,
): Promise<NucleiRunResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const matches: NucleiRawMatch[] = [];

  // Filter curated checks by requested families
  const checksToRun = CURATED_CHECKS.filter(c =>
    config.families.includes(c.downside_family),
  );

  if (checksToRun.length === 0) {
    return { matches: [], templates_executed: 0, duration_ms: 0, errors: ['No curated checks match requested families'], skipped_targets: [] };
  }

  // Build template list
  const templateIds = checksToRun
    .map(c => c.nuclei_template)
    .slice(0, config.max_templates || DEFAULT_SCAN_CONFIG.max_templates!);

  const args = [
    '-target', config.targets.join(','),
    '-templates', templateIds.join(','),
    '-rate-limit', String(config.rate_limit || DEFAULT_SCAN_CONFIG.rate_limit!),
    '-timeout', String(config.timeout_seconds || DEFAULT_SCAN_CONFIG.timeout_seconds!),
    '-json',
    '-silent',
    '-no-color',
  ];

  try {
    const { stdout, stderr } = await execFileAsync('nuclei', args, {
      timeout: (config.timeout_seconds || 120) * 1000 + 10000, // buffer
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    if (stderr) {
      errors.push(stderr.slice(0, 500));
    }

    // Parse JSON-lines output
    for (const line of stdout.split('\n').filter(l => l.trim())) {
      try {
        const result = JSON.parse(line);
        matches.push({
          template_id: result['template-id'] || result.templateID || '',
          matched_at: result['matched-at'] || result.host || '',
          severity: result.info?.severity || 'info',
          name: result.info?.name || '',
          description: result.info?.description || '',
          tags: result.info?.tags || [],
          extracted_results: result['extracted-results'] || [],
          timestamp: new Date(),
        });
      } catch {
        // skip malformed lines
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Nuclei execution failed: ${msg.slice(0, 300)}`);
  }

  return {
    matches,
    templates_executed: templateIds.length,
    duration_ms: Date.now() - startTime,
    errors,
    skipped_targets: [],
  };
}
