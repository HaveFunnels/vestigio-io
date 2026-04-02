/**
 * Returns the value of an environment variable or throws
 * immediately if it's missing. Prevents silent failures
 * from empty-string fallbacks.
 *
 * Usage:
 *   const key = requireEnv("STRIPE_SECRET_KEY");
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Set it in .env or your deployment configuration.`
    );
  }
  return value;
}

/**
 * Returns the value of an environment variable or undefined.
 * Use for genuinely optional integrations (OAuth providers, etc.)
 * that should be silently skipped when not configured.
 */
export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}
