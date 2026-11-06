import type { SupabaseClient } from "@supabase/supabase-js";

export const QR_READINESS_INPUT = {
  p_nome: null, p_cognome: null, p_telefono: null, p_email: null, p_codice_fiscale: null,
  p_negozio_id: 0, p_marketing_accepted: false, p_user_agent: "phonesia-qr-health",
  p_ip_hash: null, p_phone_hash: null,
};

export async function qrDatabaseReady(supabase: SupabaseClient): Promise<boolean> {
  const signal = AbortSignal.timeout(8000);
  // The RPC rejects this input BEFORE rate buckets, customer or consent writes.
  // Using the application's real client verifies its key and EXECUTE permission.
  const [rpc, stores] = await Promise.all([
    supabase.rpc("phonesia_register_qr", QR_READINESS_INPUT).abortSignal(signal),
    supabase.from("phonesia_negozi").select("codice").in("codice", [1, 2, 3, 4, 5]).abortSignal(signal),
  ]);
  const codes = new Set((stores.data || []).map((store) => Number(store.codice)));
  return rpc.error?.code === "22023" && !stores.error && [1, 2, 3, 4, 5].every((code) => codes.has(code));
}
