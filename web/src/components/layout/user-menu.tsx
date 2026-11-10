"use client";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/misc";
import { logoutAction } from "@/app/(auth)/actions";

export function UserMenu({ name, email, roleLabel }: { name: string; email: string; roleLabel: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-surface-2" aria-label="Account menu">
        <Avatar name={name} size={34} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block text-xs text-muted">{roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block text-sm font-semibold text-foreground">{name}</span>
          <span className="block font-normal">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/security">
            <ShieldCheck /> Security &amp; two-factor
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logoutAction()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
