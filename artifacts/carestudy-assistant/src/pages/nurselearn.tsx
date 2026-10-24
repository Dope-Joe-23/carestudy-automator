import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, BookOpen, HeartPulse, Search, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiUrl } from "@/lib/apiBase";

type Condition = { id: string; slug: string; name: string; aliases: string[]; category: string; summary: string; plainLanguage: string; twiName?: string; twiReviewed?: boolean };
type VideoRecord = { id: string; slug: string; title: string; description: string; youtubeId: string; language: "en" | "tw"; subtitles: string[]; audience: string[]; objectives: string[]; conditionIds: string[]; duration?: string; format: string; references: { title: string; url: string }[] };
type Catalogue = { conditions: Condition[]; videos: VideoRecord[]; availableLanguages: string[] };
const paths = [
  { id: "public", label: "Understand the condition", description: "Accessible health information for the public and families." },
  { id: "nursing", label: "Nursing learning", description: "Clinical concepts and nursing practice education." },
  { id: "caregiver", label: "Care for someone", description: "Learning resources for family members and caregivers." },
] as const;

export function NurseLearnPage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [language, setLanguage] = useState(params.get("language") ?? "");
  const [path, setPath] = useState<string>("public");
  const [catalogue, setCatalogue] = useState<Catalogue>({ conditions: [], videos: [], availableLanguages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    const search = new URLSearchParams(); if (query.trim()) search.set("q", query.trim()); if (language) search.set("language", language); if (path) search.set("audience", path);
    void fetch(apiUrl(`/nurselearn?${search}`), { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("Could not load NurseLearn."); return response.json() as Promise<Catalogue>; }).then(setCatalogue).catch((reason: unknown) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setError(reason instanceof Error ? reason.message : "Could not load NurseLearn."); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [query, language, path]);
  const activeVideo = catalogue.videos.find((video) => video.id === selectedVideo);
  const emptyMessage = useMemo(() => query ? `No reviewed resources match “${query}” yet.` : "Reviewed learning resources will appear here as they are added by the NurseAid team.", [query]);

  function submit(event: React.FormEvent) { event.preventDefault(); setLocation(`/nurselearn${query ? `?q=${encodeURIComponent(query)}` : ""}`); }
  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b bg-card/80"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><Link href="/" className="font-serif text-xl font-semibold tracking-tight">NurseAid</Link><Link href="/nurseflow" className="text-sm text-primary hover:underline">Practice with NurseSpin <ArrowUpRight className="inline size-4" /></Link></div></header>
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <section className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">NurseLearn</p><h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-5xl">Learn about health, at your pace.</h1><p className="mt-4 max-w-2xl text-muted-foreground">Search or ask in your own words to find reviewed videos and condition guides for nursing students, families, and the public. Content appears when it has been reviewed and approved for sharing.</p>
        <form className="mt-6 flex max-w-2xl gap-2" onSubmit={submit}><label className="sr-only" htmlFor="health-search">Search conditions and videos</label><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="health-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a condition or topic" className="pl-9" /></div><Button type="submit">Search</Button></form>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested searches">{["Teach me about hypertension", "Videos about stroke", "Nursing management of diabetes"].map((suggestion) => <button key={suggestion} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground" onClick={() => setQuery(suggestion)}>{suggestion}</button>)}</div>
      </section>
      <section aria-labelledby="path-heading"><h2 id="path-heading" className="mb-3 text-sm font-semibold">Choose a learning path</h2><div className="grid gap-3 md:grid-cols-3">{paths.map((option) => <button key={option.id} type="button" onClick={() => setPath(option.id)} aria-pressed={path === option.id} className={`rounded-xl border p-4 text-left transition-colors ${path === option.id ? "border-primary bg-primary/5" : "bg-card hover:border-primary/40"}`}><span className="font-medium">{option.label}</span><span className="mt-1 block text-sm text-muted-foreground">{option.description}</span></button>)}</div></section>
      <section className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
        <div><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Conditions</h2><select aria-label="Video language" className="h-9 rounded-md border bg-background px-2 text-sm" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="">All available languages</option>{catalogue.availableLanguages.map((code) => <option key={code} value={code}>{code === "tw" ? "Twi" : "English"}</option>)}</select></div>
          {catalogue.conditions.length ? <div className="space-y-3">{catalogue.conditions.map((condition) => <article key={condition.id} className="rounded-xl border bg-card p-4"><div className="flex items-start gap-3"><HeartPulse className="mt-1 size-4 text-primary" /><div><h3 className="font-semibold">{condition.name}</h3><p className="mt-1 text-sm text-muted-foreground">{condition.summary}</p><span className="mt-2 inline-block text-xs text-muted-foreground">{condition.category}</span>{condition.twiName && condition.twiReviewed && <p className="mt-2 text-sm">Twi: {condition.twiName}</p>}</div></div></article>)}</div> : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{error || (loading ? "Loading reviewed conditions…" : emptyMessage)}</div>}
        </div>
        <div><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Videos</h2><span className="text-xs text-muted-foreground">{path === "nursing" ? "Nursing education" : path === "caregiver" ? "Caregiver education" : "Public education"}</span></div>
          {activeVideo ? <article className="overflow-hidden rounded-xl border bg-card"><div className="aspect-video bg-black"><iframe className="size-full" src={`https://www.youtube-nocookie.com/embed/${activeVideo.youtubeId}`} title={activeVideo.title} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div><div className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{activeVideo.title}</h3><p className="text-sm text-muted-foreground">{activeVideo.language === "tw" ? "Twi" : "English"}{activeVideo.duration ? ` · ${activeVideo.duration}` : ""}</p></div><Button variant="outline" size="sm" onClick={() => setSelectedVideo(null)}>Close</Button></div><p className="text-sm text-muted-foreground">{activeVideo.description}</p>{activeVideo.objectives.length > 0 && <div><p className="text-sm font-medium">Learning points</p><ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">{activeVideo.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></div>}<p className="text-xs text-muted-foreground">Provided by the source channel. Playback may depend on availability in your region.</p></div></article> : catalogue.videos.length ? <div className="grid gap-3 sm:grid-cols-2">{catalogue.videos.map((video) => <article key={video.id} className="overflow-hidden rounded-xl border bg-card"><button className="relative grid aspect-video w-full place-items-center bg-muted text-primary" onClick={() => setSelectedVideo(video.id)} aria-label={`Watch ${video.title}`}><img className="absolute inset-0 size-full object-cover" loading="lazy" src={`https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`} alt="" /><span className="z-10 grid size-12 place-items-center rounded-full bg-background/90"><Video className="size-5" /></span></button><div className="p-4"><h3 className="font-semibold">{video.title}</h3><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{video.description}</p><p className="mt-2 text-xs text-muted-foreground">{video.language === "tw" ? "Twi" : "English"}{video.duration ? ` · ${video.duration}` : ""}</p><button className="mt-3 text-sm font-medium text-primary hover:underline" onClick={() => setSelectedVideo(video.id)}>Watch video</button></div></article>)}</div> : <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground"><BookOpen className="mb-3 size-5 text-primary" />{error || (loading ? "Loading reviewed videos…" : <>{emptyMessage} No video is presented as available in Twi unless a reviewed Twi version exists.</>)}</div>}
        </div>
      </section>
      <footer className="rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">NurseAid learning content supports education and does not replace individual assessment or advice from a qualified health professional. If you have urgent symptoms, seek urgent professional care.</footer>
    </div>
  </main>;
}
