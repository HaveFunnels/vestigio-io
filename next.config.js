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
	// Exclude Node.js-only modules from client bundles.
	// playwright/playwright-core are transitively imported via:
	//   "use client" page → console-data → mcp-client → McpServer → workers/verification → playwright
	// These modules only execute server-side. Marking them as external prevents
	// webpack from trying to bundle them for the browser.
	// Externalize packages that depend on Node.js builtins (stream, crypto, dns, net)
	// to prevent webpack from trying to bundle them for the client
	serverExternalPackages: ['sanity', 'next-sanity', '@sanity/client', '@sanity/image-url', '@sanity/asset-utils', 'ioredis'],
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
		return [
			{
				source: "/(.*)",
				headers: [
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
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
					{
						key: "Content-Security-Policy",
						value: [
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
							"frame-ancestors 'none'",
						].join("; "),
					},
				],
			},
		];
	},
};

module.exports = withNextIntl(nextConfig);
