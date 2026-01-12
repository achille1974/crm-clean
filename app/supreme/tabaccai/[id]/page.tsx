import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

// client Supabase (server)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function TabaccaioDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);

  if (Number.isNaN(id)) {
    notFound();
  }

  const { data: tabaccaio, error } = await supabase
    .from("tabaccai_scheda")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !tabaccaio) {
    notFound();
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">
        {tabaccaio.ragione_sociale}
      </h1>

      {/* Qui verranno montati i blocchi della scheda */}
      <pre className="bg-gray-100 p-4 rounded text-sm">
        {JSON.stringify(tabaccaio, null, 2)}
      </pre>
    </div>
  );
}
