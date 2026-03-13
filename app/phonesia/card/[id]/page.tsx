import { supabase } from "@/lib/supabaseClient";

export default async function Card({
  params,
}: {
  params: { id: string };
}) {

  const clienteId = Number(params.id);

  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("*")
    .eq("id", clienteId)
    .single();

  if (error || !data) {
    return (
      <div style={{ padding: 40, fontFamily: "sans-serif" }}>
        Cliente non trovato
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Biglietto Digitale Phonesia</h1>

      <p><b>Nome:</b> {data.nome}</p>
      <p><b>Cognome:</b> {data.cognome}</p>
      <p><b>Telefono:</b> {data.telefono}</p>

      <hr />

      <p>Cliente registrato nel sistema Phonesia.</p>
    </div>
  );
}
