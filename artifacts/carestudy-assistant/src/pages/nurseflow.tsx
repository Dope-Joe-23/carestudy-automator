import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, BadgeCheck, Banknote, BookOpen, Check, ChevronDown, CircleHelp,
  CreditCard, HeartPulse, Lock, Play, Search, Share2, Sparkles, Stethoscope,
  TimerReset, UserPlus, Volume2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getPaystackKey, payWithPaystack } from "@/lib/paystack";

type Question = {
  id: string;
  topic: string;
  level: "Foundation" | "NCLEX-style" | "NMC-aligned";
  title: string;
  scene: string;
  question: string;
  options: string[];
  answer: number;
  rationale: string;
  source: string;
  sourceUrl: string;
  learningPoint: string;
  /** This card's generated teaching visual, when one exists. */
  visual?: Visual | null;
};

/** A generated teaching visual: a still image or a rendered clip. */
type Visual = { url: string; mediaType: "image" | "video" };

type PublishedQuestion = {
  id: string; topic: string; level: Question["level"]; title: string; question: string;
  options: string[]; correctOptionIndex: number; rationale: string; sourceTitle: string;
  sourceUrl: string; learningObjective: string; visual?: Visual | null;
};

// Original questions, written from public clinical guidance. They are not
// reproduced NMC/NCLEX or institutional examination questions.
const QUESTIONS: Question[] = [
  {
    id: "oxygen", topic: "Fundamentals", level: "NCLEX-style", title: "Safe oxygen therapy",
    scene: "A monitored ward bay. The learner follows a nurse preparing low-flow oxygen.",
    question: "Before starting prescribed oxygen via nasal cannula, which assessment should the nurse prioritise?",
    options: ["Inspect the nasal passages and assess respiratory status", "Offer the patient a glass of water", "Place the patient flat in bed", "Measure the patient's height"],
    answer: 0,
    rationale: "Baseline respiratory assessment and checking the nares help the nurse select and apply oxygen safely, then evaluate the response to therapy.",
    source: "British Thoracic Society guideline for oxygen use in adults (2017)",
    sourceUrl: "https://www.brit-thoracic.org.uk/quality-improvement/guidelines/emergency-oxygen/",
    learningPoint: "Assess first, apply safely, then reassess the response.",
  },
  {
    id: "sepsis", topic: "Acute care", level: "NMC-aligned", title: "Recognising deterioration",
    scene: "A nurse notices a patient who is newly confused, febrile and breathing faster than earlier.",
    question: "Which action is most appropriate when a patient shows signs of possible sepsis and clinical deterioration?",
    options: ["Escalate urgently using the local deterioration pathway", "Wait until the next routine observations", "Give oral fluids and review tomorrow", "Document it only after the shift ends"],
    answer: 0,
    rationale: "New confusion, fever and increased respiratory rate require timely assessment and escalation. Follow the local sepsis and deterioration policy.",
    source: "NICE guideline NG51: Sepsis: recognition, diagnosis and early management",
    sourceUrl: "https://www.nice.org.uk/guidance/ng51",
    learningPoint: "A changing patient needs timely escalation—not watchful waiting.",
  },
  {
    id: "hand-hygiene", topic: "Infection prevention", level: "Foundation", title: "Clean hands, safer care",
    scene: "A close-up teaching visual shows a nurse moving from a patient’s bedside to an aseptic task.",
    question: "When should hand hygiene be performed during preparation for an aseptic procedure?",
    options: ["Immediately before the aseptic task", "Only after the procedure", "At the end of the shift", "Only if hands look visibly soiled"],
    answer: 0,
    rationale: "Hand hygiene immediately before an aseptic task reduces the risk of introducing microorganisms to a vulnerable site.",
    source: "WHO: My 5 Moments for Hand Hygiene",
    sourceUrl: "https://www.who.int/publications/m/item/my-5-moments-for-hand-hygiene",
    learningPoint: "Know the moment: before touching the patient and before an aseptic task.",
  },
  {
    id: "medication", topic: "Medication safety", level: "NCLEX-style", title: "Pause before administration",
    scene: "A simulated medication round focuses on the final checks at the bedside.",
    question: "A medication label does not match the electronic prescription. What should the nurse do first?",
    options: ["Stop and clarify the discrepancy before administration", "Administer the labelled dose to avoid delay", "Ask the patient which dose they usually take", "Document the dose as given"],
    answer: 0,
    rationale: "Do not administer when there is a discrepancy. Pause, verify the order and follow local medicines-management procedures.",
    source: "NMC: Standards for medicines management",
    sourceUrl: "https://www.nmc.org.uk/standards/standards-for-post-registration/standards-for-medicines-management/",
    learningPoint: "A mismatch is a stop signal—clarify before giving medicine.",
  },
];

