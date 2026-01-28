export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// COMPONENTI
import AttivitaForm from "@/components/phonesia/attivita/AttivitaForm";
import AttivitaList from "@/components/phonesia/attivita/AttivitaList";
import OperazioneManualeForm from "@/components/phonesia/OperazioneManualeForm";

// Supabase (ANON, lettura)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // ✅ NEXT 16 FIX
  const { id } = await params;
  const clienteId = Number(id);

  if (Number.isNaN(clienteId)) {
    notFound();
  }

  const { data: cliente, error } = await supabase
    .from("phonesia_clienti")
    .select("*")
    .eq("id", clienteId)
    .single();

  if (error || !cliente) {
    console.error("Errore cliente:", error);
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">
        {cliente.nome} {cliente.cognome}
      </h1>

      {/* IDENTITÀ */}
      <div className="border rounded p-4">
        <h2 className="font-medium mb-2">Identità cliente</h2>
        <ul className="text-sm space-y-1">
          <li><strong>Telefono:</strong> {cliente.telefono ?? "—"}</li>
          <li><strong>Email:</strong> {cliente.email ?? "—"}</li>
          <li><strong>Codice fiscale:</strong> {cliente.codice_fiscale ?? "—"}</li>
        </ul>
      </div>

      {/* ORIGINE */}
      <div className="border rounded p-4">
        <h2 className="font-medium mb-2">Origine</h2>
        <ul className="text-sm space-y-1">
          <li><strong>Negozio:</strong> {cliente.negozio_id ?? "—"}</li>
          <li><strong>QR ID:</strong> {cliente.qr_id ?? "—"}</li>
          <li>
            <strong>Creato il:</strong>{" "}
            {new Date(cliente.created_at).toLocaleString()}
          </li>
        </ul>
      </div>

      {/* PRIVACY */}
      <div className="border rounded p-4 opacity-70">
        <h2 className="font-medium mb-2">Privacy</h2>
        <p className="text-sm">Storico consensi gestito separatamente.</p>
      </div>

      {/* ATTIVITÀ */}
      <div className="border rounded p-4">
        <h2 className="font-medium mb-3">Attività</h2>
        <AttivitaForm clienteId={cliente.id} />
        <div className="mt-4">
          <AttivitaList clienteId={cliente.id} />
        </div>
      </div>

      {/* OPERAZIONI */}
      <div className="border rounded p-4">
        <h2 className="font-medium mb-3">Operazioni</h2>
        <OperazioneManualeForm
          clienteId={cliente.id}
          clientePda={cliente.cliente_pda}
          telefono={cliente.telefono}
          negozio={cliente.negozio_id ?? "—"}
        />
      </div>

      {/* SCADENZE */}
      <div className="border rounded p-4 opacity-50">
        <h2 className="font-medium mb-2">Scadenze</h2>
        <p className="text-sm">Verranno gestite nel prossimo step.</p>
      </div>
    </div>
  );
}
