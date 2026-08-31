/**
 * Welcome page — shown after sign-in, greets the user and provides quick actions.
 *
 * Fetches auth data directly (not via context) since /welcome sits outside
 * the AdminGate and StudentPortal auth providers.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  DollarSign,
  Download,
  GraduationCap,
  HeartPulse,
  Loader2,
  ShieldCheck,
  Stethoscope,
  Users,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import * as adminDashboardApi from "@/lib/adminDashboardApi";
import * as studentApi from "@/lib/studentApi";
import { getAdminToken, fetchAdminMe, type Admin } from "@/lib/adminAuth";

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const EASE = [0.25, 0.1, 0.25, 1] as [number, number, number, number];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.5,
      ease: EASE,
    },
  }),
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: {
      delay: i * 0.1,
      duration: 0.4,
      ease: EASE,
    },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: EASE,
    },
  },
};

const slideUp = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: EASE,
    },
  },
};

// ---------------------------------------------------------------------------
// Brand mark
// ---------------------------------------------------------------------------

function BrandMark() {
  return (
    <motion.span
      className="flex items-center gap-2.5"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <span className="brand-tile grid size-10 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
        <HeartPulse className="size-5" />
      </span>
      <span>
        <span className="block font-serif text-lg leading-none tracking-tight text-foreground">
          care<span className="text-primary">study</span>
        </span>
        <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          nursing academic support
        </span>
      </span>
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(admin: Admin | null): string {
  if (!admin) return "??";
  const source = admin.name || admin.username;
  const parts = source.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function getGreeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ---------------------------------------------------------------------------
// Quick action card
// ---------------------------------------------------------------------------

function ActionCard({
  icon: Icon,
  title,
  description,
  href,
  color,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  color?: string;
}) {
  return (
    <motion.div variants={staggerItem}>
      <Link href={href}>
        <Card className="group cursor-pointer transition-all hover:border-primary/40 hover:shadow-md">
          <CardContent className="flex items-start gap-4 py-5">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", color ?? "bg-primary/10")}>
              <Icon
                className={cn(
                  "size-5",
                  color?.includes("emerald") ? "text-emerald-600"
                    : color?.includes("amber") ? "text-amber-600"
                      : color?.includes("blue") ? "text-blue-600"
                        : "text-primary",
                )}
              />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold group-hover:text-primary">{title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  iconColor,
  label,
  value,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: string | number;
}) {
  return (
    <motion.div variants={staggerItem}>
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", iconColor)}>
            <Icon className="size-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main welcome page
// ---------------------------------------------------------------------------

export function WelcomePage() {
  const [, navigate] = useLocation();
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  const hasAdminToken = Boolean(getAdminToken());
  const hasStudentToken = Boolean(studentApi.getStudentToken());

  // Fetch admin profile directly — no context needed
  useEffect(() => {
    if (!hasAdminToken) {
      setLoading(false);
      return;
    }
    fetchAdminMe()
      .then(({ admin }) => setAdmin(admin))
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false));
  }, [hasAdminToken]);

  const isAdmin = admin !== null && admin.role === "admin";
  const isStaff = admin !== null && admin.role !== "admin";
  const isStudent = hasStudentToken && !hasAdminToken;

  const handleContinue = () => {
    if (isAdmin) navigate("/studio/dashboard", { replace: true });
    else if (isStaff) navigate("/studio", { replace: true });
    else if (isStudent) navigate("/student/orders", { replace: true });
  };

  const greeting = getGreeting();

  // Loading
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </motion.div>
      </div>
    );
  }

  // Not signed in at all
  if (!admin && !isStudent) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <Card className="w-full max-w-sm text-center">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <BrandMark />
              <p className="text-sm text-muted-foreground">You are not signed in.</p>
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <motion.header
        className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <BrandMark />
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
            >
              <Badge variant="secondary" className="text-[10px]">
                {isAdmin ? "Admin" : isStaff ? "Staff" : "Student"}
              </Badge>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.3 }}
            >
              <Button size="sm" className="gap-1.5" onClick={handleContinue}>
                Continue <ArrowRight className="size-3.5" />
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        {/* ── Admin ── */}
        {isAdmin && <AdminView admin={admin} />}

        {/* ── Staff ── */}
        {isStaff && <StaffView admin={admin} />}

        {/* ── Student ── */}
        {isStudent && <StudentView greeting={greeting} />}

        {/* Continue */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5, ease: EASE }}
        >
          <Button size="lg" onClick={handleContinue} className="gap-2">
            Continue to workspace <ArrowRight className="size-4" />
          </Button>
        </motion.div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin view
// ---------------------------------------------------------------------------

