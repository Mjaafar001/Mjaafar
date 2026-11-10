import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="font-display text-7xl font-bold text-primary">404</p>
        <h1 className="font-display text-2xl font-bold uppercase">Not found</h1>
        <p className="max-w-sm text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Button asChild variant="outline"><Link href="/">Back to home</Link></Button>
      </div>
    </div>
  );
}
