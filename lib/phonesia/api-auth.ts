import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getPhonesiaAuth } from "@/lib/phonesia-auth";
import { createPhonesiaAdminClient } from "./admin-client";

export async function authorizePhonesiaAdminApi() {
  const { user, profile } = await getPhonesiaAuth();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!profile?.active || profile.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, supabase: createPhonesiaAdminClient() };
}

export async function authorizePhonesiaAgentApi(request: Request) {
  const expected = process.env.PHONESIA_AGENT_SHARED_SECRET;
  const received = request.headers.get("x-phonesia-secret");
  if (expected && received) {
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    if (left.length === right.length && timingSafeEqual(left, right)) {
      return { ok: true as const, supabase: createPhonesiaAdminClient() };
    }
  }
  return authorizePhonesiaAdminApi();
}
