"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export default function InviteMemberModal({ isOpen, onClose, onInvited }: InviteMemberModalProps) {
  const t = useTranslations("console.invite_member");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seatLimitHit, setSeatLimitHit] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setRole("member");
      setError(null);
      setSeatLimitHit(false);
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSeatLimitHit(false);
    setLoading(true);

    try {
      const res = await fetch("/api/organization/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === "SEAT_LIMIT") {
          setSeatLimitHit(true);
        }
        setError(data.message || t("error_send"));
        return;
      }

      onInvited();
      onClose();
    } catch {
      setError(t("error_network"));
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-lg border border-edge bg-surface-card p-6 shadow-xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content">{t("title")}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-content-muted transition-colors hover:text-content"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5L5 15M5 5l10 10" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="mb-1.5 block text-sm font-medium text-content">
              {t("email_label")}
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-content placeholder:text-content-muted focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="mb-1.5 block text-sm font-medium text-content">
              {t("role_label")}
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member" | "viewer")}
              className="w-full rounded-md border border-edge bg-surface px-3 py-2 text-sm text-content focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="admin">{t("role_admin")}</option>
              <option value="member">{t("role_member")}</option>
              <option value="viewer">{t("role_viewer")}</option>
            </select>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
              {seatLimitHit && (
                <a
                  href="/app/billing"
                  className="ml-1 font-medium text-emerald-400 underline hover:text-emerald-300"
                >
                  {t("upgrade_plan")}
                </a>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-edge px-4 py-2 text-sm font-medium text-content-muted transition-colors hover:bg-surface"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? t("sending") : t("send_invite")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
