import { describe, it, expect } from "vitest";
import { GraphQuery } from "./query";
import type { BuiltGraph } from "./builder";
import type { GraphNode, GraphEdge } from "./types";

// Pins the contract behind the September 2026 headline misdiagnosis:
// /account redirecting to shopify.com/<id>/account is the platform's
// standard customer-accounts flow, and the plan's main move called it
// "buyers thrown to another domain at checkout". Platform login
// boundaries stay in boundary_edges (they ARE external links) but must
// not be trust GAPS — while a genuinely unknown external destination on
// a commercial page must remain one.

function node(partial: Partial<GraphNode> & { id: string }): GraphNode {
	return {
		node_type: "page",
		label: partial.id,
		url: null,
		host: null,
		is_external: false,
		metadata: {},
		evidence_refs: [],
		...partial,
	} as GraphNode;
}

function edge(sourceId: string, targetId: string): GraphEdge {
	return {
		id: `edge_${sourceId}_${targetId}`,
		edge_type: "anchor",
		source_id: sourceId,
		target_id: targetId,
		confidence: 100,
		cycle_ref: "audit_cycle:test",
		freshness: { freshness_state: "fresh" },
		evidence_ref: null,
		metadata: {},
	} as unknown as GraphEdge;
}

function graphWith(nodes: GraphNode[], edges: GraphEdge[]): BuiltGraph {
	return {
		nodes: new Map(nodes.map((n) => [n.id, n])),
		edges,
		nodesByUrl: new Map(),
		nodesByHost: new Map(),
		nodesByKey: new Map(),
		edgeIndex: new Map(),
	};
}

const accountPage = node({ id: "n_account", url: "https://loja.com/account" });
const checkoutPage = node({ id: "n_checkout", url: "https://loja.com/checkout" });
const homePage = node({ id: "n_home", url: "https://loja.com/" });

const shopifyAccounts = node({
	id: "n_shopify_acc",
	url: "https://shopify.com/87903076629/account",
	host: "shopify.com",
	is_external: true,
});
const googleAccounts = node({
	id: "n_google_acc",
	url: "https://accounts.google.com/signin",
	host: "accounts.google.com",
	is_external: true,
});
const shopifyAuth = node({
	id: "n_shopify_auth",
	url: "https://shopify.com/authentication/87903076629",
	host: "shopify.com",
	is_external: true,
});
const unknownExternal = node({
	id: "n_unknown",
	url: "https://tracker-desconhecido.com/x",
	host: "tracker-desconhecido.com",
	is_external: true,
});

describe("findTrustBoundaries · platform logins", () => {
	it("does not count Shopify customer-accounts as a trust gap", () => {
		const q = new GraphQuery(
			graphWith([accountPage, shopifyAccounts], [edge("n_account", "n_shopify_acc")]),
		);
		const r = q.findTrustBoundaries();
		expect(r.trust_gaps).toHaveLength(0);
		// Still inventoried as a boundary — it IS an external link.
		expect(r.boundary_edges).toHaveLength(1);
		expect(r.external_hosts).toContain("shopify.com");
	});

	it("does not count the Shopify /authentication login redirect as a trust gap", () => {
		// The exact casamontelle shape: /account redirects to
		// shopify.com/authentication/<shop_id>, not /account.
		const q = new GraphQuery(
			graphWith([accountPage, shopifyAuth], [{ ...edge("n_account", "n_shopify_auth"), edge_type: "redirect" } as unknown as GraphEdge]),
		);
		expect(q.findTrustBoundaries().trust_gaps).toHaveLength(0);
	});

	it("does not count accounts.* SSO hosts as a trust gap", () => {
		const q = new GraphQuery(
			graphWith([homePage, googleAccounts], [edge("n_home", "n_google_acc")]),
		);
		expect(q.findTrustBoundaries().trust_gaps).toHaveLength(0);
	});

	it("does not count edges leaving an account/login page as commercial trust gaps", () => {
		const q = new GraphQuery(
			graphWith([accountPage, unknownExternal], [edge("n_account", "n_unknown")]),
		);
		expect(q.findTrustBoundaries().trust_gaps).toHaveLength(0);
	});

it("does NOT count a third-party script/resource load as a buyer trust gap", () => {
		const scriptEdge = { ...edge("n_home", "n_unknown"), edge_type: "script_src" } as unknown as GraphEdge;
		const q = new GraphQuery(graphWith([homePage, unknownExternal], [scriptEdge]));
		// Supply-chain surface, not the buyer crossing a domain.
		expect(q.findTrustBoundaries().trust_gaps).toHaveLength(0);
	});

		it("STILL flags an unknown external destination from a commercial page", () => {
		// The guard must be surgical: loosening real detection to fix the
		// false positive would trade one wrong plan for another.
		const q = new GraphQuery(
			graphWith([checkoutPage, unknownExternal], [edge("n_checkout", "n_unknown")]),
		);
		const r = q.findTrustBoundaries();
		expect(r.trust_gaps).toHaveLength(1);
		expect(r.trust_gaps[0].gap_type).toBe("unknown_provider");
		expect(r.trust_gaps[0].severity).toBe("high");
	});
});
