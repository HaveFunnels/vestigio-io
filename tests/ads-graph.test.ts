/**
 * Ads Graph Integration — Layer 1 foundation tests
 *
 * Verifies that Meta/Google ads creatives and campaigns become
 * first-class nodes in the evidence graph, with `ad_targets` edges
 * pointing at the correct destination page nodes.
 *
 * Run: npx tsx --test tests/ads-graph.test.ts
 */

import {
	assert,
	assertEqual,
	testEvidence,
	testScoping,
	pageContentEvidence,
} from "./helpers";

import { buildGraph } from "../packages/graph";
import type { IntegrationSnapshot, MetaAdsSnapshotData, GoogleAdsSnapshotData } from "../packages/integrations/types";
import type { GraphNode } from "../packages/graph/types";

let suitesPassed = 0;
let suitesFailed = 0;
const failures: string[] = [];

function runSuite(name: string, fn: () => void): void {
	try {
		fn();
		suitesPassed++;
		console.log(`  ✓ ${name}`);
	} catch (err) {
		suitesFailed++;
		const msg = err instanceof Error ? err.message : String(err);
		failures.push(`  ✗ ${name}\n      ${msg}`);
		console.log(`  ✗ ${name}: ${msg}`);
	}
}

function metaSnapshot(creatives: MetaAdsSnapshotData["creatives"]): IntegrationSnapshot<"meta_ads"> {
	return {
		provider: "meta_ads",
		fetched_at: new Date().toISOString(),
		window: "30d",
		data: { ad_spend_30d: creatives.reduce((s, c) => s + c.spend_30d, 0), currency: "BRL", creatives },
	};
}

function googleSnapshot(campaigns: GoogleAdsSnapshotData["campaigns"]): IntegrationSnapshot<"google_ads"> {
	return {
		provider: "google_ads",
		fetched_at: new Date().toISOString(),
		window: "30d",
		data: { ad_spend_30d: campaigns.reduce((s, c) => s + c.spend_30d, 0), currency: "BRL", campaigns },
	};
}

function findNodeByKey(graph: ReturnType<typeof buildGraph>, key: string): GraphNode | undefined {
	const id = graph.nodesByKey.get(key);
	return id ? graph.nodes.get(id) : undefined;
}

// ══════════════════════════════════════════════════

console.log("Ads Graph — Layer 1");

runSuite("Meta creative becomes ad_creative node with metadata", () => {
	const ev = [pageContentEvidence("https://shop.example.com/", "Home")];
	const snap = metaSnapshot([
		{ id: "cr_1", headline: "50% off today", body: "Buy now", cta: "SHOP_NOW", destination_url: "https://shop.example.com/promo", status: "ACTIVE", spend_30d: 500 },
	]);
	const graph = buildGraph(ev, "shop.example.com", "cycle:1", [snap]);

	const node = findNodeByKey(graph, "ad_creative:meta_ads:cr_1");
	assert(node !== undefined, "creative node created");
	assertEqual(node!.node_type, "ad_creative", "node_type");
	assertEqual(node!.label, "50% off today", "label = headline");
	assertEqual((node!.metadata as any).platform, "meta_ads", "platform");
	assertEqual((node!.metadata as any).spend_30d, 500, "spend");
	assertEqual((node!.metadata as any).cta, "SHOP_NOW", "cta");
});

runSuite("Meta creative ad_targets edge resolves to existing page node", () => {
	const promoUrl = "https://shop.example.com/promo";
	const ev = [pageContentEvidence(promoUrl, "Promo")];
	const snap = metaSnapshot([
		{ id: "cr_2", headline: "Deal", body: "", cta: "", destination_url: promoUrl, status: "ACTIVE", spend_30d: 200 },
	]);
	const graph = buildGraph(ev, "shop.example.com", "cycle:1", [snap]);

	const adNodeId = graph.nodesByKey.get("ad_creative:meta_ads:cr_2")!;
	const edges = graph.edgeIndex.get(adNodeId) || [];
	const adTargets = edges.filter(e => e.edge_type === "ad_targets");
	assertEqual(adTargets.length, 1, "one ad_targets edge");

	const targetPageId = adTargets[0].target_id;
	const targetPage = graph.nodes.get(targetPageId);
	assert(targetPage !== undefined, "target page exists");
	assertEqual(targetPage!.node_type, "page", "targets a page node");
	assert(targetPage!.url!.includes("/promo"), "correct URL");
});

runSuite("Meta creative creates new page node when destination not in crawl", () => {
	const ev = [pageContentEvidence("https://shop.example.com/", "Home")];
	const snap = metaSnapshot([
		{ id: "cr_3", headline: "New arrivals", body: "", cta: "", destination_url: "https://shop.example.com/new-arrivals", status: "ACTIVE", spend_30d: 100 },
	]);
	const graph = buildGraph(ev, "shop.example.com", "cycle:1", [snap]);

	const newPageId = graph.nodesByUrl.get("https://shop.example.com/new-arrivals");
	assert(newPageId !== undefined, "page node created for uncrawled destination");
});

