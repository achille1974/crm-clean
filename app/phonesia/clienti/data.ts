import { supabase } from "@/app/lib/supabase";

export async function getClienti() {
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
