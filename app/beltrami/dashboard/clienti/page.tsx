import Link from "next/link";

import {
  Badge,
  BooleanBadge,
  EmptyState,
  formatDateTime,
  LinkButton,
  PageHeader,
  Section,
} from "@/components/beltrami/dashboard/DashboardUi";
import {
  getBeltramiClientiPage,
  type BeltramiWhatsappConsentFilter,
} from "@/lib/beltrami/dashboard";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParamsInput;
};

function getSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeWhatsappFilter(value: string): BeltramiWhatsappConsentFilter {
  if (value === "si" || value === "no") return value;
  return "tutti";
}

function getClienteName(row: { nome: string | null; cognome: string | null }) {
  return [row.nome, row.cognome].filter(Boolean).join(" ").trim() || "Cliente Beltrami";
}

function buildPageHref(params: {
  q: string;
  whatsapp: BeltramiWhatsappConsentFilter;
  page: number;
}) {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.whatsapp !== "tutti") query.set("whatsapp", params.whatsapp);
  if (params.page > 1) query.set("page", String(params.page));
  const queryString = query.toString();
  return queryString ? `/beltrami/dashboard/clienti?${queryString}` : "/beltrami/dashboard/clienti";
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1700px]">
        <Section title="Clienti non disponibili">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {message}
          </div>
        </Section>
      </div>
    </main>
  );
}

async function loadClienti(params: {
  q: string;
  whatsapp: BeltramiWhatsappConsentFilter;
  page: number;
}) {
  try {
    return {
      result: await getBeltramiClientiPage(params),
      errorMessage: null,
    };
  } catch (error) {
    return {
      result: null,
      errorMessage:
        error instanceof Error ? error.message : "Errore lettura clienti Beltrami.",
    };
  }
}

export default async function BeltramiClientiPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const q = getSingleValue(resolvedParams.q).trim();
  const whatsapp = normalizeWhatsappFilter(getSingleValue(resolvedParams.whatsapp));
  const page = Number(getSingleValue(resolvedParams.page) || "1");
  const { result, errorMessage } = await loadClienti({ q, whatsapp, page });

  if (!result) {
    return <ErrorPanel message={errorMessage || "Clienti non disponibili."} />;
  }

  const prevHref = buildPageHref({
    q,
    whatsapp,
    page: Math.max(1, result.page - 1),
  });
  const nextHref = buildPageHref({
    q,
    whatsapp,
    page: Math.min(result.pageCount, result.page + 1),
  });

  return (
      <main className="min-h-screen px-4 py-6 md:px-8">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <PageHeader
            eyebrow="Anagrafica"
            title="Clienti registrati"
            actions={<LinkButton href="/beltrami/dashboard">Dashboard</LinkButton>}
          />

          {result.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              {result.warnings.join(" ")}
            </div>
          ) : null}

          <Section title="Filtri">
            <form
              action="/beltrami/dashboard/clienti"
              method="get"
              className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">Cerca</span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Nome, telefono, email, codice fiscale"
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Consenso WhatsApp/contatto
                </span>
                <select
                  name="whatsapp"
                  defaultValue={whatsapp}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="tutti">Tutti</option>
                  <option value="si">Con consenso</option>
                  <option value="no">Senza consenso</option>
                </select>
              </label>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  Filtra
                </button>
                <LinkButton href="/beltrami/dashboard/clienti">Reset</LinkButton>
              </div>
            </form>
          </Section>

          <Section
            title={`Risultati (${result.total})`}
            action={
              <div className="text-sm font-semibold text-slate-500">
                Pagina {result.page} di {result.pageCount}
              </div>
            }
          >
            {result.rows.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-3 py-3">Cliente</th>
                        <th className="px-3 py-3">Contatti</th>
                        <th className="px-3 py-3">Registrazione</th>
                        <th className="px-3 py-3">Origine</th>
                        <th className="px-3 py-3">Consensi</th>
                        <th className="px-3 py-3">Ultimo WhatsApp</th>
                        <th className="px-3 py-3 text-right">Dettaglio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {result.rows.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="px-3 py-4">
                            <div className="font-bold text-slate-950">{getClienteName(row)}</div>
                            <div className="mt-1 font-mono text-xs text-slate-500">
                              {row.codice_fiscale || "-"}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-slate-700">
                            <div className="font-semibold">
                              {row.telefono_normalizzato || row.telefono || "-"}
                            </div>
                            <div className="mt-1 text-slate-500">{row.email || "-"}</div>
                          </td>
                          <td className="px-3 py-4 text-slate-700">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="px-3 py-4 text-slate-700">
                            <div>{row.source || "-"}</div>
                            <div className="mt-1">
                              <Badge>{row.qr_id || "QR non indicato"}</Badge>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-col items-start gap-2">
                              <BooleanBadge
                                active={row.privacy_consent === true}
                                activeLabel="Consenso privacy"
                                inactiveLabel="Privacy assente"
                              />
                              <BooleanBadge
                                active={row.whatsapp_consent === true}
                                activeLabel="Contattabile WhatsApp"
                                inactiveLabel="Consenso WhatsApp/contatto assente"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-4 text-slate-700">
                            {row.lastWhatsappMessage ? (
                              <>
                                <div className="font-semibold">
                                  {formatDateTime(row.lastWhatsappMessage.created_at)}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {row.lastWhatsappMessage.direction || "-"} /{" "}
                                  {row.lastWhatsappMessage.message_kind || "-"}
                                </div>
                              </>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-3 py-4 text-right">
                            <Link
                              href={`/beltrami/dashboard/clienti/${row.id}`}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              Apri
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <Link
                    href={prevHref}
                    aria-disabled={result.page <= 1}
                    className={`rounded-md border px-4 py-2 text-sm font-bold ${
                      result.page <= 1
                        ? "pointer-events-none border-slate-200 text-slate-300"
                        : "border-slate-300 text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                    }`}
                  >
                    Precedente
                  </Link>
                  <Link
                    href={nextHref}
                    aria-disabled={result.page >= result.pageCount}
                    className={`rounded-md border px-4 py-2 text-sm font-bold ${
                      result.page >= result.pageCount
                        ? "pointer-events-none border-slate-200 text-slate-300"
                        : "border-slate-300 text-slate-700 hover:border-emerald-300 hover:text-emerald-700"
                    }`}
                  >
                    Successiva
                  </Link>
                </div>
              </>
            ) : (
              <EmptyState>Nessun cliente trovato.</EmptyState>
            )}
          </Section>
        </div>
      </main>
  );
}
