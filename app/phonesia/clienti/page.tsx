import { createClient } from "@supabase/supabase-js";
import ClientiList from "@/components/phonesia/ClientiList";

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  created_at: string | null;
};

type OpportunitaInviataRow = {
  cliente_id: number | null;
  opportunita_code: string | null;
  opportunita_label: string | null;
  sent_at: string | null;
};

type ClienteListItem = {
  id: number;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  ultima_opportunita_label: string | null;
  ultima_opportunita_sent_at: string | null;
  opportunita_labels: string[];
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function ClientiPage() {
  const supabase = getSupabaseAdmin();

  const { data: clientiData, error: clientiError } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, email, telefono, created_at")
    .order("created_at", { ascending: false });

  if (clientiError) {
    throw new Error(`Errore lettura clienti: ${clientiError.message}`);
  }

  const clienti = (clientiData ?? []) as ClienteRow[];
  const clienteIds = clienti.map((cliente) => cliente.id);

  let opportunitaRows: OpportunitaInviataRow[] = [];

  if (clienteIds.length > 0) {
    const { data: opportunitaData, error: opportunitaError } = await supabase
      .from("phonesia_opportunita_inviate")
      .select("cliente_id, opportunita_code, opportunita_label, sent_at")
      .in("cliente_id", clienteIds)
      .order("sent_at", { ascending: false });

    if (opportunitaError) {
      throw new Error(`Errore lettura opportunità inviate: ${opportunitaError.message}`);
    }

    opportunitaRows = (opportunitaData ?? []) as OpportunitaInviataRow[];
  }

  const opportunitaByCliente = new Map<
    number,
    {
      ultima_opportunita_label: string | null;
      ultima_opportunita_sent_at: string | null;
      opportunita_labels: string[];
      seenCodes: Set<string>;
    }
  >();

  for (const row of opportunitaRows) {
    if (!row.cliente_id) continue;

    const current =
      opportunitaByCliente.get(row.cliente_id) ??
      {
        ultima_opportunita_label: null,
        ultima_opportunita_sent_at: null,
        opportunita_labels: [],
        seenCodes: new Set<string>(),
      };

    if (!current.ultima_opportunita_sent_at) {
      current.ultima_opportunita_label = row.opportunita_label ?? null;
      current.ultima_opportunita_sent_at = row.sent_at ?? null;
    }

    const code = String(row.opportunita_code ?? "").trim();
    const label = String(row.opportunita_label ?? "").trim();

    if (code && label && !current.seenCodes.has(code)) {
      current.seenCodes.add(code);
      current.opportunita_labels.push(label);
    }

    opportunitaByCliente.set(row.cliente_id, current);
  }

  const clientiEnriched: ClienteListItem[] = clienti.map((cliente) => {
    const opportunita = opportunitaByCliente.get(cliente.id);

    return {
      id: cliente.id,
      nome: cliente.nome,
      cognome: cliente.cognome,
      email: cliente.email,
      telefono: cliente.telefono,
      ultima_opportunita_label: opportunita?.ultima_opportunita_label ?? null,
      ultima_opportunita_sent_at: opportunita?.ultima_opportunita_sent_at ?? null,
      opportunita_labels: opportunita?.opportunita_labels ?? [],
    };
  });

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Clienti – Phonesia</h1>

      <ClientiList clienti={clientiEnriched} />
    </div>
  );
}
