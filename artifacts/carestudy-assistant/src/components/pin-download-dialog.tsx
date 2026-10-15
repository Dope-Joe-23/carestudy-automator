/**
 * PIN download dialog — the student's gate to export a delivered study.
 *
 * The staff sets a PIN when they deliver the work and releases it only once
 * the student has paid them (the payment itself happens off-platform). Until
 * then the server refuses the download; afterwards the student enters the PIN
 * they were given here to stream the .docx.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as studentApi from "@/lib/studentApi";

export function PinDownloadDialog({
  open,
  onClose,
  order,
  chapterIndex,
  onDownloaded,
}: {
  open: boolean;
  onClose: () => void;
  order: studentApi.Order;
  /** When set, download that single chapter instead of the whole study. */
  chapterIndex?: number;
  onDownloaded?: () => void;
}) {
  const [pin, setPin] = useState("");
  const [processing, setProcessing] = useState(false);

  // Clear the entry whenever the dialog is reopened for a fresh download.
  useEffect(() => {
    if (open) {
      setPin("");
      setProcessing(false);
    }
  }, [open]);

  const handleDownload = useCallback(async () => {
    const trimmed = pin.trim();
    if (!/^\d{4,8}$/.test(trimmed)) {
      toast.error("Enter the 4 to 8 digit PIN your academic team gave you.");
      return;
    }
    setProcessing(true);
    try {
      if (chapterIndex === undefined) {
        await studentApi.downloadOrderStudy(order, trimmed);
      } else {
        await studentApi.downloadOrderChapter(order, chapterIndex, trimmed);
      }
      toast.success("Download started.");
      onDownloaded?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setProcessing(false);
    }
  }, [pin, order, chapterIndex, onDownloaded, onClose]);

  const label =
    chapterIndex === undefined
      ? "the full study"
      : `chapter ${chapterIndex + 1}`;

  return (
    <Dialog open={open} onOpenChange={(next) => !processing && !next && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            Enter download PIN
          </DialogTitle>
          <DialogDescription>
            Your academic team released the PIN for {label}. Enter it to download your Word
            document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="download-pin">Download PIN</Label>
            <Input
              id="download-pin"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="••••"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleDownload();
              }}
              autoFocus
            />
          </div>

          <Button className="w-full gap-1.5" onClick={() => void handleDownload()} disabled={processing}>
            {processing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Unlock &amp; download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
