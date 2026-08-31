/**
 * Admin dashboard — sidebar layout with tab navigation.
 *
 * Accessible at /studio/dashboard. Left sidebar has navigation tabs;
 * the right content area renders the active section.
 *
 * Tabs:
 * - Overview (default) — stats summary
 * - Orders — full order list with status management
 * - Staff — team management with role controls
 * - Invites — invite link generation and tracking
 * - Settings — placeholder for future admin settings
 */
import { useCallback, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  Globe,
  GraduationCap,
  HeartPulse,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  ShieldOff,
  Users,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
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
import * as adminApi from "@/lib/adminDashboardApi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCedis(pesewas: number): string {
  return `GH₵ ${(pesewas / 100).toFixed(2)}`;
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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    submitted: "secondary",
    in_production: "outline",
    ready: "default",
    cancelled: "destructive",
  };
  return <Badge variant={variants[status] ?? "secondary"}>{status.replace("_", " ")}</Badge>;
}

function PaymentBadge({ status }: { status: string }) {
  if (status === "verified")
    return (
      <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
        <CheckCircle2 className="size-3" /> Paid
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> Pending
      </Badge>
    );
  return <Badge variant="secondary">Unpaid</Badge>;
}

// ---------------------------------------------------------------------------
// Sidebar navigation
// ---------------------------------------------------------------------------

type TabId = "overview" | "orders" | "students" | "staff" | "invites" | "settings";

const TABS: { id: TabId; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "students", label: "Students", icon: GraduationCap },
  { id: "staff", label: "Staff", icon: Users },
  { id: "invites", label: "Invites", icon: UserPlus, adminOnly: true },
  { id: "settings", label: "Settings", icon: Settings },
];

