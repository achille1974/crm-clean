import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cliente_id = body.cliente_id;

    if (!cliente_id) {
      return NextResponse.json(
        { error: "cliente_id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("phonesia_operazioni")
      .select("*")
      .eq("cliente_id", cliente_id)
      .limit(20);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      operazioni: data
    });

  } catch (err) {
    return NextResponse.json(
      { error: "invalid request" },
      { status: 400 }
    );
  }
}
