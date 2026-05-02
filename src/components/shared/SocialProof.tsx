import type React from "react";

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  avatar?: string;
  /** CDN path for photo — falls back to initials if missing/broken */
  photoSrc?: string;
  /** Recovery value shown as emerald badge, e.g. "+R$47k/mês" */
  recovered?: string;
}

// ── English testimonials ────────────────────────────────────────────
const ROW1_EN: Testimonial[] = [
  {
    quote: "I thought my site was fine. Vestigio showed me I was losing almost $12k a month just on checkout. We fixed it in two days.",
    name: "Sarah Chen",
    role: "E-commerce owner",
    company: "TechFlow",
    recovered: "+$12k/mo",
  },
  {
    quote: "My patients were booking consultations online and half dropped off on the form. Vestigio pinpointed exactly where they got stuck.",
    name: "Dr. Marcus Rivera",
    role: "Orthopedic surgeon",
    company: "Rivera Clinic",
    recovered: "+$4k/mo",
  },
  {
    quote: "We were spending $5k on paid ads and didn't know the WhatsApp button wasn't even showing on mobile. Vestigio caught it on the first scan.",
    name: "Priya Patel",
    role: "Partner",
    company: "Patel & Associates Law",
    recovered: "+$3k/mo",
  },
  {
    quote: "I thought it was a traffic problem. Turns out checkout was freezing for 68% of mobile users. An infra issue, not a marketing one.",
    name: "David Kim",
    role: "Founder",
    company: "NexaCommerce",
    recovered: "+$15k/mo",
  },
  {
    quote: "My accountant sent me the Vestigio report and for the first time I understood how much money I was leaving on the table every month.",
    name: "Ana Costa",
    role: "Store owner",
    company: "Costa Boutique",
    recovered: "+$7k/mo",
  },
  {
    quote: "Ran the diagnostic on Friday, fixed two things Saturday. By Monday revenue was up 18%. No exaggeration.",
    name: "James Mitchell",
    role: "CTO",
    company: "ScaleOps",
    recovered: "+$22k/mo",
  },
];

const ROW2_EN: Testimonial[] = [
  {
    quote: "I charge $200 per consultation and my site was losing 30% of bookings because of an SSL issue I didn't even know existed.",
    name: "Dr. Lisa Wang",
    role: "Dermatologist",
    company: "Wang Dermatology",
    recovered: "+$5k/mo",
  },
  {
    quote: "Showed the report to my business partner and he approved the investment immediately. When you see the number in dollars, there's no argument.",
    name: "Rafael Santos",
    role: "CEO",
    company: "FunnelPro",
    recovered: "+$10k/mo",
  },
  {
    quote: "Vestigio found our Meta pixel had been broken for 3 months. Three months throwing money away on blind retargeting.",
    name: "Emily Zhang",
    role: "Head of Performance",
    company: "CartGenius",
    recovered: "+$9k/mo",
  },
  {
    quote: "I'm an accountant and I recommend it to all my e-commerce clients. First time I've seen tech that speaks the language of finance.",
    name: "Tom Anderson",
    role: "CPA",
    company: "Anderson Accounting",
    recovered: "+$3k/mo",
  },
  {
    quote: "On mobile my site was a disaster and I had no idea. Vestigio showed me 70% of my traffic was mobile and I was losing everything there.",
    name: "Kenji Tanaka",
    role: "SaaS founder",
    company: "MobileFirst",
    recovered: "+$6k/mo",
  },
  {
    quote: "Integration took 60 seconds. First problem found came 3 minutes later. I've never seen anything this fast.",
    name: "Olivia Martinez",
    role: "Head of Digital",
    company: "GrowthLab",
    recovered: "+$14k/mo",
  },
];

// ── Portuguese (pt-BR) testimonials ─────────────────────────────────
const CDN = process.env.NEXT_PUBLIC_CDN_URL || "";

const ROW1_PT: Testimonial[] = [
  {
    quote: "Eu achava que meu site tava ok. A Vestigio mostrou que eu tava perdendo quase 40k por mês só no checkout. Corrigimos em dois dias.",
    name: "Lucas Mendes",
    role: "Dono de e-commerce",
    company: "TechBrasil",
    photoSrc: `${CDN}/avatars/lucas-mendes.jpg`,
    recovered: "+R$38k/mês",
  },
  {
    quote: "Meus clientes marcavam consulta pelo site e metade desistia no formulário. A Vestigio identificou exatamente onde eles travavam.",
    name: "Dra. Carolina Silva",
    role: "Médica dermatologista",
    company: "Clínica Pele Viva",
    photoSrc: `${CDN}/avatars/carolina-silva.jpg`,
    recovered: "+R$12k/mês",
  },
  {
    quote: "A gente gastava R$15k em tráfego pago e não sabia que o botão do WhatsApp nem aparecia no celular. Vestigio pegou isso no primeiro scan.",
    name: "Fernando Costa",
    role: "Sócio",
    company: "Costa & Advogados",
    photoSrc: `${CDN}/avatars/fernando-costa.jpg`,
    recovered: "+R$9k/mês",
  },
  {
    quote: "Eu achava que era problema de tráfego. Na real, o checkout tava travando pra 68% dos clientes mobile. Problema de infra, não de marketing.",
    name: "Marcos Oliveira",
    role: "Fundador",
    company: "NexaCommerce",
    photoSrc: `${CDN}/avatars/marcos-oliveira.jpg`,
    recovered: "+R$45k/mês",
  },
  {
    quote: "Meu contador me mandou o relatório da Vestigio e eu entendi pela primeira vez quanto dinheiro eu deixava na mesa todo mês.",
    name: "Ana Beatriz Santos",
    role: "Dona de loja virtual",
    company: "Ateliê AB",
    photoSrc: `${CDN}/avatars/ana-santos.jpg`,
    recovered: "+R$22k/mês",
  },
  {
    quote: "Rodei o diagnóstico na sexta, corrigi duas coisas no sábado. Na segunda o faturamento já tinha subido 18%. Sem exagero.",
    name: "Pedro Almeida",
    role: "CTO",
    company: "ScaleOps Brasil",
    photoSrc: `${CDN}/avatars/pedro-almeida.jpg`,
    recovered: "+R$67k/mês",
  },
];

