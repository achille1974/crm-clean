"use client";

import { useState } from "react";

export default function CopySuggestedMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyText() {
    try {
      setError(null);

      if (!navigator.clipboard) {
        throw new Error("Copia non supportata da questo browser");
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (copyError) {
      console.error("Errore copia messaggio suggerito:", copyError);
      setError(copyError instanceof Error ? copyError.message : "Errore copia");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={copyText}
        className={[
          "rounded-2xl px-4 py-2 text-xs font-black transition",
          copied
            ? "bg-emerald-600 text-white"
            : "bg-orange-500 text-white hover:bg-orange-600",
        ].join(" ")}
      >
        {copied ? "Copiato ✓" : "Copia messaggio"}
      </button>

      {error ? (
        <span className="text-xs font-semibold text-red-600">{error}</span>
      ) : null}
    </div>
  );
}
