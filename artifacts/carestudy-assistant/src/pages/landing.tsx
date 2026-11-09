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
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

const products = [
  {
    name: "CareStudy",
    label: "Academic support",
    description:
      "Thoughtful support for the patient and family care study—from getting your work organised to feeling ready for your viva.",
    href: "/chat",
    action: "Open study workspace",
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
  {
    name: "NurseLearn",
    label: "Reviewed learning resources",
    description:
      "Explore reviewed condition guides and educational videos for nursing students, families, and the public.",
    href: "/learn",
    action: "Explore NurseLearn",
    icon: HeartPulse,
    color: "sky",
    points: ["Condition guides", "Educational videos", "Reviewed before sharing"],
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
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="Nursuit home">
      <BrandLogo className="size-20 transition-transform duration-300 group-hover:rotate-[-8deg]" />
      <span className="font-sans text-[22px] font-bold tracking-[-0.06em] text-[#142d29]">
        Nurs<span className="text-[#16846c]">uit</span>
      </span>
    </Link>
  );
}

function WorkspacePreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
      className="relative mx-auto w-full max-w-[610px]"
      aria-label="Preview of the Nursuit study workspace"
    >
      <div className="absolute -inset-6 rounded-[3rem] bg-[#9de6d0]/35 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_36px_100px_-36px_rgba(14,58,48,0.42)]">
        <div className="flex h-12 items-center gap-2 border-b border-[#e5eee8] bg-white px-4">
          <span className="size-2.5 rounded-full bg-[#f1b8a5]" />
          <span className="size-2.5 rounded-full bg-[#f1d58e]" />
          <span className="size-2.5 rounded-full bg-[#a9d9bd]" />
          <span className="ml-3 text-xs font-medium text-[#61746c]">Nursuit study workspace</span>
        </div>
        <div className="grid min-h-[430px] sm:grid-cols-[170px_1fr]">
          <aside className="hidden border-r border-[#e8eee9] bg-[#f6faf7] p-4 sm:block">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#25483c]"><span className="grid size-7 place-items-center rounded-lg bg-[#dff2e8] text-[#23745b]"><BookOpen className="size-4" /></span> My workspace</div>
            <div className="mt-8 text-[10px] font-semibold uppercase tracking-[.14em] text-[#829087]">Recent chats</div>
            <div className="mt-3 rounded-lg bg-white px-2.5 py-2 text-[11px] font-medium text-[#376b59] shadow-sm">Study planning</div>
            <div className="mt-1 rounded-lg px-2.5 py-2 text-[11px] text-[#718078]">Care-study outline</div>
            <div className="mt-1 rounded-lg px-2.5 py-2 text-[11px] text-[#718078]">Review my notes</div>
          </aside>
          <div className="flex min-w-0 flex-col bg-[radial-gradient(ellipse_at_85%_0%,rgba(180,231,207,.32),transparent_34%),#fff] p-5 sm:p-7">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.15em] text-[#438d72]"><Sparkles className="size-3.5" /> A quieter place to think</div>
            <h2 className="mt-3 font-serif text-2xl font-medium tracking-[-.04em] text-[#17382f] sm:text-3xl">What are you working on today?</h2>
            <p className="mt-2 text-xs leading-relaxed text-[#718078] sm:text-sm">Ask a nursing question, plan your study, or pick up where you left off.</p>
            <div className="mt-7 flex justify-end">
              <div className="max-w-[88%] rounded-2xl rounded-br-md bg-[#e8f5ee] px-4 py-3 text-xs leading-relaxed text-[#25483c] sm:text-sm">Help me plan a short revision session on infection prevention.</div>
            </div>
            <div className="mt-3 flex gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#173d33] text-[#c4f2df]"><HeartPulse className="size-4" /></span>
              <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-[#e6eee8] bg-white px-4 py-3 text-xs leading-relaxed text-[#536a62] shadow-sm sm:text-sm">
                Start with one topic, then connect it to your course notes. I can help you break it into manageable steps and check your understanding as you go.
                <div className="mt-3 flex items-center gap-1.5 border-t border-[#edf1ed] pt-2 text-[10px] text-[#829087]"><Check className="size-3 text-[#31846a]" /> Your conversation stays in your workspace</div>
              </div>
            </div>
            <div className="mt-auto pt-6">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[#dce9e0] bg-white px-4 py-3 shadow-sm">
                <span className="text-xs text-[#9aa69f]">Ask a question or share what you’re studying…</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#183e33] text-white"><ArrowRight className="size-4" /></span>
              </div>
              <p className="mt-2 text-center text-[10px] text-[#9aa69f]">Review learning support against your course materials.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -right-3 -top-4 hidden rotate-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 text-xs font-semibold text-[#28554a] shadow-xl sm:block">
        Pick up where you left off.
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
  const isSky = product.color === "sky";

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
          : isSky
            ? "border-[#d9e4ee] bg-[#f0f5fa] hover:shadow-[#92b4d2]/20"
            : "border-[#f3dfd1] bg-[#fff1e8] hover:shadow-[#d9aa8a]/20",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={cn(
            "grid size-12 place-items-center rounded-2xl",
            isMint ? "bg-[#c6ecdc] text-[#176b58]" : isSky ? "bg-[#dbe9f5] text-[#416b8e]" : "bg-[#f8d8c4] text-[#a45532]",
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
          isMint ? "text-[#12634f]" : isSky ? "text-[#416b8e]" : "text-[#8e462a]",
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
    document.title = "Nursuit | Nursing Study Workspace";
  }, []);

  return (
    <div className="min-h-screen overflow-hidden bg-[#f8faf6] text-[#1a302a]">
      <header className="sticky top-0 z-40 border-b border-[#dbe7df]/80 bg-[#f8faf6]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-4 sm:px-7">
          <Brand />
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#61746c] md:flex">
            <a className="transition-colors hover:text-[#173f34]" href="#products">Our products</a>
            <a className="transition-colors hover:text-[#173f34]" href="#approach">Our approach</a>
            <a className="transition-colors hover:text-[#173f34]" href="#about">About Nursuit</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/chat?auth=sign-in" className="hidden px-2 py-2 text-sm font-medium text-[#536a62] transition-colors hover:text-[#173f34] sm:inline-flex">
              Sign in
            </Link>
            <Link href="/staff/apply" className="hidden px-2 py-2 text-sm font-medium text-[#536a62] transition-colors hover:text-[#173f34] sm:inline-flex">Join our team</Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full bg-[#183e33] px-4 py-2.5 text-xs font-semibold text-white transition-all hover:bg-[#235d4b] sm:px-5 sm:text-sm"
            >
              Open workspace <ArrowUpRight className="size-4" />
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
                Your practical companion for nursing study
              </div>
              <h1 className="mt-6 max-w-3xl font-serif text-[3.2rem] font-medium leading-[0.98] tracking-[-0.07em] text-[#17382f] sm:text-6xl lg:text-[5.15rem]">
                A clearer way to
                <span className="mt-1 block text-[#438d72]">study nursing.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-[#5d7068] sm:mt-7 sm:text-lg">
                Ask nursing questions in a focused study workspace, organise care-study work, and
                practise with NurseSpin. Nursuit brings useful support together for student nurses
                and the clinicians who guide them.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/chat"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#183e33] px-6 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#235d4b]"
                >
                  Open your workspace <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#products"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-[#376b59] transition-colors hover:bg-white/70"
                >
                  Explore Nursuit <ArrowDown className="size-4" />
                </a>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#6a7b73]">
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-[#31846a]" /> Built around nursing</span>
                <span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-[#31846a]" /> Designed to keep learning moving</span>
              </div>
            </motion.div>
            <WorkspacePreview />
          </div>
          <div className="mx-auto max-w-7xl px-4 pb-7 sm:px-7">
            <a href="#products" className="group inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#829087] transition-colors hover:text-[#376b59]">
              Get to know Nursuit <span className="h-px w-8 bg-current transition-all group-hover:w-12" />
            </a>
          </div>
        </section>

        <section id="products" className="scroll-mt-24 border-y border-[#e3eae3] bg-white/65 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-7">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#438d72]">One home for nursing study</p>
              <h2 className="mt-3 font-serif text-4xl leading-tight tracking-[-0.055em] text-[#17382f] sm:text-5xl">
                Choose the support you need today.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#66776f] sm:text-base">
                Open your study workspace, practise with NurseSpin, or explore reviewed learning
                resources in NurseLearn.
              </p>
            </div>
            <div className="mt-9 grid gap-4 md:mt-12 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
              {products.map((product, index) => (
                <ProductCard key={product.name} product={product} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section id="approach" className="scroll-mt-24 py-16 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-7 lg:grid-cols-[.85fr_1.15fr] lg:items-end lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#438d72]">The Nursuit approach</p>
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
                  Nursing study has many moving parts. Start with one clear next step.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                  Use the workspace to think through a question or keep your care-study work moving.
                  When you need a change of pace, explore NurseSpin or NurseLearn.
                </p>
              </div>
              <div className="flex flex-col items-start gap-3">
                <Link
                  href="/chat"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#c4f2df] px-6 text-sm font-semibold text-[#163d32] transition-all hover:-translate-y-0.5 hover:bg-white"
                >
                  Open your workspace <ArrowUpRight className="size-4" />
                </Link>
                <Link href="/staff/apply" className="text-sm font-medium text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white">Interested in supporting nursing learners? Apply to join our team.</Link>
              </div>
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
            <a href="#products" className="transition-colors hover:text-[#17382f]">Workspace, NurseSpin &amp; NurseLearn</a>
            <Link href="/chat" className="transition-colors hover:text-[#17382f]">Open workspace</Link>
            <Link href="/chat?auth=sign-in" className="transition-colors hover:text-[#17382f]">Sign in</Link>
            <Link href="/staff/apply" className="transition-colors hover:text-[#17382f]">Apply to join our team</Link>
          </div>
          <p className="text-[11px] text-[#89968f]">© {new Date().getFullYear()} Nursuit</p>
        </div>
      </footer>
    </div>
  );
}
