"use client";

import SeverityBadge from "@/components/console/SeverityBadge";

// ──────────────────────────────────────────────
// Settings page — shows org/env configuration
// Data comes from DB in production.
// Shows empty state when no org loaded.
// ──────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage domains, review data coverage, and configure your account.
        </p>
      </div>

      {/* Domains — empty state until DB connected */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Domains</h2>
        <div className="rounded-md border border-zinc-800 px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">
            Domains are configured through onboarding and managed per environment.
          </p>
        </div>
      </section>

      {/* Data Overview — populated after first audit */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Data Overview</h2>
        <div className="rounded-md border border-zinc-800 px-6 py-8 text-center">
          <p className="text-sm text-zinc-500">
            Data overview will be available after the first audit cycle completes.
          </p>
        </div>
      </section>

      {/* Account */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Account</h2>
        <p className="text-sm text-zinc-500">
          Account settings managed through the control plane.
        </p>
      </section>
    </div>
  );
}
