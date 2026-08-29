/**
 * Studio order bin — the inbox where student orders land with their attached
 * materials. The studio advances each order from submitted → in production →
 * ready and attaches the completed study, which the student then sees on
 * their dashboard.
 *
 * Mounted at /studio. Uses the same unauthenticated trust model as the rest
 * of the studio API (the studio runs on the agency's own machines).
 */
import { useMemo, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  HeartPulse,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
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
  attachOrderDelivery,
  getStudioOrder,
  listStudioOrders,
  produceOrder,
  readFileAsBase64,
  setOrderStatus,
  type OrderFile,
  type OrderStatus,
  type StudioOrder,
} from "@/lib/studentApi";

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "submitted", label: "Submitted" },
  { value: "in_production", label: "In production" },
  { value: "ready", label: "Ready" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  submitted: "secondary",
  in_production: "outline",
  ready: "default",
  cancelled: "destructive",
};

const FILE_KIND_LABELS: Record<"guidelines" | "clinical" | "reference" | "correction", string> = {
  guidelines: "Care study guidelines",
  clinical: "Clinical notes & assessment data",
  reference: "Reference documents",
  correction: "Uploaded study for correction",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function OrderRow({ order }: { order: StudioOrder }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [note, setNote] = useState(order.note ?? "");
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);

  // The order's attached documents, fetched on demand when the student's
  // materials are expanded — this is what the study will be produced from.
  const materialsQuery = useQuery({
    queryKey: ["studio-order", order.id],
    queryFn: async () => (await getStudioOrder(order.id)).files,
    enabled: materialsOpen,
  });

  const updateStatus = useMutation({
    mutationFn: async () => setOrderStatus(order.id, status, note.trim() || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["studio-orders"] });
      toast.success(`Order #${order.id} updated.`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });

  const uploadDelivery = useMutation({
    mutationFn: async () => {
      if (!deliveryFile) throw new Error("Choose a file first");
      return attachOrderDelivery(
        order.id,
        deliveryFile.name,
        await readFileAsBase64(deliveryFile),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["studio-orders"] });
      setDeliveryFile(null);
      toast.success(`Study delivered for order #${order.id} — student can now download it.`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delivery failed"),
  });

  const onPickDelivery = (event: ChangeEvent<HTMLInputElement>) => {
    setDeliveryFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const dirty = status !== order.status || note.trim() !== (order.note ?? "");

  /** Open the studio with this order's study loaded (it resumes the last study). */
  const openInStudio = (studyId: number) => {
    try {
      window.localStorage.setItem("carestudy_last_study", String(studyId));
    } catch {
      // storage unavailable — the studio just opens a blank workspace
    }
    navigate("/studio");
  };

  // Turn the order into a studio study: create the study, attach every
  // attached document as a clinical upload, and index it for drafting.
  const produce = useMutation({
    mutationFn: async () => produceOrder(order.id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["studio-orders"] });
      toast.success("Study created from the order — opening it in the studio.");
      openInStudio(result.study.id);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not create the study"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">#{order.id}</span>
              <h3 className="font-semibold leading-snug">{order.title}</h3>
              {order.correctionScope && (
                <Badge variant="default">Correction · {order.correctionScope}</Badge>
              )}
              <Badge variant={STATUS_VARIANT[order.status]}>{order.status.replace("_", " ")}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {order.student ? (
                <>
                  <span className="font-medium text-foreground">{order.student.name}</span> ·{" "}
                  {order.student.email}
                </>
              ) : (
                "Unknown student"
              )}{" "}
              · {order.program} · Submitted {formatDate(order.createdAt)}
            </p>
            {order.diagnosis && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Diagnosis: {order.diagnosis}
              </p>
            )}
          </div>
          <div className="flex flex-col items-stretch gap-2">
            {order.producedStudyId ? (
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => order.producedStudyId && openInStudio(order.producedStudyId)}
                >
                  <ExternalLink className="size-4" /> Open in studio
                </Button>

              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Button size="sm" onClick={() => produce.mutate()} disabled={produce.isPending}>
                  {produce.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {produce.isPending
                    ? order.correctionScope
                      ? 'Extracting document…'
                      : 'Creating study…'
                    : 'Start producing'
                  }
                </Button>
                {produce.isPending && order.correctionScope && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    AI is parsing the document into sections and extracting field data. This may take a minute.
                  </p>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setMaterialsOpen((open) => !open)}
            >
              <ClipboardList className="size-4" />
              Materials ({order.fileCount})
              <ChevronDown
                className={cn("size-3.5 transition-transform", materialsOpen && "rotate-180")}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {order.notes && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-relaxed">
            <span className="font-semibold">Project notes: </span>
            {order.notes}
          </p>
        )}

        {order.correctionText && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
              Requested changes
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{order.notes}</p>
            <p className="mt-3 border-t border-primary/20 pt-3 text-xs text-muted-foreground">
              The exact extracted text from the uploaded {order.correctionScope} is loaded into the
              editable preview when you open the produced study.
            </p>
          </div>
        )}

        {materialsOpen && (
          <div className="rounded-lg border bg-background p-3">
            {materialsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading materials…
              </div>
            ) : materialsQuery.isError ? (
              <p className="text-xs text-muted-foreground">Could not load the materials.</p>
            ) : materialsQuery.data && materialsQuery.data.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No documents were attached to this order.
              </p>
            ) : (
              <div className="space-y-3">
                {(["correction", "guidelines", "clinical", "reference"] as const).map((kind) => {
                  const kindFiles = (materialsQuery.data ?? []).filter((file) => file.kind === kind);
                  if (kindFiles.length === 0) return null;
                  return (
                    <div key={kind}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {FILE_KIND_LABELS[kind]}
                      </p>
                      <ul className="space-y-1">
                        {kindFiles.map((file) => (
                          <li key={file.id} className="flex items-center gap-2 text-xs">
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                            <span className="shrink-0 text-muted-foreground">
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
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={status} onValueChange={(value) => setStatus(value as OrderStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Note to student</label>
            <Input
              placeholder="e.g. We've begun chapter one…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus.mutate()}
              disabled={updateStatus.isPending || !dirty}
            >
              {updateStatus.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Save status
            </Button>
            {order.delivery && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Download className="size-3.5" />
                Delivered: {order.delivery.filename}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="file"
              className="h-8 max-w-[220px] text-xs"
              onChange={onPickDelivery}
              disabled={uploadDelivery.isPending}
            />
            <Button
              size="sm"
              onClick={() => uploadDelivery.mutate()}
              disabled={!deliveryFile || uploadDelivery.isPending}
            >
              {uploadDelivery.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Deliver study
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StudioBin() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["studio-orders"],
    queryFn: async () => (await listStudioOrders()).orders,
    refetchInterval: 15_000,
  });

  const counts = useMemo(() => {
    const result: Record<OrderStatus, number> = {
      submitted: 0,
      in_production: 0,
      ready: 0,
      cancelled: 0,
    };
    for (const order of data ?? []) result[order.status] += 1;
    return result;
  }, [data]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2.5">
            <span className="brand-tile grid size-9 shrink-0 place-items-center rounded-xl text-sidebar-primary-foreground">
              <HeartPulse className="size-5" />
            </span>
            <span>
              <span className="block font-serif text-base leading-none tracking-tight text-foreground">
                care<span className="text-primary">study</span>
              </span>
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                studio · order bin
              </span>
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="/studio">Open studio</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Incoming work
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            Order bin
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Student orders arrive here with their attached materials, ready to produce. Start
            producing to create the study in the studio with every document attached, then deliver
            the completed study when it's ready.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <Badge key={option.value} variant={STATUS_VARIANT[option.value]}>
                {option.label}: {counts[option.value]}
              </Badge>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Could not load orders — is the API server running?
            </CardContent>
          </Card>
        ) : !data || data.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10">
                <Mail className="size-6 text-primary" />
              </span>
              <h2 className="font-serif text-lg font-semibold">The bin is empty</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                When a student places an order on the portal, it lands here with all their attached
                documents.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {data.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </div>
        )}

        <Separator className="my-8" />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          Delivering a study marks the order ready — the student immediately sees the download on
          their dashboard.
        </p>
      </main>
    </div>
  );
}
