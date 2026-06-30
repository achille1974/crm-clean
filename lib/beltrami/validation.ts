export type BeltramiRegistrationData = {
  nome: string;
  cognome: string;
  telefono: string;
  telefono_normalizzato: string;
  email: string | null;
  codice_fiscale: string | null;
  privacy_consent: true;
  whatsapp_consent: true;
  marketing_consent: boolean;
};

export type BeltramiValidationResult =
  | {
      ok: true;
      data: BeltramiRegistrationData;
    }
  | {
      ok: false;
      errors: Record<string, string>;
    };

type RawBeltramiRegistrationInput = {
  nome?: unknown;
  cognome?: unknown;
  telefono?: unknown;
  email?: unknown;
  codice_fiscale?: unknown;
  privacy_consent?: unknown;
  whatsapp_consent?: unknown;
  marketing_consent?: unknown;
};

const ITALIAN_MOBILE_RE = /^3\d{8,9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODICE_FISCALE_RE = /^[A-Z0-9]{11,16}$/;

export function compactSpaces(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUppercaseText(value: unknown): string {
  return compactSpaces(value).toUpperCase();
}

export function normalizeEmail(value: unknown): string | null {
  const email = normalizeUppercaseText(value);
  return email || null;
}

export function normalizeCodiceFiscale(value: unknown): string | null {
  const codiceFiscale = normalizeUppercaseText(value);
  return codiceFiscale || null;
}

export function normalizeItalianWhatsappPhone(value: unknown): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("39") && digits.length > 10) {
    digits = digits.slice(2);
  }

  digits = digits.replace(/^0+(?=3\d{8,})/, "");

  if (!ITALIAN_MOBILE_RE.test(digits)) {
    return null;
  }

  return `+39${digits}`;
}

export function isValidItalianWhatsappPhone(value: unknown): boolean {
  return normalizeItalianWhatsappPhone(value) !== null;
}

export function validateBeltramiRegistration(
  input: RawBeltramiRegistrationInput,
): BeltramiValidationResult {
  const errors: Record<string, string> = {};

  const nome = normalizeUppercaseText(input.nome);
  const cognome = normalizeUppercaseText(input.cognome);
  const telefono = normalizeItalianWhatsappPhone(input.telefono);
  const email = normalizeEmail(input.email);
  const codiceFiscale = normalizeCodiceFiscale(input.codice_fiscale);

  if (!nome) {
    errors.nome = "Il nome e obbligatorio.";
  }

  if (!cognome) {
    errors.cognome = "Il cognome e obbligatorio.";
  }

  if (!telefono) {
    errors.telefono = "Inserisci un numero WhatsApp italiano valido.";
  }

  if (email && !EMAIL_RE.test(email)) {
    errors.email = "Inserisci un indirizzo email valido.";
  }

  if (codiceFiscale && !CODICE_FISCALE_RE.test(codiceFiscale)) {
    errors.codice_fiscale = "Inserisci un codice fiscale valido.";
  }

  if (input.privacy_consent !== true) {
    errors.privacy_consent = "Il consenso privacy e obbligatorio.";
  }

  if (input.whatsapp_consent !== true) {
    errors.whatsapp_consent = "Il consenso WhatsApp e obbligatorio.";
  }

  if (Object.keys(errors).length > 0 || !telefono) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    data: {
      nome,
      cognome,
      telefono,
      telefono_normalizzato: telefono,
      email,
      codice_fiscale: codiceFiscale,
      privacy_consent: true,
      whatsapp_consent: true,
      marketing_consent: input.marketing_consent === true,
    },
  };
}
