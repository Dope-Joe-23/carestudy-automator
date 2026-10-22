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
  CircleAlert,
  ClipboardList,
  CheckCircle2,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  HeartPulse,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Unlock,
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
import { SidebarTrigger } from "@/components/ui/sidebar";
import { OrderStatusFilter } from "@/components/order-status-filter";
import { getPaystackKey, payWithPaystack } from "@/lib/paystack";
import {
  attachOrderDelivery,
  autoDeliverOrder,
  getCommissionSummary,
  getStudioOrder,
  getStudioStudySnapshot,
  listStudioOrders,
  payOrderCommission,
  produceOrder,
  releaseOrderPin,
  setOrderStatus,
  verifyOrderCommission,
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

const CANONICAL_SECTION_IDS = [
  "P.1", "P.2", "P.3",
  "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10", "1.11",
  "2.1", "2.2", "2.3", "2.4", "2.5", "3.1", "3.2", "4.1", "4.2", "4.3",
  "5.1", "5.2", "5.3", "6.1", "6.2", "6.3",
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function OrderRow({
  order,
  duesTotal,
  duesBlocked,
}: {
  order: StudioOrder;
  duesTotal: number;
  duesBlocked: boolean;
}) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(order.note ?? "");
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);
  const [deliverySuccess, setDeliverySuccess] = useState(false);
  const [pin, setPin] = useState("");
  const [redeliver, setRedeliver] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [productionReport, setProductionReport] = useState<{
    mapped: number;
    expected: number;
    missing: string[];
    error?: string;
  } | null>(null);

  const existingCoverageQuery = useQuery({
    queryKey: ["studio-order-coverage", order.id, order.producedStudyId],
    queryFn: async () => {
      if (!order.producedStudyId) return null;
      const snapshot = await getStudioStudySnapshot(order.producedStudyId);
      const detected = (snapshot.data?.chapters ?? [])
        .flatMap((chapter) => chapter.sections ?? [])
        .map((section) => section.id)
        .filter((id): id is string => typeof id === "string" && CANONICAL_SECTION_IDS.includes(id));
      const uniqueDetected = [...new Set(detected)];
      return {
        mapped: uniqueDetected.length,
        expected: CANONICAL_SECTION_IDS.length,
        missing: CANONICAL_SECTION_IDS.filter((id) => !uniqueDetected.includes(id)),
      };
    },
    enabled: Boolean(order.correctionScope && order.producedStudyId) && !productionReport,
  });

  const extractionSummary = productionReport ?? existingCoverageQuery.data;

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

  /** Every delivery must install a fresh 4–8 digit download PIN. */
  const requirePin = () => {
    const trimmed = pin.trim();
    if (!/^\d{4,8}$/.test(trimmed)) {
      throw new Error("Set a 4–8 digit download PIN before delivering.");
    }
    return trimmed;
  };

  const afterDelivery = async (message: string) => {
    await queryClient.invalidateQueries({ queryKey: ["studio-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["studio-commissions"] });
    setDeliveryFile(null);
    setDeliverySuccess(true);
    setRedeliver(false);
    setPin("");
    toast.success(message);
    setTimeout(() => setDeliverySuccess(false), 3000);
  };

  const uploadDelivery = useMutation({
    mutationFn: async () => {
      if (!deliveryFile) throw new Error("Choose a file first");
      return attachOrderDelivery(order.id, deliveryFile, requirePin());
    },
    onSuccess: async () =>
      afterDelivery(
        `Study delivered for order #${order.id} — the PIN is set and the study stays locked until you release it.`,
      ),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delivery failed"),
  });

  const autoDeliver = useMutation({
    mutationFn: async () => autoDeliverOrder(order.id, requirePin()),
    onSuccess: async () =>
      afterDelivery(
        `Study exported and delivered for order #${order.id} — the PIN is set and the study stays locked until you release it.`,
      ),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Auto-deliver failed"),
  });

  const release = useMutation({
    mutationFn: async () => releaseOrderPin(order.id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["studio-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["studio-commissions"] });
      toast.success(`Download PIN released for order #${order.id}.`, {
        description: `GH₵${result.commissionDue} commission is now due — settle it to keep delivering.`,
      });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not release the PIN"),
  });

  const payCommission = useMutation({
    mutationFn: async () => {
      const key = getPaystackKey();
      if (!key) throw new Error("Paystack is not configured — set VITE_PAYSTACK_PUBLIC_KEY.");
      const init = await payOrderCommission(order.id);
      const result = await payWithPaystack({
        key,
        reference: init.reference,
        amount: init.amount,
        email: init.email,
        currency: "GHS",
        label: `CareStudy commission — order #${order.id}`,
      });
      const verification = await verifyOrderCommission(order.id, result.reference);
      if (!verification.verified) {
        throw new Error(verification.message ?? "Payment was not confirmed.");
      }
      return verification;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["studio-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["studio-commissions"] });
      toast.success(`Commission settled for order #${order.id}.`);
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "Payment was cancelled.") {
        toast.info("Payment was cancelled.");
        return;
      }
      toast.error(err instanceof Error ? err.message : "Commission payment failed");
    },
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

  // Ordinary orders create a blank study workspace with their materials
  // attached. Correction orders additionally extract the uploaded study.
  const produce = useMutation({
    mutationFn: async () => produceOrder(order.id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["studio-orders"] });
      const coverage = result.importCoverage;
      const coverageMessage = coverage
        ? `${coverage.detected.length}/${coverage.expected.length} sections mapped${coverage.missing.length > 0 ? ` · missing ${coverage.missing.join(", ")}` : " · complete"}`
        : "The uploaded materials are attached.";
      setProductionReport(coverage
        ? {
            mapped: coverage.detected.length,
            expected: coverage.expected.length,
            missing: coverage.missing,
          }
        : null);
      toast.success("Study created from the order.", {
        description: coverageMessage,
      });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Could not create the study";
      setProductionReport({ mapped: 0, expected: 0, missing: [], error: message });
      toast.error("Could not create the study", { description: message });
    },
  });

  return (
    <Card className={cn("overflow-hidden rounded-xl transition-colors", expanded && "bg-muted/30")}>
      <CardHeader className="p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">#{order.id}</span>
              <Badge variant={STATUS_VARIANT[order.status]} className="text-[10px]">
                {order.status.replace("_", " ")}
              </Badge>
              {order.correctionScope && (
                <Badge variant="outline" className="text-[10px]">
                  Correction · {order.correctionScope}
                </Badge>
              )}
            </span>
            <span className="mt-2 block truncate text-sm font-semibold">{order.title}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {order.student?.name ?? "Unknown student"}
              {order.program ? ` · ${order.program}` : ""}
              {` · ${formatDate(order.createdAt)}`}
              {` · ${order.fileCount} ${order.fileCount === 1 ? "file" : "files"}`}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      </CardHeader>
      {expanded && (
        <>
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
                <Button
                  size="sm"
                  onClick={() => produce.mutate()}
                  disabled={produce.isPending}
                  title={
                    order.correctionScope
                      ? "Extract the uploaded study into the care study workspace"
                      : "Create a study workspace from the order materials"
                  }
                >
                  {produce.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {produce.isPending
                    ? order.correctionScope
                      ? 'Extracting document…'
                      : 'Creating study…'
                    : order.correctionScope
                      ? 'Extract uploaded study'
                      : 'Create study workspace'
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
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Document correction
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              The uploaded {order.correctionScope} is ready for extraction. Open the produced study
              to review and edit the imported document.
            </p>
          </div>
        )}

        {(productionReport?.error) ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Extraction failed</p>
              <p className="mt-0.5 text-xs leading-relaxed">{productionReport.error}</p>
            </div>
          </div>
        ) : extractionSummary ? (
          <div className={cn(
            "rounded-lg border px-3 py-2.5",
            extractionSummary.missing.length > 0
              ? "border-amber-500/30 bg-amber-500/10"
              : "border-primary/30 bg-primary/5",
          )}>
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-4 text-primary" />
              Extraction results
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-background/70 px-2 py-1.5">
                <p className="text-base font-semibold text-primary">{extractionSummary.mapped}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Successful</p>
              </div>
              <div className="rounded-md bg-background/70 px-2 py-1.5">
                <p className="text-base font-semibold text-amber-700 dark:text-amber-300">{extractionSummary.missing.length}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unsuccessful</p>
              </div>
              <div className="rounded-md bg-background/70 px-2 py-1.5">
                <p className="text-base font-semibold">{extractionSummary.expected}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Expected</p>
              </div>
            </div>
            {extractionSummary.missing.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                Unsuccessful sections: {extractionSummary.missing.join(", ")}
              </p>
            )}
          </div>
        ) : null}

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
        </div>

        {/* Delivery PIN, release, and platform commission */}
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <KeyRound className="size-3.5 text-primary" /> Delivery &amp; download PIN
            </p>
            {order.pin.set ? (
              <Badge variant={order.pin.released ? "default" : "secondary"} className="gap-1">
                {order.pin.released ? (
                  <>
                    <Unlock className="size-3" /> PIN released
                  </>
                ) : (
                  <>
                    <Lock className="size-3" /> PIN locked
                  </>
                )}
              </Badge>
            ) : (
              <span className="text-[11px] text-muted-foreground">Not delivered yet</span>
            )}
          </div>

          {!order.pin.set || redeliver ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    New download PIN (4–8 digits)
                  </label>
                  <Input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="e.g. 4821"
                    inputMode="numeric"
                    className="h-8 w-28"
                    disabled={status !== "ready"}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => autoDeliver.mutate()}
                  disabled={
                    !order.producedStudyId ||
                    status !== "ready" ||
                    duesBlocked ||
                    autoDeliver.isPending ||
                    uploadDelivery.isPending
                  }
                  title={
                    duesBlocked
                      ? `Settle GH₵${duesTotal} in commission before delivering`
                      : status !== "ready"
                        ? "Set status to 'Ready' first, then save, to enable delivery"
                        : "Export the produced study as a Word document, locked behind the PIN, and deliver it"
                  }
                >
                  {autoDeliver.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : deliverySuccess ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {autoDeliver.isPending ? "Exporting…" : deliverySuccess ? "Delivered!" : "Deliver study"}
                </Button>
                <Input
                  type="file"
                  className="h-8 max-w-[170px] text-xs"
                  onChange={onPickDelivery}
                  disabled={status !== "ready" || duesBlocked || uploadDelivery.isPending || autoDeliver.isPending}
                  title="Upload a .docx file manually (fallback)"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => uploadDelivery.mutate()}
                  disabled={
                    !deliveryFile ||
                    status !== "ready" ||
                    duesBlocked ||
                    uploadDelivery.isPending ||
                    autoDeliver.isPending
                  }
                >
                  {uploadDelivery.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  Upload
                </Button>
                {redeliver && (
                  <Button size="sm" variant="ghost" onClick={() => setRedeliver(false)}>
                    Cancel
                  </Button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                The student opens the study with this PIN. Share it only once they have paid you —
                our GH₵{order.commission?.amount ?? 100} commission is charged the moment they
                download, whether you release it here or send it yourself.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {order.pin.released
                    ? `Released ${order.pin.releasedAt ? formatDate(order.pin.releasedAt) : ""}`
                    : "Locked — release it once the student has paid you."}
                </span>
                {order.firstDownloadedAt && (
                  <span className="flex items-center gap-1 text-primary">
                    <Download className="size-3.5" /> Downloaded {formatDate(order.firstDownloadedAt)}
                  </span>
                )}
              </div>
              {!order.pin.released && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => release.mutate()} disabled={release.isPending}>
                    {release.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Unlock className="size-4" />
                    )}
                    Confirm payment &amp; release
                  </Button>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    Optional — releasing here just marks the GH₵{order.commission?.amount ?? 100}
                    commission due now instead of at download.
                  </span>
                </div>
              )}
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setRedeliver(true)}
              >
                Replace delivery (new file + PIN)
              </button>
            </div>
          )}

          {order.commission && order.commission.status !== "none" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
              <span className="flex items-center gap-1.5">
                <CreditCard className="size-3.5" />
                Platform commission <strong>GH₵{order.commission.amount ?? 100}</strong>
              </span>
              {order.commission.status === "paid" ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="size-3" /> Paid
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => payCommission.mutate()}
                  disabled={payCommission.isPending}
                >
                  {payCommission.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CreditCard className="size-3.5" />
                  )}
                  Pay commission
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
        </>
      )}
    </Card>
  );
}

