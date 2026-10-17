"use client";

import { useEffect, useRef } from "react";
import { getFirstTouch, getOrCreateSessionId } from "@/libs/marketing-session";

// ──────────────────────────────────────────────
// Lightweight marketing analytics tracker
// Runs on marketing (site) pages only.
// Fire-and-forget — never blocks rendering.
// ──────────────────────────────────────────────

// Session id and attribution moved to @/libs/marketing-session so the
// signup form reads the same values. The UTM reader that used to live
// here only saw window.location.search, so attribution died the moment
// the visitor navigated off the landing page.
function getUTMParams(): Record<string, string | undefined> {
  const ft = getFirstTouch();
  return {
    utmSource: ft.utmSource,
    utmMedium: ft.utmMedium,
    utmCampaign: ft.utmCampaign,
    utmContent: ft.utmContent,
  };
}

function detectDevice(): string {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) return "mobile";
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function detectBrowser(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/") || ua.includes("Opera/")) return "Opera";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  return "other";
}

function detectOS(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Win")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  return "other";
}

/** Fire-and-forget POST — never throws */
function beacon(url: string, body: Record<string, unknown>): void {
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, JSON.stringify(body));
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // never crash
  }
}

export default function TrackingScript() {
  const startRef = useRef(Date.now());
  const scrollMaxRef = useRef(0);
  const sentScrollDepths = useRef(new Set<number>());

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    const path = window.location.pathname;
    const utm = getUTMParams();

    // ── Record page view ──
    beacon("/api/analytics/pageview", {
      sessionId,
      path,
      referrer: document.referrer || undefined,
      ...utm,
      device: detectDevice(),
      browser: detectBrowser(),
      os: detectOS(),
    });

    // ── Scroll depth tracking ──
    const thresholds = [25, 50, 75, 100];

    function handleScroll() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1,
      );
      const pct = Math.min(Math.round((scrollTop / docHeight) * 100), 100);

      if (pct > scrollMaxRef.current) scrollMaxRef.current = pct;

      for (const t of thresholds) {
        if (pct >= t && !sentScrollDepths.current.has(t)) {
          sentScrollDepths.current.add(t);
          beacon("/api/analytics/event", {
            sessionId,
            eventType: "scroll_depth",
            path,
            target: `${t}%`,
            metadata: JSON.stringify({ depth: t }),
          });
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    // ── Time on page (on unload) ──
    function handleUnload() {
      const duration = Math.round((Date.now() - startRef.current) / 1000);
      beacon("/api/analytics/event", {
        sessionId,
        eventType: "time_on_page",
        path,
        metadata: JSON.stringify({
          duration,
          scrollDepth: scrollMaxRef.current / 100,
        }),
      });
    }

    window.addEventListener("beforeunload", handleUnload);

    // ── CTA click tracking (delegated) ──
    // Captures clicks on any element marked with data-vtg-cta="<name>".
    // Delegated so adding a new tracked CTA only requires the data attr
    // on the element — no wiring per component, no per-click handlers.
    // The label is what shows up as `target` in the marketing_event row,
    // so use stable kebab-case names (e.g. "hero-primary", "banner",
    // "counter-tese").
    function handleClick(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-vtg-cta]");
      if (!el) return;
      const name = el.dataset.vtgCta;
      if (!name) return;
      beacon("/api/analytics/event", {
        sessionId,
        eventType: "cta_click",
        path,
        target: name,
      });
    }

    document.addEventListener("click", handleClick, { capture: true, passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("click", handleClick, { capture: true } as any);
    };
  }, []);

  return null;
}
