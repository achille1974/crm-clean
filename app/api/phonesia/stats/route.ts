import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

export async function GET() {

  const { data: clienti } = await supabase
    .from("phonesia_clienti")
    .select("negozio_id, created_at, telegram_activated_at")

  if (!clienti) {
    return NextResponse.json({ error: "no data" })
  }

  const totale = clienti.length

  const telegramAttivi = clienti.filter(
    c => c.telegram_activated_at
  ).length

  const perNegozio: Record<number, number> = {}

  clienti.forEach(c => {
    const id = c.negozio_id || 0
    perNegozio[id] = (perNegozio[id] || 0) + 1
  })

  return NextResponse.json({
    totale_clienti: totale,
    telegram_attivi: telegramAttivi,
    clienti_per_negozio: perNegozio
  })
}
