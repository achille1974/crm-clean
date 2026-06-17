export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import {
  BELTRAMI_PRIVACY_VERSION,
  BELTRAMI_QR_ID,
  BELTRAMI_SOURCE,
} from "@/lib/beltrami/services";
import { createBeltramiSupabaseAdmin } from "@/lib/beltrami/supabase";
import {
  type BeltramiRegistrationData,
  validateBeltramiRegistration,
} from "@/lib/beltrami/validation";

type BeltramiClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  telefono_normalizzato: string | null;
  email: string | null;
  codice_fiscale: string | null;
  note: string | null;
  servizio_interesse: string | null;
};

function isDuplicateInsertError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };

  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  const details = typeof record.details === "string" ? record.details : "";

  return (
    code === "23505" ||
    message.toLowerCase().includes("duplicate") ||
    details.toLowerCase().includes("already exists")
  );
}

async function findExistingCliente(
  supabase: ReturnType<typeof createBeltramiSupabaseAdmin>,
  data: BeltramiRegistrationData,
): Promise<BeltramiClienteRow | null> {
  const selectFields =
    "id, nome, cognome, telefono, telefono_normalizzato, email, codice_fiscale, note, servizio_interesse";

  const { data: byPhone, error: phoneError } = await supabase
    .from("beltrami_clienti")
    .select(selectFields)
    .eq("telefono_normalizzato", data.telefono_normalizzato)
    .limit(1)
    .maybeSingle();

  if (phoneError) throw phoneError;
  if (byPhone) return byPhone as BeltramiClienteRow;

  if (data.codice_fiscale) {
    const { data: byCf, error: cfError } = await supabase
      .from("beltrami_clienti")
      .select(selectFields)
      .eq("codice_fiscale", data.codice_fiscale)
      .limit(1)
      .maybeSingle();

    if (cfError) throw cfError;
    if (byCf) return byCf as BeltramiClienteRow;
  }

  if (data.email) {
    const { data: byEmail, error: emailError } = await supabase
      .from("beltrami_clienti")
      .select(selectFields)
      .eq("email", data.email)
      .limit(1)
      .maybeSingle();

    if (emailError) throw emailError;
    if (byEmail) return byEmail as BeltramiClienteRow;
  }

  return null;
}

function buildClienteInsert(data: BeltramiRegistrationData) {
  return {
    nome: data.nome,
    cognome: data.cognome,
    telefono: data.telefono,
    telefono_normalizzato: data.telefono_normalizzato,
    email: data.email,
    codice_fiscale: data.codice_fiscale,
    note: data.note,
    servizio_interesse: data.servizio_interesse,
    privacy_consent: true,
    whatsapp_consent: true,
    privacy_version: BELTRAMI_PRIVACY_VERSION,
    qr_id: BELTRAMI_QR_ID,
    source: BELTRAMI_SOURCE,
  };
}

function buildClientePatch(data: BeltramiRegistrationData) {
  const patch: Record<string, string | boolean | null> = {
    updated_at: new Date().toISOString(),
    nome: data.nome,
    cognome: data.cognome,
    telefono: data.telefono,
    telefono_normalizzato: data.telefono_normalizzato,
    privacy_consent: true,
    whatsapp_consent: true,
    privacy_version: BELTRAMI_PRIVACY_VERSION,
    qr_id: BELTRAMI_QR_ID,
    source: BELTRAMI_SOURCE,
  };

  if (data.email) patch.email = data.email;
  if (data.codice_fiscale) patch.codice_fiscale = data.codice_fiscale;
  if (data.note) patch.note = data.note;
  if (data.servizio_interesse) patch.servizio_interesse = data.servizio_interesse;

  return patch;
}

async function upsertCliente(
  supabase: ReturnType<typeof createBeltramiSupabaseAdmin>,
  data: BeltramiRegistrationData,
) {
  const existing = await findExistingCliente(supabase, data);

  if (existing) {
    const { data: updated, error } = await supabase
      .from("beltrami_clienti")
      .update(buildClientePatch(data))
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) throw error;

    return {
      clienteId: Number(updated.id),
      created: false,
    };
  }

  const { data: inserted, error } = await supabase
    .from("beltrami_clienti")
    .insert(buildClienteInsert(data))
    .select("id")
    .single();

  if (error) {
    if (isDuplicateInsertError(error)) {
      const duplicate = await findExistingCliente(supabase, data);

      if (duplicate) {
        const { data: updated, error: updateError } = await supabase
          .from("beltrami_clienti")
          .update(buildClientePatch(data))
          .eq("id", duplicate.id)
          .select("id")
          .single();

        if (updateError) throw updateError;

        return {
          clienteId: Number(updated.id),
          created: false,
        };
      }
    }

    throw error;
  }

  return {
    clienteId: Number(inserted.id),
    created: true,
  };
}

async function registraConsensi(
  supabase: ReturnType<typeof createBeltramiSupabaseAdmin>,
  params: {
    clienteId: number;
    userAgent: string | null;
  },
) {
  const base = {
    cliente_id: params.clienteId,
    metodo: "qr",
    privacy_version: BELTRAMI_PRIVACY_VERSION,
    qr_id: BELTRAMI_QR_ID,
    user_agent: params.userAgent,
  };

  const { error } = await supabase.from("beltrami_consensi").insert([
    {
      ...base,
      tipo_evento: "privacy_accepted",
    },
    {
      ...base,
      tipo_evento: "whatsapp_contact_accepted",
    },
  ]);

  if (error) throw error;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const validation = validateBeltramiRegistration(body ?? {});

    if (!validation.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_failed",
          message: "Dati registrazione non validi.",
          errors: validation.errors,
        },
        { status: 400 },
      );
    }

    const supabase = createBeltramiSupabaseAdmin();
    const result = await upsertCliente(supabase, validation.data);

    await registraConsensi(supabase, {
      clienteId: result.clienteId,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json(
      {
        ok: true,
        cliente_id: result.clienteId,
        created: result.created,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    console.error("Errore registrazione Beltrami:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: "Errore durante la registrazione. Riprova piu tardi.",
      },
      { status: 500 },
    );
  }
}
