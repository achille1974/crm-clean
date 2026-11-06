import { NextResponse } from "next/server";
import { authorizePhonesiaAgentApi } from "@/lib/phonesia/api-auth";

export async function POST(req: Request) {
  const auth = await authorizePhonesiaAgentApi(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  try {
    const body = await req.json();
    const cliente_id = body.cliente_id;

    if (!Number.isSafeInteger(Number(cliente_id)) || Number(cliente_id) <= 0) {
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

  } catch {
    return NextResponse.json(
      { error: "invalid request" },
      { status: 400 }
    );
  }
}