function AdminView({ admin }: { admin: Admin }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: adminDashboardApi.getDashboardStats,
  });

  const firstName = admin.name?.split(" ")[0] ?? admin.username;

  return (
    <motion.div
      className="space-y-8"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* Greeting */}
      <motion.div className="flex items-center gap-5" variants={fadeUp} custom={0}>
        <motion.span
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 font-serif text-xl font-bold text-primary"
          variants={scaleIn}
          custom={0}
        >
          {getInitials(admin)}
        </motion.span>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome to your admin dashboard. Here's your overview.
          </p>
        </div>
      </motion.div>

      {/* Stats */}
      {isLoading ? (
        <motion.div className="grid gap-3 sm:grid-cols-3" variants={staggerContainer}>
          {[1, 2, 3].map((i) => (
            <motion.div key={i} variants={staggerItem}>
              <Card>
                <CardContent className="py-5">
                  <div className="flex items-center gap-3">
                    <div className="size-10 animate-pulse rounded-lg bg-muted" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-10 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : stats ? (
        <motion.div className="grid gap-3 sm:grid-cols-3" variants={staggerContainer}>
          <StatCard icon={ClipboardList} iconColor="bg-primary/10 text-primary" label="Total orders" value={stats.orders.total} />
          <StatCard icon={DollarSign} iconColor="bg-emerald-500/10 text-emerald-600" label="Revenue" value={`GH₵ ${(stats.revenue.total / 100).toFixed(0)}`} />
          <StatCard icon={Users} iconColor="bg-blue-500/10 text-blue-600" label="Staff" value={stats.staff.total} />
        </motion.div>
      ) : null}

      {/* Quick actions */}
      <motion.div variants={fadeUp} custom={3}>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Quick actions</h2>
        <motion.div className="grid gap-3 sm:grid-cols-2" variants={staggerContainer}>
          <ActionCard icon={ClipboardList} title="Order bin" description="Review and manage incoming student orders" href="/studio/bin" />
          <ActionCard icon={Stethoscope} title="Drafting studio" description="Open the care study drafting workspace" href="/studio" />
          <ActionCard icon={ShieldCheck} title="Admin dashboard" description="View stats, manage staff, and generate invites" href="/studio/dashboard" />
          <ActionCard icon={UserPlus} title="Invite staff" description="Generate a registration link for a new team member" href="/studio/dashboard" />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Staff view
// ---------------------------------------------------------------------------

function StaffView({ admin }: { admin: Admin }) {
  const firstName = admin.name?.split(" ")[0] ?? admin.username;

  return (
    <motion.div
      className="space-y-8"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* Greeting */}
      <motion.div className="flex items-center gap-5" variants={fadeUp} custom={0}>
        <motion.span
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 font-serif text-xl font-bold text-primary"
          variants={scaleIn}
          custom={0}
        >
          {getInitials(admin)}
        </motion.span>
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome to the CareStudy studio. Ready to produce some care studies?
          </p>
        </div>
      </motion.div>

      {/* Quick actions */}
      <motion.div variants={fadeUp} custom={1}>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Quick actions</h2>
        <motion.div className="grid gap-3 sm:grid-cols-2" variants={staggerContainer}>
          <ActionCard icon={ClipboardList} title="Order bin" description="Review incoming student orders and attach materials" href="/studio/bin" />
          <ActionCard icon={Stethoscope} title="Drafting studio" description="Open the care study drafting workspace" href="/studio" />
        </motion.div>
      </motion.div>

      {/* Getting started */}
      <motion.div variants={slideUp}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <BookOpen className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Getting started</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Start by checking the order bin for new student orders. Open each order in the
                studio to produce the care study from the student's materials. When the study is
                ready, deliver it from the order bin.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Student view
// ---------------------------------------------------------------------------

function StudentView({ greeting }: { greeting: string }) {
  const { data: meData } = useQuery({
    queryKey: ["student-me-welcome"],
    queryFn: async () => (await studentApi.fetchMe()).student,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["student-orders-welcome"],
    queryFn: async () => (await studentApi.listOrders()).orders,
  });

  const firstName = meData?.name?.split(" ")[0] ?? "";
  const orders = data ?? [];
  const activeOrders = orders.filter((o) => o.status === "submitted" || o.status === "in_production");
  const readyOrders = orders.filter((o) => o.status === "ready");

  return (
    <motion.div
      className="space-y-8"
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
    >
      {/* Greeting */}
      <motion.div variants={fadeUp} custom={0}>
        <motion.p
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          The Care Study Support Programme
        </motion.p>
        <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your care study projects, download delivered work, and prepare for your viva.
        </p>
      </motion.div>

      {/* Stats */}
      {isLoading ? (
        <motion.div className="grid gap-3 sm:grid-cols-3" variants={staggerContainer}>
          {[1, 2, 3].map((i) => (
            <motion.div key={i} variants={staggerItem}>
              <Card>
                <CardContent className="py-5">
                  <div className="flex items-center gap-3">
                    <div className="size-10 animate-pulse rounded-lg bg-muted" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-8 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div className="grid gap-3 sm:grid-cols-3" variants={staggerContainer}>
          <StatCard icon={ClipboardList} iconColor="bg-primary/10 text-primary" label="Total projects" value={orders.length} />
          <StatCard icon={Clock} iconColor="bg-amber-500/10 text-amber-600" label="In progress" value={activeOrders.length} />
          <StatCard icon={CheckCircle2} iconColor="bg-emerald-500/10 text-emerald-600" label="Ready to download" value={readyOrders.length} />
        </motion.div>
      )}

      {/* Quick actions */}
      <motion.div variants={fadeUp} custom={3}>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Quick actions</h2>
        <motion.div className="grid gap-3 sm:grid-cols-2" variants={staggerContainer}>
          <ActionCard icon={ClipboardList} title="My projects" description="View and track your care study orders" href="/student/orders" />
          <ActionCard icon={BookOpen} title="Place an order" description="Submit a new care study order with your materials" href="/student/orders/new" />
          {readyOrders.length > 0 && (
            <ActionCard icon={Download} title="Download your study" description={`${readyOrders.length} completed ${readyOrders.length === 1 ? "study" : "studies"} ready for download`} href={`/student/orders/${readyOrders[0].id}/preview`} color="bg-emerald-500/10" />
          )}
        </motion.div>
      </motion.div>

      {/* Viva info */}
      <motion.div variants={slideUp}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <GraduationCap className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Viva Preparation Programme</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Once your study is delivered, you can build a mock defense question bank and
                practice for your viva — all from your project dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
