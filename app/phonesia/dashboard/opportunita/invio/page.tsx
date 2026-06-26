import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import OpportunityBatchComposer from "@/components/phonesia/dashboard/OpportunityBatchComposer";
import {
  buildPromoKeysByCliente,
  buildPromoSendSummaries,
  formatPromoSentAtRome,
  type PromoOpportunityHistoryRow,
  type PromoSendSummary,
} from "@/lib/phonesia/opportunita-promo-history";

export const dynamic = "force-dynamic";

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
};

type MarketingConsentRow = {
  cliente_id: number | null;
};

type SentOpportunityRow = {
  cliente_id: number | null;
  opportunita_code: string | null;
};

const NEGOZI: Record<number, string> = {
  1: "Floridia",
  2: "Augusta",
  3: "Siracusa",
  4: "Avola",
  5: "Tabacchino Floridia",
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function parseClienteIds(value: string | string[] | undefined): number[] {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];

  return [
    ...new Set(
      rawValues
        .map((item) => Number(item))
        .filter((item): item is number => Number.isFinite(item)),
    ),
  ];
}

function negozioLabel(negozioId?: number | null): string {
  if (!negozioId) return "Non assegnato";
  return NEGOZI[negozioId] ?? `Negozio ${negozioId}`;
}

export default async function DashboardOpportunitySendPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const clienteIds = parseClienteIds(resolvedParams.clienti);

  if (clienteIds.length === 0) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-8 shadow-sm md:px-8">
            <div className="space-y-4">
              <Link
                href="/phonesia/dashboard/clienti"
                className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
              >
                ← Torna a Clienti / Servizi / Opportunità
              </Link>

              <div>
                <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Invio opportunità
                </div>

                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Nessun cliente selezionato
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Torna alla pagina Clienti / Servizi / Opportunità, seleziona uno o più clienti e poi riapri questa pagina.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const supabase = getSupabaseAdmin();

  const [
    { data: clientiData, error: clientiError },
    { data: marketingConsentRows, error: marketingConsentError },
    { data: sentOpportunityRows, error: sentOpportunityError },
    { data: promoHistoryRows, error: promoHistoryError },
  ] = await Promise.all([
    supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono, email, negozio_id, whatsapp_active")
      .in("id", clienteIds),
    supabase
      .from("phonesia_consensi")
      .select("cliente_id")
      .eq("tipo_evento", "marketing_accepted")
      .in("cliente_id", clienteIds),
    supabase
      .from("phonesia_opportunita_inviate")
      .select("cliente_id, opportunita_code")
      .in("cliente_id", clienteIds),
    supabase
      .from("phonesia_opportunita_inviate")
      .select(
        "cliente_id, opportunita_code, channel, sent_at, created_at, send_mode, inviato_at, messaggio, attachment_public_url, attachment_file_name, promo_key, metadata",
      )
      .in("cliente_id", clienteIds)
      .order("inviato_at", { ascending: false })
      .limit(5000),
  ]);

  if (clientiError) {
    throw new Error(`Errore lettura clienti selezionati: ${clientiError.message}`);
  }

  if (marketingConsentError) {
    throw new Error(`Errore lettura consensi marketing: ${marketingConsentError.message}`);
  }

  if (sentOpportunityError) {
    throw new Error(`Errore lettura opportunità già inviate: ${sentOpportunityError.message}`);
  }

  if (promoHistoryError) {
    throw new Error(`Errore lettura storico promo WhatsApp: ${promoHistoryError.message}`);
  }

  const clienti = (clientiData ?? []) as ClienteRow[];
  if (clienti.length === 0) notFound();

  const promoSummaries = buildPromoSendSummaries(
    (promoHistoryRows ?? []) as PromoOpportunityHistoryRow[],
  );
  const promoKeysByCliente = buildPromoKeysByCliente(
    (promoHistoryRows ?? []) as PromoOpportunityHistoryRow[],
  );

  const marketingConsentedIds = new Set<number>(
    ((marketingConsentRows ?? []) as MarketingConsentRow[])
      .map((row) => Number(row.cliente_id))
      .filter((value): value is number => Number.isFinite(value)),
  );

  const sentOpportunityCodesByCliente = new Map<number, string[]>();

  for (const row of (sentOpportunityRows ?? []) as SentOpportunityRow[]) {
    const clienteId = Number(row.cliente_id);
    const opportunityCode = String(row.opportunita_code ?? "").trim();

    if (!Number.isFinite(clienteId) || !opportunityCode) continue;

    const current = sentOpportunityCodesByCliente.get(clienteId) ?? [];
    current.push(opportunityCode);
    sentOpportunityCodesByCliente.set(clienteId, current);
  }

  const recipients = clienti
    .sort((a, b) => a.id - b.id)
    .map((cliente) => ({
      lastPromoSummary: promoSummaries.get(cliente.id) ?? null,
      id: cliente.id,
      nomeCompleto:
        [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim() || `Cliente ${cliente.id}`,
      telefono: cliente.telefono || "",
      negozioLabel: negozioLabel(cliente.negozio_id),
      whatsappActive: cliente.whatsapp_active === true,
      marketingConsented: marketingConsentedIds.has(cliente.id),
      sentOpportunityCodes: sentOpportunityCodesByCliente.get(cliente.id) ?? [],
    }))
    .map((recipient) => {
      const summary = recipient.lastPromoSummary as PromoSendSummary | null;

      return {
        id: recipient.id,
        nomeCompleto: recipient.nomeCompleto,
        telefono: recipient.telefono,
        negozioLabel: recipient.negozioLabel,
        whatsappActive: recipient.whatsappActive,
        marketingConsented: recipient.marketingConsented,
        sentOpportunityCodes: recipient.sentOpportunityCodes,
        sentPromoKeys: promoKeysByCliente.get(recipient.id) ?? [],
        promoSentToday: summary?.sentToday === true,
        lastPromoSentAt: summary?.lastSentAt ?? null,
        lastPromoSentAtLabel: summary?.lastSentAt
          ? formatPromoSentAtRome(summary.lastSentAt)
          : null,
      };
    });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-4">
            <Link
              href="/phonesia/dashboard/clienti"
              className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              ← Torna a Clienti / Servizi / Opportunità
            </Link>

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Invio opportunità
                </div>

                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Composizione invio multiplo
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Prepara il contenuto da inviare ai clienti selezionati: messaggio standard o personalizzato, con locandina opzionale caricata dal computer.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Clienti selezionati: <strong className="text-slate-950">{recipients.length}</strong>
                <span className="mx-2 text-slate-300">·</span>
                Già inviati oggi:{" "}
                <strong className="text-slate-950">
                  {recipients.filter((recipient) => recipient.promoSentToday).length}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <OpportunityBatchComposer recipients={recipients} />
      </div>
    </main>
  );
}
