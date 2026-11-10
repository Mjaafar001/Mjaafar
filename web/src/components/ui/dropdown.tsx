"use client";
import * as React from "react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export function DropdownMenuContent({ className, align = "end", ...p }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={6} className={cn("z-50 min-w-48 rounded-lg border bg-surface p-1 shadow-xl", className)} {...p} />
    </M.Portal>
  );
}
export function DropdownMenuItem({ className, ...p }: React.ComponentProps<typeof M.Item>) {
  return <M.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted", className)} {...p} />;
}
export function DropdownMenuLabel({ className, ...p }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn("px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted", className)} {...p} />;
}
export const DropdownMenuSeparator = ({ className }: { className?: string }) => <M.Separator className={cn("my-1 h-px bg-border", className)} />;
