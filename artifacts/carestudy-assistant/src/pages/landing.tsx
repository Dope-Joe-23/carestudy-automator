import { motion } from "framer-motion";
import { useEffect } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { Link } from "wouter";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const products = [
  {
    name: "CareStudy",
    label: "Academic support",
    description:
      "Thoughtful support for the patient and family care study—from getting your work organised to feeling ready for your viva.",
    href: "/student/register",
    action: "Explore CareStudy",
    icon: BookOpen,
    color: "mint",
    points: ["Care-study guidance", "Research and references", "Viva preparation"],
  },
  {
    name: "NurseSpin",
    label: "Learn in the in-between",
    description:
      "Short, focused nursing questions and clear explanations that make a few spare minutes count.",
    href: "/nursespin",
    action: "Try NurseSpin",
    icon: Sparkles,
    color: "peach",
    points: ["Quick practice rounds", "Grounded explanations", "Made for your phone"],
  },
];

const principles = [
  {
    icon: Stethoscope,
    title: "Made for nursing",
    body: "Practical learning support shaped around the real demands of nursing education and practice.",
  },
  {
    icon: ShieldCheck,
    title: "Carefully considered",
    body: "Clear boundaries, cited learning sources and respect for professional standards.",
  },
  {
    icon: HeartPulse,
    title: "Here as you grow",
    body: "A supportive partner from student life into the next stages of your nursing journey.",
  },
];

function Brand() {
  return (
    <Link href="/nurseaid" className="group inline-flex items-center gap-2.5" aria-label="NurseAid home">
      <span className="grid size-10 place-items-center rounded-2xl bg-[#b8f1df] text-[#10382f] transition-transform duration-300 group-hover:rotate-[-8deg]">
        <HeartPulse className="size-5" />
      </span>
      <span className="font-sans text-[19px] font-bold tracking-[-0.06em] text-[#142d29]">
        Nurse<span className="text-[#16846c]">Aid</span>
      </span>
    </Link>
  );
}

function HeroPhone() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: 2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      className="relative mx-auto w-full max-w-[300px] sm:max-w-[340px]"
      aria-label="NurseSpin mobile practice preview"
    >
      <div className="absolute -inset-6 rounded-[3rem] bg-[#9de6d0]/35 blur-3xl" />
      <div className="relative rounded-[2.7rem] border border-white/70 bg-[#102c28] p-2.5 shadow-[0_36px_100px_-36px_rgba(14,58,48,0.55)]">
        <div className="relative flex min-h-[470px] flex-col overflow-hidden rounded-[2.15rem] bg-[radial-gradient(ellipse_at_75%_12%,#76c7ab_0%,transparent_32%),linear-gradient(155deg,#356b5d,#102b2b_62%,#0c1c23)] p-4 text-white sm:min-h-[510px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-7 place-items-center rounded-lg bg-[#b8f1df] text-[#10382f]">
                <HeartPulse className="size-4" />
              </span>
              NurseSpin
            </div>
            <span className="rounded-full border border-white/20 bg-black/10 px-2.5 py-1 text-[10px] text-white/80">
              QUICK PRACTICE
            </span>
          </div>

          <div className="mt-auto">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c5f5e5]">
              Medication safety
            </p>
            <h2 className="mt-2 max-w-[250px] font-serif text-[27px] leading-[1.08] tracking-[-0.04em] sm:text-3xl">
              Two pairs of eyes for insulin
            </h2>
            <div className="mt-4 rounded-2xl border border-white/15 bg-[#081b1b]/80 p-3.5 backdrop-blur">
              <p className="text-[13px] font-medium leading-snug text-white/95">
                Before giving insulin, which check helps keep the patient safe?
              </p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-[#b8f1df]/70 bg-[#b8f1df]/10 px-3 py-2 text-[11px] leading-snug text-white">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#b8f1df] text-[10px] font-bold text-[#10382f]">
                    <Check className="size-3" />
                  </span>
                  Complete the independent double-check
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/70">
                  Skip the check if you know the patient
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-[10px] text-white/65">
              <span>One useful idea at a time.</span>
              <span className="flex gap-1" aria-hidden="true">
                <i className="size-1.5 rounded-full bg-[#b8f1df]" />
                <i className="size-1.5 rounded-full bg-white/30" />
                <i className="size-1.5 rounded-full bg-white/30" />
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -left-7 top-[30%] hidden -rotate-6 rounded-2xl border border-white/80 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-[#28554a] shadow-xl sm:block">
        Little moments. Stronger practice.
      </div>
    </motion.div>
  );
}

