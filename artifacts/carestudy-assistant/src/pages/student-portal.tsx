/**
 * Student portal — account creation, order placement with project materials,
 * status tracking, and delivery of the completed study.
 *
 * Mounted at /student (wouter). The student never sees the studio; this is
 * the only surface they interact with. The tone matches the agency
 * positioning: calm, institutional, professional.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  FileText,
  GraduationCap,
  HeartPulse,
  ListChecks,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as studentApi from "@/lib/studentApi";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

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

type OrderStatus = studentApi.OrderStatus;

const STATUS_META: Record<
  OrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; step: number }
> = {
  submitted: { label: "Submitted", variant: "secondary", step: 0 },
  in_production: { label: "In production", variant: "outline", step: 1 },
  ready: { label: "Ready for download", variant: "default", step: 2 },
  cancelled: { label: "Cancelled", variant: "destructive", step: -1 },
};

const FILE_KIND_LABELS: Record<studentApi.OrderFile["kind"] | "correction", string> = {
  guidelines: "Care study guidelines",
  clinical: "Clinical notes & assessment data",
  reference: "Reference documents",
  correction: "Prepared study or chapter",
};

const FILE_KIND_HINTS: Record<studentApi.OrderFile["kind"] | "correction", string> = {
  guidelines:
    "College guidelines, marking scheme, or template.",
  clinical:
    "Patient notes and assessment data from placement.",
  reference:
    "Textbooks, fact sheets, formularies, or references.",
  correction:
    "The chapter or full study to be corrected.",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The brand mark used across the studio — carried into the portal. */
