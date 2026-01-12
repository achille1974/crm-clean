"use client";

import { useSearchParams } from "next/navigation";
import QrForm from "@/components/phonesia/qr/QrForm";

export default function QrPage() {
  const searchParams = useSearchParams();
  const negozio = searchParams.get("negozio");

  if (!negozio) {
    return (
      <p style={{ padding: 20, fontWeight: 700 }}>
        QR non valido: negozio mancante
      </p>
    );
  }

  return <QrForm negozioId={Number(negozio)} />;
}
