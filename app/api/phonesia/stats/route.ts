import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {

  const { data: clienti } = await supabase
    .from("phonesia_clienti")
    .select("negozio_id, telegram_active, created_at");

  const { data: negozi } = await supabase
    .from("phonesia_negozi")
    .select("codice, nome");

  const totaleClienti = clienti?.length || 0;

 const oggi = new Date().toISOString().slice(0, 10);

const clientiOggi =
  clienti?.filter((c: any) =>
    c.created_at?.startsWith(oggi)
  ).length || 0;  

  const telegramAttivi =
    clienti?.filter((c) => c.telegram_active === true).length || 0;

  const clientiPerNegozio: Record<string, number> = {};
  
  const clientiOggiPerNegozio: Record<string, number> = {};

  const oggi = new Date().toISOString().slice(0, 10);

  clienti?.forEach((c) => {
    const negozio = negozi?.find((n) => n.codice === c.negozio_id);

    const nomeNegozio = negozio?.nome || `Negozio ${c.negozio_id}`;

    clientiPerNegozio[nomeNegozio] =
      (clientiPerNegozio[nomeNegozio] || 0) + 1;

    if (c.created_at?.startsWith(oggi)) {
    clientiOggiPerNegozio[nomeNegozio] =
      (clientiOggiPerNegozio[nomeNegozio] || 0) + 1;
  }
  });

  return NextResponse.json({
    totale_clienti: totaleClienti,
    clienti_oggi: clientiOggi,
    telegram_attivi: telegramAttivi,
    clienti_per_negozio: clientiPerNegozio,
    clienti_oggi_per_negozio: clientiOggiPerNegozio,
  });
}
