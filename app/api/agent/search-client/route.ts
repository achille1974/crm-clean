import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = body.query;

    if (!query) {
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

  } catch (err) {
    return NextResponse.json(
      { error: "invalid request" },
      { status: 400 }
    );
  }
}
