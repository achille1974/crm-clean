import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const from = formData.get("From")?.toString();
    const bodyRaw = formData.get("Body")?.toString();

    if (!from || !bodyRaw) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          status: 200,
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    const body = bodyRaw.trim();
    const telefono = from.replace("whatsapp:", "");

    // 🔹 Cerchiamo il cliente
    const { data: cliente } = await supabase
      .from("phonesia_clienti")
      .select("id")
      .eq("telefono", telefono)
      .maybeSingle();

    // 🔹 Se il cliente esiste, salviamo l’operazione
    if (cliente) {
      await supabase.from("phonesia_operazioni").insert({
        cliente_id: cliente.id,
        tipo_operazione: "whatsapp_inbound",
        descrizione: body,
        data_operazione: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      // 🔹 Se scrive OK attiviamo WhatsApp
      if (body.toUpperCase() === "OK") {
        await supabase
          .from("phonesia_clienti")
          .update({
            whatsapp_active: true,
            whatsapp_activated_at: new Date().toISOString(),
          })
          .eq("id", cliente.id);
      }
    }

    // 🔹 Risposta valida per Twilio (OBBLIGATORIA)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );

  } catch (error) {
    console.error("WhatsApp inbound error:", error);

    // Anche in caso di errore dobbiamo rispondere XML
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}
