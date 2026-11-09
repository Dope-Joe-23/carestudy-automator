import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { setAdminToken } from "@/lib/adminAuth";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { submitStaffApplication } from "@/lib/staffApplicationApi";

export function StaffApplyPage() {
  const [, navigate] = useLocation();
  const [values, setValues] = useState({ name: "", email: "", phone: "", experience: "", motivation: "", username: "", password: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { document.title = "Apply to join the Nursuit team"; }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (values.password !== values.confirmPassword) { setError("Your passwords don't match."); return; }
    setBusy(true);
    try {
      const result = await submitStaffApplication({
        name: values.name.trim(), email: values.email.trim(), phone: values.phone.trim(),
        experience: values.experience.trim(), motivation: values.motivation.trim(),
        username: values.username.trim().toLowerCase(), password: values.password,
      });
      setAdminToken(result.token);
      navigate("/staff/application");
    } catch (err) { setError(err instanceof Error ? err.message : "Submission failed."); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f5f8f4] px-4 py-10 text-[#17382f]">
    <div className="w-full max-w-xl">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-[#527167]"><ArrowLeft className="size-4"/> Back to Nursuit</Link>
      <Card className="border-[#dce9e0] shadow-lg shadow-[#17382f]/5">
        <CardHeader className="text-center">
          <BrandLogo className="mx-auto size-16" />
          <CardTitle className="font-serif text-2xl">Join the Nursuit team</CardTitle>
          <CardDescription>Apply to support nursing learners. Your account will stay in applicant mode until an administrator reviews and approves your application.</CardDescription>
        </CardHeader>
        <CardContent><form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" required maxLength={120} autoComplete="name" value={values.name} onChange={e=>setValues({...values,name:e.target.value})}/></div>
            <div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" required type="email" maxLength={254} autoComplete="email" value={values.email} onChange={e=>setValues({...values,email:e.target.value})}/></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="staff-phone">Phone (optional)</Label><Input id="staff-phone" type="tel" maxLength={50} autoComplete="tel" value={values.phone} onChange={e=>setValues({...values,phone:e.target.value})}/></div>
            <div className="space-y-2"><Label htmlFor="staff-experience">Nursing or teaching experience (optional)</Label><Input id="staff-experience" maxLength={2000} value={values.experience} onChange={e=>setValues({...values,experience:e.target.value})}/></div>
          </div>
          <div className="space-y-2"><Label htmlFor="staff-motivation">Why would you like to join? (optional)</Label><Textarea id="staff-motivation" maxLength={4000} rows={4} value={values.motivation} onChange={e=>setValues({...values,motivation:e.target.value})} placeholder="Share what you could bring to the Nursuit team…"/></div>
          <div className="rounded-xl border border-[#e0e9e1] bg-[#f8faf6] p-4">
            <p className="mb-3 text-sm font-semibold">Create your applicant account</p>
            <div className="space-y-3">
              <div className="space-y-2"><Label htmlFor="staff-username">Username</Label><Input id="staff-username" required minLength={3} maxLength={50} autoComplete="username" value={values.username} onChange={e=>setValues({...values,username:e.target.value.toLowerCase()})} placeholder="e.g. ama.academic"/><p className="text-xs text-muted-foreground">Use letters, numbers, dots, underscores, or hyphens.</p></div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="staff-password">Password</Label><PasswordInput id="staff-password" required minLength={8} maxLength={128} autoComplete="new-password" value={values.password} onChange={e=>setValues({...values,password:e.target.value})}/></div><div className="space-y-2"><Label htmlFor="staff-confirm-password">Confirm password</Label><PasswordInput id="staff-confirm-password" required minLength={8} maxLength={128} autoComplete="new-password" value={values.confirmPassword} onChange={e=>setValues({...values,confirmPassword:e.target.value})}/></div></div>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin"/> : <Send className="size-4"/>} Submit application and create account</Button>
          <p className="text-center text-xs text-muted-foreground">You’ll be signed in to an application status page. Studio access stays locked until approval.</p>
          <p className="text-center text-sm text-muted-foreground">Already applied? <Link href="/staff/application" className="font-medium text-primary underline-offset-4 hover:underline">Check your application</Link></p>
        </form></CardContent>
      </Card>
    </div>
  </main>;
}
