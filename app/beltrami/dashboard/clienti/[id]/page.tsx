import { notFound } from "next/navigation";

import {
  Badge,
  BooleanBadge,
  EmptyState,
  formatDateTime,
  LinkButton,
  PageHeader,
  Section,
  truncateText,
} from "@/components/beltrami/dashboard/DashboardUi";
import { getBeltramiClienteDetail } from "@/lib/beltrami/dashboard";

export const dynamic = "force-dynamic";

type ParamsInput = Promise<{ id: string }>;

function getClienteName(row: { nome: string | null; cognome: string | null }) {
  return [row.nome, row.cognome].filter(Boolean).join(" ").trim() || "Cliente Beltrami";
}

function getStatusTone(status: string | null | undefined): "neutral" | "success" | "warning" | "danger" {
  if (status === "sent" || status === "delivered" || status === "read" || status === "done") {
    return "success";
  }
  if (status === "failed" || status === "skipped" || status === "ignored") {
    return "danger";
  }
  if (status === "pending" || status === "taken" || status === "overdue") {
    return "warning";
  }
  return "neutral";
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1700px]">
        <Section title="Cliente non disponibile">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {message}
          </div>
        </Section>
      </div>
    </main>
  );
}

async function loadClienteDetail(clienteId: number) {
  try {
    return {
      detail: await getBeltramiClienteDetail(clienteId),
      errorMessage: null,
    };
  } catch (error) {
    return {
      detail: null,
      errorMessage:
        error instanceof Error ? error.message : "Errore lettura cliente Beltrami.",
    };
  }
}

