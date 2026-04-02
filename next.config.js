const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
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
				],
			},
		];
	},
};

module.exports = withNextIntl(nextConfig);
