/**
 * Landing page — the agency's public face.
 *
 * Positioned as a professional nursing academic support agency (per
 * docs/landing-page-plan.md): institutional tone, serif display type,
 * navy/ivory palette. The Care Study Support Programme — Study Preparation
 * and Viva Preparation — is the flagship. The word "AI" never appears as a
 * headline; the drafting technology sits behind the method and is addressed
 * honestly only in the FAQ.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock2,
  Download,
  FileText,
  FileUp,
  GraduationCap,
  HeartPulse,
  Mail,
  Menu,
  Quote,
  ScrollText,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { HeroDashboard } from "@/components/hero-dashboard";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const NAVY = "hsl(200 40% 13%)";
const NAVY_SOFT = "hsl(200 34% 17%)";
const IVORY = "hsl(43 30% 94%)";
const GOLD = "hsl(45 85% 58%)";

/** The brand mark used across the studio and portal — carried into the hero. */
function BrandMark({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="brand-tile grid size-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
        <HeartPulse className="size-5" />
      </span>
      <span>
        <span
          className={cn(
            "block font-serif text-base leading-none tracking-tight",
            onDark ? "text-[hsl(43_30%_94%)]" : "text-foreground",
          )}
        >
          care<span className="text-primary">study</span>
        </span>
        <span
          className={cn(
            "mt-1 block font-mono text-[9px] uppercase tracking-[0.16em]",
            onDark ? "text-[hsl(43_30%_94%/0.55)]" : "text-muted-foreground",
          )}
        >
          nursing academic support
        </span>
      </span>
    </span>
  );
}

/** Small mono eyebrow label above section headings. */
function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p
      className={cn(
        "mb-3 font-mono text-[11px] uppercase tracking-[0.2em]",
        onDark ? "text-[hsl(45_85%_65%)]" : "text-primary",
      )}
    >
      {children}
    </p>
  );
}

/** Section heading in the Fraunces serif with the app's display tracking. */
function SectionTitle({
  children,
  className,
  onDark = false,
}: {
  children: ReactNode;
  className?: string;
  onDark?: boolean;
}) {
  return (
    <h2
      className={cn(
        "hero-title text-3xl font-semibold leading-tight sm:text-4xl",
        onDark ? "text-[hsl(43_30%_94%)]" : "text-foreground",
        className,
      )}
    >
      {children}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const NAV_LINKS = [
  { href: "#about", label: "About" },
  { href: "#programme", label: "The Programme" },
  { href: "#what-you-get", label: "What you get" },
  { href: "#standards", label: "Standards" },
  { href: "#faq", label: "FAQ" },
];

/** Section IDs that the nav links point to, in order. */
const SECTION_IDS = NAV_LINKS.map((l) => l.href.replace("#", ""));

/**
 * Track which section is currently in the viewport using IntersectionObserver.
 * Returns the id of the most visible section, or null when none is visible.
 * The observer uses a rootMargin that accounts for the sticky header height
 * so the active link updates when a section scrolls into the readable area.
 */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the highest intersection ratio.
        let best: string | null = null;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            best = entry.target.id;
          }
        }
        if (best) setActive(best);
      },
      {
        // The sticky header is ~4rem tall; trigger when the section enters
        // the bottom 60 % of the viewport so the highlight feels responsive.
        rootMargin: "-20% 0px -35% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return active;
}

