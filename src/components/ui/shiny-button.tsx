"use client";

import React from "react";
// framer-motion v12 removed the standalone `AnimationProps` export; the
// superset type is `MotionProps` (which carries initial/animate/transition
// alongside variants/drag/etc.). The object we build below only uses the
// animation-relevant keys — MotionProps is the right shape.
import { motion, type MotionProps } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────
// ShinyButton — two variants
//
// "homepage" — CSS-only conic-gradient animation (globals.css .shiny-cta)
//              Used on marketing pages, ProductTour, MiniCalc, etc.
//
// "console"  — Framer Motion sweep shimmer with emerald primary.
//              Matches dashboard visual language. Used inside /app.
// ──────────────────────────────────────────────

const consoleAnimationProps: MotionProps = {
  initial: { "--x": "100%", scale: 0.8 } as any,
  animate: { "--x": "-100%", scale: 1 } as any,
  whileTap: { scale: 0.95 },
  transition: {
    repeat: Infinity,
    repeatType: "loop",
    repeatDelay: 1,
    type: "spring",
    stiffness: 20,
    damping: 15,
    mass: 2,
    scale: {
      type: "spring",
      stiffness: 200,
      damping: 5,
      mass: 0.5,
    },
  },
};

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
      <motion.button
        {...consoleAnimationProps}
        {...(props as any)}
        className={cn(
          "relative rounded-lg px-6 py-2 font-medium backdrop-blur-xl transition-shadow duration-300 ease-in-out hover:shadow dark:bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/10%)_0%,transparent_60%)] dark:hover:shadow-[0_0_20px_hsl(var(--primary)/10%)]",
          className,
        )}
      >
        <span
          className="relative block size-full text-sm font-medium text-[rgb(0,0,0,70%)] dark:text-[rgb(255,255,255,90%)]"
          style={{
            maskImage:
              "linear-gradient(-75deg,hsl(var(--primary)) calc(var(--x) + 20%),transparent calc(var(--x) + 30%),hsl(var(--primary)) calc(var(--x) + 100%))",
          }}
        >
          {children}
        </span>
        <span
          style={{
            mask: "linear-gradient(rgb(0,0,0), rgb(0,0,0)) content-box,linear-gradient(rgb(0,0,0), rgb(0,0,0))",
            maskComposite: "exclude",
          }}
          className="absolute inset-0 z-10 block rounded-[inherit] bg-[linear-gradient(-75deg,hsl(var(--primary)/10%)_calc(var(--x)+20%),hsl(var(--primary)/50%)_calc(var(--x)+25%),hsl(var(--primary)/10%)_calc(var(--x)+100%))] p-px"
        />
      </motion.button>
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
