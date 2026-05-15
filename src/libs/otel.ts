/**
 * OpenTelemetry SDK boot for Node-side services (Next.js web + worker).
 *
 * Both services call `initOtel(serviceName)` from their startup hook
 * BEFORE any other module touches HTTP, Prisma, Redis, fs, etc. — the
 * SDK patches those modules at startup so it can record spans/metrics
 * transparently. If the SDK starts late, modules loaded earlier are
 * already past the patching point and stay invisible to the tracer.
 *
 * Where boot happens:
 *   - Web:    src/instrumentation.ts (Next.js `register()` hook).
 *   - Worker: apps/audit-runner/worker-loop.ts (first import).
 *
 * Where data goes:
 *   - Backend: Grafana Cloud OTLP HTTP gateway (free tier).
 *   - Endpoint + auth come from env vars (OTEL_EXPORTER_OTLP_ENDPOINT,
 *     OTEL_EXPORTER_OTLP_HEADERS). Both set per-service on Railway.
 *
 * Cost: $0/month at our scale. Grafana Cloud free tier covers ~10k
 * customers' worth of telemetry. See docs/scaling.md §C3.
 *
 * If OTEL_EXPORTER_OTLP_ENDPOINT is not set, init is a no-op. Lets local
 * dev run without telemetry plumbing.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	ATTR_SERVICE_NAME,
	ATTR_SERVICE_NAMESPACE,
	ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PrismaInstrumentation } from "@prisma/instrumentation";

let _sdk: NodeSDK | null = null;
let _initialized = false;

export interface InitOtelOptions {
	/** Free-form service name. e.g. "vestigio-web", "audit-worker". */
	serviceName: string;
	/** Optional version string for the Service tag. Defaults to git SHA or "unknown". */
	serviceVersion?: string;
}

/**
 * Initialize the OTel SDK. Idempotent — second call is a no-op.
 *
 * Returns `true` if the SDK was started, `false` if no endpoint was
 * configured (local dev) or initialization was skipped.
 */
export function initOtel(opts: InitOtelOptions): boolean {
	if (_initialized) return _sdk !== null;
	_initialized = true;

	const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!endpoint) {
		console.log("[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled");
		return false;
	}

	// Grafana Cloud expects Basic auth: `instanceId:apiKey` base64. We
	// accept it via the standard OTEL_EXPORTER_OTLP_HEADERS env var so
	// nothing about the auth format is hardcoded in this file.
	// Format: `Authorization=Basic%20<base64>` (URL-encoded space).
	// The SDK auto-reads this env var for both trace + metric exporters.

	const namespace = process.env.OTEL_SERVICE_NAMESPACE || "vestigio";
	const env = process.env.NODE_ENV || "development";
	const version =
		opts.serviceVersion ||
		process.env.OTEL_SERVICE_VERSION ||
		process.env.RAILWAY_GIT_COMMIT_SHA ||
		"unknown";

	const resource = resourceFromAttributes({
		[ATTR_SERVICE_NAME]: opts.serviceName,
		[ATTR_SERVICE_NAMESPACE]: namespace,
		[ATTR_SERVICE_VERSION]: version,
		// Use the string attribute directly (semconv ATTR for deployment
		// environment landed in newer versions; using literal string is
		// stable across versions and Grafana recognizes it natively).
		"deployment.environment.name": env,
		"deployment.environment": env, // legacy alias still queried by some dashboards
	});

	const traceExporter = new OTLPTraceExporter({
		// Endpoint here is the FULL OTLP URL incl. /v1/traces suffix.
		// We append it ourselves so the env var stays the bare gateway URL
		// that Grafana shows in their onboarding wizard.
		url: `${endpoint.replace(/\/$/, "")}/v1/traces`,
	});

	const metricExporter = new OTLPMetricExporter({
		url: `${endpoint.replace(/\/$/, "")}/v1/metrics`,
	});

	const sdk = new NodeSDK({
		resource,
		traceExporter,
		metricReader: new PeriodicExportingMetricReader({
			exporter: metricExporter,
			// 30s is a good balance: dashboards stay fresh without
			// hammering the gateway. Grafana Cloud's metric ingest is
			// time-bucketed at 15s minimum so we double-sample.
			exportIntervalMillis: 30_000,
		}),
		instrumentations: [
			// Selected instrumentations only. The full auto-instrumentation
			// bundle pulls in lambda/aws/serverless adapters that webpack
			// can't bundle for our runtime artifact, and most of them are
			// noise for our workload anyway.
			//
			// HTTP: traces every inbound + outbound Node http/https call.
			// This is what wraps Next.js page renders, /api routes, and
			// external API calls (Anthropic, Brevo, Shopify, etc.).
			new HttpInstrumentation({
				// Drop health/metrics endpoints from traces — they fire
				// hundreds of times an hour and just create noise.
				ignoreIncomingRequestHook: (req) => {
					const url = req.url || "";
					return (
						url.startsWith("/api/health") ||
						url.startsWith("/api/metrics") ||
						url === "/" /* Railway healthcheck */
					);
				},
			}),
			// Undici: traces fetch() calls. Next.js uses undici internally
			// for fetch from server components, so this catches calls that
			// http instrumentation misses.
			new UndiciInstrumentation(),
			// Redis: traces every queue op + cache lookup. Critical for
			// the audit queue work since most cycle dispatch goes through
			// Redis.
			new IORedisInstrumentation(),
			// Prisma: traces every query (SELECT, INSERT, transactions).
			// Requires `previewFeatures = ["tracing"]` on the Prisma
			// schema generator (set in schema.prisma).
			new PrismaInstrumentation(),
		],
	});

	try {
		sdk.start();
		_sdk = sdk;
		console.log(
			`[otel] started: service=${opts.serviceName} ns=${namespace} env=${env} → ${endpoint}`,
		);

		// Graceful shutdown so in-flight spans flush before the process
		// dies. Railway sends SIGTERM ~30s before forceful kill.
		process.on("SIGTERM", () => {
			sdk
				.shutdown()
				.then(() => console.log("[otel] shutdown complete"))
				.catch((err) => console.warn("[otel] shutdown error:", err));
		});

		return true;
	} catch (err) {
		console.warn("[otel] start failed:", err);
		_sdk = null;
		return false;
	}
}

/** True when the SDK is running and exporting telemetry. */
export function isOtelActive(): boolean {
	return _sdk !== null;
}
