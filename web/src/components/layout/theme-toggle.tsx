"use client";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Toggles the `dark` class on <html> and remembers the choice (per-device convenience only). */
export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* storage unavailable */ }
  };
  return (
    <Button variant="ghost" size="icon" className={className} aria-label="Toggle dark mode" onClick={toggle}>
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
