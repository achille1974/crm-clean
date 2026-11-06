"use client";
import { useState } from "react";

export default function FeedbackLinkButton({ clienteId }: { clienteId: number }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/phonesia/feedback/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cliente_id: clienteId }) });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error();
      setUrl(result.url); setStatus("Link valido 30 giorni, utilizzabile una volta. Copialo per consegnarlo al cliente.");
    } catch { setStatus("Link non disponibile. Riprova tra poco."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-2">
    <button type="button" disabled={busy} onClick={generate} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">{busy ? "Generazione…" : "Genera link feedback"}</button>
    {status && <p role="status" className="text-sm text-slate-600">{status}</p>}
    {url && <input aria-label="Link feedback da copiare" readOnly value={url} onFocus={e => e.target.select()} className="w-full rounded-lg border border-slate-300 p-2 text-sm" />}
  </div>;
}
