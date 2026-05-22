"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────
// ShinyButton — two variants
//
// "homepage" — CSS-only conic-gradient animation (globals.css .shiny-cta)
//              Used on marketing pages, ProductTour, MiniCalc, etc.
//              Ships ZERO framer-motion JS.
//
// "console"  — Framer Motion sweep shimmer with emerald primary.
//              Matches dashboard visual language. Used inside /app.
//              Lazy-loaded — framer-motion (~30KB gz) is only pulled
//              when the console variant actually mounts, so marketing
//              homepages stay light. Pre-split, the homepage paid
//              the framer-motion cost on every page that touched
//              ShinyButton (5 sites on the marketing surface).
// ──────────────────────────────────────────────

const ShinyButtonConsole = dynamic(() => import("./shiny-button-console"), {
  ssr: false,
  // No loading skeleton — the console variant renders inside the
  // authenticated app where one extra paint frame is invisible.
});

interface ShinyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
  /**
   * "homepage" — animated conic-gradient border (CSS-only, for marketing)
   * "console"  — sweep shimmer with emerald primary (Framer Motion, for /app)
   */
  variant?: "homepage" | "console";
  /**
   * If set on the homepage variant, the button renders as a Next.js
   * <Link> (which emits a clean <a> tag) instead of a <button>. Use
   * this for primary CTAs that navigate — wrapping <ShinyButton> in
   * <Link> creates the <a><button> nesting that HTML5 forbids and
   * SEO crawlers flag as a tag mismatch. Setting `href` here lets the
   * button itself be the link, fixing the validation while keeping
   * native keyboard/right-click behavior and Next prefetch.
   */
  href?: string;
}

export function ShinyButton({
  children,
  className,
  variant = "homepage",
  href,
  ...props
}: ShinyButtonProps) {
  if (variant === "console") {
    return (
      <ShinyButtonConsole className={className} {...(props as any)}>
        {children}
      </ShinyButtonConsole>
    );
  }

  // Homepage variant — CSS-only animation via globals.css .shiny-cta
  if (href) {
    return (
      <Link
        href={href}
        className={cn("shiny-cta", className)}
        {...(props as any)}
      >
        <span>{children}</span>
      </Link>
    );
  }

  return (
    <button
      className={cn("shiny-cta", className)}
      {...props}
    >
      <span>{children}</span>
    </button>
  );
}

export default ShinyButton;
