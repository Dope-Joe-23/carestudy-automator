import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { API_URL } from "@/lib/apiBase";
import { getAdminToken } from "@/lib/adminAuth";

type Item = { id: string; title?: string; name?: string; reviewStatus: string; youtubeId?: string };
type Catalogue = { schemaVersion: 1; updatedAt: string; conditions: Item[]; videos: Item[] };

export function NurseLearnAdminPage() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setError("");
    try { const response = await fetch(`${API_URL}/admin/nurselearn`, { headers: { Authorization: `Bearer ${getAdminToken()}` } }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to load catalogue."); setCatalogue(body); setDraft(JSON.stringify({ conditions: body.conditions, videos: body.videos }, null, 2)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load catalogue."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save() {
    let content: { conditions: unknown[]; videos: unknown[] };
    try { content = JSON.parse(draft); if (!Array.isArray(content.conditions) || !Array.isArray(content.videos)) throw new Error("Include conditions and videos arrays."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Invalid JSON."); return; }
    setBusy(true); setError("");
    try { const response = await fetch(`${API_URL}/admin/nurselearn`, { method: "PUT", headers: { Authorization: `Bearer ${getAdminToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(content) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to save catalogue."); toast.success("Draft catalogue saved."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save catalogue."); }
    finally { setBusy(false); }
  }
  async function review(type: "conditions" | "videos", item: Item, reviewStatus: "approved" | "retired") {
    setBusy(true); setError("");
    try { const response = await fetch(`${API_URL}/admin/nurselearn/${type}/${encodeURIComponent(item.id)}/review`, { method: "PATCH", headers: { Authorization: `Bearer ${getAdminToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ reviewStatus }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Unable to update review status."); toast.success(`${item.title ?? item.name} ${reviewStatus}.`); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update review status."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-5 p-4 sm:p-6"><div className="flex items-center gap-3"><SidebarTrigger /><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Content governance</p><h1 className="text-2xl font-semibold">NurseLearn catalogue</h1></div></div>
    <Card><CardHeader><CardTitle>Manage conditions and videos</CardTitle><CardDescription>Records saved here stay as drafts until an administrator approves them. Use real reviewed content and valid YouTube IDs; language variants remain linked through shared condition IDs.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea aria-label="Catalogue JSON" className="min-h-[24rem] font-mono text-xs" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={'{"conditions": [], "videos": []}'} /><div className="flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={busy} className="gap-2"><Save className="size-4" /> Save drafts</Button><Button variant="outline" onClick={() => void load()} disabled={busy} className="gap-2"><RefreshCw className="size-4" /> Reload</Button></div></CardContent></Card>
    {error && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{error}</p>}
    {catalogue && <div className="grid gap-4 lg:grid-cols-2">{([ ["conditions", catalogue.conditions], ["videos", catalogue.videos] ] as const).map(([type, items]) => <Card key={type}><CardHeader><CardTitle className="capitalize">{type}</CardTitle><CardDescription>{items.length} records · Updated {new Date(catalogue.updatedAt).toLocaleString()}</CardDescription></CardHeader><CardContent className="space-y-2">{items.length ? items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title ?? item.name}</p><p className="text-xs text-muted-foreground">{item.reviewStatus}{item.youtubeId ? ` · YouTube ${item.youtubeId}` : ""}</p></div><div className="flex gap-2">{item.reviewStatus !== "approved" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void review(type, item, "approved")} className="gap-1"><CheckCircle2 className="size-3" /> Approve</Button>}{item.reviewStatus !== "retired" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void review(type, item, "retired")}>Retire</Button>}</div></div>) : <p className="text-sm text-muted-foreground">No records yet.</p>}</CardContent></Card>)}</div>}
  </div>;
}
