import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

type ClienteStatsRow = {
  negozio_id: number | null;
  whatsapp_active: boolean | null;
  created_at: string | null;
};

type NegozioRow = {
  codice: number | null;
  nome: string | null;
};

export async function GET() {
  const oggi = new Date().toISOString().slice(0, 10);

  const { data: clienti, error: clientiError } = await supabase
    .from("phonesia_clienti")
    .select("negozio_id, whatsapp_active, created_at");

  if (clientiError) {
    return NextResponse.json(
      {
        ok: false,
        error: "errore_lettura_clienti",
        detail: clientiError.message,
      },
      { status: 500 },
    );
  }

  const { data: negozi, error: negoziError } = await supabase
    .from("phonesia_negozi")
    .select("codice, nome");

  if (negoziError) {
    return NextResponse.json(
      {
        ok: false,
        error: "errore_lettura_negozi",
        detail: negoziError.message,
      },
      { status: 500 },
    );
  }

  const clientiRows = (clienti ?? []) as ClienteStatsRow[];
  const negoziRows = (negozi ?? []) as NegozioRow[];

  const totaleClienti = clientiRows.length;

  const clientiOggi =
    clientiRows.filter((c) => c.created_at?.startsWith(oggi)).length || 0;

  const whatsappAttivi =
    clientiRows.filter((c) => c.whatsapp_active === true).length || 0;

  const clientiPerNegozio: Record<string, number> = {};
  const clientiOggiPerNegozio: Record<string, number> = {};

  clientiRows.forEach((c) => {
    const negozio = negoziRows.find((n) => n.codice === c.negozio_id);
    const nomeNegozio = negozio?.nome || `Negozio ${c.negozio_id}`;

    clientiPerNegozio[nomeNegozio] =
      (clientiPerNegozio[nomeNegozio] || 0) + 1;

    if (c.created_at?.startsWith(oggi)) {
      clientiOggiPerNegozio[nomeNegozio] =
        (clientiOggiPerNegozio[nomeNegozio] || 0) + 1;
    }
  });

  return NextResponse.json({
    ok: true,
    totale_clienti: totaleClienti,
    clienti_oggi: clientiOggi,
    whatsapp_attivi: whatsappAttivi,
    clienti_per_negozio: clientiPerNegozio,
    clienti_oggi_per_negozio: clientiOggiPerNegozio,
  });
}
