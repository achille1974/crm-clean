import { supabase } from "@/lib/supabaseClient"

export default async function Card({ params }: any) {

  const { data } = await supabase
    .from("phonesia_clienti")
    .select("*")
    .eq("id", params.id)
    .single()

  if (!data) {
    return <div>Cliente non trovato</div>
  }

  return (
    <div style={{padding:40,fontFamily:"sans-serif"}}>
      <h1>Biglietto Digitale Phonesia</h1>

      <p><b>Nome:</b> {data.nome}</p>
      <p><b>Cognome:</b> {data.cognome}</p>
      <p><b>Telefono:</b> {data.telefono}</p>

      <hr />

      <p>Cliente registrato nel sistema Phonesia.</p>
    </div>
  )
}
