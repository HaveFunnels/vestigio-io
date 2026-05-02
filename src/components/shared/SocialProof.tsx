"use client";

import type React from "react";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  avatar?: string;
  /** Recovery value shown as emerald badge, e.g. "+R$47k/mês" */
  recovered?: string;
}

// ── English testimonials ────────────────────────────────────────────
const ROW1_EN: Testimonial[] = [
  {
    quote: "Vestigio showed me I was losing $12k/mo on checkout alone. Fixed in two days.",
    name: "Sarah Chen",
    role: "E-commerce owner",
    company: "TechFlow",
    recovered: "+$12k/mo",
  },
  {
    quote: "Half my patients dropped off the booking form. Vestigio pinpointed exactly where.",
    name: "Dr. Marcus Rivera",
    role: "Orthopedic surgeon",
    company: "Rivera Clinic",
    recovered: "+$4k/mo",
  },
  {
    quote: "We spent $5k on ads and the WhatsApp button wasn't even showing on mobile. First scan caught it.",
    name: "Priya Patel",
    role: "Partner",
    company: "Patel & Associates Law",
    recovered: "+$3k/mo",
  },
  {
    quote: "Turns out checkout was freezing for 68% of mobile users. Infra issue, not marketing.",
    name: "David Kim",
    role: "Founder",
    company: "NexaCommerce",
    recovered: "+$15k/mo",
  },
  {
    quote: "My accountant sent me the report. First time I understood how much money I was leaving on the table.",
    name: "Ana Costa",
    role: "Store owner",
    company: "Costa Boutique",
    recovered: "+$7k/mo",
  },
  {
    quote: "Ran the diagnostic Friday, fixed two things Saturday. Monday revenue was up 18%.",
    name: "James Mitchell",
    role: "CTO",
    company: "ScaleOps",
    recovered: "+$22k/mo",
  },
];

const ROW2_EN: Testimonial[] = [
  {
    quote: "I charge $200/consultation and was losing 30% of bookings to an SSL issue I didn't know existed.",
    name: "Dr. Lisa Wang",
    role: "Dermatologist",
    company: "Wang Dermatology",
    recovered: "+$5k/mo",
  },
  {
    quote: "Showed the report to my partner — he approved the investment immediately. Numbers don't lie.",
    name: "Rafael Santos",
    role: "CEO",
    company: "FunnelPro",
    recovered: "+$10k/mo",
  },
  {
    quote: "Our Meta pixel had been broken for 3 months. Three months of blind retargeting.",
    name: "Emily Zhang",
    role: "Head of Performance",
    company: "CartGenius",
    recovered: "+$9k/mo",
  },
  {
    quote: "I'm an accountant and recommend it to all my e-commerce clients. Tech that speaks finance.",
    name: "Tom Anderson",
    role: "CPA",
    company: "Anderson Accounting",
    recovered: "+$3k/mo",
  },
  {
    quote: "70% of my traffic was mobile and my site was a disaster there. Had no idea.",
    name: "Kenji Tanaka",
    role: "SaaS founder",
    company: "MobileFirst",
    recovered: "+$6k/mo",
  },
  {
    quote: "Integration took 60 seconds. First problem found 3 minutes later. Never seen anything this fast.",
    name: "Olivia Martinez",
    role: "Head of Digital",
    company: "GrowthLab",
    recovered: "+$14k/mo",
  },
];

// ── Portuguese (pt-BR) testimonials ─────────────────────────────────
const ROW1_PT: Testimonial[] = [
  {
    quote: "A Vestigio mostrou que eu perdia quase R$40k/mês só no checkout. Corrigimos em dois dias.",
    name: "Lucas Mendes",
    role: "Dono de e-commerce",
    company: "TechBrasil",
    recovered: "+R$38k/mês",
  },
  {
    quote: "Metade dos pacientes desistia no formulário de agendamento. Identificou exatamente onde travavam.",
    name: "Dra. Carolina Silva",
    role: "Médica dermatologista",
    company: "Clínica Pele Viva",
    recovered: "+R$12k/mês",
  },
  {
    quote: "Gastávamos R$15k em tráfego e o botão do WhatsApp nem aparecia no celular. Primeiro scan pegou.",
    name: "Fernando Costa",
    role: "Sócio",
    company: "Costa & Advogados",
    recovered: "+R$9k/mês",
  },
  {
    quote: "O pixel do Meta tava quebrado fazia 3 meses. Três meses jogando dinheiro fora em retargeting cego.",
    name: "Marcos Oliveira",
    role: "Head de Performance",
    company: "NexaCommerce",
    recovered: "+R$45k/mês",
  },
  {
    quote: "Meu contador me mandou o relatório e eu entendi pela primeira vez quanto dinheiro eu deixava na mesa.",
    name: "Ana Beatriz Santos",
    role: "Dona de loja virtual",
    company: "Ateliê AB",
    recovered: "+R$22k/mês",
  },
  {
    quote: "Diagnóstico na sexta, duas correções no sábado. Na segunda o faturamento já tinha subido 18%.",
    name: "Pedro Almeida",
    role: "CTO",
    company: "ScaleOps Brasil",
    recovered: "+R$67k/mês",
  },
];

