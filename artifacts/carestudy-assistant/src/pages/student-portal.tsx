/**
 * Student portal — sidebar layout with tab navigation.
 *
 * Accessible at /student/*  Left sidebar has navigation items;
 * the right content area renders the active section.
 *
 * Tabs:
 * - Projects (default) — list of care study orders
 * - New Order — place a new order
 * - Order Detail — view a specific order (dynamic route)
 * - Payments — payment history
 * - Preview — study preview (dynamic route)
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
  Lock,
  Loader2,
  Menu,
  Plus,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import * as studentApi from "@/lib/studentApi";
import { StudentPreviewPage } from "@/pages/student-preview";
import { PaymentHistoryPage } from "@/pages/payment-history";

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
    window.location.href = "/login";
  }, []);

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
// Sidebar navigation
// ---------------------------------------------------------------------------

type TabId = "projects" | "new-order" | "payments";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "projects", label: "My projects", icon: ClipboardList },
  { id: "new-order", label: "Place an order", icon: Plus },
  { id: "payments", label: "Payments", icon: Receipt },
];

function PortalSidebar({
  activeTab,
  onSelect,
}: {
  activeTab: TabId | null;
  onSelect: (tab: TabId) => void;
}) {
  const { student, signOut } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/student/orders" className="px-2 py-1">
          <BrandMark />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <SidebarMenuItem key={tab.id}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => onSelect(tab.id)}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{tab.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        {student && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {student.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{student.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {student.college}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-start gap-2 text-muted-foreground"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom navigation bar
// ---------------------------------------------------------------------------

function MobileBottomNav() {
  const [location] = useLocation();
  const isNew = location === "/student/orders/new";
  const isPayments = location === "/student/payments";
  const isProjects = !isNew && !isPayments && location.startsWith("/student");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
      <div className="mx-auto flex h-14 max-w-lg items-stretch">
        <Link
          href="/student/orders"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
            isProjects ? "text-primary" : "text-muted-foreground",
          )}
        >
          <ClipboardList className="size-5" />
          <span>Projects</span>
        </Link>
        <Link
          href="/student/orders/new"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
            isNew ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Plus className="size-5" />
          <span>New order</span>
        </Link>
        <Link
          href="/student/payments"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
            isPayments ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Receipt className="size-5" />
          <span>Payments</span>
        </Link>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function AuthGate({ children }: { children: ReactNode }) {
  const { student, ready } = useAuth();
  useEffect(() => {
    if (ready && !student) window.location.href = "/login";
  }, [ready, student]);
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
                <div className="flex items-center gap-2">
                  {order.status === "ready" && order.delivery && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/student/orders/${order.id}/preview`);
                        }}
                      >
                        <Eye className="size-4" /> Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/student/orders/${order.id}/preview`);
                        }}
                      >
                        <Lock className="size-4" /> Purchase
                      </Button>
                    </>
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
          <CardContent className="space-y-4 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild>
                <Link href={`/student/orders/${order.id}/preview`}>
                  <Eye className="size-4" /> Preview study
                </Link>
              </Button>
              {order.paymentStatus === "verified" ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    studentApi.downloadOrderStudy(order).catch((err) =>
                      toast.error(err instanceof Error ? err.message : "Download failed"),
                    )
                  }
                >
                  <Download className="size-4" /> Download Word
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href={`/student/orders/${order.id}/preview`}>
                    <Lock className="size-4" /> Purchase to download
                  </Link>
                </Button>
              )}
            </div>
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
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10">
            <GraduationCap className="size-5 text-primary" />
          </span>
          <div>
            <CardTitle className="text-base">Viva Preparation Programme</CardTitle>
            <CardDescription>
              Practice defending your care study with a mock question bank.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {status === "none" && !bank?.canGenerate && (
          <p className="text-sm text-muted-foreground">
            Viva preparation will be available once your study is delivered and produced.
          </p>
        )}
        {status === "none" && bank?.canGenerate && (
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Generate a question bank based on your study content.
            </p>
            <Button size="sm" onClick={() => generate.mutate(false)} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />}
              Generate questions
            </Button>
          </div>
        )}
        {status === "pending" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Generating your question bank…
          </div>
        )}
        {status === "ready" && bank && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm">
                <span className="font-semibold">{bank.questions.length} questions</span>{" "}
                across your study content.
              </p>
              <Button size="sm" variant="outline" onClick={() => generate.mutate(true)} disabled={generate.isPending}>
                {generate.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                Regenerate
              </Button>
            </div>
            <div className="space-y-2">
              {bank.questions.map((q, i) => (
                <Card key={i}>
                  <CardContent className="py-3">
                    <Badge variant="secondary" className="mb-1.5 text-[10px]">{q.category}</Badge>
                    <p className="text-sm font-medium">{q.question}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{q.guidance}</p>
                    {q.tip && (
                      <p className="mt-1 text-xs italic text-primary/80">💡 {q.tip}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              {bank?.error ?? "Failed to generate questions."}
            </p>
            <Button size="sm" variant="outline" onClick={() => generate.mutate(true)} disabled={generate.isPending}>
              Try again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function StudentPortal() {
  return (
    <AuthProvider>
      <StudentPortalRouter />
    </AuthProvider>
  );
}

function StudentPortalRouter() {
  const [location] = useLocation();
  const [, navigate] = useLocation();

  // Route parsing
  const matchPreview = location.match(/^\/student\/orders\/(\d+)\/preview$/);
  const matchPayments = location === "/student/payments";
  const matchNew = location === "/student/orders/new";
  const matchOrder = location.match(/^\/student\/orders\/(\d+)$/);

  // Determine active tab
  const activeTab: TabId | null = matchPayments
    ? "payments"
    : matchNew
      ? "new-order"
      : "projects";

  const handleTabSelect = (tab: TabId) => {
    if (tab === "projects") navigate("/student/orders");
    else if (tab === "new-order") navigate("/student/orders/new");
    else if (tab === "payments") navigate("/student/payments");
  };

  // Full-page routes (preview, order detail) render without sidebar
  const isFullPage = Boolean(matchPreview) || Boolean(matchOrder);

  if (isFullPage) {
    return (
      <div className="min-h-screen bg-background">
        <AuthGate>
          {matchPreview && <StudentPreviewPage orderId={Number(matchPreview[1])} />}
          {matchOrder && <OrderDetailPage orderId={Number(matchOrder[1])} />}
        </AuthGate>
        <MobileBottomNav />
        <div className="h-14 md:hidden" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <PortalSidebar activeTab={activeTab} onSelect={handleTabSelect} />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/95 backdrop-blur px-4 md:hidden">
            <SidebarTrigger />
            <BrandMark compact />
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6 md:pb-6">
              <AuthGate>
                {activeTab === "projects" && <OrdersList />}
                {activeTab === "new-order" && <NewOrderPage />}
                {activeTab === "payments" && <PaymentHistoryPage />}
              </AuthGate>
            </div>
          </main>
          <footer className="hidden md:block">
            <div className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
              <Separator className="mb-6" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                CareStudy Institute supports nursing education — preparing the study, and preparing you to
                defend it. Your materials stay yours and are used only to prepare your study.
              </p>
            </div>
          </footer>
        </SidebarInset>
      </div>
      <MobileBottomNav />
      <div className="h-14 md:hidden" />
    </SidebarProvider>
  );
}
