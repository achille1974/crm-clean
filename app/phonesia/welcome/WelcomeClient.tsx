"use client";

import { useSearchParams } from "next/navigation";

export default function WelcomeClient() {

  const searchParams = useSearchParams();

  const id = searchParams.get("id");

  if (!id) {
    return (
      <p style={{ padding: 20 }}>
        Cliente non valido
      </p>
    );
  }

  return (

    <main style={{ maxWidth: 520, margin: "40px auto", padding: 24 }}>

      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        Benvenuto in PHONESIA 🎉
      </h1>

      <p style={{ marginTop: 20 }}>
        La registrazione è stata completata con successo.
      </p>

      <p style={{ marginTop: 20 }}>
        Il tuo biglietto digitale è pronto.
      </p>

      <a
        href={`/phonesia/card/${id}`}
        style={{
          display: "inline-block",
          marginTop: 20,
          padding: "14px 20px",
          background: "#ff7a00",
          color: "white",
          textDecoration: "none",
          borderRadius: 6,
          fontWeight: "bold"
        }}
      >
        Apri il tuo biglietto digitale
      </a>

    </main>

  );
}
