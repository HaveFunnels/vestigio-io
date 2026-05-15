/**
 * Side-effect import that initializes the OpenTelemetry SDK BEFORE any
 * other module in the audit-worker process is loaded. Must be the very
 * first import in worker-loop.ts. The SDK patches http, Prisma, Redis,
 * etc. at startup; modules loaded earlier are invisible to the tracer.
 *
 * No exports — pure side effect. See src/libs/otel.ts for the actual
 * SDK configuration.
 */

import { initOtel } from "../../src/libs/otel";

initOtel({ serviceName: "audit-worker" });
