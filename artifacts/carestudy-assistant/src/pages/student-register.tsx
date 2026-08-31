/**
 * Standalone student registration page — outside the student portal.
 *
 * Accessible at /student/register. Creates a student account and
 * redirects to /welcome on success.
 */
import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { HeartPulse, Loader2, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { registerStudent, setStudentToken } from "@/lib/studentApi";

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
          student registration
        </span>
      </span>
    </span>
  );
}

export function StudentRegisterPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [college, setCollege] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { token } = await registerStudent({
        name,
        username: username.trim(),
        email,
        password,
        college,
        program,
        year: year || undefined,
      });
      setStudentToken(token);
      toast.success("Account created! Welcome to CareStudy.");
      window.location.href = "/welcome";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Account creation failed");
    } finally {
      setSubmitting(false);
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
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10">
              <UserPlus className="size-6 text-primary" />
            </span>
            <CardTitle className="font-serif text-xl">Create your account</CardTitle>
            <CardDescription>
              Your private dashboard for ordering and tracking your care study.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reg-name">Full name *</Label>
                <Input
                  id="reg-name"
                  autoComplete="name"
                  placeholder="e.g. Ama Mensah"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  onChange={(e) => setUsername(e.target.value)}
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
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-password">Password *</Label>
                <PasswordInput
                  id="reg-password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-[11px] text-destructive">Passwords do not match</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-college">Nursing college / school *</Label>
                <Input
                  id="reg-college"
                  placeholder="e.g. Nurses' Training College, Korle-Bu"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  required
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
                    onChange={(e) => setYear(e.target.value)}
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
            </form>

            <div className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
              <p>
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
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
