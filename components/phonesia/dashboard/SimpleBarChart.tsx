type Item = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  subtitle?: string;
  items: Item[];
};

export default function SimpleBarChart({ title, subtitle, items }: Props) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <div className="text-2xl font-bold tracking-tight text-slate-950">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
      </div>

      <div className="space-y-5">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Nessun dato disponibile
          </div>
        ) : (
          items.map((item) => {
            const width = `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 0)}%`;

            return (
              <div key={`${item.label}-${item.value}`} className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="truncate text-base font-medium text-slate-700">{item.label}</span>
                  <span className="text-sm font-bold text-slate-900">{item.value}</span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400"
                    style={{ width }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
