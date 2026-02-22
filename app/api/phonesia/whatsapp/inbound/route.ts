import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const from = formData.get("From")?.toString();
    const bodyRaw = formData.get("Body")?.toString();

    // 🔹 Risposta TwiML obbligatoria per Twilio
    const twimlResponse = new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );

    if (!from || !bodyRaw) {
      return twimlResponse;
    }

    const body = bodyRaw.trim();
    const telefono = from.replace("whatsapp:", "");

    // 🔹 Cerchiamo il cliente
    const { data: cliente, error: clienteError } = await supabase
      .from("phonesia_clienti")
      .select("id, whatsapp_active")
      .eq("telefono", telefono)
      .maybeSingle();

    if (clienteError) {
      console.error("Errore ricerca cliente:", clienteError);
      return twimlResponse;
    }

    // 🔹 Se cliente esiste, salviamo inbound
    if (cliente) {

      const { error: insertError } = await supabase
        .from("phonesia_operazioni")
        .insert({
          cliente_id: cliente.id,
          telefono_riferimento: telefono,
          origine: "whatsapp_inbound",
          descrizione: body,
          data_operazione: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("Errore insert operazione:", insertError);
      }

      // 🔹 Se scrive OK e non era già attivo
      if (body.toUpperCase() === "OK" && !cliente.whatsapp_active) {

        const { error: updateError } = await supabase
          .from("phonesia_clienti")
          .update({
            whatsapp_active: true,
            whatsapp_activated_at: new Date().toISOString(),
          })
          .eq("id", cliente.id);

        if (updateError) {
          console.error("Errore update whatsapp:", updateError);
        } else {

          // 🔹 Chiamiamo endpoint welcome separato
          try {
            await fetch(
              `${process.env.NEXT_PUBLIC_BASE_URL}/api/phonesia/whatsapp/send-welcome`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  cliente_id: cliente.id,
                }),
              }
            );
          } catch (welcomeError) {
            console.error("Errore chiamata send-welcome:", welcomeError);
          }
        }
      }
    }

    return twimlResponse;

  } catch (error) {
    console.error("WhatsApp inbound fatal error:", error);

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}