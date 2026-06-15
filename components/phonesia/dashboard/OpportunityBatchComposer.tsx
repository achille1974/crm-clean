"use client";

import { useMemo, useState, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { sanitizeWhatsAppTemplateText } from "@/lib/phonesia/whatsapp-template-payload";

const SERVICE_COLUMNS = [
  "MOBILE",
  "FISSO",
  "ENERGIA",
  "TV",
  "SMARTPHONE",
  "ACCESSORI",
  "SICUREZZA",
  "FOTOVOLTAICO",
] as const;

type ServiceFamily = (typeof SERVICE_COLUMNS)[number];

type Recipient = {
  id: number;
  nomeCompleto: string;
  telefono: string;
  negozioLabel: string;
  whatsappActive: boolean;
  marketingConsented: boolean;
};

type Props = {
  recipients: Recipient[];
};

type CustomMessageMode = "text" | "image" | "document";

type SendResultRow = {
  clienteId: number | null;
  nome: string;
  status: "sent" | "failed" | "skipped";
  reason: string;
  errorCode?: number | null;
  fbtraceId?: string | null;
  metaMessage?: string | null;
  templateName?: string | null;
  parameterFormat?: "NAMED" | "POSITIONAL" | null;
  bodyParameterNames?: string[];
  telefonoMascherato?: string | null;
  mediaUrl?: string | null;
};

type SendResponse =
  | {
      ok: true;
      batchId: string;
      totalSelectedCount?: number;
      sentCount: number;
      blockedCount: number;
      errorCount: number;
      failedCount?: number;
      skippedCount?: number;
      results: SendResultRow[];
      failedResults?: SendResultRow[];
      skippedResults?: SendResultRow[];
    }
  | {
      ok: false;
      error: string;
      message?: string;
      detail?: string;
      meta_error?: {
        message?: string | null;
        type?: string | null;
        code?: number | null;
        error_subcode?: number | null;
        fbtrace_id?: string | null;
      } | null;
    };

type MediaUploadResponse = {
  ok: boolean;
  bucket?: string;
  path?: string;
  token?: string;
  signedUrl?: string;
  publicUrl?: string;
  error?: string;
  detail?: string;
};

type UploadedAttachment = {
  publicUrl: string;
  fileName: string;
  mimeType: string;
};

const MAX_IMAGE_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_CUSTOM_MESSAGE_LENGTH = 320;

function serviceLabel(service: ServiceFamily): string {
  switch (service) {
    case "FISSO":
      return "fibra";
    case "MOBILE":
      return "mobile";
    case "ENERGIA":
      return "energia";
    case "TV":
      return "TV";
    case "SMARTPHONE":
      return "smartphone";
    case "ACCESSORI":
      return "accessori";
    case "SICUREZZA":
      return "sicurezza";
    case "FOTOVOLTAICO":
      return "fotovoltaico";
  }

  return "servizio";
}

function buildStandardText(service: ServiceFamily) {
  if (service === "FISSO") {
    return "Ciao {{1}}, abbiamo un'offerta dedicata per te su fibra.\n\nContattaci qui: {{3}}\nOppure vieni in negozio: {{4}}\n\n— PHONESIA";
  }

  if (service === "MOBILE") {
    return "Ciao {{1}}, abbiamo un'offerta dedicata per te su mobile.\n\nContattaci qui: {{3}}\nOppure vieni in negozio: {{4}}\n\n— PHONESIA";
  }

  if (service === "ENERGIA") {
    return "Ciao {{1}}, abbiamo un'offerta dedicata per te su energia.\n\nContattaci qui: {{3}}\nOppure vieni in negozio: {{4}}\n\n— PHONESIA";
  }

  return `Ciao {{1}}, abbiamo un'offerta dedicata per te su ${serviceLabel(service)}.\n\nContattaci qui: {{3}}\nOppure vieni in negozio: {{4}}\n\n— PHONESIA`;
}

function isAllowedImageFile(file: File): boolean {
  if (file.type && file.type.startsWith("image/")) {
    return true;
  }

  return /\.(jpg|jpeg|png|webp)$/i.test(file.name);
}

function isAllowedDocumentFile(file: File): boolean {
  if (file.type) {
    return file.type === "application/pdf";
  }

  return /\.pdf$/i.test(file.name);
}

function formatSendResponseError(data: Extract<SendResponse, { ok: false }>): string {
  const metaError = data.meta_error;

  if (metaError?.message) {
    const details = [
      `Dettaglio: ${metaError.message}`,
      metaError.type ? `type ${metaError.type}` : null,
      metaError.code != null ? `code ${metaError.code}` : null,
      metaError.error_subcode != null ? `subcode ${metaError.error_subcode}` : null,
      metaError.fbtrace_id ? `fbtrace ${metaError.fbtrace_id}` : null,
    ].filter(Boolean);

    return `Meta ha rifiutato il template. ${details.join(" - ")}`;
  }

  return data.message || data.detail || data.error || "Invio batch non riuscito.";
}

function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function uploadFileWithSignedUrl(
  media: MediaUploadResponse,
  file: File,
): Promise<void> {
  if (media.signedUrl) {
    const signedResponse = await fetch(media.signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (signedResponse.ok) {
      return;
    }

    const signedPostResponse = await fetch(media.signedUrl, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (signedPostResponse.ok) {
      return;
    }

    const errorText = await signedPostResponse.text().catch(() => "");
    throw new Error(
      `Upload allegato non riuscito: ${signedPostResponse.status} ${errorText}`,
    );
  }

  if (!media.bucket || !media.path || !media.token) {
    throw new Error("Dati upload allegato incompleti.");
  }

  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { error } = await supabase.storage
      .from(media.bucket)
      .uploadToSignedUrl(media.path, media.token, file);

    if (!error) {
      return;
    }

    throw new Error(`Upload allegato non riuscito: ${error.message}`);
  }

  if (!media.publicUrl) {
    throw new Error("Configurazione upload allegato incompleta.");
  }

  const publicUrl = new URL(media.publicUrl);
  const encodedPath = media.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  const uploadUrl =
    `${publicUrl.origin}/storage/v1/object/upload/sign/` +
    `${encodeURIComponent(media.bucket)}/${encodedPath}` +
    `?token=${encodeURIComponent(media.token)}`;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (uploadResponse.ok) {
    return;
  }

  const uploadPostResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (uploadPostResponse.ok) {
    return;
  }

  const errorText = await uploadPostResponse.text().catch(() => "");
  throw new Error(
    `Upload allegato non riuscito: ${uploadPostResponse.status} ${errorText}`,
  );
}

async function uploadCustomAttachment(
  file: File,
  mode: CustomMessageMode,
): Promise<UploadedAttachment> {
  if (mode === "image") {
    if (!isAllowedImageFile(file)) {
      throw new Error("Carica un allegato compatibile con il template selezionato.");
    }

    if (file.size > MAX_IMAGE_ATTACHMENT_SIZE_BYTES) {
      throw new Error("L’immagine non può superare 5 MB.");
    }
  }

  if (mode === "document") {
    if (!isAllowedDocumentFile(file)) {
      throw new Error("Carica un allegato compatibile con il template selezionato.");
    }

    if (file.size > MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES) {
      throw new Error("Il documento non può superare 10 MB.");
    }
  }

  const fallbackContentType =
    mode === "document" ? "application/pdf" : "image/jpeg";

  const mediaResponse = await fetch("/api/phonesia/media", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || fallbackContentType,
    }),
  });

  const media = (await mediaResponse.json().catch(() => null)) as
    | MediaUploadResponse
    | null;

  if (!mediaResponse.ok || !media?.ok) {
    throw new Error(
      media?.detail ||
        media?.error ||
        "Impossibile preparare il caricamento dell’allegato.",
    );
  }

  if (!media.publicUrl) {
    throw new Error("URL pubblico allegato mancante.");
  }

  await uploadFileWithSignedUrl(media, file);

  return {
    publicUrl: media.publicUrl,
    fileName: file.name,
    mimeType: file.type || fallbackContentType,
  };
}