function ProductCard({
  product,
  index,
}: {
  product: (typeof products)[number];
  index: number;
}) {
  const Icon = product.icon;
  const isMint = product.color === "mint";

  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className={cn(
        "group flex min-h-[370px] flex-col overflow-hidden rounded-[2rem] border p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-8",
        isMint
          ? "border-[#d6eae2] bg-[#eaf6f0] hover:shadow-[#84b8a6]/20"
          : "border-[#f3dfd1] bg-[#fff1e8] hover:shadow-[#d9aa8a]/20",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={cn(
            "grid size-12 place-items-center rounded-2xl",
            isMint ? "bg-[#c6ecdc] text-[#176b58]" : "bg-[#f8d8c4] text-[#a45532]",
          )}
        >
          <Icon className="size-6" />
        </span>
        <span className="rounded-full bg-white/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#587169]">
          {product.label}
        </span>
      </div>
      <div className="mt-8">
        <h3 className="font-serif text-4xl font-semibold tracking-[-0.055em] text-[#18362f]">
          {product.name}
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[#536a62] sm:text-base">
          {product.description}
        </p>
      </div>
      <ul className="mt-6 grid gap-2.5">
        {product.points.map((point) => (
          <li key={point} className="flex items-center gap-2 text-sm text-[#34564b]">
            <Check className="size-4 shrink-0" />
            {point}
          </li>
        ))}
      </ul>
      <Link
        href={product.href}
        className={cn(
          "mt-auto inline-flex w-fit items-center gap-2 pt-8 text-sm font-semibold transition-all group-hover:gap-3",
          isMint ? "text-[#12634f]" : "text-[#8e462a]",
        )}
      >
        {product.action}
        <ArrowRight className="size-4" />
      </Link>
    </motion.article>
  );
}

export function LandingPage() {
  useEffect(() => {
    document.title = "NurseAid | Professional Nursing Support";
  }, []);

  return (
    <div className="min-h-screen overflow-hidden bg-[#f8faf6] text-[#1a302a]">
      <header className="sticky top-0 z-40 border-b border-[#dbe7df]/80 bg-[#f8faf6]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-7">
          <Brand />
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#61746c] md:flex">
            <a className="transition-colors hover:text-[#173f34]" href="#products">Our products</a>
            <a className="transition-colors hover:text-[#173f34]" href="#approach">Our approach</a>
            <a className="transition-colors hover:text-[#173f34]" href="#about">About NurseAid</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="hidden px-2 py-2 text-sm font-medium text-[#536a62] transition-colors hover:text-[#173f34] sm:inline-flex">
              Sign in
            </Link>
            <Link
              href="/student/register"
              className="inline-flex items-center gap-2 rounded-full bg-[#183e33] px-4 py-2.5 text-xs font-semibold text-white transition-all hover:bg-[#235d4b] sm:px-5 sm:text-sm"
            >
              Get started <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(ellipse at 72% 28%, rgba(174, 225, 205, .5), transparent 36%), radial-gradient(ellipse at 10% 90%, rgba(249, 217, 194, .42), transparent 34%)",
            }}
          />
          <div className="mx-auto grid min-h-[680px] max-w-7xl items-center gap-10 px-4 pb-16 pt-14 sm:px-7 sm:pb-20 sm:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:gap-4 lg:py-16">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d5e7dd] bg-white/75 px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3c6b5b] shadow-sm sm:text-xs">
                <span className="size-2 rounded-full bg-[#50a78a]" />
                Nursing support, made human
              </div>
              <h1 className="mt-6 max-w-3xl font-serif text-[3.2rem] font-medium leading-[0.98] tracking-[-0.07em] text-[#17382f] sm:text-6xl lg:text-[5.15rem]">
                Be the nurse
                <span className="mt-1 block text-[#438d72]">you’re working to become.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#5d7068] sm:mt-7 sm:text-lg">
                NurseAid offers professional learning support for student nurses—and helpful,
                practical refreshers for clinicians. Thoughtful tools for the work and the people
                behind it.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href="#products"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#183e33] px-6 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#235d4b]"
                >
                  Find your support <ArrowRight className="size-4" />
                </a>
                <Link
                  href="/nursespin"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-[#376b59] transition-colors hover:bg-white/70"
                >
                  Try a NurseSpin question <ArrowDown className="size-4" />
                </Link>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#6a7b73]">
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-[#31846a]" /> Built around nursing</span>
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-[#31846a]" /> Designed to keep learning moving</span>
              </div>
            </motion.div>
            <HeroPhone />
          </div>
          <div className="mx-auto max-w-7xl px-4 pb-7 sm:px-7">
            <a href="#products" className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#829087] transition-colors hover:text-[#376b59]">
              Get to know NurseAid <span className="h-px w-8 bg-current transition-all group-hover:w-12" />
            </a>
          </div>
        </section>

        <section id="products" className="scroll-mt-24 border-y border-[#e3eae3] bg-white/65 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-7">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#438d72]">Two ways to move forward</p>
              <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.055em] text-[#17382f] sm:text-5xl">
                Support for your next step.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#66776f] sm:text-base">
                Start with the kind of support you need today. We’re building more for the nursing
                community, with care and purpose.
              </p>
            </div>
            <div className="mt-9 grid gap-4 md:mt-12 md:grid-cols-2 md:gap-5">
              {products.map((product, index) => (
                <ProductCard key={product.name} product={product} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section id="approach" className="scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-7 lg:grid-cols-[.85fr_1.15fr] lg:items-end lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#438d72]">The NurseAid approach</p>
              <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.055em] text-[#17382f] sm:text-5xl">
                Practical support. A little more confidence.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-[#66776f] sm:text-base">
                Nursing is demanding. The right support should make the next step feel clearer—not
                add another complicated thing to manage.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {principles.map((principle, index) => {
                const Icon = principle.icon;
                return (
                  <motion.article
                    key={principle.title}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.25 }}
                    transition={{ duration: 0.45, delay: index * 0.08 }}
                    className="rounded-3xl border border-[#e0e9e1] bg-white p-5 sm:p-6"
                  >
                    <span className="grid size-10 place-items-center rounded-xl bg-[#eaf6f0] text-[#328168]">
                      <Icon className="size-5" />
                    </span>
                    <h3 className="mt-5 text-sm font-semibold text-[#25483c]">{principle.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-[#718078] sm:text-sm">{principle.body}</p>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 px-4 pb-16 sm:px-7 sm:pb-24">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#173d33] px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-16">
            <div aria-hidden className="pointer-events-none absolute -right-12 -top-24 size-80 rounded-full border-[1px] border-white/10" />
            <div aria-hidden className="pointer-events-none absolute -right-2 -top-14 size-60 rounded-full border-[1px] border-white/10" />
            <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b8f1df]">Growing with nursing</p>
                <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.055em] sm:text-5xl">
                  More useful support is on the way.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                  CareStudy and NurseSpin are the beginning. NurseAid is here to keep building
                  thoughtful learning and professional support for nurses at every stage.
                </p>
              </div>
              <Link
                href="/nursespin"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c4f2df] px-6 text-sm font-semibold text-[#163d32] transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                Explore NurseSpin <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e0e9e1] bg-white/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div>
            <Brand />
            <p className="mt-2 text-xs text-[#78877f]">Professional learning support for nursing.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#62746b]">
            <a href="#products" className="transition-colors hover:text-[#17382f]">CareStudy &amp; NurseSpin</a>
            <Link href="/student/register" className="transition-colors hover:text-[#17382f]">Get started</Link>
            <Link href="/login" className="transition-colors hover:text-[#17382f]">Sign in</Link>
          </div>
          <p className="text-[11px] text-[#89968f]">© {new Date().getFullYear()} NurseAid</p>
        </div>
      </footer>
    </div>
  );
}
