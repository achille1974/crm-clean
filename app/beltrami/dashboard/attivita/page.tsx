import Link from "next/link";

import {
  Badge,
  EmptyState,
  formatDateTime,
  LinkButton,
  PageHeader,
  Section,
  truncateText,
} from "@/components/beltrami/dashboard/DashboardUi";
import {
  getBeltramiActivityTimeline,
  type BeltramiActivityPeriod,
  type BeltramiActivityType,
} from "@/lib/beltrami/dashboard";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParamsInput;
};

const TYPE_OPTIONS: Array<{ value: BeltramiActivityType; label: string }> = [
  { value: "tutte", label: "Tutte" },
  { value: "registrazioni", label: "Registrazioni" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "richieste", label: "Richieste" },
  { value: "errori", label: "Errori" },
];

const PERIOD_OPTIONS: Array<{ value: BeltramiActivityPeriod; label: string }> = [
  { value: "oggi", label: "Oggi" },
  { value: "7", label: "7 giorni" },
  { value: "30", label: "30 giorni" },
  { value: "tutto", label: "Tutto" },
];

function getSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeType(value: string): BeltramiActivityType {
  return TYPE_OPTIONS.some((option) => option.value === value)
    ? (value as BeltramiActivityType)
    : "tutte";
}

function normalizePeriod(value: string): BeltramiActivityPeriod {
  return PERIOD_OPTIONS.some((option) => option.value === value)
    ? (value as BeltramiActivityPeriod)
    : "30";
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    registration: "Registrazione QR",
    whatsapp_inbound: "WhatsApp inbound",
    whatsapp_notify: "Notifica interna",
    handoff: "Richiesta handoff",
    error: "Errore",
  };

  return labels[type] ?? type;
}

function getTypeTone(type: string): "neutral" | "success" | "warning" | "danger" {
  if (type === "registration") return "success";
  if (type === "handoff" || type === "whatsapp_inbound") return "warning";
  if (type === "error") return "danger";
  return "neutral";
}

function getStatusTone(status: string | null | undefined): "neutral" | "success" | "warning" | "danger" {
  if (status === "sent" || status === "done" || status === "delivered" || status === "read") {
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
        <Section title="Attivita non disponibili">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {message}
          </div>
        </Section>
      </div>
    </main>
  );
}

async function loadTimeline(params: {
  tipo: BeltramiActivityType;
  periodo: BeltramiActivityPeriod;
}) {
  try {
    return {
      timeline: await getBeltramiActivityTimeline(params),
      errorMessage: null,
    };
  } catch (error) {
    return {
      timeline: null,
      errorMessage:
        error instanceof Error ? error.message : "Errore lettura attivita Beltrami.",
    };
  }
}

export default async function BeltramiAttivitaPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const tipo = normalizeType(getSingleValue(resolvedParams.tipo));
  const periodo = normalizePeriod(getSingleValue(resolvedParams.periodo));
  const { timeline, errorMessage } = await loadTimeline({ tipo, periodo });

  if (!timeline) {
    return <ErrorPanel message={errorMessage || "Attivita non disponibili."} />;
  }

  return (
      <main className="min-h-screen px-4 py-6 md:px-8">
        <div className="mx-auto max-w-[1700px] space-y-6">
          <PageHeader
            eyebrow="Timeline operativa"
            title="Attivita Beltrami"
            actions={
              <>
                <LinkButton href="/beltrami/dashboard">Dashboard</LinkButton>
                <LinkButton href="/beltrami/dashboard/clienti">Clienti</LinkButton>
              </>
            }
          />

          {timeline.warnings.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              {timeline.warnings.join(" ")}
            </div>
          ) : null}

          <Section title="Filtri">
            <form
              action="/beltrami/dashboard/attivita"
              method="get"
              className="grid gap-4 md:grid-cols-[220px_220px_auto]"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">
                  Tipo attivita
                </span>
                <select
                  name="tipo"
                  defaultValue={tipo}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700">Periodo</span>
                <select
                  name="periodo"
                  defaultValue={periodo}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  Filtra
                </button>
                <LinkButton href="/beltrami/dashboard/attivita">Reset</LinkButton>
              </div>
            </form>
          </Section>

          <Section title={`Timeline (${timeline.items.length})`}>
            {timeline.items.length > 0 ? (
              <div className="space-y-3">
                {timeline.items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <Badge tone={getTypeTone(item.type)}>{getTypeLabel(item.type)}</Badge>
                          {item.status ? (
                            <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
                          ) : null}
                        </div>
                        <h2 className="text-base font-black text-slate-950">{item.title}</h2>
                        <div className="mt-1 text-sm font-semibold text-slate-500">
                          {item.subtitle || "-"}
                        </div>
                        {item.body ? (
                          <div className="mt-3 text-sm leading-6 text-slate-700">
                            {truncateText(item.body, 220)}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                        <div className="text-sm font-semibold text-slate-500">
                          {formatDateTime(item.createdAt)}
                        </div>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Apri cliente
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>Nessuna attivita trovata per i filtri selezionati.</EmptyState>
            )}
          </Section>
        </div>
      </main>
  );
}
