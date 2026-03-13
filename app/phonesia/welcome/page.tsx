import { Suspense } from "react";
import WelcomeClient from "./WelcomeClient";

export default function WelcomePage() {
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>Caricamento...</p>}>
      <WelcomeClient />
    </Suspense>
  );
}
