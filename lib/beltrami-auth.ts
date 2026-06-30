import "server-only";

import { redirect } from "next/navigation";

import { getPhonesiaAuth } from "@/lib/phonesia-auth";

function getSafeBeltramiNextPath(nextPath?: string) {
  const value = String(nextPath ?? "/beltrami/dashboard").trim();

  if (value.startsWith("/beltrami/dashboard")) {
    return value;
  }

  return "/beltrami/dashboard";
}

export async function requireBeltramiDashboardAuth(nextPath?: string) {
  const auth = await getPhonesiaAuth();

  if (!auth.user || !auth.profile || auth.profile.role !== "admin") {
    const safeNext = getSafeBeltramiNextPath(nextPath);
    redirect(`/beltrami/login?next=${encodeURIComponent(safeNext)}`);
  }

  return {
    supabase: auth.supabase,
    user: auth.user,
    profile: auth.profile,
  };
}

export async function getBeltramiDashboardAuth() {
  const auth = await getPhonesiaAuth();

  if (!auth.user || !auth.profile || auth.profile.role !== "admin") {
    return null;
  }

  return {
    supabase: auth.supabase,
    user: auth.user,
    profile: auth.profile,
  };
}
