"use client";

import { useSearchParams } from "next/navigation";
import QrForm from "@/components/phonesia/qr/QrForm";
import { parseRegistrationSource } from "@/lib/phonesia/ctwa";

export default function QrClient() {
  const searchParams = useSearchParams();
  const negozio = searchParams.get("negozio");

  if (!negozio) {
    return (
      <p style={{ padding: 20, fontWeight: 700 }}>
        QR non valido: negozio mancante
      </p>
    );
  }

  const negozioId = Number(negozio);

  if (!/^[1-5]$/.test(negozio) || !Number.isInteger(negozioId)) {
    return (
      <p style={{ padding: 20, fontWeight: 700 }}>
        QR non valido: negozio non valido
      </p>
    );
  }

  // Origine facoltativa (es. src=ctwa dagli annunci WhatsApp); valori non validi ignorati.
  const src = parseRegistrationSource(searchParams.get("src"));

  return <QrForm negozioId={negozioId} src={src} />;
}
