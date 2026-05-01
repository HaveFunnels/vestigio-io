"use client";

import { getBezierPath, type EdgeProps } from "@xyflow/react";

export default function ContributesToEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  return (
    <path
      id={id}
      d={edgePath}
      className="react-flow__edge-path"
      style={{
        stroke: "#71717a",
        strokeWidth: 1.5,
        strokeDasharray: "5 5",
        fill: "none",
        ...style,
      }}
      markerEnd={markerEnd as string}
    />
  );
}
