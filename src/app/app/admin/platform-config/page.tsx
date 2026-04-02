"use client";

// ──────────────────────────────────────────────
// Platform Config — feature flags, limits
// ──────────────────────────────────────────────

export default function PlatformConfigPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Platform Config</h1>
        <p className="mt-1 text-sm text-zinc-500">Feature flags, plan limits, and system defaults.</p>
      </div>
      <div className="rounded-md border border-zinc-800 px-6 py-8 text-center">
        <p className="text-sm text-zinc-500">Platform configuration is managed via PlatformConfig table and /admin/pricing.</p>
      </div>
    </div>
  );
}