export default function OpportunityBatchComposer({ recipients }: Props) {
  const [messageMode, setMessageMode] = useState<"standard" | "custom">("standard");
  const [standardService, setStandardService] = useState<ServiceFamily>("SMARTPHONE");
  const [customMessageMode, setCustomMessageMode] = useState<CustomMessageMode>("text");
  const [customMessage, setCustomMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [sendResponse, setSendResponse] = useState<SendResponse | null>(null);

  const eligibleRecipients = useMemo(
    () =>
      recipients.filter(
        (recipient) => recipient.whatsappActive && recipient.marketingConsented,
      ),
    [recipients],
  );

  const blockedRecipients = useMemo(
    () =>
      recipients.filter(
        (recipient) => !recipient.whatsappActive || !recipient.marketingConsented,
      ),
    [recipients],
  );

  const normalizedCustomMessage = sanitizeWhatsAppTemplateText(customMessage);
  const customMessageWasSanitized = customMessage !== normalizedCustomMessage;
  const trimmedCustomMessage = normalizedCustomMessage;

  const previewText =
    messageMode === "standard"
      ? buildStandardText(standardService)
      : trimmedCustomMessage || "Nessun messaggio personalizzato inserito.";

  const canSend =
    recipients.length > 0 &&
    eligibleRecipients.length > 0 &&
    !isSending &&
    (messageMode === "standard" ||
      (trimmedCustomMessage.length > 0 &&
        trimmedCustomMessage.length <= MAX_CUSTOM_MESSAGE_LENGTH &&
        (customMessageMode === "text" || selectedFile !== null)));

  function clearAttachment() {
    setSelectedFile(null);
    setAttachmentInputKey((value) => value + 1);
  }

  function changeCustomMessageMode(mode: CustomMessageMode) {
    setCustomMessageMode(mode);
    clearAttachment();
    setSendResponse(null);
  }

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setSendResponse(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (customMessageMode === "image" && !isAllowedImageFile(file)) {
      clearAttachment();
      setSendResponse({
        ok: false,
        error: "Carica un allegato compatibile con il template selezionato.",
      });
      return;
    }

    if (
      customMessageMode === "image" &&
      file.size > MAX_IMAGE_ATTACHMENT_SIZE_BYTES
    ) {
      clearAttachment();
      setSendResponse({
        ok: false,
        error: "L’immagine non può superare 5 MB.",
      });
      return;
    }

    if (customMessageMode === "document" && !isAllowedDocumentFile(file)) {
      clearAttachment();
      setSendResponse({
        ok: false,
        error: "Carica un allegato compatibile con il template selezionato.",
      });
      return;
    }

    if (
      customMessageMode === "document" &&
      file.size > MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES
    ) {
      clearAttachment();
      setSendResponse({
        ok: false,
        error: "Il documento non può superare 10 MB.",
      });
      return;
    }

    setSelectedFile(file);
  }

  async function handleSendBatch() {
    if (messageMode === "custom" && !trimmedCustomMessage) {
      setSendResponse({
        ok: false,
        error: "Inserisci un messaggio personalizzato.",
      });
      return;
    }

    if (
      messageMode === "custom" &&
      trimmedCustomMessage.length > MAX_CUSTOM_MESSAGE_LENGTH
    ) {
      setSendResponse({
        ok: false,
        error: `Messaggio personalizzato troppo lungo: massimo ${MAX_CUSTOM_MESSAGE_LENGTH} caratteri.`,
      });
      return;
    }

    if (
      messageMode === "custom" &&
      customMessageMode !== "text" &&
      !selectedFile
    ) {
      setSendResponse({
        ok: false,
        error: "Carica un allegato compatibile con il template selezionato.",
      });
      return;
    }

    setIsSending(true);
    setSendResponse(null);

    try {
      const uploadedAttachment =
        messageMode === "custom" && customMessageMode !== "text" && selectedFile
          ? await uploadCustomAttachment(selectedFile, customMessageMode)
          : null;
      const formData = new FormData();

      for (const recipient of recipients) {
        formData.append("clienti", String(recipient.id));
      }

      formData.append("messageMode", messageMode);

      if (messageMode === "standard") {
        formData.append("standardService", standardService);
      } else {
        formData.append("customMessageMode", customMessageMode);
        formData.append("customMessage", customMessage);
        if (uploadedAttachment) {
          formData.append("attachmentPublicUrl", uploadedAttachment.publicUrl);
          formData.append("attachmentFileName", uploadedAttachment.fileName);
          formData.append("attachmentMimeType", uploadedAttachment.mimeType);
        }
      }

      const response = await fetch("/api/phonesia/opportunita/send-batch", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as SendResponse;

      if (!response.ok || !data.ok) {
        setSendResponse(
          data.ok
            ? data
            : {
                ok: false,
                error: data.error || "Invio batch non riuscito.",
                message: formatSendResponseError(data),
                detail: data.detail,
                meta_error: data.meta_error,
              },
        );
        setIsSending(false);
        return;
      }

      setSendResponse(data);
    } catch (error) {
      setSendResponse({
        ok: false,
        error: "Errore imprevisto durante l’invio batch.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Destinatari selezionati</h2>
          <p className="mt-1 text-sm text-slate-600">
            Invia l’opportunità solo ai clienti idonei: consenso marketing attivo e WhatsApp attivo.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Selezionati" value={String(recipients.length)} />
          <StatCard label="Idonei all’invio" value={String(eligibleRecipients.length)} />
          <StatCard label="Bloccati" value={String(blockedRecipients.length)} />
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold">Telefono</th>
                  <th className="px-4 py-3 text-left font-semibold">Negozio</th>
                  <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                  <th className="px-4 py-3 text-left font-semibold">Marketing</th>
                </tr>
              </thead>

              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id} className="border-b border-slate-100">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {recipient.nomeCompleto}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{recipient.telefono || "—"}</td>
                    <td className="px-4 py-4 text-slate-700">{recipient.negozioLabel}</td>
                    <td className="px-4 py-4">
                      <Badge ok={recipient.whatsappActive}>
                        {recipient.whatsappActive ? "Attivo" : "Non attivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge ok={recipient.marketingConsented}>
                        {recipient.marketingConsented ? "Autorizzato" : "Non autorizzato"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Composizione opportunità</h2>
          <p className="mt-1 text-sm text-slate-600">
            Scegli il template Meta approvato da usare per i clienti idonei selezionati.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Tipo messaggio</div>

              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    name="messageMode"
                    checked={messageMode === "standard"}
                    onChange={() => {
                      setMessageMode("standard");
                      clearAttachment();
                    }}
                    className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-950">Template opportunità standard</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Usa il template approvato Meta in base al tipo di opportunità.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    name="messageMode"
                    checked={messageMode === "custom"}
                    onChange={() => setMessageMode("custom")}
                    className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-950">Messaggio personalizzato</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Usa il template Meta dedicato con nome cliente e testo scritto dall’operatore.
                    </div>
                  </div>
                </label>
              </div>
            </section>

            {messageMode === "standard" ? (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Opportunità standard
                </label>

                <select
                  value={standardService}
                  onChange={(event) => setStandardService(event.target.value as ServiceFamily)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
                >
                  {SERVICE_COLUMNS.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </section>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-3 text-sm font-semibold text-slate-900">
                  Template messaggio personalizzato
                </div>

                <div className="mb-4 grid gap-3">
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="radio"
                      name="customMessageMode"
                      checked={customMessageMode === "text"}
                      onChange={() => changeCustomMessageMode("text")}
                      className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div>
                      <div className="font-semibold text-slate-950">
                        Messaggio personalizzato solo testo
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Usa il template senza header media.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="radio"
                      name="customMessageMode"
                      checked={customMessageMode === "image"}
                      onChange={() => changeCustomMessageMode("image")}
                      className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div>
                      <div className="font-semibold text-slate-950">
                        Messaggio personalizzato con immagine
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Usa il template con intestazione immagine.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="radio"
                      name="customMessageMode"
                      checked={customMessageMode === "document"}
                      onChange={() => changeCustomMessageMode("document")}
                      className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                    />
                    <div>
                      <div className="font-semibold text-slate-950">
                        Messaggio personalizzato con documento/PDF
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Usa il template con intestazione documento.
                      </div>
                    </div>
                  </label>
                </div>

                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Messaggio personalizzato
                </label>
                <textarea
                  value={customMessage}
                  onChange={(event) => setCustomMessage(event.target.value)}
                  rows={7}
                  placeholder="Scrivi il messaggio che verrà inserito nel template approvato."
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Verrà inviato tramite template WhatsApp approvato, non come messaggio libero.
                  {" "}
                  {trimmedCustomMessage.length}/{MAX_CUSTOM_MESSAGE_LENGTH} caratteri.
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  WhatsApp non accetta a capo, tab o spazi multipli nei parametri template: il testo verrà normalizzato automaticamente prima dell’invio.
                </p>
                {customMessageWasSanitized && trimmedCustomMessage ? (
                  <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    <div className="font-semibold">Testo normalizzato che verrà inviato</div>
                    <div className="mt-1 text-sm text-amber-950">{trimmedCustomMessage}</div>
                  </div>
                ) : null}
                {!trimmedCustomMessage ? (
                  <p className="mt-2 text-xs font-semibold text-rose-700">
                    Inserisci un messaggio personalizzato.
                  </p>
                ) : null}
                {trimmedCustomMessage.length > MAX_CUSTOM_MESSAGE_LENGTH ? (
                  <p className="mt-2 text-xs font-semibold text-rose-700">
                    Messaggio troppo lungo per l’invio batch sicuro.
                  </p>
                ) : null}
                {customMessageMode !== "text" ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <label className="mb-2 block text-sm font-semibold text-slate-900">
                      {customMessageMode === "image"
                        ? "Immagine da allegare"
                        : "Documento/PDF da allegare"}
                    </label>
                    <input
                      key={attachmentInputKey}
                      type="file"
                      accept={
                        customMessageMode === "image"
                          ? "image/png,image/jpeg,image/webp,image/*"
                          : "application/pdf,.pdf"
                      }
                      onChange={handleAttachmentChange}
                      disabled={isSending}
                      className="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-700 hover:file:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      {customMessageMode === "image"
                        ? "Obbligatoria per questo template. Formati accettati: JPG, PNG o WEBP. Dimensione massima: 5 MB."
                        : "Obbligatorio per questo template. Formato accettato: PDF. Dimensione massima: 10 MB."}
                    </p>
                    {selectedFile ? (
                      <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                        <div className="font-semibold">{selectedFile.name}</div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-rose-700">
                        Carica un allegato compatibile con il template selezionato.
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            )}
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Anteprima template</div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {previewText}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Nell’invio reale il template userà i valori dinamici del cliente e del negozio.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Invio</div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                Verrà inviato:
                <ul className="mt-2 space-y-1.5">
                  <li>
                    •{" "}
                    {messageMode === "standard"
                      ? "template opportunità standard Meta approvato"
                      : customMessageMode === "image"
                        ? "template messaggio personalizzato con immagine"
                        : customMessageMode === "document"
                          ? "template messaggio personalizzato con documento/PDF"
                          : "template messaggio personalizzato solo testo"}
                  </li>
                  {messageMode === "standard" ? (
                    <>
                      <li>• link contatto del negozio</li>
                      <li>• link Google Maps del negozio</li>
                    </>
                  ) : (
                    <>
                      <li>• nome cliente e messaggio scritto dall’operatore</li>
                      {customMessageMode !== "text" ? (
                        <li>• allegato inviato come header del template</li>
                      ) : null}
                    </>
                  )}
                </ul>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={handleSendBatch}
                  className={[
                    "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white transition",
                    canSend
                      ? "bg-orange-500 hover:bg-orange-600"
                      : "cursor-not-allowed bg-orange-300",
                  ].join(" ")}
                >
                  {isSending
                    ? "Invio in corso..."
                    : messageMode === "standard"
                      ? "Invia opportunità ai clienti selezionati"
                      : "Invia messaggio personalizzato"}
                </button>

                <p className="text-xs text-slate-500">
                  I clienti senza consenso marketing o senza WhatsApp attivo verranno saltati automaticamente.
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>

      {sendResponse ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          {sendResponse.ok ? (
            <>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                Invio completato. Batch ID: <strong>{sendResponse.batchId}</strong>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <StatCard
                  label="Selezionati"
                  value={String(sendResponse.totalSelectedCount ?? sendResponse.results.length)}
                />
                <StatCard label="Inviati" value={String(sendResponse.sentCount)} />
                <StatCard
                  label="Falliti"
                  value={String(sendResponse.failedCount ?? sendResponse.errorCount)}
                />
                <StatCard
                  label="Saltati"
                  value={String(sendResponse.skippedCount ?? sendResponse.blockedCount)}
                />
              </div>

              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[800px] w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                        <th className="px-4 py-3 text-left font-semibold">Esito</th>
                        <th className="px-4 py-3 text-left font-semibold">Dettaglio</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sendResponse.results.map((row, index) => (
                        <tr
                          key={`${row.clienteId ?? "unknown"}-${row.status}-${index}`}
                          className="border-b border-slate-100"
                        >
                          <td className="px-4 py-4 font-semibold text-slate-950">{row.nome}</td>
                          <td className="px-4 py-4">
                            <StatusPill status={row.status} />
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            <div>{row.reason}</div>
                            {row.status !== "sent" ? (
                              <div className="mt-1 text-xs text-slate-500">
                                {row.templateName ? `Template ${row.templateName}` : null}
                                {row.parameterFormat ? ` - ${row.parameterFormat}` : null}
                                {row.errorCode != null ? ` - code ${row.errorCode}` : null}
                                {row.fbtraceId ? ` - fbtrace ${row.fbtraceId}` : null}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
              <strong>{sendResponse.error}</strong>
              {!sendResponse.ok && sendResponse.message ? (
                <div className="mt-1">{sendResponse.message}</div>
              ) : null}
              {sendResponse.detail ? <div className="mt-1">{sendResponse.detail}</div> : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Badge({
  ok,
  children,
}: {
  ok: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function StatusPill({
  status,
}: {
  status: "sent" | "failed" | "skipped";
}) {
  const label =
    status === "sent"
      ? "Inviato"
      : status === "skipped"
        ? "Saltato"
        : "Fallito";

  const className =
    status === "sent"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "skipped"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span className={["inline-flex rounded-full border px-3 py-1 text-xs font-semibold", className].join(" ")}>
      {label}
    </span>
  );
}
