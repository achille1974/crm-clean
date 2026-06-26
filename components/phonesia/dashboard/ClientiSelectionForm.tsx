"use client";

import { type ReactNode, useCallback, useRef, useState } from "react";

type ClientiSelectionFormProps = {
  children: ReactNode;
  promoKey?: string | null;
  selectableClientCount?: number;
  visibleClientCount: number;
};

export default function ClientiSelectionForm({
  children,
  promoKey,
  selectableClientCount,
  visibleClientCount,
}: ClientiSelectionFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const selectableTotal = selectableClientCount ?? visibleClientCount;

  const getClientCheckboxes = useCallback(() => {
    return Array.from(
      formRef.current?.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"][name="clienti"]',
      ) ?? [],
    );
  }, []);

  const getSelectAllCheckboxes = useCallback(() => {
    return getClientCheckboxes().filter((checkbox) => !checkbox.disabled);
  }, [getClientCheckboxes]);

  const refreshSelectedCount = useCallback(() => {
    const checkedCount = getClientCheckboxes().filter((checkbox) => checkbox.checked).length;
    setSelectedCount(checkedCount);
  }, [getClientCheckboxes]);

  function setAllVisibleClients(checked: boolean) {
    const checkboxes = checked ? getSelectAllCheckboxes() : getClientCheckboxes();

    for (const checkbox of checkboxes) {
      checkbox.checked = checked;
    }

    refreshSelectedCount();
  }

  return (
    <form
      ref={formRef}
      action="/phonesia/dashboard/opportunita/invio"
      method="get"
      className="space-y-4"
      onChange={refreshSelectedCount}
    >
      {promoKey ? <input type="hidden" name="promo_key" value={promoKey} /> : null}

      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950">Selezione clienti</h2>
            <p className="mt-1 text-sm text-slate-600">
              Seleziona uno o più clienti e poi apri la pagina di composizione opportunità.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              Clienti selezionati: {selectedCount} / {selectableTotal}
            </div>

            <button
              type="button"
              onClick={() => setAllVisibleClients(true)}
              disabled={selectableTotal === 0}
              className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 px-5 text-sm font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Seleziona tutti
            </button>

            <button
              type="button"
              onClick={() => setAllVisibleClients(false)}
              disabled={selectedCount === 0}
              className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Deseleziona tutti
            </button>

            <button
              type="submit"
              disabled={selectedCount === 0}
              className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Crea invio opportunità
            </button>
          </div>
        </div>
      </section>

      {children}
    </form>
  );
}
