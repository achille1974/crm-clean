export default function PhonesiaAccessDeniedPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-lg items-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-7 text-center shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500 text-2xl font-black text-white">
            !
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Accesso non autorizzato
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Il tuo profilo non ha i permessi necessari per accedere a questa area del CRM.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href="/phonesia/logout"
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Esci
            </a>

            <a
              href="/phonesia/login"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Torna al login
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
