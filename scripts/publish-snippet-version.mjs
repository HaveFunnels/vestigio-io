#!/usr/bin/env node
/**
 * publish-snippet-version — freeze the current snippet as an immutable,
 * versioned artifact with a Subresource Integrity hash.
 *
 * Why: the checkout is a payment page, and a store loading a third-party
 * script there needs SRI. SRI pins a hash of the exact bytes, so the URL
 * it points at must be immutable — /snippet/vestigio.js changes on every
 * deploy and would break the hash. This publishes /snippet/v<VERSION>/
 * vestigio.js, which is written once per version and never rewritten, and
 * records its integrity hash in a manifest the app and docs read from.
 *
 * Source of truth: public/snippet/vestigio.js. Its header carries
 * `Snippet vX.Y`. On a meaningful change, bump that header, run this
 * script, and commit the new versioned file + manifest. The storefront
 * keeps using the unversioned /snippet/vestigio.js (latest); only the
 * checkout pins the versioned URL.
 *
 * Run: node scripts/publish-snippet-version.mjs
 * CI:  node scripts/publish-snippet-version.mjs --check   (drift guard)
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public", "snippet", "vestigio.js");
const MANIFEST = join(ROOT, "public", "snippet", "manifest.json");

function sriHash(buf) {
	return "sha384-" + createHash("sha384").update(buf).digest("base64");
}

function readVersion(src) {
	const m = src.match(/Snippet v(\d+\.\d+)/);
	if (!m) throw new Error("could not find `Snippet vX.Y` in the snippet header");
	return m[1];
}

const checkOnly = process.argv.includes("--check");
const srcBuf = readFileSync(SRC);
const version = readVersion(srcBuf.toString("utf8"));
const versionedRel = `snippet/v${version}/vestigio.js`;
const versionedAbs = join(ROOT, "public", versionedRel);
const integrity = sriHash(srcBuf);

const manifest = existsSync(MANIFEST)
	? JSON.parse(readFileSync(MANIFEST, "utf8"))
	: { versions: {} };

const frozen = existsSync(versionedAbs) ? readFileSync(versionedAbs) : null;

if (checkOnly) {
	// Drift guard for CI: fail if the source changed without a version
	// bump (the frozen artifact would no longer match latest), or if the
	// manifest is stale.
	let ok = true;
	if (frozen && !frozen.equals(srcBuf)) {
		console.error(
			`✖ snippet source differs from the frozen v${version} artifact.\n` +
				`  Bump the version in public/snippet/vestigio.js and run publish-snippet-version.`,
		);
		ok = false;
	}
	if (manifest.versions[version]?.integrity !== integrity) {
		console.error(`✖ manifest integrity for v${version} is stale. Run publish-snippet-version.`);
		ok = false;
	}
	if (!ok) process.exit(1);
	console.log(`✓ snippet v${version} matches its frozen artifact and manifest.`);
	process.exit(0);
}

// Immutable: never overwrite an existing versioned artifact. If the
// source changed, the version must change too — a re-publish of the same
// version with different bytes would silently invalidate every SRI hash
// already deployed on a customer's checkout.
if (frozen) {
	if (!frozen.equals(srcBuf)) {
		console.error(
			`✖ refusing to overwrite the immutable v${version} artifact with different bytes.\n` +
				`  Bump the version in public/snippet/vestigio.js first.`,
		);
		process.exit(1);
	}
	console.log(`v${version} already frozen and identical — nothing to do.`);
} else {
	mkdirSync(dirname(versionedAbs), { recursive: true });
	writeFileSync(versionedAbs, srcBuf);
	console.log(`froze public/${versionedRel}`);
}

manifest.versions[version] = {
	path: `/${versionedRel}`,
	integrity,
	bytes: srcBuf.length,
	frozenAt: manifest.versions[version]?.frozenAt ?? new Date().toISOString(),
};
manifest.latest = version;
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\nversion:   v${version}`);
console.log(`url:       /snippet/v${version}/vestigio.js`);
console.log(`integrity: ${integrity}`);
console.log(`\ncheckout install:`);
console.log(
	`  <script async src="https://app.vestigio.io/snippet/v${version}/vestigio.js"\n` +
		`          integrity="${integrity}"\n` +
		`          crossorigin="anonymous" data-env="ENV_ID"></script>`,
);
