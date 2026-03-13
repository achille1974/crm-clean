import { supabase } from "@/lib/supabaseClient";

export default async function Card({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);

  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("*")
    .eq("id", clienteId)
    .maybeSingle();

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif" }}>
        Errore caricamento cliente
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif" }}>
        Cliente non trovato
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Biglietto Digitale Phonesia</h1>

      <p><b>Nome:</b> {data.nome || "-"}</p>
      <p><b>Cognome:</b> {data.cognome || "-"}</p>
      <p><b>Telefono:</b> {data.telefono || "-"}</p>
      <p><b>Email:</b> {data.email || "-"}</p>

      <hr />

      <p>Cliente registrato nel sistema Phonesia.</p>
    </div>
  );
}
