import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { StudentDashboard } from "@/components/consultations/student-dashboard";
import { requirePageUser } from "@/lib/auth/guards";
import { getProfileName } from "@/lib/profiles/repository";

// Role-gated: block on the server so redirects and the 404 are decided (with
// real HTTP status codes) before any HTML is sent, instead of streaming a shell.
export const instant = false;

export const metadata: Metadata = { title: "My consultations · Contour" };

export default async function DashboardPage() {
  const { supabase, user } = await requirePageUser("student");

  // Only prefills the booking form, so a failure (already logged by the
  // repository) degrades to empty fields instead of breaking the page.
  const profile = await getProfileName(supabase, user.id).catch(() => null);

  // Keyed by user: Next preserves this route's client state across
  // navigations, so a different user must get a fresh tree (form drafts,
  // filters), not the previous user's.
  return (
    <AppShell key={user.id} user={user}>
      <StudentDashboard
        defaultFirstName={profile?.firstName ?? ""}
        defaultLastName={profile?.lastName ?? ""}
      />
    </AppShell>
  );
}
