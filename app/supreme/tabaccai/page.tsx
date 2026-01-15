"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Tabaccaio = {
  id: number;
  ragione_sociale: string;
  comune: string;
  prov: string;
  telefono?: string;
  cellulare?: string;
  stato_supreme?: string;
  stato_consenso?: string;
};

export default function ListaTabaccaiSupreme() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [list, setList] = useState<Tabaccaio[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("tabaccai_master")
        .select(
          "id, ragione_sociale, comune, prov, telefono, cellulare, stato_supreme, stato_consenso"
        )
        .order("ragione_sociale");

      setList(data || []);
      setLoading(false);
    }

    load();
  }, []);

  const filtered = list.filter((t) => {
    const q = query.toLowerCase();
    return (
      t.ragione_sociale?.toLowerCase().includes(q) ||
      t.comune?.toLowerCase().includes(q) ||
      t.telefono?.includes(q) ||
      t.cellulare?.includes(q)
    );
  });

  function labelStato(v?: string) {
    if (!v) return "—";
    return v.replaceAll("_", " ");
  }

  function labelConsenso(v?: string) {
    if (v === "autorizzato") return "🟢 Consenso ok";
    if (v === "negato") return "🔴 Consenso negato";
    return "🟡 Consenso non chiesto";
  }

  if (loading) return <div className="p-6">Caricamento…</div>;

  return (
    <>
      {/* HEADER NAV */}
      <div className="border-b mb-6">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-6">
          <div className="font-bold text-lg">SUPREME CRM</div>

          <div className="flex gap-2">
            <a
              href="/supreme/tabaccai"
              className="px-4 py-2 border rounded bg-black text-white"
            >
              Tabaccai
            </a>

            <a
              href="/supreme/dashboard"
              className="px-4 py-2 border rounded hover:bg-black hover:text-white"
            >
              Dashboard
            </a>

            <a
              href="/supreme/biglietto"
              className="px-4 py-2 border rounded hover:bg-black hover:text-white"
            >
              Biglietto
            </a>
          </div>
        </div>
      </div>

      {/* CONTENUTO */}
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold">
          Tabaccai — Lista Master ({filtered.length}/{list.length})
        </h1>

        <p className="text-sm text-gray-500">
          Clicca un tabaccaio per aprire la scheda
        </p>

        <input
          className="border p-3 rounded w-full"
          placeholder="Cerca per nome, comune, telefono…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="space-y-4">
          {filtered.map((t) => (
            <div
              key={t.id}
              onClick={() => router.push(`/supreme/tabaccai/${t.id}`)}
              className="border rounded p-4 hover:bg-gray-50 cursor-pointer flex justify-between"
            >
              {/* SINISTRA */}
              <div className="space-y-1">
                <div className="font-semibold text-lg">
                  {t.ragione_sociale}
                </div>
                <div className="text-sm text-gray-500">
                  {t.comune} — {t.prov}
                </div>

                <div className="flex gap-4 text-sm mt-2">
                  {t.telefono && <span>📞 {t.telefono}</span>}
                  {t.cellulare && <span>📱 {t.cellulare}</span>}

                  {t.cellulare && (
                    t.stato_consenso === "autorizzato" ? (
                      <span className="text-green-700">💬 WhatsApp</span>
                    ) : (
                      <span className="text-gray-400">
                        🚫 WhatsApp non consentito
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* DESTRA */}
              <div className="text-right space-y-2 text-sm">
                <div className="px-3 py-1 rounded bg-gray-100">
                  Stato: <strong>{labelStato(t.stato_supreme)}</strong>
                </div>

                <div className="px-3 py-1 rounded bg-yellow-100">
                  {labelConsenso(t.stato_consenso)}
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-gray-500 text-sm">
              Nessun risultato
            </div>
          )}
        </div>
      </div>
    </>
  );
}
