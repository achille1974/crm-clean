"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {

  const [stats, setStats] = useState<any>(null);

  useEffect(() => {

    fetch("/api/phonesia/stats")
      .then((res) => res.json())
      .then((data) => setStats(data));

  }, []);

  if (!stats) {
    return <p style={{ padding: 20 }}>Caricamento statistiche...</p>;
  }

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", padding: 20 }}>

      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        Dashboard PHONESIA
      </h1>

      <div style={{ marginTop: 30 }}>

        <p>
          <strong>Clienti totali:</strong> {stats.totale_clienti}
        </p>

        <p>
          <strong>Telegram attivi:</strong> {stats.telegram_attivi}
        </p>

      </div>

      <h2 style={{ marginTop: 40 }}>Clienti per negozio</h2>

      <ul style={{ marginTop: 10 }}>

        {Object.entries(stats.clienti_per_negozio).map(
          ([nome, numero]: any) => (

            <li key={nome}>
              {nome}: {numero}
            </li>

          )
        )}

      </ul>

    </main>
  );
}
