"use client";

import { getBezierPath, type EdgeProps } from "@xyflow/react";

export default function RedirectEdge({
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
        stroke: "#a78bfa",
        strokeWidth: 1.5,
        strokeDasharray: "2 4",
        fill: "none",
        ...style,
      }}
      markerEnd={markerEnd as string}
    />
  );
}
