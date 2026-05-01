"use client";

import { getBezierPath, type EdgeProps } from "@xyflow/react";

export default function CausalEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	style,
	markerEnd,
	data,
}: EdgeProps) {
	const [edgePath] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});

	// Animated flowing stroke — faster for critical severity connections
	const isCritical = data?.severity === "critical";
	const animationDuration = isCritical ? "0.8s" : "1.5s";

	return (
		<>
			{/* Base path (visible stroke) */}
			<path
				id={id}
				d={edgePath}
				className='react-flow__edge-path'
				style={{ stroke: "#ef4444", strokeWidth: 2, fill: "none", ...style }}
				markerEnd={markerEnd as string}
			/>
			{/* Animated flowing overlay */}
			<path
				d={edgePath}
				style={{
					stroke: "#ef4444",
					strokeWidth: 2,
					fill: "none",
					strokeDasharray: "6 14",
					strokeDashoffset: 20,
					opacity: 0.7,
					animation: `causal-flow ${animationDuration} linear infinite`,
				}}
			/>
		</>
	);
}
