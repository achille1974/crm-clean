import type { Metadata } from "next";

import RegistrazioneForm from "@/components/beltrami/RegistrazioneForm";

export const metadata: Metadata = {
  title: "Registrazione cliente | Beltrami 1876",
  description: "Registrazione cliente Beltrami 1876 tramite QR code.",
};

export default function BeltramiRegistrazionePage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 md:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <RegistrazioneForm />
        </section>
      </div>
    </main>
  );
}
