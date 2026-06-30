import Link from "next/link";

import {
  Badge,
  EmptyState,
  formatDateTime,
  LinkButton,
  PageHeader,
  Section,
  StatCard,
  truncateText,
} from "@/components/beltrami/dashboard/DashboardUi";
import { getBeltramiDashboardOverview } from "@/lib/beltrami/dashboard";

export const dynamic = "force-dynamic";

function getClienteName(row: { nome: string | null; cognome: string | null }) {
  return [row.nome, row.cognome].filter(Boolean).join(" ").trim() || "Cliente Beltrami";
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1700px]">
        <Section title="Dashboard non disponibile">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {message}
          </div>
        </Section>
      </div>
    </main>
  );
}

async function loadOverview() {
  try {
    return {
      overview: await getBeltramiDashboardOverview(),
      errorMessage: null,
    };
  } catch (error) {
    return {
      overview: null,
      errorMessage:
        error instanceof Error ? error.message : "Errore lettura dashboard Beltrami.",
    };
  }
}

export default async function BeltramiDashboardPage() {
  const { overview, errorMessage } = await loadOverview();

  if (!overview) {
    return <ErrorPanel message={errorMessage || "Dashboard non disponibile."} />;
  }

  return (
      <main className="min-h-screen px-4 py-6 md:px-8">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <PageHeader
            eyebrow="Dashboard tabacchino"
            title="Riepilogo Beltrami 1876"
            actions={
              <>
                <LinkButton href="/beltrami/dashboard/clienti">Clienti</LinkButton>
                <LinkButton href="/beltrami/dashboard/attivita">Attivita</LinkButton>
              </>
            }
          />

          {overview.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              {overview.warnings.join(" ")}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Clienti registrati"
              value={overview.kpis.clientiTotali}
              note="Totale anagrafiche"
            />
            <StatCard
              label="Registrazioni oggi"
              value={overview.kpis.registrazioniOggi}
              note="Da QR o form"
              tone={overview.kpis.registrazioniOggi > 0 ? "success" : "neutral"}
            />
            <StatCard
              label="Ultimi 7 giorni"
              value={overview.kpis.registrazioniUltimi7}
              note="Registrazioni recenti"
            />
            <StatCard
              label="Ultimi 30 giorni"
              value={overview.kpis.registrazioniUltimi30}
              note="Trend mensile"
            />
            <StatCard
              label="Consenso privacy"
              value={overview.kpis.consensoPrivacy}
              note="Clienti con consenso"
              tone="success"
            />
            <StatCard
              label="Consenso WhatsApp/contatto"
              value={overview.kpis.consensoWhatsapp}
              note="Contattabili WhatsApp"
              tone="success"
            />
            <StatCard
              label="Inbound recenti"
              value={overview.kpis.inboundRecenti}
              note="Ultimi 30 giorni"
              tone={overview.kpis.inboundRecenti > 0 ? "warning" : "neutral"}
            />
            <StatCard
              label="Notifiche interne"
              value={overview.kpis.notificheInterneInviate}
              note="Notify Beltrami inviate"
            />
            <StatCard
              label="Handoff aperti"
              value={overview.kpis.handoffAperti}
              note="Pending, taken, overdue"
              tone={overview.kpis.handoffAperti > 0 ? "warning" : "neutral"}
            />
            <StatCard
              label="Handoff chiusi"
              value={overview.kpis.handoffChiusi}
              note="Status done"
              tone="success"
            />
            <StatCard
              label="Errori WhatsApp"
              value={overview.kpis.erroriWhatsappRecenti}
              note="Messaggi/status recenti"
              tone={overview.kpis.erroriWhatsappRecenti > 0 ? "danger" : "neutral"}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <Section
              title="Ultime registrazioni"
              action={<LinkButton href="/beltrami/dashboard/clienti">Vedi clienti</LinkButton>}
            >
              {overview.ultimeRegistrazioni.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {overview.ultimeRegistrazioni.map((row) => (
                    <Link
                      key={row.id}
                      href={`/beltrami/dashboard/clienti/${row.id}`}
                      className="block py-3 transition hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-950">{getClienteName(row)}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {row.telefono_normalizzato || row.telefono || "-"}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-400">
                            {row.source || "registrazione"} - {row.qr_id || "QR"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs font-semibold text-slate-500">
                          {formatDateTime(row.created_at)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState>Nessuna registrazione trovata.</EmptyState>
              )}
            </Section>

            <Section
              title="Ultimi inbound WhatsApp"
              action={
                <LinkButton href="/beltrami/dashboard/attivita?tipo=whatsapp&periodo=30">
                  Vedi WhatsApp
                </LinkButton>
              }
            >
              {overview.ultimiInbound.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {overview.ultimiInbound.map((row) => (
                    <div key={row.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-950">
                            {row.from_phone || "Cliente"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {truncateText(row.body, 110)}
                          </div>
                          <div className="mt-1">
                            <Badge>{row.routing_status || "routing non indicato"}</Badge>
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
                <EmptyState>Nessun inbound WhatsApp trovato.</EmptyState>
              )}
            </Section>

            <Section
              title="Richieste aperte"
              action={
                <LinkButton href="/beltrami/dashboard/attivita?tipo=richieste&periodo=tutto">
                  Vedi richieste
                </LinkButton>
              }
            >
              {overview.ultimeRichiesteAperte.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {overview.ultimeRichiesteAperte.map((row) => (
                    <div key={row.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-950">
                            {row.cliente_nome || row.cliente_phone || "Cliente"}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {truncateText(row.inbound_body, 110)}
                          </div>
                          <div className="mt-1">
                            <Badge tone="warning">{row.status || "pending"}</Badge>
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
                <EmptyState>Nessuna richiesta aperta.</EmptyState>
              )}
            </Section>
          </div>

          {overview.erroriWhatsapp.length > 0 ? (
            <Section title="Errori WhatsApp recenti">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Data</th>
                      <th className="px-3 py-3">Tipo</th>
                      <th className="px-3 py-3">Destinatario</th>
                      <th className="px-3 py-3">Stato</th>
                      <th className="px-3 py-3">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {overview.erroriWhatsapp.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-3 font-semibold text-slate-700">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {row.template_name || row.message_kind || "-"}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {row.to_phone || row.from_phone || "-"}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone="danger">{row.status || "-"}</Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          {row.status_reason || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}
        </div>
      </main>
  );
}