function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeSection = useActiveSection();

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
        <a href="/" aria-label="carestudy — home">
          <BrandMark />
        </a>
        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 text-sm font-medium md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = activeSection === link.href.replace("#", "");
            return (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden text-muted-foreground sm:inline-flex')}>
            Sign in
          </Link>
          <Link href="/student/register" className={cn(buttonVariants({ size: 'sm' }), 'hidden sm:inline-flex')}>
            Start your care study <ArrowRight className="size-4" />
          </Link>
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="size-9 md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
            {NAV_LINKS.map((link) => {
              const isActive = activeSection === link.href.replace("#", "");
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              );
            })}
            <div className="my-2 h-px bg-border/60" />
            <Link href="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'justify-start text-muted-foreground')}>
              Sign in
            </Link>
            <Link href="/student/register" className={cn(buttonVariants({ size: 'sm' }))}>
              Start your care study <ArrowRight className="size-4" />
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ background: NAVY }}>
      {/* Subtle teal accent glow — no grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 60% at 80% 10%, hsl(166 58% 62% / 0.12), transparent 70%), radial-gradient(40% 40% at 10% 90%, hsl(174 64% 31% / 0.14), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 sm:pb-20 sm:pt-24 lg:pb-24">
        <div className="grid items-center gap-8 sm:gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-3xl">
          <Eyebrow onDark>Nursing support • Accra • Nationwide</Eyebrow>
          <h1 className="hero-title text-[1.75rem] font-semibold leading-[1.1] text-[hsl(43_30%_94%)] sm:text-[2.5rem] md:text-[2.8rem] lg:text-[3.5rem]">
            Support for nursing students
            <span className="mt-2 block text-[hsl(166_58%_68%)] text-[0.88em] sm:mt-3">
              practical guidance for learning and practice.
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[hsl(43_30%_94%/0.75)] sm:mt-6 sm:text-base md:text-lg">
            carestudy supports nursing students with academic guidance, clinical learning, and
            professional preparation. We help with care study preparation, nursing research,
            internal and licensing exam review, and the clear, practical support students need to
            stay prepared and confident.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center">
            <Link href="/student/register" className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto justify-center')}>
              Start your care study <ArrowRight className="size-4" />
            </Link>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full border-[hsl(43_30%_94%/0.25)] bg-transparent text-[hsl(43_30%_94%)] hover:bg-[hsl(43_30%_94%/0.08)] sm:w-auto"
            >
              <a href="#programme">See how it works</a>
            </Button>
          </div>
        </div>
          <div className="hidden lg:block">
            <HeroDashboard />
          </div>
        </div>

        {/* Trust strip */}
        <div
          className="mt-10 grid gap-4 rounded-2xl border border-[hsl(43_30%_94%/0.12)] p-4 sm:mt-14 sm:grid-cols-3 sm:gap-5 sm:p-6 lg:p-8"
          style={{ background: NAVY_SOFT }}
        >
          <div className="flex items-start gap-3">
            <Stethoscope className="mt-0.5 size-5 shrink-0 text-[hsl(166_58%_62%)]" />
            <p className="text-xs leading-relaxed text-[hsl(43_30%_94%/0.8)] sm:text-sm">
              Aligned with the Nursing and Midwifery Council's standards for professional
              practice.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <GraduationCap className="mt-0.5 size-5 shrink-0 text-[hsl(166_58%_62%)]" />
            <p className="text-xs leading-relaxed text-[hsl(43_30%_94%/0.8)] sm:text-sm">
              Built from your own clinical materials — your patient, your notes, your school's
              format.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 size-5 shrink-0 text-[hsl(166_58%_62%)]" />
            <p className="text-xs leading-relaxed text-[hsl(43_30%_94%/0.8)] sm:text-sm">
              Professional preparation, not just a document — we stay with you through the
              defense.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The stakes
// ---------------------------------------------------------------------------

