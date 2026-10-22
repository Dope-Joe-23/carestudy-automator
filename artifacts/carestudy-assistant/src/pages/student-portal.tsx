/**
 * Student portal — sidebar layout with tab navigation.
 *
 * The workspace is the application home at `/` and the hub for every student
 * service; the other sections live under /student/*. Guests may browse the
 * workspace, while the remaining sections require a signed-in student.
 *
 * Tabs:
 * - Workspace (home) — account summary and study tools
 * - Projects — list of care study orders
 * - New Order — place a new order
 * - Downloads — delivered studies
 * - Order Detail / Preview — dynamic routes rendered without the sidebar
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
  MessageCircle,
  Presentation,
  FlaskConical,
  ListChecks as QuizIcon,
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
  LogOut,
  Menu,
  Plus,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
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
import { CollegeSelector } from "@/components/college-selector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { PinDownloadDialog } from "@/components/pin-download-dialog";
import { AuthDialog, type AuthMode } from "@/components/auth-dialog";
import { StudentPreviewPage } from "@/pages/student-preview";
import { DownloadHistoryPage } from "@/pages/download-history";

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
    "One chapter to be corrected. Upload only the chapter you want reviewed.",
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
    window.location.href = "/";
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

type TabId = "workspace" | "projects" | "downloads";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "workspace", label: "Study workspace", icon: MessageCircle },
  { id: "projects", label: "My projects", icon: ClipboardList },
  { id: "downloads", label: "Downloads", icon: Receipt },
];

function PortalSidebar({
  activeTab,
  onSelect,
  onPlaceOrder,
  onSignIn,
  onSignUp,
}: {
  activeTab: TabId | null;
  onSelect: (tab: TabId) => void;
  onPlaceOrder: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const { student, signOut } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/" className="px-2 py-1">
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={onPlaceOrder}>
                  <Plus className="size-4 shrink-0" />
                  <span>Place an order</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter>
        {!student && (
          <div className="space-y-2 px-3 py-2">
            <p className="text-xs text-muted-foreground">Browsing as a guest</p>
            <Button size="sm" className="w-full" onClick={onSignIn}>
              Sign in
            </Button>
            <Button size="sm" variant="outline" className="w-full" onClick={onSignUp}>
              Create an account
            </Button>
          </div>
        )}
        {student && (
          <div className="px-3 py-2">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {student.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{student.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {student.college}
                    </p>
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-56 p-1">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{student.name}</p>
                  <p className="text-xs text-muted-foreground">{student.email}</p>
                </div>
                <Separator />
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

// ---------------------------------------------------------------------------
// Mobile bottom navigation bar
// ---------------------------------------------------------------------------

function MobileBottomNav({ onPlaceOrder }: { onPlaceOrder: () => void }) {
  const [location] = useLocation();
  const isWorkspace =
    location === "/" || location === "/student" || location === "/student/" || location === "/student/workspace";
  const isNew = location === "/student/orders/new";
  const isDownloads = location === "/student/downloads";
  const isProjects = !isWorkspace && !isNew && !isDownloads && location.startsWith("/student");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur md:hidden">
      <div className="mx-auto flex h-14 max-w-lg items-stretch">
        <Link
          href="/"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
            isWorkspace ? "text-primary" : "text-muted-foreground",
          )}
        >
          <MessageCircle className="size-5" />
          <span>Workspace</span>
        </Link>
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
        <button
          type="button"
          onClick={onPlaceOrder}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors"
        >
          <Plus className="size-5" />
          <span>New order</span>
        </button>
        <Link
          href="/student/downloads"
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
            isDownloads ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Receipt className="size-5" />
          <span>Downloads</span>
        </Link>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function AuthGate({
  children,
  allowGuest = false,
  onSignIn,
}: {
  children: ReactNode;
  allowGuest?: boolean;
  onSignIn: () => void;
}) {
  const { student, ready } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!student) {
    if (allowGuest) return <>{children}</>;
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10">
            <Lock className="size-6 text-primary" />
          </span>
          <h2 className="font-serif text-lg font-semibold">Sign in to continue</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Your projects and downloads are private to your account. Sign in to pick up where you
            left off.
          </p>
          <Button className="mt-5" onClick={onSignIn}>
            Sign in <ArrowRight className="size-4" />
          </Button>
        </CardContent>
      </Card>
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

function OrdersList({
  onPlaceOrder,
  onStartCorrection,
}: {
  onPlaceOrder: () => void;
  onStartCorrection: () => void;
}) {
  const [, navigate] = useLocation();
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
          <Button onClick={onPlaceOrder}>
            <Plus className="size-4" /> Place an order
          </Button>
          <Button variant="outline" onClick={onStartCorrection}>
            <RotateCcw className="size-4" /> Make correction
          </Button>
        </div>
      </div>

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
            <Button className="mt-5" onClick={onPlaceOrder}>
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
                        {order.pin.set ? (
                          <>
                            <Download className="size-4" /> Download
                          </>
                        ) : (
                          <>
                            <Lock className="size-4" /> Locked
                          </>
                        )}
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
  const [correctionScope, setCorrectionScope] = useState<"chapter" | null>(null);
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
          files.push({ kind, filename: file.name, file });
        }
      }
      if (correctionScope && correctionFile) {
        files.push({ kind: "correction", filename: correctionFile.name, file: correctionFile });
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
      onClose?.();
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
          Close
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
            toast.error("Please choose the chapter correction option.");
            return;
          }
          if (correctionMode && !correctionFile) {
            toast.error("Please upload the chapter to correct.");
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
                <CollegeSelector
                  id="order-college"
                  value={college}
                  onChange={setCollege}
                  placeholder="Search for your institution…"
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
            <CardDescription>Upload one prepared chapter, then describe exactly what should change.</CardDescription>
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
            <Button
              type="button"
              size="sm"
              variant={correctionScope === "chapter" ? "default" : "outline"}
              onClick={() => setCorrectionScope(correctionScope === "chapter" ? null : "chapter")}
            >
              Correct a chapter
            </Button>
            {correctionScope && (
              <div className="space-y-2 rounded-lg border border-dashed p-4">
                <Label htmlFor="correction-file" className="text-xs">{FILE_KIND_LABELS.correction}</Label>
                <Input id="correction-file" type="file" accept=".pdf,.docx,.epub,.md,.markdown,.txt" onChange={(event) => setCorrectionFile(event.target.files?.[0] ?? null)} required />
                {correctionFile && <p className="text-xs text-muted-foreground">{correctionFile.name} · {formatBytes(correctionFile.size)}</p>}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Keep the upload to one chapter, preferably no more than about 7,000 words (roughly 15 to 20 pages).
                </p>
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
  const [pinDownloadOpen, setPinDownloadOpen] = useState(false);
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
              {order.pin.set ? (
                <Button variant="outline" onClick={() => setPinDownloadOpen(true)}>
                  <Download className="size-4" /> Download Word
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  title="Your completed study has not been delivered yet"
                >
                  <Lock className="size-4" /> Awaiting delivery
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {order.pin.released
                ? "Your academic team confirmed your payment — enter the PIN they gave you to export your study."
                : order.pin.set
                  ? "Enter the download PIN your academic team gave you to export your study."
                  : "Your completed study will appear here once it is delivered."}
            </p>
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

      <PinDownloadDialog
        open={pinDownloadOpen}
        onClose={() => setPinDownloadOpen(false)}
        order={order}
      />
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
// Student workspace
// ---------------------------------------------------------------------------

function StudentWorkspace({
  onPlaceOrder,
  onSignIn,
  onSignUp,
}: {
  onPlaceOrder: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const { student } = useAuth();
  const firstName = student?.name.trim().split(/\s+/)[0];
  const tools: {
    title: string;
    description: string;
    action: string;
    icon: React.ElementType;
    ready: boolean;
    href?: string;
    onClick?: () => void;
  }[] = [
    { title: "Care-study service", description: "Place an order, follow its progress, and open a delivered study.", onClick: onPlaceOrder, action: "Start an order", icon: HeartPulse, ready: true },
    { title: "Study with NurseFlow", description: "Practice with the existing nursing question bank and revision tools.", href: "/nurseflow", action: "Open NurseFlow", icon: QuizIcon, ready: true },
    { title: "Assignment assistant", description: "Plan and refine an assignment with your course brief.", action: "Coming soon", icon: BookOpen, ready: false },
    { title: "Presentation assistant", description: "Build a clear presentation outline from your topic.", action: "Coming soon", icon: Presentation, ready: false },
    { title: "Research projects", description: "Organize a research question and project materials.", action: "Coming soon", icon: FlaskConical, ready: false },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-2 sm:py-6">
      <section className="rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">NurseAid student workspace</p>
        <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">
          Welcome{firstName ? `, ${firstName}` : ""}. What are you studying today?
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {student
            ? "Start a care-study order, practice nursing questions, or return to your existing work. Your student services remain available directly from this workspace."
            : "You're browsing as a guest. Sign in to order a care study, follow its progress, and download your work."}
        </p>
        {student ? (
          <div className="mt-6 rounded-xl border bg-background p-3 shadow-sm">
            <div className="flex min-h-14 items-center gap-3 rounded-lg bg-muted/40 px-4">
              <MessageCircle className="size-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">General NurseAid chat is not connected yet. Choose a live tool below to continue.</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="gap-2" onClick={onPlaceOrder}><HeartPulse className="size-4" /> Start a care study</Button>
              <Link href="/student/orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}><ClipboardList className="size-4" /> View my orders</Link>
              <Link href="/nurseflow" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}><QuizIcon className="size-4" /> Practice MCQs</Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button size="sm" className="gap-2" onClick={onSignIn}><ShieldCheck className="size-4" /> Sign in</Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={onSignUp}>Create an account</Button>
            <Link href="/nurseflow" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}><QuizIcon className="size-4" /> Practice MCQs</Link>
          </div>
        )}
      </section>

      {student && (
        <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {student.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{student.name}</p>
            <p className="truncate text-sm text-muted-foreground">{student.email}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[student.college, student.program, student.year ? `Year ${student.year}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Student</Badge>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Study tools</h2>
            <p className="mt-1 text-sm text-muted-foreground">Connected services are ready to use. Other assistants are clearly marked as planned.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => {
            const Icon = tool.icon;
            const content = (
              <div className={cn("flex h-full flex-col rounded-xl border bg-card p-4 transition-colors", tool.ready && "hover:border-primary/40 hover:bg-accent/30")}>
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
                  <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", tool.ready ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{tool.ready ? "Available" : "Planned"}</span>
                </div>
                <h3 className="mt-4 font-semibold">{tool.title}</h3>
                <p className="mt-1 min-h-10 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">{tool.action}{tool.ready && <ArrowRight className="size-4" />}</span>
              </div>
            );
            if (!tool.ready) return <div key={tool.title} aria-disabled="true">{content}</div>;
            if (tool.onClick) {
              return (
                <button key={tool.title} type="button" onClick={tool.onClick} className="block w-full text-left">
                  {content}
                </button>
              );
            }
            return <Link key={tool.title} href={tool.href ?? "/"} className="block">{content}</Link>;
          })}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/student/orders" className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-accent/30">
          <span className="grid size-10 place-items-center rounded-lg bg-muted"><ClipboardList className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium">My care-study orders</span><span className="mt-1 block text-sm text-muted-foreground">Track status and open order details</span></span><ArrowRight className="size-4 text-muted-foreground" />
        </Link>
        <Link href="/student/downloads" className="flex items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-accent/30">
          <span className="grid size-10 place-items-center rounded-lg bg-muted"><Download className="size-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium">Study downloads</span><span className="mt-1 block text-sm text-muted-foreground">Review delivered studies and access status</span></span><ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      </section>
    </div>
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
  const [location, navigate] = useLocation();
  const { student, signIn } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [orderDialog, setOrderDialog] = useState<null | "order" | "correction">(null);
  // The staff invite that arrived with a /student/register link.
  const [inviteToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("staff");
  });

  // Sign-in, registration, and the order form are dialogs. Their old URLs stay
  // working: open the matching dialog, then settle on the real destination.
  // A layout effect so the dialog is already open on the first paint.
  useLayoutEffect(() => {
    if (location === "/login") {
      setAuthMode("sign-in");
      navigate("/", { replace: true });
    } else if (location === "/student/register") {
      setAuthMode("sign-up");
      navigate("/", { replace: true });
    } else if (location === "/student/orders/new") {
      if (student) setOrderDialog("order");
      else setAuthMode("sign-in");
      navigate("/student/orders", { replace: true });
    }
  }, [location, navigate, student]);

  const openSignIn = () => setAuthMode("sign-in");
  const openSignUp = () => setAuthMode("sign-up");
  // Guests are asked to sign in before the order form opens.
  const openOrder = () => {
    if (student) setOrderDialog("order");
    else setAuthMode("sign-in");
  };
  const closeAuth = () => setAuthMode(null);
  const closeOrder = () => setOrderDialog(null);

  // Route parsing
  const matchPreview = location.match(/^\/student\/orders\/(\d+)\/preview$/);
  const matchOrder = location.match(/^\/student\/orders\/(\d+)$/);
  const matchWorkspace =
    location === "/" || location === "/student" || location === "/student/" || location === "/student/workspace";
  const matchDownloads = location === "/student/downloads";

  const activeTab: TabId = matchWorkspace
    ? "workspace"
    : matchDownloads
      ? "downloads"
      : "projects";

  const handleTabSelect = (tab: TabId) => {
    if (tab === "workspace") navigate("/");
    else if (tab === "projects") navigate("/student/orders");
    else if (tab === "downloads") navigate("/student/downloads");
  };

  const authDialog = (
    <AuthDialog
      open={authMode !== null}
      mode={authMode ?? "sign-in"}
      onModeChange={setAuthMode}
      onClose={closeAuth}
      onStudentSignedIn={signIn}
      staffToken={inviteToken}
    />
  );

  const orderDialogEl = (
    <Dialog
      open={orderDialog !== null}
      onOpenChange={(open) => {
        if (!open) closeOrder();
      }}
    >
      <DialogContent className={orderDialog === "correction" ? "max-w-2xl" : "max-w-3xl"}>
        <DialogHeader className={orderDialog === "correction" ? undefined : "sr-only"}>
          <DialogTitle>{orderDialog === "correction" ? "Make a correction" : "Place an order"}</DialogTitle>
          <DialogDescription>
            {orderDialog === "correction"
              ? "Upload one prepared chapter and describe the changes required."
              : "Submit a new care study order."}
          </DialogDescription>
        </DialogHeader>
        {orderDialog === "correction" ? (
          <NewOrderPage correctionMode onClose={closeOrder} />
        ) : orderDialog === "order" ? (
          <NewOrderPage onClose={closeOrder} />
        ) : null}
      </DialogContent>
    </Dialog>
  );

  // The study preview is a full-screen reading mode.
  if (matchPreview) {
    return (
      <div className="min-h-screen bg-background">
        <AuthGate onSignIn={openSignIn}>
          <StudentPreviewPage orderId={Number(matchPreview[1])} />
        </AuthGate>
        <MobileBottomNav onPlaceOrder={openOrder} />
        <div className="h-14 md:hidden" />
        {authDialog}
        {orderDialogEl}
      </div>
    );
  }

  let content: ReactNode;
  if (activeTab === "workspace") {
    content = (
      <StudentWorkspace onPlaceOrder={openOrder} onSignIn={openSignIn} onSignUp={openSignUp} />
    );
  } else if (activeTab === "downloads") {
    content = <DownloadHistoryPage />;
  } else if (matchOrder) {
    content = <OrderDetailPage orderId={Number(matchOrder[1])} />;
  } else {
    content = (
      <OrdersList onPlaceOrder={openOrder} onStartCorrection={() => setOrderDialog("correction")} />
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-background">
        <PortalSidebar
          activeTab={activeTab}
          onSelect={handleTabSelect}
          onPlaceOrder={openOrder}
          onSignIn={openSignIn}
          onSignUp={openSignUp}
        />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/95 backdrop-blur px-4 md:hidden">
            <SidebarTrigger />
            <BrandMark compact />
          </header>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-6 md:pb-6">
              <AuthGate allowGuest={activeTab === "workspace"} onSignIn={openSignIn}>
                {content}
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
      <MobileBottomNav onPlaceOrder={openOrder} />
      <div className="h-14 md:hidden" />
      {authDialog}
      {orderDialogEl}
    </SidebarProvider>
  );
}
