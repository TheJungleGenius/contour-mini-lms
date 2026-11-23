import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { homePathFor } from "@/lib/auth/roles";

// Role-gated: block on the server so redirects and the 404 are decided (with
// real HTTP status codes) before any HTML is sent, instead of streaming a shell.
export const instant = false;

/** Entry point: sends each user to the home page for their role. */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homePathFor(user.role) : "/auth/login");
}
