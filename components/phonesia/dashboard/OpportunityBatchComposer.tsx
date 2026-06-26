"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  buildPromoKeyFromName,
  normalizePromoName,
} from "@/lib/phonesia/opportunita-promo-history";
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
  sentOpportunityCodes?: string[];
  sentPromoKeys?: string[];
  promoSentToday?: boolean;
  lastPromoSentAt?: string | null;
  lastPromoSentAtLabel?: string | null;
};

type Props = {
  initialPromoName?: string | null;
  promoKeyOverride?: string | null;
  promoLabel?: string | null;
  recipients: Recipient[];
};

type CustomMessageMode = "text" | "image" | "document";
type AttachmentMode = "none" | "image" | "document";

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
  skipped_reason?: string | null;
};

type SendResponse =
  | {
      ok: true;
      dryRun?: false;
      batchId: string;
      promoKey?: string;
      promoName?: string;
      totalSelectedCount?: number;
      sentCount: number;
      blockedCount: number;
      errorCount: number;
      failedCount?: number;
      skippedCount?: number;
      skipped_duplicate_promo?: number;
      results: SendResultRow[];
      failedResults?: SendResultRow[];
      skippedResults?: SendResultRow[];
    }
  | {
      ok: true;
      dryRun: true;
      promoKey: string;
      promoName: string;
      totalSelectedCount: number;
      alreadyContactedCount: number;
      missingMarketingConsentCount: number;
      invalidWhatsappCount: number;
      sentTodayCount: number;
      legacyAlreadySentCount: number;
      sendableCount: number;
      blockedCount: number;
      errorCount: number;
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

type DryRunResponse = Extract<SendResponse, { dryRun: true }>;

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
const MARKETING_MESSAGE_COST_EUR = 0.0522;

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

function isDryRunResponse(data: SendResponse): data is DryRunResponse {
  return data.ok === true && "dryRun" in data && data.dryRun === true;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "dimensione non disponibile";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function OpportunityBatchComposer({
  initialPromoName,
  promoKeyOverride,
  promoLabel,
  recipients,
}: Props) {
  const [promoName, setPromoName] = useState(initialPromoName ?? "");
  const [messageMode, setMessageMode] = useState<"standard" | "custom">(
    promoKeyOverride ? "custom" : "standard",
  );
  const [standardService, setStandardService] = useState<ServiceFamily>("SMARTPHONE");
  const [customMessageMode, setCustomMessageMode] = useState<CustomMessageMode>(
    promoKeyOverride ? "image" : "text",
  );
  const [customMessage, setCustomMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [preflightResponse, setPreflightResponse] = useState<DryRunResponse | null>(
    null,
  );
  const [lastPreflightSignature, setLastPreflightSignature] = useState<string | null>(
    null,
  );
  const [sendResponse, setSendResponse] = useState<SendResponse | null>(null);
  const [excludedDuplicateIds, setExcludedDuplicateIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [onlyMarketingUncontacted, setOnlyMarketingUncontacted] = useState(false);
  const [isRecipientListOpen, setIsRecipientListOpen] = useState(false);

  const normalizedCustomMessage = sanitizeWhatsAppTemplateText(customMessage);
  const customMessageWasSanitized = customMessage !== normalizedCustomMessage;
  const trimmedCustomMessage = normalizedCustomMessage;
  const normalizedPromoName = normalizePromoName(promoName);
  const selectedFileName = selectedFile?.name ?? null;
  const selectedFileSize = selectedFile?.size ?? null;
  const selectedFileType = selectedFile?.type ?? null;
  const selectedFileLastModified = selectedFile?.lastModified ?? null;
  const attachmentMode: AttachmentMode =
    messageMode === "custom" && customMessageMode !== "text"
      ? customMessageMode
      : "none";

  const currentPromoKey = useMemo(() => {
    return promoKeyOverride || buildPromoKeyFromName(normalizedPromoName);
  }, [normalizedPromoName, promoKeyOverride]);

  useEffect(() => {
    setExcludedDuplicateIds(new Set());
  }, [currentPromoKey]);

  const currentPromoSentIds = useMemo(
    () =>
      new Set(
        recipients
          .filter((recipient) => {
            const hasCurrentPromoKey = (recipient.sentPromoKeys ?? []).includes(currentPromoKey);
            const hasLegacyStandardMatch =
              messageMode === "standard" &&
              (recipient.sentOpportunityCodes ?? []).includes(standardService);

            return hasCurrentPromoKey || hasLegacyStandardMatch;
          })
          .map((recipient) => recipient.id),
      ),
    [currentPromoKey, messageMode, recipients, standardService],
  );

  const marketingUncontactedRecipients = useMemo(
    () =>
      recipients.filter(
        (recipient) =>
          recipient.marketingConsented && !currentPromoSentIds.has(recipient.id),
      ),
    [currentPromoSentIds, recipients],
  );

  const visibleRecipients = useMemo(
    () =>
      recipients.filter((recipient) => {
        if (excludedDuplicateIds.has(recipient.id)) return false;
        if (!onlyMarketingUncontacted) return true;

        return (
          recipient.marketingConsented && !currentPromoSentIds.has(recipient.id)
        );
      }),
    [currentPromoSentIds, excludedDuplicateIds, onlyMarketingUncontacted, recipients],
  );

  const eligibleRecipients = useMemo(
    () =>
      visibleRecipients.filter(
        (recipient) =>
          recipient.whatsappActive &&
          recipient.marketingConsented &&
          !recipient.promoSentToday,
      ),
    [visibleRecipients],
  );

  const alreadySentTodayRecipients = useMemo(
    () => visibleRecipients.filter((recipient) => recipient.promoSentToday),
    [visibleRecipients],
  );

  const blockedRecipients = useMemo(
    () =>
      visibleRecipients.filter(
        (recipient) =>
          !recipient.promoSentToday &&
          (!recipient.whatsappActive || !recipient.marketingConsented),
      ),
    [visibleRecipients],
  );

  const duplicatePromoRecipients = useMemo(
    () =>
      eligibleRecipients.filter((recipient) => currentPromoSentIds.has(recipient.id)),
    [currentPromoSentIds, eligibleRecipients],
  );

  const duplicatePromoIds = useMemo(
    () => new Set(duplicatePromoRecipients.map((recipient) => recipient.id)),
    [duplicatePromoRecipients],
  );

  const sendableRecipients = useMemo(
    () => eligibleRecipients.filter((recipient) => !duplicatePromoIds.has(recipient.id)),
    [duplicatePromoIds, eligibleRecipients],
  );

  const excludedBeforeSendCount =
    blockedRecipients.length +
    alreadySentTodayRecipients.length +
    duplicatePromoRecipients.length;
  const estimatedCost = sendableRecipients.length * MARKETING_MESSAGE_COST_EUR;
  const requestSignature = useMemo(
    () =>
      JSON.stringify({
        clienti: visibleRecipients.map((recipient) => recipient.id).sort((a, b) => a - b),
        customMessageMode,
        messageMode,
        promoKeyOverride: promoKeyOverride ?? "",
        promoName: normalizedPromoName,
        selectedFileLastModified,
        selectedFileName,
        selectedFileSize,
        selectedFileType,
        standardService,
        trimmedCustomMessage,
      }),
    [
      customMessageMode,
      messageMode,
      normalizedPromoName,
      promoKeyOverride,
      selectedFileLastModified,
      selectedFileName,
      selectedFileSize,
      selectedFileType,
      standardService,
      trimmedCustomMessage,
      visibleRecipients,
    ],
  );

  const previewText =
    messageMode === "standard"
      ? buildStandardText(standardService)
      : trimmedCustomMessage || "Nessun messaggio personalizzato inserito.";

  const canPreparePayload =
    visibleRecipients.length > 0 &&
    Boolean(currentPromoKey) &&
    normalizedPromoName.length >= 3 &&
    (messageMode === "standard" ||
      (trimmedCustomMessage.length > 0 &&
        trimmedCustomMessage.length <= MAX_CUSTOM_MESSAGE_LENGTH &&
        (customMessageMode === "text" || selectedFile !== null)));
  const preflightIsFresh =
    Boolean(preflightResponse) &&
    lastPreflightSignature === requestSignature &&
    preflightResponse?.promoKey === currentPromoKey;
  const promoKeyMismatchStop =
    Boolean(promoKeyOverride) &&
    Boolean(preflightResponse) &&
    preflightResponse?.promoKey !== promoKeyOverride;
  const canPreflight = canPreparePayload && !isSending && !isPreflighting;
  const canSend =
    canPreparePayload &&
    preflightIsFresh &&
    !promoKeyMismatchStop &&
    (preflightResponse?.sendableCount ?? 0) > 0 &&
    !isSending &&
    !isPreflighting;

  useEffect(() => {
    setPreflightResponse(null);
    setLastPreflightSignature(null);
  }, [requestSignature]);

  function clearAttachment() {
    setSelectedFile(null);
    setAttachmentInputKey((value) => value + 1);
  }

  function changeCustomMessageMode(mode: CustomMessageMode) {
    setCustomMessageMode(mode);
    clearAttachment();
    setSendResponse(null);
  }

  function changeAttachmentMode(mode: AttachmentMode) {
    setSendResponse(null);

    if (mode === "none") {
      if (messageMode === "custom" && customMessageMode !== "text") {
        changeCustomMessageMode("text");
      } else {
        clearAttachment();
      }

      return;
    }

    if (messageMode === "custom" && customMessageMode === mode) {
      return;
    }

    setMessageMode("custom");
    changeCustomMessageMode(mode);
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

  function buildBatchFormData(params: {
    dryRun: boolean;
    uploadedAttachment?: UploadedAttachment | null;
  }) {
    const formData = new FormData();

    for (const recipient of visibleRecipients) {
      formData.append("clienti", String(recipient.id));
    }

    formData.append("messageMode", messageMode);
    formData.append("promoName", normalizedPromoName);

    if (promoKeyOverride) {
      formData.append("promoKeyOverride", promoKeyOverride);
    }

    if (params.dryRun) {
      formData.append("dryRun", "true");
    }

    if (messageMode === "standard") {
      formData.append("standardService", standardService);
    } else {
      formData.append("customMessageMode", customMessageMode);
      formData.append("customMessage", customMessage);

      if (params.uploadedAttachment) {
        formData.append("attachmentPublicUrl", params.uploadedAttachment.publicUrl);
        formData.append("attachmentFileName", params.uploadedAttachment.fileName);
        formData.append("attachmentMimeType", params.uploadedAttachment.mimeType);
      } else if (selectedFile) {
        formData.append("attachmentFileName", selectedFile.name);
        formData.append("attachmentMimeType", selectedFile.type);
      }
    }

    return formData;
  }

  async function handlePreflight() {
    if (!canPreparePayload) {
      setSendResponse({
        ok: false,
        error: "Completa nome promo, destinatari e contenuto prima del preflight.",
      });
      return;
    }

    setIsPreflighting(true);
    setSendResponse(null);
    setPreflightResponse(null);
    setLastPreflightSignature(null);

    try {
      const response = await fetch("/api/phonesia/opportunita/send-batch", {
        method: "POST",
        body: buildBatchFormData({ dryRun: true }),
      });
      const data = (await response.json()) as SendResponse;

      if (!response.ok || !isDryRunResponse(data)) {
        setSendResponse(
          data.ok
            ? {
                ok: false,
                error: "Preflight non riuscito.",
              }
            : {
                ok: false,
                error: data.error || "Preflight non riuscito.",
                message: formatSendResponseError(data),
                detail: data.detail,
                meta_error: data.meta_error,
              },
        );
        return;
      }

      setPreflightResponse(data);
      setLastPreflightSignature(requestSignature);
    } catch (error) {
      setSendResponse({
        ok: false,
        error: "Errore imprevisto durante il preflight.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsPreflighting(false);
    }
  }

  async function handleSendBatch() {
    if (!preflightIsFresh) {
      setSendResponse({
        ok: false,
        error: "Esegui un preflight aggiornato prima dell'invio reale.",
      });
      return;
    }

    if (promoKeyMismatchStop) {
      setSendResponse({
        ok: false,
        error: "STOP: la promo_key finale non coincide con quella selezionata.",
      });
      return;
    }

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

      const response = await fetch("/api/phonesia/opportunita/send-batch", {
        method: "POST",
        body: buildBatchFormData({ dryRun: false, uploadedAttachment }),
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
            Invia l’opportunità solo ai clienti idonei: consenso marketing attivo,
            WhatsApp attivo e nessuna promo già inviata oggi.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Selezionati" value={String(visibleRecipients.length)} />
          <StatCard label="Idonei all’invio" value={String(eligibleRecipients.length)} />
          <StatCard
            label="Già inviati oggi"
            value={String(alreadySentTodayRecipients.length)}
          />
          <StatCard label="Bloccati" value={String(blockedRecipients.length)} />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={onlyMarketingUncontacted}
              onChange={(event) => {
                setOnlyMarketingUncontacted(event.target.checked);
                setSendResponse(null);
              }}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-950">
                Solo clienti marketing non ancora contattati per questa promo
              </span>
              <span className="mt-1 block text-sm text-slate-600">
                Clienti disponibili con questo filtro:{" "}
                <strong className="text-slate-950">
                  {marketingUncontactedRecipients.length}
                </strong>{" "}
                / {recipients.length}
              </span>
            </span>
          </label>
        </div>

        {onlyMarketingUncontacted && visibleRecipients.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            Nessun cliente con consenso marketing risulta non ancora contattato per
            questa promo.
          </div>
        ) : null}

        {duplicatePromoRecipients.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <div className="font-semibold">
              Attenzione: questa promo risulta già inviata a{" "}
              {duplicatePromoRecipients.length} clienti selezionati.
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <CompactStat
                label="Selezionati"
                value={String(visibleRecipients.length)}
              />
              <CompactStat
                label="Già raggiunti"
                value={String(duplicatePromoRecipients.length)}
              />
              <CompactStat
                label="Da inviare"
                value={String(sendableRecipients.length)}
              />
              <CompactStat
                label="Costo stimato"
                value={formatCurrency(estimatedCost)}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setExcludedDuplicateIds(
                  new Set(duplicatePromoRecipients.map((recipient) => recipient.id)),
                )
              }
              className="mt-3 inline-flex items-center justify-center rounded-2xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
            >
              Escludi già raggiunti
            </button>
          </div>
        ) : null}

        <div className="mt-5 rounded-3xl border border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-950">
                Clienti selezionati: {visibleRecipients.length}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                La lista dettagliata è chiusa di default.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsRecipientListOpen((value) => !value)}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {isRecipientListOpen ? "Nascondi elenco ▲" : "Mostra elenco ▼"}
            </button>
          </div>

          {isRecipientListOpen ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-[1040px] w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                      <th className="px-4 py-3 text-left font-semibold">Telefono</th>
                      <th className="px-4 py-3 text-left font-semibold">Negozio</th>
                      <th className="px-4 py-3 text-left font-semibold">WhatsApp</th>
                      <th className="px-4 py-3 text-left font-semibold">Marketing</th>
                      <th className="px-4 py-3 text-left font-semibold">Promo WhatsApp</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visibleRecipients.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-slate-500"
                        >
                          Nessun destinatario disponibile con i filtri selezionati.
                        </td>
                      </tr>
                    ) : (
                      visibleRecipients.map((recipient) => (
                        <tr key={recipient.id} className="border-b border-slate-100">
                          <td className="px-4 py-4 font-semibold text-slate-950">
                            {recipient.nomeCompleto}
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            {recipient.telefono || "—"}
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            {recipient.negozioLabel}
                          </td>
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
                          <td className="px-4 py-4">
                            <PromoStatusBadge
                              recipient={recipient}
                              alreadyReceivedCurrentPromo={currentPromoSentIds.has(recipient.id)}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Composizione opportunità</h2>
          <p className="mt-1 text-sm text-slate-600">
            Scegli il template Meta approvato da usare per i clienti idonei selezionati.
          </p>
        </div>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <label className="mb-2 block text-sm font-semibold text-slate-900">
            Nome promo
          </label>
          <input
            type="text"
            value={promoName}
            onChange={(event) => setPromoName(event.target.value)}
            placeholder="TIM Motorola 6 euro mese"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
          />
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Promo key finale prevista
              </div>
              <div className="mt-1 break-all font-mono text-sm font-semibold text-slate-950">
                {currentPromoKey || "Inserisci un nome promo valido"}
              </div>
            </div>
            {promoKeyOverride ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Chiave storica bloccata
                </div>
                <div className="mt-1 font-semibold">
                  La promo verra registrata con la chiave selezionata.
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                La chiave tecnica nuova viene generata dal nome promo e dal mese corrente,
                non dal testo, template o allegato.
              </div>
            )}
          </div>
          {promoLabel ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-950">Storico selezionato:</span>{" "}
              {promoLabel}
            </div>
          ) : null}
          {normalizedPromoName.length > 0 && normalizedPromoName.length < 3 ? (
            <p className="mt-2 text-xs font-semibold text-rose-700">
              Inserisci un nome promo di almeno 3 caratteri.
            </p>
          ) : null}
        </section>

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

            <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Allegato promo</div>
              <div className="mt-1 text-sm text-slate-600">
                Per inviare una locandina usa il template con immagine; per PDF usa il
                template documento.
              </div>

              <div className="mt-3 grid gap-3">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    name="attachmentMode"
                    checked={attachmentMode === "none"}
                    onChange={() => changeAttachmentMode("none")}
                    className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-950">Nessun allegato</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Invia solo il testo del template selezionato.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    name="attachmentMode"
                    checked={attachmentMode === "image"}
                    onChange={() => changeAttachmentMode("image")}
                    className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-950">Immagine locandina</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Usa il template personalizzato con intestazione immagine.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    name="attachmentMode"
                    checked={attachmentMode === "document"}
                    onChange={() => changeAttachmentMode("document")}
                    className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-950">Documento/PDF</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Usa il template personalizzato con intestazione documento.
                    </div>
                  </div>
                </label>
              </div>

              {attachmentMode !== "none" ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                    {attachmentMode === "image"
                      ? "Immagine da allegare"
                      : "Documento/PDF da allegare"}
                  </label>
                  <input
                    key={attachmentInputKey}
                    type="file"
                    accept={
                      attachmentMode === "image"
                        ? "image/png,image/jpeg,image/webp,image/*"
                        : "application/pdf,.pdf"
                    }
                    onChange={handleAttachmentChange}
                    disabled={isSending || isPreflighting}
                    className="block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-700 hover:file:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {attachmentMode === "image"
                      ? "Obbligatoria per questo template. Formati accettati: JPG, PNG o WEBP. Dimensione massima: 5 MB."
                      : "Obbligatorio per questo template. Formato accettato: PDF. Dimensione massima: 10 MB."}
                  </p>
                  {selectedFile ? (
                    <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                      <div className="font-semibold">{selectedFile.name}</div>
                      <div className="mt-1 text-xs">
                        {selectedFile.type || "tipo file non indicato"} -{" "}
                        {formatFileSize(selectedFile.size)}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-rose-700">
                      Carica un allegato compatibile con il template selezionato.
                    </p>
                  )}
                </div>
              ) : null}
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

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CompactStat
                  label="Clienti selezionati"
                  value={String(visibleRecipients.length)}
                />
                <CompactStat
                  label="Già inviati/esclusi"
                  value={String(excludedBeforeSendCount)}
                />
                <CompactStat
                  label="Già inviati oggi"
                  value={String(alreadySentTodayRecipients.length)}
                />
                <CompactStat
                  label="Da inviare"
                  value={String(sendableRecipients.length)}
                />
                <CompactStat
                  label="Costo stimato"
                  value={formatCurrency(estimatedCost)}
                />
              </div>

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

              {preflightResponse ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950">
                  <div className="font-semibold">Riepilogo preflight</div>
                  <div className="mt-1">
                    Promo: <strong>{preflightResponse.promoName}</strong>
                  </div>
                  <div className="mt-1 break-all font-mono text-xs">
                    Promo key finale: {preflightResponse.promoKey}
                  </div>
                  <div className="mt-1">
                    Allegato:{" "}
                    <strong>
                      {selectedFile
                        ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})`
                        : "nessuno"}
                    </strong>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <CompactStat
                      label="Selezionati"
                      value={String(preflightResponse.totalSelectedCount)}
                    />
                    <CompactStat
                      label="Già contattati"
                      value={String(preflightResponse.alreadyContactedCount)}
                    />
                    <CompactStat
                      label="No marketing"
                      value={String(preflightResponse.missingMarketingConsentCount)}
                    />
                    <CompactStat
                      label="No WhatsApp"
                      value={String(preflightResponse.invalidWhatsappCount)}
                    />
                    <CompactStat
                      label="Già inviati oggi"
                      value={String(preflightResponse.sentTodayCount)}
                    />
                    <CompactStat
                      label="Inviabili"
                      value={String(preflightResponse.sendableCount)}
                    />
                  </div>
                </div>
              ) : null}

              {promoKeyMismatchStop ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-800">
                  STOP: la promo_key finale restituita dal preflight non coincide con quella selezionata.
                </div>
              ) : null}

              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!canPreflight}
                  onClick={handlePreflight}
                  className={[
                    "inline-flex items-center justify-center rounded-2xl border px-5 py-3 text-sm font-semibold transition",
                    canPreflight
                      ? "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100"
                      : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                  ].join(" ")}
                >
                  {isPreflighting ? "Preflight in corso..." : "Esegui preflight"}
                </button>

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
                  Il bottone di invio resta bloccato finche il preflight aggiornato
                  non conferma promo key finale, destinatari inviabili e blocchi server.
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>

      {sendResponse ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          {sendResponse.ok && sendResponse.dryRun ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              Preflight completato. Inviabili effettivi:{" "}
              <strong>{sendResponse.sendableCount}</strong>.
            </div>
          ) : sendResponse.ok ? (
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

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
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

function PromoStatusBadge({
  recipient,
  alreadyReceivedCurrentPromo,
}: {
  recipient: Recipient;
  alreadyReceivedCurrentPromo: boolean;
}) {
  if (recipient.promoSentToday) {
    return (
      <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
        Promo inviata oggi
      </span>
    );
  }

  if (alreadyReceivedCurrentPromo) {
    return (
      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        Già ricevuta questa promo
      </span>
    );
  }

  if (recipient.lastPromoSentAtLabel) {
    return (
      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
        Ultimo invio: {recipient.lastPromoSentAtLabel}
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
      Mai inviato
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
