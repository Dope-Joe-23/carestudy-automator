import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Clock3, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { adminLogin, getAdminToken, setAdminToken } from "@/lib/adminAuth";
import { getMyStaffApplication, logoutStaffApplicant, type StaffApplicationStatus } from "@/lib/staffApplicationApi";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function StaffApplicationStatusPage() {
  const [application, setApplication] = useState<StaffApplicationStatus | null>(null);
  const [checking, setChecking] = useState(() => Boolean(getAdminToken()));
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { document.title = "Your Nursuit staff application"; }, []);

  useEffect(() => {
    if (application && application.application.status !== "pending") return;
    const token = getAdminToken();
    if (!token) { setChecking(false); return; }
    let cancelled = false;
    const refresh = async () => {
      try {
        const result = await getMyStaffApplication(token);
        if (!cancelled) { setApplication(result); setError(""); }
      } catch (reason) {
        if (!cancelled) {
          if (reason instanceof Error && /session has expired/i.test(reason.message)) setAdminToken(null);
          setApplication(null);
          setError(reason instanceof Error ? reason.message : "Sign in to view your application.");
        }
      } finally { if (!cancelled) setChecking(false); }
    };
    void refresh();
    const poll = application?.application.status === "pending"
      ? window.setInterval(() => void refresh(), 10000)
      : undefined;
    return () => { cancelled = true; if (poll) window.clearInterval(poll); };
  }, [application?.application.status]);

  useEffect(() => {
    if (application?.application.status !== "approved") return;
    const timer = window.setTimeout(() => window.location.replace("/studio/bin"), 2200);
    return () => window.clearTimeout(timer);
  }, [application?.application.status]);

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const session = await adminLogin(username.trim().toLowerCase(), password);
      const result = await getMyStaffApplication(session.token);
      setAdminToken(session.token); setApplication(result); setPassword("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in or find an application for this account."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    const token = getAdminToken();
    if (token) await logoutStaffApplicant(token).catch(() => {});
    setAdminToken(null); setApplication(null); setError("");
  }

  return <main className="grid min-h-screen place-items-center bg-[#f5f8f4] px-4 py-10 text-[#17382f]">
    <div className="w-full max-w-lg">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-[#527167]"><ArrowLeft className="size-4"/> Back to Nursuit</Link>
      <Card className="border-[#dce9e0] shadow-lg shadow-[#17382f]/5">
        <CardHeader className="text-center">
          <BrandLogo className="mx-auto size-16" />
          {checking ? <><CardTitle className="font-serif text-2xl">Checking your application</CardTitle><CardDescription>Please wait a moment.</CardDescription></> : application ? <>
            <span className="mx-auto mt-2 grid size-12 place-items-center rounded-full bg-[#e6f4ec] text-[#23745b]">{application.application.status === "approved" ? <CheckCircle2 className="size-6"/> : application.application.status === "declined" ? <ShieldCheck className="size-6"/> : <Clock3 className="size-6"/>}</span>
            <CardTitle className="font-serif text-2xl">{application.application.status === "pending" ? "Your application is under review" : application.application.status === "approved" ? "You’re approved" : "Application update"}</CardTitle>
            <CardDescription>{application.applicant.name || application.applicant.username} · @{application.applicant.username}</CardDescription>
          </> : <><CardTitle className="font-serif text-2xl">Your staff application</CardTitle><CardDescription>Sign in with the applicant account you created when you applied.</CardDescription></>}
        </CardHeader>
        <CardContent>
          {checking ? <div className="flex justify-center pb-6"><Loader2 className="size-5 animate-spin text-primary"/></div> : application ? <div className="space-y-5 text-center">
            {application.application.status === "pending" && <>
              <p className="text-sm leading-relaxed text-muted-foreground">Your applicant account is active. You’re part of the Nursuit team application process; staff tools unlock after an administrator approves your application.</p>
              <section className="rounded-xl border border-[#e0e9e1] bg-[#f8faf6] p-4 text-left">
                <h3 className="text-sm font-semibold">What happens next</h3>
                <ol className="mt-4 space-y-4">
                  <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#dff2e8] text-xs font-semibold text-[#23745b]">✓</span><div><p className="text-sm font-medium">Application received</p><p className="text-xs text-muted-foreground">Submitted {new Date(application.application.createdAt).toLocaleDateString()}.</p></div></li>
                  <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#183e33] text-xs font-semibold text-white">2</span><div><p className="text-sm font-medium">Administrator review</p><p className="text-xs text-muted-foreground">We’re reviewing your application.</p></div></li>
                  <li className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#dce9e0] text-xs font-semibold text-[#829087]">3</span><div><p className="text-sm font-medium">Staff access</p><p className="text-xs text-muted-foreground">Approval activates your account for the staff studio.</p></div></li>
                </ol>
                <p className="mt-4 border-t border-[#e0e9e1] pt-3 text-xs text-muted-foreground">This page checks for an update every 10 seconds. You can sign out and return later with your username and password.</p>
              </section>
            </>}
            {application.application.status === "approved" && <p className="text-sm text-muted-foreground">Your staff access is active. Opening your staff home…</p>}
            {application.application.status === "declined" && <p className="text-sm leading-relaxed text-muted-foreground">Your application was not approved. Your applicant account remains restricted from the studio.</p>}
            <Button variant="outline" className="gap-2" onClick={() => void signOut()}><LogOut className="size-4"/> Sign out</Button>
          </div> : <form onSubmit={signIn} className="space-y-4">
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <div className="space-y-2"><Label htmlFor="applicant-username">Username</Label><Input id="applicant-username" required autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)}/></div>
            <div className="space-y-2"><Label htmlFor="applicant-password">Password</Label><PasswordInput id="applicant-password" required autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin"/> : null} Sign in to application status</Button>
          </form>}
        </CardContent>
      </Card>
    </div>
  </main>;
}
