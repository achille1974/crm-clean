"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

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

type SentOpportunity = {
  id: number;
  opportunityCode: string;
  opportunityLabel: string;
  sendMode: string;
  batchId: string;
  message: string;
  attachmentPublicUrl: string;
  attachmentFileName: string;
  negozioContatto: string;
  sentAt: string;
};

type Props = {
  clienteId: number;
  clienteNome: string;
  activeServices: ServiceFamily[];
  whatsappActive: boolean;
  marketingConsented: boolean;
  contactStoreLabel: string;
  sentOpportunities: SentOpportunity[];
};

type SendState =
  | { type: "idle"; message: "" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

type OpportunityRecommendation = {
  service: ServiceFamily;
  reason: string;
  priority: "Alta" | "Media" | "Bassa";
};

type MessageMode = "standard" | "custom";
type CustomMessageMode = "text" | "image" | "document";

type SendApiResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  detail?: string;
  meta_error?: {
    message?: string | null;
    type?: string | null;
    code?: number | null;
    error_subcode?: number | null;
    fbtrace_id?: string | null;
  } | null;
  sentOpportunities?: SentOpportunity[];
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

const PRIORITY_ORDER: Record<OpportunityRecommendation["priority"], number> = {
  Alta: 0,
  Media: 1,
  Bassa: 2,
};

const FALLBACK_ORDER: ServiceFamily[] = [
  "FISSO",
  "MOBILE",
  "ENERGIA",
  "TV",
  "SMARTPHONE",
  "ACCESSORI",
  "SICUREZZA",
  "FOTOVOLTAICO",
];

const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

function normalizeText(value?: string | null): string {
  return String(value ?? "").trim();
}

function normalizeServiceCode(value?: string | null): ServiceFamily | null {
  const normalized = normalizeText(value).toUpperCase();
  return SERVICE_COLUMNS.includes(normalized as ServiceFamily)
    ? (normalized as ServiceFamily)
    : null;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function getCustomMessageModeLabel(mode: CustomMessageMode): string {
  if (mode === "image") return "Messaggio personalizzato con immagine";
  if (mode === "document") return "Messaggio personalizzato con documento/PDF";
  return "Messaggio personalizzato solo testo";
}

function getCustomMessageTemplateName(mode: CustomMessageMode): string {
  if (mode === "image") return "phonesia_messaggio_personalizzato_media_v1";
  if (mode === "document") return "phonesia_messaggio_personalizzato_documento_v1";
  return "phonesia_messaggio_personalizzato_v1";
}

function formatSendApiError(data: SendApiResponse): string {
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

  return (
    data.message ||
    data.detail ||
    "Invio non riuscito. Controlla consenso marketing e WhatsApp attivo."
  );
}

function mergeSentOpportunities(
  current: SentOpportunity[],
  incoming: SentOpportunity[],
): SentOpportunity[] {
  const map = new Map<string, SentOpportunity>();

  for (const item of [...current, ...incoming]) {
    const key = String(item.id);
    map.set(key, item);
  }

  return [...map.values()].sort((a, b) => {
    const aTime = new Date(a.sentAt).getTime();
    const bTime = new Date(b.sentAt).getTime();
    return bTime - aTime;
  });
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
      `Upload locandina non riuscito: ${signedPostResponse.status} ${errorText}`,
    );
  }

  if (!media.bucket || !media.path || !media.token) {
    throw new Error("Dati upload locandina incompleti.");
  }

  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { error } = await supabase.storage
      .from(media.bucket)
      .uploadToSignedUrl(media.path, media.token, file);

    if (!error) {
      return;
    }

    throw new Error(`Upload locandina non riuscito: ${error.message}`);
  }

  if (!media.publicUrl) {
    throw new Error("Configurazione upload locandina incompleta.");
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
    `Upload locandina non riuscito: ${uploadPostResponse.status} ${errorText}`,
  );
}

