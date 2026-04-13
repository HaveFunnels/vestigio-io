"use client";

import React from "react";
import { motion, type AnimationProps } from "framer-motion";
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

const consoleAnimationProps: AnimationProps = {
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
}

export function ShinyButton({
  children,
  className,
  variant = "homepage",
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
          className="relative block size-full text-sm uppercase tracking-wide text-[rgb(0,0,0,65%)] dark:font-light dark:text-[rgb(255,255,255,90%)]"
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
