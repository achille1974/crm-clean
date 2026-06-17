"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

import { BELTRAMI_SERVICES } from "@/lib/beltrami/services";
import { validateBeltramiRegistration } from "@/lib/beltrami/validation";

type SubmitState =
  | {
      type: "idle";
      message: null;
      errors?: undefined;
    }
  | {
      type: "error";
      message: string;
      errors?: Record<string, string>;
    };

const INITIAL_STATE: SubmitState = {
  type: "idle",
  message: null,
};

export default function RegistrazioneForm() {
  const router = useRouter();
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<SubmitState>(INITIAL_STATE);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const payload = {
      nome: formData.get("nome"),
      cognome: formData.get("cognome"),
      telefono: formData.get("telefono"),
      email: formData.get("email"),
      codice_fiscale: formData.get("codice_fiscale"),
      servizio_interesse: formData.get("servizio_interesse"),
      note: formData.get("note"),
      privacy_consent: privacyConsent,
      whatsapp_consent: whatsappConsent,
    };

    const validation = validateBeltramiRegistration(payload);

    if (!validation.ok) {
      setState({
        type: "error",
        message: "Controlla i campi evidenziati e riprova.",
        errors: validation.errors,
      });
      return;
    }

    setLoading(true);
    setState(INITIAL_STATE);

    try {
      const response = await fetch("/api/beltrami/clienti", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok === false) {
        setState({
          type: "error",
          message:
            result?.message ||
            "Non e stato possibile completare la registrazione. Riprova piu tardi.",
          errors: result?.errors,
        });
        return;
      }

      router.push("/beltrami/grazie");
    } catch {
      setState({
        type: "error",
        message: "Errore di rete. Riprova tra qualche minuto.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex justify-center">
        <Image
          src="/supreme/biglietto/logo.jpg"
          alt="Beltrami 1876"
          width={220}
          height={100}
          priority
          className="h-auto w-[180px]"
        />
      </div>

      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Registrazione cliente
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
          Beltrami 1876
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Lascia i tuoi dati per essere ricontattato su WhatsApp per servizi,
          pratiche e scadenze.
        </p>
      </div>

      {state.type === "error" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Nome"
          name="nome"
          autoComplete="given-name"
          required
          error={state.errors?.nome}
        />
        <TextField
          label="Cognome"
          name="cognome"
          autoComplete="family-name"
          required
          error={state.errors?.cognome}
        />
      </div>

      <TextField
        label="Telefono WhatsApp"
        name="telefono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="Es. 3471234567"
        required
        error={state.errors?.telefono}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={state.errors?.email}
        />
        <TextField
          label="Codice fiscale"
          name="codice_fiscale"
          autoComplete="off"
          uppercase
          error={state.errors?.codice_fiscale}
        />
      </div>

      <div>
        <label htmlFor="servizio_interesse" className="mb-2 block text-sm font-semibold text-slate-700">
          Servizio di interesse
        </label>
        <select
          id="servizio_interesse"
          name="servizio_interesse"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          defaultValue=""
        >
          <option value="">Seleziona un servizio</option>
          {BELTRAMI_SERVICES.map((service) => (
            <option key={service} value={service}>
              {service}
            </option>
          ))}
        </select>
        {state.errors?.servizio_interesse ? (
          <p className="mt-2 text-xs font-semibold text-red-600">
            {state.errors.servizio_interesse}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="note" className="mb-2 block text-sm font-semibold text-slate-700">
          Note
        </label>
        <textarea
          id="note"
          name="note"
          rows={4}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="Esigenza, scadenza nota o informazioni utili"
        />
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <ConsentCheckbox
          checked={privacyConsent}
          onChange={setPrivacyConsent}
          title="Confermo di aver letto l'informativa privacy"
          error={state.errors?.privacy_consent}
        >
          Autorizzo il trattamento dei miei dati per la registrazione e la
          gestione delle richieste presso Beltrami 1876.{" "}
          <a
            href="/beltrami/privacy"
            target="_blank"
            rel="noreferrer"
            className="font-bold text-emerald-700 underline underline-offset-4"
          >
            Informativa privacy
          </a>
        </ConsentCheckbox>

        <ConsentCheckbox
          checked={whatsappConsent}
          onChange={setWhatsappConsent}
          title="Autorizzo il contatto WhatsApp"
          error={state.errors?.whatsapp_consent}
        >
          Beltrami 1876 potra contattarmi su WhatsApp per comunicazioni legate
          ai servizi richiesti, alle pratiche e alle relative scadenze.
        </ConsentCheckbox>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-emerald-700 px-5 py-3.5 text-sm font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
      >
        {loading ? "Invio in corso..." : "Completa registrazione"}
      </button>
    </form>
  );
}

function TextField({
  label,
  name,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  required = false,
  uppercase = false,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  uppercase?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        onInput={(event) => {
          if (uppercase) {
            event.currentTarget.value = event.currentTarget.value.toUpperCase();
          }
        }}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
      />
      {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
    </div>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  title,
  error,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
      />
      <span className="text-sm leading-relaxed text-slate-700">
        <span className="block font-bold text-slate-950">{title}</span>
        <span className="mt-1 block">{children}</span>
        {error ? <span className="mt-2 block font-semibold text-red-600">{error}</span> : null}
      </span>
    </label>
  );
}
