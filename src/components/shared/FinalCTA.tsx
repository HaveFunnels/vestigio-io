import Link from "next/link";

interface TrustBadge {
  label: string;
}

interface FinalCTAProps {
  headline?: string;
  subheadline?: string;
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  trustBadges?: TrustBadge[];
}

const DEFAULT_TRUST_BADGES: TrustBadge[] = [
  { label: "Sem cartão de crédito" },
  { label: "Resultado em 60 segundos" },
  { label: "4X ROI Guarantee" },
];

export function FinalCTA({
  headline = "Pare de escalar no escuro.",
  subheadline = "Descubra onde seu negócio digital está vazando dinheiro. Comece em 60 segundos.",
  primaryLabel = "Rodar Auditoria Grátis",
  primaryHref = "/auth/signup",
  secondaryLabel = "Falar com time",
  secondaryHref = "/support",
  trustBadges = DEFAULT_TRUST_BADGES,
}: FinalCTAProps) {
  return (
    <section className="relative z-1 overflow-hidden bg-[#090911] py-20 lg:py-28">
      {/* Subtle emerald glow behind */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[340px] w-[600px] rounded-full bg-emerald-500/[0.07]" style={{ filter: "blur(120px)" }} />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-8">
        <h2 className="mb-4 text-3xl font-bold text-zinc-100 sm:text-4xl lg:text-5xl">
          {headline}
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-lg text-zinc-400">
          {subheadline}
        </p>

        {/* Buttons */}
        <div className="mb-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href={primaryHref} className="shiny-cta">
            <span>{primaryLabel}</span>
          </Link>
          <Link
            href={secondaryHref}
            className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-transparent px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:text-zinc-100"
          >
            {secondaryLabel}
          </Link>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {trustBadges.map((badge) => (
            <span
              key={badge.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-xs text-zinc-400"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {badge.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FinalCTA;
