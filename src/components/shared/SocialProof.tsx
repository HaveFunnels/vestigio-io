"use client";

import type React from "react";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  avatar?: string;
}

const DEFAULT_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Vestigio found $47k in revenue leaks we had no idea existed. The ROI was obvious within the first cycle.",
    name: "Sarah Chen",
    role: "Head of Growth",
    company: "TechFlow",
  },
  {
    quote:
      "We stopped guessing and started deciding. The prioritized action queue changed how we operate.",
    name: "Marcus Rivera",
    role: "CEO",
    company: "ShopScale",
  },
  {
    quote:
      "Every time we deploy, Vestigio catches regressions before our customers do. It's our safety net.",
    name: "Priya Patel",
    role: "VP Engineering",
    company: "CloudCart",
  },
  {
    quote:
      "The audit paid for itself in week one. We found checkout friction that was costing us $12k/month.",
    name: "David Kim",
    role: "Founder",
    company: "NexaCommerce",
  },
  {
    quote:
      "Finally, a tool that speaks revenue, not just technical jargon. Our whole team can use it.",
    name: "Ana Costa",
    role: "COO",
    company: "BrazilDigital",
  },
  {
    quote:
      "Vestigio replaced three tools for us — analytics, audit, and monitoring in one decision engine.",
    name: "James Mitchell",
    role: "CTO",
    company: "ScaleOps",
  },
  {
    quote:
      "The 4X ROI guarantee isn't marketing — we actually hit 6X in our second month.",
    name: "Lisa Wang",
    role: "Director of Commerce",
    company: "PeakRetail",
  },
  {
    quote:
      "I showed the Vestigio report to our board and they immediately approved the budget. The data speaks.",
    name: "Rafael Santos",
    role: "CEO",
    company: "FunnelPro",
  },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function Avatar({ name, avatar }: { name: string; avatar?: string }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400">
      {getInitials(name)}
    </div>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <div className="flex w-[340px] shrink-0 flex-col justify-between rounded-xl border border-white/5 bg-white/[0.03] p-5 sm:w-[380px]">
      <p className="mb-4 text-sm leading-relaxed text-zinc-300">
        &ldquo;{t.quote}&rdquo;
      </p>
      <div className="flex items-center gap-3">
        <Avatar name={t.name} avatar={t.avatar} />
        <div>
          <p className="text-sm font-medium text-zinc-200">{t.name}</p>
          <p className="text-xs text-zinc-400">
            {t.role}, {t.company}
          </p>
        </div>
      </div>
    </div>
  );
}

interface SocialProofProps {
  testimonials?: Testimonial[];
  heading?: string;
}

export function SocialProof({
  testimonials = DEFAULT_TESTIMONIALS,
  heading = "Trusted by growth-focused digital businesses",
}: SocialProofProps) {
  const half = Math.ceil(testimonials.length / 2);
  const row1 = testimonials.slice(0, half);
  const row2 = testimonials.slice(half);

  // Duplicate each row for seamless loop
  const track1 = [...row1, ...row1];
  const track2 = [...row2, ...row2];

  return (
    <section className="relative z-1 overflow-hidden bg-[#090911] py-16 lg:py-24">
      <style>{`
        @keyframes vsp-scroll-left {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        @keyframes vsp-scroll-right {
          from { transform: translateX(-50%); }
          to   { transform: translateX(0); }
        }
        .vsp-track-left  { animation: vsp-scroll-left  40s linear infinite; }
        .vsp-track-right { animation: vsp-scroll-right  40s linear infinite; }
        .vsp-track-left:hover,
        .vsp-track-right:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .vsp-track-left,
          .vsp-track-right { animation: none !important; }
        }
      `}</style>

      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <h2 className="mb-10 text-center text-lg font-medium text-zinc-400 sm:text-xl">
          {heading}
        </h2>
      </div>

      {/* Row 1 — scrolls left */}
      <div className="relative mb-4 w-full [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]">
        <div className="vsp-track-left flex w-max gap-4">
          {track1.map((t, i) => (
            <TestimonialCard key={`r1-${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>

      {/* Row 2 — scrolls right */}
      <div className="relative w-full [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]">
        <div className="vsp-track-right flex w-max gap-4">
          {track2.map((t, i) => (
            <TestimonialCard key={`r2-${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default SocialProof;
