import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mfaPending) redirect("/login/mfa");
  if (user.permissions.has("dashboard.view")) redirect("/dashboard");
  if (user.permissions.has("portal.parent") || user.permissions.has("portal.player")) redirect("/portal");
  redirect("/account/security");
}
