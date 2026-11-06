"use client";

export default function DashboardError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-3xl p-8" role="alert">
    <h1 className="text-2xl font-bold">Dati temporaneamente non disponibili</h1>
    <p className="my-4">La lettura non è stata completata. Riprova per ottenere conteggi e informazioni aggiornati.</p>
    <button onClick={reset} className="rounded-xl bg-orange-600 px-4 py-2 font-bold text-white">Riprova</button>
  </main>;
}
