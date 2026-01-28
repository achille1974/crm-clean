import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

/**
 * STEP 6.9A.1 — DRY RUN CON NORMALIZZAZIONE TELEFONO
 * - Nessuna scrittura DB
 * - Nessuna modifica clienti
 * - Solo verifica matching corretto
 */

// Supabase client (SOLO LETTURA)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Normalizza telefono:
 * - solo numeri
 * - rimuove +39 iniziale se presente
 */
function normalizzaTelefono(tel: string | null) {
  if (!tel) return null;

  let num = tel.replace(/\D/g, "");

  // +39XXXXXXXXXX o 0039XXXXXXXXXX
  if (num.startsWith("0039")) {
    num = num.slice(4);
  } else if (num.startsWith("39") && num.length > 10) {
    num = num.slice(2);
  }

  // a questo punto deve essere 10 cifre tipo 3XXXXXXXXX
  return num;
}

export async function POST(req: Request) {
  /* ===============================
     1️⃣ RICEZIONE FILE
     =============================== */
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "File mancante" },
      { status: 400 }
    );
  }

  /* ===============================
     2️⃣ LETTURA EXCEL
     =============================== */
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet) as any[];

  /* ===============================
     3️⃣ GROUPING (STEP 6.7)
     =============================== */
  const gruppi = new Map<string, any[]>();

  for (const row of rows) {
    const key = [
      row["DOCUMENTO"],
      row["NUMERO"],
      row["MAGAZZINO"],
      row["DATA VENDITA"],
      row["CLIENTE PDA"],
      row["NUMERO TEL."],
    ].join("||");

    if (!gruppi.has(key)) {
      gruppi.set(key, []);
    }

    gruppi.get(key)!.push(row);
  }

  /* ===============================
     4️⃣ COSTRUZIONE OPERAZIONI (STEP 6.8)
     =============================== */
  const operazioni = Array.from(gruppi.values()).map((group) => {
    const first = group[0];

    return {
      cliente_pda: first["CLIENTE PDA"] || null,
      telefono_riferimento: normalizzaTelefono(
        first["NUMERO TEL."] || null
      ),

      data_operazione: first["DATA VENDITA"] || null,
      negozio: first["MAGAZZINO"] || null,

      servizio: first["SERVIZIO"] || null,

      descrizione: group
        .map((r) => r["DESCRIZIONE"])
        .filter(Boolean)
        .join(" | "),

      promo: first["PROMO"] || null,
      sottopromo: first["SOTTOPROMO"] || null,

      operatore_negozio: first["OPERATORE"] || null,

      origine: "upload_cassa",
    };
  });

  /* ===============================
     5️⃣ DRY-RUN MATCH CLIENTI (NORMALIZZATO)
     =============================== */
  let clienti_trovati = 0;
  let clienti_non_trovati = 0;

  for (const op of operazioni) {
    if (!op.telefono_riferimento) {
      clienti_non_trovati++;
      continue;
    }

    const { data: cliente } = await supabase
      .from("phonesia_clienti")
      .select("id, telefono")
      .limit(1);

    // normalizziamo anche il telefono DB
    const match = cliente?.find(
      (c: any) =>
        normalizzaTelefono(c.telefono) ===
        op.telefono_riferimento
    );

    if (match) {
      clienti_trovati++;
    } else {
      clienti_non_trovati++;
    }
  }

  /* ===============================
     6️⃣ RISPOSTA FINALE (SICURA)
     =============================== */
  return NextResponse.json({
    modalita: "DRY_RUN_NORMALIZZATO",
    righe_file: rows.length,
    operazioni_generate: operazioni.length,
    clienti_trovati,
    clienti_non_trovati,
    esempio_operazione: operazioni[0],
  });
}
