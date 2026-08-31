/**
 * Admin-only dashboard gate — stricter than AdminGate.
 *
 * Requires both a valid admin session AND role=\"admin\". Staff members
 * (role=\"staff\") are shown an access-denied screen with a link back to
 * the studio. This is used to wrap /studio/dashboard.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdminMe, type Admin } from "@/lib/adminAuth";

export function AdminDashboardGate({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchAdminMe()
      .then(({ admin }) => {
        if (!cancelled) setAdmin(admin);
      })
      .catch(() => {
        if (!cancelled) setAdmin(null);
      });
    const onUnauthorized = () => setAdmin(null);
    window.addEventListener("carestudy:admin-unauthorized", onUnauthorized);
    return () => {
      cancelled = true;
      window.removeEventListener("carestudy:admin-unauthorized", onUnauthorized);
    };
  }, []);

  // Loading
  if (admin === undefined) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not signed in — redirect to the unified login page.
  if (admin === null) {
    window.location.href = "/login";
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Signed in but not admin role
  if (admin.role !== "admin") {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10">
              <ShieldAlert className="size-6 text-destructive" />
            </span>
            <CardTitle className="font-serif text-xl">Access denied</CardTitle>
            <CardDescription>
              The admin dashboard is restricted to administrators only. Your account has staff
              access — you can use the studio and order bin.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">@{admin.username}</span> ·{" "}
              <span className="font-medium text-foreground">{admin.role}</span>
            </p>
            <Button asChild>
              <Link href="/studio">
                <ArrowLeft className="size-4" /> Go to studio
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
