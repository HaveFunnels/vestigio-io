// ──────────────────────────────────────────────
// Conversion functions: MapDefinition -> ReactFlow nodes/edges
// ──────────────────────────────────────────────

import type { Node, Edge } from "@xyflow/react";
import type { MapDefinition } from "../../../packages/maps";

export function toReactFlowNodes(mapDef: MapDefinition): Node[] {
	// Part F: Revenue heat overlay — calculate impact range for size scaling
	const impacts = mapDef.nodes
		.map((n) => n.impact?.midpoint ?? 0)
		.filter((v) => v > 0);
	const minImpact = impacts.length > 0 ? Math.min(...impacts) : 0;
	const maxImpact = impacts.length > 0 ? Math.max(...impacts) : 0;
	const impactRange = maxImpact - minImpact;

	return mapDef.nodes.map((n, index) => {
		// Compute revenue heat scale factor
		let scaleFactor = 1.0;
		if (n.impact && n.impact.midpoint > 0 && impactRange > 0) {
			const normalized = (n.impact.midpoint - minImpact) / impactRange;
			scaleFactor = 1.0 + normalized * 0.4;
		} else if (n.impact && n.impact.midpoint > 0 && impactRange === 0) {
			// All nodes have same impact — max scale
			scaleFactor = 1.4;
		}

		// Critical glow class
		const classNames: string[] = [];
		if (n.severity === "critical") {
			classNames.push("map-node-critical-glow");
		}

		return {
			id: n.id,
			type: n.type,
			// Dagre produces real positions — no manual scaling needed
			position: { x: n.position.x, y: n.position.y },
			data: {
				label: n.label,
				severity: n.severity,
				impact: n.impact,
				pack: n.pack,
				_nodeIndex: index,
				...n.metadata,
			},
			className: classNames.join(" ") || undefined,
			style:
				scaleFactor !== 1.0
					? { transform: `scale(${scaleFactor.toFixed(3)})` }
					: undefined,
		};
	});
}

export function toReactFlowEdges(mapDef: MapDefinition): Edge[] {
	// Build a lookup from node id -> severity for edge data
	const nodeSeverityMap = new Map<string, string | null>();
	for (const n of mapDef.nodes) {
		nodeSeverityMap.set(n.id, n.severity);
	}

	return mapDef.edges.map((e) => ({
		id: e.id,
		source: e.source,
		target: e.target,
		label: e.label || undefined,
		// Use custom edge types that match our edge component registry
		type: e.type,
		animated: e.type === "causal",
		// Pass severity context to custom edge components for animation speed
		data: {
			severity:
				nodeSeverityMap.get(e.target) || nodeSeverityMap.get(e.source) || null,
		},
		// Compact pill-style label at mid-edge (drop-off / conversion %).
		labelStyle: {
			fill: "var(--color-content-secondary, #a1a1aa)",
			fontSize: 10,
			fontFamily:
				"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
		},
		// Part G: Glass morphism label background
		labelBgStyle: {
			fill: "rgba(24, 24, 27, 0.6)",
			backdropFilter: "blur(8px)",
			WebkitBackdropFilter: "blur(8px)",
		},
		labelBgPadding: [4, 2] as [number, number],
		labelBgBorderRadius: 4,
	}));
}
