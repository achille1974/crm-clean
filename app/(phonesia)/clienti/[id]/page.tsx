import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// COMPONENTI ATTIVITÀ (CLIENT)
import AttivitaForm from "@/components/phonesia/attivita/AttivitaForm";
import AttivitaList from "@/components/phonesia/attivita/AttivitaList";

// Supabase client (server)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function ClienteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  if (Number.isNaN(id)) {
    notFound();
  }

  const { data: cliente, error } = await supabase
    .from("phonesia_clienti")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !cliente) {
    notFound();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">
        {cliente.nome} {cliente.cognome}
      </h1>

      {/* BLOCCO IDENTITÀ (QR) */}
      <div className="border rounded p-4">
        <h2 className="font-medium mb-2">Identità cliente</h2>

        <ul className="text-sm space-y-1">
          <li>
            <strong>Telefono:</strong> {cliente.telefono ?? "—"}
          </li>
          <li>
            <strong>Email:</strong> {cliente.email ?? "—"}
          </li>
          <li>
            <strong>Codice fiscale:</strong>{" "}
            {cliente.codice_fiscale ?? "—"}
          </li>
        </ul>
      </div>

      {/* BLOCCO ORIGINE (NON EDITABILE) */}
      <div className="border rounded p-4">
        <h2 className="font-medium mb-2">Origine</h2>

        <ul className="text-sm space-y-1">
          <li>
            <strong>Negozio:</strong> {cliente.negozio_id ?? "—"}
          </li>
          <li>
            <strong>QR ID:</strong> {cliente.qr_id ?? "—"}
          </li>
          <li>
            <strong>Creato il:</strong>{" "}
            {new Date(cliente.created_at).toLocaleString()}
          </li>
        </ul>
      </div>

      {/* BLOCCO PRIVACY (SOLO LETTURA) */}
      <div className="border rounded p-4 opacity-70">
        <h2 className="font-medium mb-2">Privacy</h2>
        <p className="text-sm">
          Storico consensi gestito separatamente.
        </p>
      </div>

      {/* BLOCCO ATTIVITÀ (OPERATIVO) */}
      <div className="border rounded p-4">
        <h2 className="font-medium mb-3">Attività</h2>

        <AttivitaForm clienteId={cliente.id} />

        <div className="mt-4">
          <AttivitaList clienteId={cliente.id} />
        </div>
      </div>

      {/* BLOCCO SCADENZE (PLACEHOLDER VOLUTO) */}
      <div className="border rounded p-4 opacity-50">
        <h2 className="font-medium mb-2">Scadenze</h2>
        <p className="text-sm">
          Verranno gestite nel prossimo step.
        </p>
      </div>
    </div>
  );
}