export default async function BeltramiClienteDetailPage({
  params,
}: {
  params: ParamsInput;
}) {
  const resolvedParams = await params;
  const clienteId = Number(resolvedParams.id);

  if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
    notFound();
  }

  const { detail, errorMessage } = await loadClienteDetail(clienteId);

  if (errorMessage) {
    return <ErrorPanel message={errorMessage} />;
  }

  if (!detail) {
    notFound();
  }

  const { cliente } = detail;

  return (
      <main className="min-h-screen px-4 py-6 md:px-8">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <PageHeader
            eyebrow="Scheda cliente"
            title={getClienteName(cliente)}
            actions={
              <>
                <LinkButton href="/beltrami/dashboard/clienti">Clienti</LinkButton>
                <LinkButton href="/beltrami/dashboard">Dashboard</LinkButton>
              </>
            }
          />

          {detail.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              {detail.warnings.join(" ")}
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <Section title="Anagrafica">
                <dl className="grid gap-4 md:grid-cols-2">
                  <Info label="Nome" value={cliente.nome || "-"} />
                  <Info label="Cognome" value={cliente.cognome || "-"} />
                  <Info
                    label="Telefono"
                    value={cliente.telefono_normalizzato || cliente.telefono || "-"}
                  />
                  <Info label="Email" value={cliente.email || "-"} />
                  <Info label="Codice fiscale" value={cliente.codice_fiscale || "-"} mono />
                  <Info label="Registrato il" value={formatDateTime(cliente.created_at)} />
                  <Info label="Origine" value={cliente.source || "-"} />
                  <Info label="QR ID" value={cliente.qr_id || "-"} mono />
                  <Info label="Privacy version" value={cliente.privacy_version || "-"} />
                  <Info label="Servizio interesse" value={cliente.servizio_interesse || "-"} />
                </dl>

                {cliente.note ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      Note
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-700">{cliente.note}</div>
                  </div>
                ) : null}
              </Section>

              <Section title="Storico WhatsApp">
                {detail.whatsappMessages.length > 0 ? (
                  <div className="space-y-3">
                    {detail.whatsappMessages.map((row) => {
                      const statuses = row.whatsapp_message_id
                        ? detail.whatsappStatusesByMessageId.get(row.whatsapp_message_id) ?? []
                        : [];

                      return (
                        <article
                          key={row.id}
                          className="rounded-lg border border-slate-200 bg-white p-4"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge>{row.direction || "-"}</Badge>
                                <Badge>{row.message_kind || "-"}</Badge>
                                <Badge tone={getStatusTone(row.status)}>
                                  {row.status || row.status_reason || "senza stato"}
                                </Badge>
                              </div>
                              <div className="mt-3 text-sm leading-6 text-slate-700">
                                {row.body ? truncateText(row.body, 260) : row.template_name || "-"}
                              </div>
                              <div className="mt-2 grid gap-1 text-xs font-semibold text-slate-500 md:grid-cols-2">
                                <div>Da: {row.from_phone || "-"}</div>
                                <div>A: {row.to_phone || "-"}</div>
                                <div>WAMID: {row.whatsapp_message_id || "-"}</div>
                                <div>Context: {row.context_message_id || "-"}</div>
                              </div>
                            </div>
                            <div className="shrink-0 text-sm font-semibold text-slate-500">
                              {formatDateTime(row.created_at)}
                            </div>
                          </div>

                          {statuses.length > 0 ? (
                            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                Status Meta
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {statuses.map((status) => (
                                  <Badge key={status.id} tone={getStatusTone(status.status)}>
                                    {status.status || "-"} -{" "}
                                    {formatDateTime(status.timestamp_meta || status.created_at)}
                                  </Badge>
                                ))}
                              </div>
                              {statuses.some((status) => status.error_code || status.error_message) ? (
                                <div className="mt-3 space-y-1 text-xs font-semibold text-red-700">
                                  {statuses
                                    .filter((status) => status.error_code || status.error_message)
                                    .map((status) => (
                                      <div key={`${status.id}:error`}>
                                        {status.error_code || "errore"} -{" "}
                                        {status.error_title || status.error_message || "-"}
                                      </div>
                                    ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState>Nessun messaggio WhatsApp collegato.</EmptyState>
                )}
              </Section>
            </div>

            <div className="space-y-6">
              <Section title="Consensi">
                <div className="mb-4 flex flex-wrap gap-2">
                  <BooleanBadge
                    active={cliente.privacy_consent === true}
                    activeLabel="Consenso privacy"
                    inactiveLabel="Privacy assente"
                  />
                  <BooleanBadge
                    active={cliente.whatsapp_consent === true}
                    activeLabel="Consenso WhatsApp/contatto"
                    inactiveLabel="Consenso WhatsApp/contatto assente"
                  />
                </div>

                {detail.consensi.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {detail.consensi.map((row) => (
                      <div key={row.id} className="py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-950">
                              {row.tipo_evento || "-"}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              {row.metodo || "-"} - {row.privacy_version || "-"}
                            </div>
                            <div className="mt-1 text-xs font-semibold text-slate-400">
                              QR: {row.qr_id || "-"}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs font-semibold text-slate-500">
                            {formatDateTime(row.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState>Nessun evento consenso trovato.</EmptyState>
                )}
              </Section>

              <Section title="Richieste handoff">
                {detail.handoffRichieste.length > 0 ? (
                  <div className="space-y-3">
                    {detail.handoffRichieste.map((row) => (
                      <article key={row.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone={getStatusTone(row.status)}>{row.status || "-"}</Badge>
                              <Badge>{row.destinazione_nome || "Beltrami"}</Badge>
                            </div>
                            <div className="mt-3 text-sm leading-6 text-slate-700">
                              {truncateText(row.inbound_body, 180)}
                            </div>
                            <div className="mt-2 grid gap-1 text-xs font-semibold text-slate-500">
                              <div>Cliente: {row.cliente_phone || "-"}</div>
                              <div>SLA: {formatDateTime(row.due_at)}</div>
                              <div>Chiusura: {formatDateTime(row.marked_done_at)}</div>
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs font-semibold text-slate-500">
                            {formatDateTime(row.created_at)}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState>Nessuna richiesta handoff collegata.</EmptyState>
                )}
              </Section>
            </div>
          </div>
        </div>
      </main>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd
        className={`mt-2 break-words text-sm font-bold text-slate-950 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
