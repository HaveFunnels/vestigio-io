// ──────────────────────────────────────────────
// Environment Validation — FAIL-FAST
//
// Called on server startup. Crashes immediately
// if required configuration is missing.
// No silent fallbacks. No partial starts.
// ──────────────────────────────────────────────

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

const REQUIRED_VARS: { key: string; description: string }[] = [
  { key: 'DATABASE_URL', description: 'PostgreSQL connection string' },
  { key: 'SECRET', description: 'NextAuth secret key (openssl rand -base64 32)' },
  { key: 'NEXTAUTH_URL', description: 'NextAuth callback URL (e.g. https://yourdomain.com)' },
  { key: 'SITE_URL', description: 'Public site URL (e.g. https://yourdomain.com)' },
];

const PRODUCTION_REQUIRED_VARS: { key: string; description: string }[] = [
  { key: 'VESTIGIO_SECRET_KEY', description: 'AES-256 encryption key for stored credentials (openssl rand -hex 32)' },
  { key: 'ANTHROPIC_API_KEY', description: 'Anthropic API key for Claude LLM chat (sk-ant-...)' },
];

const PRODUCTION_RECOMMENDED_VARS: { key: string; description: string }[] = [
  { key: 'REDIS_URL', description: 'Redis connection URL for job queue, rate limiting, and session persistence' },
  { key: 'PADDLE_API_KEY', description: 'Paddle API key (primary payment)' },
  { key: 'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN', description: 'Paddle client token for checkout' },
  { key: 'STRIPE_SECRET_KEY', description: 'Stripe API key (fallback payment)' },
  { key: 'STRIPE_WEBHOOK_SECRET', description: 'Stripe webhook signing secret' },
  { key: 'EMAIL_SERVER_HOST', description: 'SMTP server host (required for magic link / invites)' },
  { key: 'EMAIL_SERVER_USER', description: 'SMTP username' },
  { key: 'EMAIL_SERVER_PASSWORD', description: 'SMTP password' },
  { key: 'EMAIL_FROM', description: 'Sender email address' },
];

const RECOMMENDED_VARS: { key: string; description: string }[] = [
  { key: 'GOOGLE_CLIENT_ID', description: 'Google OAuth — omit to disable Google login' },
  { key: 'GITHUB_CLIENT_ID', description: 'GitHub OAuth — omit to disable GitHub login' },
  { key: 'OPENAI_API_KEY', description: 'OpenAI API key for AI features' },
  { key: 'R2_ACCESS_KEY_ID', description: 'Cloudflare R2 storage — omit to disable uploads' },
];

export function validateEnv(env: Record<string, string | undefined> = process.env as any): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === 'production';

  // Always required
  for (const v of REQUIRED_VARS) {
    if (!env[v.key]) missing.push(`${v.key} — ${v.description}`);
  }

  // Production-only required
  if (isProduction) {
    for (const v of PRODUCTION_REQUIRED_VARS) {
      if (!env[v.key]) missing.push(`[PRODUCTION] ${v.key} — ${v.description}`);
    }
  }

  // Recommended (warnings only)
  for (const v of RECOMMENDED_VARS) {
    if (!env[v.key]) warnings.push(`${v.key} — ${v.description}`);
  }

  // Production recommended (warnings, not blockers)
  if (isProduction) {
    for (const v of PRODUCTION_RECOMMENDED_VARS) {
      if (!env[v.key]) warnings.push(`[PRODUCTION] ${v.key} — ${v.description}`);
    }
  }

  return { valid: missing.length === 0, missing, warnings };
}

/**
 * Crash the process if env is invalid.
 * Call this at the very start of the application.
 */
export function enforceEnv(): void {
  const result = validateEnv();

  if (result.warnings.length > 0) {
    console.warn('⚠ Environment warnings:');
    for (const w of result.warnings) console.warn(`  - ${w}`);
  }

  if (!result.valid) {
    console.error('✖ Missing required environment variables:');
    for (const m of result.missing) console.error(`  - ${m}`);
    console.error('\nVestigio cannot start without these variables.');
    console.error('Set them in .env or your deployment configuration.\n');

    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
