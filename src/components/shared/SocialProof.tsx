import type React from "react";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  avatar?: string;
}

// ── English testimonials ────────────────────────────────────────────
const ROW1_EN: Testimonial[] = [
  {
    quote:
      "Vestigio found $47k in revenue leaks we had no idea existed. The ROI was obvious within the first audit cycle.",
    name: "Sarah Chen",
    role: "Head of Growth",
    company: "TechFlow",
  },
  {
    quote:
      "We stopped guessing and started deciding. The prioritized action queue changed how our team operates daily.",
    name: "Marcus Rivera",
    role: "CEO",
    company: "ShopScale",
  },
  {
    quote:
      "Every deploy, Vestigio catches regressions before customers notice. It's our revenue safety net.",
    name: "Priya Patel",
    role: "VP Engineering",
    company: "CloudCart",
  },
  {
    quote:
      "The audit paid for itself in week one. Checkout friction was costing us $12k/month and we had no clue.",
    name: "David Kim",
    role: "Founder",
    company: "NexaCommerce",
  },
  {
    quote:
      "Finally, a tool that speaks revenue impact, not technical jargon. Our whole C-suite uses it.",
    name: "Ana Costa",
    role: "COO",
    company: "BrazilDigital",
  },
  {
    quote:
      "Vestigio replaced our analytics, audit, and monitoring stack — one decision engine for everything.",
    name: "James Mitchell",
    role: "CTO",
    company: "ScaleOps",
  },
];

const ROW2_EN: Testimonial[] = [
  {
    quote:
      "We hit 6X ROI in our second month. The impact quantification alone justified the investment.",
    name: "Lisa Wang",
    role: "Director of Commerce",
    company: "PeakRetail",
  },
  {
    quote:
      "I showed the Vestigio report to our board and they immediately greenlit the budget. Data that speaks.",
    name: "Rafael Santos",
    role: "CEO",
    company: "FunnelPro",
  },
  {
    quote:
      "Our checkout conversion jumped 23% after fixing what Vestigio flagged. No other tool caught it.",
    name: "Emily Zhang",
    role: "Growth Lead",
    company: "CartGenius",
  },
  {
    quote:
      "The workspace perspectives let me see revenue risk from five angles. Nothing else gives that clarity.",
    name: "Tom Anderson",
    role: "VP Revenue",
    company: "DataDrive",
  },
  {
    quote:
      "We were bleeding $8k/month on mobile friction alone. Vestigio found it, we fixed it in a day.",
    name: "Kenji Tanaka",
    role: "CTO",
    company: "MobileFirst",
  },
  {
    quote:
      "Integration was 60 seconds. First actionable insight came 3 minutes later. That's what fast looks like.",
    name: "Olivia Martinez",
    role: "Head of Digital",
    company: "GrowthLab",
  },
];

// ── Portuguese (pt-BR) testimonials ─────────────────────────────────
const ROW1_PT: Testimonial[] = [
  {
    quote:
      "A Vestigio encontrou R$180k em vazamentos de faturamento que não tínhamos ideia. O ROI foi óbvio no primeiro ciclo.",
    name: "Lucas Mendes",
    role: "Head de Crescimento",
    company: "TechBrasil",
  },
  {
    quote:
      "Paramos de adivinhar e começamos a decidir. A fila priorizada de ações mudou como operamos.",
    name: "Carolina Silva",
    role: "CEO",
    company: "EscalaShop",
  },
  {
    quote:
      "Cada deploy, a Vestigio pega regressões antes dos clientes perceberem. É nossa rede de segurança.",
    name: "Fernando Costa",
    role: "VP Engenharia",
    company: "CloudBR",
  },
  {
    quote:
      "A auditoria se pagou na primeira semana. Fricção no checkout custava R$45k/mês e não sabíamos.",
    name: "Marcos Oliveira",
    role: "Fundador",
    company: "NexaCommerce",
  },
  {
    quote:
      "Finalmente uma ferramenta que fala em impacto de faturamento, não jargão técnico. Todo o time usa.",
    name: "Ana Beatriz Santos",
    role: "COO",
    company: "DigitalBrasil",
  },
  {
    quote:
      "A Vestigio substituiu nosso stack de analytics, auditoria e monitoramento — uma engine de decisão.",
    name: "Pedro Almeida",
    role: "CTO",
    company: "ScaleOps Brasil",
  },
];

const ROW2_PT: Testimonial[] = [
  {
    quote:
      "Atingimos 6X de ROI no segundo mês. Só a quantificação de impacto já justificou o investimento.",
    name: "Juliana Ferreira",
    role: "Diretora Comercial",
    company: "PeakRetail BR",
  },
  {
    quote:
      "Mostrei o relatório da Vestigio pro board e aprovaram o budget na hora. Dados que falam por si.",
    name: "Rafael Nascimento",
    role: "CEO",
    company: "FunnelPro",
  },
  {
    quote:
      "Conversão do checkout subiu 23% depois de corrigir o que a Vestigio flagou. Nenhuma outra ferramenta pegou.",
    name: "Camila Rodrigues",
    role: "Growth Lead",
    company: "CartGenius BR",
  },
  {
    quote:
      "As perspectivas dos workspaces me mostram risco de faturamento de 5 ângulos. Nada mais dá essa clareza.",
    name: "Thiago Martins",
    role: "VP Faturamento",
    company: "DataDrive BR",
  },
  {
    quote:
      "Estávamos perdendo R$30k/mês em fricção mobile. A Vestigio encontrou, corrigimos em um dia.",
    name: "Kenji Tanaka",
    role: "CTO",
    company: "MobileFirst",
  },
  {
    quote:
      "Integração levou 60 segundos. Primeiro insight acionável veio 3 minutos depois. Isso é velocidade.",
    name: "Mariana Costa",
    role: "Head Digital",
    company: "GrowthLab BR",
  },
];

// ── Heading defaults per locale ─────────────────────────────────────
const HEADINGS: Record<string, string> = {
  en: "Trusted by growth-focused digital businesses",
  "pt-BR": "Empresas focadas em crescimento confiam na Vestigio",
};

// ── Helper functions ────────────────────────────────────────────────
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
    <div className="flex w-[400px] shrink-0 flex-col justify-between rounded-xl border border-white/5 bg-white/[0.03] p-5 sm:w-[440px]">
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
  const resolvedHeading = heading ?? HEADINGS[locale] ?? HEADINGS["pt-BR"];

  const showRow1 = rows === "both" || rows === "row1";
  const showRow2 = rows === "both" || rows === "row2";

  // Duplicate each row for seamless loop
  const track1 = [...resolvedRow1, ...resolvedRow1];
  const track2 = [...resolvedRow2, ...resolvedRow2];

  return (
    <section className="relative z-1 overflow-hidden bg-[#090911] py-16 lg:py-24">

      {/* Row 1 — scrolls left */}
      {showRow1 && (
        <div className={`relative w-full [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)] ${showRow2 ? "mb-5" : ""}`}>
          <div className="vsp-track-left flex w-max gap-5">
            {track1.map((t, i) => (
              <TestimonialCard key={`r1-${t.name}-${i}`} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* Row 2 — scrolls right */}
      {showRow2 && (
        <div className="relative w-full [mask-image:linear-gradient(to_right,transparent_0,black_8%,black_92%,transparent_100%)]">
          <div className="vsp-track-right flex w-max gap-5">
            {track2.map((t, i) => (
              <TestimonialCard key={`r2-${t.name}-${i}`} t={t} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default SocialProof;
