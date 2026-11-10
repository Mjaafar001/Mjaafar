import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Application received" };

export default async function ApplySuccess({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const safeRef = ref && /^APP-[\w-]{1,20}$/.test(ref) ? ref : null;
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <CheckCircle2 className="size-14 text-success" />
        <h1 className="font-display text-4xl font-bold uppercase">Application received</h1>
        {safeRef ? <p className="rounded-lg border bg-surface px-4 py-2 font-mono text-lg">{safeRef}</p> : null}
        <p className="text-muted">Thank you. Keep your reference number. Our team will review the application and contact you by phone or WhatsApp.</p>
        <Button asChild variant="outline"><Link href="/apply">Submit another application</Link></Button>
      </div>
    </div>
  );
}
