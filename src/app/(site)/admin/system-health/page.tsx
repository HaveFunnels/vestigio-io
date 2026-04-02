"use client";

// ──────────────────────────────────────────────
// Admin — System Health
// MCP latency, error rate, recent logs, audit failures.
// ──────────────────────────────────────────────

export default function AdminSystemHealthPage() {
  // In production: fetch from observability API
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark dark:text-white">System Health</h1>
        <p className="mt-1 text-sm text-body-color">MCP performance, errors, and recent activity.</p>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "MCP Calls Today", value: "—", color: "text-primary" },
          { label: "Error Rate", value: "—", color: "text-green-500" },
          { label: "Avg Latency", value: "—", color: "text-amber-500" },
          { label: "Active Audits", value: "—", color: "text-body-color" },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-stroke bg-white p-5 dark:border-stroke-dark dark:bg-gray-dark">
            <div className="text-xs font-medium uppercase tracking-wider text-body-color">{card.label}</div>
            <div className={`mt-1 text-2xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Recent logs */}
      <div className="rounded-lg border border-stroke dark:border-stroke-dark">
        <div className="border-b border-stroke px-4 py-3 dark:border-stroke-dark">
          <h2 className="font-medium text-dark dark:text-white">Recent MCP Logs</h2>
        </div>
        <div className="px-4 py-8 text-center text-sm text-body-color">
          Logs will appear here once MCP context is loaded and calls are made.
        </div>
      </div>
    </div>
  );
}
