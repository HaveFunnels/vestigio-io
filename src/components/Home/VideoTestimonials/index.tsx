"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// VideoTestimonials — portrait video social proof
//
// UX pattern (vTurb-style):
//   • Videos autoplay muted+looping — visitor sees person talking
//   • Glassmorphism pill with unmute icon invites "Ouvir"
//   • Click → restart from 0:00, unmute, play with audio
//   • Click while unmuted → blur overlay + mute icon (paused)
//   • Click blur overlay → remove blur, resume unmuted
//   • IntersectionObserver mutes+resets when off-screen
//   • On video end → return to muted loop state
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

// ── Unmute icon (speaker with X) ──────────────
function UnmuteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  );
}

// ── Volume icon (speaker with waves) ──────────
function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728" />
    </svg>
  );
}

// ── Individual video card ──────────────────────

function VideoCard({ item, videoSrc, posterSrc }: { item: VideoTestimonialItem; videoSrc: string; posterSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // "muted" = autoplay muted loop (default)
  // "playing" = unmuted, playing with audio
  // "paused" = unmuted but paused, blur overlay visible
  const [state, setState] = useState<"muted" | "playing" | "paused">("muted");

  // Unmute: restart from beginning with audio
  const unmute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = false;
    v.loop = false;
    v.play();
    setState("playing");
  }, []);

  // Pause: show blur overlay
  const pause = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    setState("paused");
  }, []);

  // Resume: remove blur, continue playing
  const resume = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play();
    setState("playing");
  }, []);

  // Return to muted autoplay loop
  const returnToMuted = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.loop = true;
    v.currentTime = 0;
    v.play();
    setState("muted");
  }, []);

  const handleClick = useCallback(() => {
    if (state === "muted") unmute();
    else if (state === "playing") pause();
    else if (state === "paused") resume();
  }, [state, unmute, pause, resume]);

  // When video ends (unmuted playback) → return to muted loop
  const handleEnded = useCallback(() => {
    returnToMuted();
  }, [returnToMuted]);

  // Mute + reset when card scrolls out of view
  useEffect(() => {
    const card = cardRef.current;
    const video = videoRef.current;
    if (!card || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && !video.muted) {
          video.muted = true;
          video.loop = true;
          video.currentTime = 0;
          video.play();
          setState("muted");
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={cardRef} className="flex flex-col">
      {/* Video container — portrait 9:16 */}
      <div
        className="relative cursor-pointer overflow-hidden rounded-2xl bg-zinc-900"
        style={{ aspectRatio: "9 / 16" }}
        onClick={handleClick}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={videoSrc}
          poster={posterSrc}
          preload="auto"
          playsInline
          autoPlay
          muted
          loop
          onEnded={handleEnded}
        />

        {/* Gradient overlay at bottom for name legibility */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Name + role overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-base font-bold text-white">{item.name}</h3>
          <p className="text-xs text-white/60">{item.role}</p>
        </div>

        {/* Unmute pill — visible in muted autoplay state */}
        {state === "muted" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-5 py-2.5 backdrop-blur-md transition-transform duration-200 hover:scale-105">
              <UnmuteIcon className="h-5 w-5 text-white" />
              <span className="text-sm font-medium text-white">Ouvir</span>
            </div>
          </div>
        )}

        {/* Blur overlay + volume icon — visible when paused */}
        {state === "paused" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]">
            <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-5 py-2.5 backdrop-blur-md">
              <VolumeIcon className="h-5 w-5 text-white" />
              <span className="text-sm font-medium text-white">Ouvir</span>
            </div>
          </div>
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
        <p className="text-[13px] italic leading-relaxed text-zinc-400">
          &ldquo;{item.quote}&rdquo;
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
    <section className="relative z-1 overflow-hidden border-t border-white/5 bg-[#080812] py-8 sm:py-10 lg:py-14">
      {/* Ambient halos */}
      <div className="pointer-events-none absolute inset-0 -z-1" aria-hidden>
        <div className="absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/[0.05] blur-[90px]" />
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-8 xl:px-0">
        {/* Shiny outline card — transparent bg, emerald border glow */}
        <div className="shiny-card relative overflow-hidden rounded-3xl p-6 shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_0_50px_-10px_rgba(16,185,129,0.10)] sm:p-10 lg:p-14" style={{ "--shiny-card-bg": "#080812" } as React.CSSProperties}>
          {/* Emerald accent lines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-500/15 to-transparent" />

          {/* Header — arrows flanking the title pointing down to videos */}
          <div className="relative mb-8 text-center sm:mb-10">
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              {/* Left arrow */}
              <svg className="h-5 w-5 flex-shrink-0 text-emerald-500/60 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
              </svg>

              <h2 className="relative text-[1.75rem] font-bold leading-[1.15] tracking-tight text-zinc-100 sm:text-3xl lg:text-4xl">
                {t("title_before")}
                <span className="relative inline-block">
                  <span className="relative z-[1]">
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
