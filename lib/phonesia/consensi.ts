import { supabase } from "../supabaseClient";

export async function registraPrivacyAccepted({
  cliente_id,
  qr_id = "phonesia_qr",
  negozio_id = null,
}: {
  cliente_id: number;
  qr_id?: string;
  negozio_id?: number | null;
}) {
  return supabase.from("phonesia_consensi").insert({
    cliente_id,
    tipo_evento: "privacy_accepted",
    metodo: "qr",
    privacy_version: "v1.0",
    privacy_hash: "privacy_v1_placeholder",
    qr_id,
    negozio_id,
    user_agent: navigator.userAgent,

    // 👇 COLLEGAMENTO LOGICO MESSAGGIO DI BENVENUTO
    welcome_message_pending: true,
    welcome_message_type: "welcome",
    welcome_message_link: "/phonesia/biglietto",
  });
}

/* ======================================================
   PASSO 4.2 — EVENTO CONSENSO MARKETING (FACOLTATIVO)
   ====================================================== */
export async function registraMarketingAccepted({
  cliente_id,
  qr_id = "phonesia_qr",
  negozio_id = null,
}: {
  cliente_id: number;
  qr_id?: string;
  negozio_id?: number | null;
}) {
  return supabase.from("phonesia_consensi").insert({
    cliente_id,
    tipo_evento: "marketing_accepted",
    metodo: "qr",
    qr_id,
    negozio_id,
    user_agent: navigator.userAgent,
  });
}
