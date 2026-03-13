import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

export async function POST(req: Request) {

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

  return NextResponse.json({ ok: true })
}
