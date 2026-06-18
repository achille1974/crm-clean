import { createClient } from "@supabase/supabase-js";

import { markHandoffDone, type MarkHandoffDoneStatus } from "@/lib/handoff/mark-done";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }> | { id: string };
  searchParams?: Promise<{ token?: string | string[] }> | { token?: string | string[] };
};

function createPhonesiaSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Phonesia Supabase server configuration");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveParams(params: PageProps["params"]) {
  return await params;
}

async function resolveSearchParams(searchParams: PageProps["searchParams"]) {
  return searchParams ? await searchParams : {};
}

function readToken(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getPageCopy(status: MarkHandoffDoneStatus) {
  if (status === "done") {
    return {
      title: "Richiesta segnata come risposta",
      message: "Richiesta segnata come risposta. Grazie.",
    };
  }

  if (status === "already_done") {
    return {
      title: "Richiesta gia gestita",
      message: "Richiesta gia segnata come risposta.",
    };
  }

  return {
    title: "Link non valido",
    message: "Link non valido o richiesta non trovata.",
  };
}

export default async function PhonesiaHandoffDonePage({
  params,
  searchParams,
}: PageProps) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    resolveParams(params),
    resolveSearchParams(searchParams),
  ]);
  const token = readToken(resolvedSearchParams.token);

  let status: MarkHandoffDoneStatus = "invalid";

  try {
    const supabase = createPhonesiaSupabaseAdmin();
    const result = await markHandoffDone({
      supabase,
      tableName: "phonesia_handoff_richieste",
      id,
      token,
    });
    status = result.status;
  } catch {
    status = "error";
  }

  const copy = getPageCopy(status);

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-950">
      <section className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          PHONESIA
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">{copy.message}</p>
      </section>
    </main>
  );
}

