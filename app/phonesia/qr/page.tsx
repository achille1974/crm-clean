"use client";

import { useSearchParams } from "next/navigation";
import QrForm from "@/components/phonesia/qr/QrForm";

export default function PhonesiaQrPage() {
  const params = useSearchParams();
  const negozioId = params.get("negozio");

  return (
    <QrForm negozioId={negozioId ? Number(negozioId) : null} />
  );
}
