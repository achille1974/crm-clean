"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SupremeHeader from "@/components/supreme/SupremeHeader";

/* =========================
   OPZIONI
========================= */
const STATO_OPTS = ["mai_contattato", "contattato", "in_trattativa", "cliente", "perso"];
const CONSENSO_OPTS = ["mai_chiesto", "autorizzato", "negato"];
const LIVELLO_OPTS = ["bassa", "media", "alta"];
const PRIORITA_OPTS = ["bassa", "media", "alta"];
const TIPO_ATTIVITA_OPTS = ["tabaccheria", "bar_tabacchi", "ricevitoria", "altro"];
const DIMENSIONE_OPTS = ["piccola", "media", "grande"];
const RELAZIONE_OPTS = ["freddo", "tiepido", "caldo", "cliente"];

/* =========================
   PAGE
========================= */
export default function DashboardSupreme() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tabaccai, setTabaccai] = useState<any[]>([]);

  /* FILTRI */
  const [filtro, setFiltro] = useState({
    stato: [] as string[],
    consenso: [] as string[],
    interesse: [] as string[],
    potenziale: [] as string[],
    priorita: [] as string[],
    tipo: [] as string[],
    dimensione: [] as string[],
    relazione: [] as string[],
    soloConTelefono: false,
    soloWhatsapp: false,
  });

  /* =========================
     LOAD
  ========================= */
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("tabaccai_master")
        .select("*")
        .neq("stato_record", "archiviato");

      if (!error && data) setTabaccai(data);
      setLoading(false);
    }
    load();
  }, []);

  /* =========================
     FILTRAGGIO
  ========================= */
  const filtrati = useMemo(() => {
    return tabaccai.filter(t => {
      if (filtro.stato.length && !filtro.stato.includes(t.stato_supreme)) return false;
      if (filtro.consenso.length && !filtro.consenso.includes(t.stato_consenso)) return false;
      if (filtro.interesse.length && !filtro.interesse.includes(t.interesse_supreme)) return false;
      if (filtro.potenziale.length && !filtro.potenziale.includes(t.potenziale_commerciale)) return false;
      if (filtro.priorita.length && !filtro.priorita.includes(t.priorita)) return false;
      if (filtro.tipo.length && !filtro.tipo.includes(t.tipo_attivita)) return false;
      if (filtro.dimensione.length && !filtro.dimensione.includes(t.dimensione_attivita)) return false;
      if (filtro.relazione.length && !filtro.relazione.includes(t.livello_relazione)) return false;

      if (filtro.soloConTelefono && !t.telefono && !t.cellulare) return false;
      if (
        filtro.soloWhatsapp &&
        (!t.cellulare || t.stato_consenso === "negato")
      )
        return false;

      return true;
    });
  }, [tabaccai, filtro]);

  function toggle(arr: string[], val: string) {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
  }

  if (loading) return <div className="p-6">Caricamento…</div>;

  return (
    <>
      <SupremeHeader />

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* HEADER NUMERI */}
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Dashboard Supreme</h1>
          <div className="text-sm text-gray-600">
            Totale tabaccai: <b>{tabaccai.length}</b> ·
            Risultato filtri: <b>{filtrati.length}</b>
          </div>
        </div>

        {/* ================= FILTRI ================= */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border p-4 rounded">
          <Filtro
            titolo="Stato commerciale"
            opts={STATO_OPTS}
            values={filtro.stato}
            onChange={v => setFiltro({ ...filtro, stato: toggle(filtro.stato, v) })}
          />

          <Filtro
            titolo="Consenso contatto"
            opts={CONSENSO_OPTS}
            values={filtro.consenso}
            onChange={v => setFiltro({ ...filtro, consenso: toggle(filtro.consenso, v) })}
          />

          <Filtro
            titolo="Interesse commerciale"
            opts={LIVELLO_OPTS}
            values={filtro.interesse}
            onChange={v => setFiltro({ ...filtro, interesse: toggle(filtro.interesse, v) })}
          />

          <Filtro
            titolo="Potenziale commerciale"
            opts={LIVELLO_OPTS}
            values={filtro.potenziale}
            onChange={v => setFiltro({ ...filtro, potenziale: toggle(filtro.potenziale, v) })}
          />

          <Filtro
            titolo="Priorità"
            opts={PRIORITA_OPTS}
            values={filtro.priorita}
            onChange={v => setFiltro({ ...filtro, priorita: toggle(filtro.priorita, v) })}
          />

          <Filtro
            titolo="Tipo attività"
            opts={TIPO_ATTIVITA_OPTS}
            values={filtro.tipo}
            onChange={v => setFiltro({ ...filtro, tipo: toggle(filtro.tipo, v) })}
          />

          <Filtro
            titolo="Dimensione"
            opts={DIMENSIONE_OPTS}
            values={filtro.dimensione}
            onChange={v => setFiltro({ ...filtro, dimensione: toggle(filtro.dimensione, v) })}
          />

          <Filtro
            titolo="Livello relazione"
            opts={RELAZIONE_OPTS}
            values={filtro.relazione}
            onChange={v => setFiltro({ ...filtro, relazione: toggle(filtro.relazione, v) })}
          />

          <div className="space-y-2">
            <label className="block font-medium">Disponibilità contatto</label>

            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={filtro.soloConTelefono}
                onChange={e =>
                  setFiltro({ ...filtro, soloConTelefono: e.target.checked })
                }
              />
              Ha almeno un telefono
            </label>

            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={filtro.soloWhatsapp}
                onChange={e =>
                  setFiltro({ ...filtro, soloWhatsapp: e.target.checked })
                }
              />
              WhatsApp utilizzabile
            </label>
          </div>
        </div>

        {/* ================= RISULTATO ================= */}
        <div className="space-y-3">
          {filtrati.map(t => (
            <div
              key={t.id}
              onClick={() => router.push(`/supreme/tabaccai/${t.id}`)}
              className="border rounded p-4 hover:bg-gray-50 cursor-pointer flex justify-between"
            >
              <div>
                <div className="font-semibold">{t.ragione_sociale}</div>
                <div className="text-sm text-gray-500">
                  {t.comune} — {t.prov}
                </div>
                <div className="text-sm">
                  {t.telefono || t.cellulare || "Nessun telefono"}
                </div>
              </div>

              <div className="text-sm text-right space-y-1">
                <div>
                  Stato: <b>{t.stato_supreme || "—"}</b>
                </div>
                <div>
                  Interesse: <b>{t.interesse_supreme || "—"}</b>
                </div>
                <div>
                  Consenso: <b>{t.stato_consenso || "—"}</b>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* =========================
   COMPONENTE FILTRO
========================= */
function Filtro({
  titolo,
  opts,
  values,
  onChange,
}: {
  titolo: string;
  opts: string[];
  values: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block font-medium mb-1">{titolo}</label>
      <div className="flex flex-wrap gap-2">
        {opts.map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`px-3 py-1 rounded border text-sm ${
              values.includes(v)
                ? "bg-black text-white"
                : "bg-white"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
