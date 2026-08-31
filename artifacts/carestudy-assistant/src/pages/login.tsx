/**
 * Unified sign-in page — staff, admins, and students all use this form.
 *
 * Tries admin login (username-based) first; if that fails with 401,
 * falls back to student login (email-based). On success, redirects
 * to /welcome which handles role-based routing.
 */
import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { HeartPulse, Loader2, Lock, User } from "lucide-react";
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
import { adminLogin, setAdminToken } from "@/lib/adminAuth";
import { loginStudent, setStudentToken } from "@/lib/studentApi";

function BrandMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="brand-tile grid size-10 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
        <HeartPulse className="size-5" />
      </span>
      <span>
        <span className="block font-serif text-lg leading-none tracking-tight text-foreground">
          care<span className="text-primary">study</span>
        </span>
        <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          nursing academic support
        </span>
      </span>
    </span>
  );
}

export function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const value = identifier.trim();

    // 1) Try admin/staff login (username-based)
    try {
      const { token, admin } = await adminLogin(value, password);
      setAdminToken(token);
      toast.success(`Welcome back, ${admin.name || admin.username}!`);
      window.location.href = "/welcome";
      return;
    } catch {
      // fall through to student login
    }

    // 2) Try student login (email-based)
    try {
      const { token, student } = await loginStudent(value, password);
      setStudentToken(token);
      toast.success(`Welcome back, ${student.name}!`);
      window.location.href = "/welcome";
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <BrandMark />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-xl">Sign in</CardTitle>
            <CardDescription>
              Enter your credentials to access your workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-identifier">Email or username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-identifier"
                    className="pl-9"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@example.com or username"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Password</Label>
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <p className="flex items-start gap-1.5 text-sm text-destructive">
                  <Lock className="mt-0.5 size-3.5 shrink-0" />
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>

            <div className="mt-6 space-y-3 text-center text-xs text-muted-foreground">
              <p>
                Student?{" "}
                <Link
                  href="/student/register"
                  className="font-medium text-primary hover:underline"
                >
                  Create a student account
                </Link>
              </p>
              <p>
                Staff?{" "}
                <span className="text-muted-foreground/60">
                  Ask your admin for an invite link.
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
