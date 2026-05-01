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
      style={{ stroke: "#ef4444", strokeWidth: 2, fill: "none", ...style }}
      markerEnd={markerEnd as string}
    />
  );
}