async function uploadOpportunityAttachment(
  file: File,
  kind: "image" | "document" = "image",
): Promise<UploadedAttachment> {
  if (kind === "image") {
    if (!isAllowedImageFile(file)) {
      throw new Error("La locandina deve essere un’immagine JPG, PNG o WEBP.");
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error("La locandina non può superare 5 MB.");
    }
  }

  if (kind === "document") {
    if (!isAllowedDocumentFile(file)) {
      throw new Error("Carica un allegato compatibile con il template selezionato.");
    }

    if (file.size > MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES) {
      throw new Error("Il documento non può superare 10 MB.");
    }
  }

  const fallbackContentType = kind === "document" ? "application/pdf" : "image/jpeg";

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
        "Impossibile preparare il caricamento della locandina.",
    );
  }

  if (!media.publicUrl) {
    throw new Error("URL pubblico locandina mancante.");
  }

  await uploadFileWithSignedUrl(media, file);

  return {
    publicUrl: media.publicUrl,
    fileName: file.name,
    mimeType: file.type || fallbackContentType,
  };
}

function buildOpportunityRecommendations(
  activeServices: ServiceFamily[],
): OpportunityRecommendation[] {
  const activeSet = new Set<ServiceFamily>(activeServices);
  const recommendations: OpportunityRecommendation[] = [];

  function add(
    service: ServiceFamily,
    reason: string,
    priority: OpportunityRecommendation["priority"],
  ) {
    if (activeSet.has(service)) return;
    if (recommendations.some((item) => item.service === service)) return;

    recommendations.push({
      service,
      reason,
      priority,
    });
  }

  const hasMobile = activeSet.has("MOBILE");
  const hasFisso = activeSet.has("FISSO");
  const hasEnergia = activeSet.has("ENERGIA");
  const hasTv = activeSet.has("TV");
  const hasSmartphone = activeSet.has("SMARTPHONE");
  const hasAccessori = activeSet.has("ACCESSORI");
  const hasSicurezza = activeSet.has("SICUREZZA");
  const hasFotovoltaico = activeSet.has("FOTOVOLTAICO");

  if (hasMobile && !hasFisso) {
    add("FISSO", "Ha già il mobile: buona occasione per proporre fibra o linea casa.", "Alta");
  }

  if (hasFisso && !hasMobile) {
    add("MOBILE", "Ha già il fisso: si può completare l’offerta con una linea mobile.", "Alta");
  }

  if ((hasMobile || hasFisso) && !hasEnergia) {
    add(
      "ENERGIA",
      "Ha già un servizio TLC attivo: è un buon profilo per una proposta energia.",
      "Alta",
    );
  }

  if (hasFisso && !hasTv) {
    add("TV", "Con il fisso attivo si può proporre una soluzione TV collegata alla casa.", "Media");
  }

  if (hasMobile && !hasSmartphone) {
    add(
      "SMARTPHONE",
      "Ha una linea mobile attiva: si può proporre anche cambio telefono o nuovo device.",
      "Media",
    );
  }

  if (hasSmartphone && !hasAccessori) {
    add(
      "ACCESSORI",
      "Ha già acquistato o usa uno smartphone: è un cross-sell naturale per accessori.",
      "Media",
    );
  }

  if ((hasFisso || hasEnergia) && !hasSicurezza) {
    add(
      "SICUREZZA",
      "Chi ha casa, linea fissa o energia è un buon candidato per soluzioni sicurezza.",
      "Media",
    );
  }

  if (hasEnergia && !hasFotovoltaico) {
    add(
      "FOTOVOLTAICO",
      "Ha già l’energia attiva: è il profilo più coerente per una proposta fotovoltaico.",
      "Alta",
    );
  }

  if (hasSmartphone && !hasMobile) {
    add(
      "MOBILE",
      "Ha uno smartphone ma non risulta una linea mobile attiva: opportunità molto forte.",
      "Alta",
    );
  }

  if (hasAccessori && !hasSmartphone) {
    add(
      "SMARTPHONE",
      "Ha accessori ma non risulta uno smartphone attivo: possibile vendita device.",
      "Media",
    );
  }

  if (activeSet.size === 0) {
    add("MOBILE", "Cliente senza servizi attivi registrati: proposta base ad alta priorità.", "Alta");
    add("FISSO", "Cliente senza servizi attivi registrati: proposta casa/fibra da testare.", "Alta");
    add("ENERGIA", "Cliente senza servizi attivi registrati: proposta energia da valutare.", "Media");
  }

  for (const service of FALLBACK_ORDER) {
    add(service, "Servizio non attivo: proposta commerciale disponibile.", "Bassa");
  }

  return recommendations.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    return FALLBACK_ORDER.indexOf(a.service) - FALLBACK_ORDER.indexOf(b.service);
  });
}

