"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function WelcomePage() {

  const params = useSearchParams();
  const id = params.get("id");

  useEffect(() => {

    if (!id) return;

    const timer = setTimeout(() => {
      window.location.href = `/phonesia/card/${id}`;
    }, 2000);

    return () => clearTimeout(timer);

  }, [id]);

  return (

    <main style={{ 
      maxWidth: 520, 
      margin: "80px auto", 
      textAlign: "center",
      fontFamily: "sans-serif"
    }}>

      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        Bentornato in PHONESIA 👋
      </h1>

      <p style={{ marginTop: 20 }}>
        Stiamo aprendo la tua tessera digitale...
      </p>

    </main>

  );
}
