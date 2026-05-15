/**
 * Module that initializes the OpenTelemetry SDK BEFORE any other module
 * in the audit-worker process is loaded. Must be the very first import
 * in worker-loop.ts. The SDK patches http, Prisma, Redis, etc. at
 * startup; modules loaded earlier are invisible to the tracer.
 *
 * Exports a sentinel value so tsx/esbuild doesn't tree-shake the
 * side-effect-only import. Without this, the bundler can elide the
 * `import "./otel-boot"` statement entirely when it detects no value
 * is used from the file.
 */

import { initOtel } from "../../src/libs/otel";

console.log("[otel-boot] running…");
export const __otelBooted = initOtel({ serviceName: "audit-worker" });
console.log(`[otel-boot] initOtel returned ${__otelBooted}`);