export function StudioBin() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["studio-orders"],
    queryFn: async () => (await listStudioOrders()).orders,
    refetchInterval: 15_000,
  });

  // Platform commission this account still owes. For staff it is a hard block
  // on new deliveries; admins see it but are never blocked.
  const commissions = useQuery({
    queryKey: ["studio-commissions"],
    queryFn: () => getCommissionSummary(),
    refetchInterval: 15_000,
  });
  const duesTotal = commissions.data?.total ?? 0;
  const duesBlocked = (commissions.data?.enforced ?? false) && duesTotal > 0;
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");

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
  const filteredOrders = useMemo(
    () => (data ?? []).filter((order) => statusFilter === "all" || order.status === statusFilter),
    [data, statusFilter],
  );

  return (
    <div className="flex-1 bg-background">
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="lg:hidden" />
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Incoming work
                </p>
                <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
                  Order bin
                </h1>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? "size-4 animate-spin" : "size-4"} />
              Refresh
            </Button>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Student orders arrive here with their attached materials, ready to produce. Start
            producing to create the study in the studio with every document attached, then deliver
            the completed study when it's ready.
          </p>
          <div className="mt-4">
            <OrderStatusFilter
              value={statusFilter}
              counts={counts}
              total={data?.length ?? 0}
              onChange={setStatusFilter}
            />
          </div>
        </div>

        {duesTotal > 0 && (
          <div
            className={cn(
              "mb-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
              duesBlocked
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
            )}
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">
                GH₵{duesTotal} platform commission outstanding
              </p>
              <p className="mt-0.5 text-xs leading-relaxed">
                {duesBlocked
                  ? "Settle it before delivering new work — use “Pay commission” on each downloaded order."
                  : "These are your own accrued commissions. Admins are not blocked from delivering."}
              </p>
            </div>
          </div>
        )}

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
        ) : filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {statusFilter === "all"
                ? "No orders to show."
                : `No ${STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label.toLowerCase()} orders to show.`}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredOrders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                duesTotal={duesTotal}
                duesBlocked={duesBlocked}
              />
            ))}
          </div>
        )}

        <Separator className="my-8" />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" />
          Set a download PIN, then "Deliver study" to export the produced study as a Word document
          and lock it. Hand the PIN to the student once they have paid you — the GH₵
          {commissions.data?.amountPerOrder ?? 100} platform commission is charged the moment they
          download, however the PIN reached them.
        </p>
      </main>
    </div>
  );
}
