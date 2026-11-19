/**
 * Student portal — sidebar layout with tab navigation.
 *
 * The workspace lives at `/chat` and is the hub for every student service.
 * Guests may browse the
 * workspace, while the remaining sections require a signed-in student.
 *
 * Tabs:
 * - Workspace (home) — Nursuit chat
 * - Explore — available and planned student tools
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
  lazy,
  Suspense,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
} from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  BookOpen,
  MessageCircle,
  Presentation,
  FlaskConical,
  ListChecks as QuizIcon,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  Download,
  Eye,
  Compass,
  FileText,
  GraduationCap,
  Globe2,
  Highlighter,
  HeartPulse,
  ImagePlus,
  ListChecks,
  Lock,
  Italic,
  List as ListIcon,
  ListOrdered,
  Loader2,
  LogOut,
  MoreHorizontal,
  Pencil,
  Paperclip,
  Printer,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShieldCheck,
  Strikethrough,
  Trash2,
  Undo2,
  Redo2,
  Send,
  MessageSquareText,
  Moon,
  Sun,
  UserPlus,
  Underline,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useSidebar,
} from "@/components/ui/sidebar";
import * as studentApi from "@/lib/studentApi";
import { getPaystackKey, payWithPaystack } from "@/lib/paystack";
import { PinDownloadDialog } from "@/components/pin-download-dialog";
import { AuthDialog, type AuthMode } from "@/components/auth-dialog";
import {
  StudentDocumentRichEditor,
  type StudentDocumentRichEditorHandle,
} from "@/components/student-document-rich-editor";
import { splitAssistantDocumentBlocks } from "@/components/assistant-markdown-html";
import {
  formatStudentChapterContent,
  markdownFromEditorHtml,
} from "@/lib/studentDocumentMarkdown";
import { StudentPreviewPage } from "@/pages/student-preview";
import { DownloadHistoryPage } from "@/pages/download-history";

const AssistantMarkdown = lazy(() => import("@/components/assistant-markdown"));

function FormattedAssistantMarkdown({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <Suspense fallback={<p className="py-2 text-sm text-muted-foreground">Preparing formatted answer…</p>}>
      <AssistantMarkdown text={text} style={style} />
    </Suspense>
  );
}

function StudentDocumentMarkdown({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <div className="student-document-markdown">
      {splitAssistantDocumentBlocks(text).map((block, index) => {
        const paragraphStyle: CSSProperties = {
          ...style,
          ...(block.style.align ? { textAlign: block.style.align } : {}),
          ...(block.style.spacing !== undefined ? { lineHeight: block.style.spacing } : {}),
          ...(block.style.indent !== undefined ? { textIndent: `${block.style.indent}in` } : {}),
        };
        return <FormattedAssistantMarkdown key={index} text={block.content} style={paragraphStyle} />;
      })}
    </div>
  );
}

type PreviewToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  highlight: boolean;
  unorderedList: boolean;
  orderedList: boolean;
  alignment: "left" | "center" | "right" | "justify";
};

const EMPTY_PREVIEW_TOOLBAR_STATE: PreviewToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  highlight: false,
  unorderedList: false,
  orderedList: false,
  alignment: "justify",
};

function selectionElement(selection: Selection | null): HTMLElement | null {
  const node = selection?.focusNode ?? selection?.anchorNode;
  if (!node) return null;
  return node.nodeType === Node.TEXT_NODE
    ? node.parentElement
    : node instanceof HTMLElement
      ? node
      : null;
}

function selectionBlock(editor: HTMLElement, element: HTMLElement | null): HTMLElement | null {
  if (!element || !editor.contains(element)) return null;
  let current: HTMLElement | null = element;
  while (current && current !== editor) {
    if (/^(?:blockquote|h[1-6]|li|p|pre|td|th)$/.test(current.tagName.toLowerCase())) {
      return current;
    }
    current = current.parentElement;
  }
  return editor;
}

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
function BrandMark({
  compact = false,
  compactOnCollapse = false,
}: {
  compact?: boolean;
  compactOnCollapse?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandLogo className="size-14 group-data-[collapsible=icon]:size-10" />
      {!compact && (
        <span className={compactOnCollapse ? "group-data-[collapsible=icon]:hidden" : undefined}>
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
    window.location.href = "/chat";
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

type TabId = "workspace" | "new-chat" | "explore" | "projects" | "downloads";

type StudentChatNavigation = {
  activeChatId: number | null;
  chatBusy: boolean;
  newChatRequest: number;
  openChat: (id: number) => void;
  startNewChat: () => void;
  setActiveChatId: (id: number | null) => void;
  setChatBusy: (busy: boolean) => void;
};

const StudentChatNavigationContext = createContext<StudentChatNavigation | null>(null);

function useStudentChatNavigation() {
  const context = useContext(StudentChatNavigationContext);
  if (!context) throw new Error("Student chat navigation must be used inside its provider.");
  return context;
}

const TABS: { id: TabId; label: string; tooltip: string; icon: React.ElementType }[] = [
  { id: "workspace", label: "Study workspace", tooltip: "Ask Nursuit and continue your conversations", icon: MessageCircle },
  { id: "new-chat", label: "New chat", tooltip: "Start a new Nursuit conversation", icon: Plus },
  { id: "explore", label: "Explore", tooltip: "Browse learning tools and student services", icon: Compass },
  { id: "projects", label: "My projects", tooltip: "Track your care-study orders and projects", icon: ClipboardList },
  { id: "downloads", label: "Downloads", tooltip: "Open delivered studies and files", icon: Receipt },
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
  const { setOpen } = useSidebar();
  const [isTablet, setIsTablet] = useState(() =>
    typeof window !== "undefined" && window.innerWidth >= 768 && window.innerWidth < 1024,
  );
  const wasTablet = useRef(isTablet);
  const chatNavigation = useStudentChatNavigation();
  const chatsQuery = useQuery({
    queryKey: ["studentAssistantChats", student?.id],
    queryFn: studentApi.listStudentChats,
    enabled: Boolean(student),
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const updateTabletLayout = () => {
      const matches = mediaQuery.matches;
      setIsTablet(mediaQuery.matches);
      if (matches && !wasTablet.current) setOpen(false);
      wasTablet.current = matches;
    };
    updateTabletLayout();
    mediaQuery.addEventListener("change", updateTabletLayout);
    return () => mediaQuery.removeEventListener("change", updateTabletLayout);
  }, [setOpen]);

  const deleteChat = async (id: number, title: string) => {
    if (!window.confirm(`Delete “${title}” and its saved messages? This cannot be undone.`)) return;
    try {
      await studentApi.deleteStudentChat(id);
      if (chatNavigation.activeChatId === id) chatNavigation.startNewChat();
      await queryClient.invalidateQueries({ queryKey: ["studentAssistantChats"] });
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Could not delete that conversation.");
    }
  };

  return (
    <Sidebar collapsible={isTablet ? "offcanvas" : "icon"}>
      <SidebarHeader className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-1">
        <Link href="/" className="px-2 py-1 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
          <BrandMark compactOnCollapse />
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
                      tooltip={tab.tooltip}
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
        {student && (
          <SidebarGroup>
            <SidebarGroupLabel>Your chats</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {chatsQuery.isLoading && (
                  <p className="px-2 py-2 text-xs text-sidebar-foreground/60">Loading chats…</p>
                )}
                {chatsQuery.isError && (
                  <p className="px-2 py-2 text-xs text-destructive">Could not load chat history.</p>
                )}
                {!chatsQuery.isLoading && !chatsQuery.isError && !chatsQuery.data?.chats.length && (
                  <p className="px-2 py-2 text-xs leading-relaxed text-sidebar-foreground/60">
                    Your conversations will appear here.
                  </p>
                )}
                {chatsQuery.data?.chats.map((chat) => (
                  <SidebarMenuItem key={chat.id} className="group/chat relative">
                    <SidebarMenuButton
                      isActive={chatNavigation.activeChatId === chat.id}
                      disabled={chatNavigation.chatBusy}
                      onClick={() => chatNavigation.openChat(chat.id)}
                      tooltip={chat.title}
                      className="pr-8"
                    >
                      <MessageSquareText className="size-4 shrink-0" />
                      <span className="truncate">{chat.title}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-1 top-1.5 z-10 grid size-6 place-items-center rounded text-sidebar-foreground/60 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 group-hover/chat:opacity-100 group-focus-within/chat:opacity-100 data-[state=open]:opacity-100 group-data-[collapsible=icon]:hidden"
                          aria-label={`Options for ${chat.title}`}
                          disabled={chatNavigation.chatBusy}
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" side="right">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => void deleteChat(chat.id, chat.title)}
                        >
                          <Trash2 className="size-4" /> Delete chat
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
          <div className="px-3 py-2 group-data-[collapsible=icon]:px-0">
            <div className="space-y-2 group-data-[collapsible=icon]:hidden">
              <p className="text-xs text-muted-foreground">Browsing as a guest</p>
              <Button size="sm" className="w-full" onClick={onSignIn}>
                Sign in
              </Button>
              <Button size="sm" variant="outline" className="w-full" onClick={onSignUp}>
                Create an account
              </Button>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="hidden group-data-[collapsible=icon]:inline-flex"
              aria-label="Create an account"
              title="Create an account"
              onClick={onSignUp}
            >
              <UserPlus className="size-4" />
            </Button>
          </div>
        )}
        {student && (
          <div className="px-3 py-2 group-data-[collapsible=icon]:p-0">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {student.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
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
              onClick={() => navigate(`/chat/orders/${order.id}`)}
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
                          navigate(`/chat/orders/${order.id}/preview`);
                        }}
                      >
                        <Eye className="size-4" /> Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/chat/orders/${order.id}/preview`);
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
      navigate(`/chat/orders/${result.order.id}`, { replace: true });
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
        <Link href="/chat/orders" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-4 -ml-2 text-muted-foreground')}>
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
      <Link href="/chat/orders" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-4 -ml-2 text-muted-foreground')}>
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
                <Link href={`/chat/orders/${order.id}/preview`}>
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

type AssistantTurn = studentApi.StudentChatMessage & {
  attachmentFile?: File;
  attachmentFiles?: File[];
};

function isRewriteRequest(message: string): boolean {
  return /\b(?:rewrit\w*|revis\w*|correct\w*|edit\w*|improv\w*|polish\w*)\b/i.test(message);
}

function isRewriteClarification(answer: string): boolean {
  return /\b(?:could you (?:please )?(?:let me know|clarify)|which part(?:s)? .* (?:would you like|should I)|what part(?:s)? .* (?:would you like|should I)|please specify (?:which|the))\b/i.test(answer);
}

function AttachmentPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const fileType = file.name.split(".").pop()?.toUpperCase() || "FILE";
  const fileSize = file.size < 1024 * 1024
    ? `${Math.max(1, Math.round(file.size / 1024))} KB`
    : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-background/80 px-2 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={file.name}>{file.name}</span>
        <span className="block text-xs text-muted-foreground">{fileType} · {fileSize}</span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        title="Remove attachment"
        onClick={onRemove}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function StudentAssistantChat() {
  const queryClient = useQueryClient();
  const { student } = useAuth();
  const chatNavigation = useStudentChatNavigation();
  const studentIdRef = useRef(student?.id ?? null);
  const [messages, setMessages] = useState<AssistantTurn[]>([]);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const pendingPromptScrollIndexRef = useRef<number | null>(null);
  const pendingResponseScrollIndexRef = useRef<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [cadreProfileId, setCadreProfileId] = useState("registered_general_nurse");
  const [webSearchMode, setWebSearchMode] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [printAnswer, setPrintAnswer] = useState<{
    title: string;
    answer: string;
    references: studentApi.AssistantReference[];
  } | null>(null);
  const [rewritePreview, setRewritePreview] = useState<{
    title: string;
    work: studentApi.StudentDocumentWork;
    chatId: number;
    messageIndex: number;
    chapterIndex: number;
  } | null>(null);
  const [previewPageImages, setPreviewPageImages] = useState<Record<string, string[]>>({});
  const [previewImageLoading, setPreviewImageLoading] = useState<Record<string, boolean>>({});
  const [previewImageErrors, setPreviewImageErrors] = useState<Record<string, string>>({});
  const [legacyRewritePreview, setLegacyRewritePreview] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [documentWorkType, setDocumentWorkType] = useState<"correction" | "rewrite" | "">("");
  const [previewDraft, setPreviewDraft] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [previewSaveStatus, setPreviewSaveStatus] = useState<"saved" | "unsaved" | "saving" | "error">("saved");
  const [previewFont, setPreviewFont] = useState("Times New Roman");
  const [previewFontSize, setPreviewFontSize] = useState(12);
  const [previewLineSpacing, setPreviewLineSpacing] = useState(2);
  const [previewIndent, setPreviewIndent] = useState(0);
  const [previewBottomMargin, setPreviewBottomMargin] = useState(1);
  const [previewAlignment, setPreviewAlignment] = useState<"left" | "center" | "right" | "justify">("justify");
  const previewEditorRef = useRef<StudentDocumentRichEditorHandle>(null);
  const [previewEditorRevision, setPreviewEditorRevision] = useState(0);
  const [previewTextSelected, setPreviewTextSelected] = useState(false);
  const [previewEditingActive, setPreviewEditingActive] = useState(false);
  const [previewToolbarState, setPreviewToolbarState] = useState(EMPTY_PREVIEW_TOOLBAR_STATE);
  const [previewToolbarOpen, setPreviewToolbarOpen] = useState(false);
  const previewAutosaveRevisionRef = useRef(0);
  const previewAutosaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [previewUndoStack, setPreviewUndoStack] = useState<string[]>([]);
  const [previewRedoStack, setPreviewRedoStack] = useState<string[]>([]);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewSearchIndex, setPreviewSearchIndex] = useState(0);
  const assistantToolsQuery = useQuery({
    queryKey: ["studentAssistantTools"],
    queryFn: studentApi.getStudentAssistantTools,
    staleTime: 60_000,
  });
  const welcomeName = student?.name.trim().split(/\s+/)[0] || student?.username.trim();
  const lastAttachedFiles = messages
    .slice()
    .reverse()
    .find((turn) => turn.role === "user" && turn.attachmentFiles?.length)?.attachmentFiles;

  useEffect(() => {
    if (assistantToolsQuery.isError) toast.error("Could not check tool availability.");
  }, [assistantToolsQuery.isError]);

  useEffect(() => {
    const promptIndex = pendingPromptScrollIndexRef.current;
    const responseIndex = pendingResponseScrollIndexRef.current;
    const targetIndex = promptIndex ?? responseIndex;
    if (targetIndex === null) return;
    const scrollFrame = window.requestAnimationFrame(() => {
      const scrollContainer = chatScrollRef.current;
      const target = scrollContainer?.querySelector<HTMLElement>(
        `[data-chat-message-index="${targetIndex}"]`,
      );
      if (!scrollContainer || !target) return;
      const containerTop = scrollContainer.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + targetTop - containerTop - 12,
        behavior: "smooth",
      });
      if (promptIndex !== null) {
        pendingPromptScrollIndexRef.current = null;
      } else {
        pendingResponseScrollIndexRef.current = null;
      }
    });
    return () => window.cancelAnimationFrame(scrollFrame);
  }, [messages, busy]);

  useEffect(() => {
    const nextStudentId = student?.id ?? null;
    if (studentIdRef.current === nextStudentId) return;
    studentIdRef.current = nextStudentId;
    pendingPromptScrollIndexRef.current = null;
    pendingResponseScrollIndexRef.current = null;
    setConversationId(null);
    setMessages([]);
    setSourcesOpen(null);
    setPrompt("");
    setAttachments([]);
    setEditingIndex(null);
    setPrintAnswer(null);
    setPreviewPageImages({});
    setPreviewImageLoading({});
    setPreviewImageErrors({});
    chatNavigation.setActiveChatId(null);
  }, [student?.id, chatNavigation.setActiveChatId]);

  useEffect(() => {
    if (!printAnswer) return;
    const finishPrint = () => {
      document.body.classList.remove("print-chat-answer");
      setPrintAnswer(null);
    };
    document.body.classList.add("print-chat-answer");
    window.addEventListener("afterprint", finishPrint);
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finishPrint);
      document.body.classList.remove("print-chat-answer");
    };
  }, [printAnswer]);

  useEffect(() => {
    if (chatNavigation.activeChatId === null || chatNavigation.activeChatId === conversationId || busy) return;
    void openSavedChat(chatNavigation.activeChatId);
  }, [chatNavigation.activeChatId, conversationId, busy]);

  useEffect(() => {
    if (chatNavigation.newChatRequest === 0) return;
    pendingPromptScrollIndexRef.current = null;
    pendingResponseScrollIndexRef.current = null;
    setConversationId(null);
    setMessages([]);
    setSourcesOpen(null);
    setPreviewPageImages({});
    setPreviewImageLoading({});
    setPreviewImageErrors({});
    setPrompt("");
    setAttachments([]);
    setEditingIndex(null);
  }, [chatNavigation.newChatRequest]);

  const encodeAttachment = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) throw new Error("Files must be no larger than 10 MB.");
    return {
      filename: file.name,
      content: await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string") {
            reject(new Error("Could not read the selected file."));
            return;
          }
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      }),
    };
  };

  const ask = async (
    message: string,
    history: AssistantTurn[],
    files: File[] = [],
    replaceFromIndex?: number,
    tool: "web" | "image" | null = webSearchMode ? "web" : null,
    documentWorkRequest?: { type: "correction" | "rewrite"; scope: "chapters" },
  ) => {
    if (busy) return;
    const requestStudentId = student?.id ?? null;
    setBusy(true);
    chatNavigation.setChatBusy(true);
    const userTurn: AssistantTurn = {
      role: "user",
      content: message,
      attachmentName: files.length === 1 ? files[0].name : undefined,
      attachmentNames: files.map((file) => file.name),
      attachmentFile: files[0],
      attachmentFiles: files,
    };
    pendingPromptScrollIndexRef.current = replaceFromIndex ?? history.length;
    if (replaceFromIndex === undefined) {
      setMessages((current) => [...current, userTurn]);
    } else {
      setMessages((current) => [...current.slice(0, replaceFromIndex), userTurn]);
    }
    try {
      const savedMessages: studentApi.StudentChatMessage[] = [
        ...history.map(({ role, content, attachmentName, attachmentNames, references, imageDataUrl }) => ({
          role,
          content,
          ...(attachmentName ? { attachmentName } : {}),
          ...(attachmentNames?.length ? { attachmentNames } : {}),
          ...(references ? { references } : {}),
          ...(imageDataUrl ? { imageDataUrl } : {}),
        })),
        {
          role: "user",
          content: message,
          ...(files.length === 1 ? { attachmentName: files[0].name } : {}),
          ...(files.length ? { attachmentNames: files.map((file) => file.name) } : {}),
        },
      ];
      if (tool === "image") {
        const result = await studentApi.generateStudentAssistantImage({
          prompt: message,
          messages: savedMessages,
          conversationId: conversationId ?? undefined,
        });
        if (studentIdRef.current !== requestStudentId) return;
        if (result.conversationId !== undefined) {
          setConversationId(result.conversationId);
          chatNavigation.setActiveChatId(result.conversationId);
        }
        setMessages((current) => [
          ...current,
          { role: "assistant", content: result.answer, imageDataUrl: result.imageDataUrl },
        ]);
      } else {
        const encodedAttachments = await Promise.all(files.map(encodeAttachment));
        const result = await studentApi.askStudentAssistant({
          message,
          history: history.slice(-6).map(({ role, content }) => ({ role, content })),
          messages: savedMessages,
          cadreProfileId,
          conversationId: conversationId ?? undefined,
          attachments: encodedAttachments.length ? encodedAttachments : undefined,
          webSearch: tool === "web",
          documentWorkRequest,
        });
        if (studentIdRef.current !== requestStudentId) return;
        if (result.conversationId !== undefined) {
          setConversationId(result.conversationId);
          chatNavigation.setActiveChatId(result.conversationId);
        }
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            content: result.answer,
            references: result.references,
            ...(result.documentWork ? { documentWork: result.documentWork } : {}),
          },
        ]);
        if (result.conditionChangeRejected) {
          toast.error("A different condition requires a completely new care study.");
        }
      }
      if (student) {
        await queryClient.invalidateQueries({ queryKey: ["studentAssistantChats"] });
      }
    } catch (requestError) {
      if (studentIdRef.current === requestStudentId) {
        toast.error(requestError instanceof Error ? requestError.message : "Nursuit could not answer right now.");
      }
    } finally {
      setBusy(false);
      chatNavigation.setChatBusy(false);
    }
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = prompt.trim() || (
      documentWorkType
        ? documentWorkType === "correction"
          ? "Correct this uploaded chapter with minimal changes. Preserve all supported facts and return the complete chapter."
          : "Rewrite the complete uploaded chapter in a fully paraphrased form. Preserve all supported facts."
        : attachments.length
          ? "Summarize these documents and identify their key nursing concepts."
          : ""
    );
    if (!message || busy) return;
    const editedIndex = editingIndex;
    const history = editedIndex === null ? messages : messages.slice(0, editedIndex);
    const files = attachments.length ? attachments : (
      editedIndex === null
      ? lastAttachedFiles
      : messages[editedIndex]?.attachmentFiles
    ) ?? [];
    if (documentWorkType && (!student || files.length !== 1)) {
      toast.error(!student ? "Sign in to request a paid chapter correction or rewrite." : "Attach exactly one chapter for correction or rewrite.");
      return;
    }
    void ask(
      message,
      history,
      files,
      editedIndex ?? undefined,
      imageMode ? "image" : webSearchMode ? "web" : null,
      documentWorkType ? { type: documentWorkType, scope: "chapters" } : undefined,
    );
    setPrompt("");
    setAttachments([]);
    setEditingIndex(null);
    setDocumentWorkType("");
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const editMessage = (index: number) => {
    const turn = messages[index];
    if (turn.role !== "user") return;
    setPrompt(turn.content);
    setAttachments((turn.attachmentFiles ?? (turn.attachmentFile ? [turn.attachmentFile] : [])).slice(0, 1));
    setEditingIndex(index);
    setSourcesOpen(null);
  };

  const retryAnswer = (assistantIndex: number) => {
    let userIndex = assistantIndex - 1;
    while (userIndex >= 0 && messages[userIndex].role !== "user") userIndex -= 1;
    if (userIndex < 0) return;
    const userTurn = messages[userIndex];
    setSourcesOpen(null);
    void ask(
      userTurn.content,
      messages.slice(0, userIndex),
      userTurn.attachmentFiles ?? (userTurn.attachmentFile ? [userTurn.attachmentFile] : []),
      userIndex,
    );
  };

  const openSavedChat = async (id: number) => {
    if (busy) return;
    const previousConversationId = conversationId;
    const previousMessages = messages;
    setBusy(true);
    chatNavigation.setChatBusy(true);
    pendingPromptScrollIndexRef.current = null;
    pendingResponseScrollIndexRef.current = null;
    setMessages([]);
    setConversationId(null);
    setPreviewPageImages({});
    setPreviewImageLoading({});
    setPreviewImageErrors({});
    setPrompt("");
    setAttachments([]);
    setEditingIndex(null);
    setSourcesOpen(null);
    try {
      const { chat } = await studentApi.getStudentChat(id);
      setConversationId(chat.id);
      const lastAssistantIndex = chat.messages.findLastIndex((message) => message.role === "assistant");
      pendingResponseScrollIndexRef.current = lastAssistantIndex >= 0 ? lastAssistantIndex : null;
      setMessages(chat.messages);
      setPrompt("");
      setAttachments([]);
      setEditingIndex(null);
      setSourcesOpen(null);
    } catch (loadError) {
      pendingPromptScrollIndexRef.current = null;
      pendingResponseScrollIndexRef.current = null;
      setConversationId(previousConversationId);
      setMessages(previousMessages);
      chatNavigation.setActiveChatId(previousConversationId);
      toast.error(loadError instanceof Error ? loadError.message : "Could not load that conversation.");
    } finally {
      setBusy(false);
      chatNavigation.setChatBusy(false);
    }
  };

  const startNewChat = () => {
    if (busy) return;
    chatNavigation.startNewChat();
  };

  const downloadWord = async (answer: string, references: studentApi.AssistantReference[] = []) => {
    try {
      const title = messages.find((turn) => turn.role === "user")?.content.slice(0, 100) || "Nursuit answer";
      const blob = await studentApi.exportStudentChatDocx({ title, answer, references });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "nursuit-answer.docx";
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Word document downloaded");
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "Could not export this answer.");
    }
  };

  const printAnswerAsPdf = async (answer: string, references: studentApi.AssistantReference[] = []) => {
    try {
      await import("@/components/assistant-markdown");
      setPrintAnswer({
        title: messages.find((turn) => turn.role === "user")?.content.slice(0, 100) || "Nursuit answer",
        answer,
        references,
      });
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "Could not prepare this answer for printing.");
    }
  };

  const loadDocumentPreviewImages = async (
    chatId: number,
    work: studentApi.StudentDocumentWork,
    chapterId: string,
  ) => {
    const chapter = work.chapters.find((item) => item.id === chapterId);
    if (
      !chapter ||
      work.fullPaid ||
      work.paidChapterIds.includes(chapterId)
    ) return;
    const key = `${work.id}:${chapterId}`;
    if (previewPageImages[key] || previewImageLoading[key]) return;
    setPreviewImageLoading((current) => ({ ...current, [key]: true }));
    setPreviewImageErrors((current) => {
      const remaining = { ...current };
      delete remaining[key];
      return remaining;
    });
    try {
      const result = await studentApi.getStudentDocumentWorkPreview({
        chatId,
        workId: work.id,
        chapterId,
      });
      if (!result.pages.length) throw new Error("No preview pages were returned.");
      setPreviewPageImages((current) => ({ ...current, [key]: result.pages }));
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Could not load the watermarked preview pages.";
      setPreviewImageErrors((current) => ({ ...current, [key]: message }));
      toast.error(message);
    } finally {
      setPreviewImageLoading((current) => ({ ...current, [key]: false }));
    }
  };

  const openDocumentPreview = (messageIndex: number, work: studentApi.StudentDocumentWork) => {
    if (!conversationId) {
      toast.error("Save this conversation before opening its document preview.");
      return;
    }
    setRewritePreview({
      title: work.title,
      work,
      chatId: conversationId,
      messageIndex,
      chapterIndex: 0,
    });
    if (work.chapters[0]) {
      void loadDocumentPreviewImages(conversationId, work, work.chapters[0].id);
    }
    const firstChapter = work.chapters[0];
    setPreviewDraft(
      firstChapter
        ? formatStudentChapterContent(firstChapter.content, firstChapter.name)
        : "",
    );
    const formatting = work.chapters[0]?.formatting;
    setPreviewFont(formatting?.fontFamily ?? "Times New Roman");
    setPreviewFontSize(formatting?.fontSize ?? 12);
    setPreviewLineSpacing(formatting?.lineSpacing ?? 2);
    setPreviewIndent(formatting?.indent ?? 0);
    setPreviewAlignment(formatting?.alignment ?? "justify");
    setPreviewBottomMargin(formatting?.bottomMargin ?? 1);
    setPreviewEditingActive(false);
    setPreviewTextSelected(false);
    setPreviewToolbarState(EMPTY_PREVIEW_TOOLBAR_STATE);
    previewAutosaveRevisionRef.current += 1;
    setPreviewDirty(false);
    setPreviewSaveStatus("saved");
    setPreviewUndoStack([]);
    setPreviewRedoStack([]);
    setPreviewEditorRevision((current) => current + 1);
    setPreviewSearch("");
    setPreviewSearchIndex(0);
  };

  const selectPreviewChapter = async (index: number) => {
    if (!rewritePreview) return;
    if (previewDirty && !(await saveDocumentWorkEdit())) return;
    const chapter = rewritePreview.work.chapters[index];
    if (!chapter) return;
    setRewritePreview((current) => current ? { ...current, chapterIndex: index } : current);
    setPreviewEditingActive(false);
    setPreviewTextSelected(false);
    setPreviewToolbarState(EMPTY_PREVIEW_TOOLBAR_STATE);
    void loadDocumentPreviewImages(rewritePreview.chatId, rewritePreview.work, chapter.id);
    setPreviewDraft(formatStudentChapterContent(chapter.content, chapter.name));
    setPreviewEditorRevision((current) => current + 1);
    setPreviewFont(chapter.formatting?.fontFamily ?? "Times New Roman");
    setPreviewFontSize(chapter.formatting?.fontSize ?? 12);
    setPreviewLineSpacing(chapter.formatting?.lineSpacing ?? 2);
    setPreviewIndent(chapter.formatting?.indent ?? 0);
    setPreviewAlignment(chapter.formatting?.alignment ?? "justify");
    setPreviewBottomMargin(chapter.formatting?.bottomMargin ?? 1);
    previewAutosaveRevisionRef.current += 1;
    setPreviewDirty(false);
    setPreviewSaveStatus("saved");
    document.getElementById(`document-work-chapter-${chapter.id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const markPreviewDirty = () => {
    previewAutosaveRevisionRef.current += 1;
    setPreviewDirty(true);
    setPreviewSaveStatus("unsaved");
  };

  const handlePreviewDraftChange = (next: string) => {
    markPreviewDirty();
    setPreviewUndoStack((current) => [...current.slice(-49), previewDraft]);
    setPreviewRedoStack([]);
    setPreviewDraft(next);
    const chapter = rewritePreview?.work.chapters[rewritePreview.chapterIndex];
    if (chapter) updateCurrentPreviewChapter({ content: next });
  };

  const undoPreviewEdit = () => {
    if (!previewUndoStack.length) return;
    setPreviewRedoStack((current) => [...current, previewDraft]);
    setPreviewDraft(previewUndoStack[previewUndoStack.length - 1]);
    setPreviewUndoStack((current) => current.slice(0, -1));
    setPreviewEditorRevision((current) => current + 1);
    markPreviewDirty();
    updateCurrentPreviewChapter({ content: previewUndoStack[previewUndoStack.length - 1] });
  };

  const redoPreviewEdit = () => {
    if (!previewRedoStack.length) return;
    setPreviewUndoStack((current) => [...current, previewDraft]);
    setPreviewDraft(previewRedoStack[previewRedoStack.length - 1]);
    setPreviewRedoStack((current) => current.slice(0, -1));
    setPreviewEditorRevision((current) => current + 1);
    markPreviewDirty();
    updateCurrentPreviewChapter({ content: previewRedoStack[previewRedoStack.length - 1] });
  };

  const replaceDocumentWork = (work: studentApi.StudentDocumentWork) => {
    setRewritePreview((current) => current ? { ...current, work } : current);
    setMessages((current) => current.map((turn, index) =>
      rewritePreview && index === rewritePreview.messageIndex
        ? { ...turn, documentWork: work }
        : turn,
    ));
  };

  const syncUnlockedChapterPreview = (
    work: studentApi.StudentDocumentWork,
    chapterId: string,
  ) => {
    const activeChapter = rewritePreview?.work.chapters[rewritePreview.chapterIndex];
    const unlockedChapter = work.chapters.find((chapter) => chapter.id === chapterId);
    const isUnlocked = Boolean(work.fullPaid || work.paidChapterIds.includes(chapterId));
    if (!activeChapter || activeChapter.id !== chapterId || !unlockedChapter || !isUnlocked) return;
    if (!unlockedChapter.content.trim()) {
      toast.error("Payment is confirmed, but the chapter content is still loading. Please retry the preview.");
      return;
    }
    setPreviewDraft(
      formatStudentChapterContent(unlockedChapter.content, unlockedChapter.name),
    );
    setPreviewDirty(false);
    setPreviewSaveStatus("saved");
    setPreviewUndoStack([]);
    setPreviewRedoStack([]);
    setPreviewEditorRevision((current) => current + 1);
  };

  const updateCurrentPreviewChapter = (
    updates: Partial<studentApi.StudentDocumentWork["chapters"][number]>,
  ) => {
    if (!rewritePreview) return;
    const work = {
      ...rewritePreview.work,
      chapters: rewritePreview.work.chapters.map((chapter, index) =>
        index === rewritePreview.chapterIndex ? { ...chapter, ...updates } : chapter,
      ),
    };
    replaceDocumentWork(work);
  };

  type PreviewFormatting = NonNullable<studentApi.StudentDocumentWork["chapters"][number]["formatting"]>;
  const applyPreviewFormatting = (updates: Partial<PreviewFormatting>) => {
    const formatting: PreviewFormatting = {
      fontFamily: previewFont,
      fontSize: previewFontSize,
      lineSpacing: previewLineSpacing,
      indent: previewIndent,
      alignment: previewAlignment,
      bottomMargin: previewBottomMargin,
      ...updates,
    };
    setPreviewFont(formatting.fontFamily);
    setPreviewFontSize(formatting.fontSize);
    setPreviewLineSpacing(formatting.lineSpacing);
    setPreviewIndent(formatting.indent);
    setPreviewAlignment(formatting.alignment);
    setPreviewBottomMargin(formatting.bottomMargin);
    markPreviewDirty();
    updateCurrentPreviewChapter({ formatting });
  };

  const saveDocumentWorkDraft = ({
    chatId,
    workId,
    chapterId,
    content,
    formatting,
    revision,
  }: {
    chatId: number;
    workId: string;
    chapterId: string;
    content: string;
    formatting: PreviewFormatting;
    revision: number;
  }): Promise<boolean> => {
    const saveOperation = previewAutosaveQueueRef.current.catch(() => undefined).then(async () => {
      if (revision !== previewAutosaveRevisionRef.current) return false;
      setPreviewSaveStatus("saving");
      try {
        const result = await studentApi.saveDocumentWorkEdits({
          chatId,
          workId,
          chapters: [{ id: chapterId, content }],
          formatting,
        });
        if (revision !== previewAutosaveRevisionRef.current) return false;
        replaceDocumentWork(result.work);
        setPreviewDirty(false);
        setPreviewSaveStatus("saved");
        return true;
      } catch (error) {
        if (revision === previewAutosaveRevisionRef.current) {
          setPreviewSaveStatus("error");
          toast.error(error instanceof Error ? `Autosave failed: ${error.message}` : "Autosave failed.");
        }
        return false;
      }
    });
    previewAutosaveQueueRef.current = saveOperation.then(() => undefined);
    return saveOperation;
  };

  useEffect(() => {
    if (!previewDirty || !rewritePreview) return;
    const chapter = rewritePreview.work.chapters[rewritePreview.chapterIndex];
    if (!chapter) return;
    const revision = previewAutosaveRevisionRef.current;
    const snapshot = {
      chatId: rewritePreview.chatId,
      workId: rewritePreview.work.id,
      chapterId: chapter.id,
      content: previewDraft,
      formatting: {
        fontFamily: previewFont,
        fontSize: previewFontSize,
        lineSpacing: previewLineSpacing,
        indent: previewIndent,
        alignment: previewAlignment,
        bottomMargin: previewBottomMargin,
      },
      revision,
    };
    const timeout = window.setTimeout(() => {
      void saveDocumentWorkDraft(snapshot);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [
    previewDirty,
    previewDraft,
    previewFont,
    previewFontSize,
    previewLineSpacing,
    previewIndent,
    previewAlignment,
    previewBottomMargin,
    rewritePreview,
  ]);

  const payForDocumentWork = async (chapterId: string) => {
    if (!rewritePreview || previewBusy) return;
    const key = getPaystackKey();
    if (!key) {
      toast.error("Online payment is not configured. Please contact support.");
      return;
    }
    setPreviewBusy(true);
    try {
      const initialized = await studentApi.initializeDocumentWorkPayment({
        chatId: rewritePreview.chatId,
        workId: rewritePreview.work.id,
        scope: "chapter",
        chapterId,
      });
      replaceDocumentWork(initialized.work);
      try {
        await payWithPaystack({
          key,
          reference: initialized.reference,
          amount: initialized.amount,
          email: initialized.email,
          currency: "GHS",
          label: rewritePreview.work.type === "correction" ? "Chapter correction" : "Chapter rewrite",
        });
      } catch {
        const verification = await studentApi.verifyDocumentWorkPayment({
          chatId: rewritePreview.chatId,
          workId: rewritePreview.work.id,
          reference: initialized.reference,
        });
        replaceDocumentWork(verification.work);
        if (verification.verified) {
          syncUnlockedChapterPreview(verification.work, chapterId);
          toast.success("Payment confirmed. Editing and export are now unlocked.");
        } else {
          toast.error("Payment was not confirmed. You can try again.");
        }
        return;
      }
      const verification = await studentApi.verifyDocumentWorkPayment({
        chatId: rewritePreview.chatId,
        workId: rewritePreview.work.id,
        reference: initialized.reference,
      });
      replaceDocumentWork(verification.work);
      if (!verification.verified) {
        toast.error(verification.message ?? "Payment was not confirmed. Please try again.");
      } else {
        syncUnlockedChapterPreview(verification.work, chapterId);
        toast.success("Payment confirmed. Editing and export are now unlocked.");
      }
    } catch (paymentError) {
      toast.error(paymentError instanceof Error ? paymentError.message : "Could not complete payment.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const checkDocumentPayment = async () => {
    if (!rewritePreview || previewBusy) return;
    const unresolvedCharge = rewritePreview.work.charges.findLast(
      (charge) => charge.status !== "verified",
    );
    if (!unresolvedCharge) return;
    setPreviewBusy(true);
    try {
      const verification = await studentApi.verifyDocumentWorkPayment({
        chatId: rewritePreview.chatId,
        workId: rewritePreview.work.id,
        reference: unresolvedCharge.reference,
      });
      replaceDocumentWork(verification.work);
      if (verification.verified) {
        const activeChapterId = rewritePreview.work.chapters[rewritePreview.chapterIndex]?.id;
        if (activeChapterId) syncUnlockedChapterPreview(verification.work, activeChapterId);
        toast.success("Payment confirmed. Editing and export are now unlocked.");
      } else {
        toast.error(verification.message ?? "Payment was not confirmed. You can try again.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify the payment.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const saveDocumentWorkEdit = async () => {
    if (!rewritePreview || previewBusy) return false;
    const chapter = rewritePreview.work.chapters[rewritePreview.chapterIndex];
    if (!chapter) return false;
    setPreviewBusy(true);
    try {
      const saved = await saveDocumentWorkDraft({
        chatId: rewritePreview.chatId,
        workId: rewritePreview.work.id,
        chapterId: chapter.id,
        content: previewDraft,
        formatting: {
          fontFamily: previewFont,
          fontSize: previewFontSize,
          lineSpacing: previewLineSpacing,
          indent: previewIndent,
          alignment: previewAlignment,
          bottomMargin: previewBottomMargin,
        },
        revision: previewAutosaveRevisionRef.current,
      });
      if (saved) {
        setPreviewUndoStack([]);
        setPreviewRedoStack([]);
        setPreviewEditorRevision((current) => current + 1);
        toast.success("Chapter edits saved.");
        return true;
      }
      return false;
    } finally {
      setPreviewBusy(false);
    }
  };

  const exportDocumentWork = async (chapterIds?: string[]) => {
    if (!rewritePreview || previewBusy) return;
    setPreviewBusy(true);
    try {
      const blob = await studentApi.exportStudentDocumentWork({
        chatId: rewritePreview.chatId,
        workId: rewritePreview.work.id,
        chapterIds,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${rewritePreview.title.replace(/[^\w -]/g, "").trim() || "care-study"}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Word document downloaded.");
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : "Could not export this document.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const runPreviewEditorCommand = (command: string, value?: string) => {
    const editor = previewEditorRef.current?.getElement();
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) return;
    previewEditorRef.current?.runCommand(command, value);
    setPreviewTextSelected(Boolean(selection && !selection.isCollapsed));
    setPreviewEditingActive(true);
    window.requestAnimationFrame(updatePreviewSelectionState);
  };

  const updatePreviewSelectionState = () => {
    const editor = previewEditorRef.current?.getElement();
    const selection = window.getSelection();
    const element = selectionElement(selection);
    const inside = Boolean(editor && selection?.anchorNode && selection.focusNode &&
      editor.contains(selection.anchorNode) && editor.contains(selection.focusNode));
    setPreviewEditingActive(inside);
    setPreviewTextSelected(Boolean(inside && selection && !selection.isCollapsed));
    if (!inside || !editor || !element) {
      setPreviewToolbarState(EMPTY_PREVIEW_TOOLBAR_STATE);
      return;
    }

    const hasAncestor = (selector: string) => {
      const match = element.closest(selector);
      return Boolean(match && editor.contains(match));
    };
    const block = selectionBlock(editor, element);
    const blockStyle = block ? window.getComputedStyle(block) : null;
    const alignment = blockStyle?.textAlign;
    setPreviewToolbarState({
      bold: hasAncestor("b, strong") || Number.parseInt(window.getComputedStyle(element).fontWeight, 10) >= 600,
      italic: hasAncestor("i, em") || window.getComputedStyle(element).fontStyle === "italic",
      underline: hasAncestor("u") || window.getComputedStyle(element).textDecorationLine.includes("underline"),
      strikeThrough: hasAncestor("s, strike, del") || window.getComputedStyle(element).textDecorationLine.includes("line-through"),
      highlight: hasAncestor("mark, [style*='background-color']"),
      unorderedList: hasAncestor("ul"),
      orderedList: hasAncestor("ol"),
      alignment: alignment && ["left", "center", "right", "justify"].includes(alignment)
        ? alignment as PreviewToolbarState["alignment"]
        : previewAlignment,
    });
  };

  const applyPreviewParagraphStyle = (style: {
    alignment?: "left" | "center" | "right" | "justify";
    lineSpacing?: number;
    indent?: number;
  }) => {
    const editor = previewEditorRef.current?.getElement();
    const selection = window.getSelection();
    if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) return;
    const block = selectionBlock(editor, selectionElement(selection));
    if (!block) return;
    if (style.alignment) block.style.textAlign = style.alignment;
    if (style.lineSpacing !== undefined) block.style.lineHeight = String(style.lineSpacing);
    if (style.indent !== undefined) block.style.textIndent = `${style.indent}in`;
    handlePreviewDraftChange(markdownFromEditorHtml(editor.innerHTML));
    setPreviewEditingActive(true);
    window.requestAnimationFrame(updatePreviewSelectionState);
  };

  const previewSearchResults = useMemo(() => {
    const needle = previewSearch.trim().toLocaleLowerCase();
    if (!needle || !rewritePreview) return [];
    return rewritePreview.work.chapters.flatMap((chapter, chapterIndex) => {
      const content = chapter.content.toLocaleLowerCase();
      const matches: number[] = [];
      let offset = 0;
      while ((offset = content.indexOf(needle, offset)) >= 0) {
        matches.push(chapterIndex);
        offset += needle.length;
      }
      return matches;
    });
  }, [previewSearch, rewritePreview]);

  const movePreviewSearch = (direction: -1 | 1) => {
    if (!previewSearchResults.length) return;
    const nextIndex = (previewSearchIndex + direction + previewSearchResults.length) % previewSearchResults.length;
    setPreviewSearchIndex(nextIndex);
    selectPreviewChapter(previewSearchResults[nextIndex]);
  };

  const toolButtons = () => {
    const tools = assistantToolsQuery.data;
    return (
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="sm"
          variant={webSearchMode ? "secondary" : "outline"}
          disabled={busy || !tools?.webSearch}
          title={tools?.webSearch ? "Search the web and cite results" : "Set BRAVE_SEARCH_API_KEY on the API server to enable web search"}
          onClick={() => {
            setWebSearchMode((enabled) => !enabled);
            setImageMode(false);
          }}
        >
          <Globe2 className="mr-2 size-4" /> Search web
        </Button>
        <Button
          type="button"
          size="sm"
          variant={imageMode ? "secondary" : "outline"}
          disabled={busy || !tools?.imageGeneration || attachments.length > 0}
          title={tools?.imageGeneration ? "Generate an educational illustration" : "Set Cloudflare Workers AI credentials to enable image generation"}
          onClick={() => {
            if (attachments.length) {
              toast.error("Remove the attachment before switching to image generation.");
              return;
            }
            setImageMode((enabled) => !enabled);
            setWebSearchMode(false);
          }}
        >
          <ImagePlus className="mr-2 size-4" /> Create illustration
        </Button>
        {tools && !tools.webSearch && (
          <span className="text-xs text-muted-foreground">Web search needs BRAVE_SEARCH_API_KEY.</span>
        )}
        {tools && !tools.imageGeneration && (
          <span className="text-xs text-muted-foreground">Illustrations need Cloudflare Workers AI credentials.</span>
        )}
        {imageMode && (
          <span className="text-xs text-muted-foreground">Educational illustration only; review for accuracy.</span>
        )}
      </div>
    );
  };

  const cadreSelector = () => (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>Care-study cadre</span>
      <select
        aria-label="Care-study cadre"
        value={cadreProfileId}
        disabled={busy || messages.length > 0}
        onChange={(event) => setCadreProfileId(event.target.value)}
        className="h-9 max-w-52 rounded-md border bg-background px-2 text-xs text-foreground"
      >
        {(assistantToolsQuery.data?.careStudyCadres ?? [{
          id: "registered_general_nurse",
          name: "Registered General Nurse",
          abbreviation: "RGN",
          status: "available" as const,
        }]).map((profile) => (
          <option key={profile.id} value={profile.id} disabled={profile.status !== "available"}>
            {profile.name}{profile.status !== "available" ? " (in development)" : ""}
          </option>
        ))}
      </select>
    </label>
  );

  const composerOptions = () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={webSearchMode || imageMode ? "secondary" : "ghost"}
          className="size-8 shrink-0"
          aria-label="More message options"
          title="More message options"
          disabled={busy}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 space-y-3 p-3">
        {cadreSelector()}
        <Separator />
        {toolButtons()}
      </PopoverContent>
    </Popover>
  );

  const attachmentButton = () => (
    <label
      className={cn(
        buttonVariants({ variant: attachments.length ? "secondary" : "ghost", size: "icon" }),
        "relative size-8 shrink-0 cursor-pointer",
      )}
      aria-label="Attach file"
      title={attachments.length ? `${attachments.length} file attached` : "Attach one file (up to 10 MB)"}
    >
      <Paperclip className="size-4" />
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
        className="sr-only"
        disabled={busy || imageMode}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && attachments.length) {
            toast.error("Only one document may be attached to a message. Remove the current file first.");
          } else if (file && file.size > 10 * 1024 * 1024) {
            toast.error(`${file.name} exceeds the 10 MB per-file limit.`);
          } else if (file) {
            setAttachments([file]);
          }
          event.target.value = "";
        }}
      />
    </label>
  );

  const attachmentOptions = () => attachments.length > 0 && (
    <div className="mb-2 space-y-2 px-1">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2">
        <label className="flex items-center gap-2 text-xs">
          <span className="font-medium">Paid chapter service</span>
          <select
            aria-label="Document service"
            value={documentWorkType}
            disabled={busy}
            onChange={(event) => setDocumentWorkType(event.target.value as "correction" | "rewrite" | "")}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Chat review only</option>
            <option value="correction">Correction rewrite</option>
            <option value="rewrite">Comprehensive rewrite</option>
          </select>
        </label>
        {documentWorkType && (
          <span className="text-xs text-muted-foreground">GH₵50 per chapter</span>
        )}
      </div>
      {attachments.length !== 1 && documentWorkType && (
        <p className="text-xs text-destructive">Attach exactly one chapter for correction or rewrite.</p>
      )}
    </div>
  );

  const previewChapter = rewritePreview?.work.chapters[rewritePreview.chapterIndex] ?? null;
  const previewChapterUnlocked = Boolean(
    rewritePreview &&
    previewChapter &&
    (rewritePreview.work.fullPaid || rewritePreview.work.paidChapterIds.includes(previewChapter.id)),
  );
  const previewAllUnlocked = Boolean(
    rewritePreview &&
    (rewritePreview.work.fullPaid ||
      rewritePreview.work.chapters.every((chapter) => rewritePreview.work.paidChapterIds.includes(chapter.id))),
  );
  const previewChapterPrice = 50;
  const inlineFormattingTools = [
    { label: "Bold", command: "bold", Icon: Bold, active: previewToolbarState.bold },
    { label: "Italic", command: "italic", Icon: Italic, active: previewToolbarState.italic },
    { label: "Underline", command: "underline", Icon: Underline, active: previewToolbarState.underline },
    { label: "Strikethrough", command: "strikeThrough", Icon: Strikethrough, active: previewToolbarState.strikeThrough },
    { label: "Highlight", command: "hiliteColor", Icon: Highlighter, active: previewToolbarState.highlight, value: "yellow" },
  ];

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col">
      <div
        ref={chatScrollRef}
        aria-live="polite"
        className="min-h-0 min-w-0 max-w-full flex-1 space-y-6 overflow-x-hidden overflow-y-auto py-6 pl-4 pr-8 sm:px-6 lg:px-8 [scrollbar-gutter:stable]"
      >
        {messages.length === 0 ? (
            <div className="flex h-full min-h-[20rem] w-full items-center justify-center">
              <div className="w-full space-y-6">
                <div className="space-y-2 text-center">
                  <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                    {welcomeName ? `Where do we begin, ${welcomeName}?` : "Where do we begin?"}
                  </h1>
                  <p className="text-sm text-muted-foreground sm:text-base">
                    Attach a full care study for review, or upload one chapter for the paid correction or rewrite service.
                  </p>
                </div>
                <form onSubmit={sendMessage} className="mx-auto w-full max-w-3xl">
                  <div className="rounded-2xl border-2 border-primary/40 bg-card p-1.5 shadow-md focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/30">
                    {attachments.length > 0 && (
                      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {attachments.map((file, index) => (
                          <AttachmentPreview
                            key={`${file.name}-${file.lastModified}`}
                            file={file}
                            onRemove={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                          />
                        ))}
                      </div>
                    )}
                    {attachmentOptions()}
                    <Textarea
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder="Ask here…"
                      aria-label="Message Nursuit"
                      rows={2}
                      maxLength={4_000}
                      disabled={busy}
                      className="min-h-14 max-h-40 resize-none border-0 shadow-none focus-visible:ring-0"
                    />
                    <div className="flex items-center justify-between gap-2 px-1 pb-1">
                      <div className="flex min-w-0 items-center gap-1">
                        {attachmentButton()}
                        {composerOptions()}
                      </div>
                      <Button type="submit" size="icon" className="size-8 shrink-0" aria-label={imageMode ? "Generate" : "Send"} title={imageMode ? "Generate" : "Send"} disabled={busy || (!prompt.trim() && !attachments.length)}>
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            messages.map((turn, index) => {
              const previousTurn = index > 0 ? messages[index - 1] : undefined;
              const isProposedRewrite = turn.role === "assistant"
                && previousTurn?.role === "user"
                && Boolean(previousTurn.attachmentNames?.length || previousTurn.attachmentName)
                && isRewriteRequest(previousTurn.content)
                && !isRewriteClarification(turn.content);
              const rewriteTitle = previousTurn?.role === "user"
                ? previousTurn.attachmentNames?.[0] ?? previousTurn.attachmentName ?? "Care study"
                : "Care study";

              return (
              <div
                key={`${turn.role}-${index}`}
                data-chat-message-index={index}
                className={cn("flex min-w-0 max-w-full", turn.role === "user" ? "justify-end" : "justify-center")}
              >
                <div className={cn(
                  "break-words",
                  turn.role === "user" ? "w-fit min-w-0 max-w-full sm:max-w-2xl" : "w-full min-w-0 max-w-3xl",
                )}>
                  {turn.role === "user" ? (
                    <div className="w-fit max-w-full rounded-2xl rounded-br-md bg-primary/10 px-4 py-3 text-foreground sm:px-5">
                      <p className="whitespace-pre-wrap leading-7">{turn.content}</p>
                      {(turn.attachmentNames?.length || turn.attachmentName) && (
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {(turn.attachmentNames ?? (turn.attachmentName ? [turn.attachmentName] : [])).map((filename) => (
                            <div key={filename} className="flex min-w-0 items-center gap-2 rounded-xl border border-primary/10 bg-background/70 px-2.5 py-2">
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                                <FileText className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs font-medium" title={filename}>{filename}</span>
                              {!turn.attachmentFiles?.length && (
                                <span className="shrink-0 text-[11px] text-muted-foreground">Reattach to reuse</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {turn.documentWork ? (
                        <div className="space-y-3 rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
                          <div>
                            <p className="font-medium">
                              {turn.documentWork.type === "correction"
                                ? "The corrected document is ready."
                                : "The complete rewrite is ready."}
                            </p>
                            <div className="mt-2 text-sm text-muted-foreground">
                              <FormattedAssistantMarkdown text={turn.content} />
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (turn.documentWork) openDocumentPreview(index, turn.documentWork);
                            }}
                          >
                            <Eye className="size-4" /> Preview full document
                          </Button>
                        </div>
                      ) : isProposedRewrite ? (
                        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
                          <div>
                            <p className="font-medium">Your proposed changes are ready to review.</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              The uploaded document has not been changed.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setLegacyRewritePreview({ title: rewriteTitle, content: turn.content })}
                          >
                            <Eye className="size-4" /> Preview proposed changes
                          </Button>
                        </div>
                      ) : (
                        <FormattedAssistantMarkdown text={turn.content} />
                      )}
                      {turn.imageDataUrl && (
                        <div className="mt-4 max-w-2xl overflow-hidden rounded-xl border bg-card shadow-sm">
                          <img
                            src={turn.imageDataUrl}
                            alt="AI-generated educational illustration"
                            className="max-h-[36rem] w-full object-contain"
                          />
                          <div className="border-t px-3 py-2 text-right">
                            <a
                              href={turn.imageDataUrl}
                              download="nursuit-educational-illustration.jpg"
                              className="text-sm font-medium text-primary underline underline-offset-2"
                            >
                              Download image
                            </a>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className={cn("mt-1 flex items-center gap-1", turn.role === "user" && "justify-end")}>
                    {turn.role === "user" ? (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Edit question" title="Edit question" onClick={() => editMessage(index)} disabled={busy}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Copy question" title="Copy question" onClick={() => void copyText(turn.content)}>
                          <Copy className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Copy answer" title="Copy answer" onClick={() => void copyText(turn.content)}>
                          <Copy className="size-4" />
                        </Button>
                        {!turn.documentWork && (
                          <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Regenerate answer" title="Regenerate answer" onClick={() => retryAnswer(index)} disabled={busy}>
                            <RotateCcw className="size-4" />
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="More answer options">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onSelect={() => void copyText(turn.content)}>
                              <Copy className="size-4" /> Copy answer
                            </DropdownMenuItem>
                            {!turn.documentWork && (
                              <DropdownMenuItem onSelect={() => retryAnswer(index)} disabled={busy}>
                                <RotateCcw className="size-4" /> Regenerate answer
                              </DropdownMenuItem>
                            )}
                            {turn.references && turn.references.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setSourcesOpen(sourcesOpen === index ? null : index)}>
                                  <Eye className="size-4" />
                                  {sourcesOpen === index ? "Hide sources" : "View sources"}
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => void downloadWord(turn.content, turn.references)}>
                              <FileText className="size-4" /> Download Word document
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void printAnswerAsPdf(turn.content, turn.references)}>
                              <Printer className="size-4" /> Print or save as PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                  {turn.role === "assistant" && sourcesOpen === index && turn.references && (
                    <div className="mt-2 rounded-xl border bg-muted/20 p-4">
                      <p className="mb-2 text-sm font-semibold">Sources</p>
                      <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
                        {turn.references.map((reference, referenceIndex) => {
                          const url = reference.url && /^https?:\/\//i.test(reference.url)
                            ? reference.url
                            : null;
                          return (
                            <li key={`${reference.inText}-${referenceIndex}`}>
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                                  {reference.label}
                                </a>
                              ) : reference.label}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
              );
            })
        )}
        {busy && (
            <div className="flex min-w-0 max-w-full justify-center">
              <div className="w-full min-w-0 max-w-3xl">
                <div
                  role="status"
                  aria-live="polite"
                  className="flex w-fit items-center gap-1 rounded-2xl border bg-card px-4 py-3 shadow-sm"
                >
                  <span className="flex items-center gap-1" aria-hidden="true">
                    <span className="assistant-typing-dot" />
                    <span className="assistant-typing-dot [animation-delay:150ms]" />
                    <span className="assistant-typing-dot [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            </div>
        )}
      </div>

      {messages.length > 0 && <form onSubmit={sendMessage} className="mx-auto w-full max-w-3xl border-t bg-background pt-3">
        {editingIndex !== null && (
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Editing your question — submitting will regenerate the answer.</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingIndex(null); setPrompt(""); setAttachments([]); }}>
              Cancel
            </Button>
          </div>
        )}
        <div className="rounded-2xl border-2 border-primary/40 bg-card p-1.5 shadow-md focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/30">
          {attachments.length > 0 && (
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {attachments.map((file, index) => (
                <AttachmentPreview
                  key={`${file.name}-${file.lastModified}`}
                  file={file}
                  onRemove={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                />
              ))}
            </div>
          )}
          {attachmentOptions()}
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask here…"
            aria-label="Message Nursuit"
            rows={1}
            maxLength={4_000}
            disabled={busy}
            className="min-h-12 max-h-40 resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <div className="flex min-w-0 items-center gap-1">
              {attachmentButton()}
              {composerOptions()}
            </div>
            <Button type="submit" size="icon" className="size-8 shrink-0" aria-label={imageMode ? "Generate" : editingIndex !== null ? "Regenerate" : "Send"} title={imageMode ? "Generate" : editingIndex !== null ? "Regenerate" : "Send"} disabled={busy || (!prompt.trim() && !attachments.length)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      </form>}

      {printAnswer && (
        <div id="chat-answer-print-root">
          <h1>{printAnswer.title}</h1>
          <FormattedAssistantMarkdown text={printAnswer.answer} />
          {printAnswer.references.length > 0 && (
            <section>
              <h2>References</h2>
              <ol>
                {printAnswer.references.map((reference, index) => (
                  <li key={`${reference.inText}-${index}`}>
                    {reference.label}
                    {reference.url && <> — {reference.url}</>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
      {rewritePreview && (
        <div className="fixed inset-0 z-[100] min-h-screen overflow-y-auto bg-background">
          <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (previewDirty && !(await saveDocumentWorkEdit())) return;
                    setRewritePreview(null);
                  }}
                >
                  <ArrowLeft className="size-4" /> Back to chat
                </Button>
                <Separator orientation="vertical" className="h-5" />
                <span className="truncate text-sm font-medium">
                  Preview
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {previewChapter && previewChapterUnlocked && (
                  <Button size="sm" variant="outline" disabled={previewBusy} onClick={() => void exportDocumentWork([previewChapter.id])}>
                    <Download className="size-4" /> Export chapter
                  </Button>
                )}
                {previewAllUnlocked && rewritePreview.work.chapters.length > 1 && (
                  <Button size="sm" disabled={previewBusy} onClick={() => void exportDocumentWork()}>
                    <Download className="size-4" /> Export full document
                  </Button>
                )}
                {previewAllUnlocked ? (
                  <Badge>Paid · editing and export unlocked</Badge>
                ) : previewChapter && !previewChapterUnlocked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previewBusy}
                    onClick={() => void payForDocumentWork(previewChapter.id)}
                  >
                    <Lock className="size-4" /> Unlock · GH₵{previewChapterPrice}
                  </Button>
                ) : previewChapterUnlocked ? (
                  <Badge variant="secondary">Chapter paid</Badge>
                ) : null}
              </div>
            </div>
          </header>
          <div className="mx-auto flex max-w-7xl">
            <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r p-4 lg:block">
              <p className="mb-3 flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Search className="mr-1 size-3.5" /> Search document
              </p>
              <div className="mb-5 space-y-2">
                <div className="flex items-center gap-1">
                  <Input
                    value={previewSearch}
                    onChange={(event) => { setPreviewSearch(event.target.value); setPreviewSearchIndex(0); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        movePreviewSearch(event.shiftKey ? -1 : 1);
                      }
                    }}
                    placeholder="Search document"
                    aria-label="Search this document"
                    className="h-8 text-xs"
                  />
                  <Button size="icon" variant="outline" className="size-8 shrink-0" title="Previous match" aria-label="Previous search match" disabled={!previewSearchResults.length} onClick={() => movePreviewSearch(-1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button size="icon" variant="outline" className="size-8 shrink-0" title="Next match" aria-label="Next search match" disabled={!previewSearchResults.length} onClick={() => movePreviewSearch(1)}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                {previewSearch.trim() && (
                  <p className="text-xs text-muted-foreground">
                    {previewSearchResults.length
                      ? `${Math.min(previewSearchIndex + 1, previewSearchResults.length)} of ${previewSearchResults.length} matches`
                      : "No matches"}
                  </p>
                )}
              </div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document chapters</p>
              <nav className="space-y-2">
                {rewritePreview.work.chapters.map((chapter, index) => {
                  const unlocked = rewritePreview.work.fullPaid ||
                    rewritePreview.work.paidChapterIds.includes(chapter.id);
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => selectPreviewChapter(index)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border p-2 text-left text-sm hover:bg-muted/50",
                        index === rewritePreview.chapterIndex && "border-primary/40 bg-primary/5",
                      )}
                    >
                      {unlocked ? <CheckCircle2 className="size-4 text-primary" /> : <Lock className="size-4 text-muted-foreground" />}
                      <span className="min-w-0 truncate">{chapter.name}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>
            <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
              <div className="sticky top-24 z-10 mb-5 space-y-2 rounded-xl border bg-card/95 p-2 shadow-sm backdrop-blur lg:top-14">
                <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
                  <p className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document actions</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1 px-2 sm:hidden"
                    aria-expanded={previewToolbarOpen}
                    aria-controls="student-document-formatting-toolbar"
                    onClick={() => setPreviewToolbarOpen((open) => !open)}
                  >
                    {previewToolbarOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    {previewToolbarOpen ? "Hide tools" : "Show tools"}
                  </Button>
                  <div className="flex shrink-0 flex-nowrap gap-2">
                    {rewritePreview.work.charges.some((charge) => charge.status !== "verified") && (
                      <Button size="sm" variant="outline" disabled={previewBusy} onClick={() => void checkDocumentPayment()}>
                        {previewBusy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Check payment
                      </Button>
                    )}
                    {previewChapter && previewChapterUnlocked && (
                      <>
                        <Button size="icon" variant="outline" disabled={!previewUndoStack.length || previewBusy} title="Undo last edit" aria-label="Undo last edit" onClick={undoPreviewEdit}>
                          <Undo2 className="size-4" />
                        </Button>
                        <Button size="icon" variant="outline" disabled={!previewRedoStack.length || previewBusy} title="Redo last edit" aria-label="Redo last edit" onClick={redoPreviewEdit}>
                          <Redo2 className="size-4" />
                        </Button>
                      </>
                    )}
                    {(previewDirty || previewSaveStatus !== "saved") && (
                      <span className="px-1 text-xs text-muted-foreground" aria-live="polite">
                        {previewSaveStatus === "saved" ? "All changes saved" :
                          previewSaveStatus === "saving" ? "Saving…" :
                            previewSaveStatus === "error" ? "Autosave failed" : "Unsaved changes"}
                      </span>
                    )}
                    {previewSaveStatus === "error" && (
                      <Button size="sm" variant="outline" disabled={previewBusy} onClick={() => void saveDocumentWorkEdit()}>
                        Retry save
                      </Button>
                    )}
                    {previewChapter && previewChapterUnlocked && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={previewBusy}
                        onClick={() => void printAnswerAsPdf(
                          formatStudentChapterContent(
                            previewChapter.content,
                            previewChapter.name,
                          ),
                        )}
                      >
                        <Printer className="size-4" /> Print / Save PDF
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  id="student-document-formatting-toolbar"
                  className={cn(
                    "grid gap-2 border-t pt-2 sm:grid-cols-2 xl:grid-cols-4",
                    !previewToolbarOpen && "hidden sm:grid",
                  )}
                >
                  <section className="rounded-md border bg-muted/30 p-2">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected text</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {inlineFormattingTools.map(({ label, command, Icon, active, value }) => (
                        <Button
                          key={command}
                          size="icon"
                          variant={active ? "secondary" : "outline"}
                          className="size-7"
                          title={label}
                          aria-label={label}
                          aria-pressed={active}
                          disabled={!previewTextSelected || !previewChapterUnlocked}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => runPreviewEditorCommand(command, value)}
                        >
                          <Icon className="size-3.5" />
                        </Button>
                      ))}
                    </div>
                  </section>
                  <section className="rounded-md border bg-muted/30 p-2 sm:col-span-2">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Selected paragraph</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="icon" variant={previewToolbarState.unorderedList ? "secondary" : "outline"} className="size-7" title="Bullet list" aria-label="Bullet list" aria-pressed={previewToolbarState.unorderedList} disabled={!previewEditingActive || !previewChapterUnlocked} onMouseDown={(event) => event.preventDefault()} onClick={() => runPreviewEditorCommand("insertUnorderedList")}><ListIcon className="size-3.5" /></Button>
                      <Button size="icon" variant={previewToolbarState.orderedList ? "secondary" : "outline"} className="size-7" title="Numbered list" aria-label="Numbered list" aria-pressed={previewToolbarState.orderedList} disabled={!previewEditingActive || !previewChapterUnlocked} onMouseDown={(event) => event.preventDefault()} onClick={() => runPreviewEditorCommand("insertOrderedList")}><ListOrdered className="size-3.5" /></Button>
                      <Separator orientation="vertical" className="mx-1 h-5" />
                      {[["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight], ["justify", AlignJustify]].map(([alignment, Icon]) => {
                        const AlignIcon = Icon as typeof AlignLeft;
                        const active = previewToolbarState.alignment === alignment;
                        return <Button key={alignment as string} size="icon" variant={active ? "secondary" : "outline"} className="size-7" title={`Align ${alignment}`} aria-label={`Align ${alignment}`} aria-pressed={active} disabled={!previewEditingActive || !previewChapterUnlocked} onMouseDown={(event) => event.preventDefault()} onClick={() => applyPreviewParagraphStyle({ alignment: alignment as PreviewFormatting["alignment"] })}><AlignIcon className="size-3.5" /></Button>;
                      })}
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">Line spacing<select value={previewLineSpacing} disabled={!previewEditingActive || !previewChapterUnlocked} onChange={(event) => applyPreviewParagraphStyle({ lineSpacing: Number(event.target.value) })} className="h-7 rounded-md border bg-background px-1 text-xs">{[1, 1.15, 1.5, 2].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">Indent<select value={previewIndent} disabled={!previewEditingActive || !previewChapterUnlocked} onChange={(event) => applyPreviewParagraphStyle({ indent: Number(event.target.value) })} className="h-7 rounded-md border bg-background px-1 text-xs">{[0, 0.25, 0.5].map((value) => <option key={value} value={value}>{value ? `${value}\"` : "None"}</option>)}</select></label>
                    </div>
                  </section>
                  <section className="rounded-md border bg-muted/30 p-2">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Page layout</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <label className="flex items-center gap-1">Font<select value={previewFont} disabled={!previewChapterUnlocked} onChange={(event) => applyPreviewFormatting({ fontFamily: event.target.value })} className="h-7 rounded-md border bg-background px-1 text-xs">{["Georgia", "Times New Roman", "Arial", "Calibri", "Garamond", "Helvetica", "Palatino", "Courier New"].map((font) => <option key={font}>{font}</option>)}</select></label>
                      <label className="flex items-center gap-1">Size<select value={previewFontSize} disabled={!previewChapterUnlocked} onChange={(event) => applyPreviewFormatting({ fontSize: Number(event.target.value) })} className="h-7 rounded-md border bg-background px-1 text-xs">{[10, 11, 12, 13, 14].map((size) => <option key={size} value={size}>{size} pt</option>)}</select></label>
                      <label className="flex items-center gap-1">Bottom margin<select value={previewBottomMargin} disabled={!previewChapterUnlocked} onChange={(event) => applyPreviewFormatting({ bottomMargin: Number(event.target.value) })} className="h-7 rounded-md border bg-background px-1 text-xs">{[0.5, 0.75, 1, 1.25, 1.5].map((margin) => <option key={margin} value={margin}>{margin}\"</option>)}</select></label>
                    </div>
                  </section>
                </div>
                {legacyRewritePreview && (
                  <div className="fixed inset-0 z-[100] min-h-screen overflow-y-auto bg-background">
                    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
                      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setLegacyRewritePreview(null)}>
                          <ArrowLeft className="size-4" /> Back to chat
                        </Button>
                        <Separator orientation="vertical" className="h-5" />
                        <span className="truncate text-sm font-medium">Suggested changes · {legacyRewritePreview.title}</span>
                      </div>
                    </header>
                    <main className="mx-auto max-w-[780px] px-4 py-8 md:px-10">
                      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                        <p className="font-medium">Suggestion only</p>
                        <p className="mt-1 text-muted-foreground">
                          This chat suggestion is not a paid document correction or rewrite and does not change your uploaded file.
                        </p>
                      </div>
                      <article className="rounded-xl border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8">
                        <FormattedAssistantMarkdown text={legacyRewritePreview.content} />
                      </article>
                    </main>
                  </div>
                )}
              </div>

              <div className="space-y-8">
                {rewritePreview.work.chapters.map((chapter, index) => {
                  const activeChapter = index === rewritePreview.chapterIndex;
                  const formatting = chapter.formatting;
                  const fontFamily = activeChapter ? previewFont : formatting?.fontFamily ?? "Times New Roman";
                  const fontSize = activeChapter ? previewFontSize : formatting?.fontSize ?? 12;
                  const lineSpacing = activeChapter ? previewLineSpacing : formatting?.lineSpacing ?? 2;
                  const alignment = activeChapter ? previewAlignment : formatting?.alignment ?? "justify";
                  const indent = activeChapter ? previewIndent : formatting?.indent ?? 0;
                  const chapterIsUnlocked = rewritePreview.work.fullPaid ||
                    rewritePreview.work.paidChapterIds.includes(chapter.id);
                  const pageImageKey = `${rewritePreview.work.id}:${chapter.id}`;
                  const chapterPreviewPages = previewPageImages[pageImageKey] ?? [];
                  const chapterStyle: CSSProperties = {
                    fontFamily,
                    fontSize: `${fontSize}pt`,
                    lineHeight: lineSpacing,
                    textAlign: alignment,
                    "--doc-body-font": fontFamily,
                    "--doc-heading-font": fontFamily,
                    "--doc-body-size": `${fontSize}pt`,
                    "--doc-line-height": String(lineSpacing),
                    "--doc-align": alignment,
                    "--doc-first-line-indent": `${indent}in`,
                    "--doc-h1-size": "14pt",
                    "--doc-h2-size": "12pt",
                    "--doc-table-size": "10pt",
                    "--doc-table-fill": "#d9d9d9",
                  } as CSSProperties;
                  const chapterContent = formatStudentChapterContent(
                    chapter.content,
                    chapter.name,
                  );
                  return (
                    <div key={chapter.id} className="mx-auto w-full max-w-[820px] scroll-mt-24">
                      {rewritePreview.work.type === "correction" && chapter.summary && (
                        <div className="no-print mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                          <p className="font-semibold">Correction summary</p>
                          <FormattedAssistantMarkdown text={chapter.summary} />
                        </div>
                      )}
                      <section
                        id={`document-work-chapter-${chapter.id}`}
                        className="print-doc student-document-sheet w-full scroll-mt-24"
                        style={{
                          ...chapterStyle,
                          paddingBottom: `${(activeChapter ? previewBottomMargin : formatting?.bottomMargin ?? 1) * 0.25}in`,
                        }}
                      >
                        {activeChapter && chapterIsUnlocked ? (
                          <StudentDocumentRichEditor
                            key={`${chapter.id}:${previewEditorRevision}`}
                            ref={previewEditorRef}
                            content={previewDraft}
                            onChange={handlePreviewDraftChange}
                            onSelectionChange={updatePreviewSelectionState}
                            style={chapterStyle}
                          />
                        ) : chapterIsUnlocked ? (
                          <StudentDocumentMarkdown text={chapterContent} style={chapterStyle} />
                        ) : chapterPreviewPages.length ? (
                          <div className="space-y-6" aria-label="Watermarked chapter preview pages">
                            {chapterPreviewPages.map((page, pageIndex) => (
                              <img
                                key={`${pageImageKey}:${pageIndex}`}
                                src={page}
                                alt={`Watermarked preview page ${pageIndex + 1}`}
                                draggable={false}
                                onContextMenu={(event) => event.preventDefault()}
                                className="mx-auto block w-full max-w-[816px] select-none border bg-white shadow-sm"
                              />
                            ))}
                          </div>
                        ) : previewImageLoading[pageImageKey] ? (
                          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            Preparing watermarked preview pages…
                          </div>
                        ) : previewImageErrors[pageImageKey] ? (
                          <div className="flex flex-col items-center gap-3 py-20 text-sm text-muted-foreground">
                            <p>{previewImageErrors[pageImageKey]}</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void loadDocumentPreviewImages(
                                rewritePreview.chatId,
                                rewritePreview.work,
                                chapter.id,
                              )}
                            >
                              Retry preview
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3 py-20 text-center text-sm text-muted-foreground">
                            <p>The watermarked preview has not loaded yet.</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void loadDocumentPreviewImages(
                                rewritePreview.chatId,
                                rewritePreview.work,
                                chapter.id,
                              )}
                            >
                              Load preview
                            </Button>
                          </div>
                        )}
                      </section>
                    </div>
                  );
                })}
              </div>
            </main>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentWorkspace() {
  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 max-w-full flex-1">
        <StudentAssistantChat />
      </div>
    </div>
  );
}

function StudentExplore({ onPlaceOrder }: { onPlaceOrder: () => void }) {
  const tools: {
    title: string;
    description: string;
    action: string;
    icon: React.ElementType;
    ready: boolean;
    href?: string;
    onClick?: () => void;
  }[] = [
    { title: "NurseLearn", description: "Explore reviewed condition guides and educational videos for learners, families, and the public.", href: "/learn", action: "Explore NurseLearn", icon: HeartPulse, ready: true },
    { title: "Care-study service", description: "Place an order, follow its progress, and open a delivered study.", onClick: onPlaceOrder, action: "Start an order", icon: HeartPulse, ready: true },
    { title: "Practice with NurseSpin", description: "Practice with the nursing question bank and revision tools.", href: "/nursespin", action: "Open NurseSpin", icon: QuizIcon, ready: true },
    { title: "Assignment assistant", description: "Plan and refine an assignment with your course brief.", action: "Coming soon", icon: BookOpen, ready: false },
    { title: "Presentation assistant", description: "Build a clear presentation outline from your topic.", action: "Coming soon", icon: Presentation, ready: false },
    { title: "Research projects", description: "Organize a research question and project materials.", action: "Coming soon", icon: FlaskConical, ready: false },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 py-2 sm:py-6">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Explore</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Discover learning tools and services across your Nursuit workspace.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const content = (
            <div className={cn("flex h-full flex-col rounded-xl border bg-card p-5 transition-colors", tool.ready && "hover:border-primary/40 hover:bg-accent/30")}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
                <span className={cn("rounded-full px-2 py-1 text-[10px] font-medium", tool.ready ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{tool.ready ? "Available" : "Planned"}</span>
              </div>
              <h2 className="mt-4 font-semibold">{tool.title}</h2>
              <p className="mt-1 min-h-10 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">{tool.action}{tool.ready && <ArrowRight className="size-4" />}</span>
            </div>
          );
          if (!tool.ready) return <div key={tool.title} aria-disabled="true">{content}</div>;
          if (tool.onClick) {
            return <button key={tool.title} type="button" onClick={tool.onClick} className="block w-full text-left">{content}</button>;
          }
          return <Link key={tool.title} href={tool.href ?? "/"} className="block">{content}</Link>;
        })}
      </div>
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
  const { resolvedTheme, setTheme } = useTheme();
  const { student, signIn } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [orderDialog, setOrderDialog] = useState<null | "order" | "correction">(null);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [newChatRequest, setNewChatRequest] = useState(0);
  // The staff invite that arrived with a legacy student registration link.
  const [inviteToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("staff");
  });

  // Auth and order forms are dialogs; query routes open the requested dialog.
  // A layout effect so the dialog is already open on the first paint.
  useLayoutEffect(() => {
    const requestedAuth = new URLSearchParams(window.location.search).get("auth");
    if (location === "/chat" && (requestedAuth === "sign-in" || requestedAuth === "sign-up")) {
      setAuthMode(requestedAuth);
      navigate("/chat", { replace: true });
    } else if (location === "/chat/orders/new") {
      if (student) setOrderDialog("order");
      else setAuthMode("sign-in");
      navigate("/chat/orders", { replace: true });
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
  const openChat = (id: number) => {
    if (chatBusy) return;
    setActiveChatId(id);
    navigate("/chat");
  };
  const startNewChat = () => {
    if (chatBusy) return;
    setActiveChatId(null);
    setNewChatRequest((request) => request + 1);
    navigate("/chat");
  };
  const chatNavigation: StudentChatNavigation = {
    activeChatId,
    chatBusy,
    newChatRequest,
    openChat,
    startNewChat,
    setActiveChatId,
    setChatBusy,
  };

  useEffect(() => {
    setActiveChatId(null);
    setChatBusy(false);
    setNewChatRequest((request) => request + 1);
  }, [student?.id]);

  // Route parsing
  const matchPreview = location.match(/^\/chat\/orders\/(\d+)\/preview$/);
  const matchOrder = location.match(/^\/chat\/orders\/(\d+)$/);
  const matchWorkspace = location === "/chat" || location === "/chat/";
  const matchExplore = location === "/chat/explore";
  const matchDownloads = location === "/chat/downloads";

  const activeTab: TabId = matchWorkspace
    ? "workspace"
    : matchExplore
      ? "explore"
    : matchDownloads
      ? "downloads"
      : "projects";

  const handleTabSelect = (tab: TabId) => {
    if (tab === "new-chat") chatNavigation.startNewChat();
    else if (tab === "workspace") navigate("/chat");
    else if (tab === "explore") navigate("/chat/explore");
    else if (tab === "projects") navigate("/chat/orders");
    else if (tab === "downloads") navigate("/chat/downloads");
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
        {authDialog}
        {orderDialogEl}
      </div>
    );
  }

  let content: ReactNode;
  if (activeTab === "workspace") {
    content = (
      <StudentWorkspace />
    );
  } else if (activeTab === "explore") {
    content = <StudentExplore onPlaceOrder={openOrder} />;
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
    <SidebarProvider defaultOpen={typeof window === "undefined" || window.innerWidth >= 1024}>
      <StudentChatNavigationContext.Provider value={chatNavigation}>
        <div className={cn(
          "flex w-full min-w-0 bg-background",
          activeTab === "workspace" ? "h-svh overflow-hidden" : "min-h-screen",
        )}>
          <PortalSidebar
            activeTab={activeTab}
            onSelect={handleTabSelect}
            onPlaceOrder={openOrder}
            onSignIn={openSignIn}
            onSignUp={openSignUp}
          />
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
              <SidebarTrigger />
              {activeTab === "workspace" && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="New chat"
                    title="New chat"
                    disabled={chatNavigation.chatBusy}
                    onClick={() => chatNavigation.startNewChat()}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                    title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  >
                    {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </Button>
                </>
              )}
              {!student && activeTab === "workspace" && (
                <Button type="button" size="sm" className="gap-2" onClick={openSignUp}>
                  <UserPlus className="size-4" />
                  <span className="hidden sm:inline">Sign up</span>
                  <span className="sm:hidden">Join</span>
                </Button>
              )}
            </header>
            <main className={cn(
              "min-h-0 min-w-0 flex-1",
              activeTab === "workspace" ? "overflow-hidden" : "overflow-x-hidden overflow-y-auto",
            )}>
              <div className={cn(
                activeTab === "workspace"
                  ? "h-full min-h-0 w-full overflow-hidden px-3 py-2 sm:px-6 sm:py-4"
                  : "mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6",
              )}>
                <AuthGate allowGuest={activeTab === "workspace" || activeTab === "explore"} onSignIn={openSignIn}>
                  {content}
                </AuthGate>
              </div>
            </main>
            {activeTab !== "workspace" && <footer className="hidden md:block">
              <div className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
                <Separator className="mb-6" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  CareStudy Institute supports nursing education — preparing the study, and preparing you to
                  defend it. Review AI-generated content and keep patient information de-identified.
                </p>
              </div>
            </footer>}
          </SidebarInset>
        </div>
        {authDialog}
        {orderDialogEl}
      </StudentChatNavigationContext.Provider>
    </SidebarProvider>
  );
}
