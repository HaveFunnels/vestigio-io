// Client-bundle shim for `node:*` scheme imports.
//
// Wave 18e — server-only modules (packages/url-normalize/ssrf.ts,
// workers/*, apps/mcp/bootstrap.ts) import Node built-ins via the
// `node:` scheme (e.g. `node:dns/promises`). Webpack's
// `resolve.fallback` does not cover the `node:` scheme, so a bare
// client build fails with "Reading from node:dns/promises is not
// handled by plugins."
//
// This module is wired via NormalModuleReplacementPlugin in
// next.config.js — every `node:*` request in the client bundle is
// rewritten to point here. Exporting `module.exports = {}` and a
// permissive default keeps the runtime chain (which is dead code in
// the client bundle anyway, since these paths are behind dynamic
// imports and guarded by isServer checks) from throwing at import
// time.
//
// Do NOT import this in application code. It's a build-time shim.

module.exports = new Proxy(
	{},
	{
		get() {
			return () => {
				throw new Error(
					"[node-scheme-shim] Server-only Node built-in accessed in the client bundle. This should never execute — the calling code path is guarded by isServer / dynamic-import and should not be reached in the browser.",
				);
			};
		},
	},
);

module.exports.default = module.exports;
