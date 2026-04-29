"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// VideoTestimonials — portrait video social proof
//
// Performance strategy:
//   • Videos served from CDN via <video> with preload="none"
//   • Poster images (first frame / thumbnail) load immediately
//   • Video only fetches on play — zero bytes until interaction
//   • IntersectionObserver pauses off-screen videos
//   • Portrait aspect-ratio (9:16) preserved via CSS
//
// To add real videos:
//   1. Upload .mp4 (H.264, ~720p portrait) to your CDN
//   2. Generate a poster .webp thumbnail for each
//   3. Replace the src + poster URLs below
// ──────────────────────────────────────────────

interface VideoTestimonialItem {
  name: string;
  role: string;
  quote: string;
}

// Video assets served from CDN (Cloudflare R2)
const CDN = process.env.NEXT_PUBLIC_CDN_URL || "";
const VIDEO_ASSETS = [
  { videoSrc: `${CDN}/Testimonial%20Advogada.MP4`, posterSrc: `${CDN}/advogada-poster.jpg` },
  { videoSrc: `${CDN}/Testimonials%20info.MP4`, posterSrc: `${CDN}/info-poster.jpg` },
  { videoSrc: `${CDN}/Testimonial%20Dropshipper.MP4`, posterSrc: `${CDN}/dropshipper-poster.jpg` },
];

// ── Individual video card ──────────────────────

function VideoCard({ item, videoSrc, posterSrc }: { item: VideoTestimonialItem; videoSrc: string; posterSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [warmedUp, setWarmedUp] = useState(false);

  // Hover/touch warm-up: start buffering before click
  const warmUp = useCallback(() => {
    if (warmedUp) return;
    const v = videoRef.current;
    if (!v) return;
    v.preload = "auto";
    v.load();
    setWarmedUp(true);
  }, [warmedUp]);

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play();
    setPlaying(true);
    setShowControls(false);
  }, []);

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setPlaying(false);
    setShowControls(false);
  }, []);

  // Tap on video while playing → show pause button briefly
  const handleVideoTap = useCallback(() => {
    if (!playing) {
      play();
      return;
    }
    // Show pause button, auto-hide after 1s
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 1000);
  }, [playing, play]);

  // Tap specifically on the pause button → pause
  const handlePauseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    pause();
  }, [pause]);

  // Pause when card scrolls out of view
  useEffect(() => {
    const card = cardRef.current;
    const video = videoRef.current;
    if (!card || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.paused) {
          video.pause();
          setPlaying(false);
          setShowControls(false);
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(card);
    return () => {
      observer.disconnect();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div ref={cardRef} className="flex flex-col">
      {/* Video container — portrait 9:16 */}
      <div
        className="relative cursor-pointer overflow-hidden rounded-2xl bg-zinc-900"
        style={{ aspectRatio: "9 / 16" }}
        onClick={handleVideoTap}
        onMouseEnter={warmUp}
        onTouchStart={warmUp}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc}
          poster={posterSrc}
          preload="metadata"
          playsInline
          loop
          muted={false}
          onCanPlay={() => setLoaded(true)}
          onEnded={() => { setPlaying(false); setShowControls(false); }}
        />

        {/* Gradient overlay at bottom for name legibility */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Name + role overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-base font-bold text-white">{item.name}</h3>
          <p className="text-xs text-white/60">{item.role}</p>
        </div>

        {/* Play button — visible only when paused */}
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
              <svg className="ml-1 h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Pause button — appears briefly on tap while playing */}
        {playing && showControls && (
          <div
            className="absolute inset-0 flex items-center justify-center animate-[fadeIn_150ms_ease-out]"
            onClick={handlePauseClick}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
              <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </div>
          </div>
        )}

        {/* Loading shimmer — visible only before poster loads */}
        {!loaded && !posterSrc && (
          <div className="absolute inset-0 animate-pulse bg-zinc-800" />
        )}
      </div>

      {/* Stars + quote below the video */}
      <div className="mt-3 px-1">
        <div className="mb-1.5 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <svg
              key={i}
              className="h-3.5 w-3.5 text-amber-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
        <p className="text-[13px] leading-relaxed text-zinc-600">
          {item.quote}
        </p>
      </div>
    </div>
  );
}

// ── Section ────────────────────────────────────

const VideoTestimonials = () => {
  const t = useTranslations("homepage.video_testimonials");
  const items = t.raw("items") as VideoTestimonialItem[];

  return (
    <section className="relative z-1 overflow-hidden border-t border-white/5 bg-[#080812] py-10 sm:py-14 lg:py-16">
      {/* Ambient halos */}
      <div className="pointer-events-none absolute inset-0 -z-1" aria-hidden>
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.05] blur-[90px]" />
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-8 xl:px-0">
        {/* Big card — same shiny-card pattern as MiniCalc */}
        <div className="shiny-card group relative overflow-hidden rounded-3xl p-6 shadow-[0_0_0_1px_rgba(16,185,129,0.1),0_25px_80px_-20px_rgba(0,0,0,0.35),0_0_50px_-10px_rgba(16,185,129,0.12)] transition-[transform] duration-500 hover:-translate-y-1 sm:p-10 lg:p-14">
          {/* Soft conic gradient halos */}
          <div
            className="pointer-events-none absolute inset-0 -z-1 opacity-50 transition-opacity duration-500 group-hover:opacity-80"
            aria-hidden
          >
            <div className="absolute -left-20 -top-20 h-[300px] w-[300px] rounded-full bg-emerald-400/[0.15] blur-3xl" />
            <div className="absolute -bottom-20 -right-20 h-[300px] w-[300px] rounded-full bg-emerald-400/[0.10] blur-3xl" />
          </div>

          {/* Emerald accent lines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

          {/* Header — arrows flanking the title pointing down to videos */}
          <div className="relative mb-8 text-center sm:mb-10">
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              {/* Left arrow */}
              <svg className="h-5 w-5 flex-shrink-0 text-emerald-500/60 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
              </svg>

              <h2 className="relative text-[1.75rem] font-bold leading-[1.15] tracking-tight text-zinc-900 sm:text-3xl lg:text-4xl">
                {t("title_before")}
                <span className="relative inline-block">
                  <span
                    className="relative z-[1]"
                    style={{ textShadow: "2px 0 white, -2px 0 white, 0 2px white, 0 -2px white, 1px 1px white, -1px -1px white, 1px -1px white, -1px 1px white" }}
                  >
                    {t("title_highlight")}
                  </span>
                  <span
                    className="absolute -bottom-0.5 left-0 z-0 h-[3px] w-full rounded-full"
                    style={{
                      background: "linear-gradient(90deg, rgba(16,185,129,0.25), rgba(52,211,153,0.9), rgba(16,185,129,0.25))",
                      backgroundSize: "200% 100%",
                      animation: "title-underline-shimmer 3s ease-in-out infinite",
                    }}
                    aria-hidden
                  />
                </span>
                {t("title_after")}
              </h2>

              {/* Right arrow */}
              <svg className="h-5 w-5 flex-shrink-0 text-emerald-500/60 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
              </svg>
            </div>
          </div>

          {/* 3-column video grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
            {items.map((item, i) => (
              <VideoCard
                key={item.name}
                item={item}
                videoSrc={VIDEO_ASSETS[i]?.videoSrc ?? ""}
                posterSrc={VIDEO_ASSETS[i]?.posterSrc ?? ""}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default VideoTestimonials;
