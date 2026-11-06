import { NextResponse } from "next/server";
import { authorizePhonesiaAdminApi } from "@/lib/phonesia/api-auth";

export async function POST(req: Request) {
  const auth = await authorizePhonesiaAdminApi();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
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
  } catch {
    return NextResponse.json(
      { error: "Payload non valido" },
      { status: 400 }
    );
  }
}
