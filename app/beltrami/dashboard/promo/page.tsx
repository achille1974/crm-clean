import { LinkButton, PageHeader, Section } from "@/components/beltrami/dashboard/DashboardUi";
import PromoCampaignClient from "@/components/beltrami/dashboard/PromoCampaignClient";
import { getBeltramiPromoDashboardData } from "@/lib/beltrami/promo";

export const dynamic = "force-dynamic";

type SearchParamsInput = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParamsInput;
};

function getSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1700px]">
        <Section title="Promo non disponibile">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {message}
          </div>
        </Section>
      </div>
    </main>
  );
}

async function loadPromoData(q: string) {
  try {
    return {
      data: await getBeltramiPromoDashboardData({ q }),
      errorMessage: null,
    };
  } catch (error) {
    return {
      data: null,
      errorMessage:
        error instanceof Error ? error.message : "Errore lettura promo Beltrami.",
    };
  }
}

export default async function BeltramiPromoPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const q = getSingleValue(resolvedParams.q).trim();
  const { data, errorMessage } = await loadPromoData(q);

  if (!data) {
    return <ErrorPanel message={errorMessage || "Promo Beltrami non disponibile."} />;
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <PageHeader
          eyebrow="Campagne WhatsApp"
          title="Promo Beltrami"
          actions={<LinkButton href="/beltrami/dashboard">Dashboard</LinkButton>}
        />

        <Section title="Filtri">
          <form
            action="/beltrami/dashboard/promo"
            method="get"
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                Cerca cliente idoneo
              </span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Nome, telefono, email"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                Filtra
              </button>
              <LinkButton href="/beltrami/dashboard/promo">Reset</LinkButton>
            </div>
          </form>
        </Section>

        <PromoCampaignClient data={data} />
      </div>
    </main>
  );
}
