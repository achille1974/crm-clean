import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

export async function POST(req: Request) {

  console.log("TELEGRAM WEBHOOK HIT")

  const body = await req.json()

  // Telegram può mandare diversi tipi di update
  if (!body.message) {
    return NextResponse.json({ ok: true })
  }

  const message = body.message
  const telegramId = message.from?.id
  const text = message.text || ""

  if (!telegramId) {
    return NextResponse.json({ ok: true })
  }

  // Gestiamo solo il comando /start
  if (!text.startsWith("/start")) {
    return NextResponse.json({ ok: true })
  }

  const parts = text.split(" ")
  const clienteId = parts[1]

  if (!clienteId) {
    return NextResponse.json({ ok: true })
  }

  // Attivazione Telegram nel CRM
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

  // Link al biglietto digitale
  const link = `https://crm-clean.vercel.app/phonesia/card/${clienteId}`

  // Messaggio di benvenuto
  const messaggio = `Benvenuto in PHONESIA! 🎉

La tua registrazione è stata completata con successo.

Da questo momento puoi contattarci direttamente qui su Telegram ogni volta che hai bisogno di informazioni, assistenza o consigli sui nostri servizi.

Qui trovi il nostro biglietto da visita digitale:
${link}`

  // Invio messaggio Telegram
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: telegramId,
      text: messaggio
    })
  })

  return NextResponse.json({ ok: true })
}