import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <ShieldAlert className="size-10 text-danger" />
        <h1 className="font-display text-3xl font-bold uppercase">Access restricted</h1>
        <p className="max-w-sm text-sm text-muted">Your role doesn&apos;t include access to this page. If you need it, ask an academy administrator.</p>
        <Button asChild variant="outline"><Link href="/">Back to home</Link></Button>
      </div>
    </div>
  );
}
