"use client";

import { getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export default function TransitionEdge({
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
  const [edgePath] = getSmoothStepPath({
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
      style={{ stroke: "#3b82f6", strokeWidth: 1.5, fill: "none", ...style }}
      markerEnd={markerEnd as string}
    />
  );
}
