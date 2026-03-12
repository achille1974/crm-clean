import { NextResponse } from "next/server"
import { supabase } from "@/lib/supabaseClient"

export async function POST(req: Request) {

  const body = await req.json()

  const message = body.message

  if (!message) {
    return NextResponse.json({ ok: true })
  }

  const telegramId = message.from.id
  const text = message.text || ""

  if (!text.startsWith("/start")) {
    return NextResponse.json({ ok: true })
  }

  const parts = text.split(" ")

  const clienteId = parts[1]

  if (!clienteId) {
    return NextResponse.json({ error: "cliente_id missing" })
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
    return NextResponse.json({ error })
  }

  return NextResponse.json({
    success: true,
    cliente_id: clienteId
  })
}
