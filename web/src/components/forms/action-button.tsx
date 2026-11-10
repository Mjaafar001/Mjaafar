"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";

/**
 * Button that runs a server action, optionally after a confirmation dialog (with an optional
 * reason field). Shows toast feedback and refreshes server data on success.
 */
export function ActionButton({
  action,
  confirm,
  reasonLabel,
  successMessage,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: (reason?: string) => Promise<ActionResult<unknown>>;
  confirm?: { title: string; description: string; confirmLabel?: string; destructive?: boolean };
  reasonLabel?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();

  const run = () =>
    start(async () => {
      const res = await action(reason || undefined);
      if (res.ok) {
        toast.success(res.message ?? successMessage ?? "Saved");
        setOpen(false);
        setReason("");
        router.refresh();
      } else toast.error(res.error);
    });

  if (!confirm) {
    return (
      <Button {...props} disabled={pending || props.disabled} onClick={run}>
        {children}
      </Button>
    );
  }
  return (
    <>
      <Button {...props} disabled={pending || props.disabled} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={confirm.title} description={confirm.description}>
          {reasonLabel ? (
            <div className="mb-4 flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="confirm-reason">
                {reasonLabel}
              </label>
              <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={confirm.destructive ? "destructive" : "default"} disabled={pending || (!!reasonLabel && reason.trim().length < 3)} onClick={run}>
              {pending ? "Working…" : (confirm.confirmLabel ?? "Confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