const ROW2_PT: Testimonial[] = [
  {
    quote: "Eu cobro R$500 a consulta e meu site perdia 30% dos agendamentos por um problema de SSL que eu nem sabia que existia.",
    name: "Dr. Thiago Martins",
    role: "Cirurgião plástico",
    company: "Instituto Martins",
    photoSrc: `${CDN}/avatars/thiago-martins.jpg`,
    recovered: "+R$15k/mês",
  },
  {
    quote: "Mostrei o relatório pro meu sócio e ele autorizou o investimento na hora. Quando você vê o número em reais, não tem discussão.",
    name: "Rafael Nascimento",
    role: "CEO",
    company: "FunnelPro",
    photoSrc: `${CDN}/avatars/rafael-nascimento.jpg`,
    recovered: "+R$31k/mês",
  },
  {
    quote: "A Vestigio encontrou que nosso pixel do Meta tava quebrado fazia 3 meses. Três meses jogando dinheiro fora em retargeting cego.",
    name: "Camila Rodrigues",
    role: "Head de Performance",
    company: "CartGenius BR",
    photoSrc: `${CDN}/avatars/camila-rodrigues.jpg`,
    recovered: "+R$28k/mês",
  },
  {
    quote: "Sou contador e recomendo pra todos os meus clientes de e-commerce. É a primeira vez que vejo tecnologia que fala a língua do financeiro.",
    name: "Roberto Freitas",
    role: "Contador",
    company: "Freitas Contabilidade",
    photoSrc: `${CDN}/avatars/roberto-freitas.jpg`,
    recovered: "+R$8k/mês",
  },
  {
    quote: "No celular meu site era um desastre e eu não sabia. A Vestigio mostrou que 70% do meu tráfego era mobile e eu tava perdendo tudo ali.",
    name: "Kenji Tanaka",
    role: "Dono de SaaS",
    company: "MobileFirst",
    photoSrc: `${CDN}/avatars/kenji-tanaka.jpg`,
    recovered: "+R$19k/mês",
  },
  {
    quote: "Integração levou 60 segundos. Primeiro problema encontrado veio 3 minutos depois. Nunca vi nada tão rápido.",
    name: "Mariana Costa",
    role: "Head Digital",
    company: "GrowthLab BR",
    photoSrc: `${CDN}/avatars/mariana-costa.jpg`,
    recovered: "+R$41k/mês",
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

function Avatar({ name, avatar, photoSrc }: { name: string; avatar?: string; photoSrc?: string }) {
  const src = photoSrc || avatar;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="h-10 w-10 rounded-full object-cover"
        onError={(e) => {
          // Fallback to initials on load error
          const el = e.currentTarget;
          const parent = el.parentElement;
          if (!parent) return;
          el.style.display = "none";
          const fallback = document.createElement("div");
          fallback.className = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400";
          fallback.textContent = getInitials(name);
          parent.appendChild(fallback);
        }}
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
    <div className="flex w-[340px] shrink-0 flex-col justify-between rounded-xl border border-white/5 bg-white/[0.03] p-5 sm:w-[400px]">
      <p className="mb-4 text-sm italic leading-relaxed text-zinc-300">
        &ldquo;{t.quote}&rdquo;
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={t.name} avatar={t.avatar} photoSrc={t.photoSrc} />
          <div>
            <p className="text-sm font-medium text-zinc-200">{t.name}</p>
            <p className="text-xs text-zinc-500">
              {t.role}, {t.company}
            </p>
          </div>
        </div>
        {t.recovered && (
          <div className="shrink-0 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-2.5 py-1.5">
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
  const resolvedHeading = heading ?? HEADINGS[locale] ?? HEADINGS["pt-BR"];

  const showRow1 = rows === "both" || rows === "row1";
  const showRow2 = rows === "both" || rows === "row2";

  // Duplicate each row for seamless loop
  const track1 = [...resolvedRow1, ...resolvedRow1];
  const track2 = [...resolvedRow2, ...resolvedRow2];

  return (
    <section className="relative z-1 overflow-hidden bg-[#090911] py-2 sm:py-3 lg:py-4">

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
