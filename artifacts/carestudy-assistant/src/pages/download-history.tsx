/**
 * Download history — the student's record of delivered care studies.
 *
 * Mounted at /student/downloads. The platform no longer charges students: each
 * delivery is locked behind a PIN the staff sets and releases once they have
 * been paid (off-platform). This page shows every delivered study, whether its
 * PIN has been released, and lets the student export the ones that are open.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  Search,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PinDownloadDialog } from "@/components/pin-download-dialog";
import * as studentApi from "@/lib/studentApi";

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

function AccessBadge({ order }: { order: studentApi.Order }) {
  if (order.firstDownloadedAt) {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="size-3" />
        Downloaded
      </Badge>
    );
  }
  if (order.pin.released) {
    return (
      <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
        <KeyRound className="size-3" />
        PIN released
      </Badge>
    );
  }
  if (order.pin.set) {
    return (
      <Badge variant="outline" className="gap-1">
        <KeyRound className="size-3" />
        Ready · PIN set
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Clock className="size-3" />
      Awaiting delivery
    </Badge>
  );
}

function DownloadRow({
  order,
  onDownload,
}: {
  order: studentApi.Order;
  onDownload: () => void;
}) {
  return (
    <Card className="transition-colors hover:border-primary/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold leading-snug">{order.title}</h3>
            <AccessBadge order={order} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="size-3" /> Order #{order.id}
            </span>
            {order.delivery && (
              <span>
                {order.delivery.filename} · {formatBytes(order.delivery.size)}
              </span>
            )}
            {order.pin.released && order.pin.releasedAt && (
              <span className="flex items-center gap-1">
                <KeyRound className="size-3" /> Released {formatDate(order.pin.releasedAt)}
              </span>
            )}
            {order.firstDownloadedAt && (
              <span className="flex items-center gap-1 text-primary">
                <Download className="size-3" /> {formatDate(order.firstDownloadedAt)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/student/orders/${order.id}/preview`}>
              <Eye className="size-4" /> Preview
            </Link>
          </Button>
          {order.pin.set ? (
            <Button size="sm" className="gap-1.5" onClick={onDownload}>
              <Download className="size-4" /> Download
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled
              title="Your completed study has not been delivered yet"
            >
              <Lock className="size-4" /> Locked
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DownloadHistoryPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-orders"],
    queryFn: async () => (await studentApi.listOrders()).orders,
  });

  const [search, setSearch] = useState("");
  const [downloadOrder, setDownloadOrder] = useState<studentApi.Order | null>(null);

  const orders = useMemo(
    () => (data ?? []).filter((order) => order.status === "ready" && order.delivery),
    [data],
  );

  const filtered = useMemo(
    () =>
      orders.filter(
        (order) =>
          !search ||
          order.title.toLowerCase().includes(search.toLowerCase()) ||
          order.diagnosis?.toLowerCase().includes(search.toLowerCase()),
      ),
    [orders, search],
  );

  const readyCount = orders.filter((order) => order.pin.set).length;
  const downloadedCount = orders.filter((order) => order.firstDownloadedAt).length;

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
          Could not load your downloads — please try again.
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
          Download history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every completed study, its PIN status, and when you last exported it.
        </p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10">
              <FileText className="size-5 text-primary" />
            </span>
            <div>
              <p className="text-2xl font-bold">{orders.length}</p>
              <p className="text-xs text-muted-foreground">Delivered studies</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500/10">
              <KeyRound className="size-5 text-emerald-600" />
            </span>
            <div>
              <p className="text-2xl font-bold text-emerald-600">{readyCount}</p>
              <p className="text-xs text-muted-foreground">Ready to download</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-500/10">
              <Download className="size-5 text-sky-600" />
            </span>
            <div>
              <p className="text-2xl font-bold text-sky-600">{downloadedCount}</p>
              <p className="text-xs text-muted-foreground">Downloaded</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {orders.length > 0 && (
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title or diagnosis…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted">
              <Download className="size-6 text-muted-foreground" />
            </span>
            <h2 className="font-serif text-lg font-semibold">Nothing delivered yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              When a study is completed and delivered, it appears here. Enter the download PIN your
              academic team gives you to export it.
            </p>
            <Button className="mt-5" asChild>
              <Link href="/student/orders">
                My projects <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No delivered studies match “{search}”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <DownloadRow
              key={order.id}
              order={order}
              onDownload={() => setDownloadOrder(order)}
            />
          ))}
        </div>
      )}

      <footer className="mt-10 border-t pt-5">
        <p className={cn("text-xs leading-relaxed text-muted-foreground")}>
          Payments for your care study are handled directly with your academic team. CareStudy
          Institute never charges you through this portal — the download PIN simply confirms your
          study is cleared for release.
        </p>
      </footer>

      {downloadOrder && (
        <PinDownloadDialog
          open={Boolean(downloadOrder)}
          onClose={() => setDownloadOrder(null)}
          order={downloadOrder}
        />
      )}
    </div>
  );
}