function Sidebar({
  activeTab,
  onSelect,
  stats,
}: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  stats?: adminApi.DashboardStats;
}) {
  return (
    <aside className="hidden w-56 shrink-0 border-r bg-card/50 py-4 lg:block">
      <div className="px-3 mb-4">
        <Link href="/studio" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Studio
        </Link>
      </div>
      <nav className="space-y-0.5 px-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{tab.label}</span>
              {tab.id === "orders" && stats && (
                <span className="text-[10px] tabular text-muted-foreground">
                  {stats.orders.total}
                </span>
              )}
              {tab.id === "students" && stats && (
                <span className="text-[10px] tabular text-muted-foreground">
                  {stats.students.total}
                </span>
              )}
              {tab.id === "staff" && stats && (
                <span className="text-[10px] tabular text-muted-foreground">
                  {stats.staff.total}
                </span>
              )}
              {tab.id === "invites" && stats && stats.staff.pendingInvites > 0 && (
                <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">
                  {stats.staff.pendingInvites}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Mobile tab bar (bottom)
// ---------------------------------------------------------------------------

function MobileTabBar({
  activeTab,
  onSelect,
}: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex h-14 max-w-lg items-stretch">
        {TABS.slice(0, 4).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Stat card (reused in overview)
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", color ?? "bg-primary/10")}>
          <Icon className={cn("size-5", color?.includes("emerald") ? "text-emerald-600" : color?.includes("amber") ? "text-amber-600" : color?.includes("blue") ? "text-blue-600" : "text-primary")} />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Invite dialog
// ---------------------------------------------------------------------------

function InviteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  const createInvite = useMutation({
    mutationFn: () => adminApi.createInvite(label.trim() || undefined),
    onSuccess: (result) => {
      const fullUrl = `${window.location.origin}${result.invite.registrationUrl}`;
      setCreatedUrl(fullUrl);
      queryClient.invalidateQueries({ queryKey: ["admin-invites"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast.success("Invite link created.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create invite."),
  });

  const copyUrl = useCallback(() => {
    if (createdUrl) {
      navigator.clipboard.writeText(createdUrl).then(
        () => toast.success("Registration link copied to clipboard."),
        () => toast.error("Could not copy — please copy manually."),
      );
    }
  }, [createdUrl]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setCreatedUrl(null); setLabel(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            Invite staff member
          </DialogTitle>
          <DialogDescription>
            Generate a one-time registration link for a new staff member.
          </DialogDescription>
        </DialogHeader>

        {!createdUrl ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-label">Label (optional)</Label>
              <Input
                id="invite-label"
                placeholder="e.g. Academic team — Kumasi"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Helps you track who the invite was for.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => createInvite.mutate()}
              disabled={createInvite.isPending}
            >
              {createInvite.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Generate invite link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">Registration link</p>
              <p className="mt-1 break-all font-mono text-sm">{createdUrl}</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 gap-1.5" onClick={copyUrl}>
                <Copy className="size-4" /> Copy link
              </Button>
              <Button variant="outline" onClick={() => window.open(createdUrl, "_blank")}>
                <ExternalLink className="size-4" /> Open
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Share this link with the person you want to invite. They will create their own
              username and password. The link can only be used once.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function OverviewTab({ stats }: { stats?: adminApi.DashboardStats }) {
  if (!stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-lg font-semibold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Summary of your care study operations.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          icon={BookOpen}
          label="Total orders"
          value={stats.orders.total}
          sub={`${stats.orders.submitted} submitted · ${stats.orders.inProduction} in production`}
          color="bg-primary/10"
        />
        <StatCard
          icon={CheckCircle2}
          label="Ready for delivery"
          value={stats.orders.ready}
          sub={`${stats.orders.cancelled} cancelled`}
          color="bg-emerald-500/10"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue"
          value={formatCedis(stats.revenue.total)}
          sub={`${stats.revenue.paidOrderCount} payments · ${stats.revenue.fullStudyPayments} full · ${stats.revenue.chapterPayments} chapters`}
          color="bg-amber-500/10"
        />
        <StatCard
          icon={Users}
          label="Students"
          value={stats.students.total}
          sub={`${stats.staff.total} staff · ${stats.staff.admins} admin(s)`}
          color="bg-blue-500/10"
        />
      </div>

      {/* Recent orders quick list */}
      {stats.recentOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{order.id}</span>
                      <span className="truncate text-sm font-medium">{order.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PaymentBadge status={order.paymentStatus} />
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Orders
// ---------------------------------------------------------------------------

function OrdersTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: adminApi.getDashboardStats,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const orders = stats?.recentOrders ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg font-semibold">Orders</h2>
          <p className="text-sm text-muted-foreground">
            All care study orders from students.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/studio/bin">Open order bin</a>
        </Button>
      </div>

      {/* Order status breakdown */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Submitted", count: stats.orders.submitted, color: "text-amber-600" },
            { label: "In production", count: stats.orders.inProduction, color: "text-blue-600" },
            { label: "Ready", count: stats.orders.ready, color: "text-emerald-600" },
            { label: "Cancelled", count: stats.orders.cancelled, color: "text-destructive" },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="py-3 text-center">
                <p className={cn("text-2xl font-bold", item.color)}>{item.count}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent orders list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent orders</CardTitle>
          <CardDescription>
            Latest orders — visit the order bin for full management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length > 0 ? (
            <div className="space-y-2">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{order.id}</span>
                      <span className="truncate text-sm font-medium">{order.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PaymentBadge status={order.paymentStatus} />
                    <StatusBadge status={order.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Staff
// ---------------------------------------------------------------------------

function StaffTab({ onInvite }: { onInvite: () => void }) {
  const queryClient = useQueryClient();

  const { data: staffData, isLoading } = useQuery({
    queryKey: ["admin-staff"],
    queryFn: adminApi.listStaff,
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      adminApi.updateStaff(id, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast.success("Staff role updated.");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed."),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg font-semibold">Staff management</h2>
          <p className="text-sm text-muted-foreground">
            Manage your team. Admins have full access; staff can use the studio.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={onInvite}>
          <UserPlus className="size-3.5" /> Invite staff
        </Button>
      </div>

      <Card>
        <CardContent className="py-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : staffData?.staff && staffData.staff.length > 0 ? (
            <div className="divide-y">
              {staffData.staff.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {member.name || member.username}
                      </span>
                      <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                        {member.role === "admin" ? (
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="size-3" /> Admin
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <ShieldOff className="size-3" /> Staff
                          </span>
                        )}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      @{member.username}
                      {member.email ? ` · ${member.email}` : ""}
                      {" · Joined "}
                      {formatDate(member.createdAt)}
                    </p>
                  </div>
                  <Select
                    value={member.role}
                    onValueChange={(role) => updateRole.mutate({ id: member.id, role })}
                  >
                    <SelectTrigger className="h-8 w-[100px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="mb-3 grid size-10 place-items-center rounded-full bg-muted">
                <Users className="size-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">No staff members yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Generate an invite link to add your first team member.
              </p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={onInvite}>
                <UserPlus className="size-3.5" /> Invite staff
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Students
// ---------------------------------------------------------------------------

function StudentsTab() {
  const [search, setSearch] = useState("");

  const { data: studentsData, isLoading } = useQuery({
    queryKey: ["admin-students"],
    queryFn: adminApi.listStudents,
  });

  const students = studentsData?.students ?? [];
  const filtered = search
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.username.toLowerCase().includes(search.toLowerCase()) ||
          s.email.toLowerCase().includes(search.toLowerCase()) ||
          s.college.toLowerCase().includes(search.toLowerCase()),
      )
    : students;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-lg font-semibold">Students</h2>
        <p className="text-sm text-muted-foreground">
          All registered students and their order activity.
        </p>
      </div>

      {/* Summary cards */}
      {students.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10">
                <GraduationCap className="size-4 text-primary" />
              </span>
              <div>
                <p className="text-xl font-bold">{students.length}</p>
                <p className="text-xs text-muted-foreground">Total students</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-500/10">
                <ClipboardList className="size-4 text-blue-600" />
              </span>
              <div>
                <p className="text-xl font-bold">
                  {students.reduce((sum, s) => sum + s.orderCount, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Total orders</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-4 text-emerald-600" />
              </span>
              <div>
                <p className="text-xl font-bold">
                  {students.reduce((sum, s) => sum + s.paidOrders, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Paid orders</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Input
          placeholder="Search by name, email, or college…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Student list */}
      <Card>
        <CardContent className="py-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y">
              {filtered.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{student.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        @{student.username}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {student.orderCount} order{student.orderCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {student.email} · {student.college} · {student.program}
                      {student.year ? ` · ${student.year}` : ""}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Joined {formatDate(student.createdAt)}
                      {student.readyOrders > 0 && (
                        <span className="ml-2 text-emerald-600">
                          · {student.readyOrders} ready
                        </span>
                      )}
                      {student.paidOrders > 0 && (
                        <span className="ml-2 text-emerald-600">
                          · {student.paidOrders} paid
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {student.paidOrders > 0 && (
                      <Badge variant="default" className="gap-1 bg-emerald-600">
                        <CheckCircle2 className="size-3" /> Paid
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="mb-3 grid size-10 place-items-center rounded-full bg-muted">
                <GraduationCap className="size-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">
                {search ? "No students match your search" : "No students yet"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {search
                  ? "Try a different search term."
                  : "Students will appear here once they create accounts."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Invites
// ---------------------------------------------------------------------------

function InvitesTab({ onInvite }: { onInvite: () => void }) {
  const { data: inviteData, isLoading } = useQuery({
    queryKey: ["admin-invites"],
    queryFn: adminApi.listInvites,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg font-semibold">Invite links</h2>
          <p className="text-sm text-muted-foreground">
            One-time registration links for new staff members.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={onInvite}>
          <Plus className="size-3.5" /> New invite
        </Button>
      </div>

      <Card>
        <CardContent className="py-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : inviteData?.invites && inviteData.invites.length > 0 ? (
            <div className="divide-y">
              {inviteData.invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {invite.label || `Invite #${invite.id}`}
                      </span>
                      {invite.usedAt ? (
                        <Badge variant="default" className="gap-1 bg-emerald-600">
                          <CheckCircle2 className="size-3" /> Used
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Globe className="size-3" /> Pending
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created by {invite.createdBy} · {formatDate(invite.createdAt)}
                      {invite.usedBy ? ` · Used by ${invite.usedBy}` : ""}
                    </p>
                  </div>
                  {!invite.usedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => {
                        const url = `${window.location.origin}${invite.registrationUrl}`;
                        navigator.clipboard.writeText(url).then(
                          () => toast.success("Link copied."),
                          () => toast.error("Could not copy."),
                        );
                      }}
                    >
                      <Copy className="size-3.5" /> Copy
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="mb-3 grid size-10 place-items-center rounded-full bg-muted">
                <UserPlus className="size-5 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">No invite links yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create one to invite your first staff member.
              </p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={onInvite}>
                <Plus className="size-3.5" /> Create invite
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Settings (placeholder)
// ---------------------------------------------------------------------------

function SettingsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure your CareStudy workspace.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <span className="mb-3 grid size-10 place-items-center rounded-full bg-muted">
            <Settings className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm font-medium">Coming soon</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Workspace settings, notification preferences, and branding configuration
            will be available here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function AdminDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: adminApi.getDashboardStats,
  });

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <Sidebar activeTab={activeTab} onSelect={setActiveTab} stats={stats} />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <Link
                href="/studio"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5 text-muted-foreground")}
              >
                <ArrowLeft className="size-4" /> Studio
              </Link>
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] })}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Tab content */}
          {activeTab === "overview" && <OverviewTab stats={stats} />}
          {activeTab === "orders" && <OrdersTab />}
          {activeTab === "students" && <StudentsTab />}
          {activeTab === "staff" && <StaffTab onInvite={() => setInviteOpen(true)} />}
          {activeTab === "invites" && <InvitesTab onInvite={() => setInviteOpen(true)} />}
          {activeTab === "settings" && <SettingsTab />}
        </div>
      </main>

      {/* Mobile tab bar */}
      <MobileTabBar activeTab={activeTab} onSelect={setActiveTab} />

      {/* Mobile spacer */}
      <div className="h-14 lg:hidden" />

      {/* Invite dialog */}
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
