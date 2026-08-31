/**
 * Studio admin gate — the only way into the studio / order bin.
 *
 * Wraps the studio routes in App.tsx. Without a valid admin session it
 * renders a sign-in screen instead of the studio; on a session-expired 401
 * (fired by lib/api.ts) it flips straight back to that screen.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { fetchAdminMe, type Admin } from "@/lib/adminAuth";
import { AdminContext } from "@/lib/adminContext";

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

  // Not signed in — redirect to the unified login page.
  if (admin === null) {
    window.location.href = "/login";
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <AdminContext.Provider value={{ admin }}>{children}</AdminContext.Provider>;
}


