"use client";

import { useRef, useState, useEffect, useCallback } from "react";

// ──────────────────────────────────────────────
// Success Stories — photo cards with stat overlays
//
// Desktop: 3 cards visible side-by-side
// Mobile:  1 card centered with peek of neighbors,
//          swipeable + arrow navigation
// ──────────────────────────────────────────────

interface Stat {
  value: string;
  label: string;
}

interface Story {
  /** Photo from public/images/stories/ */
  image: string;
  /** Industry badge text */
  industry: string;
  /** Badge color class */
  badgeColor: string;
  stats: [Stat, Stat, Stat];
}

const STORIES: Story[] = [
  {
    image: "/images/stories/story-1.webp",
    industry: "Outdoor leisure industry",
    badgeColor: "bg-violet-500",
    stats: [
      { value: "51.42%", label: "Engagement Rate" },
      { value: "35K", label: "Total Orders" },
      { value: "1.33%", label: "Conversion Rate" },
    ],
  },
  {
    image: "/images/stories/story-2.webp",
    industry: "Fashion & Apparel",
    badgeColor: "bg-emerald-500",
    stats: [
      { value: "2.8x", label: "Revenue Growth" },
      { value: "12K", label: "New Customers" },
      { value: "4.7%", label: "Repeat Rate" },
    ],
  },
  {
    image: "/images/stories/story-3.webp",
    industry: "Health & Wellness",
    badgeColor: "bg-amber-500",
    stats: [
      { value: "38%", label: "Cost Reduction" },
      { value: "89K", label: "Sessions Tracked" },
      { value: "0.4%", label: "Chargeback Rate" },
    ],
  },
  {
    image: "/images/stories/story-4.webp",
    industry: "Home & Garden",
    badgeColor: "bg-sky-500",
    stats: [
      { value: "62%", label: "Fraud Blocked" },
      { value: "18K", label: "Orders Protected" },
      { value: "3.1x", label: "ROI" },
    ],
  },
  {
    image: "/images/stories/story-5.webp",
    industry: "Electronics & Tech",
    badgeColor: "bg-rose-500",
    stats: [
      { value: "27%", label: "Revenue Recovered" },
      { value: "42K", label: "Disputes Won" },
      { value: "94%", label: "Win Rate" },
    ],
  },
];

// ── Story Card ─────────────────────────────────

function StoryCard({ story }: { story: Story }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-zinc-900 shadow-lg">
      {/* Photo */}
      <div className="relative aspect-[4/5] w-full overflow-hidden">
        <img
          src={story.image}
          alt={story.industry}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Top gradient for badge legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />

        {/* Bottom gradient for stats legibility */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />

        {/* Industry badge */}
        <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
          <span
            className={`inline-block rounded-full ${story.badgeColor} px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-lg sm:text-xs`}
          >
            {story.industry}
          </span>
        </div>

        {/* Stats row — glass cards at bottom */}
        <div className="absolute inset-x-0 bottom-0 flex gap-2 p-3 sm:gap-2.5 sm:p-4">
          {story.stats.map((stat, i) => (
            <div
              key={i}
              className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.08] px-3 py-2.5 backdrop-blur-md sm:px-4 sm:py-3"
            >
              <div className="font-mono text-base font-bold tabular-nums text-emerald-400 sm:text-lg">
                {stat.value}
              </div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/60 sm:text-[10px]">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Arrow Button ───────────────────────────────

function ArrowButton({
  direction,
  onClick,
  disabled,
}: {
  direction: "left" | "right";
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 backdrop-blur-sm transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30 sm:h-11 sm:w-11`}
      aria-label={direction === "left" ? "Previous" : "Next"}
    >
      <svg
        className="h-4 w-4 sm:h-5 sm:w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        {direction === "left" ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        )}
      </svg>
    </button>
  );
}

// ── Section ────────────────────────────────────

const Testimonials = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [canGoLeft, setCanGoLeft] = useState(false);
  const [canGoRight, setCanGoRight] = useState(true);

  const updateNav = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollLeft = el.scrollLeft;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanGoLeft(scrollLeft > 4);
    setCanGoRight(scrollLeft < maxScroll - 4);

    // Determine active index based on scroll position
    const children = Array.from(el.children) as HTMLElement[];
    let closest = 0;
    let minDist = Infinity;
    const center = scrollLeft + el.clientWidth / 2;
    children.forEach((child, i) => {
      const childCenter = child.offsetLeft + child.offsetWidth / 2;
      const dist = Math.abs(center - childCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setActiveIdx(closest);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateNav, { passive: true });
    updateNav();
    // Recalc on resize
    window.addEventListener("resize", updateNav);
    return () => {
      el.removeEventListener("scroll", updateNav);
      window.removeEventListener("resize", updateNav);
    };
  }, [updateNav]);

  const scrollTo = useCallback(
    (dir: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      // Scroll by one card width + gap
      const child = el.children[0] as HTMLElement | undefined;
      if (!child) return;
      const cardWidth = child.offsetWidth;
      const gap = 20; // gap-5 = 1.25rem = 20px
      const amount = dir === "left" ? -(cardWidth + gap) : cardWidth + gap;
      el.scrollBy({ left: amount, behavior: "smooth" });
    },
    [],
  );

  return (
    <section className="relative z-1 overflow-hidden border-t border-white/5 bg-[#0d0d15] py-16 sm:py-20 lg:py-28">
      <div className="mx-auto w-full max-w-[1170px] px-4 sm:px-8 xl:px-0">
        {/* Header + navigation */}
        <div className="mb-8 flex items-end justify-between sm:mb-10">
          <div>
            <h2 className="mb-3 text-[1.75rem] font-bold leading-[1.1] tracking-tight text-white sm:text-3xl lg:text-4xl">
              Success{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text italic text-transparent">
                Stories
              </span>
            </h2>
            <p className="max-w-md text-sm text-zinc-400 sm:text-base">
              Real results from brands that transformed their business with Vestigio.
            </p>
          </div>

          {/* Desktop arrows */}
          <div className="hidden gap-2 sm:flex">
            <ArrowButton direction="left" onClick={() => scrollTo("left")} disabled={!canGoLeft} />
            <ArrowButton direction="right" onClick={() => scrollTo("right")} disabled={!canGoRight} />
          </div>
        </div>

        {/* Carousel track */}
        <div
          ref={scrollRef}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 sm:-mx-0 sm:px-0"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {STORIES.map((story, i) => (
            <div
              key={i}
              className="w-[80vw] flex-none snap-center sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]"
            >
              <StoryCard story={story} />
            </div>
          ))}
        </div>

        {/* Mobile: dots + arrows */}
        <div className="mt-5 flex items-center justify-center gap-4 sm:hidden">
          <ArrowButton direction="left" onClick={() => scrollTo("left")} disabled={!canGoLeft} />

          <div className="flex gap-1.5">
            {STORIES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIdx
                    ? "w-5 bg-emerald-400"
                    : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>

          <ArrowButton direction="right" onClick={() => scrollTo("right")} disabled={!canGoRight} />
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
