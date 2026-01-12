"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Tabaccaio = {
  id: number;
  ragione_sociale: string | null;
  comune: string | null;
  cellulare: string | null;
  consenso_stato: string | null; // autorizzato | mai_chiesto | non_autorizzato
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TabaccaiList() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Tabaccaio[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("tabaccai_master_view")
        .select("id, ragione_sociale, comune, cellulare, consenso_stato")
        .order("ragione_sociale", { ascending: true });

      if (!error && data) {
        setItems(data);
      }

      setLoading(false);
    }

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return items.filter((t) =>
      [
        t.ragione_sociale,
        t.comune,
        t.cellulare,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [items, search]);

  if (loading) {
    return <div>Caricamento…</div>;
  }

  return (
    <div className="space-y-4">
      {/* FILTRO UNICO */}
      <input
        type="text"
        placeholder="Cerca tabaccaio…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded px-3 py-2"
      />

      {/* LISTA */}
      <ul className="divide-y border rounded">
        {filtered.map((t) => {
          const consensoVerde = t.consenso_stato === "autorizzato";

          return (
            <li
              key={t.id}
              className="flex items-center justify-between px-4 py-3"
            >
              {/* DATI */}
              <div>
                <div className="font-medium">
                  {t.ragione_sociale ?? "—"}
                </div>
                <div className="text-sm text-gray-500">
                  {t.comune ?? ""}
                </div>
              </div>

              {/* AZIONI */}
              <div className="flex items-center gap-3">
                {/* SEMAFORO */}
                <span
                  className={`w-3 h-3 rounded-full ${
                    consensoVerde
                      ? "bg-green-500"
                      : "bg-gray-300"
                  }`}
                  title={t.consenso_stato ?? "mai chiesto"}
                />

                {/* SCHEDA (SEMPRE) */}
                <button
                  onClick={() => router.push(`/tabaccai/${t.id}`)}
                  className="text-sm underline"
                >
                  Scheda
                </button>

                {/* TELEFONO / WHATSAPP SOLO SE VERDE */}
                {consensoVerde && t.cellulare && (
                  <>
                    <a
                      href={`tel:${t.cellulare}`}
                      className="text-sm underline"
                    >
                      Tel
                    </a>
                    <a
                      href={`https://wa.me/${t.cellulare}`}
                      target="_blank"
                      className="text-sm underline"
                    >
                      WA
                    </a>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