runSuite("Google campaign becomes ad_campaign node with metadata", () => {
	const ev = [pageContentEvidence("https://store.example.com/", "Home")];
	const snap = googleSnapshot([
		{
			id: "cam_1", name: "Black Friday Campaign",
			headlines: ["50% off", "Free shipping"], descriptions: ["Best deals"],
			final_url: "https://store.example.com/bf", spend_30d: 3000,
		},
	]);
	const graph = buildGraph(ev, "store.example.com", "cycle:1", [snap]);

	const node = findNodeByKey(graph, "ad_campaign:google_ads:cam_1");
	assert(node !== undefined, "campaign node created");
	assertEqual(node!.node_type, "ad_campaign", "node_type");
	assertEqual(node!.label, "Black Friday Campaign", "label = name");
	assertEqual((node!.metadata as any).platform, "google_ads", "platform");
	assertEqual((node!.metadata as any).spend_30d, 3000, "spend");
	assert(Array.isArray((node!.metadata as any).headlines), "headlines array");
});

runSuite("Google campaign ad_targets edge links to page", () => {
	const bfUrl = "https://store.example.com/bf";
	const ev = [pageContentEvidence(bfUrl, "BF")];
	const snap = googleSnapshot([
		{ id: "cam_2", name: "BF", headlines: [], descriptions: [], final_url: bfUrl, spend_30d: 1000 },
	]);
	const graph = buildGraph(ev, "store.example.com", "cycle:1", [snap]);

	const nodeId = graph.nodesByKey.get("ad_campaign:google_ads:cam_2")!;
	const edges = graph.edgeIndex.get(nodeId) || [];
	const adTargets = edges.filter(e => e.edge_type === "ad_targets");
	assertEqual(adTargets.length, 1, "one edge");
	assertEqual((adTargets[0].metadata as any).platform, "google_ads", "edge metadata");
});

runSuite("Mixed Meta + Google both create nodes in same graph", () => {
	const ev = [pageContentEvidence("https://shop.example.com/", "Home")];
	const metaSnap = metaSnapshot([
		{ id: "mc_1", headline: "Meta ad", body: "", cta: "", destination_url: "https://shop.example.com/a", status: "ACTIVE", spend_30d: 100 },
	]);
	const googleSnap = googleSnapshot([
		{ id: "gc_1", name: "Google camp", headlines: [], descriptions: [], final_url: "https://shop.example.com/b", spend_30d: 200 },
	]);
	const graph = buildGraph(ev, "shop.example.com", "cycle:1", [metaSnap, googleSnap]);

	const metaNode = findNodeByKey(graph, "ad_creative:meta_ads:mc_1");
	const googleNode = findNodeByKey(graph, "ad_campaign:google_ads:gc_1");
	assert(metaNode !== undefined, "meta node");
	assert(googleNode !== undefined, "google node");
});

runSuite("Ad creative with empty destination_url is skipped", () => {
	const ev = [pageContentEvidence("https://shop.example.com/", "Home")];
	const snap = metaSnapshot([
		{ id: "cr_empty", headline: "No link", body: "", cta: "", destination_url: "", status: "ACTIVE", spend_30d: 50 },
	]);
	const graph = buildGraph(ev, "shop.example.com", "cycle:1", [snap]);

	assertEqual(findNodeByKey(graph, "ad_creative:meta_ads:cr_empty"), undefined, "skipped");
});

runSuite("Duplicate creative IDs are deduplicated", () => {
	const ev = [pageContentEvidence("https://shop.example.com/", "Home")];
	const snap = metaSnapshot([
		{ id: "dup_1", headline: "First", body: "", cta: "", destination_url: "https://shop.example.com/a", status: "ACTIVE", spend_30d: 100 },
		{ id: "dup_1", headline: "Duplicate", body: "", cta: "", destination_url: "https://shop.example.com/a", status: "ACTIVE", spend_30d: 200 },
	]);
	const graph = buildGraph(ev, "shop.example.com", "cycle:1", [snap]);

	const node = findNodeByKey(graph, "ad_creative:meta_ads:dup_1");
	assert(node !== undefined, "node exists");
	assertEqual(node!.label, "First", "first occurrence wins");
});

runSuite("Graph without integration_snapshots works unchanged", () => {
	const ev = [pageContentEvidence("https://shop.example.com/", "Home")];
	const graph = buildGraph(ev, "shop.example.com", "cycle:1");

	assert(graph.nodes.size >= 1, "at least page node");
	const adNodes = Array.from(graph.nodes.values()).filter(
		(n) => n.node_type === "ad_creative" || n.node_type === "ad_campaign",
	);
	assertEqual(adNodes.length, 0, "no ad nodes without snapshots");
});

runSuite("ad_targets edge carries spend metadata for downstream consumers", () => {
	const ev = [pageContentEvidence("https://shop.example.com/checkout", "Checkout")];
	const snap = metaSnapshot([
		{ id: "sp_1", headline: "Buy", body: "", cta: "", destination_url: "https://shop.example.com/checkout", status: "ACTIVE", spend_30d: 800 },
	]);
	const graph = buildGraph(ev, "shop.example.com", "cycle:1", [snap]);

	const adId = graph.nodesByKey.get("ad_creative:meta_ads:sp_1")!;
	const edges = graph.edgeIndex.get(adId) || [];
	const target = edges.find(e => e.edge_type === "ad_targets");
	assert(target !== undefined, "edge exists");
	assertEqual((target!.metadata as any).spend_30d, 800, "spend on edge");
});

// ──────────────────────────────────────────────

console.log(`\n${suitesPassed}/${suitesPassed + suitesFailed} passed`);
if (suitesFailed > 0) {
	for (const f of failures) console.error(f);
	process.exit(1);
}