function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="brand-tile grid size-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
        <HeartPulse className="size-5" />
      </span>
      {!compact && (
        <span>
          <span className="block font-serif text-base leading-none tracking-tight text-foreground">
            care<span className="text-primary">study</span>
          </span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            student portal
          </span>
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Auth context
// ---------------------------------------------------------------------------

type AuthContextValue = {
  student: studentApi.Student | null;
  ready: boolean;
  signIn: (token: string, student: studentApi.Student) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  student: null,
  ready: false,
  signIn: () => {},
  signOut: async () => {},
});

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => studentApi.getStudentToken());
  const [student, setStudent] = useState<studentApi.Student | null>(null);
  const [ready, setReady] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStudent(null);
      setReady(true);
      return;
    }
    setReady(false);
    studentApi
      .fetchMe()
      .then(({ student: me }) => {
        if (!cancelled) setStudent(me);
      })
      .catch((err) => {
        if (cancelled) return;
        if ((err as { isUnauthorized?: boolean }).isUnauthorized) {
          studentApi.setStudentToken(null);
          setToken(null);
          setStudent(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback((nextToken: string, nextStudent: studentApi.Student) => {
    studentApi.setStudentToken(nextToken);
    setToken(nextToken);
    setStudent(nextStudent);
  }, []);

  const signOut = useCallback(async () => {
    await studentApi.logoutStudent().catch(() => {});
    setToken(null);
    setStudent(null);
    navigate("/student/login", { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({ student, ready, signIn, signOut }),
    [student, ready, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function PortalHeader() {
  const { student, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/student/orders" className="shrink-0">
          <BrandMark />
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium">
          <Link href="/student/orders" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>
            My projects
          </Link>
          <Link href="/student/orders/new" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>
            Place an order
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {student ? (
            <>
              <span className="hidden text-right sm:block">
                <span className="block text-xs font-semibold leading-tight">{student.name}</span>
                <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                  {student.college}
                </span>
              </span>
              <Button variant="outline" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <Link href="/student/login" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <PortalHeader />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
        <Separator className="mb-6" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          CareStudy Institute supports nursing education — preparing the study, and preparing you to
          defend it. Your materials stay yours and are used only to prepare your study.
        </p>
      </footer>
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { student, ready } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (ready && !student) navigate("/student/login", { replace: true });
  }, [ready, student, navigate]);
  if (!ready || !student) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Auth pages
// ---------------------------------------------------------------------------

function AuthShell({ children, heading, sub }: { children: ReactNode; heading: string; sub: string }) {
  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex justify-center">
        <BrandMark />
      </div>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{heading}</CardTitle>
          <CardDescription>{sub}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

function LoginPage() {
  const { signIn, student, ready } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (ready && student) navigate("/student/orders", { replace: true });
  }, [ready, student, navigate]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { token, student } = await studentApi.loginStudent(email, password);
      signIn(token, student);
      navigate("/student/orders", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell heading="Welcome back" sub="Sign in to track your care study projects.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>
      </form>
      <p className="pt-4 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/student/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

function RegisterPage() {
  const { signIn, student, ready } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (ready && student) navigate("/student/orders", { replace: true });
  }, [ready, student, navigate]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [college, setCollege] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { token, student } = await studentApi.registerStudent({
        name,
        email,
        password,
        college,
        program,
        year: year || undefined,
      });
      signIn(token, student);
      navigate("/student/orders", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Account creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      heading="Create your account"
      sub="Your private dashboard for ordering and tracking your care study."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="reg-name">Full name</Label>
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
          <Label htmlFor="reg-email">Email</Label>
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
          <Label htmlFor="reg-password">Password</Label>
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-college">Nursing college / school</Label>
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
            <Label>Programme</Label>
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
        <Button type="submit" className="w-full" disabled={submitting || !program}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Create account
        </Button>
      </form>
      <p className="pt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/student/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

// ---------------------------------------------------------------------------
// Orders list
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function OrdersList() {
  const [, navigate] = useLocation();
  const [orderOpen, setOrderOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-orders"],
    queryFn: async () => (await studentApi.listOrders()).orders,
    refetchInterval: (query) =>
      query.state.data?.some((order) => order.status === "submitted" || order.status === "in_production")
        ? 10_000
        : false,
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            The Care Study Support Programme
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            My care study projects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Place an order with your project information, and track it here until your completed
            study is ready.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setOrderOpen(true)}>
            <Plus className="size-4" /> Place an order
          </Button>
          <Button variant="outline" onClick={() => setCorrectionOpen(true)}>
            <RotateCcw className="size-4" /> Make correction
          </Button>
        </div>
      </div>

      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Place an order</DialogTitle>
            <DialogDescription>Submit a new care study order.</DialogDescription>
          </DialogHeader>
          <NewOrderPage onClose={() => setOrderOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Make a correction</DialogTitle>
            <DialogDescription>
              Upload your prepared chapter or full study and describe the changes required.
            </DialogDescription>
          </DialogHeader>
          <NewOrderPage correctionMode onClose={() => setCorrectionOpen(false)} />
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Could not load your projects — please try again.
          </CardContent>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10">
              <ClipboardList className="size-6 text-primary" />
            </span>
            <h2 className="font-serif text-lg font-semibold">No projects yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              When you place your first order — with your clinical notes, guidelines, and reference
              documents — it will appear here so you can follow it to delivery.
            </p>
            <Button className="mt-5" onClick={() => setOrderOpen(true)}>
              Place your first order <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((order) => (
            <Card
              key={order.id}
              className="cursor-pointer transition-colors hover:border-primary/40"
              onClick={() => navigate(`/student/orders/${order.id}`)}
            >
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold leading-snug">{order.title}</h2>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {order.diagnosis ? `${order.diagnosis} · ` : ""}
                    {order.fileCount} document{order.fileCount === 1 ? "" : "s"} · Submitted{" "}
                    {formatDate(order.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {order.status === "ready" && order.delivery && (
                    <Button
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        studentApi
                          .downloadOrderStudy(order)
                          .catch((err) =>
                            toast.error(err instanceof Error ? err.message : "Download failed"),
                          );
                      }}
                    >
                      <Download className="size-4" /> Download
                    </Button>
                  )}
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New order form
// ---------------------------------------------------------------------------

type FileKind = "guidelines" | "clinical" | "reference";

function FilePicker({
  kind,
  files,
  onChange,
}: {
  kind: FileKind;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputId = `file-picker-${kind}`;
  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length) onChange([...files, ...picked]);
    event.target.value = "";
  };
  return (
    <div className="rounded-lg border border-dashed p-4">
      <Label htmlFor={inputId} className="flex cursor-pointer flex-col items-start gap-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="size-4 text-muted-foreground" />
          {FILE_KIND_LABELS[kind]}
        </span>
        <span className="text-xs leading-relaxed text-muted-foreground">{FILE_KIND_HINTS[kind]}</span>
      </Label>
      <input id={inputId} type="file" multiple className="hidden" onChange={addFiles} />
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs">
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewOrderPage({
  correctionMode = false,
  onClose,
}: {
  correctionMode?: boolean;
  onClose?: () => void;
}) {
  const { student } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [college, setCollege] = useState(student?.college ?? "");
  const [program, setProgram] = useState(student?.program ?? "");
  const [notes, setNotes] = useState("");
  const [correctionScope, setCorrectionScope] = useState<"chapter" | "full" | null>(null);
  const [correctionFile, setCorrectionFile] = useState<File | null>(null);
  const [filesByKind, setFilesByKind] = useState<Record<FileKind, File[]>>({
    guidelines: [],
    clinical: [],
    reference: [],
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const files: studentApi.OrderFileInput[] = [];
      for (const kind of ["guidelines", "clinical", "reference"] as const) {
        for (const file of filesByKind[kind]) {
          files.push({
            kind,
            filename: file.name,
            content: await studentApi.readFileAsBase64(file),
          });
        }
      }
      if (correctionScope && correctionFile) {
        files.push({
          kind: "correction",
          filename: correctionFile.name,
          content: await studentApi.readFileAsBase64(correctionFile),
        });
      }
      return studentApi.placeOrder({
        title,
        diagnosis: diagnosis.trim() || undefined,
        college,
        program,
        notes: notes.trim() || undefined,
        correctionScope: correctionMode ? correctionScope ?? undefined : undefined,
        files,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["student-orders"] });
      toast.success("Your order has been submitted — our team will begin shortly.");
      navigate(`/student/orders/${result.order.id}`, { replace: true });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Your order could not be submitted.");
    },
  });

  return (
    <div>
      {correctionMode || onClose ? (
        <button type="button" onClick={onClose} className="mb-3 text-sm text-muted-foreground hover:text-foreground">
          Close request
        </button>
      ) : (
        <Link href="/student/orders" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-4 -ml-2 text-muted-foreground')}>
          <ArrowLeft className="size-4" /> My projects
        </Link>
      )}
      {!correctionMode && <div className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          The Care Study Support Programme
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight">
          Place an order
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Send us your project information — your clinical materials, your college's guidelines, and
          any reference documents. Our academic team prepares your study from what you provide.
        </p>
      </div>}

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim() || !college.trim() || !program) {
            toast.error("Please fill in the project title, college, and programme.");
            return;
          }
          if (correctionMode && !correctionScope) {
            toast.error("Please choose whether you are correcting a chapter or the full study.");
            return;
          }
          if (correctionMode && !correctionFile) {
            toast.error("Please upload the chapter or full study to correct.");
            return;
          }
          if (correctionMode && !notes.trim()) {
            toast.error("Please write the changes you want made to the uploaded work.");
            return;
          }
          placeOrder.mutate();
        }}
      >
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Project information</CardTitle>
            <CardDescription>What your care study is about.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="order-title">Project title *</Label>
              <Input
                id="order-title"
                placeholder="e.g. Patient/Family Care Study — Pulmonary Tuberculosis"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-diagnosis">Diagnosis / condition under study</Label>
              <Input
                id="order-diagnosis"
                placeholder="e.g. Pulmonary tuberculosis"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="order-college">Nursing college / school *</Label>
                <Input
                  id="order-college"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  required
                />
              </div>
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
            </div>
            {!correctionMode && (
              <div className="space-y-1.5">
                <Label htmlFor="order-notes">Project notes</Label>
                <Textarea
                  id="order-notes"
                  rows={4}
                  placeholder="Tell us about your project — the patient, what you have collected so far, your supervisor's requirements, anything we should know."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {correctionMode && <Card className="border-primary/20 bg-primary/[0.025]">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Request a correction</CardTitle>
            <CardDescription>Upload a prepared chapter or the full study, then describe exactly what should change.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="correction-notes">Desired changes *</Label>
                <Textarea
                id="correction-notes"
                  rows={3}
                placeholder="Write exactly what should be corrected, added, removed, or reformatted."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required={Boolean(correctionScope)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["chapter", "full"] as const).map((scope) => (
                <Button key={scope} type="button" size="sm" variant={correctionScope === scope ? "default" : "outline"} onClick={() => setCorrectionScope(correctionScope === scope ? null : scope)}>
                  {scope === "chapter" ? "Correct a chapter" : "Correct the full study"}
                </Button>
              ))}
            </div>
            {correctionScope && (
              <div className="space-y-2 rounded-lg border border-dashed p-4">
                <Label htmlFor="correction-file" className="text-xs">{FILE_KIND_LABELS.correction}</Label>
                <Input id="correction-file" type="file" accept=".pdf,.docx,.epub,.md,.markdown,.txt" onChange={(event) => setCorrectionFile(event.target.files?.[0] ?? null)} required />
                {correctionFile && <p className="text-xs text-muted-foreground">{correctionFile.name} · {formatBytes(correctionFile.size)}</p>}
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-end border-t px-4 py-3">
            <Button type="submit" disabled={placeOrder.isPending}>
              {placeOrder.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Submit correction
            </Button>
          </CardFooter>
        </Card>}

        {!correctionMode && <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Your project documents</CardTitle>
            <CardDescription>
              Optional — but the more of your own material you include, the more precisely the
              study can be built around your patient and your school's format. PDF, Word (.docx),
              EPUB, Markdown, and plain text are accepted. You can submit without any and add
              documents later.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 pb-4 sm:grid-cols-3">
            <FilePicker
              kind="guidelines"
              files={filesByKind.guidelines}
              onChange={(files) => setFilesByKind((prev) => ({ ...prev, guidelines: files }))}
            />
            <FilePicker
              kind="clinical"
              files={filesByKind.clinical}
              onChange={(files) => setFilesByKind((prev) => ({ ...prev, clinical: files }))}
            />
            <FilePicker
              kind="reference"
              files={filesByKind.reference}
              onChange={(files) => setFilesByKind((prev) => ({ ...prev, reference: files }))}
            />
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Your materials are used only to prepare your study and are never shared.
            </p>
            <Button type="submit" disabled={placeOrder.isPending}>
              {placeOrder.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              Submit order
            </Button>
          </CardFooter>
        </Card>}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order detail — status tracking + delivery
// ---------------------------------------------------------------------------

function StatusStepper({ status }: { status: OrderStatus }) {
  const step = STATUS_META[status].step;
  if (status === "cancelled") {
    return (
      <p className="text-sm font-medium text-destructive">
        This project was cancelled. Contact us if you have questions.
      </p>
    );
  }
  const steps = ["Submitted", "In production", "Ready for download"];
  return (
    <div className="flex items-center">
      {steps.map((label, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <div key={label} className={cn("flex items-center", index > 0 && "flex-1")}>
            {index > 0 && (
              <div
                className={cn(
                  "mx-2 h-0.5 flex-1 rounded",
                  done || current ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border text-xs font-semibold",
                  done && "border-transparent bg-primary text-primary-foreground",
                  current && "border-primary bg-primary/10 text-primary",
                  !done && !current && "border-border text-muted-foreground",
                )}
              >
                {done ? <CheckCircle2 className="size-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  current ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OrderDetailPage({ orderId }: { orderId: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-order", orderId],
    queryFn: async () => {
      const result = await studentApi.getOrder(orderId);
      return result;
    },
    refetchInterval: (query) =>
      query.state.data?.order.status === "submitted" || query.state.data?.order.status === "in_production"
        ? 10_000
        : false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          This project could not be found.
        </CardContent>
      </Card>
    );
  }

  const { order, files } = data;
  const meta = STATUS_META[order.status];

  return (
    <div>
      <Link href="/student/orders" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-4 -ml-2 text-muted-foreground')}>
        <ArrowLeft className="size-4" /> My projects
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            {order.title}
          </h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {order.diagnosis ? `${order.diagnosis} · ` : ""}
          {order.program} · Submitted {formatDate(order.createdAt)}
        </p>
      </div>

      <Card className="mb-5">
        <CardContent className="space-y-4 py-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Project status</p>
            {order.note && (
              <span className="text-xs text-muted-foreground">
                Updated {formatDate(order.updatedAt)}
              </span>
            )}
          </div>
          <StatusStepper status={order.status} />
          {order.note && (
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm leading-relaxed">
              <span className="font-semibold">Note from our team: </span>
              {order.note}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {order.status === "submitted" &&
              "Your order has been received. Our academic team will begin work on your study shortly."}
            {order.status === "in_production" &&
              "Your study is being prepared now — every chapter grounded in the materials you provided."}
            {order.status === "ready" &&
              "Your completed study is ready. Download it below, and remember: the Viva Preparation Programme is available to make sure you can defend it with confidence."}
            {order.status === "cancelled" &&
              "This project was cancelled. Contact us if you have questions."}
          </p>
        </CardContent>
      </Card>

      {order.status === "ready" && order.delivery && (
        <Card className="mb-5 border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10">
                <CheckCircle2 className="size-6 text-primary" />
              </span>
              <div>
                <p className="font-semibold">Your completed study is ready</p>
                <p className="text-xs text-muted-foreground">
                  {order.delivery.filename} · {formatBytes(order.delivery.size)}
                </p>
              </div>
            </div>
            <Button
              onClick={() =>
                studentApi.downloadOrderStudy(order).catch((err) =>
                  toast.error(err instanceof Error ? err.message : "Download failed"),
                )
              }
            >
              <Download className="size-4" /> Download your study
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="text-base">What we received</CardTitle>
          <CardDescription>
            The documents you attached with this order — used to build your study around your
            patient and your school's format.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents were attached.</p>
          ) : (
            <div className="space-y-4">
              {(["guidelines", "clinical", "reference"] as const).map((kind) => {
                const kindFiles = files.filter((file) => file.kind === kind);
                if (kindFiles.length === 0) return null;
                return (
                  <div key={kind}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {FILE_KIND_LABELS[kind]}
                    </p>
                    <ul className="space-y-1.5">
                      {kindFiles.map((file) => (
                        <li key={file.id} className="flex items-center gap-2 text-sm">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatBytes(file.size)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <VivaPreparationPanel orderId={order.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Viva Preparation Programme — question bank + mock defense session
// ---------------------------------------------------------------------------

function VivaPreparationPanel({ orderId }: { orderId: number }) {
  const queryClient = useQueryClient();
  const viva = useQuery({
    queryKey: ["viva-bank", orderId],
    queryFn: () => studentApi.getVivaBank(orderId),
  });
  const generate = useMutation({
    mutationFn: (force: boolean) => studentApi.generateVivaBank(orderId, force),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["viva-bank", orderId] }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["viva-bank", orderId] }),
  });

  const bank = viva.data;
  const status = bank?.status ?? "none";

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10">
            <GraduationCap className="size-5 text-primary" />
          </span>
          <div>
            <CardTitle className="text-base">Viva Preparation Programme</CardTitle>
            <CardDescription>
              A mock defense built from your completed study — the questions a panel would
              actually ask, and the guidance to answer them.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viva.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading your viva preparation…
          </div>
        ) : status === "pending" || generate.isPending ? (
          <div className="flex items-center gap-3 py-6">
            <Loader2 className="size-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold">The panel is reviewing your study</p>
              <p className="text-xs text-muted-foreground">
                Building your question bank — this usually takes about a minute.
              </p>
            </div>
          </div>
        ) : status === "error" ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="leading-relaxed">
                {bank?.error ?? "Your question bank could not be prepared."}{" "}
                <span className="text-muted-foreground">Please try again.</span>
              </p>
            </div>
            <Button size="sm" onClick={() => generate.mutate(true)} disabled={!bank?.canGenerate}>
              <RotateCcw className="size-4" /> Try again
            </Button>
          </div>
        ) : status === "ready" && bank && bank.questions.length > 0 ? (
          <VivaBankReady questions={bank.questions} onRegenerate={() => generate.mutate(true)} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 py-2">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/10">
                <BookOpen className="size-4 text-primary" />
              </span>
              <div className="max-w-lg">
                <p className="text-sm font-semibold">
                  {bank?.canGenerate
                    ? "Your study is ready — build your defense now"
                    : "Opens once your completed study is delivered"}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The programme reviews your study and prepares the questions your panel is most
                  likely to ask — each with a guidance outline, organised by the categories real
                  viva panels probe.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => generate.mutate(false)} disabled={!bank?.canGenerate}>
              {bank?.canGenerate ? (
                <>
                  <ListChecks className="size-4" /> Build my question bank
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" /> Locked until delivery
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VivaBankReady({
  questions,
  onRegenerate,
}: {
  questions: studentApi.VivaQuestion[];
  /** Rebuild the bank from the study's latest content (shows the reviewing state). */
  onRegenerate: () => void;
}) {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, studentApi.VivaQuestion[]>();
    for (const q of questions) {
      const key = q.category || "Reflection & Viva Skills";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    return [...map.entries()];
  }, [questions]);

  return (
    <div className="space-y-5">
      {sessionStarted ? (
        <PracticeSession questions={questions} onExit={() => setSessionStarted(false)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Mock defense session</p>
              <p className="text-xs text-muted-foreground">
                {questions.length} questions · answer aloud, then reveal the guidance to check
                yourself
              </p>
            </div>
            <Button size="sm" onClick={() => setSessionStarted(true)}>
              <GraduationCap className="size-4" /> Start a practice session
            </Button>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="size-4 text-primary" /> Question bank by category
            </p>
            <div className="space-y-2">
              {categories.map(([category, categoryQuestions]) => {
                const isExpanded = expandedCategory === category;
                return (
                  <div key={category} className="rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setExpandedCategory(isExpanded ? null : category)}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium hover:bg-muted/50"
                    >
                      {category}
                      <span className="text-xs text-muted-foreground">
                        {categoryQuestions.length}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="space-y-2 border-t px-4 py-3">
                        {categoryQuestions.map((q, index) => (
                          <QuestionRow key={index} question={q} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Built from your study's current content — regenerate if your study changes before the
              viva.
            </p>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onRegenerate}>
              <RotateCcw className="size-3.5" /> Regenerate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionRow({ question }: { question: studentApi.VivaQuestion }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm"
      >
        <span className="font-medium">{question.question}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "Hide" : "Guidance"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-3">
          <p className="text-sm leading-relaxed whitespace-pre-line">{question.guidance}</p>
          {question.tip && (
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <span className="italic">{question.tip}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** One question at a time: answer aloud, reveal guidance, move on. */
function PracticeSession({
  questions,
  onExit,
}: {
  questions: studentApi.VivaQuestion[];
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const current = questions[index];

  const restart = () => {
    setIndex(0);
    setRevealed(false);
  };

  if (!current) {
    return (
      <div className="space-y-3 py-4 text-center">
        <CheckCircle2 className="mx-auto size-8 text-primary" />
        <p className="font-semibold">Session complete — well prepared.</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={restart}>
            <RotateCcw className="size-4" /> Run it again
          </Button>
          <Button variant="outline" size="sm" onClick={onExit}>
            Browse the full bank
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Question {index + 1} of {questions.length} · {current.category}
        </p>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onExit}>
          <X className="size-4" /> Exit session
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/30 px-5 py-6">
        <p className="font-serif text-lg font-medium leading-relaxed">{current.question}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Answer aloud as you would before your panel — then reveal the guidance.
        </p>
      </div>

      {revealed ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What a strong answer covers
          </p>
          <p className="rounded-lg border bg-card px-4 py-3 text-sm leading-relaxed whitespace-pre-line">
            {current.guidance}
          </p>
          {current.tip && (
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              <span className="italic">{current.tip}</span>
            </p>
          )}
          <Button
            size="sm"
            className="mt-1"
            onClick={() => {
              setRevealed(false);
              setIndex(index + 1);
            }}
          >
            {index + 1 === questions.length ? "Finish session" : "Next question"}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setRevealed(true)}>
          <Eye className="size-4" /> Reveal guidance
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Portal root — wouter sub-routing on /student/:page*
// ---------------------------------------------------------------------------

export function StudentPortal() {
  // Sub-routing: the portal lives under /student (nest route); parse the rest
  // of the path ourselves so we never depend on wouter's wildcard param
  // shape, which varies by version.
  const [location] = useLocation();
  // Location is absolute here, but the `nest` route may re-base it under
  // /student — strip both forms down to the subpage path.
  const rest = location.replace(/^\/student\/?/, "").replace(/^\//, "");

  let view: "login" | "register" | "orders" | "new" | "detail" = "orders";
  let orderId: number | null = null;
  if (rest === "login") view = "login";
  else if (rest === "register") view = "register";
  else if (rest === "orders" || rest === "") view = "orders";
  else if (rest === "orders/new") view = "new";
  else if (rest.startsWith("orders/")) {
    view = "detail";
    orderId = Number(rest.slice("orders/".length)) || null;
  }

  return (
    <AuthProvider>
      <PortalShell>
        {view === "login" && <LoginPage />}
        {view === "register" && <RegisterPage />}
        {view === "orders" && (
          <AuthGate>
            <OrdersList />
          </AuthGate>
        )}
        {view === "new" && (
          <AuthGate>
            <NewOrderPage />
          </AuthGate>
        )}
        {view === "detail" && orderId !== null && (
          <AuthGate>
            <OrderDetailPage orderId={orderId} />
          </AuthGate>
        )}
        {view === "detail" && orderId === null && <OrdersList />}
      </PortalShell>
    </AuthProvider>
  );
}
