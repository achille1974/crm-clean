"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* =========================
   OPZIONI STANDARD
========================= */
const CONSENSO_OPTS = [
  { v: "mai_chiesto", l: "🟡 Mai chiesto" },
  { v: "autorizzato", l: "🟢 Autorizzato" },
  { v: "negato", l: "🔴 Negato" },
];

const STATO_OPTS = [
  "mai_contattato",
  "contattato",
  "in_trattativa",
  "cliente",
  "perso",
];

const LIVELLO_OPTS = ["bassa", "media", "alta"];
const PRIORITA_OPTS = ["bassa", "media", "alta"];
const RELAZIONE_OPTS = ["freddo", "tiepido", "caldo", "cliente"];

const TIPO_ATTIVITA_OPTS = [
  "",
  "tabaccheria",
  "bar_tabacchi",
  "ricevitoria",
  "altro",
];

const DIMENSIONE_OPTS = ["", "piccola", "media", "grande"];

/* =========================
   PAGE
========================= */
export default function SchedaTabaccaio() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  /* =========================
     LOAD
  ========================= */
  useEffect(() => {
    if (!id) return;

    async function load() {
      const { data, error } = await supabase
        .from("tabaccai_master")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        alert("Tabaccaio non trovato");
        router.push("/supreme/tabaccai");
        return;
      }

      setForm({
        ...data,
        stato_consenso: data.stato_consenso ?? "mai_chiesto",
        priorita: data.priorita ?? "media",
      });

      setLoading(false);
    }

    load();
  }, [id, router]);

  /* =========================
     SAVE
  ========================= */
  async function save() {
    setSaving(true);

    const { error } = await supabase
      .from("tabaccai_master")
      .update(form)
      .eq("id", id);

    setSaving(false);

    if (error) {
      alert("Errore nel salvataggio");
      return;
    }

    alert("Salvataggio riuscito");
  }

  /* =========================
     ARCHIVE
  ========================= */
  async function archive() {
    if (!confirm("Archiviare questo tabaccaio?")) return;

    await supabase
      .from("tabaccai_master")
      .update({ stato_record: "archiviato" })
      .eq("id", id);

    router.push("/supreme/tabaccai");
  }

  /* =========================
     WHATSAPP
  ========================= */
  function sendWhatsapp() {
    const phone = form.cellulare || form.telefono;
    if (!phone) {
      alert("Nessun numero disponibile");
      return;
    }

    const text = encodeURIComponent(
`Ciao Sono Achille Beltrami, titolare della Rivendita Tabacchi n 1 di Floridia.

Ti mando il mio biglietto digitale:
https://app.crm-supreme.it/v/achille

Qui trovi chi sono, la mia storia e tutti i contatti.
Se puoi essere interessato al progetto Suprem-e, sentiamoci.
A presto`
    );

    window.open(
      `https://wa.me/${phone.replace(/\D/g, "")}?text=${text}`,
      "_blank"
    );
  }

  if (loading) return <div className="p-6">Caricamento…</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
      {/* HEADER */}
      <div>
        <button
          onClick={() => router.push("/supreme/tabaccai")}
          className="text-sm text-gray-500 mb-2"
        >
          ← Torna alla lista
        </button>

        <h1 className="text-3xl font-bold">
          {form.ragione_sociale || "Senza nome"}
        </h1>
        <p className="text-gray-500">
          {form.comune} — {form.prov}
        </p>
      </div>

      {/* ================= ANAGRAFICA ================= */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Anagrafica</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm">Ragione sociale</label>
            <input className="border p-2 rounded w-full"
              value={form.ragione_sociale || ""}
              onChange={(e) => setForm({ ...form, ragione_sociale: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm">Nome titolare</label>
            <input className="border p-2 rounded w-full"
              value={form.titolare || ""}
              onChange={(e) => setForm({ ...form, titolare: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm">Comune</label>
            <input className="border p-2 rounded w-full"
              value={form.comune || ""}
              onChange={(e) => setForm({ ...form, comune: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm">Provincia</label>
            <input className="border p-2 rounded w-full"
              value={form.prov || ""}
              onChange={(e) => setForm({ ...form, prov: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm">Indirizzo</label>
            <input className="border p-2 rounded w-full"
              value={form.indirizzo || ""}
              onChange={(e) => setForm({ ...form, indirizzo: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm">CAP</label>
            <input className="border p-2 rounded w-full"
              value={form.cap || ""}
              onChange={(e) => setForm({ ...form, cap: e.target.value })}
            />
          </div>

<div>
  <label className="block text-sm">Numero rivendita (Monopoli)</label>
  <input
    className="border p-2 rounded w-full"
    value={form.num_rivendita || ""}
    onChange={(e) =>
      setForm({ ...form, num_rivendita: e.target.value })
    }
    placeholder="Es. 1234"
  />
</div>



        </div>
      </section>

      {/* ================= CONSENSO ================= */}
      <section>
        <h2 className="font-semibold text-lg mb-2">Consenso contatto</h2>
        <select
          className="border p-2 rounded"
          value={form.stato_consenso}
          onChange={(e) => setForm({ ...form, stato_consenso: e.target.value })}
        >
          {CONSENSO_OPTS.map(o => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      </section>

      {/* ================= CONTATTI ================= */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Contatti</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm">Telefono fisso</label>
            <input className="border p-2 rounded w-full"
              value={form.telefono || ""}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm">Cellulare</label>
            <input className="border p-2 rounded w-full"
              value={form.cellulare || ""}
              onChange={(e) => setForm({ ...form, cellulare: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* ================= STATO COMMERCIALE ================= */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">Stato commerciale</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm">Stato</label>
            <select className="border p-2 rounded w-full"
              value={form.stato_supreme || ""}
              onChange={(e) => setForm({ ...form, stato_supreme: e.target.value })}
            >
              <option value="">—</option>
              {STATO_OPTS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm">Interesse commerciale</label>
            <select className="border p-2 rounded w-full"
              value={form.interesse_supreme || ""}
              onChange={(e) => setForm({ ...form, interesse_supreme: e.target.value })}
            >
              <option value="">—</option>
              {LIVELLO_OPTS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm">Potenziale commerciale</label>
            <p className="text-xs text-gray-500 mb-1">
              Quanto questo tabaccaio può diventare rilevante per Suprem-e.
            </p>
            <select className="border p-2 rounded w-full"
              value={form.potenziale_commerciale || ""}
              onChange={(e) => setForm({ ...form, potenziale_commerciale: e.target.value })}
            >
              <option value="">—</option>
              {LIVELLO_OPTS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm">Priorità</label>
            <select className="border p-2 rounded w-full"
              value={form.priorita || ""}
              onChange={(e) => setForm({ ...form, priorita: e.target.value })}
            >
              {PRIORITA_OPTS.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* ================= NOTE ================= */}
      <section>
        <h2 className="font-semibold text-lg">Note strategiche</h2>
        <textarea
          className="border p-3 rounded w-full h-40"
          value={form.note || ""}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        <p className="text-xs text-gray-500 mt-1">Solo per uso interno.</p>
      </section>

      {/* ================= AZIONI ================= */}
      <div className="flex gap-4 pt-6">
        <button onClick={save} disabled={saving}
          className="bg-black text-white px-6 py-2 rounded">
          Salva dati CRM
        </button>

        <button onClick={sendWhatsapp}
          className="bg-green-600 text-white px-6 py-2 rounded">
          💬 WhatsApp (biglietto)
        </button>

        <button onClick={archive}
          className="border px-6 py-2 rounded">
          Archivia tabaccaio
        </button>
      </div>
    </div>
  );
}
