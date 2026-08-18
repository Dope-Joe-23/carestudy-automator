/**
 * Studio admin gate — the only way into the studio / order bin.
 *
 * Wraps the studio routes in App.tsx. Without a valid admin session it
 * renders a sign-in screen instead of the studio; on a session-expired 401
 * (fired by lib/api.ts) it flips straight back to that screen.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
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
import {
  adminLogin,
  fetchAdminMe,
  setAdminToken,
  type Admin,
} from "@/lib/adminAuth";

export function AdminGate({ children }: { children: ReactNode }) {
  // undefined = checking the stored session; null = signed out.
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchAdminMe()
      .then(({ admin }) => {
        if (!cancelled) setAdmin(admin);
      })
      .catch(() => {
        if (!cancelled) setAdmin(null); // no token or expired session
      });
    const onUnauthorized = () => setAdmin(null);
    window.addEventListener("carestudy:admin-unauthorized", onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener("carestudy:admin-unauthorized", onUnauthorized);
    };
  }, []);

  if (admin === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (admin === null) {
    return <AdminLogin onSuccess={(admin) => setAdmin(admin)} />;
  }

  return <>{children}</>;
}

function AdminLogin({ onSuccess }: { onSuccess: (admin: Admin) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { token, admin } = await adminLogin(username.trim(), password);
      setAdminToken(token);
      onSuccess(admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="size-6 text-primary" />
          </span>
          <CardTitle className="font-serif text-xl">Care Study Studio</CardTitle>
          <CardDescription>
            Sign in with your studio account to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-username">Username</Label>
              <Input
                id="admin-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <PasswordInput
                id="admin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
        </CardContent>
      </Card>
    </div>
  );
}
