import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";
import { Toaster } from "sonner";
import { getBranding } from "@/lib/branding";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";

// Branding (name, colours, logo) and branch lists come from the database at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return {
    title: { default: b.name, template: `%s · ${b.shortName}` },
    description: `${b.name} — academy management`,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: b.shortName, statusBarStyle: "black-translucent" },
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getBranding();
  return (
    <html lang="en-NG" suppressHydrationWarning>
      <head>
        <style>{`:root{--brand:${b.primaryColor};--accent-brand:${b.accentColor}}`}</style>
        {/* Applies the saved/system theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}` }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster richColors position="top-center" closeButton />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
