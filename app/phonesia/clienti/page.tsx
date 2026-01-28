import { createClient } from "@supabase/supabase-js";
import ClientiList from "@/components/phonesia/ClientiList";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function ClientiPage() {
  const { data: clienti, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, email, telefono")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">
        Clienti – Phonesia
      </h1>

      <ClientiList clienti={clienti ?? []} />
    </div>
  );
}
