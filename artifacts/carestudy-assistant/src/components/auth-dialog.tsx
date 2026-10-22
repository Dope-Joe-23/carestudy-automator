/**
 * Auth dialog — one modal for signing in and for creating a student account.
 *
 * The legacy /login and /student/register URLs open this dialog over the
 * student workspace, and the workspace, its sidebar, and the studio gates
 * open it in place. Admins and staff still land on /welcome after signing in;
 * students hand their session back to the caller so the page can update
 * without a reload.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Lock, ShieldCheck, User, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollegeSelector } from "@/components/college-selector";
import { adminLogin, setAdminToken } from "@/lib/adminAuth";
import {
  loginStudent,
  registerStudent,
  setStudentToken,
  type Student,
} from "@/lib/studentApi";
import { validateStudentInvite } from "@/lib/adminDashboardApi";

export type AuthMode = "sign-in" | "sign-up";

const PROGRAMMES = [
  "RGN",
  "RM",
  "RCN",
  "BSc Nursing",
  "BSc Midwifery",
  "Diploma in Midwifery",
  "Community Health Nursing",
  "Other",
];

type SignedInHandler = (token: string, student: Student) => void;

export function AuthDialog({
  open,
  mode,
  onModeChange,
  onClose,
  onStudentSignedIn,
  staffToken,
}: {
  open: boolean;
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onStudentSignedIn?: SignedInHandler;
  staffToken?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "sign-in" ? (
              <Lock className="size-5 text-primary" />
            ) : (
              <UserPlus className="size-5 text-primary" />
            )}
            {mode === "sign-in" ? "Sign in" : "Create your account"}
          </DialogTitle>
          <DialogDescription>
            {mode === "sign-in"
              ? "Enter your credentials to open your workspace."
              : "Your private workspace for ordering and tracking your care study."}
          </DialogDescription>
        </DialogHeader>

        {mode === "sign-in" ? (
          <SignInForm
            onClose={onClose}
            onStudentSignedIn={onStudentSignedIn}
            onSwitchToSignUp={() => onModeChange("sign-up")}
          />
        ) : (
          <SignUpForm
            staffToken={staffToken}
            onClose={onClose}
            onStudentSignedIn={onStudentSignedIn}
            onSwitchToSignIn={() => onModeChange("sign-in")}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

function SignInForm({
  onClose,
  onStudentSignedIn,
  onSwitchToSignUp,
}: {
  onClose: () => void;
  onStudentSignedIn?: SignedInHandler;
  onSwitchToSignUp: () => void;
}) {
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

    // 1) Staff and admins sign in with a username.
    try {
      const { token, admin } = await adminLogin(value, password);
      setAdminToken(token);
      toast.success(`Welcome back, ${admin.name || admin.username}!`);
      window.location.href = "/welcome";
      return;
    } catch {
      // fall through to student sign-in
    }

    // 2) Students sign in with an email or username.
    try {
      const { token, student } = await loginStudent(value, password);
      setStudentToken(token);
      toast.success(`Welcome back, ${student.name}!`);
      if (onStudentSignedIn) {
        onStudentSignedIn(token, student);
        onClose();
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="auth-identifier">Email or username</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="auth-identifier"
            className="pl-9"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="you@example.com or username"
            autoComplete="username"
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="auth-password">Password</Label>
        <PasswordInput
          id="auth-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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

      <div className="space-y-2 border-t pt-4 text-center text-xs text-muted-foreground">
        <p>
          New here?{" "}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="font-medium text-primary hover:underline"
          >
            Create a student account
          </button>
        </p>
        <p>Staff? Ask your admin for an invite link.</p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Create account
// ---------------------------------------------------------------------------

function SignUpForm({
  staffToken,
  onClose,
  onStudentSignedIn,
  onSwitchToSignIn,
}: {
  staffToken?: string | null;
  onClose: () => void;
  onStudentSignedIn?: SignedInHandler;
  onSwitchToSignIn: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [college, setCollege] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(Boolean(staffToken));
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Validate the staff invite carried by the registration link, if any.
  useEffect(() => {
    if (!staffToken) {
      setTokenLoading(false);
      return;
    }
    let cancelled = false;
    setTokenLoading(true);
    validateStudentInvite(staffToken)
      .then((result) => {
        if (cancelled) return;
        if (result.valid) setStaffName(result.staffName);
        else setTokenError("This registration link is invalid.");
      })
      .catch(() => {
        if (!cancelled) setTokenError("This registration link is invalid or has expired.");
      })
      .finally(() => {
        if (!cancelled) setTokenLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [staffToken]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { token, student } = await registerStudent({
        name,
        username: username.trim(),
        email,
        password,
        college,
        program,
        year: year || undefined,
        staffInviteToken: staffToken ?? undefined,
      });
      setStudentToken(token);
      toast.success("Account created! Welcome to CareStudy.");
      if (onStudentSignedIn) {
        onStudentSignedIn(token, student);
        onClose();
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Account creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {tokenLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 py-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Verifying registration link…</span>
        </div>
      ) : tokenError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
          {tokenError}
        </div>
      ) : staffName ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <ShieldCheck className="size-4 text-primary" />
          <span className="text-xs text-muted-foreground">
            Registered by <span className="font-medium text-foreground">{staffName}</span>
          </span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="reg-name">Full name *</Label>
        <Input
          id="reg-name"
          autoComplete="name"
          placeholder="e.g. Ama Mensah"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-username">Username *</Label>
        <Input
          id="reg-username"
          autoComplete="username"
          placeholder="e.g. ama.nursing"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          minLength={3}
        />
        <p className="text-[11px] text-muted-foreground">
          At least 3 characters. This is how you'll sign in.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-email">Email *</Label>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="reg-password">Password *</Label>
          <PasswordInput
            id="reg-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-confirm-password">Confirm password *</Label>
          <PasswordInput
            id="reg-confirm-password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
          />
          {confirmPassword && confirmPassword !== password && (
            <p className="text-[11px] text-destructive">Passwords do not match</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reg-college">Nursing college / school *</Label>
        <CollegeSelector
          id="reg-college"
          value={college}
          onChange={setCollege}
          placeholder="Search for your institution…"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Programme *</Label>
          <Select value={program} onValueChange={setProgram}>
            <SelectTrigger>
              <SelectValue placeholder="Select programme" />
            </SelectTrigger>
            <SelectContent>
              {PROGRAMMES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-year">Year of study</Label>
          <Input
            id="reg-year"
            placeholder="e.g. Year 3"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
        </div>
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={submitting || !program || password !== confirmPassword}
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <UserPlus className="size-4" />
        )}
        Create account
      </Button>

      <div className="border-t pt-4 text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </button>
      </div>
    </form>
  );
}
