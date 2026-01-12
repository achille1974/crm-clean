"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Cliente = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ClientiList() {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("phonesia_clienti")
        .select("id, nome, cognome, telefono, email")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setItems(data);
      }

      setLoading(false);
    }

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return items.filter((c) =>
      [
        c.nome,
        c.cognome,
        c.telefono,
        c.email,
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
        placeholder="Cerca cliente…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border rounded px-3 py-2"
      />

      {/* LISTA */}
      <ul className="divide-y border rounded">
        {filtered.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between px-4 py-3"
          >
            {/* DATI */}
            <div>
              <div className="font-medium">
                {c.nome} {c.cognome}
              </div>
              <div className="text-sm text-gray-500">
                {c.email ?? ""}
              </div>
            </div>

            {/* AZIONI */}
            <div className="flex items-center gap-3">
              {/* SCHEDA (SEMPRE) */}
              <button
                onClick={() => router.push(`/clienti/${c.id}`)}
                className="text-sm underline"
              >
                Scheda
              </button>

              {/* TELEFONO / WHATSAPP */}
              {c.telefono && (
                <>
                  <a
                    href={`tel:${c.telefono}`}
                    className="text-sm underline"
                  >
                    Tel
                  </a>
                  <a
                    href={`https://wa.me/${c.telefono}`}
                    target="_blank"
                    className="text-sm underline"
                  >
                    WA
                  </a>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
