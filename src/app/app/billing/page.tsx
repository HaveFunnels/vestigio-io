"use client";

// ──────────────────────────────────────────────
// Billing — customer subscription management
// Reuses existing Stripe billing flow.
// In production: loads subscription from User model.
// ──────────────────────────────────────────────

export default function BillingPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Billing</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage your subscription and payment method.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Current Plan</h2>
          <div className="space-y-3">
            {[
              { label: "Plan", value: "—" },
              { label: "Price", value: "—" },
              { label: "Renewal", value: "—" },
              { label: "MCP Usage", value: "—" },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{row.label}</span>
                <span className="text-sm text-zinc-200">{row.value}</span>
              </div>
            ))}
          </div>
          <button className="mt-4 w-full rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800">
            Manage Subscription
          </button>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Usage This Period</h2>
          <div className="rounded-md border border-zinc-800 px-4 py-6 text-center">
            <p className="text-sm text-zinc-500">Usage data available after first MCP call.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
