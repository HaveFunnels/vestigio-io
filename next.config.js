const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: "standalone",
	eslint: {
		// Skip ESLint during builds — lint separately in CI
		ignoreDuringBuilds: true,
	},
	typescript: {
		// Skip type checking during builds — check separately in CI
		ignoreBuildErrors: true,
	},
	// Tree-shake icon and date libraries at import time. Without this, every
	// `import { Foo } from "@phosphor-icons/react"` pulls the full barrel
	// export into the standalone bundle (~57MB phosphor, ~38MB lucide, ~24MB
	// date-fns locally). Next.js rewrites these to direct module-level imports
	// per the optimizePackageImports allowlist — see Wave 18z (docs/ROADMAP.md)
	// for the ~80-100MB image-size win this targets.
	experimental: {
		optimizePackageImports: [
			"@phosphor-icons/react",
			"lucide-react",
			"date-fns",
		],
	},
	// Exclude Node.js-only modules from client bundles.
	// playwright/playwright-core are transitively imported via:
	//   "use client" page → console-data → mcp-client → McpServer → workers/verification → playwright
	// These modules only execute server-side. Marking them as external prevents
	// webpack from trying to bundle them for the browser.
	// Externalize packages that depend on Node.js builtins (stream, crypto, dns, net)
	// to prevent webpack from trying to bundle them for the client
	// esbuild is required at runtime by apps/audit-runner/recompute-pool.ts
	// (bundles the worker-thread entry on first spawn). The require is
	// reachable from API routes (trigger-audit -> run-cycle -> pool),
	// but only fires when RECOMPUTE_USE_WORKER_THREADS=1 in the worker
	// service. Marking esbuild external keeps webpack from trying to
	// parse its .d.ts files (which contain TypeScript-only syntax).
	//
	// OpenTelemetry SDK depends on @grpc/grpc-js which uses Node builtins
	// (tls, net, zlib). Externalizing the OTel packages + grpc-js keeps
	// webpack from trying to bundle these Node-only modules into the
	// runtime artifact.
	serverExternalPackages: [
		'sanity', 'next-sanity', '@sanity/client', '@sanity/image-url', '@sanity/asset-utils',
		'ioredis', 'esbuild',
		'@opentelemetry/sdk-node',
		'@opentelemetry/exporter-trace-otlp-http',
		'@opentelemetry/exporter-metrics-otlp-http',
		'@opentelemetry/sdk-metrics',
		'@opentelemetry/instrumentation-http',
		'@opentelemetry/instrumentation-undici',
		'@opentelemetry/instrumentation-ioredis',
		'@prisma/instrumentation',
		'@grpc/grpc-js',
	],
	webpack: (config, { isServer }) => {
		if (!isServer) {
			config.resolve.fallback = {
				...config.resolve.fallback,
				fs: false,
				child_process: false,
				http2: false,
				net: false,
				tls: false,
				dns: false,
				readline: false,
				inspector: false,
			};
			// Treat playwright as empty module in client bundles
			config.resolve.alias = {
				...config.resolve.alias,
				'playwright': false,
				'playwright-core': false,
			};
		}
		return config;
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "cdn.sanity.io",
				port: "",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
				port: "",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
				port: "",
			},
			{
				protocol: "https",
				hostname: "pub-b7fd9c30cdbf439183b75041f5f71b92.r2.dev",
				port: "",
			},
		],
	},

	async headers() {
		const sharedSecurityHeaders = [
			{
				key: "X-Content-Type-Options",
				value: "nosniff",
			},
			{
				key: "Referrer-Policy",
				value: "strict-origin-when-cross-origin",
			},
			{
				key: "X-DNS-Prefetch-Control",
				value: "on",
			},
			{
				key: "Strict-Transport-Security",
				value: "max-age=31536000; includeSubDomains",
			},
			{
				key: "Permissions-Policy",
				value: "camera=(), microphone=(), geolocation=()",
			},
		];

		const baseCspDirectives = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.sanity.io https://*.paddle.com https://*.facebook.net https://*.google-analytics.com https://*.googletagmanager.com https://static.cloudflareinsights.com",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.sanity.io",
			"img-src 'self' data: blob: https://cdn.sanity.io https://*.googleusercontent.com https://*.githubusercontent.com https://*.r2.cloudflarestorage.com https://cdn.vestigio.io",
			"media-src 'self' https://cdn.vestigio.io",
			"font-src 'self' https://fonts.gstatic.com",
			"connect-src 'self' https://*.sanity.io https://*.paddle.com https://*.google-analytics.com wss://*.sanity.io https://cdn.vestigio.io",
			"frame-src 'self' https://*.paddle.com https://*.sanity.io",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		];

		// Studio CSP: extends base with core.sanity-cdn.com (bridge script)
		const studioCspDirectives = [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.sanity.io https://core.sanity-cdn.com https://*.paddle.com https://*.facebook.net https://*.google-analytics.com https://*.googletagmanager.com https://static.cloudflareinsights.com",
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.sanity.io",
			"img-src 'self' data: blob: https://cdn.sanity.io https://*.googleusercontent.com https://*.githubusercontent.com https://*.r2.cloudflarestorage.com https://cdn.vestigio.io",
			"media-src 'self' https://cdn.vestigio.io",
			"font-src 'self' https://fonts.gstatic.com",
			"connect-src 'self' https://*.sanity.io https://core.sanity-cdn.com https://*.paddle.com https://*.google-analytics.com wss://*.sanity.io https://cdn.vestigio.io",
			"frame-src 'self' https://*.paddle.com https://*.sanity.io",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
		];

		return [
			// Sanity Studio: frame-ancestors 'self' + core.sanity-cdn.com for bridge script
			{
				source: "/studio/:path*",
				headers: [
					...sharedSecurityHeaders,
					{
						key: "X-Frame-Options",
						value: "SAMEORIGIN",
					},
					{
						key: "Content-Security-Policy",
						value: [...studioCspDirectives, "frame-ancestors 'self'"].join("; "),
					},
				],
			},
			// Everything else: strict frame-ancestors 'none'
			{
				source: "/((?!studio).*)",
				headers: [
					...sharedSecurityHeaders,
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Content-Security-Policy",
						value: [...baseCspDirectives, "frame-ancestors 'none'"].join("; "),
					},
				],
			},
		];
	},
};

module.exports = withNextIntl(nextConfig);
