import { requirePhonesiaAdmin } from "@/lib/phonesia-auth";
import { createPhonesiaAdminClient } from "@/lib/phonesia/admin-client";

export async function getClienti() {
  await requirePhonesiaAdmin();
  const supabase = createPhonesiaAdminClient();
  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, telefono")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase error (phonesia_clienti):", error.message);
    return [];
  }

  return data ?? [];
}
