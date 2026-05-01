// ──────────────────────────────────────────────
// Shared utilities for map components
// ──────────────────────────────────────────────

export function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export const severityColors: Record<string, string> = {
  critical: "border-red-500 bg-red-500/10",
  high: "border-red-400 bg-red-400/10",
  medium: "border-amber-400 bg-amber-400/10",
  low: "border-edge bg-surface-inset/50",
};

// Legend swatch tokens -> Tailwind classes
export const NODE_SWATCH_CLASS: Record<string, string> = {
  root_cause: "border-red-400 bg-red-400/10",
  finding: "border-amber-400 bg-amber-400/10",
  action: "border-emerald-500 bg-emerald-500/10",
  category: "border-blue-500 bg-blue-500/10",
  journey_homepage: "border-emerald-500 bg-emerald-500/10",
  journey_product: "border-blue-500 bg-blue-500/10",
  journey_pricing: "border-violet-500 bg-violet-500/10",
  journey_cart: "border-amber-500 bg-amber-500/10",
  journey_checkout: "border-red-500 bg-red-500/10",
  journey_confirmation: "border-emerald-500 bg-emerald-500/10",
  journey_support: "border-dashed border-content-muted bg-surface-inset",
  journey_other_events: "border-dashed border-content-muted bg-surface-card/60",
  journey_dropoff: "border-dashed border-red-500/40 bg-red-500/5",
};

export const EDGE_SWATCH_CLASS: Record<string, string> = {
  causal: "bg-red-500",
  addresses: "bg-emerald-500",
  contributes_to: "border-t border-dashed border-content-muted",
  transition: "bg-blue-500",
  redirect:
    "bg-violet-400 [mask-image:linear-gradient(to_right,black_33%,transparent_33%,transparent_66%,black_66%)]",
};
