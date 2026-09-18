import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AdminShell } from "@/components/admin/shell";

export const dynamic = "force-dynamic";

/**
 * Admin layout — server-side gate. Unauthenticated users go to the login
 * page (with a return path), non-admins bounce to their dashboard.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "ADMIN") redirect("/dashboard");
  return <AdminShell>{children}</AdminShell>;
}
