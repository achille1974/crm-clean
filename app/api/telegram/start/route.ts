import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

export async function POST(req: Request) {
  
  console.log("TELEGRAM WEBHOOK HIT")
  const body = await req.json()

  // Telegram manda diversi tipi di update
  if (!body.message) {
    return NextResponse.json({ ok: true })
  }

  const message = body.message
  const telegramId = message.from?.id
  const text = message.text || ""

  if (!telegramId) {
    return NextResponse.json({ ok: true })
  }

  // gestiamo solo /start
  if (!text.startsWith("/start")) {
    return NextResponse.json({ ok: true })
  }

  const parts = text.split(" ")
  const clienteId = parts[1]

  if (!clienteId) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase
    .from("phonesia_clienti")
    .update({
      telegram_active: true,
      telegram_id: telegramId,
      telegram_activated_at: new Date().toISOString()
    })
    .eq("id", clienteId)

  if (error) {
    console.error("SUPABASE ERROR:", error)
  }
  
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    chat_id: telegramId,
    text: `Benvenuto in Phonesia! 🎉

La tua registrazione è stata attivata con successo.

Qui trovi il nostro biglietto da visita digitale:
https://crm-clean.vercel.app/phonesia/card/${clienteId}`
  })
})

  return NextResponse.json({ ok: true })
}
