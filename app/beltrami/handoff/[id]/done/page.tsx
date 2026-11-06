import { createBeltramiSupabaseAdmin } from "@/lib/beltrami/supabase";
import { markHandoffDone, type MarkHandoffDoneStatus } from "@/lib/handoff/mark-done";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
params: Promise<{ id: string }>;
searchParams?: Promise<{ token?: string | string[] }>;
};

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

export default async function BeltramiHandoffDonePage({
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
    const supabase = createBeltramiSupabaseAdmin();
    const result = await markHandoffDone({
      supabase,
      tableName: "beltrami_handoff_richieste",
      id,
      token,
    });
    status = result.status;
  } catch {
    status = "error";
  }

  const copy = getPageCopy(status);

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-16 text-stone-950">
      <section className="mx-auto max-w-xl rounded-lg border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Beltrami 1876
        </p>
        <h1 className="mt-3 text-2xl font-semibold">{copy.title}</h1>
        <p className="mt-4 text-base leading-7 text-stone-700">{copy.message}</p>
      </section>
    </main>
  );
}
