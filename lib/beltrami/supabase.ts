import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createBeltramiSupabaseAdmin() {
  const supabaseUrl = process.env.BELTRAMI_SUPABASE_URL;
  const serviceRoleKey = process.env.BELTRAMI_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Beltrami Supabase server configuration");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
