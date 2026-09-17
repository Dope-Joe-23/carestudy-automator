/**
 * Student invite dialog — generates a one-time registration link that ties
 * a new student to the current staff/admin member.
 *
 * Extracted so it can be opened from:
 *   - The studio sidebar ("Invite student" button) — for both admin and staff
 *   - The admin dashboard's "Student invites" tab — for admins
 */
import { useCallback, useState } from "react";
import { GraduationCap, Loader2, Plus, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
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
import * as adminApi from "@/lib/adminDashboardApi";

export function StudentInviteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reset = useCallback(() => {
    setLabel("");
    setCreatedUrl(null);
    setCreating(false);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    // Reset after the close animation starts
    setTimeout(reset, 150);
  }, [onClose, reset]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const result = await adminApi.createStudentInvite(label.trim() || undefined);
      const fullUrl = `${window.location.origin}${result.invite.registrationUrl}`;
      setCreatedUrl(fullUrl);
      toast.success("Student registration link created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invite.");
    } finally {
      setCreating(false);
    }
  }, [label]);

  const copyUrl = useCallback(() => {
    if (createdUrl) {
      navigator.clipboard.writeText(createdUrl).then(
        () => toast.success("Registration link copied to clipboard."),
        () => toast.error("Could not copy — please copy manually."),
      );
    }
  }, [createdUrl]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="size-5 text-primary" />
            Invite student
          </DialogTitle>
          <DialogDescription>
            Generate a registration link to send to a student. They will be tied to your account.
          </DialogDescription>
        </DialogHeader>

        {!createdUrl ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="student-invite-label">Label (optional)</Label>
              <Input
                id="student-invite-label"
                placeholder="e.g. Nursing intake — Week 5"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Helps you track which students came from which batch.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Generate student registration link
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
              Send this link to the student. They will create their own account and will be
              tied to you — their orders will appear in your order bin.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