const ROW2_PT: Testimonial[] = [
  {
    quote: "Cobro R$500 a consulta e perdia 30% dos agendamentos por um problema de SSL que eu nem sabia.",
    name: "Dr. Thiago Martins",
    role: "Cirurgião plástico",
    company: "Instituto Martins",
    recovered: "+R$15k/mês",
  },
  {
    quote: "Mostrei o relatório pro sócio e ele autorizou o investimento na hora. Quando vê o número em reais, não tem discussão.",
    name: "Rafael Nascimento",
    role: "CEO",
    company: "FunnelPro",
    recovered: "+R$31k/mês",
  },
  {
    quote: "No celular meu site era um desastre. 70% do tráfego era mobile e eu perdia tudo ali.",
    name: "Camila Rodrigues",
    role: "Dona de SaaS",
    company: "CartGenius BR",
    recovered: "+R$28k/mês",
  },
  {
    quote: "Sou contador e recomendo pra todos os clientes de e-commerce. Tecnologia que fala a língua do financeiro.",
    name: "Roberto Freitas",
    role: "Contador",
    company: "Freitas Contabilidade",
    recovered: "+R$8k/mês",
  },
  {
    quote: "A landing page não combinava com o criativo do ad. A desistência não sumiu, só mudou de lugar.",
    name: "Kenji Tanaka",
    role: "Growth Manager",
    company: "MobileFirst",
    recovered: "+R$19k/mês",
  },
  {
    quote: "Integração levou 60 segundos. Primeiro problema veio 3 minutos depois. Nunca vi nada tão rápido.",
    name: "Mariana Costa",
    role: "Head Digital",
    company: "GrowthLab BR",
    recovered: "+R$41k/mês",
  },
];

// ── Helper functions ────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400">
      {getInitials(name)}
    </div>
  );
}

function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <div className="flex w-[300px] shrink-0 flex-col justify-between rounded-xl border border-white/5 bg-white/[0.03] p-5 sm:w-[360px]">
      <p className="mb-4 text-sm italic leading-relaxed text-zinc-300">
        &ldquo;{t.quote}&rdquo;
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={t.name} />
          <div>
            <p className="text-sm font-medium text-zinc-200">{t.name}</p>
            <p className="text-xs text-zinc-500">
              {t.role}, {t.company}
            </p>
          </div>
        </div>
        {t.recovered && (
          <div className="flex shrink-0 flex-col items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5">
            <p className="text-[9px] font-medium uppercase tracking-wider text-emerald-400/70">Recuperado</p>
            <p className="font-mono text-sm font-bold tabular-nums leading-none text-emerald-300">{t.recovered}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────
interface SocialProofProps {
  row1?: Testimonial[];
  row2?: Testimonial[];
  heading?: string;
  locale?: "en" | "pt-BR";
  /** Which rows to render. Defaults to "both". */
  rows?: "row1" | "row2" | "both";
}

export function SocialProof({
  row1,
  row2,
  heading,
  locale = "pt-BR",
  rows = "both",
}: SocialProofProps) {
  const resolvedRow1 = row1 ?? (locale === "pt-BR" ? ROW1_PT : ROW1_EN);
  const resolvedRow2 = row2 ?? (locale === "pt-BR" ? ROW2_PT : ROW2_EN);

  const showRow1 = rows === "both" || rows === "row1";
  const showRow2 = rows === "both" || rows === "row2";

  // Duplicate each row for seamless loop (desktop only — mobile uses native scroll)
  const track1 = [...resolvedRow1, ...resolvedRow1];
  const track2 = [...resolvedRow2, ...resolvedRow2];

  return (
    <section className="relative z-1 overflow-hidden bg-[#090911] py-2 sm:py-3 lg:py-4">

      {/* Row 1 — mobile: native horizontal scroll | desktop: auto-scroll left */}
      {showRow1 && (
        <div className={`relative w-full ${showRow2 ? "mb-5" : ""}`}>
          {/* Mobile: native scrollable */}
          <div className="flex gap-4 overflow-x-auto px-4 no-scrollbar md:hidden">
            {resolvedRow1.map((t, i) => (
              <TestimonialCard key={`r1m-${t.name}-${i}`} t={t} />
            ))}
          </div>
          {/* Desktop: infinite marquee */}
          <div className="hidden md:block [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]">
            <div className="vsp-track-left flex w-max gap-5">
              {track1.map((t, i) => (
                <TestimonialCard key={`r1-${t.name}-${i}`} t={t} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Row 2 — mobile: native horizontal scroll | desktop: auto-scroll right */}
      {showRow2 && (
        <div className="relative w-full">
          {/* Mobile: native scrollable */}
          <div className="flex gap-4 overflow-x-auto px-4 no-scrollbar md:hidden">
            {resolvedRow2.map((t, i) => (
              <TestimonialCard key={`r2m-${t.name}-${i}`} t={t} />
            ))}
          </div>
          {/* Desktop: infinite marquee */}
          <div className="hidden md:block [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]">
            <div className="vsp-track-right flex w-max gap-5">
              {track2.map((t, i) => (
                <TestimonialCard key={`r2-${t.name}-${i}`} t={t} />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SocialProof;
