type Item = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  subtitle?: string;
  items: Item[];
};

function formatValue(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

export default function SimpleBarChart({ title, subtitle, items }: Props) {
  const safeItems = items.filter((item) => Number.isFinite(item.value) && item.value >= 0);
  const total = safeItems.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(...safeItems.map((item) => item.value), 0);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-2xl font-black tracking-tight text-slate-950">{title}</h3>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>

          <div className="flex gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Righe
              </div>
              <div className="mt-1 text-2xl font-black text-slate-950">{safeItems.length}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Totale
              </div>
              <div className="mt-1 text-2xl font-black text-slate-950">
                {formatValue(total)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {safeItems.length === 0 ? (
        <div className="px-6 py-10 text-sm text-slate-500">Nessun dato disponibile per il filtro selezionato.</div>
      ) : (
        <div className="px-6 py-5">
          <div className="space-y-4">
            {safeItems.map((item, index) => {
              const widthPct = max > 0 ? Math.max((item.value / max) * 100, 2) : 0;
              const sharePct = total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0;
              const isTop = index === 0 && item.value === max;

              return (
                <div key={`${item.label}-${index}`} className="space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          #{index + 1}
                        </span>
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {item.label}
                        </div>
                        {isTop ? (
                          <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                            Top
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-bold text-slate-950">
                        {formatValue(item.value)}
                      </div>
                      <div className="text-xs text-slate-500">{sharePct}% del totale</div>
                    </div>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        isTop ? "bg-orange-500" : "bg-slate-700"
                      }`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
