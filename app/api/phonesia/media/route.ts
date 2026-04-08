import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_NAME = "media";

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

function sanitizeFileName(fileName: string): string {
  return fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isAllowedContentType(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileName?: string;
      contentType?: string;
    };

    const fileName = String(body.fileName ?? "").trim();
    const contentType = String(body.contentType ?? "").trim();

    if (!fileName) {
      return NextResponse.json(
        { ok: false, error: "file_name_mancante" },
        { status: 400 },
      );
    }

    if (!contentType || !isAllowedContentType(contentType)) {
      return NextResponse.json(
        { ok: false, error: "content_type_non_supportato" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const safeName = sanitizeFileName(fileName) || `file-${Date.now()}`;
    const path = `phonesia/opportunita/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new Error(error?.message || "Impossibile creare signed upload url");
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      bucket: BUCKET_NAME,
      path,
      token: data.token,
      publicUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "upload_url_error",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