export default function ClienteOpportunityPanel({
  clienteId,
  clienteNome,
  activeServices,
  whatsappActive,
  marketingConsented,
  contactStoreLabel,
  sentOpportunities,
}: Props) {
  const [messageMode, setMessageMode] = useState<MessageMode>("standard");
  const [customMessageMode, setCustomMessageMode] = useState<CustomMessageMode>("text");
  const [selectedServices, setSelectedServices] = useState<ServiceFamily[]>([]);
  const [customMessage, setCustomMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendState, setSendState] = useState<SendState>({
    type: "idle",
    message: "",
  });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentInputKey, setAttachmentInputKey] = useState(0);
  const [history, setHistory] = useState<SentOpportunity[]>(
    [...sentOpportunities].sort((a, b) => {
      const aTime = new Date(a.sentAt).getTime();
      const bTime = new Date(b.sentAt).getTime();
      return bTime - aTime;
    }),
  );

  const recommendations = useMemo(
    () => buildOpportunityRecommendations(activeServices),
    [activeServices],
  );

  const latestSentByService = useMemo(() => {
    const map = new Map<ServiceFamily, SentOpportunity>();

    for (const item of history) {
      const service = normalizeServiceCode(item.opportunityCode);
      if (!service) continue;
      if (!map.has(service)) {
        map.set(service, item);
      }
    }

    return map;
  }, [history]);

  const sentServicesCount = latestSentByService.size;
  const lastSent = history[0] ?? null;
  const trimmedCustomMessage = customMessage.trim();

  const canAttemptSend =
    messageMode === "standard"
      ? selectedServices.length > 0
      : trimmedCustomMessage.length > 0 &&
        (customMessageMode === "text" || attachmentFile !== null);
  const canReallySend = canAttemptSend && whatsappActive && marketingConsented && !isSending;

  function changeMessageMode(mode: MessageMode) {
    setSendState({ type: "idle", message: "" });
    setMessageMode(mode);

    if (mode === "custom") {
      clearAttachment();
    }
  }

  function changeCustomMessageMode(mode: CustomMessageMode) {
    setSendState({ type: "idle", message: "" });
    setCustomMessageMode(mode);
    clearAttachment();
  }

  function toggleService(service: ServiceFamily) {
    if (latestSentByService.has(service)) return;

    setSendState({ type: "idle", message: "" });

    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((item) => item !== service)
        : [...prev, service],
    );
  }

  function clearAttachment() {
    setAttachmentFile(null);
    setAttachmentInputKey((value) => value + 1);
  }

  function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const attachmentKind =
      messageMode === "custom" && customMessageMode === "document"
        ? "document"
        : "image";

    setSendState({ type: "idle", message: "" });

    if (!file) {
      setAttachmentFile(null);
      return;
    }

    if (attachmentKind === "image" && !isAllowedImageFile(file)) {
      setAttachmentFile(null);
      setAttachmentInputKey((value) => value + 1);
      setSendState({
        type: "error",
        message:
          messageMode === "standard"
            ? "La locandina deve essere un’immagine JPG, PNG o WEBP."
            : "Carica un allegato compatibile con il template selezionato.",
      });
      return;
    }

    if (attachmentKind === "document" && !isAllowedDocumentFile(file)) {
      setAttachmentFile(null);
      setAttachmentInputKey((value) => value + 1);
      setSendState({
        type: "error",
        message: "Carica un allegato compatibile con il template selezionato.",
      });
      return;
    }

    const maxSize =
      attachmentKind === "document"
        ? MAX_DOCUMENT_ATTACHMENT_SIZE_BYTES
        : MAX_ATTACHMENT_SIZE_BYTES;

    if (file.size > maxSize) {
      setAttachmentFile(null);
      setAttachmentInputKey((value) => value + 1);
      setSendState({
          type: "error",
          message:
          attachmentKind === "document"
            ? "Il documento non può superare 10 MB."
            : "La locandina non può superare 5 MB.",
      });
      return;
    }

    setAttachmentFile(file);
  }

  async function handleConfirmSend() {
    if (messageMode === "custom" && !trimmedCustomMessage) {
      setSendState({
        type: "error",
        message: "Inserisci un messaggio personalizzato.",
      });
      setConfirmOpen(false);
      return;
    }

    if (
      messageMode === "custom" &&
      customMessageMode !== "text" &&
      !attachmentFile
    ) {
      setSendState({
        type: "error",
        message: "Carica un allegato compatibile con il template selezionato.",
      });
      setConfirmOpen(false);
      return;
    }

    setIsSending(true);
    setSendState({ type: "idle", message: "" });

    try {
      const uploadedAttachment =
        attachmentFile &&
        (messageMode === "standard" ||
          (messageMode === "custom" && customMessageMode !== "text"))
          ? await uploadOpportunityAttachment(
              attachmentFile,
              messageMode === "custom" && customMessageMode === "document"
                ? "document"
                : "image",
            )
          : null;

      const response = await fetch("/api/phonesia/opportunita/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clienteId,
          messageMode,
          customMessageMode: messageMode === "custom" ? customMessageMode : null,
          services: messageMode === "standard" ? selectedServices : [],
          customMessage: messageMode === "custom" ? trimmedCustomMessage : null,
          attachmentPublicUrl: uploadedAttachment?.publicUrl ?? null,
          attachmentFileName: uploadedAttachment?.fileName ?? null,
          attachmentMimeType: uploadedAttachment?.mimeType ?? null,
        }),
      });

      const data = (await response.json()) as SendApiResponse;

      if (!response.ok || !data.ok) {
        setSendState({
          type: "error",
          message: formatSendApiError(data),
        });
        return;
      }

      const newSentOpportunities: SentOpportunity[] = Array.isArray(data.sentOpportunities)
        ? data.sentOpportunities
        : [];

      if (newSentOpportunities.length > 0) {
        setHistory((prev) => mergeSentOpportunities(prev, newSentOpportunities));
      }

      setSendState({
        type: "success",
        message: data.message || "Messaggio inviato correttamente.",
      });
      setSelectedServices([]);
      setCustomMessage("");
      clearAttachment();
      setConfirmOpen(false);
    } catch (error) {
      setSendState({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Errore imprevisto durante l’invio del messaggio.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Messaggio da inviare</h2>
          <p className="mt-1 text-sm text-slate-600">
            Scegli se inviare un’opportunità standard o un messaggio personalizzato tramite template Meta approvato.
          </p>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <StatusCard
            label="Consenso marketing"
            ok={marketingConsented}
            okText="Autorizzato"
            koText="Non autorizzato"
          />
          <StatusCard
            label="WhatsApp cliente"
            ok={whatsappActive}
            okText="Attivo"
            koText="Non attivo"
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">Negozio messaggio</div>
            <div className="mt-2 text-base font-bold text-slate-950">
              {contactStoreLabel}
            </div>
          </div>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Opportunità inviate" value={String(sentServicesCount)} />
          <SummaryCard
            label="Ultimo invio"
            value={lastSent ? formatDateTime(lastSent.sentAt) : "—"}
          />
          <SummaryCard
            label="Ultima opportunità"
            value={lastSent ? (lastSent.opportunityLabel || lastSent.opportunityCode || "—") : "—"}
          />
          <SummaryCard
            label="Ultimo negozio usato"
            value={lastSent?.negozioContatto || "—"}
          />
        </div>

        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-sm font-semibold text-slate-900">Tipo messaggio</div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <input
                type="radio"
                name="singleMessageMode"
                checked={messageMode === "standard"}
                onChange={() => changeMessageMode("standard")}
                className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <div className="font-semibold text-slate-950">
                  Template opportunità standard
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Usa il template opportunità approvato con servizi e negozio.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <input
                type="radio"
                name="singleMessageMode"
                checked={messageMode === "custom"}
                onChange={() => changeMessageMode("custom")}
                className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <div>
                <div className="font-semibold text-slate-950">Messaggio personalizzato</div>
                <div className="mt-1 text-sm text-slate-600">
                  Usa il template dedicato con nome cliente e testo scritto dall’operatore.
                </div>
              </div>
            </label>
          </div>
        </div>

        {messageMode === "standard" ? (
          recommendations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Questo cliente ha già tutti i servizi presenti nella matrice.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {recommendations.map((item) => {
                const isSelected = selectedServices.includes(item.service);
                const alreadySent = latestSentByService.get(item.service) ?? null;

                return (
                  <label
                    key={item.service}
                    className={[
                      "flex items-start gap-3 rounded-2xl border p-4 transition",
                      alreadySent
                        ? "cursor-not-allowed border-emerald-200 bg-emerald-50/60"
                        : isSelected
                          ? "cursor-pointer border-orange-300 bg-orange-50"
                          : "cursor-pointer border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={Boolean(alreadySent)}
                      onChange={() => toggleService(item.service)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-950">{item.service}</div>

                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                            item.priority === "Alta"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : item.priority === "Media"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-50 text-slate-600",
                          ].join(" ")}
                        >
                          Priorità {item.priority}
                        </span>

                        {alreadySent && (
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                            Inviata
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-slate-600">
                        {item.reason}
                      </div>

                      {alreadySent && (
                        <div className="mt-2 text-xs font-medium text-sky-700">
                          Già inviata il {formatDateTime(alreadySent.sentAt)}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )
        ) : null}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-sm font-semibold text-slate-900">
            {messageMode === "standard" ? "Servizi selezionati" : "Messaggio personalizzato"}
          </div>

          {messageMode === "standard" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedServices.length > 0 ? (
                selectedServices.map((service) => (
                  <span
                    key={service}
                    className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700"
                  >
                    {service}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">Nessun servizio selezionato.</span>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {(["text", "image", "document"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={[
                      "flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 transition",
                      customMessageMode === mode
                        ? "border-orange-300 bg-orange-50"
                        : "border-slate-200 hover:border-orange-200",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="singleCustomMessageMode"
                      checked={customMessageMode === mode}
                      onChange={() => changeCustomMessageMode(mode)}
                      disabled={isSending}
                      className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-950">
                        {getCustomMessageModeLabel(mode)}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {mode === "text"
                          ? "Template senza allegati."
                          : mode === "image"
                            ? "Template con intestazione immagine."
                            : "Template con intestazione documento."}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <textarea
                value={customMessage}
                onChange={(event) => {
                  setSendState({ type: "idle", message: "" });
                  setCustomMessage(event.target.value);
                }}
                rows={6}
                placeholder="Scrivi il messaggio che verrà inserito nel template approvato."
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              />
              <p className="mt-2 text-xs text-slate-500">
                Il testo viene inviato dentro il template Meta approvato, non come messaggio libero.
              </p>
              {!trimmedCustomMessage ? (
                <p className="mt-2 text-xs font-semibold text-rose-700">
                  Inserisci un messaggio personalizzato.
                </p>
              ) : null}

              {customMessageMode !== "text" ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-sm font-semibold text-slate-900">
                    {customMessageMode === "image"
                      ? "Immagine da allegare"
                      : "Documento/PDF da allegare"}
                  </div>

                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {customMessageMode === "image"
                      ? "Obbligatoria per questo template. Formati accettati: JPG, PNG o WEBP. Dimensione massima: 5 MB."
                      : "Obbligatorio per questo template. Formato accettato: PDF. Dimensione massima: 10 MB."}
                  </p>

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
                    className="mt-3 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-700 hover:file:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                  />

                  {attachmentFile ? (
                    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-semibold">{attachmentFile.name}</div>
                        <div className="mt-0.5 text-xs text-orange-800">
                          {attachmentFile.type ||
                            (customMessageMode === "image" ? "immagine" : "documento")}{" "}
                          • {formatFileSize(attachmentFile.size)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={clearAttachment}
                        disabled={isSending}
                        className="inline-flex items-center justify-center rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Rimuovi allegato
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-semibold text-rose-700">
                      Carica un allegato compatibile con il template selezionato.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Gli allegati richiedono un template Meta con intestazione immagine o documento.
                </p>
              )}
            </div>
          )}

          {messageMode === "standard" ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <div className="text-sm font-semibold text-slate-900">
              Locandina da allegare
            </div>

            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Opzionale. Se carichi una locandina, verrà usato il template WhatsApp con immagine.
              Formati consigliati: JPG, PNG o WEBP. Dimensione massima: 5 MB.
            </p>

            <input
              key={attachmentInputKey}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/*"
              onChange={handleAttachmentChange}
              disabled={isSending}
              className="mt-3 block w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-700 hover:file:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
            />

            {attachmentFile && (
              <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold">{attachmentFile.name}</div>
                  <div className="mt-0.5 text-xs text-orange-800">
                    {attachmentFile.type || "immagine"} • {formatFileSize(attachmentFile.size)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={clearAttachment}
                  disabled={isSending}
                  className="inline-flex items-center justify-center rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Rimuovi locandina
                </button>
              </div>
            )}
            </div>
          ) : null}

          {sendState.type !== "idle" && (
            <div
              className={[
                "mt-4 rounded-2xl border px-4 py-3 text-sm",
                sendState.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              {sendState.message}
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              disabled={!canAttemptSend}
              onClick={() => setConfirmOpen(true)}
              className={[
                "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white transition",
                canAttemptSend
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "cursor-not-allowed bg-orange-300",
              ].join(" ")}
            >
              {messageMode === "standard" ? "Invia messaggio" : "Invia messaggio personalizzato"}
            </button>

            <p className="mt-2 text-xs text-slate-500">
              Il messaggio verrà inviato solo se il cliente ha consenso marketing e WhatsApp attivo.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Storico opportunità inviate
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Così eviti di proporre di nuovo la stessa opportunità allo stesso cliente.
              </div>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
              Nessuna opportunità inviata a questo cliente.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {history.map((item) => {
                const serviceCode = normalizeServiceCode(item.opportunityCode);

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-slate-950">
                            {item.opportunityLabel || item.opportunityCode || "Opportunità"}
                          </div>

                          {serviceCode && (
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">
                              {serviceCode}
                            </span>
                          )}

                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                            {item.sendMode || "standard"}
                          </span>
                        </div>

                        <div className="mt-2 text-sm text-slate-600">
                          Inviata il <strong className="text-slate-900">{formatDateTime(item.sentAt)}</strong>
                          {item.negozioContatto ? (
                            <>
                              {" "}• negozio messaggio{" "}
                              <strong className="text-slate-900">{item.negozioContatto}</strong>
                            </>
                          ) : null}
                        </div>

                        {item.attachmentFileName && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>Allegato: {item.attachmentFileName}</span>
                            {item.attachmentPublicUrl ? (
                              <a
                                href={item.attachmentPublicUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                              >
                                Apri locandina
                              </a>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.25)]">
            <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
              Conferma invio
            </div>

            <h3 className="text-2xl font-black tracking-tight text-slate-950">
              Confermi l’invio del messaggio?
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Cliente: <strong className="text-slate-950">{clienteNome}</strong>
            </p>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-900">
                {messageMode === "standard" ? "Servizi selezionati" : "Messaggio personalizzato"}
              </div>

              {messageMode === "standard" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedServices.map((service) => (
                    <span
                      key={service}
                      className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700"
                    >
                      {service}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700">
                  {trimmedCustomMessage}
                </div>
              )}

              <ul className="mt-4 space-y-1.5">
                <li>
                  • Consenso marketing:{" "}
                  <strong className={marketingConsented ? "text-emerald-700" : "text-rose-700"}>
                    {marketingConsented ? "ok" : "mancante"}
                  </strong>
                </li>
                <li>
                  • WhatsApp attivo:{" "}
                  <strong className={whatsappActive ? "text-emerald-700" : "text-rose-700"}>
                    {whatsappActive ? "ok" : "non attivo"}
                  </strong>
                </li>
                <li>
                  • Negozio usato nel messaggio:{" "}
                  <strong className="text-slate-950">{contactStoreLabel}</strong>
                </li>
                <li>
                  • Template:{" "}
                  <strong className="text-slate-950">
                    {messageMode === "standard"
                      ? "opportunità standard"
                      : getCustomMessageModeLabel(customMessageMode)}
                  </strong>
                </li>
                {messageMode === "standard" ? (
                  <li>
                    • Locandina:{" "}
                    <strong className={attachmentFile ? "text-emerald-700" : "text-slate-700"}>
                      {attachmentFile ? attachmentFile.name : "nessuna"}
                    </strong>
                  </li>
                ) : customMessageMode !== "text" ? (
                  <li>
                    • Allegato template:{" "}
                    <strong className={attachmentFile ? "text-emerald-700" : "text-rose-700"}>
                      {attachmentFile ? attachmentFile.name : "mancante"}
                    </strong>
                  </li>
                ) : null}
              </ul>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nota invio
                </div>
                <div className="text-sm text-slate-700">
                  {messageMode === "custom"
                    ? customMessageMode === "text"
                      ? `Verrà usato il template WhatsApp ${getCustomMessageTemplateName(customMessageMode)} con nome cliente e messaggio personalizzato.`
                      : `Verrà caricato l’allegato e poi inviato il template WhatsApp ${getCustomMessageTemplateName(customMessageMode)} con header ${
                          customMessageMode === "image" ? "immagine" : "documento"
                        }.`
                    : attachmentFile
                      ? "Verrà caricato il file e poi inviato il template WhatsApp con locandina."
                      : "Verrà usato il template marketing approvato di WhatsApp con i dati dinamici del cliente e del negozio."}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isSending}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annulla
              </button>

              <button
                type="button"
                disabled={!canReallySend}
                onClick={handleConfirmSend}
                className={[
                  "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white transition",
                  canReallySend
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "cursor-not-allowed bg-orange-300",
                ].join(" ")}
              >
                {isSending
                  ? attachmentFile
                    ? "Caricamento e invio..."
                    : "Invio in corso..."
                  : messageMode === "standard"
                    ? "Conferma e invia"
                    : "Conferma e invia messaggio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusCard({
  label,
  ok,
  okText,
  koText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  koText: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={[
          "mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
          ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700",
        ].join(" ")}
      >
        {ok ? okText : koText}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-base font-bold text-slate-950">{value}</div>
    </div>
  );
}