function Stakes() {
  const cards = [
    {
      icon: ScrollText,
      title: "Required",
      body: "The Patient/Family Care Study is a graduation and licensure requirement of the Nursing and Midwifery Council. It is the document that stands between you and registration.",
    },
    {
      icon: ShieldCheck,
      title: "Defended",
      body: "You will stand before your supervisors and defend it — every diagnosis, every intervention, every reference. A study you cannot answer for is a study that fails.",
    },
    {
      icon: Clock2,
      title: "Undersupported",
      body: "Supervision time is scarce, the format is passed down informally, and the reference texts are expensive. The work is expected of you, yet almost never taught.",
    },
  ];

  const wrongAnswers = [
    {
      title: "Ghostwriters who write it for you",
      body: "Expensive, and they leave you defenceless — a student who didn't write the study cannot answer one question about it.",
    },
    {
      title: "Copied samples from other students",
      body: "They don't match your patient, and they risk your registration under academic-integrity rules.",
    },
    {
      title: "Generic chatbots",
      body: "They don't know your school's format, and they invent patient facts and citations you will have to answer for.",
    },
  ];

  return (
    <section id="stakes" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <Eyebrow>The weight of the document</Eyebrow>
          <SectionTitle>
            A requirement of your profession. A defence before your college. A document no one ever
            taught you to write.
          </SectionTitle>
        </div>

        <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {cards.map((card) => (
            <Card key={card.title} className="border-border/80 p-5 sm:p-6">
              <span className="mb-3 grid size-9 place-items-center rounded-lg bg-primary/10 sm:mb-4 sm:size-10">
                <card.icon className="size-4.5 text-primary sm:size-5" />
              </span>
              <h3 className="font-serif text-base font-semibold sm:text-lg">{card.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:mt-2">{card.body}</p>
            </Card>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-border/80 bg-background p-5 sm:mt-14 sm:p-6 lg:p-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            The help already out there
          </p>
          <div className="mt-4 grid gap-4 sm:mt-5 sm:gap-5 lg:grid-cols-3">
            {wrongAnswers.map((answer) => (
              <div key={answer.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-destructive/10">
                  <X className="size-3 text-destructive" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-snug">{answer.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{answer.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="hero-title mt-6 text-xl font-semibold text-primary sm:mt-8 sm:text-2xl lg:text-3xl">
            There is a better way.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Who we are + standards
// ---------------------------------------------------------------------------

function About() {
  const standards = [
    {
      title: "Accuracy",
      body: "Every clinical claim is grounded in your materials and checked against cited sources.",
    },
    {
      title: "Integrity",
      body: "Your study is built from your data. Nothing is invented, and your authorship is protected.",
    },
    {
      title: "Built on your materials",
      body: "Your patient, your notes, your college's guidelines — never a generic template.",
    },
    {
      title: "Defense readiness",
      body: "We prepare the study and we prepare you to answer for it.",
    },
  ];

  return (
    <section id="about" className="scroll-mt-20 border-y border-border/60 bg-background py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <Eyebrow>Who we are</Eyebrow>
          <SectionTitle>An academic support agency for nursing education.</SectionTitle>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            We are a team of nursing educators, clinicians, and academic specialists. Our work is
            the quiet infrastructure of nursing education — standards, structure, and scholarly
            guidance.
          </p>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            The Care Study is our hallmark discipline because it is where students most need a
            professional partner and least have one. Two services carry it:{" "}
            <span className="font-medium text-foreground">Study Preparation</span> — the complete
            document, built from your materials — and{" "}
            <span className="font-medium text-foreground">Viva Preparation</span> — making sure you
            can defend it.
          </p>
          <p className="mt-6 border-l-2 border-primary pl-4 font-serif text-lg italic leading-relaxed text-foreground">
            We prepare the study. We prepare you to defend it.
          </p>
        </div>

        <div id="standards" className="scroll-mt-20">
          <div className="rounded-2xl border border-border/80 bg-background p-6 sm:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Our standards
            </p>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              {standards.map((standard) => (
                <div key={standard.title}>
                  <h3 className="font-serif text-base font-semibold text-primary">
                    {standard.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {standard.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The programme — how it works
// ---------------------------------------------------------------------------

function Programme() {
  const steps = [
    {
      icon: UserPlus,
      title: "Create your account",
      body: "Every student gets a private dashboard — your own workspace for your project, from order to delivery.",
    },
    {
      icon: FileUp,
      title: "Place your order",
      body: "Send us your project information: your clinical notes and patient data, your college's care-study guidelines, and any reference documents you want used.",
    },
    {
      icon: ScrollText,
      title: "Our academic team prepares your study",
      body: "Your materials become a complete, cited, school-conformant study. You watch the status from your dashboard.",
    },
    {
      icon: Download,
      title: "Receive your finished study",
      body: "Download your complete study as a professionally formatted academic document, with real citations and a reference list.",
    },
    {
      icon: GraduationCap,
      title: "Prepare for the viva",
      body: "The Viva Preparation Programme: a mock defense, a question bank built from your study, and guided drills — so you walk in able to answer for every diagnosis, intervention, and reference.",
    },
  ];

  return (
    <section id="programme" className="relative scroll-mt-20 overflow-hidden py-20 sm:py-28" style={{ background: NAVY }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(50% 40% at 85% 10%, hsl(166 58% 62% / 0.12), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <Eyebrow onDark>The Care Study Support Programme</Eyebrow>
          <SectionTitle onDark>
            You bring your patient and your materials. We bring the academic method.
          </SectionTitle>
          <p className="mt-5 text-base leading-relaxed text-[hsl(43_30%_94%/0.75)]">
            Five steps, one programme — from your first patient contact to the day you defend. You
            only ever see your dashboard; the production happens behind the scenes.
          </p>
        </div>

        {/* Status line */}
        <div className="mt-10 flex flex-wrap items-center gap-2 text-xs font-medium text-[hsl(43_30%_94%/0.7)]">
          <span className="font-mono uppercase tracking-[0.14em] text-[hsl(43_30%_94%/0.45)]">
            Your dashboard:
          </span>
          {["Submitted", "In production", "Ready for download"].map((label, index) => (
            <span key={label} className="flex items-center gap-2">
              {index > 0 && (
                <span className="h-px w-4 bg-[hsl(43_30%_94%/0.25)]" aria-hidden />
              )}
              <Badge
                variant="outline"
                className={
                  index === 0
                    ? "border-[hsl(166_58%_62%/0.4)] bg-[hsl(166_58%_62%/0.12)] text-[hsl(166_58%_68%)]"
                    : "border-[hsl(43_30%_94%/0.2)] bg-transparent text-[hsl(43_30%_94%/0.55)]"
                }
              >
                {label}
              </Badge>
            </span>
          ))}
        </div>

        <ol className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 lg:grid-cols-5">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-[hsl(43_30%_94%/0.12)] p-4 sm:p-5 lg:p-6"
              style={{ background: NAVY_SOFT }}
            >
              <div className="flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-lg bg-[hsl(166_58%_62%/0.14)] sm:size-10">
                  <step.icon className="size-4.5 text-[hsl(166_58%_62%)] sm:size-5" />
                </span>
                <span className="font-serif text-2xl font-semibold text-[hsl(45_85%_60%/0.5)] sm:text-3xl">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-3 font-serif text-sm font-semibold leading-snug text-[hsl(43_30%_94%)] sm:mt-4 sm:text-base lg:mt-5">
                {step.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[hsl(43_30%_94%/0.68)] sm:mt-2 sm:text-[13px]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What you get — features + a hand-built dashboard preview
// ---------------------------------------------------------------------------

function DashboardPreview() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[hsl(43_30%_94%/0.12)] p-5"
      style={{ background: NAVY_SOFT }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium text-[hsl(43_30%_94%/0.8)]">
          <span className="grid size-6 place-items-center rounded-md bg-[hsl(166_58%_62%/0.16)]">
            <HeartPulse className="size-3.5 text-[hsl(166_58%_62%)]" />
          </span>
          carestudy · student dashboard
        </span>
        <Badge className="border-[hsl(166_58%_62%/0.4)] bg-[hsl(166_58%_62%/0.14)] text-[hsl(166_58%_68%)]">
          In production
        </Badge>
      </div>

      {/* Mini order card */}
      <div className="rounded-xl border border-[hsl(43_30%_94%/0.1)] bg-[hsl(200_40%_16%)] p-4">
        <p className="font-serif text-sm font-semibold text-[hsl(43_30%_94%)]">
          Patient/Family Care Study — Pulmonary Tuberculosis
        </p>
        <p className="mt-1 text-[11px] text-[hsl(43_30%_94%/0.55)]">
          RGN · Korle-Bu NTC · 5 documents attached
        </p>
        {/* Stepper */}
        <div className="mt-4 flex items-center">
          {["Submitted", "In production", "Ready"].map((label, index) => (
            <span key={label} className="flex items-center">
              {index > 0 && (
                <span className="h-px w-6 sm:w-10 bg-[hsl(43_30%_94%/0.2)]" aria-hidden />
              )}
              <span className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[9px] font-semibold",
                    index === 0 &&
                      "bg-[hsl(166_58%_62%)] text-[hsl(200_40%_12%)]",
                    index === 1 &&
                      "border border-[hsl(166_58%_62%)] bg-[hsl(166_58%_62%/0.14)] text-[hsl(166_58%_68%)]",
                    index === 2 &&
                      "border border-[hsl(43_30%_94%/0.2)] text-[hsl(43_30%_94%/0.4)]",
                  )}
                >
                  {index === 0 ? <CheckCircle2 className="size-3.5" /> : index + 1}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-[hsl(43_30%_94%/0.5)]">
                  {label}
                </span>
              </span>
            </span>
          ))}
        </div>
        {/* Note */}
        <div className="mt-4 rounded-lg border border-[hsl(43_30%_94%/0.08)] bg-[hsl(200_34%_13%)] px-3 py-2 text-[11px] leading-relaxed text-[hsl(43_30%_94%/0.65)]">
          <span className="font-semibold text-[hsl(43_30%_94%/0.85)]">Note from our team: </span>
          Chapter two — patient particulars — drafted from your notes and cited to your sources.
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[hsl(166_58%_62%/0.3)] bg-[hsl(166_58%_62%/0.08)] px-4 py-3">
        <span className="text-xs font-medium text-[hsl(166_58%_68%)]">
          Your completed study will appear here for download.
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(166_58%_62%)] px-3 py-1.5 text-[11px] font-semibold text-[hsl(200_40%_12%)]">
          <Download className="size-3.5" /> Download
        </span>
      </div>
    </div>
  );
}

function WhatYouGet() {
  const outcomes = [
    "Your own student dashboard — place orders, upload materials, track progress, download finished work",
    "A complete care study — front matter to bibliography",
    "Real in-text citations and a generated reference list",
    "Verified references — gaps and inconsistencies flagged, not hidden",
    "A Word document in professional academic formatting, ready for submission",
    "The Viva Preparation Programme — mock defense, question bank, and drills",
  ];

  return (
    <section id="what-you-get" className="scroll-mt-20 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 sm:px-6 sm:gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Eyebrow>What you receive</Eyebrow>
          <SectionTitle>A study that is complete, cited, and ready for your supervisors.</SectionTitle>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base">
            From the moment you place your order to the day of your defense, everything you need
            lives in one place — and the finished document meets the standard your college expects
            to receive.
          </p>
          <ul className="mt-5 space-y-3 sm:mt-7 sm:space-y-3.5">
            {outcomes.map((outcome) => (
              <li key={outcome} className="flex items-start gap-2.5 sm:gap-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary sm:size-5" />
                <span className="text-xs leading-relaxed text-foreground sm:text-sm">{outcome}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 sm:mt-8">
            <Link href="/student/register" className={cn(buttonVariants(), 'w-full sm:w-auto justify-center')}>
              Start your care study <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        <div className="order-first lg:order-last">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Standards / integrity — the anti-"hand you a document and vanish" section
// ---------------------------------------------------------------------------

function Integrity() {
  return (
    <section id="integrity" className="border-y border-border/60 bg-background py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <Quote className="mx-auto size-7 text-primary/60 sm:size-8" />
          <h2 className="hero-title mt-3 text-xl font-semibold leading-tight sm:mt-4 sm:text-3xl lg:text-4xl">
            Prepared from your materials.{" "}
            <span className="text-primary">Defended by you, with confidence.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:mt-6 sm:text-base">
            Your study is built from <em>your</em> clinical data and <em>your</em> college's
            guidelines — never a generic template, never an invented patient. And because you must
            still stand before your supervisors, every study is paired with the Viva Preparation
            Programme, so you know your study well enough to answer for it.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:text-base">
            A solid study and a prepared student — that is the difference between professional
            support and a shortcut. Other services hand you a document and vanish; we stay with you
            through the defense.
          </p>
        </div>

        <div className="mx-auto mt-8 grid max-w-4xl gap-4 sm:mt-12 sm:grid-cols-3">
          {[
            {
              icon: FileText,
              title: "No invented patients",
              body: "If your notes don't cover a section, we tell you — we never fabricate a patient to fill a page.",
            },
            {
              icon: CheckCircle2,
              title: "Citations you can trace",
              body: "Every claim carries a real citation from your sources, and references are verified for gaps.",
            },
            {
              icon: ShieldCheck,
              title: "We stay through the viva",
              body: "Delivery is not the end of the programme — defense preparation is.",
            },
          ].map((item) => (
            <Card key={item.title} className="border-border/80 p-6 text-left">
              <span className="mb-4 grid size-10 place-items-center rounded-lg bg-primary/10">
                <item.icon className="size-5 text-primary" />
              </span>
              <h3 className="font-serif text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// For institutions
// ---------------------------------------------------------------------------

function Institutions() {
  return (
    <section id="institutions" className="py-14 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          className="flex flex-col gap-5 rounded-2xl border border-[hsl(43_30%_94%/0.12)] p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 sm:py-10"
          style={{ background: NAVY }}
        >
          <div className="max-w-2xl">
            <Eyebrow onDark>For nursing colleges</Eyebrow>
            <h2 className="hero-title text-lg font-semibold leading-tight text-[hsl(43_30%_94%)] sm:text-2xl lg:text-3xl">
              Structured care-study support, aligned with your guidelines.
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[hsl(43_30%_94%/0.72)] sm:mt-3 sm:text-sm">
              Give your final-year students a professional support pathway for the Patient/Family
              Care Study — built around your college's own format and expectations. Talk to us
              about institutional access.
            </p>
          </div>
          <Button asChild size="lg" className="w-full shrink-0 sm:w-auto">
            <a href="mailto:hello@carestudy.example?subject=Institutional%20access">
              Talk to us <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How to start
// ---------------------------------------------------------------------------

function HowToStart() {
  const flow = [
    { title: "Create your account", body: "A private dashboard, in under a minute." },
    { title: "Place your order", body: "Pay per project, with your materials attached." },
    { title: "Track it in your dashboard", body: "Submitted → in production → ready." },
    { title: "Receive your study", body: "Then prepare for the viva — your choice to add." },
  ];

  return (
    <section id="start" className="border-t border-border/60 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <Eyebrow>How to start</Eyebrow>
          <SectionTitle>The order flow is the whole story.</SectionTitle>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base">
            Students order per project, paying when they place the order with their materials. The
            Viva Preparation Programme is part of the programme — bundled with your study or
            booked per session.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
          {flow.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-border/80 bg-background p-4 sm:p-5 lg:p-6">
              <span className="font-serif text-2xl font-semibold text-primary/50 sm:text-3xl">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-serif text-sm font-semibold sm:mt-3 sm:text-base">{step.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:mt-1.5 sm:text-sm">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center">
          <Link href="/student/register" className={cn(buttonVariants({ size: 'lg' }), 'w-full sm:w-auto justify-center')}>
            Create your account &amp; place your order <ArrowRight className="size-4" />
          </Link>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <a href="mailto:hello@carestudy.example?subject=Free%20consultation">
              Book a free consultation
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

function Faq() {
  const items = [
    {
      question: "How is my study prepared?",
      answer:
        "Your study is prepared by our academic team, supported by drafting technology, from the materials you provide — your clinical notes, your patient data, and your college's guidelines. Nothing is ever invented, and your materials stay yours.",
    },
    {
      question: "Do I need to see your production studio?",
      answer:
        "No. Your dashboard is the only interface you need: place your order, upload your materials, watch the status, and download your finished study.",
    },
    {
      question: "What is the Viva Preparation Programme?",
      answer:
        "A mock defense with your study as the script, a question bank built from the chapters and care plan, and guided drills on the questions panels most often ask — so the study is yours to defend, not just yours to submit.",
    },
    {
      question: "Which chapters does the programme cover?",
      answer:
        "All of them — from the front matter and patient particulars, through history taking, physical examination, investigations, the nursing care plan, implementation and evaluation, to the bibliography.",
    },
    {
      question: "Can it match my school's format?",
      answer:
        "Yes. Upload your college's care-study guidelines or template with your order, and the structure adapts to it — headings, tables, and citation style included.",
    },
    {
      question: "Is this allowed by my college?",
      answer:
        "We recommend checking your college's specific policy, as with any academic support service. What we guarantee is a study built from your own materials — and a student prepared to defend it.",
    },
    {
      question: "What about data privacy?",
      answer:
        "Your patient data is anonymized per professional standards. Your materials are used only to prepare your study, stored privately, and delivered only to you — never shared.",
    },
  ];

  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60 py-14 sm:py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <Eyebrow>Questions</Eyebrow>
          <SectionTitle>Straight answers, before you start.</SectionTitle>
        </div>
        <Accordion type="single" collapsible className="mt-8 sm:mt-10">
          {items.map((item, index) => (
            <AccordionItem key={item.question} value={`faq-${index}`}>
              <AccordionTrigger className="text-left font-medium">{item.question}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-[hsl(43_30%_94%/0.1)]" style={{ background: NAVY }}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-8 sm:grid-cols-2 sm:gap-10 md:grid-cols-4">
          <div className="sm:col-span-2">
            <BrandMark onDark />
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-[hsl(43_30%_94%/0.65)] sm:mt-4 sm:text-sm">
              A nursing academic support agency. Our hallmark is the Care Study Support Programme —
              preparing the study, and preparing you to defend it.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(43_30%_94%/0.45)]">
              The programme
            </p>
            <ul className="mt-2.5 space-y-1.5 text-xs text-[hsl(43_30%_94%/0.75)] sm:mt-3 sm:space-y-2 sm:text-sm">
              <li>
                <a href="#about" className="transition-colors hover:text-[hsl(43_30%_94%)]">
                  About the agency
                </a>
              </li>
              <li>
                <a href="#programme" className="transition-colors hover:text-[hsl(43_30%_94%)]">
                  Study Preparation
                </a>
              </li>
              <li>
                <a href="#programme" className="transition-colors hover:text-[hsl(43_30%_94%)]">
                  Viva Preparation
                </a>
              </li>
              <li>
                <a href="#standards" className="transition-colors hover:text-[hsl(43_30%_94%)]">
                  Our standards
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[hsl(43_30%_94%/0.45)]">
              For students
            </p>
            <ul className="mt-2.5 space-y-1.5 text-xs text-[hsl(43_30%_94%/0.75)] sm:mt-3 sm:space-y-2 sm:text-sm">
              <li>
                <Link href="/student/register" className="transition-colors hover:text-[hsl(43_30%_94%)]">
                  Create an account
                </Link>
              </li>
              <li>
                <Link href="/login" className="transition-colors hover:text-[hsl(43_30%_94%)]">
                  Sign in
                </Link>
              </li>
              <li>
                <a
                  href="mailto:hello@carestudy.example"
                  className="flex items-center gap-2 transition-colors hover:text-[hsl(43_30%_94%)]"
                >
                  <Mail className="size-3.5" /> hello@carestudy.example
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-[hsl(43_30%_94%/0.1)] pt-5 sm:mt-12 sm:flex-row sm:items-center sm:gap-4 sm:pt-6">
          <p className="text-[11px] leading-relaxed text-[hsl(43_30%_94%/0.5)] sm:text-xs">
            carestudy supports nursing education — preparing the study, and preparing you to defend
            it.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(43_30%_94%/0.35)] transition-colors hover:text-[hsl(43_30%_94%/0.7)]"
            >
              Sign in
            </Link>
            <Link
              href="/studio"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(43_30%_94%/0.35)] transition-colors hover:text-[hsl(43_30%_94%/0.7)]"
            >
              Agency studio
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <Hero />
        <Stakes />
        <About />
        <Programme />
        <WhatYouGet />
        <Integrity />
        <Institutions />
        <HowToStart />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
