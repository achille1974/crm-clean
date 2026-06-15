export const CUSTOM_MESSAGE_BODY_PARAMETER_NAMES = [
  "nome_cliente",
  "messaggio",
] as const;

export type CustomTemplateMode = "text" | "image" | "document";

export type CustomTemplateHeaderMedia =
  | {
      kind: "image";
      link: string;
      mimeType?: string | null;
    }
  | {
      kind: "document";
      link: string;
      fileName: string | null;
      mimeType?: string | null;
    };

export function sanitizeWhatsAppTemplateText(value: string): string {
  return String(value ?? "")
    .replace(/[\n\r\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function buildCustomTemplatePayload(params: {
  to: string;
  mode: CustomTemplateMode;
  templateName: string;
  language: string;
  nomeCliente: string;
  messaggio: string;
  mediaUrl?: string | null;
  mediaFilename?: string | null;
  headerMedia?: CustomTemplateHeaderMedia | null;
}): Record<string, unknown> {
  const headerMedia =
    params.headerMedia ??
    (params.mode === "image" && params.mediaUrl
      ? {
          kind: "image" as const,
          link: params.mediaUrl,
        }
      : params.mode === "document" && params.mediaUrl
        ? {
            kind: "document" as const,
            link: params.mediaUrl,
            fileName: params.mediaFilename ?? null,
          }
        : null);
  const components: Array<Record<string, unknown>> = [];
  const nomeCliente = sanitizeWhatsAppTemplateText(params.nomeCliente) || "cliente";
  const messaggio = sanitizeWhatsAppTemplateText(params.messaggio);

  if (!messaggio) {
    throw new Error("Messaggio template custom vuoto.");
  }

  if (params.mode === "text" && headerMedia) {
    throw new Error("Il template custom solo testo non deve avere header media.");
  }

  if (params.mode === "image" && headerMedia?.kind !== "image") {
    throw new Error("Il template custom immagine richiede header image.");
  }

  if (params.mode === "document" && headerMedia?.kind !== "document") {
    throw new Error("Il template custom documento richiede header document.");
  }

  if (headerMedia && !String(headerMedia.link ?? "").trim()) {
    throw new Error("URL media template custom mancante.");
  }

  if (headerMedia?.kind === "image") {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: headerMedia.link,
          },
        },
      ],
    });
  }

  if (headerMedia?.kind === "document") {
    components.push({
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: headerMedia.link,
            ...(headerMedia.fileName ? { filename: headerMedia.fileName } : {}),
          },
        },
      ],
    });
  }

  components.push({
    type: "body",
    parameters: [
      {
        type: "text",
        parameter_name: CUSTOM_MESSAGE_BODY_PARAMETER_NAMES[0],
        text: nomeCliente,
      },
      {
        type: "text",
        parameter_name: CUSTOM_MESSAGE_BODY_PARAMETER_NAMES[1],
        text: messaggio,
      },
    ],
  });

  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: {
        code: params.language,
      },
      components,
    },
  };
}
