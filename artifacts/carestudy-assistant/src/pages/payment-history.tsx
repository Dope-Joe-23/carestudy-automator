/**
 * Payment history page — shows all past payments with receipts.
 *
 * Mounted at /student/payments. Lists every order that has been paid for,
 * with the amount, scope, date, Paystack reference, and a downloadable
 * receipt summary. Orders without payments are shown separately so the
 * student can see which projects still need payment.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  Eye,
  FileText,
  Hash,
  HeartPulse,
  Loader2,
  Receipt,
  Search,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amountPesewas: number | null): string {
  if (amountPesewas === null) return "—";
  const cedis = amountPesewas / 100;
  return `GH₵ ${cedis.toFixed(2)}`;
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

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Payment status badge
// ---------------------------------------------------------------------------

function PaymentBadge({
  status,
  scope,
}: {
  status: studentApi.PaymentStatus;
  scope: studentApi.PaidScope;
}) {
  if (status === "verified") {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="size-3" />
        Paid · {scope === "full" ? "Full study" : "Chapter"}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="size-3 animate-spin" />
        Pending
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="size-3" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CreditCard className="size-3" />
      Unpaid
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Receipt dialog
// ---------------------------------------------------------------------------

function ReceiptDialog({
  open,
  onClose,
  order,
}: {
  open: boolean;
  onClose: () => void;
  order: studentApi.Order;
}) {
  const isPaid = order.paymentStatus === "verified";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Payment Receipt
          </DialogTitle>
          <DialogDescription>
            {isPaid ? "Payment confirmed — save this receipt for your records." : "Payment details for this order."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt card */}
          <div className="rounded-lg border bg-card p-5">
            <div className="border-b pb-3 text-center">
              <p className="font-serif text-lg font-semibold">
                care<span className="text-primary">study</span>
              </p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Payment Receipt
              </p>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order</span>
                <span className="font-medium">#{order.id} — {order.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scope</span>
                <span className="font-medium">
                  {order.paidScope === "full" ? "Full Care Study" : "Single Chapter"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount paid</span>
                <span className="font-semibold text-primary">
                  {formatCurrency(order.paidAmount)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <PaymentBadge status={order.paymentStatus} scope={order.paidScope} />
              </div>
              {order.paystackRef && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{order.paystackRef}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDateTime(order.updatedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">College</span>
                <span>{order.college}</span>
              </div>
            </div>
          </div>

          {isPaid && (
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Secured by Paystack. Transaction reference: {order.paystackRef}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Payment row
// ---------------------------------------------------------------------------

function PaymentRow({
  order,
  onReceipt,
}: {
  order: studentApi.Order;
  onReceipt: () => void;
}) {
  const isPaid = order.paymentStatus === "verified";
  const isReady = order.status === "ready";

  return (
    <Card className="transition-colors hover:border-primary/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold leading-snug">{order.title}</h3>
            <PaymentBadge status={order.paymentStatus} scope={order.paidScope} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="size-3" /> Order #{order.id}
            </span>
            {isPaid && order.paidAmount !== null && (
              <span className="flex items-center gap-1 font-semibold text-foreground">
                <CreditCard className="size-3" /> {formatCurrency(order.paidAmount)}
              </span>
            )}
            {isPaid && (
              <span className="flex items-center gap-1">
                <Calendar className="size-3" /> {formatDate(order.updatedAt)}
              </span>
            )}
            {order.paystackRef && (
              <span className="flex items-center gap-1">
                <Hash className="size-3" /> {order.paystackRef.slice(0, 20)}…
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPaid && (
            <Button size="sm" variant="outline" onClick={onReceipt}>
              <Receipt className="size-4" /> Receipt
            </Button>
          )}
          {isReady && (
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/student/orders/${order.id}/preview`}>
                <Eye className="size-4" /> Preview
              </Link>
            </Button>
          )}
          {isReady && (
            <Button size="sm" asChild>
              <Link href={`/student/orders/${order.id}`}>
                View <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main payment history page
// ---------------------------------------------------------------------------

export function PaymentHistoryPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-orders"],
    queryFn: async () => (await studentApi.listOrders()).orders,
  });

  const [receiptOrder, setReceiptOrder] = useState<studentApi.Order | null>(null);
  const [search, setSearch] = useState("");

  const orders = data ?? [];

  // Split into paid and unpaid
  const paidOrders = useMemo(() => {
    return orders
      .filter((o) => o.paymentStatus === "verified")
      .filter(
        (o) =>
          !search ||
          o.title.toLowerCase().includes(search.toLowerCase()) ||
          o.diagnosis?.toLowerCase().includes(search.toLowerCase()) ||
          o.paystackRef?.toLowerCase().includes(search.toLowerCase()),
      );
  }, [orders, search]);

  const unpaidOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === "ready" &&
        o.delivery &&
        o.paymentStatus !== "verified",
    );
  }, [orders]);

  const totalPaid = useMemo(() => {
    return paidOrders.reduce((sum, o) => sum + (o.paidAmount ?? 0), 0);
  }, [paidOrders]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Could not load your payment history — please try again.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Account
        </p>
        <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
          Payment history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View all your payments, download receipts, and track outstanding balances.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10">
              <Receipt className="size-5 text-primary" />
            </span>
            <div>
              <p className="text-2xl font-bold">{paidOrders.length}</p>
              <p className="text-xs text-muted-foreground">Payments made</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/10">
              <CreditCard className="size-5 text-emerald-600" />
            </span>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
              <p className="text-xs text-muted-foreground">Total spent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-500/10">
              <BookOpen className="size-5 text-amber-600" />
            </span>
            <div>
              <p className="text-2xl font-bold text-amber-600">{unpaidOrders.length}</p>
              <p className="text-xs text-muted-foreground">Awaiting payment</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      {paidOrders.length > 0 && (
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title, diagnosis, or reference…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XCircle className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Paid orders */}
      {paidOrders.length > 0 ? (
        <div className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="size-4 text-primary" /> Completed payments
          </h2>
          <div className="space-y-2">
            {paidOrders.map((order) => (
              <PaymentRow
                key={order.id}
                order={order}
                onReceipt={() => setReceiptOrder(order)}
              />
            ))}
          </div>
        </div>
      ) : (
        <Card className="mb-8">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted">
              <Receipt className="size-6 text-muted-foreground" />
            </span>
            <h2 className="font-serif text-lg font-semibold">No payments yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              When you purchase a completed study, your payment history and receipts will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Unpaid ready orders */}
      {unpaidOrders.length > 0 && (
        <div>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="size-4 text-amber-600" /> Awaiting payment
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            These studies are ready for download but require payment first.
          </p>
          <div className="space-y-2">
            {unpaidOrders.map((order) => (
              <PaymentRow
                key={order.id}
                order={order}
                onReceipt={() => setReceiptOrder(order)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Footer note */}
      <footer className="mt-10 border-t pt-5">
        <p className="text-xs leading-relaxed text-muted-foreground">
          All payments are processed securely through Paystack. For payment disputes or questions,
          contact our support team with your transaction reference.
        </p>
      </footer>

      {/* Receipt dialog */}
      {receiptOrder && (
        <ReceiptDialog
          open={Boolean(receiptOrder)}
          onClose={() => setReceiptOrder(null)}
          order={receiptOrder}
        />
      )}
    </div>
  );
}
