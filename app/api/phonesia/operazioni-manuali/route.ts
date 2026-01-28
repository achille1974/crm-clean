import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      cliente_id,
      cliente_pda,
      telefono_riferimento,
      data_operazione,
      negozio,
      servizio,
      descrizione,
      promo,
      sottopromo,
      operatore_negozio,
    } = body;

    // campi minimi obbligatori
    if (!cliente_id || !data_operazione || !negozio || !descrizione) {
      return NextResponse.json(
        { error: "Campi obbligatori mancanti" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("phonesia_operazioni")
      .insert({
        cliente_id,
        cliente_pda: cliente_pda || null,
        telefono_riferimento: telefono_riferimento || null,
        data_operazione,
        negozio,
        servizio: servizio || null,
        descrizione,
        promo: promo || null,
        sottopromo: sottopromo || null,
        operatore_negozio: operatore_negozio || null,
        origine: "manuale",
      });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "ok",
      origine: "manuale",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Payload non valido" },
      { status: 400 }
    );
  }
}
