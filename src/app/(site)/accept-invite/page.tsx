"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// ──────────────────────────────────────────────
// Accept Invite — public page
//
// Validates the token from ?token=xxx, shows org name,
// and lets the user accept the invitation.
// ──────────────────────────────────────────────

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "valid" | "error" | "accepted">("loading");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No invitation token provided.");
      return;
    }

    async function validate() {
      try {
        const res = await fetch(`/api/organization/invites/accept?token=${encodeURIComponent(token!)}`);
        const data = await res.json();

        if (!res.ok) {
          setStatus("error");
          setErrorMessage(data.message || "Invalid or expired invitation.");
          return;
        }

        setOrgName(data.orgName);
        setEmail(data.email);
        setRole(data.role);
        setStatus("valid");
      } catch {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      }
    }

    validate();
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    try {
      const res = await fetch("/api/organization/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.message || "Failed to accept invitation.");
        setAccepting(false);
        return;
      }

      setStatus("accepted");
      // Redirect to app after a brief moment
      setTimeout(() => {
        router.push("/app");
      }, 2000);
    } catch {
      setErrorMessage("Network error. Please try again.");
      setAccepting(false);
    }
  }

  return (
    <main className="flex min-h-[60vh] items-center justify-center pt-[120px] pb-20">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
        {status === "loading" && (
          <div className="py-8">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-400">Validating invitation...</p>
          </div>
        )}

        {status === "error" && (
          <div className="py-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-white">Invalid Invitation</h1>
            <p className="text-sm text-zinc-400">{errorMessage}</p>
            <a
              href="/auth/signin"
              className="mt-6 inline-block rounded-md bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Go to Sign In
            </a>
          </div>
        )}

        {status === "valid" && (
          <div className="py-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-white">
              Join {orgName}
            </h1>
            <p className="mb-1 text-sm text-zinc-400">
              You have been invited to join <strong className="text-zinc-200">{orgName}</strong> as a <strong className="text-zinc-200">{role}</strong>.
            </p>
            <p className="mb-6 text-xs text-zinc-500">
              Invitation for {email}
            </p>

            {errorMessage && (
              <p className="mb-4 text-sm text-red-400">{errorMessage}</p>
            )}

            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {accepting ? "Accepting..." : "Accept Invitation"}
            </button>
          </div>
        )}

        {status === "accepted" && (
          <div className="py-4">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h1 className="mb-2 text-lg font-semibold text-white">Welcome!</h1>
            <p className="text-sm text-zinc-400">
              You have joined <strong className="text-zinc-200">{orgName}</strong>. Redirecting to the app...
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[60vh] items-center justify-center pt-[120px] pb-20">
          <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-400">Loading...</p>
          </div>
        </main>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
