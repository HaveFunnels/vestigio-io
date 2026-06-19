import { defineConfig } from "vitest/config";
import path from "node:path";

// vitest config — coexists with the existing tests/ folder that runs
// under node's built-in test runner via tsx. New tests colocated next
// to source files in src/ run under vitest with jsdom for React
// component tests + path alias resolution matching tsconfig.
export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./vitest.setup.ts"],
		include: [
			"src/**/*.test.{ts,tsx}",
			"packages/**/*.test.{ts,tsx}",
		],
		exclude: [
			"node_modules/**",
			".next/**",
			"tests/**", // legacy node-test-runner suite stays separate
		],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/**/*.test.{ts,tsx}",
				"src/**/*.d.ts",
				"src/app/**/page.tsx",
				"src/app/**/layout.tsx",
			],
		},
	},
});
