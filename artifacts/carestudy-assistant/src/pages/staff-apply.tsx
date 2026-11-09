import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { API_URL } from "@/lib/apiBase";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StaffApplyPage() {
  const [values, setValues] = useState({ name: "", email: "", phone: "", experience: "", motivation: "" });
  const [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false), [error, setError] = useState("");
  useEffect(() => { document.title = "Apply to join the Nursuit team"; }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`${API_URL}/staff-applications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "We couldn't submit your application. Please try again.");
      setSubmitted(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Submission failed."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-[#f5f8f4] px-4 py-10 text-[#17382f]">
    <div className="w-full max-w-xl">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-[#527167]"><ArrowLeft className="size-4"/> Back to Nursuit</Link>
      <Card className="border-[#dce9e0] shadow-lg shadow-[#17382f]/5">
        <CardHeader className="text-center">
          <BrandLogo className="mx-auto size-16" />
          {submitted ? <><CheckCircle2 className="mx-auto mt-2 size-8 text-emerald-600"/><CardTitle className="font-serif text-2xl">Application received</CardTitle><CardDescription>Thank you for your interest in joining Nursuit. An administrator will review your application and contact you using the details you provided.</CardDescription></> : <><CardTitle className="font-serif text-2xl">Join the Nursuit team</CardTitle><CardDescription>Tell us a little about yourself and how you’d like to support nursing learners. Every application is reviewed by an administrator.</CardDescription></>}
        </CardHeader>
        {!submitted && <CardContent><form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" required maxLength={120} autoComplete="name" value={values.name} onChange={e=>setValues({...values,name:e.target.value})}/></div><div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" required type="email" maxLength={254} autoComplete="email" value={values.email} onChange={e=>setValues({...values,email:e.target.value})}/></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="staff-phone">Phone (optional)</Label><Input id="staff-phone" type="tel" maxLength={50} autoComplete="tel" value={values.phone} onChange={e=>setValues({...values,phone:e.target.value})}/></div><div className="space-y-2"><Label htmlFor="staff-experience">Nursing or teaching experience (optional)</Label><Input id="staff-experience" maxLength={2000} value={values.experience} onChange={e=>setValues({...values,experience:e.target.value})}/></div></div>
          <div className="space-y-2"><Label htmlFor="staff-motivation">Why would you like to join? (optional)</Label><Textarea id="staff-motivation" maxLength={4000} rows={5} value={values.motivation} onChange={e=>setValues({...values,motivation:e.target.value})} placeholder="Share what you could bring to the Nursuit team…"/></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin"/> : <Send className="size-4"/>} Submit application</Button>
          <p className="text-center text-xs text-muted-foreground">Submitting an application does not create a staff account or grant access.</p>
        </form></CardContent>}
      </Card>
    </div>
  </main>;
}
