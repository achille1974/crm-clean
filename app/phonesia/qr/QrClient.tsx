"use client";

import { useSearchParams } from "next/navigation";
import QrForm from "@/components/phonesia/qr/QrForm";

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

  if (Number.isNaN(negozioId)) {
    return (
      <p style={{ padding: 20, fontWeight: 700 }}>
        QR non valido: negozio non valido
      </p>
    );
  }

  return <QrForm negozioId={negozioId} />;
}
