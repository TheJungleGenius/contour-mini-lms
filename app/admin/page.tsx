import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AdminConsultationsTable } from "@/components/consultations/admin-consultations-table";
import { requirePageUser } from "@/lib/auth/guards";

// Role-gated: block on the server so redirects and the 404 are decided (with
// real HTTP status codes) before any HTML is sent, instead of streaming a shell.
export const instant = false;

export const metadata: Metadata = { title: "All consultations · Contour" };

// Non-admins (including signed-in students) get the standard 404 page.
export default async function AdminPage() {
  const { user } = await requirePageUser("admin");

  // Keyed by user, like the dashboard: a different user gets a fresh tree.
  return (
    <AppShell key={user.id} user={user}>
      <AdminConsultationsTable />
    </AppShell>
  );
}
