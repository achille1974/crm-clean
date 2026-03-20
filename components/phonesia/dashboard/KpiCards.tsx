import type { DashboardKpis } from "@/lib/phonesia/dashboard";

type Props = {
  kpis: DashboardKpis;
};

const items = (kpis: DashboardKpis) => [
  {
    label: "Lead QR",
    value: kpis.leadTotali,
    helper: "Clienti registrati",
  },
  {
    label: "Contratti",
    value: kpis.contrattiTotali,
    helper: "Totale importati",
  },
  {
    label: "Contratti collegati QR",
    value: kpis.contrattiCollegatiQr,
    helper: "Con cliente associato",
  },
  {
    label: "Conversione",
    value: `${kpis.conversionePct}%`,
    helper: "Lead convertiti / lead",
    highlight: true,
  },
  {
    label: "Telefonia",
    value: kpis.contrattiTelefonia,
    helper: "Mobile + fisso",
  },
  {
    label: "Energia",
    value: kpis.contrattiEnergia,
    helper: "Luce e gas",
  },
];

export default function KpiCards({ kpis }: Props) {
  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {items(kpis).map((item) => (
        <div
          key={item.label}
          className={[
            "rounded-3xl border bg-white p-5 shadow-sm transition",
            item.highlight
              ? "border-orange-200 bg-gradient-to-br from-orange-50 to-white"
              : "border-slate-200",
          ].join(" ")}
        >
          <div className="text-sm font-medium text-slate-500">{item.label}</div>

          <div
            className={[
              "mt-3 text-4xl font-black tracking-tight",
              item.highlight ? "text-orange-600" : "text-slate-950",
            ].join(" ")}
          >
            {item.value}
          </div>

          <div className="mt-2 text-xs text-slate-500">{item.helper}</div>
        </div>
      ))}
    </section>
  );
}
