/**
 * Staff registration page — public page for invitees to create their account.
 *
 * Accessible at /staff/register?invite=TOKEN. Validates the invite token,
 * then lets the user choose a username and password. On success, they are
 * automatically logged in and redirected to the studio.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { HeartPulse, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { setAdminToken } from "@/lib/adminAuth";
import * as adminDashboardApi from "@/lib/adminDashboardApi";

function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="brand-tile grid size-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
        <HeartPulse className="size-5" />
      </span>
      <span>
        <span className="block font-serif text-base leading-none tracking-tight text-foreground">
          care<span className="text-primary">study</span>
        </span>
        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          staff registration
        </span>
      </span>
    </span>
  );
}

export function StaffRegisterPage() {
  const [, navigate] = useLocation();

  // Extract invite token from URL query params
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get("invite") ?? "";

  const [validating, setValidating] = useState(true);
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteLabel, setInviteLabel] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Validate the invite token on mount
  useEffect(() => {
    if (!inviteToken) {
      setValidating(false);
      setInviteError("No invite token provided. Please ask your admin for a registration link.");
      return;
    }
    adminDashboardApi
      .validateInvite(inviteToken)
      .then((result) => {
        setInviteValid(result.valid);
        setInviteLabel(result.label);
      })
      .catch((err) => {
        setInviteError(err instanceof Error ? err.message : "Invalid invite link.");
      })
      .finally(() => setValidating(false));
  }, [inviteToken]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const result = await adminDashboardApi.registerStaff({
        inviteToken,
        username: username.trim(),
        password,
        name: name.trim() || undefined,
        email: email.trim() || undefined,
      });
      // Auto-login: store the token and redirect to the studio
      setAdminToken(result.token);
      toast.success(`Welcome, ${result.admin.name || result.admin.username}! Your account is ready.`);
      window.location.href = "/welcome";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (validating) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Validating invite link…</p>
        </div>
      </div>
    );
  }

  // Invalid invite
  if (inviteError || !inviteValid) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10">
              <ShieldCheck className="size-6 text-destructive" />
            </span>
            <CardTitle className="font-serif text-xl">Invalid invite</CardTitle>
            <CardDescription>{inviteError ?? "This invite link is invalid or has expired."}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button asChild variant="outline">
              <Link href="/">Go home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Registration form
  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-2 flex justify-center">
            <BrandMark />
          </div>
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10">
            <UserPlus className="size-6 text-primary" />
          </span>
          <CardTitle className="font-serif text-xl">Create your staff account</CardTitle>
          <CardDescription>
            {inviteLabel
              ? `You've been invited to join: ${inviteLabel}`
              : "You've been invited to join the CareStudy team."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-username">Username *</Label>
              <Input
                id="reg-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ama.academic"
                autoComplete="username"
                required
                minLength={3}
              />
              <p className="text-[11px] text-muted-foreground">
                At least 3 characters. This is how you'll sign in.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password *</Label>
              <PasswordInput
                id="reg-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-confirm-password">Confirm password *</Label>
              <PasswordInput
                id="reg-confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
                minLength={8}
              />
              {confirmPassword && confirmPassword !== password && (
                <p className="text-[11px] text-destructive">Passwords do not match</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Display name</Label>
              <Input
                id="reg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ama Mensah"
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email</Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || !username || password.length < 8 || password !== confirmPassword}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Creating account…
                </>
              ) : (
                <>
                  <UserPlus className="size-4" /> Create account
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
