import { Suspense } from "react";
import QrClient from "./QrClient";

export default function QrPage() {
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>Caricamento…</p>}>
      <QrClient />
    </Suspense>
  );
}
