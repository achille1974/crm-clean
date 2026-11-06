import { NextResponse } from "next/server";
import { authorizePhonesiaAgentApi } from "@/lib/phonesia/api-auth";

export async function POST(req: Request) {
  const auth = await authorizePhonesiaAgentApi(req);
  if (!auth.ok) return auth.response;
  const { supabase } = auth;
  try {
    const body = await req.json();
    const query = body.query;

    if (typeof query !== "string" || query.trim().length < 2 || query.length > 100 || /[%_]/.test(query)) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select("*")
      .ilike("nome", `%${query}%`)
      .limit(10);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      results: data
    });

  } catch {
    return NextResponse.json(
      { error: "invalid request" },
      { status: 400 }
    );
  }
}
