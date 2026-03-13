import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {

  const { data: clienti } = await supabase
    .from("phonesia_clienti")
    .select("negozio_id, telegram_active");

  const { data: negozi } = await supabase
    .from("phonesia_negozi")
    .select("codice, nome");

  const totaleClienti = clienti?.length || 0;

  const telegramAttivi =
    clienti?.filter((c) => c.telegram_active === true).length || 0;

  const clientiPerNegozio: Record<string, number> = {};

  clienti?.forEach((c) => {
    const negozio = negozi?.find((n) => n.codice === c.negozio_id);

    const nomeNegozio = negozio?.nome || `Negozio ${c.negozio_id}`;

    clientiPerNegozio[nomeNegozio] =
      (clientiPerNegozio[nomeNegozio] || 0) + 1;
  });

  return NextResponse.json({
    totale_clienti: totaleClienti,
    telegram_attivi: telegramAttivi,
    clienti_per_negozio: clientiPerNegozio,
  });
}