/** Preferred tab order for the shipped demo set; topics the approved feed
 *  introduces are appended after these, in the order they appear in the feed. */
const CURATED_TOPIC_ORDER = ["Fundamentals", "Acute care", "Medication safety", "Infection prevention"];
const TRIAL_LIMIT = 10;

export function NurseFlowPage() {
  const [topic, setTopic] = useState("For you");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [trialUsed, setTrialUsed] = useState(0);
  const [hasAccess, setHasAccess] = useState(true);
  const [accessReady, setAccessReady] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [paymentEmail, setPaymentEmail] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paused, setPaused] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [publishedQuestions, setPublishedQuestions] = useState<Question[]>([]);
  const clipRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    fetch("/api/nurseflow/access", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: { access?: { attemptsUsed: number; hasAccess: boolean } } | null) => {
        if (!data?.access) return;
        setTrialUsed(data.access.attemptsUsed);
        setHasAccess(data.access.hasAccess);
      })
      .catch(() => undefined)
      .finally(() => setAccessReady(true));
  }, []);

  // The curated API feed replaces the local demonstration set as soon as an
  // educator has approved content in the Question Bank. The fallback keeps the
  // visitor experience working before the first batch is published.
  useEffect(() => {
    fetch("/api/nurseflow/feed")
      .then((response) => response.ok ? response.json() : null)
      .then((data: { questions?: PublishedQuestion[] } | null) => {
        if (!data?.questions?.length) return;
        setPublishedQuestions(data.questions.map((item) => ({
          id: item.id, topic: item.topic, level: item.level, title: item.title,
          scene: "A reviewed NurseFlow learning visual is being prepared for this card.",
          question: item.question, options: item.options, answer: item.correctOptionIndex,
          rationale: item.rationale, source: item.sourceTitle, sourceUrl: item.sourceUrl,
          learningPoint: item.learningObjective, visual: item.visual ?? null,
        })));
      })
      .catch(() => undefined);
  }, []);

  // The deck being practised: approved cards when the bank has any, otherwise
  // the shipped demonstration set.
  const available = useMemo(
    () => (publishedQuestions.length ? publishedQuestions : QUESTIONS),
    [publishedQuestions],
  );

  // Tabs are derived from the cards themselves rather than a fixed list, so a
  // newly approved topic is reachable immediately and a topic with nothing in
  // it never gets a dead tab.
  const topics = useMemo(() => {
    const present = new Set(available.map((question) => question.topic).filter(Boolean));
    const ordered = CURATED_TOPIC_ORDER.filter((name) => present.has(name));
    for (const name of present) if (!ordered.includes(name)) ordered.push(name);
    return ["For you", ...ordered];
  }, [available]);

  // The selected topic can disappear when the approved feed replaces the demo
  // set, so resolve it during render and fall back to the catch-all instead of
  // rendering a deck with no cards in it.
  const activeTopic = topics.includes(topic) ? topic : "For you";
  const feed = useMemo(
    () =>
      activeTopic === "For you"
        ? available
        : available.filter((question) => question.topic === activeTopic),
    [activeTopic, available],
  );
  const question = feed[index % feed.length];
  const trialLeft = Math.max(0, TRIAL_LIMIT - trialUsed);
  const locked = accessReady && !hasAccess;

  // The play/pause control drives a real <video> when the card has a clip, and
  // holds the still's drift animation otherwise (that part is pure CSS), so a
  // card behaves the same whether its visual was generated or not.
  useEffect(() => {
    const video = clipRef.current;
    if (!video) return;
    if (paused) video.pause();
    else void video.play().catch(() => undefined);
  }, [paused, question.id, question.visual?.url]);

  async function choose(option: number) {
    if (selected !== null || locked || answering) return;
    setAnswering(true);
    try {
      const response = await fetch("/api/nurseflow/attempts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, correct: option === question.answer }),
      });
      const data = await response.json().catch(() => null) as { access?: { attemptsUsed: number; hasAccess: boolean } } | null;
      if (!response.ok || !data?.access) {
        if (data?.access) { setTrialUsed(data.access.attemptsUsed); setHasAccess(data.access.hasAccess); }
        return;
      }
      setTrialUsed(data.access.attemptsUsed);
      setHasAccess(data.access.hasAccess);
    } catch {
      return;
    } finally {
      setAnswering(false);
    }
    setSelected(option);
    window.setTimeout(() => {
      setSelected(null);
      setIndex((current) => current + 1);
    }, 1800);
  }

  function selectTopic(next: string) {
    setTopic(next); setIndex(0); setSelected(null);
  }

  async function startCheckout() {
    setPaymentError(""); setPaymentBusy(true);
    try {
      const initialized = await fetch("/api/nurseflow/payments/initialize", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: paymentEmail }) });
      const payment = await initialized.json() as { error?: string; reference?: string; amount?: number; email?: string; authorizationUrl?: string };
      if (!initialized.ok || !payment.reference || !payment.amount || !payment.email) throw new Error(payment.error || "Unable to start checkout.");
      const key = getPaystackKey();
      if (!key) { if (payment.authorizationUrl) { window.location.assign(payment.authorizationUrl); return; } throw new Error("Checkout is not configured."); }
      await payWithPaystack({ key, reference: payment.reference, amount: payment.amount, email: payment.email, currency: "GHS", label: "NurseFlow Plus" });
      const verified = await fetch("/api/nurseflow/payments/verify", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: payment.reference }) });
      const result = await verified.json() as { error?: string; access?: { attemptsUsed: number; hasAccess: boolean } };
      if (!verified.ok || !result.access) throw new Error(result.error || "Your payment is still being confirmed.");
      setTrialUsed(result.access.attemptsUsed); setHasAccess(result.access.hasAccess); setUpgradeOpen(false);
    } catch (error) { setPaymentError(error instanceof Error ? error.message : "Checkout could not be completed."); }
    finally { setPaymentBusy(false); }
  }

  return (
    <main className="min-h-screen bg-[#071c23] text-white selection:bg-teal-300 selection:text-slate-950">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-[#071c23]/90 px-4 py-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/carestudy" className="hidden items-center gap-2 text-sm text-white/70 hover:text-white sm:flex"><ArrowLeft className="size-4" /> About CareStudy</Link>
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-teal-300 text-[#071c23]"><HeartPulse className="size-5" /></span><span className="font-serif text-xl tracking-tight">NurseFlow</span></div>
          <div className="flex items-center gap-2"><Link href="/student/register" className="flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10"><UserPlus className="size-3.5" /><span className="sm:hidden">Join</span><span className="hidden sm:inline">Create account</span></Link><button onClick={() => setUpgradeOpen(true)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#071c23] hover:bg-teal-100">{locked ? "Unlock" : trialLeft === 0 ? "Plus active" : `${trialLeft} free left`}</button></div>
        </div>
      </header>

      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-0 px-0 pb-0 pt-[68px] sm:gap-5 sm:px-4 sm:pb-8 sm:pt-24 lg:grid-cols-[180px_minmax(0,600px)_220px] lg:px-8">
        <aside className="hidden pt-6 lg:block"><p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[.18em] text-teal-200/60">Study stream</p>{topics.map((item) => <button key={item} onClick={() => selectTopic(item)} className={cn("mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition", activeTopic === item ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white")}><BookOpen className="size-4" />{item}</button>)}<div className="mt-8 rounded-2xl border border-teal-300/20 bg-teal-300/10 p-4"><p className="text-xs font-semibold text-teal-100">Built for practice</p><p className="mt-1 text-xs leading-relaxed text-white/60">Short, original questions grounded in cited clinical guidance.</p></div></aside>

        <section className="mx-auto w-full max-w-[600px]">
          <div className="absolute left-0 right-0 top-[68px] z-20 flex gap-2 overflow-x-auto bg-[#071c23]/70 px-4 py-2 backdrop-blur-md sm:static sm:mb-3 sm:bg-transparent sm:px-0 sm:py-0 lg:hidden">{topics.map((item) => <button key={item} onClick={() => selectTopic(item)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs", activeTopic === item ? "bg-teal-300 font-bold text-[#071c23]" : "bg-white/10 text-white/70")}>{item}</button>)}</div>
          <article className="relative isolate min-h-[calc(100svh-68px)] overflow-hidden bg-[#0b3038] shadow-2xl shadow-black/30 sm:min-h-[680px] sm:rounded-[2rem] sm:border sm:border-white/10 md:min-h-[730px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(79,219,200,.45),transparent_19%),radial-gradient(circle_at_20%_80%,rgba(32,111,133,.8),transparent_30%),linear-gradient(160deg,#0d4650,#092630_48%,#06181f)]" />
            {question.visual ? (
              <>
                {/*
                 * The generated visual replaces the placeholder; a scrim keeps
                 * the question text legible over it. A still drifts slowly so it
                 * reads as motion rather than a frozen frame.
                 */}
                {question.visual.mediaType === "image" ? (
                  <img
                    key={question.visual.url}
                    src={question.visual.url}
                    alt=""
                    className={cn(
                      "nurseflow-visual-drift absolute inset-0 size-full object-cover",
                      paused && "nurseflow-visual-drift-paused",
                    )}
                  />
                ) : (
                  <video ref={clipRef} key={question.visual.url} src={question.visual.url} muted loop playsInline autoPlay className="absolute inset-0 size-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-[#071c23]/75 via-[#071c23]/45 to-[#05161d]/95" />
              </>
            ) : (
              <>
                <div className="absolute -right-10 top-20 size-56 rounded-full border-[28px] border-white/10" /><div className="absolute right-9 top-32 grid size-32 place-items-center rounded-full border border-teal-100/20 bg-[#0a222a]/70 text-center font-mono text-[10px] leading-relaxed text-teal-100/80">CLINICAL<br/>SIMULATION</div>
                <div className="absolute bottom-0 left-0 right-0 h-2/5 bg-gradient-to-t from-[#05161d] to-transparent" />
              </>
            )}
            <div className="relative flex min-h-[calc(100svh-68px)] flex-col px-5 pb-5 pt-16 sm:min-h-[680px] sm:p-5 md:min-h-[730px] md:p-7">
              <div className="flex items-start justify-between"><div><span className="rounded-full border border-teal-200/30 bg-teal-100/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-teal-100">{question.level}</span><h1 className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">{question.title}</h1></div><button onClick={() => setPaused(!paused)} aria-label={paused ? "Play visual" : "Pause visual"} className="grid size-10 place-items-center rounded-full bg-black/25 text-white backdrop-blur"><Play className={cn("size-4", !paused && "fill-current")} /></button></div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">{question.scene}</p>
              <div className="mt-auto"><div className="mb-3 flex items-center justify-between text-xs text-white/60"><span className="flex items-center gap-1.5"><Sparkles className="size-3 text-teal-200" /> {question.visual ? "AI teaching visual" : "AI visual lesson"}</span>{question.visual ? null : <span className="flex items-center gap-1"><Volume2 className="size-3" /> 0:18</span>}</div><div className="h-1 overflow-hidden rounded-full bg-white/20"><div className={cn("h-full w-2/3 bg-teal-200", !paused && "animate-pulse")} /></div></div>
              <div className="mt-5 rounded-2xl border border-white/15 bg-[#071b22]/90 p-4 shadow-xl backdrop-blur-md md:p-5"><div className="mb-3 flex items-center justify-between gap-3"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-teal-100/70">Choose the safest next action</p><span className="text-xs text-white/55">{trialLeft === 0 && hasAccess ? "Plus active" : `${trialLeft}/${TRIAL_LIMIT} trial`}</span></div><h2 className="text-base font-semibold leading-snug md:text-lg">{locked ? "Your free practice set is complete." : question.question}</h2>{locked ? <Button onClick={() => setUpgradeOpen(true)} className="mt-4 w-full bg-teal-300 font-bold text-[#052029] hover:bg-teal-200"><Lock className="mr-2 size-4" /> Continue practising</Button> : <div className="mt-4 grid gap-2">{question.options.map((option, optionIndex) => { const revealed = selected !== null; const isCorrect = optionIndex === question.answer; const isChosen = selected === optionIndex; return <button key={option} onClick={() => void choose(optionIndex)} disabled={answering} className={cn("rounded-xl border px-3 py-3 text-left text-sm transition disabled:cursor-wait", !revealed && "border-white/15 bg-white/5 hover:border-teal-200/70 hover:bg-white/10", revealed && isCorrect && "border-emerald-300 bg-emerald-400/20", revealed && isChosen && !isCorrect && "border-rose-300 bg-rose-400/20", revealed && !isCorrect && !isChosen && "border-white/10 opacity-45")}><span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold">{String.fromCharCode(65 + optionIndex)}</span>{option}{revealed && isCorrect && <Check className="float-right mt-0.5 size-4 text-emerald-200" />}</button>; })}</div>}{selected !== null && <div className={cn("mt-3 rounded-xl p-3 text-sm", selected === question.answer ? "bg-emerald-300/15 text-emerald-50" : "bg-amber-200/15 text-amber-50")}><b>{selected === question.answer ? "Correct." : "Review this."}</b> {question.rationale}</div>}</div>
            </div>
          </article>
          <div className="mt-3 flex items-center justify-between px-4 sm:px-2"><button onClick={() => setSourceOpen(!sourceOpen)} className="flex items-center gap-1.5 text-xs text-teal-100/70 hover:text-white"><BadgeCheck className="size-4" /> Reviewed learning card <ChevronDown className={cn("size-3 transition", sourceOpen && "rotate-180")} /></button><button onClick={() => navigator.share?.({ title: "NurseFlow", text: question.learningPoint })} className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"><Share2 className="size-4" /></button></div>
          {sourceOpen && <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-relaxed text-white/70">Learning point: {question.learningPoint}<br /><a className="mt-1 inline-block text-teal-200 underline" href={question.sourceUrl} target="_blank" rel="noreferrer">Source: {question.source}</a></div>}
        </section>

        <aside className="hidden pt-6 lg:block"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-teal-100/60">Today</p><p className="mt-2 text-2xl font-semibold">{trialUsed}<span className="text-sm font-normal text-white/50"> / 10</span></p><p className="text-xs text-white/55">trial questions used</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-teal-300" style={{ width: `${Math.min(100, trialUsed * 10)}%` }} /></div></div><button onClick={() => setUpgradeOpen(true)} className="mt-4 w-full rounded-xl border border-teal-300/40 bg-teal-300/10 p-3 text-left text-xs text-teal-100 hover:bg-teal-300/20"><Sparkles className="mb-2 size-4" />Unlimited practice<br /><span className="text-white/55">Card, mobile money & bank</span></button></aside>
      </div>

      {upgradeOpen && <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-3 backdrop-blur-sm sm:place-items-center"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-[2rem] bg-[#f8fbfa] p-6 text-[#09262f] shadow-2xl"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-teal-700">NurseFlow Plus</p><h2 className="mt-1 font-serif text-3xl">Keep your flow.</h2></div><button onClick={() => setUpgradeOpen(false)} className="rounded-full p-2 hover:bg-slate-100"><X className="size-4" /></button></div><p className="mt-3 text-sm leading-relaxed text-slate-600">Unlimited MCQs, saved progress and curated revision streams. Complete payment in one secure checkout.</p><div className="my-5 rounded-2xl bg-teal-50 p-4"><div className="flex justify-between"><b>Monthly access</b><b>GH₵ 35</b></div><p className="mt-1 text-xs text-slate-500">No account needed to start. Create one later to sync progress.</p></div><label htmlFor="nurseflow-payment-email" className="text-xs font-semibold text-slate-700">Email for your receipt</label><Input id="nurseflow-payment-email" type="email" autoComplete="email" value={paymentEmail} onChange={(event) => setPaymentEmail(event.target.value)} placeholder="you@example.com" className="mt-1.5" disabled={paymentBusy} />{paymentError && <p className="mt-2 text-xs text-red-700">{paymentError}</p>}<Button onClick={() => void startCheckout()} disabled={paymentBusy} className="mt-4 w-full bg-[#092f38] py-6 text-white hover:bg-[#124651]"><CreditCard className="mr-2 size-4" />{paymentBusy ? " Opening secure checkout…" : " Pay by card or Mobile Money"}</Button><p className="mt-3 text-center text-[11px] text-slate-500"><TimerReset className="mr-1 inline size-3" /> Secure checkout • access starts after verification</p></div></div>}
    </main>
  );
}
